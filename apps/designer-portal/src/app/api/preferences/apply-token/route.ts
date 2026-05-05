import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@patina/supabase/server';
import { applyUnsubscribeToken } from '@patina/notifications';

export async function POST(req: NextRequest) {
  let token: string | null = null;
  try {
    const body = (await req.json()) as { token?: string };
    token = body?.token ?? null;
  } catch {
    token = null;
  }

  if (!token) {
    return NextResponse.json(
      { ok: false, status: 'malformed', message: 'Missing token' },
      { status: 400 },
    );
  }

  const outcome = await applyUnsubscribeToken(createServiceClient(), token);

  if (outcome.ok) {
    return NextResponse.json(outcome, { status: 200 });
  }

  const status = outcome.status === 'error' ? 500 : 400;
  return NextResponse.json(outcome, { status });
}
