import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdmin, badRequest, createAuditLog, serverError } from '@/lib/supabase-admin';

type LooseClient = { from: (table: string) => any };

// PATCH /api/admin/concierge-orders/[id]/checklist — toggle one checklist item.
// Body: { stage, key, done }. Backed by toggle_concierge_checklist_item()
// (00308), which mutates the specific item's done/done_at/by inside
// concierge_orders.checklists[stage] atomically (avoids a read-modify-write
// race a route-side jsonb rewrite would risk). Returns the fresh order row.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const client: SupabaseClient = auth.adminClient;
  const db = auth.adminClient as unknown as LooseClient;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const stage = body.stage;
  const key = body.key;
  const done = body.done;

  if (typeof stage !== 'string' || !stage) return badRequest('stage is required');
  if (typeof key !== 'string' || !key) return badRequest('key is required');
  if (typeof done !== 'boolean') return badRequest('done must be a boolean');

  const actor = auth.user.email ?? auth.user.id;

  try {
    const { error } = await client.rpc('toggle_concierge_checklist_item', {
      p_id: id,
      p_stage: stage,
      p_key: key,
      p_done: done,
      p_actor: actor,
    });
    if (error) return badRequest(error.message);

    await createAuditLog(auth.adminClient, {
      userId: auth.user.id,
      action: 'concierge_order.checklist_toggle',
      resourceType: 'concierge_order',
      resourceId: id,
      newValues: { stage, key, done },
    });

    // Return the refreshed order so the client updates in one round trip.
    const { data, error: readErr } = await db
      .from('concierge_orders')
      .select('*, vendor:vendors(name)')
      .eq('id', id)
      .single();
    if (readErr) throw readErr;

    const { vendor, ...rest } = data as Record<string, any>;
    return NextResponse.json({ data: { ...rest, vendor_name: vendor?.name ?? null } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to toggle checklist item');
  }
}
