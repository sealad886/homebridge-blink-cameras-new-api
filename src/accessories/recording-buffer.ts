import { Buffer } from 'node:buffer';

export const RECORDING_BUFFER_LIMITS = Object.freeze({
  initializationBytes: 256 * 1024,
  fragmentBytes: 8 * 1024 * 1024,
  cameraBytes: 32 * 1024 * 1024,
  aggregateBytes: 64 * 1024 * 1024,
  fragments: 128,
  prebufferMs: 4000,
  timelineToleranceUs: 2000n,
});

export type RecordingBufferFailure = 'buffer_exhausted' | 'invalid_media' | 'discontinuity';

export class RecordingBufferError extends Error {
  constructor(readonly reason: RecordingBufferFailure) {
    super(`Recording unavailable: ${reason}`);
  }
}

/** Counts retained bytes across cameras; reservations precede every owned copy. */
export class RecordingBufferBudget {
  #bytes = 0;
  constructor(readonly maximum = RECORDING_BUFFER_LIMITS.aggregateBytes) {
    if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new RecordingBufferError('buffer_exhausted');
  }
  get bytes(): number { return this.#bytes; }
  reserve(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || this.#bytes + bytes > this.maximum) {
      throw new RecordingBufferError('buffer_exhausted');
    }
    this.#bytes += bytes;
  }
  release(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.#bytes) throw new Error('Recording accounting failure');
    this.#bytes -= bytes;
  }
}

export const sharedRecordingBufferBudget = new RecordingBufferBudget();

export interface RecordingFragment {
  sequence: number;
  startUs: bigint;
  durationUs: bigint;
  keyframe: boolean;
  data: Buffer;
}

export interface RetainedRecordingFragment extends Readonly<RecordingFragment> {
  readonly endUs: bigint;
}

/** A pin owns references, not duplicate footage; clear() also erases pinned bytes. */
export interface RecordingBufferPin {
  readonly fragments: readonly RetainedRecordingFragment[];
  readonly initialization: Buffer;
  readonly released: boolean;
  release(): void;
}

interface Retained extends RetainedRecordingFragment { pins: number; }
interface Pin extends RecordingBufferPin { fragments: Retained[]; released: boolean; }

function boxes(data: Buffer, expected: readonly string[]): boolean {
  let offset = 0, index = 0;
  while (offset < data.length) {
    if (data.length - offset < 8 || index >= expected.length) return false;
    let size = data.readUInt32BE(offset), header = 8;
    if (size === 1) {
      if (data.length - offset < 16) return false;
      const large = data.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      size = Number(large); header = 16;
    }
    if (size < header || size > data.length - offset || data.toString('ascii', offset + 4, offset + 8) !== expected[index]) return false;
    offset += size; index++;
  }
  return index === expected.length;
}

