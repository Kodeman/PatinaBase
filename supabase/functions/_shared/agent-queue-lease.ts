// Lease-ownership helpers for the three edge workers that claim + complete
// agent_tasks. Keep this module separate from agent-queue.ts so enqueue-only
// functions do not need a deployment when lease-completion behavior changes.

import { completeAgentTask, type RpcClient } from './agent-queue.ts';

export interface LeaseCompletionArgs {
  id: string;
  outcome: 'done' | 'awaiting_review' | 'failed';
  /** Must exactly match the collision-resistant identity that claimed this lease. */
  actor: string;
  artifacts?: Record<string, unknown>;
  confidence?: number | null;
  error?: string | null;
  fatal?: boolean;
}

/** Create a readable, collision-resistant identity for one claim invocation. */
export function createLeaseOwner(
  baseLabel: string,
  uniqueId: string = crypto.randomUUID(),
): string {
  const base = baseLabel.trim();
  const suffix = uniqueId.trim();
  if (!base) throw new Error('createLeaseOwner: baseLabel must be non-empty');
  if (!suffix) throw new Error('createLeaseOwner: uniqueId must be non-empty');
  return `${base}:${suffix}`;
}

function isLeaseLostCompletionMessage(message: string): boolean {
  return (
    message.includes('complete_agent_task: lease ownership rejected') ||
    (message.includes('complete_agent_task: task ') &&
      (message.includes(' not found') || message.includes('(must be running)')))
  );
}

/** Stable, typed signal that a completion arrived after its lease ended. */
export class AgentTaskLeaseLostError extends Error {
  override name = 'AgentTaskLeaseLostError';
}

export function isAgentTaskLeaseLostError(
  error: unknown,
): error is AgentTaskLeaseLostError {
  return error instanceof AgentTaskLeaseLostError;
}

/** Complete with an exact lease owner, classifying only known stale-lease errors. */
export async function completeAgentTaskWithLease(
  client: RpcClient,
  opts: LeaseCompletionArgs,
): Promise<void> {
  try {
    await completeAgentTask(client, opts);
  } catch (error) {
    if (error instanceof Error && isLeaseLostCompletionMessage(error.message)) {
      throw new AgentTaskLeaseLostError(error.message);
    }
    throw error;
  }
}

/** Complete when still owner; return false for an expected expiry/reclaim race. */
export async function completeAgentTaskIfOwned(
  client: RpcClient,
  opts: LeaseCompletionArgs,
): Promise<boolean> {
  try {
    await completeAgentTaskWithLease(client, opts);
    return true;
  } catch (error) {
    if (isAgentTaskLeaseLostError(error)) return false;
    throw error;
  }
}
