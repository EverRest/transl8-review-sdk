import type { ResolvedElementInfo } from '../context/element-context-resolver';
import type { SdkTranslationLookupResult } from './inspector-lookup-types';
import { trapPanelFocus } from './panel-a11y';
import { adoptTokens, icon } from './tokens';
import { createTrustedHtml } from './trusted-types';
import { getStrings } from './strings';

/**
 * Inspector. Security property: source text, current translation,
 * version, and last-updated are ALWAYS rendered from the backend lookup
 * result (`lookup`), never from `info.element.text`/`info.translation` (the
 * host page's own DOM content, which the host fully controls and could
 * fake). `info` is only consulted for the tag name and to decide whether a
 * translation key exists at all — never for user-visible translation text.
 */
export class Transl8InspectorPanel extends HTMLElement {
  onClose: (() => void) | undefined;
  onReportIssue: (() => void) | undefined;
  onAskAi: (() => void) | undefined;
  onApply: (() => void) | undefined;
  onPropose: (() => void) | undefined;
  onStaleReload: (() => void) | undefined;

  private panel: HTMLElement | undefined;
  private notTracked: HTMLElement | undefined;
  private loading: HTMLElement | undefined;
  private loadingSrEl: HTMLElement | undefined;
  private lookupError: HTMLElement | undefined;
  private tracked: HTMLElement | undefined;
  private sourceLabelEl: HTMLElement | undefined;
  private sourceTextEl: HTMLElement | undefined;
  private currentLabelEl: HTMLElement | undefined;
  private currentTextEl: HTMLElement | undefined;
  private currentEditEl: HTMLTextAreaElement | undefined;
  private detailsLabelEl: HTMLElement | undefined;
  private pageDtEl: HTMLElement | undefined;
  private localeDtEl: HTMLElement | undefined;
  private versionDtEl: HTMLElement | undefined;
  private localeEl: HTMLElement | undefined;
  private pageEl: HTMLElement | undefined;
  private versionEl: HTMLElement | undefined;
  private updatedAtEl: HTMLElement | undefined;
  private askAiBtn: HTMLButtonElement | undefined;
  private reportIssueBtn: HTMLButtonElement | undefined;
  private applyBtn: HTMLButtonElement | undefined;
  private applyStatusEl: HTMLElement | undefined;
  private proposeBtn: HTMLButtonElement | undefined;
  private proposeStatusEl: HTMLElement | undefined;
  private staleBanner: HTMLElement | undefined;
  private staleBannerTextEl: HTMLElement | undefined;
  private staleReloadBtn: HTMLButtonElement | undefined;
  private canEdit = false;
  private canPropose = false;
  private applyBtnDefaultLabel = getStrings(undefined).inspector.applyButtonLabel;
  private proposeBtnDefaultLabel = getStrings(undefined).inspector.proposeButtonLabel;
  private currentLocale: string | undefined;
  private releaseFocus: (() => void) | undefined;
  /**
   * What Escape does right now, owned by the client's `dismissAction()`
   * table — the same table the shell's header control reads. Escape and the
   * header button must agree on both the legality and the identity of the
   * exit (an in-flight apply/propose/analyse/submit has no exit edge at
   * all), and two independent mappings is exactly how they came to
   * disagree.
   */
  private dismiss: () => void = () => {};

  /** Points Escape at `fn`. Called on every state transition. */
  setDismiss(fn: () => void): void {
    this.dismiss = fn;
  }

  /**
   * Syncs the inspector's own chrome (dialog label, loading/lookup-error
   * text, section labels, apply/propose default labels) to `locale` without
   * requiring a tracked `show()` — the mount-time / `sdk.onLocaleChange`
   * sync point `mountLauncher` (sdk-client.ts) calls alongside
   * `Transl8Launcher.setLocale`/`ReviewModeElementTracker.setLocale`, so
   * `showLoading()`/`showLookupError()` never paint from a stale
   * `getStrings(undefined)` snapshot on the first selection of a session.
   */
  setLocale(locale: string): void {
    this.currentLocale = locale;
    this.applyStaticStrings();
  }

