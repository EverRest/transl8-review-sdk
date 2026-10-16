import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HoverTracker } from './hover-tracker';
import { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';
// Side-effect import for the same isolatedModules-elision reason as
// highlight-overlay.test.ts / launcher.test.ts: Transl8HighlightOverlay is
// only referenced in a type position (`as Transl8HighlightOverlay`) below.
import './highlight-overlay';
import { Transl8HighlightOverlay } from './highlight-overlay';

function mouseEvent(type: string, relatedTarget: EventTarget | null = null): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  return event;
}

describe('HoverTracker', () => {
  let stateMachine: ReviewSdkStateMachine;
  let overlay: Transl8HighlightOverlay;
  let tracker: HoverTracker;
  let target: HTMLElement;
  let child: HTMLElement;
  let outside: HTMLElement;

  beforeEach(() => {
    overlay = document.createElement('transl8-highlight-overlay') as Transl8HighlightOverlay;
    document.body.appendChild(overlay);

    target = document.createElement('h1');
    target.setAttribute('data-translation-key', 'hero.title');
    child = document.createElement('span');
    target.appendChild(child);
    document.body.appendChild(target);

    outside = document.createElement('div');
    document.body.appendChild(outside);

    stateMachine = new ReviewSdkStateMachine();
    tracker = new HoverTracker(stateMachine, overlay);
  });

  afterEach(() => {
    tracker.stop();
    document.body.innerHTML = '';
  });

  it('does nothing while review mode is idle', () => {
    tracker.start();

    target.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe('idle');
  });

  it('transitions to hovering and shows the overlay when a keyed element is hovered in review mode', () => {
    stateMachine.transition('review.enable');
    tracker.start();

    target.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe('hovering');
  });

  it('resolves the closest [data-translation-key] ancestor, not the literal event target', () => {
    stateMachine.transition('review.enable');
    tracker.start();

    child.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe('hovering');
  });

  it('does not re-transition when the mouse moves within the same matched element', () => {
    stateMachine.transition('review.enable');
    tracker.start();
    target.dispatchEvent(mouseEvent('mouseover'));
    const stateAfterFirstHover = stateMachine.state;

    child.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe(stateAfterFirstHover);
    expect(stateMachine.state).toBe('hovering');
  });

  it('stays hovering when the mouse moves to a child of the same matched element (mouseout then mouseover)', () => {
    stateMachine.transition('review.enable');
    tracker.start();
    target.dispatchEvent(mouseEvent('mouseover'));

    target.dispatchEvent(mouseEvent('mouseout', child));

    expect(stateMachine.state).toBe('hovering');
  });

  it('unhovers when the mouse leaves the matched element entirely', () => {
    stateMachine.transition('review.enable');
    tracker.start();
    target.dispatchEvent(mouseEvent('mouseover'));

    target.dispatchEvent(mouseEvent('mouseout', outside));

    expect(stateMachine.state).toBe('review-mode-active');
  });

  it('ignores elements without data-translation-key', () => {
    stateMachine.transition('review.enable');
    tracker.start();

    outside.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe('review-mode-active');
  });

  it('ignores elements inside [data-transl8-sdk] (SDK-owned UI)', () => {
    const sdkContainer = document.createElement('div');
    sdkContainer.setAttribute('data-transl8-sdk', '');
    const sdkKeyedEl = document.createElement('span');
    sdkKeyedEl.setAttribute('data-translation-key', 'launcher.label');
    sdkContainer.appendChild(sdkKeyedEl);
    document.body.appendChild(sdkContainer);
    stateMachine.transition('review.enable');
    tracker.start();

    sdkKeyedEl.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe('review-mode-active');
  });

  it('stops reacting to hover events after stop()', () => {
    stateMachine.transition('review.enable');
    tracker.start();
    tracker.stop();

    target.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe('review-mode-active');
  });

  it('re-targets to a newly hovered keyed element while already hovering', () => {
    const other = document.createElement('h2');
    other.setAttribute('data-translation-key', 'sub.title');
    document.body.appendChild(other);
    stateMachine.transition('review.enable');
    tracker.start();
    target.dispatchEvent(mouseEvent('mouseover'));

    other.dispatchEvent(mouseEvent('mouseover'));

    expect(stateMachine.state).toBe('hovering');
  });

  describe('click passthrough', () => {
    // Selecting an element to inspect is now exclusively a review-mode-badge
    // click (see ReviewModeElementTracker) — HoverTracker only ever shows/hides
    // the single-element highlight box on hover. It must never intercept a
    // click on the host element itself: that's what let clicking a translated
    // link navigate away instead of opening the inspector.
    it('never calls preventDefault/stopPropagation on a click, even while hovering a keyed element', () => {
      stateMachine.transition('review.enable');
      tracker.start();
      target.dispatchEvent(mouseEvent('mouseover'));

      const click = mouseEvent('click');
      const preventDefaultSpy = vi.spyOn(click, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(click, 'stopPropagation');
      target.dispatchEvent(click);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(stopPropagationSpy).not.toHaveBeenCalled();
    });

    it('does not transition state on click', () => {
      stateMachine.transition('review.enable');
      tracker.start();
      target.dispatchEvent(mouseEvent('mouseover'));

      target.dispatchEvent(mouseEvent('click'));

      expect(stateMachine.state).toBe('hovering');
    });
  });
});
