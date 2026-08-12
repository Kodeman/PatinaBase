import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { updateProposalTotal } from '../lib/proposal-total';
import {
  invalidateProposalClientQueries,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from '../lib/proposal-client-query-invalidation';
import {
  assessProposalPaymentSchedule,
  parseProposalSendSnapshot,
  proposalPaymentScheduleReviewKey,
  proposalSendSnapshotsMatch,
  type ProposalSendSnapshot,
} from '../lib/proposal-payment-schedule';
import { signBoardMediaValue } from '../lib/board-storage';
import type {
  ProposalExclusion,
  ProposalPaymentMilestone,
  ProposalPhase,
  ProposalScopeRoom,
} from './use-scope-builder';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

const REVIEWED_PROPOSAL_CHANGED =
  'Proposal cannot be sent: the proposal changed since it was reviewed. Review the latest client copy and send again.';

export type ProposalEmailDeliveryState =
  | 'pending'
  | 'in_flight'
  | 'delivered'
  | 'suppressed'
  | 'failed'
  | 'ambiguous'
  | 'unconfirmed';

export interface ProposalEmailDispatchOutcome {
  _emailDispatched: boolean;
  _emailDeliveryState: ProposalEmailDeliveryState;
  _emailRetryable: boolean;
  _emailDispatchDetail?: string;
}

export interface ProposalEmailDispatchStatus {
  dispatchId: string;
  proposalId: string;
  sentAt: string;
  state: ProposalEmailDeliveryState;
  attemptCount: number;
  retryable: boolean;
  detail?: string;
}

const PROPOSAL_EMAIL_STATES = new Set<ProposalEmailDeliveryState>([
  'pending',
  'in_flight',
  'delivered',
  'suppressed',
  'failed',
  'ambiguous',
  'unconfirmed',
]);

async function invokeProposalSendEdge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: { proposalId: string; sentAt: string; dispatchId: string },
): Promise<ProposalEmailDispatchOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('proposal-send', {
      body: input,
    });
    const state =
      data &&
      typeof data.delivery_state === 'string' &&
      PROPOSAL_EMAIL_STATES.has(
        data.delivery_state as ProposalEmailDeliveryState,
      )
        ? (data.delivery_state as ProposalEmailDeliveryState)
        : 'pending';
    if (error && state === 'pending') {
      // eslint-disable-next-line no-console
      console.warn('proposal-send invocation failed', error);
    }
    return {
      _emailDispatched: state === 'delivered',
      _emailDeliveryState: state,
      _emailRetryable:
        typeof data?.retryable === 'boolean'
          ? data.retryable
          : state === 'pending' || state === 'in_flight',
      _emailDispatchDetail:
        typeof data?.detail === 'string' ? data.detail : undefined,
    };
  } catch (error) {
    // The immutable outbox row already exists. A transport failure is pending,
    // never success, and can be retried without rerunning send_proposal.
    // eslint-disable-next-line no-console
    console.warn('proposal-send invocation failed', error);
    return {
      _emailDispatched: false,
      _emailDeliveryState: 'pending',
      _emailRetryable: true,
    };
  }
}

async function readProposalSendSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  proposalId: string,
): Promise<ProposalSendSnapshot> {
  const { data, error } = await supabase.rpc('get_proposal_send_snapshot', {
    p_proposal_id: proposalId,
  });
  if (error) throw error;

  const snapshot = parseProposalSendSnapshot(data);
  if (!snapshot) {
    throw new Error(
      'Proposal cannot be sent: the reviewed snapshot could not be verified.',
    );
  }
  return snapshot;
}

