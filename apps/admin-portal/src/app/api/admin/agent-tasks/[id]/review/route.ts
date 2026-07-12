import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  createAuditLog,
  badRequest,
  serverError,
  getClientIp,
} from '@/lib/supabase-admin';
import { createAgentQueue, type ReviewDecision } from '@patina/agent-queue';
import { validateReview } from '@/lib/agent-task-state';

// POST /api/admin/agent-tasks/[id]/review — a human approves/rejects an
// awaiting_review task.
//
// FIRE-AND-FORGET for the reviewer: this route ONLY transitions the task's
// status through review_agent_task (which also stamps review_state, merges a
// rejection note into payload.feedback, and writes the agent_task_audit row via
// the audit trigger). It NEVER blocks on any downstream execution of the
// approved work — that is the app's job on its own schedule.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  let body: {
    decision?: string;
    note?: string | null;
    payloadPatch?: Record<string, unknown> | null;
    reviewMeta?: Record<string, unknown> | null;
  };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return badRequest('Invalid JSON body');
  }

  const decision = body.decision as ReviewDecision;
  const note = body.note ?? null;

  const validation = validateReview({ decision, note });
  if (!validation.valid) return badRequest(validation.error ?? 'Invalid review');

  const reviewer = auth.user.email ?? auth.user.id;

  try {
    const task = await createAgentQueue(auth.adminClient).review({
      id,
      decision,
      reviewer,
      note,
      payloadPatch: body.payloadPatch ?? null,
      reviewMeta: body.reviewMeta ?? null,
    });

    // Separate admin audit_logs entry, on top of the agent_task_audit row the
    // RPC's trigger already wrote. Mirrors the designer-invite route.
    await createAuditLog(auth.adminClient, {
      userId: auth.user.id,
      action: 'agent_task.review',
      resourceType: 'agent_task',
      resourceId: id,
      newValues: { decision, note, reviewMeta: body.reviewMeta ?? null },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: task });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to review agent task');
  }
}
