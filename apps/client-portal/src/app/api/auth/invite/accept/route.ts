import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@patina/supabase/server';

const FUNCTIONS_BASE = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL
  ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

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
      Authorization: `Bearer ${session.access_token}`,
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
