import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/orders/[orderId]/move-line — move a line's PO
// line into a different (already-real) PO (S2). Wraps fulfillment_move_line
// (00353), which repoints fulfillment_vendor_po_lines.po_id and logs a
// line.moved event. This is the POST-confirm reshuffle path: real POs exist and
// the drag regroups their lines. (The PRE-confirm drag — reassigning a line's
// vendor among the proposed groups — goes through the assign route instead,
// since no PO line exists yet to move; see the workbench's onDragEnd.)
// Body: { itemId, poId }.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  await params; // orderId is scope/authorization context; the RPC keys on itemId

  let body: { itemId?: string; poId?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const { itemId, poId } = body;
  if (!itemId) return badRequest('itemId is required');
  if (!poId) return badRequest('poId is required');

  try {
    const { error } = await db.rpc('fulfillment_move_line', {
      p_item_id: itemId,
      p_po_id: poId,
      p_actor: actor,
    });
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to move line');
  }
}
