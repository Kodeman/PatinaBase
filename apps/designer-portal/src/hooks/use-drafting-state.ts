'use client';

/**
 * useDraftingState — the proposal's drafting progress, shared between the
 * Drafting Room (which composes it) and the open document's proposal
 * instruments (which echo it to weight "Draft" vs "Send").
 *
 * It owns the eight-facet composite read (lifted out of drafting-room.tsx) under
 * the SAME queryKey `['drafting-facets', proposalId]`, so direct invalidations
 * from each editor keep both surfaces in lockstep. Derived fields (fill / pct /
 * state / gaps) come from the pure helpers in
 * lib/document/drafting-progress.ts — never a second source of truth for "how
 * far along".
 */

import { useCallback } from 'react';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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

export interface DraftingEstimate {
  sectionId: string | null;
  estimatedHours: number | null;
}

type DraftingEstimateRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

const draftingEstimateKey = (proposalId: string) => [
  'drafting-estimate',
  proposalId,
] as const;

export function readDraftingEstimatedHours(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as Record<string, unknown>).estimated_hours;
  const value =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapDraftingEstimate(row: DraftingEstimateRow | null): DraftingEstimate {
  return {
    sectionId: row?.id ?? null,
    estimatedHours: readDraftingEstimatedHours(row?.metadata),
  };
}

export function useDraftingEstimate(proposalId: string, enabled = true) {
  return useQuery<DraftingEstimate>({
    queryKey: draftingEstimateKey(proposalId),
    enabled: !!proposalId && enabled,
    queryFn: async () => {
      const supabase = createBrowserClient() as any;
      const { data, error } = await supabase
        .from('proposal_sections')
        .select('id, metadata')
        .eq('proposal_id', proposalId)
        .eq('type', 'investment')
        .maybeSingle();

      if (error) throw error;
      return mapDraftingEstimate(data as DraftingEstimateRow | null);
    },
  });
}

export function useSaveDraftingEstimate() {
  const queryClient = useQueryClient();

  return useMutation<
    DraftingEstimate,
    Error,
    { proposalId: string; estimatedHours: number | null }
  >({
    meta: { errorSurface: 'inline' },
    mutationFn: async ({ proposalId, estimatedHours }) => {
      if (
        estimatedHours !== null &&
        (!Number.isFinite(estimatedHours) || estimatedHours <= 0)
      ) {
        throw new Error('Estimated hours must be greater than zero.');
      }

      const supabase = createBrowserClient() as any;
      const { data: existing, error: readError } = await supabase
        .from('proposal_sections')
        .select('id, metadata')
        .eq('proposal_id', proposalId)
        .eq('type', 'investment')
        .maybeSingle();

      if (readError) throw readError;

      const metadata = {
        ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
        estimated_hours: estimatedHours,
      };
      const updatedAt = new Date().toISOString();

      const result = existing?.id
        ? await supabase
            .from('proposal_sections')
            .update({ metadata, updated_at: updatedAt })
            .eq('id', existing.id)
            .select('id, metadata')
            .single()
        : await supabase
            .from('proposal_sections')
            .insert({
              proposal_id: proposalId,
              type: 'investment',
              title: 'Investment',
              body: null,
              metadata,
              sort_order: 4,
              created_at: updatedAt,
              updated_at: updatedAt,
            })
            .select('id, metadata')
            .single();

      if (result.error) throw result.error;
      return mapDraftingEstimate(result.data as DraftingEstimateRow);
    },
    onSuccess: (estimate, { proposalId }) => {
      queryClient.setQueryData(draftingEstimateKey(proposalId), estimate);
      void queryClient.invalidateQueries({
        queryKey: ['proposal-sections', proposalId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['proposal-mirror', proposalId],
      });
    },
  });
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
  /** Any canonical facet read currently in flight. Safe for button gating;
   * unlike mutation feedback, this is never announced as a user write. */
  isFetching: boolean;
  /** Canonical facet reads fail closed; callers must not treat unavailable
   * rows as an intentionally incomplete draft. */
  error: Error | null;
  /** Reconcile every persisted facet, then derive completeness from that fresh
   * response so callers never have to inspect a stale render closure. */
  refresh: () => Promise<DraftingRefreshResult>;
}

export interface DraftingRefreshResult {
  facets: DraftingFacets;
  state: DraftingStateLabel;
  gaps: string[];
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
 * editors own their own reads/writes). Reads eight child tables. Every owned
 * editor invalidates this key after a successful mutation; focus reconciliation
 * remains as a safety net for writes from another tab.
 */
function useFacetRead(proposalId: string, enabled: boolean) {
  return useQuery<FacetRead>({
    queryKey: ['drafting-facets', proposalId],
    enabled: !!proposalId && enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const supabase = createBrowserClient() as any;
      const results = await Promise.all([
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

      const failed = results.find((result: { error?: unknown }) => result.error);
      if (failed?.error) throw failed.error;

      const [
        { data: rooms },
        { data: items },
        { data: palettes },
        { data: boards },
        { data: phases },
        { data: exclusions },
        { data: payments },
        { data: coTerms },
      ] = results;

      const palRows = (palettes ?? []) as any[];
      const swatches = palRows.reduce((n: number, p: { swatches?: unknown[] }) => n + (p.swatches?.length ?? 0), 0);
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
        items: (items ?? []) as any[],
      };
    },
  });
}

export function useDraftingState(proposalId: string, enabled = true): DraftingState {
  const { data: read, isLoading, isFetching, error, refetch } = useFacetRead(proposalId, enabled);

  const facets = read?.facets ?? EMPTY_FACETS;
  const fill = draftingFill(facets);
  const pct = draftingPct(fill);
  const state = draftingStateLabel(pct);
  const gaps = draftingGaps(facets);

  const refresh = useCallback(async (): Promise<DraftingRefreshResult> => {
    const result = await refetch({ throwOnError: true });
    const freshFacets = result.data?.facets ?? EMPTY_FACETS;
    return {
      facets: freshFacets,
      state: draftingStateLabel(draftingPct(draftingFill(freshFacets))),
      gaps: draftingGaps(freshFacets),
    };
  }, [refetch]);

  return {
    facets,
    summary: read?.summary,
    items: read?.items ?? [],
    fill,
    pct,
    state,
    gaps,
    isLoading,
    isFetching,
    error: error instanceof Error ? error : error ? new Error('Proposal readiness could not be verified') : null,
    refresh,
  };
}

/**
 * Explicit proposal writes only. Query refetches never enter TanStack's
 * mutation cache and are therefore deliberately silent to assistive
 * technology.
 */
export function useDraftingWritesPending(proposalId: string): boolean {
  const pending = useIsMutating({
    predicate: (mutation) => {
      const variables = mutation.state.variables;
      return (
        typeof variables === 'object' &&
        variables !== null &&
        'proposalId' in variables &&
        (variables as { proposalId?: unknown }).proposalId === proposalId
      );
    },
  });
  return pending > 0;
}
