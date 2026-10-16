export interface SdkTranslationChangedItem {
  key: string;
  language: string;
  value: string;
  status: string;
  version: number;
  updatedAt: string;
}

export interface SdkReleaseChangedItem {
  id: string;
  status: string;
}

export type SdkStreamMessage =
  | { type: 'translation.changed'; data: SdkTranslationChangedItem[] }
  | { type: 'release.changed'; data: SdkReleaseChangedItem[] };

const INITIAL_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30000;

/**
 * The stream URL carries the SDK session token, fixed at connect
 * time. Once that session expires every reconnect is a guaranteed 401, and an
 * uncapped loop meant one forgotten tab retried forever. A live message
 * resets the budget, so this only ends runs that never recover; `onTerminal`
 * fires so the caller (`ReviewSdk`) can surface that to the host.
 */
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Equal jitter: never less than half the base delay, never more than the
 * base delay itself. Keeps the exponential growth intact while spreading
 * out a fleet of clients that all dropped connection at the same instant
 * (e.g. a shared backend blip) instead of having them all retry in lockstep.
 */
function withJitter(baseMs: number): number {
  const half = baseMs / 2;
  return half + Math.random() * half;
}

/**
 * Wraps EventSource with reconnect-and-backoff (plus jitter). Native
 * EventSource retries on a fixed ~3s delay and Nest's Observable-based SSE
 * completes the stream on error rather than staying meaningfully open —
 * this owns reconnect timing explicitly instead of relying on either.
 */
export function connectSdkEventStream(
  url: string,
  onMessage: (msg: SdkStreamMessage) => void,
  onTerminal?: () => void,
): { close(): void } {
  let source: EventSource | undefined;
  let backoffMs = INITIAL_BACKOFF_MS;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function open(): void {
    source = new EventSource(url);

    source.onmessage = (event) => {
      backoffMs = INITIAL_BACKOFF_MS;
      attempts = 0;
      try {
        onMessage(JSON.parse(event.data as string) as SdkStreamMessage);
      } catch {
        // Malformed message — skip it, keep the connection alive.
      }
    };

    source.onerror = () => {
      // Read before close(): close() always forces readyState to CLOSED, so
      // this is the only chance to see the browser's own verdict. CLOSED
      // here means it already "failed the connection" (e.g. a non-2xx
      // response like 401) and would not have retried itself — a dead
      // credential, not a network blip, so don't retry it either.
      const failedPermanently = source?.readyState === EventSource.CLOSED;
      source?.close();
      if (closed) {
        return;
      }
      if (failedPermanently) {
        closed = true;
        onTerminal?.();
        return;
      }
      attempts += 1;
      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        closed = true;
        onTerminal?.();
        return;
      }
      reconnectTimer = setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        open();
      }, withJitter(backoffMs));
    };
  }

  open();

  return {
    close(): void {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      source?.close();
    },
  };
}
