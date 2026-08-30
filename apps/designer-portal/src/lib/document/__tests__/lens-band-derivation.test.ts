import type { RedLetterRow } from '@/components/document/red-letter-zone';
import {
  deriveLensBand,
  rankStanding,
  shortSubject,
  shortenAct,
  type LensBandInput,
  type LensSpreadKind,
} from '../lens-band-derivation';
import {
  LENS_LINE2_GAP_PX,
  LENS_LINE2_MEASURE_PX,
  LENS_LINE2_PX_PER_CHAR,
  LENS_MONO_PX_PER_CHAR,
} from '../lens-constants';
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
  /** N-01 — the day the need is DUE on, as `desk-derivation.ts` emits it. */
  dueOn: string | null = null,
): RedLetterRow => ({
  key,
  kind,
  text,
  actionLabel,
  onAct: jest.fn(),
  urgent: true,
  dueOn,
});

/** A stated day, so no test reads the wall clock (N-01). */
const NOW = new Date('2026-08-29T12:00:00');

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
  tier: 'full',
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
        form: 'long',
        long: { sentence: '', act: null },
        short: null,
        standingCount: 0,
        withheld: 0,
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

describe('rankStanding · deadline distance, not kind (W3-R1)', () => {
  it('puts a window closing tomorrow above a decision due weeks out', () => {
    // The falsifier the old four-tier sort could not pass: `decision-due`
    // outranked `damage` on kind alone, so a task due in three weeks stood
    // above a claim window that shuts tomorrow.
    const ranked = rankStanding(
      [],
      [
        need('task', 'task_due', 'Kickoff walkthrough due in 21 days', 'Open it'),
        need('claim', 'damage_claim', 'Carrier window closes in 1 day', 'File it'),
      ],
    );
    expect(ranked.map((item) => item.key)).toEqual(['need:claim', 'need:task']);
    expect(ranked.map((item) => item.sense)).toEqual(['ahead', 'ahead']);
    expect(ranked.map((item) => item.distance)).toEqual([1, 21]);
  });

  it('puts everything past its day above everything ahead of it', () => {
    const ranked = rankStanding(
      [],
      [
        need('claim', 'damage_claim', 'Carrier window closes in 1 day', 'File it'),
        need('inv', 'overdue_invoice', 'Invoice overdue 2 days', 'Send a reminder'),
      ],
    );
    expect(ranked.map((item) => item.key)).toEqual(['need:inv', 'need:claim']);
    expect(ranked.map((item) => item.sense)).toEqual(['past', 'ahead']);
  });

  it('files a silence last, however many days it has been counting', () => {
    const ranked = rankStanding(
      [],
      [
        need('po', 'po_unacknowledged', 'PO-2026-0418 unanswered, 14 days', 'Follow up'),
        need('claim', 'damage_claim', 'Carrier window closes in 9 days', 'File it'),
      ],
    );
    expect(ranked.map((item) => item.key)).toEqual(['need:claim', 'need:po']);
    expect(ranked.map((item) => item.sense)).toEqual(['ahead', 'none']);
  });

  it('breaks an equal distance on the desk’s tie-break, and nothing else', () => {
    const ranked = rankStanding(
      [],
      [
        need('pulse', 'pulse_due', 'Pulse due', null),
        need('claim', 'damage_claim', 'Carrier window open', 'File it'),
      ],
    );
    // Both are silences; `damage_claim` is rank 1 to `pulse_due`'s 3.
    expect(ranked.map((item) => item.key)).toEqual(['need:claim', 'need:pulse']);
  });
});

