import { isAbsolute, resolve } from 'node:path';
import { configuredFfmpegPath } from '../src/accessories/ffmpeg-config';

describe('external FFmpeg configuration', () => {
  it('defaults to a PATH executable and preserves an explicit name or absolute path', () => {
    const filename = resolve('directory with spaces', 'ffmpeg');
    expect(isAbsolute(filename)).toBe(true);
    expect(configuredFfmpegPath(undefined)).toBe('ffmpeg');
    expect(configuredFfmpegPath('ffmpeg-custom')).toBe('ffmpeg-custom');
    expect(configuredFfmpegPath(filename)).toBe(filename);
  });

  it.each([null, false, 1, '', '   ', 'ffmpeg\0', '../ffmpeg', './ffmpeg', 'tools/ffmpeg', 'x'.repeat(4097)])(
    'rejects an invalid path without including its value in diagnostics', value => {
      expect(() => configuredFfmpegPath(value)).toThrow('Use an FFmpeg executable name from PATH or an absolute executable path.');
    });
});
