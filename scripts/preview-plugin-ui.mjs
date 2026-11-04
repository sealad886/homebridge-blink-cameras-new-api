#!/usr/bin/env node
// Production UI and canonical server helpers, with synthetic in-memory data only.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
const require = createRequire(import.meta.url);
const { SettingsValidator } = require('../dist/homebridge-ui/settings-validation.js');
const { projectSettingsInventory, projectRecordingSelections, recordingIdentity } = require('../dist/settings-inventory.js');
const { composeRecordingReadiness, unknownHomeRecordingObservation } = require('../dist/recording-readiness.js');
const project = new URL('../', import.meta.url);
const publicPath = new URL('src/homebridge-ui/public/', project);
const schema = JSON.parse(await readFile(new URL('config.schema.json', project), 'utf8'));
const scenarios = new Map([
  ['fresh-setup', 'First setup · no cameras selected'], ['restart-required', 'Saved settings need a restart'],
  ['baseline-pending', 'Initial catalog pending'], ['home-off', 'Home recording off'], ['ring-only', 'Ring-only policy'],
  ['ready', 'Ready for a fresh walk test'], ['backlog', 'Busy queue'], ['expired', 'Home copy expired'], ['recovery', 'Connection recovery'],
]);
const homescreen = { account: { account_id: 1 }, networks: [{ id: 10, name: 'Home', armed: true },
  { id: 20, name: 'Garage', armed: false }, { id: 30, name: 'Wi-Fi cameras', armed: true }],
  sync_modules: [{ id: 101, network_id: 10, name: 'Home Sync Module', status: 'online' },
    { id: 202, network_id: 20, name: 'Garage Sync Module', status: 'online' }],
  cameras: ['Front door', 'Garden', 'Hall', 'Driveway', 'Kitchen'].map((name, index) => ({ id: index + 1,
    name, network_id: index < 3 ? 10 : 20, enabled: true, status: index === 4 ? 'offline' : 'online' })),
  owls: [{ id: 6, name: 'Office', network_id: 30, enabled: true, status: 'online' }], doorbells: [] };
