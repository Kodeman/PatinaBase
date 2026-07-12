import { describe, it, expect } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  ACTIVE_STATUSES,
  STATUSES,
  TERMINAL_STATUSES,
  assertTransition,
  canTransition,
  isTerminal,
  type AgentTaskStatus,
} from '../state-machine';

describe('agent_tasks state machine', () => {
  it('every allowed pair passes canTransition', () => {
    for (const from of STATUSES) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it('accepts the exact documented transitions', () => {
    const allowed: Array<[AgentTaskStatus, AgentTaskStatus]> = [
      ['queued', 'running'],
      ['queued', 'cancelled'],
      ['running', 'done'],
      ['running', 'awaiting_review'],
      ['running', 'queued'],
      ['running', 'failed'],
      ['running', 'cancelled'],
      ['running', 'running'],
      ['awaiting_review', 'approved'],
      ['awaiting_review', 'rejected'],
      ['awaiting_review', 'cancelled'],
      ['failed', 'queued'],
    ];
    for (const [from, to] of allowed) {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  it('rejects illegal transitions', () => {
    const illegal: Array<[AgentTaskStatus, AgentTaskStatus]> = [
      ['queued', 'approved'],
      ['queued', 'done'],
      ['queued', 'queued'],
      ['running', 'approved'],
      ['running', 'rejected'],
      ['awaiting_review', 'done'],
      ['awaiting_review', 'running'],
      ['failed', 'running'],
      ['failed', 'done'],
      ['done', 'queued'],
      ['done', 'running'],
      ['approved', 'queued'],
      ['rejected', 'queued'],
      ['cancelled', 'queued'],
    ];
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false);
    }
  });

  it('assertTransition throws with the SQL-matching message', () => {
    expect(() => assertTransition('queued', 'approved')).toThrowError(
      'agent_tasks: illegal transition queued -> approved',
    );
  });

  it('terminal statuses have no outgoing transitions', () => {
    for (const s of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[s]).toHaveLength(0);
      expect(isTerminal(s)).toBe(true);
    }
  });

  it('failed is NOT terminal (failed -> queued)', () => {
    expect(isTerminal('failed')).toBe(false);
    expect(canTransition('failed', 'queued')).toBe(true);
  });

  it('ACTIVE_STATUSES excludes exactly the terminal ones', () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(
      ['queued', 'running', 'awaiting_review', 'failed'].sort(),
    );
  });
});
