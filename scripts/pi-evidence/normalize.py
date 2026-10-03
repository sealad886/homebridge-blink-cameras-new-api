"""Conservative, deterministic session reconstruction from retained evidence.

Raw records are never interpolated into commands or copied into shareable prose.
Unknown boundaries remain unknown; a process lifetime is not browser duration.
"""
import base64
import json
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def boot_identity(event, raw=None):
    value = event.get('boot_id') or (raw or {}).get('_BOOT_ID')
    return str(value).replace('-', '').lower() if value else 'unknown-boot'


def decoded(event):
    raw = event.get('raw', {})
    if isinstance(raw, dict) and raw.get('content_encoding') == 'base64':
        raw = base64.b64decode(raw['raw_base64'], validate=True).decode('utf-8', errors='replace')
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return {'message': raw}
    return raw if isinstance(raw, dict) else {}


def timestamp(event, raw=None):
    raw = raw or decoded(event)
    value = event.get('source_time')
    if value is not None:
        return float(value)
    if event.get('source') == 'audit':
        parsed = audit_time(event.get('raw'))
        if parsed is not None:
            return parsed
    if event.get('source') == 'homebridge':
        parsed = homebridge_time(raw)
        if parsed is not None:
            return parsed
    if raw.get('__REALTIME_TIMESTAMP'):
        return int(raw['__REALTIME_TIMESTAMP']) / 1e6
    return float(event['received_at'])


def audit_time(raw):
    if isinstance(raw, dict) and raw.get('content_encoding') == 'base64':
        raw = base64.b64decode(raw['raw_base64'], validate=True).decode('utf-8', errors='replace')
    if not isinstance(raw, str):
        return None
    match = re.search(r'msg=audit\((\d+(?:\.\d+)?):\d+\)', raw)
    return float(match[1]) if match else None


def homebridge_time(raw):
    message = raw.get('message', '') if isinstance(raw, dict) else ''
    if not isinstance(message, str):
        return None
    match = re.search(r'\[(\d{1,2}/\d{1,2}/\d{4}, \d{2}:\d{2}:\d{2})\]', message[:160])
    if not match:
        return None
    try:
        local = datetime.strptime(match[1], '%d/%m/%Y, %H:%M:%S').replace(tzinfo=ZoneInfo('Europe/Dublin'))
        return local.timestamp()
    except ValueError:
        return None


def homebridge_category(raw):
    message = raw.get('message', '') if isinstance(raw, dict) else ''
    if not isinstance(message, str) or homebridge_time(raw) is None:
        return None
    text = re.sub(r'\x1b\[[0-9;]*m', '', message).lower()
    if re.search(r'\b(?:enotfound|eai_again|econnreset|enetunreach|ehostunreach)\b|failure:\s*network|network request failed', text):
        return {'category': 'network_cause'}
    if re.search(r'\b(?:etimedout|timeout|timed out)\b', text):
        return {'category': 'timeout'}
    if re.search(r'\bfetch\b.*\b(?:failed|failure|error)\b|\bfailed to fetch\b', text):
        return {'category': 'fetch_failure'}
    status = re.search(r'\b(?:http\s+)?status(?::|\s)\s*([45]\d\d)\b', text)
    if status:
        return {'category': 'http_status', 'status': int(status[1])}
    if re.search(r'\b(?:error|failed|failure|fatal)\b', text):
        return {'category': 'error'}
    return None


