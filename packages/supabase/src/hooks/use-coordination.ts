'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { ClientDecisionOption, DecisionType } from './use-decisions';
import { peopleKeys } from './use-people';

// ═══════════════════════════════════════════════════════════════════════════
// Track 5 — Project Coordination data layer (the ball-in-court).
//
// An RFI / Submittal / Sign-off / Punch IS a decision with an owner — the table
// is the widened `client_decisions` (00213: coordination_kind + court +
// blocks_kind), the option child table is `client_decision_options`, the resolve
// path is the one-tx SECURITY DEFINER `resolve_coordination_item` (00218), and the
// read models are `coordination_court_summary` / `task_blocked_state` (00219).
//
// Mirrors use-decisions.ts conventions: createBrowserClient via getSupabase(),
// React Query keys, fan-out invalidation, the one-act-many-surfaces pass on resolve.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

// The ball-in-court axis (00213 court CHECK, widened by 00281 with the field
// kinds so a task/item can sit in a sub/installer/receiver court). Field-kind
// labels/colors live in @patina/types field-config + coordination/party.ts.
export type Court =
  | 'designer'
  | 'client'
  | 'gc'
  | 'vendor'
  | 'sub'
  | 'installer'
  | 'receiver';
export type CoordinationKind = 'selection' | 'rfi' | 'submittal' | 'signoff' | 'punch';
export type BlocksKind = 'none' | 'ffe' | 'task' | 'phase';
export type CoordinationStatus = 'draft' | 'pending' | 'responded' | 'expired';

/** The project_parties.party_kind vocab (00212 + 00281 field kinds). */
export type PartyKind =
  | 'gc'
  | 'vendor'
  | 'client_rep'
  | 'other'
  | 'sub'
  | 'installer'
  | 'receiver';

