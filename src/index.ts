import { API } from 'homebridge';
import { BlinkCamerasPlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export = (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BlinkCamerasPlatform);
};
