/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { corsHeaders, handleCors } from '../cors';

export const dynamic = 'force-dynamic';

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function jsonResponse(data: unknown, request: NextRequest, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...noCacheHeaders, ...corsHeaders(request), ...init?.headers },
  });
}

/**
 * GET /api/auth/qr/status?session=<token>
 *
 * Poll the status of a QR authentication session.
 * Returns the current status and, if approved, the token hash and email.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.nextUrl.searchParams.get('session');

    if (!sessionToken || !/^[a-fA-F0-9]{64}$/.test(sessionToken)) {
      return jsonResponse(
        { error: 'Invalid session token' },
        request,
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: session, error } = await (supabase as any)
      .from('qr_auth_sessions')
      .select('status, token_hash, user_email, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (error || !session) {
      return jsonResponse({ status: 'expired' }, request);
    }

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      // Mark as expired in DB
      await (supabase as any)
        .from('qr_auth_sessions')
        .update({ status: 'expired' })
        .eq('session_token', sessionToken);

      return jsonResponse({ status: 'expired' }, request);
    }

    if (session.status === 'approved') {
      // Delete the session after consumption to prevent replay
      await (supabase as any)
        .from('qr_auth_sessions')
        .delete()
        .eq('session_token', sessionToken);

      return jsonResponse({
        status: 'approved',
        tokenHash: session.token_hash,
        email: session.user_email,
      }, request);
    }

    if (session.status === 'denied') {
      return jsonResponse({ status: 'denied' }, request);
    }

    return jsonResponse({ status: 'pending' }, request);
  } catch (err) {
    console.error('QR status error:', err);
    return jsonResponse(
      { error: 'Internal server error' },
      request,
      { status: 500 }
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
