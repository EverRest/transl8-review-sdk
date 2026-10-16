import { afterEach, describe, expect, it, vi } from 'vitest';
import { trapPanelFocus } from './panel-a11y';

function makePanel() {
  const panel = document.createElement('div');
  panel.tabIndex = -1;
  panel.innerHTML = '<button id="a">A</button><button id="b">B</button>';
  document.body.appendChild(panel);
  return panel;
}

describe('trapPanelFocus', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('moves focus into the panel', () => {
    const panel = makePanel();

    trapPanelFocus(panel, () => {});

    expect(document.activeElement).toBe(panel);
  });

  it('calls onDismiss when Escape is pressed', () => {
    const panel = makePanel();
    const onDismiss = vi.fn();
    trapPanelFocus(panel, onDismiss);

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('restores focus to the previously focused element on teardown', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const panel = makePanel();

    const release = trapPanelFocus(panel, () => {});
    release();

    expect(document.activeElement).toBe(opener);
  });

  it('restores focus to an opener that lives inside a shadow root', () => {
    // The real openers all do: the review-mode badge is inside
    // `transl8-review-mode-badges`'s shadow root, the Ask AI and Report
    // buttons inside the inspector's. `document.activeElement` retargets a
    // focused node to its shadow HOST, and the host is a custom element
    // with no tabindex — `.focus()` on it is a silent no-op, so focus never
    // came back and the panel that just closed kept it. The light-DOM
    // opener above cannot catch this: nothing retargets.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const opener = document.createElement('button');
    shadow.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(host);
    const panel = makePanel();

    const release = trapPanelFocus(panel, () => {});
    release();

    expect(shadow.activeElement).toBe(opener);
  });

  it('stops listening for Escape after teardown', () => {
    const panel = makePanel();
    const onDismiss = vi.fn();
    const release = trapPanelFocus(panel, onDismiss);

    release();
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not restore focus to an element that left the document', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const panel = makePanel();
    const release = trapPanelFocus(panel, () => {});
    opener.remove();

    expect(() => release()).not.toThrow();
  });

  it('does not refocus the opener a second time when the teardown is called twice', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const focusSpy = vi.spyOn(opener, 'focus');
    const panel = makePanel();
    const release = trapPanelFocus(panel, () => {});

    release();
    release();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});
