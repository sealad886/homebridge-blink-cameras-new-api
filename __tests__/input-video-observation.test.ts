import { InputVideoObserver } from '../src/accessories/input-video-observation';
import { BlinkCameraSource } from '../src/accessories/camera-source';
import { BlinkApi } from '../src/blink-api';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { createHap } from './helpers/homebridge';
import { HAP } from 'homebridge';

jest.mock('node:child_process', () => ({ spawn: jest.fn(() => {
  const child = new EventEmitter() as any;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = jest.fn(() => { child.emit('close', 0, null); return true; });
  return child;
}) }));

describe('Observed input video quality', () => {
  it.each([[1920, 1080, 30], [2560, 1440, 29.97], [1920, 1920, 15]])(
    'captures input %ix%i at %s fps and preserves the first observation', (width, height, fps) => {
      const observer = new InputVideoObserver();
      observer.observe("Input #0, mpegts, from 'pipe:0':");
      expect(observer.observe(`  Stream #0:0[0x100], 17: Video: h264 (High), yuv420p, ${width}x${height}, ${fps} fps, 90k tbn`))
        .toEqual({ width, height, fps });
      expect(observer.observe('Stream #0:1: Video: h264, 640x360, 15 fps')).toBeUndefined();
    });

  it('rejects output geometry and invalid or oversized descriptors', () => {
    const observer = new InputVideoObserver();
    expect(observer.observe('Stream #0:0: Video: h264, 1280x720, 30 fps')).toBeUndefined();
    observer.observe('Input #0, mpegts, from pipe:0:');
    expect(observer.observe('Stream #0:0: Video: h264, 9999x9999, 30 fps')).toBeUndefined();
    expect(observer.observe('Stream #0:0: Video: h264, 1920x1080, 0 fps')).toBeUndefined();
    expect(observer.observe(`Stream #0:0: Video: h264, 1920x1080, 30 fps ${'x'.repeat(65536)}`)).toBeUndefined();
    observer.observe('Stream mapping:');
    expect(observer.observe('Stream #0:0: Video: h264, 1280x720, 30 fps')).toBeUndefined();
    observer.observe('Output #0, rtp, to destination:');
    expect(observer.observe('Stream #0:0: Video: h264, 1280x720, 30 fps')).toBeUndefined();
  });

  it('can retain input dimensions when the demuxer does not report frame rate', () => {
    const observer = new InputVideoObserver();
    observer.observe('Input #0, mpegts, from pipe:0:');
    expect(observer.observe('Stream #0:0: Video: h264, yuv420p, 2560x1440, 90k tbn'))
      .toEqual({ width: 2560, height: 1440 });
  });

  it('observes fragmented input descriptors with debug disabled and ignores retired children', async () => {
    const observed = jest.fn();
    const api = { startCameraLiveview: jest.fn().mockResolvedValue({ server: 'rtsps://example.test/stream' }) };
    const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => undefined, () => true, jest.fn(), { audio: { enabled: false }, ffmpegDebug: false },
      jest.fn(), undefined, observed);
    const request = { sessionID: 'input-observation', targetAddress: '127.0.0.1', addressVersion: 'ipv4',
      video: { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) } } as any;
    await new Promise<void>((resolve, reject) => source.prepareStream(request, (error) => error ? reject(error) : resolve()));
    source.handleStreamRequest({ type: 'start', sessionID: request.sessionID,
      video: { width: 640, height: 360, fps: 15, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 } } as any, jest.fn());
    await new Promise(resolve => setImmediate(resolve));
    const child = (spawn as jest.Mock).mock.results.at(-1)!.value;
    child.stderr.emit('data', Buffer.from("Input #0, mpegts, from 'pipe:0':\n  Stream #0:0: Video: h264, 2560x"));
    expect(observed).not.toHaveBeenCalled();
    child.stderr.emit('data', Buffer.from('1440, 30 fps\nOutput #0, rtp, to destination:\nStream #0:0: Video: h264, 640x360, 15 fps\n'));
    expect(observed).toHaveBeenCalledWith({ width: 2560, height: 1440, fps: 30 });
    await new Promise<void>(resolve => source.handleStreamRequest({ type: 'stop', sessionID: request.sessionID } as any, () => resolve()));
    child.stderr.emit('data', Buffer.from('Input #0, mpegts, from pipe:0:\nStream #0:0: Video: h264, 1920x1080, 30 fps\n'));
    expect(observed).toHaveBeenCalledTimes(1);
  });

  it('STOP during input configuration prevents a later vendor liveview allocation', async () => {
    let finish!: () => void;
    const configure = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const api = { startCameraLiveview: jest.fn() };
    const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => undefined, () => true, jest.fn(), { audio: { enabled: false } }, jest.fn(), configure);
    const prepare = { sessionID: 'input-cancellation', targetAddress: '127.0.0.1', addressVersion: 'ipv4',
      video: { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) } } as any;
    await new Promise<void>((resolve, reject) => source.prepareStream(prepare, error => error ? reject(error) : resolve()));
    source.handleStreamRequest({ type: 'start', sessionID: prepare.sessionID,
      video: { width: 640, height: 360, fps: 15, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 } } as any, jest.fn());
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.anything(), deadline: expect.any(Number) }));
    await new Promise<void>(resolve => source.handleStreamRequest({ type: 'stop', sessionID: prepare.sessionID } as any, () => resolve()));
    finish();
    await new Promise(resolve => setImmediate(resolve));
    expect(api.startCameraLiveview).not.toHaveBeenCalled();
  });
});
