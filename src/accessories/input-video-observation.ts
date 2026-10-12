/** Non-sensitive geometry observed from a demuxer's input stream descriptor. */
export interface InputVideoObservation {
  width: number;
  height: number;
  fps?: number;
}

/** Called only with already bounded, complete FFmpeg stderr lines. */
export class InputVideoObserver {
  private inputSection = false;
  private observed = false;

  observe(line: string): InputVideoObservation | undefined {
    if (this.observed || line.length > 64 * 1024) return undefined;
    const text = line.trim();
    if (/^Input #0,/.test(text)) {
      this.inputSection = true;
      return undefined;
    }
    if (/^(?:Output #|Stream mapping:|Input #[1-9])/.test(text)) {
      this.inputSection = false;
      return undefined;
    }
    if (!this.inputSection || !/^Stream #0:\d+(?:\[|\(|,|:|\s)/.test(text) || !text.includes('Video:')) {
      return undefined;
    }
    const descriptor = text.slice(text.indexOf('Video:') + 6);
    const geometry = /(?:^|[,\s])(\d{2,4})x(\d{2,4})(?=[\s,(]|$)/.exec(descriptor);
    if (!geometry) return undefined;
    const width = Number(geometry[1]);
    const height = Number(geometry[2]);
    // Include conventional 2K and the square 1920x1920 doorbell source, while
    // refusing malformed or implausible dimensions instead of persisting them.
    if (width < 160 || height < 120 || width > 4096 || height > 4096 || width * height > 8_388_608) {
      return undefined;
    }
    const rate = /(?:^|[,\s])(\d{1,3}(?:\.\d{1,3})?) fps(?:[,\s]|$)/.exec(descriptor);
    const fps = rate ? Number(rate[1]) : undefined;
    if (fps !== undefined && (fps <= 0 || fps > 120)) return undefined;
    this.observed = true;
    return { width, height, ...(fps === undefined ? {} : { fps }) };
  }
}
