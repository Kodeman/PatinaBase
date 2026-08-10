import { deriveSections } from '../section-derivation';
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
      { row: baseRow, lineage, projectStartDate: '2026-03-30', installStartDate: '2026-09-02' },
      NOW,
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
    expect(s[4].sub).toMatch(/^Active · Week \d+$/);
    expect(s[5].sub).toBe('Sep 2');
  });

  it('manual project (no lineage): Brief→Proposal are unrecorded, not future or complete', () => {
    const s = deriveSections(
      { row: baseRow, lineage: null, projectStartDate: '2026-03-30', installStartDate: null },
      NOW,
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

  it('install-phase project: Install active with phase pretty name', () => {
    const s = deriveSections(
      {
        row: { ...baseRow, active_section: 'install', current_phase: 'final_walkthrough' },
        lineage,
        projectStartDate: '2026-03-30',
        installStartDate: '2026-09-02',
      },
      NOW,
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
        projectStartDate: '2026-03-30',
        installStartDate: null,
      },
      NOW,
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
        projectStartDate: null,
        installStartDate: null,
      },
      NOW,
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
        projectStartDate: null,
        installStartDate: null,
      },
      NOW,
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
        projectStartDate: null,
        installStartDate: null,
      },
      NOW,
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
        projectStartDate: null,
        installStartDate: null,
      },
      NOW,
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
        projectStartDate: null,
        installStartDate: null,
      },
      NOW,
    );
    expect(s[0]).toMatchObject({ state: 'active', sub: 'Respond by Jun 12' });
    expect(s.slice(1).every((x) => x.state === 'future')).toBe(true);
  });

  it('relationship: Brief settled, Discovery active', () => {
    const s = deriveSections(
      {
        row: { ...baseRow, engagement_kind: 'relationship', active_section: 'discovery' },
        lineage: null,
        projectStartDate: null,
        installStartDate: null,
      },
      NOW,
    );
    expect(s[0].state).toBe('settled');
    expect(s[1]).toMatchObject({ state: 'active', sub: 'In discovery' });
  });
});