describe('rankStanding · the deadline is a DATE, not a scraped day count (N-01)', () => {
  /**
   * The desk's own templates. `desk-derivation.ts` prints DATES — "— oldest
   * due Aug 23", "closes Aug 26" — and states the day it is due on in
   * `NeedLine.dueOn`, which `RedLetterRow` now carries. A regex over the
   * printed sentence finds no day count in any of these, so before N-01 every
   * one of them ranked at distance 0 and the deadline sort was inert on every
   * real paper.
   */
  const invoice = need(
    'inv',
    'overdue_invoice',
    'Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 22',
    'Send reminder',
    '2026-08-22', // seven days past NOW
  );
  const decisions = need(
    'dec',
    'overdue_decision',
    '2 decisions overdue — oldest due Aug 23',
    'Chase the approval',
    '2026-08-23', // six days past NOW
  );

  it('ranks two same-tie-break needs by their dates, not by their order', () => {
    // Both are `TIE_BREAK_RANK` 2, so nothing but the deadline can separate
    // them — and the desk hands them over decisions-first.
    const ranked = rankStanding([], [decisions, invoice], NOW);
    expect(ranked.map((item) => item.key)).toEqual(['need:inv', 'need:dec']);
    expect(ranked.map((item) => item.distance)).toEqual([-7, -6]);
    expect(ranked.map((item) => item.sense)).toEqual(['past', 'past']);
  });

  it('reads no day count out of the sentence — the date is the whole answer', () => {
    // The proof the regex is not what is working: the same sentences with no
    // `dueOn` collapse to one distance and keep the desk's own order.
    const undated = [
      { ...decisions, dueOn: null },
      { ...invoice, dueOn: null },
    ];
    const ranked = rankStanding([], undated, NOW);
    expect(ranked.map((item) => item.days)).toEqual([null, null]);
    expect(ranked.map((item) => item.distance)).toEqual([0, 0]);
    expect(ranked.map((item) => item.key)).toEqual(['need:dec', 'need:inv']);
  });

  it('puts a window closing tomorrow above a decision due weeks out', () => {
    // The cross-tier falsifier, in the desk's shapes: the retired four-tier
    // sort put `decision-due` above `damage` on kind alone.
    const ranked = rankStanding(
      [],
      [
        need('task', 'task_due', 'Kickoff walkthrough — due Sep 19', 'Open it', '2026-09-19'),
        need('claim', 'damage_claim', 'FDL-0912 — carrier window closes Aug 30', 'File it', '2026-08-30'),
      ],
      NOW,
    );
    expect(ranked.map((item) => item.key)).toEqual(['need:claim', 'need:task']);
    expect(ranked.map((item) => item.distance)).toEqual([1, 21]);
  });

  it('files a maker’s silence last, whatever day its PO was sent', () => {
    // `po_unacknowledged` sets `dueOn` from the PO's SENT day — provenance,
    // not a deadline. Read as a date it would rank 14 days "overdue" and lead
    // the paper; W3-R1 ranks it last, below a window closing tomorrow.
    const ranked = rankStanding(
      [],
      [
        need('po', 'po_unacknowledged', 'PO-2026-0418 sent — no acknowledgment', 'Follow up', '2026-08-15'),
        need('claim', 'damage_claim', 'FDL-0912 — carrier window closes Aug 30', 'File it', '2026-08-30'),
      ],
      NOW,
    );
    expect(ranked.map((item) => item.key)).toEqual(['need:claim', 'need:po']);
    expect(ranked.map((item) => item.sense)).toEqual(['ahead', 'none']);
  });

  it('states the short form’s day count off the SAME distance it ranked on', () => {
    const [worst] = rankStanding([], [decisions, invoice], NOW);
    expect(worst.short).toEqual({
      state: 'OVERDUE',
      days: 7,
      subject: 'INV-2026-114',
    });
    const model = deriveLensBand(
      input({ needs: [decisions, invoice], tier: 'mobile', now: NOW }),
    );
    expect(model.line2.sentence).toBe('OVERDUE 7D · INV-2026-114');
  });
});

