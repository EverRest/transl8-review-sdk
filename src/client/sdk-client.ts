import { mountSdkRoot } from '../ui/sdk-root';
import { getStrings } from '../ui/strings';
// Side-effect import, kept separate from the type-only import below:
// Transl8Launcher is used only in `as Transl8Launcher` type positions in
// this file, which TS/esbuild's isolatedModules-style transform elides as
// type-only — dropping launcher.ts's customElements.define() call with it.
// See launcher.test.ts for the original repro of this exact gotcha.
import '../ui/launcher';
import { Transl8Launcher } from '../ui/launcher';
// Same isolatedModules-elision gotcha as the launcher import above:
// Transl8HighlightOverlay is only used in a type position here.
import '../ui/highlight-overlay';
import { Transl8HighlightOverlay } from '../ui/highlight-overlay';
import '../ui/panel-shell';
import { Transl8PanelShell, type PanelDismissAction } from '../ui/panel-shell';
import '../ui/inspector-panel';
import { Transl8InspectorPanel } from '../ui/inspector-panel';
import type { SdkTranslationLookupResult } from '../ui/inspector-lookup-types';
import '../ui/report-form';
import {
  Transl8ReportForm,
  type ReportFormSubmission,
} from '../ui/report-form';
import type {
  SdkReviewIssuePayload,
  SdkReviewIssueResult,
} from '../ui/report-issue-types';
import {
  buildReportCommentFromAiAnalysis,
  mapAiIssueTypeToReportType,
} from '../ui/map-ai-issue-to-report-type';
import '../ui/ai-panel';
import { Transl8AiPanel, type AiAnalysisResult } from '../ui/ai-panel';
import { HoverTracker } from '../ui/hover-tracker';
import '../ui/review-mode-badges';
import { Transl8ReviewModeBadges } from '../ui/review-mode-badges';
import { ReviewModeElementTracker } from '../ui/review-mode-element-tracker';
import { refreshKeyedElementText } from '../ui/dom-refresh';
import { captureElementScreenshot } from '../ui/capture-element-screenshot';
import type { ResolvedElementInfo } from '../context/element-context-resolver';
import {
  ReviewSdkStateMachine,
  type ReviewSDKState,
} from '../state/review-sdk-state-machine';
import { ActionEngine } from '../actions/action';
import {
  reviewEnableAction,
  reviewDisableAction,
} from '../actions/review-mode-actions';
import { connectSdkEventStream } from './event-stream';
import type { SdkStreamMessage, SdkReleaseChangedItem } from './event-stream';
import { SDK_VERSION } from './version';
import { canonicalizeLocale } from './canonicalize-locale';

const REVIEW_CREATE_PERMISSION = 'review:create';
const TRANSLATION_EDIT_PERMISSION = 'translation.edit';
const TRANSLATION_PROPOSE_PERMISSION = 'translation.propose';
const TRANSLATION_ANALYZE_PERMISSION = 'translation.analyze';

/**
 * Inbound counterpart to the SDK's own `transl8:element-selected` /
 * `transl8:release-published` outbound events — the first `transl8:*` event
 * the SDK listens for rather than dispatches. A host that loads the bundle
 * via a bare `<script>` tag may have no reference to the `ReviewSdk`
 * `init()` returned, so `setLocale()` needs a second, DOM-level entry point.
 */
const SET_LOCALE_EVENT = 'transl8:set-locale';

/** States in which a shell panel is actually rendered — see `sdk.onLocaleChange` below. */
const PANEL_OPEN_STATES: ReadonlySet<ReviewSDKState> = new Set([
  'inspector-open',
  'report-form-open',
  'submitting-report',
  'report-submitted',
  'ai-panel-open',
  'ai-analyzing',
  'ai-result',
  'ai-applying',
  'inspector-applying',
  'inspector-proposing',
]);

export type ApplySdkTranslationParams = {
  key: string;
  language: string;
  expectedVersion: number;
  newValue: string;
  source?: 'ai_suggestion' | 'manual';
};

export type ApplySdkTranslationResult = {
  value: string;
  version: number;
  updatedAt: string;
};

/** Thrown when `POST /sdk/translations/apply` returns 403 (missing `translation.edit`). */
export class ApplyTranslationForbiddenError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = 'ApplyTranslationForbiddenError';
  }
}

/** Thrown when `POST /sdk/translations/apply` returns 409 (optimistic concurrency). */
export class ApplyTranslationConflictError extends Error {
  readonly status = 409;
  readonly currentValue: string;
  readonly currentVersion: number;

  constructor(message: string, currentValue: string, currentVersion: number) {
    super(message);
    this.name = 'ApplyTranslationConflictError';
    this.currentValue = currentValue;
    this.currentVersion = currentVersion;
  }
}

/**
 * Thrown when `POST /sdk/translations/apply` returns 400 — e.g. "Published
 * translations cannot be edited" (ApplySdkTranslationHandler). Carries the
 * server's own message, unlike a plain assertOk() Error: the Inspector
 * shows it directly instead of the generic "Something went wrong."
 */
export class ApplyTranslationRejectedError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ApplyTranslationRejectedError';
  }
}

type ApplyTranslationErrorBody = {
  message?: unknown;
  currentValue?: unknown;
  currentVersion?: unknown;
  error?: ApplyTranslationErrorBody;
};

function readApplyTranslationErrorFields(body: ApplyTranslationErrorBody): {
  message: string;
  currentValue: string;
  currentVersion: number;
} {
  const nested = body.error ?? body;
  const message =
    typeof nested.message === 'string' ? nested.message : 'Request failed';
  const currentValue =
    typeof nested.currentValue === 'string' ? nested.currentValue : '';
  const currentVersion =
    typeof nested.currentVersion === 'number' ? nested.currentVersion : 0;

  return { message, currentValue, currentVersion };
}

export type ProposeSdkTranslationParams = {
  key: string;
  language: string;
  expectedVersion: number;
  proposedValue: string;
  comment?: string;
};

export type ProposeSdkTranslationResult = {
  status: 'pending_review';
  version: number;
};

/** Thrown when `POST /sdk/translations/propose` returns 403 (missing `translation.propose`). */
export class ProposeTranslationForbiddenError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = 'ProposeTranslationForbiddenError';
  }
}

/** Thrown when `POST /sdk/translations/propose` returns 409 due to a stale `expectedVersion`. */
export class ProposeTranslationConflictError extends Error {
  readonly status = 409;
  readonly currentValue: string;
  readonly currentVersion: number;

  constructor(message: string, currentValue: string, currentVersion: number) {
    super(message);
    this.name = 'ProposeTranslationConflictError';
    this.currentValue = currentValue;
    this.currentVersion = currentVersion;
  }
}

/** Thrown when `POST /sdk/translations/propose` returns 409 because a proposal is already pending. */
export class ProposeTranslationAlreadyPendingError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ProposeTranslationAlreadyPendingError';
  }
}

type ProposeTranslationErrorBody = {
  message?: unknown;
  currentValue?: unknown;
  currentVersion?: unknown;
  error?: ProposeTranslationErrorBody;
};

function readProposeTranslationErrorFields(body: ProposeTranslationErrorBody): {
  message: string;
  currentValue: string | undefined;
  currentVersion: number | undefined;
} {
  const nested = body.error ?? body;
  const message =
    typeof nested.message === 'string' ? nested.message : 'Request failed';
  const currentValue =
    typeof nested.currentValue === 'string' ? nested.currentValue : undefined;
  const currentVersion =
    typeof nested.currentVersion === 'number'
      ? nested.currentVersion
      : undefined;

  return { message, currentValue, currentVersion };
}

export type ReviewSdkInitOptions = {
  apiBaseUrl: string;
  projectId: string;
  apiKey: string;
  locale: string;
  sourceLocale?: string;
  /** Host container for the SDK's UI. Defaults to `document.body`. */
  mountTarget?: HTMLElement | string;
  /**
   * Called once the SDK's event stream gives up for good (a
   * terminal auth failure, or the reconnect budget exhausted). The SDK does
   * not refresh the session itself; this lets the host detect expiry and
   * decide whether to re-init `ReviewSdk` rather than silently going stale.
   */
  onSessionExpired?: () => void;
  /**
   * Capture a screenshot of the reported element and attach it to
   * the report. **Defaults to false.**
   *
   * The SDK's design lists "Screenshot capture is opt-in" as a guarantee,
   * in the same list as "Password / input values are never collected". The SDK
   * used to capture unconditionally, so that guarantee was documented but
   * not kept — this is a privacy default, and the bundle
   * saving for hosts that bundle the SDK themselves is a side effect.
   *
   * Turning this on means rendering the user's element to a canvas and
   * uploading it, so it is the host's decision to make, not ours.
   */
  captureScreenshots?: boolean;
};

