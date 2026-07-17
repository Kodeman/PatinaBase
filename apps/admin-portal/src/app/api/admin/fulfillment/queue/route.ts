import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import type { FulfillmentQueueRow } from '@patina/fulfillment';

// GET /api/admin/fulfillment/queue — the Fulfillment Queue's data source (S1).
//
// A service-role SELECT of `fulfillment_queue_v` (00353) — DTO passthrough
// plus `total`. No band placement, filtering, or sorting logic lives here or
// in the caller: the view is the single source of truth for band assignment
// (spec §5.1's zero-invisibility invariant), and this route returns exactly
// what it computes, row-for-row. Sort is a display nicety only (breached-first
// within a band via ORDER BY, not a filter).

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  try {
    const { data, error, count } = await db
      .from('fulfillment_queue_v')
      .select('*', { count: 'exact' })
      .order('breached', { ascending: false })
      .order('order_no', { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as unknown as FulfillmentQueueRow[];

    return NextResponse.json({ data: { rows, total: count ?? rows.length } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load fulfillment queue');
  }
}
