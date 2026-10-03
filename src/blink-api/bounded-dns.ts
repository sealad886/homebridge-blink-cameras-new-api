import { lookup } from 'node:dns/promises';

export type AddressLookup = (hostname: string) => Promise<readonly { address: string; family: number }[]>;
export const MAX_CONCURRENT_DNS_LOOKUPS = 8;
let pending = 0;

/** OS lookup cannot be cancelled. Retain admission until it actually settles,
 * even when its caller has already timed out or retired. Never queue more work.
 */
export async function lookupAddresses(
  hostname: string,
  resolve: AddressLookup = name => lookup(name, { all: true }),
): Promise<readonly { address: string; family: number }[]> {
  if (pending >= MAX_CONCURRENT_DNS_LOOKUPS) throw new Error('DNS lookup capacity exhausted');
  pending++;
  try { return await resolve(hostname); }
  finally { pending--; }
}
