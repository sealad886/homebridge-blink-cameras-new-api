import { EventEmitter } from 'node:events';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import { ExternalFfmpegSetupError, probeExternalFfmpeg, type ExternalFfmpegProcessOptions } from '../src/accessories/external-ffmpeg';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const lists: Record<string, string[]> = {
  '-protocols': ['pipe', 'fd'], '-demuxers': ['mpegts', 'mov,mp4,m4a,3gp,3g2,mj2', 'lavfi'],
  '-decoders': ['h264', 'aac', 'aac_latm'],
  '-encoders': ['libx264', 'libopus', 'pcm_alaw', 'pcm_mulaw', 'aac', 'rawvideo', 'pcm_f32le'],
  '-muxers': ['tee', 'data', 'framecrc', 'mp4'], '-bsfs': ['h264_mp4toannexb', 'setts'],
  '-filters': ['scale', 'pad', 'select', 'aresample', 'asetnsamples', 'anullsrc', 'showinfo', 'format', 'settb', 'setpts', 'setsar'],
};
function launchWithout(flagToRemove?: string, nameToRemove?: string, version = '9.0.2'): ExternalFfmpegProcessOptions['launch'] {
  return (_command, args) => {
    const child = probeChild();
    const flag = args.at(-1)!;
    const bare = flag === '-protocols' || flag === '-bsfs';
    const entries = (lists[flag] ?? []).filter(entry => flag !== flagToRemove || !entry.split(',').includes(nameToRemove!));
    const text = flag === '-version' ? `ffmpeg version ${version} fixture\n` :
      entries.map(entry => bare ? entry : ` ... ${flag === '-demuxers' && entry === 'lavfi' ? 'd ' : ''}${entry} description may mention ${nameToRemove ?? 'anything'}`).join('\n') + '\n';
    globalThis.queueMicrotask(() => { child.stdout.end(text); child.emit('close', 0); });
    return child as unknown as ChildProcess;
  };
}

function probeChild(exitOnKill = 1) {
  const events = new EventEmitter();
  return Object.assign(events, {
    stdout: new PassThrough(), stderr: new PassThrough(), stdin: null,
    kill: () => { globalThis.queueMicrotask(() => events.emit('close', exitOnKill)); return true; },
  });
}

test('recognizes comma-separated input aliases from capability table names', async () => {
  await expect(probeExternalFfmpeg(process.execPath, process.execPath, undefined, launchWithout())).resolves.toEqual({ version: '9.0' });
});

test.each(['6.1', 'n6.1', 'n6.1.2'])('accepts supported release banner %s', async version => {
  await expect(probeExternalFfmpeg(process.execPath, process.execPath, undefined, launchWithout(undefined, undefined, version)))
    .resolves.toEqual({ version: '6.1' });
});

test.each(['5.1', 'n5.1', '6.0', 'n6.0', 'N-12345-gabcdef'])('rejects unsupported or unversioned banner %s', async version => {
  await expect(probeExternalFfmpeg(process.execPath, process.execPath, undefined, launchWithout(undefined, undefined, version)))
    .rejects.toEqual(new ExternalFfmpegSetupError('version'));
});

test.each(Object.entries(lists).flatMap(([flag, names]) => names.map(name => [flag, name.split(',')[0]])))(
  'rejects missing %s capability %s even when a description mentions it', async (flag, name) => {
    await expect(probeExternalFfmpeg(process.execPath, process.execPath, undefined, launchWithout(flag, name)))
      .rejects.toEqual(new ExternalFfmpegSetupError('capabilities'));
  });

describe('production capability results', () => {
  let directory: string;
  let ffmpeg: string;
  let helper: string;
  const spawnMock = jest.mocked(spawn);

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'blink-capabilities-'));
    ffmpeg = join(directory, 'ffmpeg');
    helper = join(directory, 'helper');
    writeFileSync(ffmpeg, 'ffmpeg fixture');
    writeFileSync(helper, 'helper fixture');
    spawnMock.mockReset().mockImplementation(launchWithout() as typeof spawn);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const newSignal = () => new globalThis.AbortController().signal;

  test('reuses a completed result across signals and reprobes changed tools', async () => {
    await probeExternalFfmpeg(ffmpeg, helper, newSignal());
    expect(spawnMock).toHaveBeenCalledTimes(8);
    await expect(probeExternalFfmpeg(ffmpeg, helper, newSignal())).resolves.toEqual({ version: '9.0' });
    expect(spawnMock).toHaveBeenCalledTimes(8);

    appendFileSync(ffmpeg, '-updated');
    await probeExternalFfmpeg(ffmpeg, helper, newSignal());
    appendFileSync(helper, '-updated');
    await probeExternalFfmpeg(ffmpeg, helper, newSignal());
    expect(spawnMock).toHaveBeenCalledTimes(24);
  });

  test('aborting a pending probe leaves a concurrent inspection and its completed result usable', async () => {
    spawnMock.mockReturnValueOnce(probeChild() as unknown as ChildProcess);
    const cancelled = new globalThis.AbortController();
    const pending = expect(probeExternalFfmpeg(ffmpeg, helper, cancelled.signal)).rejects.toMatchObject({ code: 'probe' });
    const concurrent = probeExternalFfmpeg(ffmpeg, helper, newSignal());
    cancelled.abort();
    await pending;
    await expect(concurrent).resolves.toEqual({ version: '9.0' });
    await expect(probeExternalFfmpeg(ffmpeg, helper, newSignal())).resolves.toEqual({ version: '9.0' });
    expect(spawnMock).toHaveBeenCalledTimes(9);
  });

  test('failed and injected checks cannot supply a cached production result', async () => {
    spawnMock.mockImplementationOnce(launchWithout(undefined, undefined, '5.1') as typeof spawn);
    await expect(probeExternalFfmpeg(ffmpeg, helper)).rejects.toMatchObject({ code: 'version' });
    await expect(probeExternalFfmpeg(ffmpeg, helper, undefined, launchWithout(undefined, undefined, '6.1')))
      .resolves.toEqual({ version: '6.1' });
    await expect(probeExternalFfmpeg(ffmpeg, helper)).resolves.toEqual({ version: '9.0' });
    expect(spawnMock).toHaveBeenCalledTimes(9);
  });

  test('a timed-out inspection cannot report success even if the child exits cleanly', async () => {
    jest.useFakeTimers();
    try {
      const child = probeChild(0);
      spawnMock.mockReturnValueOnce(child as unknown as ChildProcess);
      const result = expect(probeExternalFfmpeg(ffmpeg, helper)).rejects.toMatchObject({ code: 'probe' });
      child.stdout.write('ffmpeg version 9.0.2 fixture\n');
      await jest.runAllTimersAsync();
      await result;
      expect(spawnMock).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });
});
