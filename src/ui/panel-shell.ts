import { adoptTokens, icon } from './tokens';
import { createTrustedHtml } from './trusted-types';
import { getStrings } from './strings';

export type PanelView = 'translation' | 'ai' | 'report';

/**
 * What the header's dismiss control does in the current state, which is also
 * what it must be called.
 *
 * - `'close'` — it really closes. Shown, enabled, labelled Close.
 * - `'back'`  — the state's only exit is a return to the previous view, which
 *   the header's own Back arrow and the body's Cancel already offer. Rather
 *   than a second identical control, or a Close that is really a Back, it is
 *   not offered at all.
 * - `'none'`  — no exit edge exists (an in-flight apply/propose/analyse/
 *   submit). Shown but unavailable, rather than clickable and inert.
 */
export type PanelDismissAction = 'close' | 'back' | 'none';

export interface PanelContext {
  key: string;
  locale: string;
  version: number;
}

/**
 * The one frame every panel renders inside.
 *
 * Before this element, `Transl8InspectorPanel`, `Transl8AiPanel` and
 * `Transl8ReportForm` each owned a `position: fixed` frame of their own, so
 * `inspector.hide(); aiPanel.show();` tore the whole surface down and built
 * a different one — taking the translation key and the source string off
 * screen at exactly the moment the reviewer is composing a question about
 * them. Here the frame, the title and the key row outlive the view change:
 * only the slotted body swaps.
 *
 * Deliberately NOT the owner of focus or Escape. Each panel keeps its own
 * `[part="panel"]` body element with `role="dialog"`, its own
 * `trapPanelFocus()` and its own per-view `dismiss` indirection — a panel's
 * valid exit differs by view ('ai-result' accepts only `ai.close`,
 * 'report-submitted' only `inspector.close`) and that mapping is already
 * correct where it lives. Hoisting it here would mean pushing each view's
 * dismiss back up into the shell to reproduce identical behaviour.
 *
 * Also deliberately not the owner of `currentInfo`/`currentLookup` — those
 * stay closure state in `mountLauncher`.
 */
export class Transl8PanelShell extends HTMLElement {
  onBack: (() => void) | undefined;
  onClose: (() => void) | undefined;

  private frame: HTMLElement | undefined;
  private titleEl: HTMLElement | undefined;
  private backBtn: HTMLButtonElement | undefined;
  private contextRow: HTMLElement | undefined;
  private keyEl: HTMLElement | undefined;
  private chipLocaleEl: HTMLElement | undefined;
  private chipVersionEl: HTMLElement | undefined;
  private closeBtn: HTMLButtonElement | undefined;
  private keyCopyBtn: HTMLButtonElement | undefined;
  private usingPopover = false;
  private currentLocale: string | undefined;
  private currentView: PanelView | undefined;