function assertReviewedProposalSnapshot(
  actual: ProposalSendSnapshot,
  expected: ProposalSendSnapshot,
) {
  if (!proposalSendSnapshotsMatch(actual, expected)) {
    throw new Error(REVIEWED_PROPOSAL_CHANGED);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ProposalItemType = 'fixed' | 'allowance' | 'tbd';

export interface ProposalItemProductSnapshot {
  product_id?: string;
  name?: string;
  images?: string[] | null;
  brand?: string | null;
  source_url?: string | null;
  dimensions?: unknown;
  materials?: string[] | null;
  price_retail?: number | null;
  has_teaching?: boolean;
  /** Safe DTOs hide completeness when tier-redacted inputs would undercount. */
  record_completeness_hidden?: boolean;
}

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
  line_total_cents: number;
  vendor_name: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  // Wave 1 schema (added in 00066): structured FF&E typing
  item_type?: ProposalItemType;
  scope_room_id?: string | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
  ffe_category?: string | null;
  // Dual pricing (00185) + scheduling detail (Schedule & Boards Wave 1)
  markup_percent?: number | null;
  lead_time_weeks?: number | null;
  internal_notes?: string | null;
  /** Short spec/catalog reference, e.g. CH-01 (00262). */
  doc_code?: string | null;
  /** Designer-defined field values, keyed by spec_field_defs.field_key (S6, 00268). */
  custom_fields?: Record<string, unknown> | null;
  /** Immutable product provenance owned by the proposal edition (00390). */
  client_product_snapshot?: ProposalItemProductSnapshot | null;
  // Joined data
  product?: {
    id: string;
    name: string;
    images: string[] | null;
    brand: string | null;
    // Provenance trust inputs (Schedule & Boards Wave 3 · A2). `source_url`
    // drives the per-line source host; the rest + the teaching count feed
    // recordCompletenessFill/Pct (mirrors the Piece Room + spec-pdf scoring).
    source_url: string | null;
    dimensions: unknown;
    materials: string[] | null;
    price_retail: number | null;
    price_trade?: number | null;
    /** PostgREST aggregate embed: [{ count }] — ≥1 style ⇒ the record is "taught". */
    product_styles?: { count: number }[];
    /** Present when client rendering has normalized the immutable snapshot. */
    has_teaching?: boolean;
    record_completeness_hidden?: boolean;
  };
}

export interface Proposal {
  id: string;
  project_id: string | null;
  designer_id: string;
  client_id: string | null;
  /** Canonical designer↔household relationship, including no-login clients. */
  designer_client_id: string | null;
  title: string;
  description: string | null;
  project_address: string | null;
  client_visibility_tier: 'full' | 'milestone' | 'curated' | null;
  total_amount: number;
  // Payment terms (migration 00014). `select('*')` already returns these; the
  // interface just hadn't caught up. NOTE: `deposit_percent` is deliberately
  // NOT typed here — it defaults to 50.00 in the DB and no authoring UI ever
  // sets it, so a non-null value doesn't mean a designer actually chose a
  // deposit. `payment_terms` / `payment_notes` have no default (stay NULL
  // until explicitly set), so their presence is a real signal.
  payment_terms: string | null;
  payment_notes: string | null;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'revised';
  valid_until: string | null;
  sent_at: string | null;
  /** Immutable email outbox nonce created atomically by send_proposal (00388). */
  proposal_send_dispatch_id: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  // Revision chain
  version: number | null;
  parent_proposal_id: string | null;
  revision_summary: string | null;
  client_feedback: string | null;
  /** Additive commercial-document projection from list_client_proposals. Absent
   * pre-migration; a legacy row's `commercial_state` is a vestigial projection
   * and must never be trusted over its historical `status` semantics — see
   * commercialSummaryFromProposal in the client portal. */
  document_kind?: 'legacy' | 'design_services' | 'furnishings_authorization' | 'service_addendum';
  /** No 'expired' — the DB CHECK (00414) retired it; expiry stays a
   * lazily-evaluated client derivation (see legacyStatusToCommercialState),
   * never a stored commercial_state. */
  commercial_state?: 'draft' | 'sent' | 'client_signed' | 'executed' | 'declined' | 'superseded';
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
  /** Client-safe list DTO embeds the signed schedule for the budget surface. */
  payment_milestones?: ProposalPaymentMilestone[];
}

export interface ProposalFilters {
  status?: string | string[];
  clientId?: string;
  projectId?: string;
}

export interface ClientProposalBoardItem {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number | null;
  z_index: number;
  rotation: number;
  image_url: string | null;
  content: string | null;
  data: Record<string, unknown>;
}

export interface ClientProposalBoard {
  id: string;
  name: string;
  cover_image_url?: string | null;
  sort_order?: number;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  items: ClientProposalBoardItem[];
}

export interface ClientProposalBundle {
  proposal: Proposal;
  sections: ProposalSection[];
  payment_milestones: ProposalPaymentMilestone[];
  phases: ProposalPhase[];
  exclusions: ProposalExclusion[];
  scope_rooms: ProposalScopeRoom[];
  boards: ClientProposalBoard[];
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
            product:products(
              id, name, images, brand,
              source_url, dimensions, materials, price_retail, price_trade,
              product_styles(count)
            )
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

/** Client-only proposal list. The RPC returns an explicit allowlist DTO; raw
 * proposal rows remain unavailable to authenticated clients. */
export function useClientSafeProposals() {
  return useQuery({
    queryKey: ['proposals', 'client-safe'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('list_client_proposals');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Proposal[];
    },
  });
}

/** Client-only detail bundle. Parent, items, sections, schedule, rooms, and
 * boards cross one database-owned allowlist boundary in a single request. */
export function useClientSafeProposalBundle(proposalId: string) {
  return useQuery({
    queryKey: ['proposal', proposalId, 'client-safe'],
    enabled: !!proposalId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc(
        'get_client_proposal_bundle',
        { p_proposal_id: proposalId },
      );
      if (error) throw error;
      return signBoardMediaValue(supabase, data as ClientProposalBundle);
    },
  });
}

export function useProposalSendDispatchStatus({
  proposalId,
  dispatchId,
  sentAt,
  enabled = true,
}: {
  proposalId: string;
  dispatchId?: string | null;
  sentAt?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['proposal-send-dispatch-status', proposalId, dispatchId, sentAt],
    queryFn: async (): Promise<ProposalEmailDispatchStatus> => {
      if (!dispatchId || !sentAt) {
        throw new Error(
          'The proposal delivery instance is incomplete. Refresh before retrying.',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc(
        'get_proposal_send_dispatch_status',
        {
          p_proposal_id: proposalId,
          p_dispatch_id: dispatchId,
          p_sent_at: sentAt,
        },
      );
      if (error) throw error;

      const state = data?.delivery_state;
      if (
        !data ||
        typeof state !== 'string' ||
        !PROPOSAL_EMAIL_STATES.has(state as ProposalEmailDeliveryState) ||
        typeof data.retryable !== 'boolean'
      ) {
        throw new Error(
          'The proposal delivery status could not be verified. Refresh before retrying.',
        );
      }

      const attemptCount = Number(data.attempt_count ?? 0);
      if (!Number.isInteger(attemptCount) || attemptCount < 0) {
        throw new Error(
          'The proposal delivery status could not be verified. Refresh before retrying.',
        );
      }

      return {
        dispatchId,
        proposalId,
        sentAt,
        state: state as ProposalEmailDeliveryState,
        attemptCount,
        retryable: data.retryable,
        detail:
          typeof data.last_error === 'string' && data.last_error.length > 0
            ? data.last_error
            : undefined,
      };
    },
    enabled: Boolean(enabled && proposalId && dispatchId && sentAt),
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
        revised: proposals.filter((p: Proposal) => p.status === 'revised').length,
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
 *
 * Document-surface callers (e.g. the ad-hoc "draft a proposal" opener, R85)
 * pass `{ errorSurface: 'inline' }` so a failure renders inline rather than in
 * the global toast (R83). Legacy portal callers omit it and keep the toast.
 */
export function useCreateProposal(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      title,
      description,
      projectId,
      clientId,
      designerClientId,
      validUntil,
      templateId,
    }: {
      title: string;
      description?: string;
      projectId?: string;
      clientId?: string;
      designerClientId?: string;
      validUntil?: string;
      templateId?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      if (!!clientId !== !!designerClientId) {
        throw new Error(
          'A proposal client must include both profile and designer relationship identities',
        );
      }

      const { data, error } = await supabase
        .from('proposals')
        .insert({
          designer_id: user.user.id,
          title,
          description,
          project_id: projectId || null,
          client_id: clientId || null,
          designer_client_id: designerClientId || null,
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
 *
 * Document-surface callers that render failures inline (R83 — the error
 * grammar) pass `{ errorSurface: 'inline' }` so the designer portal's global
 * mutation onError raises no toast. Legacy portal callers omit it and keep
 * the toast until dissolve.
 */
export function useUpdateProposal(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      proposalId,
      updates,
    }: {
      proposalId: string;
      updates: Partial<Pick<Proposal, 'title' | 'description' | 'project_address' | 'client_visibility_tier' | 'valid_until' | 'project_id'>>;
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
    onSuccess: async (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      await invalidateProposalClientQueries(queryClient, proposalId);
    },
  });
}

/**
 * Add an item to a proposal
 */
/**
 * A proposal's schedule lines, slim projection for twin detection + doc_code
 * suggestion (B5 board→schedule). Keyed on the SAME query key the FF&E schedule
 * uses, so useAddProposalItem's invalidation refreshes it after a line is added.
 */
export function useProposalScheduleItems(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-items-schedule', proposalId ?? null],
    enabled: !!proposalId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_items')
        .select('id, product_id, doc_code, scope_room_id, name, ffe_category')
        .eq('proposal_id', proposalId)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        product_id: string | null;
        doc_code: string | null;
        scope_room_id: string | null;
        name: string | null;
        ffe_category: string | null;
      }>;
    },
  });
}

export function useAddProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
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
      imageUrl,
      // Wave 1 — structured FF&E
      itemType,
      scopeRoomId,
      budgetMinCents,
      budgetMaxCents,
      ffeCategory,
      // Schedule & Boards Wave 1 — spec instrument
      docCode,
      leadTimeWeeks,
      customFields,
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
      /** Snapshot image (e.g. a board pin's image) carried onto the line. */
      imageUrl?: string | null;
      itemType?: ProposalItemType;
      scopeRoomId?: string | null;
      budgetMinCents?: number | null;
      budgetMaxCents?: number | null;
      ffeCategory?: string | null;
      docCode?: string | null;
      leadTimeWeeks?: number | null;
      /**
       * Free-form pre-sale intent kept on `proposal_items.custom_fields`.
       * The picker's configure step writes `{ configuration: … }` here so a
       * proposal line remembers WHICH specification was quoted; activation
       * (00269) carries it forward. Never a substitute for the configuration
       * record itself — `proposal_items` is pre-sale and has no FK to one.
       */
      customFields?: Record<string, unknown> | null;
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
      // Allowances have no unit price; their planned cost is the midpoint of the
      // budget range. Storing it in line_total_cents folds allowances into
      // proposals.total_amount (Σ line_total_cents) and, on activation, the
      // project FF&E budget — keeping the stored total in step with the
      // on-screen estimate. Fixed/TBD items use quantity × unit price.
      const lineTotal =
        itemType === 'allowance' &&
        typeof budgetMinCents === 'number' &&
        typeof budgetMaxCents === 'number'
          ? Math.round((budgetMinCents + budgetMaxCents) / 2)
          : quantity * sellPrice;

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
          line_total_cents: lineTotal,
          notes: notes || null,
          category: category || null,
          vendor_name: vendorName || null,
          image_url: imageUrl || null,
          position: nextPosition,
          // Wave 1 columns. Defaults match the table defaults from 00066.
          item_type: itemType ?? 'fixed',
          scope_room_id: scopeRoomId ?? null,
          budget_min_cents: budgetMinCents ?? null,
          budget_max_cents: budgetMaxCents ?? null,
          ffe_category: ffeCategory ?? null,
          // Schedule & Boards Wave 1 (00262 doc_code + existing lead_time_weeks).
          doc_code: docCode ?? null,
          lead_time_weeks: leadTimeWeeks ?? null,
          // Omit rather than null the column — it is NOT NULL DEFAULT '{}'.
          ...(customFields ? { custom_fields: customFields } : {}),
        })
        .select()
        .single();

      if (error) throw error;

      // Update proposal total
      await updateProposalTotal(supabase, proposalId);

      return data;
    },
    onSuccess: async (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
      // The FF&E Schedule builder and Scope Builder summary read their own
      // query keys; invalidate them so the schedule + summary tiles refresh
      // immediately after add/update/remove (mirrors useConsumeCapture).
      queryClient.invalidateQueries({ queryKey: ['proposal-items-schedule', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
      await invalidateProposalClientQueries(queryClient, proposalId);
    },
  });
}