describe('the door counts what the sheet holds (N-02)', () => {
  it('prints a door on a GUIDE line with one open input', () => {
    // W3-R2's own example: nothing on the paper is a sheet row, so the input
    // is not discounted and the door stands. `standingCount − 1` printed none.
    const model = deriveLensBand(
      input({
        guide: { text: 'Sent Aug 23 — not yet opened', act: null },
        inputs: [
          {
            key: 'signature',
            eyebrow: 'SIGNATURE',
            sentence: 'Client signature · Client · blocks Project activation',
            act: null,
          },
        ],
      }),
    );
    expect(model.line2.kind).toBe('guide');
    expect(model.line2.standingCount).toBe(1);
    expect(model.line2.withheld).toBe(1);
  });

  it('discounts exactly the one row line 2 is naming', () => {
    const model = deriveLensBand(input({ needs: VANDERSTEEN_NEEDS }));
    expect(model.line2.kind).toBe('standing');
    expect(model.line2.standingCount).toBe(4);
    expect(model.line2.withheld).toBe(3);
  });

  it('prints no door when the one thing standing is the thing on line 2', () => {
    const model = deriveLensBand(input({ needs: [VANDERSTEEN_NEEDS[0]] }));
    expect(model.line2.withheld).toBe(0);
  });
});

describe('the short form and the act’s verb (D-B24, C-07)', () => {
  it('keeps the act’s FIRST word — the verb, never a particle or a surname', () => {
    expect(shortenAct('FOLLOW UP')).toBe('FOLLOW');
    expect(shortenAct('Chase Sturdy Oak')).toBe('Chase');
    expect(shortenAct('SEND A REMINDER')).toBe('SEND');
    expect(shortenAct('FILE THE CLAIM')).toBe('FILE');
    expect(shortenAct('SEND')).toBe('SEND');
  });

  it('takes the head noun of the object, capped at twelve characters', () => {
    expect(
      shortSubject('Primary bedroom approval, with the client since Aug 13'),
    ).toBe('BEDROOM');
    expect(
      shortSubject('Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 22'),
    ).toBe('INV-2026-114');
    expect(shortSubject('FDL-0912 has an open damage claim')).toBe('FDL-0912');
    expect(shortSubject('2 decisions overdue — oldest due Aug 23')).toBe(
      'DECISIONS',
    );
    expect(shortSubject('$17,500 owed you')).toBe('$17,500');
  });

  /**
   * W6-R1 · F1 — the design lead's final walk found `…d7` at 390 printing
   * `CONFLICT · TWO` `RESOLVE`. "Two milestones land on Sep 21" starts with a
   * quantity, and the generic head-noun scan took it. The subject is the need's
   * OBJECT, and each kind knows where its own object lives.
   */
  describe('the short subject is the need\'s OBJECT, chosen by kind (W6-R1/F1)', () => {
    it('a schedule conflict names its DATE, never the sentence\'s first word', () => {
      // The walked sentence, VERBATIM from `build/w6-walk.md` "Differs" #1:
      // `…d7` at 390 printed `CONFLICT · TWO` `RESOLVE` for this need.
      expect(
        shortSubject(
          'Two installs collide — week of Sep 21 · RESOLVE THE SCHEDULE',
          'schedule_conflict',
        ),
      ).toBe('SEP 21');
      expect(
        shortSubject('Two milestones land on Sep 21', 'schedule_conflict'),
      ).toBe('SEP 21');
      // …and the generic rule, which is what produced the defect, still reads
      // the first word — so this case fails the moment the kind stops being
      // consulted.
      expect(
        shortSubject('Two installs collide — week of Sep 21 · RESOLVE THE SCHEDULE'),
      ).toBe('TWO');
    });

    it('a proposed date names its date too', () => {
      expect(
        shortSubject('A new date is proposed for Oct 3', 'schedule_proposal'),
      ).toBe('OCT 3');
    });

    it('an invoice names its code, and falls to the figure when it carries none', () => {
      expect(
        shortSubject(
          'Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 22',
          'overdue_invoice',
        ),
      ).toBe('INV-2026-114');
      expect(shortSubject('$17,500 overdue', 'overdue_invoice')).toBe('$17,500');
    });

    it('a PO silence names the purchase order', () => {
      expect(
        shortSubject('PO-0912 has not been acknowledged in 14 days', 'po_unacknowledged'),
      ).toBe('PO-0912');
      expect(shortSubject('PO-0913 has not been sent', 'po_unsent')).toBe('PO-0913');
    });

    it('a damage claim names the piece', () => {
      expect(shortSubject('FDL-0912 has an open damage claim', 'damage_claim')).toBe(
        'FDL-0912',
      );
    });

    it('a decision keeps the room / subject noun — the generic rule is right for it', () => {
      expect(
        shortSubject(
          'Primary bedroom approval, with the client since Aug 13',
          'overdue_decision',
        ),
      ).toBe('BEDROOM');
    });

    it('falls back to the generic scan when the kind names a source the sentence lacks', () => {
      // A conflict with no stated day must still print SOMETHING: a missing
      // subject is worse than an imperfect one.
      expect(
        shortSubject('Two milestones collide', 'schedule_conflict'),
      ).toBe('TWO');
    });
  });

  it('cuts a long subject at a word boundary, never mid-word (N-08)', () => {
    // `UNSPECIFIED LI` names nothing; the subject is the half a reader cannot
    // reconstruct from the state word beside it.
    expect(shortSubject('Unspecified line items on the schedule')).toBe(
      'UNSPECIFIED',
    );
    expect(shortSubject('Reinhardt lake house approval')).toBe('REINHARDT');
    // A single word longer than the cap still has to give somewhere.
    expect(shortSubject('Antidisestablishmentarian chair')).toHaveLength(12);
  });

  it('prints `<STATE> <DAYS>D · <SUBJECT>` — and drops the day count where there is none', () => {
    const withDays = rankStanding([], [VANDERSTEEN_NEEDS[0]])[0];
    expect(withDays.short).toEqual({
      state: 'OVERDUE',
      days: 6,
      subject: 'BEDROOM',
    });
    const silence = rankStanding(
      [],
      [need('po', 'po_unacknowledged', 'PO-0912 sent — no acknowledgment', 'Follow up')],
    )[0];
    expect(silence.short.days).toBeNull();
    const model = deriveLensBand(
      input({
        needs: [
          need('po', 'po_unacknowledged', 'PO-0912 sent — no acknowledgment', 'Follow up'),
        ],
        tier: 'mobile',
      }),
    );
    expect(model.line2.short?.sentence).toBe('NO ACK · PO-0912');
  });

  it('prints the long form when it fits and the short one when it does not', () => {
    const needs = [VANDERSTEEN_NEEDS[0], VANDERSTEEN_NEEDS[1]];
    expect(deriveLensBand(input({ needs, tier: 'full' })).line2.form).toBe('long');
    const narrow = deriveLensBand(input({ needs, tier: 'mobile' })).line2;
    expect(narrow.form).toBe('short');
    expect(narrow.sentence).toBe('OVERDUE 6D · BEDROOM');
    expect(narrow.act?.label).toBe('Send');
    // The long form is still carried — the band prints one, the model holds both.
    expect(narrow.long.sentence).toBe(VANDERSTEEN_NEEDS[0].text);
    expect(narrow.long.act?.label).toBe('Send a reminder');
  });
});

