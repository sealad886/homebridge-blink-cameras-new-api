'use strict';

const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const process = require('node:process');

const LIMITS = Object.freeze({ inputBytes: 32 * 1024 * 1024, preparedBytes: 32 * 1024 * 1024,
  snapshotBytes: 2 * 1024 * 1024, scratchBytes: 128 * 1024 * 1024 });

function admitLocalClip(file, inputRoot) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !path.isAbsolute(inputRoot) || file.includes('\0')) throw new Error('Local clip rejected');
  const root = fs.realpathSync(inputRoot);
  const directory = fs.lstatSync(root);
  const resolved = path.join(fs.realpathSync(path.dirname(path.resolve(file))), path.basename(file));
  if (!directory.isDirectory() || directory.uid !== process.getuid() || directory.mode & 0o077 ||
      path.relative(root, resolved).startsWith('..') || path.dirname(resolved) !== root ||
      path.extname(resolved).toLowerCase() !== '.mp4') throw new Error('Local clip rejected');
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077 || stat.size < 1 || stat.size > LIMITS.inputBytes) {
    throw new Error('Local clip rejected');
  }
  const descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(descriptor);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) throw new Error('Local clip changed');
  } finally { fs.closeSync(descriptor); }
  return { file: resolved, bytes: stat.size };
}

/** Manual controls only. The production delegate owns media, HDS and motion timing. */
class DiagnosticReplay {
  constructor({ RecordingDelegate, prepare, motion = () => {}, report = () => {} }) {
    this.prepare = prepare; this.report = report; this.serial = 0; this.revision = 0; this.stopped = false;
    this.delegate = new RecordingDelegate(async () => {
      report('live_source_rejected'); throw new Error('Saved-clip diagnostic cannot start a live feed');
    }, {
      source: 'saved-clips',
      replayMotion: (active, metadata) => {
        motion(active); report(active ? 'motion_triggered' : 'motion_cleared', { ...metadata, homeRetention: 'unconfirmed' });
      },
      status: status => report('recording_state', { ...status }),
      policyChanged: () => this.policyChanged(),
    });
    this.policy = this.delegate.getPolicySnapshot();
  }
  get status() {
    const policy = this.delegate.getPolicySnapshot();
    return { recordingActive: policy.permission.recordingActive, cameraActive: policy.permission.cameraActive,
      audioActive: policy.permission.audioActive, configured: !!policy.configuration.value,
      ready: !!this.prepared, preparing: !!this.preparing, busy: !!this.delivery,
      phase: this.delegate.status.state, homeRetention: 'unconfirmed' };
  }
  get snapshot() { return this.preview; }
  allowed() {
    const policy = this.delegate.getPolicySnapshot();
    return !this.stopped && policy.permission.recordingActive && policy.permission.cameraActive && !!policy.configuration.value;
  }
  discardPrepared() {
    this.prepared?.prepared.dispose(); this.prepared = undefined;
    this.preview?.fill(0); this.preview = undefined;
  }
  policyChanged() {
    const next = this.delegate.getPolicySnapshot();
    if (this.policy && next.permission.epoch === this.policy.permission.epoch &&
        next.configuration.revision === this.policy.configuration.revision) return;
    this.policy = next; this.revision++; this.preparing?.abort(); this.discardPrepared();
  }
  updateRecordingConfiguration(configuration) {
    this.delegate.updateRecordingConfiguration(configuration);
    this.report('configuration', { configured: !!this.delegate.getPolicySnapshot().configuration.value });
  }
  updateRecordingActive(active) { this.delegate.updateRecordingActive(active === true); this.report('recording_permission', { active: active === true }); }
  setCameraActive(active) { this.delegate.setCameraActive(active === true); this.report('camera_permission', { active: active === true }); }
  setAudioActive(active) { this.delegate.setAudioActive(active === true); this.report('audio_permission', { active: active === true }); }

