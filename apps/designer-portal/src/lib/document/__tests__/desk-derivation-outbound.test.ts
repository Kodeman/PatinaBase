/**
 * US-31 B5a — staged outbound drafts join the C-28 draft need: one line per
 * project folder, counting procurement letters and outbound messages together
 * ("4 ready to send — review and send"), under the existing DRAFTED stamp.
 */
import { buildDeskDrafts, buildDeskStudioDrafts } from '@/hooks/use-desk-engagements';
import {
  deskActionLabel,
  deskNeedText,
  deriveNeeds,
  partitionDesk,
  readyToSendText,
  studioOutboundNeed,
  type DeskDraftSignal,
  type DocumentStateRow,
} from '../desk-derivation';

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

const NOW = new Date('2026-10-13T12:00:00Z');

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
    updated_at: '2026-10-12T12:00:00Z',
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

const letter = (over: Partial<DeskDraftSignal> = {}): DeskDraftSignal => ({
  id: 'letter-1',
  kind: 'ack_discrepancy_reply',
  status: 'awaiting_review',
  to_email: 'orders@hale.test',
  subject: 'PO 1042: acknowledgment differences',
  body: 'Hello',
  created_at: '2026-10-13T09:00:00Z',
  ...over,
});

const staged = (over: Partial<DeskDraftSignal> = {}): DeskDraftSignal => ({
  id: 'out-1',
  kind: 'invoice_reminder',
  status: 'awaiting_review',
  to_email: 'greta@whitfield.test',
  subject: 'Invoice 1001',
  body: 'A reminder',
  created_at: '2026-10-13T08:00:00Z',
  outbound: { channel: 'email', recipientKind: 'client' },
  ...over,
});

const draftNeedOf = (drafts: DeskDraftSignal[]) =>
  deriveNeeds(mkRow(), NOW, null, null, null, null, null, null, null, null, drafts).find(
    (n) => n.stamp.label === 'DRAFTED',
  );

