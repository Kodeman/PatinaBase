import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// DELETE /api/me/sessions/[id] - Unenroll a specific MFA factor
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id: factorId } = await context.params;

  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });

    if (error) {
      return NextResponse.json(
        { error: 'UNENROLL_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to revoke session' },
      { status: 500 }
    );
  }
}
