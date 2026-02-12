/* eslint-disable @typescript-eslint/no-explicit-any */
import { HAP, SnapshotRequest, SnapshotRequestCallback } from 'homebridge';
import { Buffer } from 'node:buffer';
import {
  BlinkCameraSource,
  __cameraSourceTestUtils,
  createCameraControllerOptions,
  createSnapshotControllerOptions,
} from '../../src/accessories/camera-source';
import { BlinkApi } from '../../src/blink-api';

// Mock fetch globally
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

describe('BlinkCameraSource', () => {
  let mockApi: {
    requestCameraThumbnail: jest.Mock;
    requestOwlThumbnail: jest.Mock;
    requestDoorbellThumbnail: jest.Mock;
    pollCommand: jest.Mock;
    getSharedRestRootUrl: jest.Mock;
    getAuthHeaders: jest.Mock;
    startCameraLiveview: jest.Mock;
    completeCommand: jest.Mock;
    updateCommand: jest.Mock;
    getCommandStatus: jest.Mock;
  };
  let mockHap: jest.Mocked<Partial<HAP>>;
  let mockLogger: jest.Mock;
  let getThumbnailUrl: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApi = {
      requestCameraThumbnail: jest.fn(),
      requestOwlThumbnail: jest.fn(),
      requestDoorbellThumbnail: jest.fn(),
      pollCommand: jest.fn(),
      getSharedRestRootUrl: jest.fn().mockReturnValue('https://rest-prod.immedia-semi.com/'),
      getAuthHeaders: jest.fn().mockReturnValue({ 'TOKEN_AUTH': 'test-token', 'ACCOUNT_ID': '12345' }),
      startCameraLiveview: jest.fn().mockResolvedValue({
        server: 'rtsps://127.0.0.1:554/live',
        command_id: 101,
        polling_interval: 5,
        continue_interval: 10,
      }),
      completeCommand: jest.fn().mockResolvedValue(null),
      updateCommand: jest.fn().mockResolvedValue(null),
      getCommandStatus: jest.fn().mockResolvedValue({ status: 'complete', complete: true }),
    };

    mockHap = {
      SRTPCryptoSuites: { AES_CM_128_HMAC_SHA1_80: 0 } as any,
      H264Profile: { BASELINE: 0, MAIN: 1, HIGH: 2 } as any,
      H264Level: { LEVEL3_1: 0, LEVEL3_2: 1, LEVEL4_0: 2 } as any,
      AudioStreamingCodecType: { OPUS: 0, AAC_ELD: 1, PCMA: 2, PCMU: 3 } as any,
      AudioStreamingSamplerate: { KHZ_8: 8, KHZ_16: 16, KHZ_24: 24 } as any,
    };

    mockLogger = jest.fn();
    getThumbnailUrl = jest.fn().mockReturnValue('/media/thumbnails/test.jpg');
  });

  describe('constructor', () => {
    it('should create instance for camera device type', () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );
      expect(source).toBeInstanceOf(BlinkCameraSource);
    });

    it('should create instance for owl device type', () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'owl', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );
      expect(source).toBeInstanceOf(BlinkCameraSource);
    });

    it('should create instance for doorbell device type', () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'doorbell', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );
      expect(source).toBeInstanceOf(BlinkCameraSource);
    });
  });

  describe('handleSnapshotRequest', () => {
    it('should request new thumbnail and fetch image data for camera', async () => {
      const imageData = new ArrayBuffer(1024);
      mockApi.requestCameraThumbnail.mockResolvedValue({ command_id: 123 });
      mockApi.pollCommand.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(imageData),
      });

      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const request: SnapshotRequest = { width: 640, height: 480 };
      const callback: SnapshotRequestCallback = jest.fn();

      await source.handleSnapshotRequest(request, callback);

      expect(mockApi.requestCameraThumbnail).toHaveBeenCalledWith(12345, 67890);
      expect(mockApi.pollCommand).toHaveBeenCalledWith(12345, 123);
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Buffer));
    });

    it('should request new thumbnail for owl device type', async () => {
      const imageData = new ArrayBuffer(512);
      mockApi.requestOwlThumbnail.mockResolvedValue({ command_id: 456 });
      mockApi.pollCommand.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(imageData),
      });

      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'owl', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const request: SnapshotRequest = { width: 320, height: 240 };
      const callback: SnapshotRequestCallback = jest.fn();

      await source.handleSnapshotRequest(request, callback);

      expect(mockApi.requestOwlThumbnail).toHaveBeenCalledWith(12345, 67890);
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Buffer));
    });

    it('should request new thumbnail for doorbell device type', async () => {
      const imageData = new ArrayBuffer(2048);
      mockApi.requestDoorbellThumbnail.mockResolvedValue({ command_id: 789 });
      mockApi.pollCommand.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(imageData),
      });

      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'doorbell', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const request: SnapshotRequest = { width: 1280, height: 720 };
      const callback: SnapshotRequestCallback = jest.fn();

      await source.handleSnapshotRequest(request, callback);

      expect(mockApi.requestDoorbellThumbnail).toHaveBeenCalledWith(12345, 67890);
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Buffer));
    });

    it('should fallback to existing thumbnail URL when thumbnail request fails', async () => {
      const imageData = new ArrayBuffer(256);
      mockApi.requestCameraThumbnail.mockRejectedValue(new Error('API error'));
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(imageData),
      });
      getThumbnailUrl.mockReturnValue('/media/thumbnails/cached.jpg');

      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const request: SnapshotRequest = { width: 640, height: 480 };
      const callback: SnapshotRequestCallback = jest.fn();

      await source.handleSnapshotRequest(request, callback);

      expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('Thumbnail request failed'));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/media/thumbnails/cached.jpg'),
        expect.objectContaining({ headers: expect.any(Object) }),
      );
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Buffer));
    });

    it('should callback with error when fetch fails', async () => {
      mockApi.requestCameraThumbnail.mockResolvedValue({ command_id: 123 });
      mockApi.pollCommand.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const request: SnapshotRequest = { width: 640, height: 480 };
      const callback: SnapshotRequestCallback = jest.fn();

      await source.handleSnapshotRequest(request, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should callback with error when no thumbnail URL available', async () => {
      mockApi.requestCameraThumbnail.mockRejectedValue(new Error('API error'));
      getThumbnailUrl.mockReturnValue(undefined);

      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const request: SnapshotRequest = { width: 640, height: 480 };
      const callback: SnapshotRequestCallback = jest.fn();

      await source.handleSnapshotRequest(request, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should timeout snapshot fetch when Blink media URL hangs', async () => {
      mockApi.requestCameraThumbnail.mockResolvedValue({ command_id: 123 });
      mockApi.pollCommand.mockResolvedValue({});
      mockFetch.mockImplementation((_url: string, options: RequestInit = {}) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      });

      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi,
        mockHap as unknown as HAP,
        12345,
        67890,
        'camera',
        'TEST_SERIAL',
        getThumbnailUrl,
        mockLogger,
        { snapshotFetchTimeoutMs: 25 },
      );

      const callback: SnapshotRequestCallback = jest.fn();
      await source.handleSnapshotRequest({ width: 640, height: 480 }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('timed out'),
      }));
    });
  });

  describe('streaming args', () => {
    it('includes local RTP ports in SRTP output URLs', () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const session = {
        address: '192.168.1.50',
        addressVersion: 'ipv4',
        sessionId: 'session',
        videoPort: 5000,
        localVideoPort: 5100,
        videoCryptoSuite: mockHap.SRTPCryptoSuites!.AES_CM_128_HMAC_SHA1_80,
        videoSRTP: Buffer.alloc(30, 1),
        videoSSRC: 1234,
        audioPort: 5001,
        localAudioPort: 5101,
        audioCryptoSuite: mockHap.SRTPCryptoSuites!.AES_CM_128_HMAC_SHA1_80,
        audioSRTP: Buffer.alloc(30, 2),
        audioSSRC: 5678,
      };

      const request = {
        type: 'start',
        sessionID: 'session',
        video: {
          fps: 15,
          width: 640,
          height: 480,
          max_bit_rate: 300,
          profile: mockHap.H264Profile!.BASELINE,
          level: mockHap.H264Level!.LEVEL3_1,
          pt: 99,
          mtu: 1378,
        },
        audio: {
          codec: mockHap.AudioStreamingCodecType!.OPUS,
          channel: 1,
          sample_rate: mockHap.AudioStreamingSamplerate!.KHZ_24,
          max_bit_rate: 24,
          pt: 110,
        },
      };

      const args = (source as any).buildFfmpegArgs('tcp://127.0.0.1:1234', request, session);
      const argString = args.join(' ');

      expect(argString).toContain('localrtpport=5100');
      expect(argString).toContain('localrtcpport=5100');
      expect(argString).toContain('localrtpport=5101');
      expect(argString).toContain('localrtcpport=5101');
    });
  });

  describe('prepareStream', () => {
    it('should callback with error when streaming is disabled', () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
        { enabled: false },
      );

      const request = {} as Parameters<typeof source.prepareStream>[0];
      const callback = jest.fn();

      source.prepareStream(request, callback);

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should prepare ports and SRTP parameters when streaming is enabled', (done) => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
      );

      const request = {
        sessionID: 'session-1',
        targetAddress: '192.168.1.2',
        addressVersion: 'ipv4',
        sourceAddress: '192.168.1.10',
        video: {
          port: 5000,
          srtpCryptoSuite: 0,
          srtp_key: Buffer.alloc(16),
          srtp_salt: Buffer.alloc(14),
        },
        audio: {
          port: 5002,
          srtpCryptoSuite: 0,
          srtp_key: Buffer.alloc(16),
          srtp_salt: Buffer.alloc(14),
        },
      };

      source.prepareStream(request as any, (error, response) => {
        expect(error).toBeUndefined();
        expect(response?.video).toBeDefined();
        const video = response?.video as { port?: number; ssrc?: number };
        expect(video.port).toEqual(expect.any(Number));
        expect(video.ssrc).toEqual(expect.any(Number));
        expect(response?.audio).toBeDefined();
        done();
      });
    });
  });

  describe('handleStreamRequest', () => {
    it('should callback immediately when streaming is disabled', () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
        12345, 67890, 'camera', 'TEST_SERIAL', getThumbnailUrl, mockLogger,
        { enabled: false },
      );

      const request = {} as Parameters<typeof source.handleStreamRequest>[0];
      const callback = jest.fn();

      source.handleStreamRequest(request, callback);

      expect(callback).toHaveBeenCalled();
    });

    it('should callback with error when ffmpeg spawn fails', async () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi,
        mockHap as unknown as HAP,
        12345,
        67890,
        'camera',
        'TEST_SERIAL',
        getThumbnailUrl,
        mockLogger,
        { ffmpegPath: '/definitely/not/a/real/ffmpeg/path' },
      );

      const prepareRequest = {
        sessionID: 'session-error',
        targetAddress: '127.0.0.1',
        addressVersion: 'ipv4',
        sourceAddress: '127.0.0.1',
        video: {
          port: 5000,
          srtpCryptoSuite: 0,
          srtp_key: Buffer.alloc(16),
          srtp_salt: Buffer.alloc(14),
        },
        audio: {
          port: 5001,
          srtpCryptoSuite: 0,
          srtp_key: Buffer.alloc(16),
          srtp_salt: Buffer.alloc(14),
        },
      };

      await new Promise<void>((resolve, reject) => {
        source.prepareStream(prepareRequest as any, (prepareError) => {
          if (prepareError) {
            reject(prepareError);
            return;
          }

          const request = {
            type: 'start',
            sessionID: 'session-error',
            video: {
              fps: 15,
              width: 640,
              height: 480,
              max_bit_rate: 300,
              profile: mockHap.H264Profile!.BASELINE,
              level: mockHap.H264Level!.LEVEL3_1,
              pt: 99,
              mtu: 1378,
            },
            audio: {
              codec: mockHap.AudioStreamingCodecType!.OPUS,
              channel: 1,
              sample_rate: mockHap.AudioStreamingSamplerate!.KHZ_16,
              max_bit_rate: 24,
              pt: 110,
            },
          };

          source.handleStreamRequest(request as any, (error?: Error) => {
            try {
              expect(error).toBeDefined();
              expect(error?.message).toContain('spawn');
              expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('failed to start'));
              resolve();
            } catch (assertionError) {
              reject(assertionError);
            }
          });
        });
      });
    });
  });

  describe('prepareStream edge cases', () => {
    it('releases allocated ports when prepare fails mid-way', async () => {
      const source = new BlinkCameraSource(
        mockApi as unknown as BlinkApi,
        mockHap as unknown as HAP,
        12345,
        67890,
        'camera',
        'TEST_SERIAL',
        getThumbnailUrl,
        mockLogger,
      );

      const initialPortCount = __cameraSourceTestUtils.getUsedPortCount();
      const invalidRequest = {
        sessionID: 'session-invalid-audio',
        targetAddress: '127.0.0.1',
        addressVersion: 'ipv4',
        sourceAddress: '127.0.0.1',
        video: {
          port: 5000,
          srtpCryptoSuite: 0,
          srtp_key: Buffer.alloc(16),
          srtp_salt: Buffer.alloc(14),
        },
      };

      await new Promise<void>((resolve) => {
        source.prepareStream(invalidRequest as any, () => resolve());
      });

      expect(__cameraSourceTestUtils.getUsedPortCount()).toBe(initialPortCount);
    });
  });
});