  connectedCallback(): void {
    if (this.shadowRoot) {
      return;
    }
    const shadow = this.attachShadow({ mode: 'open' });
    // Apply/propose button markup is the one exception rendered from a
    // mount-time snapshot below: their *visible* text is always refreshed by
    // setApplying(false)/setProposing(false) on the very next tracked
    // show() (clearApplyFeedback()/clearProposeFeedback() call them
    // unconditionally), so a stale label here never survives to be seen.
    // Every other static string in this template is blank here and filled
    // in by applyStaticStrings() below, which also runs again from show()
    // whenever a real locale becomes known.
    const strings = getStrings(this.currentLocale).inspector;
    shadow.innerHTML = createTrustedHtml(`
      <style>
        :host { all: initial; }
        /* The frame — position, surface, border, shadow, padding — belongs
           to <transl8-panel-shell>; this is only the body slotted into it.
           :host { all: initial } blocks inheritance across the slot
           boundary, so font and colour are still declared here. */
        div[part="panel"] {
          display: none;
          color: var(--t8-ink);
          font-family: var(--t8-font);
          font-size: 13px;
          box-sizing: border-box;
        }
        section { margin-bottom: var(--t8-s2); }
        section[part="lookup-error"] { color: var(--t8-danger); }
        .label {
          display: block;
          color: var(--t8-muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          margin: var(--t8-s3) 0 var(--t8-s1);
        }
        .label:first-of-type { margin-top: 0; }
        [part="source-text"], [part="current-text"],
        [part="locale"], [part="page"], [part="version"], [part="updated-at"] {
          display: block;
          line-height: 1.45;
          word-break: break-word;
        }
        textarea[part="current-edit"] {
          width: 100%;
          box-sizing: border-box;
          font-family: inherit;
          font-size: 13px;
          line-height: 1.45;
          margin-top: var(--t8-s1);
          background: var(--t8-surface);
          color: var(--t8-ink);
          border: 1px solid var(--t8-line-2);
          border-radius: var(--t8-r-ctl);
          padding: var(--t8-s2) 10px;
          resize: vertical;
          field-sizing: content;
          transition: border-color var(--t8-out) var(--t8-ease), box-shadow var(--t8-out) var(--t8-ease);
        }
        textarea[part="current-edit"]:focus {
          outline: none;
          border-color: var(--t8-accent);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--t8-accent) 18%, transparent);
        }
        div[part="apply-status"], div[part="propose-status"] {
          margin-top: var(--t8-s2);
          font-size: 12px;
        }
        div[part="apply-status"].success, div[part="propose-status"].success { color: var(--t8-ok); }
        div[part="apply-status"].error, div[part="propose-status"].error { color: var(--t8-danger); }
        div[part="actions"] {
          display: flex;
          align-items: center;
          gap: var(--t8-s2);
          margin-top: var(--t8-s3);
        }
        button[part="apply"], button[part="propose"],
        button[part="report-issue"], button[part="ask-ai"] {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          color: var(--t8-muted);
          border: 1px solid transparent;
          border-radius: var(--t8-r-ctl);
          padding: 7px 11px;
          font: inherit;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: background var(--t8-out) var(--t8-ease), color var(--t8-out) var(--t8-ease);
        }
        button[part="apply"]:hover:not(:disabled), button[part="propose"]:hover:not(:disabled),
        button[part="report-issue"]:hover, button[part="ask-ai"]:hover {
          background: color-mix(in oklch, var(--t8-muted) 12%, transparent);
          color: var(--t8-ink);
        }
        button[part="apply"] {
          margin-inline-start: auto;
          background: var(--t8-accent);
          color: var(--t8-on-accent);
        }
        button[part="apply"]:hover:not(:disabled) {
          background: var(--t8-accent-hover);
          color: var(--t8-on-accent);
        }
        button[part="apply"]:disabled, button[part="propose"]:disabled {
          opacity: 60%;
          cursor: default;
        }
        [part="stale-banner"] {
          display: none;
          background: color-mix(in oklch, var(--t8-warn) 12%, transparent);
          border: 1px solid var(--t8-warn);
          color: var(--t8-warn);
          border-radius: var(--t8-r-ctl);
          padding: 6px var(--t8-s2);
          margin-bottom: var(--t8-s2);
          font-size: 12px;
        }
        button[part="stale-reload"] {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-inline-start: 6px;
          padding: 3px var(--t8-s2);
          color: inherit;
          background: transparent;
          border: 1px solid currentColor;
          border-radius: var(--t8-r-ctl);
          font: inherit;
          font-size: 11.5px;
          cursor: pointer;
        }
        [part="source-text"] {
          background: var(--t8-recess);
          border: 1px solid var(--t8-line);
          border-inline-start: 2px solid var(--t8-line-2);
          border-radius: var(--t8-r-ctl);
          padding: var(--t8-s2) 10px;
          color: var(--t8-muted);
        }
        details[part="details"] { margin-top: var(--t8-s3); border-top: 1px solid var(--t8-line); padding-top: var(--t8-s3); }
        details[part="details"] summary {
          list-style: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 600;
          color: var(--t8-muted);
        }
        details[part="details"] summary::-webkit-details-marker { display: none; }
        details[part="details"] summary .t8-i { width: 12px; height: 12px; transition: transform var(--t8-in) var(--t8-ease); }
        details[part="details"][open] summary .t8-i { transform: rotate(90deg); }
        details[part="details"] [part="updated-at"] { margin-inline-start: auto; font-weight: 400; }
        details[part="details"] dl {
          margin: var(--t8-s2) 0 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 6px var(--t8-s4);
          font-size: 11.5px;
        }
        details[part="details"] dt { color: var(--t8-muted); }
        details[part="details"] dd { margin: 0; overflow-wrap: anywhere; }
        .sr {
          position: absolute;
          width: 1px; height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
        [part="skeleton-line"] {
          height: 12px;
          margin-bottom: var(--t8-s2);
          border-radius: var(--t8-r-ctl);
          background: linear-gradient(
            90deg,
            color-mix(in oklch, var(--t8-muted) 12%, transparent),
            color-mix(in oklch, var(--t8-muted) 22%, transparent),
            color-mix(in oklch, var(--t8-muted) 12%, transparent)
          );
          background-size: 200% 100%;
          animation: t8-shimmer 1.2s linear infinite;
        }
        @keyframes t8-shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
      </style>
      <div part="panel" role="dialog" aria-modal="false" tabindex="-1">
        <section part="loading" aria-busy="true" aria-live="polite">
          <span class="sr" part="loading-sr"></span>
          <div part="skeleton-line" style="width: 45%"></div>
          <div part="skeleton-line" style="width: 88%"></div>
          <div part="skeleton-line" style="width: 30%"></div>
          <div part="skeleton-line" style="width: 96%; height: 40px"></div>
        </section>
        <section part="lookup-error"></section>
        <section part="not-tracked"></section>
        <section part="tracked">
          <div part="stale-banner">
            <span part="stale-banner-text"></span>
            <button part="stale-reload" type="button">${icon('refresh')}</button>
          </div>
          <div class="label" part="source-label"></div>
          <div part="source-text"></div>
          <div class="label" part="current-label"></div>
          <div part="current-text"></div>
          <textarea part="current-edit" rows="2" style="display: none;"></textarea>
          <details part="details">
            <summary>${icon('chevron')} <span part="details-label"></span> <span part="updated-at"></span></summary>
            <dl>
              <dt part="page-label"></dt><dd part="page"></dd>
              <dt part="locale-label"></dt><dd part="locale"></dd>
              <dt part="version-label"></dt><dd part="version"></dd>
            </dl>
          </details>
          <div part="apply-status"></div>
          <div part="propose-status"></div>
          <div part="actions">
            <button part="ask-ai" type="button" style="display: none;"></button>
            <button part="report-issue" type="button"></button>
            <button part="propose" type="button" style="display: none;">${icon('send')} ${strings.proposeButtonLabel}</button>
            <button part="apply" type="button" style="display: none;">${icon('check')} ${strings.applyButtonLabel}</button>
          </div>
        </section>
      </div>
    `);
    adoptTokens(shadow);

    this.panel = shadow.querySelector('div[part="panel"]') as HTMLElement;
    this.notTracked = shadow.querySelector('section[part="not-tracked"]') as HTMLElement;
    this.loading = shadow.querySelector('section[part="loading"]') as HTMLElement;
    this.loadingSrEl = shadow.querySelector('[part="loading-sr"]') as HTMLElement;
    this.lookupError = shadow.querySelector('section[part="lookup-error"]') as HTMLElement;
    this.tracked = shadow.querySelector('section[part="tracked"]') as HTMLElement;
    this.sourceLabelEl = shadow.querySelector('[part="source-label"]') as HTMLElement;
    this.sourceTextEl = shadow.querySelector('[part="source-text"]') as HTMLElement;
    this.currentLabelEl = shadow.querySelector('[part="current-label"]') as HTMLElement;
    this.currentTextEl = shadow.querySelector('[part="current-text"]') as HTMLElement;
    this.currentEditEl = shadow.querySelector('textarea[part="current-edit"]') as HTMLTextAreaElement;
    this.detailsLabelEl = shadow.querySelector('[part="details-label"]') as HTMLElement;
    this.pageDtEl = shadow.querySelector('[part="page-label"]') as HTMLElement;
    this.localeDtEl = shadow.querySelector('[part="locale-label"]') as HTMLElement;
    this.versionDtEl = shadow.querySelector('[part="version-label"]') as HTMLElement;
    this.localeEl = shadow.querySelector('[part="locale"]') as HTMLElement;
    this.pageEl = shadow.querySelector('[part="page"]') as HTMLElement;
    this.versionEl = shadow.querySelector('[part="version"]') as HTMLElement;
    this.updatedAtEl = shadow.querySelector('[part="updated-at"]') as HTMLElement;
    this.askAiBtn = shadow.querySelector('button[part="ask-ai"]') as HTMLButtonElement;
    this.reportIssueBtn = shadow.querySelector('button[part="report-issue"]') as HTMLButtonElement;
    this.applyBtn = shadow.querySelector('button[part="apply"]') as HTMLButtonElement;
    this.applyStatusEl = shadow.querySelector('div[part="apply-status"]') as HTMLElement;
    this.proposeBtn = shadow.querySelector('button[part="propose"]') as HTMLButtonElement;
    this.proposeStatusEl = shadow.querySelector('div[part="propose-status"]') as HTMLElement;
    this.staleBanner = shadow.querySelector('[part="stale-banner"]') as HTMLElement;
    this.staleBannerTextEl = shadow.querySelector('[part="stale-banner-text"]') as HTMLElement;
    this.staleReloadBtn = shadow.querySelector('button[part="stale-reload"]') as HTMLButtonElement;
    this.applyStaticStrings();
    this.panel.style.display = 'none';

    this.reportIssueBtn.addEventListener('click', () => {
      this.onReportIssue?.();
    });
    this.askAiBtn.addEventListener('click', () => {
      this.onAskAi?.();
    });
    this.applyBtn.addEventListener('click', () => {
      this.onApply?.();
    });
    this.proposeBtn.addEventListener('click', () => {
      this.onPropose?.();
    });
    this.staleReloadBtn.addEventListener('click', () => {
      this.onStaleReload?.();
    });
  }

