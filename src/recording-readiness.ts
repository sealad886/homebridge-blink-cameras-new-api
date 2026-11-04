/** Shared bounded recording status contract. HAP observations are not iCloud retention evidence. */
import { projectRecordingSelections, recordingIdentity, recordingSettingsRevision,
  type RecordingSelection, type RecordingSelectionReason, type SettingsInventory } from './settings-inventory';
import type { NativeClipActivity, NativeClipJobProgress, NativeClipReason } from './native-clip-recorder';
import type { RecordingStatus } from './accessories/camera-recording';
export interface HomeRecordingObservation {
  configuration: 'unknown' | 'not-configured' | 'configured' | 'invalid';
  recordingActive: boolean | null; cameraActive: boolean | null; audioActive: boolean | null;
  triggerTypes: number[] | null; effectiveAudioActive: boolean;
}
export function unknownHomeRecordingObservation(): HomeRecordingObservation {
  return { configuration: 'unknown', recordingActive: null, cameraActive: null, audioActive: null,
    triggerTypes: null, effectiveAudioActive: false };
}
/** Characteristics may contain 0/1. Missing/invalid readings remain unobserved. */
export function observedHomeBoolean(value: unknown): boolean | null {
  return value === true || value === 1 ? true : value === false || value === 0 ? false : null;
}

export const RECORDING_READINESS_STAGES = [
  'runtime-unavailable', 'inventory-unavailable', 'camera-excluded', 'camera-unresolved', 'camera-selector-ambiguous',
  'camera-unavailable', 'module-unavailable', 'camera-name-ambiguous',
  'home-recording-off', 'home-camera-off', 'home-policy-unknown', 'home-configuration-unknown',
  'home-configuration-missing', 'home-configuration-invalid', 'unsupported-trigger-policy', 'baseline-pending',
  'waiting-for-native-clip', 'queued', 'preparing-download', 'downloading', 'preparing-media', 'ready', 'offered',
  'delivered', 'uncertain', 'failed', 'expired', 'cancelled',
  'continuous-off', 'continuous-warming', 'continuous-ready', 'continuous-recording', 'continuous-fault',
] as const;
export const RECORDING_ACTIVITY_REASONS = ['provider-unavailable', 'command-pending', 'ambiguous-request', 'media-invalid', 'storage-pressure',
  'metadata-pressure', 'queue-pressure', 'permission-changed', 'camera-unregistered', 'expired', 'configuration-unavailable',
  'media-preparation-failed', 'configuration-changed', 'target-busy', 'delivery-uncertain', 'camera-unmatched', 'unsupported-trigger-policy'] as const;
export const RECORDING_JOB_STATES = ['queued', 'preparing-download', 'downloading', 'preparing-media', 'ready', 'offered',
  'delivered', 'uncertain', 'failed', 'expired', 'cancelled'] as const;
export type RecordingActivityReason = typeof RECORDING_ACTIVITY_REASONS[number];
export type RecordingJobState = typeof RECORDING_JOB_STATES[number];
export type RecordingReadinessStage = typeof RECORDING_READINESS_STAGES[number];
export type RecordingBaseline = 'pending' | 'complete' | 'not-applicable';
export type RecordingRuntimeState = 'starting' | 'running' | 'unavailable' | 'stopped';
export interface RecordingReadinessCamera {
  id: string; label: string; selection: RecordingSelection['selection']; source: RecordingSelection['source'];
  available: boolean; availabilityReason?: RecordingSelectionReason; module?: { id: string; label: string };
  home: HomeRecordingObservation; baseline: RecordingBaseline; baselineCompletedAt?: string;
  stage: RecordingReadinessStage; reason?: NativeClipReason; canTriggerFreshTest: boolean;
  nativeStorage: 'unverified' | 'native-clip-observed'; nativeStorageObservedAt?: string; retainedInHomeKit: 'unconfirmed';
  queued: number; delivered: number; uncertain: number; lastNativeClipAt?: string;
  lastExpiredAt?: string; lastExpiredReason?: 'expired'; job?: NativeClipJobProgress;
  continuousState?: RecordingStatus['state'];
}
export interface RecordingReadinessReport {
  version: 2; settingsRevision: string; updatedAt: string; runtime: RecordingRuntimeState; inventory: 'available' | 'unknown';
  retainedInHomeKit: 'unconfirmed'; queue: number; active: number; mediaBytes: number; reservedBytes: number; preparationLimit: number;
  modules: { id: string; label: string; baseline: RecordingBaseline; lastCatalogAt?: string; reason?: NativeClipReason }[];
  cameras: RecordingReadinessCamera[];
}
export interface RecordingReadinessInput {
  config: Record<string, unknown>; inventory?: SettingsInventory; runtime: RecordingRuntimeState; now?: number;
  activity?: NativeClipActivity;
  observations?: ReadonlyMap<string, { home: HomeRecordingObservation; status: Readonly<RecordingStatus> }>;
}

