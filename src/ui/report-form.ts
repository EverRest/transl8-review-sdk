import { trapPanelFocus } from './panel-a11y';
import { SDK_REVIEW_ISSUE_TYPES, type SdkReviewIssueType } from './report-issue-types';
import { adoptTokens } from './tokens';
import { createTrustedHtml } from './trusted-types';
import { getStrings } from './strings';

export interface ReportFormSubmission {
  type: SdkReviewIssueType;
  comment: string | undefined;
}

export class Transl8ReportForm extends HTMLElement {
  onSubmit: ((submission: ReportFormSubmission) => void) | undefined;
  onCancel: (() => void) | undefined;
  onClose: (() => void) | undefined;

  private panel: HTMLElement | undefined;
  private fieldsEl: HTMLElement | undefined;
  private successEl: HTMLElement | undefined;
  private successMessageEl: HTMLElement | undefined;
  private cancelBtn: HTMLButtonElement | undefined;
  private submitBtn: HTMLButtonElement | undefined;
  private successCloseBtn: HTMLButtonElement | undefined;
  private commentEl: HTMLTextAreaElement | undefined;
  private errorEl: HTMLElement | undefined;
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
    // Every static string below (including these radio labels) is left
    // blank in the markup and filled in by applyStaticStrings(), called once
    // at the end of this method — before any locale is known, so it paints
    // in English — and again from the top of show(), the first point after
    // mount where a real locale becomes available.
    const options = SDK_REVIEW_ISSUE_TYPES.map(
      (type) => `
        <label>
          <input type="radio" name="issue-type" value="${type}" />
          <span part="issue-type-label-${type}"></span>
        </label>
      `,
    ).join('');

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
        label {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: var(--t8-s1);
          padding: var(--t8-s2) 10px;
          border: 1px solid var(--t8-line-2);
          border-radius: var(--t8-r-ctl);
          cursor: pointer;
          transition: border-color var(--t8-out) var(--t8-ease);
        }
        label:hover { border-color: var(--t8-accent); }
        label:has(input:checked) {
          border-color: var(--t8-accent);
          background: color-mix(in oklch, var(--t8-accent) 8%, transparent);
          font-weight: 600;
        }
        textarea[part="comment"] {
          width: 100%;
          box-sizing: border-box;
          margin-top: var(--t8-s2);
          font-family: inherit;
          font-size: 13px;
          background: var(--t8-surface);
          color: var(--t8-ink);
          border: 1px solid var(--t8-line-2);
          border-radius: var(--t8-r-ctl);
          padding: var(--t8-s2) 10px;
          resize: vertical;
          field-sizing: content;
        }
        textarea[part="comment"]:focus {
          outline: none;
          border-color: var(--t8-accent);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--t8-accent) 18%, transparent);
        }
        div[part="error"] { color: var(--t8-danger); margin-top: var(--t8-s2); }
        .actions { margin-top: var(--t8-s3); display: flex; justify-content: flex-end; gap: var(--t8-s2); }
        button[part="submit"] {
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
        button[part="submit"]:disabled { opacity: 60%; cursor: default; }
        button[part="cancel"], button[part="success-close"] {
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
      </style>
      <div part="panel" role="dialog" aria-modal="false" tabindex="-1">
        <div part="fields">
          <div>${options}</div>
          <textarea part="comment" rows="3"></textarea>
          <div part="error"></div>
          <div class="actions">
            <button part="cancel" type="button"></button>
            <button part="submit" type="button"></button>
          </div>
        </div>
        <div part="success">
          <p part="success-message"></p>
          <div class="actions">
            <button part="success-close" type="button"></button>
          </div>
        </div>
      </div>
    `);
    adoptTokens(shadow);

    this.panel = shadow.querySelector('div[part="panel"]') as HTMLElement;
    this.fieldsEl = shadow.querySelector('div[part="fields"]') as HTMLElement;
    this.successEl = shadow.querySelector('div[part="success"]') as HTMLElement;
    this.successMessageEl = shadow.querySelector('[part="success-message"]') as HTMLElement;
    this.cancelBtn = shadow.querySelector('button[part="cancel"]') as HTMLButtonElement;
    this.submitBtn = shadow.querySelector('button[part="submit"]') as HTMLButtonElement;
    this.successCloseBtn = shadow.querySelector('button[part="success-close"]') as HTMLButtonElement;
    this.commentEl = shadow.querySelector('textarea[part="comment"]') as HTMLTextAreaElement;
    this.errorEl = shadow.querySelector('div[part="error"]') as HTMLElement;
    this.applyStaticStrings();
    this.panel.style.display = 'none';
    this.successEl.style.display = 'none';

    shadow.querySelector('button[part="cancel"]')!.addEventListener('click', () => {
      this.hide();
      this.onCancel?.();
    });
    shadow.querySelector('button[part="success-close"]')!.addEventListener('click', () => {
      this.hide();
      this.onClose?.();
    });

    this.submitBtn.addEventListener('click', () => {
      const checked = shadow.querySelector(
        'input[name="issue-type"]:checked',
      ) as HTMLInputElement | null;
      if (!checked) {
        return;
      }
      this.onSubmit?.({
        type: checked.value as SdkReviewIssueType,
        comment: this.commentEl!.value || undefined,
      });
    });
  }

  /** Pre-select issue type and comment after show() reset (report from AI). */
  prefill(submission: ReportFormSubmission): void {
    const shadow = this.shadowRoot!;
    const radio = shadow.querySelector(
      `input[name="issue-type"][value="${CSS.escape(submission.type)}"]`,
    ) as HTMLInputElement | null;
    if (radio) {
      radio.checked = true;
    }
    if (this.commentEl) {
      this.commentEl.value = submission.comment ?? '';
    }
  }

  /**
   * Applies the form's own static chrome text (dialog label, comment
   * placeholder, issue-type radio labels, buttons, success copy) from
   * `strings.ts`. Called once from `connectedCallback()` — before any
   * locale is known, so it paints in English — and again from the top of
   * `show()`, the first point after mount where a real `locale` becomes
   * available, so this chrome actually updates once a second language table
   * exists (today `getStrings` always resolves to `EN`, so the second call
   * is a no-op in practice, but the refresh path exists and is exercised).
   */
  private applyStaticStrings(): void {
    const strings = getStrings(this.currentLocale).reportForm;
    this.panel?.setAttribute('aria-label', strings.dialogLabel);
    if (this.commentEl) this.commentEl.placeholder = strings.commentPlaceholder;
    for (const type of SDK_REVIEW_ISSUE_TYPES) {
      const label = this.shadowRoot?.querySelector(`[part="issue-type-label-${type}"]`);
      if (label) label.textContent = strings.issueTypes[type];
    }
    if (this.cancelBtn) this.cancelBtn.textContent = strings.cancel;
    if (this.submitBtn) this.submitBtn.textContent = strings.submit;
    if (this.successMessageEl) this.successMessageEl.textContent = strings.successMessage;
    if (this.successCloseBtn) this.successCloseBtn.textContent = strings.close;
  }

  /** Resets to a clean state every time — the previous report's type/comment/error must not leak into the next. */
  show(locale?: string): void {
    this.currentLocale = locale;
    this.applyStaticStrings();
    if (!this.panel) {
      return;
    }
    this.panel.style.display = 'block';
    this.panel.setAttribute('data-open', '');
    this.ensureFocus();
    this.reset();
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
   * Wires focus/Escape once per open, guarded so calling show() twice
   * without an intervening hide() doesn't re-capture the panel itself as
   * the "opener" and break focus restoration.
   */
  private ensureFocus(): void {
    if (this.releaseFocus || !this.panel) {
      return;
    }
    this.releaseFocus = trapPanelFocus(this.panel, () => this.dismiss());
  }

  setSubmitting(submitting: boolean): void {
    if (this.submitBtn) {
      this.submitBtn.disabled = submitting;
    }
  }

  setError(message: string): void {
    this.setSubmitting(false);
    if (this.errorEl) {
      this.errorEl.textContent = message;
    }
  }

  /** Swaps the form fields for a brief confirmation — the report.created -> report-submitted UI state. */
  showSuccess(): void {
    if (this.fieldsEl) {
      this.fieldsEl.style.display = 'none';
    }
    if (this.successEl) {
      this.successEl.style.display = 'block';
    }
  }

  private reset(): void {
    const shadow = this.shadowRoot!;
    shadow.querySelectorAll('input[name="issue-type"]').forEach((el) => {
      (el as HTMLInputElement).checked = false;
    });
    if (this.commentEl) {
      this.commentEl.value = '';
    }
    if (this.errorEl) {
      this.errorEl.textContent = '';
    }
    if (this.fieldsEl) {
      this.fieldsEl.style.display = 'block';
    }
    if (this.successEl) {
      this.successEl.style.display = 'none';
    }
    this.setSubmitting(false);
  }
}

customElements.define('transl8-report-form', Transl8ReportForm);
