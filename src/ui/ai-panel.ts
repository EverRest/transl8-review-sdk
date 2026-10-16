import { trapPanelFocus } from './panel-a11y';
import { adoptTokens, icon } from './tokens';
import { createTrustedHtml } from './trusted-types';
import { humanIssueLabel } from './map-ai-issue-to-report-type';
import { getStrings } from './strings';

const INTENT_CHIPS: Array<{ part: string; key: 'improve' | 'check' | 'explain'; fill: string }> = [
  { part: 'chip-improve', key: 'improve', fill: 'Improve this translation' },
  { part: 'chip-check', key: 'check', fill: 'Check this translation for errors' },
  { part: 'chip-explain', key: 'explain', fill: 'Explain this translation' },
];

export interface MatchedGlossaryTerm {
  sourceTerm: string;
  // Backend GlossaryTermOption sends `null`, not an omitted key, for "no
  // target term recorded yet" — the wire value really is null.
  targetTerm?: string | null;
  doNotTranslate?: boolean;
}

export interface AiAnalysisResult {
  intent: string;
  issue?: { type: string; severity: string };
  suggestion?: { text: string; explanation: string };
  explanation?: string;
  confidenceBucket: 'high' | 'medium' | 'low';
  /** Project glossary terms the backend matched against this string's
   * source text and fed into the AI prompt — shown so the reviewer can see
   * which house terminology applied. Absent/empty hides the section. */
  matchedTerms?: MatchedGlossaryTerm[];
}

export class Transl8AiPanel extends HTMLElement {
  onSubmit: ((userRequest: string) => void) | undefined;
  onCancel: (() => void) | undefined;
  onCancelRequest: (() => void) | undefined;
  onCloseResult: (() => void) | undefined;
  onApply: (() => void) | undefined;
  onCreateReport: (() => void) | undefined;

  private panel: HTMLElement | undefined;
  private inputSection: HTMLElement | undefined;
  private resultSection: HTMLElement | undefined;
  private requestEl: HTMLTextAreaElement | undefined;
  private analyzeBtn: HTMLButtonElement | undefined;
  private cancelBtn: HTMLButtonElement | undefined;
  private cancelRequestEl: HTMLElement | undefined;
  private cancelRequestBtn: HTMLButtonElement | undefined;
  private errorEl: HTMLElement | undefined;
  private confMeterEl: HTMLElement | undefined;
  private issueChipEl: HTMLElement | undefined;
  private suggestedLabelEl: HTMLElement | undefined;
  private suggestionTextEl: HTMLElement | undefined;
  private diffEl: HTMLElement | undefined;
  private diffLabelEl: HTMLElement | undefined;
  private diffDelEl: HTMLElement | undefined;
  private diffInsEl: HTMLElement | undefined;
  private whyLabelEl: HTMLElement | undefined;
  private suggestionExplanationEl: HTMLElement | undefined;
  private explanationEl: HTMLElement | undefined;
  private glossaryTermsEl: HTMLElement | undefined;
  private glossaryTermsLabelEl: HTMLElement | undefined;
  private confidenceEl: HTMLElement | undefined;
  private applyBtn: HTMLButtonElement | undefined;
  private createReportBtn: HTMLButtonElement | undefined;
  private resultCloseBtn: HTMLButtonElement | undefined;
  private applyStatusEl: HTMLElement | undefined;
  private canApply = false;
  private currentValue: string | undefined;
  private applyBtnDefaultLabel = getStrings(undefined).aiPanel.applyButtonLabel;
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