  /**
   * Applies every static chrome string (labels, section copy, the dialog's
   * accessible name, and the apply/propose idle-button default labels) from
   * `strings.ts`. Called once from `connectedCallback()` — before any locale
   * is known, so it paints in English — and again from the top of `show()`,
   * the first point after mount where a real `locale` becomes available, so
   * this chrome actually updates once a second language table exists (today
   * `getStrings` always resolves to `EN`, so the second call is a no-op in
   * practice, but the refresh path exists and is exercised). Deliberately
   * does not touch the apply/propose buttons' own rendered text directly:
   * `show()` always runs `clearApplyFeedback()`/`clearProposeFeedback()`
   * (→ `setApplying(false)`/`setProposing(false)`) immediately after this
   * call on every tracked open, and those read the two default-label fields
   * this method refreshes — so the visible label is never stale even though
   * it isn't written here.
   */
  private applyStaticStrings(): void {
    const strings = getStrings(this.currentLocale).inspector;
    this.panel?.setAttribute('aria-label', strings.dialogLabel);
    if (this.loadingSrEl) this.loadingSrEl.textContent = strings.loadingSr;
    if (this.lookupError) this.lookupError.textContent = strings.lookupError;
    if (this.notTracked) this.notTracked.textContent = strings.notTracked;
    if (this.staleBannerTextEl) this.staleBannerTextEl.textContent = strings.staleBanner;
    if (this.staleReloadBtn) {
      this.staleReloadBtn.innerHTML = createTrustedHtml(`${icon('refresh')} ${strings.reload}`);
    }
    if (this.sourceLabelEl) this.sourceLabelEl.textContent = strings.sourceLabel;
    if (this.currentLabelEl) this.currentLabelEl.textContent = strings.currentLabel;
    if (this.detailsLabelEl) this.detailsLabelEl.textContent = strings.details;
    if (this.pageDtEl) this.pageDtEl.textContent = strings.page;
    if (this.localeDtEl) this.localeDtEl.textContent = strings.locale;
    if (this.versionDtEl) this.versionDtEl.textContent = strings.version;
    if (this.askAiBtn) {
      this.askAiBtn.innerHTML = createTrustedHtml(`${icon('sparkle')} ${strings.askAi}`);
    }
    if (this.reportIssueBtn) {
      this.reportIssueBtn.innerHTML = createTrustedHtml(`${icon('flag')} ${strings.report}`);
    }
    this.applyBtnDefaultLabel = strings.applyButtonLabel;
    this.proposeBtnDefaultLabel = strings.proposeButtonLabel;
  }

