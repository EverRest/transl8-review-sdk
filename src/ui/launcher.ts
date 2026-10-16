import type { ReviewSDKState, ReviewSdkStateMachine } from '../state/review-sdk-state-machine';
import type { ActionEngine } from '../actions/action';
import { adoptTokens, icon } from './tokens';
import { createTrustedHtml } from './trusted-types';
import { getStrings } from './strings';

export class Transl8Launcher extends HTMLElement {
  private stateMachine: ReviewSdkStateMachine | undefined;
  private actionEngine: ActionEngine | undefined;
  private permissions: readonly string[] = [];
  private unsubscribe: (() => void) | undefined;
  private keydownHandler: ((event: KeyboardEvent) => void) | undefined;
  private keyCount: number | undefined;
  private locale: string | undefined;
  private buttonEl: HTMLButtonElement | undefined;

  configure(
    stateMachine: ReviewSdkStateMachine,
    actionEngine: ActionEngine,
    permissions: readonly string[],
  ): void {
    this.stateMachine = stateMachine;
    this.actionEngine = actionEngine;
    this.permissions = permissions;
  }

  connectedCallback(): void {
    if (!this.stateMachine || !this.actionEngine) {
      throw new Error(
        'transl8-launcher: configure() must be called before insertion into the document',
      );
    }

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = createTrustedHtml(`
      <style>
        :host {
          all: initial;
          position: fixed;
          inset-block-end: 20px;
          inset-inline-end: 20px;
          z-index: var(--t8-z);
          font-family: var(--t8-font);
        }
        button[part="button"] {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          padding: 4px;
          padding-inline-end: 14px;
          border-radius: var(--t8-r-pill);
          border: 1px solid var(--t8-line-2);
          background: var(--t8-surface);
          color: var(--t8-ink);
          box-shadow: var(--t8-shadow);
          cursor: pointer;
          font: inherit;
          transition: border-color var(--t8-out) var(--t8-ease);
        }
        span[part="dot"] {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: var(--t8-r-pill);
          background: color-mix(in oklch, var(--t8-muted) 16%, transparent);
          color: var(--t8-muted);
        }
        span[part="dot"] .t8-i { width: 19px; height: 19px; }
        span[part="label"] {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.15;
          font-size: 11.5px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        span[part="label"] small { font-size: 10px; font-weight: 400; color: var(--t8-muted); }
        :host([data-active="true"]) span[part="dot"] {
          background: var(--t8-accent);
          color: var(--t8-on-accent);
        }
        :host([data-active="true"]) button[part="button"] { border-color: var(--t8-accent); }
      </style>
      <button part="button" aria-label="Translation" aria-pressed="false"
              title="Review mode (Ctrl+Shift+T)">
        <span part="dot">${icon('globe')}</span>
        <span part="label"><b part="count">Review</b><small>Ctrl+Shift+T</small></span>
      </button>
    `);
    adoptTokens(shadow);

    const button = shadow.querySelector('button[part="button"]') as HTMLButtonElement;
    this.buttonEl = button;

    button.addEventListener('click', () => this.dispatchToggle());

    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toUpperCase() === 'T') {
        event.preventDefault();
        this.dispatchToggle();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);

    const applyState = (state: ReviewSDKState) => {
      const pressed = state !== 'idle';
      button.setAttribute('aria-pressed', String(pressed));
      this.setAttribute('data-active', String(pressed));
      if (!pressed) {
        this.keyCount = undefined;
      }
      this.renderLabel();
    };
    this.unsubscribe = this.stateMachine.subscribe((state) => applyState(state));
    applyState(this.stateMachine.state);
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = undefined;
    }
  }

  setKeyCount(count: number): void {
    this.keyCount = count;
    this.renderLabel();
  }

  setLocale(locale: string): void {
    this.locale = locale;
    this.renderLabel();
  }

  private renderLabel(): void {
    const count = this.shadowRoot?.querySelector('[part="count"]');
    if (!count) {
      return;
    }
    const strings = getStrings(this.locale).launcher;
    count.textContent =
      this.keyCount !== undefined ? strings.keysLabel(this.keyCount) : strings.reviewLabel;
    if (this.buttonEl) {
      this.buttonEl.setAttribute('aria-label', strings.ariaLabel);
      this.buttonEl.title = strings.title;
    }
  }

  private dispatchToggle(): void {
    const type = this.stateMachine!.state === 'idle' ? 'review.enable' : 'review.disable';
    this.actionEngine!.dispatch(type, {
      permissions: this.permissions,
      stateMachine: this.stateMachine!,
    });
  }
}

customElements.define('transl8-launcher', Transl8Launcher);