/** A project_parties row (00212/00281) the court / owner can point at. */
export interface ProjectParty {
  id: string;
  project_id: string;
  party_kind: PartyKind;
  display_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  /** E.164-normalized phone (00281, derived by trigger from `phone`). */
  phone_e164: string | null;
  /** The party's trade — free TEXT, vocab in @patina/types field-config (00281). */
  trade: string | null;
  /** TCPA consent state (00281): not_asked | pending | granted | opted_out. */
  sms_consent_status: 'not_asked' | 'pending' | 'granted' | 'opted_out';
  sms_consented_at: string | null;
  sms_opt_out_at: string | null;
  vendor_id: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A submittal revision row (00214) — Rev-N history for R48. */
export interface CoordinationItemRevision {
  id: string;
  decision_id: string;
  rev_number: number;
  status: 'submitted' | 'approved' | 'rejected' | 'revise_resubmit';
  attachments: unknown[];
  note: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** The latest post on an item's per-item thread (00216), for the row preview. */
export interface CoordinationThreadPost {
  thread_id: string;
  last_message_at: string | null;
  title: string | null;
}

/**
 * A coordination item — the widened `client_decisions` row read at the
 * coordination grain, plus its options and the latest thread post for the
 * open-item row preview.
 */
export interface CoordinationItem {
  id: string;
  designer_client_id: string;
  designer_id: string | null;
  project_id: string | null;
  title: string;
  context: string | null;
  due_date: string | null;
  status: CoordinationStatus;
  // Track 5 axis (00213).
  coordination_kind: CoordinationKind;
  court: Court;
  court_party_id: string | null;
  blocks_kind: BlocksKind;
  answer: string | null;
  answered_at: string | null;
  answered_by: string | null;
  // Reused decision columns relevant to coordination.
  blocking_status: string | null;
  section_key: string | null;
  decision_kind: string | null;
  /** The subject-matter taxonomy (00084) — R55's composer "kind" picker writes it. */
  decision_type: string | null;
  /** The real project-phase FK (00084) the composer's "link to a phase" writes. */
  phase_id: string | null;
  reminder_sent_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
  options?: ClientDecisionOption[];
  /** The concrete party (00212) the current court points at, when any. */
  court_party?: ProjectParty | null;
  /** The latest post on the item's per-item thread (00216), when threaded. */
  latest_thread_post?: CoordinationThreadPost | null;
}

export interface CreateCoordinationItemInput {
  designerClientId: string;
  projectId?: string;
  title: string;
  context?: string;
  dueDate?: string;
  coordinationKind: CoordinationKind;
  court: Court;
  courtPartyId?: string | null;
  blocksKind?: BlocksKind;
  /** The subject-matter taxonomy (00084), meaningful for a selection. R55. */
  decisionType?: DecisionType;
  /** The project phase (00084 phase_id FK) this item links to. R55. */
  phaseId?: string | null;
  /** Persist as a draft (default) or publish straight to pending. */
  status?: 'draft' | 'pending';
  /** Selection options (only meaningful for coordination_kind='selection'). */
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
  /** project_ffe_items.id[] this item blocks (sets blocked_by_decision_id). */
  blockedFfeItemIds?: string[];
  /** project_tasks.id[] this item blocks (sets blocked_by_item_id + blocked). */
  blockedTaskIds?: string[];
}

export interface ResolveCoordinationItemInput {
  itemId: string;
  /** Selection: the chosen option (delegates to apply_decision). */
  selectedOptionId?: string | null;
  /** RFI / Punch: the recorded answer / verification note. */
  answer?: string | null;
  /** Submittal: the revision id being approved. */
  revisionId?: string | null;
  /** Override the default ball hand-off (R49 punch verify step). */
  nextCourt?: Court | null;
  /** The acting user (defaults to auth.uid() in the RPC). */
  resolvedBy?: string | null;
  /** Carried for optimistic rollback / cache scoping. */
  designerClientId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// The widened SELECT — coordination kinds, options, court party, latest thread
// ═══════════════════════════════════════════════════════════════════════════

const COORDINATION_SELECT = `
  id, designer_client_id, designer_id, project_id, title, context, due_date, status,
  coordination_kind, court, court_party_id, blocks_kind, answer, answered_at, answered_by,
  blocking_status, section_key, decision_kind, decision_type, phase_id,
  reminder_sent_at, sent_at, responded_at,
  viewed_at, created_at, updated_at,
  options:client_decision_options!decision_id(*),
  court_party:project_parties!court_party_id(*),
  latest_thread_post:comms_threads!coordination_item_id(thread_id:id, last_message_at, title)
`;

/** The 5 coordination kinds (selection IS the shipped path; the other four are
 *  the new generalization). The read model includes all so the band shows them
 *  grouped by court. */
const COORDINATION_KINDS: CoordinationKind[] = [
  'selection',
  'rfi',
  'submittal',
  'signoff',
  'punch',
];

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The coordination read model for a project: every coordination-kind open item
 * (selection / rfi / submittal / signoff / punch) with its options, the concrete
 * court party, and the latest per-item thread post for the row preview.
 *
 * Key `['coordination-items', projectId]`, 30s refetchInterval (mirrors the
 * margin read model). Realtime is layered by `useCoordinationRealtime`.
 */
export function useCoordinationItems(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['coordination-items', projectId],
    enabled: !!projectId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_decisions')
        .select(COORDINATION_SELECT)
        .eq('project_id', projectId)
        .in('coordination_kind', COORDINATION_KINDS)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalizeThreadPost) as CoordinationItem[];
    },
  });
}

/** The embed comes back as an array (a thread→item is 1:1 via the partial unique
 *  index, but PostgREST types the reverse embed as a list); collapse to one. */
function normalizeThreadPost(row: CoordinationItem & {
  latest_thread_post?: CoordinationThreadPost[] | CoordinationThreadPost | null;
}): CoordinationItem {
  const tp = row.latest_thread_post;
  return {
    ...row,
    latest_thread_post: Array.isArray(tp) ? (tp[0] ?? null) : (tp ?? null),
  };
}

export interface CourtCount {
  court: Court;
  open: number;
  overdue: number;
  nextDue: string | null;
}

/**
 * The court bar's per-court rollup. A `select` OVER the same coordination-items
 * query (no second fetch) — counts open/overdue/next-due per court client-side,
 * exactly as `coordination_court_summary` (00219) does server-side. Pass
 * `now` only in tests; production uses the live clock at render.
 */
export function useCourtSummary(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['coordination-items', projectId],
    enabled: !!projectId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_decisions')
        .select(COORDINATION_SELECT)
        .eq('project_id', projectId)
        .in('coordination_kind', COORDINATION_KINDS)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalizeThreadPost) as CoordinationItem[];
    },
    select: (items: CoordinationItem[]): CourtCount[] => summarizeCourts(items),
  });
}