  /** Renders a loading placeholder while the backend lookup is in flight. */
  showLoading(_info: ResolvedElementInfo): void {
    if (!this.panel) {
      return;
    }
    this.panel.style.display = 'block';
    this.panel.setAttribute('data-open', '');
    this.ensureFocus();
    this.setSection('loading');
  }

  /**
   * Fail-open state for a failed `getTranslation()` lookup: clears
   * whatever `showLoading()` left on screen instead of hanging there forever.
   */
  showLookupError(): void {
    if (!this.panel) {
      return;
    }
    this.panel.style.display = 'block';
    this.panel.setAttribute('data-open', '');
    this.ensureFocus();
    this.setSection('lookup-error');
  }

  /**
   * `locale` is the locale the lookup was actually performed in — the SDK's
   * `init({ locale })`, the same value the shell's header chip renders. It
   * is passed in rather than read from `document.documentElement.lang`
   * because that is the host page's claim about itself and the two can
   * disagree; showing both in one panel from two sources is worse than
   * either alone.
   */
  show(
    info: ResolvedElementInfo,
    lookup: SdkTranslationLookupResult | undefined,
    locale?: string,
  ): void {
    this.currentLocale = locale;
    this.applyStaticStrings();
    if (!this.panel) {
      return;
    }
    this.panel.style.display = 'block';
    this.panel.setAttribute('data-open', '');
    this.ensureFocus();

    if (!info.translation?.key || !lookup) {
      this.setSection('not-tracked');
      return;
    }

    this.setSection('tracked');
    this.clearApplyFeedback();
    // Propose has its own feedback/progress indicator, same shape as
    // Apply's — resetting only one of the two on every fresh open was the
    // asymmetry that made Propose (but not Apply) need its own explicit
    // reset on a locale-change stale-bail. Clearing both here means a
    // bailed request of either kind can rely on the next open to reset it,
    // instead of the bail resetting it itself — which matters because this
    // panel instance is shared across selections: a bail resetting the
    // control directly could re-enable a button a *different*, still-live
    // request currently owns.
    this.clearProposeFeedback();
    this.clearStale();
    this.sourceTextEl!.textContent = lookup.sourceText;
    this.refreshTranslationFields(lookup);
    this.localeEl!.textContent = locale ?? '';
    this.pageEl!.textContent = window.location.href;
    this.updateEditMode();
  }