def journal_context_category(raw):
    if not isinstance(raw, dict):
        return None
    message = raw.get('MESSAGE', '')
    if not isinstance(message, str):
        return None
    unit = raw.get('_SYSTEMD_UNIT') or raw.get('_SYSTEMD_USER_UNIT') or ''
    transport = raw.get('_TRANSPORT', '')
    comm = raw.get('_COMM', '')
    component = None
    if unit == 'NetworkManager.service' or comm == 'NetworkManager':
        component = 'network_manager'
    elif transport == 'kernel':
        component = 'kernel'
    elif unit == 'cloudflared.service':
        component = 'cloudflared'
    elif unit in ('systemd-timesyncd.service', 'chrony.service'):
        component = 'time_sync'
    elif unit == 'homebridge.service':
        component = 'homebridge_service'
    if component is None:
        return None
    text = message.lower()
    patterns = (
        ('dns_failure', r'\b(?:dns|resolver|lookup)\b.*\b(?:fail|timeout|error|unreach)'),
        ('link_down', r'\b(?:link|carrier|interface)\b.*\b(?:down|lost|disconnect)'),
        ('network_unreachable', r'\bnetwork is unreachable\b|\benetunreach\b'),
        ('timeout', r'\b(?:timeout|timed out)\b'),
        ('service_failure', r'\b(?:failed|failure|fatal|error)\b'),
        ('clock_change', r'\b(?:clock|time)\b.*\b(?:change|step|sync|adjust)'),
    )
    for category, pattern in patterns:
        if re.search(pattern, text):
            return {'component': component, 'category': category}
    return None



def mono(event):
    raw = decoded(event)
    value = raw.get('__MONOTONIC_TIMESTAMP')
    if value is not None:
        return int(value) / 1e6
    if event.get('source') in ('shell', 'wayvnc'):
        return event.get('monotonic')
    return None


def iso(value, local=False):
    if value is None:
        return None
    return datetime.fromtimestamp(value, ZoneInfo('Europe/Dublin') if local else timezone.utc).isoformat()


