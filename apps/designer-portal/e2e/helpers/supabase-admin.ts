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
    .select('id, item_type, line_total, name, position')
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
      'id, item_type, product_id, scope_room_id, ffe_category, name, quantity, unit_price, line_total, budget_min_cents, budget_max_cents, position',
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
