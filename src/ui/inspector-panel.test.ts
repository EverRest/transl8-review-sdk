import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
// Side-effect import, same isolatedModules-elision reason as
// highlight-overlay.test.ts: Transl8InspectorPanel is only referenced in a
// type position (`as Transl8InspectorPanel`) below.
import './inspector-panel';
import { Transl8InspectorPanel } from './inspector-panel';
import type { ResolvedElementInfo } from '../context/element-context-resolver';
import type { SdkTranslationLookupResult } from './inspector-lookup-types';

function query(panel: Transl8InspectorPanel, selector: string): HTMLElement {
  return panel.shadowRoot!.querySelector(selector) as HTMLElement;
}

const keyedInfo: ResolvedElementInfo = {
  element: { tagName: 'button', text: 'Pay', translationKey: 'checkout.submit' },
  translation: { key: 'checkout.submit', currentText: 'Pay' },
};

const unkeyedInfo: ResolvedElementInfo = {
  element: { tagName: 'p', text: 'Just some copy' },
};

describe('Transl8InspectorPanel', () => {
  let panel: Transl8InspectorPanel;

  beforeEach(() => {
    panel = document.createElement('transl8-inspector-panel') as Transl8InspectorPanel;
    document.body.appendChild(panel);
  });

  it('is hidden by default', () => {
    expect(query(panel, '[part="panel"]').style.display).toBe('none');
  });

  it('shows the panel with backend-sourced source text, current translation, version, and updatedAt', () => {
    panel.show(keyedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });

    expect(query(panel, '[part="panel"]').style.display).toBe('block');
    expect(query(panel, '[part="source-text"]').textContent).toBe('Submit');
    expect(query(panel, '[part="current-text"]').textContent).toBe('Soumettre');
    expect(query(panel, '[part="version"]').textContent).toContain('3');
  });

  it('never renders the DOM-supplied element.text as source/current text (cannot be spoofed by application DOM)', () => {
    const spoofedInfo: ResolvedElementInfo = {
      element: {
        tagName: 'button',
        text: 'REAL TRANSLATION IS ACTUALLY WRONG!!1',
        translationKey: 'checkout.submit',
      },
      translation: { key: 'checkout.submit', currentText: 'REAL TRANSLATION IS ACTUALLY WRONG!!1' },
    };

    panel.show(spoofedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });

    expect(query(panel, '[part="source-text"]').textContent).toBe('Submit');
    expect(query(panel, '[part="current-text"]').textContent).toBe('Soumettre');
    expect(panel.shadowRoot!.textContent).not.toContain('REAL TRANSLATION IS ACTUALLY WRONG');
  });

  it('shows a "not tracked" state when the element has no translation key, without attempting a lookup', () => {
    panel.show(unkeyedInfo, undefined);

    expect(query(panel, '[part="panel"]').style.display).toBe('block');
    expect(query(panel, '[part="not-tracked"]').style.display).not.toBe('none');
    expect(query(panel, '[part="tracked"]').style.display).toBe('none');
  });

  it('shows a loading state, distinct from the not-tracked state, while a lookup is pending', () => {
    panel.showLoading(keyedInfo);

    expect(query(panel, '[part="panel"]').style.display).toBe('block');
    expect(query(panel, '[part="loading"]').style.display).not.toBe('none');
    expect(query(panel, '[part="not-tracked"]').style.display).toBe('none');
    expect(query(panel, '[part="tracked"]').style.display).toBe('none');
  });

  it('hides on hide()', () => {
    panel.show(keyedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });

    panel.hide();

    expect(query(panel, '[part="panel"]').style.display).toBe('none');
  });

  it('renders a skeleton in the shape of the loaded panel while loading', () => {
    panel.showLoading(keyedInfo);

    const loading = query(panel, 'section[part="loading"]');
    expect(loading.style.display).not.toBe('none');
    expect(loading.querySelectorAll('[part="skeleton-line"]').length).toBeGreaterThanOrEqual(3);
  });

  it('sets data-open when a panel-opening method makes the panel visible', () => {
    panel.showLoading(keyedInfo);
    expect(query(panel, '[part="panel"]').hasAttribute('data-open')).toBe(true);
  });

  it('sets data-open on showLookupError()', () => {
    panel.showLookupError();
    expect(query(panel, '[part="panel"]').hasAttribute('data-open')).toBe(true);
  });

  it('sets data-open on show()', () => {
    panel.show(unkeyedInfo, undefined);
    expect(query(panel, '[part="panel"]').hasAttribute('data-open')).toBe(true);
  });

  it('removes data-open on hide()', () => {
    panel.show(keyedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });

    panel.hide();

    expect(query(panel, '[part="panel"]').hasAttribute('data-open')).toBe(false);
  });

  it('calls onReportIssue when the report-issue button is clicked', () => {
    const onReportIssue = vi.fn();
    panel.onReportIssue = onReportIssue;
    panel.show(keyedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });

    query(panel, '[part="report-issue"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onReportIssue).toHaveBeenCalledOnce();
  });

  it('hides the report-issue button in the not-tracked state (nothing to report against)', () => {
    panel.show(unkeyedInfo, undefined);

    expect(query(panel, '[part="tracked"]').style.display).toBe('none');
  });

  it('calls onAskAi when the Ask AI button is clicked', () => {
    const onAskAi = vi.fn();
    panel.onAskAi = onAskAi;
    panel.show(keyedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });

    query(panel, '[part="ask-ai"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onAskAi).toHaveBeenCalledOnce();
  });

  it('shows the Ask AI button only once setCanAskAi(true) says the session may analyze', () => {
    panel.show(keyedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });
    // Fail closed: until the client reports the permission, no button.
    expect(query(panel, '[part="ask-ai"]').style.display).toBe('none');

    panel.setCanAskAi(true);
    expect(query(panel, '[part="ask-ai"]').style.display).not.toBe('none');

    panel.setCanAskAi(false);
    expect(query(panel, '[part="ask-ai"]').style.display).toBe('none');
  });

  it('hides the Ask AI button in the not-tracked state', () => {
    panel.show(unkeyedInfo, undefined);

    expect(query(panel, '[part="tracked"]').style.display).toBe('none');
  });

  it('does not display user/session/request identifiers anywhere in the panel', () => {
    panel.show(keyedInfo, {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });

    const text = panel.shadowRoot!.textContent ?? '';
    expect(text).not.toMatch(/user|session|request/i);
  });

  describe('manual Apply', () => {
    const lookup = {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    };

    function showTracked(canEdit: boolean): void {
      panel.show(keyedInfo, lookup);
      panel.setCanEdit(canEdit);
    }

    it('keeps read-only current text without translation.edit permission', () => {
      showTracked(false);

      expect(query(panel, '[part="current-text"]').style.display).not.toBe('none');
      expect(query(panel, 'textarea[part="current-edit"]').style.display).toBe('none');
      expect(query(panel, 'button[part="apply"]').style.display).toBe('none');
    });

    it('shows an editable textarea and Apply when translation.edit is granted', () => {
      showTracked(true);

      expect(query(panel, '[part="current-text"]').style.display).toBe('none');
      expect(query(panel, 'textarea[part="current-edit"]').style.display).not.toBe('none');
      expect(
        (query(panel, 'textarea[part="current-edit"]') as HTMLTextAreaElement).value,
      ).toBe('Soumettre');
      expect(query(panel, 'button[part="apply"]').style.display).not.toBe('none');
    });

    it('calls onApply when Apply is clicked', () => {
      const onApply = vi.fn();
      panel.onApply = onApply;
      showTracked(true);

      query(panel, 'button[part="apply"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );

      expect(onApply).toHaveBeenCalledOnce();
    });

    it('shows an applying state that disables Apply', () => {
      showTracked(true);

      panel.setApplying(true);

      expect(
        (query(panel, 'button[part="apply"]') as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(query(panel, 'button[part="apply"]').textContent).toBe('Applying…');
    });

    it('shows a success message after apply succeeds', () => {
      showTracked(true);
      panel.setApplying(true);

      panel.setApplySuccess();

      expect(query(panel, '[part="apply-status"]').textContent).toBe(
        'Translation applied.',
      );
      expect(
        (query(panel, 'button[part="apply"]') as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('shows conflict copy when apply hits a version mismatch', () => {
      showTracked(true);

      panel.setApplyConflict();

      expect(query(panel, '[part="apply-status"]').textContent).toBe(
        'This translation was changed by someone else.',
      );
    });

    it('shows permission-denied copy on 403', () => {
      showTracked(true);

      panel.setApplyPermissionDenied();

      expect(query(panel, '[part="apply-status"]').textContent).toBe(
        "You don't have permission to apply it.",
      );
    });

    it('refreshTranslationFields updates version and textarea from backend lookup', () => {
      showTracked(true);

      panel.refreshTranslationFields({
        ...lookup,
        value: 'Soumettre v2',
        version: 4,
        updatedAt: '2026-08-21T12:00:00.000Z',
      });

      expect(query(panel, '[part="version"]').textContent).toContain('4');
      expect(
        (query(panel, 'textarea[part="current-edit"]') as HTMLTextAreaElement).value,
      ).toBe('Soumettre v2');
    });

    it('shows "Not translated yet" instead of the epoch, for a version:0 lookup, with an empty field', () => {
      showTracked(true);

      panel.refreshTranslationFields({
        ...lookup,
        value: '',
        version: 0,
        updatedAt: new Date(0).toISOString(),
      });

      expect(query(panel, '[part="updated-at"]').textContent).toBe('Not translated yet');
      expect(
        (query(panel, 'textarea[part="current-edit"]') as HTMLTextAreaElement).placeholder,
      ).toBe('');
      expect(
        (query(panel, 'textarea[part="current-edit"]') as HTMLTextAreaElement).value,
      ).toBe('');
    });

    it('stays empty in the read-only view too when there is no translation yet', () => {
      showTracked(false);

      panel.refreshTranslationFields({ ...lookup, value: '', version: 0 });

      expect(query(panel, '[part="current-text"]').textContent).toBe('');
    });
  });

  describe('submit for review', () => {
    const lookup = {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumis',
      version: 3,
      updatedAt: '2026-08-24T00:00:00.000Z',
    };

    beforeEach(() => {
      panel.show(keyedInfo, lookup);
    });

    it('hides Submit for review without translation.propose permission', () => {
      panel.setCanPropose(false);
      expect(query(panel, 'button[part="propose"]').style.display).toBe('none');
    });

    it('shows Submit for review when translation.propose is granted', () => {
      panel.setCanPropose(true);
      expect(query(panel, 'button[part="propose"]').style.display).not.toBe('none');
    });

    it('calls onPropose when Submit for review is clicked', () => {
      const onPropose = vi.fn();
      panel.onPropose = onPropose;
      panel.setCanPropose(true);

      query(panel, 'button[part="propose"]').dispatchEvent(
        new Event('click', { bubbles: true }),
      );

      expect(onPropose).toHaveBeenCalledOnce();
    });

    it('shows a proposing state that disables the button', () => {
      panel.setCanPropose(true);
      panel.setProposing(true);

      expect(
        (query(panel, 'button[part="propose"]') as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(query(panel, 'button[part="propose"]').textContent).toBe(
        'Submitting…',
      );
    });

    it('shows a success message after propose succeeds', () => {
      panel.setCanPropose(true);
      panel.setProposing(true);
      panel.setProposeSuccess();

      expect(query(panel, '[part="propose-status"]').textContent).toBe(
        'Submitted for review.',
      );
      expect(
        (query(panel, 'button[part="propose"]') as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('shows conflict copy when propose hits a version mismatch', () => {
      panel.setCanPropose(true);
      panel.setProposeConflict();

      expect(query(panel, '[part="propose-status"]').textContent).toBe(
        'This translation was changed by someone else.',
      );
    });

    it('shows already-pending copy when a proposal already exists', () => {
      panel.setCanPropose(true);
      panel.setProposeAlreadyPending();

      expect(query(panel, '[part="propose-status"]').textContent).toBe(
        'Already pending review.',
      );
    });

    it('setProposeAlreadyPending forces the button disabled regardless of prior enable calls', () => {
      panel.setCanPropose(true);
      // Simulate a caller re-enabling the button before this is invoked —
      // setProposeAlreadyPending must still leave it disabled so
      // resubmission stays blocked until the caller explicitly refreshes.
      panel.setProposing(false);
      panel.setProposeAlreadyPending();

      expect(
        (query(panel, 'button[part="propose"]') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('shows permission-denied copy on 403', () => {
      panel.setCanPropose(true);
      panel.setProposePermissionDenied();

      expect(query(panel, '[part="propose-status"]').textContent).toBe(
        "You don't have permission to submit this for review.",
      );
    });
  });

  describe('stale banner', () => {
    function mountShownPanel(): Transl8InspectorPanel {
      const panel = document.createElement('transl8-inspector-panel') as Transl8InspectorPanel;
      document.body.appendChild(panel);
      panel.show(
        { element: { tagName: 'H1' }, translation: { key: 'hero.title' } } as never,
        { key: 'hero.title', sourceText: 'Hello', value: 'Hallo', version: 2, updatedAt: '2026-08-25T10:00:00.000Z' },
      );
      return panel;
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('hides the stale banner by default', () => {
      const panel = mountShownPanel();
      const banner = panel.shadowRoot!.querySelector('[part="stale-banner"]') as HTMLElement;
      expect(banner.style.display).toBe('none');
    });

    it('shows the stale banner on setStale', () => {
      const panel = mountShownPanel();
      panel.setStale();
      const banner = panel.shadowRoot!.querySelector('[part="stale-banner"]') as HTMLElement;
      expect(banner.style.display).toBe('block');
    });

    it('hides the stale banner on clearStale', () => {
      const panel = mountShownPanel();
      panel.setStale();
      panel.clearStale();
      const banner = panel.shadowRoot!.querySelector('[part="stale-banner"]') as HTMLElement;
      expect(banner.style.display).toBe('none');
    });

    it('clears the stale banner when show() is called again for a fresh key', () => {
      const panel = mountShownPanel();
      panel.setStale();
      panel.show(
        { element: { tagName: 'H1' }, translation: { key: 'hero.title' } } as never,
        { key: 'hero.title', sourceText: 'Hello', value: 'Hallo', version: 3, updatedAt: '2026-08-25T10:05:00.000Z' },
      );
      const banner = panel.shadowRoot!.querySelector('[part="stale-banner"]') as HTMLElement;
      expect(banner.style.display).toBe('none');
    });

    it('fires onStaleReload when the Reload button is clicked', () => {
      const panel = mountShownPanel();
      panel.setStale();
      const onStaleReload = vi.fn();
      panel.onStaleReload = onStaleReload;

      const reloadBtn = panel.shadowRoot!.querySelector(
        'button[part="stale-reload"]',
      ) as HTMLButtonElement;
      reloadBtn.dispatchEvent(new MouseEvent('click'));

      expect(onStaleReload).toHaveBeenCalled();
    });
  });

  function showTrackedPanel(): { panel: Transl8InspectorPanel; shadow: ShadowRoot } {
    const panel = document.createElement('transl8-inspector-panel') as Transl8InspectorPanel;
    document.body.appendChild(panel);
    panel.setCanEdit(true);
    const info: ResolvedElementInfo = {
      element: { tagName: 'H1', text: 'ignored — host controlled' },
      translation: { key: 'app.quotaSummary.pageTitle' },
    };
    const lookup: SdkTranslationLookupResult = {
      key: 'app.quotaSummary.pageTitle',
      sourceText: 'Summary',
      value: 'Summary',
      version: 3,
      updatedAt: '2026-08-28T11:34:22.000Z',
    };
    panel.show(info, lookup);
    return { panel, shadow: panel.shadowRoot! };
  }

  describe('information architecture', () => {
    it('renders no frame chrome of its own — the shell owns title, key row and chips', () => {
      const { shadow } = showTrackedPanel();

      for (const part of ['title', 'close', 'key', 'key-copy', 'chip-locale', 'chip-version']) {
        expect(shadow.querySelector(`[part="${part}"]`), part).toBeNull();
      }
    });

    it('puts source immediately before the translation field', () => {
      const { shadow } = showTrackedPanel();
      const source = shadow.querySelector('[part="source-text"]')!;
      const edit = shadow.querySelector('[part="current-edit"]')!;

      expect(source.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('collapses page URL and timestamp into a closed details element', () => {
      const { shadow } = showTrackedPanel();
      const details = shadow.querySelector('details[part="details"]') as HTMLDetailsElement;

      expect(details.open).toBe(false);
      expect(details.contains(shadow.querySelector('[part="page"]'))).toBe(true);
      expect(details.contains(shadow.querySelector('[part="updated-at"]'))).toBe(true);
    });

    it('still renders every value from the backend lookup, never from info', () => {
      const { shadow } = showTrackedPanel();

      expect((shadow.querySelector('[part="source-text"]') as HTMLElement).textContent)
        .toBe('Summary');
      expect((shadow.querySelector('[part="current-edit"]') as HTMLTextAreaElement).value)
        .toBe('Summary');
    });
  });

  it('adopts the shared token sheet instead of declaring its own colours', () => {
    const panel = document.createElement('transl8-inspector-panel') as Transl8InspectorPanel;
    document.body.appendChild(panel);

    const shadow = panel.shadowRoot!;
    const own = Array.from(shadow.querySelectorAll('style'))
      .filter((s) => !s.hasAttribute('data-transl8-tokens'))
      .map((s) => s.textContent ?? '')
      .join('');

    expect(shadow.querySelector('style[data-transl8-tokens]')).not.toBeNull();
    expect(own).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own).not.toMatch(/rgba?\(/);
  });

  it('is addressable as a dialog and takes focus when shown', () => {
    const { panel, shadow } = showTrackedPanel();
    const dialog = shadow.querySelector('div[part="panel"]') as HTMLElement;

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Translation');
    expect(shadow.activeElement).toBe(dialog);
    expect(panel).toBeDefined();
  });

  describe('locale threading through strings.ts', () => {
    const lookup: SdkTranslationLookupResult = {
      key: 'checkout.submit',
      sourceText: 'Submit',
      value: 'Soumettre',
      version: 3,
      updatedAt: '2026-08-20T10:00:00.000Z',
    };

    it('renders chrome text sourced from getStrings when show() is called with locale: "en"', () => {
      panel.show(keyedInfo, lookup, 'en');
      panel.setCanEdit(true);
      panel.setCanPropose(true);

      expect(query(panel, 'div[part="panel"]').getAttribute('aria-label')).toBe('Translation');
      expect(query(panel, '[part="stale-banner"]').textContent).toContain('Updated by someone else.');
      expect(query(panel, 'button[part="stale-reload"]').textContent).toContain('Reload');
      expect(query(panel, 'summary').textContent).toContain('Details');
      expect(query(panel, 'button[part="ask-ai"]').textContent).toContain('Ask AI');
      expect(query(panel, 'button[part="report-issue"]').textContent).toContain('Report');
      expect(query(panel, 'button[part="apply"]').textContent).toContain('Apply');
      expect(query(panel, 'button[part="propose"]').textContent).toContain('Submit for review');
    });

    it('renders not-tracked/lookup-error copy from strings.ts', () => {
      panel.show(unkeyedInfo, undefined, 'en');
      expect(query(panel, '[part="not-tracked"]').textContent).toBe(
        'This element has no translation key.',
      );

      panel.showLookupError();
      expect(query(panel, '[part="lookup-error"]').textContent).toBe(
        "Couldn't load this translation. Please try again.",
      );
    });

    it('keeps status/label copy identical when locale: "en" is passed explicitly', () => {
      panel.show(keyedInfo, lookup, 'en');
      panel.setCanEdit(true);
      panel.setCanPropose(true);

      panel.setApplying(true);
      expect(query(panel, 'button[part="apply"]').textContent).toBe('Applying…');
      panel.setApplySuccess();
      expect(query(panel, '[part="apply-status"]').textContent).toBe('Translation applied.');
      panel.setApplyConflict();
      expect(query(panel, '[part="apply-status"]').textContent).toBe(
        'This translation was changed by someone else.',
      );
      panel.setApplyPermissionDenied();
      expect(query(panel, '[part="apply-status"]').textContent).toBe(
        "You don't have permission to apply it.",
      );

      panel.setProposing(true);
      expect(query(panel, 'button[part="propose"]').textContent).toBe('Submitting…');
      panel.setProposeSuccess();
      expect(query(panel, '[part="propose-status"]').textContent).toBe('Submitted for review.');
      panel.setProposeConflict();
      expect(query(panel, '[part="propose-status"]').textContent).toBe(
        'This translation was changed by someone else.',
      );
      panel.setProposeAlreadyPending();
      expect(query(panel, '[part="propose-status"]').textContent).toBe(
        'Already pending review.',
      );
      panel.setProposePermissionDenied();
      expect(query(panel, '[part="propose-status"]').textContent).toBe(
        "You don't have permission to submit this for review.",
      );

      panel.refreshTranslationFields({ ...lookup, value: '', version: 0 });
      expect(query(panel, '[part="updated-at"]').textContent).toBe('Not translated yet');
    });

    it('re-applies static strings on every show(), not just once at mount (fix round: connectedCallback-time freeze)', () => {
      panel.show(unkeyedInfo, undefined, 'en');

      // Corrupt the DOM the way a stale, mount-time-only render would have
      // left it — these assertions can only pass if show() actually
      // rewrites them on every call, not just once at connectedCallback.
      query(panel, '[part="not-tracked"]').textContent = 'CORRUPTED';
      query(panel, 'div[part="panel"]').setAttribute('aria-label', 'CORRUPTED');

      panel.show(unkeyedInfo, undefined, 'en');

      expect(query(panel, '[part="not-tracked"]').textContent).toBe(
        'This element has no translation key.',
      );
      expect(query(panel, 'div[part="panel"]').getAttribute('aria-label')).toBe('Translation');
    });

    it('refreshes the apply/propose idle default labels on every tracked show(), not frozen at mount', () => {
      panel.show(keyedInfo, lookup, 'en');
      panel.setCanEdit(true);
      panel.setCanPropose(true);

      // Corrupt the idle label the way a default frozen at mount time (and
      // never re-synced) would eventually go stale once a second locale
      // exists — this can only pass if applyBtnDefaultLabel/
      // proposeBtnDefaultLabel are refreshed before the next
      // setApplying(false)/setProposing(false) render reads them.
      (query(panel, 'button[part="apply"]') as HTMLButtonElement).innerHTML = 'STALE';
      (query(panel, 'button[part="propose"]') as HTMLButtonElement).innerHTML = 'STALE';

      panel.show(keyedInfo, lookup, 'en');

      expect(query(panel, 'button[part="apply"]').textContent).toContain('Apply');
      expect(query(panel, 'button[part="propose"]').textContent).toContain('Submit for review');
    });
  });

  describe('focus wiring across visible-paths (fix round 1)', () => {
    it('showLoading() moves focus into the panel and arms Escape on the loading state', () => {
      const panel = document.createElement('transl8-inspector-panel') as Transl8InspectorPanel;
      document.body.appendChild(panel);
      const shadow = panel.shadowRoot!;
      // What Escape DOES comes from sdk-client's dismissAction() table (a
      // state may have no legal exit at all); what this path owes is that
      // the trap is armed here and not only on show().
      const dismiss = vi.fn();
      panel.setDismiss(dismiss);

      panel.showLoading(unkeyedInfo);

      const dialog = shadow.querySelector('div[part="panel"]') as HTMLElement;
      expect(shadow.activeElement).toBe(dialog);

      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(dismiss).toHaveBeenCalledOnce();
    });

    it('showLookupError() moves focus into the panel and arms Escape on the error state', () => {
      const panel = document.createElement('transl8-inspector-panel') as Transl8InspectorPanel;
      document.body.appendChild(panel);
      const shadow = panel.shadowRoot!;
      // What Escape DOES comes from sdk-client's dismissAction() table (a
      // state may have no legal exit at all); what this path owes is that
      // the trap is armed here and not only on show().
      const dismiss = vi.fn();
      panel.setDismiss(dismiss);

      panel.showLookupError();

      const dialog = shadow.querySelector('div[part="panel"]') as HTMLElement;
      expect(shadow.activeElement).toBe(dialog);

      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(dismiss).toHaveBeenCalledOnce();
    });

    it('does not move focus a second time when showLoading() transitions to show() in the same open', () => {
      const panel = document.createElement('transl8-inspector-panel') as Transl8InspectorPanel;
      document.body.appendChild(panel);
      const shadow = panel.shadowRoot!;

      panel.showLoading(keyedInfo);

      // Simulate the user having moved focus inside the panel (e.g. into a
      // field) while the lookup was still in flight.
      const editField = shadow.querySelector('textarea[part="current-edit"]') as HTMLTextAreaElement;
      editField.focus();
      expect(shadow.activeElement).toBe(editField);

      panel.show(keyedInfo, {
        key: 'checkout.submit',
        sourceText: 'Submit',
        value: 'Soumettre',
        version: 3,
        updatedAt: '2026-08-20T10:00:00.000Z',
      });

      expect(shadow.activeElement).toBe(editField);
    });
  });
});
