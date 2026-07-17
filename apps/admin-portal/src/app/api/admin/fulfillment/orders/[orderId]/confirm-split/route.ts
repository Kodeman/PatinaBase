import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/orders/[orderId]/confirm-split — confirm the
// proposed split into real vendor POs (S2, spec §5.2). Wraps
// fulfillment_confirm_split (00353), which RAISES if any line is still unmapped
// ('% unmapped line(s) block confirm'), otherwise groups intake lines by vendor
// into POs (po_number PO-{yyyy}-{order_no}-{A..}, side_mark, terms), advances
// those lines intake→split, and events everything. The unmapped-block RAISE is
// surfaced to the client as a 400 so the confirm bar can show WHY (the UI also
// disables confirm pre-emptively, but the server is the authority).

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { orderId } = await params;

  try {
    const { data, error } = await db.rpc('fulfillment_confirm_split', {
      p_order_id: orderId,
      p_actor: actor,
    });
    if (error) {
      // The RPC's unmapped-block RAISE is a client-fixable condition, not a 500.
      if (/unmapped line/i.test(error.message ?? '')) {
        return badRequest(error.message);
      }
      throw error;
    }
    // data = { pos: <count> }
    return NextResponse.json({ data: data ?? { pos: 0 } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to confirm split');
  }
}