  connectedCallback(): void {
    if (this.shadowRoot) {
      return;
    }
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = createTrustedHtml(`
      <style>
        :host { all: initial; }
        div[part="panel"] {
          display: none;
          position: fixed;
          margin: 0;
          inset-block-start: var(--t8-s5);
          inset-inline-end: var(--t8-s5);
          /*
           * The UA popover stylesheet sets inset: 0 (all four sides) plus
           * width/height: fit-content and margin: auto, its own trick for
           * centering a popover with no author layout opinion. We override
           * width with a definite length above, which turns the classic
           * CSS2.1 abspos over-constraint rule against us: with
           * inset-inline-start (left, from the UA's inset: 0) AND
           * inset-inline-end AND width all definite, the spec says the
           * *end* inset is the one ignored in LTR, and the box resolves
           * from start+width instead - flush left, not top-right. Verified
           * in Chromium: the popover-mode panel measured at x:0 with this
           * line absent, versus the correct x matching the fallback path
           * with it present. Setting the start side back to auto removes
           * the third definite value and restores our intended anchor.
           */
          inset-inline-start: auto;
          z-index: var(--t8-z);
          width: min(352px, calc(100vw - 32px));
          max-height: calc(100vh - 36px);
          overflow-y: auto;
          container-type: inline-size;
          background: var(--t8-surface);
          color: var(--t8-ink);
          border: 1px solid var(--t8-line);
          border-radius: var(--t8-r-panel);
          box-shadow: var(--t8-shadow);
          font-family: var(--t8-font);
          font-size: 13px;
          padding: var(--t8-s4);
          box-sizing: border-box;
        }
        /*
         * A popover is hidden by the UA hiding the top-layer entry, not by
         * this stylesheet, so the base rule's display:none above never gets
         * a chance to apply the block this needs while shown. :popover-open
         * only matches on the Popover-API path (the fallback path never gets
         * the popover attribute, so it never matches this rule) - the
         * feature-detected JS path in open()/close() stays in charge of
         * which one applies.
         *
         * margin: 0 on the base rule above overrides the UA popover
         * stylesheet's margin: auto, which otherwise centers a
         * fixed-position box between two opposing insets (both
         * inset-block-start/inset-inline-end are set here, leaving the
         * other two at the UA's inset: 0) instead of anchoring it top-right.
         * Verified against Chromium: without this the popover-mode panel
         * drifted to viewport centre while the display-fallback panel
         * stayed put.
         */
        div[part="panel"]:popover-open {
          display: block;
        }
        header[part="header"] {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: var(--t8-s3);
        }
        h2[part="title"] {
          flex: 1;
          /* min-width:0 because a flex item's default min-width:auto refuses
             to shrink below its content, which wrapped "Report translation
             issue" onto a second line at a 360px viewport and grew the
             header from 26px to 36px. Measured in Chromium, not guessed. */
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 15px;
          font-weight: 650;
          margin: 0;
          letter-spacing: -.01em;
          color: var(--t8-ink);
        }
        button[part="back"], button[part="close"], button[part="key-copy"] {
          border: none;
          background: transparent;
          color: var(--t8-muted);
          cursor: pointer;
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          border-radius: var(--t8-r-ctl);
          flex: none;
          transition: background var(--t8-out) var(--t8-ease), color var(--t8-out) var(--t8-ease);
        }
        button[part="back"]:hover, button[part="close"]:hover:not(:disabled),
        button[part="key-copy"]:hover {
          color: var(--t8-ink);
          background: color-mix(in oklch, var(--t8-muted) 14%, transparent);
        }
        button[part="close"]:disabled {
          opacity: 40%;
          cursor: default;
        }
        button[part="back"] { order: -1; }
        [part="chip-locale"], [part="chip-version"] {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
          padding: 3px 6px;
          border-radius: var(--t8-r-ctl);
          background: color-mix(in oklch, var(--t8-muted) 12%, transparent);
          color: var(--t8-muted);
          font-variant-numeric: tabular-nums;
          flex: none;
        }
        div[part="context"] {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: var(--t8-s3);
          padding-bottom: var(--t8-s3);
          border-bottom: 1px solid var(--t8-line);
        }
        [part="key"] {
          flex: 1;
          font-family: var(--t8-mono);
          font-size: 11.5px;
          color: var(--t8-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      </style>
      <div part="panel">
        <header part="header">
          <button part="back" type="button">${icon('back')}</button>
          <h2 part="title"></h2>
          <span part="chip-locale"></span>
          <span part="chip-version"></span>
          <button part="close" type="button">${icon('close')}</button>
        </header>
        <div part="context">
          <span part="key"></span>
          <button part="key-copy" type="button">${icon('copy')}</button>
        </div>
        <slot name="body"></slot>
      </div>
    `);
    adoptTokens(shadow);

    this.frame = shadow.querySelector('div[part="panel"]') as HTMLElement;
    this.titleEl = shadow.querySelector('h2[part="title"]') as HTMLElement;
    this.backBtn = shadow.querySelector('button[part="back"]') as HTMLButtonElement;
    this.contextRow = shadow.querySelector('div[part="context"]') as HTMLElement;
    this.keyEl = shadow.querySelector('[part="key"]') as HTMLElement;
    this.chipLocaleEl = shadow.querySelector('[part="chip-locale"]') as HTMLElement;
    this.chipVersionEl = shadow.querySelector('[part="chip-version"]') as HTMLElement;
    this.closeBtn = shadow.querySelector('button[part="close"]') as HTMLButtonElement;
    this.keyCopyBtn = shadow.querySelector('button[part="key-copy"]') as HTMLButtonElement;
    this.applyStaticStrings();
    this.frame.style.display = 'none';
    this.backBtn.style.visibility = 'hidden';
    this.contextRow.style.display = 'none';

    this.backBtn.addEventListener('click', () => this.onBack?.());
    this.closeBtn.addEventListener('click', () => this.onClose?.());
    this.keyCopyBtn.addEventListener('click', () => {
      // writeText() rejects under an insecure context or a denied clipboard
      // permission — swallow rather than throw an unhandled rejection into
      // the host page. Copying the key is a convenience, not worth an error
      // state on the panel.
      navigator.clipboard?.writeText(this.keyEl?.textContent ?? '').catch((error: unknown) => {
        console.error('[review-sdk] clipboard write failed', error);
      });
    });
  }

