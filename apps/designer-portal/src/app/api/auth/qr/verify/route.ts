/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { corsHeaders, handleCors } from '../cors';

interface VerifyRequestBody {
  sessionToken: string;
  /** @deprecated Ignored. Authentication comes only from Authorization. */
  userJwt?: string;
  deviceInfo: Record<string, unknown>;
  biometricConfirmed: boolean;
}

function jsonResponse(data: unknown, request: NextRequest, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...corsHeaders(request), ...init?.headers },
  });
}

/**
 * POST /api/auth/qr/verify
 *
 * Called by a native app after scanning a QR code. The Authorization bearer is
 * the server-validated proof of identity. `biometricConfirmed` records the
 * native UX confirmation; it is not cryptographic proof to this server.
 */
export async function POST(request: NextRequest) {
  try {
    let body: VerifyRequestBody;
    try {
      body = (await request.json()) as VerifyRequestBody;
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid request' },
        request,
        { status: 400 }
      );
    }
    const { sessionToken, deviceInfo, biometricConfirmed } = body;
    const authorization = request.headers.get('authorization');
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!sessionToken || !/^[a-fA-F0-9]{64}$/.test(sessionToken)) {
      return jsonResponse(
        { success: false, error: 'Missing required fields' },
        request,
        { status: 400 }
      );
    }

    if (!biometricConfirmed) {
      return jsonResponse(
        { success: false, error: 'Biometric confirmation required' },
        request,
        { status: 403 }
      );
    }

    if (!bearerMatch?.[1]) {
      return jsonResponse(
        { success: false, error: 'Authentication required' },
        request,
        { status: 401 }
      );
    }

    const supabase = createAdminClient();

    // Validate the user's JWT
    const { data: userData, error: userError } = await supabase.auth.getUser(bearerMatch[1]);

    if (userError || !userData?.user) {
      return jsonResponse(
        { success: false, error: 'Invalid authentication token' },
        request,
        { status: 401 }
      );
    }

    const user = userData.user;

    // Look up the QR session
    const { data: session, error: sessionError } = await (supabase as any)
      .from('qr_auth_sessions')
      .select('*')
      .eq('session_token', sessionToken)
      .eq('status', 'pending')
      .single();

    if (sessionError || !session) {
      return jsonResponse(
        { success: false, error: 'Session not found or already used' },
        request,
        { status: 404 }
      );
    }

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      await (supabase as any)
        .from('qr_auth_sessions')
        .update({ status: 'expired' })
        .eq('session_token', sessionToken)
        .eq('status', 'pending');

      return jsonResponse(
        { success: false, error: 'Session has expired' },
        request,
        { status: 410 }
      );
    }

    // Generate a magic link for the user
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
      });

    if (linkError || !linkData) {
      console.error('Failed to generate magic link:', linkError);
      return jsonResponse(
        { success: false, error: 'Failed to generate authentication link' },
        request,
        { status: 500 }
      );
    }

    // Extract the hashed token from the link properties
    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      console.error('No hashed_token in magic link response');
      return jsonResponse(
        { success: false, error: 'Failed to generate authentication token' },
        request,
        { status: 500 }
      );
    }

    // Update the session as approved
    // Only the first approved device may transition a pending session. This
    // protects against concurrent scans without deleting the browser's handoff
    // record before it can consume the one-time GoTrue token.
    const { data: approvedSession, error: updateError } = await (supabase as any)
      .from('qr_auth_sessions')
      .update({
        status: 'approved',
        user_id: user.id,
        token_hash: tokenHash,
        user_email: user.email,
        approved_at: new Date().toISOString(),
        device_info: deviceInfo || null,
      })
      .eq('session_token', sessionToken)
      .eq('status', 'pending')
      .select('session_token')
      .maybeSingle();

    if (updateError) {
      console.error('Failed to update QR session:', updateError);
      return jsonResponse(
        { success: false, error: 'Failed to update session' },
        request,
        { status: 500 }
      );
    }

    if (!approvedSession) {
      return jsonResponse(
        { success: false, error: 'Session was already used' },
        request,
        { status: 409 }
      );
    }

    return jsonResponse({
      success: true,
      message: 'Session approved',
    }, request);
  } catch (err) {
    console.error('QR verify error:', err);
    return jsonResponse(
      { success: false, error: 'Internal server error' },
      request,
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
