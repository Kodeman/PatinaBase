import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@patina/supabase/server';
import { applyUnsubscribeToken } from '@patina/notifications';

async function apply(token: string | null) {
  return token
    ? await applyUnsubscribeToken(createServiceClient(), token)
    : { ok: false as const, status: 'malformed' as const, type: undefined };
}

function outcomePage(req: NextRequest, outcome: Awaited<ReturnType<typeof apply>>) {
  const redirect = new URL('/preferences/unsubscribe', req.url);
  redirect.searchParams.set('status', outcome.status);
  if (outcome.type) redirect.searchParams.set('type', String(outcome.type));
  return redirect;
}

/**
 * Two callers, told apart by what they will do with the answer.
 *
 * A mail client honouring `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 * (RFC 8058) POSTs here with no browser attached and reads only the status
 * code — it gets 200, or a JSON refusal, exactly as before.
 *
 * A person confirming on `/preferences/unsubscribe` submits a form from a
 * browser, which asks for `text/html`. She gets the outcome page instead of a
 * blank 200, over a 303 so the browser follows it with a GET and a reload
 * cannot re-post.
 */
export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  const wantsHtml = (req.headers.get('accept') ?? '').includes('text/html');

  if (!wantsHtml) {
    if (!token) {
      return NextResponse.json({ error: 'missing_token' }, { status: 400 });
    }
    const outcome = await apply(token);
    if (outcome.ok) return new NextResponse(null, { status: 200 });
    return NextResponse.json(
      { error: outcome.status, message: (outcome as { message?: string }).message },
      { status: outcome.status === 'error' ? 500 : 400 },
    );
  }

  return NextResponse.redirect(outcomePage(req, await apply(token)), 303);
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  return NextResponse.redirect(outcomePage(req, await apply(token)));
}
