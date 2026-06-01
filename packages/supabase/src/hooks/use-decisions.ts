import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ─────────────────────────────────────────────────────────────────────────────
// Status-transition validation (mirrors the DB guard in migration 00171).
// Validated client-side so the UI can reject illegal moves before the round
// trip; the DB trigger is the source of truth and rejects anything that slips
// through. Keep these two in sync.
// ─────────────────────────────────────────────────────────────────────────────
const VALID_STATUS_TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  draft: ['pending'],
  pending: ['responded', 'expired'],
  responded: ['pending'],
  expired: ['pending'],
};

/** Returns true when `from → to` is a legal decision status transition. */
export function isValidDecisionTransition(
  from: DecisionStatus,
  to: DecisionStatus,
): boolean {
  if (from === to) return true;
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DecisionType =
  | 'material'
  | 'color'
  | 'product'
  | 'layout'
  | 'substitution'
  | 'budget'
  | 'approval';
export type BlockingStatus = 'blocks_procurement' | 'blocks_phase' | 'non_blocking';
export type DecisionStatus = 'draft' | 'pending' | 'responded' | 'expired';
export type ConsentMethod = 'verbal' | 'written' | 'text_excerpt' | 'email_excerpt';

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
  cost_delta_cents: number | null;
  lead_time_days_delta: number | null;
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
  phase_id: string | null;
  decision_type: DecisionType;
  blocking_status: BlockingStatus;
  linked_proposal_id: string | null;
  recommended_option_id: string | null;
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
  blockedFfeItemIds?: string[];
  options: {
    name: string;
    imageUrl?: string;
    designerNote?: string;
    isRecommended?: boolean;
    price?: number;
    quantity?: number;
    costDeltaCents?: number;
    leadTimeDaysDelta?: number;
  }[];
}

export interface UpdateDecisionInput {
  decisionId: string;
  /** The designer_client_id, used to scope cache invalidation. */
  designerClientId: string;
  projectId?: string | null;
  title?: string;
  context?: string | null;
  dueDate?: string | null;
  linkedPhase?: string | null;
  decisionType?: DecisionType;
  blockingStatus?: BlockingStatus;
  /**
   * When provided, the decision's options are fully replaced with this set
   * (delete-then-insert). Omit to leave options untouched.
   */
  options?: {
    name: string;
    imageUrl?: string;
    designerNote?: string;
    isRecommended?: boolean;
    price?: number;
    quantity?: number;
    costDeltaCents?: number;
    leadTimeDaysDelta?: number;
    productId?: string;
  }[];
}

export interface DecisionFilters {
  status?: DecisionStatus | DecisionStatus[];
  decisionType?: DecisionType;
  isOverdue?: boolean;
  projectId?: string;
  q?: string;
}

export interface DecisionMetrics {
  open: number;
  overdue: number;
  avgResponseDays: number;
  onTimeRate: number;
  total: number;
}