/**
 * Update a proposal item
 */
export function useUpdateProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      itemId,
      proposalId,
      updates,
    }: {
      itemId: string;
      proposalId: string;
      updates: Partial<
        Pick<
          ProposalItem,
          | 'quantity'
          | 'unit_price'
          | 'notes'
          | 'name'
          | 'description'
          | 'item_type'
          | 'scope_room_id'
          | 'budget_min_cents'
          | 'budget_max_cents'
          | 'ffe_category'
          | 'product_id'
          | 'vendor_name'
          | 'category'
          | 'doc_code'
          | 'lead_time_weeks'
          | 'internal_notes'
          // S² Wave 2: financial lens (bulk markup writes client price + markup)
          // and S6 custom field values. line_total_cents is still recomputed
          // below from the merged unit_sell_price, so passing unit_sell_price
          // (with no unit_price) folds through correctly.
          | 'unit_sell_price'
          | 'markup_percent'
          | 'custom_fields'
        >
      >;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Fetch the current row so line_total_cents can be recomputed from the
      // merged values — mirrors useAddProposalItem (allowance → budget midpoint,
      // otherwise quantity × sell price). Without this, editing an allowance's
      // range or an item's quantity would leave the stored cost (and the
      // proposal total) stale.
      const { data: current, error: currentError } = await supabase
        .from('proposal_items')
        .select('item_type, quantity, unit_price, unit_sell_price, budget_min_cents, budget_max_cents')
        .eq('id', itemId)
        .single();
      if (currentError) throw currentError;

      const merged = { ...current, ...updates };
      const mergedType = merged.item_type ?? 'fixed';
      const mergedQty = merged.quantity ?? 1;
      const mergedSell = merged.unit_sell_price ?? merged.unit_price ?? 0;
      const lineTotal =
        mergedType === 'allowance' &&
        typeof merged.budget_min_cents === 'number' &&
        typeof merged.budget_max_cents === 'number'
          ? Math.round((merged.budget_min_cents + merged.budget_max_cents) / 2)
          : mergedQty * mergedSell;

      const payload: Record<string, unknown> = { ...updates, line_total_cents: lineTotal };
      // Keep unit_sell_price in step when the editable unit_price changes
      // (the add path sets sellPrice = unitPrice).
      if (updates.unit_price !== undefined) {
        payload.unit_sell_price = updates.unit_price;
      }

      const { data, error } = await supabase
        .from('proposal_items')
        .update(payload)
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;

      // Update proposal total
      await updateProposalTotal(supabase, proposalId);

      return data;
    },
    onSuccess: async (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
      // Keep the FF&E schedule + scope summary in sync after an edit.
      queryClient.invalidateQueries({ queryKey: ['proposal-items-schedule', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
      await invalidateProposalClientQueries(queryClient, proposalId);
    },
  });
}

