import { parseLatmFrames, ImmisProxyServer } from '../../src/blink-api/immis-proxy';
import { EventEmitter } from 'node:events';

const buildLoasFrame = (payload: Buffer): Buffer => {
  const length = payload.length;
  const header = Buffer.alloc(3);
  header[0] = 0x56;
  header[1] = 0xe0 | ((length >> 8) & 0x1f);
  header[2] = length & 0xff;
  return Buffer.concat([header, payload]);
};

describe('parseLatmFrames', () => {
  it('extracts complete LOAS frames and preserves remainder', () => {
    const frameA = buildLoasFrame(Buffer.from([0x01, 0x02, 0x03]));
    const frameB = buildLoasFrame(Buffer.from([0x04, 0x05]));
    const partial = buildLoasFrame(Buffer.from([0x06, 0x07, 0x08]));
    const partialCut = partial.subarray(0, 4);

    const buffer = Buffer.concat([frameA, frameB, partialCut]);
    const result = parseLatmFrames(buffer);

    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]).toEqual(frameA);
    expect(result.frames[1]).toEqual(frameB);
    expect(result.remainder).toEqual(partialCut);
  });

  it('discards bytes before syncword', () => {
    const frame = buildLoasFrame(Buffer.from([0x09, 0x0a]));
    const buffer = Buffer.concat([Buffer.from([0x00, 0x11, 0x22]), frame]);
    const result = parseLatmFrames(buffer);

    expect(result.discardedBytes).toBe(3);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]).toEqual(frame);
    expect(result.remainder.length).toBe(0);
  });
});

describe('ImmisProxyServer idle reconnect grace', () => {
  class MockSocket extends EventEmitter {
    public destroyed = false;
  }

  it('schedules a grace window instead of stopping immediately when the last client disconnects', () => {
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://example.com/session?client_id=1',
      serial: 'TEST_SERIAL',
    });

    const stop = jest.spyOn(proxy, 'stop').mockImplementation(() => undefined);
    jest.spyOn(proxy as unknown as { connectToImmisServer: () => void }, 'connectToImmisServer').mockImplementation(() => undefined);
    const client = new MockSocket();

    (proxy as unknown as { isRunning: boolean }).isRunning = true;
    (proxy as unknown as { handleClient: (socket: MockSocket) => void }).handleClient(client);

    client.emit('close');

    expect(stop).not.toHaveBeenCalled();

    const idleShutdownTimeout = (proxy as unknown as { idleShutdownTimeout: ReturnType<typeof setTimeout> | null }).idleShutdownTimeout;
    expect(idleShutdownTimeout).toBeTruthy();

    if (idleShutdownTimeout) {
      clearTimeout(idleShutdownTimeout);
      (proxy as unknown as { idleShutdownTimeout: null }).idleShutdownTimeout = null;
    }
  });
});
