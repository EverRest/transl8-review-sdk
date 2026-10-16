/**
 * The SDK's single source of visual truth.
 *
 * One constructed stylesheet, adopted by every Shadow root, so a colour or
 * radius exists in exactly one place. Components keep only the rules unique
 * to them and declare no colour literals — enforced by
 * `no-colour-literals.test.ts`.
 */

export type IconName =
  | 'globe' | 'check' | 'sparkle' | 'flag' | 'send' | 'copy'
  | 'refresh' | 'alert' | 'back' | 'chevron' | 'close';

/**
 * `<use href="#id">` resolves only within its own tree, so a shared sprite
 * — whether mounted in the SDK root's shadow or in the document — is
 * unreachable from a panel's shadow. Each icon is therefore inlined as
 * complete markup. These strings are code-controlled constants, never user,
 * AI or translation content: see `trusted-types.ts`.
 */
const ICON_BODIES: Record<IconName, string> = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/>',
  check: '<path d="M4 12.5l5.2 5.2L20 7"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 3.5L16 11H5"/>',
  send: '<path d="M20 4L3.5 10.4l6.6 2.5 2.5 6.6z"/><path d="M20 4l-9.9 8.9"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.7 4.4"/><path d="M20 4v7h-7"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

/** Complete `<svg>` markup for `name`, sized and coloured by CSS. */
export function icon(name: IconName): string {
  return (
    `<svg class="t8-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true">${ICON_BODIES[name]}</svg>`
  );
}

export const TOKENS_CSS = `
:host {
  color-scheme: light dark;

  --t8-accent:   light-dark(oklch(52% .19 258), oklch(74% .13 258));
  --t8-accent-hover:light-dark(oklch(45% .19 258), oklch(80% .13 258));
  --t8-on-accent:light-dark(oklch(100% 0 0),    oklch(20% .03 258));
  --t8-surface:  light-dark(oklch(100% 0 0),    oklch(22% .015 255));
  --t8-recess:   light-dark(oklch(97.5% .005 255), oklch(26% .018 255));
  --t8-ink:      light-dark(oklch(24% .02 250), oklch(94% .01 250));
  --t8-muted:    light-dark(oklch(54% .025 250), oklch(70% .02 250));
  --t8-line:     light-dark(oklch(92% .01 250), oklch(31% .02 250));
  --t8-line-2:   light-dark(oklch(86% .015 250), oklch(38% .022 250));
  --t8-ok:       light-dark(oklch(48% .13 150), oklch(76% .16 150));
  --t8-warn:     light-dark(oklch(53% .12 70),  oklch(80% .14 78));
  --t8-danger:   light-dark(oklch(52% .19 25),  oklch(74% .15 25));

  --t8-r-panel: 10px;
  --t8-r-ctl: 6px;
  --t8-r-pill: 999px;

  --t8-s1: 4px;  --t8-s2: 8px;  --t8-s3: 12px;
  --t8-s4: 14px; --t8-s5: 18px;

  --t8-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --t8-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --t8-ease: cubic-bezier(.2, 0, 0, 1);
  --t8-in: 140ms;
  --t8-out: 100ms;

  --t8-shadow:
    0 1px 1px light-dark(oklch(20% .03 255 / .06), oklch(0% 0 0 / .5)),
    0 12px 32px -12px light-dark(oklch(20% .03 255 / .28), oklch(0% 0 0 / .85));

  --t8-z: 2147483000;
}

/* Engines without light-dark()/oklch() get a flat light palette rather
   than transparent text on a transparent ground. */
@supports not (color: light-dark(#000, #fff)) {
  :host {
    --t8-accent: #2358d8;   --t8-on-accent: #ffffff;
    --t8-surface: #ffffff;  --t8-recess: #f4f6f9;
    --t8-ink: #15202c;      --t8-muted: #63748a;
    --t8-line: #e3e8ef;     --t8-line-2: #cfd8e3;
    --t8-ok: #14713b;       --t8-warn: #a35c05;   --t8-danger: #c8322b;
    --t8-shadow: 0 1px 1px rgba(15,32,44,.06), 0 12px 32px -12px rgba(15,32,44,.28);
  }
}

.t8-i { width: 15px; height: 15px; flex: none; }

:where(button, [tabindex], textarea, input):focus-visible {
  outline: 2px solid var(--t8-accent);
  outline-offset: 2px;
  border-radius: var(--t8-r-ctl);
}

@media (prefers-reduced-motion: reduce) {
  :host *, :host *::before, :host *::after {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}

/*
 * Panel enter/exit motion (ADR spec 2.3). @starting-style + the
 * transition-behavior: allow-discrete on "display" animates an element
 * entering FROM display:none, which is exactly how every panel here already
 * shows/hides itself — no JS, no library. Degrades to the current instant
 * appearance on engines without @starting-style support, and the
 * prefers-reduced-motion block above zeroes both durations by zeroing every
 * transition-duration/animation-duration under :host.
 *
 * The transition MUST be declared on the bare [part="panel"] selector, not
 * on [part="panel"][data-open]. Per the CSS Transitions spec, whether a
 * transition runs is decided by the transition-property list in the
 * AFTER-CHANGE style. hide() removes data-open and sets display:none in the
 * same synchronous step, so if "transition" only lived on the [data-open]
 * rule, the after-change style (attribute gone) would match no rule
 * carrying a transition at all and every property — opacity, translate,
 * display — would jump instantly. Every caller that sets
 * style.display = 'block' on a [part="panel"] element also sets data-open
 * in the same call (panel-shell.ts, inspector-panel.ts, ai-panel.ts,
 * report-form.ts — panel-shell.ts owns the outer frame, the other three the
 * view body slotted into it; all four are [part="panel"] owners) — so
 * giving the bare selector its own closed-state opacity/translate is safe:
 * nothing ever renders the panel without the attribute alongside it.
 */
[part="panel"] {
  opacity: 0;
  translate: 0 -6px;
  transition:
    opacity var(--t8-out) var(--t8-ease),
    translate var(--t8-out) var(--t8-ease),
    display var(--t8-out) var(--t8-ease) allow-discrete;
}
[part="panel"][data-open] {
  opacity: 1;
  translate: 0 0;
  transition-duration: var(--t8-in);
}
@starting-style {
  [part="panel"][data-open] { opacity: 0; translate: 0 -6px; }
}
`;

