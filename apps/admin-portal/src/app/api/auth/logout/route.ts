import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

/**
 * Logout API route handler
 * Signs out via Supabase Auth and clears session cookies.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Supabase signOut error:', error);
    }

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'LOGOUT_FAILED', message: 'Failed to log out' },
      { status: 500 },
    );
  }
}
