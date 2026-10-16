import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ReviewSdk,
  ApplyTranslationConflictError,
  SdkSessionExpiredError,
  type ReviewSdkInitOptions,
} from './sdk-client';
import { captureElementScreenshot } from '../ui/capture-element-screenshot';
import { Transl8Launcher } from '../ui/launcher';
import { Transl8ReviewModeBadges } from '../ui/review-mode-badges';
import { ReviewModeElementTracker } from '../ui/review-mode-element-tracker';
import { Transl8PanelShell } from '../ui/panel-shell';
import { Transl8InspectorPanel } from '../ui/inspector-panel';
import { SDK_VERSION } from './version';

vi.mock('../ui/capture-element-screenshot', () => ({
  captureElementScreenshot: vi.fn(),
}));

function mockSessionResponse(permissions: readonly string[]) {
  const mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        token: 'session-token',
        // Minted alongside the session token; GET
        // /sdk/events/stream takes this one, not `token`.
        streamToken: 'stream-token',
        expiresAt: '2026-08-22T12:00:00.000Z',
        projectId: 'project_123',
        permissions,
      },
    }),
  });
  return mockFetch;
}

describe('ReviewSdk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Safe default matching captureElementScreenshot's real contract ("never
    // rejects, resolves undefined on any failure") so every existing
    // full-UI-flow report-submit test — which doesn't care about screenshot
    // capture at all — doesn't trip over an un-mocked resolution value.
    vi.mocked(captureElementScreenshot).mockResolvedValue(undefined);
  });

  describe('init', () => {
    it('POSTs to /sdk/session with Bearer apiKey and locale in body', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_123',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_123',
            permissions: ['read:context', 'write:context'],
          },
        }),
      });

      const opts: ReviewSdkInitOptions = {
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_123',
        apiKey: 'ta_live_abc123',
        locale: 'de',
        sourceLocale: 'en',
      };

      const sdk = await ReviewSdk.init(opts);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/v1/sdk/session',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ta_live_abc123',
            'Content-Type': 'application/json',
            'X-Sdk-Version': SDK_VERSION,
          },
          body: JSON.stringify({
            locale: 'de',
            sourceLocale: 'en',
          }),
          signal: expect.any(AbortSignal),
        },
      );

      expect(sdk.getSessionToken()).toBe('session_token_123');
    });

    it('sends the build-time SDK_VERSION constant as X-Sdk-Version', async () => {
      const mockFetch = mockSessionResponse([]);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_v',
        apiKey: 'ta_live_v',
        locale: 'de',
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Sdk-Version']).toBe(SDK_VERSION);
    });

    it('works without sourceLocale in init options', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_456',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_456',
            permissions: [],
          },
        }),
      });

      const opts: ReviewSdkInitOptions = {
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_456',
        apiKey: 'ta_live_def456',
        locale: 'fr',
      };

      const sdk = await ReviewSdk.init(opts);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/v1/sdk/session',
        expect.objectContaining({
          body: JSON.stringify({
            locale: 'fr',
          }),
        }),
      );

      expect(sdk.getSessionToken()).toBe('session_token_456');
    });

    it('exposes expiresAt from the session response instead of discarding it', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_exp',
            expiresAt: '2026-08-22T00:15:00Z',
            projectId: 'proj_exp',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_exp',
        apiKey: 'ta_live_exp',
        locale: 'de',
      });

      expect(sdk.getSessionExpiresAt()).toBe('2026-08-22T00:15:00Z');
    });

    it('throws with status and body snippet on a non-2xx session response', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{"message":"Invalid API key"}',
        json: async () => ({}),
      });

      await expect(
        ReviewSdk.init({
          apiBaseUrl: 'https://example.com/api/v1',
          projectId: 'proj_bad',
          apiKey: 'ta_live_bad',
          locale: 'de',
        }),
      ).rejects.toThrow(
        /POST \/sdk\/session failed with HTTP 401.*Invalid API key/,
      );
    });

    it('retains permissions and projectId from the session response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              token: 'session-token',
              expiresAt: '2026-08-22T12:00:00.000Z',
              projectId: 'project_123',
              permissions: ['review:create', 'translation:read'],
            },
          }),
        }),
      );

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://api.example.com',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      expect(sdk.getPermissions()).toEqual([
        'review:create',
        'translation:read',
      ]);
      expect(sdk.getProjectId()).toBe('project_123');
    });

    // Previously init() had no request timeout, so a backend that
    // accepts the connection but never responds hung init() forever instead
    // of settling like analyzeTranslation's own 10s AbortController pattern.
    it('rejects with a DOMException named TimeoutError after 10s when the backend never responds', async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(
                new DOMException(
                  (init.signal as AbortSignal & { reason?: DOMException })
                    .reason?.message ?? 'Aborted',
                  (init.signal as AbortSignal & { reason?: DOMException })
                    .reason?.name ?? 'AbortError',
                ),
              );
            });
          }),
      );

      const pending = ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_hang',
        apiKey: 'ta_live_hang',
        locale: 'de',
      });
      pending.catch(() => {}); // mark handled immediately; the real assertion is below

      await vi.advanceTimersByTimeAsync(10_000);

      await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
      vi.useRealTimers();
    });

    // Previously init() awaited its fetch with no internal
    // try/finally, so nothing guaranteed the 10s timer was torn down when
    // the session request failed some other way (network error). A leaked
    // timer would later fire its own abort() call and could surface as a
    // second, genuinely unhandled rejection well after this test's own
    // rejection was already handled.
    it('rejects cleanly and does not leave a dangling timer when the session fetch itself rejects', async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        ReviewSdk.init({
          apiBaseUrl: 'https://example.com/api/v1',
          projectId: 'proj_neterr',
          apiKey: 'ta_live_neterr',
          locale: 'de',
        }),
      ).rejects.toThrow('Failed to fetch');

      // Advancing well past the 10s window must be a no-op: if the timeout
      // weren't cleared in a `finally`, this would still be harmless today
      // (the resulting AbortController has no listeners left), but guards
      // against a future refactor reintroducing a dangling timer.
      await vi.advanceTimersByTimeAsync(10_000);
      vi.useRealTimers();
    });
  });

  describe('launcher auto-mount', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('mounts the launcher in document.body when review:create is granted', async () => {
      mockSessionResponse(['review:create']);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root');
      expect(root).not.toBeNull();
      expect(root!.querySelector('transl8-launcher')).not.toBeNull();
    });

    it('mounts nothing when review:create is absent', async () => {
      mockSessionResponse(['translation:read']);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      expect(document.body.querySelector('transl8-sdk-root')).toBeNull();
    });

    it('mounts into an explicit HTMLElement mountTarget instead of document.body', async () => {
      mockSessionResponse(['review:create']);
      const container = document.createElement('div');
      document.body.appendChild(container);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
        mountTarget: container,
      });

      expect(container.querySelector('transl8-sdk-root')).not.toBeNull();
      expect(
        document.body.querySelector(':scope > transl8-sdk-root'),
      ).toBeNull();
    });

    it('mounts into a mountTarget given as a CSS selector string', async () => {
      mockSessionResponse(['review:create']);
      const container = document.createElement('div');
      container.id = 'host';
      document.body.appendChild(container);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
        mountTarget: '#host',
      });

      expect(container.querySelector('transl8-sdk-root')).not.toBeNull();
    });

    it('throws when mountTarget is a selector matching no element', async () => {
      mockSessionResponse(['review:create']);

      await expect(
        ReviewSdk.init({
          apiBaseUrl: 'https://example.com/api/v1',
          projectId: 'project_123',
          apiKey: 'ta_live_test',
          locale: 'de',
          mountTarget: '#does-not-exist',
        }),
      ).rejects.toThrow(/mountTarget/);
    });

    it('mounts a highlight overlay alongside the launcher when review:create is granted', async () => {
      mockSessionResponse(['review:create']);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root');
      expect(root!.querySelector('transl8-highlight-overlay')).not.toBeNull();
    });

    it('dispatches transl8:element-selected on the sdk root when a review-mode badge is clicked', async () => {
      mockSessionResponse(['review:create']);
      const host = document.createElement('div');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      // Reach the state machine the same way the launcher does, by enabling
      // review mode through the same public path a reviewer would use.
      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      const selectedHandler = vi.fn();
      root.addEventListener('transl8:element-selected', selectedHandler);

      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();

      expect(selectedHandler).toHaveBeenCalledOnce();
      const event = selectedHandler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.element.translationKey).toBe('hero.title');
    });

    it('mounts an inspector panel and fills it from GET /sdk/translations/lookup after clicking a review-mode badge', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-inspector',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'fr',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      expect(inspector).not.toBeNull();

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Bonjour',
            version: 2,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });

      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      // getTranslation's fetch resolves asynchronously after the click handler returns.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/lookup?key=hero.title&language=fr',
        {
          headers: { Authorization: 'Bearer session-token-inspector' },
          signal: expect.any(AbortSignal),
        },
      );
      const currentTextEl = inspector.shadowRoot!.querySelector(
        '[part="current-text"]',
      );
      expect(currentTextEl!.textContent).toBe('Bonjour');
    });

    // Previously getTranslation() was called with no .catch() in mountLauncher,
    // so a lookup failure (backend down, timeout, 500) left the Inspector
    // stuck on showLoading() forever with an unhandled promise rejection,
    // instead of failing open to a visible, non-stuck error state.
    it('shows a lookup-error state instead of hanging in Loading when GET /sdk/translations/lookup fails', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-inspector-err',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'fr',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '{"message":"boom"}',
        json: async () => ({}),
      });

      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      // getTranslation's fetch rejects asynchronously after the click handler returns.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const loadingSection = inspector.shadowRoot!.querySelector(
        'section[part="loading"]',
      ) as HTMLElement;
      const errorSection = inspector.shadowRoot!.querySelector(
        'section[part="lookup-error"]',
      ) as HTMLElement;
      expect(loadingSection.style.display).toBe('none');
      expect(errorSection.style.display).toBe('block');
    });

    it('mounts a report form; Report issue -> Submit posts to /sdk/reviews and shows a success state', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-report',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'fr',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const reportForm = root.querySelector('transl8-report-form');
      expect(reportForm).not.toBeNull();

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Bonjour',
            version: 2,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="report-issue"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const grammarRadio = reportForm!.shadowRoot!.querySelector(
        'input[name="issue-type"][value="grammar"]',
      ) as HTMLInputElement;
      grammarRadio.checked = true;
      (
        reportForm!.shadowRoot!.querySelector(
          'textarea[part="comment"]',
        ) as HTMLTextAreaElement
      ).value = 'There is a typo.';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { accepted: true, id: 'issue_1' } }),
      });
      reportForm!
        .shadowRoot!.querySelector('button[part="submit"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/reviews',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token-report',
            'Content-Type': 'application/json',
          },
        }),
      );
      const sentBody = JSON.parse(
        (
          mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1] as {
            body: string;
          }
        ).body,
      );
      expect(sentBody.issue).toEqual({
        type: 'grammar',
        comment: 'There is a typo.',
      });
      expect(sentBody.translation.key).toBe('hero.title');
      expect(sentBody.translation.translatedText).toBe('Bonjour');

      const successEl = reportForm!.shadowRoot!.querySelector(
        '[part="success"]',
      ) as HTMLElement;
      expect(successEl.style.display).not.toBe('none');
    });

    it('report-issue cancel returns to the inspector showing the same selection', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-cancel',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'fr',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;
      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Bonjour',
            version: 2,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="report-issue"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(
        (inspector.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('none');
      expect(
        (reportForm.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('block');

      reportForm
        .shadowRoot!.querySelector('button[part="cancel"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(
        (reportForm.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('none');
      expect(
        (inspector.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('block');
      expect(
        inspector.shadowRoot!.querySelector('[part="current-text"]')!
          .textContent,
      ).toBe('Bonjour');
    });

    it('keeps the shell key row on screen across Inspector -> Ask AI, and diffs the suggestion against the current value', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-shell',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;
      const shellPart = (part: string) =>
        shell.shadowRoot!.querySelector(`[part="${part}"]`) as HTMLElement;

      // All three panels are views inside the one shell, not siblings of it.
      expect(inspector.parentElement).toBe(shell);
      expect(aiPanel.parentElement).toBe(shell);
      expect(root.querySelector('transl8-report-form')!.parentElement).toBe(
        shell,
      );

      (root.querySelector('transl8-launcher') as unknown as HTMLElement)
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="button"]')!
        .click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            // Deliberately NOT the element's data-translation-key. The key
            // row must render the backend lookup's key, never the host page's
            // own attribute (a security property) — with the two equal
            // the assertion below could not tell them apart.
            key: 'backend.hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 4,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shellPart('panel').style.display).toBe('block');
      expect(shellPart('key').textContent).toBe('backend.hero.title');
      expect(shellPart('chip-version').textContent).toBe('v4');
      expect(shellPart('title').textContent).toBe('Translation');
      expect(shellPart('back').style.visibility).toBe('hidden');

      // One source for the locale. The header chip and the inspector's
      // Details row both render the locale the lookup was performed in
      // (init({ locale: 'de' })), never the host page's own <html lang>,
      // which a host can set to anything and which used to feed the row.
      document.documentElement.lang = 'zz';
      expect(shellPart('chip-locale').textContent).toBe('DE');
      expect(
        inspector.shadowRoot!.querySelector('[part="locale"]')!.textContent,
      ).toBe('de');

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // The whole point of the shell: the key and the version survive the
      // view change that used to tear the frame down.
      expect(shellPart('panel').style.display).toBe('block');
      expect(shellPart('key').textContent).toBe('backend.hero.title');
      expect(shellPart('chip-version').textContent).toBe('v4');
      expect(shellPart('title').textContent).toBe('Translation AI');
      expect(shellPart('back').style.visibility).toBe('visible');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_1',
            intent: 'improve',
            suggestion: {
              text: 'Привіт!',
              explanation: 'Added exclamation for tone.',
            },
            confidenceBucket: 'high',
          },
        }),
      });
      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // show() is now called with the current field value, so the result
      // view can render a before/after. It passed nothing before this task,
      // which made the diff render blank on every analysis.
      expect(
        (aiPanel.shadowRoot!.querySelector('[part="diff"]') as HTMLElement)
          .style.display,
      ).toBe('flex');
      expect(
        aiPanel.shadowRoot!.querySelector('[part="diff-del"]')!.textContent,
      ).toBe('Привіт');
      expect(
        aiPanel.shadowRoot!.querySelector('[part="diff-ins"]')!.textContent,
      ).toBe('Привіт!');
    });

    it('Ask AI -> Analyze posts to /sdk/ai/analyze and shows a structured result', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-ai-panel',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel');
      expect(aiPanel).not.toBeNull();

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(
        (inspector.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('none');
      expect(
        (aiPanel!.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('block');

      (
        aiPanel!.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_1',
            intent: 'improve',
            issue: { type: 'grammar', severity: 'medium' },
            suggestion: {
              text: 'Привіт!',
              explanation: 'Added exclamation for tone.',
            },
            confidenceBucket: 'high',
          },
        }),
      });
      aiPanel!
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/ai/analyze',
        expect.objectContaining({ method: 'POST' }),
      );
      const resultEl = aiPanel!.shadowRoot!.querySelector(
        '[part="result"]',
      ) as HTMLElement;
      expect(resultEl.style.display).not.toBe('none');
      const suggestionEl = aiPanel!.shadowRoot!.querySelector(
        '[part="suggestion-text"]',
      );
      expect(suggestionEl!.textContent).toBe('Привіт!');
    });

    it.each([
      [['review:create'], 'none'],
      [['review:create', 'translation.analyze'], 'inline-block'],
    ] as const)(
      'Ask AI button visibility follows translation.analyze: permissions %j -> display %s',
      async (permissions, expectedDisplay) => {
        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              token: 'session-token-ask-ai-perm',
              expiresAt: '2026-08-22T12:00:00.000Z',
              projectId: 'project_123',
              permissions,
            },
          }),
        });
        const host = document.createElement('h1');
        host.setAttribute('data-translation-key', 'hero.title');
        host.textContent = 'Hello';
        document.body.appendChild(host);

        await ReviewSdk.init({
          apiBaseUrl: 'https://example.com/api/v1',
          projectId: 'project_123',
          apiKey: 'ta_live_test',
          locale: 'uk',
        });

        const root = document.body.querySelector('transl8-sdk-root')!;
        const inspector = root.querySelector('transl8-inspector-panel')!;
        (root.querySelector('transl8-launcher') as unknown as HTMLElement)
          .shadowRoot!.querySelector<HTMLButtonElement>('[part="button"]')!
          .click();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              key: 'hero.title',
              sourceText: 'Hello',
              value: 'Привіт',
              version: 1,
              updatedAt: '2026-08-21T09:00:00.000Z',
            },
          }),
        });
        (
          root.querySelector(
            'transl8-review-mode-badges',
          ) as unknown as HTMLElement
        )
          .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
          .click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const askAi = inspector.shadowRoot!.querySelector(
          '[part="ask-ai"]',
        ) as HTMLElement;
        if (expectedDisplay === 'none') {
          expect(askAi.style.display).toBe('none');
        } else {
          expect(askAi.style.display).not.toBe('none');
        }
      },
    );

    it('Ask AI -> Create report prefills and posts to /sdk/reviews', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-ai-report',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'backend.hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_1',
            intent: 'improve',
            issue: { type: 'grammar', severity: 'medium' },
            suggestion: {
              text: 'Привіт!',
              explanation: 'Added exclamation for tone.',
            },
            confidenceBucket: 'high',
          },
        }),
      });
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      aiPanel
        .shadowRoot!.querySelector('button[part="create-report"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(
        (aiPanel.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('none');
      expect(
        (reportForm.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('block');
      const grammarRadio = reportForm.shadowRoot!.querySelector(
        'input[name="issue-type"][value="grammar"]',
      ) as HTMLInputElement;
      expect(grammarRadio.checked).toBe(true);
      const comment = (
        reportForm.shadowRoot!.querySelector(
          'textarea[part="comment"]',
        ) as HTMLTextAreaElement
      ).value;
      expect(comment).toContain('AI detected: grammar');
      expect(comment).toContain('Привіт!');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'rev_1' } }),
      });
      reportForm
        .shadowRoot!.querySelector('button[part="submit"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/reviews',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer session-token-ai-report',
          }),
        }),
      );
      const successEl = reportForm.shadowRoot!.querySelector(
        '[part="success"]',
      ) as HTMLElement;
      expect(successEl.style.display).not.toBe('none');
    });

    it("the shell's close button is offered only where it genuinely closes", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-shell-close',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;
      const closeBtn = () =>
        shell.shadowRoot!.querySelector(
          'button[part="close"]',
        ) as HTMLButtonElement;
      const closeOffered = () => closeBtn().style.visibility !== 'hidden';
      const shellOpen = () =>
        (shell.shadowRoot!.querySelector('[part="panel"]') as HTMLElement).style
          .display === 'block';
      const bodyOpen = (el: Element) =>
        (el.shadowRoot!.querySelector('[part="panel"]') as HTMLElement).style
          .display === 'block';
      const lookup = {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'backend.hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      };
      const selectElement = async () => {
        mockFetch.mockResolvedValueOnce(lookup);
        (
          root.querySelector(
            'transl8-review-mode-badges',
          ) as unknown as HTMLElement
        )
          .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
          .click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      };

      (root.querySelector('transl8-launcher') as unknown as HTMLElement)
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="button"]')!
        .click();

      // --- from the translation view: offered, and it really closes ------
      await selectElement();
      expect(closeOffered()).toBe(true);
      expect(closeBtn().getAttribute('aria-label')).toBe('Close');
      expect(closeBtn().disabled).toBe(false);

      closeBtn().click();

      expect(shellOpen()).toBe(false);
      expect(bodyOpen(inspector)).toBe(false);

      // --- from the AI views: not offered at all -------------------------
      // The header's Back arrow and the body's Cancel already do this, so a
      // second control for the same action is withheld rather than being
      // relabelled into a "Close" that does not close.
      await selectElement();
      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(closeOffered()).toBe(false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_1',
            intent: 'improve',
            suggestion: { text: 'Привіт!', explanation: 'Tone.' },
            confidenceBucket: 'high',
          },
        }),
      });
      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Mid-flight ('ai-analyzing'): no exit edge exists, so the control is
      // shown — the header must not reflow mid-operation — but unavailable
      // rather than looking clickable and doing nothing.
      expect(closeOffered()).toBe(true);
      expect(closeBtn().disabled).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // 'ai-result' is a Back state too: still not offered.
      expect(closeOffered()).toBe(false);

      // Back, which IS offered here, is what returns to the inspector.
      shell
        .shadowRoot!.querySelector('button[part="back"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(shellOpen()).toBe(true);
      expect(bodyOpen(aiPanel)).toBe(false);
      expect(bodyOpen(inspector)).toBe(true);

      // --- from report-submitted: back to a real Close -------------------
      inspector
        .shadowRoot!.querySelector('[part="report-issue"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(closeOffered()).toBe(false);

      (
        reportForm.shadowRoot!.querySelector(
          'input[name="issue-type"][value="grammar"]',
        ) as HTMLInputElement
      ).checked = true;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'rev_1' } }),
      });
      reportForm
        .shadowRoot!.querySelector('button[part="submit"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(closeOffered()).toBe(true);
      expect(closeBtn().getAttribute('aria-label')).toBe('Close');
      expect(closeBtn().disabled).toBe(false);

      closeBtn().click();

      expect(shellOpen()).toBe(false);
      expect(bodyOpen(reportForm)).toBe(false);
    });

    it('Escape is inert while an apply is in flight, because it reads the same table the close button does (F1)', async () => {
      // The state machine has no exit edge from 'inspector-applying'.
      // Escape used to run the panel's own per-view dismiss instead of
      // dismissAction(), firing an illegal 'inspector.close': the machine
      // warned and stayed put while the panel came off screen anyway, so
      // when the PUT resolved it landed in 'inspector-open' with nothing
      // rendered — and stale detection, which gates on 'inspector-open',
      // silently dropped every translation.changed after that.
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-escape-inflight',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create', 'translation.edit'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const shellPanel = shell.shadowRoot!.querySelector(
        '[part="panel"]',
      ) as HTMLElement;
      const inspectorPanel = inspector.shadowRoot!.querySelector(
        '[part="panel"]',
      ) as HTMLElement;

      (root.querySelector('transl8-launcher') as unknown as HTMLElement)
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="button"]')!
        .click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 3,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // A PUT that never settles leaves the machine parked on
      // 'inspector-applying' for the length of the assertion.
      mockFetch.mockReturnValueOnce(new Promise(() => {}));
      (
        inspector.shadowRoot!.querySelector(
          'textarea[part="current-edit"]',
        ) as HTMLTextAreaElement
      ).value = 'Привіт!';
      inspector
        .shadowRoot!.querySelector('button[part="apply"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // The header control already refuses here; Escape must agree.
      expect(
        (
          shell.shadowRoot!.querySelector(
            'button[part="close"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      inspectorPanel.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(warn).not.toHaveBeenCalled();
      expect(shellPanel.style.display).toBe('block');
      expect(shellPanel.hasAttribute('data-open')).toBe(true);
      expect(inspectorPanel.style.display).toBe('block');
      warn.mockRestore();
    });

    it('leaving review mode with a panel open takes the panel off the host page (F2)', async () => {
      // Regression against base: the badges are cleared on 'idle', so
      // nothing can re-select; 'idle' has no dismiss action, so the header
      // X is disabled and Back is hidden. A shell left open here is an
      // undismissable overlay painted over the customer's page.
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-leave-review-mode',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const shellPanel = shell.shadowRoot!.querySelector(
        '[part="panel"]',
      ) as HTMLElement;
      const inspectorPanel = inspector.shadowRoot!.querySelector(
        '[part="panel"]',
      ) as HTMLElement;
      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;

      launcherButton.click();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shellPanel.style.display).toBe('block');
      expect(inspectorPanel.style.display).toBe('block');

      // Same click that turned review mode on turns it off.
      launcherButton.click();

      expect(shellPanel.style.display).toBe('none');
      expect(shellPanel.hasAttribute('data-open')).toBe(false);
      expect(inspectorPanel.style.display).toBe('none');
    });

    it('shows exactly one view body when a different element is selected while the AI view is open', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-reselect',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      for (const key of ['hero.title', 'hero.subtitle']) {
        const el = document.createElement('h1');
        el.setAttribute('data-translation-key', key);
        el.textContent = key;
        document.body.appendChild(el);
      }

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;
      const visibleBodies = () =>
        [
          ['inspector', inspector],
          ['ai', aiPanel],
          ['report', reportForm],
        ]
          .filter(
            ([, el]) =>
              (
                (el as Element).shadowRoot!.querySelector(
                  '[part="panel"]',
                ) as HTMLElement
              ).style.display === 'block',
          )
          .map(([name]) => name);

      const lookup = (key: string) => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key,
            sourceText: key,
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });

      (root.querySelector('transl8-launcher') as unknown as HTMLElement)
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="button"]')!
        .click();

      const badges = () =>
        (
          root.querySelector(
            'transl8-review-mode-badges',
          ) as unknown as HTMLElement
        ).shadowRoot!.querySelectorAll<HTMLButtonElement>('[part="badge"]');

      mockFetch.mockResolvedValueOnce(lookup('hero.title'));
      badges()[0].click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(visibleBodies()).toEqual(['inspector']);

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(visibleBodies()).toEqual(['ai']);

      // Selecting another element while the AI view is open. Before the fix
      // this left the AI body display:block alongside the inspector's, and
      // the two stacked inside the shell's single frame.
      mockFetch.mockResolvedValueOnce(lookup('hero.subtitle'));
      badges()[1].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(visibleBodies()).toEqual(['inspector']);
    });

    it("the shell's Back button from an AI-opened report form returns to the AI result, not the inspector", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-shell-back',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;
      const display = (el: Element, part: string) =>
        (el.shadowRoot!.querySelector(`[part="${part}"]`) as HTMLElement).style
          .display;

      (root.querySelector('transl8-launcher') as unknown as HTMLElement)
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="button"]')!
        .click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_1',
            intent: 'improve',
            issue: { type: 'grammar', severity: 'medium' },
            suggestion: {
              text: 'Привіт!',
              explanation: 'Added exclamation for tone.',
            },
            confidenceBucket: 'high',
          },
        }),
      });
      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      aiPanel
        .shadowRoot!.querySelector('button[part="create-report"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(display(reportForm, 'panel')).toBe('block');

      // The shell's Back must route through reportForm.onCancel, which is
      // what branches on reportOpenedFromAi. Flattening it into "return to
      // the inspector" is the silent regression this guards.
      shell
        .shadowRoot!.querySelector('button[part="back"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(display(reportForm, 'panel')).toBe('none');
      expect(display(inspector, 'panel')).toBe('none');
      expect(display(aiPanel, 'panel')).toBe('block');
      expect(display(aiPanel, 'result')).toBe('block');
      expect(
        aiPanel.shadowRoot!.querySelector('[part="suggestion-text"]')!
          .textContent,
      ).toBe('Привіт!');
      expect(
        (shell.shadowRoot!.querySelector('[part="title"]') as HTMLElement)
          .textContent,
      ).toBe('Translation AI');
    });

    it('hides Apply without translation.edit and applies the AI suggestion when granted', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-ai-apply',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create', 'translation.edit'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_apply_1',
            intent: 'improve',
            suggestion: {
              text: 'Привіт!',
              explanation: 'Added exclamation for tone.',
            },
            confidenceBucket: 'high',
          },
        }),
      });
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const applyBtn = aiPanel.shadowRoot!.querySelector(
        'button[part="apply"]',
      ) as HTMLButtonElement;
      expect(applyBtn.style.display).not.toBe('none');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: 'Привіт!',
            version: 2,
            updatedAt: '2026-08-21T10:00:00.000Z',
          },
        }),
      });
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/apply',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            key: 'hero.title',
            language: 'de',
            expectedVersion: 1,
            newValue: 'Привіт!',
            source: 'ai_suggestion',
          }),
        }),
      );
      expect(
        aiPanel.shadowRoot!.querySelector('[part="apply-status"]')!.textContent,
      ).toBe('Translation applied.');
      expect(host.textContent).toBe('Привіт!');
    });

    it('does not show Apply when the session lacks translation.edit', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_no_apply',
            intent: 'improve',
            suggestion: { text: 'Привіт!', explanation: 'Tone tweak.' },
            confidenceBucket: 'high',
          },
        }),
      });
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        (
          aiPanel.shadowRoot!.querySelector(
            'button[part="apply"]',
          ) as HTMLButtonElement
        ).style.display,
      ).toBe('none');
    });

    it('shows manual edit in Inspector with translation.edit and applies via POST /sdk/translations/apply', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-inspector-apply',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create', 'translation.edit'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const editEl = inspector.shadowRoot!.querySelector(
        'textarea[part="current-edit"]',
      ) as HTMLTextAreaElement;
      expect(editEl.style.display).not.toBe('none');
      editEl.value = 'Привіт!';

      const applyBtn = inspector.shadowRoot!.querySelector(
        'button[part="apply"]',
      ) as HTMLButtonElement;
      expect(applyBtn.style.display).not.toBe('none');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: 'Привіт!',
            version: 2,
            updatedAt: '2026-08-21T10:00:00.000Z',
          },
        }),
      });
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/apply',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            key: 'hero.title',
            language: 'de',
            expectedVersion: 1,
            newValue: 'Привіт!',
            source: 'manual',
          }),
        }),
      );
      expect(
        inspector.shadowRoot!.querySelector('[part="apply-status"]')!
          .textContent,
      ).toBe('Translation applied.');
      expect(editEl.value).toBe('Привіт!');
      expect(
        inspector.shadowRoot!.querySelector('[part="version"]')!.textContent,
      ).toContain('2');
      expect(host.textContent).toBe('Привіт!');
    });

    it('does not show Inspector manual edit when the session lacks translation.edit', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        (
          inspector.shadowRoot!.querySelector(
            'textarea[part="current-edit"]',
          ) as HTMLTextAreaElement
        ).style.display,
      ).toBe('none');
      expect(
        (
          inspector.shadowRoot!.querySelector(
            'button[part="apply"]',
          ) as HTMLButtonElement
        ).style.display,
      ).toBe('none');
      expect(
        inspector.shadowRoot!.querySelector('[part="current-text"]')!
          .textContent,
      ).toBe('Привіт');
    });

    it('re-enables the Analyze button after Cancel request is clicked mid-flight', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-ai-cancel',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';

      // Never resolves on its own — only settles when the internal
      // AbortController (wired to "Cancel request") fires.
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      );

      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(
        (
          aiPanel.shadowRoot!.querySelector(
            'button[part="analyze"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      aiPanel
        .shadowRoot!.querySelector('button[part="cancel-request"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        (
          aiPanel.shadowRoot!.querySelector(
            'button[part="analyze"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    it('shows the rate-limit message on a 429 response instead of the generic error', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-ai-429',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () =>
          '{"message":"Too many AI requests — try again in a minute"}',
        json: async () => ({}),
      });
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        aiPanel.shadowRoot!.querySelector('[part="error"]')!.textContent,
      ).toBe('Too many AI requests. Please wait a minute and try again.');
    });

    it('does not mount a second launcher when init is called twice', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      });

      const opts: ReviewSdkInitOptions = {
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      };

      await ReviewSdk.init(opts);
      await ReviewSdk.init(opts);

      expect(document.body.querySelectorAll('transl8-launcher')).toHaveLength(
        1,
      );
      expect(document.body.querySelectorAll('transl8-sdk-root')).toHaveLength(
        1,
      );
      expect(
        document.body.querySelectorAll('transl8-highlight-overlay'),
      ).toHaveLength(1);
    });

    async function mountInspectorForPropose(
      mockFetch: ReturnType<typeof vi.fn>,
    ) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-inspector-propose',
            expiresAt: '2026-08-22T12:00:00.000Z',
            projectId: 'project_123',
            permissions: ['review:create', 'translation.propose'],
          },
        }),
      });
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;

      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const editEl = inspector.shadowRoot!.querySelector(
        'textarea[part="current-edit"]',
      ) as HTMLTextAreaElement;
      editEl.value = 'Привіт!';

      const proposeBtn = inspector.shadowRoot!.querySelector(
        'button[part="propose"]',
      ) as HTMLButtonElement;
      expect(proposeBtn.style.display).not.toBe('none');

      return { inspector, proposeBtn };
    }

    it('keeps Submit for review disabled after an already-pending 409 until refreshed', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const { inspector, proposeBtn } =
        await mountInspectorForPropose(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'CONFLICT',
            message:
              'A proposal is already pending review for this translation',
          },
        }),
      });
      proposeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        inspector.shadowRoot!.querySelector('[part="propose-status"]')!
          .textContent,
      ).toBe('Already pending review.');
      expect(proposeBtn.disabled).toBe(true);
    });

    it("re-enables Submit for review after a version-conflict 409, matching Apply's conflict behavior", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const { inspector, proposeBtn } =
        await mountInspectorForPropose(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Translation version conflict',
            currentValue: 'Bonjour (edited elsewhere)',
            currentVersion: 2,
          },
        }),
      });
      proposeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        inspector.shadowRoot!.querySelector('[part="propose-status"]')!
          .textContent,
      ).toBe('This translation was changed by someone else.');
      expect(proposeBtn.disabled).toBe(false);
      expect(
        inspector.shadowRoot!.querySelector('[part="version"]')!.textContent,
      ).toContain('2');
    });
  });

  describe('setLocale / transl8:set-locale (locale switching)', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    async function openInspectorPanel(mockFetch: ReturnType<typeof vi.fn>) {
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const shellPanel = shell.shadowRoot!.querySelector(
        '[part="panel"]',
      ) as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      badges
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      return { root, shell, shellPanel, launcher, badges };
    }

    it('setLocale() changes the language subsequent requests send', async () => {
      const mockFetch = mockSessionResponse([]);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      await sdk.getTranslation('hero.title');
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/lookup?key=hero.title&language=uk',
        expect.anything(),
      );

      sdk.setLocale('de');
      expect(sdk.getLocale()).toBe('de');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      await sdk.getTranslation('hero.title');
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/lookup?key=hero.title&language=de',
        expect.anything(),
      );
    });

    it('the transl8:set-locale window event routes to the same code path as setLocale()', async () => {
      const mockFetch = mockSessionResponse([]);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      window.dispatchEvent(
        new CustomEvent('transl8:set-locale', { detail: 'fr' }),
      );
      expect(sdk.getLocale()).toBe('fr');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Bonjour',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      await sdk.getTranslation('hero.title');
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/lookup?key=hero.title&language=fr',
        expect.anything(),
      );
    });

    it('closes an open panel on a locale change but returns to review mode, not idle', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });
      const { shellPanel, launcher, badges } =
        await openInspectorPanel(mockFetch);

      expect(shellPanel.style.display).toBe('block');
      expect(shellPanel.hasAttribute('data-open')).toBe(true);

      sdk.setLocale('de');

      // The panel is gone: its lookup was for the old language.
      expect(shellPanel.style.display).toBe('none');
      expect(shellPanel.hasAttribute('data-open')).toBe(false);
      // But review mode itself is back on — 'review.disable' -> 'idle' is
      // only ever a stopover here, immediately followed by 'review.enable'.
      // A reviewer who switched language to check the translated strings
      // must not have to press Ctrl+Shift+T again to keep reviewing.
      expect(launcher.getAttribute('data-active')).toBe('true');
      // The tracker cleared its badges on the disable and rescanned on the
      // re-enable (review-mode-element-tracker.ts), so a badge is present
      // again rather than review mode being "on" with nothing to click.
      expect(badges.shadowRoot!.querySelectorAll('[part="badge"]').length).toBe(
        1,
      );
    });

    it('does not close the panel when the same locale is set again', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });
      const { shellPanel, launcher } = await openInspectorPanel(mockFetch);

      expect(shellPanel.style.display).toBe('block');

      sdk.setLocale('uk');

      expect(shellPanel.style.display).toBe('block');
      expect(shellPanel.hasAttribute('data-open')).toBe(true);
      expect(launcher.getAttribute('data-active')).toBe('true');
      expect(sdk.getLocale()).toBe('uk');
    });

    // Motivates the construction-time canonicalization fix: `setLocale`
    // compares canonical-to-canonical, but if `init()` ever stored the raw
    // `opts.locale`, `'en-us'` (from init) vs `'en-US'` (canonical, from
    // setLocale) would read as a genuine change and incorrectly bounce
    // review mode / close the open panel for a locale that never actually
    // changed.
    it("treats init({ locale: 'en-us' }) + setLocale('en-US') as the same locale — panel stays open, review mode not bounced", async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'en-us',
      });
      expect(sdk.getLocale()).toBe('en-US');

      const { shellPanel, launcher } = await openInspectorPanel(mockFetch);

      expect(shellPanel.style.display).toBe('block');

      sdk.setLocale('en-US');

      expect(shellPanel.style.display).toBe('block');
      expect(shellPanel.hasAttribute('data-open')).toBe(true);
      expect(launcher.getAttribute('data-active')).toBe('true');
      expect(sdk.getLocale()).toBe('en-US');
    });

    it('leaves review mode off when a locale change happens while it was already off', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;

      // Review mode was never turned on — the launcher button is never
      // clicked in this test.
      expect(launcher.getAttribute('data-active')).toBe('false');

      sdk.setLocale('de');

      expect(sdk.getLocale()).toBe('de');
      // A locale change must not switch review mode on for a user who had
      // it off: PANEL_OPEN_STATES doesn't include 'idle', so onLocaleChange
      // never calls 'review.disable' (or the paired 'review.enable') here
      // at all.
      expect(launcher.getAttribute('data-active')).toBe('false');
      expect(badges.shadowRoot!.querySelectorAll('[part="badge"]').length).toBe(
        0,
      );
    });

    it("updates the persistent launcher's own chrome locale on setLocale(), not just on the next panel remount", async () => {
      // 'review:create' — the launcher (and its onLocaleChange wiring) only
      // mounts when this permission is granted (see "launcher auto-mount").
      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });
      void mockFetch;

      // The launcher badge is unlike aiPanel/reportForm/inspector: it never
      // closes or remounts on a locale change, so
      // proving its chrome is current means proving `setLocale()` was
      // actually called on it, not just inferring it from a re-render that
      // would have happened anyway. 'de' has no strings table and falls back
      // to English (ui/strings.ts), so asserting on the resulting text
      // alone couldn't tell "wired" from "not wired" for it.
      const setLocaleSpy = vi.spyOn(Transl8Launcher.prototype, 'setLocale');

      sdk.setLocale('de');

      expect(setLocaleSpy).toHaveBeenCalledWith('de');
    });

    it('re-renders the review-mode badges under the new locale even with no panel open (review-mode-active, outside PANEL_OPEN_STATES)', async () => {
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });
      void mockFetch;

      const root = document.body.querySelector('transl8-sdk-root')!;
      const launcher = root.querySelector('transl8-launcher')! as unknown as HTMLElement;
      // Turn review mode on but never open a panel: 'review-mode-active' is
      // not in PANEL_OPEN_STATES, so onLocaleChange's disable/re-enable
      // cycle (which would otherwise force a rescan) never fires here.
      (
        launcher.shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement
      ).click();
      expect(launcher.getAttribute('data-active')).toBe('true');

      const renderSpy = vi.spyOn(Transl8ReviewModeBadges.prototype, 'render');
      renderSpy.mockClear();

      sdk.setLocale('de');

      expect(renderSpy).toHaveBeenCalledWith(expect.anything(), 'de');
    });

    it('does not corrupt the idle launcher label ("Review") when setLocale() is called while review mode is off', async () => {
      // Regression: ReviewModeElementTracker.setLocale() used to call
      // reposition() unconditionally. reposition()'s zero-elements branch
      // fires `onCountChange?.(0)` with no state check of its own, which
      // flows straight into Transl8Launcher.setKeyCount(0) and repaints the
      // idle launcher label from "Review" to "0 keys" — even though review
      // mode was never turned on and no badges are on screen to refresh.
      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });
      void mockFetch;

      const root = document.body.querySelector('transl8-sdk-root')!;
      const launcher = root.querySelector('transl8-launcher')! as unknown as HTMLElement;
      expect(launcher.getAttribute('data-active')).toBe('false');
      expect(launcher.shadowRoot!.querySelector('[part="count"]')!.textContent).toBe(
        'Review',
      );

      sdk.setLocale('de');

      expect(launcher.shadowRoot!.querySelector('[part="count"]')!.textContent).toBe(
        'Review',
      );
    });

    it('sets dir on the SDK root from the resolved chrome language: rtl for ar, ltr for a translated LTR or an untranslated RTL locale', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'ar-EG',
      });
      void mockFetch;

      const root = document.body.querySelector('transl8-sdk-root') as HTMLElement;
      // At mount time (init() never fires onLocaleChange) ...
      expect(root.dir).toBe('rtl');
      const launcher = root.querySelector('transl8-launcher') as HTMLElement;
      expect(launcher.shadowRoot!.querySelector('[part="count"]')!.textContent).toBe('مراجعة');

      // ... and on a later switch, in both directions.
      sdk.setLocale('fr');
      expect(root.dir).toBe('ltr');
      sdk.setLocale('ar');
      expect(root.dir).toBe('rtl');
      // `he` is RTL but has no strings table, so its chrome is English and stays LTR.
      sdk.setLocale('he');
      expect(root.dir).toBe('ltr');
    });

    it('threads the init() locale into the launcher and tracker at mount time, not only on a later setLocale() call', async () => {
      // sdk.onLocaleChange (which calls launcher.setLocale()/tracker.setLocale())
      // only fires from ReviewSdk.setLocale()'s explicit-change path —
      // init() never calls it — so without an explicit mount-time sync, a
      // host that only ever does init({ locale }) and never calls
      // setLocale() again would leave both components' internal `locale`
      // field undefined for the whole session.
      const launcherSetLocale = vi.spyOn(Transl8Launcher.prototype, 'setLocale');
      const trackerSetLocale = vi.spyOn(ReviewModeElementTracker.prototype, 'setLocale');

      const mockFetch = mockSessionResponse(['review:create']);
      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });
      void mockFetch;

      expect(launcherSetLocale).toHaveBeenCalledWith('de');
      expect(trackerSetLocale).toHaveBeenCalledWith('de');
    });

    it('threads the init() locale into the shell and inspector at mount time, not only on a later setLocale() call', async () => {
      // Mirrors the launcher/tracker mount-time sync test above: without it,
      // a host that only ever does init({ locale }) and never calls
      // setLocale() again would leave the shell/inspector's internal
      // `currentLocale` field undefined for the whole session.
      const shellSetLocale = vi.spyOn(Transl8PanelShell.prototype, 'setLocale');
      const inspectorSetLocale = vi.spyOn(Transl8InspectorPanel.prototype, 'setLocale');

      const mockFetch = mockSessionResponse(['review:create']);
      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });
      void mockFetch;

      expect(shellSetLocale).toHaveBeenCalledWith('de');
      expect(inspectorSetLocale).toHaveBeenCalledWith('de');
    });

    it('rejects invalid input from both entry points without throwing or changing the locale', async () => {
      const mockFetch = mockSessionResponse([]);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });
      void mockFetch;

      // Rejected silently *to the caller* (no throw), but not silently
      // altogether — Fix 3: an integrator with a typo gets a console signal
      // instead of a request that quietly never changes language.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      sdk.setLocale(undefined as unknown as string);
      sdk.setLocale(123 as unknown as string);
      sdk.setLocale('' as string);
      sdk.setLocale('not a locale!!' as string);
      expect(sdk.getLocale()).toBe('uk');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[review-sdk]'),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('not a locale!!'),
      );

      expect(() =>
        window.dispatchEvent(
          new CustomEvent('transl8:set-locale', { detail: undefined }),
        ),
      ).not.toThrow();
      expect(() =>
        window.dispatchEvent(
          new CustomEvent('transl8:set-locale', { detail: { locale: 'de' } }),
        ),
      ).not.toThrow();
      expect(() =>
        window.dispatchEvent(new Event('transl8:set-locale')),
      ).not.toThrow();
      expect(sdk.getLocale()).toBe('uk');

      warn.mockRestore();
    });

    // getTranslation, applyTranslation and
    // proposeTranslation all capture `this.locale` synchronously at call
    // time, so the request itself is correctly scoped — but a slow response
    // that only *completes* after the locale (and generation) has already
    // moved on used to run its .then/.catch unconditionally regardless,
    // repainting stale-language content or writing a stale value onto a
    // host node the page already re-rendered in the new language. These
    // three tests are the exact scenarios named in that finding.
    it('a locale change during an in-flight getTranslation leaves the panel closed and does not repopulate it', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const shellPanel = shell.shadowRoot!.querySelector(
        '[part="panel"]',
      ) as HTMLElement;
      const inspectorPanel = inspector.shadowRoot!.querySelector(
        '[part="panel"]',
      ) as HTMLElement;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      // The badge click's getTranslation call never resolves on its own —
      // resolved manually below, after the locale change, to reproduce
      // "response arrives after the panel it was for is already gone."
      let resolveLookup!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLookup = resolve;
          }),
      );
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Badge click already moved the state machine to 'inspector-open'
      // (element.click + context.resolved fire synchronously before the
      // lookup is even sent), which is why the locale change below closes
      // the panel — even though the lookup that would have populated it is
      // still in flight.
      expect(shellPanel.hasAttribute('data-open')).toBe(true);

      sdk.setLocale('de');
      expect(shellPanel.style.display).toBe('none');
      expect(launcher.getAttribute('data-active')).toBe('true');

      // The stale, old-locale lookup now resolves.
      resolveLookup({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Must stay closed — a stale response must not reopen a panel the
      // user already moved past, nor repaint it with old-locale content
      // under the new locale's chip.
      expect(shellPanel.style.display).toBe('none');
      expect(shellPanel.hasAttribute('data-open')).toBe(false);
      expect(inspectorPanel.style.display).toBe('none');
    });

    it('a locale change during an in-flight Apply does not write to the host DOM', async () => {
      const mockFetch = mockSessionResponse([
        'review:create',
        'translation.edit',
      ]);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      (
        inspector.shadowRoot!.querySelector(
          'textarea[part="current-edit"]',
        ) as HTMLTextAreaElement
      ).value = 'Привіт!';
      const applyBtn = inspector.shadowRoot!.querySelector(
        'button[part="apply"]',
      ) as HTMLButtonElement;

      // The apply PUT never resolves on its own — resolved manually below,
      // after the locale change, to reproduce "the write lands after the
      // page has already been re-rendered in a different language."
      let resolveApply!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveApply = resolve;
          }),
      );
      applyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      sdk.setLocale('de');
      expect(host.textContent).toBe('Hello');

      resolveApply({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: 'Привіт!',
            version: 2,
            updatedAt: '2026-08-21T10:00:00.000Z',
          },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Must never have written the old-locale value to the host node —
      // that node belongs to a page the reviewer has since switched away
      // from, in the same way the closed panel above must not repopulate.
      expect(host.textContent).toBe('Hello');
    });

    it("setLocale('en-us') results in requests sending 'en-US'", async () => {
      const mockFetch = mockSessionResponse([]);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      sdk.setLocale('en-us');
      expect(sdk.getLocale()).toBe('en-US');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hi',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      await sdk.getTranslation('hero.title');
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/lookup?key=hero.title&language=en-US',
        expect.anything(),
      );
    });

    // analyzeTranslation was also at risk, so it is guarded too.
    // Same reasoning as getTranslation and
    // apply/propose: a slow analyze that only *completes* after the locale
    // moved on must not paint its result, and — the sharper failure — must not leave that stale result
    // sitting in the panel's own DOM for a *later*, fresh open of the same
    // element to inherit.
    it('a locale change during an in-flight analyze leaves no stale suggestion in the panel, including after reopening it', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const aiPanel = root.querySelector('transl8-ai-panel')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      (
        aiPanel.shadowRoot!.querySelector(
          'textarea[part="request"]',
        ) as HTMLTextAreaElement
      ).value = 'fix this';

      // The analyze POST never resolves on its own — resolved manually
      // below, after the locale change, to reproduce "the AI response for
      // the old language arrives after the reviewer switched languages."
      let resolveAnalyze!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAnalyze = resolve;
          }),
      );
      aiPanel
        .shadowRoot!.querySelector('button[part="analyze"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      sdk.setLocale('de');

      resolveAnalyze({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_stale',
            intent: 'improve',
            suggestion: { text: 'STALE UK SUGGESTION', explanation: 'stale' },
            confidenceBucket: 'high',
          },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Immediately after the stale response: must not have painted it.
      expect(
        (aiPanel.shadowRoot!.querySelector('[part="result"]') as HTMLElement)
          .style.display,
      ).toBe('none');
      expect(
        aiPanel.shadowRoot!.querySelector('[part="suggestion-text"]')!
          .textContent,
      ).toBe('');

      // Reopen fresh for the SAME element (review mode stayed active, so no
      // launcher click needed) — the exact scenario that matters:
      // ai-panel.ts's reset() hides the result section on every show() but
      // never clears suggestion-text's own textContent, so a stale
      // showResult() call from before this reopen would still be sitting
      // underneath it if the generation guard hadn't stopped it from
      // running in the first place.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(
        (aiPanel.shadowRoot!.querySelector('[part="result"]') as HTMLElement)
          .style.display,
      ).toBe('none');
      expect(
        aiPanel.shadowRoot!.querySelector('[part="suggestion-text"]')!
          .textContent,
      ).toBe('');
    });

    // A bailed handler must leave the UI
    // usable, not just silent. Apply already self-heals (show() -> reset()
    // -> clearApplyFeedback() -> setApplying(false)); Propose has no such
    // reset path, so its own bail must explicitly re-enable the button.
    // The very first version of
    // this test asserted that the bail itself re-enables the button. That
    // was the bug — inspector.onPropose's stale-bail used to call
    // inspector.setProposing(false) directly, which is exactly the hazard
    // the report path was already written to avoid: this inspector panel
    // is shared across every selection, so if propose B is legitimately
    // in flight when abandoned propose A's stale response arrives, a
    // direct reset would re-enable a button B currently owns — inviting a
    // double-submit whose real success then comes back as
    // ProposeTranslationAlreadyPendingError. The fix moved the reset to
    // inspector.show()'s new clearProposeFeedback() call (mirroring
    // clearApplyFeedback()), so the bail itself now writes nothing at all.
    it('a locale change during an in-flight Propose does not re-enable a button a later Propose owns', async () => {
      const mockFetch = mockSessionResponse([
        'review:create',
        'translation.propose',
      ]);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;

      const lookupResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      };
      const selectAndEdit = async () => {
        mockFetch.mockResolvedValueOnce(lookupResponse);
        badges
          .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
          .click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        (
          inspector.shadowRoot!.querySelector(
            'textarea[part="current-edit"]',
          ) as HTMLTextAreaElement
        ).value = 'Привіт!';
      };

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      // --- Propose A: submitted, then abandoned mid-flight -----------------
      await selectAndEdit();
      const proposeBtn = inspector.shadowRoot!.querySelector(
        'button[part="propose"]',
      ) as HTMLButtonElement;
      let resolveA!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      );
      proposeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(proposeBtn.disabled).toBe(true);

      sdk.setLocale('de');
      // Force-closed: the panel is hidden, review mode is back on (round 1).
      expect(
        (inspector.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('none');

      // --- Propose B: a genuinely new propose, still in flight -------------
      await selectAndEdit();
      expect(proposeBtn.disabled).toBe(false); // reopening reset it — self-heal, not the bail
      let resolveB!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );
      proposeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(proposeBtn.disabled).toBe(true);

      // A's stale response now resolves.
      resolveA({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'proposal_A' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Must NOT have touched the button B's own in-flight request owns —
      // re-enabling it here would let the reviewer click Propose again
      // while B is still genuinely submitting.
      expect(proposeBtn.disabled).toBe(true);
      expect(
        inspector.shadowRoot!.querySelector('[part="propose-status"]')!
          .textContent,
      ).toBe('');

      // B's own, genuinely current response resolves normally afterward.
      resolveB({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'proposal_B' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(proposeBtn.disabled).toBe(false);
      expect(
        inspector.shadowRoot!.querySelector('[part="propose-status"]')!
          .textContent,
      ).toBe('Submitted for review.');
    });

    // The deliberate case the previous test's fix must not swallow:
    // ProposeTranslationAlreadyPendingError is a live rejection the caller
    // must refresh before retrying, unrelated to locale staleness, and it
    // must stay exactly as disabled as the already-pending path left it.
    it('setProposeAlreadyPending() still leaves the button disabled (not the abandoned-request case)', async () => {
      const mockFetch = mockSessionResponse([
        'review:create',
        'translation.propose',
      ]);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      (
        inspector.shadowRoot!.querySelector(
          'textarea[part="current-edit"]',
        ) as HTMLTextAreaElement
      ).value = 'Привіт!';
      const proposeBtn = inspector.shadowRoot!.querySelector(
        'button[part="propose"]',
      ) as HTMLButtonElement;

      // No locale change here at all — this is the ordinary already-pending
      // 409, same-language, resolving normally.
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'CONFLICT',
            message:
              'A proposal is already pending review for this translation',
          },
        }),
      });
      proposeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        inspector.shadowRoot!.querySelector('[part="propose-status"]')!
          .textContent,
      ).toBe('Already pending review.');
      expect(proposeBtn.disabled).toBe(true);
    });

    // submitReportIssue's
    // sdk.reportIssue() completion had no isStaleLocale guard. This race is
    // subtler than the other six — 'submitting-report' had no exit edge
    // before locale-switching existed, so a report could never be
    // abandoned mid-flight. onLocaleChange force-closing the panel from
    // 'submitting-report' (it's in PANEL_OPEN_STATES) is what makes the
    // window possible for the first time.
    it('a stale report response must not show success over a later, still-live report', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;

      const lookupResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      };
      const selectAndOpenReport = async () => {
        mockFetch.mockResolvedValueOnce(lookupResponse);
        badges
          .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
          .click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        inspector
          .shadowRoot!.querySelector('[part="report-issue"]')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        (
          reportForm.shadowRoot!.querySelector(
            'input[name="issue-type"][value="grammar"]',
          ) as HTMLInputElement
        ).checked = true;
      };

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      // --- Report A: submitted, then abandoned mid-flight -----------------
      await selectAndOpenReport();
      let resolveA!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      );
      reportForm
        .shadowRoot!.querySelector('button[part="submit"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      sdk.setLocale('de');
      // Force-closed: the form is hidden, review mode is back on (round 1).
      expect(
        (reportForm.shadowRoot!.querySelector('[part="panel"]') as HTMLElement)
          .style.display,
      ).toBe('none');

      // --- Report B: a genuinely new report, still in flight --------------
      await selectAndOpenReport();
      let resolveB!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );
      const submitBtn = reportForm.shadowRoot!.querySelector(
        'button[part="submit"]',
      ) as HTMLButtonElement;
      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(submitBtn.disabled).toBe(true);

      // A's stale response now resolves.
      resolveA({
        ok: true,
        status: 200,
        json: async () => ({ data: { accepted: true, id: 'issue_A' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Must NOT show success over B's still-live submission, and must not
      // have touched the button B's own in-flight request still owns.
      const successEl = reportForm.shadowRoot!.querySelector(
        '[part="success"]',
      ) as HTMLElement;
      expect(successEl.style.display).toBe('none');
      expect(submitBtn.disabled).toBe(true);

      // B's own, genuinely current response resolves normally afterward.
      resolveB({
        ok: true,
        status: 200,
        json: async () => ({ data: { accepted: true, id: 'issue_B' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(successEl.style.display).not.toBe('none');
    });

    // Checked the same way as Propose's wedge — but here the existing self-heal already covers it:
    // reportForm.show() -> reset() -> setSubmitting(false) runs on every
    // fresh open, the same shape as Apply (which needed no extra fix) and
    // unlike Propose (which did, because inspector.show() only resets Apply
    // feedback, not Propose feedback). So submitReportIssue's stale-bail
    // deliberately does NOT call setSubmitting(false) itself — the form is
    // shared by every report, and doing so on bail could wrongly re-enable
    // Submit while a *different*, still-genuinely-in-flight report owns
    // that disabled state (as in the race above). This test guards that the
    // self-heal-via-reopen path keeps working.
    it('a bailed report leaves the form usable after reopening it, without an explicit reset', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      badges
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      inspector
        .shadowRoot!.querySelector('[part="report-issue"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      (
        reportForm.shadowRoot!.querySelector(
          'input[name="issue-type"][value="grammar"]',
        ) as HTMLInputElement
      ).checked = true;

      mockFetch.mockImplementationOnce(() => new Promise(() => {})); // abandoned, never resolves
      const submitBtn = reportForm.shadowRoot!.querySelector(
        'button[part="submit"]',
      ) as HTMLButtonElement;
      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(submitBtn.disabled).toBe(true);

      sdk.setLocale('de'); // force-closes the form; the abandoned request never resolves at all

      // Reopen fresh for the same element.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      badges
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      inspector
        .shadowRoot!.querySelector('[part="report-issue"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(submitBtn.disabled).toBe(false);
      expect(
        (reportForm.shadowRoot!.querySelector('[part="fields"]') as HTMLElement)
          .style.display,
      ).not.toBe('none');
    });
  });

  // `review.disable` is legal from every
  // non-idle state and the launcher button / global Ctrl+Shift+T handler
  // dispatch it unconditionally, so an in-flight request has always been
  // abandonable this way — a cause the locale-only guard above
  // (`localeGeneration`) is blind to, since leaving review mode doesn't
  // change the locale. `subjectGeneration` (bumped in `syncDismissAction`'s
  // idle branch) closes that gap.
  describe('leaving and re-entering review mode while a request is in flight (subjectGeneration guard, §1c)', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    function pressCtrlShiftT(): void {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'T',
          ctrlKey: true,
          shiftKey: true,
        }),
      );
    }

    it("Apply on element A, leaving and re-entering review mode, then selecting element B must not let A's stale response overwrite B's lookup", async () => {
      const mockFetch = mockSessionResponse([
        'review:create',
        'translation.edit',
      ]);
      const elA = document.createElement('h1');
      elA.setAttribute('data-translation-key', 'hero.title');
      elA.textContent = 'Hello';
      document.body.appendChild(elA);
      const elB = document.createElement('p');
      elB.setAttribute('data-translation-key', 'hero.subtitle');
      elB.textContent = 'World';
      document.body.appendChild(elB);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;
      const badgeButtons = () =>
        badges.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[part="badge"]',
        );

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      // --- Select A, apply, leave the request in flight ---------------
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      badgeButtons()[0].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      (
        inspector.shadowRoot!.querySelector(
          'textarea[part="current-edit"]',
        ) as HTMLTextAreaElement
      ).value = 'Привіт!';
      let resolveApplyA!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveApplyA = resolve;
          }),
      );
      inspector
        .shadowRoot!.querySelector('button[part="apply"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // --- Leave review mode and re-enter it (Ctrl+Shift+T twice) -----
      pressCtrlShiftT();
      pressCtrlShiftT();
      expect(launcher.getAttribute('data-active')).toBe('true');

      // --- Select B, its lookup resolves -------------------------------
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.subtitle',
            sourceText: 'World',
            value: 'Світ',
            version: 5,
            updatedAt: '2026-08-21T09:05:00.000Z',
          },
        }),
      });
      badgeButtons()[1].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );
      expect(
        shell.shadowRoot!.querySelector('[part="chip-version"]')!.textContent,
      ).toBe('v5');

      // --- A's stale apply response now resolves ------------------------
      resolveApplyA({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: 'Привіт!',
            version: 2,
            updatedAt: '2026-08-21T09:10:00.000Z',
          },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // B's context must be untouched by A's abandoned response.
      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );
      expect(
        shell.shadowRoot!.querySelector('[part="chip-version"]')!.textContent,
      ).toBe('v5');
      expect(elA.textContent).toBe('Hello'); // never refreshKeyedElementText()'d
    });

    it("a getTranslation lookup for A left in flight when review mode is toggled off/on must not overwrite B's freshly selected lookup", async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const elA = document.createElement('h1');
      elA.setAttribute('data-translation-key', 'hero.title');
      elA.textContent = 'Hello';
      document.body.appendChild(elA);
      const elB = document.createElement('p');
      elB.setAttribute('data-translation-key', 'hero.subtitle');
      elB.textContent = 'World';
      document.body.appendChild(elB);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;
      const badgeButtons = () =>
        badges.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[part="badge"]',
        );

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      // --- Select A; its lookup never resolves on its own --------------
      let resolveLookupA!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLookupA = resolve;
          }),
      );
      badgeButtons()[0].click();

      // --- Leave review mode and re-enter it ----------------------------
      pressCtrlShiftT();
      pressCtrlShiftT();

      // --- Select B, its lookup resolves --------------------------------
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.subtitle',
            sourceText: 'World',
            value: 'Світ',
            version: 3,
            updatedAt: '2026-08-21T09:05:00.000Z',
          },
        }),
      });
      badgeButtons()[1].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );

      // --- A's stale lookup now resolves ---------------------------------
      resolveLookupA({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Must still be B, not clobbered by A's abandoned lookup.
      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );
      expect(
        shell.shadowRoot!.querySelector('[part="chip-version"]')!.textContent,
      ).toBe('v3');
    });

    // BLOCKER from review: an *ordinary* reselect — no locale change, no
    // Ctrl+Shift+T, both selections legal 'element.click' transitions —
    // used to bump nothing at all, because select() exempts 'inspector-open'
    // (correctly, for the state machine) and every other reselect went
    // through legal transitions the old subjectGeneration only bumped on
    // 'idle'. A slow first lookup left in flight when the reviewer clicks a
    // second badge before it resolves would then land and overwrite the
    // second selection's lookup — §1c's damage with none of §1c's
    // preconditions. Fixed by bumping subjectGeneration in the tracker's
    // onSelect callback itself, so every new selection counts, transition
    // or not.
    it("selecting element B before element A's slow lookup resolves must not let A's stale lookup overwrite B (ordinary reselect, no locale change, no Ctrl+Shift+T)", async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const elA = document.createElement('h1');
      elA.setAttribute('data-translation-key', 'hero.title');
      elA.textContent = 'Hello';
      document.body.appendChild(elA);
      const elB = document.createElement('p');
      elB.setAttribute('data-translation-key', 'hero.subtitle');
      elB.textContent = 'World';
      document.body.appendChild(elB);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;
      const badgeButtons = () =>
        badges.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[part="badge"]',
        );

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      // --- Select A; its lookup never resolves on its own ----------------
      let resolveLookupA!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLookupA = resolve;
          }),
      );
      badgeButtons()[0].click();

      // --- Immediately select B, no await in between ----------------------
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.subtitle',
            sourceText: 'World',
            value: 'Світ',
            version: 3,
            updatedAt: '2026-08-21T09:05:00.000Z',
          },
        }),
      });
      badgeButtons()[1].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );
      expect(
        shell.shadowRoot!.querySelector('[part="chip-version"]')!.textContent,
      ).toBe('v3');

      // --- A's stale lookup now resolves ------------------------------------
      resolveLookupA({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Must still be B — this is the exact scenario the blocker named.
      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );
      expect(
        shell.shadowRoot!.querySelector('[part="chip-version"]')!.textContent,
      ).toBe('v3');
    });

    // Reviewer's follow-up finding, locking in a good outcome rather than
    // chasing a bug: ReviewModeElementTracker.select() forces the same
    // review.disable/review.enable resync from *any* state 'element.click'
    // is rejected from, not just the three AI/report states §1a names —
    // including a mid-flight 'inspector-applying'. That's a wider reselect
    // surface than before, so it needs its own coverage that abandoning A
    // this way is exactly as safe as abandoning it via Ctrl+Shift+T.
    it('reselecting to element B while an Apply for element A is still in flight abandons A safely (mid-flight reselect)', async () => {
      const mockFetch = mockSessionResponse([
        'review:create',
        'translation.edit',
      ]);
      const elA = document.createElement('h1');
      elA.setAttribute('data-translation-key', 'hero.title');
      elA.textContent = 'Hello';
      document.body.appendChild(elA);
      const elB = document.createElement('p');
      elB.setAttribute('data-translation-key', 'hero.subtitle');
      elB.textContent = 'World';
      document.body.appendChild(elB);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const shell = root.querySelector('transl8-panel-shell')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;
      const badgeButtons = () =>
        badges.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[part="badge"]',
        );

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      // --- Select A, apply, leave it in flight ('inspector-applying') ---
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      badgeButtons()[0].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      (
        inspector.shadowRoot!.querySelector(
          'textarea[part="current-edit"]',
        ) as HTMLTextAreaElement
      ).value = 'Привіт!';
      let resolveApplyA!: (response: unknown) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveApplyA = resolve;
          }),
      );
      inspector
        .shadowRoot!.querySelector('button[part="apply"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // --- Reselect B mid-flight, no Ctrl+Shift+T at all -----------------
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.subtitle',
            sourceText: 'World',
            value: 'Світ',
            version: 5,
            updatedAt: '2026-08-21T09:05:00.000Z',
          },
        }),
      });
      badgeButtons()[1].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );
      expect(
        shell.shadowRoot!.querySelector('[part="chip-version"]')!.textContent,
      ).toBe('v5');

      // --- A's abandoned apply now resolves -------------------------------
      resolveApplyA({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: 'Привіт!',
            version: 2,
            updatedAt: '2026-08-21T09:10:00.000Z',
          },
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shell.shadowRoot!.querySelector('[part="key"]')!.textContent).toBe(
        'hero.subtitle',
      );
      expect(
        shell.shadowRoot!.querySelector('[part="chip-version"]')!.textContent,
      ).toBe('v5');
      expect(elA.textContent).toBe('Hello');
    });

    // §1a's forced state-machine resync (ReviewModeElementTracker.select())
    // routes through 'review.disable', which reaches the tracker's own
    // idle subscription and tears down/rebuilds every badge — including the
    // one badges.ts just focused right before calling onClick(). Without
    // re-focusing the rebuilt badge, `trapPanelFocus` (wired once
    // `onSelect` shows the Inspector a few lines later) would capture
    // whatever's left focused, usually `<body>`, as its "opener" — stranding
    // a keyboard reviewer at the top of the host page on Escape instead of
    // back on the badge they clicked.
    it('keeps focus on the newly rendered badge when a reselect forces a state-machine reset (ai-panel-open -> inspector-open)', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const elA = document.createElement('h1');
      elA.setAttribute('data-translation-key', 'hero.title');
      elA.textContent = 'Hello';
      document.body.appendChild(elA);
      const elB = document.createElement('p');
      elB.setAttribute('data-translation-key', 'hero.subtitle');
      elB.textContent = 'World';
      document.body.appendChild(elB);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;
      const badgeButtons = () =>
        badges.shadowRoot!.querySelectorAll<HTMLButtonElement>(
          '[part="badge"]',
        );

      // `document.activeElement` retargets into a shadow root's host — walk
      // down to the real focused element, same as panel-a11y.ts's own
      // focusedElement().
      const deepActiveElement = (): Element | null => {
        let el: Element | null = document.activeElement;
        while ((el as HTMLElement | null)?.shadowRoot?.activeElement) {
          el = (el as HTMLElement).shadowRoot!.activeElement;
        }
        return el;
      };

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      badgeButtons()[0].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="ask-ai"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.subtitle',
            sourceText: 'World',
            value: 'Світ',
            version: 1,
            updatedAt: '2026-08-21T09:05:00.000Z',
          },
        }),
      });
      badgeButtons()[1].click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The Inspector itself now legitimately holds focus (trapPanelFocus
      // moves focus into the panel right after capturing its "opener") —
      // the fix isn't observable there. It's observable on the way back
      // out: hide()'s releaseFocus() returns focus to whatever opener was
      // captured, and closing the shell is the least implementation-
      // specific way to trigger that (matches the shell's own close-button
      // tests elsewhere in this file).
      const shell = root.querySelector('transl8-panel-shell')!;
      shell
        .shadowRoot!.querySelector<HTMLButtonElement>('button[part="close"]')!
        .click();

      expect(deepActiveElement()).toBe(badgeButtons()[1]);
    });
  });

  describe('getTranslation', () => {
    it('GETs /sdk/translations/lookup with Bearer sessionToken, key, and the init() target locale', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_lookup',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_lookup',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_lookup',
        apiKey: 'ta_live_lookup',
        locale: 'fr',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'checkout.submit',
            sourceText: 'Submit',
            value: 'Soumettre',
            version: 3,
            updatedAt: '2026-08-20T10:00:00.000Z',
          },
        }),
      });

      const result = await sdk.getTranslation('checkout.submit');

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/lookup?key=checkout.submit&language=fr',
        {
          headers: { Authorization: 'Bearer session_token_lookup' },
          signal: expect.any(AbortSignal),
        },
      );
      expect(result).toEqual({
        key: 'checkout.submit',
        sourceText: 'Submit',
        value: 'Soumettre',
        version: 3,
        updatedAt: '2026-08-20T10:00:00.000Z',
      });
    });

    it('returns undefined on a 404 (no translation for that key/language)', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_404',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_404',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_404',
        apiKey: 'ta_live_404',
        locale: 'fr',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"message":"not found"}',
        json: async () => ({}),
      });

      const result = await sdk.getTranslation('missing.key');

      expect(result).toBeUndefined();
    });

    it('throws on a non-404 error response', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_500',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_500',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_500',
        apiKey: 'ta_live_500',
        locale: 'fr',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '{"message":"boom"}',
        json: async () => ({}),
      });

      await expect(sdk.getTranslation('checkout.submit')).rejects.toThrow(
        /GET \/sdk\/translations\/lookup failed with HTTP 500/,
      );
    });
  });

  describe('reportIssue', () => {
    it('POSTs to /sdk/reviews with Bearer sessionToken and the issue payload', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_report',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_report',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_report',
        apiKey: 'ta_live_report',
        locale: 'fr',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: { accepted: true, id: 'issue_1' },
        }),
      });

      const payload = {
        issue: { type: 'grammar' as const, comment: 'There is a typo.' },
        page: { url: 'https://example.com/checkout' },
        element: { tagName: 'button' },
        translation: {
          key: 'checkout.submit',
          sourceText: 'Submit',
          translatedText: 'Soumettre',
        },
      };

      const result = await sdk.reportIssue(payload);

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/reviews',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer session_token_report',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: expect.any(AbortSignal),
        },
      );
      expect(result).toEqual({ accepted: true, id: 'issue_1' });
    });

    it('throws with status and body snippet on a non-2xx response', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_report_err',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_report_err',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_report_err',
        apiKey: 'ta_live_report_err',
        locale: 'fr',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Unsupported issue.type"}',
        json: async () => ({}),
      });

      await expect(
        sdk.reportIssue({
          issue: { type: 'grammar' as const },
          page: { url: 'https://example.com/x' },
          element: { tagName: 'button' },
        }),
      ).rejects.toThrow(
        /POST \/sdk\/reviews failed with HTTP 400.*Unsupported issue.type/,
      );
    });
  });

  describe('report screenshot upload', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    // Drives the same select -> open-report sequence as the other
    // full-UI-flow report tests above (e.g. "a stale report response must
    // not show success over a later, still-live report"). Stops short of
    // submit so each test can queue its own report/screenshot fetch mocks
    // (fetch is mocked by call order, not URL, so they must be queued
    // *after* init()'s own session-fetch call has already consumed the
    // default mock, and after this lookup call has consumed its Once mock).
    async function selectAndOpenReport(
      mockFetch: ReturnType<typeof vi.fn>,
      // Capture is opt-in now, so the cases that assert an upload
      // must ask for it. Defaulting this to true here rather than in the SDK
      // keeps every existing case meaningful while the *default* gets its own
      // test below.
      captureScreenshots = true,
    ) {
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'uk',
        captureScreenshots,
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const reportForm = root.querySelector('transl8-report-form')!;
      const launcher = root.querySelector(
        'transl8-launcher',
      )! as unknown as HTMLElement;
      const badges = root.querySelector(
        'transl8-review-mode-badges',
      )! as unknown as HTMLElement;

      (
        launcher.shadowRoot!.querySelector(
          '[part="button"]',
        ) as HTMLButtonElement
      ).click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Привіт',
            version: 1,
            updatedAt: '2026-08-21T09:00:00.000Z',
          },
        }),
      });
      badges
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      inspector
        .shadowRoot!.querySelector('[part="report-issue"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      (
        reportForm.shadowRoot!.querySelector(
          'input[name="issue-type"][value="grammar"]',
        ) as HTMLInputElement
      ).checked = true;

      return reportForm;
    }

    it('does not capture at all unless the host opts in', async () => {
      // The SDK documents "Screenshot capture is opt-in", listed beside
      // "Password / input values are never collected", as a guarantee. It
      // used to capture unconditionally, so the guarantee was documented but
      // not kept. Rendering someone's page to a canvas and uploading it is the
      // host's call to make.
      const mockFetch = mockSessionResponse(['review:create']);
      vi.mocked(captureElementScreenshot).mockResolvedValue(
        new Blob(['x'], { type: 'image/png' }),
      );

      const reportForm = await selectAndOpenReport(mockFetch, false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { accepted: true, id: 'report-1' } }),
      });

      reportForm
        .shadowRoot!.querySelector('button[part="submit"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Not merely "no upload" — the capture itself must never run, because
      // the privacy criterion is about rendering the element, not about where
      // the bytes end up.
      expect(captureElementScreenshot).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/screenshot'),
        expect.anything(),
      );
    });

    it('uploads a captured screenshot after a successful report submit', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      vi.mocked(captureElementScreenshot).mockResolvedValue(
        new Blob(['x'], { type: 'image/png' }),
      );

      const reportForm = await selectAndOpenReport(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { accepted: true, id: 'report-1' } }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { accepted: true } }),
      });

      reportForm
        .shadowRoot!.querySelector('button[part="submit"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The upload fires from inside captureElementScreenshot's .then(),
      // one more microtask/timer tick past the report-create response.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/reviews/report-1/screenshot',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
      // The capture chunk loads from this backend's own
      // /sdk/bundle/capture route, derived from apiBaseUrl, never a static
      // 'html2canvas' specifier (see capture-element-screenshot.ts's doc
      // comment for why that would defeat the whole point).
      expect(captureElementScreenshot).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'https://example.com/api/v1/sdk/bundle/capture',
      );
    });

    it('does not call the upload endpoint when capture resolves undefined', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      vi.mocked(captureElementScreenshot).mockResolvedValue(undefined);

      const reportForm = await selectAndOpenReport(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { accepted: true, id: 'report-2' } }),
      });

      reportForm
        .shadowRoot!.querySelector('button[part="submit"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      for (const call of mockFetch.mock.calls) {
        expect(String(call[0])).not.toMatch(/\/screenshot$/);
      }
    });
  });

  describe('analyzeTranslation', () => {
    it('POSTs to /sdk/ai/analyze with Bearer sessionToken and the request payload', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_ai',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_ai',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_ai',
        apiKey: 'ta_live_ai',
        locale: 'uk',
        sourceLocale: 'en',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requestId: 'req_1',
            intent: 'improve',
            issue: { type: 'grammar', severity: 'medium' },
            confidenceBucket: 'high',
          },
        }),
      });

      const result = await sdk.analyzeTranslation({
        userRequest: 'fix this',
        translation: {
          key: 'checkout.submit',
          sourceText: 'Submit',
          translatedText: 'Подайте вашу заявка',
        },
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/ai/analyze',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session_token_ai',
            'Content-Type': 'application/json',
          },
        }),
      );
      const sentBody = JSON.parse(
        (
          mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1] as {
            body: string;
          }
        ).body,
      );
      expect(sentBody.locale).toEqual({ source: 'en', target: 'uk' });
      expect(result).toEqual({
        requestId: 'req_1',
        intent: 'improve',
        issue: { type: 'grammar', severity: 'medium' },
        confidenceBucket: 'high',
      });
    });

    it('throws with status and body snippet on a non-2xx response', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_ai_err',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_ai_err',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_ai_err',
        apiKey: 'ta_live_ai_err',
        locale: 'uk',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => '{"message":"Too many AI requests"}',
        json: async () => ({}),
      });

      await expect(
        sdk.analyzeTranslation({
          userRequest: 'fix this',
          translation: { translatedText: 'x' },
        }),
      ).rejects.toThrow(
        /POST \/sdk\/ai\/analyze failed with HTTP 429.*Too many AI requests/,
      );
    });

    it('rejects with a DOMException named AbortError when the caller aborts, without calling assertOk', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_ai_abort',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_ai_abort',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_ai_abort',
        apiKey: 'ta_live_ai_abort',
        locale: 'uk',
      });

      const external = new AbortController();
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      );

      const pending = sdk.analyzeTranslation(
        { userRequest: 'fix this', translation: { translatedText: 'x' } },
        { signal: external.signal },
      );
      external.abort();

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects with a DOMException named TimeoutError after 10s with no response', async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_ai_timeout',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_ai_timeout',
            permissions: [],
          },
        }),
      });

      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_ai_timeout',
        apiKey: 'ta_live_ai_timeout',
        locale: 'uk',
      });

      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(
                new DOMException(
                  (init.signal as AbortSignal & { reason?: DOMException })
                    .reason?.message ?? 'Aborted',
                  (init.signal as AbortSignal & { reason?: DOMException })
                    .reason?.name ?? 'AbortError',
                ),
              );
            });
          }),
      );

      const pending = sdk.analyzeTranslation({
        userRequest: 'fix this',
        translation: { translatedText: 'x' },
      });
      pending.catch(() => {}); // mark handled immediately; the real assertion is below
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
      vi.useRealTimers();
    });
  });

  describe('applyTranslation', () => {
    async function initApplySdk(mockFetch: ReturnType<typeof vi.fn>) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_apply',
            expiresAt: '2026-08-22T00:00:00Z',
            projectId: 'proj_apply',
            permissions: ['translation.edit'],
          },
        }),
      });

      return ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_apply',
        apiKey: 'ta_live_apply',
        locale: 'fr',
      });
    }

    it('POSTs to /sdk/translations/apply with Bearer sessionToken and the apply payload', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const sdk = await initApplySdk(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: 'Soumettre maintenant',
            version: 4,
            updatedAt: '2026-08-23T14:00:00.000Z',
          },
        }),
      });

      const result = await sdk.applyTranslation({
        key: 'checkout.submit',
        language: 'fr',
        expectedVersion: 3,
        newValue: 'Soumettre maintenant',
        source: 'ai_suggestion',
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/apply',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer session_token_apply',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: 'checkout.submit',
            language: 'fr',
            expectedVersion: 3,
            newValue: 'Soumettre maintenant',
            source: 'ai_suggestion',
          }),
          signal: expect.any(AbortSignal),
        },
      );
      expect(result).toEqual({
        value: 'Soumettre maintenant',
        version: 4,
        updatedAt: '2026-08-23T14:00:00.000Z',
      });
    });

    it('throws ApplyTranslationForbiddenError on 403 when session lacks translation.edit', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const sdk = await initApplySdk(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'SDK session lacks translation.edit permission',
          },
        }),
      });

      await expect(
        sdk.applyTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          newValue: 'Soumettre',
        }),
      ).rejects.toMatchObject({
        name: 'ApplyTranslationForbiddenError',
        status: 403,
        message: 'SDK session lacks translation.edit permission',
      });
    });

    it('throws ApplyTranslationConflictError with currentValue and currentVersion on 409', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const sdk = await initApplySdk(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Translation version conflict',
            currentValue: 'Changed elsewhere',
            currentVersion: 5,
          },
        }),
      });

      await expect(
        sdk.applyTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          newValue: 'Soumettre',
        }),
      ).rejects.toThrow(ApplyTranslationConflictError);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          message: 'Translation version conflict',
          currentValue: 'Changed elsewhere',
          currentVersion: 5,
        }),
      });

      await expect(
        sdk.applyTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          newValue: 'Soumettre',
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Translation version conflict',
        currentValue: 'Changed elsewhere',
        currentVersion: 5,
      });
    });
  });

  describe('proposeTranslation', () => {
    async function initProposeSdk(mockFetch: ReturnType<typeof vi.fn>) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session_token_propose',
            expiresAt: '2026-08-24T00:00:00Z',
            projectId: 'proj_propose',
            permissions: ['translation.propose'],
          },
        }),
      });

      return ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'proj_propose',
        apiKey: 'ta_live_propose',
        locale: 'fr',
      });
    }

    it('POSTs to /sdk/translations/propose with Bearer sessionToken and the propose payload', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const sdk = await initProposeSdk(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { status: 'pending_review', version: 3 } }),
      });

      const result = await sdk.proposeTranslation({
        key: 'checkout.submit',
        language: 'fr',
        expectedVersion: 3,
        proposedValue: 'Soumettre proposé',
        comment: 'Grammar fix',
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/api/v1/sdk/translations/propose',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer session_token_propose',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: 'checkout.submit',
            language: 'fr',
            expectedVersion: 3,
            proposedValue: 'Soumettre proposé',
            comment: 'Grammar fix',
          }),
          signal: expect.any(AbortSignal),
        },
      );
      expect(result).toEqual({ status: 'pending_review', version: 3 });
    });

    it('throws ProposeTranslationForbiddenError on 403 when session lacks translation.propose', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const sdk = await initProposeSdk(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'SDK session lacks translation.propose permission',
          },
        }),
      });

      await expect(
        sdk.proposeTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          proposedValue: 'x',
        }),
      ).rejects.toMatchObject({
        name: 'ProposeTranslationForbiddenError',
        status: 403,
        message: 'SDK session lacks translation.propose permission',
      });
    });

    it('throws ProposeTranslationConflictError with currentValue/currentVersion on a stale-version 409', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const sdk = await initProposeSdk(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Translation version conflict',
            currentValue: 'Changed elsewhere',
            currentVersion: 5,
          },
        }),
      });

      await expect(
        sdk.proposeTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          proposedValue: 'x',
        }),
      ).rejects.toMatchObject({
        name: 'ProposeTranslationConflictError',
        status: 409,
        currentValue: 'Changed elsewhere',
        currentVersion: 5,
      });
    });

    it('throws ProposeTranslationAlreadyPendingError on a 409 with no currentValue/currentVersion', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      const sdk = await initProposeSdk(mockFetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'CONFLICT',
            message:
              'A proposal is already pending review for this translation',
          },
        }),
      });

      await expect(
        sdk.proposeTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          proposedValue: 'x',
        }),
      ).rejects.toMatchObject({
        name: 'ProposeTranslationAlreadyPendingError',
        status: 409,
        message: 'A proposal is already pending review for this translation',
      });
    });
  });

  describe('SDK events stream', () => {
    class FakeEventSource {
      static instances: FakeEventSource[] = [];
      static readonly CLOSED = 2;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      closed = false;
      readyState = 0;
      constructor(public readonly url: string) {
        FakeEventSource.instances.push(this);
      }
      close(): void {
        this.closed = true;
        this.readyState = FakeEventSource.CLOSED;
      }
      emit(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) });
      }
      emitError(): void {
        this.onerror?.(new Event('error'));
      }
    }

    beforeEach(() => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
    });

    afterEach(() => {
      document.body.innerHTML = '';
      vi.unstubAllGlobals();
    });

    it('opens an EventSource to /sdk/events/stream with the stream token, not the session token, when review:create is granted', async () => {
      mockSessionResponse(['review:create']);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      expect(FakeEventSource.instances).toHaveLength(1);
      expect(FakeEventSource.instances[0].url).toBe(
        'https://example.com/api/v1/sdk/events/stream?token=stream-token',
      );
    });

    it('does not open an EventSource when review:create is absent', async () => {
      mockSessionResponse(['translation:read']);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('dispatches transl8:release-published when a release transitions to published', async () => {
      mockSessionResponse(['review:create']);
      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const handler = vi.fn();
      root.addEventListener('transl8:release-published', handler);

      FakeEventSource.instances[0].emit({
        type: 'release.changed',
        data: [{ id: 'rel1', status: 'ready' }],
      });
      FakeEventSource.instances[0].emit({
        type: 'release.changed',
        data: [{ id: 'rel1', status: 'published' }],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        id: 'rel1',
        status: 'published',
      });
    });

    it('dispatches a duplicate transl8:release-published on an out-of-order stale tick (documents current behavior)', async () => {
      // release.changed carries only { id, status } — no version/sequence
      // number — so a stale "ready" tick landing after "published" (e.g. two
      // 1s-apart polls resolving out of order) overwrites the in-memory
      // status map back to "ready", and the next "published" tick re-fires
      // the event. This pins that known gap
      // so a future change that makes it silently stop firing altogether —
      // as opposed to fixing the duplicate — doesn't go unnoticed.
      mockSessionResponse(['review:create']);
      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const handler = vi.fn();
      root.addEventListener('transl8:release-published', handler);

      FakeEventSource.instances[0].emit({
        type: 'release.changed',
        data: [{ id: 'rel1', status: 'published' }],
      });
      // Out-of-order: an earlier-issued "ready" tick resolves after the
      // "published" one above.
      FakeEventSource.instances[0].emit({
        type: 'release.changed',
        data: [{ id: 'rel1', status: 'ready' }],
      });
      FakeEventSource.instances[0].emit({
        type: 'release.changed',
        data: [{ id: 'rel1', status: 'published' }],
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('does not dispatch transl8:release-published for a non-publish status change', async () => {
      mockSessionResponse(['review:create']);
      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const handler = vi.fn();
      root.addEventListener('transl8:release-published', handler);

      FakeEventSource.instances[0].emit({
        type: 'release.changed',
        data: [{ id: 'rel1', status: 'ready' }],
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('shows the Inspector stale banner when a pushed version differs from the open key', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo',
            version: 2,
            updatedAt: '2026-08-25T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      FakeEventSource.instances[0].emit({
        type: 'translation.changed',
        data: [
          {
            key: 'hero.title',
            language: 'de',
            value: 'Hallo!',
            status: 'draft',
            version: 3,
            updatedAt: '2026-08-25T09:05:00.000Z',
          },
        ],
      });

      const banner = inspector.shadowRoot!.querySelector(
        '[part="stale-banner"]',
      ) as HTMLElement;
      expect(banner.style.display).toBe('block');
    });

    it('ignores a translation.changed entry for a different key', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo',
            version: 2,
            updatedAt: '2026-08-25T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      FakeEventSource.instances[0].emit({
        type: 'translation.changed',
        data: [
          {
            key: 'other.key',
            language: 'de',
            value: 'x',
            status: 'draft',
            version: 9,
            updatedAt: '2026-08-25T09:05:00.000Z',
          },
        ],
      });

      const banner = inspector.shadowRoot!.querySelector(
        '[part="stale-banner"]',
      ) as HTMLElement;
      expect(banner.style.display).toBe('none');
    });

    it('onStaleReload re-fetches the translation and clears the banner', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo',
            version: 2,
            updatedAt: '2026-08-25T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      FakeEventSource.instances[0].emit({
        type: 'translation.changed',
        data: [
          {
            key: 'hero.title',
            language: 'de',
            value: 'Hallo!',
            status: 'draft',
            version: 3,
            updatedAt: '2026-08-25T09:05:00.000Z',
          },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo!',
            version: 3,
            updatedAt: '2026-08-25T09:05:00.000Z',
          },
        }),
      });
      const reloadBtn = inspector.shadowRoot!.querySelector(
        'button[part="stale-reload"]',
      ) as HTMLButtonElement;
      reloadBtn.dispatchEvent(new MouseEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const banner = inspector.shadowRoot!.querySelector(
        '[part="stale-banner"]',
      ) as HTMLElement;
      expect(banner.style.display).toBe('none');
      expect(
        inspector.shadowRoot!.querySelector('[part="current-text"]')!
          .textContent,
      ).toBe('Hallo!');
    });

    // Previously onStaleReload's getTranslation() call had no .catch() either
    // — a failed reload left the banner hidden (cleared optimistically
    // before the fetch) with no indication anything went wrong, and an
    // unhandled promise rejection.
    it('onStaleReload re-shows the stale banner instead of silently going quiet when the reload fails', async () => {
      const mockFetch = mockSessionResponse(['review:create']);
      const host = document.createElement('h1');
      host.setAttribute('data-translation-key', 'hero.title');
      host.textContent = 'Hello';
      document.body.appendChild(host);

      await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      const root = document.body.querySelector('transl8-sdk-root')!;
      const inspector = root.querySelector('transl8-inspector-panel')!;
      const launcherButton = (
        root.querySelector('transl8-launcher') as unknown as HTMLElement
      ).shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
      launcherButton.click();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            key: 'hero.title',
            sourceText: 'Hello',
            value: 'Hallo',
            version: 2,
            updatedAt: '2026-08-25T09:00:00.000Z',
          },
        }),
      });
      (
        root.querySelector(
          'transl8-review-mode-badges',
        ) as unknown as HTMLElement
      )
        .shadowRoot!.querySelector<HTMLButtonElement>('[part="badge"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      FakeEventSource.instances[0].emit({
        type: 'translation.changed',
        data: [
          {
            key: 'hero.title',
            language: 'de',
            value: 'Hallo!',
            status: 'draft',
            version: 3,
            updatedAt: '2026-08-25T09:05:00.000Z',
          },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '{"message":"boom"}',
        json: async () => ({}),
      });
      const reloadBtn = inspector.shadowRoot!.querySelector(
        'button[part="stale-reload"]',
      ) as HTMLButtonElement;
      reloadBtn.dispatchEvent(new MouseEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const banner = inspector.shadowRoot!.querySelector(
        '[part="stale-banner"]',
      ) as HTMLElement;
      expect(banner.style.display).toBe('block');
    });
  });

  /**
   * `mountLauncher` used to discard the `{ close() }` handle
   * `connectSdkEventStream` returns, so nothing could ever stop the stream,
   * and the `transl8:set-locale` window listener added in the constructor
   * was never removed either. `destroy()` closes both.
   */
  describe('destroy() / onSessionExpired', () => {
    class FakeEventSource {
      static instances: FakeEventSource[] = [];
      static readonly CLOSED = 2;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      closed = false;
      readyState = 0;
      constructor(public readonly url: string) {
        FakeEventSource.instances.push(this);
      }
      close(): void {
        this.closed = true;
        this.readyState = FakeEventSource.CLOSED;
      }
      emit(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) });
      }
      emitError(): void {
        this.onerror?.(new Event('error'));
      }
    }

    beforeEach(() => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
    });

    afterEach(() => {
      document.body.innerHTML = '';
      vi.unstubAllGlobals();
    });

    it('closes the SSE stream', async () => {
      mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      sdk.destroy();

      expect(FakeEventSource.instances[0].closed).toBe(true);
    });

    it('removes the transl8:set-locale window listener', async () => {
      mockSessionResponse(['review:create']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      sdk.destroy();
      window.dispatchEvent(
        new CustomEvent('transl8:set-locale', { detail: 'fr' }),
      );

      expect(sdk.getLocale()).toBe('de');
    });

    it('is safe to call when review:create was absent (no launcher was ever mounted)', async () => {
      mockSessionResponse(['translation:read']);
      const sdk = await ReviewSdk.init({
        apiBaseUrl: 'https://example.com/api/v1',
        projectId: 'project_123',
        apiKey: 'ta_live_test',
        locale: 'de',
      });

      expect(() => sdk.destroy()).not.toThrow();
    });

    describe('onSessionExpired', () => {
      it('is called when the SSE stream reports a terminal failure (e.g. a 401 on the expired session token)', async () => {
        mockSessionResponse(['review:create']);
        const onSessionExpired = vi.fn();
        await ReviewSdk.init({
          apiBaseUrl: 'https://example.com/api/v1',
          projectId: 'project_123',
          apiKey: 'ta_live_test',
          locale: 'de',
          onSessionExpired,
        });

        FakeEventSource.instances[0].readyState = FakeEventSource.CLOSED;
        FakeEventSource.instances[0].emitError();

        expect(onSessionExpired).toHaveBeenCalledTimes(1);
      });

      it('is not called while the stream is still delivering messages', async () => {
        mockSessionResponse(['review:create']);
        const onSessionExpired = vi.fn();
        await ReviewSdk.init({
          apiBaseUrl: 'https://example.com/api/v1',
          projectId: 'project_123',
          apiKey: 'ta_live_test',
          locale: 'de',
          onSessionExpired,
        });

        FakeEventSource.instances[0].emit({
          type: 'release.changed',
          data: [{ id: 'rel1', status: 'ready' }],
        });

        expect(onSessionExpired).not.toHaveBeenCalled();
      });
    });
  });
});

