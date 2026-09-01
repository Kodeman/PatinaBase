import { describe, expect, it } from 'vitest';
import { deriveBoardsReactionRollup } from '../use-board-reaction-rollup';
import { emptyBoardVerdictCounts } from '../board-verdicts';
import type { StudioBoardOverviewEntry, StudioBoardsOverview } from '../use-studio-boards-overview';

function board(overrides: Partial<StudioBoardOverviewEntry> = {}): StudioBoardOverviewEntry {
  return {
    id: 'board-1',
    name: 'Living room direction',
    ownerKind: 'project',
    ownerId: 'project-1',
    ownerName: 'Lake House',
    coverImageUrl: null,
    updatedAt: '2026-08-01T00:00:00Z',
    reactionStatus: null,
    verdicts: emptyBoardVerdictCounts(),
    unresolvedDirectionCount: 0,
    ...overrides,
  };
}

describe('deriveBoardsReactionRollup (board-paths W3c, C5)', () => {
  it('returns undefined until the overview has resolved', () => {
    expect(deriveBoardsReactionRollup(undefined)).toBeUndefined();
  });

  it('groups boards into exactly the bucket their reactionStatus names', () => {
    const overview: StudioBoardsOverview = {
      capped: false,
      boards: [
        board({ id: 'a', reactionStatus: 'awaiting_reaction' }),
        board({ id: 'b', reactionStatus: 'reactions_in' }),
        board({ id: 'c', reactionStatus: 'approved_pipeline' }),
        board({ id: 'd', reactionStatus: null }),
      ],
    };
    const rollup = deriveBoardsReactionRollup(overview);
    expect(rollup?.awaitingReaction.map((b) => b.id)).toEqual(['a']);
    expect(rollup?.reactionsIn.map((b) => b.id)).toEqual(['b']);
    expect(rollup?.approvedPipeline.map((b) => b.id)).toEqual(['c']);
  });

  it('never shows a null-status (never-shared, no-reactions) board in any bucket', () => {
    const overview: StudioBoardsOverview = {
      capped: false,
      boards: [board({ id: 'quiet', reactionStatus: null })],
    };
    const rollup = deriveBoardsReactionRollup(overview);
    expect(rollup?.awaitingReaction).toHaveLength(0);
    expect(rollup?.reactionsIn).toHaveLength(0);
    expect(rollup?.approvedPipeline).toHaveLength(0);
  });

  it('carries the overview capped flag through unchanged (C5 — same source, same cap)', () => {
    const overview: StudioBoardsOverview = { capped: true, boards: [] };
    expect(deriveBoardsReactionRollup(overview)?.capped).toBe(true);
  });

  it('projects only id/name/ownerName/updatedAt onto each bucket entry', () => {
    const overview: StudioBoardsOverview = {
      capped: false,
      boards: [
        board({
          id: 'board-9',
          name: 'Kitchen refresh',
          ownerName: 'Lake House',
          updatedAt: '2026-08-01T00:00:00Z',
          reactionStatus: 'reactions_in',
          unresolvedDirectionCount: 5,
        }),
      ],
    };
    const rollup = deriveBoardsReactionRollup(overview);
    expect(rollup?.reactionsIn).toEqual([
      { id: 'board-9', name: 'Kitchen refresh', ownerName: 'Lake House', updatedAt: '2026-08-01T00:00:00Z' },
    ]);
  });
});
