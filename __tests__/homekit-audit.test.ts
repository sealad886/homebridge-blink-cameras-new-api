import type { API } from 'homebridge';
import path from 'node:path';
import {
  CameraController, Characteristic, Formats, H264Level, H264Profile, HAPStatus, Perms, Service, SRTPCryptoSuites, uuid,
} from '@homebridge/hap-nodejs';
import { HomeKitAudit, logHomeKitEvent } from '../src/homekit-audit';
import { createLogger } from './helpers/homebridge';

// The host exposes this constructor through api.platformAccessory, not its
// package's value exports. Load the installed host implementation for this test.
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { PlatformAccessory } = require(path.join(path.dirname(require.resolve('homebridge')), 'platformAccessory.js')) as {
  PlatformAccessory: API['platformAccessory'];
};

const prefix = '[HomeKit audit] ';
const connection = {} as NonNullable<Parameters<Characteristic['handleGetRequest']>[0]>;
const peer = (username: unknown, authenticated: () => unknown = () => true) =>
  ({ username, isAuthenticated: authenticated }) as unknown as typeof connection;

function fixture() {
  const log = createLogger();
  const accessory = new PlatformAccessory('Corner', uuid.generate('homekit-audit-corner'));
  accessory.context.device = { name: 'Corner', id: 918273, serial: 'DUMMY_SERIAL' };
  const service = accessory.addService(Service.Switch, 'Corner Motion', 'motion');
  const characteristic = service.getCharacteristic(Characteristic.On);
  const audit = new HomeKitAudit(log);
  audit.observe(accessory);
  return { log, accessory, service, characteristic, audit };
}

function records(log: ReturnType<typeof createLogger>) {
  return log.info.mock.calls
    .map(([line]) => String(line))
    .filter(line => line.startsWith(prefix))
    .map(line => JSON.parse(line.slice(prefix.length)) as Record<string, unknown>);
}

