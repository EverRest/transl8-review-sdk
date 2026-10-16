import { adoptTokens, icon } from './tokens';
import { createTrustedHtml } from './trusted-types';
import { getStrings } from './strings';

export interface ReviewModeBadgeItem {
  rect: DOMRect;
  onClick: () => void;
}

/**
 * Persistent per-element affordance for review mode: a
 * dashed frame plus one always-present `button[part="badge"]` per
 * translatable element currently on screen. The button IS the resting
 * indicator (rendered small, ~16px, showing only a 7px dot via `::before`)
 * and the click target — there is no separate non-interactive dot element.
 *
 * That's a fix-round correction, not the original design: an earlier
 * version split the dot and the badge into two elements inside a wrapping
 * `part="pair"` div and tried to resolve the badge on `pair:hover`. That
 * doesn't work in a real browser — a `position: fixed` child contributes no
 * layout box to its `position: static` parent, so the wrapper collapses to
 * nothing and never receives the hover in the first place, and a
 * `display: none` badge can never receive focus, so keyboard users could
 * never reach it either. Verified dead in Chromium via
 * `elementFromPoint()` before this rewrite (see task-7 report).
 *
 * A single real element sidesteps both problems: it always has a genuine
 * box, so hovering/focusing it is real hit-testing, and it never leaves the
 * DOM or the tab order. Expanding it into the labelled pill (icon + "Edit")
 * on its own `:hover`/`:focus-visible` keeps the resting state small (one
 * element loud at a time on a dense page) while keeping the *reachable* hit
 * target close to the visible ~7px dot but not literally 7px — a target
 * that small is unreliable to hit with a real pointer, so it's ~16px
 * square instead. The frame goes solid via a sibling selector
 * (`button:hover ~ div[part="frame"]`) rather than a `pair` wrapper: the
 * badge is rendered directly before its frame as a DOM sibling in the same
 * `container`, so this needs no wrapper element and no JS-managed hover
 * state.
 *
 * A pure function of the rects/callbacks handed to it via render() — same
 * "positioned from a caller-supplied DOMRect, not by measuring the target
 * itself" shape as `highlight-overlay.ts`, so it's testable in jsdom
 * without a real layout engine (jsdom applies no CSS, so the hover/focus
 * behavior itself has to be verified in a real browser, not here).
 *
 * The frame never intercepts pointer events (it must not block the host
 * page's own click handling underneath it); the badge button does, since
 * clicking it is the *only* way to open the inspector — see
 * ReviewModeElementTracker. Its footprint stays a small corner target
 * rather than the whole element specifically so it doesn't swallow host
 * clicks across the element's full area.
 */
export class Transl8ReviewModeBadges extends HTMLElement {
  private container: HTMLElement | undefined;

