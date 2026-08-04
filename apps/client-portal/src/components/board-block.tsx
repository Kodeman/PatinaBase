'use client';

import {
  Component,
  useEffect,
  type ReactNode,
} from 'react';
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
import { moodBoardEvents } from '@/lib/analytics/events';

interface BoardsBlockProps {
  boards: ProposalBoardSummary[];
  /**
   * Fully-materialized boards resolved server-side. Both authenticated and
   * guest pages may use this path; `surface` owns the authorization distinction.
   */
  resolved?: BoardsBlockBoard[];
  /** The owning proposal — used for the board feedback fetch + verdict submit. */
  proposalId?: string;
  /** Explicitly separates pre-resolved authenticated data from a guest share. */
  surface?: 'client_proposal' | 'guest_share';
  /**
   * Whether the per-pin verdict loop (B4) is offered — authed client +
   * feedback_enabled, never on a guest. Gates the Approve/Flag/Note acts.
   */
  feedbackEnabled?: boolean;
}

interface MoodBoardRenderBoundaryProps {
  children: ReactNode;
  telemetry: {
    proposalId: string | null;
    boardCount: number;
    surface: 'client_proposal' | 'guest_share';
  };
}

class MoodBoardRenderBoundary extends Component<
  MoodBoardRenderBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    moodBoardEvents.renderFailed(error, this.props.telemetry);
  }

  private reset = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          className="rounded-[3px] border border-[var(--border-default)] px-4 py-5 text-center"
        >
          <p className="type-body-small">This mood board could not be displayed.</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 min-h-11 rounded-[3px] border border-[var(--border-default)] px-4 type-meta"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MoodBoardRenderSucceeded({
  telemetry,
  renderKey,
}: {
  telemetry: MoodBoardRenderBoundaryProps['telemetry'];
  renderKey: string;
}) {
  const { proposalId, boardCount, surface } = telemetry;
  useEffect(() => {
    moodBoardEvents.renderSucceeded({ proposalId, boardCount, surface });
  }, [boardCount, proposalId, renderKey, surface]);
  return null;
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
export function BoardsBlock({
  boards,
  resolved,
  proposalId,
  feedbackEnabled,
  surface = 'client_proposal',
}: BoardsBlockProps) {
  // Summaries carry proposal_id; fall back to it when the caller didn't pass one.
  const effectiveProposalId = proposalId ?? boards?.[0]?.proposal_id ?? null;
  const isGuest = surface === 'guest_share';
  // Keep guest verdict capability structurally impossible even if a stale or
  // crafted visibility object says otherwise. Materialization mode is not an
  // authorization signal: authenticated proposal pages also pre-resolve boards.
  const canFeedback = !!feedbackEnabled && !isGuest && !!effectiveProposalId;

  // Skip the RLS fetch when the caller pre-resolved the boards (guest render).
  const { data } = useBoardsWithItems(resolved ? null : effectiveProposalId);

  // Board-pin verdicts for the authed client (inert unless feedback is on).
  const { data: feedbackRows = [] } = useClientBoardFeedback(
    canFeedback ? effectiveProposalId : undefined,
  );
  const feedbackByPin = groupByBoardItem(feedbackRows);

  const visible = resolved ?? (data ?? []).filter((b) => b.items.length > 0);
  if (visible.length === 0) return null;

  const renderTelemetry: MoodBoardRenderBoundaryProps['telemetry'] = {
    proposalId: isGuest ? null : effectiveProposalId,
    boardCount: visible.length,
    surface,
  };
  const renderKey = `${renderTelemetry.surface}:${renderTelemetry.proposalId ?? 'guest'}:${visible
    .map((board) => board.id)
    .join(',')}`;

  const submitted = (item: BoardCompositionItem) => (verdict: ItemFeedback['verdict']) => {
    if (!item.id) return;
    const board = visible.find((candidate) =>
      candidate.items.some((candidateItem) => candidateItem.id === item.id),
    );
    if (!board) return;
    moodBoardEvents.verdictGiven({
      verdict,
      boardId: board.id,
      boardItemId: item.id,
      itemType: item.type,
    });
  };

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
            onSubmitted={submitted(item)}
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
              onSubmitted={submitted(item)}
            />
          ) : null
      : undefined;

  return (
    <div data-section-type="boards">
      <MoodBoardRenderBoundary key={renderKey} telemetry={renderTelemetry}>
        <SharedBoardsBlock
          boards={visible}
          mark={<StrataMark variant="micro" />}
          renderPinDetail={renderPinDetail}
          interactive={!!renderPinInteraction}
          renderPinInteraction={renderPinInteraction}
        />
        <MoodBoardRenderSucceeded telemetry={renderTelemetry} renderKey={renderKey} />
      </MoodBoardRenderBoundary>
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
