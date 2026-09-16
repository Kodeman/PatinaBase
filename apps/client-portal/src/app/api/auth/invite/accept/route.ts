import { NextRequest, NextResponse } from 'next/server';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * R6 — NO SESSION IS REQUIRED HERE, and that is the change. Under the old flow
 * the homeowner signed up with a password first and this route forwarded her
 * own access token; under the letter she has typed nothing and holds only the
 * token that was mailed to her. The token IS the credential: the edge function
 * validates it (exists, unaccepted, unexpired, unrevoked), claims the row, and
 * only then mints a magic link. This route forwards with the service-role key
 * because the function accepts no other principal.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const token = (body as { token?: unknown })?.token;
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'token_required' }, { status: 400 });
  }

  const upstream = `${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite/accept`;
  const res = await fetch(upstream, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  });
}
