'use client';

// Studio-wide boards status view (board-paths W3c, DV8/DV10). Builds on the
// desk rollup's derivation helpers (board-verdicts.ts): deriveBoardReactionStatus
// for the chip, the same client/guest split summarizeBoardVerdicts already
// established. Bounded — never an unbounded all-boards scan.
//
// Board-paths review (2026-09-01, C4/C9): the first cut selected
// `proposal_boards(...).select('proposal_board_items(verdicts:item_feedback(...),
// directions:board_item_directions(...))')` — an unbounded PostgREST nested
// embed pulling every pin's every feedback/direction ROW for up to `cap`
// boards, with no per-item limit expressible in that shape. This version
// calls `studio_boards_overview` (00550), a SECURITY INVOKER SQL function
// that aggregates server-side (RLS still applies as the calling user) and
// returns exactly one row per board — six verdict counts (client/guest ×
// approved/rejected/comment, already folded to "latest verdict per author"
// the same way latestVerdictByAuthor does) plus one unresolved-direction
// count and one has-active-share flag. No row-per-pin data crosses the wire.
//
// C5: desk-boards-reaction-rollup.tsx's three counts and this page must never
// disagree, so use-board-reaction-rollup.ts now DERIVES its buckets from this
// exact hook/cap rather than running its own independent query — see that
// file. DEFAULT_CAP is exported so both call sites share the identical
// default (and therefore the identical react-query cache key) unless a
// caller explicitly overrides it.

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  deriveBoardReactionStatus,
  emptyBoardVerdictCounts,
  type BoardReactionStatus,
  type BoardVerdictBreakdown,
} from './board-verdicts';

const getSupabase = () => createBrowserClient();

export const DEFAULT_STUDIO_BOARDS_CAP = 60;
export const MAX_STUDIO_BOARDS_CAP = 150;

export interface StudioBoardOverviewEntry {
  id: string;
  name: string;
  ownerKind: 'proposal' | 'project';
  ownerId: string;
  ownerName: string;
  coverImageUrl: string | null;
  updatedAt: string;
  reactionStatus: BoardReactionStatus | null;
  verdicts: BoardVerdictBreakdown;
  /** Count of unresolved internal direction notes across this board's pins
   * (board-paths W3c, DV6) — studio-only, never a client/guest figure. */
  unresolvedDirectionCount: number;
}

export interface StudioBoardsOverview {
  boards: StudioBoardOverviewEntry[];
  /** True when more active boards exist than this bounded read returned. */
  capped: boolean;
}

/** The literal row shape `studio_boards_overview` returns (00550) — bigint
 * aggregate columns arrive as strings over PostgREST/JS, so this is declared
 * rather than cast through `BoardVerdictBreakdown`. */
interface StudioBoardsOverviewRow {
  id: string;
  name: string;
  owner_kind: string;
  owner_id: string;
  owner_name: string;
  cover_image_url: string | null;
  updated_at: string;
  has_active_share: boolean;
  verdict_client_approved: number | string;
  verdict_client_rejected: number | string;
  verdict_client_comment: number | string;
  verdict_guest_approved: number | string;
  verdict_guest_rejected: number | string;
  verdict_guest_comment: number | string;
  unresolved_direction_count: number | string;
}

function toCount(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toVerdicts(row: StudioBoardsOverviewRow): BoardVerdictBreakdown {
  const counts = emptyBoardVerdictCounts();
  counts.bySource.client.approved = toCount(row.verdict_client_approved);
  counts.bySource.client.rejected = toCount(row.verdict_client_rejected);
  counts.bySource.client.comment = toCount(row.verdict_client_comment);
  counts.bySource.client.total =
    counts.bySource.client.approved + counts.bySource.client.rejected + counts.bySource.client.comment;
  counts.bySource.guest.approved = toCount(row.verdict_guest_approved);
  counts.bySource.guest.rejected = toCount(row.verdict_guest_rejected);
  counts.bySource.guest.comment = toCount(row.verdict_guest_comment);
  counts.bySource.guest.total =
    counts.bySource.guest.approved + counts.bySource.guest.rejected + counts.bySource.guest.comment;
  counts.approved = counts.bySource.client.approved + counts.bySource.guest.approved;
  counts.rejected = counts.bySource.client.rejected + counts.bySource.guest.rejected;
  counts.comment = counts.bySource.client.comment + counts.bySource.guest.comment;
  counts.total = counts.bySource.client.total + counts.bySource.guest.total;
  return counts;
}

/**
 * The studio's active boards across every project/proposal, newest-updated
 * first, each folded down to the exact fields DV8/DV10 asked for. Bounded —
 * `capped` tells the caller when the read stopped short of every active
 * board (one extra row over the cap is the cheapest way to know that without
 * a separate count query).
 */
export function useStudioBoardsOverview(cap = DEFAULT_STUDIO_BOARDS_CAP) {
  const safeCap = Math.max(1, Math.min(MAX_STUDIO_BOARDS_CAP, Math.trunc(cap) || DEFAULT_STUDIO_BOARDS_CAP));
  return useQuery({
    queryKey: ['studio-boards-overview', safeCap],
    queryFn: async (): Promise<StudioBoardsOverview> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('studio_boards_overview', {
        p_limit: safeCap + 1,
      });
      if (error) throw error;

      const rows = (data ?? []) as StudioBoardsOverviewRow[];
      const capped = rows.length > safeCap;
      const boardRows = capped ? rows.slice(0, safeCap) : rows;

      const boards: StudioBoardOverviewEntry[] = boardRows.map((row) => {
        const verdicts = toVerdicts(row);
        const reactionStatus = deriveBoardReactionStatus({
          verdictCounts: verdicts,
          hasActiveShare: row.has_active_share,
        });
        return {
          id: row.id,
          name: row.name,
          ownerKind: row.owner_kind === 'proposal' ? 'proposal' : 'project',
          ownerId: row.owner_id,
          ownerName: row.owner_name,
          coverImageUrl: row.cover_image_url,
          updatedAt: row.updated_at,
          reactionStatus,
          verdicts,
          unresolvedDirectionCount: toCount(row.unresolved_direction_count),
        };
      });

      return { boards, capped };
    },
  });
}