const COURT_ORDER: Court[] = [
  'designer',
  'client',
  'gc',
  'vendor',
  'sub',
  'installer',
  'receiver',
];

/** Per-court open/overdue/next-due rollup over the items list (the select body). */
function summarizeCourts(items: CoordinationItem[], now: Date = new Date()): CourtCount[] {
  const nowMs = now.getTime();
  const acc = new Map<Court, { open: number; overdue: number; nextDue: number | null }>();
  for (const c of COURT_ORDER) acc.set(c, { open: 0, overdue: 0, nextDue: null });
  for (const item of items) {
    if (item.status !== 'pending') continue;
    const b = acc.get(item.court);
    if (!b) continue;
    b.open += 1;
    if (item.due_date) {
      const dueMs = new Date(item.due_date).getTime();
      if (dueMs < nowMs) b.overdue += 1;
      if (b.nextDue === null || dueMs < b.nextDue) b.nextDue = dueMs;
    }
  }
  return COURT_ORDER.map((court) => {
    const b = acc.get(court)!;
    return {
      court,
      open: b.open,
      overdue: b.overdue,
      nextDue: b.nextDue === null ? null : new Date(b.nextDue).toISOString(),
    };
  });
}

/** The project's coordination courts (00212 project_parties). */
export function useProjectParties(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-parties', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_parties')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectParty[];
    },
  });
}

export interface AddProjectPartyInput {
  projectId: string;
  partyKind: PartyKind;
  displayName: string;
  companyName?: string | null;
  trade?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Whether to text this party updates. true → sms_consent_status 'pending',
   *  which fires the opt-in invite server-side (Track B DB trigger); false →
   *  'not_asked'. The UI only writes the row; it never sends the invite. */
  textUpdates?: boolean;
}

/**
 * Add a field party (gc / sub / installer / receiver) to a project. Inserts a
 * project_parties row; the 00281 trigger normalizes phone_e164, and — per the
 * Track B contract — a row written with a phone + sms_consent_status='pending'
 * fires the opt-in SMS invite server-side. The UI writes the row only.
 */
export function useAddProjectParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddProjectPartyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const wantsText = input.textUpdates && !!input.phone?.trim();
      const { data, error } = await supabase
        .from('project_parties')
        .insert({
          project_id: input.projectId,
          party_kind: input.partyKind,
          display_name: input.displayName,
          company_name: input.companyName?.trim() || null,
          trade: input.trade?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          sms_consent_status: wantsText ? 'pending' : 'not_asked',
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectParty;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['project-parties', data.project_id] });
      // The party joins the People Room roster (people_directory, 00281).
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}

