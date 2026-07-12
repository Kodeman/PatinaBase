// _shared/agent-queue.ts — Deno twin of packages/agent-queue.
//
// Thin RPC wrappers over the Agent OS queue RPCs (00297) for edge functions
// using their service-role client. ALL logic (state machine, backoff,
// idempotency, audit) lives in Postgres — keep these signatures in sync with
// packages/agent-queue/src/index.ts. No state machine here.

// ─── Types (public.agent_tasks, 00297) ───────────────────────────────────────

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'approved'
  | 'rejected'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface AgentTask {
  id: string;
  task_type: string;
  status: AgentTaskStatus;
  priority: number;
  source: string;
  assignee: 'kody' | 'leah' | null;
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
  awaiting_review_at: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Minimal structural slice a wrapper needs — lets tests inject a fake. */
export interface RpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ─── Wrappers (keep in sync with packages/agent-queue) ───────────────────────

export interface EnqueueArgs {
  taskType: string;
  payload?: Record<string, unknown>;
  source?: string;
  priority?: number;
  assignee?: 'kody' | 'leah' | null;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
  runAfter?: string;
  maxAttempts?: number;
  onConflict?: 'ignore' | 'resurrect';
  summary?: string;
  status?: 'queued' | 'awaiting_review';
  parentTaskId?: string | null;
  confidence?: number | null;
  artifacts?: Record<string, unknown>;
  actor?: string | null;
}

/** Land a task (exactly-once via idempotencyKey). */
export async function enqueueAgentTask(client: RpcClient, args: EnqueueArgs): Promise<AgentTask> {
  return unwrap<AgentTask>(
    await client.rpc('enqueue_agent_task', {
      p_task_type: args.taskType,
      p_payload: args.payload,
      p_source: args.source,
      p_priority: args.priority,
      p_assignee: args.assignee,
      p_entity_type: args.entityType,
      p_entity_id: args.entityId,
      p_idempotency_key: args.idempotencyKey,
      p_run_after: args.runAfter,
      p_max_attempts: args.maxAttempts,
      p_on_conflict: args.onConflict,
      p_summary: args.summary,
      p_status: args.status,
      p_parent_task_id: args.parentTaskId,
      p_confidence: args.confidence,
      p_artifacts: args.artifacts,
      p_actor: args.actor,
    }),
  );
}

/** Lease up to `batch` tasks (FOR UPDATE SKIP LOCKED); flips them to running. */
export async function claimAgentTasks(
  client: RpcClient,
  opts: { taskTypes: string[] | null; batch: number; worker: string; visibilityTimeout?: string },
): Promise<AgentTask[]> {
  return (
    unwrap<AgentTask[]>(
      await client.rpc('claim_agent_tasks', {
        p_task_types: opts.taskTypes,
        p_batch: opts.batch,
        p_worker: opts.worker,
        p_visibility_timeout: opts.visibilityTimeout,
      }),
    ) ?? []
  );
}

/** Report a claimed task's outcome. Backoff/park are decided in Postgres. */
export async function completeAgentTask(
  client: RpcClient,
  opts: {
    id: string;
    outcome: 'done' | 'awaiting_review' | 'failed';
    artifacts?: Record<string, unknown>;
    confidence?: number | null;
    error?: string | null;
    fatal?: boolean;
    actor?: string | null;
  },
): Promise<void> {
  unwrap<null>(
    await client.rpc('complete_agent_task', {
      p_id: opts.id,
      p_outcome: opts.outcome,
      p_artifacts: opts.artifacts,
      p_confidence: opts.confidence,
      p_error: opts.error,
      p_fatal: opts.fatal,
      p_actor: opts.actor,
    }),
  );
}

/** Apply a human review decision to an awaiting_review task. */
export async function reviewAgentTask(
  client: RpcClient,
  opts: {
    id: string;
    decision: 'approved' | 'rejected';
    reviewer: string;
    note?: string | null;
    payloadPatch?: Record<string, unknown> | null;
    reviewMeta?: Record<string, unknown> | null;
  },
): Promise<AgentTask> {
  return unwrap<AgentTask>(
    await client.rpc('review_agent_task', {
      p_id: opts.id,
      p_decision: opts.decision,
      p_reviewer: opts.reviewer,
      p_note: opts.note,
      p_payload_patch: opts.payloadPatch,
      p_review_meta: opts.reviewMeta,
    }),
  );
}