  hide(): void {
    this.releaseFocus?.();
    this.releaseFocus = undefined;
    if (this.panel) {
      this.panel.removeAttribute('data-open');
      this.panel.style.display = 'none';
    }
    this.clearStale();
  }

  setCanEdit(canEdit: boolean): void {
    this.canEdit = canEdit;
    this.updateEditMode();
  }

  setCanPropose(canPropose: boolean): void {
    this.canPropose = canPropose;
    this.updateEditMode();
  }

  /**
   * Ask AI calls POST /sdk/ai/analyze, which needs `translation.analyze`.
   * Hidden until the client says so, so a session without the
   * permission never sees a button that can only end in a generic error.
   */
  setCanAskAi(canAskAi: boolean): void {
    if (this.askAiBtn) {
      this.askAiBtn.style.display = canAskAi ? '' : 'none';
    }
  }

  getEditedValue(): string {
    return this.currentEditEl?.value ?? '';
  }

  setApplying(applying: boolean): void {
    if (!this.applyBtn) {
      return;
    }
    this.applyBtn.disabled = applying;
    this.applyBtn.innerHTML = createTrustedHtml(
      applying
        ? `${icon('refresh')}${getStrings(this.currentLocale).inspector.applying}`
        : `${icon('check')}${this.applyBtnDefaultLabel}`,
    );
  }

