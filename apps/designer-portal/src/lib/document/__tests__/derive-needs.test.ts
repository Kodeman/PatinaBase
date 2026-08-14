/**
 * deriveNeeds — the whole chain, where deriveNeed reads only its head.
 * Pure logic, no DOM (same import discipline as desk-derivation.test.ts).
 */
import {
  deriveNeed,
  deriveNeeds,
  partitionDesk,
  type DeskCeremonySignal,
  type DocumentStateRow,
} from '../desk-derivation';

const NOW = new Date('2026-06-11T12:00:00Z');
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

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
  } as DocumentStateRow;
}

const RECEIVABLE = {
  count: 1,
  invoiceId: 'inv-1',
  invoiceLabel: 'Invoice 004',
  oldestDue: '2026-06-01',
};

const CEREMONY: DeskCeremonySignal = {
  id: 'cer-1',
  state: 'draft',
  introText: 'Elena, I keep thinking about what you said',
  offeredSlots: null,
  offeredAt: null,
  pickedSlotStartsAt: null,
  timezone: null,
  threadId: null,
};

/** One case per NeedKind the chain can reach from a single row, plus the quiet
 *  cases — the contract under test is that deriveNeed still equals the head. */
const CASES: ReadonlyArray<{
  name: string;
  args: Parameters<typeof deriveNeeds>;
}> = [
  { name: 'a quiet active project', args: [mkRow({}), NOW] },
  {
    name: 'overdue decisions',
    args: [
      mkRow({ overdue_decision_count: 2, earliest_overdue_due: '2026-06-01' }),
      NOW,
    ],
  },
  {
    name: 'an overdue receivable',
    args: [mkRow({}), NOW, null, RECEIVABLE],
  },
  {
    name: 'a signed proposal',
    args: [
      mkRow({
        engagement_kind: 'proposal',
        proposal_id: 'pr-1',
        project_id: null,
        proposal_status: 'accepted',
      }),
      NOW,
    ],
  },
  {
    name: 'a hesitating proposal',
    args: [
      mkRow({
        engagement_kind: 'proposal',
        proposal_id: 'pr-1',
        project_id: null,
        proposal_status: 'sent',
        proposal_sent_at: daysAgo(4),
      }),
      NOW,
    ],
  },
  {
    name: 'a proposal still inside the waiting window',
    args: [
      mkRow({
        engagement_kind: 'proposal',
        proposal_id: 'pr-1',
        project_id: null,
        proposal_status: 'sent',
        proposal_sent_at: daysAgo(1),
      }),
      NOW,
    ],
  },
  {
    name: 'a new lead',
    args: [
      mkRow({
        engagement_kind: 'lead',
        lead_id: 'l-1',
        project_id: null,
        lead_status: 'new',
        lead_response_deadline: daysAhead(3),
      }),
      NOW,
    ],
  },
  {
    name: 'a parked ceremony',
    args: [
      mkRow({
        engagement_kind: 'lead',
        lead_id: 'l-1',
        project_id: null,
        lead_status: 'new',
      }),
      NOW,
      null,
      null,
      null,
      CEREMONY,
    ],
  },
  {
    name: 'an open damage claim',
    args: [mkRow({ open_claim_count: 1, open_claim_po: 'PO-9' }), NOW],
  },
  {
    name: 'pieces awaiting inspection',
    args: [mkRow({ awaiting_inspection_count: 3 }), NOW],
  },
  {
    name: 'a task due',
    args: [
      mkRow({
        due_task_count: 1,
        earliest_task_due: '2026-06-10',
        due_task_title: 'Confirm the fabric',
      } as Partial<DocumentStateRow>),
      NOW,
    ],
  },
  {
    name: 'an unsent PO',
    args: [
      mkRow({
        draft_unsent_po_count: 1,
        oldest_draft_po_created_at: daysAgo(3),
        draft_po_label: 'PO-11',
      }),
      NOW,
    ],
  },
  {
    name: 'an unacknowledged PO',
    args: [
      mkRow({
        unacked_po_count: 2,
        oldest_unacked_sent_at: daysAgo(3),
      }),
      NOW,
    ],
  },
  {
    name: 'a Friday pulse',
    args: [mkRow({ unsent_pulse_count: 1, pulse_week_of: '2026-06-08' }), NOW],
  },
  {
    name: 'an archived row',
    args: [mkRow({ is_archived: true, overdue_decision_count: 4 }), NOW],
  },
  {
    name: 'a paused row',
    args: [mkRow({ is_paused: true, overdue_decision_count: 4 }), NOW],
  },
];