function configuration(scenario) {
  return { platform: 'BlinkCameras', name: 'Blink', authLocked: true, enableStreaming: true, enableMotionPolling: false,
    persistSnapshotCache: true, snapshotCacheTTL: 300, exposeTemperature: true, _bridge: { username: 'synthetic' },
    previewExtension: { preserved: true }, ...(scenario === 'fresh-setup' ? {} : {
      hksvCameras: scenario === 'recovery' ? ['camera:1', 'owl:6', 'Unavailable camera'] : ['camera:1', 'camera:4'],
      syncModuleRecording: [{ syncModuleId: '202', source: 'continuous' }],
    }) };
}
const inventory = projectSettingsInventory(homescreen);
const validator = new SettingsValidator(() => inventory);
function reportFor(scenario) {
  const now = Date.now(), at = seconds => new Date(now - seconds * 1000).toISOString();
  const config = configuration(scenario);
  const applied = scenario === 'restart-required' ? { ...config, hksvSource: 'continuous' } : config;
  const selections = projectRecordingSelections(inventory, applied);
  const saved = selections.filter(selection => selection.available && selection.source === 'saved-clips');
  const queued = scenario === 'backlog' ? 5 : 0;
  const activity = { updatedAt: at(0), queue: queued, active: queued ? 1 : 0, mediaBytes: queued ? 12260089 : 0,
    reservedBytes: queued ? 33554432 : 0, preparationLimit: 2,
    modules: saved.map(selection => ({ id: recordingIdentity(`10:${selection.syncModuleId}`), key: `10:${selection.syncModuleId}`,
      label: selection.moduleLabel, baseline: scenario === 'baseline-pending' ? 'pending' : 'complete', lastCatalogAt: at(20) })),
    cameras: saved.map(selection => ({ id: selection.id, key: selection.cameraKey, label: selection.label,
      baseline: scenario === 'baseline-pending' ? 'pending' : 'complete',
      ...(scenario === 'baseline-pending' ? {} : { baselineCompletedAt: at(600) }), queued, delivered: 0, uncertain: 0,
      ...(scenario === 'backlog' ? { nativeStorageObservedAt: at(300), lastNativeClipAt: at(30), reason: 'queue-pressure',
        job: { id: '0123456789abcdef', state: 'preparing-media', capturedAt: at(120), discoveredAt: at(100), downloadedAt: at(80) } } : {}),
      ...(scenario === 'expired' ? { lastExpiredAt: at(10), lastExpiredReason: 'expired', reason: 'expired' } : {}),
      ...(scenario === 'recovery' ? { reason: 'provider-unavailable' } : {}),
    })) };
  const observations = new Map(selections.filter(selection => selection.cameraKey).map(selection => [selection.cameraKey, {
    home: { ...unknownHomeRecordingObservation(), configuration: 'configured', recordingActive: scenario !== 'home-off',
      cameraActive: true, audioActive: false, effectiveAudioActive: false, triggerTypes: scenario === 'ring-only' ? [2] : [1] },
    status: { state: selection.source === 'continuous' ? 'warming' : 'off' },
  }]));
  return { state: 'available', checkedAt: at(0), health: composeRecordingReadiness({ config: applied, inventory,
    runtime: scenario === 'recovery' ? 'unavailable' : 'running', now, activity, observations }) };
}
const jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c');
function adapterFor(scenario) {
  const options = [...scenarios].map(([value, label]) => `<option value="${value}"${scenario === value ? ' selected' : ''}>${label}</option>`).join('');
  return `<style>:root{--bs-primary:#b76a00;--bs-border-color:#a5a5a5}body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;margin:auto;max-width:800px;background:#f7f7f7;color:#202124;padding:16px}.btn{font:inherit;cursor:pointer;padding:.45rem .7rem;border:1px solid #888;border-radius:4px;background:transparent;color:inherit}.btn-primary{background:#b76a00;color:white}.form-control{font:inherit;background:transparent;color:inherit;border:1px solid #888;border-radius:4px;padding:.5rem;box-sizing:border-box}button:disabled,input:disabled,select:disabled{opacity:.6}.alert{padding:.8rem;border:1px solid #888;border-radius:4px}.alert-danger{border-color:#cf4a4a}.alert-warning{border-color:#b76a00}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}#previewHost{border:2px solid #b76a00;padding:.8rem;margin-bottom:1rem}#previewHost select{max-width:100%;font:inherit;margin:.5rem 0}body.dark{background:#252525;color:#eee}</style>
<div id="previewHost"><strong>Local preview · synthetic cameras</strong><p>Production UI and canonical server helpers. No Blink or Homebridge connection. Save keeps data in this page only.</p><label for="previewScenario">Recording scenario</label><br><select id="previewScenario">${options}</select><br><button type="button" id="previewTheme">Light / dark</button> <button type="button" id="previewSave" disabled>Save (memory only)</button> <button type="button" id="previewDiscovery">Simulate discovery failure</button><p id="previewCrypto"></p><p id="previewResult" role="status"></p></div>
<script>
(function(){
 const scenario=${jsonForScript(scenario)};
 let blocks=[${jsonForScript(configuration(scenario))}];let failDiscovery=false;
 // This synthetic tab deliberately exercises the ordinary-HTTP/no-WebCrypto path.
 try{Object.defineProperty(window,'crypto',{value:undefined,configurable:true})}catch{}
 document.getElementById('previewCrypto').textContent=window.crypto?'Browser cryptography exists; settings still use server revisions.':'Browser cryptography absent; settings use server revisions.';
 const api=new EventTarget();window.homebridge=api;
 api.getPluginConfig=async()=>structuredClone(blocks);
 api.getPluginConfigSchema=async()=>(${jsonForScript(schema)});
 api.updatePluginConfig=async next=>{blocks=structuredClone(next);return structuredClone(blocks)};
 api.savePluginConfig=async()=>{document.getElementById('previewResult').textContent='Account settings stored in preview memory only.'};
 api.disableSaveButton=()=>{document.getElementById('previewSave').disabled=true};
 api.enableSaveButton=()=>{document.getElementById('previewSave').disabled=false};
 api.hideSchemaForm=()=>{};api.showSpinner=()=>{};api.hideSpinner=()=>{};
 api.toast={success:()=>{},warning:()=>{},info:()=>{},error:()=>{}};
 api.request=async(path,payload)=>{
  if(path==='/status')return {authenticated:true,email:'Synthetic preview account',tier:'prod'};
  if(path==='/test-connection')return {success:true,message:'Synthetic connection only'};
  if(path==='/settings/inventory'){if(failDiscovery)throw new Error('Synthetic discovery failure');return ${jsonForScript(inventory)}};
  if(path==='/settings/recording-health'){const response=await fetch('/__preview/recording-health?scenario='+scenario);return response.json()};
  if(path==='/settings/validate'){const response=await fetch('/__preview/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return response.json()};
  throw new Error('Account mutations are disabled in this local preview');
 };
 document.getElementById('previewSave').onclick=()=>{document.getElementById('previewResult').textContent='Preview memory saved. Reload the selected scenario to discard edits or restore its synthetic runtime.'};
 document.getElementById('previewTheme').onclick=()=>document.body.classList.toggle('dark');
 document.getElementById('previewDiscovery').onclick=()=>{failDiscovery=!failDiscovery;document.getElementById('previewResult').textContent=failDiscovery?'Discovery will fail until toggled again.':'Discovery restored.'};
 document.getElementById('previewScenario').onchange=event=>{window.location.href='/?scenario='+encodeURIComponent(event.target.value)};
 window.addEventListener('load',()=>api.dispatchEvent(new Event('ready')),{once:true});
})();
</script>`;
}
const allowed = new Map([['/settings.css', ['settings.css', 'text/css']], ['/settings-state.js', ['settings-state.js', 'text/javascript']], ['/settings-ui.js', ['settings-ui.js', 'text/javascript']]]);
const html = await readFile(new URL('index.html', publicPath), 'utf8');
// Check every generated scenario adapter, including inline source, before listening.
for (const scenario of scenarios.keys()) {
  for (const [, code] of (adapterFor(scenario) + html).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (code.trim()) new Script(code);
  if (!validator.validate({ revision: 1, config: configuration(scenario) }).valid) throw new Error('Synthetic scenario config is invalid');
  if (reportFor(scenario).health.version !== 2) throw new Error('Synthetic scenario report is invalid');
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'POST' && url.pathname === '/__preview/validate') {
      let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 128 * 1024) throw new Error('Preview request too large'); }
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(validator.validate(JSON.parse(body)))); return;
    }
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    const scenario = url.searchParams.get('scenario') || 'fresh-setup';
    if (!scenarios.has(scenario)) { response.writeHead(400).end('Choose a synthetic scenario.'); return; }
    if (url.pathname === '/__preview/recording-health') {
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(reportFor(scenario))); return;
    }
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blink settings · local synthetic preview</title></head><body>${adapterFor(scenario)}${html}</body></html>`); return;
    }
    const asset = allowed.get(url.pathname);
    if (!asset) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', asset[1]); response.end(await readFile(new URL(asset[0], publicPath)));
  } catch { response.writeHead(400).end('Preview request failed.'); }
});
if (process.argv[2] === '--check') console.log('All 9 generated preview scenarios and production inline scripts parse; canonical configurations/reports are valid. No server started.');
else {
  const port = Number(process.argv[2] || 8766);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose an unprivileged preview port.');
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic UI preview: http://127.0.0.1:${port}/?scenario=fresh-setup (source: ${fileURLToPath(publicPath)})`));
}
