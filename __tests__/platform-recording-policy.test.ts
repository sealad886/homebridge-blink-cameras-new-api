import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { API, Logger, PlatformConfig } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi as BlinkApiConstructor } from '../src/blink-api';
import { BlinkApi } from '../src/blink-api/client';
import type { BlinkAuth } from '../src/blink-api/auth';
import { FcmEventSource, type FcmEventSourceOptions } from '../src/blink-api/fcm/source';
import { NativeRecordingRuntime, type NativeRecordingRuntimeState } from '../src/native-recording-runtime';
import type { BlinkHomescreen } from '../src/types';
import { createApi, createLogger, MockCharacteristic } from './helpers/homebridge';

jest.mock('../src/blink-api', () => ({ BlinkApi: jest.fn() }));
jest.mock('../src/blink-api/fcm/source');

const emptyHomescreen = (): BlinkHomescreen => ({
  account: { account_id: 10 }, networks: [{ id: 20, name: 'Home', armed: false }],
  sync_modules: [{ id: 30, network_id: 20, status: 'online' }], cameras: [], doorbells: [], owls: [],
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Platform did not finish discovery');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

describe('platform native recording and ordinary command ownership', () => {
  let directory: string;
  let api: ReturnType<typeof createApi>;
  let client: BlinkApi;
  let source: { setDemand: jest.Mock; stop: jest.Mock };
  let createRuntime: jest.SpyInstance<ReturnType<typeof NativeRecordingRuntime.create>, Parameters<typeof NativeRecordingRuntime.create>>;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-platform-policy-'));
    api = createApi();
    Object.assign(api, { user: { storagePath: () => directory } });
    client = new BlinkApi({ email: '', password: '', hardwareId: 'offline-platform', tier: 'u001', sharedTier: 'e001' });
    const internals = client as unknown as { auth: BlinkAuth; accountId: number };
    internals.accountId = 10;
    jest.spyOn(internals.auth, 'ensureValidToken').mockResolvedValue(undefined);
    jest.spyOn(internals.auth, 'getPersistedTier').mockResolvedValue('u001');
    jest.spyOn(internals.auth, 'getAccountId').mockReturnValue(10);
    jest.spyOn(internals.auth, 'getClientId').mockReturnValue(11);
    jest.spyOn(internals.auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer offline-fixture' });
    jest.spyOn(client, 'login').mockResolvedValue(undefined);
    (BlinkApiConstructor as jest.Mock).mockImplementation(() => client);
    source = { setDemand: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) };
    (FcmEventSource as jest.Mock).mockImplementation(() => source);
    createRuntime = jest.spyOn(NativeRecordingRuntime, 'create');
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
  });

  afterEach(async () => {
    api.emit('shutdown');
    for (const result of createRuntime.mock.results) {
      if (result.type === 'return') await (await result.value as NativeRecordingRuntime).stop();
    }
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function launch(homescreen: BlinkHomescreen, config: PlatformConfig = { platform: 'BlinkCameras' }) {
    const log = createLogger();
    jest.spyOn(client, 'getHomescreen').mockResolvedValue(homescreen);
    const platform = new BlinkCamerasPlatform(log as unknown as Logger,
      { name: 'Blink', enableStreaming: false, persistAuth: false, exposeMotionDetected: false, ...config }, api as unknown as API);
    api.emit('didFinishLaunching');
    await waitFor(() => source.setDemand.mock.calls.length > 0 || log.error.mock.calls.length > 0);
    expect(log.error).not.toHaveBeenCalled();
    expect(platform.isOperational()).toBe(true);
    return platform;
  }

  async function refresh(platform: BlinkCamerasPlatform, homescreen: BlinkHomescreen): Promise<void> {
    jest.mocked(client.getHomescreen).mockResolvedValue(homescreen);
    const accessory = platform.accessories.find(item => item.context.blinkConnectionRetry)!;
    const retry = accessory.getServiceById(platform.Service.Switch, 'blink-connection-retry')!
      .getCharacteristic(platform.Characteristic.On) as unknown as MockCharacteristic;
    await expect(retry.onSetHandler!(true)).resolves.toBeUndefined();
  }

  it.each([false, true])('persists network arm/disarm without eligible cameras (all excluded: %s)', async excluded => {
    const homescreen = emptyHomescreen();
    if (excluded) homescreen.cameras.push({ id: 40, network_id: 20, name: 'Entry', enabled: true });
    const platform = await launch(homescreen, { platform: 'BlinkCameras', excludeDevices: excluded ? ['camera:40'] : [] });
    expect(createRuntime.mock.calls[0][0].devices).toEqual([]);
    expect(source.setDemand).toHaveBeenCalledWith({ motionAccessory: false, hsv: false });
    expect(fetch).not.toHaveBeenCalled();

    const statePath = path.join(directory, '.blink-native-recording', '10-11-u001', 'state.json');
    const intents: string[] = [];
    jest.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST' && /\/networks\/20\/state\/(arm|disarm)$/.test(url)) {
        const kind = url.endsWith('/arm') ? 'arm' : 'disarm';
        const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as NativeRecordingRuntimeState;
        expect(state.remoteOperations?.stateCommand).toMatchObject({ accountId: 10, networkId: 20, kind, phase: 'starting' });
        intents.push(kind);
        return new globalThis.Response(JSON.stringify({ id: 70 + intents.length }), { status: 200 });
      }
      if (init?.method === 'GET' && /\/accounts\/10\/networks\/20\/commands\/7[12]$/.test(url)) {
        return new globalThis.Response(JSON.stringify({ complete: true, status: 0 }), { status: 200 });
      }
      throw new Error('Unexpected provider request');
    });
    const accessory = platform.accessories.find(item => item.UUID === api.hap.uuid.generate('blink-network-20'))!;
    const service = accessory.getService(api.hap.Service.SecuritySystem)!;
    const target = service.getCharacteristic(platform.Characteristic.SecuritySystemTargetState) as unknown as MockCharacteristic;
    await expect(target.onSetHandler!(api.hap.Characteristic.SecuritySystemTargetState.AWAY_ARM)).resolves.toBeUndefined();
    await expect(target.onSetHandler!(api.hap.Characteristic.SecuritySystemTargetState.DISARM)).resolves.toBeUndefined();
    expect(intents).toEqual(['arm', 'disarm']);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(client.getRemoteOperationState()).toMatchObject({ storage: [], persistenceFailed: false });
    expect(client.getRemoteOperationState().stateCommand).toBeUndefined();
    const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as NativeRecordingRuntimeState;
    expect(state.remoteOperations?.stateCommand).toBeUndefined();
    expect(state.nativeByModule).toEqual({});
    expect(state.downloads).toEqual([]);
  });

  it('keeps excluded identities in the matching inventory while filtering event and delivery consumers', async () => {
    const homescreen = emptyHomescreen();
    homescreen.networks.push({ id: 21, name: 'Away', armed: false });
    homescreen.sync_modules.push({ id: 31, network_id: 21, status: 'online' });
    homescreen.cameras.push(
      { id: 40, network_id: 20, name: 'Entry', enabled: true },
      { id: 41, network_id: 20, name: 'Entry', enabled: true },
    );
    homescreen.doorbells.push({ id: 40, network_id: 20, name: 'Entry', enabled: true });
    homescreen.owls.push({ id: 40, network_id: 21, name: 'Entry', enabled: true });
    await launch(homescreen, { platform: 'BlinkCameras', excludeDevices: ['camera:41', 'doorbell:40'], excludedNetworks: ['21'] });
    const options = createRuntime.mock.calls[0][0];
    expect(options.devices.map(item => item.binding.cameraId)).toEqual(['camera:40']);
    expect(options.matchingDevices).toEqual([
      { accountId: 10, networkId: 20, providerId: 40, target: 'camera', cameraId: 'camera:40', nativeName: 'Entry', moduleId: '20:30', syncModuleId: 30 },
      { accountId: 10, networkId: 20, providerId: 41, target: 'camera', cameraId: 'camera:41', nativeName: 'Entry', moduleId: '20:30', syncModuleId: 30 },
      { accountId: 10, networkId: 20, providerId: 40, target: 'doorbell', cameraId: 'doorbell:40', nativeName: 'Entry', moduleId: '20:30', syncModuleId: 30 },
      { accountId: 10, networkId: 21, providerId: 40, target: 'owl', cameraId: 'owl:40', nativeName: 'Entry', moduleId: '21:31', syncModuleId: 31 },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['rename', 'addition', 'removal', 'module'] as const)(
    'replaces the scoped runtime after an excluded-camera inventory %s', async change => {
      const homescreen = emptyHomescreen();
      homescreen.cameras.push({ id: 40, network_id: 20, name: 'Entry', enabled: true });
      if (change !== 'addition') homescreen.cameras.push({ id: 41, network_id: 20, name: 'Garage', enabled: true });
      const platform = await launch(homescreen, { platform: 'BlinkCameras', excludeDevices: ['camera:41'] });
      const original = await createRuntime.mock.results[0].value as NativeRecordingRuntime;
      const stop = jest.spyOn(original, 'stop');
      const next = globalThis.structuredClone(homescreen);
      if (change === 'rename') next.cameras[1].name = 'Entry';
      if (change === 'addition') next.cameras.push({ id: 41, network_id: 20, name: 'Entry', enabled: true });
      if (change === 'removal') next.cameras.pop();
      if (change === 'module') next.sync_modules[0].id = 31;

      await refresh(platform, next);

      expect(stop).toHaveBeenCalledTimes(1);
      expect(createRuntime).toHaveBeenCalledTimes(2);
      const options = createRuntime.mock.calls[1][0];
      expect(options.devices.map(device => device.binding.cameraId)).toEqual(['camera:40']);
      expect(options.matchingDevices.map(device => [device.cameraId, device.nativeName, device.syncModuleId]))
        .toEqual(next.cameras.map(device => [`camera:${device.id}`, device.name, next.sync_modules[0].id]));
      expect(source.setDemand).toHaveBeenCalledTimes(2);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('reuses the runtime when only camera ordering or volatile status changes', async () => {
    const homescreen = emptyHomescreen();
    homescreen.cameras.push(
      { id: 40, network_id: 20, name: 'Entry', enabled: true },
      { id: 41, network_id: 20, name: 'Garage', enabled: true },
    );
    const platform = await launch(homescreen, { platform: 'BlinkCameras', excludeDevices: ['camera:41'] });
    const original = await createRuntime.mock.results[0].value as NativeRecordingRuntime;
    const stop = jest.spyOn(original, 'stop');
    const next = globalThis.structuredClone(homescreen);
    next.cameras.reverse();
    next.cameras[0].battery = 'ok';
    next.cameras[1].updated_at = new Date().toISOString();
    next.networks[0].armed = true;
    next.sync_modules[0].status = 'online-refreshed';

    await refresh(platform, next);

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(source.setDemand).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['addition', 'rebind'] as const)('refreshes a motion-only consumer after %s without native storage', async change => {
    const homescreen = emptyHomescreen();
    homescreen.sync_modules = [];
    homescreen.networks.push({ id: 21, name: 'Away', armed: false });
    if (change === 'rebind') homescreen.owls.push({ id: 40, network_id: 20, name: 'Entry', enabled: true });
    const platform = await launch(homescreen, { platform: 'BlinkCameras', exposeMotionDetected: true });
    const original = await createRuntime.mock.results[0].value as NativeRecordingRuntime;
    const stop = jest.spyOn(original, 'stop');
    const next = globalThis.structuredClone(homescreen);
    next.owls = [{ id: 40, network_id: change === 'addition' ? 20 : 21, name: 'Entry', enabled: true }];

    await refresh(platform, next);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(createRuntime).toHaveBeenCalledTimes(2);
    const options = createRuntime.mock.calls[1][0];
    expect(options.matchingDevices).toEqual([]);
    expect(options.devices).toHaveLength(1);
    const consumer = options.devices[0];
    expect(consumer.nativeStorage).toBeUndefined();
    expect(consumer.binding).toMatchObject({ cameraId: 'owl:40', networkId: next.owls[0].network_id });
    const motion = jest.spyOn(consumer, 'motion');
    const receiver = (FcmEventSource as jest.Mock).mock.calls.at(-1)![0] as FcmEventSourceOptions;
    const notify = (network: number) => receiver.onNotification({
      persistentMessageId: `motion-${network}`, scope: { accountId: 10, clientId: 11, tier: 'u001' },
      receivedAt: Date.now(), activatedAt: Date.now(),
      data: { category: 'motion', event_type: 'cloud_motion', camera: '40', target: 'owl', network: String(network),
        created_at: new Date().toISOString() },
    }, new globalThis.AbortController().signal);
    if (change === 'rebind') {
      await notify(20);
      expect(motion).not.toHaveBeenCalled();
    }
    await notify(next.owls[0].network_id);
    expect(motion).toHaveBeenCalledTimes(1);
    expect(source.setDemand).toHaveBeenLastCalledWith({ motionAccessory: true, hsv: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
