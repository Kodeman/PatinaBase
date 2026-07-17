import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { sortExceptionsByClock, type ExceptionListRow } from '@patina/fulfillment';

// S7 Exception Desk (spec §5.5) — list + open.
// GET: every exception, clock-urgency sorted, composed from base tables (one
// service-role read + id-batched lookups; no new view). POST: open an exception
// via fulfillment_open_exception (the queue's `x` key + workbench affordances).

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  try {
    const { data: excs, error } = await db
      .from('fulfillment_exceptions')
      .select('id, type, status, order_id, order_item_id, po_id, clock_due_at, opened_at')
      .order('opened_at', { ascending: false });
    if (error) throw error;
    const rows = excs ?? [];

    const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))] as string[];
    const itemIds = [...new Set(rows.map((r) => r.order_item_id).filter(Boolean))] as string[];
    const poIds = [...new Set(rows.map((r) => r.po_id).filter(Boolean))] as string[];

    const [orders, items, pos] = await Promise.all([
      orderIds.length
        ? db.from('fulfillment_orders').select('id, order_no, client_name').in('id', orderIds)
        : Promise.resolve({ data: [] as { id: string; order_no: number; client_name: string }[] }),
      itemIds.length
        ? db.from('fulfillment_order_items').select('id, item_name').in('id', itemIds)
        : Promise.resolve({ data: [] as { id: string; item_name: string }[] }),
      poIds.length
        ? db.from('fulfillment_vendor_pos').select('id, po_number').in('id', poIds)
        : Promise.resolve({ data: [] as { id: string; po_number: string }[] }),
    ]);

    const orderMap = new Map((orders.data ?? []).map((o) => [o.id, o]));
    const itemMap = new Map((items.data ?? []).map((i) => [i.id, i]));
    const poMap = new Map((pos.data ?? []).map((p) => [p.id, p]));

    const list: ExceptionListRow[] = rows.map((r) => ({
      id: r.id,
      type: r.type as ExceptionListRow['type'],
      status: r.status as ExceptionListRow['status'],
      orderId: r.order_id,
      orderNo: r.order_id ? orderMap.get(r.order_id)?.order_no ?? null : null,
      clientName: r.order_id ? orderMap.get(r.order_id)?.client_name ?? null : null,
      itemName: r.order_item_id ? itemMap.get(r.order_item_id)?.item_name ?? null : null,
      poNumber: r.po_id ? poMap.get(r.po_id)?.po_number ?? null : null,
      clockDueAt: r.clock_due_at,
      openedAt: r.opened_at,
    }));

    return NextResponse.json({ data: sortExceptionsByClock(list) });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list exceptions');
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;

  let body: {
    type?: string;
    orderId?: string;
    orderItemId?: string;
    poId?: string;
    shipmentId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  const TYPES = ['damage', 'delay', 'backorder', 'substitution', 'loss', 'client_change', 'cancellation', 'return'];
  if (!body.type || !TYPES.includes(body.type)) {
    return badRequest('A valid exception type is required');
  }

  try {
    const refs: Record<string, string> = {};
    if (body.orderId) refs.order_id = body.orderId;
    if (body.orderItemId) refs.order_item_id = body.orderItemId;
    if (body.poId) refs.po_id = body.poId;
    if (body.shipmentId) refs.shipment_id = body.shipmentId;

    const { data, error } = await db.rpc('fulfillment_open_exception', {
      p_type: body.type,
      p_refs: refs as never,
      p_actor: actor,
    });
    if (error) throw error;
    return NextResponse.json({ data: { exceptionId: data as string } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to open exception');
  }
}
