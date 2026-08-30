/**
 * W5F-06 — the rail and the sheet group the margin the SAME way.
 *
 * They used to derive it twice, and the copies had drifted: the sheet dropped
 * `kind === 'time'` before grouping and the rail did not, so a logged time
 * entry counted toward `THE WHOLE JOB · N` on the desktop rail and not in the
 * 390 sheet. One margin, two numbers.
 */

import {
  groupMarginRows,
  marginListable,
} from '../margin-groups';
import type { MarginItemRow } from '../margin-derivation';

const row = (o: Partial<MarginItemRow>): MarginItemRow =>
  ({
    kind: 'message',
    item_id: 'm1',
    project_id: 'project-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'open',
    title: 'Client message',
    detail: '',
    ts: '2026-08-11T12:00:00.000Z',
    payload: {},
    ...o,
  }) as MarginItemRow;

/** The `…d5` shape: 3 beside Pieces, 4 about the whole job, + a time entry. */
const D5 = [
  row({ item_id: 'l1', anchor_kind: 'line', anchor_id: 'ffe-1', title: 'Console' }),
  row({ item_id: 'l2', anchor_kind: 'line', anchor_id: 'ffe-2', title: 'COM' }),
  row({ item_id: 'l3', anchor_kind: 'line', anchor_id: 'ffe-3', title: 'PO chase' }),
  row({ item_id: 'w1', title: 'Invoice 2026-114', kind: 'invoice' }),
  row({ item_id: 'w2', title: 'Rug and nightstands', kind: 'decision' }),
  row({ item_id: 'w3', title: 'Finish sample', kind: 'decision' }),
  row({ item_id: 'w4', anchor_kind: 'section', title: 'Scope change' }),
  row({ item_id: 't1', kind: 'time', title: 'Time · Aug 30', state: 'logged' }),
];

describe('the margin has ONE grouper (W5F-06)', () => {
  it('lists everything but the studio clock', () => {
    expect(marginListable(D5).map((r) => r.item_id)).not.toContain('t1');
    expect(marginListable(D5)).toHaveLength(7);
  });

  it('gives the rail and the sheet the same groups and the same counts', () => {
    const rows = marginListable(D5);
    const sheet = groupMarginRows(rows, {
      order: 'whole-job-first',
      decorate: (r) => r,
    });
    const rail = groupMarginRows(rows, {
      order: 'regions-first',
      decorate: (r) => r,
    });

    const counts = (groups: typeof sheet) =>
      Object.fromEntries(groups.map((g) => [g.heading, g.rows.length]));

    // Same groups, same counts — only the ORDER differs (W5-R1 reverses the
    // print order, not the grouping mechanic).
    expect(counts(sheet)).toEqual(counts(rail));
    expect(counts(sheet)).toEqual({
      'THE WHOLE JOB': 4,
      'BESIDE PIECES': 3,
    });
    expect(sheet.map((g) => g.heading)).toEqual([
      'THE WHOLE JOB',
      'BESIDE PIECES',
    ]);
    expect(rail.map((g) => g.heading)).toEqual([
      'BESIDE PIECES',
      'THE WHOLE JOB',
    ]);
  });

  it('would have disagreed before: an unfiltered clock lands in THE WHOLE JOB', () => {
    // The exact drift this module removes — the rail's old input.
    const unfiltered = groupMarginRows(D5, {
      order: 'regions-first',
      decorate: (r) => r,
    });
    expect(
      unfiltered.find((g) => g.heading === 'THE WHOLE JOB')?.rows.length,
    ).toBe(5);
    expect(
      groupMarginRows(marginListable(D5), {
        order: 'regions-first',
        decorate: (r) => r,
      }).find((g) => g.heading === 'THE WHOLE JOB')?.rows.length,
    ).toBe(4);
  });

  it('prints no group for a region with nothing in it', () => {
    const groups = groupMarginRows(marginListable(D5), {
      order: 'regions-first',
      decorate: (r) => r,
    });
    expect(groups.map((g) => g.heading)).not.toContain('BESIDE SCHEDULE');
    expect(groups).toHaveLength(2);
  });
});
