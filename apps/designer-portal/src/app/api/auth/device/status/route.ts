/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { createServerClient } from '@patina/supabase/server';
import { corsHeaders, handleCors } from '../../qr/cors';

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
 * GET /api/auth/device/status?nonce=<token>
 *
 * Authenticated. The portal polls this to learn whether the iOS device
 * has consumed the nonce yet. Only the user who created the nonce may
 * read its status.
 */
export async function GET(request: NextRequest) {
  try {
    const nonce = request.nextUrl.searchParams.get('nonce');
    if (!nonce || !/^[a-fA-F0-9]{64}$/.test(nonce)) {
      return jsonResponse({ error: 'Invalid nonce' }, request, { status: 400 });
    }

    const userClient = await createServerClient();
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Not authenticated' }, request, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: session, error } = await (admin as any)
      .from('device_pair_sessions')
      .select('user_id, status, expires_at, consumed_at')
      .eq('nonce', nonce)
      .maybeSingle();

    if (error || !session) {
      return jsonResponse({ status: 'expired' }, request);
    }

    if (session.user_id !== user.id) {
      // Don't leak that the nonce exists — return a generic expired.
      return jsonResponse({ status: 'expired' }, request);
    }

    if (session.status === 'pending' && new Date(session.expires_at) < new Date()) {
      await (admin as any)
        .from('device_pair_sessions')
        .update({ status: 'expired' })
        .eq('nonce', nonce);
      return jsonResponse({ status: 'expired' }, request);
    }

    return jsonResponse(
      { status: session.status, consumedAt: session.consumed_at ?? null },
      request,
    );
  } catch (err) {
    console.error('Device status error:', err);
    return jsonResponse({ error: 'Internal server error' }, request, { status: 500 });
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
