import { API } from 'homebridge';
import plugin = require('../src');

describe('plugin entry', () => {
  it('registers the platform', () => {
    const registerPlatform = jest.fn();
    const api = { registerPlatform } as unknown as API;

    plugin(api);

    expect(registerPlatform).toHaveBeenCalledWith(
      '@sealad886/homebridge-blink-cameras-new-api',
      'BlinkCameras',
      expect.any(Function),
    );
  });
});