/**
 * `init()` and `analyzeTranslation()` each grew their own 10s
 * AbortController when a hung backend was found to hang them forever. The
 * other five network calls never got one, so a backend that accepts the
 * connection and then goes quiet left the Inspector spinning with no error
 * and no way back — the exact failure the first two were fixed for.
 */
describe('request timeouts on every network call', () => {
  async function connectedSdk(mockFetch: ReturnType<typeof vi.fn>) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          token: 'session_token_timeout',
          expiresAt: '2126-01-01T00:00:00Z',
          projectId: 'proj_timeout',
          permissions: ['translation.edit', 'translation.propose'],
        },
      }),
    });
    return ReviewSdk.init({
      apiBaseUrl: 'https://example.com/api/v1',
      projectId: 'proj_timeout',
      apiKey: 'ta_live_timeout',
      locale: 'fr',
    });
  }

  /** A fetch that never settles until its signal aborts. */
  function hangUntilAborted(mockFetch: ReturnType<typeof vi.fn>) {
    mockFetch.mockImplementationOnce(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const reason = (
              init.signal as AbortSignal & { reason?: DOMException }
            ).reason;
            reject(
              new DOMException(
                reason?.message ?? 'Aborted',
                reason?.name ?? 'AbortError',
              ),
            );
          });
        }),
    );
  }

  const cases: Array<[string, (sdk: ReviewSdk) => Promise<unknown>]> = [
    ['getTranslation', (sdk) => sdk.getTranslation('checkout.submit')],
    [
      'reportIssue',
      (sdk) =>
        sdk.reportIssue({
          issue: { type: 'grammar' as const },
          page: { url: 'https://example.com/x' },
          element: { tagName: 'button' },
        }),
    ],
    [
      'applyTranslation',
      (sdk) =>
        sdk.applyTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          newValue: 'Soumettre',
          source: 'ai_suggestion',
        }),
    ],
    [
      'proposeTranslation',
      (sdk) =>
        sdk.proposeTranslation({
          key: 'checkout.submit',
          language: 'fr',
          expectedVersion: 3,
          proposedValue: 'Soumettre',
          comment: 'Grammar fix',
        }),
    ],
  ];

  it.each(cases)(
    '%s rejects with TimeoutError instead of hanging when the backend never responds',
    async (_name, call) => {
      vi.useFakeTimers();
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const sdk = await connectedSdk(mockFetch);
      hangUntilAborted(mockFetch);

      const pending = call(sdk);
      const assertion = expect(pending).rejects.toMatchObject({
        name: 'TimeoutError',
      });

      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      vi.useRealTimers();
    },
  );
});