export interface DecisionComment {
  id: string;
  decision_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface DecisionOverride {
  id: string;
  decision_id: string;
  option_id: string | null;
  acted_by: string;
  consent_method: ConsentMethod;
  consent_evidence: string;
  created_at: string;
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
          options:client_decision_options!decision_id(*)
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
          options:client_decision_options!decision_id(*)
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
          options:client_decision_options!decision_id(*),
          designer_client:designer_clients(
            id,
            client_name,
            client_email,
            client:profiles!client_id(full_name)
          ),
          project:projects(id, name)
        `)
        .order('created_at', { ascending: false });

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

      if (filters?.q && filters.q.trim().length > 0) {
        const safe = filters.q.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.ilike('title', `%${safe}%`);
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
          options:client_decision_options!decision_id(*)
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

      // Hydrate the auth session before the SELECT — without this, the browser
      // client doesn't attach the JWT and RLS sees auth.uid() as null, which
      // makes the policy's EXISTS subquery evaluate false for every row.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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
              quantity: opt.quantity ?? 1,
              cost_delta_cents: opt.costDeltaCents ?? null,
              lead_time_days_delta: opt.leadTimeDaysDelta ?? null,
              sort_order: i,
            }))
          );

        if (optionsError) throw optionsError;
      }

      // Tag downstream FF&E items as blocked by this decision (PRD line 118).
      if (input.blockedFfeItemIds && input.blockedFfeItemIds.length > 0) {
        const { error: ffeError } = await supabase
          .from('project_ffe_items')
          .update({ blocked_by_decision_id: decision.id })
          .in('id', input.blockedFfeItemIds);
        if (ffeError) {
          // Non-fatal — surface in console but don't undo decision creation.
          console.warn('useCreateDecision: failed to tag blocked FF&E items', ffeError);
        }
      }

      // If the decision is sent immediately (not a draft), fire the
      // decision_required notification to the client. Non-fatal: a notify
      // failure must not undo a successfully created decision.
      if ((input.status ?? 'pending') === 'pending') {
        const { error: notifyError } = await supabase.rpc('notify_decision_required', {
          p_decision_id: decision.id,
        });
        if (notifyError) {
          console.warn('useCreateDecision: notify_decision_required failed', notifyError);
        }
      }

      return decision as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', data.project_id] });
        queryClient.invalidateQueries({ queryKey: ['project-ffe-items', data.project_id] });
      }
    },
  });
}

/**
 * Update a decision's status (e.g., reopen a responded decision back to pending)
 */
export function useUpdateDecisionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      decisionId,
      status,
      currentStatus,
    }: {
      decisionId: string;
      status: ClientDecision['status'];
      /**
       * The decision's current status, used to validate the transition
       * client-side before the round trip. When provided and the move is
       * illegal, the mutation throws without touching the DB. The 00171 DB
       * trigger is the source of truth and rejects anything that slips through.
       */
      currentStatus?: ClientDecision['status'];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      if (currentStatus && !isValidDecisionTransition(currentStatus, status)) {
        throw new Error(
          `Invalid decision status transition: ${currentStatus} -> ${status}`,
        );
      }

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
 * Update a decision's editable fields (title / context / due_date /
 * decision_type / blocking_status / linked_phase / project_id). When
 * `options` is supplied, the decision's options are fully replaced
 * (delete-then-insert). Status is intentionally NOT editable here — use
 * useUpdateDecisionStatus / usePublishDraftDecision for status moves.
 */
export function useUpdateDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateDecisionInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Build the patch only from fields the caller actually provided so we
      // never accidentally null out an untouched column.
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.context !== undefined) patch.context = input.context;
      if (input.dueDate !== undefined) patch.due_date = input.dueDate;
      if (input.linkedPhase !== undefined) patch.linked_phase = input.linkedPhase;
      if (input.decisionType !== undefined) patch.decision_type = input.decisionType;
      if (input.blockingStatus !== undefined) patch.blocking_status = input.blockingStatus;
      if (input.projectId !== undefined) patch.project_id = input.projectId;

      if (Object.keys(patch).length > 0) {
        const { error: updateError } = await supabase
          .from('client_decisions')
          .update(patch)
          .eq('id', input.decisionId);
        if (updateError) throw updateError;
      }

      // Replace options when supplied.
      if (input.options !== undefined) {
        const { error: deleteError } = await supabase
          .from('client_decision_options')
          .delete()
          .eq('decision_id', input.decisionId);
        if (deleteError) throw deleteError;

        if (input.options.length > 0) {
          const { error: optionsError } = await supabase
            .from('client_decision_options')
            .insert(
              input.options.map((opt, i) => ({
                decision_id: input.decisionId,
                name: opt.name,
                image_url: opt.imageUrl || null,
                designer_note: opt.designerNote || null,
                is_recommended: opt.isRecommended || false,
                price: opt.price ?? null,
                quantity: opt.quantity ?? 1,
                cost_delta_cents: opt.costDeltaCents ?? null,
                lead_time_days_delta: opt.leadTimeDaysDelta ?? null,
                product_id: opt.productId || null,
                sort_order: i,
              })),
            );
          if (optionsError) throw optionsError;
        }
      }

      const { data, error } = await supabase
        .from('client_decisions')
        .select(`
          *,
          options:client_decision_options!decision_id(*)
        `)
        .eq('id', input.decisionId)
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

/**
 * Delete a decision (and, via ON DELETE CASCADE, its options, comments,
 * overrides, events, and notifications).
 */
export function useDeleteDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      decisionId,
      designerClientId,
      projectId,
    }: {
      decisionId: string;
      designerClientId: string;
      projectId?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('client_decisions')
        .delete()
        .eq('id', decisionId);
      if (error) throw error;
      return { decisionId, designerClientId, projectId };
    },
    onSuccess: ({ designerClientId, decisionId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', designerClientId] });
      queryClient.invalidateQueries({ queryKey: ['client-decision', decisionId] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', projectId] });
      }
    },
  });
}

/**
 * Publish a draft decision: flip status draft → pending, stamp sent_at, and
 * fire the decision_required notification to the client. The 00171 DB guard
 * enforces that only draft rows can be published this way.
 */
export function usePublishDraftDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ decisionId }: { decisionId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_decisions')
        .update({ status: 'pending', sent_at: new Date().toISOString() })
        .eq('id', decisionId)
        .eq('status', 'draft')
        .select()
        .single();
      if (error) throw error;

      const { error: notifyError } = await supabase.rpc('notify_decision_required', {
        p_decision_id: decisionId,
      });
      if (notifyError) {
        console.warn('usePublishDraftDecision: notify_decision_required failed', notifyError);
      }

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

/**
 * Subscribe to live changes on a single decision: the decision row itself,
 * its options, and its comment thread. Invalidates the relevant React Query
 * caches on any change so the detail page reflects client responses live.
 *
 * Mirrors the realtime pattern in use-comms.ts (useThreadRealtime).
 */
export function useDecisionRealtime(decisionId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!decisionId) return;
    const supabase = getSupabase();

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['client-decision', decisionId] });
      queryClient.invalidateQueries({ queryKey: ['decision-comments', decisionId] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
    };

    const channel: RealtimeChannel = supabase
      .channel(`decision:${decisionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_decisions',
          filter: `id=eq.${decisionId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_decision_options',
          filter: `decision_id=eq.${decisionId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'decision_comments',
          filter: `decision_id=eq.${decisionId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [decisionId, queryClient]);
}

/**
 * Select a decision option (client responds).
 *
 * Calls the `apply_decision` RPC which atomically:
 *  - deselects all sibling options, selects the chosen one,
 *  - flips the decision to status='responded' with responded_at + selected_by,
 *  - clears blocked_by_decision_id on any FF&E items linked to this decision.
 */
export function useSelectDecisionOption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      optionId,
      decisionId,
      clientNote,
      quantity,
      consent,
    }: {
      optionId: string;
      decisionId: string;
      clientNote?: string;
      quantity?: number;
      consent?: {
        method: 'electronic_signature' | 'click_through';
        signature: string;
      };
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();

      // Persist the client's note + quantity on the chosen option before we
      // call the RPC (the RPC itself doesn't accept these fields).
      if (clientNote !== undefined || quantity !== undefined) {
        const patch: Record<string, unknown> = {};
        if (clientNote !== undefined) patch.client_note = clientNote || null;
        if (quantity !== undefined) patch.quantity = quantity ?? 1;
        const { error: optErr } = await supabase
          .from('client_decision_options')
          .update(patch)
          .eq('id', optionId);
        if (optErr) throw optErr;
      }

      // Persist client consent on the decision row before applying.
      if (consent) {
        const { error: consentErr } = await supabase
          .from('client_decisions')
          .update({
            client_consent_method: consent.method,
            client_signature: consent.signature,
            client_consented_at: new Date().toISOString(),
          })
          .eq('id', decisionId);
        if (consentErr) throw consentErr;
      }

      const { error: rpcError } = await supabase.rpc('apply_decision', {
        p_decision_id: decisionId,
        p_selected_option_id: optionId,
        p_selected_by: user?.id ?? null,
      });
      if (rpcError) throw rpcError;

      // Decision is now resolved — notify the owning designer. Non-fatal.
      const { error: notifyError } = await supabase.rpc('notify_decision_resolved', {
        p_decision_id: decisionId,
      });
      if (notifyError) {
        console.warn('useSelectDecisionOption: notify_decision_resolved failed', notifyError);
      }

      const { data, error } = await supabase
        .from('client_decisions')
        .select('*')
        .eq('id', decisionId)
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
        queryClient.invalidateQueries({ queryKey: ['project-ffe-items', data.project_id] });
        queryClient.invalidateQueries({ queryKey: ['project-ffe', data.project_id] });
      }
    },
  });
}

/**
 * Designer-override flow: designer marks a decision on the client's behalf,
 * recording explicit consent evidence for the audit trail (PRD line 123).
 *
 * Inserts a row into decision_overrides AND applies the decision via the RPC,
 * so FF&E items unblock identically to a normal client response.
 */
export function useApplyDecisionOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      decisionId,
      optionId,
      consentMethod,
      consentEvidence,
    }: {
      decisionId: string;
      optionId: string;
      consentMethod: ConsentMethod;
      consentEvidence: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Look up the client_id so the override is attributed correctly inside apply_decision.
      const { data: dec, error: decErr } = await supabase
        .from('client_decisions')
        .select('designer_client_id, designer_clients!inner(client_id)')
        .eq('id', decisionId)
        .single();
      if (decErr) throw decErr;
      const clientUserId =
        (dec as { designer_clients?: { client_id?: string | null } | null })
          ?.designer_clients?.client_id ?? null;

      const { error: overrideErr } = await supabase
        .from('decision_overrides')
        .insert({
          decision_id: decisionId,
          option_id: optionId,
          acted_by: user.id,
          consent_method: consentMethod,
          consent_evidence: consentEvidence,
        });
      if (overrideErr) throw overrideErr;

      const { error: rpcError } = await supabase.rpc('apply_decision', {
        p_decision_id: decisionId,
        p_selected_option_id: optionId,
        p_selected_by: clientUserId ?? user.id,
      });
      if (rpcError) throw rpcError;

      // Decision is now resolved — notify the owning designer. Non-fatal.
      const { error: notifyError } = await supabase.rpc('notify_decision_resolved', {
        p_decision_id: decisionId,
      });
      if (notifyError) {
        console.warn('useApplyDecisionOverride: notify_decision_resolved failed', notifyError);
      }

      const { data, error } = await supabase
        .from('client_decisions')
        .select('*')
        .eq('id', decisionId)
        .single();
      if (error) throw error;
      return data as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      queryClient.invalidateQueries({ queryKey: ['decision-overrides', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', data.project_id] });
        queryClient.invalidateQueries({ queryKey: ['project-ffe-items', data.project_id] });
      }
    },
  });
}

/**
 * Read the override audit trail for a decision.
 */
export function useDecisionOverrides(decisionId: string) {
  return useQuery({
    queryKey: ['decision-overrides', decisionId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('decision_overrides')
        .select('*')
        .eq('decision_id', decisionId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DecisionOverride[];
    },
    enabled: !!decisionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Comments
// ═══════════════════════════════════════════════════════════════════════════

export function useDecisionComments(decisionId: string) {
  return useQuery({
    queryKey: ['decision-comments', decisionId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('decision_comments')
        .select('*')
        .eq('decision_id', decisionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DecisionComment[];
    },
    enabled: !!decisionId,
  });
}

export function useCreateDecisionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      decisionId,
      body,
    }: {
      decisionId: string;
      body: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('decision_comments')
        .insert({
          decision_id: decisionId,
          author_id: user.id,
          body: body.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as DecisionComment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decision-comments', data.decision_id] });
    },
  });
}

export function useUpdateDecisionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      commentId,
      body,
    }: {
      commentId: string;
      body: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('decision_comments')
        .update({ body: body.trim() })
        .eq('id', commentId)
        .select()
        .single();
      if (error) throw error;
      return data as DecisionComment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decision-comments', data.decision_id] });
    },
  });
}

export function useDeleteDecisionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      commentId,
      decisionId,
    }: {
      commentId: string;
      decisionId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('decision_comments')
        .delete()
        .eq('id', commentId);
      if (error) throw error;
      return { commentId, decisionId };
    },
    onSuccess: ({ decisionId }) => {
      queryClient.invalidateQueries({ queryKey: ['decision-comments', decisionId] });
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

      const { data, error } = await supabase
        .from('client_decisions')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', decisionId)
        .is('viewed_at', null)
        .select()
        .single();

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
