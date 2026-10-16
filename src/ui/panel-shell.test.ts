import { describe, expect, it, vi, beforeEach } from 'vitest';
// Side-effect import, same isolatedModules-elision reason as the other
// component tests: Transl8PanelShell is only referenced in a type position.
import './panel-shell';
import { Transl8PanelShell } from './panel-shell';

function query(shell: Transl8PanelShell, selector: string): HTMLElement {
  return shell.shadowRoot!.querySelector(selector) as HTMLElement;
}

describe('Transl8PanelShell', () => {
  let shell: Transl8PanelShell;

  beforeEach(() => {
    shell = document.createElement('transl8-panel-shell') as Transl8PanelShell;
    document.body.appendChild(shell);
  });

  it('is hidden by default', () => {
    expect(query(shell, '[part="panel"]').style.display).toBe('none');
  });

  it('pairs data-open with display on open and removes it on close', () => {
    const frame = query(shell, '[part="panel"]');

    shell.open();

    // tokens.ts puts the closed-state opacity/translate on the bare
    // [part="panel"] selector, so a frame shown without data-open renders
    // fully transparent. The pairing is the contract.
    expect(frame.style.display).toBe('block');
    expect(frame.hasAttribute('data-open')).toBe(true);

    shell.close();

    expect(frame.style.display).toBe('none');
    expect(frame.hasAttribute('data-open')).toBe(false);
  });

  it('renders the key row from the backend lookup and keeps it across a view change', () => {
    shell.setContext({ key: 'checkout.submit', locale: 'fr', version: 3 });
    shell.setView('translation');

    expect(query(shell, '[part="key"]').textContent).toBe('checkout.submit');
    expect(query(shell, '[part="chip-locale"]').textContent).toBe('FR');
    expect(query(shell, '[part="chip-version"]').textContent).toBe('v3');

    // The point of the whole element: switching to the Ask AI view must not
    // take the key and the version off screen.
    shell.setView('ai');

    expect(query(shell, '[part="key"]').textContent).toBe('checkout.submit');
    expect(query(shell, '[part="chip-version"]').textContent).toBe('v3');
    expect(query(shell, '[part="panel"]').style.display).toBe('block');
  });

  it('hides the key row when there is no resolved lookup', () => {
    shell.setContext({ key: 'checkout.submit', locale: 'fr', version: 3 });
    shell.setContext(undefined);

    expect(query(shell, '[part="context"]').style.display).toBe('none');
    expect(query(shell, '[part="key"]').textContent).toBe('');
  });

  it('titles a view from strings.ts, keyed off the locale set via setContext', () => {
    shell.setContext({ key: 'checkout.submit', locale: 'en', version: 1 });
    shell.setView('ai');

    expect(query(shell, '[part="title"]').textContent).toBe('Translation AI');
  });

  it('re-applies static chrome strings from setContext() after mount, respecting the active view (fix round: connectedCallback-time freeze)', () => {
    shell.setContext({ key: 'checkout.submit', locale: 'en', version: 1 });
    shell.setView('ai');

    // Corrupt the DOM the way a stale, mount-time-only render would have
    // left it — this assertion can only pass if setContext() actually
    // rewrites these on every call, not just once at connectedCallback.
    query(shell, 'button[part="back"]').setAttribute('aria-label', 'CORRUPTED');
    query(shell, 'button[part="key-copy"]').setAttribute('aria-label', 'CORRUPTED');

    shell.setContext({ key: 'checkout.other', locale: 'en', version: 2 });

    expect(query(shell, 'button[part="back"]').getAttribute('aria-label')).toBe('Back');
    expect(query(shell, 'button[part="key-copy"]').getAttribute('aria-label')).toBe('Copy key');
    // The title must still read the active view ('ai'), not reset to the
    // default 'translation' title — the re-apply must respect whichever
    // view is currently open, not just replay the mount-time template.
    expect(query(shell, '[part="title"]').textContent).toBe('Translation AI');
  });

  it('titles each view and opens the shell', () => {
    shell.setView('translation');
    expect(query(shell, '[part="title"]').textContent).toBe('Translation');

    shell.setView('ai');
    expect(query(shell, '[part="title"]').textContent).toBe('Translation AI');

    shell.setView('report');
    expect(query(shell, '[part="title"]').textContent).toBe('Report translation issue');

    expect(query(shell, '[part="panel"]').style.display).toBe('block');
  });

  it('hides Back on the translation view and shows it on the sub-views, without reflowing the header', () => {
    const back = () => query(shell, '[part="back"]') as HTMLButtonElement;

    shell.setView('translation');
    expect(back().style.visibility).toBe('hidden');
    expect(back().disabled).toBe(true);
    // Its box stays reserved, so the title does not slide when Back appears.
    expect(back().style.display).not.toBe('none');

    shell.setView('ai');
    expect(back().style.visibility).toBe('visible');
    expect(back().disabled).toBe(false);

    shell.setView('report');
    expect(back().style.visibility).toBe('visible');
  });

  it('fires onBack and onClose from the header controls', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    shell.onBack = onBack;
    shell.onClose = onClose;
    shell.setView('ai');

    query(shell, 'button[part="back"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    query(shell, 'button[part="close"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close itself on Back or Close — the caller decides, because the valid exit differs by view', () => {
    shell.setView('ai');

    query(shell, 'button[part="close"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(query(shell, '[part="panel"]').style.display).toBe('block');
  });

  it('adopts the shared token sheet instead of declaring its own colours', () => {
    const shadow = shell.shadowRoot!;
    const own = Array.from(shadow.querySelectorAll('style'))
      .filter((sheet) => !sheet.hasAttribute('data-transl8-tokens'))
      .map((sheet) => sheet.textContent ?? '')
      .join('');

    expect(shadow.querySelector('style[data-transl8-tokens]')).not.toBeNull();
    expect(own).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own).not.toMatch(/rgba?\(/);
  });

  it('offers the dismiss control only where it genuinely closes', () => {
    const close = () => query(shell, 'button[part="close"]') as HTMLButtonElement;

    shell.setDismissAction('close');
    expect(close().style.visibility).toBe('visible');
    expect(close().disabled).toBe(false);
    expect(close().getAttribute('aria-label')).toBe('Close');

    // A state whose only exit is a return to the previous view already has
    // the header's Back arrow and the body's own Cancel. Offering a second
    // control for the same action — or a "Close" that is really a Back —
    // is what this hides.
    shell.setDismissAction('back');
    expect(close().style.visibility).toBe('hidden');
    expect(close().disabled).toBe(true);

    shell.setDismissAction('close');
    expect(close().style.visibility).toBe('visible');
    expect(close().disabled).toBe(false);
  });

  it('keeps the dismiss control on screen but unavailable while an operation is in flight', () => {
    shell.setDismissAction('none');
    const close = query(shell, 'button[part="close"]') as HTMLButtonElement;

    // Still visible — the header must not reflow mid-operation — but a real
    // `disabled`, so it also leaves the tab order rather than stopping a
    // keyboard user on a control that does nothing.
    expect(close.style.visibility).toBe('visible');
    expect(close.disabled).toBe(true);
  });

  it('reserves the dismiss control\'s space when hidden, so the header does not jump between views', () => {
    const close = query(shell, 'button[part="close"]') as HTMLButtonElement;

    shell.setDismissAction('back');

    // visibility, not display: `display: none` frees the box and lets the
    // flex:1 title absorb it, sliding the chips right on every view change.
    expect(close.style.display).not.toBe('none');
    expect(close.style.visibility).toBe('hidden');
  });

  it('does not fire onClose while the dismiss control is unavailable', () => {
    const onClose = vi.fn();
    shell.onClose = onClose;

    shell.setDismissAction('none');
    query(shell, 'button[part="close"]').click();
    shell.setDismissAction('back');
    query(shell, 'button[part="close"]').click();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('projects panel bodies through a named slot', () => {
    expect(shell.shadowRoot!.querySelector('slot[name="body"]')).not.toBeNull();
  });

  it('swallows a rejected clipboard write instead of leaking an unhandled rejection', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    shell.setContext({ key: 'checkout.submit', locale: 'fr', version: 3 });

    query(shell, 'button[part="key-copy"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('checkout.submit');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  describe('top layer', () => {
    it('falls back to display toggling where the Popover API is absent', () => {
      const panel = query(shell, '[part="panel"]');

      shell.open();

      // jsdom implements no Popover API, so this is the fallback path.
      expect(panel.style.display).toBe('block');
      expect(panel.hasAttribute('popover')).toBe(false);
    });

    it('promotes the panel into the top layer where the Popover API exists', () => {
      const panel = query(shell, '[part="panel"]');
      const showPopover = vi.fn();
      const hidePopover = vi.fn();
      Object.assign(panel, { popover: null, showPopover, hidePopover });

      shell.open();

      expect(panel.getAttribute('popover')).toBe('manual');
      expect(showPopover).toHaveBeenCalledOnce();
      expect(panel.style.display).toBe('');
    });

    it('hides through the Popover API on close when it used it to open', () => {
      const panel = query(shell, '[part="panel"]');
      const hidePopover = vi.fn();
      Object.assign(panel, { popover: null, showPopover: vi.fn(), hidePopover });

      shell.open();
      shell.close();

      expect(hidePopover).toHaveBeenCalledOnce();
    });
  });
});
