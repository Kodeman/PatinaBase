import { describe, expect, it } from 'vitest';
import {
  summarizeBoardVerdicts,
  deriveBoardReactionStatus,
  deriveApprovedBoardItemIds,
  emptyBoardVerdictCounts,
  verdictAuthor,
} from '../board-verdicts';

describe('summarizeBoardVerdicts', () => {
  it('counts only the latest verdict for each client on each pin', () => {
    expect(
      summarizeBoardVerdicts([
        {
          verdicts: [
            {
              id: 'feedback-1',
              client_id: 'client-1',
              verdict: 'rejected',
              created_at: '2026-08-01T10:00:00Z',
            },
            {
              id: 'feedback-2',
              client_id: 'client-1',
              verdict: 'approved',
              created_at: '2026-08-02T10:00:00Z',
            },
          ],
        },
        {
          verdicts: [
            {
              id: 'feedback-3',
              client_id: 'client-1',
              verdict: 'comment',
              created_at: '2026-08-03T10:00:00Z',
            },
            {
              id: 'feedback-4',
              client_id: 'client-2',
              verdict: 'rejected',
              created_at: '2026-08-03T11:00:00Z',
            },
          ],
        },
      ]),
    ).toEqual({ approved: 1, rejected: 1, comment: 1, total: 3 });
  });

  it('ignores unknown values and empty item projections', () => {
    expect(
      summarizeBoardVerdicts([
        {},
        {
          verdicts: [
            {
              id: 'feedback-1',
              client_id: 'client-1',
              verdict: 'pending',
              created_at: '2026-08-01T10:00:00Z',
            },
          ],
        },
      ]),
    ).toEqual({ approved: 0, rejected: 0, comment: 0, total: 0 });
  });
});

describe('deriveBoardReactionStatus', () => {
  it('is null when never shared and no reactions exist', () => {
    expect(
      deriveBoardReactionStatus({ verdictCounts: emptyBoardVerdictCounts(), hasActiveShare: false }),
    ).toBeNull();
  });

  it('is "awaiting_reaction" when shared with zero verdicts', () => {
    expect(
      deriveBoardReactionStatus({ verdictCounts: emptyBoardVerdictCounts(), hasActiveShare: true }),
    ).toBe('awaiting_reaction');
  });

  it('is "reactions_in" when verdicts exist but none are approved', () => {
    expect(
      deriveBoardReactionStatus({
        verdictCounts: { approved: 0, rejected: 1, comment: 1, total: 2 },
        hasActiveShare: true,
      }),
    ).toBe('reactions_in');
  });

  it('is "reactions_in" even without an active share (e.g. a since-revoked link)', () => {
    expect(
      deriveBoardReactionStatus({
        verdictCounts: { approved: 0, rejected: 1, comment: 0, total: 1 },
        hasActiveShare: false,
      }),
    ).toBe('reactions_in');
  });

  it('is "approved_pipeline" whenever any approval exists, outranking other verdicts', () => {
    expect(
      deriveBoardReactionStatus({
        verdictCounts: { approved: 1, rejected: 2, comment: 3, total: 6 },
        hasActiveShare: true,
      }),
    ).toBe('approved_pipeline');
  });

  it('is "approved_pipeline" even without an active share (approval already happened)', () => {
    expect(
      deriveBoardReactionStatus({
        verdictCounts: { approved: 1, rejected: 0, comment: 0, total: 1 },
        hasActiveShare: false,
      }),
    ).toBe('approved_pipeline');
  });

  it('boundary: a single approved verdict among zero others is still approved_pipeline', () => {
    expect(
      deriveBoardReactionStatus({
        verdictCounts: { approved: 1, rejected: 0, comment: 0, total: 1 },
        hasActiveShare: true,
      }),
    ).toBe('approved_pipeline');
  });
});

describe('deriveApprovedBoardItemIds', () => {
  it('includes an item whose latest verdict for a client is approved', () => {
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: 'item-1', client_id: 'client-1', verdict: 'rejected', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'item-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-02T00:00:00Z' },
    ]);
    expect(ids.has('item-1')).toBe(true);
  });

  it('excludes an item whose latest verdict for the only client is not approved', () => {
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: 'item-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'item-1', client_id: 'client-1', verdict: 'rejected', created_at: '2026-08-02T00:00:00Z' },
    ]);
    expect(ids.has('item-1')).toBe(false);
  });

  it('includes an item approved by at least one client even if another client rejected it', () => {
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: 'item-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'item-1', client_id: 'client-2', verdict: 'rejected', created_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(ids.has('item-1')).toBe(true);
  });

  it('ignores rows with no board_item_id (line-anchored feedback)', () => {
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: null, client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(ids.size).toBe(0);
  });

  it('ignores unknown verdict values', () => {
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: 'item-1', client_id: 'client-1', verdict: 'pending', created_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(ids.size).toBe(0);
  });

  it('boundary: an empty row list produces an empty set', () => {
    expect(deriveApprovedBoardItemIds([]).size).toBe(0);
  });

  it('counts multiple guests on one pin each (W2a guest verdicts, 00546)', () => {
    // Two distinct guest-link reactions (client_id null, distinct guest_share_id)
    // on the same pin must not collapse into one author — each guest approving
    // is what makes the pin approved, and a dropped guest silently killing the
    // pipeline moment is exactly the P1 this fix closes.
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: 'item-1', client_id: null, guest_share_id: 'share-a', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'item-1', client_id: null, guest_share_id: 'share-b', verdict: 'rejected', created_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(ids.has('item-1')).toBe(true);
  });

  it('mixes a signed-in client verdict and a guest-link verdict on the same pin', () => {
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: 'item-1', client_id: 'client-1', verdict: 'rejected', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'item-1', client_id: null, guest_share_id: 'share-a', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(ids.has('item-1')).toBe(true);
  });

  it('skips a row with neither client_id nor guest_share_id, without pooling it under a shared null key', () => {
    const ids = deriveApprovedBoardItemIds([
      { id: 'f1', board_item_id: 'item-1', client_id: null, verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'item-1', client_id: null, verdict: 'rejected', created_at: '2026-08-02T00:00:00Z' },
    ]);
    // Neither row has an author, so neither counts — the pin is NOT approved,
    // and critically the two unattributed rows must not be treated as the
    // same author (which would let the later 'rejected' row silently erase
    // the earlier 'approved' one).
    expect(ids.has('item-1')).toBe(false);
    expect(ids.size).toBe(0);
  });
});

describe('verdictAuthor / latestVerdictByAuthor (shared with summarizeBoardVerdicts)', () => {
  it('keys a signed-in client by client_id and a guest by guest_share_id', () => {
    expect(verdictAuthor({ id: 'f1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' })).toBe('client:client-1');
    expect(verdictAuthor({ id: 'f2', client_id: null, guest_share_id: 'share-a', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' })).toBe('share:share-a');
  });

  it('returns null for a row with neither client_id nor guest_share_id', () => {
    expect(verdictAuthor({ id: 'f1', client_id: null, verdict: 'approved', created_at: '2026-08-01T00:00:00Z' })).toBeNull();
  });

  it('summarizeBoardVerdicts counts a guest verdict once, same as a client verdict', () => {
    expect(
      summarizeBoardVerdicts([
        {
          verdicts: [
            { id: 'f1', client_id: null, guest_share_id: 'share-a', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
          ],
        },
      ]),
    ).toEqual({ approved: 1, rejected: 0, comment: 0, total: 1 });
  });
});
