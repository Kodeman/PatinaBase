export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyAdmin,
  unauthorized,
  badRequest,
  notFound,
  serverError,
} from '@/lib/admin-api';

// Designer-onboarding program, Wave 4 — admin enrollment management for a
// single automated_sequences row. Sibling to ../route.ts (list/detail) and
// ../../route.ts (list/create); same verifyAdmin bearer-token gate, same
// getServiceClient() (service-role — RLS is bypassed deliberately here, as
// on every other comms/ route). Status vocabulary ('active' | 'completed' |
// 'unsubscribed') matches automation-processor/index.ts, the only other
// writer of sequence_enrollments.status.

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export interface EnrollmentRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  current_step: number;
  status: string;
  next_step_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  step_history: unknown;
}

function toEnrollmentRow(row: any): EnrollmentRow {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    user_id: row.user_id,
    email: profile?.email ?? null,
    display_name: profile?.display_name ?? null,
    current_step: row.current_step,
    status: row.status,
    next_step_at: row.next_step_at,
    enrolled_at: row.enrolled_at,
    completed_at: row.completed_at,
    step_history: row.step_history,
  };
}

async function loadSequence(supabase: ReturnType<typeof getServiceClient>, id: string) {
  const { data, error } = await supabase
    .from('automated_sequences')
    .select('id, total_enrolled')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const sequence = await loadSequence(supabase, id);
  if (!sequence) return notFound('Automation not found');

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  const { data, error, count } = await supabase
    .from('sequence_enrollments')
    .select(
      'id, user_id, current_step, status, next_step_at, enrolled_at, completed_at, step_history, profiles(email, display_name)',
      { count: 'exact' },
    )
    .eq('sequence_id', id)
    .order('enrolled_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return serverError(error.message);

  const rows = (data ?? []).map(toEnrollmentRow);

  return NextResponse.json({ rows, total: count ?? rows.length, limit, offset });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const sequence = await loadSequence(supabase, id);
  if (!sequence) return notFound('Automation not found');

  let body: { email?: string; user_id?: string };
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  const rawUserId = body.user_id?.trim();
  const rawEmail = body.email?.trim().toLowerCase();
  if (!rawUserId && !rawEmail) {
    return badRequest('email or user_id is required');
  }

  let userId = rawUserId;
  if (!userId) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', rawEmail as string)
      .maybeSingle();
    if (profileError) return serverError(profileError.message);
    if (!profile) return notFound(`No account found for ${rawEmail}`);
    userId = profile.id;
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) return serverError(profileError.message);
    if (!profile) return notFound('No account found for that user_id');
  }

  const { data: existing, error: existingError } = await supabase
    .from('sequence_enrollments')
    .select('id, status')
    .eq('sequence_id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (existingError) return serverError(existingError.message);

  const nowIso = new Date().toISOString();

  if (existing) {
    if (existing.status === 'active') {
      return NextResponse.json({ error: 'Already enrolled and active' }, { status: 409 });
    }
    // status is 'completed' | 'unsubscribed' (or any other non-active state)
    // — reactivate rather than double-enroll. Does NOT increment
    // total_enrolled: this is a resumed enrollment, not a genuinely new one.
    const { data: reactivated, error: reactivateError } = await supabase
      .from('sequence_enrollments')
      .update({
        status: 'active',
        current_step: 0,
        next_step_at: nowIso,
        completed_at: null,
      })
      .eq('id', existing.id)
      .select('id, user_id, current_step, status, next_step_at, enrolled_at, completed_at, step_history, profiles(email, display_name)')
      .single();
    if (reactivateError) return serverError(reactivateError.message);
    return NextResponse.json(toEnrollmentRow(reactivated));
  }

  const { data: inserted, error: insertError } = await supabase
    .from('sequence_enrollments')
    .insert({
      sequence_id: id,
      user_id: userId,
      current_step: 0,
      status: 'active',
      next_step_at: nowIso,
      enrolled_at: nowIso,
    })
    .select('id, user_id, current_step, status, next_step_at, enrolled_at, completed_at, step_history, profiles(email, display_name)')
    .single();
  if (insertError) return serverError(insertError.message);

  // Genuine new enrollment — increment the counter (read-then-write, same
  // non-atomic pattern as designer-invite's enrollFoundingInvite; admin
  // manual-enroll traffic is low enough that a race here is not a concern).
  await supabase
    .from('automated_sequences')
    .update({ total_enrolled: (sequence.total_enrolled ?? 0) + 1 })
    .eq('id', id);

  return NextResponse.json(toEnrollmentRow(inserted), { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;

  let body: { enrollment_id?: string };
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }

  const enrollmentId = body.enrollment_id?.trim();
  if (!enrollmentId) return badRequest('enrollment_id is required');

  const { data: existing, error: existingError } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .eq('id', enrollmentId)
    .eq('sequence_id', id)
    .maybeSingle();
  if (existingError) return serverError(existingError.message);
  if (!existing) return notFound('Enrollment not found');

  const { error } = await supabase
    .from('sequence_enrollments')
    .update({ status: 'unsubscribed', next_step_at: null })
    .eq('id', enrollmentId);
  if (error) return serverError(error.message);

  return NextResponse.json({ ok: true });
}
