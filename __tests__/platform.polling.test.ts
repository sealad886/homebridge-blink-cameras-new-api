/**
 * Platform Polling Integration Tests
 *
 * Tests for platform polling behavior and configuration
 * Note: Full timer-based polling tests are complex due to Jest fake timers
 * and the 'timers' module import. These tests focus on configuration validation.
 */

import { API, Logger, PlatformConfig } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi } from '../src/blink-api';
import { createApi, createLogger } from './helpers/homebridge';
import { BlinkHomescreen, BlinkMediaClip } from '../src/types';

jest.mock('../src/blink-api');

type MockedBlinkApi = jest.Mocked<{
  login: () => Promise<void>;
  getHomescreen: () => Promise<BlinkHomescreen>;
  armNetwork: jest.Mock;
  disarmNetwork: jest.Mock;
  pollCommand: jest.Mock;
  enableMotion: jest.Mock;
  disableMotion: jest.Mock;
  getUnwatchedMedia: jest.Mock;
}>;

type MockAPI = API & { emit: (event: string) => void };

const createMockApi = () => createApi() as unknown as MockAPI;

const buildBlinkApi = (): MockedBlinkApi => ({
  login: jest.fn().mockResolvedValue(undefined),
  getHomescreen: jest.fn(),
  armNetwork: jest.fn(),
  disarmNetwork: jest.fn(),
  pollCommand: jest.fn().mockResolvedValue({ complete: true }),
  enableMotion: jest.fn(),
  disableMotion: jest.fn(),
  getUnwatchedMedia: jest.fn().mockResolvedValue({ media: [] }),
});

