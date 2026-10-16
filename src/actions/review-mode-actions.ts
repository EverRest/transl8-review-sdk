import type { Action } from './action';

export const reviewEnableAction: Action = {
  type: 'review.enable',
  requiredPermission: 'review:create',
  execute: (context) => ({
    success: context.stateMachine.transition('review.enable'),
  }),
};

export const reviewDisableAction: Action = {
  type: 'review.disable',
  requiredPermission: 'review:create',
  execute: (context) => ({
    success: context.stateMachine.transition('review.disable'),
  }),
};
