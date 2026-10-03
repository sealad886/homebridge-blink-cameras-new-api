import { validateHomescreen } from '../../src/blink-api/domain-validation';
import { BlinkCamerasPlatform } from '../../src/platform';
import { BlinkApi } from '../../src/blink-api';
import { createApi, createLogger } from '../helpers/homebridge';
import type { API, Logger } from 'homebridge';

jest.mock('../../src/blink-api');

const homescreen = () => ({ networks: [{ id: 1, name: 'Home', armed: true }],
  cameras: [{ id: 2, network_id: 1, name: 'Camera', enabled: true }],
  owls: [{ id: 3, network_id: 1, name: 'Owl', enabled: true }],
  doorbells: [{ id: 4, network_id: 1, name: 'Doorbell', enabled: true }] });

describe('canonical homescreen names', () => {
  it.each(['networks', 'cameras', 'owls', 'doorbells'] as const)('requires a bounded name for %s', kind => {
    const valid = homescreen();
    expect(validateHomescreen(valid)).toBe(valid);
    for (const name of [undefined, null, 123, 'x'.repeat(257)]) {
      const invalid = { ...valid, [kind]: [{ ...valid[kind][0], name }] };
      expect(() => validateHomescreen(invalid)).toThrow('invalid homescreen');
    }
    expect(() => validateHomescreen({ ...valid, [kind]: [{ ...valid[kind][0], name: 'x'.repeat(256) }] })).not.toThrow();
  });

  it('rejects missing names before Homebridge expands any device in the returned inventory', async () => {
    const screen = { ...homescreen(), doorbells: [{ id: 4, network_id: 1, enabled: true }] };
    const login = jest.fn().mockResolvedValue(undefined);
    const getHomescreen = jest.fn().mockResolvedValue(screen);
    (BlinkApi as jest.Mock).mockImplementation(() => ({ login, getHomescreen }));
    const api = createApi();
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger,
      { platform: 'BlinkCameras', persistAuth: false, enableStreaming: false, videoEncoder: 'libx264' }, api as unknown as API);
    try {
      api.emit('didFinishLaunching');
      await new Promise(resolve => setImmediate(resolve));
      expect(getHomescreen).toHaveBeenCalledTimes(1);
      expect(platform.accessories.filter(accessory => accessory.context.device)).toHaveLength(0);
      expect(platform.isOperational()).toBe(false);
    } finally { api.emit('shutdown'); }
  });
});