describe('deriveNeeds', () => {
  it.each(CASES)('keeps deriveNeed as its head for $name', ({ args }) => {
    expect(deriveNeeds(...args)[0] ?? null).toEqual(deriveNeed(...args));
  });

  it('reads out every simultaneous need in chain order', () => {
    const row = mkRow({
      overdue_decision_count: 1,
      earliest_overdue_due: '2026-06-01',
      due_task_count: 1,
      earliest_task_due: '2026-06-10',
      due_task_title: 'Confirm the fabric',
    } as Partial<DocumentStateRow>);
    const needs = deriveNeeds(row, NOW, null, RECEIVABLE);
    expect(needs.map((need) => need.kind)).toEqual([
      'overdue_decision',
      'overdue_invoice',
      'task_due',
    ]);
    expect(deriveNeed(row, NOW, null, RECEIVABLE)).toEqual(needs[0]);
  });

  it('gathers the delivery and send-weave needs together', () => {
    const needs = deriveNeeds(
      mkRow({
        open_claim_count: 1,
        open_claim_po: 'PO-9',
        awaiting_inspection_count: 2,
        unacked_po_count: 1,
        oldest_unacked_sent_at: daysAgo(3),
      }),
      NOW,
    );
    expect(needs.map((need) => need.kind)).toEqual([
      'damage_claim',
      'awaiting_inspection',
      'po_unacknowledged',
    ]);
  });

  it('needs nothing from an archived or paused engagement', () => {
    expect(
      deriveNeeds(mkRow({ is_archived: true, open_claim_count: 3 }), NOW),
    ).toEqual([]);
    expect(
      deriveNeeds(mkRow({ is_paused: true, open_claim_count: 3 }), NOW),
    ).toEqual([]);
  });

  // The proposal and lead blocks owned their rows outright before the chain was
  // cut into rules: nothing below them could ever be reached for those kinds.
  it('lets a proposal keep its own chain', () => {
    const needs = deriveNeeds(
      mkRow({
        engagement_kind: 'proposal',
        proposal_id: 'pr-1',
        project_id: null,
        proposal_status: 'accepted',
        open_claim_count: 2,
        unacked_po_count: 1,
        oldest_unacked_sent_at: daysAgo(3),
      }),
      NOW,
    );
    expect(needs.map((need) => need.kind)).toEqual(['proposal_signed']);
  });

  it('lets a quiet lead end the chain', () => {
    expect(
      deriveNeeds(
        mkRow({
          engagement_kind: 'lead',
          lead_id: 'l-1',
          project_id: null,
          lead_status: 'accepted',
          open_claim_count: 2,
        }),
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('partitionDesk', () => {
  it('carries the whole chain on the folder beside its head', () => {
    const row = mkRow({
      overdue_decision_count: 1,
      earliest_overdue_due: '2026-06-01',
      open_claim_count: 1,
      open_claim_po: 'PO-9',
    });
    const { folders } = partitionDesk([row], NOW);
    expect(folders).toHaveLength(1);
    expect(folders[0]!.needs?.map((need) => need.kind)).toEqual([
      'overdue_decision',
      'damage_claim',
    ]);
    expect(folders[0]!.need).toEqual(folders[0]!.needs![0]);
  });
});
