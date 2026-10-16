import { describe, expect, it } from 'vitest';
import { adoptTokens, icon, TOKENS_CSS } from './tokens';

function makeShadow(): ShadowRoot {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('adoptTokens', () => {
  it('injects the token CSS into a shadow root that has no adoptedStyleSheets', () => {
    const shadow = makeShadow();

    adoptTokens(shadow);

    const style = shadow.querySelector('style[data-transl8-tokens]');
    expect(style).not.toBeNull();
    expect(style!.textContent).toBe(TOKENS_CSS);
  });

  it('is idempotent — adopting twice leaves one stylesheet', () => {
    const shadow = makeShadow();

    adoptTokens(shadow);
    adoptTokens(shadow);

    expect(shadow.querySelectorAll('style[data-transl8-tokens]')).toHaveLength(1);
  });

  it('prefers adoptedStyleSheets when the engine supports it', () => {
    const shadow = makeShadow();
    // jsdom 30 has no adoptedStyleSheets; emulate an engine that does.
    const adopted: CSSStyleSheet[] = [];
    Object.defineProperty(shadow, 'adoptedStyleSheets', {
      configurable: true,
      get: () => adopted,
      set: (next: CSSStyleSheet[]) => {
        adopted.length = 0;
        adopted.push(...next);
      },
    });

    adoptTokens(shadow);

    expect(adopted).toHaveLength(1);
    expect(shadow.querySelector('style[data-transl8-tokens]')).toBeNull();
  });

  it('does not append the same constructed sheet twice', () => {
    const shadow = makeShadow();
    const adopted: CSSStyleSheet[] = [];
    Object.defineProperty(shadow, 'adoptedStyleSheets', {
      configurable: true,
      get: () => adopted,
      set: (next: CSSStyleSheet[]) => {
        adopted.length = 0;
        adopted.push(...next);
      },
    });

    adoptTokens(shadow);
    adoptTokens(shadow);

    expect(adopted).toHaveLength(1);
  });
});

describe('icon', () => {
  it('returns inline svg markup, not a <use> reference', () => {
    const markup = icon('globe');

    expect(markup).toContain('<svg');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).not.toContain('<use');
  });

  it('marks icons aria-hidden so the label carries the meaning', () => {
    expect(icon('close')).toContain('aria-hidden="true"');
  });

  it('has markup for every declared icon name', () => {
    const names = [
      'globe', 'check', 'sparkle', 'flag', 'send',
      'copy', 'refresh', 'alert', 'back', 'chevron', 'close',
    ] as const;

    for (const name of names) {
      expect(icon(name), name).toContain('<svg');
    }
  });
});

describe('TOKENS_CSS', () => {
  it('defines the accent, state and surface tokens', () => {
    for (const token of [
      '--t8-accent', '--t8-surface', '--t8-recess', '--t8-ink',
      '--t8-muted', '--t8-line', '--t8-ok', '--t8-warn', '--t8-danger',
    ]) {
      expect(TOKENS_CSS, token).toContain(token);
    }
  });

  it('opts the shadow root into both colour schemes', () => {
    expect(TOKENS_CSS).toContain('color-scheme: light dark');
  });

  it('honours prefers-reduced-motion', () => {
    expect(TOKENS_CSS).toContain('prefers-reduced-motion');
  });

  it('declares the panel enter/exit transition keyed off data-open', () => {
    expect(TOKENS_CSS).toContain('[part="panel"][data-open]');
    expect(TOKENS_CSS).toContain('@starting-style');
  });

  it('declares the transition property on the bare [part="panel"] selector, not only [data-open] — otherwise the after-change style on hide() (attribute removed) matches no rule with a transition, and the exit never runs', () => {
    const bareRuleMatch = TOKENS_CSS.match(/\[part="panel"\]\s*\{[^}]*\}/);
    expect(bareRuleMatch).not.toBeNull();
    expect(bareRuleMatch![0]).toContain('transition:');
    expect(bareRuleMatch![0]).toContain('display');
    expect(bareRuleMatch![0]).toContain('allow-discrete');
  });

  it('never contains a bare 0.N decimal, which would leak into shadowRoot.textContent under jsdom', () => {
    expect(TOKENS_CSS).not.toMatch(/0\.\d/);
  });
});

describe('adoptTokens ordering', () => {
  it('survives the innerHTML-assignment pattern every component uses', () => {
    const shadow = makeShadow();

    // The pattern from every component: assign markup, THEN adopt.
    shadow.innerHTML = '<div part="panel"></div>';
    adoptTokens(shadow);

    expect(shadow.querySelector('style[data-transl8-tokens]')).not.toBeNull();
    expect(shadow.querySelector('div[part="panel"]')).not.toBeNull();
  });

  it('is defeated if innerHTML is assigned after adopting — the ordering the docblock forbids', () => {
    const shadow = makeShadow();

    adoptTokens(shadow);
    shadow.innerHTML = '<div part="panel"></div>';

    // Documents the hazard rather than hiding it: this is why order matters.
    expect(shadow.querySelector('style[data-transl8-tokens]')).toBeNull();
  });
});
