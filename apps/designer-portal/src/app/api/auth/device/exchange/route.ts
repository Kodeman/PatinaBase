/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { corsHeaders, handleCors } from '../../qr/cors';

export const dynamic = 'force-dynamic';

interface ExchangeBody {
  nonce?: string;
  deviceInfo?: Record<string, unknown>;
}

/**
 * POST /api/auth/device/exchange
 *
 * Public endpoint called by the iOS app after scanning a `patina://pair`
 * QR code. Validates the nonce, marks it consumed, and returns a magic
 * link `token_hash` that the iOS app uses with
 * `supabase.auth.verifyOTP({ tokenHash, type: .magiclink })` to obtain a
 * real Supabase session.
 *
 * The nonce is single-use and short-lived. After consumption the row is
 * marked `consumed` and cannot be exchanged again.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExchangeBody;
    const nonce = body.nonce;
    const deviceInfo = body.deviceInfo ?? null;

    if (!nonce || !/^[a-fA-F0-9]{64}$/.test(nonce)) {
      return NextResponse.json(
        { error: 'Invalid nonce' },
        { status: 400, headers: corsHeaders(request) },
      );
    }

    const admin = createAdminClient();

    // Look up the session
    const { data: session, error: lookupError } = await (admin as any)
      .from('device_pair_sessions')
      .select('user_id, status, expires_at')
      .eq('nonce', nonce)
      .maybeSingle();

    if (lookupError || !session) {
      return NextResponse.json(
        { error: 'Pairing session not found' },
        { status: 404, headers: corsHeaders(request) },
      );
    }

    if (session.status !== 'pending') {
      return NextResponse.json(
        { error: 'Pairing session already used or denied' },
        { status: 410, headers: corsHeaders(request) },
      );
    }

    if (new Date(session.expires_at) < new Date()) {
      await (admin as any)
        .from('device_pair_sessions')
        .update({ status: 'expired' })
        .eq('nonce', nonce);
      return NextResponse.json(
        { error: 'Pairing session expired' },
        { status: 410, headers: corsHeaders(request) },
      );
    }

    // Resolve the user's email
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(session.user_id);
    if (userError || !userData?.user?.email) {
      console.error('Failed to load paired user:', userError);
      return NextResponse.json(
        { error: 'Failed to load paired user' },
        { status: 500, headers: corsHeaders(request) },
      );
    }
    const email = userData.user.email;

    // Mint a magic link, extract its hashed token. We never email it —
    // we hand it to the iOS client which immediately calls verifyOtp.
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({ type: 'magiclink', email });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('Failed to generate magic link for device pair:', linkError);
      return NextResponse.json(
        { error: 'Failed to generate authentication token' },
        { status: 500, headers: corsHeaders(request) },
      );
    }

    // Mark the session consumed
    const { error: updateError } = await (admin as any)
      .from('device_pair_sessions')
      .update({
        status: 'consumed',
        device_info: deviceInfo,
        consumed_at: new Date().toISOString(),
      })
      .eq('nonce', nonce);
    if (updateError) {
      console.error('Failed to mark device pair consumed:', updateError);
      // Continue anyway — the iOS client still gets the token; we log for audit.
    }

    return NextResponse.json(
      { tokenHash, type: 'magiclink', email },
      { headers: corsHeaders(request) },
    );
  } catch (err) {
    console.error('Device exchange error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