/**
 * Remove an item from a proposal
 */
export function useRemoveProposalItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
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
    onSuccess: async (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
      // Keep the FF&E schedule + scope summary in sync after a removal.
      queryClient.invalidateQueries({ queryKey: ['proposal-items-schedule', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
      await invalidateProposalClientQueries(queryClient, proposalId);
    },
  });
}

/**
 * Send a proposal to the client
 *
 * `{ errorSurface: 'inline' }` — see useUpdateProposal (R83).
 */
export function useSendProposal(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      proposalId,
      personalMessage,
      ccEmail,
      validUntil,
      expectedSnapshot,
    }: {
      proposalId: string;
      personalMessage?: string;
      ccEmail?: string;
      validUntil?: string;
      expectedSnapshot: ProposalSendSnapshot;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      if (!expectedSnapshot) {
        throw new Error(
          'Proposal cannot be sent: review the latest client copy before sending.',
        );
      }

      const snapshotBefore = await readProposalSendSnapshot(
        supabase,
        proposalId,
      );
      assertReviewedProposalSnapshot(snapshotBefore, expectedSnapshot);

      // Preflight the exact client-facing payload before stamping the proposal
      // sent. Percentage + the current proposal total are canonical; reconcile
      // their persisted amount projection so every downstream reader (client
      // portal, share route, email follow-up) receives the same schedule.
      const [proposalResult, milestonesResult] = await Promise.all([
        supabase
          .from('proposals')
          .select('total_amount')
          .eq('id', proposalId)
          .single(),
        supabase
          .from('proposal_payment_milestones')
          .select('id, label, percentage, amount_cents, trigger_condition, sort_order')
          .eq('proposal_id', proposalId)
          .order('sort_order', { ascending: true }),
      ]);

      if (proposalResult.error) throw proposalResult.error;
      if (milestonesResult.error) throw milestonesResult.error;
      if (
        Number(proposalResult.data?.total_amount ?? 0) !==
        expectedSnapshot.proposalTotalAmount
      ) {
        throw new Error(REVIEWED_PROPOSAL_CHANGED);
      }

      const reviewedScheduleKey = proposalPaymentScheduleReviewKey(
        milestonesResult.data ?? [],
      );

      const paymentSchedule = assessProposalPaymentSchedule(
        milestonesResult.data ?? [],
        proposalResult.data?.total_amount ?? 0,
      );
      if (!paymentSchedule.safeToSend) {
        throw new Error(
          `Proposal cannot be sent: ${paymentSchedule.issues
            .map((issue) => issue.message)
            .join(' ')}`,
        );
      }

      if (!paymentSchedule.storedAmountsMatch) {
        const reconciliations = paymentSchedule.milestones
          .map((milestone, index) => ({ milestone, index }))
          .filter(
            ({ milestone, index }) =>
              milestone.amount_cents !==
              Number(milestonesResult.data?.[index]?.amount_cents ?? 0),
          )
          .map(async ({ milestone, index }) => {
            if (!milestone.id) {
              throw new Error(
                'Proposal cannot be sent: a payment milestone has no id.',
              );
            }
            const original = milestonesResult.data?.[index];
            if (!original) {
              throw new Error(
                'Proposal cannot be sent: the payment schedule changed while it was being checked.',
              );
            }
            const {
              data: reconciled,
              error: reconciliationError,
            } = await supabase
              .from('proposal_payment_milestones')
              .update({ amount_cents: milestone.amount_cents })
              .eq('id', milestone.id)
              // Compare-and-set: never overwrite a percentage or amount the
              // designer changed after the preflight read.
              .eq('percentage', original.percentage)
              .eq('amount_cents', original.amount_cents)
              .select('id')
              .maybeSingle();
            if (reconciliationError) throw reconciliationError;
            if (!reconciled) {
              throw new Error(
                'Proposal cannot be sent: the payment schedule changed while it was being checked. Review it and send again.',
              );
            }
          });
        await Promise.all(reconciliations);
      }

      // A final fail-closed read proves both the total and every persisted
      // client amount still match after reconciliation. If any concurrent edit
      // landed, do not stamp or notify—return the designer to review instead.
      const [verifiedProposalResult, verifiedMilestonesResult] =
        await Promise.all([
          supabase
            .from('proposals')
            .select('total_amount')
            .eq('id', proposalId)
            .single(),
          supabase
            .from('proposal_payment_milestones')
            .select(
              'id, label, percentage, amount_cents, trigger_condition, sort_order',
            )
            .eq('proposal_id', proposalId)
            .order('sort_order', { ascending: true }),
        ]);
      if (verifiedProposalResult.error) throw verifiedProposalResult.error;
      if (verifiedMilestonesResult.error) throw verifiedMilestonesResult.error;

      const verifiedSchedule = assessProposalPaymentSchedule(
        verifiedMilestonesResult.data ?? [],
        verifiedProposalResult.data?.total_amount ?? 0,
      );
      const snapshotAfter = await readProposalSendSnapshot(
        supabase,
        proposalId,
      );
      assertReviewedProposalSnapshot(snapshotAfter, expectedSnapshot);
      if (
        Number(verifiedProposalResult.data?.total_amount ?? 0) !==
          expectedSnapshot.proposalTotalAmount ||
        proposalPaymentScheduleReviewKey(
          verifiedMilestonesResult.data ?? [],
        ) !== reviewedScheduleKey
      ) {
        throw new Error(REVIEWED_PROPOSAL_CHANGED);
      }
      if (!verifiedSchedule.safeToSend || !verifiedSchedule.storedAmountsMatch) {
        throw new Error(
          'Proposal cannot be sent: the client payment schedule changed while it was being checked. Review it and send again.',
        );
      }

      // send_proposal (00176) flips the target to 'sent' AND atomically
      // supersedes sibling versions in the chain (sent/viewed → 'revised')
      // so a stale version can no longer be signed by the client.
      const { data, error } = await supabase.rpc('send_proposal', {
        p_proposal_id: proposalId,
        p_expected_updated_at: expectedSnapshot.proposalUpdatedAt,
        p_expected_total_amount: expectedSnapshot.proposalTotalAmount,
        p_expected_schedule_fingerprint:
          expectedSnapshot.scheduleFingerprint,
        p_personal_message: personalMessage ?? null,
        p_cc_email: ccEmail ?? null,
        p_valid_until: validUntil ?? null,
      });

      if (error) throw error;

      const hasDispatch =
        typeof data?.sent_at === 'string' &&
        typeof data?.proposal_send_dispatch_id === 'string';
      const delivery = hasDispatch
        ? await invokeProposalSendEdge(supabase, {
            proposalId,
            sentAt: data.sent_at,
            dispatchId: data.proposal_send_dispatch_id,
          })
        : {
            _emailDispatched: false,
            _emailDeliveryState: 'pending' as const,
            _emailRetryable: false,
            _emailDispatchDetail:
              'The proposal send instance was not returned. Refresh before retrying.',
          };

      return { ...data, ...delivery };
    },
    onSuccess: async (_, { proposalId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proposals'] }),
        queryClient.invalidateQueries({
          queryKey: ['proposal-send-dispatch-status', proposalId],
        }),
        // Prefix-match: sending may also have superseded sibling versions, so
        // every cached single-proposal view must refetch (not just the target).
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal-versions'] }),
        queryClient.invalidateQueries({
          queryKey: ['proposal-payment-milestones', proposalId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['proposal-mirror', proposalId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['drafting-facets', proposalId],
        }),
      ]);
    },
  });
}

