/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { corsHeaders, handleCors } from '../cors';

interface VerifyRequestBody {
  sessionToken: string;
  userJwt: string;
  deviceInfo: Record<string, unknown>;
  biometricConfirmed: boolean;
}

/**
 * POST /api/auth/qr/verify
 *
 * Called by the iOS app after scanning a QR code and confirming via biometrics.
 * Validates the user's JWT, generates a magic link, and marks the session as approved.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyRequestBody;
    const { sessionToken, userJwt, deviceInfo, biometricConfirmed } = body;

    if (!sessionToken || !userJwt) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!biometricConfirmed) {
      return NextResponse.json(
        { success: false, error: 'Biometric confirmation required' },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();

    // Validate the user's JWT
    const { data: userData, error: userError } = await supabase.auth.getUser(userJwt);

    if (userError || !userData?.user) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication token' },
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
      return NextResponse.json(
        { success: false, error: 'Session not found or already used' },
        { status: 404 }
      );
    }

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      await (supabase as any)
        .from('qr_auth_sessions')
        .update({ status: 'expired' })
        .eq('session_token', sessionToken);

      return NextResponse.json(
        { success: false, error: 'Session has expired' },
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
      return NextResponse.json(
        { success: false, error: 'Failed to generate authentication link' },
        { status: 500 }
      );
    }

    // Extract the hashed token from the link properties
    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      console.error('No hashed_token in magic link response');
      return NextResponse.json(
        { success: false, error: 'Failed to generate authentication token' },
        { status: 500 }
      );
    }

    // Update the session as approved
    const { error: updateError } = await (supabase as any)
      .from('qr_auth_sessions')
      .update({
        status: 'approved',
        user_id: user.id,
        token_hash: tokenHash,
        user_email: user.email,
        approved_at: new Date().toISOString(),
        device_info: deviceInfo || null,
      })
      .eq('session_token', sessionToken);

    if (updateError) {
      console.error('Failed to update QR session:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session approved',
    }, { headers: corsHeaders(request) });
  } catch (err) {
    console.error('QR verify error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
