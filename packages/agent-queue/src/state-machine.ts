// ─────────────────────────────────────────────────────────────────────────────
// agent_tasks state machine — TypeScript mirror.
//
// ⚠ The SQL trigger enforce_agent_task_transition() in
//   supabase/migrations/00295_agent_tasks_queue.sql is AUTHORITATIVE.
//   This file is a convenience mirror for the data/UI layer — keep it in sync
//   with that migration whenever the transition rules change.
//
// The one transition the DB permits that is deliberately ABSENT here is the
// privileged "resurrect" re-open (terminal -> queued), which enqueue_agent_task
// authorises via a transaction-local GUC. It is not a normal state transition,
// so canTransition('done','queued') is (correctly) false — matching what the
// trigger does for any ordinary/direct UPDATE.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUSES = [
  'queued',
  'running',
  'awaiting_review',
  'approved',
  'rejected',
  'done',
  'failed',
  'cancelled',
] as const;

export type AgentTaskStatus = (typeof STATUSES)[number];

/** Statuses with no transitions out. (`failed` is NOT terminal — failed -> queued.) */
export const TERMINAL_STATUSES: readonly AgentTaskStatus[] = [
  'done',
  'approved',
  'rejected',
  'cancelled',
];

/** Non-terminal statuses — a task still "in flight". */
export const ACTIVE_STATUSES: readonly AgentTaskStatus[] = STATUSES.filter(
  (s) => !TERMINAL_STATUSES.includes(s),
);

/**
 * Exact pair list mirroring the SQL trigger.
 *   queued          -> running | cancelled
 *   running         -> done | awaiting_review | queued | failed | cancelled | running
 *   awaiting_review -> approved | rejected | cancelled
 *   failed          -> queued
 *   done/approved/rejected/cancelled -> (terminal)
 */
export const ALLOWED_TRANSITIONS: Record<AgentTaskStatus, readonly AgentTaskStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['done', 'awaiting_review', 'queued', 'failed', 'cancelled', 'running'],
  awaiting_review: ['approved', 'rejected', 'cancelled'],
  failed: ['queued'],
  done: [],
  approved: [],
  rejected: [],
  cancelled: [],
};

export function isTerminal(status: AgentTaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: AgentTaskStatus, to: AgentTaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Mirrors the SQL RAISE message verbatim so both layers speak the same error. */
export function assertTransition(from: AgentTaskStatus, to: AgentTaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`agent_tasks: illegal transition ${from} -> ${to}`);
  }
}
