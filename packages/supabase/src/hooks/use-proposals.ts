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
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  quantity: number;
  unit_price: number;
  unit_sell_price: number;
  line_total: number;
  vendor_name: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  // Joined data
  product?: {
    id: string;
    name: string;
    images: string[] | null;
    brand: string | null;
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
          project:projects!proposals_project_id_fkey(id, name),
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
          project:projects!proposals_project_id_fkey(id, name),
          client:profiles!client_id(id, email, full_name),
          items:proposal_items(
            *,
            product:products(id, name, images, brand)
          )
        `)
        .eq('id', proposalId)
        .single();

      if (error) throw error;

      // Sort items by position
      if (data.items) {
        data.items.sort((a: ProposalItem, b: ProposalItem) => a.position - b.position);
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
      templateId,
    }: {
      title: string;
      description?: string;
      projectId?: string;
      clientId?: string;
      validUntil?: string;
      templateId?: string;
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
          template_id: templateId || null,
          status: 'draft',
          total_amount: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // If a template was selected, create sections from template config
      if (templateId) {
        const { data: template } = await supabase
          .from('proposal_templates')
          .select('sections_config')
          .eq('id', templateId)
          .single();

        if (template?.sections_config && Array.isArray(template.sections_config)) {
          const sections = template.sections_config.map(
            (cfg: { type: string; title: string; default_body?: string }, index: number) => ({
              proposal_id: data.id,
              type: cfg.type,
              title: cfg.title,
              body: cfg.default_body || null,
              sort_order: index,
              metadata: {},
            })
          );

          if (sections.length > 0) {
            await supabase.from('proposal_sections').insert(sections);
          }
        }
      }

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
      name,
      description,
      quantity,
      unitPrice,
      notes,
      category,
      vendorName,
    }: {
      proposalId: string;
      productId?: string;
      name: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      notes?: string;
      category?: string;
      vendorName?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get current max position
      const { data: existingItems } = await supabase
        .from('proposal_items')
        .select('position')
        .eq('proposal_id', proposalId)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = (existingItems?.[0]?.position ?? -1) + 1;
      const sellPrice = unitPrice;
      const lineTotal = quantity * sellPrice;

      const { data, error } = await supabase
        .from('proposal_items')
        .insert({
          proposal_id: proposalId,
          product_id: productId || null,
          name,
          description: description || null,
          quantity,
          unit_price: unitPrice,
          unit_sell_price: sellPrice,
          line_total: lineTotal,
          notes: notes || null,
          category: category || null,
          vendor_name: vendorName || null,
          position: nextPosition,
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
      updates: Partial<Pick<ProposalItem, 'quantity' | 'unit_price' | 'notes' | 'name' | 'description'>>;
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
    mutationFn: async ({
      proposalId,
      personalMessage,
      ccEmail,
      validUntil,
    }: {
      proposalId: string;
      personalMessage?: string;
      ccEmail?: string;
      validUntil?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = {
        status: 'sent',
        sent_at: new Date().toISOString(),
      };
      if (personalMessage !== undefined) updates.personal_message = personalMessage;
      if (ccEmail !== undefined) updates.cc_email = ccEmail;
      if (validUntil !== undefined) updates.valid_until = validUntil;

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
// PROPOSAL SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ProposalSection {
  id: string;
  proposal_id: string;
  type: 'vision' | 'concept' | 'space_plan' | 'selections' | 'investment' | 'timeline' | 'terms';
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch ordered sections for a proposal
 */
export function useProposalSections(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-sections', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposal_sections')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ProposalSection[];
    },
    enabled: !!proposalId,
  });
}

/**
 * Create or update a proposal section (auto-save)
 */
export function useUpsertProposalSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      proposalId,
      type,
      title,
      body,
      metadata,
      sortOrder,
    }: {
      id?: string;
      proposalId: string;
      type: ProposalSection['type'];
      title: string;
      body?: string;
      metadata?: Record<string, unknown>;
      sortOrder?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const payload: Record<string, unknown> = {
        proposal_id: proposalId,
        type,
        title,
        body: body ?? null,
        metadata: metadata ?? {},
        updated_at: new Date().toISOString(),
      };
      if (sortOrder !== undefined) payload.sort_order = sortOrder;

      if (id) {
        const { data, error } = await supabase
          .from('proposal_sections')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data as ProposalSection;
      } else {
        // Get next sort_order
        if (sortOrder === undefined) {
          const { data: existing } = await supabase
            .from('proposal_sections')
            .select('sort_order')
            .eq('proposal_id', proposalId)
            .order('sort_order', { ascending: false })
            .limit(1);
          payload.sort_order = (existing?.[0]?.sort_order ?? -1) + 1;
        }
        payload.created_at = new Date().toISOString();

        const { data, error } = await supabase
          .from('proposal_sections')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as ProposalSection;
      }
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-sections', proposalId] });
    },
  });
}

/**
 * Delete a proposal section
 */
export function useDeleteProposalSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sectionId, proposalId }: { sectionId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('proposal_sections')
        .delete()
        .eq('id', sectionId);

      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-sections', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProposalTemplate {
  id: string;
  name: string;
  description: string | null;
  sections_config: Array<{
    type: ProposalSection['type'];
    title: string;
    default_body?: string;
  }>;
  estimated_pages: number;
  is_system: boolean;
  created_at: string;
}

/**
 * Fetch all available proposal templates
 */
export function useProposalTemplates() {
  return useQuery({
    queryKey: ['proposal-templates'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposal_templates')
        .select('*')
        .order('estimated_pages', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ProposalTemplate[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface ProposalEngagementEvent {
  id: string;
  proposal_id: string;
  viewer_id: string | null;
  event_type: 'opened' | 'section_viewed' | 'signed' | 'downloaded';
  section_type: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  viewer?: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

export interface ProposalEngagementStats {
  timesOpened: number;
  totalReadingSeconds: number;
  lastOpenedAt: string | null;
  sectionBreakdown: Array<{
    sectionType: string;
    totalSeconds: number;
    viewCount: number;
  }>;
  mostViewedSection: string | null;
}

/**
 * Fetch engagement events for a proposal
 */
export function useProposalEngagement(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-engagement', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposal_engagement')
        .select(`
          *,
          viewer:profiles!viewer_id(id, full_name, email)
        `)
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ProposalEngagementEvent[];
    },
    enabled: !!proposalId,
  });
}

/**
 * Get aggregated engagement stats for a proposal
 */
export function useProposalEngagementStats(proposalId: string) {
  const { data: events } = useProposalEngagement(proposalId);

  return useQuery({
    queryKey: ['proposal-engagement-stats', proposalId],
    queryFn: async () => {
      if (!events) return null;

      const opens = events.filter(e => e.event_type === 'opened');
      const sectionViews = events.filter(e => e.event_type === 'section_viewed');

      // Aggregate section times
      const sectionMap = new Map<string, { totalSeconds: number; viewCount: number }>();
      for (const view of sectionViews) {
        if (!view.section_type) continue;
        const existing = sectionMap.get(view.section_type) || { totalSeconds: 0, viewCount: 0 };
        existing.totalSeconds += view.duration_seconds || 0;
        existing.viewCount += 1;
        sectionMap.set(view.section_type, existing);
      }

      const sectionBreakdown = Array.from(sectionMap.entries())
        .map(([sectionType, stats]) => ({ sectionType, ...stats }))
        .sort((a, b) => b.totalSeconds - a.totalSeconds);

      const totalReadingSeconds = sectionBreakdown.reduce((sum, s) => sum + s.totalSeconds, 0);

      const stats: ProposalEngagementStats = {
        timesOpened: opens.length,
        totalReadingSeconds,
        lastOpenedAt: opens[0]?.created_at ?? null,
        sectionBreakdown,
        mostViewedSection: sectionBreakdown[0]?.sectionType ?? null,
      };

      return stats;
    },
    enabled: !!events,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL VERSIONS & REVISIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch version chain for a proposal via parent_proposal_id
 */
export function useProposalVersions(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-versions', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get the current proposal to find the root
      const { data: current, error: currentError } = await supabase
        .from('proposals')
        .select('id, version, parent_proposal_id, status, created_at')
        .eq('id', proposalId)
        .single();

      if (currentError) throw currentError;

      // Find all versions in the chain
      const rootId = current.parent_proposal_id || current.id;
      const { data: versions, error } = await supabase
        .from('proposals')
        .select('id, version, status, created_at, sent_at')
        .or(`id.eq.${rootId},parent_proposal_id.eq.${rootId}`)
        .order('version', { ascending: false });

      if (error) throw error;
      return (versions ?? []) as Array<{
        id: string;
        version: number;
        status: string;
        created_at: string;
        sent_at: string | null;
      }>;
    },
    enabled: !!proposalId,
  });
}

/**
 * Create a new revision of a proposal (version increment)
 */
export function useCreateProposalRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceProposalId,
      revisionSummary,
    }: {
      sourceProposalId: string;
      revisionSummary?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Fetch source proposal
      const { data: source, error: sourceError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', sourceProposalId)
        .single();

      if (sourceError) throw sourceError;

      // Create new version
      const rootId = source.parent_proposal_id || source.id;
      const { data: newProposal, error } = await supabase
        .from('proposals')
        .insert({
          ...source,
          id: undefined, // Let DB generate
          parent_proposal_id: rootId,
          version: (source.version || 1) + 1,
          status: 'draft',
          revision_summary: revisionSummary || null,
          client_feedback: source.client_feedback,
          sent_at: null,
          viewed_at: null,
          accepted_at: null,
          declined_at: null,
          signed_at: null,
          created_at: undefined,
          updated_at: undefined,
        })
        .select()
        .single();

      if (error) throw error;

      // Clone sections from source
      const { data: sections } = await supabase
        .from('proposal_sections')
        .select('*')
        .eq('proposal_id', sourceProposalId)
        .order('sort_order');

      if (sections && sections.length > 0) {
        const clonedSections = sections.map((s: ProposalSection) => ({
          ...s,
          id: undefined,
          proposal_id: newProposal.id,
          created_at: undefined,
          updated_at: undefined,
        }));
        await supabase.from('proposal_sections').insert(clonedSections);
      }

      // Clone items from source
      const { data: items } = await supabase
        .from('proposal_items')
        .select('*')
        .eq('proposal_id', sourceProposalId);

      if (items && items.length > 0) {
        const clonedItems = items.map((item: ProposalItem) => ({
          ...item,
          id: undefined,
          proposal_id: newProposal.id,
          created_at: undefined,
          updated_at: undefined,
        }));
        await supabase.from('proposal_items').insert(clonedItems);
      }

      return newProposal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL SIGNING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign a proposal (client action)
 */
export function useSignProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      signedByName,
      signedIp,
    }: {
      proposalId: string;
      signedByName: string;
      signedIp?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('proposals')
        .update({
          status: 'accepted',
          signed_at: new Date().toISOString(),
          signed_by_name: signedByName,
          signed_ip: signedIp || null,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', proposalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
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
    .select('line_total')
    .eq('proposal_id', proposalId);

  const total = (items ?? []).reduce(
    (sum: number, item: { line_total: number }) =>
      sum + (item.line_total || 0),
    0
  );

  await supabase
    .from('proposals')
    .update({ total_amount: total })
    .eq('id', proposalId);
}
