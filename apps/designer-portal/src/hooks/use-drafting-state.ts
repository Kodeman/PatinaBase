'use client';

/**
 * useDraftingState — the proposal's drafting progress, shared between the
 * Drafting Room (which composes it) and the open document's proposal
 * instruments (which echo it to weight "Draft" vs "Send").
 *
 * It owns the eight-facet composite read (lifted out of drafting-room.tsx) under
 * the SAME queryKey `['drafting-facets', proposalId]`, so the Room's 2s
 * focused-poll and the FF&E type-cycle chip's direct invalidation keep both
 * surfaces in lockstep. Derived fields (fill / pct / state / gaps) come from the
 * pure helpers in lib/document/drafting-progress.ts — never a second source of
 * truth for "how far along".
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, type ProposalItemType } from '@patina/supabase';
import {
  draftingFill,
  draftingPct,
  draftingStateLabel,
  draftingGaps,
  type DraftingFacets,
  type DraftingStateLabel,
} from '@/lib/document/drafting-progress';

export interface DraftingSummary {
  rooms: number;
  ffe: number;
  palettes: number;
  boards: number;
  phases: number;
  exclusions: number;
  payments: number;
  swatches: number;
  coTerms: boolean;
}

export interface DraftingItem {
  id: string;
  name: string;
  item_type: ProposalItemType | null;
  scope_room_id: string | null;
}

export interface FacetRead {
  facets: DraftingFacets;
  summary: DraftingSummary;
  items: DraftingItem[];
}

export interface DraftingState {
  /** raw facet booleans (all false until loaded) */
  facets: DraftingFacets;
  /** per-facet counts for the Room's status lines (undefined until loaded) */
  summary: DraftingSummary | undefined;
  /** FF&E pieces — drives the Room's tap-to-cycle type chips */
  items: DraftingItem[];
  /** [line1, line2, line3] Strata Mark fill fractions */
  fill: [number, number, number];
  /** 0–100 overall */
  pct: number;
  /** Outline → Drafting → Ready to send */
  state: DraftingStateLabel;
  /** what's still open, in plain words */
  gaps: string[];
  isLoading: boolean;
  /** A background reconciliation is running after an editor write. */
  isRefreshing: boolean;
}

const EMPTY_FACETS: DraftingFacets = {
  rooms: false,
  ffe: false,
  phases: false,
  exclusions: false,
  payments: false,
  terms: false,
  palette: false,
  boards: false,
};

/**
 * The facets composite read — the ONLY thing the Room reads itself (the legacy
 * editors own their own reads/writes). Reads eight child tables; the embedded
 * editors mutate through their own keys, so a gentle focused-only poll keeps the
 * Strata Mark, facet ticks, and FF&E type chips live as the designer composes.
 */
function useFacetRead(proposalId: string, enabled: boolean) {
  return useQuery<FacetRead>({
    queryKey: ['drafting-facets', proposalId],
    enabled: !!proposalId && enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const [
        { data: rooms },
        { data: items },
        { data: palettes },
        { data: boards },
        { data: phases },
        { data: exclusions },
        { data: payments },
        { data: coTerms },
      ] = await Promise.all([
        supabase.from('proposal_scope_rooms').select('id').eq('proposal_id', proposalId),
        supabase
          .from('proposal_items')
          .select('id, name, item_type, scope_room_id, position')
          .eq('proposal_id', proposalId)
          .order('position', { ascending: true }),
        supabase
          .from('proposal_palettes')
          .select('id, swatches:palette_swatches(id)')
          .eq('proposal_id', proposalId),
        supabase.from('proposal_boards').select('id, proposal_board_items(count)').eq('proposal_id', proposalId),
        supabase.from('proposal_phases').select('id').eq('proposal_id', proposalId),
        supabase.from('proposal_exclusions').select('id').eq('proposal_id', proposalId),
        supabase.from('proposal_payment_milestones').select('id').eq('proposal_id', proposalId),
        supabase
          .from('proposal_change_order_terms')
          .select('process_description')
          .eq('proposal_id', proposalId)
          .maybeSingle(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const palRows = (palettes ?? []) as any[];
      const swatches = palRows.reduce((n: number, p: { swatches?: unknown[] }) => n + (p.swatches?.length ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boardRows = (boards ?? []) as any[];
      const boardsWithItems = boardRows.filter((b) => (b.proposal_board_items?.[0]?.count ?? 0) > 0).length;
      const coWritten = !!(coTerms as { process_description?: string } | null)?.process_description?.trim();

      const summary: DraftingSummary = {
        rooms: (rooms ?? []).length,
        ffe: (items ?? []).length,
        palettes: palRows.length,
        boards: boardsWithItems,
        phases: (phases ?? []).length,
        exclusions: (exclusions ?? []).length,
        payments: (payments ?? []).length,
        swatches,
        coTerms: coWritten,
      };

      const facets: DraftingFacets = {
        rooms: summary.rooms > 0,
        ffe: summary.ffe > 0,
        phases: summary.phases > 0,
        exclusions: summary.exclusions > 0,
        payments: summary.payments > 0,
        terms: summary.coTerms,
        palette: summary.swatches > 0,
        boards: summary.boards > 0,
      };

      return {
        facets,
        summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (items ?? []) as any[],
      };
    },
  });
}

export function useDraftingState(proposalId: string, enabled = true): DraftingState {
  const { data: read, isLoading, isFetching } = useFacetRead(proposalId, enabled);

  const facets = read?.facets ?? EMPTY_FACETS;
  const fill = draftingFill(facets);
  const pct = draftingPct(fill);
  const state = draftingStateLabel(pct);
  const gaps = draftingGaps(facets);

  return {
    facets,
    summary: read?.summary,
    items: read?.items ?? [],
    fill,
    pct,
    state,
    gaps,
    isLoading,
    isRefreshing: isFetching && !isLoading,
  };
}