describe('US-31 B5a ready-to-send need', () => {
  it('counts outbound drafts with procurement letters on one line', () => {
    const need = draftNeedOf([
      letter(),
      letter({ id: 'letter-2', kind: 'ack_chase', created_at: '2026-10-13T10:00:00Z' }),
      staged(),
      staged({ id: 'out-2', kind: 'trade_day_of', outbound: { channel: 'sms', recipientKind: 'trade' } }),
    ]);
    expect(need?.text).toBe('4 ready to send — review and send');
    expect(need?.outbound).toEqual({ count: 2 });
    expect(need?.stamp.label).toBe('DRAFTED');
    expect(need?.actionLabel).toBe('Review and send');
    // The procurement letter keeps its kind, key and draft.
    expect(need?.kind).toBe('ack_discrepancy');
    expect(need?.recordId).toBe('letter-1');
    expect(need?.draft?.id).toBe('letter-1');
    // The line is as old as its oldest held draft.
    expect(need?.at).toBe('2026-10-13T08:00:00Z');
  });

  it('rises on outbound drafts alone, with no procurement draft to carry', () => {
    const need = draftNeedOf([staged(), staged({ id: 'out-2', created_at: '2026-10-13T11:00:00Z' })]);
    expect(need?.text).toBe('2 ready to send — review and send');
    expect(need?.kind).toBe('po_unsent');
    expect(need?.recordId).toBe('out-1');
    expect(need?.draft).toBeUndefined();
    expect(need?.outbound).toEqual({ count: 2 });
  });

  it('names a single message as one', () => {
    expect(draftNeedOf([staged()])?.text).toBe('One ready to send — review and send');
    expect(readyToSendText(4)).toBe('4 ready to send — review and send');
  });

  it('counts only drafts awaiting review', () => {
    const need = draftNeedOf([
      staged(),
      staged({ id: 'out-2', status: 'sending' }),
      staged({ id: 'out-3', status: 'sent' }),
      letter({ status: 'sending' }),
    ]);
    expect(need?.text).toBe('One ready to send — review and send');
    expect(need?.outbound).toEqual({ count: 1 });
  });

  it('surfaces a sending draft only after its ten-minute claim stalls, with Retry access', () => {
    const need = draftNeedOf([
      staged({
        status: 'sending',
        claimed_at: '2026-10-13T11:49:00Z',
        updated_at: '2026-10-13T11:49:00Z',
      }),
    ]);
    expect(need?.text).toBe("1 didn't finish sending — check it");
    expect(need?.outbound).toEqual({ count: 1 });
    expect(need?.actionLabel).toBe('Review and send');
    expect(
      draftNeedOf([staged({ status: 'sending', claimed_at: '2026-10-13T11:51:00Z' })]),
    ).toBeUndefined();
  });

  it('keeps the procurement-only line exactly as before', () => {
    const one = draftNeedOf([letter()]);
    expect(one?.text).toBe('Reply to the maker drafted — the acknowledgment differs');
    expect(one?.outbound).toBeUndefined();
    const two = draftNeedOf([letter(), letter({ id: 'letter-2' })]);
    expect(two?.text).toBe('2 letters drafted — review and send');
  });

  it('names the review as its act under one-voice, not the held draft', () => {
    const need = draftNeedOf([letter(), staged()])!;
    expect(deskActionLabel(need, true)).toBe('Review and send');
    expect(deskNeedText(need, true)).toBe('2 ready to send — review and send');
  });

  it('builds outbound rows into the project map, marked outbound', () => {
    const map = buildDeskDrafts(
      [{ id: 'letter-1', project_id: 'p1', kind: 'ack_chase', status: 'awaiting_review', subject: 's', body: 'b', created_at: '2026-10-13T09:00:00Z' }],
      [
        { id: 'out-1', project_id: 'p1', kind: 'trade_day_of', channel: 'sms', recipient_kind: 'trade', status: 'awaiting_review', to_address: '+15550100', subject: null, body: 'Tomorrow 8am', created_at: '2026-10-13T08:00:00Z' },
        { id: 'out-2', project_id: null, kind: 'invoice_reminder', channel: 'email', recipient_kind: 'client', status: 'awaiting_review', subject: 'x', body: 'y', created_at: '2026-10-13T08:00:00Z' },
      ],
    )!;
    const p1 = map.get('p1')!;
    expect(p1.map((d) => d.id).sort()).toEqual(['letter-1', 'out-1']);
    const out = p1.find((d) => d.id === 'out-1')!;
    expect(out.outbound).toEqual({ channel: 'sms', recipientKind: 'trade' });
    expect(out.to_email).toBe('+15550100');
    expect(out.subject).toBe('');
    expect(p1.find((d) => d.id === 'letter-1')!.outbound).toBeUndefined();
  });

  it('builds null-project drafts as a separate studio population and need', () => {
    const studioDrafts = buildDeskStudioDrafts([
      {
        id: 'studio-invoice',
        organization_id: 'studio-1',
        project_id: null,
        kind: 'invoice_reminder',
        channel: 'email',
        recipient_kind: 'client',
        status: 'awaiting_review',
        to_address: 'owner@example.test',
        subject: 'Invoice reminder',
        body: 'Please review.',
        created_at: '2026-10-13T08:00:00Z',
      },
      {
        id: 'other-studio-invoice',
        organization_id: 'studio-2',
        project_id: null,
        kind: 'invoice_reminder',
        channel: 'email',
        recipient_kind: 'client',
        status: 'awaiting_review',
        to_address: 'other@example.test',
        subject: 'Other invoice',
        body: 'Not this studio.',
        created_at: '2026-10-13T08:01:00Z',
      },
      { id: 'project-draft', project_id: 'p1', status: 'awaiting_review' },
    ], 'studio-1');
    expect(studioDrafts.map((draft) => draft.id)).toEqual(['studio-invoice']);
    expect(studioDrafts[0].organization_id).toBe('studio-1');
    expect(studioOutboundNeed(studioDrafts, NOW)).toMatchObject({
      recordId: 'studio-invoice',
      kind: 'po_unsent',
      text: 'One ready to send — review and send',
      outbound: { count: 1 },
    });
  });

  it('lands on the folder through partitionDesk', () => {
    const drafts = buildDeskDrafts([], [
      { id: 'out-1', project_id: 'p1', kind: 'invoice_reminder', channel: 'email', recipient_kind: 'client', status: 'awaiting_review', to_address: 'g@w.test', subject: 'x', body: 'y', created_at: '2026-10-13T08:00:00Z' },
    ]);
    const { folders } = partitionDesk(
      [mkRow()], NOW, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, drafts,
    );
    expect(folders).toHaveLength(1);
    expect(folders[0]!.need.text).toBe('One ready to send — review and send');
    expect(folders[0]!.need.outbound).toEqual({ count: 1 });
  });
});
