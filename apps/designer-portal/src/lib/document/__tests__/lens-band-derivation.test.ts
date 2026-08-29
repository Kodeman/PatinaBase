import type { RedLetterRow } from '@/components/document/red-letter-zone';
import {
  deriveLensBand,
  rankStanding,
  shortenAct,
  truncateLine,
  type LensBandInput,
  type LensSpreadKind,
} from '../lens-band-derivation';
import type { TicketRow } from '../ticket-derivation';

/**
 * The Vandersteen specimen (`artifacts/document-lens-proposal-2026-08-28/
 * source/specimen.md`), as the band's caller hands it over: two overdue
 * approvals, a carrier window closing tomorrow, and a purchase order the maker
 * has not answered in fourteen days.
 */
const need = (
  key: string,
  kind: RedLetterRow['kind'],
  text: string,
  actionLabel: string | null,
): RedLetterRow => ({
  key,
  kind,
  text,
  actionLabel,
  onAct: jest.fn(),
  urgent: true,
});

const VANDERSTEEN_NEEDS: RedLetterRow[] = [
  need(
    'approval-0',
    'overdue_decision',
    'Primary bedroom approval overdue 6 days, with the client since Aug 13',
    'Send a reminder',
  ),
  need(
    'approval-1',
    'overdue_decision',
    'Living room fabric overdue 3 days — COM by Aug 22',
    'Choose the fabric',
  ),
  need(
    'claim-0',
    'damage_claim',
    'Brass-and-oak console — carrier window closes Aug 26',
    'Review the claim',
  ),
  need(
    'po-0',
    'po_unacknowledged',
    'PO-2026-0418 sent — no acknowledgment, 14 days',
    'Follow up with the maker',
  ),
];

const ticketRow = (
  key: TicketRow['key'],
  exception: TicketRow['exception'],
): TicketRow => ({
  key,
  label: key,
  value: 'value',
  emphasis: null,
  door: { kind: 'none' },
  exception,
});

const input = (over: Partial<LensBandInput> = {}): LensBandInput => ({
  spreadKind: 'project',
  ticket: [],
  needs: [],
  guide: null,
  household: 'Vandersteen residence',
  stageWord: 'Procurement & Orders',
  stageIndex: { position: 4, of: 6 },
  installDate: 'SEP 15',
  moneyFigure: '$17,500 OUT',
  proposalInvestment: null,
  sentDate: null,
  readingStop: null,
  ...over,
});

describe('deriveLensBand · line 1, per spread kind (OD-1)', () => {
  it('prints the household, the stage and the two facts on the project spread', () => {
    const model = deriveLensBand(input());
    expect(model.line1).toEqual({
      identity: 'VANDERSTEEN RESIDENCE',
      stage: 'PROCUREMENT & ORDERS 4 OF 6',
      rightFlush: 'INSTALL SEP 15 · $17,500 OUT',
      moneyOnly: '$17,500 OUT',
    });
  });

  it('never prints the current stop on line 1, at any stop', () => {
    const model = deriveLensBand(
      input({
        readingStop: {
          key: 'ffe',
          label: 'Pieces',
          countLine: '36 lines · 4 rooms · 1 damaged',
        },
      }),
    );
    const printed = [
      model.line1.identity,
      model.line1.stage,
      model.line1.rightFlush,
      model.line1.moneyOnly,
    ].join(' ');
    expect(printed).not.toMatch(/Pieces/i);
  });

  it('drops the money half while Money is the reading stop (SP-08)', () => {
    const model = deriveLensBand(
      input({
        readingStop: {
          key: 'money',
          label: 'Money',
          countLine: '$17,500 out · $12,300 not drawn',
        },
      }),
    );
    expect(model.line1.rightFlush).toBe('INSTALL SEP 15');
    expect(model.line1.moneyOnly).toBeNull();
  });

  it('keeps the install date on the install spread', () => {
    const model = deriveLensBand(input({ spreadKind: 'install' }));
    expect(model.line1.rightFlush).toBe('INSTALL SEP 15 · $17,500 OUT');
  });

  it('prints money only on the care spread — no date after install', () => {
    const model = deriveLensBand(input({ spreadKind: 'care' }));
    expect(model.line1.rightFlush).toBe('$17,500 OUT');
  });

  it('empties the care right slot when nothing is outstanding', () => {
    const model = deriveLensBand(
      input({ spreadKind: 'care', moneyFigure: null }),
    );
    expect(model.line1.rightFlush).toBeNull();
    expect(model.line1.moneyOnly).toBeNull();
  });

  it("prints the proposal's own investment, not an FF&E budget (DL-01)", () => {
    const model = deriveLensBand(
      input({
        spreadKind: 'proposal',
        household: 'The Byrnes',
        stageWord: 'Proposal',
        stageIndex: null,
        installDate: null,
        moneyFigure: '$184,500 OUT',
        proposalInvestment: '$9,400',
        sentDate: 'AUG 19',
      }),
    );
    expect(model.line1).toEqual({
      identity: 'THE BYRNES',
      stage: 'PROPOSAL',
      rightFlush: 'SENT AUG 19 · $9,400',
      moneyOnly: '$9,400',
    });
  });

  it.each(['brief', 'discovery', 'direction'] as const)(
    'leaves the %s right slot absent — no fallback in the figure register (A-06)',
    (spreadKind: LensSpreadKind) => {
      const model = deriveLensBand(
        input({
          spreadKind,
          household: 'Reinhardt lake house',
          stageWord: 'Brief',
          stageIndex: null,
          installDate: 'SEP 15',
          moneyFigure: '$17,500 OUT',
        }),
      );
      expect(model.line1.rightFlush).toBeNull();
      expect(model.line1.moneyOnly).toBeNull();
      expect(model.line1.identity).toBe('REINHARDT LAKE HOUSE');
    },
  );
});

