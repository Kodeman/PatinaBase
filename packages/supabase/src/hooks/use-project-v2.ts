import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import { invalidateFfeCaches } from './use-procurement';
import { invalidateProjectWorkflow } from './use-project-workflow';
import { settleScheduleWrite } from './schedule-write-settle';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT V2 (enhanced project with scope data)
// ═══════════════════════════════════════════════════════════════════════════

export function useProjectV2(projectId: string) {
  return useQuery({
    queryKey: ['project-v2', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          designer:profiles!projects_designer_id_fkey(id, full_name, email),
          client:profiles!projects_client_id_fkey(id, full_name, email),
          proposal:proposals!projects_proposal_id_fkey(id, title, status, version, signed_at, signed_by_name, sent_at, created_at, total_amount, designer_client_id)
        `)
        .eq('id', projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT NARRATIVE SECTIONS (00138 — mirror of proposal_sections)
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectNarrativeSection {
  id: string;
  project_id: string;
  source_section_id: string | null;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useProjectNarrativeSections(projectId: string) {
  return useQuery({
    queryKey: ['project-narrative-sections', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_narrative_sections')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectNarrativeSection[];
    },
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT PALETTES (00140 — mirror of proposal_palettes; swatches embedded)
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectPaletteSwatch {
  hex: string;
  name: string | null;
  role: string | null;
  brand: string | null;
  brand_code: string | null;
  paint_color_id: string | null;
  sort_order: number;
}

export interface ProjectPalette {
  id: string;
  project_id: string;
  source_palette_id: string | null;
  scope_room_id: string | null;
  name: string;
  is_primary: boolean;
  source_image_url: string | null;
  notes: string | null;
  swatches: ProjectPaletteSwatch[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useProjectPalettes(projectId: string) {
  return useQuery({
    queryKey: ['project-palettes', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_palettes')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectPalette[];
    },
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT ROOMS
// ═══════════════════════════════════════════════════════════════════════════

export function useProjectRooms(projectId: string) {
  return useQuery({
    queryKey: ['project-rooms', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_rooms')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT FF&E ITEMS
// ═══════════════════════════════════════════════════════════════════════════

export interface FFEItemFilters {
  roomId?: string;
  status?: string;
  itemType?: string;
  purchaseOrderId?: string;
}

export interface FFEItemOptions {
  /**
   * Fetch the extra evidence R7's procurement lifecycle needs: the PO's
   * `delivered_date` and its nested `po_payments`. OFF by default — it adds a
   * second-level embed, and only the designer portal's Document draws the
   * trail. The client portal's FF&E surfaces must not pay for it.
   */
  withLifecycle?: boolean;
}

/** The PO embed, with the lifecycle evidence appended only when asked for. */
function purchaseOrderEmbed(withLifecycle: boolean): string {
  const columns =
    'id, status, vendor_id, vendor_po_number, sidemark, confirmed_eta, acknowledged_at, payment_pattern, created_at, po_number, sent_at';
  return withLifecycle
    ? `purchase_order:purchase_orders!purchase_order_id(${columns}, delivered_date, payments:po_payments(kind, state, due_date, paid_date))`
    : `purchase_order:purchase_orders!purchase_order_id(${columns})`;
}

export function useProjectFFEItems(
  projectId: string,
  filters?: FFEItemFilters,
  options?: FFEItemOptions,
) {
  const withLifecycle = options?.withLifecycle ?? false;
  return useQuery({
    // The shape of the row differs, so the cache entry must too — otherwise a
    // lifecycle-less fetch would serve a trail-drawing caller a PO with no
    // payments and the trail would silently under-report.
    queryKey: ['project-ffe-items', projectId, filters, { withLifecycle }],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase
        .from('project_ffe_items')
        .select(`
          *,
          room:project_rooms!project_room_id(id, name),
          product:products!product_id(id, name, images, brand),
          blocking_decision:client_decisions!blocked_by_decision_id(id, status, due_date),
          item_claims:damage_claims!ffe_item_id(id, state, created_at),
          spec:project_ffe_specs!project_ffe_specs_ffe_item_id_fkey(
            readiness_status,
            configuration_id, configuration_snapshot,
            configuration_snapshot_hash, configuration_locked_at
          ),
          ${purchaseOrderEmbed(withLifecycle)}
        `)
        .eq('project_id', projectId)
        .is('removed_at', null)
        .order('sort_order', { ascending: true });

      if (filters?.roomId) query = query.eq('project_room_id', filters.roomId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.itemType) query = query.eq('item_type', filters.itemType);
      if (filters?.purchaseOrderId) query = query.eq('purchase_order_id', filters.purchaseOrderId);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useUpdateFFEItemStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (_input: {
      itemId: string;
      projectId: string;
      status: string;
      poNumber?: string;
      eta?: string;
      vendorName?: string;
      unitPriceCents?: number;
    }) => {
      throw new Error(
        'FF&E logistics changes are RPC-only; use the lifecycle or purchase-order change workflow.',
      );
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
      // Prefix-invalidate the portal's ['projects', id, ...] namespace so that
      // a stage change (card dropdown, drawer, bulk advance) refreshes the
      // financials, key-metrics, and project-detail rollups. FF&E item rows are
      // already covered by ['project-ffe-items', projectId] above; the prefix
      // sweep here targets the rollup queries that live under
      // ['projects', id, 'financials'/'key-metrics'/detail].
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      // The cross-project By Status view (use-procurement.ts
      // useProcurementItems) keys items under ['procurement-items', filters];
      // a manual stage change must reach it too or that view serves stale
      // stages until the next window focus.
      queryClient.invalidateQueries({ queryKey: ['procurement-items'] });
      // unitPriceCents/line_total_cents may have changed (price param) — the
      // package financials cache reads these columns for its rollup.
      queryClient.invalidateQueries({ queryKey: ['project-financials', projectId] });
      void invalidateProjectWorkflow(queryClient, projectId);
    },
  });
}

export interface BulkReassignFfeVendorInput {
  projectId: string;
  /** Selected FF&E item ids — the caller pre-filters PO-linked lines out. */
  itemIds: string[];
  vendorId: string;
  /** Denormalized display name, kept in lockstep with vendor_id (00148). */
  vendorName: string;
}

export interface BulkReassignFfeVendorResult {
  /** Ids the UPDATE actually reached (RLS + PO guard applied server-side). */
  updatedIds: string[];
  /** Requested ids the write did NOT reach — PO-linked or not visible. */
  skippedIds: string[];
}

/**
 * Bulk vendor reassignment for the FF&E board (Schedule & Boards Wave 0B —
 * replaces the "Reassign Vendor" Coming-soon stub, B-07).
 *
 * One UPDATE over the selected ids, guarded by `.is('purchase_order_id',
 * null)`: a line already linked to a PO is ordered — reassigning it is a
 * procurement act (cancel/re-issue the PO), never a bulk edit. The confirm
 * dialog pre-filters those out; the server-side guard re-enforces it against
 * a stale client. `.eq('project_id', …)` is defense-in-depth on top of RLS
 * (the useAssignProductToFfeSlot ownership-scoping pattern).
 *
 * Invalidates the FF&E trio (invalidateFfeCaches: ['project-ffe-items', id],
 * ['projects', id], ['procurement-items']) — the By Vendor groupings on both
 * the project board and the cross-project views re-derive from vendor_id.
 */
export function useBulkReassignFfeVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemIds,
      projectId: _projectId,
      vendorId: _vendorId,
      vendorName: _vendorName,
    }: BulkReassignFfeVendorInput): Promise<BulkReassignFfeVendorResult> => {
      if (itemIds.length === 0) throw new Error('no items selected');
      throw new Error('FF&E vendor changes are RPC-only; use the selection or PO change workflow.');
    },
    onSuccess: (_, { projectId }) => {
      invalidateFfeCaches(queryClient, projectId);
    },
  });
}

export interface UpdateFFEItemPricingInput {
  itemId: string;
  projectId: string;
  /** Vendor (trade) unit cost in cents (00185). `null` clears the value back to unknown. */
  tradePriceCents?: number | null;
  /** Advisory designer markup percent (00185). `null` clears the value. */
  markupPercent?: number | null;
  /**
   * CLIENT unit price in cents. When provided, `line_total_cents` is
   * recomputed as `unitPriceCents × <current row quantity>`.
   */
  unitPriceCents?: number;
  /**
   * Quantity is intentionally NOT accepted: the hook reads the row's current
   * quantity itself (select-then-update), matching useUpdateFFEItemStatus.
   * Quantity edits belong to the portal's useUpdateProjectFFEItem.
   */
  quantity?: never;
}

/**
 * Legacy API retained for source compatibility. FF&E price writes are now
 * command-only so this hook deliberately fails closed before touching data.
 */
export function useUpdateFFEItemPricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (_input: UpdateFFEItemPricingInput) => {
      throw new Error(
        'FF&E pricing changes are RPC-only; use the project selection pricing workflow.',
      );
    },
    onSuccess: (_, { projectId }) => {
      // ['project-ffe-items', projectId] + ['projects', projectId] +
      // ['procurement-items'] — the same trio useUpdateFFEItemStatus sweeps.
      // invalidateFfeCaches' ['projects', projectId] sweep also prefix-invalidates the portal's ['projects', id, 'financials'] key — do not add exact:true there.
      invalidateFfeCaches(queryClient, projectId);
      // The package financials hook keys under its own namespace and its
      // margin rollup reads trade_price_cents/line_total_cents.
      queryClient.invalidateQueries({ queryKey: ['project-financials', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT PHASES
// ═══════════════════════════════════════════════════════════════════════════

export function useProjectPhases(projectId: string) {
  return useQuery({
    queryKey: ['project-phases', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export interface CreateProjectPhaseInput {
  projectId: string;
  phaseKey: string;
  name: string;
  sortOrder?: number;
  /**
   * Chain columns (00323/00324 — Schedule Compose). New lifecycle rows always
   * start pending with zero progress; only advance_project_phase may activate
   * or complete them.
   */
  durationDays?: number;
  anchorDate?: string;
  followsPhaseId?: string;
  lane?: 'main' | 'thread';
}

type ProjectPhaseRow = Database['public']['Tables']['project_phases']['Row'];

function requireProjectPhaseRpcRow(
  value: unknown,
  projectId: string,
  phaseId?: string,
): ProjectPhaseRow {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('project phase RPC returned an invalid row');
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    row.project_id !== projectId ||
    (phaseId !== undefined && row.id !== phaseId) ||
    typeof row.updated_at !== 'string'
  ) {
    throw new Error('project phase RPC returned an invalid row');
  }
  return value as ProjectPhaseRow;
}

export function useCreateProjectPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      phaseKey,
      name,
      sortOrder,
      durationDays,
      anchorDate,
      followsPhaseId,
      lane,
    }: CreateProjectPhaseInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const args: Record<string, unknown> = {
        p_project_id: projectId,
        p_phase_key: phaseKey,
        p_name: name,
      };
      if (sortOrder !== undefined) args.p_sort_order = sortOrder;
      if (durationDays !== undefined) args.p_duration_days = durationDays;
      if (anchorDate !== undefined) args.p_anchor_date = anchorDate;
      if (followsPhaseId !== undefined) args.p_follows_phase_id = followsPhaseId;
      if (lane !== undefined) args.p_lane = lane;
      const { data, error } = await supabase.rpc('create_project_phase', args);
      if (error) throw error;
      const row = requireProjectPhaseRpcRow(data, projectId);
      if (row.status !== 'pending' || row.progress !== 0 || row.completed_at !== null) {
        throw new Error('useCreateProjectPhase: invalid server-derived lifecycle receipt');
      }
      return row;
    },
    onSuccess: (_, { projectId }) => {
      void settleScheduleWrite(queryClient, projectId);
    },
  });
}

export interface ProjectPhaseTransitionInput {
  phaseId: string;
  projectId: string;
  /** Complete the observed in-progress phase, or resume the observed delayed phase. */
  status: 'completed' | 'in_progress';
  /** Compatibility with the prior completion call shape; only 100 is accepted. */
  progress?: number;
}

export interface ProjectPhaseTransitionReceipt {
  completed_phase_id: string | null;
  /** Every exact direct follower activated by completion; resume returns the target. */
  next_phase_ids: string[];
  /** No direct follower on this target branch; never means project closeout. */
  terminal: boolean;
}

function isProjectPhaseTransitionReceipt(
  value: unknown,
): value is ProjectPhaseTransitionReceipt {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  const keys = Object.keys(receipt).sort();
  return (
    keys.length === 3 &&
    keys[0] === 'completed_phase_id' &&
    keys[1] === 'next_phase_ids' &&
    keys[2] === 'terminal' &&
    (receipt.completed_phase_id === null || typeof receipt.completed_phase_id === 'string') &&
    Array.isArray(receipt.next_phase_ids) &&
    receipt.next_phase_ids.every((phaseId) => typeof phaseId === 'string') &&
    typeof receipt.terminal === 'boolean'
  );
}

export function useUpdateProjectPhaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      projectId,
      status,
      progress,
    }: ProjectPhaseTransitionInput): Promise<ProjectPhaseTransitionReceipt> => {
      if (!phaseId || !projectId) {
        throw new Error('useUpdateProjectPhaseStatus: projectId and phaseId are required');
      }

      let expectedStatus: 'in_progress' | 'delayed';
      if (status === 'completed') {
        if (progress !== undefined && progress !== 100) {
          throw new Error(
            'useUpdateProjectPhaseStatus: completion progress must be 100 when provided',
          );
        }
        expectedStatus = 'in_progress';
      } else if (status === 'in_progress') {
        if (progress !== undefined) {
          throw new Error('useUpdateProjectPhaseStatus: resume does not accept progress');
        }
        expectedStatus = 'delayed';
      } else {
        throw new Error(
          'useUpdateProjectPhaseStatus: status must be completed or in_progress',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('advance_project_phase', {
        p_project_id: projectId,
        p_phase_id: phaseId,
        p_expected_status: expectedStatus,
      });
      if (error) throw error;
      if (!isProjectPhaseTransitionReceipt(data)) {
        throw new Error('useUpdateProjectPhaseStatus: invalid transition receipt');
      }
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      void invalidateProjectWorkflow(queryClient, projectId);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT PAYMENT MILESTONES
// ═══════════════════════════════════════════════════════════════════════════

export function useProjectPaymentMilestones(projectId: string) {
  return useQuery({
    queryKey: ['project-payment-milestones', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_payment_milestones')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useUpdatePaymentMilestoneStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
      projectId,
      status,
      dueDate,
    }: {
      milestoneId: string;
      projectId: string;
      status: string;
      dueDate?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const updates: Record<string, unknown> = { status };
      // Stamp paid_at on paid; clear it when a milestone moves back to a
      // non-paid status (Mark due / Mark unpaid) so the date doesn't linger.
      updates.paid_at = status === 'paid' ? new Date().toISOString() : null;
      if (dueDate) updates.due_date = dueDate;

      const { data, error } = await supabase
        .from('project_payment_milestones')
        .update(updates)
        .eq('id', milestoneId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-payment-milestones', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT FINANCIALS (computed)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Computed project financial rollup.
 *
 * Margin semantics (00185 dual pricing — kept simple but honest):
 *   - `trade_price_cents` is NULLABLE; user-created rows often have no trade
 *     quote. Margin is therefore computed ONLY over items where trade is set:
 *       marginCents = Σ (line_total_cents − trade_price_cents × quantity)
 *                     over items WHERE trade_price_cents IS NOT NULL
 *   - `tradeTotalCents` = Σ trade_price_cents × quantity over the same subset.
 *   - Both are `null` (not 0) when NO item has trade data — "unknown", never
 *     "zero margin".
 *   - `itemsWithTradeCount` / `totalItemCount` let the UI qualify partial
 *     coverage, e.g. "margin (4 of 6 items)".
 *   - Per-category margin follows the same rule: `marginCents` is null for a
 *     category with no trade-priced items; `itemsWithTradeCount` says how many
 *     of the category's items contributed.
 */
export function useProjectFinancials(projectId: string) {
  return useQuery({
    queryKey: ['project-financials', projectId],
    queryFn: async () => {
      const supabase = getSupabase();

      const [projectRes, roomsRes, itemsRes] = await Promise.all([
        supabase.from('projects').select('budget_cents, total_amount_cents, committed_cents, actual_cents, design_fee_cents').eq('id', projectId).single(),
        supabase.from('project_rooms').select('id, name, budget_cents, committed_cents, actual_cents').eq('project_id', projectId),
        supabase.from('project_ffe_items').select('ffe_category, line_total_cents, status, trade_price_cents, quantity').eq('project_id', projectId),
      ]);

      const project = projectRes.data;
      const rooms = roomsRes.data ?? [];
      const items = itemsRes.data ?? [];

      // Aggregate by category
      const categoryMap = new Map<
        string,
        { budget: number; committed: number; actual: number; margin: number; withTrade: number }
      >();
      let tradeTotalCents = 0;
      let marginCents = 0;
      let itemsWithTradeCount = 0;
      for (const item of items) {
        const cat = item.ffe_category || 'Uncategorized';
        const existing =
          categoryMap.get(cat) || { budget: 0, committed: 0, actual: 0, margin: 0, withTrade: 0 };
        existing.budget += item.line_total_cents || 0;
        if (['ordered', 'production', 'shipped', 'delivered', 'installed'].includes(item.status)) {
          existing.committed += item.line_total_cents || 0;
        }
        if (['delivered', 'installed'].includes(item.status)) {
          existing.actual += item.line_total_cents || 0;
        }
        // Margin only over items with a known trade cost (00185 — see JSDoc).
        if (item.trade_price_cents !== null && item.trade_price_cents !== undefined) {
          const tradeLine = item.trade_price_cents * (item.quantity ?? 1);
          const itemMargin = (item.line_total_cents || 0) - tradeLine;
          tradeTotalCents += tradeLine;
          marginCents += itemMargin;
          itemsWithTradeCount += 1;
          existing.margin += itemMargin;
          existing.withTrade += 1;
        }
        categoryMap.set(cat, existing);
      }

      return {
        budgetCents: project?.budget_cents || 0,
        totalAmountCents: project?.total_amount_cents ?? project?.budget_cents ?? 0,
        committedCents: project?.committed_cents || 0,
        actualCents: project?.actual_cents || 0,
        designFeeCents: project?.design_fee_cents || 0,
        varianceCents: (project?.budget_cents || 0) - (project?.actual_cents || 0),
        // 00185 dual pricing — null = "no trade data", never "zero margin".
        tradeTotalCents: itemsWithTradeCount > 0 ? tradeTotalCents : null,
        marginCents: itemsWithTradeCount > 0 ? marginCents : null,
        itemsWithTradeCount,
        totalItemCount: items.length,
        byRoom: rooms.map((r) => ({
          roomId: r.id,
          roomName: r.name,
          budgetCents: r.budget_cents ?? 0,
          committedCents: r.committed_cents || 0,
          actualCents: r.actual_cents || 0,
        })),
        byCategory: Array.from(categoryMap.entries()).map(([category, stats]) => ({
          category,
          budgetCents: stats.budget,
          committedCents: stats.committed,
          actualCents: stats.actual,
          marginCents: stats.withTrade > 0 ? stats.margin : null,
          itemsWithTradeCount: stats.withTrade,
        })),
      };
    },
    enabled: !!projectId,
  });
}
