import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';
import { createAgentQueue, STATUSES, type AgentTask, type AgentTaskStatus } from '@patina/agent-queue';

// ─────────────────────────────────────────────────────────────────────────────
// Cut over to public.agent_tasks (00297/00298) — cowork_tasks (00076) is
// frozen. REST paths stay /api/admin/cowork-tasks/* for this wave (WP-0
// W0.2); they get renamed in a later Mission Control wave.
// ─────────────────────────────────────────────────────────────────────────────

/** Old cowork_tasks status vocab -> new agent_tasks vocab (00298 map). */
const LEGACY_STATUS_MAP: Record<string, AgentTaskStatus> = {
  pending: 'queued',
  picked_up: 'running',
  running: 'running',
  completed: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

function normalizeStatus(raw: string): AgentTaskStatus | null {
  if (raw in LEGACY_STATUS_MAP) return LEGACY_STATUS_MAP[raw];
  if ((STATUSES as readonly string[]).includes(raw)) return raw as AgentTaskStatus;
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const queue = createAgentQueue(auth.adminClient);

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') ?? undefined;
  const vendorId = url.searchParams.get('vendor_id') ?? undefined;
  const taskType = url.searchParams.get('task_type') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10))) : 100;

  let status: AgentTaskStatus | undefined;
  if (statusParam) {
    const normalized = normalizeStatus(statusParam);
    if (!normalized) return badRequest(`Invalid status: ${statusParam}`);
    status = normalized;
  }

  try {
    const tasks: AgentTask[] = await queue.list({
      status,
      taskType,
      entityType: vendorId ? 'pipeline_vendor' : undefined,
      entityId: vendorId,
      limit,
    });

    return NextResponse.json({ data: tasks });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list tasks');
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const queue = createAgentQueue(auth.adminClient);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const taskType = typeof body.task_type === 'string' ? body.task_type.trim() : '';
  if (!taskType) {
    return badRequest('task_type is required');
  }

  const vendorId = (body.vendor_id as string | null | undefined) ?? null;
  const inputPayload = (body.input_payload ?? {}) as Record<string, unknown>;
  const isRecurring = Boolean(body.is_recurring);
  const cronExpression = (body.cron_expression as string | null | undefined) ?? null;

  const payload: Record<string, unknown> = { ...inputPayload };
  if (isRecurring || cronExpression) {
    payload.recurrence = {
      is_recurring: isRecurring,
      cron_expression: cronExpression,
      last_run_at: null,
      next_run_at: null,
    };
  }

  try {
    const task = await queue.enqueue({
      taskType,
      payload,
      source: 'admin:portal',
      entityType: vendorId ? 'pipeline_vendor' : null,
      entityId: vendorId,
      actor: auth.user.email ?? auth.user.id,
    });

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to enqueue task');
  }
}
