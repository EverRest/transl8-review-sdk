export type ReviewSDKState =
  | 'idle'
  | 'review-mode-active'
  | 'hovering'
  | 'element-selected'
  | 'inspector-open'
  | 'report-form-open'
  | 'submitting-report'
  | 'report-submitted'
  | 'ai-panel-open'
  | 'ai-analyzing'
  | 'ai-result'
  | 'ai-applying'
  | 'inspector-applying'
  | 'inspector-proposing';

export type ReviewSDKEvent =
  | 'review.enable'
  | 'review.disable'
  | 'element.hover'
  | 'element.unhover'
  | 'element.click'
  | 'context.resolved'
  | 'report.start'
  | 'report.cancel'
  | 'report.submit'
  | 'report.failed'
  | 'report.created'
  | 'inspector.close'
  | 'ai.start'
  | 'ai.cancel'
  | 'ai.submit'
  | 'ai.cancelRequest'
  | 'ai.succeeded'
  | 'ai.failed'
  | 'ai.close'
  | 'ai.apply'
  | 'ai.applySucceeded'
  | 'ai.applyFailed'
  | 'ai.applyConflict'
  | 'ai.createReport'
  | 'report.cancelFromAi'
  | 'inspector.apply'
  | 'inspector.applySucceeded'
  | 'inspector.applyFailed'
  | 'inspector.applyConflict'
  | 'inspector.propose'
  | 'inspector.proposeSucceeded'
  | 'inspector.proposeFailed'
  | 'inspector.proposeConflict'
  | 'inspector.staleDetected'
  | 'inspector.staleRefreshed';

export type StateChangeListener = (
  state: ReviewSDKState,
  previous: ReviewSDKState,
) => void;

/**
 * The full transition table. Only
 * idle <-> review-mode-active had a real UI trigger at first;
 * the rest exist so later features add trigger code, not type changes.
 */
const TRANSITIONS: Partial<
  Record<ReviewSDKState, Partial<Record<ReviewSDKEvent, ReviewSDKState>>>
> = {
  idle: { 'review.enable': 'review-mode-active' },
  // 'element.click' fires directly here (not only from 'hovering') when a
  // review-mode badge is clicked: badges render outside the tracked host
  // element's subtree, so hovering one never bubbles an 'element.hover' on
  // the host element first.
  'review-mode-active': { 'element.hover': 'hovering', 'element.click': 'element-selected' },
  // 'element.hover' self-loops here: the mouse re-targets to a different
  // translatable element without ever leaving the hovering state, and
  // 'element.unhover' is the mouse leaving the element entirely (mouseout
  // with no new target), dropping back to plain review mode.
  hovering: {
    'element.hover': 'hovering',
    'element.unhover': 'review-mode-active',
    'element.click': 'element-selected',
  },
  'element-selected': { 'context.resolved': 'inspector-open' },
  'inspector-open': {
    'report.start': 'report-form-open',
    // A reviewer must be able to just dismiss the Inspector without filing
    // a report — the table previously only allowed 'inspector.close' from
    // 'report-submitted' (end of the report flow), leaving no way back from
    // plain inspection.
    'inspector.close': 'review-mode-active',
    // Ask AI — parallel to report.start, same "step into a
    // sub-flow, with a way back" shape.
    'ai.start': 'ai-panel-open',
    // Manual apply from the inspector.
    'inspector.apply': 'inspector-applying',
    // Submit for review, distinct from apply: nothing
    // live changes until a dashboard reviewer approves.
    'inspector.propose': 'inspector-proposing',
    // A pushed translation.changed event matched the
    // currently-open key at a newer version. Self-loop: the Inspector
    // stays open, just shows a banner. staleRefreshed is the "Reload"
    // button, also a self-loop — the reload itself doesn't change state.
    'inspector.staleDetected': 'inspector-open',
    'inspector.staleRefreshed': 'inspector-open',
  },
  'report-form-open': {
    'report.submit': 'submitting-report',
    // The mockup's own "Cancel" button had nowhere to go — the table
    // previously only allowed leaving this state via submit.
    'report.cancel': 'inspector-open',
    // Return to AI result when the report form was opened from ai-result.
    'report.cancelFromAi': 'ai-result',
  },
  'submitting-report': {
    'report.created': 'report-submitted',
    // Without this, a failed POST /sdk/reviews (network error, 500) would
    // strand the UI in 'submitting-report' forever with no way to retry.
    'report.failed': 'report-form-open',
  },
  'report-submitted': { 'inspector.close': 'review-mode-active' },
  // Ask AI. Every state below has an explicit way back —
  // designed up front, because earlier states needed separate fixes for
  // exactly this class of dead-end.
  'ai-panel-open': {
    'ai.cancel': 'inspector-open',
    'ai.submit': 'ai-analyzing',
  },
  'ai-analyzing': {
    'ai.cancelRequest': 'ai-panel-open',
    'ai.succeeded': 'ai-result',
    'ai.failed': 'ai-panel-open',
  },
  'ai-result': {
    'ai.close': 'inspector-open',
    // Apply AI suggestion; every outcome returns to ai-result.
    'ai.apply': 'ai-applying',
    // Branch to prefilled report form.
    'ai.createReport': 'report-form-open',
  },
  'ai-applying': {
    'ai.applySucceeded': 'ai-result',
    'ai.applyFailed': 'ai-result',
    'ai.applyConflict': 'ai-result',
  },
  'inspector-applying': {
    'inspector.applySucceeded': 'inspector-open',
    'inspector.applyFailed': 'inspector-open',
    'inspector.applyConflict': 'inspector-open',
  },
  'inspector-proposing': {
    'inspector.proposeSucceeded': 'inspector-open',
    'inspector.proposeFailed': 'inspector-open',
    'inspector.proposeConflict': 'inspector-open',
  },
};

function resolveTransition(
  state: ReviewSDKState,
  event: ReviewSDKEvent,
): ReviewSDKState | undefined {
  if (event === 'review.disable' && state !== 'idle') {
    return 'idle';
  }
  return TRANSITIONS[state]?.[event];
}

export class ReviewSdkStateMachine {
  private currentState: ReviewSDKState = 'idle';
  private readonly listeners = new Set<StateChangeListener>();

  get state(): ReviewSDKState {
    return this.currentState;
  }

  transition(event: ReviewSDKEvent): boolean {
    const nextState = resolveTransition(this.currentState, event);
    if (!nextState) {
      console.warn(
        `[review-sdk] invalid state transition: "${event}" from "${this.currentState}"`,
      );
      return false;
    }
    const previous = this.currentState;
    this.currentState = nextState;
    for (const listener of this.listeners) {
      listener(nextState, previous);
    }
    return true;
  }

  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
