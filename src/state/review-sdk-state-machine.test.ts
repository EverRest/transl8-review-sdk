import { describe, expect, it, vi } from 'vitest';
import { ReviewSdkStateMachine } from './review-sdk-state-machine';

describe('ReviewSdkStateMachine', () => {
  it('starts idle', () => {
    const machine = new ReviewSdkStateMachine();
    expect(machine.state).toBe('idle');
  });

  it('transitions idle -> review-mode-active on review.enable and notifies listeners', () => {
    const machine = new ReviewSdkStateMachine();
    const listener = vi.fn();
    machine.subscribe(listener);

    const ok = machine.transition('review.enable');

    expect(ok).toBe(true);
    expect(machine.state).toBe('review-mode-active');
    expect(listener).toHaveBeenCalledWith('review-mode-active', 'idle');
  });

  it('rejects an invalid transition, logs a warning, and leaves state unchanged', () => {
    const machine = new ReviewSdkStateMachine();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ok = machine.transition('element.hover'); // idle has no element.hover transition

    expect(ok).toBe(false);
    expect(machine.state).toBe('idle');
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('re-targets hover to a different element without leaving the hovering state', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover'); // -> hovering

    const ok = machine.transition('element.hover'); // mouse moved to another element

    expect(ok).toBe(true);
    expect(machine.state).toBe('hovering');
  });

  it('transitions hovering -> review-mode-active on element.unhover', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover'); // -> hovering

    const ok = machine.transition('element.unhover');

    expect(ok).toBe(true);
    expect(machine.state).toBe('review-mode-active');
  });

  it('transitions review-mode-active -> element-selected on element.click without requiring a prior hover (review badge click)', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');

    const ok = machine.transition('element.click');

    expect(ok).toBe(true);
    expect(machine.state).toBe('element-selected');
  });

  it('closes the inspector back to review-mode-active without requiring a report', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved'); // -> inspector-open

    const ok = machine.transition('inspector.close');

    expect(ok).toBe(true);
    expect(machine.state).toBe('review-mode-active');
  });

  it('cancels the report form back to inspector-open without submitting', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved'); // -> inspector-open
    machine.transition('report.start'); // -> report-form-open

    const ok = machine.transition('report.cancel');

    expect(ok).toBe(true);
    expect(machine.state).toBe('inspector-open');
  });

  it('returns to report-form-open on report.failed, letting the reviewer retry', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved');
    machine.transition('report.start');
    machine.transition('report.submit'); // -> submitting-report

    const ok = machine.transition('report.failed');

    expect(ok).toBe(true);
    expect(machine.state).toBe('report-form-open');
  });

  it('allows review.disable from any non-idle state, resetting to idle', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover'); // -> hovering

    const ok = machine.transition('review.disable');

    expect(ok).toBe(true);
    expect(machine.state).toBe('idle');
  });

  it('opens the AI panel from inspector-open', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved'); // -> inspector-open

    const ok = machine.transition('ai.start');

    expect(ok).toBe(true);
    expect(machine.state).toBe('ai-panel-open');
  });

  it('cancels the AI panel back to inspector-open without submitting', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved');
    machine.transition('ai.start');

    const ok = machine.transition('ai.cancel');

    expect(ok).toBe(true);
    expect(machine.state).toBe('inspector-open');
  });

  it('moves through submit -> analyzing -> result on success', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved');
    machine.transition('ai.start');
    machine.transition('ai.submit');

    expect(machine.state).toBe('ai-analyzing');

    const ok = machine.transition('ai.succeeded');

    expect(ok).toBe(true);
    expect(machine.state).toBe('ai-result');
  });

  it('returns to the AI panel on ai.failed, letting the reviewer retry', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved');
    machine.transition('ai.start');
    machine.transition('ai.submit');

    const ok = machine.transition('ai.failed');

    expect(ok).toBe(true);
    expect(machine.state).toBe('ai-panel-open');
  });

  it('returns to the AI panel on ai.cancelRequest, cancelling an in-flight request', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved');
    machine.transition('ai.start');
    machine.transition('ai.submit');

    const ok = machine.transition('ai.cancelRequest');

    expect(ok).toBe(true);
    expect(machine.state).toBe('ai-panel-open');
  });

  it('closes the AI result back to inspector-open', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved');
    machine.transition('ai.start');
    machine.transition('ai.submit');
    machine.transition('ai.succeeded');

    const ok = machine.transition('ai.close');

    expect(ok).toBe(true);
    expect(machine.state).toBe('inspector-open');
  });

  it('allows review.disable from any new AI state, resetting to idle', () => {
    const machine = new ReviewSdkStateMachine();
    machine.transition('review.enable');
    machine.transition('element.hover');
    machine.transition('element.click');
    machine.transition('context.resolved');
    machine.transition('ai.start');
    machine.transition('ai.submit'); // -> ai-analyzing

    const ok = machine.transition('review.disable');

    expect(ok).toBe(true);
    expect(machine.state).toBe('idle');
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const machine = new ReviewSdkStateMachine();
    const listener = vi.fn();
    const unsubscribe = machine.subscribe(listener);
    unsubscribe();

    machine.transition('review.enable');

    expect(listener).not.toHaveBeenCalled();
  });

  describe('apply transitions', () => {
    function reachAiResult(machine: ReviewSdkStateMachine): void {
      machine.transition('review.enable');
      machine.transition('element.hover');
      machine.transition('element.click');
      machine.transition('context.resolved');
      machine.transition('ai.start');
      machine.transition('ai.submit');
      machine.transition('ai.succeeded');
    }

    function reachInspectorOpen(machine: ReviewSdkStateMachine): void {
      machine.transition('review.enable');
      machine.transition('element.hover');
      machine.transition('element.click');
      machine.transition('context.resolved');
    }

    it('moves ai-result -> ai-applying -> ai-result on ai.applySucceeded', () => {
      const machine = new ReviewSdkStateMachine();
      reachAiResult(machine);

      expect(machine.transition('ai.apply')).toBe(true);
      expect(machine.state).toBe('ai-applying');

      expect(machine.transition('ai.applySucceeded')).toBe(true);
      expect(machine.state).toBe('ai-result');
    });

    it('returns ai-result on ai.applyFailed, letting the reviewer retry', () => {
      const machine = new ReviewSdkStateMachine();
      reachAiResult(machine);
      machine.transition('ai.apply');

      expect(machine.transition('ai.applyFailed')).toBe(true);
      expect(machine.state).toBe('ai-result');
    });

    it('returns ai-result on ai.applyConflict, letting the reviewer refresh', () => {
      const machine = new ReviewSdkStateMachine();
      reachAiResult(machine);
      machine.transition('ai.apply');

      expect(machine.transition('ai.applyConflict')).toBe(true);
      expect(machine.state).toBe('ai-result');
    });

    it('moves inspector-open -> inspector-applying -> inspector-open on inspector.applySucceeded', () => {
      const machine = new ReviewSdkStateMachine();
      reachInspectorOpen(machine);

      expect(machine.transition('inspector.apply')).toBe(true);
      expect(machine.state).toBe('inspector-applying');

      expect(machine.transition('inspector.applySucceeded')).toBe(true);
      expect(machine.state).toBe('inspector-open');
    });

    it('returns inspector-open on inspector.applyFailed, letting the reviewer retry', () => {
      const machine = new ReviewSdkStateMachine();
      reachInspectorOpen(machine);
      machine.transition('inspector.apply');

      expect(machine.transition('inspector.applyFailed')).toBe(true);
      expect(machine.state).toBe('inspector-open');
    });

    it('returns inspector-open on inspector.applyConflict, letting the reviewer refresh', () => {
      const machine = new ReviewSdkStateMachine();
      reachInspectorOpen(machine);
      machine.transition('inspector.apply');

      expect(machine.transition('inspector.applyConflict')).toBe(true);
      expect(machine.state).toBe('inspector-open');
    });

    it('transitions inspector-open -> inspector-proposing -> inspector-open on propose success', () => {
      const machine = new ReviewSdkStateMachine();
      reachInspectorOpen(machine);

      expect(machine.transition('inspector.propose')).toBe(true);
      expect(machine.state).toBe('inspector-proposing');

      expect(machine.transition('inspector.proposeSucceeded')).toBe(true);
      expect(machine.state).toBe('inspector-open');
    });

    it('returns to inspector-open from inspector-proposing on failure or conflict', () => {
      const machineFailed = new ReviewSdkStateMachine();
      reachInspectorOpen(machineFailed);
      machineFailed.transition('inspector.propose');
      expect(machineFailed.transition('inspector.proposeFailed')).toBe(true);
      expect(machineFailed.state).toBe('inspector-open');

      const machineConflict = new ReviewSdkStateMachine();
      reachInspectorOpen(machineConflict);
      machineConflict.transition('inspector.propose');
      expect(machineConflict.transition('inspector.proposeConflict')).toBe(true);
      expect(machineConflict.state).toBe('inspector-open');
    });

    it('allows review.disable from ai-applying, resetting to idle', () => {
      const machine = new ReviewSdkStateMachine();
      reachAiResult(machine);
      machine.transition('ai.apply');

      expect(machine.transition('review.disable')).toBe(true);
      expect(machine.state).toBe('idle');
    });

    it('allows review.disable from inspector-applying, resetting to idle', () => {
      const machine = new ReviewSdkStateMachine();
      reachInspectorOpen(machine);
      machine.transition('inspector.apply');

      expect(machine.transition('review.disable')).toBe(true);
      expect(machine.state).toBe('idle');
    });

    it('moves ai-result -> report-form-open on ai.createReport', () => {
      const machine = new ReviewSdkStateMachine();
      reachAiResult(machine);

      expect(machine.transition('ai.createReport')).toBe(true);
      expect(machine.state).toBe('report-form-open');
    });

    it('returns to ai-result on report.cancelFromAi', () => {
      const machine = new ReviewSdkStateMachine();
      reachAiResult(machine);
      machine.transition('ai.createReport');

      expect(machine.transition('report.cancelFromAi')).toBe(true);
      expect(machine.state).toBe('ai-result');
    });
  });

  describe('inspector.staleDetected / inspector.staleRefreshed', () => {
    it('self-loops on inspector-open for staleDetected', () => {
      const machine = new ReviewSdkStateMachine();
      machine.transition('review.enable');
      machine.transition('element.hover');
      machine.transition('element.click');
      machine.transition('context.resolved');
      expect(machine.state).toBe('inspector-open');

      expect(machine.transition('inspector.staleDetected')).toBe(true);
      expect(machine.state).toBe('inspector-open');
    });

    it('self-loops on inspector-open for staleRefreshed', () => {
      const machine = new ReviewSdkStateMachine();
      machine.transition('review.enable');
      machine.transition('element.hover');
      machine.transition('element.click');
      machine.transition('context.resolved');

      expect(machine.transition('inspector.staleRefreshed')).toBe(true);
      expect(machine.state).toBe('inspector-open');
    });

    it('rejects staleDetected from a state other than inspector-open', () => {
      const machine = new ReviewSdkStateMachine();
      expect(machine.transition('inspector.staleDetected')).toBe(false);
      expect(machine.state).toBe('idle');
    });
  });
});
