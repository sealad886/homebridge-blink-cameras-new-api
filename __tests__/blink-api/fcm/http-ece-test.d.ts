declare module 'http_ece' {
  import type { Buffer } from 'node:buffer';
  export function encrypt(value: Buffer, options: Record<string, unknown>): Buffer;
}
