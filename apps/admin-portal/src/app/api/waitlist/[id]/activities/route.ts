import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { mapWaitlistActivityRow } from '../../_mappers';

const ALLOWED_KINDS = new Set([
  'note',
  'email_sent',
  'call_logged',
  'stage_changed',
  'assigned',
  'contacted',
  'qualified',
  'disqualified',
  'converted',
  'task_created',
  'task_completed',
]);

// GET /api/waitlist/[id]/activities - Timeline for an entry
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(_request);
  if ('error' in auth) return auth.error;
  // Cast to any: waitlist_activities is not yet in generated DB types.
  const adminClient = auth.adminClient as any;

  const { id } = await params;

  const { data, error } = await adminClient
    .from('waitlist_activities')
    .select('*')
    .eq('waitlist_id', id)
    .order('created_at', { ascending: false });

  if (error) return serverError(error.message);

  return NextResponse.json({ data: (data ?? []).map(mapWaitlistActivityRow) });
}

// POST /api/waitlist/[id]/activities - Append a manual activity (typically a note)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;
  // Cast to any: waitlist_activities is not yet in generated DB types.
  const adminClient = auth.adminClient as any;

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const kind = body.kind as string | undefined;
  if (!kind || !ALLOWED_KINDS.has(kind)) {
    return badRequest(`Invalid activity kind: ${kind ?? '(missing)'}`);
  }

  const { data, error } = await adminClient
    .from('waitlist_activities')
    .insert({
      waitlist_id: id,
      actor_admin_id: user.id,
      kind,
      body: body.body ?? null,
      metadata: body.metadata ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error) return serverError(error.message);

  return NextResponse.json({ data: mapWaitlistActivityRow(data) });
}
