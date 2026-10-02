import { HAP } from 'homebridge';
import { OperationTimeoutError } from './operation-budget';

/** Keep transport details in diagnostics; return only defined HAP status to clients. */
export function toHapError(hap: HAP, error: unknown): Error {
  if (error instanceof hap.HapStatusError) return error;
  const timeout = error instanceof OperationTimeoutError
    || (error instanceof Error && error.name === 'TimeoutError');
  return new hap.HapStatusError(timeout
    ? hap.HAPStatus.OPERATION_TIMED_OUT
    : hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
}
