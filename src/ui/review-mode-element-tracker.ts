import type { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';
import type { Transl8ReviewModeBadges } from './review-mode-badges';
import {
  extractElementInfo,
  isHidden,
  type ResolvedElementInfo,
} from '../context/element-context-resolver';

/**
 * Scans the host page for every `[data-translation-key]` element and keeps a
 * review-mode badge on each one for as long as review mode is active,
 * repositioning them on scroll/resize. This is the sole way to select an
 * element for inspection now (see HoverTracker) — clicking a badge resolves
 * that element's info and drives the same state-machine path a hovered click
 * used to.
 *
 * Rescans whenever the DOM changes while review mode is active — a
 * MutationObserver on `document.body` for added/removed nodes and for
 * `data-translation-key` attribute changes, covering SPA content that
 * mounts, paginates, or gets its translation-tracking attribute applied
 * asynchronously after review mode is already on. Mutation records
 * themselves aren't inspected; any observed change just triggers a full
 * requery, since that's already what a scan does and the extra cost is
 * negligible next to a real layout/paint.
 */
export class ReviewModeElementTracker {
  private elements: Element[] = [];
  private unsubscribe: (() => void) | undefined;
  private scrollHandler: (() => void) | undefined;
  private resizeHandler: (() => void) | undefined;
  private mutationObserver: MutationObserver | undefined;

  /** Optional sink for the on-screen translatable-element count (the launcher). */
  onCountChange: ((count: number) => void) | undefined;

  /** Chrome locale for the badges' own text (aria-label, "Edit" pill) — see `setLocale`. */
  private locale: string | undefined;

  constructor(
    private readonly stateMachine: ReviewSdkStateMachine,
    private readonly badges: Transl8ReviewModeBadges,
    private readonly onSelect: (info: ResolvedElementInfo, element: Element) => void,
  ) {}

  /**
   * Updates the locale the badges render their text in and, while review
   * mode is actually on, re-renders them immediately — unlike
   * `onCountChange`, this can't wait for the next scan/reposition trigger
   * (scroll, resize, a DOM mutation, or a state-machine cycle).
   * `sdk.onLocaleChange` (sdk-client.ts) only forces a disable/re-enable
   * rescan while a shell panel is open (`PANEL_OPEN_STATES`);
   * 'review-mode-active'/'hovering' — badges visible, no panel — aren't in
   * that set, so without this the badges would keep showing stale-locale
   * text until something unrelated happened to reposition them.
   *
   * Guarded to non-'idle' states: `reposition()`'s zero-elements branch
   * calls `onCountChange?.(0)` unconditionally (it has no state check of its
   * own — `start()`'s idle handler bypasses it entirely, going straight to
   * `this.elements = []; this.badges.clear()`), and that 0 flows straight
   * into `Transl8Launcher.setKeyCount(0)`, which unconditionally repaints
   * the launcher's label from "Review" to "0 keys". Calling `setLocale()`
   * while idle (the common case — most `setLocale()` calls happen with
   * review mode off) would otherwise corrupt the launcher's idle label for
   * no on-screen benefit, since there are no badges to refresh in 'idle'
   * anyway.
   */
  setLocale(locale: string | undefined): void {
    this.locale = locale;
    if (this.stateMachine.state !== 'idle') {
      this.reposition();
    }
  }

  start(): void {
    this.unsubscribe = this.stateMachine.subscribe((state, previous) => {
      if (state !== 'idle' && previous === 'idle') {
        this.scan();
        this.startObserving();
      } else if (state === 'idle') {
        this.stopObserving();
        this.elements = [];
        this.badges.clear();
      }
    });
    if (this.stateMachine.state !== 'idle') {
      this.scan();
      this.startObserving();
    }

    this.scrollHandler = () => this.reposition();
    this.resizeHandler = () => this.reposition();
    // Capture phase: scrolling inside a nested scrollable container doesn't
    // bubble a 'scroll' event to window otherwise.
    window.addEventListener('scroll', this.scrollHandler, true);
    window.addEventListener('resize', this.resizeHandler);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.stopObserving();
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, true);
      this.scrollHandler = undefined;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }
    this.elements = [];
    this.badges.clear();
  }

  private startObserving(): void {
    if (this.mutationObserver) {
      return;
    }
    this.mutationObserver = new MutationObserver(() => this.scan());
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-translation-key'],
    });
  }

  private stopObserving(): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = undefined;
  }

  private scan(): void {
    this.elements = Array.from(
      document.querySelectorAll('[data-translation-key]'),
    ).filter((el) => !el.closest('[data-transl8-sdk]') && !isHidden(el));
    this.reposition();
  }

  private reposition(): void {
    if (this.elements.length === 0) {
      this.badges.clear();
      // Fired unconditionally, so an ordinary scroll/resize
      // while idle flipped the launcher's persistent "Review" label to
      // "0 keys" with no user action related to review mode at all. Fixed
      // at the source rather than guarding every caller (start()'s
      // scroll/resize listeners, setLocale()) individually.
      if (this.stateMachine.state !== 'idle') {
        this.onCountChange?.(0);
      }
      return;
    }
    this.badges.render(
      this.elements.map((el) => ({
        rect: el.getBoundingClientRect(),
        onClick: () => this.select(el),
      })),
      this.locale,
    );
    this.onCountChange?.(this.elements.length);
  }

  private select(el: Element): void {
    // Re-checked at click time (not reused from the scan) in case the
    // element went hidden/SDK-owned since — same rationale HoverTracker's
    // click handling used to apply before selection moved to badges.
    const info = extractElementInfo(el);
    if (!info) {
      return;
    }

    // 'element.click' is only accepted from 'review-mode-active' and
    // 'hovering' — clicking a badge from any other state (an open AI/report
    // view, or a mid-flight apply/propose/analyze) is rejected by the state
    // machine. `onSelect(info)` below always shows the Inspector regardless
    // (that's the whole point of clicking a badge), so simply ignoring the
    // rejection — the previous behavior — left the machine stuck on e.g.
    // 'ai-panel-open' while the Inspector was genuinely on screen: exactly
    // the state desync that matters, since sdk-client.ts gates live stale-translation detection on
    // `state === 'inspector-open'`.
    //
    // 'inspector-open' is exempted below: the machine has no state modeling
    // "the Inspector is open for a *different* element", so reselecting a
    // new badge while already inspecting one is ordinary, everyday
    // behavior — both transitions are rejected (there is no 'element.click'
    // or 'context.resolved' edge out of 'inspector-open') yet the state is
    // already exactly where it should be, and forcing the reset below on
    // every ordinary reselect would repaint the badges for no reason.
    //
    // For every other state, 'review.disable' is legal (it always is, from
    // any non-idle state — the same escape hatch sdk-client.ts's
    // `sdk.onLocaleChange` already uses to force a panel closed without a
    // state-machine change) so resetting through it and straight back into
    // review mode always lands on 'review-mode-active', from which
    // 'element.click' / 'context.resolved' are both ordinary, legal edges —
    // ending on a genuine 'inspector-open' that matches what the UI is
    // about to show, rather than a rejected transition papered over by the
    // UI proceeding anyway.
    if (this.stateMachine.state !== 'inspector-open') {
      if (!this.stateMachine.transition('element.click')) {
        // 'review.disable' below reaches this tracker's own subscription
        // (this.start()), which clears the badges — destroying the button
        // that badges.ts just focused before calling this — and
        // 'review.enable' rescans and rebuilds them as new elements.
        // Re-focus the rebuilt badge for the same host element afterward
        // (cheap fix, chosen over never tearing down the badge layer for
        // this internal resync: that would mean the tracker's idle
        // subscription treating a real "left review mode" differently from
        // this synthetic one, which is a bigger, riskier change for the
        // same result) so `trapPanelFocus` — wired a few lines later, once
        // `onSelect(info)` shows the Inspector — still captures a real
        // opener instead of `<body>`.
        this.stateMachine.transition('review.disable');
        this.stateMachine.transition('review.enable');
        const index = this.elements.indexOf(el);
        if (index !== -1) {
          this.badges.focusBadgeAt(index);
        }
        this.stateMachine.transition('element.click');
      }
      this.stateMachine.transition('context.resolved');
    }
    this.onSelect(info, el);
  }
}
