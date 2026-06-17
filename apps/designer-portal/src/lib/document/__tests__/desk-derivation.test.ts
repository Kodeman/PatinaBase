/**
 * Desk derivation (spec v1.1 §7, rulings R1/R2) — pure logic, no DOM.
 * Deliberately imports nothing from components or @patina/help-system
 * (the stages.ts → help-system → @portabletext ESM trap).
 */
import {
  deriveNeed,
  folderTab,
  deriveMotion,
  partitionDesk,
  deriveReconnectNeeds,
  type DocumentStateRow,
  type NurtureLike,
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
    proposal_updated_at: null,
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
    unsent_pulse_count: 0,
    pulse_week_of: null,
    draft_unsent_po_count: 0,
    oldest_draft_po_created_at: null,
    draft_po_label: null,
    unacked_po_count: 0,
    oldest_unacked_sent_at: null,
    unacked_po_label: null,
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

  it('unsent pulse stays quiet before Friday (D5)', () => {
    // NOW is Thursday 2026-06-11; week_of Monday 2026-06-08 → Friday Jun 12.
    expect(
      deriveNeed(mkRow({ unsent_pulse_count: 1, pulse_week_of: '2026-06-08' }), NOW),
    ).toBeNull();
  });

  it('unsent pulse rises on Friday with a sage PULSE stamp (D5)', () => {
    const friday = new Date('2026-06-12T14:00:00Z');
    const need = deriveNeed(
      mkRow({ unsent_pulse_count: 1, pulse_week_of: '2026-06-08' }),
      friday,
    );
    expect(need).not.toBeNull();
    expect(need!.kind).toBe('pulse_due');
    expect(need!.stamp.label).toBe('PULSE');
    expect(need!.urgent).toBe(false);
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

  it('lead deadline inside 24h → urgent (R10)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'lead',
        active_section: 'brief',
        project_id: null,
        lead_response_deadline: daysAhead(0.5),
      }),
      NOW,
    );
    expect(need!.urgent).toBe(true);
  });

  it('lead deadline beyond 24h → need, not urgent (R10 boundary)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'lead',
        active_section: 'brief',
        project_id: null,
        lead_response_deadline: daysAhead(1.5),
      }),
      NOW,
    );
    expect(need!.kind).toBe('new_lead');
    expect(need!.urgent).toBe(false);
  });

  it('proposal sent 1 day ago, never viewed → NOT a folder (R22 chip tier)', () => {
    // R22: day-1 sent-unopened is an In-motion chip (only act = wait), not a
    // needs-your-hand folder. deriveNeed returns null; deriveMotion carries it.
    const row = mkRow({
      engagement_kind: 'proposal',
      active_section: 'proposal',
      project_id: null,
      proposal_id: 'pr1',
      proposal_status: 'sent',
      proposal_sent_at: daysAgo(1),
    });
    expect(deriveNeed(row, NOW)).toBeNull();
    expect(deriveMotion(row, NOW)).toEqual({ kind: 'sent_unopened', text: 'sent, unopened 1d' });
  });

  it('proposal sent 2 days ago, never viewed → promotes to a folder (R22)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_id: 'pr1',
        proposal_status: 'sent',
        proposal_sent_at: daysAgo(2),
      }),
      NOW,
    );
    expect(need!.kind).toBe('hesitating_proposal');
    expect(need!.text).toMatch(/not yet opened/i);
    expect(need!.stamp.label).toBe('SENT');
  });

  it('proposal sent hours ago → no need, with-client chip (R22 boundary)', () => {
    const row = mkRow({
      engagement_kind: 'proposal',
      active_section: 'proposal',
      project_id: null,
      proposal_status: 'sent',
      proposal_sent_at: daysAgo(0.5),
    });
    expect(deriveNeed(row, NOW)).toBeNull();
    expect(deriveMotion(row, NOW)!.kind).toBe('with_client');
    expect(deriveMotion(row, NOW)!.text).toMatch(/with client/i);
  });

  it('proposal viewed 2 days ago, unsigned → hesitating ("no signature") (R10)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'viewed',
        proposal_sent_at: daysAgo(4),
        proposal_viewed_at: daysAgo(2),
      }),
      NOW,
    );
    expect(need!.kind).toBe('hesitating_proposal');
    expect(need!.text).toMatch(/no signature/i);
    expect(need!.stamp.label).toBe('VIEWED');
  });

  it('proposal viewed yesterday → no need yet (R10 boundary)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'viewed',
        proposal_sent_at: daysAgo(3),
        proposal_viewed_at: daysAgo(1),
      }),
      NOW,
    );
    expect(need).toBeNull();
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

