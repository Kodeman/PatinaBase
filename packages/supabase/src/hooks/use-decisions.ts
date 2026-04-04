import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DecisionType = 'material' | 'product' | 'layout' | 'budget' | 'approval';
export type BlockingStatus = 'blocks_procurement' | 'blocks_phase' | 'non_blocking';
export type DecisionStatus = 'draft' | 'pending' | 'responded' | 'expired';

export interface ClientDecisionOption {
  id: string;
  decision_id: string;
  name: string;
  image_url: string | null;
  designer_note: string | null;
  is_recommended: boolean;
  selected: boolean;
  client_note: string | null;
  sort_order: number;
  price: number | null;
  quantity: number;
  created_at: string;
}

export interface ClientDecision {
  id: string;
  designer_client_id: string;
  designer_id: string;
  project_id: string | null;
  title: string;
  context: string | null;
  due_date: string | null;
  linked_phase: string | null;
  decision_type: DecisionType;
  blocking_status: BlockingStatus;
  linked_proposal_id: string | null;
  status: DecisionStatus;
  sent_at: string | null;
  responded_at: string | null;
  viewed_at: string | null;
  selected_by: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
  options?: ClientDecisionOption[];
}

export interface CreateDecisionInput {
  designerClientId: string;
  projectId?: string;
  title: string;
  context?: string;
  dueDate?: string;
  linkedPhase?: string;
  decisionType?: DecisionType;
  blockingStatus?: BlockingStatus;
  linkedProposalId?: string;
  status?: 'draft' | 'pending';
  options: {
    name: string;
    imageUrl?: string;
    designerNote?: string;
    isRecommended?: boolean;
    price?: number;
  }[];
}

export interface DecisionFilters {
  status?: DecisionStatus | DecisionStatus[];
  decisionType?: DecisionType;
  isOverdue?: boolean;
  projectId?: string;
}

export interface DecisionMetrics {
  open: number;
  overdue: number;
  avgResponseDays: number;
  onTimeRate: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all decisions for a client relationship
 */
export function useClientDecisions(designerClientId: string) {
  return useQuery({
    queryKey: ['client-decisions', designerClientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_decisions')
        .select(`
          *,
          options:client_decision_options(*)
        `)
        .eq('designer_client_id', designerClientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ClientDecision[];
    },
    enabled: !!designerClientId,
  });
}

/**
 * Fetch a single decision with its options
 */
export function useDecision(decisionId: string) {
  return useQuery({
    queryKey: ['client-decision', decisionId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_decisions')
        .select(`
          *,
          options:client_decision_options(*)
        `)
        .eq('id', decisionId)
        .single();

      if (error) throw error;
      return data as ClientDecision;
    },
    enabled: !!decisionId,
  });
}

/**
 * Fetch all decisions across all projects for the current designer (dashboard view).
 * Uses denormalized designer_id for efficient queries.
 */
export function useAllDecisions(filters?: DecisionFilters) {
  return useQuery({
    queryKey: ['all-decisions', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('client_decisions')
        .select(`
          *,
          options:client_decision_options(*),
          designer_client:designer_clients(
            id,
            client_name,
            client_email,
            client:profiles!client_id(full_name)
          ),
          project:projects(id, name)
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

      if (filters?.decisionType) {
        query = query.eq('decision_type', filters.decisionType);
      }

      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      if (filters?.isOverdue) {
        query = query
          .eq('status', 'pending')
          .lt('due_date', new Date().toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as (ClientDecision & {
        designer_client?: {
          id: string;
          client_name: string | null;
          client_email: string | null;
          client?: { full_name: string | null } | null;
        };
        project?: { id: string; name: string } | null;
      })[];
    },
  });
}

/**
 * Fetch decisions for a specific project (timeline integration)
 */
export function useDecisionsByProject(projectId: string) {
  return useQuery({
    queryKey: ['project-decisions', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_decisions')
        .select(`
          *,
          options:client_decision_options(*)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ClientDecision[];
    },
    enabled: !!projectId,
  });
}

/**
 * Compute decision metrics from all decisions (dashboard summary).
 * Derives open count, overdue count, average response time, and on-time rate.
 */
export function useDecisionMetrics() {
  return useQuery({
    queryKey: ['decision-metrics'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_decisions')
        .select('id, status, due_date, sent_at, responded_at')
        .neq('status', 'draft');

      if (error) throw error;

      const decisions = (data ?? []) as {
        id: string;
        status: string;
        due_date: string | null;
        sent_at: string | null;
        responded_at: string | null;
      }[];

      const now = new Date();
      const open = decisions.filter((d) => d.status === 'pending').length;
      const overdue = decisions.filter(
        (d) => d.status === 'pending' && d.due_date && new Date(d.due_date) < now
      ).length;

      // Average response time for responded decisions (in days)
      const responded = decisions.filter(
        (d) => d.status === 'responded' && d.sent_at && d.responded_at
      );
      const avgResponseDays =
        responded.length > 0
          ? responded.reduce((sum, d) => {
              const sent = new Date(d.sent_at!).getTime();
              const resp = new Date(d.responded_at!).getTime();
              return sum + (resp - sent) / (1000 * 60 * 60 * 24);
            }, 0) / responded.length
          : 0;

      // On-time rate: responded before or on due_date
      const withDue = responded.filter((d) => d.due_date);
      const onTime = withDue.filter(
        (d) => new Date(d.responded_at!) <= new Date(d.due_date!)
      ).length;
      const onTimeRate = withDue.length > 0 ? (onTime / withDue.length) * 100 : 100;

      return {
        open,
        overdue,
        avgResponseDays: Math.round(avgResponseDays * 10) / 10,
        onTimeRate: Math.round(onTimeRate),
        total: decisions.length,
      } as DecisionMetrics;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Mutations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a decision request with options
 */
export function useCreateDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDecisionInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Insert the decision
      const { data: decision, error: decisionError } = await supabase
        .from('client_decisions')
        .insert({
          designer_client_id: input.designerClientId,
          project_id: input.projectId || null,
          title: input.title,
          context: input.context || null,
          due_date: input.dueDate || null,
          linked_phase: input.linkedPhase || null,
          decision_type: input.decisionType || 'product',
          blocking_status: input.blockingStatus || 'non_blocking',
          linked_proposal_id: input.linkedProposalId || null,
          status: input.status || 'pending',
          sent_at: input.status === 'draft' ? null : new Date().toISOString(),
        })
        .select()
        .single();

      if (decisionError) throw decisionError;

      // Insert options
      if (input.options.length > 0) {
        const { error: optionsError } = await supabase
          .from('client_decision_options')
          .insert(
            input.options.map((opt, i) => ({
              decision_id: decision.id,
              name: opt.name,
              image_url: opt.imageUrl || null,
              designer_note: opt.designerNote || null,
              is_recommended: opt.isRecommended || false,
              price: opt.price ?? null,
              sort_order: i,
            }))
          );

        if (optionsError) throw optionsError;
      }

      return decision as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', data.project_id] });
      }
    },
  });
}

/**
 * Update a decision's status (e.g., mark as expired)
 */
export function useUpdateDecisionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      decisionId,
      status,
    }: {
      decisionId: string;
      status: ClientDecision['status'];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_decisions')
        .update({ status })
        .eq('id', decisionId)
        .select()
        .single();

      if (error) throw error;
      return data as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
    },
  });
}

