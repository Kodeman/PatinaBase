import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type RpcClient,
} from '../_shared/agent-queue.ts';
import {
  AgentTaskLeaseLostError,
  completeAgentTaskWithLease,
  completeAgentTaskIfOwned,
  createLeaseOwner,
} from '../_shared/agent-queue-lease.ts';

function rejectingClient(message: string): RpcClient {
  return {
    rpc: () => Promise.resolve({ data: null, error: { message } }),
  };
}

const completion = {
  id: 'task-1',
  outcome: 'done' as const,
  actor: 'worker:lease-a',
};

Deno.test('createLeaseOwner preserves a readable prefix with an explicit unique suffix', () => {
  assertEquals(createLeaseOwner(' worker ', 'lease-a'), 'worker:lease-a');
});

Deno.test('completeAgentTaskWithLease turns ownership rejection into a typed lease-lost error', async () => {
  await assertRejects(
    () =>
      completeAgentTaskWithLease(
        rejectingClient(
          'complete_agent_task: lease ownership rejected for task task-1 (locked_by worker:lease-b, p_actor worker:lease-a)',
        ),
        completion,
      ),
    AgentTaskLeaseLostError,
  );
});

Deno.test('completeAgentTaskIfOwned treats a terminal stale completion as benign', async () => {
  const completed = await completeAgentTaskIfOwned(
    rejectingClient('complete_agent_task: task task-1 is done (must be running)'),
    completion,
  );
  assertEquals(completed, false);
});

Deno.test('completeAgentTaskIfOwned does not swallow unrelated RPC failures', async () => {
  await assertRejects(
    () => completeAgentTaskIfOwned(rejectingClient('permission denied for function'), completion),
    Error,
    'permission denied',
  );
});
