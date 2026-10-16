import { describe, expect, it } from 'vitest';
import { ActionEngine } from './action';
import { reviewEnableAction, reviewDisableAction } from './review-mode-actions';
import { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';

describe('ActionEngine', () => {
  it('dispatches a registered action when the caller has the required permission', () => {
    const engine = new ActionEngine();
    engine.register(reviewEnableAction);
    const stateMachine = new ReviewSdkStateMachine();

    const result = engine.dispatch('review.enable', {
      permissions: ['review:create'],
      stateMachine,
    });

    expect(result.success).toBe(true);
    expect(stateMachine.state).toBe('review-mode-active');
  });

  it('refuses to dispatch when the caller lacks the required permission', () => {
    const engine = new ActionEngine();
    engine.register(reviewEnableAction);
    const stateMachine = new ReviewSdkStateMachine();

    const result = engine.dispatch('review.enable', {
      permissions: ['translation:read'],
      stateMachine,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/permission/i);
    expect(stateMachine.state).toBe('idle');
  });

  it('refuses to dispatch an unregistered action type', () => {
    const engine = new ActionEngine();
    const stateMachine = new ReviewSdkStateMachine();

    const result = engine.dispatch('does.not.exist', {
      permissions: ['review:create'],
      stateMachine,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/unknown/i);
  });

  it('review.disable transitions an active session back to idle', () => {
    const engine = new ActionEngine();
    engine.register(reviewEnableAction);
    engine.register(reviewDisableAction);
    const stateMachine = new ReviewSdkStateMachine();
    engine.dispatch('review.enable', { permissions: ['review:create'], stateMachine });

    const result = engine.dispatch('review.disable', {
      permissions: ['review:create'],
      stateMachine,
    });

    expect(result.success).toBe(true);
    expect(stateMachine.state).toBe('idle');
  });
});
