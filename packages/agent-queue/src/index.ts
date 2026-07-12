// ─────────────────────────────────────────────────────────────────────────────
// @patina/agent-queue — the Agent OS task-queue data layer.
//
// Thin wrappers over the SECURITY DEFINER RPCs + agent_tasks table defined in
// supabase/migrations/00295_agent_tasks_queue.sql. ALL queue logic (state
// machine, backoff, idempotency, audit) lives in Postgres — these functions
// only shape arguments and unwrap { data, error }. Requires a service-role
// Supabase client (the RPCs are granted to service_role only).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_STATUSES } from './state-machine';
import type {
  AgentTask,
  CancelInput,
  ClaimInput,
  CompleteInput,
  EnqueueInput,
  ListFilter,
  QueueStat,
  RequeueInput,
  ReviewInput,
} from './types';

export * from './types';
export * from './state-machine';

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export interface AgentQueue {
  enqueue(input: EnqueueInput): Promise<AgentTask>;
  claim(input: ClaimInput): Promise<AgentTask[]>;
  complete(input: CompleteInput): Promise<void>;
  review(input: ReviewInput): Promise<AgentTask>;
  requeue(input: RequeueInput): Promise<AgentTask>;
  cancel(input: CancelInput): Promise<AgentTask>;
  stats(): Promise<QueueStat[]>;
  list(filter?: ListFilter): Promise<AgentTask[]>;
  activeCount(): Promise<number>;
}

export function createAgentQueue(client: SupabaseClient): AgentQueue {
  return {
    async enqueue(input) {
      return unwrap(
        await client.rpc('enqueue_agent_task', {
          p_task_type: input.taskType,
          p_payload: input.payload,
          p_source: input.source,
          p_priority: input.priority,
          p_assignee: input.assignee,
          p_entity_type: input.entityType,
          p_entity_id: input.entityId,
          p_idempotency_key: input.idempotencyKey,
          p_run_after: input.runAfter,
          p_max_attempts: input.maxAttempts,
          p_on_conflict: input.onConflict,
          p_summary: input.summary,
          p_status: input.status,
          p_parent_task_id: input.parentTaskId,
          p_confidence: input.confidence,
          p_artifacts: input.artifacts,
          p_actor: input.actor,
        }),
      ) as AgentTask;
    },

    async claim(input) {
      return (unwrap(
        await client.rpc('claim_agent_tasks', {
          p_task_types: input.taskTypes,
          p_batch: input.batch,
          p_worker: input.worker,
          p_visibility_timeout: input.visibilityTimeout,
        }),
      ) ?? []) as AgentTask[];
    },

    async complete(input) {
      unwrap(
        await client.rpc('complete_agent_task', {
          p_id: input.id,
          p_outcome: input.outcome,
          p_artifacts: input.artifacts,
          p_confidence: input.confidence,
          p_error: input.error,
          p_fatal: input.fatal,
          p_actor: input.actor,
        }),
      );
    },

    async review(input) {
      return unwrap(
        await client.rpc('review_agent_task', {
          p_id: input.id,
          p_decision: input.decision,
          p_reviewer: input.reviewer,
          p_note: input.note,
          p_payload_patch: input.payloadPatch,
          p_review_meta: input.reviewMeta,
        }),
      ) as AgentTask;
    },

    async requeue(input) {
      return unwrap(
        await client.rpc('requeue_agent_task', {
          p_id: input.id,
          p_actor: input.actor,
          p_feedback: input.feedback,
        }),
      ) as AgentTask;
    },

    async cancel(input) {
      return unwrap(
        await client.rpc('cancel_agent_task', {
          p_id: input.id,
          p_actor: input.actor,
          p_reason: input.reason,
        }),
      ) as AgentTask;
    },

    async stats() {
      return (unwrap(await client.rpc('agent_queue_stats')) ?? []) as QueueStat[];
    },

    async list(filter = {}) {
      let q = client.from('agent_tasks').select('*');
      if (filter.status) {
        q = Array.isArray(filter.status) ? q.in('status', filter.status) : q.eq('status', filter.status);
      }
      if (filter.taskType) q = q.eq('task_type', filter.taskType);
      if (filter.assignee) q = q.eq('assignee', filter.assignee);
      if (filter.entityType) q = q.eq('entity_type', filter.entityType);
      if (filter.entityId) q = q.eq('entity_id', filter.entityId);
      q = q.order('priority', { ascending: true }).order('created_at', { ascending: true });
      if (filter.limit) q = q.limit(filter.limit);
      return (unwrap(await q) ?? []) as AgentTask[];
    },

    async activeCount() {
      const res = await client
        .from('agent_tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', ACTIVE_STATUSES as string[]);
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
  };
}
