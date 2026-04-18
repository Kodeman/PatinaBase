import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@patina/supabase/server';
import { applyUnsubscribeToken } from '@patina/notifications';

async function handle(token: string | null) {
  if (!token) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }
  const outcome = await applyUnsubscribeToken(createServiceClient(), token);
  if (outcome.ok) {
    return new NextResponse(null, { status: 200 });
  }
  const status = outcome.status === 'error' ? 500 : 400;
  return NextResponse.json(
    { error: outcome.status, message: outcome.message },
    { status },
  );
}

export async function POST(req: NextRequest) {
  return handle(new URL(req.url).searchParams.get('token'));
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  const outcome = token
    ? await applyUnsubscribeToken(createServiceClient(), token)
    : { ok: false as const, status: 'malformed' as const };

  const redirect = new URL('/preferences/unsubscribe', req.url);
  redirect.searchParams.set('status', outcome.status);
  if (outcome.type) redirect.searchParams.set('type', String(outcome.type));
  return NextResponse.redirect(redirect);
}
