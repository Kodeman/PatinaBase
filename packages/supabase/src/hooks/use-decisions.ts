'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { ProductConfigurationSelection } from '@patina/types';
// Track 5 coordination axis — type-only import (erased at compile time, so no
// runtime cycle even though use-coordination imports ClientDecisionOption back).
import type { CoordinationKind, Court } from './use-coordination';
import { invalidateProjectWorkflow } from './use-project-workflow';

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
  /** Optional link to the catalog/library product this option represents (00172). */
  product_id: string | null;
  designer_note: string | null;
  is_recommended: boolean;
  selected: boolean;
  client_note: string | null;
  sort_order: number;
  price: number | null;
  quantity: number;
  cost_delta_cents: number | null;
  lead_time_days_delta: number | null;
  /** Client-side approval semantics: does picking this option approve the ask? */
  approves: boolean;
  /**
   * Provenance for an option built from a saved product configuration (00413).
   * Never required — a manual or plain-product option leaves it null.
   */
  configuration_id: string | null;
  /**
   * The chosen option values in the ONE snapshot vocabulary
   * (`ProductConfigurationSelection[]`), carried so `apply_decision` can write
   * the winner's finish/material through to the spec (00413).
   */
  selection_snapshot: ProductConfigurationSelection[] | null;
  created_at: string;
}

export interface ClientDecision {
  id: string;
  designer_client_id: string;
  designer_id: string;
  studio_id: string | null;
  project_id: string | null;
  title: string;
  context: string | null;
  due_date: string | null;
  linked_phase: string | null;
  phase_id: string | null;
  /** Exact Stage-2 artifact-approval classifier. Never infer this from type/kind. */
  approval_contract?: string | null;
  /** Immutable Stage-2 revision lineage. */
  predecessor_decision_id?: string | null;
  section_key?: string | null;
  decision_kind?: string;
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
  // ─── Track 5 — Project Coordination axis (00213) ────────────────────────────
  // Additive: a coordination item IS a widened client_decisions row. These flow
  // through every `select('*')` read for free; the legacy decision paths default
  // to coordination_kind='selection' / court='client', so existing pure-selection
  // and approval decisions are unaffected. Optional so old read models that don't
  // request them stay valid.
  /** The workflow shape: selection | rfi | submittal | signoff | punch. */
  coordination_kind?: CoordinationKind;
  /** Whose move it is: designer | client | gc | vendor. */
  court?: Court;
  /** RFI / Punch recorded answer (designer-authored for tracked courts). */
  answer?: string | null;
  created_at: string;
  updated_at: string;
  options?: ClientDecisionOption[];
}

export interface CreateDecisionInput {
  /** Optional caller-owned idempotency key. Generated when omitted. */
  decisionId?: string;
  designerClientId: string;
  projectId?: string;
  title: string;
  context?: string;
  dueDate?: string;
  linkedPhase?: string;
  decisionType?: DecisionType;
  blockingStatus?: BlockingStatus;
  status?: 'draft' | 'pending';
  blockedFfeItemIds?: string[];
  blockedTaskIds?: string[];
  options: {
    name: string;
    imageUrl?: string;
    designerNote?: string;
    isRecommended?: boolean;
    price?: number;
    quantity?: number;
    costDeltaCents?: number;
    leadTimeDaysDelta?: number;
    /** Optional catalog/library product this option is built from (00172). */
    productId?: string;
    /** Saved product configuration this option represents (00413). */
    configurationId?: string;
    /** The option's chosen values in the snapshot vocabulary (00413). */
    selectionSnapshot?: ProductConfigurationSelection[];
  }[];
}

export interface UpdateDecisionInput {
  decisionId: string;
  /** Compare-and-swap token from the row that populated the edit surface. */
  expectedUpdatedAt: string;
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
    configurationId?: string;
    selectionSnapshot?: ProductConfigurationSelection[];
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

      const decisionId = input.decisionId ?? crypto.randomUUID();
      const { data: decision, error: decisionError } = await supabase.rpc('create_client_decision', {
        p_decision_id: decisionId,
        p_payload: {
          designer_client_id: input.designerClientId,
          project_id: input.projectId ?? null,
          title: input.title,
          context: input.context ?? null,
          due_date: input.dueDate ?? null,
          linked_phase: input.linkedPhase ?? null,
          decision_type: input.decisionType ?? 'product',
          blocking_status: input.blockingStatus ?? 'non_blocking',
          status: input.status ?? 'pending',
        },
        p_options: input.options.map((opt, i) => ({
          name: opt.name,
          image_url: opt.imageUrl ?? null,
          designer_note: opt.designerNote ?? null,
          is_recommended: opt.isRecommended ?? false,
          price: opt.price ?? null,
          quantity: opt.quantity ?? 1,
          cost_delta_cents: opt.costDeltaCents ?? null,
          lead_time_days_delta: opt.leadTimeDaysDelta ?? null,
          product_id: opt.productId ?? null,
          // 00413 — configuration provenance + the winner's selections, so
          // apply_decision can carry the choice into the spec.
          configuration_id: opt.configurationId ?? null,
          selection_snapshot: opt.selectionSnapshot ?? null,
          sort_order: i,
        })),
        p_blocked_ffe_item_ids: input.blockedFfeItemIds ?? [],
        p_blocked_task_ids: input.blockedTaskIds ?? [],
      });

      if (decisionError) throw decisionError;
      if (!decision) throw new Error('Decision creation returned no row');

