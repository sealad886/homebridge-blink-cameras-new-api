import { Buffer } from 'node:buffer';
import { test } from '@jest/globals';
import * as hap from 'hap-nodejs';
import type { HAP, PlatformAccessory } from 'homebridge';
import { OwlAccessory } from '../src/accessories/owl';
import { DoorbellAccessory } from '../src/accessories/doorbell';
import { BlinkCameraSource, resolveStreamingConfig } from '../src/accessories/camera-source';
import { startRecordingSession } from '../src/accessories/recording-session';
import { BlinkCameraRecordingDelegate, type RecordingSessionCallbacks } from '../src/accessories/camera-recording';
import type { BlinkCamerasPlatform } from '../src/platform';
import { createLogger } from './helpers/homebridge';

jest.mock('../src/accessories/recording-session', () => ({ startRecordingSession: jest.fn() }));
jest.mock('timers', () => ({ ...jest.requireActual('timers'),
  setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(timer),
  setImmediate: (callback: () => void) => globalThis.setImmediate(callback),
}));

const tick = async () => { for (let n = 0; n < 24; n++) await Promise.resolve(); };
function box(name: string): Buffer { const data = Buffer.alloc(8); data.writeUInt32BE(8); data.write(name, 4, 'ascii'); return data; }
function integer(value: number, bytes = 4): Buffer {
  const data = Buffer.alloc(bytes);
  if (bytes === 8) data.writeBigUInt64LE(BigInt(value)); else data.writeUIntLE(value, 0, bytes);
  return data;
}

// HomeKit's selected recording TLV is written through the real HAP characteristic,
// rather than calling the implementation's delegate setters directly.
function selectedConfiguration(triggers = 1): string {
  const recording = hap.encode(1, integer(4000), 2, integer(triggers, 8), 3,
    hap.encode(1, 0, 2, hap.encode(1, integer(4000))));
  const video = hap.encode(1, 0, 2, hap.encode(1, 0, 2, 0, 3, integer(500), 4, integer(1000)),
    3, hap.encode(1, integer(640, 2), 2, integer(360, 2), 3, 15));
  const audio = hap.encode(1, 0, 2, hap.encode(1, 1, 2, 0, 3, 1, 4, integer(32)));
  return hap.encode(1, recording, 2, video, 3, audio).toString('base64');
}

