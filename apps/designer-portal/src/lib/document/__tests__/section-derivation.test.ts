import { deriveSections, type SectionScheduleFacts } from '../section-derivation';
import type { DocumentStateRow } from '../desk-derivation';

const NOW = new Date('2026-06-11T12:00:00Z');

const baseRow: DocumentStateRow = {
  engagement_kind: 'project',
  engagement_id: 'p1',
  project_id: 'p1',
  proposal_id: null,
  lead_id: null,
  designer_id: 'd1',
  client_profile_id: 'c1',
  client_name: 'Sarah Whitfield',
  title: 'Whitfield Residence',
  project_status: 'active',
  current_phase: 'procurement',
  active_section: 'project',
  is_paused: false,
  is_archived: false,
  proposal_status: null,
  proposal_sent_at: null,
  proposal_viewed_at: null,
  lead_response_deadline: null,
  lead_status: null,
  overdue_decision_count: 0,
  earliest_overdue_due: null,
  awaiting_inspection_count: 0,
  blocked_item_count: 0,
  in_flight_count: 0,
  installed_count: 0,
  item_count: 0,
  updated_at: '2026-06-10T00:00:00Z',
  open_claim_count: 0,
  open_claim_po: null,
  unsent_pulse_count: 0,
  pulse_week_of: null,
};

// Midday-UTC timestamps keep the rendered calendar day stable across US TZs.
const lineage = {
  createdAt: '2026-03-09T12:00:00Z',
  sentAt: '2026-03-21T12:00:00Z',
  signedAt: '2026-04-01T12:00:00Z',
  status: 'accepted',
  version: 2,
};