  async load(file, metadata = {}) {
    if (!this.allowed() || this.delivery || this.preparing) throw new Error('Recording preparation unavailable');
    if (metadata.label !== undefined && (typeof metadata.label !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(metadata.label))) throw new Error('Clip label rejected');
    if (typeof metadata.capturedAt !== 'string' || !Number.isFinite(Date.parse(metadata.capturedAt))) throw new Error('Capture time rejected');
    this.discardPrepared();
    const revision = ++this.revision, policy = this.delegate.getPolicySnapshot();
    const controller = new globalThis.AbortController(); this.preparing = controller;
    this.report('prepare_started', { label: metadata.label, capturedAt: metadata.capturedAt });
    let result, task;
    try {
      task = Promise.resolve(this.prepare(file, globalThis.structuredClone(policy.configuration.value), policy.permission.audioActive, controller.signal));
      this.preparingTask = task; result = await task;
      if (controller.signal.aborted || revision !== this.revision || !this.allowed()) throw new Error('Recording preparation cancelled');
      if (!result?.prepared || result.prepared.disposed || !Buffer.isBuffer(result.snapshot) || result.snapshot.length > LIMITS.snapshotBytes) {
        throw new Error('Canonical recording preparation unavailable');
      }
      this.prepared = result; this.preview = result.snapshot; this.selectedPolicy = policy;
      this.metadata = { label: metadata.label, capturedAt: metadata.capturedAt, jobKey: `diagnostic:${++this.serial}`,
        cameraKey: 'diagnostic:camera', clipIdentity: result.prepared.sourceSha256 };
      this.report('prepared', { ...this.metadata, fragments: result.prepared.fragments.length,
        preparedSpanUpperBoundUs: result.prepared.preparedSpanUpperBoundUs.toString(),
        durationSource: 'native-prepared-span-upper-bound', summary: result.prepared.summary,
        inputSha256: result.prepared.sourceSha256, preparedSha256: result.prepared.preparedSha256,
        provenance: result.provenance });
      return this.status;
    } catch (error) { result?.prepared?.dispose(); result?.snapshot?.fill(0); throw error; }
    finally {
      if (this.preparing === controller) this.preparing = undefined;
      if (this.preparingTask === task) this.preparingTask = undefined;
    }
  }
  trigger(options = {}) {
    if (!options || Object.keys(options).length) throw new Error('Canonical delivery has no pacing or motion-hold controls');
    if (!this.allowed() || !this.prepared || this.preparing || this.delivery) throw new Error('Recording event unavailable');
    const loaded = this.prepared; this.prepared = undefined;
    const event = { abort: new globalThis.AbortController(), metadata: this.metadata }; this.delivery = event;
    try {
      event.task = Promise.resolve(this.delegate.deliverSavedClip(loaded.prepared, event.metadata, this.selectedPolicy, event.abort.signal))
        .catch(() => ({ status: 'uncertain' }))
        .then(result => { this.report('delivery_result', { ...event.metadata, ...result, homeRetention: 'unconfirmed' }); return result; })
        .finally(() => { loaded.prepared.dispose(); if (this.delivery === event) this.delivery = undefined; });
    } catch (error) { loaded.prepared.dispose(); this.delivery = undefined; throw error; }
  }
  async *handleRecordingStreamRequest(streamId) {
    this.report('hds_requested', { ...this.delivery?.metadata, streamId });
    for await (const packet of this.delegate.handleRecordingStreamRequest(streamId)) {
      if (packet.isLast) this.report('hds_final_packet_offered', { ...this.delivery?.metadata, streamId });
      yield packet;
    }
  }
  acknowledgeStream(streamId) {
    this.delegate.acknowledgeStream(streamId);
    this.report('hds_ack_observed', { ...this.delivery?.metadata, streamId, homeRetention: 'unconfirmed' });
  }
  closeRecordingStream(streamId, reason) {
    this.delegate.closeRecordingStream(streamId, reason);
    this.report('hds_close_observed', { ...this.delivery?.metadata, streamId, reason: Number.isInteger(reason) ? reason : undefined,
      homeRetention: 'unconfirmed' });
  }
  stop() {
    if (!this.stopping) {
      this.stopped = true; this.revision++; this.preparing?.abort(); this.delivery?.abort.abort(); this.discardPrepared();
      this.stopping = Promise.all([this.preparingTask?.catch(() => undefined), this.delivery?.task, this.delegate.stop()]).then(() => undefined);
    }
    return this.stopping;
  }
}

module.exports = { LIMITS, admitLocalClip, DiagnosticReplay };
