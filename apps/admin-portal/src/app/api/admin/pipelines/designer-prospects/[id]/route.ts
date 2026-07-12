import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, notFound, serverError } from '@/lib/supabase-admin';
import type { DesignerProspectRow } from '../route';

type LooseClient = { from: (table: string) => any };

// PATCH /api/admin/pipelines/designer-prospects/[id] — detail-field edits
// only. Stage is intentionally NOT in ALLOWED_UPDATE_FIELDS: a prospect's
// stage moves exclusively through POST /api/admin/pipelines/stage-move (the
// single audited write path, move_pipeline_stage — see 00305), never a bare
// field PATCH, so every stage change gets a pipeline_stage_events row.
const ALLOWED_UPDATE_FIELDS = new Set<keyof DesignerProspectRow>([
  'full_name',
  'studio_name',
  'email',
  'portfolio_url',
  'instagram',
  'market_city',
  'market_state',
  'source',
  'owner',
  'next_action',
  'next_action_due',
  'notes',
  'profile_id',
  'application_id',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if ('stage' in body) {
    return badRequest(
      'stage cannot be changed via PATCH — use POST /api/admin/pipelines/stage-move',
    );
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_UPDATE_FIELDS.has(key as keyof DesignerProspectRow)) {
      updates[key] = value;
    }
  }

  if (updates.owner !== undefined && !['kody', 'leah'].includes(updates.owner as string)) {
    return badRequest(`Invalid owner: ${updates.owner}`);
  }

  if (Object.keys(updates).length === 0) {
    return badRequest('No valid fields to update');
  }

  try {
    const { data, error } = await db
      .from('designer_prospects')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound(`Designer prospect "${id}" not found`);

    return NextResponse.json({ data: data as DesignerProspectRow });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update designer prospect');
  }
}