describe('deriveLensBand · line 2 (L-1)', () => {
  it('names the worst standing exception with its act, and counts the rest', () => {
    const model = deriveLensBand(input({ needs: VANDERSTEEN_NEEDS }));
    expect(model.line2.kind).toBe('standing');
    expect(model.line2.sentence).toBe(
      'Primary bedroom approval overdue 6 days, with the client since Aug 13',
    );
    expect(model.line2.act?.label).toBe('Send a reminder');
    expect(model.line2.standingCount).toBe(4);
  });

  it("falls to the stage's guide sentence when nothing stands", () => {
    const onAct = jest.fn();
    const model = deriveLensBand(
      input({
        guide: {
          text: 'Name the phases for this project',
          act: { label: 'Open the schedule', onAct },
        },
      }),
    );
    expect(model.line2.kind).toBe('guide');
    expect(model.line2.sentence).toBe('Name the phases for this project');
    expect(model.line2.act?.label).toBe('Open the schedule');
    expect(model.line2.standingCount).toBe(0);
  });

  it.each([
    'project',
    'install',
    'care',
    'proposal',
    'brief',
    'discovery',
    'direction',
  ] as const)(
    'prints nothing on line 2 of an empty %s spread, and never throws',
    (spreadKind: LensSpreadKind) => {
      const model = deriveLensBand(
        input({
          spreadKind,
          ticket: [],
          needs: [],
          guide: null,
          installDate: null,
          moneyFigure: null,
          proposalInvestment: null,
          sentDate: null,
        }),
      );
      expect(model.line2).toEqual({
        kind: 'none',
        sentence: '',
        act: null,
        standingCount: 0,
      });
      expect(model.standing).toEqual([]);
      expect(model.line1.rightFlush).toBeNull();
    },
  );
});

