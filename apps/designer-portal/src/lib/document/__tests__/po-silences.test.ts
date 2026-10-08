/**
 * US-19 FR9 F9-1 (X1) — two makers' silences are two rows: where the paper's
 * lines name every unanswered PO the row counts, the aggregate
 * `po_unacknowledged` need prints one need per PO, oldest first, each landing
 * on its PO's first line; otherwise the aggregate stands, so no silence is lost.
 */
import type { NeedLine } from '../desk-derivation';
import { expandPoSilences, isUnansweredPo, type PoSilenceLine } from '../po-silences';

const AGGREGATE: NeedLine = {
  kind: 'po_unacknowledged',
  text: '2 POs sent — no acknowledgment',
  actionLabel: 'Follow up with the maker',
  stamp: { label: 'NO ACK', color: '#6E8BA3' },
  urgent: false,
  dueOn: '2026-09-28T15:00:00Z',
  owner: 'maker',
};

/** Birchwood: Apparatus on 031 (sent first), Ceramica on 032. */
const po031 = {
  id: 'po-031',
  po_number: 'BR-2026-031',
  vendor_po_number: 'APP-77',
  sent_at: '2026-09-28T15:00:00Z',
  acknowledged_at: null,
  status: 'sent',
};
const po032 = {
  id: 'po-032',
  po_number: null,
  vendor_po_number: 'BR-2026-032',
  sent_at: '2026-09-30T10:00:00Z',
  acknowledged_at: null,
  status: 'sent',
};
const line = (id: string, purchase_order: PoSilenceLine['purchase_order']): PoSilenceLine => ({
  id,
  removed_at: null,
  purchase_order,
});

describe('expandPoSilences (F9-1)', () => {
  it('two POs give two rows, oldest first, each naming its PO, due on its sent_at, landing on its first line', () => {
    const lines = [
      line('line-vase', po032),
      line('line-pendant', po031),
      line('line-sconce', po031),
      line('line-bowl', po032),
      line('line-answered', { ...po031, id: 'po-030', acknowledged_at: '2026-09-29' }),
    ];
    const rows = expandPoSilences({ need: AGGREGATE, lines, unackedPoCount: 2 });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.text)).toEqual([
      'BR-2026-031 sent — no acknowledgment',
      'BR-2026-032 sent — no acknowledgment',
    ]);
    expect(rows.map((row) => row.dueOn)).toEqual([po031.sent_at, po032.sent_at]);
    // The first line in schedule order carries each PO.
    expect(rows.map((row) => row.lineId)).toEqual(['line-pendant', 'line-vase']);
    for (const row of rows) {
      expect(row.kind).toBe('po_unacknowledged');
      expect(row.stamp.label).toBe('NO ACK');
      expect(row.actionLabel).toBe('Follow up with the maker');
      expect(row.owner).toBe('maker');
    }
  });

  it('the studio’s number comes first where both are set', () => {
    const [first] = expandPoSilences({
      need: AGGREGATE,
      lines: [line('a', po031), line('b', po032)],
      unackedPoCount: 2,
    });
    expect(first.text).toBe('BR-2026-031 sent — no acknowledgment');
  });

  it('count 2 but only one PO has a line on the paper: the aggregate need, unchanged', () => {
    const rows = expandPoSilences({
      need: AGGREGATE,
      lines: [line('line-pendant', po031), line('line-loose', null)],
      unackedPoCount: 2,
    });
    expect(rows).toEqual([AGGREGATE]);
    expect(rows[0]).toBe(AGGREGATE);
  });

  it('one PO: the need, unchanged', () => {
    const single: NeedLine = { ...AGGREGATE, text: 'BR-2026-031 sent — no acknowledgment' };
    const rows = expandPoSilences({
      need: single,
      lines: [line('line-pendant', po031)],
      unackedPoCount: 1,
    });
    expect(rows).toEqual([single]);
  });

  it('leaves every other need, a held note of the same kind, and unread lines alone', () => {
    const unsent: NeedLine = { ...AGGREGATE, kind: 'po_unsent', text: '2 POs drafted — not yet sent' };
    const heldNote: NeedLine = {
      ...AGGREGATE,
      text: 'Follow-up to the maker drafted',
      owner: 'designer',
      draft: {
        id: 'note-1',
        kind: 'maker_follow_up',
        status: 'awaiting_review',
        to_email: null,
        subject: 'BR-2026-031 — following up',
        body: '',
        created_at: '2026-10-06',
      },
    };
    const lines = [line('a', po031), line('b', po032)];
    expect(expandPoSilences({ need: unsent, lines, unackedPoCount: 2 })).toEqual([unsent]);
    expect(expandPoSilences({ need: heldNote, lines, unackedPoCount: 2 })).toEqual([heldNote]);
    expect(expandPoSilences({ need: AGGREGATE, lines: undefined, unackedPoCount: 2 })).toEqual([
      AGGREGATE,
    ]);
  });

  it('a PO with no number keeps the aggregate', () => {
    const nameless = { ...po032, vendor_po_number: null };
    expect(
      expandPoSilences({
        need: AGGREGATE,
        lines: [line('a', po031), line('b', nameless)],
        unackedPoCount: 2,
      }),
    ).toEqual([AGGREGATE]);
  });
});

describe('isUnansweredPo — the Desk’s rule (00590)', () => {
  it('sent, never acknowledged, neither delivered nor cancelled', () => {
    expect(isUnansweredPo(po031)).toBe(true);
    expect(isUnansweredPo({ ...po031, sent_at: null })).toBe(false);
    expect(isUnansweredPo({ ...po031, acknowledged_at: '2026-09-29' })).toBe(false);
    expect(isUnansweredPo({ ...po031, status: 'delivered' })).toBe(false);
    expect(isUnansweredPo({ ...po031, status: 'cancelled' })).toBe(false);
    expect(isUnansweredPo(null)).toBe(false);
  });
});