describe('deriveSections (§4)', () => {
  it('signed active project: Brief→Proposal settled, Project active, Install/Care future', () => {
    const s = deriveSections(
      { row: baseRow, lineage, lineageResolved: true, schedule: null },
    );
    expect(s.map((x) => x.state)).toEqual([
      'settled',
      'settled',
      'settled',
      'settled',
      'active',
      'future',
      'future',
    ]);
    expect(s[3].sub).toBe('Signed · Apr 1');
    // R108: with no resolver answer the section says 'Active' and nothing more.
    // The old WEEK_MS arithmetic printed a week off projectStartDate here.
    expect(s[4].sub).toBe('Active');
    // R108: the stored install date is no longer printed as a bare day — the
    // Install sub-label waits for the resolver's own placement.
    expect(s[5].sub).toBe('—');
  });

  it('manual project (no lineage): Brief→Proposal are unrecorded, not future or complete', () => {
    const s = deriveSections(
      { row: baseRow, lineage: null, lineageResolved: true, schedule: null },
    );
    expect(s.slice(0, 4).map((x) => x.state)).toEqual([
      'unrecorded',
      'unrecorded',
      'unrecorded',
      'unrecorded',
    ]);
    expect(s.slice(0, 4).map((x) => x.sub)).toEqual([
      'Not recorded',
      'Not recorded',
      'Not recorded',
      'Not recorded',
    ]);
    expect(s[4].state).toBe('active');
  });

  it.each(['loading', 'error'])('keeps pre-project lineage neutral while the proposal read is %s', () => {
    const s = deriveSections(
      { row: baseRow, lineage: null, lineageResolved: false, schedule: null },
    );
    expect(s.slice(0, 4).map((x) => x.state)).toEqual(['future', 'future', 'future', 'future']);
    expect(s.slice(0, 4).some((x) => x.sub === 'Not recorded')).toBe(false);
  });

  it('install-phase project: Install active with phase pretty name', () => {
    const s = deriveSections(
      {
        row: { ...baseRow, active_section: 'install', current_phase: 'final_walkthrough' },
        lineage,
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[5].state).toBe('active');
    expect(s[5].sub).toBe('Final Walkthrough');
    expect(s[4].state).toBe('settled');
  });

  it('completed project: Care active and permanent', () => {
    const s = deriveSections(
      {
        row: { ...baseRow, active_section: 'care', project_status: 'completed' },
        lineage,
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[6]).toMatchObject({ state: 'active', sub: 'Ongoing' });
  });

  it('sent proposal: Proposal active "Awaiting signature", Direction settled at sent date', () => {
    const s = deriveSections(
      {
        row: {
          ...baseRow,
          engagement_kind: 'proposal',
          project_id: null,
          proposal_id: 'pr1',
          active_section: 'proposal',
          proposal_status: 'sent',
          proposal_sent_at: '2026-06-03T12:00:00Z',
        },
        lineage: { ...lineage, signedAt: null, status: 'sent' },
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[3]).toMatchObject({ state: 'active', sub: 'Awaiting signature' });
    expect(s[2].sub).toBe('Settled · Mar 21');
    expect(s[4].state).toBe('future');
  });

  it('declined proposal holds at Proposal-active with the state in the sub (R1)', () => {
    const s = deriveSections(
      {
        row: {
          ...baseRow,
          engagement_kind: 'proposal',
          active_section: 'proposal',
          proposal_status: 'declined',
        },
        lineage: { ...lineage, signedAt: null, status: 'declined' },
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[3]).toMatchObject({ state: 'active', sub: 'Declined' });
  });

  it('signed-awaiting-activation (I7): Proposal active, sub Signed', () => {
    const s = deriveSections(
      {
        row: {
          ...baseRow,
          engagement_kind: 'proposal',
          active_section: 'proposal',
          proposal_status: 'accepted',
        },
        lineage,
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[3].sub).toBe('Signed · Apr 1');
    expect(s[3].state).toBe('active');
  });

  it('draft proposal: Direction active "Drafting"', () => {
    const s = deriveSections(
      {
        row: {
          ...baseRow,
          engagement_kind: 'proposal',
          active_section: 'direction',
          proposal_status: 'draft',
        },
        lineage: { ...lineage, sentAt: null, signedAt: null, status: 'draft' },
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[2]).toMatchObject({ state: 'active', sub: 'Drafting' });
    expect(s[1].sub).toBe('Settled · Mar 9');
  });

  it('lead: Brief active with respond-by sub; everything else future', () => {
    const s = deriveSections(
      {
        row: {
          ...baseRow,
          engagement_kind: 'lead',
          active_section: 'brief',
          lead_response_deadline: '2026-06-12T12:00:00Z',
        },
        lineage: null,
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[0]).toMatchObject({ state: 'active', sub: 'Respond by Jun 12' });
    expect(s.slice(1).every((x) => x.state === 'future')).toBe(true);
  });

  it('relationship: Brief settled, Discovery active', () => {
    const s = deriveSections(
      {
        row: { ...baseRow, engagement_kind: 'relationship', active_section: 'discovery' },
        lineage: null,
        lineageResolved: true,
        schedule: null,
      },
    );
    expect(s[0].state).toBe('settled');
    expect(s[1]).toMatchObject({ state: 'active', sub: 'In discovery' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R108 — the three registers. The Project sub-label may only speak a position
// the resolver handed it, and the Install sub-label may only speak a date in
// the register that date's source supports.
// ─────────────────────────────────────────────────────────────────────────────

const scheduleFacts = (
  over: Partial<SectionScheduleFacts> = {},
): SectionScheduleFacts => ({
  selection: { activePhaseId: 'ph1', reason: 'today-in-window' },
  fidelity: 'committed',
  positionText: 'Week 3',
  install: null,
  ...over,
});

describe('deriveSections — schedule registers (R108)', () => {
  const projectSub = (schedule: SectionScheduleFacts | null) =>
    deriveSections(
      {
        row: baseRow,
        lineage,
        lineageResolved: true,
        schedule,
      },
    )[4].sub;

  it('committed: Active · Week N, straight from the resolver', () => {
    expect(projectSub(scheduleFacts({ fidelity: 'committed', positionText: 'Week 3' }))).toBe(
      'Active · Week 3',
    );
  });

  it('frame: Active · Frame', () => {
    expect(projectSub(scheduleFacts({ fidelity: 'frame', positionText: 'Frame' }))).toBe(
      'Active · Frame',
    );
  });

  it('band: Active · Band — a legacy project never says Week', () => {
    const sub = projectSub(scheduleFacts({ fidelity: 'band', positionText: 'Band' }));
    expect(sub).toBe('Active · Band');
    expect(sub).not.toMatch(/Week/);
  });

  it('loading: bare Active, never a computed week', () => {
    expect(projectSub(null)).toBe('Active');
    expect(
      projectSub(
        scheduleFacts({
          selection: { activePhaseId: null, reason: 'none' },
          positionText: null,
        }),
      ),
    ).toBe('Active');
  });

  const installSub = (schedule: SectionScheduleFacts | null) =>
    deriveSections(
      {
        row: baseRow,
        lineage,
        lineageResolved: true,
        schedule,
      },
    )[5].sub;

  it('install: a committed anchor prints its day', () => {
    expect(
      installSub(scheduleFacts({ install: { date: '2026-09-02', fidelity: 'committed' } })),
    ).toBe('Sep 2');
  });

  it('install: a frame is approximate, never a bare day', () => {
    expect(
      installSub(scheduleFacts({ install: { date: '2026-09-02', fidelity: 'frame' } })),
    ).toBe('~Sep 2');
  });

  it('install: a band states a month, never a day', () => {
    const sub = installSub(scheduleFacts({ install: { date: '2026-09-02', fidelity: 'band' } }));
    expect(sub).toBe('Band · ~Sep');
    // The desk refuses to put a day on an unanchored schedule; so does this.
    expect(sub).not.toMatch(/\d/);
  });

  it('install: a resolved schedule with no install phase never falls back to the stored date', () => {
    expect(installSub(scheduleFacts({ install: null }))).toBe('—');
  });
});
