'use client';

import {
  useBoardsWithItems,
  type ProposalBoardSummary,
} from '@patina/supabase';
import { BoardsBlock as SharedBoardsBlock } from '@patina/design-system';
import { StrataMark } from '@/components/strata-mark';

interface BoardsBlockProps {
  boards: ProposalBoardSummary[];
}

/**
 * Mood-board section of the client proposal document. Thin data-resolving
 * wrapper around the shared @patina/design-system `BoardsBlock` — the SAME
 * renderer the designer preview + drafting mirror use (R86 "preview is truth";
 * the render logic that used to live here was promoted to the design system).
 * It resolves each board's items in one round trip and hands them to the shared
 * block; the `data-section-type="boards"` wrapper stays here because it drives
 * ProposalDocument's IntersectionObserver engagement tracking, which is
 * client-portal-specific.
 */
export function BoardsBlock({ boards }: BoardsBlockProps) {
  // Summaries carry proposal_id; nothing to resolve (or render) without one.
  const proposalId = boards?.[0]?.proposal_id ?? null;
  const { data } = useBoardsWithItems(proposalId);
  const visible = (data ?? []).filter((b) => b.items.length > 0);
  if (visible.length === 0) return null;

  return (
    <div data-section-type="boards">
      <SharedBoardsBlock boards={visible} mark={<StrataMark variant="micro" />} />
    </div>
  );
}
