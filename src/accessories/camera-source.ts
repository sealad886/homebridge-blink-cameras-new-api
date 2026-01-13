/**
 * Blink Camera Source
 *
 * Implements CameraStreamingDelegate for HomeKit camera snapshot support.
 * This provides static snapshots (thumbnails) but not live streaming.
 *
 * Live streaming requires RTSPS → SRTP transcoding via FFmpeg which is
 * out of scope for this initial implementation.
 *
 * Source: API Dossier Sections 3.3, 3.4, 3.5 (Thumbnail endpoints)
 */

import {
  CameraControllerOptions,
  CameraStreamingDelegate,
  HAP,
  PrepareStreamCallback,
  PrepareStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  StreamRequestCallback,
  StreamingRequest,
} from 'homebridge';
import { BlinkApi } from '../blink-api';
import { Buffer } from 'node:buffer';

export type DeviceType = 'camera' | 'owl' | 'doorbell';

export class BlinkCameraSource implements CameraStreamingDelegate {
  constructor(
    private readonly api: BlinkApi,
    private readonly hap: HAP,
    private readonly networkId: number,
    private readonly deviceId: number,
    private readonly deviceType: DeviceType,
    private readonly getThumbnailUrl: () => string | undefined,
    private readonly log: (message: string) => void,
  ) {}

  /**
   * Handle snapshot request from HomeKit.
   * Requests a fresh thumbnail from Blink and returns it as a JPEG buffer.
   *
   * @param request - Snapshot request with width/height
   * @param callback - Callback to return image buffer or error
   */
  async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    this.log(`Snapshot requested (${request.width}x${request.height})`);

    try {
      // Request fresh thumbnail from Blink
      await this.requestThumbnail();

      // Get thumbnail URL from device data
      const url = this.getThumbnailUrl();
      if (!url) {
        throw new Error('No thumbnail URL available');
      }

      // Build full URL (thumbnails may be relative paths)
      const fullUrl = url.startsWith('http') ? url : `https://rest-prod.immedia-semi.com${url}`;

      // Fetch the thumbnail image
      const response = await fetch(fullUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch thumbnail: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      this.log(`Snapshot returned (${buffer.length} bytes)`);
      callback(undefined, buffer);
    } catch (error) {
      this.log(`Snapshot error: ${error}`);
      callback(error as Error);
    }
  }

  /**
   * Request a fresh thumbnail from Blink API.
   * Uses the appropriate endpoint based on device type.
   */
  private async requestThumbnail(): Promise<void> {
    try {
      let response;

      switch (this.deviceType) {
        case 'camera':
          response = await this.api.requestCameraThumbnail(this.networkId, this.deviceId);
          break;
        case 'owl':
          response = await this.api.requestOwlThumbnail(this.networkId, this.deviceId);
          break;
        case 'doorbell':
          response = await this.api.requestDoorbellThumbnail(this.networkId, this.deviceId);
          break;
      }

      // Poll for command completion
      if (response?.command_id) {
        await this.api.pollCommand(this.networkId, response.command_id);
      }
    } catch (error) {
      // Log but don't fail - we may still have a cached thumbnail
      this.log(`Thumbnail request failed: ${error}`);
    }
  }

  /**
   * Prepare stream - not implemented (snapshots only).
   * Live streaming would require FFmpeg RTSPS→SRTP transcoding.
   */
  prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): void {
    this.log('Stream preparation requested but not supported');
    callback(new Error('Live streaming not supported'));
  }

  /**
   * Handle stream request - not implemented (snapshots only).
   */
  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    this.log('Stream request received but not supported');
    callback();
  }
}

/**
 * Create CameraController options for snapshot-only support.
 *
 * @param hap - HAP API for CameraController
 * @param delegate - Camera streaming delegate (BlinkCameraSource)
 * @returns Controller options for configureController()
 */
export function createSnapshotControllerOptions(
  hap: HAP,
  delegate: CameraStreamingDelegate,
): CameraControllerOptions {
  return {
    cameraStreamCount: 0,
    delegate,
    streamingOptions: {
      supportedCryptoSuites: [hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
      video: {
        resolutions: [
          [320, 180, 15],
          [320, 240, 15],
          [480, 270, 15],
          [480, 360, 15],
          [640, 360, 15],
          [640, 480, 15],
          [1280, 720, 15],
          [1920, 1080, 15],
        ],
        codec: {
          profiles: [hap.H264Profile.BASELINE],
          levels: [hap.H264Level.LEVEL3_1],
        },
      },
      audio: {
        twoWayAudio: false,
        codecs: [],
      },
    },
  };
}
