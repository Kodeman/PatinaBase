import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdmin, badRequest, createAuditLog, serverError } from '@/lib/supabase-admin';

type LooseClient = { from: (table: string) => any };

// POST /api/admin/concierge-orders/[id]/damage — enter the damage subflow.
// Body: { carrierDeadline?, damageClaimId?, note? }. Backed by
// enter_concierge_damage_mode() (00308), which seeds concierge_orders.damage
// with the photo checklist (from the concierge-order-playbook skill), the
// carrier-deadline countdown and window_started_at, optionally linking an
// existing damage_claims row. The daily discrepancy job escalates unresolved
// claims whose deadline is <7 days out. Returns the refreshed order.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const client: SupabaseClient = auth.adminClient;
  const db = auth.adminClient as unknown as LooseClient;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const carrierDeadline =
    typeof body.carrierDeadline === 'string' && body.carrierDeadline ? body.carrierDeadline : null;
  const damageClaimId =
    typeof body.damageClaimId === 'string' && body.damageClaimId ? body.damageClaimId : null;
  const note = typeof body.note === 'string' ? body.note : null;

  const actor = auth.user.email ?? auth.user.id;

  try {
    const { error } = await client.rpc('enter_concierge_damage_mode', {
      p_id: id,
      p_actor: actor,
      p_carrier_deadline: carrierDeadline,
      p_damage_claim_id: damageClaimId,
      p_note: note,
    });
    if (error) return badRequest(error.message);

    await createAuditLog(auth.adminClient, {
      userId: auth.user.id,
      action: 'concierge_order.enter_damage_mode',
      resourceType: 'concierge_order',
      resourceId: id,
      metadata: { carrierDeadline, damageClaimId, note },
    });

    const { data, error: readErr } = await db
      .from('concierge_orders')
      .select('*, vendor:vendors(name)')
      .eq('id', id)
      .single();
    if (readErr) throw readErr;

    const { vendor, ...rest } = data as Record<string, any>;
    return NextResponse.json({ data: { ...rest, vendor_name: vendor?.name ?? null } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to enter damage mode');
  }
}
