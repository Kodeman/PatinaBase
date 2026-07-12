import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdmin, badRequest, createAuditLog, serverError } from '@/lib/supabase-admin';

// POST /api/admin/pipelines/stage-move — the single write path both Mission
// Control pipeline boards (Designers, Makers) use to move a card between
// stages (WP-2.2). Thin passthrough to move_pipeline_stage() (00305), which
// does the validation + the atomic stage update + pipeline_stage_events
// insert; this route's only job is auth, request shape, and writing the
// admin-portal-wide audit_logs entry (distinct from pipeline_stage_events —
// audit_logs is the general admin-action log; pipeline_stage_events is the
// board-specific stage ledger the RPC already appends to).
//
// The legacy PATCH /api/admin/vendors/[slug] route's stage branch calls the
// same RPC (see that file) so a pipeline_vendor's stage can change through
// exactly one code path regardless of which UI surface triggered it.
//
// move_pipeline_stage is a same-session addition (migration 00305) not yet
// reflected in the checked-in database.types.ts — the admin client is
// narrowed to the untyped SupabaseClient before calling .rpc(), same
// technique as api/admin/mission-control/vitals/route.ts.
export interface StageMoveRequestBody {
  entityType: 'designer_prospect' | 'pipeline_vendor' | 'concierge_order';
  entityId: string;
  toStage: string;
  note?: string;
}

const VALID_ENTITY_TYPES = new Set(['designer_prospect', 'pipeline_vendor', 'concierge_order']);

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const client: SupabaseClient = auth.adminClient;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const entityType = body.entityType;
  const entityId = body.entityId;
  const toStage = body.toStage;
  const note = typeof body.note === 'string' ? body.note : null;

  if (typeof entityType !== 'string' || !VALID_ENTITY_TYPES.has(entityType)) {
    return badRequest('entityType must be one of designer_prospect, pipeline_vendor, concierge_order');
  }
  if (typeof entityId !== 'string' || !entityId) {
    return badRequest('entityId is required');
  }
  if (typeof toStage !== 'string' || !toStage) {
    return badRequest('toStage is required');
  }

  const actor = auth.user.email ?? auth.user.id;

  try {
    const { data, error } = await client.rpc('move_pipeline_stage', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_to_stage: toStage,
      p_actor: actor,
      p_note: note,
    });

    if (error) {
      // move_pipeline_stage RAISEs on invalid stage / unknown entity /
      // concierge_order-not-yet-supported / entity-not-found — all are
      // caller mistakes, so surface as 400 rather than 500.
      return badRequest(error.message);
    }

    const result = data as {
      entity_type: string;
      entity_id: string;
      from_stage: string | null;
      to_stage: string;
      unchanged: boolean;
    };

    await createAuditLog(auth.adminClient, {
      userId: auth.user.id,
      action: 'pipeline.stage_move',
      resourceType: entityType,
      resourceId: entityId,
      oldValues: { stage: result.from_stage },
      newValues: { stage: result.to_stage },
      metadata: { note, unchanged: result.unchanged },
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to move pipeline stage');
  }
}
