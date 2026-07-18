import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAgentQueue } from '../index';

/** Minimal mock: records the last rpc(name, params) and returns a fixture. */
function mockRpcClient(data: unknown = { id: 'task-1' }, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

/** Chainable query-builder mock for .from(...).select().eq()... */
function mockFromClient(result: { data?: unknown; error?: unknown; count?: number }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  const chain = (name: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    });
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) builder[m] = chain(m);
  // make the builder awaitable (PostgREST builders are thenables)
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count });
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, from, calls, builder };
}

describe('createAgentQueue — request shapes', () => {
  it('requires the completion actor at the TypeScript boundary', () => {
    const { client } = mockRpcClient(null);
    const q = createAgentQueue(client);
    if (false) {
      // @ts-expect-error Completion identity is the lease-owner contract.
      void q.complete({ id: 't1', outcome: 'done' });
    }
    expect(q).toBeDefined();
  });

  it('enqueue maps camelCase input onto p_* RPC args', async () => {
    const { client, rpc } = mockRpcClient({ id: 't1', status: 'queued' });
    const q = createAgentQueue(client);
    const row = await q.enqueue({
      taskType: 'vendor.qualify',
      payload: { url: 'x' },
      priority: 1,
      assignee: 'leah',
      entityType: 'pipeline_vendor',
      entityId: 'v-1',
      idempotencyKey: 'k-1',
      onConflict: 'resurrect',
      status: 'awaiting_review',
      confidence: 0.5,
      actor: 'kody',
    });
    expect(row).toEqual({ id: 't1', status: 'queued' });
    expect(rpc).toHaveBeenCalledWith('enqueue_agent_task', {
      p_task_type: 'vendor.qualify',
      p_payload: { url: 'x' },
      p_source: undefined,
      p_priority: 1,
      p_assignee: 'leah',
      p_entity_type: 'pipeline_vendor',
      p_entity_id: 'v-1',
      p_idempotency_key: 'k-1',
      p_run_after: undefined,
      p_max_attempts: undefined,
      p_on_conflict: 'resurrect',
      p_summary: undefined,
      p_status: 'awaiting_review',
      p_parent_task_id: undefined,
      p_confidence: 0.5,
      p_artifacts: undefined,
      p_actor: 'kody',
    });
  });

  it('claim maps to claim_agent_tasks and defaults to [] on null data', async () => {
    const { client, rpc } = mockRpcClient(null);
    const q = createAgentQueue(client);
    const rows = await q.claim({ taskTypes: ['a', 'b'], batch: 5, worker: 'w1' });
    expect(rows).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('claim_agent_tasks', {
      p_task_types: ['a', 'b'],
      p_batch: 5,
      p_worker: 'w1',
      p_visibility_timeout: undefined,
    });
  });

  it('complete maps to complete_agent_task', async () => {
    const { client, rpc } = mockRpcClient(null);
    const q = createAgentQueue(client);
    await q.complete({ id: 't1', outcome: 'failed', error: 'boom', fatal: true, actor: 'w1' });
    expect(rpc).toHaveBeenCalledWith('complete_agent_task', {
      p_id: 't1',
      p_outcome: 'failed',
      p_artifacts: undefined,
      p_confidence: undefined,
      p_error: 'boom',
      p_fatal: true,
      p_actor: 'w1',
    });
  });

  it('review maps to review_agent_task', async () => {
    const { client, rpc } = mockRpcClient({ id: 't1', status: 'rejected' });
    const q = createAgentQueue(client);
    await q.review({ id: 't1', decision: 'rejected', reviewer: 'leah', note: 'no' });
    expect(rpc).toHaveBeenCalledWith('review_agent_task', {
      p_id: 't1',
      p_decision: 'rejected',
      p_reviewer: 'leah',
      p_note: 'no',
      p_payload_patch: undefined,
      p_review_meta: undefined,
    });
  });

  it('requeue and cancel map to their RPCs', async () => {
    const { client, rpc } = mockRpcClient({ id: 't1' });
    const q = createAgentQueue(client);
    await q.requeue({ id: 't1', actor: 'kody', feedback: 'retry' });
    expect(rpc).toHaveBeenCalledWith('requeue_agent_task', {
      p_id: 't1',
      p_actor: 'kody',
      p_feedback: 'retry',
    });
    await q.cancel({ id: 't1', actor: 'kody', reason: 'obsolete' });
    expect(rpc).toHaveBeenCalledWith('cancel_agent_task', {
      p_id: 't1',
      p_actor: 'kody',
      p_reason: 'obsolete',
    });
  });

  it('stats maps to agent_queue_stats', async () => {
    const { client, rpc } = mockRpcClient([{ status: 'queued', task_count: 3, oldest_created_at: null }]);
    const q = createAgentQueue(client);
    const rows = await q.stats();
    expect(rows).toEqual([{ status: 'queued', task_count: 3, oldest_created_at: null }]);
    expect(rpc).toHaveBeenCalledWith('agent_queue_stats');
  });

  it('throws when the RPC returns an error', async () => {
    const { client } = mockRpcClient(null, { message: 'permission denied' });
    const q = createAgentQueue(client);
    await expect(q.enqueue({ taskType: 'x' })).rejects.toEqual({ message: 'permission denied' });
  });

  it('list builds a filtered agent_tasks query', async () => {
    const { client, from, calls } = mockFromClient({ data: [{ id: 't1' }] });
    const q = createAgentQueue(client);
    const rows = await q.list({ status: 'awaiting_review', assignee: 'leah', limit: 10 });
    expect(rows).toEqual([{ id: 't1' }]);
    expect(from).toHaveBeenCalledWith('agent_tasks');
    const methods = calls.map((c) => c[0]);
    expect(methods).toContain('select');
    expect(calls).toContainEqual(['eq', ['status', 'awaiting_review']]);
    expect(calls).toContainEqual(['eq', ['assignee', 'leah']]);
    expect(calls).toContainEqual(['limit', [10]]);
  });

  it('activeCount does a head count over non-terminal statuses', async () => {
    const { client, from, calls } = mockFromClient({ count: 7 });
    const q = createAgentQueue(client);
    const n = await q.activeCount();
    expect(n).toBe(7);
    expect(from).toHaveBeenCalledWith('agent_tasks');
    const inCall = calls.find((c) => c[0] === 'in');
    expect(inCall?.[1][0]).toBe('status');
    expect(inCall?.[1][1]).toEqual(['queued', 'running', 'awaiting_review', 'failed']);
  });
});
