import * as crypto from 'node:crypto';
import * as path from 'node:path';

export const resolveUiAuthStoragePath = (
  homebridgeStoragePath: string,
  email: string,
  hardwareId: string,
): string => {
  const keySource = `${email.toLowerCase()}|${hardwareId}`;
  const key = crypto.createHash('sha1').update(keySource).digest('hex');
  return path.join(homebridgeStoragePath, '..', 'blink-auth', `${key}.json`);
};
