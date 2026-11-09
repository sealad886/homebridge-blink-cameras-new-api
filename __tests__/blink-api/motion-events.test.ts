import {
  decodeBlinkMotionMessage,
  parseBlinkOffsetTimestamp,
  type BlinkMotionContext,
  type NativeMotionDevice,
  type BlinkMotionMessage,
  type BlinkMotionDevice,
} from '../../src/blink-api/motion-events';

const device = (overrides: Partial<NativeMotionDevice> = {}): NativeMotionDevice => ({
  accountId: 10, networkId: 20, syncModuleId: 30, moduleId: 'sync:30', providerId: 40,
  target: 'known-target', cameraId: 'canonical:40', nativeName: 'Entry (native name)', ...overrides,
});

const message = (data: Record<string, string | undefined> = {}): BlinkMotionMessage => ({
  persistentMessageId: '0:1234%provider-message-id',
  data: {
    category: 'motion', event_type: 'cam2sm_motion', network: '20',
    camera: '40', target: 'known-target', created_at: '2026-11-09T06:00:00.123+00:00', ...data,
  } as Record<string, string>,
});

const context = (devices: BlinkMotionDevice[] = [device()]): BlinkMotionContext => ({
  accountId: 10, tier: 'e006',
  resolveDevice: ({ providerId, networkId, target }) => {
    const found = devices.filter(item => item.providerId === providerId && (networkId === undefined || item.networkId === networkId) && item.target === target);
    return found.length === 1 ? found[0] : undefined;
  },
});