function homeStage(home: HomeRecordingObservation, requireMotion: boolean): RecordingReadinessStage | undefined {
  if (home.recordingActive === false) return 'home-recording-off';
  if (home.cameraActive === false) return 'home-camera-off';
  if (home.configuration === 'invalid') return 'home-configuration-invalid';
  if (home.configuration === 'unknown') return 'home-configuration-unknown';
  if (home.configuration === 'not-configured') return 'home-configuration-missing';
  if (home.recordingActive === null || home.cameraActive === null || home.triggerTypes === null) return 'home-policy-unknown';
  if (requireMotion && !home.triggerTypes.includes(1)) return 'unsupported-trigger-policy';
}

// The native API preserves valid offset timestamps for clip identity. Normalize
// only their public report representation to the reader's UTC millisecond form.
function reportCaptureTime(value: string): string { return new Date(value).toISOString(); }

/** Pure projection; no provider calls, timers, file writes or inferred iCloud permissions. */
export function composeRecordingReadiness(input: RecordingReadinessInput): RecordingReadinessReport {
  const selections = projectRecordingSelections(input.inventory, input.config), activity = input.activity;
  const cameras: RecordingReadinessCamera[] = selections.map(selection => {
    const state = activity?.cameras.find(camera => camera.key === selection.cameraKey);
    const observation = selection.cameraKey ? input.observations?.get(selection.cameraKey) : undefined;
    const home = observation?.home ?? unknownHomeRecordingObservation();
    const inventoryCamera = input.inventory?.cameras.find(camera => camera.key === selection.cameraKey);
    const moduleKey = inventoryCamera && selection.syncModuleId ? `${inventoryCamera.networkId}:${selection.syncModuleId}` : undefined;
    const baseline = selection.available && selection.source === 'saved-clips' ? state?.baseline ?? 'pending' : 'not-applicable';
    const permitted = homeStage(home, selection.source === 'saved-clips');
    const stage: RecordingReadinessStage = !selection.available ? selection.reason ?? 'camera-unavailable'
      : input.runtime !== 'running' ? 'runtime-unavailable' : permitted ?? (selection.source === 'continuous'
        ? `continuous-${observation?.status.state ?? 'off'}`
        : baseline !== 'complete' ? 'baseline-pending' : state?.job?.state ?? (state?.lastExpiredAt ? 'expired' : 'waiting-for-native-clip'));
    return { id: selection.id, label: selection.label, selection: selection.selection, source: selection.source,
      available: selection.available, ...(selection.reason ? { availabilityReason: selection.reason } : {}),
      ...(moduleKey ? { module: { id: recordingIdentity(moduleKey), label: selection.moduleLabel ?? 'Sync Module' } } : {}),
      home: { ...home, triggerTypes: home.triggerTypes ? [...home.triggerTypes] : null }, baseline,
      ...(state?.baselineCompletedAt ? { baselineCompletedAt: state.baselineCompletedAt } : {}), stage,
      ...(state?.reason ? { reason: state.reason } : {}),
      canTriggerFreshTest: input.runtime === 'running' && selection.available && selection.source === 'saved-clips'
        && !permitted && baseline === 'complete', nativeStorage: state?.nativeStorageObservedAt ? 'native-clip-observed' : 'unverified',
      ...(state?.nativeStorageObservedAt ? { nativeStorageObservedAt: state.nativeStorageObservedAt } : {}), retainedInHomeKit: 'unconfirmed',
      queued: state?.queued ?? 0, delivered: state?.delivered ?? 0, uncertain: state?.uncertain ?? 0,
      ...(state?.lastNativeClipAt ? { lastNativeClipAt: reportCaptureTime(state.lastNativeClipAt) } : {}),
      ...(state?.lastExpiredAt ? { lastExpiredAt: state.lastExpiredAt, lastExpiredReason: 'expired' as const } : {}),
      ...(state?.job ? { job: { ...state.job, capturedAt: reportCaptureTime(state.job.capturedAt) } } : {}),
      ...(selection.source === 'continuous' && observation ? { continuousState: observation.status.state } : {}) };
  });
  const moduleIds = [...new Set(cameras.flatMap(camera => camera.module ? [camera.module.id] : []))];
  return { version: 2, settingsRevision: recordingSettingsRevision(input.config), updatedAt: new Date(input.now ?? Date.now()).toISOString(),
    runtime: input.runtime, inventory: input.inventory ? 'available' : 'unknown', retainedInHomeKit: 'unconfirmed',
    queue: activity?.queue ?? 0, active: activity?.active ?? 0, mediaBytes: activity?.mediaBytes ?? 0, reservedBytes: activity?.reservedBytes ?? 0,
    preparationLimit: activity?.preparationLimit ?? 1,
    modules: moduleIds.map(id => {
      const rows = cameras.filter(camera => camera.module?.id === id), registered = rows.filter(camera => camera.baseline !== 'not-applicable');
      const module = activity?.modules.find(value => value.id === id);
      return { id, label: rows[0].module!.label, baseline: !registered.length ? 'not-applicable'
        : registered.every(camera => camera.baseline === 'complete') ? 'complete' : 'pending',
      ...(module?.lastCatalogAt ? { lastCatalogAt: module.lastCatalogAt } : {}), ...(module?.reason ? { reason: module.reason } : {}) };
    }), cameras };
}