function resolveMountTarget(mountTarget?: HTMLElement | string): HTMLElement {
  if (!mountTarget) {
    return document.body;
  }
  if (typeof mountTarget !== 'string') {
    return mountTarget;
  }
  const el = document.querySelector(mountTarget);
  if (!(el instanceof HTMLElement)) {
    throw new Error(
      `ReviewSdk.init: mountTarget "${mountTarget}" matched no element`,
    );
  }
  return el;
}

/** Max characters of the response body echoed back in a thrown error. */
const ERROR_BODY_SNIPPET_CHARS = 200;

/**
 * Thrown instead of the generic `assertOk` error when the backend
 * rejects the session token.
 *
 * The backend mints a 900-second session and the client never
 * refreshed it, so from minute sixteen every action a reviewer took surfaced
 * as "… failed with HTTP 401", indistinguishable from a genuine
 * misconfiguration. `onSessionExpired` existed but fired only when SSE
 * reconnects were exhausted — never on a failed request.
 *
 * Named so a host can branch on it (`error instanceof SdkSessionExpiredError`)
 * without string-matching a message.
 */
export class SdkSessionExpiredError extends Error {
  constructor(what: string) {
    super(
      `${what} failed: the Review SDK session has expired. ` +
        `Call ReviewSdk.init() again to start a new one.`,
    );
    this.name = 'SdkSessionExpiredError';
  }
}

/**
 * Throws a descriptive Error for any non-2xx response. Without this a failed
 * request silently produced `undefined` fields (e.g. `Bearer undefined` on the
 * next call) instead of surfacing the failure to the caller.
 */
async function assertOk(response: Response, what: string): Promise<void> {
  if (response.ok) {
    return;
  }

  let snippet = '';
  try {
    const body = await response.text();
    if (body) {
      snippet = `: ${body.slice(0, ERROR_BODY_SNIPPET_CHARS)}`;
    }
  } catch {
    // Body unreadable (already consumed / network error) — status alone is enough.
  }

  const error = new Error(
    `${what} failed with HTTP ${response.status}${snippet}`,
  ) as Error & {
    status?: number;
  };
  error.status = response.status;
  throw error;
}

/**
 * Wires a fresh state machine + action engine to a mounted <transl8-launcher>.
 * Only `review.enable`/`review.disable` are registered initially — later
 * features extend the same engine without redesigning it.
 */
function buildReportPayload(
  submission: ReportFormSubmission,
  currentInfo: ResolvedElementInfo | undefined,
  currentLookup: SdkTranslationLookupResult | undefined,
  locale: string,
): SdkReviewIssuePayload {
  return {
    issue: { type: submission.type, comment: submission.comment },
    page: { url: window.location.href },
    element: { tagName: currentInfo?.element.tagName ?? 'unknown' },
    translation: currentInfo?.translation?.key
      ? {
          key: currentInfo.translation.key,
          targetLocale: locale,
          sourceText: currentLookup?.sourceText,
          translatedText: currentLookup?.value,
        }
      : undefined,
  };
}

/**
 * A fired request can be abandoned two ways before its response lands: the
 * reviewer switches the target locale (`sdk.getLocaleGeneration()` bumps),
 * or the panel's *subject* changes out from under it — `subjectGeneration`
 * (`mountLauncher`) bumps on every one of those. That's broader than "left
 * review mode": it bumps when a fresh element is selected (the ordinary
 * case — a reselect abandons whatever the previous selection had in
 * flight, `inspector-open` reselect included, since the machine doesn't
 * even see a transition then) and also when review mode is left entirely —
 * `review.disable` is legal from every non-idle state, and the launcher
 * button / global Ctrl+Shift+T handler dispatch it unconditionally, so
 * `syncDismissAction`'s idle branch bumps it too. Either cause means the
 * response, once it arrives, belongs to a panel whose subject or language
 * is no longer on screen. `captureGeneration` snapshots both counters
 * right before a request fires; `isStaleGeneration` compares them against
 * the live values when it completes. One predicate for both causes, rather
 * than two separate checks that could each be forgotten independently —
 * this counter used to bump only on leaving review mode, which let a
 * request abandoned by an ordinary reselect slip past every guard below.
 */
type RequestGeneration = { locale: number; subject: number };

function captureGeneration(
  sdk: ReviewSdk,
  subjectGeneration: number,
): RequestGeneration {
  return { locale: sdk.getLocaleGeneration(), subject: subjectGeneration };
}

function isStaleGeneration(
  sdk: ReviewSdk,
  subjectGeneration: number,
  generation: RequestGeneration,
): boolean {
  return (
    sdk.getLocaleGeneration() !== generation.locale ||
    subjectGeneration !== generation.subject
  );
}

function submitReportIssue(
  sdk: ReviewSdk,
  stateMachine: ReviewSdkStateMachine,
  reportForm: Transl8ReportForm,
  submission: ReportFormSubmission,
  currentInfo: ResolvedElementInfo | undefined,
  currentElement: Element | undefined,
  currentLookup: SdkTranslationLookupResult | undefined,
  getSubjectGeneration: () => number,
): void {
  stateMachine.transition('report.submit');
  reportForm.setSubmitting(true);

  const payload = buildReportPayload(
    submission,
    currentInfo,
    currentLookup,
    sdk.getLocale(),
  );

  // Same isStaleGeneration shape as the other six paths; inlined here
  // (rather than routed through mountLauncher's captureGeneration /
  // isStaleGeneration directly) since this function already takes `sdk` as
  // a parameter and only needs one more thing — a live read of
  // `subjectGeneration` — from that closure, passed in as a getter so this
  // function still sees the *current* value whenever its own `.then`
  // callbacks eventually run, not the value at call time.
  const generation = captureGeneration(sdk, getSubjectGeneration());

  void sdk.reportIssue(payload).then(
    (result) => {
      if (isStaleGeneration(sdk, getSubjectGeneration(), generation)) {
        // Deliberately NOT reportForm.setSubmitting(false) here, unlike
        // Propose's stale-bail: this form is shared by every report, and a
        // *different*, still-genuinely-in-flight report may be the one
        // that has it disabled right now (as in the race above). Bailing
        // must not re-enable a button a live sibling request still owns —
        // reportForm.show()'s own reset() already un-wedges it the moment
        // the reviewer opens a fresh report, exactly like Apply.
        return;
      }
      stateMachine.transition('report.created');
      reportForm.showSuccess();

      // Capture + upload happens after the text report is
      // already created and the success UI is already showing, so a slow
      // or failing capture never delays or blocks the submit flow.
      // Opt-in: a host must enable screenshot capture explicitly.
      if (sdk.screenshotCaptureEnabled && currentElement instanceof HTMLElement) {
        void captureElementScreenshot(
          currentElement,
          `${sdk.getApiBaseUrl()}/sdk/bundle/capture`,
        ).then((blob) => {
          if (blob) {
            void sdk.uploadReportScreenshot(result.id, blob);
          }
        });
      }
    },
    () => {
      if (isStaleGeneration(sdk, getSubjectGeneration(), generation)) {
        return;
      }
      stateMachine.transition('report.failed');
      reportForm.setError(getStrings(sdk.getLocale()).errors.generic);
    },
  );
}