describe('the seeded paper fits its measure at both ends (D-B24 twin)', () => {
  /** The eight exceptions the `…d5` seed actually raises, as `w3-r2-discharge.md`
   *  measured them in the band's own type. */
  const SEEDED: RedLetterRow[] = [
    need(
      'invoice',
      'overdue_invoice',
      'Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 22 — send a reminder',
      'Send reminder',
    ),
    need('decisions', 'overdue_decision', '2 decisions overdue — oldest due Aug 23', 'Chase the approval'),
    need('inspect', 'awaiting_inspection', '1 piece delivered — awaiting inspection', 'Inspect the delivery'),
    need('claim', 'damage_claim', 'FDL-0912 has an open damage claim', 'File the claim'),
    need('po', 'po_unsent', 'PO-2026-0418 drafted — not yet sent', 'Send the purchase order'),
  ];
  const SEEDED_TICKET: TicketRow[] = [
    ticketRow('money', {
      rank: 'money-at-risk',
      phrase: '$17,500 owed you',
      standingSince: '2026-08-22',
    }),
    ticketRow('pieces', { rank: 'piece-stuck', phrase: '1 damaged', standingSince: null }),
    ticketRow('spec', { rank: 'piece-stuck', phrase: '2 unspecified', standingSince: null }),
  ];

  const ranked = rankStanding(SEEDED_TICKET, SEEDED);
  const doorPx =
    `+${ranked.length - 1} MORE`.length * LENS_MONO_PX_PER_CHAR +
    LENS_LINE2_GAP_PX;
  const width = (sentence: string, act: string | null) =>
    sentence.length * LENS_LINE2_PX_PER_CHAR +
    doorPx +
    (act ? act.length * LENS_MONO_PX_PER_CHAR + LENS_LINE2_GAP_PX : 0);

  it.each(ranked.map((item) => [item.key, item] as const))(
    'fits %s’s SHORT form inside the 327px mobile measure, act and door and all',
    (_key, item) => {
      const short =
        item.short.days == null
          ? `${item.short.state} · ${item.short.subject}`
          : `${item.short.state} ${item.short.days}D · ${item.short.subject}`;
      const act = item.act ? shortenAct(item.act.label) : null;
      expect(width(short, act)).toBeLessThanOrEqual(
        LENS_LINE2_MEASURE_PX.mobile,
      );
    },
  );

  it.each(ranked.map((item) => [item.key, item] as const))(
    'fits %s’s LONG form inside the 900px full measure',
    (_key, item) => {
      expect(width(item.sentence, item.act?.label ?? null)).toBeLessThanOrEqual(
        LENS_LINE2_MEASURE_PX.full,
      );
    },
  );

  it('leads with the most overdue thing, and names it with its act', () => {
    const model = deriveLensBand(
      input({ needs: SEEDED, ticket: SEEDED_TICKET, tier: 'full' }),
    );
    expect(model.line2.sentence).toBe(SEEDED[0].text);
    expect(model.line2.act?.label).toBe('Send reminder');
  });
});