/** Retry only the durable email outbox. This never calls send_proposal and can
 * safely recover an invocation that never reached the edge function. */
export function useRetryProposalSend(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface
      ? { errorSurface: options.errorSurface }
      : undefined,
    mutationFn: async (input: {
      proposalId: string;
      sentAt: string;
      dispatchId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      return await invokeProposalSendEdge(supabase, input);
    },
    onSuccess: async (_, { proposalId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] }),
        queryClient.invalidateQueries({ queryKey: ['proposals'] }),
        queryClient.invalidateQueries({
          queryKey: ['proposal-send-dispatch-status', proposalId],
        }),
      ]);
    },
  });
}

/**
 * Nudge the client about a sent/viewed proposal — a gentle reminder (R71).
 * Deliberately NOT a re-send: nudge_proposal (00231) only stamps last_nudged_at
 * + bumps nudge_count (never re-stamps sent_at or supersedes siblings), and the
 * proposal-nudge edge function emails a reminder. The RPC enforces ownership,
 * a sent/viewed state, and a 3-day cooldown server-side. Email is best-effort
 * (the stamp already landed) and surfaced via `_emailDispatched`.
 */
export function useNudgeProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ proposalId }: { proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: lastNudgedAt, error } = await supabase.rpc('nudge_proposal', {
        p_proposal_id: proposalId,
      });
      if (error) throw error;

      let emailDispatched = true;
      try {
        const { error: fnError } = await supabase.functions.invoke('proposal-nudge', {
          body: { proposalId },
        });
        if (fnError) emailDispatched = false;
      } catch (e) {
        emailDispatched = false;
        // eslint-disable-next-line no-console
        console.warn('proposal-nudge invocation failed', e);
      }

      return { last_nudged_at: lastNudgedAt as string | null, _emailDispatched: emailDispatched };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal'] });
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      queryClient.invalidateQueries({ queryKey: ['desk-engagements'] });
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
 *
 * Document-surface callers (e.g. the Drafting Room's Terms agreement body)
 * pass `{ errorSurface: 'inline' }` so the designer portal's global mutation
 * onError raises no toast (R83 — the error grammar). Legacy portal callers omit
 * it and keep the toast until the zone dissolve.
 */
export function useUpsertProposalSection(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
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
    onSuccess: async (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-sections', proposalId] });
      await invalidateProposalClientQueries(queryClient, proposalId);
    },
  });
}