function mountLauncher(
  target: HTMLElement,
  sdk: ReviewSdk,
): { close(): void } | undefined {
  const root = mountSdkRoot(target);
  if (root.querySelector('transl8-launcher') instanceof Transl8Launcher) {
    return undefined;
  }
  const permissions = sdk.getPermissions();
  const stateMachine = new ReviewSdkStateMachine();
  const actionEngine = new ActionEngine();
  actionEngine.register(reviewEnableAction);
  actionEngine.register(reviewDisableAction);

  const launcher = document.createElement(
    'transl8-launcher',
  ) as Transl8Launcher;
  launcher.configure(stateMachine, actionEngine, permissions);
  // Light-DOM child of the host, not its shadowRoot: transl8-sdk-root
  // projects children through its own <slot>.
  root.appendChild(launcher);

  const overlay = document.createElement(
    'transl8-highlight-overlay',
  ) as Transl8HighlightOverlay;
  root.appendChild(overlay);

  const badges = document.createElement(
    'transl8-review-mode-badges',
  ) as Transl8ReviewModeBadges;
  root.appendChild(badges);

  // One frame, three views. The shell keeps the title and the key row on
  // screen while the body swaps, so switching Inspector -> Ask AI no longer
  // takes the key and the source string away from the reviewer mid-thought.
  const shell = document.createElement(
    'transl8-panel-shell',
  ) as Transl8PanelShell;
  root.appendChild(shell);

  const inspector = document.createElement(
    'transl8-inspector-panel',
  ) as Transl8InspectorPanel;
  inspector.slot = 'body';
  shell.appendChild(inspector);

  const reportForm = document.createElement(
    'transl8-report-form',
  ) as Transl8ReportForm;
  reportForm.slot = 'body';
  shell.appendChild(reportForm);

  // Tracks the selection across Inspector -> Report form -> submit, since
  // The report payload (translation key/source/current text) is exactly what
  // the selection and Inspector already resolved for display — no re-resolution needed.
  let currentInfo: ResolvedElementInfo | undefined;
  let currentElement: Element | undefined;
  let currentLookup: SdkTranslationLookupResult | undefined;
  let lastAiResult: AiAnalysisResult | undefined;
  let reportOpenedFromAi = false;
  const canEditTranslations = permissions.includes(TRANSLATION_EDIT_PERMISSION);
  const canProposeTranslations = permissions.includes(
    TRANSLATION_PROPOSE_PERMISSION,
  );
  const canAskAi = permissions.includes(TRANSLATION_ANALYZE_PERMISSION);

  /**
   * Bumped whenever the panel's *subject* changes: on every fresh selection
   * (tracker's `onSelect` callback below, including an ordinary reselect
   * while already 'inspector-open' — the state machine sees no transition
   * then, so this is the only signal) and whenever review mode is left
   * (`syncDismissAction`'s idle branch below — `review.disable` is legal
   * from every non-idle state, and the launcher button / global
   * Ctrl+Shift+T handler dispatch it unconditionally). Combined with
   * `sdk.getLocaleGeneration()` by `captureGeneration`/`isStaleGeneration`
   * (module scope, above `submitReportIssue`) into the one guard every
   * completion handler below checks before touching any UI or
   * `currentLookup`: if either counter moved, the response is correct for
   * a subject or a language that is no longer on screen, so the honest
   * thing is to do nothing at all — no state transition, no DOM write, no
   * status message. Without this, a slow getTranslation could
   * `inspector.show()` stale content after the reviewer has since selected
   * a different element (this bump
   * used to exist only on the leave-review-mode branch, which left an
   * ordinary reselect with a request in flight unguarded), or a slow apply
   * could `refreshKeyedElementText()` a value onto a host node the
   * reviewer has since selected away from.
   */
  let subjectGeneration = 0;

  /**
   * The single write path for `currentLookup`. Every assignment routes
   * through here so the shell's persistent key row can never drift out of
   * sync with the version that apply/propose send as `expectedVersion` —
   * the failure mode a second, hand-maintained copy of the lookup would
   * produce is a spurious 409, not a crash.
   */
  const setLookup = (lookup: SdkTranslationLookupResult | undefined): void => {
    currentLookup = lookup;
    shell.setContext(
      lookup
        ? { key: lookup.key, locale: sdk.getLocale(), version: lookup.version }
        : undefined,
    );
  };

  /** The three "return to the inspector view" paths, which were identical. */
  const showInspectorView = (): void => {
    shell.setView('translation');
    inspector.show(currentInfo!, currentLookup, sdk.getLocale());
    inspector.setCanEdit(canEditTranslations);
    inspector.setCanPropose(canProposeTranslations);
    inspector.setCanAskAi(canAskAi);
  };

  inspector.onClose = () => {
    stateMachine.transition('inspector.close');
    shell.close();
  };
  inspector.onReportIssue = () => {
    reportOpenedFromAi = false;
    stateMachine.transition('report.start');
    inspector.hide();
    shell.setView('report');
    reportForm.show(sdk.getLocale());
  };

  const releaseStatusByid = new Map<string, string>();

  inspector.onStaleReload = () => {
    const key = currentInfo?.translation?.key;
    if (!key) {
      return;
    }
    stateMachine.transition('inspector.staleRefreshed');
    inspector.clearStale();
    const generation = captureGeneration(sdk, subjectGeneration);
    void sdk
      .getTranslation(key)
      .then((lookup) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        setLookup(lookup);
        if (lookup) {
          inspector.refreshTranslationFields(lookup);
        }
      })
      .catch((error: unknown) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        // Fail open to the current (stale) display instead of a
        // silent, misleading "up to date" state — restore the stale banner
        // `clearStale()` just hid, so the reviewer knows the reload didn't
        // succeed and can retry, rather than leaving an unhandled rejection.
        console.error('[review-sdk] getTranslation reload failed', error);
        inspector.setStale();
      });
  };

  const eventStream = connectSdkEventStream(
    // The read-only stream token, not the write-capable session
    // token: this URL lands in browser history / Referer / proxy logs.
    `${sdk.getApiBaseUrl()}/sdk/events/stream?token=${sdk.getStreamToken()}`,
    (msg: SdkStreamMessage) => {
      if (msg.type === 'translation.changed') {
        const key = currentInfo?.translation?.key;
        if (!key || !currentLookup || stateMachine.state !== 'inspector-open') {
          return;
        }
        const match = msg.data.find(
          (entry) => entry.key === key && entry.language === sdk.getLocale(),
        );
        if (match && match.version !== currentLookup.version) {
          stateMachine.transition('inspector.staleDetected');
          inspector.setStale();
        }
        return;
      }

      for (const release of msg.data as SdkReleaseChangedItem[]) {
        const prior = releaseStatusByid.get(release.id);
        if (prior !== 'published' && release.status === 'published') {
          root.dispatchEvent(
            new CustomEvent('transl8:release-published', {
              detail: release,
              bubbles: true,
            }),
          );
        }
        releaseStatusByid.set(release.id, release.status);
      }
    },
    () => sdk.notifySessionExpired(),
  );

  reportForm.onCancel = () => {
    if (reportOpenedFromAi && lastAiResult) {
      stateMachine.transition('report.cancelFromAi');
      reportForm.hide();
      shell.setView('ai');
      aiPanel.showResultView(lastAiResult);
      aiPanel.setCanApply(
        canEditTranslations && Boolean(lastAiResult.suggestion?.text),
      );
      return;
    }
    stateMachine.transition('report.cancel');
    reportForm.hide();
    showInspectorView();
  };
  reportForm.onClose = () => {
    stateMachine.transition('inspector.close');
    reportForm.hide();
    shell.close();
  };
  reportForm.onSubmit = (submission) => {
    submitReportIssue(
      sdk,
      stateMachine,
      reportForm,
      submission,
      currentInfo,
      currentElement,
      currentLookup,
      () => subjectGeneration,
    );
  };

  const aiPanel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
  aiPanel.slot = 'body';
  shell.appendChild(aiPanel);

  inspector.onAskAi = () => {
    stateMachine.transition('ai.start');
    // The value the reviewer is actually looking at, so the result view can
    // diff the suggestion against it. show() with no argument means "no
    // current value known" and renders no diff at all — which is what
    // shipped, and why the diff has never appeared.
    const currentValue = inspector.getEditedValue();
    inspector.hide();
    shell.setView('ai');
    aiPanel.show(currentValue, sdk.getLocale());
  };

  aiPanel.onCancel = () => {
    stateMachine.transition('ai.cancel');
    aiPanel.hide();
    showInspectorView();
  };

  /**
   * The shell's Back arrow — hidden on the 'translation' view, which is the
   * root of the flow. It must route to the SAME handler the current view's
   * own control uses, never to a generic "return to inspector": from the
   * report form, `reportForm.onCancel` is what branches on
   * `reportOpenedFromAi` to go back to the AI result rather than the
   * inspector, and flattening that is a silent regression.
   *
   * Mid-flight states ('ai-analyzing', '*-applying', 'submitting-report')
   * are deliberately no-ops: the state machine has no back edge out of
   * them, and firing the wrong event would leave `transition()` warning and
   * returning false while the UI moved anyway.
   */
  shell.onBack = () => {
    switch (stateMachine.state) {
      case 'ai-panel-open':
        aiPanel.onCancel?.();
        break;
      case 'ai-result':
        aiPanel.onCloseResult?.();
        break;
      case 'report-form-open':
        reportForm.onCancel?.();
        break;
      case 'report-submitted':
        // Nothing to go back TO — the form is gone. Rather than leave a
        // visible-but-inert arrow, Back does what the view's own Close
        // does, which is the only edge the machine offers from here.
        reportForm.onClose?.();
        break;
      default:
        break;
    }
  };

  /**
   * The shell's dismiss control — what it DOES and what it is CALLED, from
   * one table, so the two cannot drift.
   *
   * `inspector.close` is only legal from 'inspector-open' and
   * 'report-submitted'; everywhere else the button is not a Close. In the
   * three view states it returns to the previous view, so it is labelled
   * Back and carries the back glyph. In the in-flight states the state
   * machine offers no exit edge at all, so rather than looking clickable and
   * doing nothing it presents as unavailable — the AI view still has Cancel
   * request, and Escape is wired in every view.
   */
  const dismissAction = (): {
    action: PanelDismissAction;
    run?: () => void;
  } => {
    switch (stateMachine.state) {
      case 'inspector-open':
        return {
          action: 'close',
          run: () => {
            inspector.hide();
            inspector.onClose?.();
          },
        };
      case 'report-submitted':
        return { action: 'close', run: () => reportForm.onClose?.() };
      case 'ai-panel-open':
      case 'ai-result':
      case 'report-form-open':
        return { action: 'back', run: () => shell.onBack?.() };
      default:
        // ai-analyzing, ai-applying, inspector-applying, inspector-proposing,
        // submitting-report — and the pre-selection states, where the shell
        // is not on screen at all.
        return { action: 'none' };
    }
  };

  shell.onClose = () => dismissAction().run?.();

  /**
   * Every state change reaches the button — AND Escape — through the same
   * table the click uses. Subscribing rather than updating at each
   * show/hide site means a transition can never leave the label describing
   * the previous state.
   *
   * Escape used to run each panel's own per-view `dismiss`, built
   * independently of this table, and the two disagreed: from an in-flight
   * state ('inspector-applying', 'ai-analyzing', …) the button correctly
   * presented as unavailable while Escape fired an illegal
   * `inspector.close`, tearing the panel off screen and leaving the machine
   * to land in a state with nothing rendered — after which
   * `translation.changed` was silently dropped, because stale detection
   * gates on 'inspector-open'. Pointing Escape at `run` makes an `action:
   * 'none'` state a genuine no-op for both.
   */
  const syncDismissAction = () => {
    const { action, run } = dismissAction();
    shell.setDismissAction(action);
    const escape = run ?? (() => {});
    inspector.setDismiss(escape);
    aiPanel.setDismiss(escape);
    reportForm.setDismiss(escape);
    // Leaving review mode with a panel open used to strand it on the host
    // page: badges are cleared so nothing can re-select, 'idle' has no
    // dismiss action so the header X is disabled, and Back is hidden — an
    // undismissable overlay painted over the customer's site. The shell
    // must not outlive review mode.
    if (stateMachine.state === 'idle') {
      inspector.hide();
      aiPanel.hide();
      reportForm.hide();
      shell.close();
      // §1c (leave-review-mode half): 'idle' is only reached via
      // 'review.disable', which is legal from every non-idle state and
      // fired unconditionally by the launcher button / Ctrl+Shift+T — so
      // this is the one place that reliably sees every "left review mode"
      // abandonment, in-flight request or not. The other half — an
      // ordinary reselect — bumps in the tracker's onSelect callback below
      // instead, since that's a subject change with no transition through
      // 'idle' at all.
      subjectGeneration++;
    }
  };
  stateMachine.subscribe(syncDismissAction);
  syncDismissAction();

  let aiAbortController: AbortController | undefined;
  let lastAiSuggestionText: string | undefined;

  aiPanel.onCancelRequest = () => {
    aiAbortController?.abort();
    stateMachine.transition('ai.cancelRequest');
    aiPanel.setAnalyzing(false);
  };

  aiPanel.onCloseResult = () => {
    lastAiSuggestionText = undefined;
    lastAiResult = undefined;
    stateMachine.transition('ai.close');
    aiPanel.hide();
    showInspectorView();
  };

  aiPanel.onCreateReport = () => {
    if (!lastAiResult?.issue) {
      return;
    }
    reportOpenedFromAi = true;
    stateMachine.transition('ai.createReport');
    aiPanel.hide();
    shell.setView('report');
    reportForm.show(sdk.getLocale());
    reportForm.prefill({
      type: mapAiIssueTypeToReportType(lastAiResult.issue.type),
      comment: buildReportCommentFromAiAnalysis(lastAiResult),
    });
  };

  aiPanel.onApply = () => {
    const key = currentInfo?.translation?.key;
    const suggestionText = lastAiSuggestionText;
    if (!key || !currentLookup || !suggestionText) {
      return;
    }

    stateMachine.transition('ai.apply');
    aiPanel.clearApplyFeedback();
    aiPanel.setApplying(true);

    const generation = captureGeneration(sdk, subjectGeneration);
    void sdk
      .applyTranslation({
        key,
        language: sdk.getLocale(),
        expectedVersion: currentLookup.version,
        newValue: suggestionText,
        source: 'ai_suggestion',
      })
      .then((result) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        stateMachine.transition('ai.applySucceeded');
        setLookup({
          ...currentLookup!,
          value: result.value,
          version: result.version,
          updatedAt: result.updatedAt,
        });
        refreshKeyedElementText(key, result.value);
        aiPanel.setApplySuccess();
      })
      .catch((error: unknown) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        aiPanel.setApplying(false);
        if (error instanceof ApplyTranslationForbiddenError) {
          stateMachine.transition('ai.applyFailed');
          aiPanel.setApplyPermissionDenied();
          return;
        }
        if (error instanceof ApplyTranslationConflictError) {
          stateMachine.transition('ai.applyConflict');
          setLookup({
            ...currentLookup!,
            value: error.currentValue,
            version: error.currentVersion,
          });
          aiPanel.setApplyConflict();
          return;
        }
        stateMachine.transition('ai.applyFailed');
        aiPanel.setApplyError(
          error instanceof ApplyTranslationRejectedError
            ? error.message
            : getStrings(sdk.getLocale()).errors.generic,
        );
      });
  };

  inspector.onApply = () => {
    const key = currentInfo?.translation?.key;
    const newValue = inspector.getEditedValue().trim();
    if (!key || !currentLookup || !newValue) {
      return;
    }

    stateMachine.transition('inspector.apply');
    inspector.clearApplyFeedback();
    inspector.setApplying(true);

    const generation = captureGeneration(sdk, subjectGeneration);
    void sdk
      .applyTranslation({
        key,
        language: sdk.getLocale(),
        expectedVersion: currentLookup.version,
        newValue,
        source: 'manual',
      })
      .then((result) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        stateMachine.transition('inspector.applySucceeded');
        setLookup({
          ...currentLookup!,
          value: result.value,
          version: result.version,
          updatedAt: result.updatedAt,
        });
        refreshKeyedElementText(key, result.value);
        inspector.refreshTranslationFields(currentLookup!);
        inspector.setApplySuccess();
      })
      .catch((error: unknown) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        inspector.setApplying(false);
        if (error instanceof ApplyTranslationForbiddenError) {
          stateMachine.transition('inspector.applyFailed');
          inspector.setApplyPermissionDenied();
          return;
        }
        if (error instanceof ApplyTranslationConflictError) {
          stateMachine.transition('inspector.applyConflict');
          setLookup({
            ...currentLookup!,
            value: error.currentValue,
            version: error.currentVersion,
          });
          inspector.refreshTranslationFields(currentLookup!);
          inspector.setApplyConflict();
          return;
        }
        stateMachine.transition('inspector.applyFailed');
        inspector.setApplyError(
          error instanceof ApplyTranslationRejectedError
            ? error.message
            : getStrings(sdk.getLocale()).errors.generic,
        );
      });
  };

  inspector.onPropose = () => {
    const key = currentInfo?.translation?.key;
    const proposedValue = inspector.getEditedValue().trim();
    if (!key || !currentLookup || !proposedValue) {
      return;
    }

    stateMachine.transition('inspector.propose');
    inspector.clearProposeFeedback();
    inspector.setProposing(true);

    const generation = captureGeneration(sdk, subjectGeneration);
    void sdk
      .proposeTranslation({
        key,
        language: sdk.getLocale(),
        expectedVersion: currentLookup.version,
        proposedValue,
      })
      .then(() => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          // No result, no transition, no status message, and — unlike the
          // very first version of this guard — no direct setProposing(false)
          // either: this panel instance is shared across every selection,
          // so by the time this stale response arrives the button's
          // disabled state may belong to a *different*, still-genuinely-
          // in-flight propose (reselect after the panel force-closed, then
          // propose again). Resetting it here would re-enable a control a
          // live request currently owns and invite a double-submit — the
          // same hazard the report path was already written to avoid.
          // inspector.show()'s clearProposeFeedback() (mirroring
          // clearApplyFeedback()) is what un-wedges a genuinely-abandoned
          // propose, on the next fresh open, exactly like Apply.
          return;
        }
        stateMachine.transition('inspector.proposeSucceeded');
        inspector.setProposeSuccess();
      })
      .catch((error: unknown) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        if (error instanceof ProposeTranslationForbiddenError) {
          inspector.setProposing(false);
          stateMachine.transition('inspector.proposeFailed');
          inspector.setProposePermissionDenied();
          return;
        }
        if (error instanceof ProposeTranslationAlreadyPendingError) {
          // Deliberately do NOT call setProposing(false) here: resubmission
          // must stay disabled until the caller refreshes — setProposeAlreadyPending() itself also
          // forces the button disabled, defense-in-depth.
          stateMachine.transition('inspector.proposeConflict');
          inspector.setProposeAlreadyPending();
          return;
        }
        if (error instanceof ProposeTranslationConflictError) {
          // Mirrors inspector.onApply's conflict branch: re-enable so the
          // reviewer can retry immediately against the refreshed value.
          inspector.setProposing(false);
          stateMachine.transition('inspector.proposeConflict');
          setLookup({
            ...currentLookup!,
            value: error.currentValue,
            version: error.currentVersion,
          });
          inspector.refreshTranslationFields(currentLookup!);
          inspector.setProposeConflict();
          return;
        }
        inspector.setProposing(false);
        stateMachine.transition('inspector.proposeFailed');
        inspector.setProposeError(getStrings(sdk.getLocale()).errors.generic);
      });
  };

  aiPanel.onSubmit = (userRequest) => {
    stateMachine.transition('ai.submit');
    // Clear any error left over from a previous failed attempt before
    // showing the analyzing state, so a stale message doesn't survive
    // into this new request.
    aiPanel.setError('');
    aiPanel.setAnalyzing(true);
    aiAbortController = new AbortController();
    const generation = captureGeneration(sdk, subjectGeneration);

    void sdk
      .analyzeTranslation(
        {
          userRequest,
          translation: {
            key: currentInfo?.translation?.key,
            sourceText: currentLookup?.sourceText,
            // Only the backend-verified lookup value is ever sent as the
            // "current translation" — never info.element.text (host-page
            // DOM content), matching the Inspector's spoofing-resistance
            // rule. The Ask AI button only renders after a real
            // lookup has already succeeded, so this is never empty in
            // practice.
            translatedText: currentLookup?.value ?? '',
          },
          page: { route: window.location.href },
        },
        { signal: aiAbortController.signal },
      )
      .then((result) => {
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          // Analyze wasn't in the finding's original list, but the same
          // reasoning applies as the other four paths: this result was
          // computed for a language the reviewer is no longer looking at.
          // aiPanel.show()'s reset() already clears `analyzing` on the next
          // open, so — unlike Propose — there is no separate progress
          // indicator to reset here.
          return;
        }
        stateMachine.transition('ai.succeeded');
        lastAiResult = result;
        lastAiSuggestionText = result.suggestion?.text;
        aiPanel.showResult(result);
        aiPanel.setCanApply(
          canEditTranslations && Boolean(result.suggestion?.text),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // Already handled by onCancelRequest's own transition; no error UI.
          return;
        }
        if (isStaleGeneration(sdk, subjectGeneration, generation)) {
          return;
        }
        stateMachine.transition('ai.failed');
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          aiPanel.setError(getStrings(sdk.getLocale()).errors.aiTimeout);
          return;
        }
        if (
          (error as (Error & { status?: number }) | undefined)?.status === 429
        ) {
          aiPanel.setError(getStrings(sdk.getLocale()).errors.aiRateLimited);
          return;
        }
        aiPanel.setError(getStrings(sdk.getLocale()).errors.generic);
      });
  };

  new HoverTracker(stateMachine, overlay).start();

  const tracker = new ReviewModeElementTracker(
    stateMachine,
    badges,
    (info, element) => {
      // §1c (subject-change half): every new selection abandons whatever the
      // previous one had in flight, including an ordinary reselect while
      // already 'inspector-open' — the state machine sees no transition at
      // all then (ReviewModeElementTracker.select() exempts it), so this
      // callback is the only place that sees every subject change. Must run
      // before `captureGeneration` reads it anywhere below (getTranslation's
      // own call a few lines down included) and before `currentInfo` is
      // reassigned, so a request already in flight for the *previous*
      // subject reliably captured the *old* value.
      subjectGeneration++;
      currentInfo = info;
      currentElement = element;
      setLookup(undefined);
      // Selecting a new element always returns to the translation view, so the
      // other two bodies must be told to hide. Without this they stay
      // display:block and stack inside the shell's single frame — before this
      // task they were separate position:fixed layers, so the same bug merely
      // overlapped instead of concatenating.
      aiPanel.hide();
      reportForm.hide();
      shell.setView('translation');
      root.dispatchEvent(
        new CustomEvent('transl8:element-selected', {
          detail: info,
          bubbles: true,
        }),
      );

      const key = info.translation?.key;
      if (!key) {
        inspector.show(info, undefined, sdk.getLocale());
        return;
      }
      inspector.showLoading(info);
      const generation = captureGeneration(sdk, subjectGeneration);
      void sdk
        .getTranslation(key)
        .then((lookup: SdkTranslationLookupResult | undefined) => {
          if (isStaleGeneration(sdk, subjectGeneration, generation)) {
            return;
          }
          setLookup(lookup);
          inspector.show(info, lookup, sdk.getLocale());
          inspector.setCanEdit(canEditTranslations);
          inspector.setCanPropose(canProposeTranslations);
          inspector.setCanAskAi(canAskAi);
        })
        .catch((error: unknown) => {
          if (isStaleGeneration(sdk, subjectGeneration, generation)) {
            return;
          }
          // Fail open instead of leaving the Inspector stuck on
          // showLoading() forever with an unhandled rejection. There is no
          // cached/current value to fall back to yet (no offline cache —
          // deliberately deferred), so the honest fallback
          // is a visible, dismissable error rather than a silent hang.
          setLookup(undefined);
          console.error('[review-sdk] getTranslation lookup failed', error);
          inspector.showLookupError();
        });
    },
  );
  tracker.onCountChange = (count) => launcher.setKeyCount(count);
  tracker.start();

  // `currentLookup` describes a translation in the locale that just became
  // stale, so an open panel is closed rather than left showing the wrong
  // language. `review.disable` is the only transition the state machine
  // accepts from every one of those panel states uniformly (including the
  // mid-flight ones with no other exit edge), which is also why it lands in
  // 'idle' rather than back in 'review-mode-active' — reusing it here (and
  // syncDismissAction's existing idle handler, subscribed above) means no
  // state machine change is needed. Guarded to states where a panel is
  // actually on screen: 'review-mode-active'/'hovering' have badges visible
  // but no panel, and firing this there would silently turn review mode off
  // for no visible reason.
  //
  // Reaching PANEL_OPEN_STATES at all means review mode was active (every
  // one of those states is nested inside it), so 'idle' here is only ever a
  // stopover: immediately follow with 'review.enable' to land back on
  // 'review-mode-active', the state the reviewer was actually in before the
  // locale changed. Both transitions run synchronously, back to back, in
  // this one callback — no `await`, no timer between them.
  // `transition()` notifies its subscribers synchronously too, so the
  // tracker's idle-clear and its idle->active rescan
  // (review-mode-element-tracker.ts) both complete before this callback
  // returns — nothing yields to the browser's renderer in between, so
  // there is no intermediate 'idle' frame to paint. The rescan is exactly
  // what's wanted: fresh badges over whatever the host just re-rendered in
  // the new language.
  sdk.onLocaleChange = (locale) => {
    // All four run unconditionally, before the PANEL_OPEN_STATES branch
    // below: the launcher badge (persistent chrome, never closes/remounts)
    // and the review-mode badges (visible in 'review-mode-active'/'hovering'
    // too, states PANEL_OPEN_STATES doesn't cover) each re-render themselves
    // synchronously from their own setLocale(), and the shell/inspector need
    // their own sync regardless of whether a panel is open right now — a
    // panel that opens later (showLoading()/showLookupError() included)
    // must not paint from a stale getStrings() snapshot. Running these
    // first also means that when the branch below *does* fire its
    // disable/enable rescan, that rescan already sees the fresh locale (see
    // review-mode-element-tracker.ts).
    root.dir = getStrings(locale).dir;
    launcher.setLocale(locale);
    tracker.setLocale(locale);
    shell.setLocale(locale);
    inspector.setLocale(locale);
    if (PANEL_OPEN_STATES.has(stateMachine.state)) {
      stateMachine.transition('review.disable');
      stateMachine.transition('review.enable');
      // A suggestion (and the text an Apply would send) computed for the
      // language the reviewer just switched away from isn't stale, it's
      // wrong for the one they're looking at now. `aiPanel.onCloseResult`
      // already clears both when the reviewer leaves the AI result view
      // through its own Close/Back, so this mirrors that same cleanup for
      // the other way an AI session ends: the locale changing out from
      // under it. Defense in depth alongside the isStaleGeneration guards
      // above — those stop a stale *response* from painting itself in;
      // this stops an *already-applied* stale result from lingering in
      // memory for some later path to read.
      lastAiResult = undefined;
      lastAiSuggestionText = undefined;
    }
  };

  // `sdk.onLocaleChange` above only fires from `ReviewSdk.setLocale()`'s
  // explicit-change path — `init()` never calls it — so without this a host
  // that does `init({ locale: 'de' })` and never calls `setLocale()` again
  // leaves the launcher/tracker/shell/inspector's own `locale` field
  // `undefined` for the whole session (invisible only for a locale that
  // falls back to English — see ui/strings.ts). Sync once at mount time so
  // initial chrome matches what a later `setLocale()` call would produce —
  // the shell/inspector sync closes the gap where `setView('translation')`/`showLoading()`/`showLookupError()`
  // could otherwise paint from `getStrings(undefined)` on the very first
  // element selection of a session, before any lookup resolves through
  // `setContext()`/`show()`. Review mode is still 'idle' here (nothing has
  // toggled it on yet), so `tracker.setLocale()` just records the locale via
  // its own idle guard above, and the other three set their field ahead of
  // whatever the next render is.
  // `root.dir` follows the resolved chrome language, not the raw locale, so
  // `ar` flips every panel to RTL and an untranslated RTL locale (`he`) stays
  // on English/LTR. `all: initial` on the root's :host doesn't reset
  // `direction`, so the attribute reaches the panels through inheritance.
  root.dir = getStrings(sdk.getLocale()).dir;
  launcher.setLocale(sdk.getLocale());
  tracker.setLocale(sdk.getLocale());
  shell.setLocale(sdk.getLocale());
  inspector.setLocale(sdk.getLocale());

  return {
    close(): void {
      eventStream.close();
    },
  };
}

