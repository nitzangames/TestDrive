import { describe, it, expect, vi } from 'vitest';
import { StateMachine, MENU, DRIVE } from '../lib/game/state.js';

describe('StateMachine', () => {
  it('starts in MENU', () => {
    const sm = new StateMachine();
    expect(sm.state).toBe(MENU);
  });

  it('transitions to DRIVE on start()', () => {
    const onChange = vi.fn();
    const sm = new StateMachine(onChange);
    sm.start();
    expect(sm.state).toBe(DRIVE);
    expect(onChange).toHaveBeenCalledWith(MENU, DRIVE);
  });

  it('is idempotent — start() while already DRIVE does nothing', () => {
    const onChange = vi.fn();
    const sm = new StateMachine(onChange);
    sm.start();
    onChange.mockClear();
    sm.start();
    expect(onChange).not.toHaveBeenCalled();
  });
});