describe('HomeKit audit on installed HAP', () => {
  afterEach(() => jest.useRealTimers());

  it('audits unchanged and cached HomeKit reads with camera-specific ISO datetimes at INFO', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-30T12:34:56Z'));
    const { log, characteristic, audit } = fixture();
    const handler = jest.fn(() => false);
    characteristic.onGet(handler);
    await expect(characteristic.handleGetRequest(connection)).resolves.toBe(false);
    await expect(characteristic.handleGetRequest(connection)).resolves.toBe(false);
    characteristic.removeOnGet();
    await expect(characteristic.handleGetRequest(connection)).resolves.toBe(false);
    expect(handler).toHaveBeenCalledTimes(2);
    const reads = records(log).filter(record => record.event === 'Characteristic read');
    expect(reads.filter(record => record.direction === 'HomeKit -> bridge' && record.outcome === 'requested')).toHaveLength(3);
    expect(reads.filter(record => record.direction === 'bridge -> HomeKit' && record.outcome === 'succeeded' && record.value === false)).toHaveLength(3);
    expect(reads.every(record => record.datetime === '2026-10-30T12:34:56.000Z' && record.accessory === 'Corner')).toBe(true);
    expect(log.debug).not.toHaveBeenCalled();
    audit.dispose();
  });

  it('preserves handler arguments, successful writes and numeric failures including validation rejection', async () => {
    const { log, characteristic, audit } = fixture();
    const context = { opaque: 'DUMMY_CONTEXT_SECRET' };
    const handler = jest.fn();
    characteristic.onSet(handler);
    await expect(characteristic.handleSetRequest(true, connection, context)).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledWith(true, context, connection);
    expect(characteristic.value).toBe(true);
    handler.mockRejectedValue(HAPStatus.OPERATION_TIMED_OUT);
    await expect(characteristic.handleSetRequest(false, connection)).rejects.toBe(HAPStatus.OPERATION_TIMED_OUT);
    await expect(characteristic.handleSetRequest('invalid', connection)).rejects.toBe(HAPStatus.INVALID_VALUE_IN_REQUEST);
    const writes = records(log).filter(record => record.event === 'Characteristic write');
    expect(writes.some(record => record.outcome === 'succeeded' && record.status === 0 && !Object.hasOwn(record, 'value'))).toBe(true);
    expect(writes.some(record => record.outcome === 'failed' && record.status === HAPStatus.OPERATION_TIMED_OUT)).toBe(true);
    expect(writes.some(record => record.outcome === 'failed' && record.status === HAPStatus.INVALID_VALUE_IN_REQUEST)).toBe(true);
    expect(JSON.stringify(records(log))).not.toContain('DUMMY_CONTEXT_SECRET');
    audit.dispose();
  });

  it('audits write responses even when HAP emits no change event', async () => {
    const { log, characteristic, audit } = fixture();
    characteristic.setProps({ perms: [...characteristic.props.perms, Perms.WRITE_RESPONSE] });
    characteristic.onSet(() => false);
    await expect(characteristic.handleSetRequest(true, connection)).resolves.toBe(false);
    expect(records(log).filter(record => record.event === 'Characteristic update')).toHaveLength(0);
    expect(records(log)).toContainEqual(expect.objectContaining({ event: 'Characteristic write', outcome: 'succeeded', value: false }));
    audit.dispose();
  });

  it('records unchanged writes and failed reads without changing their results', async () => {
    const { log, characteristic, audit } = fixture();
    const setHandler = jest.fn();
    characteristic.onSet(setHandler);
    await characteristic.handleSetRequest(false, connection);
    await characteristic.handleSetRequest(false, connection);
    expect(setHandler).toHaveBeenCalledTimes(2);
    expect(records(log).filter(record => record.event === 'Characteristic write' && record.outcome === 'succeeded')).toHaveLength(2);
    characteristic.onGet(() => { throw HAPStatus.RESOURCE_BUSY; });
    await expect(characteristic.handleGetRequest(connection)).rejects.toBe(HAPStatus.RESOURCE_BUSY);
    expect(records(log)).toContainEqual(expect.objectContaining({ event: 'Characteristic read', outcome: 'failed', status: HAPStatus.RESOURCE_BUSY }));
    audit.dispose();
  });

  it('does not attribute a newer cache value to an overlapping void write response', async () => {
    const { log, characteristic, audit } = fixture();
    const complete: Array<() => void> = [];
    characteristic.onSet(() => new Promise<void>(resolve => complete.push(resolve)));
    const first = characteristic.handleSetRequest(true, connection);
    const second = characteristic.handleSetRequest(false, connection);
    complete[0](); complete[1]();
    await Promise.all([first, second]);
    expect(characteristic.value).toBe(false);
    const writes = records(log).filter(record => record.event === 'Characteristic write');
    expect(writes.filter(record => record.outcome === 'requested').map(record => record.value)).toEqual([true, false]);
    const responses = writes.filter(record => record.outcome === 'succeeded');
    expect(responses).toHaveLength(2);
    expect(responses.every(record => !Object.hasOwn(record, 'value'))).toBe(true);
    audit.dispose();
  });

  it('does not call local programmatic reads and writes HomeKit requests', async () => {
    const { log, characteristic, audit } = fixture();
    await characteristic.handleGetRequest(undefined);
    await characteristic.handleSetRequest(true, undefined);
    expect(records(log).filter(record => record.event === 'Characteristic read' || record.event === 'Characteristic write')
      .every(record => record.direction === 'bridge -> HAP')).toBe(true);
    audit.dispose();
  });

  it('suppresses unchanged ordinary poll assignments but preserves changed and forced events', () => {
    const { log, characteristic, audit } = fixture();
    characteristic.subscribe();
    characteristic.updateValue(false);
    log.info.mockClear();
    characteristic.updateValue(false);
    expect(records(log)).toHaveLength(0);
    characteristic.updateValue(true);
    characteristic.sendEventNotification(true);
    expect(records(log)).toEqual([
      expect.objectContaining({ event: 'Characteristic update', outcome: 'submitted to HAP', value: true }),
      expect.objectContaining({ event: 'Characteristic event', outcome: 'submitted to HAP', value: true }),
    ]);
    characteristic.updateValue(false, { omitEventUpdate: true });
    expect(records(log)).toHaveLength(2);
    audit.dispose();
  });

  it('logs aggregate first/last subscription transitions without connection identifiers', () => {
    const { log, characteristic, audit } = fixture();
    characteristic.subscribe(); characteristic.subscribe();
    characteristic.unsubscribe(); characteristic.unsubscribe();
    expect(records(log)).toEqual([
      expect.objectContaining({ event: 'Notifications subscribed', outcome: 'active' }),
      expect.objectContaining({ event: 'Notifications unsubscribed', outcome: 'inactive' }),
    ]);
    audit.dispose();
  });

  it('observes new services and characteristics once and detaches removed instances', async () => {
    const { log, accessory, service, characteristic, audit } = fixture();
    audit.observe(accessory);
    await characteristic.handleGetRequest(connection);
    expect(records(log).filter(record => record.event === 'Characteristic read')).toHaveLength(2);
    const brightness = service.addCharacteristic(Characteristic.Brightness);
    await brightness.handleSetRequest(80, connection);
    expect(records(log)).toContainEqual(expect.objectContaining({ characteristic: 'Brightness', event: 'Characteristic write', value: 80 }));
    service.removeCharacteristic(brightness);
    log.info.mockClear();
    await brightness.handleSetRequest(30, connection);
    expect(records(log)).toHaveLength(0);
    const nextService = accessory.addService(Service.MotionSensor, 'Corner Motion Sensor');
    const motion = nextService.getCharacteristic(Characteristic.MotionDetected);
    motion.updateValue(true);
    expect(records(log)).toContainEqual(expect.objectContaining({ characteristic: 'Motion Detected', value: true }));
    accessory.removeService(nextService);
    log.info.mockClear(); motion.updateValue(false);
    expect(records(log)).toHaveLength(0);
    audit.dispose();
  });

  it('rescans services constructed inside a real camera controller and removes their hooks', async () => {
    const { log, accessory, audit } = fixture();
    const controller = new CameraController({
      cameraStreamCount: 1,
      delegate: { handleSnapshotRequest: jest.fn(), prepareStream: jest.fn(), handleStreamRequest: jest.fn() },
      streamingOptions: {
        supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: { codec: { profiles: [H264Profile.BASELINE], levels: [H264Level.LEVEL3_1] }, resolutions: [[320, 240, 15]] },
      },
    });
    accessory.configureController(controller);
    const cameraService = accessory.getService(Service.CameraRTPStreamManagement)!;
    const streamingStatus = cameraService.getCharacteristic(Characteristic.StreamingStatus);
    log.info.mockClear();
    await streamingStatus.handleGetRequest(connection);
    expect(records(log)).toContainEqual(expect.objectContaining({ event: 'Characteristic read', characteristic: 'Streaming Status', outcome: 'succeeded', value: '<redacted>' }));
    accessory.removeController(controller);
    log.info.mockClear();
    await streamingStatus.handleGetRequest(connection);
    expect(records(log)).toHaveLength(0);
    audit.dispose();
  });

  it('restores methods and listeners on disposal without overwriting later method replacements', async () => {
    const { log, accessory, characteristic, audit } = fixture();
    const replacement = jest.fn().mockResolvedValue(true);
    characteristic.handleGetRequest = replacement;
    audit.remove(accessory);
    expect(characteristic.handleGetRequest).toBe(replacement);
    expect(Object.hasOwn(characteristic, 'handleSetRequest')).toBe(false);
    expect(Object.hasOwn(accessory, 'addService')).toBe(false);
    characteristic.updateValue(true);
    expect(records(log)).toHaveLength(0);
    await expect(characteristic.handleGetRequest(connection)).resolves.toBe(true);
  });

  it('does not expose opaque values, serial labels, context, buffers or arbitrary errors', async () => {
    const { log, accessory, service, audit } = fixture();
    accessory.displayName = 'Corner DUMMY_SERIAL';
    service.displayName = 'Motion DUMMY_SERIAL';
    accessory.context.device.name = 'Renamed DUMMY_SERIAL\nCamera';
    const opaque = new Characteristic('Setup DUMMY_SERIAL', uuid.generate('opaque'), { format: Formats.TLV8, perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY] });
    service.addCharacteristic(opaque);
    opaque.onGet(() => Buffer.from('DUMMY_SRTP_SECRET').toString('base64'));
    await opaque.handleGetRequest(connection, { token: 'DUMMY_CONTEXT' });
    await opaque.handleSetRequest(Buffer.from('DUMMY_BUFFER_SECRET').toString('base64'), connection);
    opaque.sendEventNotification(Buffer.from('DUMMY_NOTIFY_SECRET').toString('base64'));
    opaque.onSet(() => { throw Object.assign(new Error('DUMMY_ERROR_SECRET'), { name: 'DUMMY_ERROR_NAME' }); });
    // HAP itself warns about arbitrary handler errors; the audit must only retain status.
    const hapWarning = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(opaque.handleSetRequest('AA==', connection)).rejects.toBe(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      hapWarning.mockRestore();
    }
    await expect(opaque.handleSetRequest(12345, connection)).rejects.toBe(HAPStatus.INVALID_VALUE_IN_REQUEST);
    logHomeKitEvent(log, accessory, { direction: 'Blink -> bridge', event: 'Motion detected', value: { token: 'DUMMY_OBJECT_SECRET' } });
    const output = JSON.stringify(records(log));
    for (const secret of ['DUMMY_SERIAL', 'DUMMY_SRTP_SECRET', 'DUMMY_BUFFER_SECRET', 'DUMMY_NOTIFY_SECRET', 'DUMMY_CONTEXT', 'DUMMY_ERROR_SECRET', 'DUMMY_ERROR_NAME', 'DUMMY_OBJECT_SECRET']) {
      expect(output).not.toContain(secret);
      expect(output).not.toContain(Buffer.from(secret).toString('base64'));
    }
    expect(records(log).every(record => record.accessory === 'Renamed <redacted> Camera')).toBe(true);
    expect(records(log).some(record => record.value === '<redacted>')).toBe(true);
    audit.dispose();
  });

  it('keeps logging failures observational and warns once for missing private hooks', async () => {
    const { log, accessory, characteristic, audit } = fixture();
    log.info.mockImplementation(() => { throw new Error('log unavailable'); });
    characteristic.onGet(() => true);
    await expect(characteristic.handleGetRequest(connection)).resolves.toBe(true);
    expect(() => characteristic.updateValue(false)).not.toThrow();
    audit.dispose();
    Object.defineProperty(characteristic, 'handleGetRequest', { configurable: true, value: undefined });
    const next = new HomeKitAudit(log);
    next.observe(accessory); next.observe(accessory);
    expect(log.warn).toHaveBeenCalledTimes(1);
    next.dispose();
  });

  it('redacts bare, bracketed and scoped address labels before masking overlapping device IDs', () => {
    const { log, accessory, audit } = fixture();
    accessory.context.device = { name: 'Camera 192.0.2.123 2001:db8::42', id: 123, network_id: 42 };
    logHomeKitEvent(log, accessory, {
      direction: 'Blink -> bridge', event: 'Motion detected',
      service: 'Camera at 198.51.100.44:8554',
      characteristic: 'Notification [2001:db8:1::99] [fe80::abcd%en0]',
      outcome: 'Source https://203.0.113.7/DUMMY_PRIVATE_CAPABILITY',
    });
    const entry = records(log)[0];
    expect(entry.accessory).toBe('Camera <redacted> <redacted>');
    expect(entry.service).toBe('Camera at <redacted>:8554');
    expect(entry.characteristic).toBe('Notification [<redacted>] [<redacted>]');
    const output = JSON.stringify(entry);
    for (const address of ['192.0.2.123', '2001:db8::42', '198.51.100.44', '2001:db8:1::99', 'fe80::abcd%en0', '203.0.113.7']) {
      expect(output).not.toContain(address);
    }
    expect(output).not.toContain('DUMMY_PRIVATE_CAPABILITY');
    audit.dispose();
  });

  it('retains ordinary friendly text and dotted labels that are not IP addresses', () => {
    const { log, accessory, audit } = fixture();
    accessory.context.device.name = 'Kitchen Camera firmware 1.2.3.999';
    logHomeKitEvent(log, accessory, { direction: 'Blink -> bridge', event: 'Motion detected', service: 'Kitchen Motion Sensor' });
    expect(records(log)[0]).toEqual(expect.objectContaining({
      accessory: 'Kitchen Camera firmware 1.2.3.999', service: 'Kitchen Motion Sensor', event: 'Motion detected',
    }));
    audit.dispose();
  });

  it('correlates an authenticated request, its native change and its response without raw identity', async () => {
    const { log, characteristic, audit } = fixture();
    const controller = peer('DUMMY_AUTHENTICATED_PAIRING');
    await characteristic.handleSetRequest(true, controller);
    const entries = records(log);
    expect(entries).toHaveLength(3);
    const origin = { controllerPairing: entries[0].controllerPairing, controllerConnection: entries[0].controllerConnection };
    expect(origin.controllerPairing).toMatch(/^pairing-[0-9a-f]{32}$/);
    expect(origin.controllerConnection).toMatch(/^connection-[0-9a-f]{32}$/);
    expect(entries.every(entry => entry.controllerPairing === origin.controllerPairing
      && entry.controllerConnection === origin.controllerConnection)).toBe(true);
    expect(characteristic.value).toBe(true);
    expect(JSON.stringify(entries)).not.toContain('DUMMY_AUTHENTICATED_PAIRING');
    audit.dispose();
  });

  it('shares runtime pairing aliases across audit instances while separating reconnects and other pairings', async () => {
    const first = fixture();
    const firstPeer = peer('DUMMY_SHARED_PAIRING');
    await first.characteristic.handleGetRequest(firstPeer);
    const initial = records(first.log)[0];
    const second = fixture();
    await second.characteristic.handleGetRequest(firstPeer);
    expect(records(second.log)[0]).toEqual(expect.objectContaining({
      controllerPairing: initial.controllerPairing, controllerConnection: initial.controllerConnection,
    }));
    second.log.info.mockClear();
    // Several devices or a hub can share a pairing: this is not device identity.
    await second.characteristic.handleGetRequest(peer('DUMMY_SHARED_PAIRING'));
    const reconnected = records(second.log)[0];
    expect(reconnected.controllerPairing).toBe(initial.controllerPairing);
    expect(reconnected.controllerConnection).not.toBe(initial.controllerConnection);
    second.log.info.mockClear();
    await second.characteristic.handleGetRequest(peer('DUMMY_OTHER_PAIRING'));
    expect(records(second.log)[0].controllerPairing).not.toBe(initial.controllerPairing);
    first.audit.dispose(); second.audit.dispose();
  });

  it('keeps captured origins on reverse-completing successes and failures despite changed peer metadata', async () => {
    const { log, characteristic, audit } = fixture();
    const waiting: Array<{ resolve: () => void; reject: (error: number) => void }> = [];
    characteristic.onSet(() => new Promise<void>((resolve, reject) => waiting.push({ resolve, reject })));
    const firstPeer = peer('DUMMY_FIRST_PAIRING');
    const secondPeer = peer('DUMMY_SECOND_PAIRING');
    const first = characteristic.handleSetRequest(true, firstPeer);
    const second = characteristic.handleSetRequest(false, secondPeer);
    const requested = records(log).filter(entry => entry.outcome === 'requested');
    Object.assign(firstPeer, { username: 'DUMMY_CHANGED_PAIRING', isAuthenticated: () => false });
    Object.assign(secondPeer, { username: 'DUMMY_CHANGED_SECOND_PAIRING', isAuthenticated: () => false });
    waiting[1].resolve(); await second;
    waiting[0].reject(HAPStatus.OPERATION_TIMED_OUT);
    await expect(first).rejects.toBe(HAPStatus.OPERATION_TIMED_OUT);
    const receipts = records(log).filter(entry => entry.event === 'Characteristic write' && entry.outcome !== 'requested');
    expect(receipts.map(entry => [entry.controllerPairing, entry.controllerConnection])).toEqual([
      [requested[1].controllerPairing, requested[1].controllerConnection],
      [requested[0].controllerPairing, requested[0].controllerConnection],
    ]);
    expect(receipts.map(entry => entry.outcome)).toEqual(['succeeded', 'failed']);
    expect(characteristic.value).toBe(false);
    expect(JSON.stringify(records(log))).not.toContain('DUMMY_CHANGED_PAIRING');
    expect(JSON.stringify(records(log))).not.toContain('DUMMY_CHANGED_SECOND_PAIRING');
    audit.dispose();
  });

  it.each([
    ['missing metadata', () => ({})],
    ['unauthenticated pairing', () => ({ username: 'DUMMY_UNAUTHENTICATED', isAuthenticated: () => false })],
    ['blank username', () => ({ username: '   ', isAuthenticated: () => true })],
    ['non-string username', () => ({ username: 42, isAuthenticated: () => true })],
    ['throwing authentication', () => ({ isAuthenticated: () => { throw new Error('DUMMY_AUTH_ERROR'); } })],
    ['throwing username', () => ({ isAuthenticated: () => true, get username() { throw new Error('DUMMY_USERNAME_ERROR'); } })],
  ])('records unknown pairing for %s without changing read behavior', async (_description, makePeer) => {
    const { log, characteristic, audit } = fixture();
    await expect(characteristic.handleGetRequest(makePeer() as unknown as typeof connection)).resolves.toBe(false);
    expect(records(log).every(entry => entry.controllerPairing === 'unknown'
      && /^connection-[0-9a-f]{32}$/.test(String(entry.controllerConnection)))).toBe(true);
    expect(JSON.stringify(records(log))).not.toMatch(/DUMMY_UNAUTHENTICATED|DUMMY_AUTH_ERROR|DUMMY_USERNAME_ERROR/);
    audit.dispose();
  });

  it('never reads session, address or key metadata and leaves unrelated events unattributed', async () => {
    jest.useFakeTimers();
    const { log, characteristic, audit } = fixture();
    const forbidden = jest.fn(() => { throw new Error('DUMMY_PRIVATE_CONNECTION_FIELD'); });
    const controller = peer('DUMMY_SAFE_PAIRING');
    for (const key of ['sessionID', 'remoteAddress', 'localAddress', 'remotePort', 'localPort', 'publicKey', 'encryption']) {
      Object.defineProperty(controller, key, { get: forbidden });
    }
    await characteristic.handleSetRequest(true, controller, { username: 'DUMMY_CONTEXT_IDENTITY' });
    expect(forbidden).not.toHaveBeenCalled();
    log.info.mockClear();
    await characteristic.handleGetRequest(undefined);
    characteristic.updateValue(false);
    characteristic.sendEventNotification(true);
    setTimeout(() => characteristic.updateValue(false), 100);
    jest.advanceTimersByTime(100);
    characteristic.subscribe(); characteristic.unsubscribe();
    expect(records(log).length).toBeGreaterThan(0);
    expect(records(log).every(entry => !Object.hasOwn(entry, 'controllerPairing') && !Object.hasOwn(entry, 'controllerConnection'))).toBe(true);
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(records(log))).not.toContain('DUMMY_CONTEXT_IDENTITY');
    audit.dispose();
  });

  it('rejects accidental raw identity and address values supplied as writer aliases', () => {
    const { log, accessory, audit } = fixture();
    for (const raw of ['DUMMY_RAW_USERNAME', 'DUMMY_RAW_SESSION_ID', '12345678-1234-1234-1234-123456789ABC', '192.0.2.123', '2001:db8::42',
      'pairing-NOT_HEX', 'pairing-012345', 'connection-0123456789abcdef0123456789ABCDEF']) {
      logHomeKitEvent(log, accessory, { direction: 'Blink -> bridge', event: 'Motion detected', controllerPairing: raw, controllerConnection: raw });
    }
    expect(records(log).every(entry => !Object.hasOwn(entry, 'controllerPairing') && !Object.hasOwn(entry, 'controllerConnection'))).toBe(true);
    audit.dispose();
  });

  it('changes pairing and connection aliases when the audit module starts fresh', async () => {
    const { log, accessory, characteristic, audit } = fixture();
    const controller = peer('DUMMY_RESTART_PAIRING');
    await characteristic.handleGetRequest(controller);
    const before = records(log)[0];
    audit.dispose(); log.info.mockClear();
    let FreshAudit = HomeKitAudit;
    jest.isolateModules(() => {
      FreshAudit = jest.requireActual<typeof import('../src/homekit-audit')>('../src/homekit-audit').HomeKitAudit;
    });
    const fresh = new FreshAudit(log);
    fresh.observe(accessory);
    await characteristic.handleGetRequest(controller);
    const after = records(log)[0];
    expect(after.controllerPairing).toMatch(/^pairing-[0-9a-f]{32}$/);
    expect(after.controllerPairing).not.toBe(before.controllerPairing);
    expect(after.controllerConnection).not.toBe(before.controllerConnection);
    fresh.dispose();
  });
});
