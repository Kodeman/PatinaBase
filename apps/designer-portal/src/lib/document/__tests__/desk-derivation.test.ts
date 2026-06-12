/**
 * Desk derivation (spec v1.1 §7, rulings R1/R2) — pure logic, no DOM.
 * Deliberately imports nothing from components or @patina/help-system
 * (the stages.ts → help-system → @portabletext ESM trap).
 */
import {
  deriveNeed,
  deriveMotion,
  partitionDesk,
  type DocumentStateRow,
} from '../desk-derivation';

const NOW = new Date('2026-06-11T12:00:00Z');

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function mkRow(partial: Partial<DocumentStateRow>): DocumentStateRow {
  return {
    engagement_kind: 'project',
    engagement_id: 'e1',
    project_id: 'p1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'd1',
    client_profile_id: 'c1',
    client_name: 'Greta Whitfield',
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
    updated_at: daysAgo(1),
    open_claim_count: 0,
    open_claim_po: null,
    ...partial,
  };
}

describe('deriveNeed', () => {
  it('returns null for a quiet active project', () => {
    expect(deriveNeed(mkRow({}), NOW)).toBeNull();
  });

  it('overdue decision → urgent DECISION DUE stamp', () => {
    const need = deriveNeed(
      mkRow({ overdue_decision_count: 1, earliest_overdue_due: daysAgo(3) }),
      NOW,
    );
    expect(need).not.toBeNull();
    expect(need!.kind).toBe('overdue_decision');
    expect(need!.urgent).toBe(true);
    expect(need!.stamp.label).toBe('DECISION DUE');
    expect(need!.text).toMatch(/overdue/i);
  });

  it('overdue decision outranks awaiting inspection', () => {
    const need = deriveNeed(
      mkRow({
        overdue_decision_count: 2,
        earliest_overdue_due: daysAgo(1),
        awaiting_inspection_count: 3,
      }),
      NOW,
    );
    expect(need!.kind).toBe('overdue_decision');
  });

  it('open damage claim → need line naming the PO with a CLAIM OPEN stamp (R7)', () => {
    const need = deriveNeed(mkRow({ open_claim_count: 1, open_claim_po: 'AP-012' }), NOW);
    expect(need).not.toBeNull();
    expect(need!.kind).toBe('damage_claim');
    expect(need!.text).toBe('AP-012 has an open damage claim');
    expect(need!.stamp.label).toBe('CLAIM OPEN');
    expect(need!.urgent).toBe(false);
  });

  it('open damage claims without a PO identifier still surface, pluralized', () => {
    const need = deriveNeed(mkRow({ open_claim_count: 2, open_claim_po: null }), NOW);
    expect(need!.kind).toBe('damage_claim');
    expect(need!.text).toBe('2 open damage claims — review receiving');
  });

  it('open damage claim outranks awaiting inspection but not overdue decisions', () => {
    expect(
      deriveNeed(mkRow({ open_claim_count: 1, awaiting_inspection_count: 2 }), NOW)!.kind,
    ).toBe('damage_claim');
    expect(
      deriveNeed(
        mkRow({
          open_claim_count: 1,
          overdue_decision_count: 1,
          earliest_overdue_due: daysAgo(2),
        }),
        NOW,
      )!.kind,
    ).toBe('overdue_decision');
  });

  it('delivered-awaiting-inspection is a need with a DELIVERED stamp (R2)', () => {
    const need = deriveNeed(mkRow({ awaiting_inspection_count: 2 }), NOW);
    expect(need!.kind).toBe('awaiting_inspection');
    expect(need!.stamp.label).toBe('DELIVERED');
    expect(need!.text).toMatch(/2 .*awaiting inspection/i);
    expect(need!.urgent).toBe(false);
  });

  it('new lead with a comfortable deadline → need, not urgent', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'lead',
        active_section: 'brief',
        project_id: null,
        lead_id: 'l1',
        lead_status: 'new',
        lead_response_deadline: daysAhead(5),
      }),
      NOW,
    );
    expect(need!.kind).toBe('new_lead');
    expect(need!.urgent).toBe(false);
    expect(need!.stamp.label).toBe('NEW LEAD');
  });

  it('lead deadline inside 48h → urgent', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'lead',
        active_section: 'brief',
        project_id: null,
        lead_response_deadline: daysAhead(1),
      }),
      NOW,
    );
    expect(need!.urgent).toBe(true);
  });

  it('proposal sent >3d, never viewed → hesitating ("not yet opened")', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_id: 'pr1',
        proposal_status: 'sent',
        proposal_sent_at: daysAgo(4),
      }),
      NOW,
    );
    expect(need!.kind).toBe('hesitating_proposal');
    expect(need!.text).toMatch(/not yet opened/i);
    expect(need!.stamp.label).toBe('SENT');
  });

  it('proposal sent yesterday → no need yet', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'sent',
        proposal_sent_at: daysAgo(1),
      }),
      NOW,
    );
    expect(need).toBeNull();
  });

  it('proposal viewed >5d, unsigned → hesitating ("no signature")', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'viewed',
        proposal_sent_at: daysAgo(8),
        proposal_viewed_at: daysAgo(6),
      }),
      NOW,
    );
    expect(need!.kind).toBe('hesitating_proposal');
    expect(need!.text).toMatch(/no signature/i);
    expect(need!.stamp.label).toBe('VIEWED');
  });

  it('accepted, unactivated proposal → SIGNED need (open the project)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'accepted',
      }),
      NOW,
    );
    expect(need!.kind).toBe('proposal_signed');
    expect(need!.stamp.label).toBe('SIGNED');
    expect(need!.text).toMatch(/open the project/i);
  });

  it('declined proposal → need with DECLINED stamp', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'declined',
      }),
      NOW,
    );
    expect(need!.kind).toBe('proposal_declined');
    expect(need!.stamp.label).toBe('DECLINED');
  });

  it('paused project never needs a hand, even with overdue decisions', () => {
    const need = deriveNeed(
      mkRow({ is_paused: true, overdue_decision_count: 1, earliest_overdue_due: daysAgo(2) }),
      NOW,
    );
    expect(need).toBeNull();
  });
});

