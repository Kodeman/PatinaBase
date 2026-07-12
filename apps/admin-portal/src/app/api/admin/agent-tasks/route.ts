import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, serverError } from '@/lib/supabase-admin';
import {
  createAgentQueue,
  STATUSES,
  type AgentTask,
  type AgentTaskAssignee,
  type AgentTaskStatus,
} from '@patina/agent-queue';

// GET /api/admin/agent-tasks — the Mission Control inbox list.
// Defaults to status=awaiting_review (the exception-first inbox). Server sorts
// priority asc, created_at asc (in @patina/agent-queue's list()). Writes never
// happen here — reviews go through [id]/review.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const queue = createAgentQueue(auth.adminClient);

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') ?? 'awaiting_review';
  const assigneeParam = url.searchParams.get('assignee') ?? undefined;
  const taskType = url.searchParams.get('task_type')?.trim() || undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 100)) : 100;

  let status: AgentTaskStatus | undefined;
  if (statusParam && statusParam !== 'all') {
    if (!(STATUSES as readonly string[]).includes(statusParam)) {
      return badRequest(`Invalid status: ${statusParam}`);
    }
    status = statusParam as AgentTaskStatus;
  }

  let assignee: AgentTaskAssignee | undefined;
  if (assigneeParam) {
    if (assigneeParam !== 'kody' && assigneeParam !== 'leah') {
      return badRequest(`Invalid assignee: ${assigneeParam}`);
    }
    assignee = assigneeParam;
  }

  try {
    const tasks: AgentTask[] = await queue.list({ status, assignee, taskType, limit });
    return NextResponse.json({ data: tasks });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list agent tasks');
  }
}