  connectedCallback(): void {
    if (this.shadowRoot) {
      return;
    }
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = createTrustedHtml(`
      <style>
        :host { all: initial; }
        div[part="frame"] {
          position: fixed;
          box-sizing: border-box;
          border: 1px dashed color-mix(in oklch, var(--t8-accent) 45%, transparent);
          background: color-mix(in oklch, var(--t8-accent) 5%, transparent);
          border-radius: 3px;
          pointer-events: none;
          z-index: var(--t8-z);
        }
        button[part="badge"] {
          position: fixed;
          /* translate(-50%, -50%), not (50%, -50%): the badge's own width
             changes on :hover/:focus-visible (16px circle -> auto-width
             pill). A symmetric center-on-point transform keeps its visual
             center pinned to (rect.right, rect.top) regardless of that
             width, so growing doesn't shift the box out from under the
             pointer mid-hover — verified in a real browser that an
             asymmetric transform here makes :hover self-cancel the instant
             it starts to grow (see task-7 fix-round-2 report). */
          transform: translate(-50%, -50%);
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 16px;
          height: 16px;
          padding: 0;
          border: none;
          border-radius: var(--t8-r-pill);
          background: transparent;
          color: var(--t8-on-accent);
          font-family: var(--t8-font);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: .04em;
          cursor: pointer;
          pointer-events: auto;
          z-index: calc(var(--t8-z) + 1);
        }
        button[part="badge"]::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: var(--t8-r-pill);
          background: var(--t8-accent);
          opacity: .5;
        }
        button[part="badge"] .t8-i { width: 12px; height: 12px; }
        button[part="badge"] .t8-i,
        button[part="badge"] [part="label"] {
          display: none;
        }
        /* One element is loud at a time: the badge is the only affordance —
           a small always-present hit target at rest, expanding to the
           labelled pill on its own hover/focus — so a 129-row table stays
           readable in review mode. */
        button[part="badge"]:hover,
        button[part="badge"]:focus-visible {
          width: auto;
          height: 22px;
          padding: 0;
          padding-inline: 6px 8px;
          background: var(--t8-accent);
        }
        button[part="badge"]:hover::before,
        button[part="badge"]:focus-visible::before {
          content: none;
        }
        button[part="badge"]:hover .t8-i,
        button[part="badge"]:hover [part="label"],
        button[part="badge"]:focus-visible .t8-i,
        button[part="badge"]:focus-visible [part="label"] {
          display: inline-flex;
        }
        /* Sibling selector, not a wrapper: the frame is rendered
           immediately after its badge in the DOM (see render()), so
           hovering/focusing the badge can select it directly. */
        button[part="badge"]:hover ~ div[part="frame"],
        button[part="badge"]:focus-visible ~ div[part="frame"] {
          border-style: solid;
          border-color: var(--t8-accent);
          background: color-mix(in oklch, var(--t8-accent) 11%, transparent);
        }
      </style>
      <div part="container"></div>
    `);
    this.container = shadow.querySelector('[part="container"]') as HTMLElement;
    adoptTokens(shadow);
  }

  render(items: readonly ReviewModeBadgeItem[], locale?: string): void {
    const container = this.container;
    if (!container) {
      return;
    }
    container.replaceChildren();
    const strings = getStrings(locale).reviewModeBadges;

    for (const item of items) {
      // Badge before frame: `button:hover ~ div[part="frame"]` below
      // depends on this order.
      const badge = document.createElement('button');
      badge.setAttribute('part', 'badge');
      badge.setAttribute('type', 'button');
      badge.setAttribute('aria-label', strings.openTranslation);
      badge.style.left = `${item.rect.right}px`;
      badge.style.top = `${item.rect.top}px`;
      badge.style.pointerEvents = 'auto';
      badge.innerHTML = createTrustedHtml(
        `${icon('globe')}<span part="label">${strings.editLabel}</span>`,
      );
      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Make the badge the opener the panel will return focus to. A click
        // focuses a <button> in Chromium but not in Safari/Firefox (and
        // never under a synthetic click), so without this the panel's
        // `trapPanelFocus` captures whatever happened to be focused before
        // — usually <body> — and Escape strands the keyboard user at the
        // top of the host page instead of back on the badge they opened.
        badge.focus({ preventScroll: true });
        item.onClick();
      });
      container.appendChild(badge);

      const frame = document.createElement('div');
      frame.setAttribute('part', 'frame');
      frame.style.left = `${item.rect.left}px`;
      frame.style.top = `${item.rect.top}px`;
      frame.style.width = `${item.rect.width}px`;
      frame.style.height = `${item.rect.height}px`;
      frame.style.pointerEvents = 'none';
      container.appendChild(frame);
    }
  }

  clear(): void {
    this.container?.replaceChildren();
  }

  /**
   * Focuses the Nth rendered badge button, in `render()`'s own item order.
   * Used by `ReviewModeElementTracker.select()` to restore focus onto the
   * just-clicked badge after a state-machine resync tears down and rebuilds
   * every badge underneath it (`clear()` then a fresh `render()`) — without
   * this the reviewer's click focus is silently dropped, and
   * `trapPanelFocus` captures whatever's left (usually `<body>`) as the
   * panel's "opener", stranding a keyboard user there on Escape instead of
   * back on the badge they opened.
   */
  focusBadgeAt(index: number): void {
    this.container?.querySelectorAll<HTMLButtonElement>('[part="badge"]')[index]?.focus({
      preventScroll: true,
    });
  }
}

customElements.define('transl8-review-mode-badges', Transl8ReviewModeBadges);