describe('deriveMotion', () => {
  it('paused project → "Paused"', () => {
    expect(deriveMotion(mkRow({ is_paused: true, project_status: 'on_hold' }), NOW)).toBe('Paused');
  });

  it('in-flight procurement summarized', () => {
    expect(deriveMotion(mkRow({ in_flight_count: 3 }), NOW)).toMatch(/3/);
  });

  it('draft proposal → drafting line', () => {
    expect(
      deriveMotion(
        mkRow({
          engagement_kind: 'proposal',
          active_section: 'direction',
          project_id: null,
          proposal_status: 'draft',
        }),
        NOW,
      ),
    ).toMatch(/draft/i);
  });

  it('recently sent proposal (no hesitation yet) → with-client line', () => {
    expect(
      deriveMotion(
        mkRow({
          engagement_kind: 'proposal',
          active_section: 'proposal',
          project_id: null,
          proposal_status: 'sent',
          proposal_sent_at: daysAgo(1),
        }),
        NOW,
      ),
    ).toMatch(/client/i);
  });

  it('quiet project with no movement → no chip', () => {
    expect(deriveMotion(mkRow({}), NOW)).toBeNull();
  });
});

describe('partitionDesk', () => {
  it('drops archived rows entirely', () => {
    const { folders, chips } = partitionDesk(
      [mkRow({ is_archived: true, overdue_decision_count: 5, earliest_overdue_due: daysAgo(9) })],
      NOW,
    );
    expect(folders).toHaveLength(0);
    expect(chips).toHaveLength(0);
  });

  it('sorts urgent needs first, then by severity', () => {
    const hesitating = mkRow({
      engagement_id: 'e-hes',
      engagement_kind: 'proposal',
      project_id: null,
      proposal_status: 'sent',
      proposal_sent_at: daysAgo(5),
    });
    const urgentLead = mkRow({
      engagement_id: 'e-lead',
      engagement_kind: 'lead',
      project_id: null,
      lead_response_deadline: daysAhead(0.5),
    });
    const overdue = mkRow({
      engagement_id: 'e-dec',
      overdue_decision_count: 1,
      earliest_overdue_due: daysAgo(1),
    });
    const { folders } = partitionDesk([hesitating, urgentLead, overdue], NOW);
    expect(folders.map((f) => f.row.engagement_id)).toEqual(['e-dec', 'e-lead', 'e-hes']);
  });

  it('caps chips at 6', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      mkRow({ engagement_id: `e${i}`, in_flight_count: 1 }),
    );
    const { chips } = partitionDesk(rows, NOW);
    expect(chips).toHaveLength(6);
  });
});
