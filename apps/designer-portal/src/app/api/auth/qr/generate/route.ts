/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@patina/supabase/client';
import { corsHeaders, handleCors, isAllowedOrigin } from '../cors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QR_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function responseHeaders(request: NextRequest): Record<string, string> {
  return {
    ...corsHeaders(request),
    'Cache-Control': 'no-store',
  };
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function trustedClientIp(request: NextRequest): string | null {
  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) return cloudflareIp;

  // Forwarded headers are only trusted for local development, where there is
  // no Cloudflare edge to supply cf-connecting-ip.
  if (['localhost', '127.0.0.1', '::1'].includes(request.nextUrl.hostname)) {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim()
      || null;
  }

  return null;
}

function isLocalRequest(request: NextRequest): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(request.nextUrl.hostname);
}

function requestIsAllowed(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;
  return !origin || isAllowedOrigin(origin);
}

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
 * Shared session-creation logic used by both GET and POST.
 *
 * Handles token generation, TTL computation, UA/IP extraction, Supabase
 * insert, and response shaping. The only meaningful difference between the
 * two verbs is `deviceInfo` — GET passes null, POST passes whatever the
 * caller supplied (or null if none).
 *
 * POST is responsible for body parsing and 400 responses; this helper
 * is not called until the body has already been parsed successfully.
 */
async function createQrAuthSession(
  request: NextRequest,
  deviceInfo: Record<string, unknown> | null,
): Promise<NextResponse> {
  try {
    const approvalNonce = crypto.randomBytes(32).toString('hex');
    const pollSecret = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + QR_SESSION_TTL_MS);

    const ua = request.headers.get('user-agent') || '';
    const { browser, os } = parseBrowserFromUA(ua);

    const ip = trustedClientIp(request);

    // Cloudflare supplies the only trusted production client address. Failing
    // closed prevents an infrastructure/header regression from silently
    // bypassing the database-backed limiter.
    if (!ip && !isLocalRequest(request)) {
      return NextResponse.json(
        { error: 'Unable to create session' },
        { status: 503, headers: responseHeaders(request) },
      );
    }

    const supabase = createAdminClient();

    const { error } = await (supabase as any)
      .from('qr_auth_sessions')
      .insert({
        session_token: approvalNonce,
        poll_token_hash: hashSecret(pollSecret),
        status: 'pending',
        browser,
        os,
        ip_address: ip,
        device_info: deviceInfo,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      if (
        error.code === 'P0001' &&
        error.message === 'qr_auth_rate_limited'
      ) {
        return NextResponse.json(
          { error: 'Too many QR sign-in attempts. Try again shortly.' },
          {
            status: 429,
            headers: {
              ...responseHeaders(request),
              'Retry-After': '60',
            },
          },
        );
      }
      console.error('Failed to create QR session:', error);
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500, headers: responseHeaders(request) }
      );
    }

    const expTimestamp = Math.floor(expiresAt.getTime() / 1000);
    const qrUrl = `patina://auth?session=${approvalNonce}&exp=${expTimestamp}&browser=${encodeURIComponent(browser)}&os=${encodeURIComponent(os)}`;

    return NextResponse.json({
      // Backward-compatible response field; its value is now browser-only.
      sessionToken: pollSecret,
      qrUrl,
      expiresAt: expiresAt.toISOString(),
    }, { headers: responseHeaders(request) });
  } catch (err) {
    console.error('QR generate error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders(request) }
    );
  }
}

/**
 * GET /api/auth/qr/generate
 *
 * Temporary compatibility path for already-deployed portal and extension
 * clients. Cross-site resource requests are rejected and the same atomic
 * database limiter used by POST applies. New clients use POST.
 */
export async function GET(request: NextRequest) {
  if (!requestIsAllowed(request)) {
    return NextResponse.json(
      { error: 'Origin is not allowed' },
      { status: 403, headers: responseHeaders(request) },
    );
  }

  const response = await createQrAuthSession(request, null);
  response.headers.set('Deprecation', 'true');
  return response;
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
  if (!requestIsAllowed(request)) {
    return NextResponse.json(
      { error: 'Origin is not allowed' },
      { status: 403, headers: responseHeaders(request) },
    );
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415, headers: responseHeaders(request) },
    );
  }

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
        { status: 400, headers: responseHeaders(request) }
      );
    }
  }

  return createQrAuthSession(request, deviceInfo);
}

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
