/**
 * jsdom has no EventSource. Without this, every test that mounts the
 * launcher (review:create) throws once ReviewSdk.init opens the SSE
 * connection — this is a harmless default; tests that care about stream
 * behavior override the global with a controllable fake via
 * vi.stubGlobal('EventSource', ...), same pattern as this package's fetch
 * stubs.
 */
class NoopEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(public readonly url: string) {}

  close(): void {
    this.readyState = 2;
  }
}

if (typeof globalThis.EventSource === 'undefined') {
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    NoopEventSource;
}