describe('R18 send-weave need lines (FINAL 1d thresholds, L3)', () => {
  it('drafted PO unsent ≥1d → UNSENT need with the PO label', () => {
    const need = deriveNeed(
      mkRow({ draft_unsent_po_count: 1, oldest_draft_po_created_at: daysAgo(1), draft_po_label: 'PO-0012' }),
      NOW,
    );
    expect(need!.kind).toBe('po_unsent');
    expect(need!.text).toBe('PO-0012 drafted — not yet sent');
    expect(need!.stamp.label).toBe('UNSENT');
  });

  it('drafted PO under 1d → no need (boundary)', () => {
    expect(
      deriveNeed(
        mkRow({ draft_unsent_po_count: 1, oldest_draft_po_created_at: daysAgo(0.5), draft_po_label: 'PO-0012' }),
        NOW,
      ),
    ).toBeNull();
  });

  it('sent PO unacknowledged ≥1d → NO ACK need', () => {
    const need = deriveNeed(
      mkRow({ unacked_po_count: 2, oldest_unacked_sent_at: daysAgo(1), unacked_po_label: 'PO-0007' }),
      NOW,
    );
    expect(need!.kind).toBe('po_unacknowledged');
    expect(need!.text).toBe('2 POs sent — no acknowledgment');
    expect(need!.stamp.label).toBe('NO ACK');
  });

  it('unacknowledged under 1d → no need (boundary)', () => {
    expect(
      deriveNeed(
        mkRow({ unacked_po_count: 1, oldest_unacked_sent_at: daysAgo(0.5) }),
        NOW,
      ),
    ).toBeNull();
  });

  it('the designer\'s own unsent pen outranks the vendor nudge', () => {
    const need = deriveNeed(
      mkRow({
        draft_unsent_po_count: 1,
        oldest_draft_po_created_at: daysAgo(3),
        draft_po_label: 'PO-0012',
        unacked_po_count: 1,
        oldest_unacked_sent_at: daysAgo(5),
      }),
      NOW,
    );
    expect(need!.kind).toBe('po_unsent');
  });
});

