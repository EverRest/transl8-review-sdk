import { describe, expect, it, vi } from 'vitest';
import { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';
import { ActionEngine, type Action, type ActionContext } from './action';
import { reviewDisableAction, reviewEnableAction } from './review-mode-actions';

/**
 * `ActionEngine` is the permission gate between a report-only SDK key and one
 * that may drive review mode: `dispatch` refuses anything the session's
 * permissions do not cover, before the action ever runs. `launcher.test.ts`
 * exercises it through the UI; these tests pin the gate itself.
 *
 * The real state machine is used rather than a stub so a permission refusal is
 * asserted to leave actual state untouched, not just to return `success:false`.
 */
function contextWith(permissions: readonly string[]): ActionContext {
  return { permissions, stateMachine: new ReviewSdkStateMachine() };
}

describe('ActionEngine', () => {
  describe('permission gate', () => {
    it('runs an action when the permission is granted', () => {
      const engine = new ActionEngine();
      engine.register(reviewEnableAction);
      const context = contextWith(['review:create']);

      const result = engine.dispatch('review.enable', context);

      expect(result).toEqual({ success: true });
      expect(context.stateMachine.state).toBe('review-mode-active');
    });

    it('refuses an action whose permission is missing, and names it', () => {
      const engine = new ActionEngine();
      engine.register(reviewEnableAction);
      const context = contextWith(['translation:read']);

      const result = engine.dispatch('review.enable', context);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('review:create');
    });

    it('does not run the action body when the permission is missing', () => {
      const engine = new ActionEngine();
      const execute = vi.fn(() => ({ success: true }));
      engine.register({
        type: 'danger.apply',
        requiredPermission: 'translation:write',
        execute,
      });
      const context = contextWith(['review:create']);

      engine.dispatch('danger.apply', context);

      expect(execute).not.toHaveBeenCalled();
      // A refused action must not move the machine — a report-only session
      // that clicks a writer control stays exactly where it was.
      expect(context.stateMachine.state).toBe('idle');
    });

    it('refuses when the session has no permissions at all', () => {
      const engine = new ActionEngine();
      engine.register(reviewEnableAction);
      const context = contextWith([]);

      expect(engine.dispatch('review.enable', context).success).toBe(false);
      expect(context.stateMachine.state).toBe('idle');
    });

    it('matches permissions exactly, not by prefix', () => {
      const engine = new ActionEngine();
      engine.register(reviewEnableAction);

      // "review:createSomethingElse" must not satisfy "review:create".
      const context = contextWith(['review:createSomethingElse']);

      expect(engine.dispatch('review.enable', context).success).toBe(false);
    });
  });

  describe('dispatch', () => {
    it('reports an unknown action type without touching state', () => {
      const engine = new ActionEngine();
      const context = contextWith(['review:create']);

      const result = engine.dispatch('review.nope', context);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('review.nope');
      expect(context.stateMachine.state).toBe('idle');
    });

    it('checks the type before the permission for an unknown action', () => {
      const engine = new ActionEngine();

      const result = engine.dispatch('review.nope', contextWith([]));

      expect(result.reason).toContain('unknown action type');
    });

    it('passes the caller context straight through to the action', () => {
      const engine = new ActionEngine();
      const execute = vi.fn(() => ({ success: true }));
      engine.register({
        type: 'probe',
        requiredPermission: 'review:create',
        execute,
      });
      const context = contextWith(['review:create']);

      engine.dispatch('probe', context);

      expect(execute).toHaveBeenCalledWith(context);
    });

    it('surfaces a failing action verbatim', () => {
      const engine = new ActionEngine();
      engine.register({
        type: 'always.fails',
        requiredPermission: 'review:create',
        execute: () => ({ success: false, reason: 'backend said no' }),
      });

      expect(engine.dispatch('always.fails', contextWith(['review:create'])))
        .toEqual({ success: false, reason: 'backend said no' });
    });
  });

  describe('register', () => {
    it('keeps actions isolated per type', () => {
      const engine = new ActionEngine();
      engine.register(reviewEnableAction);
      engine.register(reviewDisableAction);
      const context = contextWith(['review:create']);

      expect(engine.dispatch('review.enable', context).success).toBe(true);
      expect(context.stateMachine.state).toBe('review-mode-active');
      expect(engine.dispatch('review.disable', context).success).toBe(true);
      expect(context.stateMachine.state).toBe('idle');
    });

    it('lets a later registration replace an earlier one of the same type', () => {
      const engine = new ActionEngine();
      const replacement: Action = {
        type: 'review.enable',
        requiredPermission: 'review:create',
        execute: () => ({ success: false, reason: 'replaced' }),
      };
      engine.register(reviewEnableAction);
      engine.register(replacement);

      const result = engine.dispatch(
        'review.enable',
        contextWith(['review:create']),
      );

      expect(result.reason).toBe('replaced');
    });
  });
});

describe('review mode actions', () => {
  it('both require review:create', () => {
    expect(reviewEnableAction.requiredPermission).toBe('review:create');
    expect(reviewDisableAction.requiredPermission).toBe('review:create');
  });

  it('reports failure when the transition is not legal from the current state', () => {
    // review.disable only leaves review-mode-active; from idle it is invalid,
    // so the action must report failure rather than silently claiming success.
    const context = contextWith(['review:create']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = reviewDisableAction.execute(context);

    expect(result.success).toBe(false);
    expect(context.stateMachine.state).toBe('idle');
    warn.mockRestore();
  });

  it('enable then disable returns the machine to idle', () => {
    const context = contextWith(['review:create']);

    expect(reviewEnableAction.execute(context).success).toBe(true);
    expect(context.stateMachine.state).toBe('review-mode-active');
    expect(reviewDisableAction.execute(context).success).toBe(true);
    expect(context.stateMachine.state).toBe('idle');
  });
});
