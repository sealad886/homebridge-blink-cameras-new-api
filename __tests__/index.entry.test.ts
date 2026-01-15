import plugin from '../src';
import { API } from 'homebridge';

describe('plugin entry', () => {
  it('registers the platform', () => {
    const registerPlatform = jest.fn();
    const api = { registerPlatform } as unknown as API;

    plugin(api);

    expect(registerPlatform).toHaveBeenCalledWith(
      'homebridge-blink-cameras-new-api',
      'BlinkCameras',
      expect.any(Function),
    );
  });
});
