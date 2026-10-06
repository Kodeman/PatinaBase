/**
 * C-28: a procurement draft awaiting review rises as a Desk need that carries
 * the draft, so the folder face can mount its review.
 */
import {
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
