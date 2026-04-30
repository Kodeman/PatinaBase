import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

const MEDIA_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:3014';

// GET /api/admin/media-assets — proxies to media service /v1/media/search.
// The browser session is cookie-based (Supabase SSR); we extract the user's
// access_token from the cookie session and forward it as Bearer to the media
// service, which validates the JWT via @patina/auth and enforces
// media.asset.read on the searchAssets controller.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json(
      { error: 'No session access token; sign in again.' },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const upstream = new URL(`${MEDIA_URL}/v1/media/search`);
  // Forward any query string the caller passed.
  for (const [key, value] of url.searchParams) {
    upstream.searchParams.set(key, value);
  }

  try {
    const res = await fetch(upstream.toString(), {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'private, max-age=30',
      },
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to reach media service');
  }
}
