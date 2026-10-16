import { describe, expect, it, vi, beforeEach } from 'vitest';
// Side-effect import for the same isolatedModules-elision reason as
// highlight-overlay.test.ts / launcher.test.ts: Transl8ReviewModeBadges is
// only referenced in a type position (`as Transl8ReviewModeBadges`) below.
import './review-mode-badges';
import { Transl8ReviewModeBadges } from './review-mode-badges';

function makeRect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...partial,
  } as DOMRect;
}

describe('Transl8ReviewModeBadges', () => {
  let badges: Transl8ReviewModeBadges;

  beforeEach(() => {
    badges = document.createElement('transl8-review-mode-badges') as Transl8ReviewModeBadges;
    document.body.appendChild(badges);
  });

  it('renders nothing by default', () => {
    expect(badges.shadowRoot!.querySelectorAll('[part="frame"]')).toHaveLength(0);
    expect(badges.shadowRoot!.querySelectorAll('[part="badge"]')).toHaveLength(0);
  });

  it('renders one frame and one badge button per item, positioned from its rect', () => {
    badges.render([
      { rect: makeRect({ left: 10, top: 20, width: 100, height: 40 }), onClick: vi.fn() },
      { rect: makeRect({ left: 200, top: 5, width: 30, height: 15 }), onClick: vi.fn() },
    ]);

    const frames = badges.shadowRoot!.querySelectorAll('[part="frame"]');
    expect(frames).toHaveLength(2);
    const first = frames[0] as HTMLElement;
    expect(first.style.left).toBe('10px');
    expect(first.style.top).toBe('20px');
    expect(first.style.width).toBe('100px');
    expect(first.style.height).toBe('40px');

    expect(badges.shadowRoot!.querySelectorAll('[part="badge"]')).toHaveLength(2);
  });

  it('replaces previously rendered items on a second render() call', () => {
    badges.render([{ rect: makeRect({}), onClick: vi.fn() }, { rect: makeRect({}), onClick: vi.fn() }]);

    badges.render([{ rect: makeRect({}), onClick: vi.fn() }]);

    expect(badges.shadowRoot!.querySelectorAll('[part="frame"]')).toHaveLength(1);
    expect(badges.shadowRoot!.querySelectorAll('[part="badge"]')).toHaveLength(1);
  });

  it('clicking a badge button invokes that item onClick, not the others', () => {
    const onClickFirst = vi.fn();
    const onClickSecond = vi.fn();
    badges.render([
      { rect: makeRect({}), onClick: onClickFirst },
      { rect: makeRect({}), onClick: onClickSecond },
    ]);

    const secondBadge = badges.shadowRoot!.querySelectorAll('[part="badge"]')[1] as HTMLElement;
    secondBadge.click();

    expect(onClickFirst).not.toHaveBeenCalled();
    expect(onClickSecond).toHaveBeenCalledOnce();
  });

  it('clear() removes all rendered frames and badges', () => {
    badges.render([{ rect: makeRect({}), onClick: vi.fn() }]);

    badges.clear();

    expect(badges.shadowRoot!.querySelectorAll('[part="frame"]')).toHaveLength(0);
    expect(badges.shadowRoot!.querySelectorAll('[part="badge"]')).toHaveLength(0);
  });

  it('the frame does not intercept pointer events (must not block app clicks)', () => {
    badges.render([{ rect: makeRect({}), onClick: vi.fn() }]);

    const frame = badges.shadowRoot!.querySelector('[part="frame"]') as HTMLElement;
    expect(frame.style.pointerEvents).toBe('none');
  });

  it('the badge button does accept pointer events', () => {
    badges.render([{ rect: makeRect({}), onClick: vi.fn() }]);

    const badge = badges.shadowRoot!.querySelector('[part="badge"]') as HTMLElement;
    expect(badge.style.pointerEvents).toBe('auto');
  });

  it('renders exactly one badge per element, doubling as the resting indicator', () => {
    // Fix round 1: an earlier version rendered a separate non-interactive
    // `part="dot"` plus a `display:none` badge inside a `part="pair"`
    // wrapper, resolving the badge on `pair:hover`. That's unreachable in a
    // real browser — a `position: fixed` child gives its `position: static`
    // parent no layout box, so `pair` never receives the hover, and a
    // `display:none` button can never take focus. The badge is now the one
    // always-present, always-focusable element; there is no separate dot or
    // pair element to assert on.
    badges.render([
      { rect: new DOMRect(10, 20, 100, 30), onClick: () => {} },
      { rect: new DOMRect(10, 60, 100, 30), onClick: () => {} },
    ]);

    const shadow = badges.shadowRoot!;
    expect(shadow.querySelectorAll('[part="dot"]')).toHaveLength(0);
    expect(shadow.querySelectorAll('[part="pair"]')).toHaveLength(0);
    expect(shadow.querySelectorAll('[part="badge"]')).toHaveLength(2);
    expect(shadow.querySelectorAll('[part="frame"]')).toHaveLength(2);
  });

  it('labels the badge with a word, not a bare glyph', () => {
    badges.render([{ rect: new DOMRect(10, 20, 100, 30), onClick: () => {} }]);

    const badge = badges.shadowRoot!.querySelector('[part="badge"]') as HTMLButtonElement;
    expect(badge.textContent).toContain('Edit');
    expect(badge.textContent).not.toContain('🌐');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('keeps frames transparent to pointer events so host clicks still land', () => {
    badges.render([{ rect: new DOMRect(10, 20, 100, 30), onClick: () => {} }]);

    const frame = badges.shadowRoot!.querySelector('[part="frame"]') as HTMLElement;
    expect(frame.style.pointerEvents).toBe('none');
  });

  it('sources the badge aria-label from strings.ts', () => {
    badges.render([{ rect: new DOMRect(10, 20, 100, 30), onClick: () => {} }], 'en');

    const badge = badges.shadowRoot!.querySelector('[part="badge"]') as HTMLButtonElement;
    expect(badge.getAttribute('aria-label')).toBe('Open translation');
  });
});
