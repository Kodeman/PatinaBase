import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// S7 settlement commit (spec §8) — fulfillment_settle_po. In-tolerance variance
// auto-accepts; a beyond-tolerance variance RAISES unless a typed reason is
// supplied (mapped to 400 so the dialog can demand one).

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { poId } = await params;

  let body: { vendorInvoiceCents?: number; varianceReason?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (typeof body.vendorInvoiceCents !== 'number' || body.vendorInvoiceCents < 0) {
    return badRequest('vendorInvoiceCents (>= 0) is required');
  }

  try {
    const { data, error } = await db.rpc('fulfillment_settle_po', {
      p_po_id: poId,
      p_vendor_invoice_cents: Math.round(body.vendorInvoiceCents),
      // the RPC coalesces '' → no reason (btrim(COALESCE(...,''))); the generated
      // type is `string`, not `string | null`, so pass '' rather than null.
      p_variance_reason: body.varianceReason ?? '',
      p_actor: actor,
    });
    if (error) {
      const msg = error.message ?? '';
      if (/typed reason is required|must be delivered/i.test(msg)) return badRequest(msg);
      throw error;
    }
    return NextResponse.json({ data: (data ?? {}) as Record<string, unknown> });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to settle PO');
  }
}
