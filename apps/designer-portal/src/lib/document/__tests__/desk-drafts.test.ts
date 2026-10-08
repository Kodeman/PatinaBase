/**
 * C-28: a procurement draft awaiting review rises as a Desk need that carries
 * the draft, so the folder face can mount its review.
 */
import { buildDeskDrafts } from '@/hooks/use-desk-engagements';
import {
  deskActionLabel,
  deskNeedText,
  deriveNeeds,
  partitionDesk,
  type DeskDraftSignal,
  type DocumentStateRow,
} from '../desk-derivation';

const NOW = new Date('2026-10-06T12:00:00Z');

function mkRow(partial: Partial<DocumentStateRow> = {}): DocumentStateRow {
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
    updated_at: '2026-10-05T12:00:00Z',
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

const draft = (over: Partial<DeskDraftSignal>): DeskDraftSignal => ({
  id: 'draft-1',
  kind: 'ack_discrepancy_reply',
  status: 'awaiting_review',
  to_email: 'orders@hale.test',
  subject: 'PO 1042: acknowledgment differences',
  body: 'Hello',
  created_at: '2026-10-06T09:00:00Z',
  ...over,
});

const needsWith = (drafts: DeskDraftSignal[]) =>
  deriveNeeds(mkRow(), NOW, null, null, null, null, null, null, null, null, drafts);

describe('C-28 draft review need', () => {
  it.each([
    ['ack_discrepancy_reply', 'ack_discrepancy'],
    ['ack_chase', 'po_unacknowledged'],
    ['receiver_inbound_notice', 'po_unsent'],
    ['vendor_claim_notice', 'exception_open'],
    // R37: the install reading's ask, held for review, reaches the Desk drafts.
    ['maker_eta_request', 'po_unacknowledged'],
  ])('a %s draft rides the %s need and carries the draft', (kind, needKind) => {
    const d = draft({ kind });
    const [need] = needsWith([d]);
    expect(need.kind).toBe(needKind);
    expect(need.draft).toBe(d);
    expect(need.actionLabel).toBe('Review and send');
    expect(need.stamp.label).toBe('DRAFTED');
    expect(need.owner).toBe('designer');
  });

  it('carries the oldest draft and counts them all', () => {
    const newer = draft({ id: 'draft-new', created_at: '2026-10-06T10:00:00Z' });
    const older = draft({ id: 'draft-old', kind: 'vendor_claim_notice', created_at: '2026-10-05T10:00:00Z' });
    const [need] = needsWith([newer, older]);
    expect(need.draft?.id).toBe('draft-old');
    expect(need.kind).toBe('exception_open');
    expect(need.text).toBe('2 letters drafted — review and send');
  });

  it('a sent, discarded or unknown-kind draft raises nothing', () => {
    expect(
      needsWith([
        draft({ status: 'sent' }),
        draft({ id: 'd2', status: 'discarded' }),
        draft({ id: 'd3', kind: 'client_delay_note' }),
      ]),
    ).toEqual([]);
  });

  it('partitionDesk hands each project its drafts, and the folder leads with the draft need', () => {
    const drafts = new Map([['p1', [draft({})]]]);
    const { folders } = partitionDesk(
      [mkRow(), mkRow({ engagement_id: 'e2', project_id: 'p2', title: 'Other' })],
      NOW,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      drafts,
    );
    expect(folders).toHaveLength(1);
    expect(folders[0].row.project_id).toBe('p1');
    expect(folders[0].need.draft?.id).toBe('draft-1');
  });
});

// US-19 FR2 499-9 / 506-6 — under `one-voice` a held draft's act is the
// control it lands on, and a held date request names its maker.
describe('FR2 — the Desk speaks a held draft by its landing control', () => {
  it('names every held draft Open the held draft, never Follow up with the maker', () => {
    for (const kind of ['ack_discrepancy_reply', 'ack_chase', 'maker_eta_request']) {
      const [need] = needsWith([draft({ kind })]);
      expect(deskActionLabel(need, false)).toBe('Review and send');
      expect(deskActionLabel(need, true)).toBe('Open the held draft');
    }
  });

  it('prints a date request as Date request to {maker} drafted — not sent.', () => {
    const [need] = needsWith([draft({ kind: 'maker_eta_request', maker: 'Fixture Metalworks' })]);
    expect(deskNeedText(need, false)).toBe('Arrival date request to the maker drafted');
    expect(deskNeedText(need, true)).toBe('Date request to Fixture Metalworks drafted — not sent.');
  });

  it('leaves every other draft sentence as it is', () => {
    const [need] = needsWith([draft({})]);
    expect(deskNeedText(need, true)).toBe(need.text);
  });

  it('buildDeskDrafts reads the maker off the draft line in R42 order', () => {
    const base = {
      id: 'd1',
      project_id: 'p1',
      kind: 'maker_eta_request',
      status: 'awaiting_review',
      to_email: null,
      subject: 's',
      body: 'b',
      created_at: '2026-10-06T09:00:00Z',
    };
    const map = buildDeskDrafts([
      {
        ...base,
        ffe_item: {
          vendor_name: null,
          purchase_order: { vendor: { name: 'Hewn' } },
          product: { brand: 'Brand' },
        },
      },
      { ...base, id: 'd2', kind: 'ack_chase', ffe_item: null },
    ])!;
    const [eta, chase] = map.get('p1')!;
    expect(eta.maker).toBe('Hewn');
    expect(chase).not.toHaveProperty('maker');
  });
});
