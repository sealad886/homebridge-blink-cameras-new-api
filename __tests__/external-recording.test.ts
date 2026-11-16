import type { FileHandle } from 'node:fs/promises';
import { inspectExternalRecording } from '../src/accessories/external-recording';
import { spawnExternalFfmpeg } from '../src/accessories/external-ffmpeg';

jest.mock('../src/accessories/external-ffmpeg', () => ({ ...jest.requireActual('../src/accessories/external-ffmpeg'),
  spawnExternalFfmpeg: jest.fn() }));

it('does not launch a codec when privacy is revoked during the asynchronous source open', async () => {
  const owner = new globalThis.AbortController(), close = jest.fn(async () => undefined);
  const input = { fd: 42, close } as unknown as FileHandle;
  const opening = async () => { await Promise.resolve(); owner.abort(); return input; };
  await expect(inspectExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
    signal: owner.signal, deadline: Date.now() + 1000, open: opening }, 15)).rejects.toThrow();
  expect(spawnExternalFfmpeg).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});
