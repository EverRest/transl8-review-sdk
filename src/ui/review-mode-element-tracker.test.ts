import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ReviewModeElementTracker } from './review-mode-element-tracker';
import { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';
// Side-effect import for the same isolatedModules-elision reason as
// highlight-overlay.test.ts / launcher.test.ts: Transl8ReviewModeBadges is
// only referenced in a type position (`as Transl8ReviewModeBadges`) below.
import './review-mode-badges';
import { Transl8ReviewModeBadges } from './review-mode-badges';

describe('ReviewModeElementTracker', () => {
  let stateMachine: ReviewSdkStateMachine;
  let badges: Transl8ReviewModeBadges;
  let tracker: ReviewModeElementTracker;
  let onSelect: ReturnType<typeof vi.fn>;
  let first: HTMLElement;
  let second: HTMLElement;

  beforeEach(() => {
    badges = document.createElement('transl8-review-mode-badges') as Transl8ReviewModeBadges;
    document.body.appendChild(badges);

    first = document.createElement('h1');
    first.setAttribute('data-translation-key', 'hero.title');
    first.textContent = 'Hello';
    document.body.appendChild(first);

    second = document.createElement('p');
    second.setAttribute('data-translation-key', 'hero.subtitle');
    second.textContent = 'World';
    document.body.appendChild(second);

    onSelect = vi.fn();
    stateMachine = new ReviewSdkStateMachine();
    tracker = new ReviewModeElementTracker(stateMachine, badges, onSelect);
  });

  afterEach(() => {
    tracker.stop();
    document.body.innerHTML = '';
  });

  function badgeButtons(): NodeListOf<HTMLButtonElement> {
    return badges.shadowRoot!.querySelectorAll('[part="badge"]');
  }

  /** MutationObserver callbacks run as a microtask, after the current task. */
  function flushMutations(): Promise<void> {
    return new Promise((resolve) => queueMicrotask(resolve));
  }

  it('renders no badges while idle', () => {
    tracker.start();

    expect(badgeButtons()).toHaveLength(0);
  });

  it('renders a badge for every [data-translation-key] element once review mode is enabled', () => {
    tracker.start();

    stateMachine.transition('review.enable');

    expect(badgeButtons()).toHaveLength(2);
  });

  it('renders badges for elements already tracked before start() when review mode is already active', () => {
    stateMachine.transition('review.enable');

    tracker.start();

    expect(badgeButtons()).toHaveLength(2);
  });

  it('excludes elements inside [data-transl8-sdk]', () => {
    const sdkContainer = document.createElement('div');
    sdkContainer.setAttribute('data-transl8-sdk', '');
    const sdkKeyedEl = document.createElement('span');
    sdkKeyedEl.setAttribute('data-translation-key', 'launcher.label');
    sdkContainer.appendChild(sdkKeyedEl);
    document.body.appendChild(sdkContainer);
    tracker.start();

    stateMachine.transition('review.enable');

    expect(badgeButtons()).toHaveLength(2);
  });

  it('excludes hidden elements', () => {
    first.hidden = true;
    tracker.start();

    stateMachine.transition('review.enable');

    expect(badgeButtons()).toHaveLength(1);
  });

  it('clears badges when review mode is disabled', () => {
    tracker.start();
    stateMachine.transition('review.enable');
    expect(badgeButtons()).toHaveLength(2);

    stateMachine.transition('review.disable');

    expect(badgeButtons()).toHaveLength(0);
  });

  it('repositions badges on scroll without changing the count', () => {
    tracker.start();
    stateMachine.transition('review.enable');

    window.dispatchEvent(new Event('scroll'));

    expect(badgeButtons()).toHaveLength(2);
  });

  it('repositions badges on resize without changing the count', () => {
    tracker.start();
    stateMachine.transition('review.enable');

    window.dispatchEvent(new Event('resize'));

    expect(badgeButtons()).toHaveLength(2);
  });

  it('stops reacting to review mode changes after stop()', () => {
    tracker.start();
    tracker.stop();

    stateMachine.transition('review.enable');

    expect(badgeButtons()).toHaveLength(0);
  });

  it('clicking a badge resolves the element info, advances state to inspector-open, and calls onSelect', () => {
    tracker.start();
    stateMachine.transition('review.enable');

    badgeButtons()[0].click();

    expect(stateMachine.state).toBe('inspector-open');
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0][0].element.translationKey).toBe('hero.title');
  });

  it('clicking a badge for an element that has gone hidden since the scan does not select or transition', () => {
    tracker.start();
    stateMachine.transition('review.enable');
    first.hidden = true;

    badgeButtons()[0].click();

    expect(stateMachine.state).toBe('review-mode-active');
    expect(onSelect).not.toHaveBeenCalled();
  });

  describe('reselecting from a state where element.click is rejected (§1a)', () => {
    it('clicking a different badge while the AI view is open forces the machine back to a genuine inspector-open and still calls onSelect', () => {
      tracker.start();
      stateMachine.transition('review.enable');
      badgeButtons()[0].click(); // -> inspector-open, inspecting `first`
      stateMachine.transition('ai.start'); // -> ai-panel-open
      onSelect.mockClear();

      badgeButtons()[1].click();

      // Before the fix this called onSelect() with the machine still stuck
      // on 'ai-panel-open' (both transitions silently rejected) — the exact
      // state desync that matters, since sdk-client.ts gates live stale-translation detection on
      // `state === 'inspector-open'`.
      expect(stateMachine.state).toBe('inspector-open');
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect.mock.calls[0][0].element.translationKey).toBe('hero.subtitle');
    });

    it('reselecting while already inspector-open is an ordinary no-op for the state machine (no forced review.disable/enable)', () => {
      tracker.start();
      stateMachine.transition('review.enable');
      badgeButtons()[0].click(); // -> inspector-open, inspecting `first`
      const transitionSpy = vi.spyOn(stateMachine, 'transition');
      onSelect.mockClear();

      badgeButtons()[1].click();

      // Harmless from inspector-open: the state is already exactly where it
      // should be, so select() must not force a review.disable/enable reset
      // (which would tear down and rebuild the badges) just to reselect.
      expect(transitionSpy).not.toHaveBeenCalledWith('review.disable');
      expect(stateMachine.state).toBe('inspector-open');
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect.mock.calls[0][0].element.translationKey).toBe('hero.subtitle');
    });
  });

  it('does not fire onCountChange(0) on scroll/resize while idle', () => {
    const onCountChange = vi.fn();
    tracker.onCountChange = onCountChange;
    tracker.start();

    // Review mode was never enabled — stateMachine.state stays 'idle'.
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(onCountChange).not.toHaveBeenCalled();
  });

  it('reports the on-screen element count to onCountChange when review mode is enabled', () => {
    const onCountChange = vi.fn();
    tracker.onCountChange = onCountChange;
    tracker.start();

    stateMachine.transition('review.enable');

    expect(onCountChange).toHaveBeenLastCalledWith(2);
  });

  it('reports a count of 0 to onCountChange once every tracked element is removed', async () => {
    const onCountChange = vi.fn();
    tracker.onCountChange = onCountChange;
    tracker.start();
    stateMachine.transition('review.enable');
    onCountChange.mockClear();

    first.remove();
    second.remove();
    await flushMutations();

    expect(onCountChange).toHaveBeenLastCalledWith(0);
  });

  describe('dynamic DOM (SPA / async-rendered content)', () => {
    it('adds a badge for an element inserted into the page after review mode is already active', async () => {
      tracker.start();
      stateMachine.transition('review.enable');
      expect(badgeButtons()).toHaveLength(2);

      const third = document.createElement('h2');
      third.setAttribute('data-translation-key', 'hero.tagline');
      document.body.appendChild(third);
      await flushMutations();

      expect(badgeButtons()).toHaveLength(3);
    });

    it('removes a badge for an element removed from the page', async () => {
      tracker.start();
      stateMachine.transition('review.enable');
      expect(badgeButtons()).toHaveLength(2);

      first.remove();
      await flushMutations();

      expect(badgeButtons()).toHaveLength(1);
    });

    it('adds a badge when an existing element gains a data-translation-key attribute', async () => {
      const untracked = document.createElement('span');
      document.body.appendChild(untracked);
      tracker.start();
      stateMachine.transition('review.enable');
      expect(badgeButtons()).toHaveLength(2);

      untracked.setAttribute('data-translation-key', 'footer.note');
      await flushMutations();

      expect(badgeButtons()).toHaveLength(3);
    });

    it('removes a badge when a tracked element loses its data-translation-key attribute', async () => {
      tracker.start();
      stateMachine.transition('review.enable');
      expect(badgeButtons()).toHaveLength(2);

      first.removeAttribute('data-translation-key');
      await flushMutations();

      expect(badgeButtons()).toHaveLength(1);
    });

    it('does not rescan on DOM mutations while idle', async () => {
      tracker.start();

      const third = document.createElement('h2');
      third.setAttribute('data-translation-key', 'hero.tagline');
      document.body.appendChild(third);
      await flushMutations();

      expect(badgeButtons()).toHaveLength(0);
    });

    it('stops rescanning on DOM mutations once review mode is disabled', async () => {
      tracker.start();
      stateMachine.transition('review.enable');
      stateMachine.transition('review.disable');

      const third = document.createElement('h2');
      third.setAttribute('data-translation-key', 'hero.tagline');
      document.body.appendChild(third);
      await flushMutations();

      expect(badgeButtons()).toHaveLength(0);
    });

    it('stops rescanning on DOM mutations after stop()', async () => {
      tracker.start();
      stateMachine.transition('review.enable');
      tracker.stop();

      const third = document.createElement('h2');
      third.setAttribute('data-translation-key', 'hero.tagline');
      document.body.appendChild(third);
      await flushMutations();

      expect(badgeButtons()).toHaveLength(0);
    });
  });
});
