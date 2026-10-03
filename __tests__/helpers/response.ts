/** Stream-backed transport fixture; consumers exercise the native response body. */
export function testResponse(fixture: {
  status?: number; statusText?: string; headers?: HeadersInit; ok?: boolean;
  json?: () => Promise<unknown>; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer>;
  body?: { cancel?: () => Promise<unknown> } | null;
}): Response {
  let begun = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (begun) return; begun = true;
      try {
        const bytes = fixture.json ? Buffer.from(JSON.stringify(await fixture.json()))
          : fixture.text ? Buffer.from(await fixture.text())
          : fixture.arrayBuffer ? new Uint8Array(await fixture.arrayBuffer()) : Buffer.alloc(0);
        controller.enqueue(bytes); controller.close();
      } catch (error) { controller.error(error); }
    },
    cancel() { return fixture.body?.cancel?.().then(() => undefined); },
  });
  const status = fixture.status ?? 200;
  const response = new Response([204, 205, 304].includes(status) ? null : body, {
    status, statusText: fixture.statusText, headers: fixture.headers,
  });
  // Explicit enumerable fields support fixture overrides without losing native metadata.
  for (const key of ['status', 'statusText', 'ok', 'headers', 'json', 'text'] as const) {
    const value = response[key];
    Object.defineProperty(response, key, { value: typeof value === 'function' ? value.bind(response) : value, enumerable: true, configurable: true, writable: true });
  }
  return response;
}
