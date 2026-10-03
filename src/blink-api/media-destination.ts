import { URL } from 'node:url';
import { BlockList, isIP } from 'node:net';
import { lookupAddresses, type AddressLookup } from './bounded-dns';

export interface MediaDestination {
  readonly scheme: 'immis:';
  readonly hostname: string;
  readonly servername: string;
  readonly port: 443;
}

export interface ResolvedMediaDestination extends MediaDestination {
  readonly address: string;
  readonly family: 4 | 6;
}

export type MediaAddressLookup = AddressLookup;

/** APK 59.2 RestApiKt Blink-domain constant; libwalnut IMMISDefaultPort = uint16 443.
 * This is a deliberately restricted IMMIS policy, not evidence of all provider media hosts.
 * URL paths/query are session credentials and are never retained in this descriptor.
 */
export function describeMediaDestination(raw: string): MediaDestination {
  if (typeof raw !== 'string' || raw.length > 8192 || /[\s\\]/.test(raw)) {
    throw new Error('Unsupported media destination');
  }
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Unsupported media destination'); }
  const hostname = url.hostname;
  if (url.protocol !== 'immis:' || url.username || url.password || url.hash ||
      (url.port && url.port !== '443') || hostname.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*immedia-semi\.com$/.test(hostname)) {
    throw new Error('Unsupported media destination');
  }
  return Object.freeze({ scheme: 'immis:', hostname, servername: hostname, port: 443 });
}

const forbiddenV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) forbiddenV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const forbiddenV6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) forbiddenV6.addSubnet(address, prefix, 'ipv6');

/** Conservative globally routable policy: excludes mapped, transition and special-use IPs. */
export function isPublicMediaAddress(address: string): boolean {
  const family = isIP(address);
  if (address.includes('%')) return false;
  if (family === 4) return !forbiddenV4.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !forbiddenV6.check(address, 'ipv6');
}

/** Call anew for EACH actual connect/reconnect, then connect to address numerically.
 * Keep servername for SNI/certificate identity and require rejectUnauthorized: true.
 * No DNS cache: a later private answer must never inherit prior admission.
 * Cancellation stops admission; OS lookup itself cannot be cancelled.
 */
export async function resolveMediaDestination(
  destination: MediaDestination,
  signal: globalThis.AbortSignal,
  resolve?: MediaAddressLookup,
): Promise<ResolvedMediaDestination> {
  const checked = describeMediaDestination(`${destination.scheme}//${destination.hostname}:${destination.port}`);
  if (destination.servername !== checked.hostname) throw new Error('Unsupported media TLS identity');
  signal.throwIfAborted();
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('Media destination resolution cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    timer = globalThis.setTimeout(() => reject(new Error('Media destination resolution timed out')), 5000);
  });
  try {
    const addresses = await Promise.race([Promise.resolve().then(() => {
      signal.throwIfAborted();
      return lookupAddresses(checked.hostname, resolve);
    }), interrupted]);
    signal.throwIfAborted();
    if (!addresses.length || addresses.length > 64 || addresses.some(item =>
      (item.family !== 4 && item.family !== 6) || isIP(item.address) !== item.family || !isPublicMediaAddress(item.address))) {
      throw new Error('Media destination address refused');
    }
    const first = addresses[0];
    return Object.freeze({ ...checked, address: first.address, family: first.family as 4 | 6 });
  } finally {
    globalThis.clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}