      return decision as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', data.project_id] });
        queryClient.invalidateQueries({ queryKey: ['project-ffe-items', data.project_id] });
        queryClient.invalidateQueries({ queryKey: ['section-tasks', data.project_id] });
        void invalidateProjectWorkflow(queryClient, data.project_id);
      }
    },
  });
}

/**
 * Update a decision's status (e.g., reopen a responded decision back to pending)
 */
export function useUpdateDecisionStatus(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    // Document callers (the margin's quiet grammar) pass { errorSurface: 'inline' }
    // to keep the global error toast quiet — the act renders failures inline (R83).
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
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

      let rpcName:
        | 'publish_client_decision'
        | 'reopen_client_decision'
        | 'expire_client_decision';
      if (status === 'pending') {
        rpcName = currentStatus === 'draft'
          ? 'publish_client_decision'
          : 'reopen_client_decision';
      } else if (status === 'expired') {
        rpcName = 'expire_client_decision';
      } else {
        throw new Error(
          `Decision status ${status} requires its dedicated resolve workflow`,
        );
      }

      const { data, error } = await supabase.rpc(rpcName, {
        p_decision_id: decisionId,
      });

      if (error) throw error;
      return data as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        void invalidateProjectWorkflow(queryClient, data.project_id);
      }
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
export function useUpdateDecision(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    // Document callers (the margin's quiet grammar) pass { errorSurface: 'inline' }
    // to keep the global error toast quiet — the act renders failures inline (R83).
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
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

      const rpcOptions = input.options === undefined
        ? null
        : input.options.map((opt, i) => ({
            name: opt.name,
            image_url: opt.imageUrl || null,
            designer_note: opt.designerNote || null,
            is_recommended: opt.isRecommended || false,
            price: opt.price ?? null,
            quantity: opt.quantity ?? 1,
            cost_delta_cents: opt.costDeltaCents ?? null,
            lead_time_days_delta: opt.leadTimeDaysDelta ?? null,
            product_id: opt.productId || null,
            configuration_id: opt.configurationId || null,
            selection_snapshot: opt.selectionSnapshot ?? null,
            sort_order: i,
          }));

      const { data, error: updateError } = await supabase.rpc('update_client_decision', {
        p_decision_id: input.decisionId,
        p_patch: patch,
        p_options: rpcOptions,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (updateError) throw updateError;
      if (!data) throw new Error('Decision update returned no row');

      return data as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', data.project_id] });
        void invalidateProjectWorkflow(queryClient, data.project_id);
      }
    },
  });
}

export interface ExtendAndReopenDecisionInput {
  decisionId: string;
  dueDate: string;
  /** Compare-and-swap token from the expired row shown in the margin. */
  expectedUpdatedAt: string;
}

/**
 * Atomically move an expired decision's deadline and reopen it. The lifecycle
 * RPC owns both the response-evidence reset and its single required notice, so
 * a failed request can never leave the decision reopened with the old date.
 */
export function useExtendAndReopenDecision(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async (input: ExtendAndReopenDecisionInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('extend_and_reopen_client_decision', {
        p_decision_id: input.decisionId,
        p_due_date: input.dueDate,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw error;
      if (!data) throw new Error('Decision extension returned no row');
      return data as ClientDecision;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', data.designer_client_id] });
      queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decision-metrics'] });
      if (data.project_id) {
        queryClient.invalidateQueries({ queryKey: ['project-decisions', data.project_id] });
        void invalidateProjectWorkflow(queryClient, data.project_id);
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
      const { error } = await supabase.rpc('delete_client_decision_draft', {
        p_decision_id: decisionId,
      });
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
        void invalidateProjectWorkflow(queryClient, projectId);
      }
    },
  });
}

/**
 * Publish a draft decision: flip status draft → pending and stamp sent_at. The
 * lifecycle RPC owns the required notification and the 00171 DB guard enforces
 * that only draft rows can be published this way.
 */
export function usePublishDraftDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ decisionId }: { decisionId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('publish_client_decision', {
        p_decision_id: decisionId,
      });
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
        void invalidateProjectWorkflow(queryClient, data.project_id);
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
 * Calls the `apply_client_decision` RPC which atomically:
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

      const { data, error: rpcError } = await supabase.rpc('apply_client_decision', {
        p_decision_id: decisionId,
        p_selected_option_id: optionId,
        p_client_consent_method: consent?.method ?? null,
        p_client_signature: consent?.signature ?? null,
        p_client_note: clientNote ?? null,
        p_quantity: quantity ?? null,
      });
      if (rpcError) throw rpcError;

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
        void invalidateProjectWorkflow(queryClient, data.project_id);
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
      const { data, error: rpcError } = await supabase.rpc('apply_decision_override', {
        p_decision_id: decisionId,
        p_selected_option_id: optionId,
        p_consent_method: consentMethod,
        p_consent_evidence: consentEvidence,
      });
      if (rpcError) throw rpcError;

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
        void invalidateProjectWorkflow(queryClient, data.project_id);
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

      const { data, error } = await supabase.rpc('stamp_client_decision_reminder', {
        p_decision_id: decisionId,
      });

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

      const { data, error } = await supabase.rpc('mark_client_decision_viewed', {
        p_decision_id: decisionId,
      });

      if (error) throw error;
      return data as ClientDecision;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['client-decision', data.id] });
      }
    },
  });
}