/** A submittal's Rev-N history (00214), latest first. */
export function useItemRevisions(itemId: string | null | undefined) {
  return useQuery({
    queryKey: ['coordination-revisions', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('coordination_item_revisions')
        .select('*')
        .eq('decision_id', itemId)
        .order('rev_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoordinationItemRevision[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Mutations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a coordination item — the one act, many surfaces (spec §5). Calls the
 * SECURITY DEFINER `resolve_coordination_item` (00218): dispatches by kind
 * (selection → apply_decision; rfi → answer; submittal → approve revision;
 * signoff/punch → record), then in the SAME transaction clears FF&E blocks, flips
 * downstream tasks blocked→todo, and shifts the ball to the next court.
 *
 * onMutate optimistically flips the item to responded and clears
 * `blocked_by_item_id` on its dependent tasks (the cascade preview); onError rolls
 * both back; onSuccess invalidates coordination-items + section-tasks +
 * project-decisions + the margin surfaces (margin-items / document-state / FF&E).
 */
export function useResolveCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ResolveCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: { user } } = await supabase.auth.getUser();

      const { error: rpcError } = await supabase.rpc('resolve_coordination_item', {
        p_item_id: input.itemId,
        p_selected_option_id: input.selectedOptionId ?? null,
        p_answer: input.answer ?? null,
        p_revision_id: input.revisionId ?? null,
        p_next_court: input.nextCourt ?? null,
        p_resolved_by: input.resolvedBy ?? user?.id ?? null,
      });
      if (rpcError) throw rpcError;

      // The item is now resolved — notify the owning designer. Non-fatal, same
      // posture as the decision resolve path.
      const { error: notifyError } = await supabase.rpc('notify_decision_resolved', {
        p_decision_id: input.itemId,
      });
      if (notifyError) {
        console.warn('useResolveCoordinationItem: notify_decision_resolved failed', notifyError);
      }

      const { data, error } = await supabase
        .from('client_decisions')
        .select('*')
        .eq('id', input.itemId)
        .single();
      if (error) throw error;
      return data as CoordinationItem;
    },

    // Optimistic cascade preview: the item resolves, its dependent tasks unblock.
    onMutate: async (input) => {
      const itemsKey = ['coordination-items', projectId];
      const tasksKey = ['section-tasks', projectId];
      await queryClient.cancelQueries({ queryKey: itemsKey });
      await queryClient.cancelQueries({ queryKey: tasksKey });

      const prevItems = queryClient.getQueryData<CoordinationItem[]>(itemsKey);
      const prevTasks = queryClient.getQueryData<unknown[]>(tasksKey);

      const nextCourt = input.nextCourt ?? defaultNextCourt(prevItems, input.itemId);

      if (prevItems) {
        queryClient.setQueryData<CoordinationItem[]>(
          itemsKey,
          prevItems.map((it) =>
            it.id === input.itemId
              ? {
                  ...it,
                  status: 'responded',
                  responded_at: new Date().toISOString(),
                  court: nextCourt ?? it.court,
                  answer: input.answer ?? it.answer,
                }
              : it,
          ),
        );
      }

      if (Array.isArray(prevTasks)) {
        queryClient.setQueryData(
          tasksKey,
          prevTasks.map((t) => {
            const task = t as { blocked_by_item_id?: string | null; status?: string };
            return task.blocked_by_item_id === input.itemId
              ? { ...task, blocked_by_item_id: null, status: 'todo' }
              : t;
          }),
        );
      }

      return { itemsKey, tasksKey, prevItems, prevTasks };
    },

    onError: (_err, _input, ctx) => {
      if (!ctx) return;
      if (ctx.prevItems !== undefined) queryClient.setQueryData(ctx.itemsKey, ctx.prevItems);
      if (ctx.prevTasks !== undefined) queryClient.setQueryData(ctx.tasksKey, ctx.prevTasks);
    },

    onSettled: (data) => {
      // One act, many surfaces (§5): re-read every surface the resolve touched.
      void queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['section-tasks', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['coordination-revisions'] });
      // Margin / Desk / document FF&E (the margin one-act trio).
      void queryClient.invalidateQueries({ queryKey: ['margin-items'] });
      void queryClient.invalidateQueries({ queryKey: ['document-state'] });
      const pid = data?.project_id ?? projectId;
      if (pid) {
        void queryClient.invalidateQueries({ queryKey: ['project-decisions', pid] });
        void queryClient.invalidateQueries({ queryKey: ['project-ffe-items', pid] });
        void queryClient.invalidateQueries({ queryKey: ['project-ffe', pid] });
      }
    },
  });
}

/** The default ball hand-off (mirrors next_court_for, 00218) for the optimistic
 *  preview only — the RPC is the source of truth on the server. */
function defaultNextCourt(
  items: CoordinationItem[] | undefined,
  itemId: string,
): Court {
  const kind = items?.find((i) => i.id === itemId)?.coordination_kind;
  switch (kind) {
    case 'rfi':
      return 'gc';
    case 'submittal':
      return 'vendor';
    default:
      return 'designer';
  }
}

/**
 * Raise a coordination item — generalizes useCreateDecision across all five
 * kinds. Inserts a `client_decisions` row carrying coordination_kind / court /
 * blocks_kind, inserts selection options (when any), wires the dependency web
 * (project_ffe_items.blocked_by_decision_id + project_tasks.blocked_by_item_id),
 * and fires notify_decision_required when published. Drafts stay quiet.
 */
