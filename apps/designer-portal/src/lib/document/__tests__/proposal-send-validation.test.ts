import { assessProposalSendReadiness } from '../proposal-send-validation';

describe('proposal send readiness', () => {
  it('blocks the zero-dollar client payload even when the editor looked complete', () => {
    const readiness = assessProposalSendReadiness({
      proposalTotalCents: 1_320_000,
      clientTotalCents: 1_320_000,
      milestones: [
        {
          id: 'milestone-1',
          label: 'New Milestone',
          percentage: 0,
          amount_cents: 0,
        },
      ],
      draftingGaps: [],
    });

    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must total 100%'),
        expect.stringContaining('greater than 0% and $0'),
      ]),
    );
  });

  it('blocks while the materialized client total differs from the editor total', () => {
    const readiness = assessProposalSendReadiness({
      proposalTotalCents: 1_320_000,
      clientTotalCents: 320_000,
      milestones: [
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 320_000,
        },
      ],
      draftingGaps: [],
    });

    expect(readiness.blockers).toContain(
      'The client preview is still refreshing and does not match the proposal total.',
    );
  });

  it('requires acknowledgement for an incomplete 83% draft without mislabeling safe money', () => {
    const readiness = assessProposalSendReadiness({
      proposalTotalCents: 1_320_000,
      clientTotalCents: 1_320_000,
      milestones: [
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ],
      draftingGaps: ['mood boards'],
    });

    expect(readiness.blockers).toEqual([]);
    expect(readiness.requiresIncompleteAcknowledgement).toBe(true);
    expect(readiness.warnings).toEqual(['Still missing: mood boards.']);
  });
});