  connectedCallback(): void {
    if (this.shadowRoot) {
      return;
    }
    const shadow = this.attachShadow({ mode: 'open' });
    const chips = INTENT_CHIPS.map(
      (chip) => `<button part="${chip.part}" type="button"></button>`,
    ).join('');
    // Apply button markup is the one exception rendered from a mount-time
    // snapshot below: its *visible* text is always refreshed by
    // setApplying(false) on the very next show() (reset() ->
    // clearApplyFeedback() calls it unconditionally), so a stale label here
    // never survives to be seen. Every other static string in this template
    // is blank here and filled in by applyStaticStrings() below, which also
    // runs again from show() whenever a real locale becomes known.
    const strings = getStrings(this.currentLocale).aiPanel;

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
        .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--t8-s2); }
        .chips button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          text-align: start;
          background: var(--t8-surface);
          color: var(--t8-ink);
          border: 1px solid var(--t8-line-2);
          border-radius: var(--t8-r-pill);
          padding: 6px 10px;
          font: inherit;
          font-size: 12px;
          font-weight: 550;
          cursor: pointer;
          transition: border-color var(--t8-out) var(--t8-ease), background var(--t8-out) var(--t8-ease);
        }
        .chips button:hover {
          border-color: var(--t8-accent);
          background: color-mix(in oklch, var(--t8-accent) 8%, transparent);
        }
        textarea[part="request"] {
          width: 100%;
          box-sizing: border-box;
          font-family: inherit;
          font-size: 13px;
          margin-bottom: var(--t8-s2);
          background: var(--t8-surface);
          color: var(--t8-ink);
          border: 1px solid var(--t8-line-2);
          border-radius: var(--t8-r-ctl);
          padding: var(--t8-s2) 10px;
          resize: vertical;
          field-sizing: content;
        }
        textarea[part="request"]:focus {
          outline: none;
          border-color: var(--t8-accent);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--t8-accent) 18%, transparent);
        }
        div[part="error"] { color: var(--t8-danger); margin-top: var(--t8-s2); }
        div[part="cancel-request-row"] { margin-top: var(--t8-s2); }
        .actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--t8-s2); margin-top: var(--t8-s2); }
        button[part="analyze"], button[part="apply"] {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--t8-accent);
          color: var(--t8-on-accent);
          border: none;
          border-radius: var(--t8-r-ctl);
          padding: 7px 11px;
          font: inherit;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        button[part="analyze"]:disabled, button[part="apply"]:disabled { opacity: 60%; cursor: default; }
        button[part="cancel"], button[part="cancel-request"],
        button[part="result-close"], button[part="create-report"] {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          color: var(--t8-ink);
          border: 1px solid var(--t8-line-2);
          border-radius: var(--t8-r-ctl);
          padding: 7px 11px;
          font: inherit;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        div[part="result"] { display: none; }
        div[part="confidence"] { font-size: 12px; color: var(--t8-muted); margin-top: var(--t8-s1); }
        div[part="apply-status"] { margin-top: var(--t8-s2); font-size: 12px; }
        div[part="apply-status"].success { color: var(--t8-ok); }
        div[part="apply-status"].error { color: var(--t8-danger); }
        div[part="conf-meter"] { display: flex; gap: 3px; margin-bottom: 6px; }
        div[part="conf-meter"] i { height: 4px; flex: 1; border-radius: 2px; background: color-mix(in oklch, var(--t8-muted) 22%, transparent); }
        div[part="conf-meter"][data-bucket="high"] i { background: var(--t8-ok); }
        div[part="conf-meter"][data-bucket="medium"] i:nth-child(-n+2) { background: var(--t8-warn); }
        div[part="conf-meter"][data-bucket="low"] i:nth-child(1) { background: var(--t8-danger); }
        div[part="conf-meter"][data-bucket="high"] ~ div[part="confidence"] { color: var(--t8-ok); font-weight: 650; }
        div[part="conf-meter"][data-bucket="medium"] ~ div[part="confidence"] { color: var(--t8-warn); font-weight: 650; }
        div[part="conf-meter"][data-bucket="low"] ~ div[part="confidence"] { color: var(--t8-danger); font-weight: 650; }
        .label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--t8-muted);
          margin: var(--t8-s3) 0 var(--t8-s1);
        }
        [part="issue-chip"] {
          display: none;
          align-items: center;
          float: inline-end;
          letter-spacing: 0;
          text-transform: none;
          font-size: 10px;
          padding: 3px 6px;
          border-radius: var(--t8-r-ctl);
        }
        [part="issue-chip"][data-severity="high"] { background: color-mix(in oklch, var(--t8-danger) 14%, transparent); color: var(--t8-danger); }
        [part="issue-chip"][data-severity="medium"] { background: color-mix(in oklch, var(--t8-warn) 14%, transparent); color: var(--t8-warn); }
        [part="issue-chip"][data-severity="low"] { background: color-mix(in oklch, var(--t8-muted) 14%, transparent); color: var(--t8-muted); }
        [part="suggestion-text"] {
          background: color-mix(in oklch, var(--t8-accent) 8%, transparent);
          border: 1px solid color-mix(in oklch, var(--t8-accent) 26%, transparent);
          border-radius: var(--t8-r-ctl);
          padding: 11px 12px;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
        }
        div[part="diff"] { display: flex; flex-direction: column; gap: 3px; }
        [part="diff-del"], [part="diff-ins"] {
          font-family: var(--t8-mono);
          font-size: 11.5px;
          padding: 3px var(--t8-s2);
          border-radius: var(--t8-r-ctl);
          line-height: 1.4;
        }
        [part="diff-del"] { background: color-mix(in oklch, var(--t8-danger) 12%, transparent); color: var(--t8-danger); text-decoration: line-through; }
        [part="diff-ins"] { background: color-mix(in oklch, var(--t8-ok) 12%, transparent); color: var(--t8-ok); }
        [part="suggestion-explanation"], [part="explanation"] { font-size: 12.5px; line-height: 1.55; color: var(--t8-muted); }
        [part="glossary-terms-label"] { display: none; }
        [part="glossary-terms"] { display: none; flex-wrap: wrap; gap: 6px; }
        [part="glossary-terms"] span {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: var(--t8-r-ctl);
          background: color-mix(in oklch, var(--t8-muted) 12%, transparent);
          color: var(--t8-ink);
        }
        button[part="apply"][data-prominence="ghost"] {
          background: transparent;
          color: var(--t8-ink);
          border: 1px solid var(--t8-line-2);
        }
      </style>
      <div part="panel" role="dialog" aria-modal="false" tabindex="-1">
        <div part="input-section">
          <div class="chips">${chips}</div>
          <textarea part="request" rows="2"></textarea>
          <div part="error"></div>
          <div part="cancel-request-row" style="display: none;">
            <button part="cancel-request" type="button"></button>
          </div>
          <div class="actions">
            <button part="cancel" type="button"></button>
            <button part="analyze" type="button"></button>
          </div>
        </div>
        <div part="result">
          <div part="conf-meter" data-bucket=""><i></i><i></i><i></i></div>
          <div part="confidence"></div>
          <div class="label"><span part="suggested-label"></span> <span part="issue-chip" data-severity=""></span></div>
          <div part="suggestion-text"></div>
          <div class="label" part="diff-label"></div>
          <div part="diff"><span part="diff-del"></span><span part="diff-ins"></span></div>
          <div class="label" part="why-label"></div>
          <div part="suggestion-explanation"></div>
          <div part="explanation"></div>
          <div class="label" part="glossary-terms-label"></div>
          <div part="glossary-terms"></div>
          <div part="apply-status"></div>
          <div class="actions">
            <button part="create-report" type="button" style="display: none;"></button>
            <button part="result-close" type="button"></button>
            <button part="apply" type="button" data-prominence="primary" style="display: none;">${icon('check')}${strings.applyButtonLabel}</button>
          </div>
        </div>
      </div>
    `);
    adoptTokens(shadow);

    this.panel = shadow.querySelector('div[part="panel"]') as HTMLElement;
    this.inputSection = shadow.querySelector('div[part="input-section"]') as HTMLElement;
    this.resultSection = shadow.querySelector('div[part="result"]') as HTMLElement;
    this.requestEl = shadow.querySelector('textarea[part="request"]') as HTMLTextAreaElement;
    this.analyzeBtn = shadow.querySelector('button[part="analyze"]') as HTMLButtonElement;
    this.cancelBtn = shadow.querySelector('button[part="cancel"]') as HTMLButtonElement;
    this.cancelRequestEl = shadow.querySelector('div[part="cancel-request-row"]') as HTMLElement;
    this.cancelRequestBtn = shadow.querySelector('button[part="cancel-request"]') as HTMLButtonElement;
    this.errorEl = shadow.querySelector('div[part="error"]') as HTMLElement;
    this.confMeterEl = shadow.querySelector('div[part="conf-meter"]') as HTMLElement;
    this.issueChipEl = shadow.querySelector('[part="issue-chip"]') as HTMLElement;
    this.suggestedLabelEl = shadow.querySelector('[part="suggested-label"]') as HTMLElement;
    this.suggestionTextEl = shadow.querySelector('div[part="suggestion-text"]') as HTMLElement;
    this.diffEl = shadow.querySelector('div[part="diff"]') as HTMLElement;
    this.diffLabelEl = shadow.querySelector('[part="diff-label"]') as HTMLElement;
    this.diffDelEl = shadow.querySelector('[part="diff-del"]') as HTMLElement;
    this.diffInsEl = shadow.querySelector('[part="diff-ins"]') as HTMLElement;
    this.whyLabelEl = shadow.querySelector('[part="why-label"]') as HTMLElement;
    this.suggestionExplanationEl = shadow.querySelector('div[part="suggestion-explanation"]') as HTMLElement;
    this.explanationEl = shadow.querySelector('div[part="explanation"]') as HTMLElement;
    this.glossaryTermsEl = shadow.querySelector('div[part="glossary-terms"]') as HTMLElement;
    this.glossaryTermsLabelEl = shadow.querySelector('[part="glossary-terms-label"]') as HTMLElement;
    this.confidenceEl = shadow.querySelector('div[part="confidence"]') as HTMLElement;
    this.applyBtn = shadow.querySelector('button[part="apply"]') as HTMLButtonElement;
    this.createReportBtn = shadow.querySelector(
      'button[part="create-report"]',
    ) as HTMLButtonElement;
    this.resultCloseBtn = shadow.querySelector('button[part="result-close"]') as HTMLButtonElement;
    this.applyStatusEl = shadow.querySelector('div[part="apply-status"]') as HTMLElement;
    this.applyStaticStrings();
    this.panel.style.display = 'none';

    for (const chip of INTENT_CHIPS) {
      shadow.querySelector(`button[part="${chip.part}"]`)!.addEventListener('click', () => {
        this.onSubmit?.(chip.fill);
      });
    }

    shadow.querySelector('button[part="cancel"]')!.addEventListener('click', () => {
      this.hide();
      this.onCancel?.();
    });

    shadow.querySelector('button[part="cancel-request"]')!.addEventListener('click', () => {
      this.onCancelRequest?.();
    });

    shadow.querySelector('button[part="result-close"]')!.addEventListener('click', () => {
      this.onCloseResult?.();
    });

    this.analyzeBtn.addEventListener('click', () => {
      const text = this.requestEl!.value.trim();
      if (!text) {
        return;
      }
      this.onSubmit?.(text);
    });

    this.applyBtn.addEventListener('click', () => {
      this.onApply?.();
    });

    this.createReportBtn.addEventListener('click', () => {
      this.onCreateReport?.();
    });
  }

  /**
   * Applies the panel's own static chrome text (dialog label, textarea
   * placeholder, chips, buttons, section labels) from `strings.ts`. Called
   * once from `connectedCallback()` — before any locale is known, so it
   * paints in English — and again from the top of `show()`, the first point
   * after mount where a real `locale` becomes available, so this chrome
   * actually updates once a second language table exists (today `getStrings`
   * always resolves to `EN`, so the second call is a no-op in practice, but
   * the refresh path exists and is exercised). Deliberately does not touch
   * the apply button's own rendered text directly: `show()` always runs
   * `reset()` -> `clearApplyFeedback()` -> `setApplying(false)` immediately
   * after this call on every open, and that reads `applyBtnDefaultLabel`,
   * which this method refreshes — so the visible label is never stale even
   * though it isn't written here.
   */
  private applyStaticStrings(): void {
    const strings = getStrings(this.currentLocale).aiPanel;
    this.panel?.setAttribute('aria-label', strings.dialogLabel);
    if (this.requestEl) this.requestEl.placeholder = strings.requestPlaceholder;
    for (const chip of INTENT_CHIPS) {
      const btn = this.shadowRoot?.querySelector(`button[part="${chip.part}"]`);
      if (btn) btn.textContent = strings.chips[chip.key];
    }
    if (this.cancelRequestBtn) this.cancelRequestBtn.textContent = strings.cancelRequest;
    if (this.cancelBtn) this.cancelBtn.textContent = strings.cancel;
    if (this.analyzeBtn) this.analyzeBtn.textContent = strings.analyze;
    if (this.suggestedLabelEl) this.suggestedLabelEl.textContent = strings.suggested;
    if (this.diffLabelEl) this.diffLabelEl.textContent = strings.diffLabel;
    if (this.whyLabelEl) this.whyLabelEl.textContent = strings.why;
    if (this.glossaryTermsLabelEl) this.glossaryTermsLabelEl.textContent = strings.glossaryTermsLabel;
    if (this.createReportBtn) {
      this.createReportBtn.innerHTML = createTrustedHtml(`${icon('flag')}${strings.createReport}`);
    }
    if (this.resultCloseBtn) {
      this.resultCloseBtn.innerHTML = createTrustedHtml(`${icon('back')}${strings.back}`);
    }
    this.applyBtnDefaultLabel = strings.applyButtonLabel;
  }

  /** Re-open the panel on the result view without clearing the last analysis. */
  showResultView(result: AiAnalysisResult): void {
    if (!this.panel) {
      return;
    }
    this.panel.style.display = 'block';
    this.panel.setAttribute('data-open', '');
    this.ensureFocus();
    if (this.inputSection) {
      this.inputSection.style.display = 'none';
    }
    if (this.resultSection) {
      this.resultSection.style.display = 'block';
    }
    this.showResult(result);
  }

  show(currentValue?: string, locale?: string): void {
    this.currentLocale = locale;
    this.applyStaticStrings();
    if (!this.panel) {
      return;
    }
    this.panel.style.display = 'block';
    this.panel.setAttribute('data-open', '');
    this.ensureFocus();
    this.reset();
    this.currentValue = currentValue;
  }

  hide(): void {
    this.releaseFocus?.();
    this.releaseFocus = undefined;
    if (this.panel) {
      this.panel.removeAttribute('data-open');
      this.panel.style.display = 'none';
    }
  }

  /**
   * Wires focus/Escape once per open, guarded so a later re-entry into an
   * already-open panel (show() -> showResult(), or a second show() before
   * hide()) doesn't re-capture the panel itself as the "opener" and break
   * focus restoration.
   */
  private ensureFocus(): void {
    if (this.releaseFocus || !this.panel) {
      return;
    }
    this.releaseFocus = trapPanelFocus(this.panel, () => this.dismiss());
  }

  setAnalyzing(analyzing: boolean): void {
    if (this.analyzeBtn) {
      this.analyzeBtn.disabled = analyzing;
    }
    if (this.cancelRequestEl) {
      this.cancelRequestEl.style.display = analyzing ? 'block' : 'none';
    }
  }

  setError(message: string): void {
    this.setAnalyzing(false);
    if (this.errorEl) {
      this.errorEl.textContent = message;
    }
  }

  showResult(result: AiAnalysisResult): void {
    this.setAnalyzing(false);
    this.clearApplyFeedback();
    if (this.inputSection) {
      this.inputSection.style.display = 'none';
    }
    if (this.resultSection) {
      this.resultSection.style.display = 'block';
    }
    if (this.suggestionTextEl) {
      this.suggestionTextEl.textContent = result.suggestion?.text ?? '';
    }
    if (this.suggestionExplanationEl) {
      this.suggestionExplanationEl.textContent = result.suggestion?.explanation ?? '';
    }
    if (this.explanationEl) {
      this.explanationEl.textContent = result.explanation ?? '';
    }
    if (this.confidenceEl) {
      // Never the raw score, only the bucket label.
      this.confidenceEl.textContent =
        getStrings(this.currentLocale).aiPanel.confidence[result.confidenceBucket];
    }
    if (this.confMeterEl) {
      this.confMeterEl.setAttribute('data-bucket', result.confidenceBucket);
    }
    if (this.issueChipEl) {
      this.issueChipEl.textContent = result.issue
        ? humanIssueLabel(result.issue.type, this.currentLocale)
        : '';
      this.issueChipEl.setAttribute('data-severity', result.issue?.severity ?? '');
      this.issueChipEl.style.display = result.issue ? 'inline-flex' : 'none';
    }
    this.renderGlossaryTerms(result.matchedTerms ?? []);
    this.renderDiff(result.suggestion?.text ?? '');
    if (this.applyBtn) {
      this.applyBtn.setAttribute(
        'data-prominence',
        result.confidenceBucket === 'low' ? 'ghost' : 'primary',
      );
    }
    this.updateApplyVisibility(Boolean(result.suggestion?.text));
    this.updateCreateReportVisibility(Boolean(result.issue));
  }

  /** Built with DOM APIs, not innerHTML — term text is tenant glossary
   * data, not a trusted literal, so it goes through textContent only. */
  private renderGlossaryTerms(terms: MatchedGlossaryTerm[]): void {
    if (!this.glossaryTermsEl || !this.glossaryTermsLabelEl) {
      return;
    }
    this.glossaryTermsEl.replaceChildren();
    for (const term of terms) {
      const chip = document.createElement('span');
      chip.textContent = term.doNotTranslate
        ? term.sourceTerm
        : term.targetTerm
          ? `${term.sourceTerm} → ${term.targetTerm}`
          : term.sourceTerm;
      this.glossaryTermsEl.appendChild(chip);
    }
    const display = terms.length > 0 ? 'flex' : 'none';
    this.glossaryTermsEl.style.display = display;
    this.glossaryTermsLabelEl.style.display = terms.length > 0 ? 'block' : 'none';
  }

  /**
   * Whole-string diff, deliberately not word-level: UI strings are short, and
   * a two-line before/after is what a reviewer needs to decide. Renders
   * nothing when the suggestion equals the current value, or when `show()`
   * was called with no argument — `undefined` means "no current value
   * known", not "the current value is empty", so an unset value must not be
   * diffed as a change (it would render a bogus empty deletion).
   */
  private renderDiff(suggestion: string): void {
    const changed =
      this.currentValue !== undefined &&
      Boolean(suggestion) &&
      suggestion !== this.currentValue;
    if (this.diffDelEl) {
      this.diffDelEl.textContent = changed ? this.currentValue! : '';
    }
    if (this.diffInsEl) {
      this.diffInsEl.textContent = changed ? suggestion : '';
    }
    if (this.diffEl) {
      this.diffEl.style.display = changed ? 'flex' : 'none';
    }
    if (this.diffLabelEl) {
      this.diffLabelEl.style.display = changed ? 'block' : 'none';
    }
  }

  setCanApply(canApply: boolean): void {
    this.canApply = canApply;
    this.updateApplyVisibility(this.hasSuggestionText());
  }

  setApplying(applying: boolean): void {
    if (!this.applyBtn) {
      return;
    }
    this.applyBtn.disabled = applying;
    // innerHTML, not textContent: textContent destroys the ${icon('check')}
    // <svg> the markup ships with, and show() -> reset() ->
    // clearApplyFeedback() -> setApplying(false) runs on every open, so the
    // icon vanished before the reviewer ever saw the button. Same shape as
    // the inspector's setApplying()/setProposing(); code-controlled
    // constants only.
    this.applyBtn.innerHTML = createTrustedHtml(
      applying
        ? `${icon('refresh')}${getStrings(this.currentLocale).aiPanel.applying}`
        : `${icon('check')}${this.applyBtnDefaultLabel}`,
    );
  }

  setApplySuccess(): void {
    this.setApplying(false);
    this.setApplyStatus(getStrings(this.currentLocale).aiPanel.applySuccess, 'success');
  }

  setApplyConflict(): void {
    this.setApplyStatus(getStrings(this.currentLocale).aiPanel.applyConflict, 'error');
  }

  setApplyPermissionDenied(): void {
    this.setApplyStatus(getStrings(this.currentLocale).aiPanel.applyPermissionDenied, 'error');
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

  private reset(): void {
    if (this.requestEl) {
      this.requestEl.value = '';
    }
    if (this.errorEl) {
      this.errorEl.textContent = '';
    }
    if (this.inputSection) {
      this.inputSection.style.display = 'block';
    }
    if (this.resultSection) {
      this.resultSection.style.display = 'none';
    }
    this.canApply = false;
    this.currentValue = undefined;
    this.clearApplyFeedback();
    this.updateApplyVisibility(false);
    this.updateCreateReportVisibility(false);
    this.setAnalyzing(false);
  }

  private updateCreateReportVisibility(hasIssue: boolean): void {
    if (!this.createReportBtn) {
      return;
    }
    this.createReportBtn.style.display = hasIssue ? 'inline-block' : 'none';
  }

  private hasSuggestionText(): boolean {
    return Boolean(this.suggestionTextEl?.textContent?.trim());
  }

  private updateApplyVisibility(hasSuggestion: boolean): void {
    if (!this.applyBtn) {
      return;
    }
    this.applyBtn.style.display =
      this.canApply && hasSuggestion ? 'inline-block' : 'none';
  }

  private setApplyStatus(message: string, tone: 'success' | 'error'): void {
    if (!this.applyStatusEl) {
      return;
    }
    this.applyStatusEl.textContent = message;
    this.applyStatusEl.classList.remove('success', 'error');
    this.applyStatusEl.classList.add(tone);
  }
}

customElements.define('transl8-ai-panel', Transl8AiPanel);