  /**
   * Applies the shell's own chrome text (Back/Close/Copy-key labels, and the
   * title for whichever view is currently active) from `strings.ts`. Called
   * once from `connectedCallback()` — before any locale is known, so it
   * paints in English — and again from `setContext()`, the first point after
   * mount where a real `locale` becomes available, so the static chrome
   * actually updates once a second language table exists (today `getStrings`
   * always resolves to `EN`, so this call is a no-op in practice, but the
   * refresh path exists and is exercised).
   */
  private applyStaticStrings(): void {
    const strings = getStrings(this.currentLocale).panel;
    this.backBtn?.setAttribute('aria-label', strings.back);
    if (this.titleEl) {
      this.titleEl.textContent = strings.titles[this.currentView ?? 'translation'];
    }
    this.closeBtn?.setAttribute('aria-label', strings.close);
    this.keyCopyBtn?.setAttribute('aria-label', strings.keyCopy);
  }

  /**
   * Syncs the shell's own chrome (title, Back/Close/Copy-key labels) to
   * `locale` without touching the context row — the mount-time /
   * `sdk.onLocaleChange` sync point `mountLauncher` (sdk-client.ts) calls
   * alongside `Transl8Launcher.setLocale`/`ReviewModeElementTracker.setLocale`,
   * so the shell's chrome reflects the real locale before any lookup ever
   * resolves through `setContext()` below.
   */
  setLocale(locale: string): void {
    this.currentLocale = locale;
    this.applyStaticStrings();
  }

  /**
   * The persistent key row. Renders `lookup.key` and the backend-reported
   * locale/version — never anything read back out of the host page's DOM.
   * `undefined` clears it (no key resolved yet, or an unkeyed element).
   */
  setContext(context: PanelContext | undefined): void {
    if (context) {
      this.currentLocale = context.locale;
      this.applyStaticStrings();
    }
    if (!this.contextRow) {
      return;
    }
    this.contextRow.style.display = context ? 'flex' : 'none';
    if (this.keyEl) {
      this.keyEl.textContent = context?.key ?? '';
    }
    if (this.chipLocaleEl) {
      this.chipLocaleEl.textContent = context ? context.locale.toUpperCase() : '';
    }
    if (this.chipVersionEl) {
      this.chipVersionEl.textContent = context ? `v${context.version}` : '';
    }
  }

