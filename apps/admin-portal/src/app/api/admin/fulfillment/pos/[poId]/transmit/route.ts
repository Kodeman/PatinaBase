import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, serverError } from '@/lib/supabase-admin';
import { invokeFulfillmentPo } from '@/lib/fulfillment-po-fn';

// POST /api/admin/fulfillment/pos/[poId]/transmit — transmit a PO (S3, spec
// §5.3). Body: { mode: 'send' | 'mark_transmitted', method?, reference? }.
//   send             → the fn emails the vendor from orders@ + logs po.transmitted
//                      (method='email', Resend id as the ref).
//   mark_transmitted → portal/csv: the fn archives the PDF + logs po.transmitted
//                      with the operator-entered method + reference (no email).
// The route is a thin proxy to the fulfillment-po edge fn (service-role Bearer);
// all state + logging happens in the fn's fulfillment_record_transmission RPC.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { poId } = await params;
  const actor = auth.user.email ?? auth.user.id;

  let body: { mode?: string; method?: string; reference?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid body');
  }
  const mode = body.mode === 'send' ? 'send' : 'mark_transmitted';
  if (mode === 'mark_transmitted' && !body.method) {
    return badRequest('method is required for a non-email transmission');
  }

  try {
    const res = await invokeFulfillmentPo({
      po_id: poId,
      mode,
      method: body.method,
      reference: body.reference,
      actor,
    });
    const json = await res.json().catch(() => ({ error: 'transmit_failed' }));
    if (!res.ok) {
      // no_recipient / not-found are client-fixable — surface the fn's status.
      return NextResponse.json({ error: json.error ?? 'transmit_failed' }, { status: res.status });
    }
    return NextResponse.json({ data: json });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to transmit the PO');
  }
}
