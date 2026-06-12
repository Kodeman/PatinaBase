/**
 * The Account Page (R26) — engagement-scoped money IN the document, under
 * the ledger rule. Pure aggregation over shipped rows: projects money
 * columns (00139 contract), project_rooms allocations (R25 — one source),
 * FF&E dual pricing (00185), project_payment_milestones + trigger config
 * (00204). Studio eyes only — excluded from the client mirror (CI test).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { invalidateMarginSurfaces } from './use-margin-items';

const getSupabase = () => createBrowserClient() as any;

export interface AccountMilestone {
  id: string;
  label: string;
  percentage: number;
  amount_cents: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  trigger_kind: 'on_signing' | 'on_production_start' | 'on_section_settled' | 'on_date' | null;
  trigger_section_key: SectionKey | null;
  invoice_id: string | null;
  sort_order: number;
}

interface ItemSlice {
  line_total_cents: number | null;
  trade_price_cents: number | null;
  unit_price_cents: number | null;
  quantity: number;
  status: string;
  project_room_id: string | null;
  item_type: string | null;
}

export interface RoomVariance {
  roomId: string | null;
  roomName: string;
  allocatedCents: number;
  committedCents: number;
  varianceCents: number; // allocated - committed; >= 0 renders sage, < 0 terracotta
  categories: { name: string; committedCents: number }[];
}

export interface AccountPageData {
  budgetCents: number;
  totalAmountCents: number;
  designFeeCents: number;
  committedCents: number;
  /** Client-side value of committed lines (unit price × qty). */
  clientValueCents: number;
  /** Trade cost of committed lines that carry one. */
  tradeCostCents: number;
  /** Lines carrying a trade cost, of all lines — the coverage note. */
  tradeCoverage: { withTrade: number; total: number };
  marginPct: number | null;
  estCommissionCents: number;
  rooms: RoomVariance[];
  milestones: AccountMilestone[];
}

const COMMITTED_STATUSES = new Set([
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
]);

export function useAccountPage(projectId: string | null) {
  return useQuery<AccountPageData>({
    queryKey: ['account-page', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const supabase = getSupabase();
      const [{ data: project, error: pErr }, { data: items, error: iErr }, { data: rooms, error: rErr }, { data: milestones, error: mErr }] =
        await Promise.all([
          supabase
            .from('projects')
            .select('budget_cents, total_amount_cents, design_fee_cents')
            .eq('id', projectId)
            .single(),
          supabase
            .from('project_ffe_items')
            .select('line_total_cents, trade_price_cents, unit_price_cents, quantity, status, project_room_id, item_type')
            .eq('project_id', projectId),
          supabase
            .from('project_rooms')
            .select('id, name, budget_cents, sort_order')
            .eq('project_id', projectId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('project_payment_milestones')
            .select('id, label, percentage, amount_cents, status, due_date, paid_at, trigger_kind, trigger_section_key, invoice_id, sort_order')
            .eq('project_id', projectId)
            .order('sort_order', { ascending: true }),
        ]);
      if (pErr) throw pErr;
      if (iErr) throw iErr;
      if (rErr) throw rErr;
      if (mErr) throw mErr;

      const all = (items ?? []) as ItemSlice[];
      const committed = all.filter((i) => COMMITTED_STATUSES.has(i.status));

      const committedCents = committed.reduce((s, i) => s + (i.line_total_cents ?? 0), 0);
      const withTrade = committed.filter((i) => i.trade_price_cents != null);
      const clientValueCents = withTrade.reduce(
        (s, i) => s + (i.unit_price_cents ?? 0) * (i.quantity ?? 1),
        0,
      );
      const tradeCostCents = withTrade.reduce(
        (s, i) => s + (i.trade_price_cents ?? 0) * (i.quantity ?? 1),
        0,
      );
      const marginPct =
        clientValueCents > 0
          ? Math.round(((clientValueCents - tradeCostCents) / clientValueCents) * 100)
          : null;

      const roomRows: RoomVariance[] = [
        ...((rooms ?? []) as any[]).map((room) => {
          const inRoom = committed.filter((i) => i.project_room_id === room.id);
          const roomCommitted = inRoom.reduce((s, i) => s + (i.line_total_cents ?? 0), 0);
          return {
            roomId: room.id as string,
            roomName: room.name as string,
            allocatedCents: (room.budget_cents as number) ?? 0,
            committedCents: roomCommitted,
            varianceCents: ((room.budget_cents as number) ?? 0) - roomCommitted,
            categories: categorize(inRoom),
          };
        }),
      ];
      const unassigned = committed.filter(
        (i) => !i.project_room_id || !roomRows.some((r) => r.roomId === i.project_room_id),
      );
      if (unassigned.length > 0) {
        const c = unassigned.reduce((s, i) => s + (i.line_total_cents ?? 0), 0);
        roomRows.push({
          roomId: null,
          roomName: 'Throughout',
          allocatedCents: 0,
          committedCents: c,
          varianceCents: -c,
          categories: categorize(unassigned),
        });
      }

      return {
        budgetCents: project?.budget_cents ?? 0,
        totalAmountCents: project?.total_amount_cents ?? project?.budget_cents ?? 0,
        designFeeCents: project?.design_fee_cents ?? 0,
        committedCents,
        clientValueCents,
        tradeCostCents,
        tradeCoverage: { withTrade: withTrade.length, total: committed.length },
        marginPct,
        estCommissionCents: Math.max(0, clientValueCents - tradeCostCents),
        rooms: roomRows,
        milestones: (milestones ?? []) as AccountMilestone[],
      };
    },
  });
}

function categorize(items: ItemSlice[]): { name: string; committedCents: number }[] {
  const map = new Map<string, number>();
  for (const i of items) {
    const key = i.item_type ?? 'other';
    map.set(key, (map.get(key) ?? 0) + (i.line_total_cents ?? 0));
  }
  return [...map.entries()]
    .map(([name, committedCents]) => ({ name, committedCents }))
    .sort((a, b) => b.committedCents - a.committedCents);
}

export function useUpdateMilestoneTrigger(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      milestoneId: string;
      triggerKind: AccountMilestone['trigger_kind'];
      triggerSectionKey?: SectionKey | null;
      dueDate?: string | null;
    }) => {
      const { error } = await getSupabase()
        .from('project_payment_milestones')
        .update({
          trigger_kind: input.triggerKind,
          trigger_section_key:
            input.triggerKind === 'on_section_settled' ? (input.triggerSectionKey ?? null) : null,
          ...(input.triggerKind === 'on_date' ? { due_date: input.dueDate ?? null } : {}),
        })
        .eq('id', input.milestoneId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['account-page', projectId] });
    },
  });
}

/** The Generate-invoice act: drafts into the Money margin (review-then-send). */
export function useGenerateMilestoneInvoice(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (milestoneId: string) => {
      const { data, error } = await getSupabase().rpc('generate_milestone_invoice', {
        p_milestone_id: milestoneId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['account-page', projectId] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      invalidateMarginSurfaces(qc, projectId);
    },
  });
}

/** Export (R26): the procurement QBO exporter, reused — CSV download. */
export async function exportAccountsQbo(projectId: string): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabase();
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase.functions.invoke('qbo-export', {
    body: {
      dateStart: start,
      dateEnd: end,
      includePaid: true,
      includeOutstanding: true,
      projectIds: [projectId],
    },
  });
  if (error) return { ok: false, message: error.message ?? 'Export failed' };
  const csv = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `patina-vendor-bills-${end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, message: 'Exported' };
}
