import process from 'node:process';
import { PushReceiver } from '@eneris/push-receiver';
import { FCM_BUNDLE_ID, validCredentials, validFirebase, type Credentials, type FirebaseConfig } from './types';

/** Run only inside the bounded Google worker, after installing its request budget. */
export async function registerGoogleIdentity(firebase: FirebaseConfig, credentials: Credentials | undefined, persistentIds: string[]): Promise<Credentials> {
  if (!validFirebase(firebase) || (credentials !== undefined && !validCredentials(credentials, firebase))) {
    throw new Error('Invalid Google receiver identity');
  }
  // 4.4.0 compares this metadata using JSON.stringify. Its property order must
  // not turn a valid restored identity into a new registration after a write.
  const cached = credentials && { ...credentials,
    config: { bundleId: FCM_BUNDLE_ID, projectId: firebase.projectId, vapidKey: '' } };
  const manager = new PushReceiver({ firebase, credentials: cached, persistentIds, bundleId: FCM_BUNDLE_ID, debug: false,
    chromePlatform: process.platform === 'darwin' ? 2 : process.platform === 'win32' ? 1 : 3,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  manager.whenReady.catch(() => undefined);
  try {
    if (cached && !manager.checkCredentials(cached)) throw new Error('Google receiver cache rejected');
    const result = await manager.registerIfNeeded();
    if (!validCredentials(result, firebase)) throw new Error('Google returned incomplete receiver credentials');
    return result;
  } finally { manager.destroy(); }
}
