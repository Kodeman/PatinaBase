import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/vendors/[id]/quote-request
//
// VEN-01: designer requests a quote from a vendor. Inserts a
// public.vendor_quote_requests row (migration 00162) scoped to the calling
// designer via RLS ("Designers can manage their quote requests").
//
// Body { scope?: string, timeline?: string, message: string }. status is set
// to 'sent' on submit. Actual vendor notification email is owned by a
// downstream job and is deferred here — the persisted 'sent' row is the
// contract.
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

    const { data, error } = await supabase
      .from('vendor_quote_requests')
      .insert({
        vendor_id: vendorId,
        designer_id: user.id,
        scope,
        timeline,
        message,
        status: 'sent',
      })
      .select('id, status, created_at')
      .single();

    if (error) {
      console.error('[API] vendor quote-request error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /vendors/[id]/quote-request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
