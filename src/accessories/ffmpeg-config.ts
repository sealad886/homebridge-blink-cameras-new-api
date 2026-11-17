import { isAbsolute } from 'node:path';

/** Pure configuration validation; authenticated discovery and media requests resolve executables. */
export function configuredFfmpegPath(value: unknown): string {
  if (value === undefined) return 'ffmpeg';
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || value.includes('\0') ||
      ((value.includes('/') || value.includes('\\')) && !isAbsolute(value))) {
    throw new Error('Use an FFmpeg executable name from PATH or an absolute executable path.');
  }
  return value;
}
