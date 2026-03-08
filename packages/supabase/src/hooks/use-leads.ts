import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Lead {
  id: string;
  homeowner_id: string | null;
  designer_id: string | null;
  project_type: string;
  project_description: string | null;
  budget_range: string | null;
  timeline: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  match_score: number | null;
  match_reasons: string[];
  status: 'new' | 'viewed' | 'contacted' | 'accepted' | 'declined' | 'expired';
  response_deadline: string | null;
  contacted_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  homeowner?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface LeadFilters {
  status?: string | string[];
  matchScoreMin?: number;
  projectType?: string;
  budgetRange?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch leads for the current designer with optional filters
 */
export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('leads')
        .select(`
          *,
          homeowner:profiles!homeowner_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.matchScoreMin !== undefined) {
        query = query.gte('match_score', filters.matchScoreMin);
      }

      if (filters?.projectType) {
        query = query.eq('project_type', filters.projectType);
      }

      if (filters?.budgetRange) {
        query = query.eq('budget_range', filters.budgetRange);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

/**
 * Fetch a single lead by ID
 */
export function useLead(leadId: string) {
  return useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          homeowner:profiles!homeowner_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('id', leadId)
        .single();

      if (error) throw error;
      return data as Lead;
    },
    enabled: !!leadId,
  });
}

/**
 * Get lead statistics for the current designer
 */
export function useLeadStats() {
  return useQuery({
    queryKey: ['lead-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('leads')
        .select('status, match_score');

      if (error) throw error;

      const leads = data ?? [];
      const stats = {
        total: leads.length,
        new: leads.filter((l: Lead) => l.status === 'new').length,
        viewed: leads.filter((l: Lead) => l.status === 'viewed').length,
        contacted: leads.filter((l: Lead) => l.status === 'contacted').length,
        accepted: leads.filter((l: Lead) => l.status === 'accepted').length,
        declined: leads.filter((l: Lead) => l.status === 'declined').length,
        highMatch: leads.filter((l: Lead) => (l.match_score ?? 0) >= 0.8).length,
        avgMatchScore: leads.length > 0
          ? leads.reduce((sum: number, l: Lead) => sum + (l.match_score ?? 0), 0) / leads.length
          : 0,
      };

      return stats;
    },
  });
}

/**
 * Update lead status (view, contact, accept, decline)
 */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      status,
      declineReason,
    }: {
      leadId: string;
      status: Lead['status'];
      declineReason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = { status };

      // Set timestamp based on status
      switch (status) {
        case 'viewed':
          // Don't overwrite if already viewed
          break;
        case 'contacted':
          updates.contacted_at = new Date().toISOString();
          break;
        case 'accepted':
          updates.accepted_at = new Date().toISOString();
          break;
        case 'declined':
          updates.declined_at = new Date().toISOString();
          if (declineReason) {
            updates.decline_reason = declineReason;
          }
          break;
      }

      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}

/**
 * Mark lead as viewed (called when opening lead detail)
 */
export function useMarkLeadViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Only update if status is 'new'
      const { data, error } = await supabase
        .from('leads')
        .update({ status: 'viewed' })
        .eq('id', leadId)
        .eq('status', 'new')
        .select()
        .single();

      if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows" error
      return data;
    },
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}

/**
 * Accept a lead (converts to client relationship)
 */
export function useAcceptLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get the lead first
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;

      // Update lead status
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (updateError) throw updateError;

      // Create designer_client relationship
      if (lead.homeowner_id) {
        const { error: clientError } = await supabase
          .from('designer_clients')
          .upsert({
            designer_id: lead.designer_id,
            client_id: lead.homeowner_id,
            source: 'lead',
            lead_id: leadId,
            status: 'active',
          }, {
            onConflict: 'designer_id,client_id',
          });

        if (clientError) throw clientError;
      }

      return lead;
    },
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
    },
  });
}

/**
 * Decline a lead
 */
export function useDeclineLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      reason: _reason,
    }: {
      leadId: string;
      reason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('leads')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}
