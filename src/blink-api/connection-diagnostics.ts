import { lookupAddresses } from './bounded-dns';
import { URL } from 'node:url';

export interface ConnectionDiagnostic {
  dns: 'ok' | 'failed' | 'timeout';
  addressCount?: number;
  connection: 'ok' | 'failed' | 'timeout' | 'skipped';
  elapsedMs: number;
}

/** No credentials, response bodies, resolved addresses, or redirects leave this probe. */
export async function sampleBlinkConnection(origin: string): Promise<ConnectionDiagnostic> {
  const started = Date.now();
  const url = new URL(origin);
  if (url.protocol !== 'https:' || !/^rest-[a-z0-9]{4}\.immedia-semi\.com$/.test(url.hostname) ||
    url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Unsupported Blink diagnostic origin');
  }
  const controller = new globalThis.AbortController();
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = globalThis.setTimeout(() => {
      controller.abort();
      reject(new Error('Diagnostic timeout'));
    }, 5000);
  });
  const result: ConnectionDiagnostic = { dns: 'failed', connection: 'skipped', elapsedMs: 0 };
  try {
    const addresses = await Promise.race([lookupAddresses(url.hostname), expired]);
    result.dns = 'ok';
    result.addressCount = addresses.length;
    try {
      const response = await Promise.race([
        fetch(url.origin, { signal: controller.signal, redirect: 'manual' }), expired,
      ]);
      result.connection = 'ok';
      await Promise.race([response.body?.cancel(), expired]);
    } catch {
      result.connection = controller.signal.aborted ? 'timeout' : 'failed';
    }
  } catch {
    result.dns = controller.signal.aborted ? 'timeout' : 'failed';
  } finally {
    globalThis.clearTimeout(timer);
    result.elapsedMs = Date.now() - started;
  }
  return result;
}
