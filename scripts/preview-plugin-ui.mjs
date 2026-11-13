#!/usr/bin/env node
// Run npm run build first. Serves the production UI with a synthetic host only.
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
const require = createRequire(import.meta.url);
const project = new URL('../', import.meta.url);
const validatorPath = fileURLToPath(new URL('dist/homebridge-ui/settings-validation.js', project));
if (!existsSync(validatorPath)) throw new Error('Run npm run build before starting or checking the settings preview.');
const { SettingsValidator } = require(validatorPath);
const { migrateEarlyNotificationConfig } = require(fileURLToPath(new URL('dist/early-notification-config.js', project)));
const publicPath = new URL('src/homebridge-ui/public/', project);
const schema = JSON.parse(await readFile(new URL('config.schema.json', project), 'utf8'));
const cameras = Array.from({ length: 6 }, (_, index) => ({ key: `${index === 5 ? 'owl' : 'camera'}:${index + 1}`, id: String(index + 1), kind: index === 5 ? 'owl' : 'camera', name: ['Front door', 'Garden', 'Hall', 'Driveway', 'Kitchen', 'Office'][index], networkId: index < 3 ? '10' : '20', enabled: true, status: index === 4 ? 'offline' : 'online', excluded: false, moduleAssociation: { state: index === 5 ? 'noneReported' : 'unique', candidateIds: index === 5 ? [] : [index < 3 ? '101' : '202'], source: 'network_id' } }));
const inventory = { revision: 'synthetic-1', fetchedAt: new Date().toISOString(), networks: [{ id: '10', name: 'Home', armed: true }, { id: '20', name: 'Garage', armed: false }], syncModules: [{ id: '101', networkId: '10', name: 'Home Sync Module', status: 'online' }, { id: '202', networkId: '20', name: 'Garage Sync Module', status: 'online' }], cameras, globalFeedCapacity: 6 };
const validator = new SettingsValidator(() => inventory);
const initialConfig = { platform: 'BlinkCameras', name: 'Blink', authLocked: true, enableStreaming: true, persistSnapshotCache: true, snapshotCacheTTL: 300, exposeTemperature: true, _bridge: { username: 'synthetic' }, previewExtension: { preserved: true } };
const adapter = `<style>:root{--bs-primary:#b76a00;--bs-border-color:#a5a5a5}body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;margin:auto;max-width:800px;background:#f7f7f7;color:#202124;padding:16px}.btn{font:inherit;cursor:pointer;padding:.45rem .7rem;border:1px solid #888;border-radius:4px;background:transparent;color:inherit}.btn-primary{background:#b76a00;color:white}.form-control{font:inherit;background:transparent;color:inherit;border:1px solid #888;border-radius:4px;padding:.5rem;box-sizing:border-box}button:disabled,input:disabled,select:disabled{opacity:.6}.alert{padding:.8rem;border:1px solid #888;border-radius:4px}.alert-danger{border-color:#cf4a4a}.alert-warning{border-color:#b76a00}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}#previewHost{border:2px solid #b76a00;padding:.8rem;margin-bottom:1rem}body.dark{background:#252525;color:#eee}</style>
<div id="previewHost"><strong>Local preview · synthetic cameras</strong><p>Production UI source, simulated Homebridge API. No Blink or Homebridge connection. Save keeps data in this page only.</p><button type="button" id="previewTheme">Light / dark</button> <button type="button" id="previewSave" disabled>Save (memory only)</button> <button type="button" id="previewDiscovery">Simulate discovery failure</button><p id="previewResult" role="status"></p></div>
<script>
(function(){
 let blocks=structuredClone(window.__previewInitialBlocks||[${JSON.stringify(initialConfig).replace(/</g, '\\u003c')}]);let failDiscovery=false;
 const proof=window.__preview={testCalls:0,configWrites:0,configSaves:0,result:'success',verified:undefined};
 const api=new EventTarget();window.homebridge=api;
 api.getPluginConfig=async()=>structuredClone(blocks);
 api.getPluginConfigSchema=async()=>(${JSON.stringify(schema).replace(/</g, '\\u003c')});
 api.updatePluginConfig=async next=>{proof.configWrites++;blocks=structuredClone(next);return structuredClone(blocks)};
 api.savePluginConfig=async()=>{proof.configSaves++;document.getElementById('previewResult').textContent='Account settings stored in preview memory only.'};
 api.disableSaveButton=()=>{document.getElementById('previewSave').disabled=true};
 api.enableSaveButton=()=>{document.getElementById('previewSave').disabled=false};
 api.hideSchemaForm=()=>{};api.showSpinner=()=>{};api.hideSpinner=()=>{};
 api.toast={success:()=>{},warning:()=>{},info:()=>{},error:()=>{}};
 api.request=async(path,payload)=>{
  if(path==='/status'){if(proof.statusUnavailable)throw new Error('Synthetic status unavailable');return proof.statusOverride||{authenticated:true,email:'Synthetic preview account',tier:'prod',verified:proof.verified}};
  if(path==='/test-connection'){proof.testCalls++;if(proof.result==='throw')throw new Error('Synthetic connection failure');proof.verified=proof.result!=='failure';return {success:proof.verified,message:'Synthetic connection only'}};
  if(path==='/settings/migrate'){const response=await fetch('/__preview/migrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return response.json()};
  if(path==='/settings/inventory'){if(failDiscovery)throw new Error('Synthetic discovery failure');return ${JSON.stringify(inventory)}};
  if(path==='/settings/validate'){const response=await fetch('/__preview/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return response.json()};
  throw new Error('Account mutations are disabled in this local preview');
 };
 document.getElementById('previewSave').onclick=()=>{document.getElementById('previewResult').textContent='Preview memory saved: '+JSON.stringify(blocks)};
 document.getElementById('previewTheme').onclick=()=>document.body.classList.toggle('dark');
 document.getElementById('previewDiscovery').onclick=()=>{failDiscovery=!failDiscovery;document.getElementById('previewResult').textContent=failDiscovery?'Discovery will fail until toggled again.':'Discovery restored.'};
 window.addEventListener('load',()=>api.dispatchEvent(new Event('ready')),{once:true});
})();
</script>`;
const allowed = new Map([['/settings.css', ['settings.css', 'text/css']], ['/settings-state.js', ['settings-state.js', 'text/javascript']], ['/settings-ui.js', ['settings-ui.js', 'text/javascript']]]);
// Check the generated adapter, not just the template literal or production files.
const rendered = adapter + await readFile(new URL('index.html', publicPath), 'utf8');
for (const [, code] of rendered.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (code.trim()) new Script(code);
const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && ['/__preview/validate', '/__preview/migrate'].includes(request.url)) {
      let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 128 * 1024) throw new Error('Preview request too large'); }
      const payload = JSON.parse(body);
      const result = request.url === '/__preview/migrate' ? migrateEarlyNotificationConfig(payload.config) : validator.validate(payload);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(result)); return;
    }
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blink settings · local synthetic preview</title></head><body>${adapter}${await readFile(new URL('index.html', publicPath), 'utf8')}</body></html>`); return;
    }
    const asset = allowed.get(request.url);
    if (!asset) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', asset[1]); response.end(await readFile(new URL(asset[0], publicPath)));
  } catch { response.writeHead(400).end('Preview request failed.'); }
});
if (process.argv[2] === '--check') {
  if (!validator.validate({ revision: 0, config: initialConfig }).valid) throw new Error('Invalid synthetic preview settings.');
  const moduleSettings = { ...initialConfig, syncModuleFeedLimits: [{ syncModuleId: inventory.syncModules[0].id, maxFeeds: 1 }] };
  if (!validator.validate({ revision: 1, config: moduleSettings }).valid) throw new Error('Invalid synthetic preview Sync Module feed limit.');
  console.log('Generated preview and production inline scripts parse; initial settings and module feed limits pass canonical validation. No server started.');
}
else {
  const port = Number(process.argv[2] || 8766);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose an unprivileged preview port.');
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic UI preview: http://127.0.0.1:${port}/ (source: ${fileURLToPath(publicPath)})`));
}
