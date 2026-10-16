import { describe, expect, it, vi, beforeEach } from 'vitest';
// Side-effect import, same isolatedModules-elision reason as the other
// custom-element test files in this directory.
import './report-form';
import { Transl8ReportForm } from './report-form';
import type { SdkReviewIssueType } from './report-issue-types';

function query(form: Transl8ReportForm, selector: string): HTMLElement {
  return form.shadowRoot!.querySelector(selector) as HTMLElement;
}

describe('Transl8ReportForm', () => {
  let form: Transl8ReportForm;

  beforeEach(() => {
    form = document.createElement('transl8-report-form') as Transl8ReportForm;
    document.body.appendChild(form);
  });

  it('is hidden by default', () => {
    expect(query(form, '[part="panel"]').style.display).toBe('none');
  });

  it('shows the form on show()', () => {
    form.show();
    expect(query(form, '[part="panel"]').style.display).toBe('block');
  });

  it('hides the form on hide()', () => {
    form.show();
    form.hide();
    expect(query(form, '[part="panel"]').style.display).toBe('none');
  });

  it('sets data-open on show() and removes it on hide()', () => {
    form.show();
    expect(query(form, '[part="panel"]').hasAttribute('data-open')).toBe(true);

    form.hide();
    expect(query(form, '[part="panel"]').hasAttribute('data-open')).toBe(false);
  });

  it('defaults to no issue type selected and an empty comment', () => {
    form.show();
    const checked = form.shadowRoot!.querySelector(
      'input[name="issue-type"]:checked',
    );
    expect(checked).toBeNull();
  });

  it('calls onSubmit with the selected type and comment, and does not submit without a type', () => {
    const onSubmit = vi.fn();
    form.onSubmit = onSubmit;
    form.show();

    query(form, 'button[part="submit"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();

    const grammarRadio = form.shadowRoot!.querySelector(
      'input[name="issue-type"][value="grammar"]',
    ) as HTMLInputElement;
    grammarRadio.checked = true;
    const textarea = query(form, 'textarea[part="comment"]') as HTMLTextAreaElement;
    textarea.value = 'There is a typo.';

    query(form, 'button[part="submit"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'grammar',
      comment: 'There is a typo.',
    });
  });

  it('omits comment from the submitted payload when left blank', () => {
    const onSubmit = vi.fn();
    form.onSubmit = onSubmit;
    form.show();
    (
      form.shadowRoot!.querySelector(
        'input[name="issue-type"][value="other"]',
      ) as HTMLInputElement
    ).checked = true;

    query(form, 'button[part="submit"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSubmit).toHaveBeenCalledWith({ type: 'other', comment: undefined });
  });

  it('calls onCancel and hides when Cancel is clicked', () => {
    const onCancel = vi.fn();
    form.onCancel = onCancel;
    form.show();

    query(form, 'button[part="cancel"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(query(form, '[part="panel"]').style.display).toBe('none');
  });

  it('shows a submitting state that disables the submit button', () => {
    form.show();

    form.setSubmitting(true);

    expect((query(form, 'button[part="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an error message and re-enables submit after setError', () => {
    form.show();
    form.setSubmitting(true);

    form.setError('Network error, please try again.');

    expect((query(form, 'button[part="submit"]') as HTMLButtonElement).disabled).toBe(false);
    expect(query(form, '[part="error"]').textContent).toBe('Network error, please try again.');
  });

  it('shows a success message and hides the form fields on showSuccess()', () => {
    form.show();

    form.showSuccess();

    expect(query(form, '[part="success"]').style.display).not.toBe('none');
    expect(query(form, '[part="fields"]').style.display).toBe('none');
  });

  it('calls onClose when the success state\'s close button is clicked', () => {
    const onClose = vi.fn();
    form.onClose = onClose;
    form.show();
    form.showSuccess();

    query(form, 'button[part="success-close"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onClose).toHaveBeenCalledOnce();
    expect(query(form, '[part="panel"]').style.display).toBe('none');
  });

  it('resets to a clean state (no type, no comment, no error) each time show() is called', () => {
    form.show();
    (
      form.shadowRoot!.querySelector(
        'input[name="issue-type"][value="other"]',
      ) as HTMLInputElement
    ).checked = true;
    (query(form, 'textarea[part="comment"]') as HTMLTextAreaElement).value = 'draft';
    form.setError('boom');
    form.showSuccess();

    form.show();

    expect(
      form.shadowRoot!.querySelector('input[name="issue-type"]:checked'),
    ).toBeNull();
    expect((query(form, 'textarea[part="comment"]') as HTMLTextAreaElement).value).toBe('');
    expect(query(form, '[part="error"]').textContent).toBe('');
    expect(query(form, '[part="fields"]').style.display).not.toBe('none');
    expect(query(form, '[part="success"]').style.display).toBe('none');
  });

  it('prefill selects type and comment after show()', () => {
    form.show();
    form.prefill({ type: 'grammar', comment: 'AI detected typo' });

    expect(
      (
        form.shadowRoot!.querySelector(
          'input[name="issue-type"][value="grammar"]',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect((query(form, 'textarea[part="comment"]') as HTMLTextAreaElement).value).toBe(
      'AI detected typo',
    );
  });

  it('does not throw when prefill()\'s type would break an unescaped attribute selector (CSS.escape)', () => {
    form.show();

    // `submission.type` is currently a closed 5-value enum in production
    // (never attacker-controlled), but prefill() builds a CSS attribute
    // selector from it. Without CSS.escape() a value containing a `"`
    // produces invalid selector syntax and querySelector() throws a
    // DOMException — matching dom-refresh.ts's already-escaped pattern
    // fixes that regardless of how `type` is constrained today.
    expect(() =>
      form.prefill({
        type: 'other"]' as SdkReviewIssueType,
        comment: undefined,
      }),
    ).not.toThrow();
  });

  it('adopts the shared token sheet instead of declaring its own colours', () => {
    const form = document.createElement('transl8-report-form') as Transl8ReportForm;
    document.body.appendChild(form);

    const shadow = form.shadowRoot!;
    const own = Array.from(shadow.querySelectorAll('style'))
      .filter((s) => !s.hasAttribute('data-transl8-tokens'))
      .map((s) => s.textContent ?? '')
      .join('');

    expect(shadow.querySelector('style[data-transl8-tokens]')).not.toBeNull();
    expect(own).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own).not.toMatch(/rgba?\(/);
  });

  it('is addressable as a dialog and takes focus when shown', () => {
    const shadow = form.shadowRoot!;

    form.show();

    const dialog = shadow.querySelector('div[part="panel"]') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Report an issue');
    expect(shadow.activeElement).toBe(dialog);
  });

  it('runs the dismiss the client installed when Escape is pressed, re-reading it on every keypress', () => {
    // Which exit Escape may take is the state machine's business, not the
    // form's ('report-submitted' accepts only 'inspector.close';
    // 'submitting-report' accepts nothing), and sdk-client's
    // dismissAction() is the single table that knows. The form only routes
    // Escape at whatever setDismiss() last installed, late-bound so a state
    // change mid-open takes effect without re-arming the trap.
    const first = vi.fn();
    const second = vi.fn();
    form.setDismiss(first);
    form.show();

    const dialog = form.shadowRoot!.querySelector('div[part="panel"]') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(first).toHaveBeenCalledOnce();

    form.showSuccess();
    form.setDismiss(second);
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

    form.show();
    form.show(); // no hide() in between

    expect(focusSpy).not.toHaveBeenCalled();
  });
});

describe('locale threading through strings.ts', () => {
  function query(f: Transl8ReportForm, selector: string): HTMLElement {
    return f.shadowRoot!.querySelector(selector) as HTMLElement;
  }

  it('renders chrome text sourced from getStrings when show() is called with locale: "en"', () => {
    const form = document.createElement('transl8-report-form') as Transl8ReportForm;
    document.body.appendChild(form);

    form.show('en');

    expect(query(form, 'div[part="panel"]').getAttribute('aria-label')).toBe('Report an issue');
    expect(
      (query(form, 'textarea[part="comment"]') as HTMLTextAreaElement).placeholder,
    ).toBe('Comment');
    expect(query(form, 'button[part="cancel"]').textContent).toBe('Cancel');
    expect(query(form, 'button[part="submit"]').textContent).toBe('Submit report');
    const labels = Array.from(
      form.shadowRoot!.querySelectorAll('label'),
    ).map((label) => label.textContent?.trim());
    expect(labels).toEqual([
      'Wrong translation',
      'Grammar / typo',
      'Wrong meaning',
      'Wrong language',
      'Other',
    ]);

    form.showSuccess();
    expect(query(form, 'div[part="success"] p').textContent).toBe('Report submitted. Thank you!');
    expect(query(form, 'button[part="success-close"]').textContent).toBe('Close');
  });

  it('re-applies static strings on every show(), not just once at mount (connectedCallback-time freeze guard)', () => {
    const form = document.createElement('transl8-report-form') as Transl8ReportForm;
    document.body.appendChild(form);

    form.show('en');

    // Corrupt the DOM the way a stale, mount-time-only render would have
    // left it — these assertions can only pass if show() actually rewrites
    // them on every call, not just once at connectedCallback.
    query(form, 'div[part="panel"]').setAttribute('aria-label', 'CORRUPTED');
    query(form, 'button[part="submit"]').textContent = 'CORRUPTED';
    query(form, '[part="issue-type-label-wrong_translation"]').textContent = 'CORRUPTED';

    form.show('en');

    expect(query(form, 'div[part="panel"]').getAttribute('aria-label')).toBe('Report an issue');
    expect(query(form, 'button[part="submit"]').textContent).toBe('Submit report');
    expect(form.shadowRoot!.querySelector('label')!.textContent?.trim()).toBe('Wrong translation');
  });
});
