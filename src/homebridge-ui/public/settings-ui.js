(function (root) {
  'use strict';
  const { Draft, resolveSelector, toggleSelection, deadline } = root.BlinkSettings;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const copy = value => structuredClone(value);
  const numberValue = value => value === '' ? undefined : /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value;

  function mount(homebridge, schema, blocks) {
    const properties = schema.schema.properties;
    const sections = schema.layout;
    const nav = document.getElementById('settingsNavigation');
    const fields = document.getElementById('sectionFields');
    const connection = document.getElementById('connectionFlow');
    const accountDetails = document.getElementById('accountMaintenance');
    const title = document.getElementById('sectionTitle');
    const status = document.getElementById('draftStatus');
    const errors = document.getElementById('settingsErrors');
    const inventoryStatus = document.getElementById('inventoryStatus');
    let active = 0;
    let inventory = null;
    let inventoryFailed = false;
    let accountReady = false;
    let sequence = 0;
    let dismissHelp = () => {};
    root.addEventListener?.('keydown', event => { if (event.key === 'Escape' && dismissHelp()) event.stopPropagation(); });
    const draft = new Draft(blocks, {
      validate: payload => deadline(homebridge.request('/settings/validate', payload)),
      stage: data => deadline(homebridge.updatePluginConfig(data)),
      saveEnabled: enabled => enabled ? homebridge.enableSaveButton() : homebridge.disableSaveButton(),
      changed: refreshState,
    });
    function values(key) { return Array.isArray(draft.config[key]) ? draft.config[key] : []; }
    function cameras() { return inventory?.cameras || []; }
    function match(token, camera) { const result = resolveSelector(token, cameras()); return result.length === 1 && result[0].key === camera.key; }
    function included(camera) {
      const network = inventory.networks.find(item => String(item.id) === String(camera.networkId));
      return !values('excludedNetworks').some(value => value === String(camera.networkId) || value === network?.name)
        && !values('excludeDevices').some(value => resolveSelector(value, [camera]).length > 0
          || !/^(camera|owl|doorbell):/.test(value) && (value === network?.id || value === network?.name));
    }
    function write(key, value) { draft.set(key, value); if (key === 'persistSnapshotCache') render(); }
    function check(labelText, checked, onChange, disabled = false) {
      const label = el('label', undefined, 'blink-check');
      const input = el('input'); input.type = 'checkbox'; input.checked = checked;
      input.disabled = disabled || !accountReady || draft.state.accountAction;
      input.addEventListener('change', () => onChange(input.checked));
      label.append(input, el('span', labelText)); return label;
    }
    function scalar(key, parent, override) {
      const property = override?.property || properties[key];
      if (!property) throw new Error('Unsupported settings definition.');
      const id = `setting-${sequence++}`;
      const row = el('div', undefined, 'blink-field');
      const label = el('label', property.title || key); label.htmlFor = id;
      let input;
      const choices = property.enum ? property.enum.map((value, index) => ({ value, title: property.enumNames?.[index] || value }))
        : property.oneOf?.map(item => ({ value: item.enum[0], title: item.title }));
      const value = override ? override.value ?? property.default : Object.hasOwn(draft.config, key) ? draft.config[key] : property.default;
      const heading = el('div', undefined, 'blink-field-heading');
      if (property.type === 'boolean') {
        const checkbox = check(property.title, value === true, checked => (override?.change || (next => write(key, next)))(checked));
        input = checkbox.querySelector('input'); input.id = id; heading.append(checkbox); row.append(heading);
      } else {
        if (choices) {
          input = el('select', undefined, 'form-select form-control');
          choices.forEach(choice => { const option = el('option', choice.title); option.value = String(choice.value); input.append(option); });
          if (value !== undefined && !choices.some(choice => String(choice.value) === String(value))) {
            const unknown = el('option', `Current unrecognized value: ${value}`); unknown.value = String(value); input.append(unknown);
          }
        } else if (property.type === 'string' || property.type === 'integer') {
          input = el('input', undefined, 'form-control'); input.type = 'text';
          if (property.type === 'integer') input.inputMode = override?.parse ? 'decimal' : 'numeric';
          if (property.placeholder) input.placeholder = property.placeholder;
          if (property.maxLength) input.maxLength = property.maxLength;
        } else throw new Error('Unsupported settings control.');
        input.id = id; input.value = value === undefined ? '' : String(override?.format ? override.format(value) : value); input.disabled = !accountReady || draft.state.accountAction;
        input.addEventListener(choices ? 'change' : 'input', () => {
          const next = override?.parse ? override.parse(input.value) : property.type === 'integer' ? numberValue(input.value) : input.value || undefined;
          (override?.change || (changed => write(key, changed)))(next);
        });
        heading.append(label); row.append(heading, input);
      }
      input.dataset.setting = key;
      let help = property.description || '';
      if (key === 'snapshotCacheTTL' && draft.config.persistSnapshotCache === true) {
        input.disabled = true;
        help = 'Inactive while previews are kept until manual refresh. Your duration is preserved; turn that option off to edit it.';
      }
      if (help) {
        const container = el('span', undefined, 'blink-info');
        const button = el('button', 'i', 'blink-info-button'); button.type = 'button';
        const description = el('span', help, 'blink-info-text'); description.id = `${id}-help`; description.hidden = true;
        description.setAttribute('role', 'tooltip');
        button.setAttribute('aria-label', `Help for ${property.title || key}`);
        button.setAttribute('aria-describedby', description.id);
        button.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-describedby', description.id);
        let pinned = false;
        const hide = () => { const visible = !description.hidden; pinned = false; description.hidden = true; button.setAttribute('aria-expanded', 'false'); return visible; };
        const show = visible => {
          if (!visible) { hide(); return; }
          if (dismissHelp !== hide) dismissHelp();
          dismissHelp = hide; description.hidden = false; button.setAttribute('aria-expanded', 'true');
          description.dataset.placement = 'below';
          const bounds = description.getBoundingClientRect?.();
          if (bounds && bounds.bottom > root.innerHeight && heading.getBoundingClientRect().top >= bounds.height) description.dataset.placement = 'above';
        };
        container.addEventListener('mouseenter', () => show(true));
        heading.addEventListener('mouseleave', () => { if (!pinned) show(false); });
        button.addEventListener('focus', () => show(true));
        button.addEventListener('blur', () => { pinned = false; show(false); });
        button.addEventListener('click', () => { pinned = !pinned; show(pinned); });
        container.append(button, description); heading.append(container);
      }
      parent.append(row); return input;
    }
    function optionalBoolean(key, parent, { property, value, change, inherit = 'Use platform setting', yes = 'On', no = 'Off' }) {
      return scalar(key, parent, { property: { ...property, type: 'string', enum: ['inherit', 'yes', 'no'], enumNames: [inherit, yes, no] },
        value: value === undefined ? 'inherit' : value ? 'yes' : 'no',
        change: next => change(next === 'inherit' ? undefined : next === 'yes') });
    }
    function earlyNotification(key, parent, { property, value, change, inherit }) {
      return scalar(key, parent, { property: { ...property, type: 'string', enum: ['inherit', 'on', 'off', 'unmanaged'], enumNames: [inherit, 'Force on', 'Force off', 'Leave unchanged'], default: undefined },
        value: value === undefined ? 'inherit' : value, change: next => change(next === 'inherit' ? undefined : next) });
    }
    function unresolved(parent, key, objectKey) {
      const networks = key === 'excludedNetworks';
      const modules = objectKey === 'syncModuleId';
      const entries = values(key).filter(value => networks
        ? !(inventory?.networks || []).some(network => value === String(network.id) || value === network.name)
        : modules ? !(inventory?.syncModules || []).some(module => module.id === value[objectKey])
          : resolveSelector(objectKey ? value[objectKey] : value, cameras()).length !== 1);
      if (!entries.length) return;
      const details = el('details', undefined, 'blink-details'); details.append(el('summary', networks ? 'Unavailable saved Blink systems' : modules ? 'Unavailable saved Sync Module settings' : 'Unresolved saved camera selections'));
      details.append(el('p', 'These values are preserved. Missing or ambiguous selections are not silently removed.', 'blink-help'));
      entries.forEach(value => {
        const row = el('div', undefined, 'blink-unresolved'); row.append(el('span', String(objectKey ? value[objectKey] : value)));
        const remove = el('button', 'Remove selection', 'btn btn-sm btn-outline-secondary'); remove.type = 'button';
        remove.disabled = !accountReady || draft.state.accountAction; remove.addEventListener('click', () => { write(key, values(key).filter(item => item !== value)); render(); });
        row.append(remove); details.append(row);
      }); parent.append(details);
    }
    function inventoryTools(parent) {
      const row = el('div', undefined, 'blink-inventory-tools');
      const text = inventory ? `${inventory.cameras.length} cameras discovered · ${inventory.syncModules.length} Sync Modules${inventoryFailed ? ' · last result is stale' : ''}`
        : 'Camera discovery is unavailable. Existing selections are preserved.';
      row.append(el('p', text, 'blink-help'));
      const button = el('button', inventory ? 'Refresh cameras' : 'Discover cameras', 'btn btn-sm btn-outline-secondary');
      button.type = 'button'; button.disabled = !accountReady || draft.state.accountAction; button.addEventListener('click', refreshInventory); row.append(button); parent.append(row);
    }
    function overrideMatches(record, target, selector) { return selector === 'deviceIdentifier' ? match(record[selector], target) : record[selector] === target.id; }
    function overrideRecord(key, target, selector = 'deviceIdentifier') { return values(key).find(item => overrideMatches(item, target, selector)); }
    function changeOverride(key, target, field, value, selector = 'deviceIdentifier') {
      const existing = overrideRecord(key, target, selector);
      const next = values(key).filter(item => !overrideMatches(item, target, selector));
      const record = { ...(existing || {}), [selector]: selector === 'deviceIdentifier' ? target.key : target.id };
      if (value === undefined || value === '') delete record[field]; else record[field] = value;
      if (Object.keys(record).length > 1) next.push(record);
      write(key, next);
    }
    function renderCameras(parent) {
      inventoryTools(parent);
      scalar('exposeMotionDetected', parent);
      scalar('exposeTemperature', parent);
      if (inventory) {
        inventory.networks.forEach(network => {
          const excluded = values('excludedNetworks').some(value => value === String(network.id) || value === network.name);
          const group = el('section', undefined, 'blink-system'); group.append(el('h3', network.name));
          group.append(check('Show this Blink system in Home', !excluded, checked => {
            const retained = values('excludedNetworks').filter(value => value !== String(network.id) && value !== network.name);
            write('excludedNetworks', checked ? retained : [...retained, String(network.id)]); render();
          }));
          cameras().filter(camera => String(camera.networkId) === String(network.id)).forEach(camera => cameraCard(group, camera)); parent.append(group);
        });
        cameras().filter(camera => !inventory.networks.some(network => String(network.id) === String(camera.networkId))).forEach(camera => cameraCard(parent, camera));
      }
      unresolved(parent, 'excludedNetworks'); unresolved(parent, 'excludeDevices'); unresolved(parent, 'deviceNameOverrides', 'deviceIdentifier'); unresolved(parent, 'deviceSettingOverrides', 'deviceIdentifier');
      renderModules(parent);
    }
    function cameraCard(parent, camera) {
      const card = el('details', undefined, 'blink-camera');
      card.append(el('summary', `${camera.name} · ${camera.kind === 'owl' ? 'Mini / Wi-Fi' : camera.kind} · ${camera.status || 'status unknown'}`));
      card.append(el('p', camera.key, 'blink-help'));
      card.append(check('Show this camera in Home', !values('excludeDevices').some(value => match(value, camera)), checked => {
        write('excludeDevices', toggleSelection(values('excludeDevices'), camera, !checked, cameras())); render();
      }));
      scalar('deviceNameOverrides', card, { property: properties.deviceNameOverrides.items.properties.customName, value: overrideRecord('deviceNameOverrides', camera)?.customName,
        change: value => changeOverride('deviceNameOverrides', camera, 'customName', value) });
      const setting = overrideRecord('deviceSettingOverrides', camera);
      const definitions = properties.deviceSettingOverrides.items.properties;
      optionalBoolean('deviceSettingOverrides', card, { property: { title: 'Motion Detected in Home' }, value: setting?.exposeMotionDetected, yes: 'Show', no: 'Hide',
        change: value => changeOverride('deviceSettingOverrides', camera, 'exposeMotionDetected', value) });
      scalar('deviceSettingOverrides', card, { property: definitions.homeKitSecureVideo, value: setting?.homeKitSecureVideo,
        change: value => changeOverride('deviceSettingOverrides', camera, 'homeKitSecureVideo', value) });
      scalar('deviceSettingOverrides', card, { property: definitions.inputQuality, value: setting?.inputQuality,
        change: value => changeOverride('deviceSettingOverrides', camera, 'inputQuality', value) });
      earlyNotification('deviceSettingOverrides', card, { property: definitions.earlyNotificationMode, value: setting?.earlyNotificationMode, inherit: 'Inherit Sync Module or plugin setting',
        change: value => changeOverride('deviceSettingOverrides', camera, 'earlyNotificationMode', value) });
      optionalBoolean('deviceSettingOverrides', card, { property: { title: 'Temperature in Home' }, value: setting?.exposeTemperature, yes: 'Show', no: 'Hide',
        change: value => changeOverride('deviceSettingOverrides', camera, 'exposeTemperature', value) });
      scalar('deviceSettingOverrides', card, { property: { ...definitions.motionTimeout, description: 'Leave blank to use the platform motion timeout.' }, value: setting?.motionTimeout,
        change: value => changeOverride('deviceSettingOverrides', camera, 'motionTimeout', value) });
      parent.append(card);
    }
    function renderRecording(parent) {
      parent.append(el('p', 'Offer completed Blink USB motion clips to HomeKit Secure Video. Apple Home manages recording permission, audio and iCloud retention.'));
      const checklist = el('ol', undefined, 'blink-checklist');
      ['Select cameras here, then Save and restart the Blink child bridge.', 'In Apple Home, allow Stream & Allow Recording and choose recording-audio permission.', 'Keep native Blink motion recording enabled and the associated Sync Module USB storage available.'].forEach(text => checklist.append(el('li', text)));
      parent.append(checklist, el('p', 'Motion notifications schedule a clip check using the timing below. No continuous camera feed or idle storage preparation is started. Home receives each saved clip after it is downloaded and prepared, so its timeline time can differ from native capture time.', 'blink-help'));
      scalar('earlyNotificationMode', parent, { property: { ...properties.earlyNotificationMode, default: 'unmanaged' },
        value: draft.config.earlyNotificationMode, change: value => write('earlyNotificationMode', value) });
      inventoryTools(parent);
      if (inventory) {
        cameras().forEach(camera => {
          const selected = overrideRecord('deviceSettingOverrides', camera)?.homeKitSecureVideo === true;
          const network = inventory.networks.find(item => String(item.id) === String(camera.networkId));
          const gates = `${camera.enabled ? 'motion on' : 'motion off'} · ${network ? network.armed ? 'system armed' : 'system disarmed' : 'system state unknown'}`;
          const storage = camera.moduleAssociation.state === 'unique' ? '' : ' · USB storage association unconfirmed';
          parent.append(check(`${camera.name} · ${camera.key} · ${gates}${storage}${included(camera) ? '' : ' · hidden from Home'}`, selected, checked => {
            changeOverride('deviceSettingOverrides', camera, 'homeKitSecureVideo', checked); render();
          }, !included(camera) && !selected));
        });
      }
      unresolved(parent, 'deviceSettingOverrides', 'deviceIdentifier');
      const timing = el('details', undefined, 'blink-details'); timing.append(el('summary', 'Clip timing and storage limits'));
      Object.entries(properties.nativeRecording.properties).forEach(([key, property]) => {
        const cache = key === 'maxCachedBytes';
        const input = scalar('nativeRecording', timing, { property: cache ? { ...property, title: 'Maximum local clip cache (MiB)', description: 'Private downloaded clips on this Homebridge host. 1 MiB = 1,048,576 bytes. Default 128 MiB; allowed range 32–1024 MiB.' } : property,
          value: draft.config.nativeRecording?.[key],
          ...(cache ? { format: value => {
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return value;
            const bytes = BigInt(value);
            const fraction = ((bytes % 1048576n) * (5n ** 20n)).toString().padStart(20, '0').replace(/0+$/, '');
            return `${bytes / 1048576n}${fraction ? `.${fraction}` : ''}`;
          },
            parse: value => {
              if (value === '') return undefined;
              const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
              if (!match || value.length > 100) return value;
              const fraction = (match[2] || '').replace(/0+$/, '');
              if (fraction.length > 20) return value;
              const scale = 10n ** BigInt(fraction.length);
              const scaled = (BigInt(match[1]) * scale + BigInt(fraction || '0')) * 1048576n;
              if (scaled % scale !== 0n) return value;
              const bytes = Number(scaled / scale);
              return Number.isSafeInteger(bytes) && bytes >= property.minimum && bytes <= property.maximum ? bytes : value;
            } } : {}), change: value => {
          const next = { ...(draft.config.nativeRecording || {}) };
          if (value === undefined) delete next[key]; else next[key] = value;
          write('nativeRecording', Object.keys(next).length ? next : undefined);
        } });
        input.dataset.setting = `nativeRecording/${key}`;
      });
      parent.append(timing);
    }
    function renderModules(parent) {
      const details = el('details', undefined, 'blink-details'); details.append(el('summary', 'Sync Module settings and live-view feed limits'));
      details.append(el('p', 'Limits use a module’s Blink-system association, not a proven physical video path. Each actual module defaults to its included associated camera count. Leave blank to use that default.', 'blink-help'));
      const modules = inventory?.syncModules || [];
      modules.forEach(module => {
        const associated = cameras().filter(camera => camera.moduleAssociation.state === 'unique' && camera.moduleAssociation.candidateIds.includes(module.id) && included(camera));
        const ambiguous = cameras().some(camera => camera.moduleAssociation.state === 'ambiguous' && camera.moduleAssociation.candidateIds.includes(module.id));
        const row = el('div', undefined, 'blink-module'); row.append(el('h3', module.name || `Sync Module ${module.id}`));
        row.append(el('p', `Module ID ${module.id} · ${module.status} · ${ambiguous ? 'ambiguous system association' : `${associated.length} included cameras by system association`}`, 'blink-help'));
        earlyNotification('syncModuleSettingOverrides', row, { property: properties.syncModuleSettingOverrides.items.properties.earlyNotificationMode,
          value: overrideRecord('syncModuleSettingOverrides', module, 'syncModuleId')?.earlyNotificationMode, inherit: 'Inherit plugin setting',
          change: value => changeOverride('syncModuleSettingOverrides', module, 'earlyNotificationMode', value, 'syncModuleId') });
        const current = values('syncModuleFeedLimits').find(item => item.syncModuleId === module.id);
        const input = scalar('syncModuleFeedLimits', row, { property: { ...properties.syncModuleFeedLimits.items.properties.maxFeeds, description: 'Blank uses the discovered camera count. Enter a positive whole number.' }, value: current?.maxFeeds,
          change: value => { const retained = values('syncModuleFeedLimits').filter(item => item.syncModuleId !== module.id); write('syncModuleFeedLimits', value === undefined ? retained : [...retained, { syncModuleId: module.id, maxFeeds: value }]); } });
        if (ambiguous) input.disabled = true;
        if (current) {
          const reset = el('button', 'Use discovered default', 'btn btn-sm btn-outline-secondary'); reset.type = 'button'; reset.disabled = !accountReady || draft.state.accountAction;
          reset.addEventListener('click', () => { write('syncModuleFeedLimits', values('syncModuleFeedLimits').filter(item => item.syncModuleId !== module.id)); render(); });
          row.append(reset);
        }
        details.append(row);
      });
      values('syncModuleFeedLimits').filter(item => !modules.some(module => module.id === item.syncModuleId)).forEach(item => {
        const row = el('div', undefined, 'blink-unresolved'); row.append(el('span', `Unavailable Sync Module ${item.syncModuleId}: ${item.maxFeeds}`));
        const remove = el('button', 'Remove override', 'btn btn-sm btn-outline-secondary'); remove.type = 'button'; remove.disabled = !accountReady || draft.state.accountAction;
        remove.addEventListener('click', () => { write('syncModuleFeedLimits', values('syncModuleFeedLimits').filter(value => value !== item)); render(); }); row.append(remove); details.append(row);
      });
      unresolved(details, 'syncModuleSettingOverrides', 'syncModuleId');
      parent.append(details);
    }
    function render() {
      fields.replaceChildren(); sequence = 0;
      title.textContent = sections[active].title;
      connection.hidden = active !== 0;
      accountDetails.hidden = active !== sections.length - 1;
      nav.querySelectorAll('button').forEach((button, index) => { button.setAttribute('aria-current', index === active ? 'page' : 'false'); button.classList.toggle('active', index === active); });
      const keys = sections[active].items;
      if (keys.includes('nativeRecording')) renderRecording(fields);
      else if (keys.includes('excludeDevices')) renderCameras(fields);
      else if (active === sections.length - 1) {
        const technical = new Set(['maxStreams', 'audioCodec', 'audioBitrate', 'videoBitrate', 'softwareEncodingPreset']);
        const diagnostic = new Set(['debugAuth', 'mediaDebug', 'debugStreamPath']);
        keys.filter(key => !technical.has(key) && !diagnostic.has(key)).forEach(key => scalar(key, fields));
        for (const [name, members] of [['Live-view tuning', technical], ['Diagnostics', diagnostic]]) {
          const detail = el('details', undefined, 'blink-details'); detail.append(el('summary', name)); keys.filter(key => members.has(key)).forEach(key => scalar(key, detail)); fields.append(detail);
        }
      } else keys.forEach(key => scalar(key, fields));
      refreshState(draft.state);
    }
    function refreshState(state) {
      status.dataset.state = state.error || state.errors.length ? 'error' : state.dirty ? 'dirty' : state.pending || state.accountAction ? 'pending' : 'clean';
      status.textContent = state.accountAction ? 'Account action in progress. Settings are temporarily unavailable.' : state.pending ? 'Checking changes…'
        : state.error ? 'Settings could not be validated or staged. Retry before saving.'
          : state.errors.length ? `${state.errors.length} settings error${state.errors.length === 1 ? '' : 's'}. Correct the fields below before saving.`
            : state.dirty ? 'Unsaved changes. Save, then restart the Blink child bridge.' : 'Settings loaded. Changes take effect after Save and a child bridge restart.';
      connection.inert = state.accountAction;
      accountDetails.inert = state.accountAction;
      errors.replaceChildren(); errors.hidden = !state.error && !state.errors.length;
      if (state.error) errors.append(el('p', state.error));
      state.errors.forEach(error => {
        const key = error.path.split('/')[1];
        const field = properties[key]?.title;
        const cache = error.path === '/nativeRecording/maxCachedBytes';
        const location = cache ? 'Maximum local clip cache (MiB)' : field && error.path ? `${field} (${error.path})` : field || error.path || 'Settings';
        const message = cache ? 'Enter 32–1024 MiB. The size must represent a whole number of bytes.' : error.message;
        const row = el('p', `${location}: ${message}`);
        const section = sections.findIndex(item => item.items.includes(key));
        if (section >= 0 && section !== active) {
          const review = el('button', 'Review', 'btn btn-sm btn-outline-secondary'); review.type = 'button';
          review.addEventListener('click', () => showSection(section)); row.append(review);
        }
        errors.append(row);
      });
      document.getElementById('retrySettings').hidden = !state.error;
      document.getElementById('accountDraftWarning').hidden = !state.dirty;
      fields.querySelectorAll('[data-setting]').forEach(input => input.setAttribute('aria-invalid', String(state.errors.some(error => error.path.startsWith(`/${input.dataset.setting}`)))));
      const warnings = document.getElementById('settingsWarnings'); warnings.replaceChildren(); warnings.hidden = !state.warnings.length;
      state.warnings.forEach(warning => warnings.append(el('p', warning.message)));
    }
    async function refreshInventory() {
      inventoryStatus.textContent = 'Discovering cameras…';
      try {
        const next = await deadline(homebridge.request('/settings/inventory'));
        if (!next || !Array.isArray(next.cameras) || !Array.isArray(next.networks) || !Array.isArray(next.syncModules)) throw new Error('Invalid inventory');
        inventory = next; inventoryFailed = false; draft.inventoryRevision = next.revision;
        inventoryStatus.textContent = `Camera list checked ${new Date(next.fetchedAt).toLocaleString()}. This does not confirm HomeKit recording permission.`;
        draft.retry();
      } catch {
        inventoryFailed = true; inventoryStatus.textContent = 'Camera discovery failed. Saved selections and the last camera list are preserved. Retry discovery.';
      }
      render();
    }
    sections.forEach((section, index) => {
      const button = el('button', section.title, 'btn blink-nav-button'); button.type = 'button';
      button.addEventListener('click', () => showSection(index)); nav.append(button);
    });
    function showSection(index) { active = index; render(); title.focus(); }
    document.getElementById('retrySettings').addEventListener('click', () => draft.retry());
    render(); draft.retry();
    return {
      draft, refreshInventory,
      showSection,
      get blocks() { return copy(draft.blocks); },
      beginAccountAction() {
        const action = draft.beginAccountAction();
        if (!action) { document.getElementById('accountDraftWarning').hidden = false; return null; }
        render();
        return { blocks: action.blocks, finish() { action.finish(); render(); } };
      },
      setAccountReady(ready) { const changed = accountReady !== ready; accountReady = ready; render(); if (ready && changed) void refreshInventory(); },
      async replaceBaseline(next) { await draft.flush(); draft.replaceBaseline(next); await draft.flush(); render(); },
    };
  }
  root.BlinkSettingsUI = { mount };
})(window);