/**
 * Delete a proposal section
 */
export function useDeleteProposalSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({ sectionId, proposalId }: { sectionId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('proposal_sections')
        .delete()
        .eq('id', sectionId);

      if (error) throw error;
    },
    onSuccess: async (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-sections', proposalId] });
      await invalidateProposalClientQueries(queryClient, proposalId);
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
 * Mark a sent/viewed (or declined/expired) proposal as 'revised' — the entry
 * point of the revise flow. The RPC is the authoritative lifecycle boundary;
 * a studio writer cannot forge this terminal transition with a table update.
 */
export function useEnterRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ proposalId }: { proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('begin_proposal_revision', {
        p_proposal_id: proposalId,
      });

      if (error) throw error;
      return data as Proposal;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });
}

/**
 * Create a new revision of a proposal (version increment).
 *
 * Backed by the atomic `clone_proposal` RPC (00176), which deep-copies the
 * proposal AND every child table (sections, items, scope rooms, phases,
 * deliverables, gates, milestones, exclusions, change-order terms, team,
 * palettes + swatches) with FK remapping — in one transaction.
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

      const { data: newId, error } = await supabase.rpc('clone_proposal', {
        p_source_id: sourceProposalId,
        p_mode: 'revision',
        p_revision_summary: revisionSummary || null,
      });

      if (error) throw error;

      // Callers expect the full new row (id, version, …).
      const { data: newProposal, error: fetchError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', newId)
        .single();

      if (fetchError) throw fetchError;
      return newProposal as Proposal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-versions'] });
    },
  });
}

/**
 * Duplicate a proposal as a fresh draft (independent of revision chain).
 * Used for the "Duplicate" action — produces version=1, no parent_proposal_id,
 * status='draft', title suffixed with "(Copy)".
 */
