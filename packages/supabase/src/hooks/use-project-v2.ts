import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

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
          proposal:proposals!projects_proposal_id_fkey(id, title, signed_at)
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
}

export function useProjectFFEItems(projectId: string, filters?: FFEItemFilters) {
  return useQuery({
    queryKey: ['project-ffe-items', projectId, filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase
        .from('project_ffe_items')
        .select(`
          *,
          room:project_rooms!project_room_id(id, name),
          product:products!product_id(id, name, images, brand)
        `)
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });

      if (filters?.roomId) query = query.eq('project_room_id', filters.roomId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.itemType) query = query.eq('item_type', filters.itemType);

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
    mutationFn: async ({
      itemId,
      projectId,
      status,
      poNumber,
      eta,
      vendorName,
      unitPriceCents,
    }: {
      itemId: string;
      projectId: string;
      status: string;
      poNumber?: string;
      eta?: string;
      vendorName?: string;
      unitPriceCents?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const updates: Record<string, unknown> = { status };
      if (poNumber !== undefined) updates.po_number = poNumber;
      if (eta !== undefined) updates.eta = eta;
      if (vendorName !== undefined) updates.vendor_name = vendorName;
      if (unitPriceCents !== undefined) {
        updates.unit_price_cents = unitPriceCents;
        // Recalculate line total
        const { data: item } = await supabase
          .from('project_ffe_items')
          .select('quantity')
          .eq('id', itemId)
          .single();
        if (item) updates.line_total_cents = unitPriceCents * item.quantity;
      }

      const { data, error } = await supabase
        .from('project_ffe_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
      // The designer-portal FF&E board reads items via the portal namespace
      // (queryKeys.projects.* → ['projects', id, 'ffe-items'/'financials'/
      // 'key-metrics'/detail]). This prefix invalidates all of them so a stage
      // change (card dropdown, drawer, bulk advance) refreshes the board — the
      // package keys above don't prefix-match the portal ones.
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
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

export function useCreateProjectPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      phaseKey,
      name,
      sortOrder,
      status = 'pending',
    }: {
      projectId: string;
      phaseKey: string;
      name: string;
      sortOrder?: number;
      status?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const insert: Record<string, unknown> = {
        project_id: projectId,
        phase_key: phaseKey,
        name,
        status,
      };
      if (sortOrder !== undefined) insert.sort_order = sortOrder;
      const { data, error } = await supabase
        .from('project_phases')
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    },
  });
}

export function useUpdateProjectPhaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      projectId,
      status,
      progress,
    }: {
      phaseId: string;
      projectId: string;
      status?: string;
      progress?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const updates: Record<string, unknown> = {};
      if (status) {
        updates.status = status;
        if (status === 'completed') updates.completed_at = new Date().toISOString();
      }
      if (progress !== undefined) updates.progress = progress;

      const { data, error } = await supabase
        .from('project_phases')
        .update(updates)
        .eq('id', phaseId)
        .select()
        .single();
      if (error) throw error;

      // Update project current_phase if advancing
      if (status === 'completed') {
        const { data: nextPhase } = await supabase
          .from('project_phases')
          .select('phase_key')
          .eq('project_id', projectId)
          .eq('status', 'pending')
          .order('sort_order', { ascending: true })
          .limit(1);

        if (nextPhase?.[0]) {
          await supabase
            .from('project_phases')
            .update({ status: 'in_progress' })
            .eq('project_id', projectId)
            .eq('phase_key', nextPhase[0].phase_key);

          await supabase
            .from('projects')
            .update({ current_phase: nextPhase[0].phase_key })
            .eq('id', projectId);
        }
      }

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
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

export function useProjectFinancials(projectId: string) {
  return useQuery({
    queryKey: ['project-financials', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const [projectRes, roomsRes, itemsRes] = await Promise.all([
        supabase.from('projects').select('budget_cents, total_amount_cents, committed_cents, actual_cents, design_fee_cents').eq('id', projectId).single(),
        supabase.from('project_rooms').select('id, name, budget_cents, committed_cents, actual_cents').eq('project_id', projectId),
        supabase.from('project_ffe_items').select('ffe_category, line_total_cents, status').eq('project_id', projectId),
      ]);

      const project = projectRes.data;
      const rooms = roomsRes.data ?? [];
      const items = itemsRes.data ?? [];

      // Aggregate by category
      const categoryMap = new Map<string, { budget: number; committed: number; actual: number }>();
      for (const item of items) {
        const cat = item.ffe_category || 'Uncategorized';
        const existing = categoryMap.get(cat) || { budget: 0, committed: 0, actual: 0 };
        existing.budget += item.line_total_cents || 0;
        if (['ordered', 'production', 'shipped', 'delivered', 'installed'].includes(item.status)) {
          existing.committed += item.line_total_cents || 0;
        }
        if (['delivered', 'installed'].includes(item.status)) {
          existing.actual += item.line_total_cents || 0;
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
        byRoom: rooms.map((r: { id: string; name: string; budget_cents: number; committed_cents: number; actual_cents: number }) => ({
          roomId: r.id,
          roomName: r.name,
          budgetCents: r.budget_cents,
          committedCents: r.committed_cents || 0,
          actualCents: r.actual_cents || 0,
        })),
        byCategory: Array.from(categoryMap.entries()).map(([category, stats]) => ({
          category,
          budgetCents: stats.budget,
          committedCents: stats.committed,
          actualCents: stats.actual,
        })),
      };
    },
    enabled: !!projectId,
  });
}
