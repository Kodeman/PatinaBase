import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/me/sessions - Get current user's MFA factors (session proxy)
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
    // Get MFA factors as session information
    const { data: factorsData } = await supabase.auth.mfa.listFactors();

    const sessions = (factorsData?.all ?? []).map((f: any) => ({
      id: f.id,
      factorType: f.factor_type,
      status: f.status,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
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
