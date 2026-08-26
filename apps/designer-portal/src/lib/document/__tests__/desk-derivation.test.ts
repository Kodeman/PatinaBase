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
  type DeskCeremonySignal,
} from '../desk-derivation';
import type { DeskScheduleInput } from '../desk-schedule';

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
    proposal_open_count: null,
    proposal_last_opened_at: null,
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
        lead_status: 'new',
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
        lead_status: 'viewed',
        lead_response_deadline: daysAhead(1.5),
      }),
      NOW,
    );
    expect(need!.kind).toBe('new_lead');
    expect(need!.urgent).toBe(false);
  });

  it('contacted (nurtured) lead with a FUTURE reconnect date → NO folder (R61/R65)', () => {
    // Shape C still surfaces a 'contacted' lead, but Nurture moved it off the
    // needs-your-hand band — it stays off until the reconnect date is due.
    expect(
      deriveNeed(
        mkRow({
          engagement_kind: 'lead',
          active_section: 'brief',
          project_id: null,
          lead_id: 'l1',
          lead_status: 'contacted',
          lead_response_deadline: daysAhead(5),
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('contacted lead whose reconnect date is DUE → reconnect_due folder (R65)', () => {
    // R65: a dated touchpoint earns a return — once the reconnect date passes,
    // the nurtured lead rises again as a needs-your-hand 'reconnect_due' need.
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'lead',
        active_section: 'brief',
        project_id: null,
        lead_id: 'l1',
        lead_status: 'contacted',
        lead_response_deadline: daysAgo(1),
      }),
      NOW,
    );
    expect(need!.kind).toBe('reconnect_due');
    expect(need!.stamp.label).toBe('RECONNECT');
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

  it('proposal viewed multiple times, unsigned → need carries the open count (R71)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'viewed',
        proposal_sent_at: daysAgo(5),
        proposal_viewed_at: daysAgo(3),
        proposal_open_count: 3,
        proposal_last_opened_at: daysAgo(1),
      }),
      NOW,
    );
    expect(need!.kind).toBe('hesitating_proposal');
    expect(need!.text).toMatch(/Opened 3× — last/);
    expect(need!.text).toMatch(/no signature/i);
  });

  it('proposal viewed once, unsigned → keeps the calm first-open read (no count)', () => {
    const need = deriveNeed(
      mkRow({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        project_id: null,
        proposal_status: 'viewed',
        proposal_sent_at: daysAgo(4),
        proposal_viewed_at: daysAgo(2),
        proposal_open_count: 1,
        proposal_last_opened_at: daysAgo(2),
      }),
      NOW,
    );
    expect(need!.text).not.toMatch(/×/);
    expect(need!.text).toMatch(/Opened .* — no signature yet/);
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

// B2-03 (roster receivable figure, B3-L3 re-verification): the folder card's
// need line is the ONE place `ReceivableSignal.totalBalanceCents` is in
// scope (desk-roster-derivation.ts reads `need.text`, not the raw signal),
// so the dollar figure has to land here or it never reaches the Desk roster.
describe('deriveNeed — overdue_invoice carries the receivable figure (B2-03)', () => {
  it('a single overdue invoice states its dollar figure', () => {
    const need = deriveNeed(mkRow({}), NOW, null, {
      count: 1,
      oldestDue: daysAgo(22),
      totalBalanceCents: 1_750_000,
      invoiceId: 'inv-1',
      invoiceLabel: 'Invoice 0418',
    });
    expect(need).not.toBeNull();
    expect(need!.kind).toBe('overdue_invoice');
    expect(need!.text).toContain('$17,500');
    expect(need!.text).toBe(
      'Invoice 0418 · $17,500 overdue — oldest due ' +
        new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
          new Date(daysAgo(22)),
        ) +
        ' — send a reminder',
    );
  });

  it('multiple overdue invoices state the combined figure', () => {
    const need = deriveNeed(mkRow({}), NOW, null, {
      count: 3,
      oldestDue: daysAgo(10),
      totalBalanceCents: 425_000,
      invoiceId: 'inv-9',
      invoiceLabel: 'Invoice 0501',
    });
    expect(need!.text).toContain('$4,250');
    expect(need!.text).toContain('3 invoices');
  });

  it('a zero-balance receivable signal prints no figure', () => {
    const need = deriveNeed(mkRow({}), NOW, null, {
      count: 1,
      oldestDue: daysAgo(5),
      totalBalanceCents: 0,
      invoiceId: 'inv-2',
      invoiceLabel: 'Invoice 0099',
    });
    expect(need!.text).not.toMatch(/\$/);
  });

  it('no receivable signal means no overdue_invoice need', () => {
    expect(deriveNeed(mkRow({}), NOW, null, null)).toBeNull();
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
      lead_status: 'new',
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

describe('deriveNeed — lines_flagged (C4)', () => {
  const proposalRow = (partial: Partial<DocumentStateRow> = {}) =>
    mkRow({
      engagement_kind: 'proposal',
      active_section: 'proposal',
      project_id: null,
      proposal_id: 'pr1',
      proposal_status: 'sent',
      proposal_sent_at: daysAgo(1),
      ...partial,
    });

  it('a flagged proposal → FLAGGED need naming the doc, not urgent', () => {
    const need = deriveNeed(proposalRow(), NOW, null, null, {
      count: 2,
      docTitle: 'Whitfield Residence',
      proposalId: 'pr1',
    });
    expect(need!.kind).toBe('lines_flagged');
    expect(need!.text).toBe('2 lines flagged on Whitfield Residence');
    expect(need!.stamp.label).toBe('FLAGGED');
    expect(need!.stamp.color).toBe('var(--color-clay)');
    expect(need!.urgent).toBe(false);
  });

  it('singularizes a single flagged line', () => {
    const need = deriveNeed(proposalRow(), NOW, null, null, {
      count: 1,
      docTitle: 'Olsen Penthouse',
      proposalId: 'pr1',
    });
    expect(need!.text).toBe('1 line flagged on Olsen Penthouse');
  });

  it('a flag outranks a silent hesitation on the same sent proposal', () => {
    // Sent 2d ago, unopened → hesitating on its own; a flag rises above it.
    const row = proposalRow({ proposal_sent_at: daysAgo(2) });
    expect(deriveNeed(row, NOW)!.kind).toBe('hesitating_proposal');
    expect(
      deriveNeed(row, NOW, null, null, { count: 1, docTitle: 'X', proposalId: 'pr1' })!.kind,
    ).toBe('lines_flagged');
  });

  it('does not fire without a flagged entry (null or count 0)', () => {
    const row = proposalRow({ proposal_sent_at: daysAgo(0.5) });
    expect(deriveNeed(row, NOW, null, null, null)).toBeNull();
    expect(
      deriveNeed(row, NOW, null, null, { count: 0, docTitle: 'X', proposalId: 'pr1' }),
    ).toBeNull();
  });

  it('a terminal proposal state still wins over a flag (accepted → SIGNED)', () => {
    const need = deriveNeed(
      proposalRow({ proposal_status: 'accepted' }),
      NOW,
      null,
      null,
      { count: 3, docTitle: 'X', proposalId: 'pr1' },
    );
    expect(need!.kind).toBe('proposal_signed');
  });
});

describe('partitionDesk — flagged lines (C4)', () => {
  it('threads flaggedLines by proposal_id into a lines_flagged folder', () => {
    const row = mkRow({
      engagement_id: 'e-flag',
      engagement_kind: 'proposal',
      project_id: null,
      proposal_id: 'pr1',
      proposal_status: 'viewed',
      proposal_sent_at: daysAgo(4),
      proposal_viewed_at: daysAgo(3),
    });
    const flagged = new Map([
      ['pr1', { count: 2, docTitle: 'Whitfield Residence', proposalId: 'pr1' }],
    ]);
    const { folders } = partitionDesk([row], NOW, undefined, undefined, flagged);
    expect(folders).toHaveLength(1);
    expect(folders[0].need.kind).toBe('lines_flagged');
  });

  it('ranks a flag under a terminal decline but above a fresh lead (NEED_RANK)', () => {
    const flaggedProp = mkRow({
      engagement_id: 'e-flag',
      engagement_kind: 'proposal',
      project_id: null,
      proposal_id: 'pr-flag',
      proposal_status: 'viewed',
      proposal_sent_at: daysAgo(5),
      proposal_viewed_at: daysAgo(3),
    });
    const declined = mkRow({
      engagement_id: 'e-declined',
      engagement_kind: 'proposal',
      project_id: null,
      proposal_id: 'pr-dec',
      proposal_status: 'declined',
    });
    const lead = mkRow({
      engagement_id: 'e-lead',
      engagement_kind: 'lead',
      project_id: null,
      lead_status: 'new',
      lead_response_deadline: daysAhead(5),
    });
    const flagged = new Map([['pr-flag', { count: 1, docTitle: 'X', proposalId: 'pr-flag' }]]);
    const { folders } = partitionDesk(
      [lead, flaggedProp, declined],
      NOW,
      undefined,
      undefined,
      flagged,
    );
    expect(folders.map((f) => f.need.kind)).toEqual([
      'proposal_declined',
      'lines_flagged',
      'new_lead',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R106 — the Arrival Arc: the parked-ceremony card (§3) + the four in-motion
// chip states (§4). Mirrors the C4 flagged-lines suites' style directly above.
// ─────────────────────────────────────────────────────────────────────────────

const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();

function mkCeremony(partial: Partial<DeskCeremonySignal> = {}): DeskCeremonySignal {
  return {
    id: 'cer-1',
    state: 'draft',
    introText: null,
    offeredSlots: null,
    offeredAt: null,
    pickedSlotStartsAt: null,
    timezone: null,
    threadId: null,
    ...partial,
  };
}

const leadRow = (partial: Partial<DocumentStateRow> = {}) =>
  mkRow({
    engagement_kind: 'lead',
    engagement_id: 'lead-1',
    active_section: 'brief',
    project_id: null,
    lead_id: 'lead-1',
    lead_status: 'new',
    client_name: 'Elena Vasquez',
    ...partial,
  });

const relationshipRow = (partial: Partial<DocumentStateRow> = {}) =>
  mkRow({
    engagement_kind: 'relationship',
    engagement_id: 'dc-1',
    active_section: 'discovery',
    project_id: null,
    lead_id: 'lead-1',
    client_name: 'Elena Vasquez',
    ...partial,
  });

describe('deriveNeed — ceremony_pending, the parked card (R106 §3)', () => {
  it('a draft ceremony on a claimed lead → "Introduce yourself to {first name}" folder', () => {
    const need = deriveNeed(leadRow(), NOW, null, null, null, mkCeremony({ state: 'draft' }));
    expect(need!.kind).toBe('ceremony_pending');
    expect(need!.text).toBe('Introduce yourself to Elena');
    expect(need!.stamp.label).toBe('CLAIMED · CEREMONY WAITING');
    expect(need!.stamp.color).toBe('var(--color-clay)');
    expect(need!.urgent).toBe(false);
    expect(need!.deepLink).toBe('/ceremony/lead-1');
  });

  it('a non-empty draft intro carries a truncated sub-line (scene 3b)', () => {
    const long = 'A'.repeat(80);
    const need = deriveNeed(
      leadRow(),
      NOW,
      null,
      null,
      null,
      mkCeremony({ state: 'draft', introText: long }),
    );
    expect(need!.sub).toBe(`Your draft is held — "${'A'.repeat(60)}…"`);
  });

  it('a short draft intro (under the truncation length) carries it verbatim, no ellipsis', () => {
    const need = deriveNeed(
      leadRow(),
      NOW,
      null,
      null,
      null,
      mkCeremony({ state: 'draft', introText: 'Elena, I loved the light in your living room' }),
    );
    expect(need!.sub).toBe(
      'Your draft is held — "Elena, I loved the light in your living room"',
    );
  });

  it('a blank/empty draft intro carries no sub-line', () => {
    const need = deriveNeed(
      leadRow(),
      NOW,
      null,
      null,
      null,
      mkCeremony({ state: 'draft', introText: '' }),
    );
    expect(need!.sub).toBeUndefined();
    const need2 = deriveNeed(
      leadRow(),
      NOW,
      null,
      null,
      null,
      mkCeremony({ state: 'draft', introText: '   ' }),
    );
    expect(need2!.sub).toBeUndefined();
  });

  it('no ceremony at all → the plain new_lead need, byte-identical to pre-arc behavior', () => {
    const withoutArg = deriveNeed(leadRow({ lead_response_deadline: daysAhead(5) }), NOW);
    const withNullCeremony = deriveNeed(
      leadRow({ lead_response_deadline: daysAhead(5) }),
      NOW,
      null,
      null,
      null,
      null,
    );
    expect(withoutArg!.kind).toBe('new_lead');
    expect(withoutArg).toEqual(withNullCeremony);
  });

  it('a ceremony past draft (sent/picked) on a Shape C row falls through unchanged — draft is the only trigger', () => {
    // Belt-and-braces: in practice a sent/picked ceremony's lead has already
    // left Shape C (leads.status flips to 'accepted' on send), but the guard
    // itself must key on ceremony.state, not mere presence of a row.
    const need = deriveNeed(
      leadRow({ lead_response_deadline: daysAhead(5) }),
      NOW,
      null,
      null,
      null,
      mkCeremony({ state: 'sent' }),
    );
    expect(need!.kind).toBe('new_lead');
  });

  it('ceremony_pending outranks the nurture (contacted) branch', () => {
    const need = deriveNeed(
      leadRow({ lead_status: 'contacted', lead_response_deadline: daysAhead(5) }),
      NOW,
      null,
      null,
      null,
      mkCeremony({ state: 'draft' }),
    );
    expect(need!.kind).toBe('ceremony_pending');
  });
});

describe('deriveMotion — the four ceremony chip states (R106 §4)', () => {
  it('picked → "Discovery · {Day time}" in the ceremony timezone, deep-linked to the fold', () => {
    // 2026-06-11 is a Thursday; 14:00 UTC in America/Chicago (UTC-5 in June, DST) = 9:00 AM.
    // Use an explicit UTC instant + a named zone so the formatted output is unambiguous.
    const motion = deriveMotion(
      relationshipRow(),
      NOW,
      null,
      mkCeremony({
        state: 'picked',
        pickedSlotStartsAt: '2026-06-11T19:00:00Z',
        timezone: 'America/Chicago',
      }),
    );
    expect(motion!.kind).toBe('discovery_scheduled');
    expect(motion!.text).toBe('Discovery · Thu 2:00 PM');
    expect(motion!.href).toBe('/doc/dc-1#discovery');
  });

  it('sent, every offered slot already past → slots_stale, deep-linked to the fold', () => {
    const motion = deriveMotion(
      relationshipRow(),
      NOW,
      null,
      mkCeremony({
        state: 'sent',
        offeredAt: hoursAgo(1),
        offeredSlots: [
          { id: 's1', starts_at: hoursAgo(2), duration_minutes: 45 },
          { id: 's2', starts_at: hoursAgo(3), duration_minutes: 45 },
        ],
      }),
    );
    expect(motion!.kind).toBe('slots_stale');
    // Nameless by ruling — the InMotionChip wrapper prefixes "{title} — ".
    expect(motion!.text).toBe('offered times went by — offer fresh ones');
    expect(motion!.href).toBe('/doc/dc-1#discovery');
  });

  it('sent, at LEAST one offered slot still future → not stale even if others have passed', () => {
    const motion = deriveMotion(
      relationshipRow(),
      NOW,
      null,
      mkCeremony({
        state: 'sent',
        offeredAt: hoursAgo(1),
        offeredSlots: [
          { id: 's1', starts_at: hoursAgo(2), duration_minutes: 45 },
          { id: 's2', starts_at: daysAhead(1), duration_minutes: 45 },
        ],
      }),
    );
    expect(motion!.kind).not.toBe('slots_stale');
  });

  it('sent, quiet exactly 48h → intro_nudge (inclusive boundary), thread href', () => {
    const motion = deriveMotion(
      relationshipRow(),
      NOW,
      null,
      mkCeremony({
        state: 'sent',
        offeredAt: hoursAgo(48),
        offeredSlots: [{ id: 's1', starts_at: daysAhead(1), duration_minutes: 45 }],
        threadId: 'thread-9',
      }),
    );
    expect(motion!.kind).toBe('intro_nudge');
    // Nameless by ruling — scene 04's own register verbatim.
    expect(motion!.text).toBe('quiet 48h — nudge, or offer fresh times');
    expect(motion!.href).toBe('/people?thread=thread-9');
  });

  it('sent, quiet 47h59m → still fresh (intro_sent), NOT the nudge (boundary)', () => {
    const motion = deriveMotion(
      relationshipRow(),
      NOW,
      null,
      mkCeremony({
        state: 'sent',
        offeredAt: hoursAgo(47.983), // 47h 59m
        offeredSlots: [{ id: 's1', starts_at: daysAhead(1), duration_minutes: 45 }],
      }),
    );
    expect(motion!.kind).toBe('intro_sent');
  });

  it('sent, fresh (well under 48h) → "intro sent, awaiting their pick"', () => {
    const motion = deriveMotion(
      relationshipRow(),
      NOW,
      null,
      mkCeremony({
        state: 'sent',
        offeredAt: hoursAgo(2),
        offeredSlots: [{ id: 's1', starts_at: daysAhead(1), duration_minutes: 45 }],
      }),
    );
    expect(motion!.kind).toBe('intro_sent');
    // Nameless + pronoun-neutral by ruling — the wrapper carries the name.
    expect(motion!.text).toBe('intro sent, awaiting their pick');
    expect(motion!.href).toBe('/doc/dc-1');
  });

  it('sent with no offered slots at all never reads as stale (empty array guard)', () => {
    const motion = deriveMotion(
      relationshipRow(),
      NOW,
      null,
      mkCeremony({ state: 'sent', offeredAt: hoursAgo(2), offeredSlots: [] }),
    );
    expect(motion!.kind).not.toBe('slots_stale');
    expect(motion!.kind).toBe('intro_sent');
  });

  it('no ceremony at all → the plain "Schedule the discovery call" line, byte-identical to pre-arc behavior', () => {
    const withoutArg = deriveMotion(relationshipRow(), NOW);
    const withNullCeremony = deriveMotion(relationshipRow(), NOW, null, null);
    expect(withoutArg).toEqual({ kind: 'in_discovery', text: 'Schedule the discovery call' });
    expect(withoutArg).toEqual(withNullCeremony);
  });

  it('a still-draft ceremony on a relationship row (defensive) falls through to the default line', () => {
    const motion = deriveMotion(relationshipRow(), NOW, null, mkCeremony({ state: 'draft' }));
    expect(motion).toEqual({ kind: 'in_discovery', text: 'Schedule the discovery call' });
  });
});

describe('partitionDesk — ceremonies wiring (R106)', () => {
  it('threads ceremoniesByLeadId into a ceremony_pending folder for a Shape C lead', () => {
    const row = leadRow({ lead_response_deadline: daysAhead(5) });
    const byLead = new Map([['lead-1', mkCeremony({ state: 'draft' })]]);
    const { folders } = partitionDesk([row], NOW, undefined, undefined, undefined, byLead);
    expect(folders).toHaveLength(1);
    expect(folders[0].need.kind).toBe('ceremony_pending');
  });

  it('threads ceremoniesByDesignerClientId into a chip for a Shape D relationship', () => {
    const row = relationshipRow();
    const byDc = new Map([
      ['dc-1', mkCeremony({ state: 'sent', offeredAt: hoursAgo(2), offeredSlots: [] })],
    ]);
    const { chips } = partitionDesk(
      [row],
      NOW,
      undefined,
      undefined,
      undefined,
      undefined,
      byDc,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].kind).toBe('intro_sent');
  });

  it('a lead ceremony never leaks onto a relationship lookup and vice versa (keyed correctly)', () => {
    const lead = leadRow({ lead_response_deadline: daysAhead(5) });
    const relationship = relationshipRow({ engagement_id: 'dc-2', lead_id: 'lead-2' });
    const byLead = new Map([['lead-1', mkCeremony({ state: 'draft' })]]);
    const byDc = new Map([
      ['dc-1', mkCeremony({ state: 'sent', offeredAt: hoursAgo(2), offeredSlots: [] })],
    ]);
    const { folders, chips } = partitionDesk(
      [lead, relationship],
      NOW,
      undefined,
      undefined,
      undefined,
      byLead,
      byDc,
    );
    expect(folders).toHaveLength(1);
    expect(folders[0].need.kind).toBe('ceremony_pending');
    // The relationship's OWN designer_client_id ('dc-2') isn't in byDc, so it
    // gets the default in_discovery chip, not the 'dc-1' ceremony's state.
    expect(chips).toHaveLength(1);
    expect(chips[0].kind).toBe('in_discovery');
  });

  it('ceremony_pending ranks alongside new_lead — above hesitating, below overdue', () => {
    const parked = leadRow({ engagement_id: 'lead-parked', lead_id: 'lead-parked' });
    const overdue = mkRow({
      engagement_id: 'e-dec',
      overdue_decision_count: 1,
      earliest_overdue_due: daysAgo(1),
    });
    const hesitating = mkRow({
      engagement_id: 'e-hes',
      engagement_kind: 'proposal',
      project_id: null,
      proposal_status: 'sent',
      proposal_sent_at: daysAgo(5),
    });
    const byLead = new Map([['lead-parked', mkCeremony({ state: 'draft' })]]);
    const { folders } = partitionDesk(
      [hesitating, parked, overdue],
      NOW,
      undefined,
      undefined,
      undefined,
      byLead,
    );
    expect(folders.map((f) => f.need.kind)).toEqual([
      'overdue_decision',
      'ceremony_pending',
      'hesitating_proposal',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R108 / R113 — the schedule tiers take their place in the existing stacks
// without displacing anything above them.
// ─────────────────────────────────────────────────────────────────────────────

const schedule = (over: Partial<DeskScheduleInput> = {}): DeskScheduleInput => ({
  selection: { activePhaseId: 'ph1', reason: 'today-in-window' },
  fidelity: 'committed',
  positionText: 'Week 3',
  activePhaseName: 'Design Development',
  unconfigured: null,
  ...over,
});

describe('schedule tiers in the desk stacks (R108 / R113)', () => {
  it('the whole needs stack sorts the setup nudge under the collision and the task', () => {
    const rows = [
      mkRow({ engagement_id: 'e-setup', project_id: 'proj-setup', active_section: 'project' }),
      mkRow({
        engagement_id: 'e-task',
        project_id: 'proj-task',
        due_task_count: 1,
        earliest_task_due: daysAgo(1),
        due_task_title: 'Order the sconces',
      }),
      mkRow({
        engagement_id: 'e-overdue',
        project_id: 'proj-overdue',
        overdue_decision_count: 1,
        earliest_overdue_due: daysAgo(2),
      }),
    ];
    const { folders } = partitionDesk(
      rows,
      NOW,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Map<string, DeskScheduleInput>(),
    );

    expect(folders.map((f) => f.need.kind)).toEqual([
      'overdue_decision',
      'task_due',
      'schedule_unconfigured',
    ]);
  });

  it('a positioned project renders a schedule_position chip rather than falling silent', () => {
    const rows = [mkRow({ engagement_id: 'e1', project_id: 'proj-a' })];
    const { chips, folders } = partitionDesk(
      rows,
      NOW,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Map([['proj-a', schedule()]]),
    );

    expect(folders).toHaveLength(0);
    expect(chips).toEqual([
      expect.objectContaining({
        kind: 'schedule_position',
        text: 'Design Development · Week 3',
      }),
    ]);
  });

  it('the in-flight chip still wins when the schedule has nothing to say', () => {
    const motion = deriveMotion(
      mkRow({ in_flight_count: 2 }),
      NOW,
      null,
      null,
      schedule({ selection: { activePhaseId: null, reason: 'none' }, positionText: null }),
    );
    expect(motion?.kind).toBe('in_flight');
  });

  it('a paused row states nothing about its schedule', () => {
    expect(deriveMotion(mkRow({ is_paused: true }), NOW, null, null, schedule())).toEqual({
      kind: 'paused',
      text: 'Paused',
    });
    expect(deriveNeed(mkRow({ is_paused: true }), NOW, null, null, null, null, schedule({
      unconfigured: 'no-phases',
    }))).toBeNull();
  });
});
