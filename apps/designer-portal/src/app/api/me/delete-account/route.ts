import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

// POST /api/me/delete-account - Request account deletion (30-day grace period)
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // no body is fine
    }

    const adminClient = createAdminClient();

    // Check for existing pending request
    const { data: existing } = await adminClient
      .from('account_deletion_requests')
      .select('id, status, scheduled_for')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return NextResponse.json({
        data: {
          id: existing.id,
          status: 'pending',
          scheduledFor: existing.scheduled_for,
          message: 'Account deletion already requested',
        },
      });
    }

    // Schedule deletion 30 days from now
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + 30);

    const { data, error } = await adminClient
      .from('account_deletion_requests')
      .insert({
        user_id: user.id,
        reason: reason ?? null,
        scheduled_for: scheduledFor.toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'REQUEST_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        id: data.id,
        status: 'pending',
        scheduledFor: data.scheduled_for,
        message: 'Account deletion scheduled. You can cancel within 30 days.',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to request deletion' },
      { status: 500 }
    );
  }
}

// GET /api/me/delete-account - Get deletion request status
export async function GET(_request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const adminClient = createAdminClient();

    const { data } = await adminClient
      .from('account_deletion_requests')
      .select('id, status, reason, scheduled_for, cancelled_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        id: data.id,
        status: data.status,
        reason: data.reason,
        scheduledFor: data.scheduled_for,
        cancelledAt: data.cancelled_at,
        createdAt: data.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ data: null });
  }
}

// DELETE /api/me/delete-account - Cancel account deletion request
export async function DELETE(_request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('account_deletion_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
      })
      .eq('user_id', user.id)
      .eq('status', 'pending');

    if (error) {
      return NextResponse.json(
        { error: 'CANCEL_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to cancel deletion' },
      { status: 500 }
    );
  }
}
