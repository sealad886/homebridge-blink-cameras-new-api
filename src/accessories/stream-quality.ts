/** System-wide output capabilities. Input quality remains camera-owned. */
export type OutputQualityProfile = 'auto' | '720p15' | '360p15' | '1080p30';
export type VideoResolution = [number, number, number];

const DEFAULT_RESOLUTIONS: VideoResolution[] = [
  [320, 180, 30], [320, 240, 30], [480, 270, 30], [480, 360, 30],
  [640, 360, 30], [640, 480, 30], [1280, 720, 30], [1920, 1080, 30],
  [320, 180, 15], [320, 240, 15], [480, 270, 15], [480, 360, 15],
  [640, 360, 15], [640, 480, 15], [1280, 720, 15], [1920, 1080, 15],
];

const FIXED_RESOLUTIONS: Record<Exclude<OutputQualityProfile, 'auto'>, VideoResolution> = {
  '720p15': [1280, 720, 15],
  '360p15': [640, 360, 15],
  '1080p30': [1920, 1080, 30],
};

export function resolveOutputQuality(value: unknown): OutputQualityProfile {
  if (value === undefined || value === 'auto') return 'auto';
  if (value === '720p15' || value === '360p15' || value === '1080p30') return value;
  throw new Error('Invalid output quality profile');
}

export function outputResolutions(profile: OutputQualityProfile): VideoResolution[] {
  const resolutions = profile === 'auto'
    ? DEFAULT_RESOLUTIONS
    : [FIXED_RESOLUTIONS[profile], [320, 240, 15] as VideoResolution];
  // Each controller owns its capability arrays; HAP must not mutate another camera.
  return resolutions.map(([width, height, fps]) => [width, height, fps]);
}

/** HAP level IDs: 0=3.1, 1=3.2, 2=4.0. 1080p/30 exceeds level 3.2. */
export function outputH264Levels(profile: OutputQualityProfile): Array<0 | 1 | 2> {
  return profile === '1080p30' ? [2] : [0, 1, 2];
}

export function isSupportedOutputVideo(
  profile: OutputQualityProfile,
  video: { width: number; height: number; fps: number; level?: number },
): boolean {
  if (profile === '1080p30' && video.level !== 2) return false;
  return outputResolutions(profile).some(([width, height, fps]) =>
    width === video.width && height === video.height && fps === video.fps);
}
