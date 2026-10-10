/**
 * N1 (US-25) — a need's key, and `deriveNeeds` printing one line per key.
 * Pure logic, no DOM.
 */
import {
  deriveNeeds,
  type DeskConflictInput,
  type DeskHeldReleaseSignal,
  type DeskScheduleInput,
  type DocumentStateRow,
  type ReceivableSignal,
} from '../desk-derivation';
import { needKeyOf } from '../need-key';

const NOW = new Date('2026-09-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function mkRow(partial: Partial<DocumentStateRow> = {}): DocumentStateRow {
  return {
    engagement_kind: 'project',
    engagement_id: 'e-holloway',
    project_id: 'p-holloway',
    proposal_id: null,
    lead_id: null,
    title: 'Holloway Residence',
    client_name: 'Mei Holloway',
    active_section: 'project',
    is_paused: false,
    is_archived: false,
    overdue_decision_count: 0,
    awaiting_inspection_count: 0,
    open_claim_count: 0,
    unsent_pulse_count: 0,
    draft_unsent_po_count: 0,
    oldest_draft_po_created_at: null,
    unacked_po_count: 0,
    oldest_unacked_sent_at: null,
    unacked_po_label: null,
    updated_at: daysAgo(1),
    ...partial,
  } as DocumentStateRow;
}

const RECEIVABLE: ReceivableSignal = {
  count: 1,
  invoiceId: 'inv-0721',
  invoiceLabel: 'INV-2026-0721',
  oldestDue: '2026-09-01',
  totalBalanceCents: 380_000,
} as ReceivableSignal;

const HELD: DeskHeldReleaseSignal = {
  purchaseOrderId: 'po-held-1',
  vendorName: 'Ferro Works',
  totalCents: 120_000,
  heldAt: daysAgo(2),
  heldByName: 'Sam Ito',
  viewerCanRelease: true,
};

const holloway = () =>
  mkRow({
    unacked_po_count: 1,
    oldest_unacked_sent_at: daysAgo(9),
    unacked_po_label: 'PO-HD-0412',
  });

describe('needKeyOf', () => {
  const base = {
    kind: 'overdue_invoice' as const,
    text: 'INV-2026-0721 · $3,800 overdue',
    actionLabel: 'Send a reminder',
    stamp: { label: 'PAST DUE', color: 'red' },
    urgent: false,
    owner: 'client' as const,
  };

  it('is kind and record where the need names one record', () => {
    expect(needKeyOf({ ...base, recordId: 'inv-0721' }, 'p-holloway')).toBe(
      'overdue_invoice:inv-0721',
    );
  });

  it('is kind and project for an aggregate', () => {
    expect(needKeyOf(base, 'p-holloway')).toBe('overdue_invoice:project:p-holloway');
  });

  it('never reads the wording: a reworded need keeps its key', () => {
    expect(needKeyOf({ ...base, text: 'Something else entirely', recordId: 'inv-0721' }, 'x')).toBe(
      needKeyOf({ ...base, recordId: 'inv-0721' }, 'y'),
    );
  });
});

describe('deriveNeeds · N1 keys', () => {
  it('the same inputs give the same keys, whatever day it is read', () => {
    const first = deriveNeeds(holloway(), NOW, null, RECEIVABLE).map((n) => n.key);
    const later = deriveNeeds(
      holloway(),
      new Date(NOW.getTime() + 3 * 86_400_000),
      null,
      RECEIVABLE,
    ).map((n) => n.key);
    expect(first).toEqual(['overdue_invoice:inv-0721', 'po_unacknowledged:project:p-holloway']);
    expect(later).toEqual(first);
  });

  it('Holloway: the overdue invoice and the PO-HD-0412 silence are two needs, both kept', () => {
    const needs = deriveNeeds(holloway(), NOW, null, RECEIVABLE);
    expect(needs.map((n) => n.kind)).toEqual(['overdue_invoice', 'po_unacknowledged']);
    expect(needs[1].text).toBe('PO-HD-0412 sent — no acknowledgment');
    // The silence carries when the PO went out, for the age order.
    expect(needs[1].at).toBe(daysAgo(9));
  });

  it('a lead or proposal with no project keys its aggregate on the engagement', () => {
    const [need] = deriveNeeds(
      mkRow({
        engagement_kind: 'proposal',
        engagement_id: 'prop-e1',
        project_id: null,
        proposal_id: null,
        proposal_status: 'accepted',
      }),
      NOW,
    );
    expect(need.key).toBe('proposal_signed:project:prop-e1');
  });

  it('prints one line for a key two rules both reach — the first rule’s', () => {
    const conflict: DeskConflictInput = {
      collision: { text: 'Install collides with the delivery window', label: 'COLLISION', date: null },
      drift: null,
    };
    const schedule = { contradictionText: 'The install is set before delivery' } as DeskScheduleInput;
    const needs = deriveNeeds(mkRow(), NOW, conflict, null, null, null, schedule);
    const conflicts = needs.filter((n) => n.kind === 'schedule_conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].text).toContain('Install collides');
    expect(new Set(needs.map((n) => n.key)).size).toBe(needs.length);
  });

  it('a held order and the drafted-unsent POs share a kind but are two needs', () => {
    const row = mkRow({ draft_unsent_po_count: 2, oldest_draft_po_created_at: daysAgo(6) });
    const needs = deriveNeeds(
      row,
      NOW,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      [HELD],
    );
    const unsent = needs.filter((n) => n.kind === 'po_unsent');
    expect(unsent.map((n) => n.key)).toEqual([
      'po_unsent:po-held-1',
      'po_unsent:project:p-holloway',
    ]);
    expect(unsent[0].at).toBe(HELD.heldAt);
  });
});