function fixture(hksvEnabled = true, kind: 'camera' | 'doorbell' = 'camera') {
  const sessions: Array<{ callbacks: RecordingSessionCallbacks; audio: boolean; signal: globalThis.AbortSignal; stop: jest.Mock }> = [];
  jest.mocked(startRecordingSession).mockImplementation(async (_subscribe, _configuration, audio, callbacks, signal) => {
    let close!: () => void; const whenClosed = new Promise<void>(resolve => { close = resolve; });
    const stop = jest.fn(async () => { close(); }); sessions.push({ callbacks, audio, signal, stop }); return { whenClosed, stop };
  });
  const platform = {
    Service: hap.Service, Characteristic: hap.Characteristic, api: { hap: hap as unknown as HAP, updatePlatformAccessories: jest.fn() },
    apiClient: {}, log: createLogger(), streamingConfig: resolveStreamingConfig(),
    isHksvEnabled: () => hksvEnabled, isOperational: () => true, getDeviceInputQuality: () => 'auto', getDeviceMotionTimeout: () => 1000,
    isNetworkArmed: jest.fn().mockReturnValue(true),
  } as unknown as BlinkCamerasPlatform;
  const accessory = Object.assign(new hap.Accessory('Test Camera', hap.uuid.generate(`hksv-${hksvEnabled}`)), { context: {} });
  const configure = jest.spyOn(accessory, 'configureController');
  const device = { id: 2, network_id: 1, name: 'Test Camera', enabled: true, status: 'online', serial: 'fixture' };
  const Handler = kind === 'doorbell' ? DoorbellAccessory : OwlAccessory;
  const handler = new Handler(platform, accessory as unknown as PlatformAccessory, device);
  const controller = configure.mock.calls[0][0] as hap.CameraController;
  const management = controller.recordingManagement;
  const motion = accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')!;
  const activate = async (triggers = 1) => {
    await management!.recordingManagementService.getCharacteristic(hap.Characteristic.SelectedCameraRecordingConfiguration)
      .handleSetRequest(selectedConfiguration(triggers));
    await management!.recordingManagementService.getCharacteristic(hap.Characteristic.Active).handleSetRequest(true);
    await tick();
  };
  const warm = async () => {
    const current = sessions.at(-1)!; current.callbacks.initialization(Buffer.concat([box('ftyp'), box('moov')]));
    for (let sequence = 0; sequence < 4; sequence++) await current.callbacks.fragment({ sequence,
      startUs: BigInt(sequence) * 1000000n, durationUs: 1000000n, keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
  };
  return { handler, accessory, controller, management, motion, sessions, activate, warm, device, platform };
}

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.clearAllTimers(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('an accessory outside the opt-in has no recording services or recording capture', async () => {
  const f = fixture(false); await tick();
  expect(f.controller.recordingManagement).toBeUndefined();
  expect(f.accessory.getService(hap.Service.CameraRecordingManagement)).toBeUndefined();
  expect(startRecordingSession).not.toHaveBeenCalled(); f.handler.triggerMotion();
  expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(true);
  await f.handler.shutdown();
});

test('opt-in links the existing motion service and remains inactive until HomeKit selects and enables recording', async () => {
  const f = fixture(); await tick();
  expect(f.accessory.services.filter(s => s.UUID === hap.Service.MotionSensor.UUID)).toHaveLength(1);
  expect(f.management!.recordingManagementService.linkedServices).toContain(f.motion);
  expect(f.management!.sensorServices).toContain(f.motion); expect(startRecordingSession).not.toHaveBeenCalled();
  await f.activate(); expect(startRecordingSession).toHaveBeenCalledTimes(1); expect(f.sessions[0].audio).toBe(false);
  await f.handler.shutdown();
});

test('native video motion publishes a pinned event only after warmup and while Blink motion is armed and enabled', async () => {
  const f = fixture(); expect(f.handler.usesVideoMotion()).toBe(false);
  await f.activate(); expect(f.handler.usesVideoMotion()).toBe(true);
  const session = f.sessions[0];
  session.callbacks.motion({ atUs: 1000000, score: 100 });
  expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(false);
  await f.warm();
  jest.mocked(f.platform.isNetworkArmed).mockReturnValue(false);
  session.callbacks.motion({ atUs: 4000000, score: 100 });
  expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(false);
  jest.mocked(f.platform.isNetworkArmed).mockReturnValue(true);
  f.handler.updateState({ ...f.device, enabled: false });
  session.callbacks.motion({ atUs: 5000000, score: 100 });
  expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(false);
  f.handler.updateState(f.device);
  let pinned = false;
  f.motion.getCharacteristic(hap.Characteristic.MotionDetected).on('change', change => {
    if (change.newValue) pinned = (f.management!.delegate as BlinkCameraRecordingDelegate).status.state === 'recording';
  });
  session.callbacks.motion({ atUs: 6000000, score: 100 });
  expect(pinned).toBe(true); expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(true);
  await jest.advanceTimersByTimeAsync(800); session.callbacks.motion({ atUs: 7000000, score: 100 });
  await jest.advanceTimersByTimeAsync(800); expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(true);
  jest.mocked(f.platform.isNetworkArmed).mockReturnValue(false); f.handler.updateAvailability();
  expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(false);
  await f.handler.shutdown();
});

test('motion pins the prebuffer before the real HAP motion characteristic notifies recording consumers', async () => {
  const f = fixture(); await f.activate(); await f.warm();
  const recording = f.management!.delegate as BlinkCameraRecordingDelegate;
  let readyAtNotification = false; let stream: AsyncGenerator<hap.RecordingPacket> | undefined;
  f.motion.getCharacteristic(hap.Characteristic.MotionDetected).on('change', change => {
    if (change.newValue) { readyAtNotification = recording.status.state === 'recording'; stream = recording.handleRecordingStreamRequest(7); }
  });
  f.handler.triggerMotion(1000); expect(readyAtNotification).toBe(true);
  const first = await stream!.next(); expect(first.value.data).toEqual(Buffer.concat([box('ftyp'), box('moov')]));
  expect(first.value.isLast).toBe(false);
  for (let n = 0; n < 4; n++) await stream!.next();
  await jest.advanceTimersByTimeAsync(1000); expect(f.motion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(false);
  await f.sessions[0].callbacks.fragment({ sequence: 4, startUs: 4000000n, durationUs: 1000000n,
    keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
  expect((await stream!.next()).value.isLast).toBe(true);
  recording.acknowledgeStream(7); await f.handler.shutdown();
});

test('HomeKitCameraActive on the operating-mode service aborts capture and erases retained recording bytes', async () => {
  const cameraPrivacy = jest.spyOn(BlinkCameraSource.prototype, 'setCameraActive');
  const f = fixture(); await f.activate(); await f.warm(); f.handler.triggerMotion();
  const recording = f.management!.delegate as BlinkCameraRecordingDelegate; const stream = recording.handleRecordingStreamRequest(3);
  const owned = (await stream.next()).value.data as Buffer;
  f.management!.operatingModeService.getCharacteristic(hap.Characteristic.HomeKitCameraActive).updateValue(false);
  expect(cameraPrivacy).toHaveBeenLastCalledWith(false);
  expect(f.sessions[0].signal.aborted).toBe(true); expect(owned.every(byte => byte === 0)).toBe(true);
  await expect(stream.next()).rejects.toThrow('Recording unavailable'); await tick(); expect(f.sessions[0].stop).toHaveBeenCalled();
  expect(startRecordingSession).toHaveBeenCalledTimes(1);
  f.management!.operatingModeService.getCharacteristic(hap.Characteristic.HomeKitCameraActive).updateValue(true);
  await tick(); expect(startRecordingSession).toHaveBeenCalledTimes(2); expect(recording.ready).toBe(false); await f.handler.shutdown();
});

test('RecordingAudioActive is observed on recording management and revocation starts a fresh silent buffer', async () => {
  const f = fixture(); const audio = f.management!.recordingManagementService.getCharacteristic(hap.Characteristic.RecordingAudioActive);
  expect(f.management!.operatingModeService.testCharacteristic(hap.Characteristic.RecordingAudioActive)).toBe(false);
  audio.updateValue(true); await f.activate(); await f.warm(); expect(f.sessions[0].audio).toBe(true);
  f.handler.triggerMotion(); const recording = f.management!.delegate as BlinkCameraRecordingDelegate;
  const stream = recording.handleRecordingStreamRequest(8); const owned = (await stream.next()).value.data as Buffer;
  audio.updateValue(false); expect(f.sessions[0].signal.aborted).toBe(true); expect(owned.every(byte => byte === 0)).toBe(true);
  await tick(); expect(f.sessions.map(s => s.audio)).toEqual([true, false]); expect(recording.ready).toBe(false);
  await expect(stream.next()).rejects.toThrow('Recording unavailable'); await f.handler.shutdown();
});

test('offline device update revokes the recording generation', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.handler.updateState({ ...f.device, status: 'offline' });
  expect(f.sessions[0].signal.aborted).toBe(true); await tick(); expect(f.sessions[0].stop).toHaveBeenCalled();
  expect(startRecordingSession).toHaveBeenCalledTimes(1); await f.handler.shutdown();
});

test('shutdown removes both privacy listeners, clears motion timer and closes camera source plus recording', async () => {
  const sourceStop = jest.spyOn(BlinkCameraSource.prototype, 'shutdown'); const f = fixture(); await f.activate(); await f.warm();
  const audio = f.management!.recordingManagementService.getCharacteristic(hap.Characteristic.RecordingAudioActive);
  const camera = f.management!.operatingModeService.getCharacteristic(hap.Characteristic.HomeKitCameraActive);
  const audioListeners = audio.listenerCount('change'), cameraListeners = camera.listenerCount('change');
  f.handler.triggerMotion(); await f.handler.shutdown();
  expect(f.sessions[0].stop).toHaveBeenCalledTimes(1); expect(sourceStop).toHaveBeenCalledTimes(1);
  expect(audio.listenerCount('change')).toBe(audioListeners - 1); expect(camera.listenerCount('change')).toBe(cameraListeners - 1);
  const recording = f.management!.delegate as BlinkCameraRecordingDelegate;
  const changedAudio = jest.spyOn(recording, 'setAudioActive'), changedCamera = jest.spyOn(recording, 'setCameraActive');
  audio.updateValue(true); camera.updateValue(false); await jest.advanceTimersByTimeAsync(1000);
  expect(changedAudio).not.toHaveBeenCalled(); expect(changedCamera).not.toHaveBeenCalled();
  expect(startRecordingSession).toHaveBeenCalledTimes(1); expect(recording.status.state).toBe('off');
});

test('doorbell advertises button trigger and reserves a finite recording before HAP ring notification', async () => {
  const f = fixture(true, 'doorbell'); await f.activate(2); await f.warm();
  const supported = f.management!.recordingManagementService.getCharacteristic(hap.Characteristic.SupportedCameraRecordingConfiguration).value as string;
  expect(hap.decode(Buffer.from(supported, 'base64'))[2].readUInt32LE() & 2).toBe(2);
  const recording = f.management!.delegate as BlinkCameraRecordingDelegate;
  let pinnedBeforeRing = false;
  f.accessory.getService(hap.Service.Doorbell)!.getCharacteristic(hap.Characteristic.ProgrammableSwitchEvent).on('change', () => {
    pinnedBeforeRing = recording.status.state === 'recording';
  });
  (f.handler as DoorbellAccessory).triggerRing(); expect(pinnedBeforeRing).toBe(true);
  const stream = recording.handleRecordingStreamRequest(21); for (let n = 0; n < 5; n++) await stream.next();
  await f.sessions[0].callbacks.fragment({ sequence: 4, startUs: 4000000n, durationUs: 1000000n,
    keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
  expect((await stream.next()).value.isLast).toBe(true); recording.acknowledgeStream(21); await f.handler.shutdown();
});

test('a ring during existing motion preserves recording until the motion event ends', async () => {
  const f = fixture(true, 'doorbell'); await f.activate(3); await f.warm(); f.handler.triggerMotion(1000);
  const recording = f.management!.delegate as BlinkCameraRecordingDelegate;
  const stream = recording.handleRecordingStreamRequest(22); for (let n = 0; n < 5; n++) await stream.next();
  (f.handler as DoorbellAccessory).triggerRing();
  await f.sessions[0].callbacks.fragment({ sequence: 4, startUs: 4000000n, durationUs: 1000000n,
    keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
  expect((await stream.next()).value.isLast).toBe(false); await jest.advanceTimersByTimeAsync(1000);
  await f.sessions[0].callbacks.fragment({ sequence: 5, startUs: 5000000n, durationUs: 1000000n,
    keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
  expect((await stream.next()).value.isLast).toBe(true); recording.acknowledgeStream(22); await f.handler.shutdown();
});
