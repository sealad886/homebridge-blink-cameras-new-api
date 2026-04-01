import { probeVideoEncoder, resetProbeCache } from '../src/accessories/encoder-probe';
import { execFile } from 'node:child_process';

jest.mock('node:child_process');

const mockExecFile = execFile as unknown as jest.Mock;

function makeExecFileImpl(responses: Map<string, { stdout: string; stderr: string; code: number | null }>) {
  return (cmd: string, args: string[], _opts: unknown, cb: (err: { code: number | null } | null, stdout: string, stderr: string) => void) => {
    const key = args.find(a => a.startsWith('h264_')) || (args.includes('-encoders') ? '-encoders' : 'unknown');

    for (const [pattern, response] of responses) {
      if (key.includes(pattern) || args.join(' ').includes(pattern)) {
        if (response.code !== null && response.code !== 0) {
          cb({ code: response.code }, response.stdout, response.stderr);
        } else {
          cb(null, response.stdout, response.stderr);
        }
        return;
      }
    }

    cb({ code: 1 }, '', 'unknown command');
  };
}

describe('encoder-probe', () => {
  const log = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    resetProbeCache();
  });

  it('selects a working hardware encoder from dry-run probes', async () => {
    const responses = new Map([
      ['-encoders', {
        stdout: [
          'Encoders:',
          ' V..... h264_v4l2m2m         V4L2 mem2mem H.264 encoder wrapper (codec h264)',
          ' V..... libx264              libx264 H.264 (codec h264)',
        ].join('\n'),
        stderr: '',
        code: null,
      }],
      ['h264_v4l2m2m', { stdout: '', stderr: '', code: null }],
    ]);

    mockExecFile.mockImplementation(makeExecFileImpl(responses));

    const result = await probeVideoEncoder('ffmpeg', log);

    expect(result.selected).toBe('h264_v4l2m2m');
    expect(result.compiledEncoders).toContain('h264_v4l2m2m');
    expect(result.compiledEncoders).toContain('libx264');
    expect(result.testedEncoders).toEqual([
      { encoder: 'h264_v4l2m2m', available: true },
    ]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Hardware encoder available: h264_v4l2m2m'));
  });

  it('falls back to libx264 when hardware encoder probe fails', async () => {
    const responses = new Map([
      ['-encoders', {
        stdout: [
          'Encoders:',
          ' V..... h264_v4l2m2m         V4L2 mem2mem H.264 encoder wrapper (codec h264)',
          ' V..... libx264              libx264 H.264 (codec h264)',
        ].join('\n'),
        stderr: '',
        code: null,
      }],
      ['h264_v4l2m2m', { stdout: '', stderr: 'Could not find a valid device', code: 234 }],
    ]);

    mockExecFile.mockImplementation(makeExecFileImpl(responses));

    const result = await probeVideoEncoder('ffmpeg', log);

    expect(result.selected).toBe('libx264');
    expect(result.testedEncoders).toEqual([
      { encoder: 'h264_v4l2m2m', available: false },
    ]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not functional'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No working hardware encoder'));
  });

  it('skips encoders not compiled into FFmpeg', async () => {
    const responses = new Map([
      ['-encoders', {
        stdout: [
          'Encoders:',
          ' V..... libx264              libx264 H.264 (codec h264)',
        ].join('\n'),
        stderr: '',
        code: null,
      }],
    ]);

    mockExecFile.mockImplementation(makeExecFileImpl(responses));

    const result = await probeVideoEncoder('ffmpeg', log);

    expect(result.selected).toBe('libx264');
    expect(result.testedEncoders).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No working hardware encoder'));
  });

  it('caches probe results across calls', async () => {
    const responses = new Map([
      ['-encoders', {
        stdout: ' V..... libx264              libx264 H.264 (codec h264)\n',
        stderr: '',
        code: null,
      }],
    ]);

    mockExecFile.mockImplementation(makeExecFileImpl(responses));

    const result1 = await probeVideoEncoder('ffmpeg', log);
    const result2 = await probeVideoEncoder('ffmpeg', log);

    expect(result1).toBe(result2);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('falls back to libx264 when ffmpeg -encoders fails', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
        cb(new Error('ENOENT'), '', '');
      },
    );

    const result = await probeVideoEncoder('ffmpeg', log);

    expect(result.selected).toBe('libx264');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No working hardware encoder'));
  });

  it('tries encoders in priority order and picks first working one', async () => {
    const responses = new Map([
      ['-encoders', {
        stdout: [
          'Encoders:',
          ' V..... h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)',
          ' V..... h264_v4l2m2m         V4L2 mem2mem H.264 encoder wrapper (codec h264)',
          ' V..... libx264              libx264 H.264 (codec h264)',
        ].join('\n'),
        stderr: '',
        code: null,
      }],
      ['h264_videotoolbox', { stdout: '', stderr: 'not available', code: 1 }],
      ['h264_v4l2m2m', { stdout: '', stderr: '', code: null }],
    ]);

    mockExecFile.mockImplementation(makeExecFileImpl(responses));

    const result = await probeVideoEncoder('ffmpeg', log);

    expect(result.selected).toBe('h264_v4l2m2m');
    expect(result.testedEncoders).toEqual([
      { encoder: 'h264_videotoolbox', available: false },
      { encoder: 'h264_v4l2m2m', available: true },
    ]);
  });

  it('resetProbeCache clears the cached result', async () => {
    const responses = new Map([
      ['-encoders', {
        stdout: ' V..... libx264              libx264 H.264 (codec h264)\n',
        stderr: '',
        code: null,
      }],
    ]);

    mockExecFile.mockImplementation(makeExecFileImpl(responses));

    await probeVideoEncoder('ffmpeg', log);
    resetProbeCache();
    await probeVideoEncoder('ffmpeg', log);

    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });
});
