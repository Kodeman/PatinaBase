// ─────────────────────────────────────────────────────────────────────────────
// Mission Control review state — PURE module (no React, no I/O).
//
// Small, unit-tested decision helpers the Approval Inbox UI and the review API
// route both share. The authoritative state machine lives in Postgres
// (enforce_agent_task_transition, 00297) and is mirrored in @patina/agent-queue's
// state-machine.ts; this file only encodes the review-time rules that surface in
// the UI: which tasks a human may act on, how a decision maps to a status, and
// the note-required-on-reject guard (which review_agent_task also enforces).
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentTaskStatus, ReviewDecision } from '@patina/agent-queue';

/** A task is reviewable iff it is awaiting_review — the only status the
 *  review_agent_task RPC accepts. */
export function isReviewable(status: AgentTaskStatus): boolean {
  return status === 'awaiting_review';
}

/** The status an awaiting_review task lands in after a decision. review_agent_task
 *  sets status = p_decision verbatim, so this is intentionally an identity map —
 *  it exists so callers never hard-code the mapping. */
export function decisionToStatus(decision: ReviewDecision): 'approved' | 'rejected' {
  return decision === 'rejected' ? 'rejected' : 'approved';
}

export interface ReviewInputShape {
  decision: ReviewDecision;
  note?: string | null;
}

export interface ReviewValidation {
  valid: boolean;
  error?: string;
}

/** A rejection requires a non-empty note; the note is merged into
 *  payload.feedback for the re-run (mirrors the RPC's own guard). */
export function validateReview({ decision, note }: ReviewInputShape): ReviewValidation {
  if (decision !== 'approved' && decision !== 'rejected') {
    return { valid: false, error: `decision must be approved or rejected, got ${String(decision)}` };
  }
  if (decision === 'rejected' && (note == null || note.trim() === '')) {
    return { valid: false, error: 'A rejection requires a note' };
  }
  return { valid: true };
}
