import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdmin, badRequest, createAuditLog, serverError } from '@/lib/supabase-admin';

// POST /api/admin/concierge-orders/[id]/advance — the single concierge stage
// move path. Thin passthrough to advance_concierge_order() (00308), which does
// the forward-only ordering check, the checklist gate (unless force+note), the
// stage_entered_at stamp, the next-stage checklist seed and the
// pipeline_stage_events(entity_type=concierge_order) insert atomically. This
// route only does auth, request shape and the admin-wide audit_logs entry.
//
// advance_concierge_order RAISEs on: terminal order, non-adjacent jump, invalid
// stage, checklist incomplete, force-without-note — all caller mistakes → 400.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const client: SupabaseClient = auth.adminClient;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const toStage = body.toStage;
  const force = body.force === true;
  const note = typeof body.note === 'string' ? body.note : null;

  if (typeof toStage !== 'string' || !toStage) return badRequest('toStage is required');
  if (force && (!note || note.trim() === '')) {
    return badRequest('A force advance requires a non-empty note');
  }

  const actor = auth.user.email ?? auth.user.id;

  try {
    const { data, error } = await client.rpc('advance_concierge_order', {
      p_id: id,
      p_to_stage: toStage,
      p_actor: actor,
      p_force: force,
      p_note: note,
    });

    if (error) return badRequest(error.message);

    const result = data as { id: string; from_stage: string; to_stage: string };

    await createAuditLog(auth.adminClient, {
      userId: auth.user.id,
      action: 'concierge_order.advance',
      resourceType: 'concierge_order',
      resourceId: id,
      oldValues: { stage: result.from_stage },
      newValues: { stage: result.to_stage },
      metadata: { force, note },
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to advance concierge order');
  }
}