/**
 * Every SDK network call needs a deadline: a backend that accepts the
 * connection and then goes quiet must surface an error, not leave the Inspector
 * spinning with no way back. `init()` and `analyzeTranslation()` each grew
 * their own copy of this AbortController dance; this is that copy, once.
 *
 * Aborts with a DOMException named `TimeoutError`, which callers already
 * distinguish from a caller-triggered `AbortError` (see `mountLauncher`).
 * `externalSignal` lets a caller still cancel earlier than the deadline.
 *
 * Timing out a write is safe to retry here: apply and propose both carry
 * `expectedVersion`, so a retry after a request that actually landed conflicts
 * with 409 rather than writing twice.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * How long before `sessionExpiresAt` the SDK silently exchanges
 * the current session for a fresh one via `POST /sdk/session/refresh`. Not
 * the "auto re-mint from a retained apiKey" considered and
 * rejected (see `assertOkOrSessionExpired`'s doc comment) — this exchanges
 * the session token itself and never touches the API key.
 */
const SESSION_REFRESH_LEAD_MS = 60_000;

/**
 * `setTimeout`'s delay is a 32-bit signed int under the hood; anything past
 * this overflows and fires on the next tick instead of waiting (Node docs:
 * "delay will be set to 1"). Not reachable through today's real config
 * (`SDK_SESSION_TTL_SEC` caps at 3600s), but `scheduleSessionRefresh` clamps
 * to it anyway rather than trusting that ceiling never moves.
 */
