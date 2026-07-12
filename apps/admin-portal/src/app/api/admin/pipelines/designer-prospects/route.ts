import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, serverError } from '@/lib/supabase-admin';

// GET/POST /api/admin/pipelines/designer-prospects — the Designers board's
// data source (Mission Control /mission-control/pipelines, WP-2.2).
//
// designer_prospects (00305) is a fresh table not yet reflected in the
// checked-in packages/supabase/src/database.types.ts (regenerating+
// committing that file is the integration agent's job, per
// patina-parallel-work — this worktree does not commit it). The admin
// client is narrowed to an untyped `{ from }` shape before calling it, same
// technique already used in api/admin/vendors/route.ts for the same reason
// (there: the generated client's strict insert overloads; here: the table
// isn't in the generated Database type at all yet).
type LooseClient = { from: (table: string) => any };

export interface DesignerProspectRow {
  id: string;
  full_name: string;
  studio_name: string | null;
  email: string | null;
  portfolio_url: string | null;
  instagram: string | null;
  market_city: string | null;
  market_state: string | null;
  source: string | null;
  owner: 'kody' | 'leah';
  stage: 'sourced' | 'contacted' | 'meeting' | 'founding_circle' | 'passed';
  stage_entered_at: string;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
  profile_id: string | null;
  application_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  const url = new URL(request.url);
  const stage = url.searchParams.get('stage') ?? undefined;
  const owner = url.searchParams.get('owner') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;

  try {
    let query = db.from('designer_prospects').select('*');

    if (stage) query = query.eq('stage', stage);
    if (owner) query = query.eq('owner', owner);
    if (search) query = query.ilike('full_name', `%${search}%`);

    query = query.order('stage_entered_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data as DesignerProspectRow[] });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list designer prospects');
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  if (!fullName) return badRequest('full_name is required');

  const owner = body.owner === 'leah' ? 'leah' : 'kody';

  try {
    // Prospects are created directly via the service-role client rather
    // than through a dedicated create_designer_prospect RPC — there is no
    // stage-change or cross-table write to audit at create time (that only
    // happens on a stage move, via move_pipeline_stage), so the simpler
    // route-side insert is sufficient. See 00305's migration header.
    const { data, error } = await db
      .from('designer_prospects')
      .insert({
        full_name: fullName,
        studio_name: body.studio_name ?? null,
        email: body.email ?? null,
        portfolio_url: body.portfolio_url ?? null,
        instagram: body.instagram ?? null,
        market_city: body.market_city ?? null,
        market_state: body.market_state ?? null,
        source: body.source ?? null,
        owner,
        next_action: body.next_action ?? null,
        next_action_due: body.next_action_due ?? null,
        notes: body.notes ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ data: data as DesignerProspectRow }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to create designer prospect');
  }
}
