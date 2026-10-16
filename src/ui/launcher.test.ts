import { afterEach, describe, expect, it } from 'vitest';
// Side-effect import, kept separate from the type-only import below: this
// class is used only in `as Transl8Launcher` type positions in this file,
// which TS/esbuild's isolatedModules-style transform treats as a type-only
// import and elides — dropping launcher.ts's `customElements.define(...)`
// call with it, so `document.createElement('transl8-launcher')` never
// upgrades and `.configure` is undefined. See probe3-element.ts/probe3-ce
// for the minimal repro that found this.
import './launcher';
import { Transl8Launcher } from './launcher';
import { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';
import { ActionEngine } from '../actions/action';
import { reviewEnableAction, reviewDisableAction } from '../actions/review-mode-actions';

function makeLauncher() {
  const stateMachine = new ReviewSdkStateMachine();
  const actionEngine = new ActionEngine();
  actionEngine.register(reviewEnableAction);
  actionEngine.register(reviewDisableAction);
  const launcher = document.createElement('transl8-launcher') as Transl8Launcher;
  launcher.configure(stateMachine, actionEngine, ['review:create']);
  return { launcher, stateMachine };
}

describe('Transl8Launcher', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an icon-only button with no dropdown panel', () => {
    const { launcher } = makeLauncher();
    document.body.appendChild(launcher);

    const shadow = launcher.shadowRoot!;
    const button = shadow.querySelector('[part="button"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent).not.toContain('🌐');
    expect(button.getAttribute('aria-label')).toBe('Translation');
    expect(shadow.querySelector('[part="panel"]')).toBeNull();
    expect(shadow.querySelector('[part="toggle"]')).toBeNull();
  });

  it('shows the shortcut hint in the button title', () => {
    const { launcher } = makeLauncher();
    document.body.appendChild(launcher);

    const button = launcher.shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
    expect(button.title).toContain('Ctrl+Shift+T');
  });

  it('clicking the button toggles review mode on', () => {
    const { launcher, stateMachine } = makeLauncher();
    document.body.appendChild(launcher);
    const button = launcher.shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;

    button.click();

    expect(stateMachine.state).toBe('review-mode-active');
  });

  it('clicking the button again toggles review mode off', () => {
    const { launcher, stateMachine } = makeLauncher();
    document.body.appendChild(launcher);
    const button = launcher.shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;

    button.click();
    button.click();

    expect(stateMachine.state).toBe('idle');
  });

  it('the keyboard shortcut Ctrl+Shift+T toggles review mode', () => {
    const { launcher, stateMachine } = makeLauncher();
    document.body.appendChild(launcher);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'T' }),
    );

    expect(stateMachine.state).toBe('review-mode-active');
  });

  it('reflects external state changes via aria-pressed', () => {
    const { launcher, stateMachine } = makeLauncher();
    document.body.appendChild(launcher);
    const button = launcher.shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;

    stateMachine.transition('review.enable');

    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('carries active state on the host attribute, not by colour alone', () => {
    const { launcher, stateMachine } = makeLauncher();
    document.body.appendChild(launcher);
    const button = launcher.shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;

    expect(launcher.getAttribute('data-active')).toBe('false');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.style.background).toBe('');

    stateMachine.transition('review.enable');

    expect(launcher.getAttribute('data-active')).toBe('true');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders the shortcut and the key count as a visible label', () => {
    const { launcher } = makeLauncher();
    document.body.appendChild(launcher);
    launcher.setKeyCount(129);

    const label = launcher.shadowRoot!.querySelector('[part="label"]') as HTMLElement;
    expect(label.textContent).toContain('129');
  });

  it('drops the key count when review mode is switched off', () => {
    const { launcher, stateMachine } = makeLauncher();
    document.body.appendChild(launcher);
    stateMachine.transition('review.enable');
    launcher.setKeyCount(129);

    stateMachine.transition('review.disable');

    const label = launcher.shadowRoot!.querySelector('[part="count"]') as HTMLElement;
    expect(label.textContent).toBe('Review');
  });

  it('meets the 44px minimum target size', () => {
    const { launcher } = makeLauncher();
    document.body.appendChild(launcher);

    const own = Array.from(launcher.shadowRoot!.querySelectorAll('style'))
      .filter((s) => !s.hasAttribute('data-transl8-tokens'))
      .map((s) => s.textContent ?? '')
      .join('');
    expect(own).toContain('min-height: 44px');
  });

  it('stops listening for the keyboard shortcut after being removed from the DOM', () => {
    const { launcher, stateMachine } = makeLauncher();
    document.body.appendChild(launcher);
    launcher.remove();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'T' }),
    );

    expect(stateMachine.state).toBe('idle');
  });

  it('setLocale() keeps the key-count label correct', () => {
    const { launcher } = makeLauncher();
    document.body.appendChild(launcher);
    launcher.setKeyCount(3);

    launcher.setLocale('en');

    const label = launcher.shadowRoot!.querySelector('[part="count"]') as HTMLElement;
    expect(label.textContent).toBe('3 keys');
  });

  it('setLocale() updates the button aria-label and title from strings.ts', () => {
    const { launcher } = makeLauncher();
    document.body.appendChild(launcher);

    launcher.setLocale('en');

    const button = launcher.shadowRoot!.querySelector('[part="button"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Translation');
    expect(button.title).toBe('Review mode (Ctrl+Shift+T)');
  });
});