describe('native USB motion messages', () => {
  it('binds a native motion indication to its known device, with notification timestamp semantics', () => {
    const result = decodeBlinkMotionMessage(message({ camera_name: 'untrusted display override' }), context());

    expect(result).toEqual({
      status: 'motion', device: device(), eventType: 'native-usb',
      observation: {
        source: 'provider', kind: 'motion-start', eventId: '0:1234%provider-message-id',
        cameraId: 'canonical:40', occurredAt: Date.parse('2026-11-09T06:00:00.123Z'),
      },
      originalCreatedAt: '2026-11-09T06:00:00.123+00:00', timestampBasis: 'notification-created-at',
    });
    expect(result).not.toHaveProperty('clipId');
    expect(result).not.toHaveProperty('filename');
  });

  it('accepts the minimal native payload under the authenticated receiver scope', () => {
    const input = message();
    expect(input.data).not.toHaveProperty('account_id');
    expect(input.data).not.toHaveProperty('tier');
    expect(decodeBlinkMotionMessage(input, context()).status).toBe('motion');
    expect(decodeBlinkMotionMessage(message({ account_id: '10', tier: 'e006' }), context()).status).toBe('motion');
  });

  it('accepts proven cloud motion without fabricating a Sync Module or requiring an unproven network field', () => {
    const { syncModuleId: _sync, moduleId: _module, ...cloud } = device();
    const input = message({ event_type: 'cloud_motion', video: '501' });
    const data = { ...input.data }; delete data.network;
    const result = decodeBlinkMotionMessage({ ...input, data }, context([cloud]));
    expect(result.status).toBe('motion');
    if (result.status === 'motion') {
      expect(result.eventType).toBe('cloud-media');
      expect(result.device).not.toHaveProperty('syncModuleId');
      expect(result.observation).not.toHaveProperty('moduleId');
    }
  });

  it('rejects ambiguous cloud identity without network instead of picking another known camera', () => {
    const input = message({ event_type: 'cloud_motion' });
    const data = { ...input.data }; delete data.network;
    expect(decodeBlinkMotionMessage({ ...input, data }, context([device(), device({ networkId: 21 })])))
      .toEqual({ status: 'ignored', reason: 'unknown-device' });
    expect(decodeBlinkMotionMessage(input, context([device(), device({ networkId: 21 })])).status).toBe('motion');
    const native = message(); const missingNetwork = { ...native.data }; delete missingNetwork.network;
    expect(decodeBlinkMotionMessage({ ...native, data: missingNetwork }, context())).toEqual({ status: 'ignored', reason: 'invalid-message' });
  });

  it('retains exact persistent identity and distinct camera binding for duplicate delivery handling', () => {
    const devices = [device(), device({ providerId: 41, cameraId: 'canonical:41' })];
    const first = decodeBlinkMotionMessage(message(), context(devices));
    const duplicate = decodeBlinkMotionMessage(message(), context(devices));
    const otherCamera = decodeBlinkMotionMessage(message({ camera: '41' }), context(devices));

    expect(first).toEqual(duplicate);
    expect(first.status).toBe('motion');
    expect(otherCamera.status).toBe('motion');
    if (first.status === 'motion' && otherCamera.status === 'motion') {
      expect(first.observation.eventId).toBe(otherCamera.observation.eventId);
      expect(first.observation.cameraId).not.toBe(otherCamera.observation.cameraId);
    }
  });

  it('does not guess target-to-device-kind conversions from a server ID', () => {
    const devices = [device(), device({ target: 'other-known-target', cameraId: 'other-kind:40' })];
    const result = decodeBlinkMotionMessage(message({ target: 'other-known-target' }), context(devices));

    expect(result.status).toBe('motion');
    if (result.status === 'motion') expect(result.observation.cameraId).toBe('other-kind:40');
    expect(decodeBlinkMotionMessage(message({ target: 'guessed-target' }), context(devices))).toEqual({ status: 'ignored', reason: 'unknown-device' });
  });

  it.each([
    { account_id: '11' }, { tier: 'e005' },
  ])('rejects notifications outside the authenticated account/tier: %p', data => {
    const resolveDevice = jest.fn();
    expect(decodeBlinkMotionMessage(message(data), { ...context(), resolveDevice })).toEqual({ status: 'ignored', reason: 'foreign-scope' });
    expect(resolveDevice).not.toHaveBeenCalled();
  });

  it.each([
    { camera: '41' }, { network: '21' },
  ])('rejects unknown camera/network bindings: %p', data => {
    expect(decodeBlinkMotionMessage(message(data), context())).toEqual({ status: 'ignored', reason: 'unknown-device' });
  });

  it('verifies the resolver result instead of trusting a fallback camera', () => {
    const resolveDevice = () => device({ providerId: 999 });
    expect(decodeBlinkMotionMessage(message(), { ...context(), resolveDevice })).toEqual({ status: 'ignored', reason: 'invalid-device-binding' });
    expect(decodeBlinkMotionMessage(message(), { ...context(), resolveDevice: () => device({ accountId: 99 }) }))
      .toEqual({ status: 'ignored', reason: 'invalid-device-binding' });
  });

  it.each([
    { category: 'media' }, { event_type: 'unknown_motion' }, { category: '' }, { event_type: '' },
  ])('does not treat unrelated/early/cloud events as native USB motion: %p', data => {
    expect(decodeBlinkMotionMessage(message(data), context())).toEqual({ status: 'ignored', reason: 'unsupported-event' });
  });

  it.each([
    { camera: '0' }, { camera: '-1' }, { camera: '4e1' }, { camera: '040' },
    { camera: '9007199254740992' }, { network: '' }, { target: '' },
    { created_at: '2026-11-09T06:00:00' }, { created_at: '2026-02-30T06:00:00Z' },
  ])('rejects malformed required fields: %p', data => {
    expect(decodeBlinkMotionMessage(message(data), context())).toEqual({ status: 'ignored', reason: 'invalid-message' });
  });

  it('rejects malformed envelopes, non-string maps and missing persistent identity', () => {
    expect(decodeBlinkMotionMessage({ ...message(), persistentMessageId: '' }, context())).toEqual({ status: 'ignored', reason: 'invalid-message' });
    expect(decodeBlinkMotionMessage({ ...message(), persistentMessageId: 'bad\nidentity' }, context())).toEqual({ status: 'ignored', reason: 'invalid-message' });
    expect(decodeBlinkMotionMessage({ ...message(), data: { ...message().data, camera: 40 } as unknown as Record<string, string> }, context()))
      .toEqual({ status: 'ignored', reason: 'invalid-message' });
    expect(decodeBlinkMotionMessage({ ...message(), data: [] as unknown as Record<string, string> }, context())).toEqual({ status: 'ignored', reason: 'invalid-message' });
  });

  it('cannot consume HomeKit held-motion or replay observations as push data', () => {
    const replay = { source: 'replay', cameraId: 'canonical:40', MotionDetected: true };
    expect(decodeBlinkMotionMessage(replay as unknown as BlinkMotionMessage, context())).toEqual({ status: 'ignored', reason: 'invalid-message' });
  });
});

describe('offset-bearing Blink timestamps', () => {
  it('converts equivalent offsets without losing the caller original timestamp text', () => {
    expect(parseBlinkOffsetTimestamp('2026-11-09T07:00:00.123+01:00')).toBe(Date.parse('2026-11-09T06:00:00.123Z'));
    expect(parseBlinkOffsetTimestamp('2026-11-08T23:00:00.123-07:00')).toBe(Date.parse('2026-11-09T06:00:00.123Z'));
    expect(parseBlinkOffsetTimestamp('2026-11-09T06:00:00.123456789Z')).toBe(Date.parse('2026-11-09T06:00:00.123Z'));
  });

  it.each([
    '2026-11-09T06:00:00', '2026-02-29T06:00:00Z', '2026-13-01T06:00:00Z',
    '2026-11-09T24:00:00Z', '2026-11-09T06:60:00Z', '2026-11-09T06:00:60Z',
    '2026-11-09T06:00:00+19:00', '2026-11-09T06:00:00+18:01', 'yesterday',
  ])('rejects invalid/local/rollover timestamps: %s', timestamp => {
    expect(parseBlinkOffsetTimestamp(timestamp)).toBeNull();
  });
});
