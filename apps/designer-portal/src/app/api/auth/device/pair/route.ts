/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@patina/supabase/client';
import { createServerClient } from '@patina/supabase/server';
import { corsHeaders, handleCors } from '../../qr/cors';

export const dynamic = 'force-dynamic';

const PAIR_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function parseBrowserFromUA(ua: string): { browser: string; os: string } {
  let browser = 'Unknown';
  let os = 'Unknown';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  return { browser, os };
}

/**
 * POST /api/auth/device/pair
 *
 * Authenticated. The portal user requests a nonce that, when scanned by
 * a fresh iOS device, will sign the device in as them.
 */
export async function POST(request: NextRequest) {
  try {
    // Resolve the portal user from the cookie session
    const userClient = await createServerClient();
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401, headers: corsHeaders(request) },
      );
    }

    const nonce = crypto.randomBytes(32).toString('hex'); // 64-char hex
    const expiresAt = new Date(Date.now() + PAIR_SESSION_TTL_MS);
    const ua = request.headers.get('user-agent') || '';
    const { browser, os } = parseBrowserFromUA(ua);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null;

    const admin = createAdminClient();
    const { error: insertError } = await (admin as any)
      .from('device_pair_sessions')
      .insert({
        nonce,
        user_id: user.id,
        status: 'pending',
        origin_browser: browser,
        origin_os: os,
        origin_ip: ip,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Failed to create device pair session:', insertError);
      return NextResponse.json(
        { error: 'Failed to create pairing session' },
        { status: 500, headers: corsHeaders(request) },
      );
    }

    const expTimestamp = Math.floor(expiresAt.getTime() / 1000);
    const url = `patina://pair?nonce=${nonce}&exp=${expTimestamp}`;

    return NextResponse.json(
      { nonce, url, expiresAt: expiresAt.toISOString() },
      { headers: corsHeaders(request) },
    );
  } catch (err) {
    console.error('Device pair error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