describe('rankStanding · every exception, worst first (OD-8)', () => {
  it('orders the specimen overdue-by-days, decision, damage, then PO silence', () => {
    const ranked = rankStanding([], VANDERSTEEN_NEEDS);
    expect(ranked.map((item) => item.key)).toEqual([
      'need:approval-0',
      'need:approval-1',
      'need:claim-0',
      'need:po-0',
    ]);
    expect(ranked.map((item) => item.tier)).toEqual([
      'overdue',
      'overdue',
      'damage',
      'po-silence',
    ]);
    expect(ranked.every((item) => item.act !== null)).toBe(true);
  });

  it('carries the kind eyebrow the sheet prints', () => {
    expect(rankStanding([], VANDERSTEEN_NEEDS).map((item) => item.eyebrow)).toEqual(
      ['DECISION DUE', 'DECISION DUE', 'CLAIM OPEN', 'NO ACK'],
    );
  });

  it("takes the ticket's exceptions too — never deriveTicketSeam's two (F50)", () => {
    const rows: TicketRow[] = [
      ticketRow('money', {
        rank: 'promise-past-due',
        phrase: '$17,500 owed you',
        standingSince: '2026-08-03',
      }),
      ticketRow('pieces', {
        rank: 'piece-stuck',
        phrase: '1 damaged',
        standingSince: null,
      }),
      ticketRow('spec', {
        rank: 'piece-stuck',
        phrase: '2 unspecified',
        standingSince: null,
      }),
    ];
    const ranked = rankStanding(rows, VANDERSTEEN_NEEDS);
    expect(ranked).toHaveLength(7);
    expect(ranked.map((item) => item.tier)).toEqual([
      'overdue',
      'overdue',
      'overdue',
      'damage',
      'po-silence',
      'po-silence',
      'po-silence',
    ]);
    // A-11 — this lane mints no act, so a ticket-only exception opens nothing.
    expect(
      ranked.filter((item) => item.key.startsWith('ticket:')).map((i) => i.act),
    ).toEqual([null, null, null]);
  });

  it('prints a sentence once when both sources carry it', () => {
    const rows = [
      ticketRow('pieces', {
        rank: 'piece-stuck',
        phrase: 'PO-2026-0418 sent — no acknowledgment, 14 days',
        standingSince: '2026-08-11',
      }),
    ];
    const ranked = rankStanding(rows, VANDERSTEEN_NEEDS);
    expect(ranked).toHaveLength(4);
    // The need's copy wins, because it is the one holding an act.
    expect(ranked[3].key).toBe('need:po-0');
    expect(ranked[3].act?.label).toBe('Follow up with the maker');
  });

  it('reads nothing standing off an empty document', () => {
    expect(rankStanding([], [])).toEqual([]);
    expect(rankStanding([ticketRow('rooms', null)], [])).toEqual([]);
  });
});

describe('truncateLine · the order, and what never shortens', () => {
  const ORDER = [
    { from: 'SEND A REMINDER', to: 'REMINDER' },
    { from: ' approval', to: '' },
  ];

  it('stops at the first form that fits — the act shortens, the subject stays', () => {
    expect(
      truncateLine('Primary bedroom approval SEND A REMINDER', 34, ORDER),
    ).toBe('Primary bedroom approval REMINDER');
  });

  it('walks on to the subject only when the act alone will not do it', () => {
    expect(
      truncateLine('Primary bedroom approval SEND A REMINDER', 30, ORDER),
    ).toBe('Primary bedroom REMINDER');
  });

  it('refuses a step that would take a number, a day count or a room date', () => {
    expect(
      truncateLine('1 damaged, carrier window closes Aug 26', 10, [
        { from: '1 damaged', to: '' },
        { from: 'Aug 26', to: '' },
      ]),
    ).toBe('1 damaged, carrier window closes Aug 26');
  });

  it('returns the line untouched when it already fits', () => {
    expect(truncateLine('Close the book', 110, [])).toBe('Close the book');
  });

  it('hands the full line back when no step brings it inside — the ellipsis is last', () => {
    expect(truncateLine('a very long sentence indeed', 4, [])).toBe(
      'a very long sentence indeed',
    );
  });

  it("shortens an act to the word a reader cannot reconstruct", () => {
    expect(shortenAct('SEND A REMINDER')).toBe('REMINDER');
    expect(shortenAct('Chase Sturdy Oak')).toBe('Oak');
    expect(shortenAct('SEND')).toBe('SEND');
  });

  it('shortens the act before the sentence when line 2 overruns', () => {
    const long = `${'x'.repeat(100)} tail`;
    const model = deriveLensBand(
      input({
        guide: {
          text: long,
          act: { label: 'SEND A REMINDER', onAct: jest.fn() },
        },
      }),
    );
    expect(model.line2.act?.label).toBe('REMINDER');
    expect(model.line2.sentence).toBe(long);
  });
});

describe('deriveLensBand · the announcement (OD-7 / DL-03)', () => {
  it("composes the stop's name over the paper's own count line, sentence case", () => {
    const model = deriveLensBand(
      input({
        readingStop: {
          key: 'ffe',
          label: 'Pieces',
          countLine: '36 lines · 4 rooms · 1 damaged',
        },
      }),
    );
    expect(model.announcement).toBe(
      'Now at Pieces · 36 lines · 4 rooms · 1 damaged',
    );
  });

  it('says nothing while no stop is held', () => {
    expect(deriveLensBand(input()).announcement).toBeNull();
  });
});