let constructed: CSSStyleSheet | null | undefined;

function constructedSheet(): CSSStyleSheet | null {
  if (constructed !== undefined) {
    return constructed;
  }
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(TOKENS_CSS);
    constructed = sheet;
  } catch {
    constructed = null;
  }
  return constructed;
}

function inlineTokenStyleOnce(shadow: ShadowRoot): void {
  if (shadow.querySelector('style[data-transl8-tokens]')) {
    return;
  }
  const style = document.createElement('style');
  style.setAttribute('data-transl8-tokens', '');
  style.textContent = TOKENS_CSS;
  shadow.prepend(style);
}

/**
 * Attaches the token sheet to `shadow`. Idempotent.
 *
 * Must be called AFTER any `shadow.innerHTML` assignment, not before.
 * The fallback path prepends a `<style>` element which would be deleted
 * by innerHTML (innerHTML replaces all children). adoptedStyleSheets is
 * unaffected by innerHTML, so this order is correct on both paths.
 *
 * Prefers `adoptedStyleSheets` (shared by reference — zero parse cost per
 * component). Falls back to one inline `<style>` for engines without it,
 * which in practice means jsdom 30 under Vitest: it implements
 * `new CSSStyleSheet()` and `replaceSync()` but not
 * `ShadowRoot.adoptedStyleSheets`.
 */
export function adoptTokens(shadow: ShadowRoot): void {
  const sheet = constructedSheet();
  if (sheet && 'adoptedStyleSheets' in shadow) {
    if (!shadow.adoptedStyleSheets.includes(sheet)) {
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
    }
    return;
  }
  inlineTokenStyleOnce(shadow);
}
