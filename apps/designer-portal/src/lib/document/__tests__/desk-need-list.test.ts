/**
 * N2 (US-25) — every need of every job, in the band's own Next order.
 * Pure logic, no DOM.
 */
import {
  partitionDesk,
  type DocumentStateRow,
  type NeedKind,
  type NeedLine,
  type ReceivableSignal,
} from '../desk-derivation';
import { deriveDeskNeedList, rankDeskNeeds, type DeskNeed } from '../desk-need-list';
import { needKeyOf } from '../need-key';

const NOW = new Date('2026-09-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function line(kind: NeedKind, over: Partial<NeedLine> = {}): Omit<NeedLine, 'key'> {
  return {
    kind,
    text: `${kind} need`,
    actionLabel: 'Act',
    stamp: { label: 'X', color: 'red' },
    urgent: false,
    owner: 'designer',
    ...over,
  };
}

function deskNeed(projectId: string, kind: NeedKind, over: Partial<NeedLine> = {}): DeskNeed {
  const need = line(kind, over);
  const key = needKeyOf(need, projectId);
  return { key, projectId, projectName: `${projectId} house`, need: { ...need, key } };
}

const order = (needs: DeskNeed[]) => needs.map((n) => `${n.projectId}/${n.need.kind}`);

describe('rankDeskNeeds', () => {
  it('a maker silence 12 days old ranks above an undated Pulse and the setup chore', () => {
    // claimBand's order put the designer's own Pulse and setup first and the
    // maker's silence last; the band's order reads class, deadline, then age.
    const ranked = rankDeskNeeds(
      [
        deskNeed('a', 'schedule_unconfigured'),
        deskNeed('b', 'pulse_due'),
        deskNeed('c', 'po_unacknowledged', {
          owner: 'maker',
          dueOn: daysAgo(12),
          at: daysAgo(12),
        }),
      ],
      NOW,
    );
    expect(order(ranked)).toEqual(['c/po_unacknowledged', 'b/pulse_due', 'a/schedule_unconfigured']);
  });

  it('a client’s overdue invoice (class 1) ranks above every class-2 Pulse', () => {
    const ranked = rankDeskNeeds(
      [
        deskNeed('a', 'pulse_due'),
        deskNeed('b', 'pulse_due'),
        deskNeed('c', 'overdue_invoice', { owner: 'client', dueOn: '2026-09-15', recordId: 'inv-c' }),
      ],
      NOW,
    );
    expect(order(ranked)).toEqual(['c/overdue_invoice', 'a/pulse_due', 'b/pulse_due']);
  });

  it('the older of two silences ranks first; equal needs keep the order given', () => {
    const silence = (projectId: string, days: number) =>
      deskNeed(projectId, 'po_unacknowledged', { owner: 'maker', dueOn: daysAgo(days), at: daysAgo(days) });
    expect(order(rankDeskNeeds([silence('fresh', 3), silence('stale', 12)], NOW))).toEqual([
      'stale/po_unacknowledged',
      'fresh/po_unacknowledged',
    ]);
    expect(order(rankDeskNeeds([deskNeed('x', 'pulse_due'), deskNeed('y', 'pulse_due')], NOW))).toEqual([
      'x/pulse_due',
      'y/pulse_due',
    ]);
  });

  it('prints one line per key — the first one handed in', () => {
    const first = deskNeed('a', 'po_unsent', { text: 'Two POs drafted — not yet sent' });
    const again = { ...first, need: { ...first.need, text: 'Same need, said again' } };
    const ranked = rankDeskNeeds([first, again, deskNeed('b', 'po_unsent')], NOW);
    expect(ranked.map((n) => n.key)).toEqual(['po_unsent:project:a', 'po_unsent:project:b']);
    expect(ranked[0].need.text).toBe('Two POs drafted — not yet sent');
  });

  it('never folds two jobs’ needs together for saying the same words', () => {
    const ranked = rankDeskNeeds([deskNeed('a', 'pulse_due'), deskNeed('b', 'pulse_due')], NOW);
    expect(ranked).toHaveLength(2);
  });
});

describe('deriveDeskNeedList', () => {
  function mkRow(partial: Partial<DocumentStateRow>): DocumentStateRow {
    return {
      engagement_kind: 'project',
      proposal_id: null,
      lead_id: null,
      client_name: 'Mei Holloway',
      active_section: 'project',
      current_phase: 'procurement',
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
      updated_at: daysAgo(1),
      ...partial,
    } as DocumentStateRow;
  }

  const holloway = mkRow({
    engagement_id: 'e-holloway',
    project_id: 'p-holloway',
    title: 'Holloway Residence',
    unacked_po_count: 1,
    oldest_unacked_sent_at: daysAgo(9),
    unacked_po_label: 'PO-HD-0412',
  });
  const pell = mkRow({
    engagement_id: 'e-pell',
    project_id: 'p-pell',
    title: 'Pell Court',
    unsent_pulse_count: 1,
    // A Monday a week back, so Friday has passed.
    pulse_week_of: '2026-09-14',
  });
  const receivable = {
    count: 1,
    invoiceId: 'inv-0721',
    invoiceLabel: 'INV-2026-0721',
    oldestDue: '2026-09-01',
    totalBalanceCents: 380_000,
  } as ReceivableSignal;

  it('Holloway carries the overdue invoice AND the PO-HD-0412 silence — every need, every job, one order', () => {
    const live = [pell, holloway];
    const { folders } = partitionDesk(
      live,
      NOW,
      undefined,
      new Map([['p-holloway', receivable]]),
    );
    const list = deriveDeskNeedList({ folders, chips: [], live }, NOW);

    expect(list.map((n) => [n.projectName, n.need.kind])).toEqual([
      ['Holloway Residence', 'overdue_invoice'],
      ['Holloway Residence', 'po_unacknowledged'],
      ['Pell Court', 'pulse_due'],
    ]);
    expect(list.map((n) => n.key)).toEqual([
      'overdue_invoice:inv-0721',
      'po_unacknowledged:project:p-holloway',
      'pulse_due:week:2026-09-14',
    ]);
    expect(list[0].projectId).toBe('p-holloway');
  });
});
