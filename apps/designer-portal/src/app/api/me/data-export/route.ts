import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase';

// POST /api/me/data-export - Request data export (GDPR)
export async function POST(_request: NextRequest) {
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

    // Check for existing pending/processing request
    const { data: existing } = await adminClient
      .from('data_export_requests')
      .select('id, status, requested_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .single();

    if (existing) {
      return NextResponse.json({
        data: {
          id: existing.id,
          status: existing.status,
          requestedAt: existing.requested_at,
          message: 'Data export already in progress',
        },
      });
    }

    const { data, error } = await adminClient
      .from('data_export_requests')
      .insert({ user_id: user.id })
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
        requestedAt: data.requested_at,
        message: 'Data export request submitted. You will be notified when ready.',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to request export' },
      { status: 500 }
    );
  }
}

// GET /api/me/data-export - Get latest export request status
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
      .from('data_export_requests')
      .select('id, status, requested_at, completed_at, download_url, expires_at')
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
        requestedAt: data.requested_at,
        completedAt: data.completed_at,
        downloadUrl: data.status === 'completed' ? data.download_url : undefined,
        expiresAt: data.expires_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ data: null });
  }
}
