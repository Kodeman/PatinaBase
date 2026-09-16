import { NextRequest, NextResponse } from 'next/server';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * R10 — the lapsed page's one tap. Always answers 200 { ok: true }: a page any
 * stranger can open must not become an oracle for which tokens exist. The edge
 * function makes the same promise; this route makes it again so a transport
 * failure cannot leak the difference either.
 */
export async function POST(request: NextRequest) {
  let token: string | null = null;
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body?.token === 'string' && body.token) token = body.token;
  } catch {
    token = null;
  }
  if (!token) return NextResponse.json({ ok: true });

  try {
    await fetch(`${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite/refresh`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.error('[auth/invite/refresh] upstream failed', err);
  }
  return NextResponse.json({ ok: true });
}
