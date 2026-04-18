import { NextRequest, NextResponse } from 'next/server';
import { applyUnsubscribeToken } from '@patina/notifications';
import { getServiceClient } from '@/lib/admin-api';

// RFC 8058 one-click unsubscribe endpoint. Gmail/Outlook POST here when the
// user clicks the native "Unsubscribe" button. Also invoked by the public
// page at /preferences/unsubscribe for the GET flow.

async function handle(token: string | null) {
  if (!token) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const outcome = await applyUnsubscribeToken(supabase, token);

  if (outcome.ok) {
    // RFC 8058 expects 200 with empty body for one-click POST
    return new NextResponse(null, { status: 200 });
  }

  const status = outcome.status === 'error' ? 500 : 400;
  return NextResponse.json({ error: outcome.status, message: outcome.message }, { status });
}

export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  return handle(token);
}

// Support GET too — some email clients rewrite links.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  const outcome = await (async () => {
    if (!token) return { ok: false as const, status: 'malformed' as const };
    const supabase = getServiceClient();
    return applyUnsubscribeToken(supabase, token);
  })();

  // Redirect to the confirmation page with outcome
  const redirect = new URL('/preferences/unsubscribe', req.url);
  redirect.searchParams.set('status', outcome.status);
  if (outcome.type) redirect.searchParams.set('type', String(outcome.type));
  if (token) redirect.searchParams.set('token', token);
  return NextResponse.redirect(redirect);
}
