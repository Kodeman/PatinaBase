import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/me/sessions - List the current user's active sessions.
// Reads real rows from public.user_sessions (migration 00162). RLS scopes the
// result to the authenticated user, but we also filter by user_id explicitly.
// NOTE: nothing populates user_sessions on login yet (that needs an auth hook /
// edge function — out of scope), so this may legitimately return zero rows;
// the UI derives the current session from the active Supabase session.
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
    // `user_sessions` is not yet in the generated database types — cast to any.
    const { data, error } = await (supabase as any)
      .from('user_sessions')
      .select('id, user_agent, ip, last_active_at, created_at')
      .eq('user_id', user.id)
      .order('last_active_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'SERVER_ERROR', message: error.message },
        { status: 500 }
      );
    }

    const sessions = (data ?? []).map((s: any) => ({
      id: s.id,
      userAgent: s.user_agent ?? null,
      ip: s.ip ?? null,
      lastActiveAt: s.last_active_at ?? null,
      createdAt: s.created_at ?? null,
    }));

    return NextResponse.json({ data: sessions });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to get sessions' },
      { status: 500 }
    );
  }
}

// DELETE /api/me/sessions - Sign out from all other sessions
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
    // Sign out from other sessions (scope: 'others')
    const { error } = await supabase.auth.signOut({ scope: 'others' });

    if (error) {
      return NextResponse.json(
        { error: 'SIGNOUT_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to revoke sessions' },
      { status: 500 }
    );
  }
}
