/**
 * The Finalize table's leader matrix (Start to Signature W4a).
 *
 * The point of this spec is the ORDER of the matrix and its two hard rules:
 * the nudge is never decided here (deriveSendWallLine owns the paper guard and
 * the cooldown), and Revise never comes back.
 */

import { rollupVerdicts } from '@patina/utils';
import type { VerdictRollup } from '@patina/utils';
import { deriveProposalWatch } from '../proposal-watch-derivation';
import {
  deriveFinalizeLeader,
  firstFlaggedLineId,
  type FinalizeLeaderInput,
} from '../finalize-leader';

const NOW = new Date('2026-08-16T12:00:00Z');

function watchFor(
  overrides: Partial<{
    status: string;
    sentAt: string | null;
    viewedAt: string | null;
    acceptedAt: string | null;
    lastNudgedAt: string | null;
  }> = {},
) {
  return deriveProposalWatch(
    {
      status: 'sent',
      sentAt: '2026-08-10T12:00:00Z',
      viewedAt: null,
      acceptedAt: null,
      lastNudgedAt: null,
      ...overrides,
    },
    null,
    [],
    NOW,
  );
}

const emptyRollup = rollupVerdicts(0, []);

function leaderFor(overrides: Partial<FinalizeLeaderInput> = {}) {
  return deriveFinalizeLeader(
    {
      watch: watchFor(),
      commercialState: null,
      issuedOnPaper: false,
      rollup: emptyRollup,
      firstFlaggedItemId: null,
      family: 'the Chens',
      ...overrides,
    },
    NOW,
  );
}

/** N lines, all approved. */
function allApproved(n: number): VerdictRollup {
  return rollupVerdicts(
    n,
    Array.from({ length: n }, (_, i) => ({
      lineId: `line-${i}`,
      verdict: 'approved' as const,
      createdAt: '2026-08-12T12:00:00Z',
    })),
  );
}

describe('deriveFinalizeLeader', () => {
  it('offers the watch’s own Preview act on a sent proposal with no verdicts', () => {
    expect(leaderFor()).toEqual({
      kind: 'preview',
      label: 'Preview as the Chens',
      flaggedItemId: null,
    });
  });

  it('leads with the flags, anchored to the first flagged line, ahead of everything else', () => {
    const rollup = rollupVerdicts(4, [
      { lineId: 'line-a', verdict: 'rejected', createdAt: '2026-08-12T12:00:00Z' },
      { lineId: 'line-b', verdict: 'approved', createdAt: '2026-08-12T12:00:00Z' },
    ]);
    expect(rollup.unresolvedFlags).toBe(1);
    expect(
      leaderFor({ rollup, firstFlaggedItemId: 'line-a' }),
    ).toEqual({
      kind: 'answer-flags',
      label: 'Answer the flags',
      flaggedItemId: 'line-a',
    });
  });

  it('does not lead with flags a designer has already resolved', () => {
    const rollup = rollupVerdicts(2, [
      {
        lineId: 'line-a',
        verdict: 'rejected',
        createdAt: '2026-08-12T12:00:00Z',
        resolvedAt: '2026-08-13T12:00:00Z',
      },
      { lineId: 'line-b', verdict: 'approved', createdAt: '2026-08-12T12:00:00Z' },
    ]);
    expect(rollup.flagged).toBe(1);
    expect(rollup.unresolvedFlags).toBe(0);
    expect(leaderFor({ rollup })?.kind).toBe('preview');
  });

  it('nudges when every line is approved and the proposal is still unsigned', () => {
    expect(leaderFor({ rollup: allApproved(3) })).toEqual({
      kind: 'nudge',
      label: 'Nudge the Chens',
      flaggedItemId: null,
    });
  });

  it('never nudges a paper-issued agreement — the send wall’s guard, not a second one', () => {
    const leader = leaderFor({
      rollup: allApproved(3),
      issuedOnPaper: true,
      watch: watchFor({ sentAt: null }),
    });
    expect(leader?.kind).toBe('preview');
  });

  it('never nudges inside the send wall’s cooldown', () => {
    const leader = leaderFor({
      rollup: allApproved(3),
      // Nudged yesterday; NUDGE_COOLDOWN_DAYS is 3.
      watch: watchFor({ lastNudgedAt: '2026-08-15T12:00:00Z' }),
    });
    expect(leader?.kind).toBe('preview');
  });

  it('never nudges while a countersignature is pending', () => {
    const leader = leaderFor({
      rollup: allApproved(3),
      commercialState: 'client_signed',
    });
    expect(leader?.kind).toBe('preview');
  });

  it('does not nudge on a partly-approved proposal — approval is not consent', () => {
    const rollup = rollupVerdicts(3, [
      { lineId: 'line-a', verdict: 'approved', createdAt: '2026-08-12T12:00:00Z' },
    ]);
    expect(leaderFor({ rollup })?.kind).toBe('preview');
  });

  it('stands down on a signed proposal — the seal speaks', () => {
    expect(
      leaderFor({
        watch: watchFor({ status: 'accepted', acceptedAt: '2026-08-14T12:00:00Z' }),
        rollup: allApproved(3),
      }),
    ).toBeNull();
  });

  it('stands down on declined, superseded, and every terminal commercial state', () => {
    expect(leaderFor({ watch: watchFor({ status: 'declined' }) })).toBeNull();
    expect(leaderFor({ watch: watchFor({ status: 'revised' }) })).toBeNull();
    for (const state of ['executed', 'declined', 'superseded']) {
      expect(leaderFor({ commercialState: state })).toBeNull();
    }
  });

  it('offers the delivery record on an expired proposal, and never a Revise', () => {
    const leader = leaderFor({ watch: watchFor({ status: 'expired' }) });
    expect(leader).toEqual({
      kind: 'resend',
      label: 'Email delivery status',
      flaggedItemId: null,
    });
    expect(JSON.stringify(leader)).not.toMatch(/revise/i);
  });

  it('offers nothing for a document that was never sent', () => {
    expect(leaderFor({ watch: watchFor({ status: 'draft' }) })).toBeNull();
  });

  it('answers the flags even on an expired proposal — the flags are the work', () => {
    const rollup = rollupVerdicts(2, [
      { lineId: 'line-a', verdict: 'rejected', createdAt: '2026-08-12T12:00:00Z' },
    ]);
    expect(
      leaderFor({ watch: watchFor({ status: 'expired' }), rollup })?.kind,
    ).toBe('answer-flags');
  });
});

describe('firstFlaggedLineId', () => {
  it('picks the OLDEST unresolved rejection — the Drafting Room’s own choice', () => {
    expect(
      firstFlaggedLineId([
        {
          verdict: 'rejected',
          created_at: '2026-08-13T12:00:00Z',
          proposal_item_id: 'newer',
        },
        {
          verdict: 'rejected',
          created_at: '2026-08-11T12:00:00Z',
          proposal_item_id: 'older',
        },
        {
          verdict: 'rejected',
          created_at: '2026-08-09T12:00:00Z',
          resolved_at: '2026-08-10T12:00:00Z',
          proposal_item_id: 'handled',
        },
        {
          verdict: 'approved',
          created_at: '2026-08-08T12:00:00Z',
          proposal_item_id: 'fine',
        },
      ]),
    ).toBe('older');
  });

  it('is null when nothing is flagged', () => {
    expect(firstFlaggedLineId([])).toBeNull();
    expect(
      firstFlaggedLineId([
        { verdict: 'approved', created_at: '2026-08-08T12:00:00Z', proposal_item_id: 'x' },
      ]),
    ).toBeNull();
  });
});
