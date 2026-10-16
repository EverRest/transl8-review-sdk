import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  connectSdkEventStream,
  MAX_RECONNECT_ATTEMPTS,
  MAX_BACKOFF_MS,
} from './event-stream';
import type { SdkStreamMessage } from './event-stream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;
  /** Mirrors the browser's own classification of the failure: CONNECTING
   * means it will retry itself (transient/network-level), CLOSED means it
   * already gave up (e.g. a non-2xx response such as 401). Tests flip this
   * before emitError() to simulate which kind of failure occurred. */
  readyState = FakeEventSource.CONNECTING;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emitMessage(payload: SdkStreamMessage): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitError(): void {
    this.onerror?.(new Event('error'));
  }
}

describe('connectSdkEventStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
    // Math.random() = 1 -> jitter formula's upper bound == the plain
    // exponential delay, so pre-existing exact-timing tests below keep
    // asserting the same numbers they did before jitter existed. The
    // dedicated jitter test overrides this per-case.
    vi.spyOn(Math, 'random').mockReturnValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens an EventSource to the given URL', () => {
    connectSdkEventStream(
      'https://example.com/sdk/events/stream?token=t',
      () => {},
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'https://example.com/sdk/events/stream?token=t',
    );
  });

  it('parses and forwards messages to onMessage', () => {
    const onMessage = vi.fn();
    connectSdkEventStream('https://example.com/stream', onMessage);
    const msg: SdkStreamMessage = {
      type: 'release.changed',
      data: [{ id: 'r1', status: 'published' }],
    };

    FakeEventSource.instances[0].emitMessage(msg);

    expect(onMessage).toHaveBeenCalledWith(msg);
  });

  it('ignores a malformed message without throwing', () => {
    const onMessage = vi.fn();
    connectSdkEventStream('https://example.com/stream', onMessage);

    expect(() =>
      FakeEventSource.instances[0].onmessage?.({ data: 'not json' }),
    ).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('reconnects with doubling backoff starting at 1000ms, capped at 30000ms', () => {
    connectSdkEventStream('https://example.com/stream', () => {});

    FakeEventSource.instances[0].emitError();
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.instances[1].emitError();
    vi.advanceTimersByTime(1999);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(3);

    FakeEventSource.instances[2].emitError();
    vi.advanceTimersByTime(3999);
    expect(FakeEventSource.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  it('resets backoff to 1000ms after a message is received', () => {
    connectSdkEventStream('https://example.com/stream', () => {});

    FakeEventSource.instances[0].emitError();
    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.instances[1].emitMessage({
      type: 'release.changed',
      data: [],
    });
    FakeEventSource.instances[1].emitError();
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('applies equal jitter: delay ranges from half the backoff to the full backoff', () => {
    connectSdkEventStream('https://example.com/stream', () => {});

    (Math.random as ReturnType<typeof vi.fn>).mockReturnValue(0);
    FakeEventSource.instances[0].emitError();

    // Math.random() = 0 -> equal jitter's lower bound: half of the 1000ms base.
    vi.advanceTimersByTime(499);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('close() stops future reconnect attempts', () => {
    const handle = connectSdkEventStream(
      'https://example.com/stream',
      () => {},
    );

    handle.close();

    expect(FakeEventSource.instances[0].closed).toBe(true);
    FakeEventSource.instances[0].emitError();
    vi.advanceTimersByTime(60000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});

/**
 * A session token is baked into the URL at connect time, so once
 * it expires every reconnect is a guaranteed 401. The browser itself reports
 * this: EventSource sets readyState to CLOSED (not CONNECTING) when it "fails
 * the connection" on a non-2xx response, rather than retrying internally.
 * Reading that before our own close() call lets us tell a dead credential
 * apart from an ordinary network blip and stop hammering it forever.
 */
describe('connectSdkEventStream terminal failures', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not reconnect and calls onTerminal when the browser reports readyState CLOSED (e.g. a 401)', () => {
    const onTerminal = vi.fn();
    connectSdkEventStream('https://example.com/stream', () => {}, onTerminal);

    FakeEventSource.instances[0].readyState = FakeEventSource.CLOSED;
    FakeEventSource.instances[0].emitError();

    vi.advanceTimersByTime(MAX_BACKOFF_MS * 2);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it('still reconnects with backoff when readyState is CONNECTING (a transient error)', () => {
    const onTerminal = vi.fn();
    connectSdkEventStream('https://example.com/stream', () => {}, onTerminal);

    FakeEventSource.instances[0].readyState = FakeEventSource.CONNECTING;
    FakeEventSource.instances[0].emitError();

    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it('calls onTerminal once the reconnect cap is exceeded', () => {
    const onTerminal = vi.fn();
    connectSdkEventStream('https://example.com/stream', () => {}, onTerminal);

    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS + 1; i += 1) {
      const { instances } = FakeEventSource;
      const latest = instances[instances.length - 1];
      latest.readyState = FakeEventSource.CONNECTING;
      latest.emitError();
      vi.advanceTimersByTime(MAX_BACKOFF_MS * 2);
    }

    expect(onTerminal).toHaveBeenCalledTimes(1);
  });
});

/**
 * The URL bakes in the SDK session token at construction time,
 * so once that session expires every reconnect is a guaranteed 401. With no
 * attempt cap the stream retried forever, and since the returned handle is
 * discarded at its only call site (sdk-client.ts) nothing could stop it: one
 * abandoned tab hammered the backend until it was closed.
 */
describe('connectSdkEventStream reconnect cap', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function failRepeatedly(times: number): void {
    for (let i = 0; i < times; i += 1) {
      const latest =
        FakeEventSource.instances[FakeEventSource.instances.length - 1];
      if (!latest) return;
      latest.emitError();
      vi.advanceTimersByTime(MAX_BACKOFF_MS * 2);
    }
  }

  it('stops reconnecting after the cap instead of retrying forever', () => {
    connectSdkEventStream(
      'https://api.test/sdk/events/stream?token=dead',
      () => {},
    );

    failRepeatedly(MAX_RECONNECT_ATTEMPTS + 5);

    expect(FakeEventSource.instances.length).toBe(MAX_RECONNECT_ATTEMPTS + 1);
  });

  it('resets the budget once a message proves the stream is alive again', () => {
    connectSdkEventStream(
      'https://api.test/sdk/events/stream?token=live',
      () => {},
    );

    failRepeatedly(MAX_RECONNECT_ATTEMPTS - 1);
    const beforeRecovery = FakeEventSource.instances.length;

    FakeEventSource.instances[
      FakeEventSource.instances.length - 1
    ]?.emitMessage({
      type: 'translation.changed',
      data: [],
    } as SdkStreamMessage);

    failRepeatedly(MAX_RECONNECT_ATTEMPTS);

    expect(FakeEventSource.instances.length).toBeGreaterThan(
      beforeRecovery + 1,
    );
  });
});