/**
 * The server mints a 900-second session and the
 * client never refreshed it, so from minute sixteen every reviewer action
 * surfaced as a generic "failed with HTTP 401". `onSessionExpired` existed but
 * fired only when SSE reconnects were exhausted, never on a failed request.
 */
describe('ReviewSdk session expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function initThenExpire(onSessionExpired?: () => void) {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          token: 'session-token',
          expiresAt: '2026-08-22T12:00:00.000Z',
          projectId: 'project_123',
          permissions: ['translation.edit'],
        },
      }),
    });
    const sdk = await ReviewSdk.init({
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'ta_live_key',
      locale: 'fr-FR',
      onSessionExpired,
    } as ReviewSdkInitOptions);

    // Every later call comes back 401, as it does once the 900s TTL lapses.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    return sdk;
  }

  it('throws a recognisable error instead of a generic HTTP 401', async () => {
    const sdk = await initThenExpire();

    await expect(
      sdk.reportIssue({ keyName: 'k', comment: 'c' } as never),
    ).rejects.toBeInstanceOf(SdkSessionExpiredError);
  });

  it('fires onSessionExpired on a failed request, not only on SSE exhaustion', async () => {
    const onSessionExpired = vi.fn();
    const sdk = await initThenExpire(onSessionExpired);

    await expect(
      sdk.reportIssue({ keyName: 'k', comment: 'c' } as never),
    ).rejects.toThrow();

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('leaves other failures as ordinary errors', async () => {
    const onSessionExpired = vi.fn();
    const sdk = await initThenExpire(onSessionExpired);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });

    await expect(
      sdk.reportIssue({ keyName: 'k', comment: 'c' } as never),
    ).rejects.not.toBeInstanceOf(SdkSessionExpiredError);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});