export function useDuplicateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceProposalId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Atomic deep copy of the proposal + all child tables (00176).
      const { data: newId, error } = await supabase.rpc('clone_proposal', {
        p_source_id: sourceProposalId,
        p_mode: 'duplicate',
      });

      if (error) throw error;

      const { data: newProposal, error: fetchError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', newId)
        .single();

      if (fetchError) throw fetchError;
      return newProposal as Proposal;
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
 * Sign a proposal (CLIENT action).
 *
 * Backed by the atomic `sign_proposal` RPC (00210 → 00400). In one transaction
 * the RPC:
 *   - settles the linked `client_decisions` approval row (status='responded'),
 *   - flips `proposals.status='accepted'` + the signature fields
 *     (signed_at/signed_by_name/accepted_at; browser RPCs never set signed_ip),
 *   - logs a 'signed' `proposal_engagement` event,
 *   - and activates the project with a server-owned start date.
 * Re-signing an already-'accepted' proposal preserves the original evidence
 * and safely repairs a missing reciprocal project (idempotent).
 *
 * ⚠ AUTH: `sign_proposal` is SECURITY DEFINER but only succeeds when the caller
 * is the proposal's CLIENT (auth.uid() = client_id). It must NOT be invoked from
 * a designer surface — that call will be rejected. This hook is the client sign
 * path only.
 *
 * ⚠ CARRY-FORWARD: the RPC does NOT send the proposal-sign-confirmation email.
 * Any caller adopting this hook MUST still invoke the `proposal-sign-confirmation`
 * edge function afterward (the client-portal `/api/proposals/[id]/sign` route, the
 * current production sign path, still fires that email itself).
 *
 * The browser surface deliberately accepts only proposalId + signedByName.
 * Trusted IP evidence belongs to the service-only production route; callers
 * cannot disable activation or choose the project's start date.
 */
export function useSignProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      signedByName,
    }: {
      proposalId: string;
      signedByName: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('sign_proposal', {
        p_proposal_id: proposalId,
        p_signed_name: signedByName,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
      // The sign settles a client_decisions row and opens the project, so the
      // desk/document surfaces that read those derived views must refetch too.
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      queryClient.invalidateQueries({ queryKey: ['desk-engagements'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({
        queryKey: ['proposal-project', proposalId],
      });
    },
  });
}

/**
 * Record that a client signed a proposal offline (DESIGNER action).
 *
 * Backed by the atomic `record_offline_signature` RPC (00254) — the designer-
 * authorized sibling of `sign_proposal`. For when a client signs a physical
 * contract: in one transaction the RPC settles the approval `client_decisions`
 * row with `client_consent_method='paper'`, flips `proposals.status='accepted'`,
 * logs a 'signed_offline' engagement event, and (with p_auto_activate=true, the
 * default) activates the project — returning its id so we can walk straight in.
 * Recording an already-'accepted' proposal is a no-op (idempotent).
 *
 * ⚠ AUTH: SECURITY DEFINER but only succeeds when the caller is the proposal's
 * DESIGNER (auth.uid() = designer_id). This is the designer offline-sign path.
 * `p_signedDate` seeds the activated project's start date (phase/milestone
 * anchoring), defaulting server-side to today.
 */
export function useRecordOfflineSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      signedByName,
      signedDate,
    }: {
      proposalId: string;
      signedByName: string;
      signedDate?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('record_offline_signature', {
        p_proposal_id: proposalId,
        p_signed_name: signedByName,
        ...(signedDate ? { p_start_date: signedDate } : {}),
      });

      if (error) throw error;
      return data as string | null; // the activated project id
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
      // One act, many surfaces: an approval decision settles, the proposal flips
      // to accepted, and the project activates — the desk/document read models
      // and the project lists must all refetch.
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      queryClient.invalidateQueries({ queryKey: ['desk-engagements'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['proposal-project', proposalId] });
    },
  });
}

