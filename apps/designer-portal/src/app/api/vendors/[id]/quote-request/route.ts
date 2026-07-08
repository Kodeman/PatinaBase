import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/vendors/[id]/quote-request
//
// VEN-01: designer requests a quote from a vendor. Inserts a
// public.vendor_quote_requests DRAFT (migration 00162) scoped to the calling
// designer via RLS ("Designers can manage their quote requests"), then invokes
// the quote-request-send edge function to deliver the RFQ email and flip the
// row to status='sent' + sent_at (00261). That edge function IS the "downstream
// job" 00162's comment deferred to; this route is the send-invocation seam.
//
// Why the send runs server-side here (not from a client hook the way po-send
// invokes useSendPurchaseOrder): for a quote request the create and the send
// are a SINGLE user act — the caller POSTs once and the row is dispatched in
// the same request path, so there is no second client round-trip. The edge
// function stays the send authority (loads the row, re-checks ownership,
// composes via the _shared email conventions, sends, stamps) exactly as
// po-send does; this route just forwards the caller's access token as the
// bearer so the gateway verify_jwt and the function's auth.uid() owner check
// both hold.
//
// Body { scope?: string, timeline?: string, message: string }. On a send
// failure (e.g. no vendor email on file) the row stays a 'draft' and the
// caller gets a 4xx — never a silent success.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet regenerated for vendor_quote_requests
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: vendorId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const message: string = (body.message ?? '').toString().trim();
    const scope: string | null = body.scope ? String(body.scope).trim() : null;
    const timeline: string | null = body.timeline ? String(body.timeline).trim() : null;

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    // 1. Insert the draft. status defaults to 'draft' (00162) — the edge
    //    function flips it to 'sent' only after the email actually goes out,
    //    so a failed send leaves an honest draft rather than a "sent" lie.
    const { data, error } = await supabase
      .from('vendor_quote_requests')
      .insert({
        vendor_id: vendorId,
        designer_id: user.id,
        scope,
        timeline,
        message,
      })
      .select('id, status, created_at')
      .single();

    if (error) {
      console.error('[API] vendor quote-request insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 2. Deliver the RFQ email via the quote-request-send edge function,
    //    forwarding the caller's JWT (the po-send bearer shape).
    const { data: sessionResult } = await supabase.auth.getSession();
    const accessToken: string | undefined = sessionResult?.session?.access_token;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!accessToken || !supabaseUrl) {
      // The draft is saved; be honest that it wasn't dispatched.
      return NextResponse.json(
        { error: 'Quote request saved, but it could not be sent — please try again.' },
        { status: 502 },
      );
    }

    const fnRes = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/functions/v1/quote-request-send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quoteRequestId: data.id, mode: 'send' }),
      },
    );

    if (!fnRes.ok) {
      const errBody = (await fnRes.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      // The row remains a 'draft' (not dispatched). Prefer the function's human
      // detail (e.g. "No vendor email on file …") over the bare error code.
      const detail =
        errBody.detail || errBody.error || 'Could not send the quote request';
      return NextResponse.json({ error: detail }, { status: fnRes.status });
    }

    const sent = (await fnRes.json().catch(() => ({}))) as { sentAt?: string | null };
    return NextResponse.json(
      {
        data: {
          id: data.id,
          status: 'sent',
          created_at: data.created_at,
          sent_at: sent.sentAt ?? null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[API] POST /vendors/[id]/quote-request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