/**
 * Silent session refresh. `refreshSession` exchanges
 * the current session JWT for a fresh one via `POST /sdk/session/refresh`
 * before `sessionExpiresAt`, so a reviewer never hits the 401 path above in
 * the first place. Deliberately not the "retain the apiKey and re-mint"
 * alternative that was already rejected (see sdk-client.ts's
 * assertOkOrSessionExpired doc comment) — the API key never appears here.
 */
describe('silent session refresh', () => {
  const NOW = new Date('2026-09-14T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockInitThenRefresh(
    expiresInMs: number,
    refreshResponse?: unknown,
  ) {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          token: 'session-token-1',
          streamToken: 'stream-token-1',
          expiresAt: new Date(NOW.getTime() + expiresInMs).toISOString(),
          projectId: 'project_123',
          permissions: ['review:create'],
        },
      }),
    });
    mockFetch.mockResolvedValueOnce(
      refreshResponse ?? {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            token: 'session-token-2',
            streamToken: 'stream-token-2',
            expiresAt: new Date(
              NOW.getTime() + expiresInMs + 900_000,
            ).toISOString(),
            projectId: 'project_123',
            permissions: ['review:create'],
          },
        }),
      },
    );
    return mockFetch;
  }

  it('POSTs to /sdk/session/refresh with the session token, 60s before expiry', async () => {
    const mockFetch = mockInitThenRefresh(900_000); // 15-minute TTL

    const sdk = await ReviewSdk.init({
      apiBaseUrl: 'https://example.com/api/v1',
      projectId: 'project_123',
      apiKey: 'ta_live_test',
      locale: 'de',
    });

    // Nothing has fired yet.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(900_000 - 60_000);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/v1/sdk/session/refresh',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer session-token-1' },
      }),
    );
    expect(sdk.getSessionToken()).toBe('session-token-2');
    expect(sdk.getStreamToken()).toBe('stream-token-2');
  });

  it('reschedules the next refresh from the new expiresAt (keeps refreshing across multiple cycles)', async () => {
    const mockFetch = mockInitThenRefresh(900_000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          token: 'session-token-3',
          streamToken: 'stream-token-3',
          expiresAt: new Date(
            NOW.getTime() + 900_000 + 900_000 + 900_000,
          ).toISOString(),
          projectId: 'project_123',
          permissions: ['review:create'],
        },
      }),
    });

    const sdk = await ReviewSdk.init({
      apiBaseUrl: 'https://example.com/api/v1',
      projectId: 'project_123',
      apiKey: 'ta_live_test',
      locale: 'de',
    });

    await vi.advanceTimersByTimeAsync(900_000 - 60_000); // first refresh
    expect(sdk.getSessionToken()).toBe('session-token-2');

    await vi.advanceTimersByTimeAsync(900_000); // second refresh, off the new expiry
    expect(sdk.getSessionToken()).toBe('session-token-3');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not schedule a refresh when the lead time has already passed (e.g. an already-expired session)', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          token: 'session-token-1',
          streamToken: 'stream-token-1',
          expiresAt: new Date(NOW.getTime() - 1000).toISOString(),
          projectId: 'project_123',
          permissions: ['review:create'],
        },
      }),
    });

    await ReviewSdk.init({
      apiBaseUrl: 'https://example.com/api/v1',
      projectId: 'project_123',
      apiKey: 'ta_live_test',
      locale: 'de',
    });

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(mockFetch).toHaveBeenCalledTimes(1); // init only, no refresh
  });

  it('leaves the session as-is (no throw, no crash) when the refresh call fails, so the existing 401 path still handles expiry', async () => {
    const mockFetch = mockInitThenRefresh(900_000, {
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const sdk = await ReviewSdk.init({
      apiBaseUrl: 'https://example.com/api/v1',
      projectId: 'project_123',
      apiKey: 'ta_live_test',
      locale: 'de',
    });

    await vi.advanceTimersByTimeAsync(900_000 - 60_000);

    expect(sdk.getSessionToken()).toBe('session-token-1'); // unchanged
  });

  it('stops refreshing once destroy() has been called', async () => {
    const mockFetch = mockInitThenRefresh(900_000);

    const sdk = await ReviewSdk.init({
      apiBaseUrl: 'https://example.com/api/v1',
      projectId: 'project_123',
      apiKey: 'ta_live_test',
      locale: 'de',
    });
    sdk.destroy();

    await vi.advanceTimersByTimeAsync(900_000);

    expect(mockFetch).toHaveBeenCalledTimes(1); // init only
  });
});