describe('deriveMotion', () => {
  it('paused project → "Paused" (kind paused)', () => {
    expect(deriveMotion(mkRow({ is_paused: true, project_status: 'on_hold' }), NOW)).toEqual({
      kind: 'paused',
      text: 'Paused',
    });
  });

  it('in-flight procurement summarized (kind in_flight)', () => {
    const motion = deriveMotion(mkRow({ in_flight_count: 3 }), NOW);
    expect(motion!.kind).toBe('in_flight');
    expect(motion!.text).toMatch(/3/);
  });

  it('actively-drafting proposal (touched 1d ago) → quiet, no chip (R45)', () => {
    // R45: while she's in it, nothing shows. A fresh touch keeps the draft warm.
    expect(
      deriveMotion(
        mkRow({
          engagement_kind: 'proposal',
          active_section: 'direction',
          project_id: null,
          proposal_status: 'draft',
          proposal_updated_at: daysAgo(1),
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('untouched draft (cold ≥3d) → "drafting, untouched Nd" chip (R45)', () => {
    expect(
      deriveMotion(
        mkRow({
          engagement_kind: 'proposal',
          active_section: 'direction',
          project_id: null,
          proposal_status: 'draft',
          proposal_updated_at: daysAgo(4),
        }),
        NOW,
      ),
    ).toEqual({ kind: 'drafting', text: 'drafting, untouched 4d' });
  });

  it('untouched draft falls back to updated_at when no proposal touch (R45)', () => {
    expect(
      deriveMotion(
        mkRow({
          engagement_kind: 'proposal',
          active_section: 'direction',
          project_id: null,
          proposal_status: 'draft',
          proposal_updated_at: null,
          updated_at: daysAgo(5),
        }),
        NOW,
      ),
    ).toEqual({ kind: 'drafting', text: 'drafting, untouched 5d' });
  });

  it('recently sent proposal (no hesitation yet) → with-client line', () => {
    const motion = deriveMotion(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'sent',
        proposal_sent_at: daysAgo(0.5),
      }),
      NOW,
    );
    expect(motion!.kind).toBe('with_client');
    expect(motion!.text).toMatch(/client/i);
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

  it('actively-drafting proposal (touched 1d) → no folder and no chip (R45)', () => {
    const { folders, chips } = partitionDesk(
      [
        mkRow({
          engagement_id: 'e-draft',
          engagement_kind: 'proposal',
          project_id: null,
          proposal_id: 'pr1',
          proposal_status: 'draft',
          proposal_updated_at: daysAgo(1),
        }),
      ],
      NOW,
    );
    expect(folders).toHaveLength(0);
    expect(chips).toHaveLength(0);
  });

  it('cold draft (untouched 4d) → one "drafting, untouched 4d" chip, no folder (R45)', () => {
    const { folders, chips } = partitionDesk(
      [
        mkRow({
          engagement_id: 'e-cold',
          engagement_kind: 'proposal',
          project_id: null,
          proposal_id: 'pr1',
          proposal_status: 'draft',
          proposal_updated_at: daysAgo(4),
        }),
      ],
      NOW,
    );
    expect(folders).toHaveLength(0);
    expect(chips).toHaveLength(1);
    expect(chips[0].kind).toBe('drafting');
    expect(chips[0].text).toBe('drafting, untouched 4d');
  });

  it('just-activated project (proposal accepted WITH project_id) → a project folder, never a proposal need (R45)', () => {
    // Shape-A: once the signed proposal activates, the engagement is a project
    // (engagement_kind 'project' with a project_id), so the proposal_signed
    // "open the project" need never fires — its real needs are project ones.
    const { folders, chips } = partitionDesk(
      [
        mkRow({
          engagement_id: 'e-activated',
          engagement_kind: 'project',
          project_id: 'p-activated',
          proposal_id: 'pr1',
          proposal_status: 'accepted',
          overdue_decision_count: 1,
          earliest_overdue_due: daysAgo(2),
        }),
      ],
      NOW,
    );
    expect(folders).toHaveLength(1);
    expect(folders[0].row.project_id).toBe('p-activated');
    expect(folders[0].need.kind).toBe('overdue_decision');
    expect(folders[0].need.kind).not.toBe('proposal_signed');
    expect(chips).toHaveLength(0);
  });
});

describe('deriveReconnectNeeds (R53 — People on the Desk)', () => {
  const mkEntry = (partial: Partial<NurtureLike>): NurtureLike => ({
    person: {
      person_id: 'pe1',
      role: 'client',
      display_name: 'Joan Marsh',
      last_touch_at: daysAgo(240),
      meta: {},
    },
    due: true,
    reason: '8mo ago since last touch — reconnect now',
    score: 1_000_000,
    ...partial,
  });

  it('surfaces only the DUE band — keep-tending entries never rise to the Desk', () => {
    const out = deriveReconnectNeeds(
      [
        mkEntry({ due: true }),
        mkEntry({ person: { ...mkEntry({}).person, person_id: 'pe2' }, due: false }),
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].personId).toBe('pe1');
  });

  it('maps the entry onto a quiet reconnect line (name + reason, no stamp)', () => {
    const out = deriveReconnectNeeds([mkEntry({})], NOW);
    expect(out[0]).toEqual({
      personId: 'pe1',
      role: 'client',
      name: 'Joan Marsh',
      reason: '8mo ago since last touch — reconnect now',
    });
  });

  it('caps at the strongest few (default 3) — the Desk is focus, not a CRM queue', () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      mkEntry({ person: { ...mkEntry({}).person, person_id: `pe${i}` }, due: true }),
    );
    expect(deriveReconnectNeeds(entries, NOW)).toHaveLength(3);
  });

  it('honors an explicit limit and preserves the queue order (already ranked)', () => {
    const entries = [
      mkEntry({ person: { ...mkEntry({}).person, person_id: 'a' }, score: 3 }),
      mkEntry({ person: { ...mkEntry({}).person, person_id: 'b' }, score: 2 }),
      mkEntry({ person: { ...mkEntry({}).person, person_id: 'c' }, score: 1 }),
    ];
    const out = deriveReconnectNeeds(entries, NOW, 2);
    expect(out.map((r) => r.personId)).toEqual(['a', 'b']);
  });

  it('returns [] when nothing is due (the section then never renders)', () => {
    expect(deriveReconnectNeeds([mkEntry({ due: false })], NOW)).toEqual([]);
    expect(deriveReconnectNeeds([], NOW)).toEqual([]);
  });
});

describe('folderTab (R16)', () => {
  const tab = (client_name: string, title: string) => folderTab({ client_name, title });

  it('carries the family name when a surname resolves (R1)', () => {
    expect(tab('Sarah Whitfield', 'Whitfield Living & Dining')).toBe('Whitfield');
    expect(tab('Margaret Olsen', 'Olsen Penthouse — Furnishing')).toBe('Olsen');
  });

  it('falls back to the first word of the title when the name is a role noun', () => {
    expect(tab('Client', 'Olsen Lake House')).toBe('Olsen');
    expect(tab('Client User', 'Chen Residence')).toBe('Chen');
    expect(tab('New client', 'Aspen Loft Refresh')).toBe('Aspen');
  });

  it('falls back to the title when no name resolves at all', () => {
    expect(tab('', 'Harbor House')).toBe('Harbor');
    expect(tab('   ', 'Harbor House')).toBe('Harbor');
  });
});
