import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY missing — copy from `supabase status` into apps/designer-portal/.env.local',
  );
}

export const adminDb: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function countByProposal(table: string, proposalId: string): Promise<number> {
  const { count, error } = await adminDb
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('proposal_id', proposalId);
  if (error) throw error;
  return count ?? 0;
}

export async function getProposal(id: string) {
  const { data, error } = await adminDb.from('proposals').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getEngagementByType(proposalId: string) {
  const { data, error } = await adminDb
    .from('proposal_engagement')
    .select('event_type, section_type, duration_seconds')
    .eq('proposal_id', proposalId);
  if (error) throw error;
  return data ?? [];
}

export async function getProposalItems(proposalId: string) {
  const { data, error } = await adminDb
    .from('proposal_items')
    .select('id, item_type, line_total_cents, name, position')
    .eq('proposal_id', proposalId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getProposalSection(proposalId: string, sectionType: string) {
  const { data, error } = await adminDb
    .from('proposal_sections')
    .select('*')
    .eq('proposal_id', proposalId)
    .eq('type', sectionType)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMilestonePercentageSum(proposalId: string): Promise<number> {
  const { data, error } = await adminDb
    .from('proposal_payment_milestones')
    .select('percentage')
    .eq('proposal_id', proposalId);
  if (error) throw error;
  return (data ?? []).reduce((acc: number, row: { percentage: number | string | null }) => {
    const v = row.percentage;
    return acc + (typeof v === 'string' ? parseFloat(v) : v ?? 0);
  }, 0);
}

export async function deleteProposalCascade(proposalId: string): Promise<void> {
  // Detach captures BEFORE deleting the proposal: the ON DELETE cascade
  // removes proposal_scope_rooms first, and the captures FK's SET NULL then
  // trips trg_proposal_captures_guard_update (00130), which re-validates the
  // now-deleted scope_room_id and aborts the whole delete. The guard skips
  // NULL fields, so nulling both in one update passes.
  const { error: detachError } = await adminDb
    .from('proposal_captures')
    .update({ proposal_id: null, scope_room_id: null })
    .eq('proposal_id', proposalId);
  if (detachError) throw detachError;

  const { error } = await adminDb.from('proposals').delete().eq('id', proposalId);
  if (error) throw error;
}

export async function getUserIdByEmail(email: string): Promise<string> {
  // Service-role auth admin API: paginated list, filter by email.
  const { data, error } = await adminDb.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`Auth user not found for email: ${email}`);
  return user.id;
}

export async function setProposalClient(proposalId: string, clientUserId: string): Promise<void> {
  // The new-proposal flow doesn't link a client when no project is selected,
  // and useSendProposal doesn't backfill it. The viewer RLS policy requires
  // proposals.client_id = auth.uid(), so we must set it before the client opens.
  const { error } = await adminDb
    .from('proposals')
    .update({ client_id: clientUserId })
    .eq('id', proposalId);
  if (error) throw error;
}

// ─── FF&E test helpers (capture inbox + extended item select) ────────────────

export interface InsertCapturePayload {
  designer_id: string;
  product_id?: string | null;
  proposal_id?: string | null;
  scope_room_id?: string | null;
  ffe_category_slug?: string | null;
  source_url: string;
  raw_payload?: Record<string, unknown>;
  thumbnail_url?: string | null;
  status?: 'inbox' | 'assigned' | 'consumed' | 'dismissed';
}

export async function insertProposalCapture(payload: InsertCapturePayload) {
  const row = {
    raw_payload: {},
    status: 'inbox' as const,
    ...payload,
  };
  const { data, error } = await adminDb
    .from('proposal_captures')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getCaptureById(id: string) {
  const { data, error } = await adminDb
    .from('proposal_captures')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProposalCaptures(
  designerId: string,
  opts?: { status?: 'inbox' | 'assigned' | 'consumed' | 'dismissed' },
) {
  let q = adminDb.from('proposal_captures').select('*').eq('designer_id', designerId);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getProposalItemsFull(proposalId: string) {
  const { data, error } = await adminDb
    .from('proposal_items')
    .select(
      'id, item_type, product_id, scope_room_id, ffe_category, name, quantity, unit_price, line_total_cents, budget_min_cents, budget_max_cents, position',
    )
    .eq('proposal_id', proposalId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getProposalScopeRooms(proposalId: string) {
  const { data, error } = await adminDb
    .from('proposal_scope_rooms')
    .select('id, name, sort_order')
    .eq('proposal_id', proposalId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ─── Scope-seeding helpers (used by client-sign / client-decline specs) ──────
//
// These mirror the rows the FF&E / Scope Builder UI persists, but go straight
// through the service role so the client-side specs don't depend on the fragile
// drag-and-drop builder. Column names match the live schema (post-00142:
// proposal_items.line_total_cents).

export interface InsertScopeRoomPayload {
  proposalId: string;
  name: string;
  roomType?: string | null;
  budgetCents?: number;
  sortOrder?: number;
}

export async function insertScopeRoom(payload: InsertScopeRoomPayload) {
  const { data, error } = await adminDb
    .from('proposal_scope_rooms')
    .insert({
      proposal_id: payload.proposalId,
      name: payload.name,
      room_type: payload.roomType ?? null,
      budget_cents: payload.budgetCents ?? 0,
      sort_order: payload.sortOrder ?? 0,
    })
    .select('id, name, room_type, budget_cents, sort_order')
    .single();
  if (error) throw error;
  return data;
}

export interface InsertAllowanceItemPayload {
  proposalId: string;
  name: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  ffeCategory?: string | null;
  scopeRoomId?: string | null;
  position?: number;
}

/**
 * Insert an `item_type='allowance'` proposal item. line_total_cents is set to
 * the budget midpoint to mirror the 00160 trigger so the client document shows
 * a non-$0 amount and the allowance range renders.
 */
export async function insertAllowanceItem(payload: InsertAllowanceItemPayload) {
  const midpoint = Math.round((payload.budgetMinCents + payload.budgetMaxCents) / 2);
  const { data, error } = await adminDb
    .from('proposal_items')
    .insert({
      proposal_id: payload.proposalId,
      name: payload.name,
      item_type: 'allowance',
      quantity: 1,
      unit_price: 0,
      unit_sell_price: 0,
      line_total_cents: midpoint,
      budget_min_cents: payload.budgetMinCents,
      budget_max_cents: payload.budgetMaxCents,
      ffe_category: payload.ffeCategory ?? null,
      scope_room_id: payload.scopeRoomId ?? null,
      position: payload.position ?? 0,
    })
    .select('id, item_type, line_total_cents, budget_min_cents, budget_max_cents, name')
    .single();
  if (error) throw error;
  return data;
}

export interface InsertPhasePayload {
  proposalId: string;
  name: string;
  feeCents: number;
  durationWeeks?: number;
  phaseKey?: string | null;
  sortOrder?: number;
}

export async function insertProposalPhase(payload: InsertPhasePayload) {
  const { data, error } = await adminDb
    .from('proposal_phases')
    .insert({
      proposal_id: payload.proposalId,
      name: payload.name,
      fee_cents: payload.feeCents,
      duration_weeks: payload.durationWeeks ?? 2,
      phase_key: payload.phaseKey ?? null,
      sort_order: payload.sortOrder ?? 0,
    })
    .select('id, name, fee_cents, sort_order')
    .single();
  if (error) throw error;
  return data;
}

export interface InsertMilestonePayload {
  proposalId: string;
  label: string;
  percentage: number;
  amountCents: number;
  triggerCondition?: string | null;
  phaseId?: string | null;
  sortOrder?: number;
}

export async function insertPaymentMilestone(payload: InsertMilestonePayload) {
  const { data, error } = await adminDb
    .from('proposal_payment_milestones')
    .insert({
      proposal_id: payload.proposalId,
      label: payload.label,
      percentage: payload.percentage,
      amount_cents: payload.amountCents,
      trigger_condition: payload.triggerCondition ?? null,
      phase_id: payload.phaseId ?? null,
      sort_order: payload.sortOrder ?? 0,
    })
    .select('id, label, percentage, amount_cents, sort_order')
    .single();
  if (error) throw error;
  return data;
}

export async function setProposalTotals(
  proposalId: string,
  totals: { subtotalCents?: number; totalAmountCents: number },
): Promise<void> {
  const patch: Record<string, number> = { total_amount: totals.totalAmountCents };
  if (typeof totals.subtotalCents === 'number') patch.subtotal = totals.subtotalCents;
  const { error } = await adminDb.from('proposals').update(patch).eq('id', proposalId);
  if (error) throw error;
}

export async function getProposalPhases(proposalId: string) {
  const { data, error } = await adminDb
    .from('proposal_phases')
    .select('id, name, fee_cents, duration_weeks, sort_order')
    .eq('proposal_id', proposalId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPaymentMilestones(proposalId: string) {
  const { data, error } = await adminDb
    .from('proposal_payment_milestones')
    .select('id, label, percentage, amount_cents, trigger_condition, sort_order')
    .eq('proposal_id', proposalId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Set designer_clients.status for a designer↔client pair. Used to put the
 * relationship into a pre-activation state ('proposal') so the activation
 * assertion (status → 'active') is a meaningful regression guard — the
 * RPC only promotes rows currently in ('lead','proposal').
 */
export async function setDesignerClientStatus(
  designerId: string,
  clientId: string,
  status: string,
): Promise<void> {
  const { error } = await adminDb
    .from('designer_clients')
    .update({ status })
    .eq('designer_id', designerId)
    .eq('client_id', clientId);
  if (error) throw error;
}

export async function getDesignerClient(designerId: string, clientId: string) {
  const { data, error } = await adminDb
    .from('designer_clients')
    .select('id, status, designer_id, client_id')
    .eq('designer_id', designerId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProjectByProposal(proposalId: string) {
  const { data, error } = await adminDb
    .from('projects')
    .select(
      'id, proposal_id, designer_id, client_id, created_by, status, budget_cents, total_amount_cents, design_fee_cents',
    )
    .eq('proposal_id', proposalId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function countByProject(table: string, projectId: string): Promise<number> {
  const { count, error } = await adminDb
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw error;
  return count ?? 0;
}

export async function getEngagementSignedRow(proposalId: string) {
  const { data, error } = await adminDb
    .from('proposal_engagement')
    .select('id, event_type, viewer_id, metadata')
    .eq('proposal_id', proposalId)
    .eq('event_type', 'signed');
  if (error) throw error;
  return data ?? [];
}

/**
 * Reset a proposal back to a clean 'sent' state. Used by the decline spec so
 * the seeded fixture proposal can be re-run idempotently (clears decline /
 * sign audit columns and re-arms the status).
 */
export async function resetProposalToSent(proposalId: string): Promise<void> {
  const { error } = await adminDb
    .from('proposals')
    .update({
      status: 'sent',
      declined_at: null,
      decline_reason: null,
      accepted_at: null,
      signed_at: null,
      signed_by_name: null,
      signed_ip: null,
      viewed_at: null,
    })
    .eq('id', proposalId);
  if (error) throw error;
}

// ─── Revision-chain helpers (proposal-revise-supersede spec) ─────────────────

/**
 * All versions in a proposal's revision chain (root + children), given ANY
 * member's id. Mirrors the root computation in clone_proposal/send_proposal
 * (00176): root = parent_proposal_id ?? id.
 */
export async function getProposalVersions(anyChainMemberId: string) {
  const member = await getProposal(anyChainMemberId);
  const rootId = member.parent_proposal_id ?? member.id;
  const { data, error } = await adminDb
    .from('proposals')
    .select('id, version, status, parent_proposal_id, sent_at, project_id')
    .or(`id.eq.${rootId},parent_proposal_id.eq.${rootId}`)
    .order('version', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Direct RPC invocation of clone_proposal (00176) for DB-level assertions. */
export async function cloneProposalViaRpc(
  sourceId: string,
  mode: 'revision' | 'duplicate' = 'revision',
  revisionSummary?: string,
): Promise<string> {
  const { data, error } = await adminDb.rpc('clone_proposal', {
    p_source_id: sourceId,
    p_mode: mode,
    p_revision_summary: revisionSummary ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ─── Child-table seeders + counters for clone-completeness assertions ────────

export async function insertExclusion(payload: {
  proposalId: string;
  description: string;
  category?: string | null;
  sortOrder?: number;
}) {
  const { data, error } = await adminDb
    .from('proposal_exclusions')
    .insert({
      proposal_id: payload.proposalId,
      description: payload.description,
      category: payload.category ?? null,
      sort_order: payload.sortOrder ?? 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function insertTeamMember(payload: {
  proposalId: string;
  userId: string;
  role: string;
}) {
  const { data, error } = await adminDb
    .from('proposal_team_members')
    .insert({ proposal_id: payload.proposalId, user_id: payload.userId, role: payload.role })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function insertPalette(payload: {
  proposalId: string;
  name: string;
  scopeRoomId?: string | null;
  isPrimary?: boolean;
}) {
  const { data, error } = await adminDb
    .from('proposal_palettes')
    .insert({
      proposal_id: payload.proposalId,
      name: payload.name,
      scope_room_id: payload.scopeRoomId ?? null,
      is_primary: payload.isPrimary ?? false,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function insertSwatch(payload: { paletteId: string; hex: string; name?: string }) {
  const { data, error } = await adminDb
    .from('palette_swatches')
    .insert({ palette_id: payload.paletteId, hex: payload.hex, name: payload.name ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function insertPhaseDeliverable(payload: { phaseId: string; label: string }) {
  const { data, error } = await adminDb
    .from('proposal_phase_deliverables')
    .insert({ phase_id: payload.phaseId, label: payload.label })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function insertPhaseGate(payload: { phaseId: string; gateKind: string }) {
  const { data, error } = await adminDb
    .from('proposal_phase_gates')
    .insert({ phase_id: payload.phaseId, gate_kind: payload.gateKind })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function insertChangeOrderTerms(payload: {
  proposalId: string;
  processDescription: string;
  hourlyRateCents?: number;
}) {
  const { data, error } = await adminDb
    .from('proposal_change_order_terms')
    .insert({
      proposal_id: payload.proposalId,
      process_description: payload.processDescription,
      hourly_rate_cents: payload.hourlyRateCents ?? 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/** Deliverable count via the phase join (deliverables have no proposal_id). */
export async function countDeliverablesByProposal(proposalId: string): Promise<number> {
  const { count, error } = await adminDb
    .from('proposal_phase_deliverables')
    .select('id, proposal_phases!inner(proposal_id)', { count: 'exact', head: true })
    .eq('proposal_phases.proposal_id', proposalId);
  if (error) throw error;
  return count ?? 0;
}

export async function countGatesByProposal(proposalId: string): Promise<number> {
  const { count, error } = await adminDb
    .from('proposal_phase_gates')
    .select('id, proposal_phases!inner(proposal_id)', { count: 'exact', head: true })
    .eq('proposal_phases.proposal_id', proposalId);
  if (error) throw error;
  return count ?? 0;
}

export async function countSwatchesByProposal(proposalId: string): Promise<number> {
  const { count, error } = await adminDb
    .from('palette_swatches')
    .select('id, proposal_palettes!inner(proposal_id)', { count: 'exact', head: true })
    .eq('proposal_palettes.proposal_id', proposalId);
  if (error) throw error;
  return count ?? 0;
}

export interface ConsumeCaptureRpcArgs {
  captureId: string;
  proposalId: string;
  scopeRoomId: string;
  ffeCategorySlug: string;
  qty?: number;
}

export async function consumeCaptureViaRpc(args: ConsumeCaptureRpcArgs): Promise<string> {
  const { data, error } = await adminDb.rpc('consume_capture', {
    p_capture_id: args.captureId,
    p_proposal_id: args.proposalId,
    p_scope_room_id: args.scopeRoomId,
    p_ffe_category_slug: args.ffeCategorySlug,
    p_qty: args.qty ?? 1,
  });
  if (error) throw error;
  return data as string;
}
