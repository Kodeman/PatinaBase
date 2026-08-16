/**
 * The Finalize table's leader matrix (Start to Signature W4a, corrected at the
 * W4 review).
 *
 * The point of this spec is the ORDER of the matrix and its three hard rules:
 * the nudge is never decided here (deriveSendWallLine owns the paper guard and
 * the cooldown), Revise never comes back, and the flags get no leader at all —
 * the Room evicts a sent proposal, so "Answer the flags" bounced, and nothing
 * else on the document can answer a flag either. A flagged proposal therefore
 * falls through to the next honest verb.
 */

import { rollupVerdicts } from '@patina/utils';
import type { VerdictRollup } from '@patina/utils';
import { deriveProposalWatch } from '../proposal-watch-derivation';
import {
  deriveFinalizeLeader,
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
    });
  });

  it('offers no flag verb — it falls through to the watch’s own Preview act', () => {
    const rollup = rollupVerdicts(4, [
      { lineId: 'line-a', verdict: 'rejected', createdAt: '2026-08-12T12:00:00Z' },
      { lineId: 'line-b', verdict: 'approved', createdAt: '2026-08-12T12:00:00Z' },
    ]);
    expect(rollup.unresolvedFlags).toBe(1);
    // W4a led with "Answer the flags" into `/drafting/<id>?flagged=1`. The Room
    // evicts a sent proposal, so the verb bounced; nothing on the document can
    // answer a flag today, so the leader offers an act that can be followed.
    const leader = leaderFor({ rollup });
    expect(leader).toEqual({ kind: 'preview', label: 'Preview as the Chens' });
    expect(JSON.stringify(leader)).not.toMatch(/flag/i);
  });

  it('does not treat an unsigned all-but-flagged proposal as approved', () => {
    // Dropping the flag verb must not promote the nudge in its place: a
    // rejected line is not consent, and the nudge's own gate still holds.
    const rollup = rollupVerdicts(2, [
      { lineId: 'line-a', verdict: 'rejected', createdAt: '2026-08-12T12:00:00Z' },
      { lineId: 'line-b', verdict: 'approved', createdAt: '2026-08-12T12:00:00Z' },
    ]);
    expect(leaderFor({ rollup })?.kind).toBe('preview');
  });

  it('reads resolved and unresolved flags alike now — neither leads', () => {
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
    expect(leader).toEqual({ kind: 'resend', label: 'Email delivery status' });
    expect(JSON.stringify(leader)).not.toMatch(/revise/i);
  });

  it('offers nothing for a document that was never sent', () => {
    expect(leaderFor({ watch: watchFor({ status: 'draft' }) })).toBeNull();
  });

  it('still offers the delivery record on an expired proposal with flags open', () => {
    const rollup = rollupVerdicts(2, [
      { lineId: 'line-a', verdict: 'rejected', createdAt: '2026-08-12T12:00:00Z' },
    ]);
    expect(
      leaderFor({ watch: watchFor({ status: 'expired' }), rollup })?.kind,
    ).toBe('resend');
  });
});
