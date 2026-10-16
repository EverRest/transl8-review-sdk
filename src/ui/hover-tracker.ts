import type { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';
import type { Transl8HighlightOverlay } from './highlight-overlay';

/**
 * Delegated hover detection. Listens on `document` (not per-element)
 * so it works with dynamically added elements without re-binding, matching
 * the pull-based approach `resolveElementContext` already uses for the same
 * reason (dynamic-DOM/SPA-navigation coverage).
 *
 * Only elements carrying `data-translation-key` are highlightable — the
 * fallback/heuristic detection path is deliberately out of scope
 * here (no host app needs it yet; matches the same YAGNI call already made
 * for the framework-adapter path).
 *
 * Purely visual: shows/hides the single-element highlight box on hover and
 * never touches clicks. Selecting an element to inspect is a review-mode
 * badge click (see ReviewModeElementTracker), not a click on the host
 * element — intercepting the host element's own click used to freeze it, but that fought the host page for control of links/buttons and
 * sometimes lost, letting the click navigate instead of opening the
 * inspector.
 */
export class HoverTracker {
  private currentTarget: Element | null = null;
  private mouseOverHandler: ((event: MouseEvent) => void) | undefined;
  private mouseOutHandler: ((event: MouseEvent) => void) | undefined;

  constructor(
    private readonly stateMachine: ReviewSdkStateMachine,
    private readonly overlay: Transl8HighlightOverlay,
  ) {}

  start(): void {
    this.mouseOverHandler = (event) => this.handleMouseOver(event);
    this.mouseOutHandler = (event) => this.handleMouseOut(event);
    document.addEventListener('mouseover', this.mouseOverHandler);
    document.addEventListener('mouseout', this.mouseOutHandler);
  }

  stop(): void {
    if (this.mouseOverHandler) {
      document.removeEventListener('mouseover', this.mouseOverHandler);
      this.mouseOverHandler = undefined;
    }
    if (this.mouseOutHandler) {
      document.removeEventListener('mouseout', this.mouseOutHandler);
      this.mouseOutHandler = undefined;
    }
    this.currentTarget = null;
  }

  private resolveMatch(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) {
      return null;
    }
    if (target.closest('[data-transl8-sdk]')) {
      return null;
    }
    return target.closest('[data-translation-key]');
  }

  private handleMouseOver(event: MouseEvent): void {
    const state = this.stateMachine.state;
    if (state !== 'review-mode-active' && state !== 'hovering') {
      return;
    }
    const matched = this.resolveMatch(event.target);
    if (!matched || matched === this.currentTarget) {
      return;
    }
    this.currentTarget = matched;
    this.stateMachine.transition('element.hover');
    this.overlay.show(matched.getBoundingClientRect());
  }

  private handleMouseOut(event: MouseEvent): void {
    if (this.stateMachine.state !== 'hovering' || !this.currentTarget) {
      return;
    }
    const related = event.relatedTarget;
    // Moving between descendants of the same matched element re-fires
    // mouseout/mouseover pairs without ever really leaving it.
    if (related instanceof Node && this.currentTarget.contains(related)) {
      return;
    }
    this.currentTarget = null;
    this.stateMachine.transition('element.unhover');
    this.overlay.hide();
  }
}
