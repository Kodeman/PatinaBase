import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProposalItem {
  id: string;
  proposal_id: string;
  product_id: string | null;
  custom_name: string | null;
  custom_description: string | null;
  quantity: number;
  unit_price: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  // Joined data
  product?: {
    id: string;
    name: string;
    primary_image_url: string | null;
    vendor_name: string | null;
  };
}

export interface Proposal {
  id: string;
  project_id: string | null;
  designer_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  total_amount: number;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
  valid_until: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  project?: {
    id: string;
    name: string;
  };
  client?: {
    id: string;
    email: string;
    full_name: string | null;
  };
  items?: ProposalItem[];
}

export interface ProposalFilters {
  status?: string | string[];
  clientId?: string;
  projectId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all proposals for the current designer
 */
export function useProposals(filters?: ProposalFilters) {
  return useQuery({
    queryKey: ['proposals', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('proposals')
        .select(`
          *,
          project:projects(id, name),
          client:profiles!client_id(id, email, full_name)
        `)
        .order('updated_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.clientId) {
        query = query.eq('client_id', filters.clientId);
      }

      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as Proposal[];
    },
  });
}

/**
 * Fetch a single proposal with items
 */
export function useProposal(proposalId: string) {
  return useQuery({
    queryKey: ['proposal', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          project:projects(id, name),
          client:profiles!client_id(id, email, full_name),
          items:proposal_items(
            *,
            product:products(id, name, primary_image_url, vendor_name)
          )
        `)
        .eq('id', proposalId)
        .single();

      if (error) throw error;

      // Sort items by sort_order
      if (data.items) {
        data.items.sort((a: ProposalItem, b: ProposalItem) => a.sort_order - b.sort_order);
      }

      return data as Proposal;
    },
    enabled: !!proposalId,
  });
}

/**
 * Get proposal statistics
 */
export function useProposalStats() {
  return useQuery({
    queryKey: ['proposal-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposals')
        .select('status, total_amount');

      if (error) throw error;

      const proposals = data ?? [];
      const stats = {
        total: proposals.length,
        draft: proposals.filter((p: Proposal) => p.status === 'draft').length,
        sent: proposals.filter((p: Proposal) => p.status === 'sent').length,
        viewed: proposals.filter((p: Proposal) => p.status === 'viewed').length,
        accepted: proposals.filter((p: Proposal) => p.status === 'accepted').length,
        declined: proposals.filter((p: Proposal) => p.status === 'declined').length,
        totalValue: proposals.reduce((sum: number, p: Proposal) => sum + (p.total_amount || 0), 0),
        acceptedValue: proposals
          .filter((p: Proposal) => p.status === 'accepted')
          .reduce((sum: number, p: Proposal) => sum + (p.total_amount || 0), 0),
      };

      return stats;
    },
  });
}

/**
 * Create a new proposal
 */
export function useCreateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      description,
      projectId,
      clientId,
      validUntil,
    }: {
      title: string;
      description?: string;
      projectId?: string;
      clientId?: string;
      validUntil?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('proposals')
        .insert({
          designer_id: user.user.id,
          title,
          description,
          project_id: projectId || null,
          client_id: clientId || null,
          valid_until: validUntil || null,
          status: 'draft',
          total_amount: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

/**
 * Update proposal details
 */
export function useUpdateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      updates,
    }: {
      proposalId: string;
      updates: Partial<Pick<Proposal, 'title' | 'description' | 'valid_until' | 'client_id' | 'project_id'>>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposals')
        .update(updates)
        .eq('id', proposalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
    },
  });
}

/**
 * Add an item to a proposal
 */
export function useAddProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      productId,
      customName,
      customDescription,
      quantity,
      unitPrice,
      notes,
    }: {
      proposalId: string;
      productId?: string;
      customName?: string;
      customDescription?: string;
      quantity: number;
      unitPrice: number;
      notes?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get current max sort_order
      const { data: existingItems } = await supabase
        .from('proposal_items')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existingItems?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_items')
        .insert({
          proposal_id: proposalId,
          product_id: productId || null,
          custom_name: customName || null,
          custom_description: customDescription || null,
          quantity,
          unit_price: unitPrice,
          notes: notes || null,
          sort_order: nextOrder,
        })
        .select()
        .single();

      if (error) throw error;

      // Update proposal total
      await updateProposalTotal(supabase, proposalId);

      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

/**
 * Update a proposal item
 */
export function useUpdateProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      proposalId,
      updates,
    }: {
      itemId: string;
      proposalId: string;
      updates: Partial<Pick<ProposalItem, 'quantity' | 'unit_price' | 'notes' | 'custom_name' | 'custom_description'>>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposal_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;

      // Update proposal total
      await updateProposalTotal(supabase, proposalId);

      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

/**
 * Remove an item from a proposal
 */
export function useRemoveProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      proposalId,
    }: {
      itemId: string;
      proposalId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('proposal_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Update proposal total
      await updateProposalTotal(supabase, proposalId);
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

/**
 * Send a proposal to the client
 */
export function useSendProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposals')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', proposalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, proposalId) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

/**
 * Delete a draft proposal
 */
export function useDeleteProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Only allow deleting drafts
      const { error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', proposalId)
        .eq('status', 'draft');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateProposalTotal(supabase: any, proposalId: string) {
  // Calculate total from items
  const { data: items } = await supabase
    .from('proposal_items')
    .select('quantity, unit_price')
    .eq('proposal_id', proposalId);

  const total = (items ?? []).reduce(
    (sum: number, item: { quantity: number; unit_price: number }) =>
      sum + item.quantity * item.unit_price,
    0
  );

  await supabase
    .from('proposals')
    .update({ total_amount: total })
    .eq('id', proposalId);
}
