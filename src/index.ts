import { API } from 'homebridge';
import { BlinkCamerasPlatform, PLATFORM_NAME, PLUGIN_NAME } from './platform';

export = (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BlinkCamerasPlatform);
};