/**
 * Request changes to a proposal (CLIENT action).
 *
 * Backed by the `request_proposal_change` RPC (00211). The RPC records the
 * client's feedback on `proposals.client_feedback` WITHOUT terminating the
 * proposal's status (it stays sent/viewed so the designer can revise in place),
 * and logs a 'change_requested' `proposal_engagement` event.
 *
 * ⚠ AUTH: SECURITY DEFINER, but client-invoked — succeeds only for the
 * proposal's CLIENT (auth.uid() = client_id).
 */
export function useRequestProposalChange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      feedback,
    }: {
      proposalId: string;
      feedback: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase.rpc('request_proposal_change', {
        p_proposal_id: proposalId,
        p_feedback: feedback.trim(),
      });

      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      // The feedback lands as a 'change_requested' engagement event, so the
      // engagement timeline and desk/document surfaces should refetch.
      queryClient.invalidateQueries({ queryKey: ['proposal-engagement', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
    },
  });
}

/**
 * Client declines a proposal with optional reason through the canonical,
 * row-locked lifecycle RPC.
 */
export function useDeclineProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      proposalId,
      reason,
    }: {
      proposalId: string;
      reason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('decline_proposal', {
        p_proposal_id: proposalId,
        p_reason: reason?.trim() || null,
      });

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

// updateProposalTotal lives in ../lib/proposal-total so the phase mutations in
// use-scope-builder.ts can reuse the exact same calculation (FF&E line totals +
// design phase fees) without a circular import.