  setApplySuccess(): void {
    this.setApplying(false);
    this.setApplyStatus(getStrings(this.currentLocale).inspector.applySuccess, 'success');
  }

  setApplyConflict(): void {
    this.setApplyStatus(getStrings(this.currentLocale).inspector.applyConflict, 'error');
  }

  setApplyPermissionDenied(): void {
    this.setApplyStatus(getStrings(this.currentLocale).inspector.applyPermissionDenied, 'error');
  }

  setApplyError(message: string): void {
    this.setApplying(false);
    this.setApplyStatus(message, 'error');
  }

  clearApplyFeedback(): void {
    this.setApplying(false);
    if (this.applyStatusEl) {
      this.applyStatusEl.textContent = '';
      this.applyStatusEl.classList.remove('success', 'error');
    }
  }

  setStale(): void {
    if (this.staleBanner) {
      this.staleBanner.style.display = 'block';
    }
  }

  clearStale(): void {
    if (this.staleBanner) {
      this.staleBanner.style.display = 'none';
    }
  }

  setProposing(proposing: boolean): void {
    if (!this.proposeBtn) {
      return;
    }
    this.proposeBtn.disabled = proposing;
    this.proposeBtn.innerHTML = createTrustedHtml(
      proposing
        ? `${icon('refresh')}${getStrings(this.currentLocale).inspector.submitting}`
        : `${icon('send')}${this.proposeBtnDefaultLabel}`,
    );
  }

  setProposeSuccess(): void {
    this.setProposing(false);
    this.setProposeStatus(getStrings(this.currentLocale).inspector.proposeSuccess, 'success');
  }

  setProposeConflict(): void {
    this.setProposeStatus(getStrings(this.currentLocale).inspector.proposeConflict, 'error');
  }

  setProposeAlreadyPending(): void {
    // Deliberately does not go through setProposing(false): resubmission
    // must stay disabled until the caller refreshes, regardless of what
    // ran before this.
    if (this.proposeBtn) {
      this.proposeBtn.disabled = true;
    }
    this.setProposeStatus(getStrings(this.currentLocale).inspector.proposeAlreadyPending, 'error');
  }

