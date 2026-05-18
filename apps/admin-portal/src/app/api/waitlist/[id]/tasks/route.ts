import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { mapWaitlistTaskRow } from '../../_mappers';

// GET /api/waitlist/[id]/tasks - List tasks for an entry
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(_request);
  if ('error' in auth) return auth.error;
  // Cast to any: waitlist_tasks is not yet in generated DB types.
  const adminClient = auth.adminClient as any;

  const { id } = await params;

  const { data, error } = await adminClient
    .from('waitlist_tasks')
    .select('*')
    .eq('waitlist_id', id)
    .order('completed_at', { ascending: true, nullsFirst: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) return serverError(error.message);

  return NextResponse.json({ data: (data ?? []).map(mapWaitlistTaskRow) });
}

// POST /api/waitlist/[id]/tasks - Create a task
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;
  // Cast to any: waitlist_tasks/activities are not yet in generated DB types.
  const adminClient = auth.adminClient as any;

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return badRequest('title is required');

  const { data, error } = await adminClient
    .from('waitlist_tasks')
    .insert({
      waitlist_id: id,
      title,
      due_date: body.dueDate ?? null,
      assigned_admin_id: body.assignedAdminId ?? user.id,
      created_by: user.id,
    })
    .select('*')
    .maybeSingle();

  if (error) return serverError(error.message);

  // Log a task_created activity
  await adminClient.from('waitlist_activities').insert({
    waitlist_id: id,
    actor_admin_id: user.id,
    kind: 'task_created',
    body: title,
    metadata: data ? { task_id: data.id, due_date: data.due_date } : null,
  });

  return NextResponse.json({ data: mapWaitlistTaskRow(data) });
}
