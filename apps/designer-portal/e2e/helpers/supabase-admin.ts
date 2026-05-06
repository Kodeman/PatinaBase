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
