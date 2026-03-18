/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@patina/supabase/client';
import { corsHeaders, handleCors } from '../cors';

export const dynamic = 'force-dynamic';

const QR_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Direct PostgREST URL for bypassing Kong when internal routing is broken
// Falls back to the Supabase client if not set
const POSTGREST_DIRECT_URL = process.env.POSTGREST_DIRECT_URL;

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

async function insertViaPostgREST(data: Record<string, unknown>): Promise<{ error: any }> {
  const url = POSTGREST_DIRECT_URL;
  if (!url) return { error: 'POSTGREST_DIRECT_URL not set' };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { error: 'SUPABASE_SERVICE_ROLE_KEY not set' };

  const resp = await fetch(`${url}/qr_auth_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { error: `PostgREST ${resp.status}: ${body}` };
  }
  return { error: null };
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

    const insertData = {
      session_token: sessionToken,
      status: 'pending',
      browser,
      os,
      ip_address: ip,
      expires_at: expiresAt.toISOString(),
    };

    let error: any;

    if (POSTGREST_DIRECT_URL) {
      // Bypass Kong — talk to PostgREST directly on Docker network
      const result = await insertViaPostgREST(insertData);
      error = result.error;
    } else {
      // Standard path through Supabase client (goes through Kong)
      const supabase = createAdminClient();
      const result = await (supabase as any)
        .from('qr_auth_sessions')
        .insert(insertData);
      error = result.error;
    }

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

export function OPTIONS(request: NextRequest) {
  return handleCors(request);
}
