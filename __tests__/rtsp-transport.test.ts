import { test } from '@jest/globals';
import { Buffer } from 'node:buffer';
import { RTSP_PARSER_LIMITS, RtspInterleavedParser } from '../src/accessories/rtsp-transport';

const target = 'rtsps://stream.example.invalid:332/private-session';
function response(cseq: number, extra = '', body = ''): Buffer {
  return Buffer.from(`RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\n${extra}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
function interleaved(channel: number, payload: Buffer): Buffer {
  const header = Buffer.from([36, channel, 0, 0]); header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}
function rtp(payload: Buffer): Buffer {
  const header = Buffer.alloc(12); header[0] = 0x80; header[1] = 33;
  header.writeUInt32BE(1, 8); return Buffer.concat([header, payload]);
}
test('successful TEARDOWN fences coalesced late media before notifying the owner', () => {
  const media = jest.fn(); let closedAtResponse = false;
  const parser = new RtspInterleavedParser(target, { media, rtcp: jest.fn(),
    response: value => { if (value.cseq === 2) closedAtResponse = parser.closed; } });
  parser.expect({ method: 'PLAY', cseq: 1, target }); parser.push(response(1));
  parser.expect({ method: 'TEARDOWN', cseq: 2, target });
  const ts = Buffer.alloc(188); ts[0] = 0x47;
  parser.push(Buffer.concat([response(2), interleaved(0, rtp(ts))]));
  expect(closedAtResponse).toBe(true); expect(parser.closed).toBe(true);
  expect(media).not.toHaveBeenCalled(); expect(() => parser.push(interleaved(0, rtp(ts)))).toThrow();
});
test('delivers MPEG-TS from fragmented TCP interleaving after a matching PLAY response', () => {
  const media: Buffer[] = []; const rtcp: Buffer[] = [];
  const parser = new RtspInterleavedParser(target, { media: bytes => media.push(bytes), rtcp: bytes => rtcp.push(bytes) });
  parser.expect({ method: 'PLAY', cseq: 1, target });
  const ts = Buffer.alloc(188); ts[0] = 0x47;
  const report = Buffer.from([0x80, 201, 0, 1, 0, 0, 0, 1]);
  const bytes = Buffer.concat([response(1), interleaved(0, rtp(ts)), interleaved(1, report)]);
  for (let i = 0; i < bytes.length; i += 7) parser.push(bytes.subarray(i, i + 7));
  expect(media).toEqual([ts]); expect(rtcp).toEqual([report]); parser.finish();
});

test.each([
  ['Location: rtsps://evil.invalid/private\r\n', ''],
  ['Content-Base: rtsps://evil.invalid/private\r\n', ''],
  ['Content-Location: rtsp://stream.example.invalid/private\r\n', ''],
  ['Transport: RTP/AVP;unicast;client_port=5000-5001\r\n', ''],
  ['Transport: RTP/AVP/TCP;unicast;interleaved=0-1;destination=127.0.0.1\r\n', ''],
  ['Content-Type: application/sdp\r\n', 'v=0\r\na=control:rtsps://evil.invalid/session\r\n'],
  ['Content-Type: text/plain\r\n', 'unexpected'],
])('refuses escape or unsupported transport before delivering response (%s)', (headers, body) => {
  const accepted = jest.fn(); const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn(), response: accepted });
  parser.expect({ method: 'SETUP', cseq: 1, target });
  expect(() => parser.push(response(1, headers, body))).toThrow('RTSP transport refused');
  expect(accepted).not.toHaveBeenCalled(); expect(parser.closed).toBe(true);
});

test('validates session identity and permits same-origin relative SDP controls', () => {
  const accepted = jest.fn(); const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn(), response: accepted });
  parser.expect({ method: 'DESCRIBE', cseq: 1, target });
  parser.push(response(1, 'Content-Type: application/sdp\r\nContent-Base: rtsps://stream.example.invalid:332/media/\r\n', 'v=0\r\na=control:*\r\na=control:track1\r\n'));
  parser.expect({ method: 'SETUP', cseq: 2, target });
  parser.push(response(2, 'Session: owned;timeout=60\r\nTransport: RTP/AVP/TCP;unicast;interleaved=0-1\r\n'));
  expect(accepted).toHaveBeenLastCalledWith({ cseq: 2, session: 'owned' });
  parser.expect({ method: 'PLAY', cseq: 3, target });
  expect(() => parser.push(response(3, 'Session: foreign\r\n'))).toThrow();
});

test('rejects malformed RTCP before delivering it', () => {
  const received = jest.fn(); const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: received });
  parser.expect({ method: 'PLAY', cseq: 1, target }); parser.push(response(1));
  expect(() => parser.push(interleaved(1, Buffer.from([0x80, 200, 0, 6])))).toThrow();
  expect(received).not.toHaveBeenCalled();
});

test.each(['v=0\na=control:rtsps://evil.invalid/\n', 'v=0\r\na=control:\r\n'])('rejects malformed SDP without a response callback', body => {
  const accepted = jest.fn(); const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn(), response: accepted });
  parser.expect({ method: 'DESCRIBE', cseq: 1, target });
  expect(() => parser.push(response(1, 'Content-Type: application/sdp\r\n', body))).toThrow();
  expect(accepted).not.toHaveBeenCalled();
});

test('rejects high-bit bytes that could alias ASCII status during decoding', () => {
  const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn() });
  parser.expect({ method: 'PLAY', cseq: 1, target });
  const bytes = response(1); bytes[0] |= 0x80;
  expect(() => parser.push(bytes)).toThrow();
});

test('rejects changing RTP source before delivering foreign media', () => {
  const received = jest.fn(); const parser = new RtspInterleavedParser(target, { media: received, rtcp: jest.fn() });
  parser.expect({ method: 'PLAY', cseq: 1, target }); parser.push(response(1));
  const ts = Buffer.alloc(188); ts[0] = 0x47;
  parser.push(interleaved(0, rtp(ts)));
  const foreign = rtp(ts); foreign.writeUInt32BE(2, 8);
  expect(() => parser.push(interleaved(0, foreign))).toThrow();
  expect(received).toHaveBeenCalledTimes(1);
});

test('cancellation discards partial input and fences late callbacks', () => {
  const cancel = new globalThis.AbortController(); const accepted = jest.fn();
  const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn(), response: accepted }, cancel.signal);
  parser.expect({ method: 'PLAY', cseq: 1, target }); parser.push(response(1).subarray(0, 8)); cancel.abort();
  expect(parser.closed).toBe(true); expect(() => parser.push(response(1))).toThrow(); expect(accepted).not.toHaveBeenCalled();
});

test.each([
  Buffer.from('RTSP/1.0 302 Found\r\nCSeq: 1\r\n\r\n'),
  Buffer.from('RTSP/1.0 200 OK\r\nCSeq: 2\r\n\r\n'),
  Buffer.from('RTSP/1.0 200 OK\r\nCSeq: 1\r\nCSeq: 1\r\n\r\n'),
  Buffer.from('RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 65537\r\n\r\n'),
  Buffer.alloc(RTSP_PARSER_LIMITS.headerBytes + 1, 65),
  Buffer.alloc(RTSP_PARSER_LIMITS.chunkBytes + 1),
])('rejects unmatched, redirect, ambiguous or oversized responses', bytes => {
  const accepted = jest.fn(); const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn(), response: accepted });
  parser.expect({ method: 'PLAY', cseq: 1, target });
  expect(() => parser.push(bytes)).toThrow(); expect(accepted).not.toHaveBeenCalled();
});

test.each([Buffer.from([36, 0, 0]), Buffer.from('RTSP/1.0 200')])('rejects partial EOF', bytes => {
  const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn() });
  parser.expect({ method: 'PLAY', cseq: 1, target }); parser.push(response(1)); parser.push(bytes);
  expect(() => parser.finish()).toThrow();
});

test.each(['rtsp://stream.example.invalid:332/session', 'rtsps://evil.invalid:332/session',
  'rtsps://stream.example.invalid:443/session', 'rtsps://user:secret@stream.example.invalid:332/session'])('refuses request-target escape before admission', url => {
  const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn() });
  expect(() => parser.expect({ method: 'PLAY', cseq: 1, target: url })).toThrow('RTSP transport refused');
});

test.each([0, 1, 2, 3, 4, 5])('refuses malformed RTP and unsupported channels (%i)', variant => {
  const received = jest.fn(); const parser = new RtspInterleavedParser(target, { media: received, rtcp: jest.fn() });
  parser.expect({ method: 'PLAY', cseq: 1, target }); parser.push(response(1));
  const ts = Buffer.alloc(188); ts[0] = 0x47; let packet = rtp(ts); let channel = 0;
  if (variant === 0) packet[0] = 0x81; // CSRC/extension/padding are outside this explicit proof subset.
  if (variant === 1) packet[1] = 96;
  if (variant === 2) packet.writeUInt32BE(0, 8);
  if (variant === 3) packet[12] = 0;
  if (variant === 4) packet = packet.subarray(0, packet.length - 1);
  if (variant === 5) channel = 2;
  expect(() => parser.push(interleaved(channel, packet))).toThrow(); expect(received).not.toHaveBeenCalled();
});

test('no media admitted before PLAY; one request at a time', () => {
  const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn() });
  expect(() => parser.push(interleaved(0, Buffer.alloc(12)))).toThrow();
  const second = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn() });
  second.expect({ method: 'PLAY', cseq: 1, target });
  expect(() => second.expect({ method: 'PLAY', cseq: 2, target })).toThrow();
});

test('callback failures have fixed diagnostics and retire parser', () => {
  const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn(),
    response: () => { throw new Error('private-session-secret'); } });
  parser.expect({ method: 'PLAY', cseq: 1, target });
  expect(() => parser.push(response(1))).toThrow('RTSP transport refused'); expect(parser.closed).toBe(true);
});

test('already-aborted generation cannot admit requests', () => {
  const abort = new globalThis.AbortController(); abort.abort();
  const parser = new RtspInterleavedParser(target, { media: jest.fn(), rtcp: jest.fn() }, abort.signal);
  expect(() => parser.expect({ method: 'PLAY', cseq: 1, target })).toThrow();
});
