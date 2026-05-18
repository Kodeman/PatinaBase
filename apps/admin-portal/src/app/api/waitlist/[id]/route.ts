import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import { mapWaitlistRow } from '../_mappers';

const ALLOWED_STAGES = new Set([
  'new',
  'contacted',
  'qualified',
  'nurture',
  'converted',
  'disqualified',
]);

function stageActivityKind(stage: string): string {
  switch (stage) {
    case 'contacted':
      return 'contacted';
    case 'qualified':
      return 'qualified';
    case 'disqualified':
      return 'disqualified';
    case 'converted':
      return 'converted';
    default:
      return 'stage_changed';
  }
}

// GET /api/waitlist/[id] - Fetch a single waitlist entry
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  // Cast to any: new waitlist columns and waitlist_activities are not yet in generated DB types.
  const adminClient = auth.adminClient as any;

  const { id } = await params;

  const { data, error } = await adminClient
    .from('waitlist')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!data) return notFound('Waitlist entry not found');

  return NextResponse.json({ data: mapWaitlistRow(data) });
}

// PATCH /api/waitlist/[id] - Update qualification fields and log activities
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user } = auth;
  // Cast to any: new waitlist columns and waitlist_activities are not yet in generated DB types.
  const adminClient = auth.adminClient as any;

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  // Load current row so we can diff for activity logging
  const { data: before, error: loadError } = await adminClient
    .from('waitlist')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadError) return serverError(loadError.message);
  if (!before) return notFound('Waitlist entry not found');

  const patch: Record<string, unknown> = {};

  if (body.qualificationStage !== undefined) {
    if (!ALLOWED_STAGES.has(body.qualificationStage)) {
      return badRequest(`Invalid qualification_stage: ${body.qualificationStage}`);
    }
    patch.qualification_stage = body.qualificationStage;
  }
  if (body.assignedAdminId !== undefined) patch.assigned_admin_id = body.assignedAdminId;
  if (body.fullName !== undefined) patch.full_name = body.fullName;
  if (body.companyName !== undefined) patch.company_name = body.companyName;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.lastContactedAt !== undefined) patch.last_contacted_at = body.lastContactedAt;
  if (body.nextFollowUpAt !== undefined) patch.next_follow_up_at = body.nextFollowUpAt;
  if (body.disqualifiedReason !== undefined) patch.disqualified_reason = body.disqualifiedReason;

  if (Object.keys(patch).length === 0) {
    return badRequest('No updatable fields provided');
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await adminClient
    .from('waitlist')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!data) return notFound('Waitlist entry not found');

  // Log activities for stage / assignee transitions (best-effort, non-blocking)
  const activities: Array<Record<string, unknown>> = [];

  if (
    patch.qualification_stage !== undefined &&
    patch.qualification_stage !== before.qualification_stage
  ) {
    activities.push({
      waitlist_id: id,
      actor_admin_id: user.id,
      kind: stageActivityKind(patch.qualification_stage as string),
      metadata: { from: before.qualification_stage, to: patch.qualification_stage },
    });
  }

  if (
    patch.assigned_admin_id !== undefined &&
    patch.assigned_admin_id !== before.assigned_admin_id
  ) {
    activities.push({
      waitlist_id: id,
      actor_admin_id: user.id,
      kind: 'assigned',
      metadata: { from: before.assigned_admin_id, to: patch.assigned_admin_id },
    });
  }

  if (activities.length > 0) {
    await adminClient.from('waitlist_activities').insert(activities);
  }

  return NextResponse.json({ data: mapWaitlistRow(data) });
}