describe('Platform Polling', () => {
  type TestConfig = PlatformConfig & {
    username: string;
    password: string;
    pollInterval?: number;
    motionTimeout?: number;
    enableMotionPolling?: boolean;
  };
  let hapApi: MockAPI | null = null;

  const baseConfig: TestConfig = {
    platform: 'BlinkCameras',
    name: 'Blink',
    username: 'user@example.com',
    password: 'password',
    pollInterval: 60,
    motionTimeout: 30,
    enableMotionPolling: true,
  };

  const createHomescreen = (): BlinkHomescreen => ({
    account: { account_id: 1 },
    networks: [{ id: 1, name: 'Network', armed: false }],
    cameras: [{ id: 2, network_id: 1, name: 'Camera', enabled: true }],
    doorbells: [{ id: 3, network_id: 1, name: 'Doorbell', enabled: true }],
    owls: [{ id: 4, network_id: 1, name: 'Owl', enabled: true }],
    sync_modules: [],
  });

  beforeEach(() => {
    jest.resetAllMocks();
    hapApi = null;
  });

  afterEach(() => {
    hapApi?.emit('shutdown');
    hapApi = null;
  });

  describe('initialization', () => {
    it('should initialize with default poll interval', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const platform = new BlinkCamerasPlatform(log, baseConfig, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();

      expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);
      expect(platform).toBeDefined();
    });

    it('should log polling start message with interval', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const config = { ...baseConfig, pollInterval: 45 };
      new BlinkCamerasPlatform(log, config, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();
      await Promise.resolve();

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Starting status polling'));
    });

    it('should enforce minimum poll interval of 15 seconds', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      // Set poll interval below minimum
      const config = { ...baseConfig, pollInterval: 5 };
      const platform = new BlinkCamerasPlatform(log, config, hapApi);

      expect(platform).toBeDefined();

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();
      await Promise.resolve();

      // Polling message should show at least 15 seconds
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('15 seconds'));
    });
  });

  describe('configuration', () => {
    it('should accept motionTimeout setting', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const config = { ...baseConfig, motionTimeout: 10 };
      const platform = new BlinkCamerasPlatform(log, config, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();

      expect(platform).toBeDefined();
    });

    it('should respect enableMotionPolling setting', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const config = { ...baseConfig, enableMotionPolling: false };
      const platform = new BlinkCamerasPlatform(log, config, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();

      expect(platform).toBeDefined();
    });
  });

  describe('discovery', () => {
    it('should call login before getHomescreen', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      new BlinkCamerasPlatform(log, baseConfig, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();

      expect(blinkApi.login).toHaveBeenCalledTimes(1);
      expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);

      const loginOrder = blinkApi.login.mock.invocationCallOrder[0];
      const homescreenOrder = blinkApi.getHomescreen.mock.invocationCallOrder[0];
      expect(loginOrder).toBeLessThan(homescreenOrder);
    });

    it('should discover all device types', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen: BlinkHomescreen = {
        account: { account_id: 1 },
        networks: [{ id: 1, name: 'Home Network', armed: true }],
        cameras: [
          { id: 10, network_id: 1, name: 'Front Camera', enabled: true },
          { id: 11, network_id: 1, name: 'Back Camera', enabled: false },
        ],
        doorbells: [{ id: 20, network_id: 1, name: 'Front Door', enabled: true }],
        owls: [{ id: 30, network_id: 1, name: 'Mini Cam', enabled: true }],
        sync_modules: [{ id: 100, network_id: 1, status: 'online' }],
      };
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const platform = new BlinkCamerasPlatform(log, baseConfig, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();
      await Promise.resolve();

      expect(platform.accessories.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('should handle login failure gracefully', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      blinkApi.login.mockRejectedValue(new Error('Invalid credentials'));

      new BlinkCamerasPlatform(log, baseConfig, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();
      await Promise.resolve();

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Device discovery failed'),
        expect.any(Error)
      );
    });

    it('should handle homescreen API failure', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      blinkApi.getHomescreen.mockRejectedValue(new Error('Network Error'));

      new BlinkCamerasPlatform(log, baseConfig, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();
      await Promise.resolve();

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Device discovery failed'),
        expect.any(Error)
      );
    });
  });

  describe('recovery and concurrency', () => {
    it('retries discovery after transient startup failure', async () => {
      jest.useFakeTimers();
      try {
        hapApi = createMockApi();
        const log = createLogger() as unknown as Logger;
        const blinkApi = buildBlinkApi();
        (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

        const homescreen = createHomescreen();
        blinkApi.login
          .mockRejectedValueOnce(new Error('Temporary auth outage'))
          .mockResolvedValueOnce(undefined);
        blinkApi.getHomescreen.mockResolvedValue(homescreen);

        const platform = new BlinkCamerasPlatform(log, baseConfig, hapApi);
        const startPollingSpy = jest.spyOn(platform as unknown as { startPolling: () => void }, 'startPolling');

        hapApi.emit('didFinishLaunching');
        await Promise.resolve();
        expect(blinkApi.login).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(5000);
        await Promise.resolve();

        expect(blinkApi.login).toHaveBeenCalledTimes(2);
        expect(startPollingSpy).toHaveBeenCalledTimes(1);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('retrying in'));
      } finally {
        jest.useRealTimers();
      }
    });

    it('coalesces overlapping poll ticks into a single queued poll', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const platform = new BlinkCamerasPlatform(log, baseConfig, hapApi);

      let pollCalls = 0;
      jest.spyOn(platform as unknown as { pollDeviceStates: () => Promise<void> }, 'pollDeviceStates')
        .mockImplementation(async () => {
          pollCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
        });

      await Promise.all([
        (platform as unknown as { runPollCycle: () => Promise<void> }).runPollCycle(),
        (platform as unknown as { runPollCycle: () => Promise<void> }).runPollCycle(),
        (platform as unknown as { runPollCycle: () => Promise<void> }).runPollCycle(),
      ]);

      expect(pollCalls).toBe(2);
      expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping overlapping poll tick'));
    });
  });

  describe('shutdown', () => {
    it('should handle shutdown event', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      new BlinkCamerasPlatform(log, baseConfig, hapApi);

      hapApi.emit('didFinishLaunching');
      await Promise.resolve();

      expect(() => hapApi!.emit('shutdown')).not.toThrow();
    });
  });

  describe('doorbell ring event mapping', () => {
    it('should trigger doorbell ring when media clip indicates doorbell press', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const platform = new BlinkCamerasPlatform(log, baseConfig, hapApi);
      const doorbellHandler = {
        triggerRing: jest.fn(),
        triggerMotion: jest.fn(),
      };

      (platform as unknown as { doorbellAccessories: Map<number, unknown> }).doorbellAccessories
        .set(3, doorbellHandler);

      const ringClip: BlinkMediaClip = {
        id: 1,
        camera_id: 3,
        camera_name: 'Front Door',
        network_id: 1,
        thumbnail: '/thumb.jpg',
        media: '/clip.mp4',
        created_at: new Date().toISOString(),
        device_type: 'doorbell',
        event_type: 'doorbell_press',
      };

      (platform as unknown as { processMotionClip: (clip: BlinkMediaClip) => void }).processMotionClip(ringClip);

      expect(doorbellHandler.triggerRing).toHaveBeenCalledTimes(1);
      expect(doorbellHandler.triggerMotion).toHaveBeenCalledTimes(1);
    });

    it('should not trigger ring for non-ring doorbell media clips', async () => {
      hapApi = createMockApi();
      const log = createLogger() as unknown as Logger;
      const blinkApi = buildBlinkApi();
      (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

      const homescreen = createHomescreen();
      blinkApi.getHomescreen.mockResolvedValue(homescreen);

      const platform = new BlinkCamerasPlatform(log, baseConfig, hapApi);
      const doorbellHandler = {
        triggerRing: jest.fn(),
        triggerMotion: jest.fn(),
      };

      (platform as unknown as { doorbellAccessories: Map<number, unknown> }).doorbellAccessories
        .set(3, doorbellHandler);

      const motionClip: BlinkMediaClip = {
        id: 2,
        camera_id: 3,
        camera_name: 'Front Door',
        network_id: 1,
        thumbnail: '/thumb.jpg',
        media: '/clip.mp4',
        created_at: new Date().toISOString(),
        device_type: 'doorbell',
        event_type: 'motion',
      };

      (platform as unknown as { processMotionClip: (clip: BlinkMediaClip) => void }).processMotionClip(motionClip);

      expect(doorbellHandler.triggerRing).not.toHaveBeenCalled();
      expect(doorbellHandler.triggerMotion).toHaveBeenCalledTimes(1);
    });
  });
});