describe('line 1 drops the money while line 2 names it (D-B26)', () => {
  it('yields the money half to line 2 on the …d5 shape', () => {
    const model = deriveLensBand(
      input({
        needs: [
          need(
            'invoice',
            'overdue_invoice',
            'Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 22',
            'Send reminder',
          ),
        ],
      }),
    );
    expect(model.standing[0].namesMoney).toBe(true);
    expect(model.line1.rightFlush).toBe('INSTALL SEP 15');
    expect(model.line1.moneyOnly).toBeNull();
  });

  it('keeps the money on line 1 when line 2 is naming something else', () => {
    const model = deriveLensBand(input({ needs: [VANDERSTEEN_NEEDS[0]] }));
    expect(model.standing[0].namesMoney).toBe(false);
    expect(model.line1.rightFlush).toBe('INSTALL SEP 15 · $17,500 OUT');
    expect(model.line1.moneyOnly).toBe('$17,500 OUT');
  });

  it('yields it for the ticket’s own money row too', () => {
    const model = deriveLensBand(
      input({
        ticket: [
          ticketRow('money', {
            rank: 'money-at-risk',
            phrase: '$17,500 owed you',
            standingSince: '2026-08-22',
          }),
        ],
      }),
    );
    expect(model.line1.rightFlush).toBe('INSTALL SEP 15');
  });
});

describe('deriveLensBand · the open inputs (W3-R2)', () => {
  const INPUT_ITEM = {
    key: 'signature',
    eyebrow: 'SIGNATURE',
    sentence: 'Client signature · Client · blocks Project activation',
    act: null,
  };

  it('counts the inputs in the door and carries them for the sheet', () => {
    const model = deriveLensBand(
      input({ needs: VANDERSTEEN_NEEDS, inputs: [INPUT_ITEM] }),
    );
    expect(model.line2.standingCount).toBe(5);
    expect(model.inputs).toEqual([INPUT_ITEM]);
  });

  it('carries them on a paper where nothing else stands', () => {
    const model = deriveLensBand(
      input({
        inputs: [INPUT_ITEM],
        guide: { text: 'Sent Aug 23 — not yet opened', act: null },
      }),
    );
    expect(model.line2.kind).toBe('guide');
    expect(model.line2.standingCount).toBe(1);
    expect(model.inputs).toHaveLength(1);
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
