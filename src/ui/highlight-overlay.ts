import { adoptTokens } from './tokens';
import { createTrustedHtml } from './trusted-types';

/**
 * Visual-only hover highlight. Positioned as a `fixed` box from a
 * caller-supplied `DOMRect` (viewport-relative, same origin as
 * `getBoundingClientRect()` and as CSS `position: fixed`) rather than
 * measuring the target itself — keeps this element a pure function of its
 * input, so it's testable in jsdom without a real layout engine.
 *
 * Never intercepts pointer events: an overlay sitting visually on top of the
 * host page must not block the app's own click handling underneath it.
 */
export class Transl8HighlightOverlay extends HTMLElement {
  private box: HTMLElement | undefined;

  connectedCallback(): void {
    if (this.shadowRoot) {
      return;
    }
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = createTrustedHtml(`
      <style>
        :host {
          all: initial;
        }
        div[part="box"] {
          position: fixed;
          box-sizing: border-box;
          border: 2px solid var(--t8-accent);
          background: color-mix(in oklch, var(--t8-accent) 8%, transparent);
          z-index: var(--t8-z);
        }
      </style>
      <div part="box"></div>
    `);
    this.box = shadow.querySelector('div[part="box"]') as HTMLElement;
    adoptTokens(shadow);
    // Set directly on the element (not via the stylesheet above) so these
    // are readable through `.style` without depending on jsdom's shadow-DOM
    // CSS cascade support: `display` toggles per show()/hide() call, and
    // `pointer-events` must never let this overlay swallow app clicks.
    this.box.style.display = 'none';
    this.box.style.pointerEvents = 'none';
  }

  show(rect: DOMRect): void {
    const box = this.box;
    if (!box) {
      return;
    }
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.style.display = 'block';
  }

  hide(): void {
    if (this.box) {
      this.box.style.display = 'none';
    }
  }
}

customElements.define('transl8-highlight-overlay', Transl8HighlightOverlay);
