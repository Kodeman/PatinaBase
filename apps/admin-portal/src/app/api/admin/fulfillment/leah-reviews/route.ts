import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import type { LeahSubstitutionReview } from '@/services/fulfillment';

// S7 Leah substitution reviews (R1.4, §9.4) — the pending cards that feed the
// existing LeahReviewDeck at /mission-control?assignee=leah as a SECOND source.
// leah_reviews is the cross-track contract; here we compose each pending review
// with client-safe order context (order #, client name, item name) — never a
// vendor name (the comparison payload the operator packaged is already
// client-safe copy).

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  try {
    const { data: reviews, error } = await db
      .from('leah_reviews')
      .select('id, exception_id, payload, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    const rows = reviews ?? [];
    if (rows.length === 0) return NextResponse.json({ data: [] });

    const excIds = rows.map((r) => r.exception_id);
    const { data: excs } = await db
      .from('fulfillment_exceptions')
      .select('id, order_id, order_item_id')
      .in('id', excIds);
    const excMap = new Map((excs ?? []).map((e) => [e.id, e]));

    const orderIds = [...new Set((excs ?? []).map((e) => e.order_id).filter(Boolean))] as string[];
    const itemIds = [...new Set((excs ?? []).map((e) => e.order_item_id).filter(Boolean))] as string[];
    const [orders, items] = await Promise.all([
      orderIds.length
        ? db.from('fulfillment_orders').select('id, order_no, client_name').in('id', orderIds)
        : Promise.resolve({ data: [] as { id: string; order_no: number; client_name: string }[] }),
      itemIds.length
        ? db.from('fulfillment_order_items').select('id, item_name').in('id', itemIds)
        : Promise.resolve({ data: [] as { id: string; item_name: string }[] }),
    ]);
    const orderMap = new Map((orders.data ?? []).map((o) => [o.id, o]));
    const itemMap = new Map((items.data ?? []).map((i) => [i.id, i]));

    const list: LeahSubstitutionReview[] = rows.map((r) => {
      const exc = excMap.get(r.exception_id);
      const order = exc?.order_id ? orderMap.get(exc.order_id) : null;
      const item = exc?.order_item_id ? itemMap.get(exc.order_item_id) : null;
      return {
        id: r.id,
        exceptionId: r.exception_id,
        orderId: exc?.order_id ?? null,
        orderNo: order?.order_no ?? null,
        clientName: order?.client_name ?? null,
        itemName: item?.item_name ?? null,
        payload: (r.payload as Record<string, unknown>) ?? {},
        createdAt: r.created_at,
      };
    });

    return NextResponse.json({ data: list });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list Leah reviews');
  }
}
