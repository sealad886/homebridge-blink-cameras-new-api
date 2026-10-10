import { probeAacEldEncoder, probeVideoEncoder, resetProbeCache } from '../src/accessories/encoder-probe';
import { execFile } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';

jest.mock('node:child_process');
jest.mock('node:dgram');

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


describe('AAC-ELD capability', () => {
  let sockets: Array<EventEmitter & { bind: jest.Mock; address: jest.Mock; close: jest.Mock }>;
  beforeEach(() => {
    jest.clearAllMocks();
    sockets = [];
    (createSocket as unknown as jest.Mock).mockImplementation(() => {
      const socket = Object.assign(new EventEmitter(), {
        bind: jest.fn((_port, _host, callback) => callback()),
        address: jest.fn(() => ({ port: 40000 })),
        close: jest.fn(),
      });
      sockets.push(socket);
      return socket;
    });
  });

  it.each([0, 1])('requires successful encoding and RTP muxing (exit %s)', async (code) => {
    mockExecFile.mockImplementation((_cmd, args, opts, callback) => {
      expect(args).toEqual(expect.arrayContaining(['libfdk_aac', 'aac_eld', 'rtp']));
      expect(args.at(-1)).toBe('rtp://127.0.0.1:40000?pkt_size=1200');
      expect(opts.timeout).toBe(5000);
      const packet = Buffer.alloc(20);
      packet[0] = 0x80;
      packet[1] = 110;
      sockets.at(-1)?.emit('message', packet, { address: '127.0.0.1' });
      callback(code ? { code } : null, '', '');
    });
    expect(await probeAacEldEncoder('ffmpeg')).toBe(code === 0);
    expect(mockExecFile).toHaveBeenCalledTimes(code === 0 ? 2 : 1);
    if (!code) {
      expect(mockExecFile.mock.calls.map(call => call[1])).toEqual([
        expect.arrayContaining(['anullsrc=r=16000:cl=mono']),
        expect.arrayContaining(['anullsrc=r=24000:cl=mono']),
      ]);
    }
    expect(sockets.every(socket => socket.close.mock.calls.length === 1)).toBe(true);
  });

  it.each(['missing', 'malformed', 'wrong payload', 'wrong sender'])('rejects %s RTP despite successful process exit', async (kind) => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const packet = Buffer.alloc(kind === 'malformed' ? 1 : 20);
      packet[0] = 0x80;
      if (packet.length > 1) packet[1] = kind === 'wrong payload' ? 99 : 110;
      if (kind !== 'missing') sockets.at(-1)?.emit('message', packet, { address: kind === 'wrong sender' ? '192.0.2.1' : '127.0.0.1' });
      callback(null, '', '');
    });
    expect(await probeAacEldEncoder('ffmpeg')).toBe(false);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(sockets[0].close).toHaveBeenCalledTimes(1);
  });

  it('closes its socket and refuses capability when loopback bind fails', async () => {
    (createSocket as unknown as jest.Mock).mockImplementationOnce(() => {
      const socket = Object.assign(new EventEmitter(), {
        bind: jest.fn(),
        address: jest.fn(), close: jest.fn(),
      });
      socket.bind.mockImplementation(() => { socket.emit('error', new Error('bind failed')); });
      sockets.push(socket);
      return socket;
    });
    expect(await probeAacEldEncoder('ffmpeg')).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(sockets[0].close).toHaveBeenCalledTimes(1);
  });
});
