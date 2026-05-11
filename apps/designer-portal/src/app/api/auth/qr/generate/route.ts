/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@patina/supabase/client';
import { corsHeaders, handleCors } from '../cors';

export const dynamic = 'force-dynamic';

const QR_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function parseBrowserFromUA(ua: string): { browser: string; os: string } {
  let browser = 'Unknown';
  let os = 'Unknown';

  // Browser detection
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  // OS detection
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return { browser, os };
}

/**
 * GET /api/auth/qr/generate
 *
 * Generate a new QR authentication session.
 * Returns a session token and QR URL for display.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + QR_SESSION_TTL_MS);

    const ua = request.headers.get('user-agent') || '';
    const { browser, os } = parseBrowserFromUA(ua);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null;

    const supabase = createAdminClient();

    const { error } = await (supabase as any)
      .from('qr_auth_sessions')
      .insert({
        session_token: sessionToken,
        status: 'pending',
        browser,
        os,
        ip_address: ip,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      console.error('Failed to create QR session:', error);
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    const expTimestamp = Math.floor(expiresAt.getTime() / 1000);
    const qrUrl = `patina://auth?session=${sessionToken}&exp=${expTimestamp}&browser=${encodeURIComponent(browser)}&os=${encodeURIComponent(os)}`;

    return NextResponse.json({
      sessionToken,
      qrUrl,
      expiresAt: expiresAt.toISOString(),
    }, { headers: corsHeaders(request) });
  } catch (err) {
    console.error('QR generate error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * POST /api/auth/qr/generate
 *
 * Method-aliased equivalent of GET. Exists because the Chrome extension's
 * `useQRAuth` hook and the iOS app's QR-pairing service both POST to this
 * endpoint (it's the bootstrap step before any user is signed in). Prior to
 * this, the route only exported GET + OPTIONS, so POST returned 405 in
 * production and the entire QR cross-device sign-in flow was dead at step 1.
 *
 * Accepts an optional JSON body `{ deviceInfo?: Record<string, unknown> }` —
 * extra metadata about the requesting client. The body is optional; an empty
 * or absent body is valid. Malformed JSON returns 400.
 */
export async function POST(request: NextRequest) {
  try {
    // Optional JSON body. Empty / absent body is fine; only reject malformed JSON.
    let deviceInfo: Record<string, unknown> | null = null;
    const rawBody = await request.text();
    if (rawBody.length > 0) {
      try {
        const parsed = JSON.parse(rawBody) as { deviceInfo?: Record<string, unknown> };
        if (parsed && typeof parsed === 'object' && parsed.deviceInfo && typeof parsed.deviceInfo === 'object') {
          deviceInfo = parsed.deviceInfo;
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON body' },
          { status: 400, headers: corsHeaders(request) }
        );
      }
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + QR_SESSION_TTL_MS);

    const ua = request.headers.get('user-agent') || '';
    const { browser, os } = parseBrowserFromUA(ua);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null;

    const supabase = createAdminClient();

    const { error } = await (supabase as any)
      .from('qr_auth_sessions')
      .insert({
        session_token: sessionToken,
        status: 'pending',
        browser,
        os,
        ip_address: ip,
        device_info: deviceInfo,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      console.error('Failed to create QR session:', error);
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500, headers: corsHeaders(request) }
      );
    }

    const expTimestamp = Math.floor(expiresAt.getTime() / 1000);
    const qrUrl = `patina://auth?session=${sessionToken}&exp=${expTimestamp}&browser=${encodeURIComponent(browser)}&os=${encodeURIComponent(os)}`;

    return NextResponse.json({
      sessionToken,
      qrUrl,
      expiresAt: expiresAt.toISOString(),
    }, { headers: corsHeaders(request) });
  } catch (err) {
    console.error('QR generate (POST) error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
