import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import process from 'node:process';
import { ExternalFfmpegSetupError, probeExternalFfmpeg, type ExternalFfmpegProcessOptions } from '../src/accessories/external-ffmpeg';

const lists: Record<string, string[]> = {
  '-protocols': ['pipe', 'fd'], '-demuxers': ['mpegts', 'mov,mp4,m4a,3gp,3g2,mj2', 'lavfi'],
  '-decoders': ['h264', 'aac', 'aac_latm'],
  '-encoders': ['libx264', 'libopus', 'pcm_alaw', 'pcm_mulaw', 'aac', 'rawvideo', 'pcm_f32le'],
  '-muxers': ['tee', 'data', 'framecrc', 'mp4'], '-bsfs': ['h264_mp4toannexb', 'setts'],
  '-filters': ['scale', 'pad', 'select', 'aresample', 'asetnsamples', 'anullsrc', 'showinfo', 'format', 'settb', 'setpts', 'setsar'],
};
function launchWithout(flagToRemove?: string, nameToRemove?: string, version = '9.0.2'): ExternalFfmpegProcessOptions['launch'] {
  return (_command, args) => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: null,
      kill: () => { child.emit('close', 1); return true; } });
    const flag = args.at(-1)!;
    const bare = flag === '-protocols' || flag === '-bsfs';
    const entries = (lists[flag] ?? []).filter(entry => flag !== flagToRemove || !entry.split(',').includes(nameToRemove!));
    const text = flag === '-version' ? `ffmpeg version ${version} fixture\n` :
      entries.map(entry => bare ? entry : ` ... ${flag === '-demuxers' && entry === 'lavfi' ? 'd ' : ''}${entry} description may mention ${nameToRemove ?? 'anything'}`).join('\n') + '\n';
    globalThis.queueMicrotask(() => { child.stdout.end(text); child.emit('close', 0); });
    return child as unknown as ChildProcess;
  };
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