def build_report(events, start, end, already_ordered=False):
    if end <= start:
        raise ValueError('end must follow start')
    if not already_ordered:
        events = sorted(events, key=lambda e: (timestamp(e), e.get('event_id', '')))
    event_count = 0
    window_event_count = 0
    sessions, active, activity, timeline, gaps = [], {}, [], [], []
    completed = {}
    source_seen, audit = {}, {}
    health_intervals = {}

    def observe(key, kind, event, raw, boundary=None):
        t = timestamp(event, raw)
        s = active.get(key)
        if s is None and boundary == 'end' and key in completed:
            completed[key]['evidence_ids'].append(event.get('event_id'))
            return completed[key]
        if s is None:
            s = {'session_id': key, 'kind': kind, 'boot_id': boot_identity(event, decoded(event)),
                 'start': None, 'end': None, 'first_observed': t, 'last_observed': t,
                 'evidence_ids': [], 'pid': raw.get('pid'), 'uid': raw.get('uid')}
            sessions.append(s)
            active[key] = s
        if raw.get('pid') is not None:
            aliases = s.setdefault('pid_aliases', [])
            pid = str(raw['pid'])
            if pid not in aliases:
                aliases.append(pid)
            observed_from = s.setdefault('_pid_observed_from', {})
            observed_from[pid] = min(observed_from.get(pid, t), t)
        s['last_observed'] = max(s['last_observed'], t)
        s['evidence_ids'].append(event.get('event_id'))
        if boundary == 'start':
            s['start'] = t
            s['_start_mono'] = mono(event)
        elif boundary == 'end':
            s['end'] = t
            s['_end_mono'] = mono(event)
            active.pop(key, None)
            completed[key] = s
        return s

    ssh_connections, ssh_by_endpoint, generations = {}, {}, {}
    for e in events:
        event_count += 1
        r = decoded(e)
        t = timestamp(e, r)
        if start <= t < end:
            window_event_count += 1
        src = e.get('source', 'unknown')
        boot = boot_identity(e, r)
        bounds = source_seen.setdefault(src, [t, t])
        bounds[0], bounds[1] = min(bounds[0], t), max(bounds[1], t)
        if src == 'collector' and r.get('event') == 'gap' and isinstance(r.get('last_heartbeat'), dict):
            gap_start = float(r['last_heartbeat'].get('wall_time', t))
            gap_end = float(r.get('resumed_at', t))
            if gap_start < end and gap_end > start:
                gaps.append({'source': 'collector', 'state': 'source_gap',
                             'from': iso(max(start, gap_start)), 'to': iso(min(end, gap_end)),
                             'reason': 'restart interval without continuous capture proof',
                             'evidence_id': e.get('event_id')})
        if src == 'health':
            target = r.get('source', 'unknown')
            previous = health_intervals.get(target)
            if previous and previous['state'] in ('source_gap', 'failed', 'unavailable', 'capture_stopped', 'catching_up'):
                if previous['time'] < end and t > start:
                    gaps.append({'source': target, 'state': previous['state'],
                                 'from': iso(max(start, previous['time'])), 'to': iso(min(end, t)),
                                 'evidence_id': previous['event_id']})
            health_intervals[target] = {'state': r.get('state'), 'time': t, 'event_id': e.get('event_id')}
            continue
        if src == 'homebridge' and start <= t < end:
            context = homebridge_category(r)
            if context:
                timeline.append({'at': iso(t), 'source': src, 'evidence_id': e.get('event_id'), **context})
        elif src == 'probe' and start <= t < end and r.get('event') == 'probe_set':
            for result in r.get('results', []):
                if not isinstance(result, dict) or not isinstance(result.get('kind'), str):
                    continue
                summary = {'at': iso(t), 'source': src, 'evidence_id': e.get('event_id'),
                           'kind': result['kind'], 'ok': bool(result.get('ok'))}
                if isinstance(result.get('elapsed_ms'), (int, float)):
                    summary['latency_ms'] = result['elapsed_ms']
                timeline.append(summary)
        if src == 'shell':
            sid = r.get('session_id')
            if sid and r.get('event') in ('start', 'end', 'heartbeat'):
                observe(f'{boot}:shell:{sid}', 'connect_shell_process', e, r,
                        r.get('event') if r.get('event') in ('start', 'end') else None)
            elif r.get('event') == 'observed_process' and start <= t < end:
                gaps.append({'source': 'shell', 'state': 'source_gap', 'at': iso(t),
                             'reason': 'Connect process observed without registered session boundary',
                             'evidence_id': e.get('event_id')})
            elif r.get('event') == 'observed_descendant' and start <= t < end:
                activity.append({'at': iso(t), 'boot_id': boot, 'pid': r.get('pid'),
                                 'uid': r.get('uid'), 'process_start_ticks': r.get('start_ticks'),
                                 'session_id': f'{boot}:shell:{sid}' if sid else None,
                                 'attribution': 'observed_process_ancestry',
                                 'evidence_ids': [e.get('event_id')],
                                 'kind': 'process_observation_not_complete_execution_history'})
        elif src == 'wayvnc':
            gen = e.get('metadata', {}).get('generation', 'unknown-generation')
            method = r.get('method') or r.get('event')
            params = r.get('params', r.get('client', {}))
            if isinstance(params, dict):
                ident = params.get('id', params.get('client_id'))
                if ident is not None and method in ('client-connected', 'client-disconnected', 'observed_connected', 'active_observation'):
                    observe(f'{boot}:wayvnc:{gen}:{ident}', 'connect_screen_client', e, r,
                            {'client-connected': 'start', 'client-disconnected': 'end'}.get(method))
        elif src.startswith('journal'):
            msg = r.get('MESSAGE', '')
            pid = str(r.get('_PID', r.get('SYSLOG_PID', 'unknown')))
            if not isinstance(msg, str):
                continue
            context = journal_context_category(r)
            if context and start <= t < end:
                timeline.append({'at': iso(t), 'source': src,
                                 'evidence_id': e.get('event_id'), **context})
            base = f'{boot}:ssh:{pid}'
            auth = re.search(r'Accepted (\S+) for (\S+) from (\S+) port (\d+)', msg)
            endpoint = None
            if auth:
                endpoint = (boot, auth[3], auth[4])
                generations[base] = generations.get(base, 0) + 1
                key = f'{base}:{generations[base]}'
                ssh_connections[base] = key
                ssh_by_endpoint[endpoint] = key
                session = observe(key, 'ssh_connection', e, {'pid': pid}, 'start')
                session.update(dict(zip(('auth_method', 'local_user', 'remote_address', 'remote_port'), auth.groups())))
                fingerprint = re.search(r'\bSHA256:[A-Za-z0-9+/=]+', msg)
                if fingerprint:
                    session['key_fingerprint'] = fingerprint[0]
            else:
                remote = re.search(r'\bfrom (?:user \S+ |authenticating user \S+ )?(\S+) port (\d+)', msg)
                if remote:
                    endpoint = (boot, remote[1], remote[2])
                else:
                    remote = re.search(r'\bfrom \S+ (\S+) port (\d+)', msg)
                    if remote:
                        endpoint = (boot, remote[1], remote[2])
            key = ssh_connections.get(base) or (ssh_by_endpoint.get(endpoint) if endpoint else None)
            if key:
                # OpenSSH 10 privilege separation logs authentication/PAM under
                # root PID and disconnect/channel records under user child PID.
                ssh_connections[base] = key
                # A linked child/channel log proves this alias only from its own time.
                if key in active and not auth:
                    observe(key, 'ssh_connection', e, {'pid': pid})
            else:
                key = f'{base}:unknown-start'
            channel = re.search(r'Starting session:.*\bid (\d+)', msg)
            close = re.search(r'Close session:.*\bid (\d+)', msg)
            if channel:
                session = observe(f'{key}:channel:{channel[1]}', 'ssh_channel', e, {'pid': pid}, 'start')
                session['channel_type'] = 'shell' if 'Starting session: shell' in msg else 'subsystem' if 'Starting session: subsystem' in msg else 'command'
                session['connection_id'] = key
            elif close:
                observe(f'{key}:channel:{close[1]}', 'ssh_channel', e, {'pid': pid}, 'end')
            elif re.search(r'Disconnected from (?:user|authenticating user)|Received disconnect from', msg):
                if key in active:
                    observe(key, 'ssh_connection', e, {'pid': pid}, 'end')
            # PAM is useful only when there are no verbose channel events. Keep
            # its separate semantic identity instead of claiming another connection.
            elif 'pam_unix(sshd:session): session opened' in msg:
                observe(f'{key}:pam', 'ssh_pam_session', e, {'pid': pid}, 'start')
            elif 'pam_unix(sshd:session): session closed' in msg:
                observe(f'{key}:pam', 'ssh_pam_session', e, {'pid': pid}, 'end')
        elif src == 'audit':
            text = e.get('raw', '')
            if isinstance(text, dict) and text.get('content_encoding') == 'base64':
                text = base64.b64decode(text['raw_base64'], validate=True).decode('utf-8', errors='replace')
            if not isinstance(text, str):
                continue
            match = re.search(r'msg=audit\((\d+(?:\.\d+)?):(\d+)\)', text)
            if match and start <= float(match[1]) < end:
                key = (boot, match[1], match[2])
                audit.setdefault(key, []).append((e, text))
        if start <= t < end and (src in ('shell', 'wayvnc') or (src == 'collector' and r.get('event') in ('gap', 'startup'))):
            timeline.append({'at': iso(t), 'source': src, 'evidence_id': e.get('event_id')})

    for target, health in health_intervals.items():
        if health['state'] in ('source_gap', 'failed', 'unavailable', 'capture_stopped', 'catching_up') and health['time'] < end:
            gaps.append({'source': target, 'state': health['state'], 'from': iso(max(start, health['time'])),
                         'to': iso(end), 'evidence_id': health['event_id']})

    for (boot, at, serial), parts in audit.items():
        t = float(at)
        if not start <= t < end:
            continue
        types = {re.search(r'\btype=(\w+)', text)[1] for _, text in parts if re.search(r'\btype=(\w+)', text)}
        row = {'at': iso(t), 'boot_id': boot, 'audit_serial': serial,
               'record_types': sorted(types), 'complete': 'EOE' in types,
               'session_id': None, 'attribution': 'unproven',
               'evidence_ids': [e.get('event_id') for e, _ in parts]}
        for _, text in parts:
            if 'type=SYSCALL ' in text:
                for field in ('pid', 'ppid', 'uid', 'auid', 'ses', 'success', 'syscall'):
                    m = re.search(r'\b' + field + r'=([\w-]+)', text)
                    if m:
                        row[field] = m[1]
                m = re.search(r'\bexe="([^"\n]{1,512})"', text)
                if m:
                    row['executable'] = m[1]
        # Attribute only direct children while a verified shell was observed alive.
        # A coincident time or reused PID outside that interval proves nothing.
        matches = [s for s in sessions if s['kind'] in ('connect_shell_process', 'ssh_connection')
                   and s['boot_id'] == boot and row.get('ppid') in s.get('_pid_observed_from', {})
                   and s['start'] is not None
                   and max(s['start'], s['_pid_observed_from'][row['ppid']]) <= t <= s['last_observed']]
        if len(matches) == 1:
            row['session_id'] = matches[0]['session_id']
            row['attribution'] = 'direct_child_of_observed_shell' if matches[0]['kind'] == 'connect_shell_process' else 'direct_child_of_observed_ssh_process'
        activity.append(row)

    # A non-unset kernel audit session can extend a directly proven SSH origin
    # to later descendants. The mapping is valid only when one connection owns
    # that (boot, ses) pair; conflicting origins leave every indirect row unproven.
    unset_audit_sessions = {None, '', '-1', '4294967295', 'unset'}
    audit_session_origins = {}
    for row in activity:
        if (row['attribution'] != 'direct_child_of_observed_ssh_process'
                or row.get('ses') in unset_audit_sessions):
            continue
        key = (row['boot_id'], row['ses'])
        origin = audit_session_origins.setdefault(key, {'sessions': set(), 'proofs': []})
        origin['sessions'].add(row['session_id'])
        origin['proofs'].append((row['at'], row['evidence_ids']))
    for row in activity:
        if row['attribution'] != 'unproven' or row.get('ses') in unset_audit_sessions:
            continue
        origin = audit_session_origins.get((row['boot_id'], row['ses']))
        prior_proofs = [ids for at, ids in origin['proofs'] if at <= row['at']] if origin else []
        if origin and len(origin['sessions']) == 1 and prior_proofs:
            row['session_id'] = next(iter(origin['sessions']))
            row['attribution'] = 'kernel_audit_session_origin'
            row['attribution_evidence_ids'] = sorted({ident for ids in prior_proofs for ident in ids})

    selected = []
    for s in sessions:
        s.pop('_pid_observed_from', None)
        # A missing end cannot establish ongoing activity past the last observation.
        left = s['start'] if s['start'] is not None else s['first_observed']
        right = s['end'] if s['end'] is not None else s['last_observed']
        if left >= end or (s['end'] is not None and right < start):
            continue
        s['window_intersection'] = 'possible_end_unknown' if right < start else 'observed'
        a, b = s.pop('_start_mono', None), s.pop('_end_mono', None)
        s['duration_seconds'] = b - a if a is not None and b is not None and b >= a else None
        s['duration_basis'] = 'source_monotonic' if s['duration_seconds'] is not None else 'unknown'
        s['boundary_state'] = 'paired' if s['start'] is not None and s['end'] is not None else 'start_unknown' if s['start'] is None else 'end_unknown'
        for field in ('start', 'end', 'first_observed', 'last_observed'):
            value = s[field]
            s[field + '_local'] = iso(value, True)
            s[field] = iso(value)
        selected.append(s)
    coverage = {'window_start': iso(start), 'window_end': iso(end),
                'state': 'source_gap' if gaps else 'capture_observed' if window_event_count else 'no_window_observation' if event_count else 'collector_not_yet_deployed',
                'gaps': gaps, 'sources': {k: {'first': iso(min(v)), 'last': iso(max(v))} for k, v in sorted(source_seen.items())},
                'limitations': ['Audit capture for elevated descendants of Connect shells with unset audit login ID is not guaranteed.',
                                'No browser identity or screen/terminal recording.',
                                'Connect shell duration measures the shell process lifetime.',
                                'Audit activity is unattributed unless process ancestry is independently proved.',
                                'Capture observations alone do not prove gap-free coverage of the requested window.']}
    activity.sort(key=lambda row: (row.get('at', ''), str(row.get('evidence_ids', []))))
    timeline.sort(key=lambda row: (row.get('at', ''), str(row.get('evidence_id', ''))))
    return {'sessions': selected, 'activity': activity, 'timeline': timeline, 'coverage': coverage}