  setProposePermissionDenied(): void {
    this.setProposeStatus(
      getStrings(this.currentLocale).inspector.proposePermissionDenied,
      'error',
    );
  }

  setProposeError(message: string): void {
    this.setProposing(false);
    this.setProposeStatus(message, 'error');
  }

  clearProposeFeedback(): void {
    this.setProposing(false);
    if (this.proposeStatusEl) {
      this.proposeStatusEl.textContent = '';
      this.proposeStatusEl.classList.remove('success', 'error');
    }
  }

  refreshTranslationFields(lookup: SdkTranslationLookupResult): void {
    // version: 0 is the backend lookup's "no translation for this
    // language yet" placeholder (create-a-first-translation), not a real
    // translation with a real timestamp — `updatedAt` on it is the epoch,
    // which read as a bug report on its own. The current-value field stays
    // genuinely empty here (it's what the reviewer is about to fill in);
    // the key is shown on the host page's own untranslated elements, not in
    // this field.
    const isUntranslated = lookup.version === 0;

    if (this.versionEl) {
      this.versionEl.textContent = `v${lookup.version}`;
    }
    if (this.updatedAtEl) {
      this.updatedAtEl.textContent = isUntranslated
        ? getStrings(this.currentLocale).inspector.notTranslatedYet
        : new Date(lookup.updatedAt).toLocaleString();
    }
    if (this.currentTextEl) {
      this.currentTextEl.textContent = lookup.value;
    }
    if (this.currentEditEl) {
      this.currentEditEl.value = lookup.value;
      this.currentEditEl.placeholder = '';
    }
  }

  private updateEditMode(): void {
    if (!this.currentTextEl || !this.currentEditEl || !this.applyBtn || !this.proposeBtn) {
      return;
    }
    if (this.canEdit || this.canPropose) {
      this.currentTextEl.style.display = 'none';
      this.currentEditEl.style.display = 'block';
    } else {
      this.currentTextEl.style.display = 'block';
      this.currentEditEl.style.display = 'none';
    }
    this.applyBtn.style.display = this.canEdit ? 'inline-block' : 'none';
    this.proposeBtn.style.display = this.canPropose ? 'inline-block' : 'none';
  }

  /**
   * Wires focus/Escape once per open, on whichever of showLoading() /
   * showLookupError() / show() makes the panel visible first. Guarded by
   * `releaseFocus` so a later transition through the same open (e.g.
   * loading -> show()) doesn't re-steal focus out of a field the user may
   * have already started editing.
   */
  private ensureFocus(): void {
    if (this.releaseFocus || !this.panel) {
      return;
    }
    this.releaseFocus = trapPanelFocus(this.panel, () => this.dismiss());
  }

  private setSection(active: 'loading' | 'lookup-error' | 'not-tracked' | 'tracked'): void {
    if (this.loading) this.loading.style.display = active === 'loading' ? 'block' : 'none';
    if (this.lookupError) this.lookupError.style.display = active === 'lookup-error' ? 'block' : 'none';
    if (this.notTracked) this.notTracked.style.display = active === 'not-tracked' ? 'block' : 'none';
    if (this.tracked) this.tracked.style.display = active === 'tracked' ? 'block' : 'none';
  }

  private setApplyStatus(message: string, tone: 'success' | 'error'): void {
    if (!this.applyStatusEl) {
      return;
    }
    this.applyStatusEl.textContent = message;
    this.applyStatusEl.classList.remove('success', 'error');
    this.applyStatusEl.classList.add(tone);
  }

  private setProposeStatus(message: string, tone: 'success' | 'error'): void {
    if (!this.proposeStatusEl) {
      return;
    }
    this.proposeStatusEl.textContent = message;
    this.proposeStatusEl.classList.remove('success', 'error');
    this.proposeStatusEl.classList.add(tone);
  }
}

customElements.define('transl8-inspector-panel', Transl8InspectorPanel);