/** One generation's complete fMP4 fragments, retaining a keyframe-aligned prebuffer. */
export class RecordingFragmentBuffer {
  #initialization?: Buffer;
  #fragments: Retained[] = [];
  #pin?: Pin;
  #bytes = 0;
  #last?: Retained;
  #closed = false;
  #finite = false;
  #durationUs = 0n;
  readonly prebufferUs: bigint;
  constructor(
    private readonly budget: RecordingBufferBudget = sharedRecordingBufferBudget,
    readonly maximumBytes = RECORDING_BUFFER_LIMITS.cameraBytes,
    readonly maximumFragmentMs = 4000,
    prebufferMs = RECORDING_BUFFER_LIMITS.prebufferMs,
  ) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 ||
        !Number.isInteger(maximumFragmentMs) || maximumFragmentMs < 1000 || maximumFragmentMs > 4000 ||
        !Number.isInteger(prebufferMs) || prebufferMs < 4000 || prebufferMs > 8000) {
      throw new RecordingBufferError('invalid_media');
    }
    this.prebufferUs = BigInt(prebufferMs) * 1000n;
  }
  get bytes(): number { return this.#bytes; }
  get ready(): boolean {
    return !this.#closed && !!this.#initialization && this.#fragments.length > 0 && this.#durationUs >= this.prebufferUs;
  }
  get lastSequence(): number | undefined { return this.#last?.sequence; }
  get retainedDurationUs(): bigint {
    return this.#durationUs;
  }
  initialize(data: Buffer): void {
    if (this.#closed || this.#finite || this.#initialization || !data.length || data.length > RECORDING_BUFFER_LIMITS.initializationBytes ||
        !boxes(data, ['ftyp', 'moov'])) throw new RecordingBufferError('invalid_media');
    this.#initialization = this.#copy(data);
  }
  append(fragment: RecordingFragment): void {
    if (this.#closed || this.#finite || !this.#initialization || !Number.isSafeInteger(fragment.sequence) || fragment.sequence < 0 || fragment.sequence > 0xffffffff ||
        typeof fragment.startUs !== 'bigint' || typeof fragment.durationUs !== 'bigint' || fragment.startUs < 0n ||
        fragment.durationUs <= 0n || fragment.durationUs > BigInt(this.maximumFragmentMs) * 1000n || !fragment.keyframe ||
        !fragment.data.length || fragment.data.length > RECORDING_BUFFER_LIMITS.fragmentBytes || !boxes(fragment.data, ['moof', 'mdat'])) {
      throw new RecordingBufferError('invalid_media');
    }
    if (this.#last) {
      const delta = fragment.startUs - this.#last.endUs;
      if (fragment.sequence !== this.#last.sequence + 1 || fragment.startUs <= this.#last.startUs ||
          delta > RECORDING_BUFFER_LIMITS.timelineToleranceUs || delta < -RECORDING_BUFFER_LIMITS.timelineToleranceUs) {
        throw new RecordingBufferError('discontinuity');
      }
    }
    // Reclaim only media outside the retained prebuffer and outside any pinned event.
    this.#evict(fragment.durationUs);
    if (this.#fragments.length >= RECORDING_BUFFER_LIMITS.fragments) throw new RecordingBufferError('buffer_exhausted');
    const owned: Retained = { ...fragment, endUs: fragment.startUs + fragment.durationUs, data: this.#copy(fragment.data), pins: this.#pin ? 1 : 0 };
    this.#fragments.push(owned); this.#last = owned;
    this.#durationUs += owned.durationUs;
    this.#pin?.fragments.push(owned);
  }
  pin(): RecordingBufferPin {
    if (!this.ready || this.#pin || this.#finite) throw new RecordingBufferError('invalid_media');
    return this.#createPin();
  }
  /** Seal completed finite input, including a valid clip shorter than the live prebuffer. */
  sealFinite(): RecordingBufferPin {
    if (this.#closed || this.#finite || !this.#initialization || this.#fragments[0]?.sequence !== 0) {
      throw new RecordingBufferError('invalid_media');
    }
    this.#finite = true;
    return this.#pin ?? this.#createPin();
  }
  #createPin(): RecordingBufferPin {
    const fragments = [...this.#fragments];
    for (const fragment of fragments) fragment.pins++;
    const pin: Pin = { fragments, initialization: this.#initialization!, released: false, release: () => {
      if (pin.released) return;
      pin.released = true;
      for (const fragment of pin.fragments) fragment.pins--;
      pin.fragments.length = 0;
      if (this.#pin === pin) this.#pin = undefined;
      this.#evict(0n);
    } };
    this.#pin = pin;
    return pin;
  }
  clear(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#pin?.release();
    if (this.#initialization) { this.#erase(this.#initialization); this.#initialization = undefined; }
    for (const fragment of this.#fragments) this.#erase(fragment.data);
    this.#fragments.length = 0; this.#last = undefined; this.#durationUs = 0n;
  }
  #copy(data: Buffer): Buffer {
    if (this.#bytes + data.length > this.maximumBytes) throw new RecordingBufferError('buffer_exhausted');
    this.budget.reserve(data.length);
    try { const owned = Buffer.from(data); this.#bytes += owned.length; return owned; }
    catch (error) { this.budget.release(data.length); throw error; }
  }
  #erase(data: Buffer): void { data.fill(0); this.#bytes -= data.length; this.budget.release(data.length); }
  #evict(incomingDuration: bigint): void {
    if (this.#finite) return;
    while (this.#fragments.length > 1) {
      const first = this.#fragments[0];
      if (first.pins || this.#durationUs - first.durationUs + incomingDuration < this.prebufferUs) break;
      this.#fragments.shift(); this.#durationUs -= first.durationUs; this.#erase(first.data);
    }
  }
}