  /**
   * Points the dismiss control at `action`, setting its accessible name, its
   * glyph and its availability together. Label and behaviour are derived from
   * this one value by both sides, so the button cannot come to say "Close"
   * while doing something else.
   */
  setDismissAction(action: PanelDismissAction): void {
    if (!this.closeBtn) {
      return;
    }
    this.closeBtn.setAttribute('aria-label', getStrings(this.currentLocale).panel.close);
    this.closeBtn.innerHTML = createTrustedHtml(icon('close'));
    // visibility, not display: hiding the control with `display: none` frees
    // its 26px + gap, which the flex:1 title absorbs and which slides the
    // chips 33px right on every switch to and from a 'back' view. Measured
    // in Chromium, not assumed. `visibility: hidden` keeps the box, so the
    // header holds still, while still removing the control from hit-testing,
    // the accessibility tree and the tab order.
    this.closeBtn.style.visibility = action === 'back' ? 'hidden' : 'visible';
    // Disabled whenever it is not actionable — belt and braces alongside
    // `visibility` for the hidden case, and the sole mechanism for 'none'.
    this.closeBtn.disabled = action !== 'close';
  }

  /** Swaps the header for `view` and opens the shell if it is not already open. */
  setView(view: PanelView): void {
    this.currentView = view;
    if (this.titleEl) {
      this.titleEl.textContent = getStrings(this.currentLocale).panel.titles[view];
    }
    if (this.backBtn) {
      // 'translation' is the root of the flow: there is nothing behind it.
      // visibility rather than display, for the same reason as the dismiss
      // control: `display: none` frees the 26px + gap, the flex:1 title
      // absorbs it, and the title's start slides 33px on every switch into
      // and out of a sub-view. Measured in Chromium. The header holds still
      // at the cost of an always-reserved slot at its start.
      this.backBtn.style.visibility = view === 'translation' ? 'hidden' : 'visible';
      this.backBtn.disabled = view === 'translation';
    }
    this.open();
  }

  /**
   * The top layer sits above every stacking context by definition, which
   * `z-index: var(--t8-z)` — a number picked to beat whatever the host page
   * does — does not: a host that picked 2147483647 still wins. `manual`
   * rather than `auto`: `auto` light-dismisses on any outside click, and the
   * inspector must survive the user clicking around the host page it is
   * describing. Escape is already wired by `trapPanelFocus` on the slotted
   * panel body either way.
   *
   * jsdom implements no Popover API at all (`popover` absent, `showPopover`
   * undefined), so this is feature-detected rather than assumed — the
   * `display`-based fallback stays the path the test suite exercises, and is
   * also what every engine without the API falls back to for real.
   */
  private supportsPopover(): boolean {
    return Boolean(this.frame) && 'popover' in this.frame!;
  }

  open(): void {
    if (!this.frame) {
      return;
    }
    // display/popover-visibility and data-open are set together on every
    // path: tokens.ts puts the closed-state opacity/translate on the bare
    // [part="panel"] selector, so a frame shown without the attribute
    // renders invisible.
    if (this.supportsPopover()) {
      // connectedCallback set style.display = 'none' inline to hide the
      // panel before its first open. Inline style outranks any selector's
      // specificity, so left in place it would permanently shadow the
      // stylesheet's div[part="panel"]:popover-open { display: block; }
      // rule and the panel would never actually paint once promoted to the
      // top layer. Clearing it hands display back to the stylesheet, same
      // as the fallback path hands it to the JS-set inline value.
      this.frame.style.display = '';
      this.frame.setAttribute('popover', 'manual');
      (this.frame as HTMLElement & { showPopover(): void }).showPopover();
      this.usingPopover = true;
    } else {
      this.frame.style.display = 'block';
      this.usingPopover = false;
    }
    this.frame.setAttribute('data-open', '');
  }

  close(): void {
    if (!this.frame) {
      return;
    }
    this.frame.removeAttribute('data-open');
    if (this.usingPopover) {
      (this.frame as HTMLElement & { hidePopover(): void }).hidePopover();
      this.usingPopover = false;
    } else {
      this.frame.style.display = 'none';
    }
  }
}

customElements.define('transl8-panel-shell', Transl8PanelShell);