describe('CameraControllerOptions helpers', () => {
  let mockHap: jest.Mocked<Partial<HAP>>;
  let mockApi: jest.Mocked<Partial<BlinkApi>>;
  let mockLogger: jest.Mock;

  beforeEach(() => {
    mockHap = {
      SRTPCryptoSuites: { AES_CM_128_HMAC_SHA1_80: 0 } as any,
      H264Profile: { BASELINE: 0, MAIN: 1, HIGH: 2 } as any,
      H264Level: { LEVEL3_1: 0, LEVEL3_2: 1, LEVEL4_0: 2 } as any,
      AudioStreamingCodecType: { OPUS: 0, AAC_ELD: 1, PCMA: 2, PCMU: 3 } as any,
      AudioStreamingSamplerate: { KHZ_8: 8, KHZ_16: 16, KHZ_24: 24 } as any,
    };

    mockApi = {};
    mockLogger = jest.fn();
  });

  it('should return valid CameraControllerOptions with streaming enabled', () => {
    const source = new BlinkCameraSource(
      mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
      12345, 67890, 'camera', 'TEST_SERIAL', () => '/thumb.jpg', mockLogger,
    );

    const options = createCameraControllerOptions(mockHap as unknown as HAP, source);

    expect(options).toHaveProperty('cameraStreamCount', 1);
    expect(options).toHaveProperty('delegate', source);
    expect(options).toHaveProperty('streamingOptions');
    expect(options.streamingOptions).toHaveProperty('supportedCryptoSuites');
    expect(options.streamingOptions).toHaveProperty('video');
    expect(options.streamingOptions).toHaveProperty('audio');
  });

  it('should configure video codec with multiple resolutions', () => {
    const source = new BlinkCameraSource(
      mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
      12345, 67890, 'camera', 'TEST_SERIAL', () => '/thumb.jpg', mockLogger,
    );

    const options = createCameraControllerOptions(mockHap as unknown as HAP, source);
    const video = options.streamingOptions?.video;

    expect(video?.resolutions).toContainEqual([1920, 1080, 15]);
    expect(video?.resolutions).toContainEqual([1280, 720, 15]);
    expect(video?.resolutions).toContainEqual([640, 480, 15]);
    expect(video?.resolutions).toContainEqual([320, 240, 15]);
  });

  it('should configure audio as disabled when snapshot-only is requested', () => {
    const source = new BlinkCameraSource(
      mockApi as unknown as BlinkApi, mockHap as unknown as HAP,
      12345, 67890, 'camera', 'TEST_SERIAL', () => '/thumb.jpg', mockLogger,
    );

    const options = createSnapshotControllerOptions(mockHap as unknown as HAP, source);
    const audio = options.streamingOptions?.audio;

    expect(audio).toBeUndefined();
  });
});
