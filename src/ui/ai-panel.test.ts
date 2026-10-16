import { describe, expect, it, vi, beforeEach } from 'vitest';
// Side-effect import, same isolatedModules-elision reason as every other
// custom-element test file in this directory (see launcher.test.ts).
import './ai-panel';
import { Transl8AiPanel } from './ai-panel';

function query(panel: Transl8AiPanel, selector: string): HTMLElement {
  return panel.shadowRoot!.querySelector(selector) as HTMLElement;
}

describe('Transl8AiPanel', () => {
  let panel: Transl8AiPanel;

  beforeEach(() => {
    panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);
  });

  it('is hidden by default', () => {
    expect(query(panel, '[part="panel"]').style.display).toBe('none');
  });

  it('shows the panel on show()', () => {
    panel.show();
    expect(query(panel, '[part="panel"]').style.display).toBe('block');
  });

  it('sets data-open on show() and removes it on hide()', () => {
    panel.show();
    expect(query(panel, '[part="panel"]').hasAttribute('data-open')).toBe(true);

    panel.hide();
    expect(query(panel, '[part="panel"]').hasAttribute('data-open')).toBe(false);
  });

  it('sets data-open on showResultView()', () => {
    panel.showResultView({ intent: 'improve', confidenceBucket: 'high' });
    expect(query(panel, '[part="panel"]').hasAttribute('data-open')).toBe(true);
  });

  it('runs the analysis when an intent chip is clicked, without filling the textarea', () => {
    const onSubmit = vi.fn();
    panel.onSubmit = onSubmit;
    panel.show();

    query(panel, 'button[part="chip-improve"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onSubmit).toHaveBeenCalledWith('Improve this translation');
    expect(
      (query(panel, 'textarea[part="request"]') as HTMLTextAreaElement).value,
    ).toBe('');
  });

  it('does not call onSubmit with an empty request', () => {
    const onSubmit = vi.fn();
    panel.onSubmit = onSubmit;
    panel.show();

    query(panel, 'button[part="analyze"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the typed request', () => {
    const onSubmit = vi.fn();
    panel.onSubmit = onSubmit;
    panel.show();
    (query(panel, 'textarea[part="request"]') as HTMLTextAreaElement).value =
      'fix this';

    query(panel, 'button[part="analyze"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onSubmit).toHaveBeenCalledWith('fix this');
  });

  it('calls onCancel and hides when Cancel is clicked', () => {
    const onCancel = vi.fn();
    panel.onCancel = onCancel;
    panel.show();

    query(panel, 'button[part="cancel"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(query(panel, '[part="panel"]').style.display).toBe('none');
  });

  it('shows a cancellable analyzing state that disables Analyze', () => {
    panel.show();

    panel.setAnalyzing(true);

    expect(
      (query(panel, 'button[part="analyze"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(query(panel, '[part="cancel-request-row"]').style.display).not.toBe(
      'none',
    );
  });

  it('calls onCancelRequest when cancelling an in-flight request', () => {
    const onCancelRequest = vi.fn();
    panel.onCancelRequest = onCancelRequest;
    panel.show();
    panel.setAnalyzing(true);

    query(panel, 'button[part="cancel-request"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onCancelRequest).toHaveBeenCalledOnce();
  });

  it('shows an error and re-enables Analyze after setError', () => {
    panel.show();
    panel.setAnalyzing(true);

    panel.setError('AI is taking too long.');

    expect(
      (query(panel, 'button[part="analyze"]') as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(query(panel, '[part="error"]').textContent).toBe(
      'AI is taking too long.',
    );
  });

  it('renders a structured result without ever showing the raw confidence number', () => {
    panel.show();

    panel.showResult({
      intent: 'improve',
      issue: { type: 'grammar', severity: 'medium' },
      suggestion: { text: 'Подайте заявку', explanation: 'Corrected agreement.' },
      confidenceBucket: 'high',
    });

    expect(query(panel, '[part="result"]').style.display).not.toBe('none');
    expect(query(panel, '[part="suggestion-text"]').textContent).toBe(
      'Подайте заявку',
    );
    expect(query(panel, '[part="confidence"]').textContent).toBe(
      'High confidence',
    );
    expect(panel.shadowRoot!.textContent).not.toMatch(/0\.\d/);
  });

  it('renders matched glossary terms when the result includes them', () => {
    panel.show();

    panel.showResult({
      intent: 'improve',
      confidenceBucket: 'high',
      matchedTerms: [
        { sourceTerm: 'Submit', targetTerm: 'Подати', doNotTranslate: false },
        { sourceTerm: 'Widget', doNotTranslate: true },
      ],
    });

    const el = query(panel, '[part="glossary-terms"]');
    expect(el.style.display).not.toBe('none');
    expect(el.textContent).toContain('Submit');
    expect(el.textContent).toContain('Подати');
    expect(el.textContent).toContain('Widget');
  });

  it('renders a bare term, never a "→ undefined"/"→ null" arrow, for a do-not-translate term', () => {
    panel.show();

    panel.showResult({
      intent: 'improve',
      confidenceBucket: 'high',
      matchedTerms: [{ sourceTerm: 'Widget', doNotTranslate: true }],
    });

    const el = query(panel, '[part="glossary-terms"]');
    expect(el.textContent).toBe('Widget');
  });

  it('renders a bare term, not an arrow, when targetTerm is null (not do-not-translate, just not yet recorded)', () => {
    panel.show();

    panel.showResult({
      intent: 'improve',
      confidenceBucket: 'high',
      matchedTerms: [{ sourceTerm: 'Dashboard', targetTerm: null, doNotTranslate: false }],
    });

    const el = query(panel, '[part="glossary-terms"]');
    expect(el.textContent).toBe('Dashboard');
  });

  it('hides the glossary terms section when there are none', () => {
    panel.show();

    panel.showResult({
      intent: 'improve',
      confidenceBucket: 'high',
      matchedTerms: [],
    });

    expect(query(panel, '[part="glossary-terms"]').style.display).toBe('none');
  });

  it('calls onCloseResult when the result view is closed', () => {
    const onCloseResult = vi.fn();
    panel.onCloseResult = onCloseResult;
    panel.show();
    panel.showResult({ intent: 'explain', explanation: 'Because X.', confidenceBucket: 'medium' });

    query(panel, 'button[part="result-close"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onCloseResult).toHaveBeenCalledOnce();
  });

  it('resets to a clean input each time show() is called', () => {
    panel.show();
    (query(panel, 'textarea[part="request"]') as HTMLTextAreaElement).value =
      'draft';
    panel.setError('boom');

    panel.show();

    expect(
      (query(panel, 'textarea[part="request"]') as HTMLTextAreaElement).value,
    ).toBe('');
    expect(query(panel, '[part="error"]').textContent).toBe('');
    expect(query(panel, '[part="result"]').style.display).toBe('none');
  });

  describe('Apply', () => {
    const resultWithSuggestion = {
      intent: 'improve',
      suggestion: { text: 'Подайте заявку', explanation: 'Corrected agreement.' },
      confidenceBucket: 'high' as const,
    };

    function showResultWithSuggestion(canApply: boolean): void {
      panel.show();
      panel.showResult(resultWithSuggestion);
      panel.setCanApply(canApply);
    }

    it('hides Apply without translation.edit permission', () => {
      showResultWithSuggestion(false);

      expect(query(panel, 'button[part="apply"]').style.display).toBe('none');
    });

    it('shows Apply when translation.edit is granted and a suggestion exists', () => {
      showResultWithSuggestion(true);

      expect(query(panel, 'button[part="apply"]').style.display).not.toBe('none');
    });

    it('hides Apply when the AI result has no suggestion text', () => {
      panel.show();
      panel.showResult({
        intent: 'explain',
        explanation: 'Because X.',
        confidenceBucket: 'medium',
      });
      panel.setCanApply(true);

      expect(query(panel, 'button[part="apply"]').style.display).toBe('none');
    });

    it('calls onApply when Apply is clicked', () => {
      const onApply = vi.fn();
      panel.onApply = onApply;
      showResultWithSuggestion(true);

      query(panel, 'button[part="apply"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );

      expect(onApply).toHaveBeenCalledOnce();
    });

    it('keeps the check icon and the spec label on Apply across an open (F5)', () => {
      // show() -> reset() -> clearApplyFeedback() -> setApplying(false)
      // runs on every open, so a textContent assignment in setApplying()
      // destroyed the ${icon('check')} <svg> before the reviewer ever saw
      // the button. Spec §4.4 also names the control "Apply suggestion",
      // not "Apply".
      showResultWithSuggestion(true);

      panel.setApplying(true);
      panel.setApplying(false);

      const apply = query(panel, 'button[part="apply"]');
      expect(apply.querySelector('svg')).not.toBeNull();
      expect(apply.textContent).toBe('Apply suggestion');
    });

    it('shows an applying state that disables Apply', () => {
      showResultWithSuggestion(true);

      panel.setApplying(true);

      expect(
        (query(panel, 'button[part="apply"]') as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(query(panel, 'button[part="apply"]').textContent).toBe('Applying…');
    });

    it('shows a success message after apply succeeds', () => {
      showResultWithSuggestion(true);
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
      showResultWithSuggestion(true);

      panel.setApplyConflict();

      expect(query(panel, '[part="apply-status"]').textContent).toBe(
        'This translation was changed by someone else.',
      );
    });

    it('shows permission-denied copy on 403', () => {
      showResultWithSuggestion(true);

      panel.setApplyPermissionDenied();

      expect(query(panel, '[part="apply-status"]').textContent).toBe(
        "You don't have permission to apply it.",
      );
    });
  });

  describe('Create report', () => {
    it('shows Create report when the AI result includes an issue', () => {
      panel.show();
      panel.showResult({
        intent: 'improve',
        issue: { type: 'grammar', severity: 'medium' },
        suggestion: { text: 'Fixed', explanation: 'Grammar fix.' },
        confidenceBucket: 'high',
      });

      expect(query(panel, 'button[part="create-report"]').style.display).not.toBe('none');
    });

    it('hides Create report when the AI result has no issue', () => {
      panel.show();
      panel.showResult({
        intent: 'explain',
        explanation: 'Because X.',
        confidenceBucket: 'medium',
      });

      expect(query(panel, 'button[part="create-report"]').style.display).toBe('none');
    });

    it('calls onCreateReport when Create report is clicked', () => {
      const onCreateReport = vi.fn();
      panel.onCreateReport = onCreateReport;
      panel.show();
      panel.showResult({
        intent: 'improve',
        issue: { type: 'grammar', severity: 'medium' },
        suggestion: { text: 'Fixed', explanation: 'Grammar fix.' },
        confidenceBucket: 'high',
      });

      query(panel, 'button[part="create-report"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );

      expect(onCreateReport).toHaveBeenCalledOnce();
    });

    it('showResultView reopens the result without resetting the input form', () => {
      panel.show();
      (
        query(panel, 'textarea[part="request"]') as HTMLTextAreaElement
      ).value = 'draft';
      const result = {
        intent: 'improve',
        issue: { type: 'grammar', severity: 'medium' },
        suggestion: { text: 'Fixed', explanation: 'Grammar fix.' },
        confidenceBucket: 'high' as const,
      };
      panel.showResult(result);
      panel.hide();

      panel.showResultView(result);

      expect(query(panel, '[part="result"]').style.display).not.toBe('none');
      expect(query(panel, '[part="suggestion-text"]').textContent).toBe('Fixed');
    });
  });

  it('adopts the shared token sheet instead of declaring its own colours', () => {
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
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
});

describe('result view', () => {
  // The current value is passed straight into show(): a single call, no
  // ordering contract to get wrong. show() -> reset() clears any stale
  // currentValue from a previous element, then assigns the new one, so
  // there is no window where a caller could race it.
  function showPanelWith(result: Parameters<Transl8AiPanel['showResult']>[0], current = 'Summary') {
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);
    panel.setCanApply(true);
    panel.show(current);
    panel.showResult(result);
    return panel.shadowRoot!;
  }

  const base = {
    intent: 'improve',
    // A real AI analyze issue type (AI_TO_REPORT_TYPE's domain), not a
    // report type — and one whose curated label ('Inaccurate meaning')
    // differs from the naive fallback ('Meaning'), so tests against it
    // actually prove the curated map is wired up.
    issue: { type: 'meaning', severity: 'medium' },
    suggestion: { text: 'Overview', explanation: 'Labels a section, not a document.' },
    confidenceBucket: 'medium' as const,
  };

  it('renders confidence as a three-segment meter above the suggestion', () => {
    const shadow = showPanelWith(base);
    const meter = shadow.querySelector('[part="conf-meter"]')!;
    const suggestion = shadow.querySelector('[part="suggestion-text"]')!;

    expect(meter.children).toHaveLength(3);
    expect(meter.getAttribute('data-bucket')).toBe('medium');
    expect(meter.compareDocumentPosition(suggestion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the issue as a curated human label, not the raw enum or the naive fallback', () => {
    const shadow = showPanelWith(base);
    const chip = shadow.querySelector('[part="issue-chip"]') as HTMLElement;

    // 'meaning' -> 'Inaccurate meaning' is curated; the naive fallback
    // would produce 'Meaning'. An exact match proves the curated map, not
    // just the capitalize-and-underscore fallback, is what's wired to the DOM.
    expect(chip.textContent).toBe('Inaccurate meaning');
    expect(chip.textContent).not.toContain('meaning (medium)');
    expect(chip.getAttribute('data-severity')).toBe('medium');
  });

  it('diffs the suggestion against the current value', () => {
    const shadow = showPanelWith(base, 'Summary');

    expect((shadow.querySelector('[part="diff-del"]') as HTMLElement).textContent).toBe('Summary');
    expect((shadow.querySelector('[part="diff-ins"]') as HTMLElement).textContent).toBe('Overview');
  });

  it('demotes Apply from primary at low confidence', () => {
    const shadow = showPanelWith({ ...base, confidenceBucket: 'low' });
    const apply = shadow.querySelector('button[part="apply"]') as HTMLButtonElement;

    expect(apply.getAttribute('data-prominence')).toBe('ghost');
    expect(apply.disabled).toBe(false);
  });

  it('keeps Apply primary at high confidence', () => {
    const shadow = showPanelWith({ ...base, confidenceBucket: 'high' });
    const apply = shadow.querySelector('button[part="apply"]') as HTMLButtonElement;

    expect(apply.getAttribute('data-prominence')).toBe('primary');
  });

  describe('current value lifecycle', () => {
    it('hides the diff row when show() was called with no current value (does not render a bogus empty deletion)', () => {
      const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
      document.body.appendChild(panel);
      panel.setCanApply(true);
      panel.show();

      panel.showResult(base);

      const shadow = panel.shadowRoot!;
      expect((shadow.querySelector('[part="diff"]') as HTMLElement).style.display).toBe('none');
      expect((shadow.querySelector('[part="diff-del"]') as HTMLElement).textContent).toBe('');
    });

    it("shows the diff when show('') was called explicitly, even though the value is empty", () => {
      const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
      document.body.appendChild(panel);
      panel.setCanApply(true);
      panel.show('');

      panel.showResult(base);

      const shadow = panel.shadowRoot!;
      expect((shadow.querySelector('[part="diff"]') as HTMLElement).style.display).not.toBe('none');
      expect((shadow.querySelector('[part="diff-del"]') as HTMLElement).textContent).toBe('');
      expect((shadow.querySelector('[part="diff-ins"]') as HTMLElement).textContent).toBe('Overview');
    });

    it('reset() clears a stale current value so a later show() with no argument cannot diff a new suggestion against a previous element', () => {
      const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
      document.body.appendChild(panel);
      panel.setCanApply(true);
      panel.show('Summary');
      panel.showResult(base);
      expect(
        (panel.shadowRoot!.querySelector('[part="diff"]') as HTMLElement).style.display,
      ).not.toBe('none');

      panel.show(); // reopened for a new element with no current value passed
      panel.showResult(base);

      expect(
        (panel.shadowRoot!.querySelector('[part="diff"]') as HTMLElement).style.display,
      ).toBe('none');
    });
  });
});

describe('intent chips', () => {
  it('run the analysis on click instead of filling the textarea', () => {
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);
    const submitted: string[] = [];
    panel.onSubmit = (request) => submitted.push(request);
    panel.show();

    (panel.shadowRoot!.querySelector('button[part="chip-improve"]') as HTMLButtonElement).click();

    expect(submitted).toEqual(['Improve this translation']);
    expect((panel.shadowRoot!.querySelector('textarea[part="request"]') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('dialog semantics', () => {
  it('is addressable as a dialog and takes focus when shown', () => {
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);
    const shadow = panel.shadowRoot!;

    panel.show();

    const dialog = shadow.querySelector('div[part="panel"]') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Translation AI');
    expect(shadow.activeElement).toBe(dialog);
  });

  it('runs the dismiss the client installed when Escape is pressed, re-reading it on every keypress', () => {
    // Escape does NOT get its own view-local mapping any more: which exit
    // is legal depends on the state machine ('ai-result' accepts only
    // 'ai.close'; 'ai-analyzing' accepts nothing at all), and a second,
    // independently-maintained table is how Escape came to fire an illegal
    // close from an in-flight state while the header button correctly
    // refused. sdk-client's dismissAction() owns it; this panel only has to
    // route Escape at whatever setDismiss() last installed, late-bound.
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);
    const shadow = panel.shadowRoot!;
    const first = vi.fn();
    const second = vi.fn();

    panel.setDismiss(first);
    panel.show('Summary');
    const dialog = shadow.querySelector('div[part="panel"]') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(first).toHaveBeenCalledOnce();

    // Repointed mid-open — the trap is armed once, so this must not need a
    // re-arm to take effect.
    panel.setDismiss(second);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(second).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
  });

  it('calling show() twice without hide() does not re-trap focus a second time', () => {
    // Without the ensureFocus() guard, a second show() would call
    // releaseFocus?.() (restoring focus to the opener) before re-arming a
    // new trap — an observable extra focus() call on the opener, even
    // though the end state looks identical. The guard makes the second
    // show() a no-op instead.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const focusSpy = vi.spyOn(opener, 'focus');
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);

    panel.show();
    panel.show(); // no hide() in between

    expect(focusSpy).not.toHaveBeenCalled();
  });
});

describe('locale threading through strings.ts', () => {
  it('renders chrome text sourced from getStrings when show() is called with locale: "en"', () => {
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);

    panel.show(undefined, 'en');

    expect(query(panel, 'div[part="panel"]').getAttribute('aria-label')).toBe('Translation AI');
    expect(
      (query(panel, 'textarea[part="request"]') as HTMLTextAreaElement).placeholder,
    ).toBe('Or ask anything...');
    expect(query(panel, 'button[part="chip-improve"]').textContent).toBe('Improve translation');
    expect(query(panel, 'button[part="chip-check"]').textContent).toBe('Check for errors');
    expect(query(panel, 'button[part="chip-explain"]').textContent).toBe('Explain translation');
    expect(query(panel, 'button[part="cancel-request"]').textContent).toBe('Cancel request');
    expect(query(panel, 'button[part="cancel"]').textContent).toBe('Cancel');
    expect(query(panel, 'button[part="analyze"]').textContent).toBe('Analyze');
    expect(query(panel, 'button[part="result-close"]').textContent).toContain('Back');

    panel.showResult({
      intent: 'improve',
      issue: { type: 'grammar', severity: 'medium' },
      suggestion: { text: 'Fixed', explanation: 'Grammar fix.' },
      confidenceBucket: 'high',
    });

    expect(query(panel, '[part="confidence"]').textContent).toBe('High confidence');
    expect(query(panel, 'button[part="create-report"]').textContent).toContain('Create report');
    // The issue chip's curated label (map-ai-issue-to-
    // report-type.ts's humanIssueLabel()) is a sibling of this same
    // showResult() render site and must thread this.currentLocale too.
    expect(query(panel, '[part="issue-chip"]').textContent).toBe('Grammar / typo');
  });

  it('keeps status/label copy identical when locale: "en" is passed explicitly', () => {
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);
    panel.setCanApply(true);
    panel.show('Summary', 'en');
    panel.showResult({
      intent: 'improve',
      suggestion: { text: 'Overview', explanation: 'Because.' },
      confidenceBucket: 'medium',
    });

    panel.setApplying(true);
    expect(query(panel, 'button[part="apply"]').textContent).toBe('Applying…');
    panel.setApplying(false);
    expect(query(panel, 'button[part="apply"]').textContent).toBe('Apply suggestion');
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
  });

  it('re-applies static strings on every show(), not just once at mount (connectedCallback-time freeze guard)', () => {
    const panel = document.createElement('transl8-ai-panel') as Transl8AiPanel;
    document.body.appendChild(panel);

    panel.show(undefined, 'en');

    // Corrupt the DOM the way a stale, mount-time-only render would have
    // left it — these assertions can only pass if show() actually rewrites
    // them on every call, not just once at connectedCallback.
    query(panel, 'div[part="panel"]').setAttribute('aria-label', 'CORRUPTED');
    query(panel, 'button[part="cancel"]').textContent = 'CORRUPTED';
    query(panel, 'button[part="chip-improve"]').textContent = 'CORRUPTED';

    panel.show(undefined, 'en');

    expect(query(panel, 'div[part="panel"]').getAttribute('aria-label')).toBe('Translation AI');
    expect(query(panel, 'button[part="cancel"]').textContent).toBe('Cancel');
    expect(query(panel, 'button[part="chip-improve"]').textContent).toBe('Improve translation');
  });
});
