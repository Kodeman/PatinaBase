// ─────────────────────────────────────────────────────────────────────────────
// @patina/agent-queue — domain types.
//
// AgentTask mirrors the public.agent_tasks row shape as returned by
// supabase-js (snake_case columns straight from Postgres, 00297). The *Input
// types are the camelCase shapes the data-layer wrappers accept; they map 1:1
// onto the RPC p_* arguments.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentTaskStatus } from './state-machine';

export type { AgentTaskStatus };

/** Arbitrary JSON stored in payload / artifacts / review_state. */
export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type AgentTaskAssignee = 'kody' | 'leah';

/** Outcomes a worker may report to complete_agent_task. */
export type CompleteOutcome = 'done' | 'awaiting_review' | 'failed';

/** Human review decisions. */
export type ReviewDecision = 'approved' | 'rejected';

/** enqueue_agent_task on-conflict strategy for the idempotency_key. */
export type OnConflict = 'ignore' | 'resurrect';

/** Statuses enqueue_agent_task may land a task in. */
export type EnqueueStatus = 'queued' | 'awaiting_review';

/** A public.agent_tasks row. */
export interface AgentTask {
  id: string;
  task_type: string;
  status: AgentTaskStatus;
  priority: number;
  source: string;
  assignee: AgentTaskAssignee | null;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  payload: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  confidence: number | null;
  review_state: Record<string, unknown> | null;
  idempotency_key: string | null;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  locked_by: string | null;
  locked_at: string | null;
  flagged_stale_at: string | null;
  awaiting_review_at: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface EnqueueInput {
  taskType: string;
  payload?: Json;
  source?: string;
  priority?: number;
  assignee?: AgentTaskAssignee | null;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
  runAfter?: string;
  maxAttempts?: number;
  onConflict?: OnConflict;
  summary?: string;
  status?: EnqueueStatus;
  parentTaskId?: string | null;
  confidence?: number | null;
  artifacts?: Json;
  actor?: string | null;
}

export interface ClaimInput {
  /** null claims across all task types. */
  taskTypes: string[] | null;
  batch: number;
  /** Collision-resistant identity for this claim invocation; use createLeaseOwner(). */
  worker: string;
  /** Postgres interval literal, e.g. '15 minutes'. */
  visibilityTimeout?: string;
}

export interface CompleteInput {
  id: string;
  outcome: CompleteOutcome;
  /** Must exactly match the collision-resistant identity that claimed this lease. */
  actor: string;
  artifacts?: Json;
  confidence?: number | null;
  error?: string | null;
  fatal?: boolean;
}

export interface ReviewInput {
  id: string;
  decision: ReviewDecision;
  reviewer: string;
  note?: string | null;
  payloadPatch?: Json | null;
  reviewMeta?: Json | null;
}

export interface RequeueInput {
  id: string;
  actor: string;
  feedback?: string | null;
}

export interface CancelInput {
  id: string;
  actor: string;
  reason?: string | null;
}

export interface ListFilter {
  status?: AgentTaskStatus | AgentTaskStatus[];
  taskType?: string;
  assignee?: AgentTaskAssignee;
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export interface QueueStat {
  status: AgentTaskStatus;
  task_count: number;
  oldest_created_at: string | null;
}
