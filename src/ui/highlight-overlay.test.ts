import { describe, expect, it, beforeEach } from 'vitest';
// Side-effect import, kept separate from the type-only import below:
// Transl8HighlightOverlay is used only in `as Transl8HighlightOverlay` type
// positions in this file, which TS/esbuild's isolatedModules-style transform
// elides as type-only — dropping highlight-overlay.ts's customElements.define()
// call with it. See launcher.test.ts for the original repro of this gotcha.
import './highlight-overlay';
import { Transl8HighlightOverlay } from './highlight-overlay';

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

describe('Transl8HighlightOverlay', () => {
  let overlay: Transl8HighlightOverlay;

  beforeEach(() => {
    overlay = document.createElement('transl8-highlight-overlay') as Transl8HighlightOverlay;
    document.body.appendChild(overlay);
  });

  it('is hidden by default', () => {
    const box = overlay.shadowRoot!.querySelector('div[part="box"]') as HTMLElement;
    expect(box.style.display).toBe('none');
  });

  it('positions the box from a DOMRect on show()', () => {
    overlay.show(makeRect({ left: 10, top: 20, width: 100, height: 40 }));

    const box = overlay.shadowRoot!.querySelector('div[part="box"]') as HTMLElement;
    expect(box.style.display).toBe('block');
    expect(box.style.left).toBe('10px');
    expect(box.style.top).toBe('20px');
    expect(box.style.width).toBe('100px');
    expect(box.style.height).toBe('40px');
  });

  it('hides the box on hide()', () => {
    overlay.show(makeRect({ left: 10, top: 20, width: 100, height: 40 }));

    overlay.hide();

    const box = overlay.shadowRoot!.querySelector('div[part="box"]') as HTMLElement;
    expect(box.style.display).toBe('none');
  });

  it('does not intercept pointer events (must not block app clicks)', () => {
    const box = overlay.shadowRoot!.querySelector('div[part="box"]') as HTMLElement;
    expect(getComputedStyle(box).pointerEvents).toBe('none');
  });

  it('re-shows at the new position on a second show() call without needing hide() first', () => {
    overlay.show(makeRect({ left: 10, top: 20, width: 100, height: 40 }));
    overlay.show(makeRect({ left: 50, top: 60, width: 30, height: 15 }));

    const box = overlay.shadowRoot!.querySelector('div[part="box"]') as HTMLElement;
    expect(box.style.left).toBe('50px');
    expect(box.style.top).toBe('60px');
    expect(box.style.width).toBe('30px');
    expect(box.style.height).toBe('15px');
  });
});
