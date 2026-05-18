import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import { mapWaitlistTaskRow } from '../../../_mappers';

// PATCH /api/waitlist/[id]/tasks/[taskId] - Complete / edit a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;
  // Cast to any: waitlist_tasks/activities are not yet in generated DB types.
  const adminClient = auth.adminClient as any;

  const { id, taskId } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { data: before, error: loadError } = await adminClient
    .from('waitlist_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('waitlist_id', id)
    .maybeSingle();

  if (loadError) return serverError(loadError.message);
  if (!before) return notFound('Task not found');

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return badRequest('title cannot be empty');
    patch.title = title;
  }
  if (body.dueDate !== undefined) patch.due_date = body.dueDate;
  if (body.assignedAdminId !== undefined) patch.assigned_admin_id = body.assignedAdminId;
  if (body.completed !== undefined) {
    patch.completed_at = body.completed ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return badRequest('No updatable fields provided');
  }

  const { data, error } = await adminClient
    .from('waitlist_tasks')
    .update(patch)
    .eq('id', taskId)
    .eq('waitlist_id', id)
    .select('*')
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!data) return notFound('Task not found');

  // If task was just completed, log an activity
  const wasCompleted = !before.completed_at && data.completed_at;
  if (wasCompleted) {
    await adminClient.from('waitlist_activities').insert({
      waitlist_id: id,
      actor_admin_id: user.id,
      kind: 'task_completed',
      body: data.title,
      metadata: { task_id: data.id },
    });
  }

  return NextResponse.json({ data: mapWaitlistTaskRow(data) });
}