export function useCreateCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const status = input.status ?? 'pending';

      const { data: item, error: itemError } = await supabase
        .from('client_decisions')
        .insert({
          designer_client_id: input.designerClientId,
          project_id: input.projectId ?? projectId ?? null,
          title: input.title,
          context: input.context || null,
          due_date: input.dueDate || null,
          coordination_kind: input.coordinationKind,
          court: input.court,
          court_party_id: input.courtPartyId ?? null,
          blocks_kind: input.blocksKind ?? 'none',
          // A selection is a 'choice' decision; the other four ride 'choice' too
          // (the coordination_kind axis carries the real shape — see 00213).
          decision_kind: 'choice',
          // R55: the subject-matter taxonomy (00084 decision_type) the composer's
          // "kind" chips set for a selection; coordination kinds keep the default.
          decision_type: input.decisionType ?? 'product',
          phase_id: input.phaseId ?? null,
          blocking_status: blockingStatusFor(input.blocksKind),
          status,
          sent_at: status === 'draft' ? null : new Date().toISOString(),
        })
        .select()
        .single();
      if (itemError) throw itemError;

      // Selection options (only selections carry them).
      if (
        input.coordinationKind === 'selection' &&
        input.options &&
        input.options.length > 0
      ) {
        const { error: optErr } = await supabase
          .from('client_decision_options')
          .insert(
            input.options.map((opt, i) => ({
              decision_id: item.id,
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
        if (optErr) throw optErr;
      }

      // Wire the dependency web — FF&E lines this item blocks.
      if (input.blockedFfeItemIds && input.blockedFfeItemIds.length > 0) {
        const { error: ffeErr } = await supabase
          .from('project_ffe_items')
          .update({ blocked: true, blocked_by_decision_id: item.id })
          .in('id', input.blockedFfeItemIds);
        if (ffeErr) {
          console.warn('useCreateCoordinationItem: failed to tag blocked FF&E items', ffeErr);
        }
      }

      // Wire the dependency web — tasks this item blocks (00215 blocked_by_item_id).
      if (input.blockedTaskIds && input.blockedTaskIds.length > 0) {
        const { error: taskErr } = await supabase
          .from('project_tasks')
          .update({ status: 'blocked', blocked_by_item_id: item.id })
          .in('id', input.blockedTaskIds);
        if (taskErr) {
          console.warn('useCreateCoordinationItem: failed to tag blocked tasks', taskErr);
        }
      }

      // Published items knock on the client (or the recorded court). Non-fatal.
      if (status === 'pending') {
        const { error: notifyErr } = await supabase.rpc('notify_decision_required', {
          p_decision_id: item.id,
        });
        if (notifyErr) {
          console.warn('useCreateCoordinationItem: notify_decision_required failed', notifyErr);
        }
      }

      return item as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/** A blocks_kind maps onto the existing blocking_status axis so the legacy
 *  FF&E/phase machinery and the Desk need-lines still read truthfully. */
function blockingStatusFor(blocksKind: BlocksKind | undefined): string {
  switch (blocksKind) {
    case 'ffe':
      return 'blocks_procurement';
    case 'phase':
      return 'blocks_phase';
    case 'task':
    case 'none':
    default:
      return 'non_blocking';
  }
}

/**
 * Nudge — record a reminder on a waiting item (reuses the decision reminder
 * path: stamps reminder_sent_at, surfaces in the margin, fires no toast per R51).
 */
export function useNudgeCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_decisions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', itemId)
        .select()
        .single();
      if (error) throw error;

      // Re-knock the client/court that the item is waiting on. Non-fatal.
      const { error: notifyErr } = await supabase.rpc('notify_decision_required', {
        p_decision_id: itemId,
      });
      if (notifyErr) console.warn('useNudgeCoordinationItem: notify failed', notifyErr);

      return data as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/** Extend — push a waiting item's due date out (reuses the decision update path). */
export function useExtendCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, dueDate }: { itemId: string; dueDate: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_decisions')
        .update({ due_date: dueDate })
        .eq('id', itemId)
        .select()
        .single();
      if (error) throw error;
      return data as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/**
 * Reassign — move the ball to a different court (the accountability primitive).
 * A plain `court` update (+ the concrete party row when gc/vendor). The item
 * stays pending; only whose move it is changes.
 */
export function useReassignCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      court,
      courtPartyId,
    }: {
      itemId: string;
      court: Court;
      courtPartyId?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const patch: Record<string, unknown> = { court };
      if (courtPartyId !== undefined) patch.court_party_id = courtPartyId;
      const { data, error } = await supabase
        .from('client_decisions')
        .update(patch)
        .eq('id', itemId)
        .select()
        .single();
      if (error) throw error;
      return data as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(queryClient, data.project_id ?? projectId ?? null, data.designer_client_id);
    },
  });
}

/**
 * Record a submittal revision round (R48 revise & resubmit) — the RPC-only write
 * path (coordination_item_revisions has no broad write policy, 00214). Adds the
 * next revision row and leaves the item pending; the resolve RPC later approves a
 * revision id.
 */
