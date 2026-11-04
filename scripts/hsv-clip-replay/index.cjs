#!/usr/bin/env node
'use strict';

/** Explicitly launched diagnostic only; never imported or installed by the plugin. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const process = require('node:process');
const readline = require('node:readline');
const { randomBytes, randomInt, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { DiagnosticReplay } = require('./core.cjs');
const { createPreparer } = require('./prepare.cjs');

function argumentsFor(argv) {
  const options = { interface: 'en0', port: 53632, name: 'Blink Clip Replay Test',
    'hap-root': path.resolve(path.dirname(require.resolve('./index.cjs')), '../../node_modules/@homebridge/hap-nodejs') };
  const accepted = ['workspace', 'input-root', 'plugin-root', 'hap-root', 'preview', 'preview-sha256', 'qualification-worker', 'qualification-worker-sha256', 'interface', 'port', 'name'];
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    if (!argv[index]?.startsWith('--') || !accepted.includes(key) || !argv[index + 1]) throw new Error('Invalid diagnostic arguments');
    options[key] = argv[index + 1];
  }
  for (const key of ['workspace', 'plugin-root', 'hap-root', 'preview']) {
    if (!options[key] || !path.isAbsolute(options[key])) throw new Error('Absolute diagnostic paths required');
  }
  if (!/^[a-f0-9]{64}$/.test(options['preview-sha256'] ?? '') ||
      !!options['qualification-worker'] !== !!options['qualification-worker-sha256'] ||
      (options['qualification-worker'] && (!path.isAbsolute(options['qualification-worker']) || !/^[a-f0-9]{64}$/.test(options['qualification-worker-sha256'])))) {
    throw new Error('Explicit preview and qualification identities required');
  }
  if (typeof options.name !== 'string' || !options.name.trim() || options.name.length > 64 || /[\x00-\x1f\x7f]/.test(options.name)) throw new Error('Diagnostic name rejected');
  options['input-root'] ??= path.join(options.workspace, 'inputs');
  if (!path.isAbsolute(options['input-root']) || !Number.isInteger(Number(options.port)) || Number(options.port) < 1024 || Number(options.port) > 65535) {
    throw new Error('Invalid diagnostic arguments');
  }
  const records = os.networkInterfaces()[options.interface];
  if (!records?.some(record => record.family === 'IPv4' && !record.internal &&
      (/^10\./.test(record.address) || /^192\.168\./.test(record.address) || /^172\.(1[6-9]|2\d|3[01])\./.test(record.address)))) {
    throw new Error('An active explicit private LAN interface is required');
  }
  return options;
}

function admitHapManifest(manifest) {
  if (!manifest || !((manifest.name === 'hap-nodejs' && manifest.version === '0.14.0') ||
      (manifest.name === '@homebridge/hap-nodejs' && manifest.version === '2.3.1-beta.0') ||
      (manifest.name === '@homebridge/hap-nodejs' && manifest.version === '2.3.0'))) {
    throw new Error('Explicitly qualified HAP identity required');
  }
}

function createEvidenceReporter(descriptor, output = process.stdout) {
  return (event, details = {}) => {
    const line = JSON.stringify({ ...details, at: new Date().toISOString(), event });
    fs.writeSync(descriptor, line + '\n'); output.write(line + '\n');
  };
}

function createCommandInput({ input, replay, shutdown, report }) {
  const lines = readline.createInterface({ input, terminal: false });
  let operations = Promise.resolve(), stopping = false, finished;
  const stop = () => {
    if (!finished) {
      stopping = true;
      // Abort synchronously; close resources only after the cancelled operation retires.
      const retiring = replay.stop();
      finished = Promise.all([retiring, operations]).then(shutdown);
      lines.close();
    }
    return finished;
  };
  lines.on('line', line => {
    if (stopping) return;
    if (line.length > 4096) { report('command_rejected'); return; }
    if (commandName(line) === 'stop') { void stop(); return; }
    operations = operations.then(async () => {
      if (stopping) return;
      try {
        const command = JSON.parse(line);
        if (command.command === 'status') report('status', replay.status);
        else if (command.command === 'load') {
          await replay.load(command.file, { label: command.label, capturedAt: command.capturedAt });
          if (!stopping) report('status', replay.status);
        } else if (command.command === 'trigger') {
          if (Object.keys(command).some(key => key !== 'command')) throw new Error('Trigger controls rejected');
          replay.trigger();
        }
        else throw new Error('Command rejected');
      } catch {
        if (!stopping) report('command_failed', { command: ['status', 'load', 'trigger'].includes(commandName(line)) ? commandName(line) : 'invalid' });
      }
    });
  });
  lines.on('close', () => { void stop(); });
  return { stop };
}

function configureReplayCamera({ hap, accessory, recordingOptions, RecordingDelegate, prepare, report }) {
  const motion = new hap.Service.MotionSensor('Clip Replay Motion');
  accessory.addService(motion);
  const replay = new DiagnosticReplay({ RecordingDelegate, prepare, report,
    motion: active => motion.updateCharacteristic(hap.Characteristic.MotionDetected, active) });
  const controller = new hap.CameraController({ cameraStreamCount: 1,
    delegate: {
      handleSnapshotRequest: (_request, callback) => {
        const jpeg = replay.snapshot;
        if (!jpeg?.length) callback(new Error('Local preview not prepared'));
        else callback(undefined, jpeg);
      },
      prepareStream: (_request, callback) => callback(new Error('Recording-only diagnostic')),
      handleStreamRequest: (_request, callback) => callback(new Error('Recording-only diagnostic')),
    },
    streamingOptions: { supportedCryptoSuites: [hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
      video: { codec: { profiles: [0, 1, 2], levels: [0, 1, 2] }, resolutions: recordingOptions.video.resolutions } },
    recording: { options: recordingOptions, delegate: replay }, sensors: { motion },
  });
  accessory.configureController(controller);
  const management = controller.recordingManagement;
  function bind(service, characteristicType, apply) {
    const characteristic = service.getCharacteristic(characteristicType);
    characteristic.on('change', change => apply(Boolean(change.newValue)));
    apply(Boolean(characteristic.value));
  }
  bind(management.recordingManagementService, hap.Characteristic.RecordingAudioActive, active => replay.setAudioActive(active));
  bind(management.operatingModeService, hap.Characteristic.HomeKitCameraActive, active => replay.setCameraActive(active));
  return { replay, motion, controller };
}

async function main() {
  process.umask(0o077);
  const options = argumentsFor(process.argv.slice(2));
  const workspace = fs.realpathSync(options.workspace);
  const stat = fs.lstatSync(workspace);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || stat.mode & 0o077) throw new Error('Owner-only diagnostic workspace required');
  const published = createRequire(path.join(options['plugin-root'], 'package.json'));
  const packageManifest = published('./package.json');
  if (packageManifest.name !== '@sealad886/homebridge-blink-cameras-new-api') throw new Error('Published plugin package required');
  const { createRecordingOptions, BlinkCameraRecordingDelegate } = published('./dist/accessories/camera-recording.js');
  const prepare = createPreparer({ pluginRoot: options['plugin-root'], inputRoot: options['input-root'], workspace,
    preview: options.preview, previewSha256: options['preview-sha256'],
    qualificationWorker: options['qualification-worker'], qualificationWorkerSha256: options['qualification-worker-sha256'] });
  const stateDirectory = path.join(workspace, 'hap-state');
  fs.mkdirSync(stateDirectory, { mode: 0o700, recursive: true });
  const stateStat = fs.lstatSync(stateDirectory);
  if (!stateStat.isDirectory() || stateStat.uid !== process.getuid() || stateStat.mode & 0o077) throw new Error('Owner-only pairing storage required');
  const lock = path.join(stateDirectory, 'running.pid');
  fs.writeFileSync(lock, String(process.pid), { mode: 0o600, flag: 'wx' });
  const evidence = fs.openSync(path.join(workspace, 'replay-events.jsonl'), 'a', 0o600);
  const report = createEvidenceReporter(evidence);
  const identityFile = path.join(stateDirectory, 'identity.json');
  let identity;
  if (fs.existsSync(identityFile)) {
    const identityStat = fs.lstatSync(identityFile);
    if (!identityStat.isFile() || identityStat.uid !== process.getuid() || identityStat.mode & 0o077) throw new Error('Pairing identity rejected');
    identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
  } else {
    const mac = randomBytes(6); mac[0] = 0x02;
    const digits = String(randomInt(10000000, 99999999));
    identity = { id: randomUUID(), username: [...mac].map(value => value.toString(16).padStart(2, '0')).join(':').toUpperCase(),
      pincode: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`, setupID: randomBytes(2).toString('hex').toUpperCase() };
    fs.writeFileSync(identityFile, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
  }
  const hap = require(options['hap-root']);
  const hapManifest = require(path.join(options['hap-root'], 'package.json'));
  admitHapManifest(hapManifest);
  hap.HAPStorage.setCustomStoragePath(stateDirectory);
  const accessory = new hap.Accessory(options.name, hap.uuid.generate(`blink-hsv-replay:${identity.id}`));
  accessory.getService(hap.Service.AccessoryInformation)
    .setCharacteristic(hap.Characteristic.Manufacturer, 'Local diagnostic')
    .setCharacteristic(hap.Characteristic.Model, 'Saved clip HSV prototype')
    .setCharacteristic(hap.Characteristic.SerialNumber, identity.id)
    .setCharacteristic(hap.Characteristic.FirmwareRevision, 'canonical-diagnostic');
  const { replay } = configureReplayCamera({ hap, accessory, recordingOptions: createRecordingOptions(), RecordingDelegate: BlinkCameraRecordingDelegate, prepare, report });
  accessory.on('paired', () => report('paired'));
  accessory.on('unpaired', () => { replay.stop(); report('unpaired'); });
  accessory.on('listening', () => report('listening', { port: Number(options.port), interface: options.interface, hapName: hapManifest.name, hapVersion: hapManifest.version }));
  accessory.on('identify', (_paired, callback) => callback());
  let shuttingDown;
  const shutdown = () => {
    if (shuttingDown) return shuttingDown;
    shuttingDown = (async () => {
      await replay.stop(); await accessory.unpublish();
      fs.unlinkSync(lock); report('stopped'); fs.closeSync(evidence);
    })();
    return shuttingDown;
  };
  const commands = createCommandInput({ input: process.stdin, replay, shutdown, report });
  process.once('SIGINT', () => { void commands.stop().finally(() => process.exit()); });
  process.once('SIGTERM', () => { void commands.stop().finally(() => process.exit()); });
  report('starting', { name: options.name, pairingDetails: 'hap-state/identity.json',
    pluginVersion: packageManifest.version, source: packageManifest.gitHead, hapName: hapManifest.name, hapVersion: hapManifest.version,
    mediaAuthority: 'canonical-preparer-and-recording-delegate',
    worker: options['qualification-worker'] ? 'explicit-host-qualification' : 'verified-package',
    note: 'Recording-only diagnostic; HDS delivery is not proof of Apple Home retention' });
  try {
    await accessory.publish({ username: identity.username, pincode: identity.pincode, setupID: identity.setupID,
      category: hap.Categories.IP_CAMERA, port: Number(options.port), bind: options.interface, advertiser: 'ciao', addIdentifyingMaterial: false });
    fs.writeFileSync(path.join(stateDirectory, 'setup-uri.txt'), accessory.setupURI() + '\n', { mode: 0o600 });
  } catch (error) { await commands.stop(); throw error; }
}

function commandName(line) { try { return JSON.parse(line).command; } catch { return undefined; } }

if (require.main === module) main().catch(() => { process.stderr.write('Replay diagnostic failed; inspect its private event evidence.\n'); process.exitCode = 1; });
module.exports = { argumentsFor, createEvidenceReporter, createCommandInput, configureReplayCamera, admitHapManifest };