const MAX_SET_TIMEOUT_DELAY_MS = 2_147_483_647;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  label: string,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException(`${label} timed out`, 'TimeoutError'));
  }, REQUEST_TIMEOUT_MS);
  externalSignal?.addEventListener('abort', () => controller.abort());

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export class ReviewSdk {
  private sessionToken: string;
  /**
   * A separate, read-only token for `GET /sdk/events/stream`'s
   * `?token=`, minted by the backend alongside `sessionToken` in the same
   * `POST /sdk/session` response. The event stream used to take
   * `sessionToken` itself, which also authorizes `apply`/`propose`/
   * `ai/analyze` — putting a write-capable credential in a URL (browser
   * history, Referer, proxy logs) for a route that only ever needs to read.
   */
  private streamToken: string;
  private apiBaseUrl: string;
  private sessionExpiresAt: string | undefined;
  private permissions: readonly string[];
  private projectId: string;
  private locale: string;
  private sourceLocale: string | undefined;
  private onSessionExpiredCallback: (() => void) | undefined;
  /** Read by `submitReportIssue`; opt-in, default false. */
  readonly screenshotCaptureEnabled: boolean;
  /** Set by `init()` once `mountLauncher` runs; `undefined` when a launcher was already mounted for this page (no new stream to close). */
  private launcherHandle: { close(): void } | undefined;
  /** Cleared in `destroy()`, same as the SSE handle above, so a torn-down instance can't fire a refresh into a dead session. */
  private refreshTimerId: ReturnType<typeof setTimeout> | undefined;
  /**
   * Bumped every time `setLocale` actually changes `locale` (never on the
   * same-locale no-op). Lets an in-flight request's completion handler tell
   * "the response arrived" apart from "the response is still about the
   * language the reviewer is currently looking at" — see `mountLauncher`'s
   * `localeGeneration` captures next to each `getTranslation` /
   * `applyTranslation` / `proposeTranslation` call.
   */
  private localeGeneration = 0;

  /**
   * Set by `mountLauncher`, mirroring `tracker.onCountChange` — `ReviewSdk`
   * does not hold references to the panels themselves (`mountLauncher` owns
   * them in a closure), so a locale change is reported through this callback
   * rather than by reaching into panel state directly.
   */
  onLocaleChange?: (locale: string) => void;

  private constructor(
    sessionToken: string,
    streamToken: string,
    apiBaseUrl: string,
    permissions: readonly string[],
    projectId: string,
    locale: string,
    sourceLocale: string | undefined,
    sessionExpiresAt?: string,
    onSessionExpired?: () => void,
    captureScreenshots = false,
  ) {
    this.sessionToken = sessionToken;
    this.streamToken = streamToken;
    this.apiBaseUrl = apiBaseUrl;
    this.permissions = permissions;
    this.projectId = projectId;
    this.locale = locale;
    this.sourceLocale = sourceLocale;
    this.sessionExpiresAt = sessionExpiresAt;
    this.onSessionExpiredCallback = onSessionExpired;
    this.screenshotCaptureEnabled = captureScreenshots;
    // Second entry point (see SET_LOCALE_EVENT above) for hosts that loaded
    // the bundle via a bare <script> tag and have no reference to this
    // instance. Removed again in `destroy()`.
    window.addEventListener(SET_LOCALE_EVENT, this.handleSetLocaleEvent);
    this.scheduleSessionRefresh();
  }

  /**
   * Schedules `refreshSession()` to fire `SESSION_REFRESH_LEAD_MS`
   * before `sessionExpiresAt`. Deliberately does nothing (no timer at all,
   * not a clamped-to-zero one) when that lead time has already passed or
   * `sessionExpiresAt` is missing/unparseable: there is nothing meaningful to
   * schedule, and the existing `assertOkOrSessionExpired` 401 path already
   * covers a session that is expired or expiring imminently.
   */
  private scheduleSessionRefresh(): void {
    if (!this.sessionExpiresAt) {
      return;
    }
    const expiresAtMs = new Date(this.sessionExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs)) {
      return;
    }
    const delay = expiresAtMs - Date.now() - SESSION_REFRESH_LEAD_MS;
    if (delay <= 0) {
      return;
    }
    this.refreshTimerId = setTimeout(
      () => {
        void this.refreshSession();
      },
      Math.min(delay, MAX_SET_TIMEOUT_DELAY_MS),
    );
  }

  /**
   * Exchanges the current session token for a fresh one via
   * `POST /sdk/session/refresh`, authenticated with the session token itself
   * (never the API key — see SESSION_REFRESH_LEAD_MS's doc comment). Never
   * throws: this runs off a background timer with no caller to catch a
   * rejection, matching `captureElementScreenshot`'s "never reject, log and
   * move on" contract. A failed refresh (network down, or the session
   * already past SDK_SESSION_MAX_LIFETIME_SEC) is not itself a user-visible
   * error — the existing `assertOkOrSessionExpired` 401 path still fires,
   * and still notifies, the next time the host actually makes a call.
   */
  private async refreshSession(): Promise<void> {
    try {
      const response = await fetchWithTimeout(
        `${this.apiBaseUrl}/sdk/session/refresh`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.sessionToken}` },
        },
        'POST /sdk/session/refresh',
      );
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      this.sessionToken = data.data.token;
      this.streamToken = data.data.streamToken;
      this.sessionExpiresAt = data.data.expiresAt;
      this.scheduleSessionRefresh();
    } catch (error) {
      console.error('[review-sdk] silent session refresh failed', error);
    }
  }

  /**
   * Bound instance field (not a prototype method) so it can be passed
   * directly to `addEventListener` above. Wrapped in try/catch per-listener,
   * on top of `setLocale` already being throw-free for bad input, because a
   * `window` listener that throws surfaces in the host's own console as if
   * the host had caused it.
   */
  private handleSetLocaleEvent = (event: Event): void => {
    try {
      this.setLocale((event as CustomEvent).detail);
    } catch (error) {
      console.error('[review-sdk] transl8:set-locale listener failed', error);
    }
  };

  /** Called by `mountLauncher` when the event stream gives up for good. */
  notifySessionExpired(): void {
    this.onSessionExpiredCallback?.();
  }

  /**
   * Every authenticated call goes through this instead of the
   * module-level `assertOk`, so a 401 fires the documented `onSessionExpired`
   * callback and throws something a host can recognise, rather than a generic
   * "HTTP 401" the reviewer sees as "Something went wrong".
   *
   * **Auto re-minting was considered and rejected.** It would be better UX — but the SDK does not retain
   * `opts.apiKey` after `init()`, and keeping it would hold the raw
   * `ta_live_` secret in a long-lived object for the life of the page. That is
   * precisely the surface to keep small, and widening it to save a
   * re-init is a bad trade to make silently. The host already receives the
   * callback and holds the key; re-initialising is one line on their side.
   *
   * `init()` deliberately still uses the module-level `assertOk`: a 401 there
   * is a bad API key, not an expired session, and there is no instance yet to
   * notify.
   */
  private async assertOkOrSessionExpired(
    response: Response,
    what: string,
  ): Promise<void> {
    if (response.status === 401) {
      this.notifySessionExpired();
      throw new SdkSessionExpiredError(what);
    }
    await assertOk(response, what);
  }

  /**
   * Closes the SSE stream (previously leaked forever: the
   * `{ close() }` handle `mountLauncher` got back was discarded) and removes
   * the `transl8:set-locale` window listener added in the constructor.
   */
  destroy(): void {
    this.launcherHandle?.close();
    window.removeEventListener(SET_LOCALE_EVENT, this.handleSetLocaleEvent);
    // Same leak class as the SSE handle above: an uncleared
    // refresh timer would keep firing network calls for a destroyed instance.
    if (this.refreshTimerId !== undefined) {
      clearTimeout(this.refreshTimerId);
    }
  }

  /**
   * Mirrors `analyzeTranslation`'s internal-AbortController +
   * 10s-timeout pattern: a down/hanging backend must not hang `init()`
   * forever, unlike before this fix. Clearing the timer in `finally` also
   * means an early rejection (network error, non-2xx) can't leave a
   * dangling timer to fire its own abort() later, as a second, unrelated
   * rejection.
   */
  static async init(opts: ReviewSdkInitOptions): Promise<ReviewSdk> {
    {
      const response = await fetchWithTimeout(
        `${opts.apiBaseUrl}/sdk/session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json',
            // Lets the server refuse a build below its minimum
            // supported version with an actionable error instead of an
            // unexplained failure further into the session.
            'X-Sdk-Version': SDK_VERSION,
          },
          body: JSON.stringify({
            locale: opts.locale,
            ...(opts.sourceLocale && { sourceLocale: opts.sourceLocale }),
          }),
        },
        'POST /sdk/session',
      );

      await assertOk(response, 'POST /sdk/session');

      const data = await response.json();
      const permissions: readonly string[] = data.data.permissions ?? [];

      // Same canonicalization `setLocale` applies, extended to
      // the initial value: leaving this one raw while `setLocale` stores
      // canonical form guarantees they eventually disagree — e.g.
      // `init({ locale: 'en-us' })` followed by `setLocale('en-US')` would
      // read as a real change and incorrectly bounce review mode / close an
      // open panel for a locale that didn't actually change. Falls back to
      // the raw value when it isn't a valid BCP-47 tag at all, matching
      // `init()`'s existing tolerance for a bad locale — it has never
      // validated this field, and starting to reject it here would newly
      // fail requests that silently "worked" (modulo empty lookups) before.
      const canonicalLocale = canonicalizeLocale(opts.locale) ?? opts.locale;

      const sdk = new ReviewSdk(
        data.data.token,
        data.data.streamToken,
        opts.apiBaseUrl,
        permissions,
        data.data.projectId,
        canonicalLocale,
        opts.sourceLocale,
        data.data.expiresAt,
        opts.onSessionExpired,
        opts.captureScreenshots ?? false,
      );

      if (permissions.includes(REVIEW_CREATE_PERMISSION)) {
        sdk.launcherHandle = mountLauncher(
          resolveMountTarget(opts.mountTarget),
          sdk,
        );
      }

      return sdk;
    }
  }

  getSessionToken(): string {
    return this.sessionToken;
  }

  /** The read-only token GET /sdk/events/stream takes as ?token=. */
  getStreamToken(): string {
    return this.streamToken;
  }

  /**
   * ISO-8601 expiry of the current session token. The SDK now
   * refreshes this silently before it lapses (`scheduleSessionRefresh`), so
   * this value moves forward on its own; it's still exposed for a host that
   * wants to detect an expired session directly rather than only via a
   * failed call.
   */
  getSessionExpiresAt(): string | undefined {
    return this.sessionExpiresAt;
  }

  getPermissions(): string[] {
    return [...this.permissions];
  }

  getLocale(): string {
    return this.locale;
  }

  /** See `localeGeneration` above. */
  getLocaleGeneration(): number {
    return this.localeGeneration;
  }

  /**
   * Repoints every subsequent `/sdk/*` request at a new target language —
   * additive to the public API (minor bump), and deliberately does not
   * re-auth: `POST /sdk/session`'s signed payload carries only `sub`, `jti`,
   * permissions and projectId, never locale (see
   * the server's session endpoint), so nothing about the session depends on it.
   *
   * Rejects a non-string or a syntactically invalid BCP-47 tag rather than
   * sending it as a query/body parameter — `locale` may originate from a
   * host-supplied `transl8:set-locale` CustomEvent.detail, which could be
   * anything. Stores the canonical form `Intl.getCanonicalLocales` returns,
   * not the raw input, so `'en-us'` and `'en-US'` are the same
   * locale for both the no-op check below and every request that follows.
   * Setting the already-current locale is a no-op: it must not close a
   * panel the reviewer has open over a same-language re-emission, and must
   * not bump `localeGeneration` — nothing actually became stale.
   *
   * An invalid tag is rejected silently *to the caller* (no throw — a
   * malformed `transl8:set-locale` payload must not surface as an
   * exception in the host's console), but not silently altogether: a
   * `console.warn` names the rejected value, matching this file's other
   * `[review-sdk] ...` warnings, so an integrator with a typo gets some
   * signal instead of a request that quietly never changes language.
   */
  setLocale(locale: string): void {
    const canonical = canonicalizeLocale(locale);
    if (!canonical) {
      console.warn(
        `[review-sdk] setLocale: invalid locale rejected: ${JSON.stringify(locale)}`,
      );
      return;
    }
    if (canonical === this.locale) {
      return;
    }
    this.locale = canonical;
    this.localeGeneration++;
    this.onLocaleChange?.(canonical);
  }

  getProjectId(): string {
    return this.projectId;
  }

  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }

  /**
   * Backend truth for the Inspector. A 404 (no translation for this
   * key/language) is a normal "not found" outcome, not an error: returns
   * `undefined` instead of throwing.
   */
  async getTranslation(
    key: string,
  ): Promise<SdkTranslationLookupResult | undefined> {
    const params = new URLSearchParams({ key, language: this.locale });
    const response = await fetchWithTimeout(
      `${this.apiBaseUrl}/sdk/translations/lookup?${params.toString()}`,
      { headers: { Authorization: `Bearer ${this.sessionToken}` } },
      'GET /sdk/translations/lookup',
    );

    if (response.status === 404) {
      return undefined;
    }
    await this.assertOkOrSessionExpired(
      response,
      'GET /sdk/translations/lookup',
    );

    const data = await response.json();
    return data.data;
  }

  /** Posts a review report for the selected translation. */
  async reportIssue(
    payload: SdkReviewIssuePayload,
  ): Promise<SdkReviewIssueResult> {
    const response = await fetchWithTimeout(
      `${this.apiBaseUrl}/sdk/reviews`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      'POST /sdk/reviews',
    );

    await this.assertOkOrSessionExpired(response, 'POST /sdk/reviews');

    const data = await response.json();
    return data.data;
  }

  /**
   * Second step of the two-step report+screenshot upload — mirrors
   * the key-screenshot upload shape. Never throws to the caller: a
   * failed upload must not surface as an error on an already-submitted
   * report (spec: "a missing screenshot must never block the text report").
   */
  async uploadReportScreenshot(reportId: string, blob: Blob): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('file', blob, 'screenshot.png');
      const response = await fetchWithTimeout(
        `${this.apiBaseUrl}/sdk/reviews/${reportId}/screenshot`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.sessionToken}` },
          body: formData,
        },
        'POST /sdk/reviews/:id/screenshot',
      );
      await this.assertOkOrSessionExpired(
        response,
        'POST /sdk/reviews/:id/screenshot',
      );
    } catch (error) {
      console.error('[review-sdk] screenshot upload failed', error);
    }
  }

  /**
   * Analyzes a translation with AI. `options.signal` lets the caller cancel an in-flight
   * request (wired to the AI panel's "Cancel request" button in
   * mountLauncher). Also enforces its own 10s timeout, distinct from a
   * caller-triggered cancellation: both abort the underlying fetch, but a
   * timeout rejects with a DOMException named "TimeoutError" while a
   * caller abort rejects with "AbortError" — mountLauncher's catch handler
   * shows a different message for each. Neither is wrapped by assertOk,
   * so callers can tell "cancelled"/"timed out" apart from "server error".
   */
  async analyzeTranslation(
    payload: {
      userRequest: string;
      translation: {
        key?: string;
        sourceText?: string;
        translatedText: string;
      };
      page?: { route?: string; title?: string };
    },
    options?: { signal?: AbortSignal },
  ): Promise<AiAnalysisResult & { requestId: string }> {
    const response = await fetchWithTimeout(
      `${this.apiBaseUrl}/sdk/ai/analyze`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          locale: { source: this.sourceLocale, target: this.locale },
        }),
      },
      'POST /sdk/ai/analyze',
      options?.signal,
    );

    await this.assertOkOrSessionExpired(response, 'POST /sdk/ai/analyze');

    const data = await response.json();
    return data.data;
  }

  /**
   * Commits an AI suggestion or manual Inspector edit via
   * `POST /sdk/translations/apply`. Requires `translation.edit` on the session.
   * Throws {@link ApplyTranslationForbiddenError} on 403,
   * {@link ApplyTranslationConflictError} on 409 (includes `currentValue` /
   * `currentVersion` when the server supplies them), and
   * {@link ApplyTranslationRejectedError} on 400 (e.g. the translation is
   * already published — ApplySdkTranslationHandler refuses to edit those).
   */
  async applyTranslation(
    params: ApplySdkTranslationParams,
  ): Promise<ApplySdkTranslationResult> {
    const response = await fetchWithTimeout(
      `${this.apiBaseUrl}/sdk/translations/apply`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      },
      'POST /sdk/translations/apply',
    );

    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 409
    ) {
      let body: ApplyTranslationErrorBody = {};
      try {
        body = (await response.json()) as ApplyTranslationErrorBody;
      } catch {
        // Unreadable body — fall back to generic message below.
      }

      const { message, currentValue, currentVersion } =
        readApplyTranslationErrorFields(body);

      if (response.status === 400) {
        throw new ApplyTranslationRejectedError(message);
      }

      if (response.status === 403) {
        throw new ApplyTranslationForbiddenError(message);
      }

      throw new ApplyTranslationConflictError(
        message,
        currentValue,
        currentVersion,
      );
    }

    await this.assertOkOrSessionExpired(
      response,
      'POST /sdk/translations/apply',
    );

    const data = await response.json();
    return data.data;
  }

  /**
   * Submits a translation change for dashboard review via
   * `POST /sdk/translations/propose`. Requires `translation.propose` on the
   * session — independent of `translation.edit`. Never applies the change
   * itself; throws {@link ProposeTranslationForbiddenError} on 403,
   * {@link ProposeTranslationConflictError} on a stale-version 409, and
   * {@link ProposeTranslationAlreadyPendingError} on an already-pending 409.
   */
  async proposeTranslation(
    params: ProposeSdkTranslationParams,
  ): Promise<ProposeSdkTranslationResult> {
    const response = await fetchWithTimeout(
      `${this.apiBaseUrl}/sdk/translations/propose`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      },
      'POST /sdk/translations/propose',
    );

    if (response.status === 403 || response.status === 409) {
      let body: ProposeTranslationErrorBody = {};
      try {
        body = (await response.json()) as ProposeTranslationErrorBody;
      } catch {
        // Unreadable body — fall back to generic message below.
      }

      const { message, currentValue, currentVersion } =
        readProposeTranslationErrorFields(body);

      if (response.status === 403) {
        throw new ProposeTranslationForbiddenError(message);
      }

      if (currentValue !== undefined && currentVersion !== undefined) {
        throw new ProposeTranslationConflictError(
          message,
          currentValue,
          currentVersion,
        );
      }

      throw new ProposeTranslationAlreadyPendingError(message);
    }

    await this.assertOkOrSessionExpired(
      response,
      'POST /sdk/translations/propose',
    );

    const data = await response.json();
    return data.data;
  }
}