export function useSubmitCoordinationRevision(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      attachments,
      note,
      status,
    }: {
      itemId: string;
      attachments?: unknown[];
      note?: string | null;
      status?: 'submitted' | 'approved' | 'rejected' | 'revise_resubmit';
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('submit_coordination_revision', {
        p_item_id: itemId,
        p_attachments: attachments ?? [],
        p_note: note ?? null,
        p_status: status ?? 'submitted',
        p_submitted_by: user?.id ?? null,
      });
      if (error) throw error;
      return data as CoordinationItemRevision;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['coordination-revisions', data.decision_id] });
      void queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Realtime
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Project-grain realtime for the coordination band — mirrors useDecisionRealtime
 * at the project level so a designer-recorded GC answer (or a client pick from
 * the mirror) surfaces live. Invalidates the items read model + the dependency
 * web on any change to client_decisions / project_tasks on this project.
 */
export function useCoordinationRealtime(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['section-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['margin-items'] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
    };

    const channel: RealtimeChannel = supabase
      .channel(`coordination:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_decisions',
          filter: `project_id=eq.${projectId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_tasks',
          filter: `project_id=eq.${projectId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, queryClient]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared invalidation — the coordination read model + the surfaces it feeds
// ═══════════════════════════════════════════════════════════════════════════

function invalidateCoordination(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string | null,
  designerClientId?: string | null,
) {
  void queryClient.invalidateQueries({ queryKey: ['coordination-items', projectId] });
  void queryClient.invalidateQueries({ queryKey: ['margin-items'] });
  void queryClient.invalidateQueries({ queryKey: ['document-state'] });
  if (projectId) {
    void queryClient.invalidateQueries({ queryKey: ['section-tasks', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-decisions', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
  }
  if (designerClientId) {
    void queryClient.invalidateQueries({ queryKey: ['client-decisions', designerClientId] });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// R55 — the composer's edit / publish / delete lifecycle over a draft item
//
// These complete the create→light direction of the one-act invariant (§5): the
// composer authors a draft, edits it in place, publishes it (draft→pending,
// which lights the decision_due stamp on any gated FF&E line), or deletes it
// (clearing the dependency web first so no line is left blocked by a ghost).
// The CLEAR/resolve direction stays Track 5's `resolve_coordination_item` (00218).
// ═══════════════════════════════════════════════════════════════════════════

export interface UpdateCoordinationItemInput {
  itemId: string;
  /** Carried for cache scoping (the client-decisions key). */
  designerClientId: string;
  projectId?: string;
  title?: string;
  context?: string | null;
  dueDate?: string | null;
  coordinationKind?: CoordinationKind;
  court?: Court;
  courtPartyId?: string | null;
  blocksKind?: BlocksKind;
  decisionType?: DecisionType;
  phaseId?: string | null;
  /** When provided, REPLACES the option set (delete-then-insert). Omit to leave. */
  options?: CreateCoordinationItemInput['options'];
  /** When provided (incl. []), RE-TAGS which FF&E lines this item gates. */
  blockedFfeItemIds?: string[];
  /** When provided (incl. []), RE-TAGS which tasks this item blocks. */
  blockedTaskIds?: string[];
}

/**
 * Edit a draft coordination item in place — the composer re-opens on a draft and
 * saves changes. Patches only the provided columns, replaces options when given,
 * and re-tags the dependency web (clear this item's old FF&E/task links, set the
 * new ones). A draft stays quiet (no notify). Intended for status='draft' rows.
 */
export function useUpdateCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCoordinationItemInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // 1) Patch only the columns the caller supplied (never null untouched cols).
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.context !== undefined) patch.context = input.context || null;
      if (input.dueDate !== undefined) patch.due_date = input.dueDate || null;
      if (input.coordinationKind !== undefined) patch.coordination_kind = input.coordinationKind;
      if (input.court !== undefined) patch.court = input.court;
      if (input.courtPartyId !== undefined) patch.court_party_id = input.courtPartyId ?? null;
      if (input.blocksKind !== undefined) {
        patch.blocks_kind = input.blocksKind;
        patch.blocking_status = blockingStatusFor(input.blocksKind);
      }
      if (input.decisionType !== undefined) patch.decision_type = input.decisionType;
      if (input.phaseId !== undefined) patch.phase_id = input.phaseId ?? null;

      const { data: item, error: itemError } = await supabase
        .from('client_decisions')
        .update(patch)
        .eq('id', input.itemId)
        .select()
        .single();
      if (itemError) throw itemError;

      // 2) Replace the option set when provided (delete-then-insert, like
      //    useUpdateDecision). Drafts have no client picks to dangle.
      if (input.options !== undefined) {
        const { error: delErr } = await supabase
          .from('client_decision_options')
          .delete()
          .eq('decision_id', input.itemId);
        if (delErr) throw delErr;
        if (input.options.length > 0) {
          const { error: insErr } = await supabase
            .from('client_decision_options')
            .insert(
              input.options.map((opt, i) => ({
                decision_id: input.itemId,
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
          if (insErr) throw insErr;
        }
      }

      // 3) Re-tag the FF&E gate — clear this item's stale links, set the new set.
      if (input.blockedFfeItemIds !== undefined) {
        await supabase
          .from('project_ffe_items')
          .update({ blocked: false, blocked_by_decision_id: null })
          .eq('blocked_by_decision_id', input.itemId);
        if (input.blockedFfeItemIds.length > 0) {
          await supabase
            .from('project_ffe_items')
            .update({ blocked: true, blocked_by_decision_id: input.itemId })
            .in('id', input.blockedFfeItemIds);
        }
      }

      // 4) Re-tag the task gate the same way (00215 blocked_by_item_id).
      if (input.blockedTaskIds !== undefined) {
        await supabase
          .from('project_tasks')
          .update({ status: 'todo', blocked_by_item_id: null })
          .eq('blocked_by_item_id', input.itemId);
        if (input.blockedTaskIds.length > 0) {
          await supabase
            .from('project_tasks')
            .update({ status: 'blocked', blocked_by_item_id: input.itemId })
            .in('id', input.blockedTaskIds);
        }
      }

      return item as CoordinationItem;
    },
    onSuccess: (data) => {
      invalidateCoordination(
        queryClient,
        data.project_id ?? projectId ?? null,
        data.designer_client_id,
      );
    },
  });
}

/**
 * Publish a draft (draft→pending) — the composer's "Publish →" on an existing
 * draft. Flips status + stamps sent_at + knocks on the recorded court. Because a
 * gated FF&E line already carries blocked=true (set at create), flipping the
 * decision to 'pending' is exactly what lights the `decision_due` stamp (§5,
 * R55). Idempotent: a no-op when the row is already past draft.
 */
export function usePublishCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { itemId: string; designerClientId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: item, error } = await supabase
        .from('client_decisions')
        .update({ status: 'pending', sent_at: new Date().toISOString() })
        .eq('id', input.itemId)
        .eq('status', 'draft')
        .select()
        .maybeSingle();
      if (error) throw error;

      // Already-published (double-fire) returns no row — quietly idempotent.
      if (item) {
        const { error: notifyErr } = await supabase.rpc('notify_decision_required', {
          p_decision_id: input.itemId,
        });
        if (notifyErr) {
          console.warn('usePublishCoordinationItem: notify_decision_required failed', notifyErr);
        }
      }
      return (item ?? null) as CoordinationItem | null;
    },
    onSuccess: (data, input) => {
      invalidateCoordination(
        queryClient,
        data?.project_id ?? projectId ?? null,
        data?.designer_client_id ?? input.designerClientId ?? null,
      );
    },
  });
}

/**
 * Delete a coordination item (destructive). Clears the dependency web FIRST —
 * un-blocks any FF&E line or task gated by this item — so deleting a draft can
 * never leave a line blocked by a ghost decision (the FK is ON DELETE SET NULL,
 * which would null the pointer but strand blocked=true). The row delete cascades
 * its options / overrides / events (ON DELETE CASCADE).
 */
export function useDeleteCoordinationItem(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { itemId: string; designerClientId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      await supabase
        .from('project_ffe_items')
        .update({ blocked: false, blocked_by_decision_id: null })
        .eq('blocked_by_decision_id', input.itemId);
      await supabase
        .from('project_tasks')
        .update({ status: 'todo', blocked_by_item_id: null })
        .eq('blocked_by_item_id', input.itemId);

      const { error } = await supabase
        .from('client_decisions')
        .delete()
        .eq('id', input.itemId);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      invalidateCoordination(queryClient, projectId ?? null, input.designerClientId ?? null);
    },
  });
}
