import { execFile, type ExecFileException } from 'node:child_process';
import process from 'node:process';
import { createSocket } from 'node:dgram';
import { clearTimeout, setTimeout } from 'node:timers';

import type { VideoEncoderPreference } from './camera-source';

const PROBE_TIMEOUT_MS = 5_000;

const HARDWARE_ENCODERS_BY_PRIORITY: VideoEncoderPreference[] = [
  'h264_videotoolbox',
  'h264_v4l2m2m',
  'h264_nvenc',
  'h264_vaapi',
  'h264_qsv',
];

interface DryRunSpec {
  args: string[];
}

const DRY_RUN_SPECS: Partial<Record<VideoEncoderPreference, DryRunSpec>> = {
  h264_videotoolbox: {
    args: [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=1:r=30',
      '-pix_fmt', 'nv12',
      '-frames:v', '1', '-c:v', 'h264_videotoolbox',
      '-f', 'null', '/dev/null',
    ],
  },
  h264_v4l2m2m: {
    args: [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=1:r=30',
      '-frames:v', '1', '-c:v', 'h264_v4l2m2m',
      '-f', 'null', '/dev/null',
    ],
  },
  h264_nvenc: {
    args: [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=1:r=30',
      '-frames:v', '1', '-c:v', 'h264_nvenc',
      '-f', 'null', '/dev/null',
    ],
  },
  h264_vaapi: {
    args: [
      '-hide_banner', '-loglevel', 'error',
      '-vaapi_device', '/dev/dri/renderD128',
      '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=1:r=30',
      '-vf', 'format=nv12,hwupload',
      '-frames:v', '1', '-c:v', 'h264_vaapi',
      '-f', 'null', '/dev/null',
    ],
  },
  h264_qsv: {
    args: [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=1:r=30',
      '-frames:v', '1', '-c:v', 'h264_qsv',
      '-f', 'null', '/dev/null',
    ],
  },
};

const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';

function execFilePromise(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (error: ExecFileException | null, stdout, stderr) => {
      resolve({
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : '',
        exitCode: error ? (error.code as number ?? 1) : 0,
      });
    });
  });
}

async function listCompiledEncoders(ffmpegPath: string): Promise<Set<string>> {
  const result = await execFilePromise(ffmpegPath, ['-hide_banner', '-encoders'], PROBE_TIMEOUT_MS);
  const encoders = new Set<string>();
  for (const line of result.stdout.split('\n')) {
    const match = /^\s*V\S*\s+(h264_\S+)/.exec(line);
    if (match) {
      encoders.add(match[1]);
    }
  }
  if (result.stdout.includes('libx264')) {
    encoders.add('libx264');
  }
  return encoders;
}

async function tryEncoder(ffmpegPath: string, encoder: VideoEncoderPreference): Promise<boolean> {
  const spec = DRY_RUN_SPECS[encoder];
  if (!spec) return false;

  const args = spec.args.map(a => a === '/dev/null' ? NULL_DEVICE : a);
  const result = await execFilePromise(ffmpegPath, args, PROBE_TIMEOUT_MS);
  return result.exitCode === 0;
}

export interface EncoderProbeResult {
  selected: VideoEncoderPreference;
  compiledEncoders: string[];
  testedEncoders: { encoder: string; available: boolean }[];
}

let cachedResult: EncoderProbeResult | null = null;
let pendingProbe: Promise<EncoderProbeResult> | null = null;

export function resetProbeCache(): void {
  cachedResult = null;
  pendingProbe = null;
}

export async function probeVideoEncoder(
  ffmpegPath: string,
  log: (message: string) => void,
): Promise<EncoderProbeResult> {
  if (cachedResult) return cachedResult;

  if (pendingProbe) return pendingProbe;

  pendingProbe = doProbe(ffmpegPath, log);
  try {
    cachedResult = await pendingProbe;
    return cachedResult;
  } finally {
    pendingProbe = null;
  }
}

async function doProbe(
  ffmpegPath: string,
  log: (message: string) => void,
): Promise<EncoderProbeResult> {
  log('Probing available hardware video encoders...');

  let compiled: Set<string>;
  try {
    compiled = await listCompiledEncoders(ffmpegPath);
  } catch {
    log('Failed to query FFmpeg encoders; defaulting to software encoder');
    return {
      selected: 'libx264',
      compiledEncoders: [],
      testedEncoders: [],
    };
  }

  log(`FFmpeg compiled H.264 encoders: ${[...compiled].join(', ') || 'none'}`);

  const candidates = HARDWARE_ENCODERS_BY_PRIORITY.filter(e => compiled.has(e));
  const tested: EncoderProbeResult['testedEncoders'] = [];

  for (const encoder of candidates) {
    const available = await tryEncoder(ffmpegPath, encoder);
    tested.push({ encoder, available });

    if (available) {
      log(`Hardware encoder available: ${encoder}`);
      const result: EncoderProbeResult = {
        selected: encoder,
        compiledEncoders: [...compiled],
        testedEncoders: tested,
      };
      return result;
    }

    log(`Hardware encoder ${encoder} compiled but not functional on this system`);
  }

  log('No working hardware encoder found; using software encoder (libx264)');
  return {
    selected: 'libx264',
    compiledEncoders: [...compiled],
    testedEncoders: tested,
  };
}

/** Prove AAC-ELD encoding and RTP muxing using dummy audio, never live media. */
export async function probeAacEldEncoder(ffmpegPath: string): Promise<boolean> {
  for (const rate of [16000, 24000]) {
    const sink = createSocket('udp4');
    let receivedRtp = false;
    let socketFailed = false;
    let bindTimer: ReturnType<typeof setTimeout> | undefined;
    let packetTimer: ReturnType<typeof setTimeout> | undefined;
    let packetReceived: (() => void) | undefined;
    sink.on('error', () => { socketFailed = true; });
    sink.on('message', (packet, remote) => {
      if (remote.address === '127.0.0.1' && packet.length > 12 &&
          (packet[0] >> 6) === 2 && (packet[1] & 0x7f) === 110) {
        receivedRtp = true;
        packetReceived?.();
      }
    });
    try {
      await new Promise<void>((resolve, reject) => {
        bindTimer = setTimeout(() => reject(new Error('Audio probe bind deadline')), PROBE_TIMEOUT_MS);
        sink.once('error', reject);
        sink.bind(0, '127.0.0.1', () => {
          clearTimeout(bindTimer);
          sink.removeListener('error', reject);
          resolve();
        });
      });
      const address = sink.address();
      if (typeof address === 'string' || socketFailed) return false;
      const result = await execFilePromise(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `anullsrc=r=${rate}:cl=mono`,
        '-t', '0.1', '-c:a', 'libfdk_aac', '-profile:a', 'aac_eld',
        '-f', 'rtp', '-payload_type', '110', `rtp://127.0.0.1:${address.port}?pkt_size=1200`,
      ], PROBE_TIMEOUT_MS);
      if (result.exitCode !== 0 || socketFailed) return false;
      if (!receivedRtp) {
        // Process exit can precede delivery of the last loopback datagram.
        await new Promise<void>(resolve => {
          packetReceived = resolve;
          packetTimer = setTimeout(resolve, 250);
        });
      }
      if (!receivedRtp || socketFailed) return false;
    } catch {
      return false;
    } finally {
      clearTimeout(bindTimer);
      clearTimeout(packetTimer);
      try { sink.close(); } catch { /* Bind failure can leave the socket already closed. */ }
    }
  }
  return true;
}
