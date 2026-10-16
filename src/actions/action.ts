import type { ReviewSdkStateMachine } from '../state/review-sdk-state-machine';

export interface ActionContext {
  permissions: readonly string[];
  stateMachine: ReviewSdkStateMachine;
}

export interface ActionResult {
  success: boolean;
  reason?: string;
}

export interface Action {
  type: string;
  requiredPermission: string;
  execute(context: ActionContext): ActionResult;
}

export class ActionEngine {
  private readonly actions = new Map<string, Action>();

  register(action: Action): void {
    this.actions.set(action.type, action);
  }

  dispatch(type: string, context: ActionContext): ActionResult {
    const action = this.actions.get(type);
    if (!action) {
      return { success: false, reason: `unknown action type: "${type}"` };
    }
    if (!context.permissions.includes(action.requiredPermission)) {
      return {
        success: false,
        reason: `missing required permission: "${action.requiredPermission}"`,
      };
    }
    return action.execute(context);
  }
}