/**
 * Select a decision option (client responds)
 */
export function useSelectDecisionOption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      optionId,
      decisionId,
      clientNote,
      quantity,
    }: {
      optionId: string;
      decisionId: string;
      clientNote?: string;
      quantity?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get current user for audit trail
      const { data: { user } } = await supabase.auth.getUser();

      // Deselect all options for this decision
      await supabase
        .from('client_decision_options')
        .update({ selected: false })
        .eq('decision_id', decisionId);

      // Select the chosen option
      const { error: selectError } = await supabase
        .from('client_decision_options')
        .update({
          selected: true,
          client_note: clientNote || null,
          quantity: quantity ?? 1,
        })
        .eq('id', optionId);

      if (selectError) throw selectError;

      // Mark decision as responded with audit trail
      const { data, error } = await supabase
        .from('client_decisions')
        .update({
          status: 'responded',
          responded_at: new Date().toISOString(),
          selected_by: user?.id || null,
        })
        .eq('id', decisionId)
        .select()
        .single();

      if (error) throw error;
      return data as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', data.project_id] });
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Analytics
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionTypeAnalytics {
  decision_type: DecisionType;
  total_count: number;
  responded_count: number;
  avg_response_hours: number;
  on_time_count: number;
}

export interface DecisionClientAnalytics {
  designer_client_id: string;
  client_name: string;
  total_count: number;
  responded_count: number;
  avg_response_hours: number;
  on_time_rate: number;
}

export interface DecisionPhaseAnalytics {
  linked_phase: string;
  total_count: number;
  overdue_count: number;
  avg_response_hours: number;
}

export function useDecisionAnalyticsByType() {
  return useQuery({
    queryKey: ['decision-analytics-by-type'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('get_decision_analytics_by_type', {
        p_designer_id: user.id,
      });
      if (error) throw error;
      return (data ?? []) as DecisionTypeAnalytics[];
    },
  });
}

export function useDecisionAnalyticsByClient() {
  return useQuery({
    queryKey: ['decision-analytics-by-client'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('get_decision_analytics_by_client', {
        p_designer_id: user.id,
      });
      if (error) throw error;
      return (data ?? []) as DecisionClientAnalytics[];
    },
  });
}

export function useDecisionBottleneckPhases() {
  return useQuery({
    queryKey: ['decision-bottleneck-phases'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('get_decision_bottleneck_phases', {
        p_designer_id: user.id,
      });
      if (error) throw error;
      return (data ?? []) as DecisionPhaseAnalytics[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Reminder & Viewed
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a reminder for a pending decision (updates reminder_sent_at)
 */
export function useSendDecisionReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ decisionId }: { decisionId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_decisions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', decisionId)
        .select()
        .single();

      if (error) throw error;
      return data as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
    },
  });
}

/**
 * Mark a decision as viewed by the client (sets viewed_at if not already set)
 */
export function useMarkDecisionViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ decisionId }: { decisionId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Only set viewed_at if not already set
      const { data, error } = await supabase
        .from('client_decisions')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', decisionId)
        .is('viewed_at', null)
        .select()
        .single();

      // If no rows matched (already viewed), that's fine
      if (error && error.code !== 'PGRST116') throw error;
      return data as ClientDecision | null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      }
    },
  });
}
