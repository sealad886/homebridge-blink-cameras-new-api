(function (root) {
  'use strict';
  const { Draft, resolveSelector, toggleSelection, recordingApplicability, deadline } = root.BlinkSettings;
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
    let recordingHealth = null;
    let healthLoading = false;
    let recordingPanel = null;
    const expanded = new Map();
    const walkTests = new Set();
    function rememberDetails(parent) {
      parent?.querySelectorAll('details').forEach(detail => { if (detail.dataset.expansionKey) expanded.set(detail.dataset.expansionKey, detail.open); });
    }
    function details(key, summary, className = 'blink-details') {
      const node = el('details', undefined, className); node.dataset.expansionKey = key;
      node.open = expanded.get(key) || false; node.append(el('summary', summary)); return node;
    }
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
    function write(key, value) { draft.set(key, value); if (key === 'persistSnapshotCache' || key === 'hksvSource') render(); }
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
      if (property.type === 'boolean') {
        const checkbox = check(property.title, value === true, checked => (override?.change || (next => write(key, next)))(checked));
        input = checkbox.querySelector('input'); input.id = id; row.append(checkbox);
      } else {
        if (choices) {
          input = el('select', undefined, 'form-select form-control');
          choices.forEach(choice => { const option = el('option', choice.title); option.value = String(choice.value); input.append(option); });
          if (value !== undefined && !choices.some(choice => String(choice.value) === String(value))) {
            const unknown = el('option', `Current unrecognized value: ${value}`); unknown.value = String(value); input.append(unknown);
          }
        } else if (property.type === 'string' || property.type === 'integer') {
          input = el('input', undefined, 'form-control'); input.type = 'text';
          if (property.type === 'integer') input.inputMode = 'numeric';
          if (property.placeholder) input.placeholder = property.placeholder;
          if (property.maxLength) input.maxLength = property.maxLength;
        } else throw new Error('Unsupported settings control.');
        input.id = id; input.value = value === undefined ? '' : String(value); input.disabled = !accountReady || draft.state.accountAction;
        input.addEventListener(choices ? 'change' : 'input', () => {
          const next = property.type === 'integer' ? numberValue(input.value) : input.value || undefined;
          (override?.change || (changed => write(key, changed)))(next);
        });
        row.append(label, input);
      }
      input.dataset.setting = key;
      const description = el('p', property.description || '', 'blink-help'); description.id = `${id}-help`;
      if (key === 'snapshotCacheTTL' && draft.config.persistSnapshotCache === true) {
        input.disabled = true;
        description.textContent = 'Inactive while previews are kept until manual refresh. Your duration is preserved; turn that option off to edit it.';
      }
      input.setAttribute('aria-describedby', description.id);
      row.append(description); parent.append(row); return input;
    }
    function unresolved(parent, key, objectKey) {
      const networks = key === 'excludedNetworks';
      const entries = values(key).filter(value => networks
        ? !(inventory?.networks || []).some(network => value === String(network.id) || value === network.name)
        : resolveSelector(objectKey ? value[objectKey] : value, cameras()).length !== 1);
      if (!entries.length) return;
      const detail = details(`unresolved:${key}`, networks ? 'Unavailable saved Blink systems' : 'Unresolved saved camera selections');
      detail.append(el('p', 'These values are preserved. Missing or ambiguous selections are not silently removed.', 'blink-help'));
      entries.forEach(value => {
        const row = el('div', undefined, 'blink-unresolved'); row.append(el('span', String(objectKey ? value[objectKey] : value)));
        const remove = el('button', 'Remove selection', 'btn btn-sm btn-outline-secondary'); remove.type = 'button';
        remove.disabled = !accountReady || draft.state.accountAction; remove.addEventListener('click', () => { write(key, values(key).filter(item => item !== value)); render(); });
        row.append(remove); detail.append(row);
      }); parent.append(detail);
    }
    function inventoryTools(parent) {
      const row = el('div', undefined, 'blink-inventory-tools');
      const text = inventory ? `${inventory.cameras.length} cameras discovered · ${inventory.syncModules.length} Sync Modules${inventoryFailed ? ' · last result is stale' : ''}`
        : 'Camera discovery is unavailable. Existing selections are preserved.';
      row.append(el('p', text, 'blink-help'));
      const button = el('button', inventory ? 'Refresh cameras' : 'Discover cameras', 'btn btn-sm btn-outline-secondary');
      button.type = 'button'; button.disabled = !accountReady || draft.state.accountAction; button.addEventListener('click', refreshInventory); row.append(button); parent.append(row);
    }
    function overrideRecord(key, camera) { return values(key).find(item => match(item.deviceIdentifier, camera)); }
    function changeOverride(key, camera, field, value) {
      const existing = overrideRecord(key, camera);
      const next = values(key).filter(item => !match(item.deviceIdentifier, camera));
      const record = { ...(existing || {}), deviceIdentifier: camera.key };
      if (value === undefined || value === '') delete record[field]; else record[field] = value;
      if (Object.keys(record).length > 1) next.push(record);
      write(key, next);
    }
    function renderCameras(parent) {
      inventoryTools(parent);
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
      const card = details(`camera:${camera.key}`, `${camera.name} · ${camera.kind === 'owl' ? 'Mini / Wi-Fi' : camera.kind} · ${camera.status || 'status unknown'}`, 'blink-camera');
      card.append(el('p', camera.key, 'blink-help'));
      card.append(check('Show this camera in Home', !values('excludeDevices').some(value => match(value, camera)), checked => {
        write('excludeDevices', toggleSelection(values('excludeDevices'), camera, !checked, cameras())); render();
      }));
      scalar('deviceNameOverrides', card, { property: properties.deviceNameOverrides.items.properties.customName, value: overrideRecord('deviceNameOverrides', camera)?.customName,
        change: value => changeOverride('deviceNameOverrides', camera, 'customName', value) });
      const setting = overrideRecord('deviceSettingOverrides', camera);
      const definitions = properties.deviceSettingOverrides.items.properties;
      scalar('deviceSettingOverrides', card, { property: definitions.inputQuality, value: setting?.inputQuality,
        change: value => changeOverride('deviceSettingOverrides', camera, 'inputQuality', value) });
      scalar('deviceSettingOverrides', card, { property: { title: 'Temperature in Home', type: 'string', enum: ['inherit', 'yes', 'no'], enumNames: ['Use platform setting', 'Show', 'Hide'] },
        value: setting?.exposeTemperature === undefined ? 'inherit' : setting.exposeTemperature ? 'yes' : 'no',
        change: value => changeOverride('deviceSettingOverrides', camera, 'exposeTemperature', value === 'inherit' ? undefined : value === 'yes') });
      scalar('deviceSettingOverrides', card, { property: { ...definitions.motionTimeout, description: 'Leave blank to use the platform motion timeout.' }, value: setting?.motionTimeout,
        change: value => changeOverride('deviceSettingOverrides', camera, 'motionTimeout', value) });
      parent.append(card);
    }
    function renderRecording(parent) {
      const hasSelection = values('hksvCameras').length > 0;
      parent.append(el('p', hasSelection ? 'Review current camera recording activity below. Recording permission and playback are managed in Apple Home.'
        : 'Choose the cameras to offer to HomeKit Secure Video, using the setup steps below.'));
      if (hasSelection) renderRecordingHealth(parent);
      const setup = details('recording:setup', 'Recording setup and prerequisites', 'blink-details blink-recording-setup');
      if (!expanded.has('recording:setup')) setup.open = !hasSelection;
      const preflight = el('section', undefined, 'blink-recording-guide');
      preflight.append(el('h3', 'Before the first recording'), el('p', 'For Saved Blink clips, confirm Blink is making native USB Local Storage clips. A connected USB drive can instead hold daily Cloud Clip Backups; those are a different source and do not establish that fresh native clips are available.', 'blink-help'));
      const steps = el('ol', undefined, 'blink-checklist');
      ['Select cameras and a recording source, then Save and restart the Blink child bridge. Reopen these settings after saving.',
        'In Apple Home, enable Stream & Allow Recording for Home and Away as wanted. Choose a motion-enabled recording policy and your audio preference. Your Home hub and iCloud+ plan are checked in Home.',
        'For saved clips, wait until each selected camera completes its initial clip scan. Then use its walk-test instructions below.',
        'Confirm the new clip in Blink, then find the delayed recording in Home and play it. Export important clips through Home.'].forEach(text => steps.append(el('li', text)));
      preflight.append(steps, el('p', 'Opening a camera tile in Home can start ordinary Live View and use battery, even when saved-clip recording has no idle video feed.', 'blink-help'));
      setup.append(preflight); parent.append(setup);
      scalar('hksvSource', parent);
      inventoryTools(parent);
      if (inventory) {
        cameras().forEach(camera => {
          const selected = values('hksvCameras').some(value => match(value, camera));
          const network = inventory.networks.find(item => String(item.id) === String(camera.networkId));
          const gates = `${camera.enabled ? 'motion on' : 'motion off'} · ${network ? network.armed ? 'system armed' : 'system disarmed' : 'system state unknown'}`;
          parent.append(check(`${camera.name} · ${camera.key} · ${gates}${included(camera) ? '' : ' · hidden from Home'}`, selected, checked => {
            write('hksvCameras', toggleSelection(values('hksvCameras'), camera, checked, cameras())); render();
          }, !included(camera) && !selected));
        });
        parent.append(el('p', `Feed capacity for these settings: ${cameras().filter(included).length} cameras. Live viewers and recording share each camera's upstream feed. Blink may impose its own limits.`, 'blink-help'));
      }
      unresolved(parent, 'hksvCameras');
      renderModules(parent, true);
      if (!hasSelection) renderRecordingHealth(parent);
      const privacy = details('recording:privacy', 'Motion, privacy and stopping capture');
      privacy.append(el('p', 'Home recording, camera-active and recording-audio permissions apply to replay as well as continuous capture. Turning recording off cancels pending replay and clears recording media; turning the camera off also blocks live viewing and snapshots. Saved-clip mode suppresses automatic snapshot captures and reuses existing previews, which may be old. Manual Live View and Refresh Snapshot remain explicit camera actions. “Read motion events from Blink” controls the separate motion poller; completed USB clip discovery has its own interval. Continuous mode may keep its feed and buffer running after Blink is disarmed; turn recording off in Home to stop it.'));
      privacy.append(el('p', 'Saved clips arrive after Blink finishes recording, USB discovery, download and preparation. Home places them at import time, not original capture time. Replay motion can cause delayed notifications and automations. Native clip/retrigger gaps cannot be recovered; there is no historical backdating or true pre-event video.', 'blink-help'), el('p', 'Continuous mode keeps a live feed open while Home recording is allowed, with a four-second memory buffer and local video motion. It uses battery and network capacity even without motion. Saved-clip mode instead waits for completed native USB clips; if Blink records no clip there is no source to import.', 'blink-help'));
      parent.append(privacy);
    }
    function changeModuleRecording(moduleId, field, value) {
      const key = 'syncModuleRecording';
      const existing = values(key).find(item => item.syncModuleId === moduleId);
      const retained = values(key).filter(item => item.syncModuleId !== moduleId);
      const next = { ...(existing || {}), syncModuleId: moduleId };
      if (value === undefined || value === '' || value === 'inherit') delete next[field]; else next[field] = value;
      if (Object.keys(next).length > 1) retained.push(next);
      write(key, retained);
      if (field === 'source') render();
    }
    function renderModules(parent, recording = false) {
      const detail = details(recording ? 'modules:recording' : 'modules:feeds', recording ? 'Recording by Sync Module' : 'Sync Module feed limits');
      detail.append(el('p', recording ? 'Modules inherit the default source. Override only the values you want to change. Completed USB clips require an unambiguous camera-to-module association.'
        : 'Limits use a module’s Blink-system association, not a proven physical video path. Each actual module defaults to its included associated camera count. Leave blank to use that default.', 'blink-help'));
      const modules = inventory?.syncModules || [];
      modules.forEach(module => {
        const associated = cameras().filter(camera => camera.moduleAssociation.state === 'unique' && camera.moduleAssociation.candidateIds.includes(module.id) && included(camera));
        const ambiguous = cameras().some(camera => camera.moduleAssociation.state === 'ambiguous' && camera.moduleAssociation.candidateIds.includes(module.id));
        const row = el('div', undefined, 'blink-module'); row.append(el('h3', module.name || `Sync Module ${module.id}`));
        row.append(el('p', `Module ID ${module.id} · ${module.status} · ${ambiguous ? 'ambiguous system association' : `${associated.length} included cameras by system association`}`, 'blink-help'));
        if (recording) {
          const current = values('syncModuleRecording').find(item => item.syncModuleId === module.id);
          scalar('syncModuleRecording', row, { property: { title: 'Recording source', type: 'string', enum: ['inherit', 'saved-clips', 'continuous'], enumNames: ['Use default recording source', 'Saved Blink clips', 'Continuous feed (opt in)'] },
            value: current?.source || 'inherit', change: value => changeModuleRecording(module.id, 'source', value) });
          const poll = scalar('syncModuleRecording', row, { property: properties.syncModuleRecording.items.properties.pollIntervalSeconds,
            value: current?.pollIntervalSeconds, change: value => changeModuleRecording(module.id, 'pollIntervalSeconds', value) });
          if ((current?.source || draft.config.hksvSource || 'saved-clips') === 'continuous') poll.disabled = true;
          if (current) {
            const reset = el('button', 'Use recording defaults', 'btn btn-sm btn-outline-secondary'); reset.type = 'button'; reset.disabled = !accountReady || draft.state.accountAction;
            reset.addEventListener('click', () => { write('syncModuleRecording', values('syncModuleRecording').filter(item => item.syncModuleId !== module.id)); render(); }); row.append(reset);
          }
          detail.append(row); return;
        }
        const current = values('syncModuleFeedLimits').find(item => item.syncModuleId === module.id);
        const input = scalar('syncModuleFeedLimits', row, { property: { ...properties.syncModuleFeedLimits.items.properties.maxFeeds, description: 'Blank uses the discovered camera count. Enter a positive whole number.' }, value: current?.maxFeeds,
          change: value => { const retained = values('syncModuleFeedLimits').filter(item => item.syncModuleId !== module.id); write('syncModuleFeedLimits', value === undefined ? retained : [...retained, { syncModuleId: module.id, maxFeeds: value }]); } });
        if (ambiguous) input.disabled = true;
        if (current) {
          const reset = el('button', 'Use discovered default', 'btn btn-sm btn-outline-secondary'); reset.type = 'button'; reset.disabled = !accountReady || draft.state.accountAction;
          reset.addEventListener('click', () => { write('syncModuleFeedLimits', values('syncModuleFeedLimits').filter(item => item.syncModuleId !== module.id)); render(); });
          row.append(reset);
        }
        detail.append(row);
      });
      const key = recording ? 'syncModuleRecording' : 'syncModuleFeedLimits';
      values(key).filter(item => !modules.some(module => module.id === item.syncModuleId)).forEach(item => {
        const row = el('div', undefined, 'blink-unresolved'); row.append(el('span', `Unavailable Sync Module ${item.syncModuleId}${recording ? '' : `: ${item.maxFeeds}`}`));
        const remove = el('button', 'Remove override', 'btn btn-sm btn-outline-secondary'); remove.type = 'button'; remove.disabled = !accountReady || draft.state.accountAction;
        if (recording) remove.dataset.recordingRemove = item.syncModuleId;
        remove.addEventListener('click', () => { write(key, values(key).filter(value => value !== item)); render(); }); row.append(remove); detail.append(row);
      }); parent.append(detail);
    }
    const applicabilityCopy = {
      checking: ['Checking these selections', 'Wait for settings validation to finish.'],
      'settings-invalid': ['Review the settings first', 'Correct the validation errors or retry staging. Recording status does not prevent a valid Save.'],
      draft: ['Changes are not applied', 'Save and restart the Blink child bridge, then reopen these settings before testing.'],
      'projection-unavailable': ['Recording setup needs a restart', 'Restart the updated Blink child bridge and reopen settings to read its camera selections.'],
      'restart-required': ['Restart required', 'Save your intended configuration, restart the Blink child bridge and refresh activity.'],
      missing: ['No runtime report yet', 'Save and restart the Blink child bridge, then refresh activity.'],
      stale: ['Runtime report is stale', 'Refresh activity and check that the Blink child bridge is running. The earlier status is shown only for reference.'],
      unavailable: ['Runtime report could not be read', 'Check the child bridge logs and refresh activity. Settings can still be saved.'],
      'runtime-unavailable': ['Recording runtime is not ready', 'Review Connection for sign-in or connection recovery, then refresh activity.'],
    };
    const stageCopy = {
      'inventory-unavailable': ['Waiting for camera discovery', 'Refresh cameras from a working Blink connection; the saved selection is preserved.'],
      'camera-excluded': ['Hidden from Home', 'Show this camera/system in Cameras, or remove its recording selection.'],
      'camera-unresolved': ['Saved camera is unavailable', 'Refresh cameras, choose the intended camera, or remove this saved selection.'],
      'camera-selector-ambiguous': ['Camera selection is ambiguous', 'Choose a specific discovered camera and remove the ambiguous saved selector.'],
      'camera-unavailable': ['Camera is unavailable', 'Review Cameras and the Blink connection before testing.'],
      'module-unavailable': ['Sync Module association is unavailable', 'Check discovery and the camera’s Blink system/Sync Module association. No continuous feed is started as a fallback.'],
      'camera-name-ambiguous': ['USB camera name is ambiguous', 'Give the cameras distinct names in Blink, refresh discovery and restart the child bridge.'],
      'home-recording-off': ['Recording is off in Home', 'In Home camera settings, allow Stream & Allow Recording for the locations you want.'],
      'home-camera-off': ['Camera is disabled in Home', 'Enable the camera in Home before recording.'],
      'home-policy-unknown': ['Waiting for Home permissions', 'Review Home camera recording options, then refresh activity. Missing observations are not permission denials.'],
      'home-configuration-unknown': ['Waiting for Home recording setup', 'Configure recording in Home; the plugin has not observed a recording configuration yet.'],
      'home-configuration-missing': ['Home recording is not configured', 'Choose Stream & Allow Recording and a recording policy in Home.'],
      'home-configuration-invalid': ['Home recording configuration is unavailable', 'Reopen recording options in Home and check the child bridge logs.'],
      'unsupported-trigger-policy': ['Choose a motion recording policy', 'Ring-only saved-clip recording is unsupported. Choose a motion-enabled policy in Home; no camera setting is changed here.'],
      'baseline-pending': ['Initial clip scan in progress', 'Wait for this camera’s initial clip scan to finish before walking in front of it. Refresh activity to check progress.'],
      'waiting-for-native-clip': ['Ready for a fresh motion test', 'The initial clip scan is complete. Use the walk-test instructions to check a new event.'],
      queued: ['Clip is queued', 'The plugin will process eligible footage within its bounded queue. Refresh activity to follow progress.'],
      'preparing-download': ['Blink is preparing the USB clip', 'Wait for Blink’s local-storage request to finish.'],
      downloading: ['Downloading the native clip', 'The camera has already recorded; the completed file is being downloaded.'],
      'preparing-media': ['Preparing video for Home', 'Preparation can take about a minute per one-minute clip on a Pi 5 and longer during a burst.'],
      ready: ['Video is prepared', 'Waiting to offer this completed clip to Home. Preparation does not confirm a Home recording.'],
      offered: ['Clip offered to Home', 'Check the Home timeline after ingestion. Sending media does not confirm retention.'],
      delivered: ['Home hub acknowledged transport', 'Open Home, find the imported event and play it. The plugin cannot confirm iCloud retention.'],
      uncertain: ['Home delivery is uncertain', 'Check Home manually before taking further action. This clip is not automatically offered again.'],
      failed: ['Clip could not be processed', 'Review the reason below and the child bridge logs. The original remains in Blink.'],
      expired: ['A queued Home copy expired', 'Review the original in Blink. Clips older than the 15-minute import window are skipped; original Blink clips remain.'],
      cancelled: ['Pending work was cancelled', 'Review current permissions and selections. Only future eligible clips will be imported.'],
      'continuous-off': ['Continuous capture is off', 'Review Home recording permissions and the child bridge logs.'],
      'continuous-warming': ['Continuous feed is starting', 'Wait for the live recording buffer to become ready; this source uses idle camera power.'],
      'continuous-ready': ['Continuous buffer is ready', 'Home handles recording from supported triggers. Check resulting clips manually in Home.'],
      'continuous-recording': ['Continuous event is being sent', 'Review the resulting event in Home; transport is not retention confirmation.'],
      'continuous-fault': ['Continuous capture needs attention', 'Check the child bridge logs and Blink connection; continuous mode can use battery between events.'],
      'runtime-unavailable': applicabilityCopy['runtime-unavailable'],
    };
    const reasonCopy = {
      'provider-unavailable': 'Blink did not make the source available. Check native USB Local Storage in Blink, its connection/space and the plugin connection.',
      'command-pending': 'Blink is still preparing its response. The plugin uses bounded waits and retries; refresh activity later.',
      'ambiguous-request': 'A request acknowledgement was lost. Check logs and Blink; the plugin avoids blindly repeating that clip request.',
      'media-invalid': 'The downloaded source was not admissible. Check that the original plays in Blink and inspect the child bridge logs.',
      'media-preparation-failed': 'The source could not be prepared for Home. Check its playback in Blink and the child bridge logs.',
      'queue-pressure': 'More clips arrived than can be queued. Review Blink originals; busy cameras can outpace preparation and older Home copies can expire.',
      'storage-pressure': 'The bounded local workspace is full. Existing work must finish or expire before more clips can be admitted; check logs if it persists.',
      'metadata-pressure': 'The bounded discovery ledger is at capacity. Check the child bridge logs; native clips are not deleted.',
      'configuration-unavailable': 'Home has not supplied a usable configuration. Review its recording options.',
      'configuration-changed': 'Home changed the recording format. Eligible pending work can be prepared again without repeating an offered event.',
      'target-busy': 'This camera is still finishing an earlier Home event. Pending clips wait within the import window.',
      'permission-changed': 'Permissions changed and pending work was cancelled. Clips from the disallowed period are not uploaded later.',
      'delivery-uncertain': 'Check the imported event in Home manually; an uncertain offer is not automatically duplicated.',
      'camera-unmatched': 'A catalog entry could not be matched uniquely. Check discovered camera names and Sync Module association.',
      'camera-unregistered': 'The camera selection is no longer active. Review the saved configuration.',
      expired: 'The 15-minute eligibility window elapsed. The original stays in Blink.',
      'unsupported-trigger-policy': stageCopy['unsupported-trigger-policy'][1],
    };
    function renderRecordingHealth(parent) {
      recordingPanel = el('section', undefined, 'blink-recording-status'); parent.append(recordingPanel);
    }
    function paintRecordingHealth() {
      if (!recordingPanel) return;
      rememberDetails(recordingPanel); recordingPanel.replaceChildren();
      const applicability = recordingApplicability(draft.state, recordingHealth);
      const applied = applicability === 'applied';
      const banner = applicabilityCopy[applicability];
      recordingPanel.append(el('h3', 'Recording setup and activity'));
      if (banner) recordingPanel.append(el('p', banner[0], 'blink-readiness-title'), el('p', banner[1], 'blink-help'));
      if (healthLoading) recordingPanel.append(el('p', 'Reading local activity…', 'blink-help'));
      const selections = draft.state.recording?.selections || [];
      if (!selections.length) recordingPanel.append(el('p', values('hksvCameras').length
        ? 'Waiting for the server to validate these recording selections.' : 'Select a camera above to set up its recording. No camera is selected.', 'blink-help'));
      const health = recordingHealth?.health?.version === 2 ? recordingHealth.health : null;
      selections.forEach(selection => {
        const observed = health?.cameras.find(camera => camera.id === selection.id);
        const card = el('section', undefined, 'blink-recording-camera'); card.append(el('h3', selection.label));
        card.append(el('p', `${selection.source === 'continuous' ? 'Continuous feed (opt in)' : 'Saved Blink clips'} · ${selection.moduleLabel || 'Sync Module not associated'}`, 'blink-source-line'));
        const stage = !selection.available ? selection.reason || 'camera-unavailable' : observed?.stage || 'home-configuration-unknown';
        const [heading, action] = stageCopy[stage] || ['Status is unavailable', 'Refresh activity and check the child bridge logs.'];
        card.append(el('p', applied ? heading : 'Readiness is not confirmed', 'blink-readiness-title'), el('p', applied ? action : banner?.[1] || 'Refresh activity after applying the configuration.', 'blink-help'));
        if (!applied && observed) card.append(el('p', `Last observed: ${heading}. ${action}`, 'blink-help'));
        if (!applied) card.append(el('p', 'The status below is reference only until the current settings and report apply.', 'blink-help'));
        const home = observed?.home;
        const flag = value => value === true ? 'on' : value === false ? 'off' : 'not observed';
        card.append(el('p', `Home recording: ${flag(home?.recordingActive)} · camera: ${flag(home?.cameraActive)} · recording audio: ${flag(home?.audioActive)}${home ? ` · effective audio: ${home.effectiveAudioActive ? 'on' : 'off (video only)'}` : ''}`, 'blink-help'));
        const baseline = observed?.baseline;
        card.append(el('p', `Initial clip scan: ${baseline === 'complete' ? 'complete' : baseline === 'not-applicable' ? 'not applicable' : 'pending'}${observed?.baselineCompletedAt ? ` · ${formatTime(observed.baselineCompletedAt)}` : ''}`, 'blink-help'));
        if (selection.source === 'saved-clips') {
          card.append(el('p', observed?.nativeStorage === 'native-clip-observed'
            ? `Native USB file downloaded ${formatTime(observed.nativeStorageObservedAt)}. This proves source-file availability, not the walk test or Home retention.`
            : 'Native USB source-file availability has not been observed yet. A completed scan or armed camera is not capture proof.', 'blink-help'));
          const canTest = applied && selection.available && observed?.available && observed.source === selection.source && observed.canTriggerFreshTest === true;
          const test = el('button', 'Walk-test instructions', 'btn btn-sm btn-outline-secondary'); test.type = 'button';
          test.dataset.walkTest = selection.id; test.disabled = !canTest;
          test.addEventListener('click', () => { walkTests.has(selection.id) ? walkTests.delete(selection.id) : walkTests.add(selection.id); paintRecordingHealth(); });
          card.append(test);
          if (canTest && walkTests.has(selection.id)) card.append(el('p', 'Arm the Blink system and enable this camera’s motion detection in Blink. Walk across its view for 15–20 seconds. Confirm a new native clip in Blink, then refresh activity here. After the clip is offered, open its camera in Home, find the delayed event and play it. Confirm playback yourself; a hub acknowledgement is only transport evidence.', 'blink-walk-steps'));
        }
        if (observed?.reason && reasonCopy[observed.reason]) card.append(el('p', reasonCopy[observed.reason], 'blink-recovery'));
        if (observed?.lastExpiredAt) card.append(el('p', `Last expired Home copy: ${formatTime(observed.lastExpiredAt)}. Review the original in Blink.`, 'blink-recovery'));
        if (observed?.job) {
          const timeline = details(`job:${selection.id}`, 'Clip timing and transport');
          const times = el('dl', undefined, 'blink-recording-timeline');
          for (const [label, key] of [['Original capture (Blink)', 'capturedAt'], ['Discovered', 'discoveredAt'], ['Downloaded', 'downloadedAt'],
            ['Prepared for Home', 'preparedAt'], ['Offered to Home (delayed)', 'offeredAt'], ['Hub transport acknowledgement', 'acknowledgedAt'], ['Expired', 'expiredAt']]) {
            times.append(el('dt', label), el('dd', formatTime(observed.job[key])));
          }
          timeline.append(times, el('p', 'All times above describe the same clip. Home ingestion is delayed; an offer or acknowledgement does not confirm a playable or retained recording.', 'blink-help')); card.append(timeline);
        }
        recordingPanel.append(card);
      });
      if (health) {
        const resources = details('recording:resources', 'Queue, Sync Modules and local workspace');
        resources.append(el('p', `${health.queue} queued · ${health.active} active · ${Math.ceil(health.mediaBytes / 1048576)} MiB stored · ${Math.ceil(health.reservedBytes / 1048576)} MiB reserved`, 'blink-help'));
        health.modules.forEach(module => resources.append(el('p', `${module.label}: initial clip scan ${module.baseline === 'complete' ? 'complete' : module.baseline === 'not-applicable' ? 'not applicable' : 'pending'} · last catalog ${formatTime(module.lastCatalogAt)}${module.reason && reasonCopy[module.reason] ? ` · ${reasonCopy[module.reason]}` : ''}`, 'blink-help')));
        resources.append(el('p', 'The initial clip scan establishes a baseline: clips already present are observed without importing history. Start the fresh walk test only after that scan completes.', 'blink-help'));
        resources.append(el('p', 'Preparation and storage are bounded. Frequent clips across several cameras can outpace processing; Home copies older than 15 minutes can expire while Blink originals remain.', 'blink-help')); recordingPanel.append(resources);
      }
      const refresh = el('button', 'Refresh activity', 'btn btn-sm btn-outline-secondary'); refresh.type = 'button'; refresh.disabled = healthLoading || draft.state.accountAction;
      refresh.addEventListener('click', refreshRecordingHealth); recordingPanel.append(refresh);
      const connectionButton = el('button', 'Review Connection', 'btn btn-sm btn-outline-secondary'); connectionButton.type = 'button';
      connectionButton.addEventListener('click', () => showSection(0)); recordingPanel.append(connectionButton);
      const guide = el('a', 'Recording setup and recovery guide', 'blink-recording-guide-link');
      guide.href = 'https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/RECORDING.md'; guide.target = '_blank'; guide.rel = 'noopener noreferrer'; recordingPanel.append(guide);
    }
    function formatTime(value) { return value ? new Date(value).toLocaleString() : 'Not observed'; }
    async function refreshRecordingHealth() {
      if (healthLoading) return;
      healthLoading = true; render();
      try {
        const result = await deadline(homebridge.request('/settings/recording-health', {}));
        if (!result || !['available', 'stale', 'missing', 'unavailable', 'unsupported'].includes(result.state)
          || ['available', 'stale'].includes(result.state) && (!result.health || !Array.isArray(result.health.cameras) || !Array.isArray(result.health.modules))) throw new Error('Invalid activity report');
        recordingHealth = result;
      } catch { recordingHealth = { state: 'unavailable' }; }
      finally { healthLoading = false; render(); }
    }
    function render() {
      rememberDetails(fields); recordingPanel = null; fields.replaceChildren(); sequence = 0;
      title.textContent = sections[active].title;
      connection.hidden = active !== 0;
      accountDetails.hidden = active !== sections.length - 1;
      nav.querySelectorAll('button').forEach((button, index) => { button.setAttribute('aria-current', index === active ? 'page' : 'false'); button.classList.toggle('active', index === active); });
      const keys = sections[active].items;
      if (keys.includes('hksvCameras')) renderRecording(fields);
      else if (keys.includes('excludeDevices')) renderCameras(fields);
      else if (active === sections.length - 1) {
        const technical = new Set(['maxStreams', 'audioCodec', 'audioBitrate', 'videoBitrate', 'softwareEncodingPreset']);
        const diagnostic = new Set(['debugAuth', 'mediaDebug', 'debugStreamPath']);
        keys.filter(key => !technical.has(key) && !diagnostic.has(key)).forEach(key => scalar(key, fields));
        for (const [name, members] of [['Live-view tuning', technical], ['Diagnostics', diagnostic]]) {
          const detail = details(`advanced:${name}`, name); keys.filter(key => members.has(key)).forEach(key => scalar(key, detail)); fields.append(detail);
        }
      } else keys.forEach(key => scalar(key, fields));
      refreshState(draft.state);
    }
    function refreshState(state) {
      status.textContent = state.accountAction ? 'Account action in progress. Settings are temporarily unavailable.' : state.pending ? 'Checking changes…' : state.dirty ? 'Unsaved changes. Save, then restart the Blink child bridge.' : 'Settings loaded. Changes take effect after Save and a child bridge restart.';
      connection.inert = state.accountAction;
      accountDetails.inert = state.accountAction;
      errors.replaceChildren(); errors.hidden = !state.error && !state.errors.length;
      if (state.error) errors.append(el('p', state.error));
      state.errors.forEach(error => {
        const key = error.path.split('/')[1];
        const row = el('p', `${properties[key]?.title || 'Settings'}: ${error.message}`);
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
      paintRecordingHealth();
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
    function showSection(index) { active = index; render(); title.focus(); if (sections[index].items.includes('hksvCameras') && !recordingHealth) void refreshRecordingHealth(); }
    document.getElementById('retrySettings').addEventListener('click', () => draft.retry());
    render(); draft.retry();
    return {
      draft, refreshInventory, refreshRecordingHealth,
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
