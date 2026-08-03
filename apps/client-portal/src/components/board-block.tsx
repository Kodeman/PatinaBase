'use client';

import {
  useBoardsWithItems,
  useClientBoardFeedback,
  type ProposalBoardSummary,
  type ItemFeedback,
} from '@patina/supabase';
import {
  BoardsBlock as SharedBoardsBlock,
  type BoardCompositionItem,
  type BoardsBlockBoard,
  type BoardsBlockItem,
} from '@patina/design-system';
import { StrataMark } from '@/components/strata-mark';
import { LineFeedback } from '@/components/proposal-line-feedback';

interface BoardsBlockProps {
  boards: ProposalBoardSummary[];
  /**
   * Guest render (B3): fully-materialized boards resolved server-side. When
   * present, we render these directly and skip the RLS fetch (a guest gets zero
   * rows from it). Never carries verdict acts.
   */
  resolved?: BoardsBlockBoard[];
  /** The owning proposal — used for the board feedback fetch + verdict submit. */
  proposalId?: string;
  /**
   * Whether the per-pin verdict loop (B4) is offered — authed client +
   * feedback_enabled, never on a guest. Gates the Approve/Flag/Note acts.
   */
  feedbackEnabled?: boolean;
}

/**
 * Mood-board section of the client proposal document. Thin data-resolving
 * wrapper around the shared @patina/design-system `BoardsBlock` — the SAME
 * renderer the designer preview + drafting mirror use (R86 "preview is truth").
 * It resolves each board's items in one round trip and hands them to the shared
 * block; the `data-section-type="boards"` wrapper stays here because it drives
 * ProposalDocument's IntersectionObserver engagement tracking, which is
 * client-portal-specific.
 *
 * B3: a guest render passes `resolved` (server-fetched) so the RLS-bound hook is
 * bypassed. B4: when feedbackEnabled, product/capture pins gain the per-pin
 * verdict loop, anchored by board_item_id.
 */
export function BoardsBlock({ boards, resolved, proposalId, feedbackEnabled }: BoardsBlockProps) {
  // Summaries carry proposal_id; fall back to it when the caller didn't pass one.
  const effectiveProposalId = proposalId ?? boards?.[0]?.proposal_id ?? null;
  // `resolved` is the guest-only DTO path. Keep verdict capability structurally
  // impossible even if a stale/crafted visibility object says otherwise.
  const canFeedback = !!feedbackEnabled && !resolved && !!effectiveProposalId;

  // Skip the RLS fetch when the caller pre-resolved the boards (guest render).
  const { data } = useBoardsWithItems(resolved ? null : effectiveProposalId);

  // Board-pin verdicts for the authed client (inert unless feedback is on).
  const { data: feedbackRows = [] } = useClientBoardFeedback(
    canFeedback ? effectiveProposalId : undefined,
  );
  const feedbackByPin = groupByBoardItem(feedbackRows);

  const visible = resolved ?? (data ?? []).filter((b) => b.items.length > 0);
  if (visible.length === 0) return null;

  // Only wire acts when feedback is on AND we know the proposal — product/capture
  // pins only (the shared block calls this from the Featured list, which is
  // already filtered to those types).
  const renderPinDetail =
    canFeedback && effectiveProposalId
      ? (item: BoardsBlockItem) => (
          <LineFeedback
            proposalId={effectiveProposalId}
            boardItemId={item.id}
            feedback={feedbackByPin.get(item.id) ?? []}
          />
        )
      : undefined;

  // The canvas affordance is intentionally the same verdict mutation surface
  // as the Featured list, in a compact treatment. Guests never reach this
  // branch because their caller forces feedbackEnabled=false.
  const renderPinInteraction =
    canFeedback && effectiveProposalId
      ? (item: BoardCompositionItem) =>
          item.id ? (
            <LineFeedback
              proposalId={effectiveProposalId}
              boardItemId={item.id}
              feedback={feedbackByPin.get(item.id) ?? []}
              variant="pin"
            />
          ) : null
      : undefined;

  return (
    <div data-section-type="boards">
      <SharedBoardsBlock
        boards={visible}
        mark={<StrataMark variant="micro" />}
        renderPinDetail={renderPinDetail}
        interactive={!!renderPinInteraction}
        renderPinInteraction={renderPinInteraction}
      />
    </div>
  );
}

/** Group a proposal's board verdicts by board_item_id, ascending by created_at. */
function groupByBoardItem(rows: ItemFeedback[]): Map<string, ItemFeedback[]> {
  const map = new Map<string, ItemFeedback[]>();
  for (const row of rows) {
    if (!row.board_item_id) continue;
    const arr = map.get(row.board_item_id) ?? [];
    arr.push(row);
    map.set(row.board_item_id, arr);
  }
  return map;
}
