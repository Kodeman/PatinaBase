import type { RedLetterRow } from '@/components/document/red-letter-zone';
import {
  HELD_SENTENCE,
  deriveLensBand,
  deriveNext,
  rankStanding,
  shortSubject,
  shortenAct,
  standingDoorLabel,
  type LensBandInput,
  type LensNeedRow,
  type LensOwnAct,
  type LensSpreadKind,
  type LensStandingItem,
} from '../lens-band-derivation';
import { installReading, type InstallReading } from '../install-reading';
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

// FR1 F9 (0a-7) — the placeholder guard reaches the sticky eyebrow: a seeded
// `Client User` never prints on line 1, in either voice.
describe('deriveLensBand · the placeholder guard on line 1 (F9)', () => {
  it.each(['Client User', 'client', '  CLIENT  USER '])(
    'prints `the client` for the placeholder %p',
    (household) => {
      const model = deriveLensBand(input({ household }));
      expect(model.line1.identity).toBe('THE CLIENT');
      // F2-1 — the voice prints the job, never the household.
      expect(model.voice.eyebrow).toBe('Project');
    },
  );

  it('prints no name at all when there is no household', () => {
    const model = deriveLensBand(input({ household: '  ' }));
    expect(model.line1.identity).toBe('');
    expect(model.voice.eyebrow).toBe('Project');
  });
});

describe('deriveLensBand · the voice’s line 1 is the job (F2-1)', () => {
  it('prints the job’s name, never the household or its no-login suffix', () => {
    const model = deriveLensBand(
      input({ household: 'Chen family (no-login household)', jobName: 'Chen Residence' }),
    );
    expect(model.voice.eyebrow).toBe('Project · Chen Residence');
    expect(model.voice.eyebrowStage).toBe('Project');
    expect(model.voice.eyebrowDetail).toBe('Chen Residence');
    expect(model.voice.eyebrow).not.toMatch(/no-login|Chen family/);
  });

  it('prints the stage alone where the job has no name', () => {
    const model = deriveLensBand(input({ household: 'Vandersteen residence', jobName: '  ' }));
    expect(model.voice.eyebrow).toBe('Project');
    expect(model.voice.eyebrowDetail).toBeNull();
  });

  it('keeps the held and closed forms', () => {
    expect(
      deriveLensBand(input({ jobName: 'Harrow', projectStatus: 'on_hold' })).voice.eyebrow,
    ).toBe('Project · On hold');
    expect(
      deriveLensBand(input({ jobName: 'Lindqvist', projectStatus: 'completed' })).voice.eyebrow,
    ).toBe('Care · Closed');
  });
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
        medium: null,
        short: null,
        standingCount: 0,
        withheld: 0,
        withheldHasException: false,
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

// ── W3-F2 — a GUIDE line has a second form, and never prints an empty one ──
describe('deriveLensBand \u00b7 the guide line fits its measure (D-B24)', () => {
  const OPEN_INPUT = (index: number, label: string) => ({
    key: `${index}:${label}`,
    eyebrow: label.split(/\s+/).pop()!.toUpperCase(),
    sentence: `${label} \u00b7 Client \u00b7 blocks Direction`,
    act: {
      key: `input:${label}`,
      label: `Add ${label}`,
      onAct: jest.fn(),
    },
  });

  /** The seeded discovery paper: five open inputs, one of them the studio's. */
  const FIVE_INPUTS = [
    OPEN_INPUT(0, 'Project type and named rooms'),
    OPEN_INPUT(1, 'Working budget'),
    OPEN_INPUT(2, 'Target or hard date'),
    OPEN_INPUT(3, 'Style direction'),
    OPEN_INPUT(4, 'Lifestyle needs'),
  ];

  const LONG_SENTENCE =
    'Yours to add: project type and named rooms. Waiting on the Ashfords: working budget, target or hard date and 2 more.';
  const MEDIUM_SENTENCE =
    'Yours to add: scope. Waiting on the Ashfords: budget and 3 more.';
  const SHORT_SENTENCE = '1 yours \u00b7 4 theirs';

  const guideBand = (tier: LensBandInput['tier']) =>
    deriveLensBand(
      input({
        spreadKind: 'discovery',
        installDate: null,
        moneyFigure: null,
        tier,
        inputs: FIVE_INPUTS,
        namedInputKey: '0:Project type and named rooms',
        guide: {
          text: LONG_SENTENCE,
          medium: MEDIUM_SENTENCE,
          short: SHORT_SENTENCE,
          act: {
            key: 'open-missing-input',
            label: 'Add Project type and named rooms',
            shortLabel: 'Add Scope',
            onAct: jest.fn(),
          },
        },
      }),
    );

  it('prints the long form at the full measure when it fits', () => {
    // Four open inputs, one of them named on line 2 — the shape the long form
    // was calibrated for.
    const fourOpen = [
      OPEN_INPUT(0, 'Working budget'),
      OPEN_INPUT(1, 'Target or hard date'),
      OPEN_INPUT(2, 'Style direction'),
      OPEN_INPUT(3, 'Lifestyle needs'),
    ];
    const model = deriveLensBand(
      input({
        spreadKind: 'discovery',
        installDate: null,
        moneyFigure: null,
        tier: 'full',
        inputs: fourOpen,
        namedInputKey: '0:Working budget',
        guide: {
          text: 'Waiting on Avery: working budget, target or hard date and 2 more.',
          short: 'Waiting on Avery \u00b7 4 open',
          act: {
            key: 'open-missing-input',
            label: 'Add Working budget',
            shortLabel: 'Add Budget',
            onAct: jest.fn(),
          },
        },
      }),
    );
    expect(model.line2.kind).toBe('guide');
    expect(model.line2.form).toBe('long');
    expect(model.line2.sentence).toBe(
      'Waiting on Avery: working budget, target or hard date and 2 more.',
    );
    expect(model.line2.act?.label).toBe('Add Working budget');
  });

  // The seeded paper: five open inputs and the longest act on the stage. Its
  // long form does not fit even the 900 measure — and before the medium rung
  // existed it fell straight to the count, at 1440, on the one paper a
  // designer meets first.
  it('takes the medium rung at the full measure, and names the household', () => {
    const model = guideBand('full');
    expect(model.line2.kind).toBe('guide');
    expect(model.line2.form).toBe('medium');
    expect(model.line2.sentence).toBe(MEDIUM_SENTENCE);
    expect(model.line2.sentence).toContain('the Ashfords');
    // The medium sentence fits beside the act's WHOLE label, so the act keeps
    // its words: only the recital was given up.
    expect(model.line2.act?.label).toBe('Add Project type and named rooms');
  });

  it('falls past the medium rung to the count at the mobile measure', () => {
    const model = guideBand('mobile');
    expect(model.line2.form).toBe('short');
    expect(model.line2.sentence).toBe(SHORT_SENTENCE);
    expect(model.line2.act?.label).toBe('Add Scope');
  });

  // …and gives the act's words up next, before it gives up the household.
  it('drops to the act\u2019s short label when the medium form needs the room', () => {
    const model = deriveLensBand(
      input({
        spreadKind: 'discovery',
        installDate: null,
        moneyFigure: null,
        tier: 'full',
        inputs: FIVE_INPUTS,
        namedInputKey: '0:Project type and named rooms',
        guide: {
          text: LONG_SENTENCE,
          // 84 characters — past the measure beside the whole act, inside it
          // beside the short one.
          medium:
            'Yours to add: scope and floor plans. Waiting on the Ashfords: budget and 3 more.',
          short: SHORT_SENTENCE,
          act: {
            key: 'open-missing-input',
            label: 'Add Project type and named rooms',
            shortLabel: 'Add Scope',
            onAct: jest.fn(),
          },
        },
      }),
    );
    expect(model.line2.form).toBe('medium');
    expect(model.line2.act?.label).toBe('Add Scope');
  });

  it('never prints an empty sentence at either measure', () => {
    expect(guideBand('full').line2.sentence).not.toBe('');
    expect(guideBand('mobile').line2.sentence).not.toBe('');
  });

  it('falls to the count where the guide states no medium form', () => {
    const model = deriveLensBand(
      input({
        spreadKind: 'discovery',
        installDate: null,
        moneyFigure: null,
        tier: 'full',
        inputs: FIVE_INPUTS,
        namedInputKey: '0:Project type and named rooms',
        guide: {
          text: LONG_SENTENCE,
          short: SHORT_SENTENCE,
          act: {
            key: 'open-missing-input',
            label: 'Add Project type and named rooms',
            shortLabel: 'Add Scope',
            onAct: jest.fn(),
          },
        },
      }),
    );
    expect(model.line2.form).toBe('short');
    expect(model.line2.sentence).toBe(SHORT_SENTENCE);
  });

  it('keeps the long form at 390 when two open inputs fit it', () => {
    const twoOpen = [OPEN_INPUT(0, 'Working budget'), OPEN_INPUT(1, 'Style direction')];
    const model = deriveLensBand(
      input({
        spreadKind: 'discovery',
        installDate: null,
        moneyFigure: null,
        tier: 'mobile',
        inputs: twoOpen,
        namedInputKey: '0:Working budget',
        guide: {
          text: 'Waiting on Avery: budget.',
          short: 'Waiting on Avery \u00b7 2 open',
          act: null,
        },
      }),
    );
    expect(model.line2.form).toBe('long');
    expect(model.line2.sentence).toBe('Waiting on Avery: budget.');
  });
});

// ── W3-F5 — the D1 exclusion follows what line 2 actually printed ──────────
describe('deriveLensBand \u00b7 the named input is dropped only on a guide line', () => {
  const INPUTS = [
    {
      key: '0:Working budget',
      eyebrow: 'BUDGET',
      sentence: 'Working budget \u00b7 Client \u00b7 blocks Direction',
      act: null,
    },
    {
      key: '1:Style direction',
      eyebrow: 'DIRECTION',
      sentence: 'Style direction \u00b7 Client \u00b7 blocks Direction',
      act: null,
    },
  ];
  const GUIDE = {
    text: 'Waiting on Avery: working budget and style direction.',
    act: { key: 'open-missing-input', label: 'Add Working budget', onAct: jest.fn() },
  };

  it('drops it when line 2 is the guide', () => {
    const model = deriveLensBand(
      input({ inputs: INPUTS, namedInputKey: '0:Working budget', guide: GUIDE }),
    );
    expect(model.line2.kind).toBe('guide');
    expect(model.inputs.map((item) => item.key)).toEqual(['1:Style direction']);
    expect(model.line2.withheld).toBe(1);
  });

  it('keeps every input when a standing exception outranks the guide', () => {
    const model = deriveLensBand(
      input({
        needs: VANDERSTEEN_NEEDS,
        inputs: INPUTS,
        namedInputKey: '0:Working budget',
        guide: GUIDE,
        now: NOW,
      }),
    );
    expect(model.line2.kind).toBe('standing');
    expect(model.inputs.map((item) => item.key)).toEqual([
      '0:Working budget',
      '1:Style direction',
    ]);
    // Four exceptions plus both inputs, less the one line 2 is naming.
    expect(model.line2.standingCount).toBe(6);
    expect(model.line2.withheld).toBe(5);
  });

  it('keeps every input where the guide names none', () => {
    const model = deriveLensBand(input({ inputs: INPUTS, guide: GUIDE }));
    expect(model.inputs).toHaveLength(2);
    expect(model.line2.withheld).toBe(2);
  });
});

// ── W3-F7 — the door is painted in the register of what it holds ───────────
describe('deriveLensBand \u00b7 withheldHasException', () => {
  const INPUT_ONLY = {
    key: '0:Working budget',
    eyebrow: 'BUDGET',
    sentence: 'Working budget \u00b7 Client \u00b7 blocks Direction',
    act: null,
  };

  it('is false when every withheld row is an open input', () => {
    const model = deriveLensBand(
      input({
        inputs: [INPUT_ONLY],
        guide: { text: 'Waiting on Avery: working budget.', act: null },
      }),
    );
    expect(model.line2.withheldHasException).toBe(false);
  });

  it('is true when a standing exception is behind the door', () => {
    const model = deriveLensBand(
      input({ needs: VANDERSTEEN_NEEDS, inputs: [INPUT_ONLY], now: NOW }),
    );
    expect(model.line2.withheldHasException).toBe(true);
  });
});

// ── D10 / D2 class 3 — setup stands in the sheet, never on line 2 ─────────
describe('deriveLensBand · setup (D10)', () => {
  const NAME_THE_PHASES = need(
    'schedule-0',
    'schedule_unconfigured',
    'Name the phases so the schedule can be built',
    'Name the phases',
  );
  const GUIDE = { text: 'Place the orders for the approved pieces.', act: null };
  const NO_CLIENT = { kind: 'no_client_linked' as const, onAct: jest.fn() };

  it('excludes setup from the winner while any non-setup row stands', () => {
    const model = deriveLensBand(
      input({
        needs: [NAME_THE_PHASES, ...VANDERSTEEN_NEEDS],
        setup: [NO_CLIENT],
        guide: GUIDE,
        now: NOW,
      }),
    );
    expect(model.line2.kind).toBe('standing');
    expect(model.line2.long.sentence).not.toBe(NAME_THE_PHASES.text);
    expect(model.standing.map((item) => item.needKind)).not.toContain(
      'schedule_unconfigured',
    );
    expect(model.setup.map((row) => row.setup)).toEqual([
      'schedule_unconfigured',
      'no_client_linked',
    ]);
  });

  it('on a quiet job (Cedar Lane), line 2 is the stage’s own guide line and setup stays behind the door', () => {
    const model = deriveLensBand(
      input({ needs: [NAME_THE_PHASES], guide: GUIDE, now: NOW }),
    );
    expect(model.line2.kind).toBe('guide');
    expect(model.line2.long.sentence).toBe(GUIDE.text);
    expect(model.standing).toEqual([]);
    expect(model.setup).toEqual([
      expect.objectContaining({
        setup: 'schedule_unconfigured',
        sentence: NAME_THE_PHASES.text,
        act: expect.objectContaining({ label: 'Name the phases' }),
      }),
    ]);
    expect(model.line2.standingCount).toBe(1);
    expect(model.line2.withheld).toBe(1);
    // The door over setup alone is clay, never terracotta.
    expect(model.line2.withheldHasException).toBe(false);
  });

  it('never prints setup on line 2, even with no guide', () => {
    const model = deriveLensBand(input({ setup: [NO_CLIENT] }));
    expect(model.line2.kind).toBe('none');
    expect(model.line2.act).toBeNull();
    expect(model.line2.withheld).toBe(1);
  });

  it('prints `No client linked` once, as a SETUP row whose act is `Link a client`', () => {
    const onAct = jest.fn();
    const model = deriveLensBand(
      input({ setup: [{ kind: 'no_client_linked', onAct }], guide: GUIDE }),
    );
    expect(model.setup).toHaveLength(1);
    const [row] = model.setup;
    expect(row.sentence).toBe('No client linked');
    expect(row.act?.label).toBe('Link a client');
    row.act?.onAct();
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('names the target and budget rows by D3’s plain acts', () => {
    const model = deriveLensBand(
      input({
        setup: [
          { kind: 'target_date_unset', onAct: jest.fn() },
          { kind: 'budget_band_unset', onAct: jest.fn() },
        ],
      }),
    );
    expect(model.setup.map((row) => row.act?.label)).toEqual([
      // R19 — the act is `Set dates`; the sentence stays `No target date set`.
      'Set dates',
      'Set a budget band',
    ]);
  });

  it.each(['completed', 'on_hold'])(
    'suppresses `No client linked` on a %s job',
    (projectStatus) => {
      const model = deriveLensBand(
        input({
          setup: [NO_CLIENT, { kind: 'target_date_unset', onAct: jest.fn() }],
          projectStatus,
        }),
      );
      expect(model.setup.map((row) => row.setup)).toEqual(['target_date_unset']);
    },
  );

  it('keeps `No client linked` on a live job', () => {
    const model = deriveLensBand(
      input({ setup: [NO_CLIENT], projectStatus: 'active' }),
    );
    expect(model.setup.map((row) => row.setup)).toEqual(['no_client_linked']);
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

// ── Slice 2 (`one-voice`) — D1's eyebrow, D2's Next and door ─────────────────

/** Chen Residence: one balance owed to the maker, past its day (class 1), with
 *  two class-2 rows standing beside it. */
const CHEN_PAYMENT = 'Balance to Woodward & Sons · $12,400 due Aug 20 — PO WS-188';
const CHEN_NEEDS: LensNeedRow[] = [
  { ...need('approval-0', 'overdue_decision', 'Primary bedroom approval overdue 6 days', 'Send a reminder', '2026-08-23'), owner: 'client' },
  { ...need('pay-0', 'payment_due', CHEN_PAYMENT, 'Record payment', '2026-08-20'), owner: 'designer' },
  { ...need('po-0', 'po_unacknowledged', 'PO-2026-0418 sent — no acknowledgment, 14 days', 'Follow up with the maker'), owner: 'maker' },
];
const chen = (over: Partial<LensBandInput> = {}) =>
  input({ household: 'Chen Residence', jobName: 'Chen Residence', needs: CHEN_NEEDS, now: NOW, ...over });

const OWN: LensOwnAct = {
  key: 'own',
  label: 'Spec the 3 unspecified',
  targetId: 'document-act-pieces-head',
  tier: 'scored',
  sentence: 'Three pieces still need a spec before they can be ordered.',
  shortSentence: '3 pieces need a spec',
  onAct: jest.fn(),
};
const standingOf = (needs: readonly LensNeedRow[]) => rankStanding([], needs, NOW);
const held = (item: LensStandingItem): LensStandingItem => ({
  ...item,
  act: item.act && { ...item.act, held: { reason: 'Link a client first.' } },
});

describe('deriveNext · D2’s order', () => {
  it('puts class 1 above class 2 and above the stage’s own act', () => {
    const next = deriveNext({
      standing: standingOf(CHEN_NEEDS),
      ownAct: OWN,
      clientFirstName: 'Chen',
      closed: false,
    });
    expect(next?.rowKey).toBe('need:pay-0');
    // 498-j — prose, read from the need: payee, PO, word, figure, days past.
    expect(next?.sentence).toBe('Pay Woodward & Sons the PO WS-188 balance, $12,400 — 9 days overdue.');
    expect(next?.shortSentence).toBe('PO WS-188 balance, 9 days overdue.');
    // D1 — named from the one table, whatever the source printed.
    expect(next?.act.label).toBe('Record the payment');
    expect(next?.act.tier).toBe('filled');
  });

  it('orders a class by deadline: the most days past first', () => {
    const next = deriveNext({
      standing: standingOf([
        need('pay-0', 'payment_due', 'Balance due', 'Record payment', '2026-08-27'),
        need('inv-0', 'overdue_invoice', 'INV-0042 overdue', 'Send reminder', '2026-08-20'),
      ]),
      ownAct: null,
      clientFirstName: null,
      closed: false,
    });
    expect(next?.rowKey).toBe('need:inv-0');
  });

  it('puts the stage’s own act above setup, and setup is never Next while it stands', () => {
    const { setup } = deriveLensBand(
      input({ setup: [{ kind: 'no_client_linked', onAct: jest.fn() }] }),
    );
    const next = deriveNext({ standing: [], setup, ownAct: OWN, clientFirstName: null, closed: false });
    expect(next?.rowKey).toBeNull();
    expect(next?.act.label).toBe('Spec the 3 unspecified');
    expect(next?.act.targetId).toBe('document-act-pieces-head');
    expect(next?.sentence).toBe(OWN.sentence);
    expect(next?.shortSentence).toBe(OWN.shortSentence);
  });

  it('reaches setup only when nothing in classes 1–2 or an own act stands', () => {
    const { setup } = deriveLensBand(
      input({ setup: [{ kind: 'no_client_linked', onAct: jest.fn() }] }),
    );
    const next = deriveNext({ standing: [], setup, ownAct: null, clientFirstName: null, closed: false });
    expect(next?.act.label).toBe('Link a client');
    expect(next?.rowKey).toBe(setup[0].key);
  });

  it('skips a gated act: it stands in the sheet with its reason, never Next', () => {
    const standing = standingOf(CHEN_NEEDS).map((item) =>
      item.key === 'need:pay-0' ? held(item) : item,
    );
    const next = deriveNext({ standing, ownAct: OWN, clientFirstName: 'Chen', closed: false });
    expect(next?.rowKey).toBe('need:approval-0');

    const gatedOwn = deriveNext({
      standing: [],
      ownAct: { ...OWN, held: { reason: 'Link a client first.' } },
      clientFirstName: null,
      closed: false,
    });
    expect(gatedOwn).toBeNull();
  });

  it('skips a row with no act — there is nothing to take', () => {
    const next = deriveNext({
      standing: standingOf([need('pay-0', 'payment_due', 'Balance due', null, '2026-08-20')]),
      ownAct: OWN,
      clientFirstName: null,
      closed: false,
    });
    expect(next?.rowKey).toBeNull();
    expect(next?.act.label).toBe(OWN.label);
  });

  it('returns null on a closed job', () => {
    expect(
      deriveNext({ standing: standingOf(CHEN_NEEDS), ownAct: OWN, clientFirstName: null, closed: true }),
    ).toBeNull();
  });

  it('prints custody only as the recorded owner allows (D8)', () => {
    const custody = (owner: LensNeedRow['owner'], first: string | null) =>
      deriveNext({
        standing: standingOf([{ ...need('d-0', 'overdue_decision', 'Fabric overdue', 'Choose'), owner }]),
        ownAct: null,
        clientFirstName: first,
        closed: false,
      })?.sentence;
    expect(custody('client', 'Chen')).toBe('Waiting on Chen: Fabric overdue');
    expect(custody('client', null)).toBe('Waiting on the client: Fabric overdue');
    expect(custody('maker', 'Chen')).toBe('With the maker: Fabric overdue');
    expect(custody('designer', 'Chen')).toBe('Fabric overdue');
    expect(custody(undefined, 'Chen')).toBe('Fabric overdue');
  });

  it('quotes the install reading when its act is Next (D6)', () => {
    const ask: LensOwnAct = {
      ...OWN,
      label: 'Ask the maker for a date',
      targetId: 'document-act-install-reading',
    };
    const reading: InstallReading = {
      state: 'not_here_undated',
      sentence: 'Waiting on the sofa from Woodward & Sons — no date yet.',
      act: { label: 'Ask the maker for a date', targetId: 'document-act-install-reading', tier: 'scored' },
      firstItemId: 'ffe-1',
    };
    const next = deriveNext({
      standing: [],
      ownAct: ask,
      installReading: reading,
      clientFirstName: null,
      closed: false,
    });
    expect(next?.sentence).toBe(reading.sentence);
    // FR3 F3-11 — the reading's own short form, never the long one repeated;
    // none stated, no short rung.
    expect(next?.shortSentence).toBe('');
    expect(
      deriveNext({
        standing: [],
        ownAct: ask,
        installReading: { ...reading, shortSentence: 'Sofa isn’t here — no date recorded.' },
        clientFirstName: null,
        closed: false,
      })?.shortSentence,
    ).toBe('Sofa isn’t here — no date recorded.');

    const other = deriveNext({ standing: [], ownAct: OWN, installReading: reading, clientFirstName: null, closed: false });
    expect(other?.sentence).toBe(OWN.sentence);
  });
});

describe('deriveNext · the payment as prose (498-j)', () => {
  const payment = (text: string, dueOn: string | null, now: Date) =>
    deriveNext({
      standing: rankStanding([], [need('pay', 'payment_due', text, 'Record payment', dueOn)], now),
      ownAct: null,
      clientFirstName: null,
      closed: false,
    });

  it('prints Chen’s balance in the review’s words, long and short', () => {
    const next = payment(
      'Balance to Woodward & Sons · $3,400 due 12 May — WS-188',
      '2026-05-12',
      new Date('2026-10-07T12:00:00'),
    );
    expect(next?.sentence).toBe('Pay Woodward & Sons the WS-188 balance, $3,400 — 148 days overdue.');
    expect(next?.shortSentence).toBe('WS-188 balance, 148 days overdue.');
  });

  it('derives every part from the need, never from Chen', () => {
    const next = payment(
      'Deposit to Halloran Joinery · $900 due Sep 1 — NA-2026-077',
      '2026-09-01',
      new Date('2026-09-02T12:00:00'),
    );
    expect(next?.sentence).toBe('Pay Halloran Joinery the NA-2026-077 deposit, $900 — 1 day overdue.');
    expect(next?.shortSentence).toBe('NA-2026-077 deposit, 1 day overdue.');
  });

  it('keeps the need’s own words where the line is not the payment template', () => {
    const text = '2 payments to makers due — first Aug 20';
    const next = payment(text, '2026-08-20', NOW);
    expect(next?.sentence).toBe(text);
  });
});

describe('deriveNext · the band names the client’s first name (499-1)', () => {
  const decision = [
    { ...need('d', 'overdue_decision', 'Bedroom approval overdue 6 days', 'Send a reminder', '2026-08-23'), owner: 'client' as const },
  ];

  it('prints Nudge Mei, and the client only as the family fallback', () => {
    const named = deriveNext({ standing: standingOf(decision), ownAct: null, clientFirstName: 'Mei', closed: false });
    expect(named?.act.label).toBe('Nudge Mei');
    const unnamed = deriveNext({ standing: standingOf(decision), ownAct: null, clientFirstName: null, closed: false });
    expect(unnamed?.act.label).toBe('Nudge the client');
  });

  it('names the sheet rows from the first name the caller passes', () => {
    const { voice } = deriveLensBand(
      input({ needs: decision, household: 'Client User', clientFirstName: 'Mei', now: NOW, ownAct: null }),
    );
    expect(voice.next?.act.label).toBe('Nudge Mei');
    expect(voice.standing[0].act?.label).toBe('Nudge Mei');
  });
});

describe('deriveLensBand · the voice (D1 eyebrow, D2 band)', () => {
  it('prints `STAGE · Name` on line 1 — the word alone, never `N OF M`', () => {
    const { voice } = deriveLensBand(chen());
    expect(voice.eyebrow).toBe('Project · Chen Residence');
    expect(voice.eyebrow).not.toMatch(/\d+\s+OF\s+\d+/i);
  });

  it('prints `Project · On hold` on a held job', () => {
    expect(deriveLensBand(chen({ projectStatus: 'on_hold' })).voice.eyebrow).toBe(
      'Project · On hold',
    );
  });

  it('prints `Care · Closed` and no Next on a closed job, keeping today’s sentence', () => {
    const model = deriveLensBand(chen({ projectStatus: 'completed' }));
    expect(model.voice.eyebrow).toBe('Care · Closed');
    expect(model.voice.next).toBeNull();
    expect(model.voice.lead).toBeNull();
    expect(model.voice.sentence).toBe(model.line2.sentence);
  });

  it('on Chen, names the balance with RECORD THE PAYMENT and counts two behind the door', () => {
    const { voice } = deriveLensBand(chen());
    expect(voice.lead).toBe('Next ─');
    expect(voice.form).toBe('long');
    expect(voice.sentence).toBe(
      'Pay Woodward & Sons the PO WS-188 balance, $12,400 — 9 days overdue.',
    );
    // F2-4 — every rung below it, in yield order; the act never yields.
    expect(voice.rungs.map((rung) => rung.form)).toEqual(['long', 'short', 'act']);
    expect(voice.rungs[2]).toEqual({ form: 'act', lead: 'Next ─', sentence: '' });
    expect(voice.next?.act.label).toBe('Record the payment');
    expect(voice.standingCount).toBe(2);
    expect(standingDoorLabel(voice.standingCount)).toBe('Standing · 2');
    expect(voice.doorInDock).toBe(false);
  });

  it('counts every sheet row — exceptions, inputs, setup — minus the one Next names', () => {
    const { voice } = deriveLensBand(
      chen({
        inputs: [{ key: 'in-0', eyebrow: 'SIGNATURE', sentence: 'Client signature', act: null }],
        setup: [{ kind: 'target_date_unset', onAct: jest.fn() }],
      }),
    );
    expect(voice.standingCount).toBe(2 + 1 + 1);
  });

  it('is silent when the one thing standing is the thing Next names', () => {
    const { voice } = deriveLensBand(chen({ needs: [CHEN_NEEDS[1]] }));
    expect(voice.next?.rowKey).toBe('need:pay-0');
    expect(voice.standingCount).toBe(0);
  });

  it('on a quiet job, Next is the stage’s own act and setup stays behind the door', () => {
    const { voice } = deriveLensBand(
      input({
        needs: [],
        setup: [{ kind: 'no_client_linked', onAct: jest.fn() }],
        ownAct: { ...OWN, label: 'Open the pieces', sentence: null, shortSentence: null },
      }),
    );
    expect(voice.next?.rowKey).toBeNull();
    expect(voice.next?.act.label).toBe('Open the pieces');
    expect(voice.standingCount).toBe(1);
  });

  it('498-c — never lets the guide line stand in for the own act', () => {
    const { voice } = deriveLensBand(
      input({
        needs: [],
        guide: {
          text: 'Place the orders for the approved pieces.',
          act: { key: 'guide', label: 'Open the pieces', onAct: jest.fn() },
        },
        ownAct: { ...OWN, label: 'Open the pieces', sentence: null, shortSentence: null },
      }),
    );
    // No status sentence: the act alone, NEXT ─ OPEN THE PIECES.
    expect(voice.lead).toBe('Next ─');
    expect(voice.sentence).toBe('');
    expect(voice.form).toBe('act');
    expect(voice.next?.act.label).toBe('Open the pieces');
  });

  it('498-c — prints the region’s status sentence beside the own act where it states one', () => {
    const { voice } = deriveLensBand(
      input({ ownAct: { ...OWN, sentence: '3 lines unspecified.', shortSentence: null } }),
    );
    expect(voice.lead).toBe('Next ─');
    expect(voice.sentence).toBe('3 lines unspecified.');
    expect(voice.next?.act.label).toBe('Spec the 3 unspecified');
  });

  it('500-5 — while the own act is not known, line 2 prints the NEXT eyebrow and nothing else', () => {
    const { voice } = deriveLensBand(
      input({
        needs: [],
        setup: [{ kind: 'target_date_unset', onAct: jest.fn() }],
        guide: {
          text: 'Place the orders for the approved pieces.',
          act: { key: 'guide', label: 'Open the pieces', onAct: jest.fn() },
        },
      }),
    );
    expect(voice.next).toBeNull();
    expect(voice.lead).toBe('Next');
    expect(voice.sentence).toBe('');
    expect(voice.standingCount).toBe(0);
    expect(voice.doorInDock).toBe(false);
  });

  it('500-5 — a standing row is still Next while the own act loads', () => {
    const { voice } = deriveLensBand(
      chen({ setup: [{ kind: 'target_date_unset', onAct: jest.fn() }] }),
    );
    expect(voice.next?.rowKey).toBe('need:pay-0');
    expect(voice.standingCount).toBe(3);
  });

  it('F2-10 — a held job prints the hold sentence, no Next and no setup rows', () => {
    const setup = [{ kind: 'target_date_unset' as const, onAct: jest.fn() }];
    const { voice } = deriveLensBand(chen({ projectStatus: 'on_hold', setup, ownAct: OWN }));
    expect(voice.next).toBeNull();
    expect(voice.lead).toBeNull();
    expect(voice.sentence).toBe(HELD_SENTENCE);
    expect(voice.sentence).toBe('Paused — nothing moves until it resumes.');
    expect(voice.setup).toEqual([]);
    // Every class 1–2 row stands behind the door; setup never does.
    expect(voice.standingCount).toBe(3);
    expect(voice.doorClassOne).toBe(true);
  });

  it('F2-10 — a held job’s door is silent when only setup stands', () => {
    const { voice } = deriveLensBand(
      input({
        projectStatus: 'on_hold',
        setup: [{ kind: 'target_date_unset', onAct: jest.fn() }],
        ownAct: OWN,
      }),
    );
    expect(voice.sentence).toBe(HELD_SENTENCE);
    expect(voice.standingCount).toBe(0);
  });

  it('F2-11 — a closed job keeps today’s sentence, no Next, no setup rows, a silent door', () => {
    const { voice, line2 } = deriveLensBand(
      chen({
        projectStatus: 'completed',
        setup: [{ kind: 'target_date_unset', onAct: jest.fn() }],
        ownAct: OWN,
      }),
    );
    expect(voice.next).toBeNull();
    expect(voice.lead).toBeNull();
    expect(voice.sentence).toBe(line2.sentence);
    expect(voice.setup).toEqual([]);
    expect(voice.standingCount).toBe(0);
  });

  it('F2-22 — the door is terracotta only for a class-1 row behind it, Next excluded', () => {
    // Chen: Next is the class-1 payment; a decision and a PO (class 2) stand
    // behind the door.
    expect(deriveLensBand(chen()).voice.doorClassOne).toBe(false);
    const twoPayments = [
      ...CHEN_NEEDS,
      need('pay-1', 'payment_due', 'Deposit to Halloran Joinery · $900 due Aug 25 — NA-7', 'Record payment', '2026-08-25'),
    ];
    expect(deriveLensBand(chen({ needs: twoPayments })).voice.doorClassOne).toBe(true);
  });

  it('F2-7 — every sheet row carries its own act where the paper holds one', () => {
    const { voice } = deriveLensBand(
      chen({
        clientFirstName: 'Mei',
        ownAct: OWN,
        ticket: [
          ticketRow('spec', { rank: 'piece-stuck', phrase: '3 unspecified', standingSince: null }),
          ticketRow('pieces', {
            rank: 'piece-stuck',
            phrase: 'NA-2026-077 unanswered, 6 days',
            standingSince: '2026-08-23',
          }),
        ],
        inputs: [
          {
            key: '0:2 overdue client decisions',
            eyebrow: 'DECISIONS',
            sentence: '2 overdue client decisions',
            act: null,
            needKind: 'overdue_decision',
          },
        ],
      }),
    );
    const act = (key: string) => voice.standing.find((item) => item.key === key)?.act?.label;
    expect(act('ticket:spec')).toBe('Spec the 3 unspecified');
    expect(act('ticket:pieces')).toBe('Follow up with the maker');
    expect(voice.inputs[0].act?.label).toBe('Nudge Mei');
    // Borrowed acts never choose Next.
    expect(voice.next?.rowKey).toBe('need:pay-0');
  });

  it('takes the caller’s own act over the guide line when it is passed', () => {
    const { voice } = deriveLensBand(input({ ownAct: OWN }));
    expect(voice.next?.act.label).toBe(OWN.label);
    expect(voice.next?.act.targetId).toBe(OWN.targetId);
  });

  it('names each sheet row’s act from the one table, leaving the 0b list as it was', () => {
    const model = deriveLensBand(chen());
    const pay = (items: readonly LensStandingItem[]) => items.find((item) => item.key === 'need:pay-0');
    expect(pay(model.voice.standing)?.act?.label).toBe('Record the payment');
    expect(pay(model.standing)?.act?.label).toBe('Record payment');
  });

  it('at 390 the measure moves the door to the dock when it cannot fit after the act', () => {
    const phone = deriveLensBand(chen({ tier: 'mobile' })).voice;
    // 498-g / F2-4 — the door yields first, then the sentence; never the act.
    expect(phone.lead).toBe('Next ─');
    expect(phone.form).toBe('act');
    expect(phone.sentence).toBe('');
    expect(phone.next?.act.label).toBe('Record the payment');
    expect(phone.doorInDock).toBe(true);
    expect(phone.standingCount).toBe(2);
    // Nothing behind the door: there is no door to move.
    expect(deriveLensBand(chen({ tier: 'mobile', needs: [CHEN_NEEDS[1]] })).voice.doorInDock).toBe(
      false,
    );
  });
});

// FR1 F14 / R20 — a Direction or Proposal paper's open inputs are the
// proposal's own missing pieces: one row, never a `blocks Client proposal` row
// per gap.
describe('deriveLensBand · the proposal’s inputs collapse to one row (F14)', () => {
  const GAPS = [
    'rooms in scope',
    'phases & fees',
    'change-order terms',
    'payment schedule',
    'design fee',
    'timeline',
    'exclusions',
    'retainer',
  ].map((label, index) => ({
    key: `${index}:${label}`,
    eyebrow: (label.split(/\s+/).pop() ?? label).toUpperCase(),
    sentence: `${label} · Designer · blocks Client proposal`,
    act: null,
  }));
  const WRITE: LensOwnAct = {
    key: 'write-the-proposal',
    label: 'Write the proposal',
    targetId: 'document-act-contract-room-door',
    tier: 'scored',
    sentence: 'Write the proposal for Elena.',
    onAct: jest.fn(),
  };
  const elena = (over: Partial<LensBandInput> = {}) =>
    input({
      spreadKind: 'direction',
      household: 'Elena Marlowe',
      inputs: GAPS,
      ownAct: WRITE,
      ...over,
    });
  const printed = (items: readonly { eyebrow: string; sentence: string; act: { label: string } | null }[]) =>
    items.map((item) => `${item.eyebrow} ${item.sentence} ${item.act?.label ?? ''}`).join(' | ');

  it('is silent on Elena Marlowe when the band already names Write the proposal', () => {
    const { voice } = deriveLensBand(elena());
    expect(voice.next?.act.label).toBe('Write the proposal');
    expect(voice.inputs).toEqual([]);
    expect(voice.standingCount).toBe(0);
  });

  it('stands as one row with one act behind `Standing · 1` when Next names something else', () => {
    const onAct = jest.fn();
    const { voice } = deriveLensBand(
      elena({ needs: [CHEN_NEEDS[1]], now: NOW, ownAct: { ...WRITE, onAct } }),
    );
    expect(voice.next?.rowKey).toBe('need:pay-0');
    expect(voice.inputs).toHaveLength(1);
    expect(voice.inputs[0].sentence).toBe('The proposal needs 8 inputs');
    expect(voice.inputs[0].act?.label).toBe('Write the proposal');
    voice.inputs[0].act?.onAct();
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(standingDoorLabel(voice.standingCount)).toBe('Standing · 1');
  });

  it.each<LensSpreadKind>(['direction', 'proposal'])(
    'never prints `blocks` or `Client proposal` on a %s paper',
    (spreadKind) => {
      const model = deriveLensBand(elena({ spreadKind, ownAct: null }));
      expect(model.inputs).toHaveLength(1);
      expect(model.voice.inputs).toHaveLength(1);
      expect(printed(model.inputs)).not.toMatch(/blocks|Client proposal/);
      expect(printed(model.voice.inputs)).not.toMatch(/blocks|Client proposal/);
    },
  );

  it('counts one input in the singular', () => {
    const model = deriveLensBand(
      elena({
        spreadKind: 'proposal',
        ownAct: null,
        inputs: [
          {
            key: '0:Client signature',
            eyebrow: 'SIGNATURE',
            sentence: 'Client signature · Client · blocks Project activation',
            act: null,
          },
        ],
      }),
    );
    expect(model.voice.inputs.map((item) => item.sentence)).toEqual(['The proposal needs 1 input']);
  });

  it('withholds the row on the guide line when the guide’s act is Write the proposal', () => {
    const model = deriveLensBand(
      elena({
        ownAct: undefined,
        guide: {
          text: 'Eight inputs stand between the direction and the proposal.',
          act: { key: 'guide', label: 'Write the proposal', onAct: jest.fn() },
        },
      }),
    );
    expect(model.inputs).toEqual([]);
    expect(model.line2.standingCount).toBe(0);
    // 498-c — the guide never stands in: under one-voice the row is named only
    // when the own act, Write the proposal, is Next.
    expect(model.voice.next).toBeNull();
    expect(model.voice.inputs.map((item) => item.key)).toEqual(['proposal-inputs']);
  });

  it('leaves every other paper’s inputs one row each', () => {
    const model = deriveLensBand(input({ inputs: GAPS.slice(0, 2) }));
    expect(model.inputs).toHaveLength(2);
  });
});

// US-19 FR3 (design-review-3 §3) — the band and the standing sheet.
describe('deriveLensBand · FR3: every row carries its act (F3-8, 512-6)', () => {
  const ASK: LensOwnAct = {
    key: 'own:ask',
    label: 'Ask the maker for a date',
    targetId: 'document-act-install-reading',
    tier: 'scored',
    sentence: null,
    onAct: jest.fn(),
  };
  const rowsOf = (ticket: TicketRow[], over: Partial<LensBandInput> = {}) => {
    const landOn = jest.fn();
    const { voice } = deriveLensBand(
      input({ ticket, needs: [], clientFirstName: 'Mei', now: NOW, ownAct: OWN, landOn, ...over }),
    );
    return { voice, landOn };
  };
  const stuck = (phrase: string) => ({ rank: 'piece-stuck' as const, phrase, standingSince: null });

  it.each([
    ['pieces', '1 damaged', 'File the claim', 'document-act-pieces-head'],
    ['pieces', '2 awaiting a decision', 'Nudge Mei', null],
    ['money', '$4,200 owed you', 'Nudge Mei', null],
    ['dates', 'Install day has passed', 'Set dates', 'document-act-install-window'],
    ['pieces', 'NA-2026-077 unanswered, 6 days', 'Follow up with the maker', 'document-act-pieces-head'],
  ] as const)('%s `%s` carries `%s`, landing on %s', (key, phrase, label, target) => {
    const rank = key === 'money' || key === 'dates' ? 'promise-past-due' : 'piece-stuck';
    const { voice, landOn } = rowsOf([
      ticketRow(key, { rank, phrase, standingSince: key === 'pieces' ? null : '2026-08-01' }),
    ]);
    const row = voice.standing.find((item) => item.key === `ticket:${key}`);
    expect(row?.act?.label).toBe(label);
    row?.act?.onAct();
    expect(landOn).toHaveBeenCalledWith(target);
  });

  it('`N blocked project items` carries `Open the pieces`', () => {
    const { voice, landOn } = rowsOf([], {
      inputs: [{ key: '0:2 blocked project items', eyebrow: 'ITEMS', sentence: '2 blocked project items', act: null }],
    });
    expect(voice.inputs[0].act?.label).toBe('Open the pieces');
    voice.inputs[0].act?.onAct();
    expect(landOn).toHaveBeenCalledWith('document-act-pieces-head');
  });

  it('`N unspecified` carries `Spec the N unspecified` on an install paper, where the own act is another', () => {
    const { voice, landOn } = rowsOf([ticketRow('spec', stuck('2 unspecified'))], {
      spreadKind: 'install',
      ownAct: ASK,
    });
    expect(voice.next?.act.label).toBe('Ask the maker for a date');
    const spec = voice.standing.find((item) => item.key === 'ticket:spec');
    expect(spec?.act?.label).toBe('Spec the 2 unspecified');
    spec?.act?.onAct();
    expect(landOn).toHaveBeenCalledWith('document-act-pieces-head');
    // A row's act never chooses Next.
    expect(voice.next?.rowKey).toBeNull();
  });

  it('a need that holds the same act lends it: its press is the need’s', () => {
    const decision = {
      ...need('d-0', 'overdue_decision', 'Bedroom approval overdue 6 days', 'Send a reminder', '2026-08-23'),
      owner: 'client' as const,
    };
    const { voice, landOn } = rowsOf([ticketRow('pieces', stuck('2 awaiting a decision'))], {
      needs: [decision],
    });
    const row = voice.standing.find((item) => item.key === 'ticket:pieces');
    expect(row?.act?.label).toBe('Nudge Mei');
    row?.act?.onAct();
    expect(decision.onAct).toHaveBeenCalled();
    expect(landOn).not.toHaveBeenCalled();
  });

  it('without a landing, a row no need or own act lends to keeps none', () => {
    const { voice } = deriveLensBand(
      input({ ticket: [ticketRow('pieces', stuck('1 damaged'))], now: NOW, ownAct: OWN }),
    );
    expect(voice.standing.find((item) => item.key === 'ticket:pieces')?.act).toBeNull();
  });

  it('leaves the 0b list as it was', () => {
    const { standing } = deriveLensBand(
      input({ ticket: [ticketRow('pieces', stuck('1 damaged'))], now: NOW, ownAct: OWN, landOn: jest.fn() }),
    );
    expect(standing.find((item) => item.key === 'ticket:pieces')?.act).toBeNull();
  });
});

describe('deriveLensBand · FR3: one need, one row (F3-9, 512-7)', () => {
  const PO_NEED = {
    ...need('po-0', 'po_unacknowledged', 'NA-2026-077 sent — no acknowledgment', 'Follow up with the maker'),
    owner: 'maker' as const,
  };
  const SCHEDULE_NEED = need(
    'sched-0',
    'schedule_unconfigured',
    'Name the phases for this project',
    'Open the schedule',
  );

  it('Halloran: NA-2026-077 prints once, as Next’s row, and the door does not count it', () => {
    const { voice } = deriveLensBand(
      input({
        household: 'Client User',
        jobName: 'Halloran House',
        now: NOW,
        ownAct: null,
        landOn: jest.fn(),
        needs: [PO_NEED, SCHEDULE_NEED],
        ticket: [
          ticketRow('pieces', {
            rank: 'piece-stuck',
            phrase: 'NA-2026-077 unanswered, 6 days',
            standingSince: '2026-08-23',
          }),
        ],
        setup: [
          { kind: 'no_client_linked', onAct: jest.fn() },
          { kind: 'target_date_unset', onAct: jest.fn() },
          { kind: 'budget_band_unset', onAct: jest.fn() },
        ],
      }),
    );
    expect(voice.next?.rowKey).toBe('need:po-0');
    expect(voice.next?.act.label).toBe('Follow up with the maker');
    expect(voice.standing.map((item) => item.key)).toEqual(['need:po-0']);
    // Four setup rows behind the door; Next uncounted, the duplicate gone.
    expect(voice.setup).toHaveLength(4);
    expect(voice.standingCount).toBe(4);
  });

  it('keeps a row with the same act on another subject', () => {
    const { voice } = deriveLensBand(
      input({
        now: NOW,
        ownAct: null,
        landOn: jest.fn(),
        needs: [PO_NEED],
        ticket: [
          ticketRow('pieces', {
            rank: 'piece-stuck',
            phrase: 'PO-2026-0418 unanswered, 14 days',
            standingSince: '2026-08-15',
          }),
        ],
      }),
    );
    expect(voice.standing.map((item) => item.key).sort()).toEqual(['need:po-0', 'ticket:pieces']);
    expect(voice.standingCount).toBe(1);
  });

  it('512-7: the row carrying the own act Next is Next’s row — first, uncounted', () => {
    const { voice } = deriveLensBand(
      input({
        now: NOW,
        ownAct: OWN,
        ticket: [ticketRow('spec', { rank: 'piece-stuck', phrase: '3 unspecified', standingSince: null })],
        setup: [{ kind: 'target_date_unset', onAct: jest.fn() }],
      }),
    );
    expect(voice.next?.act.label).toBe('Spec the 3 unspecified');
    expect(voice.next?.rowKey).toBe('ticket:spec');
    expect(voice.next?.sentence).toBe(OWN.sentence);
    expect(voice.standingCount).toBe(1);
  });

  it('Chen: `Standing · 5` — 1 stuck + 4 setup, Next uncounted', () => {
    const { voice } = deriveLensBand(
      chen({
        needs: [CHEN_NEEDS[1], SCHEDULE_NEED],
        ownAct: OWN,
        landOn: jest.fn(),
        ticket: [ticketRow('spec', { rank: 'piece-stuck', phrase: '3 unspecified', standingSince: null })],
        setup: [
          { kind: 'no_client_linked', onAct: jest.fn() },
          { kind: 'target_date_unset', onAct: jest.fn() },
          { kind: 'budget_band_unset', onAct: jest.fn() },
        ],
      }),
    );
    expect(voice.next?.rowKey).toBe('need:pay-0');
    expect(voice.standing.find((item) => item.key === 'ticket:spec')?.act?.label).toBe(
      'Spec the 3 unspecified',
    );
    expect(standingDoorLabel(voice.standingCount)).toBe('Standing · 5');
  });
});

describe('deriveLensBand · FR3: Cedar’s band sentence is D6’s reading (F3-11)', () => {
  const ASK: LensOwnAct = {
    key: 'own:ask',
    label: 'Ask the maker for a date',
    targetId: 'document-act-install-reading',
    tier: 'scored',
    sentence: null,
    onAct: jest.fn(),
  };
  const piece = (id: string, name: string) => ({ id, name, status: 'ordered', purchase_order: null });
  const reading = installReading(
    [piece('ffe-1', 'Side table, walnut'), piece('ffe-2', 'Lamp'), piece('ffe-3', 'Rug')],
    NOW,
    false,
  );
  const cedar = (over: Partial<LensBandInput> = {}) =>
    deriveLensBand(
      input({
        spreadKind: 'install',
        household: 'Nora Ellison',
        jobName: 'Cedar Lane Study',
        now: NOW,
        ownAct: ASK,
        installReading: reading,
        landOn: jest.fn(),
        ...over,
      }),
    ).voice;
  const LONG = "Side table isn't here, and no arrival date is recorded. 2 more aren't here.";
  const SHORT = "Side table isn't here — no date recorded.";

  it('reads the reading: long and short', () => {
    expect(reading?.sentence).toBe(LONG);
    expect(reading?.shortSentence).toBe(SHORT);
  });

  it('prints the long reading when the measure allows', () => {
    const voice = cedar();
    expect(voice.next?.act.label).toBe('Ask the maker for a date');
    expect(voice.form).toBe('long');
    expect(voice.sentence).toBe(LONG);
  });

  it('Cedar at 1440, `Standing · 4` beside it: the short reading, never the act alone', () => {
    const voice = cedar({
      needs: [
        need('sched-0', 'schedule_unconfigured', 'Name the phases for this project', 'Open the schedule'),
      ],
      ticket: [ticketRow('spec', { rank: 'piece-stuck', phrase: '2 unspecified', standingSince: null })],
      setup: [
        { kind: 'target_date_unset', onAct: jest.fn() },
        { kind: 'budget_band_unset', onAct: jest.fn() },
      ],
    });
    expect(voice.standingCount).toBe(4);
    expect(voice.form).toBe('short');
    expect(voice.lead).toBe('Next');
    expect(voice.sentence).toBe(SHORT);
    expect(voice.rungs.map((rung) => rung.form)).toEqual(['short', 'act']);
  });

  it('else the act alone', () => {
    const voice = cedar({ tier: 'mobile' });
    expect(voice.form).toBe('act');
    expect(voice.sentence).toBe('');
    expect(voice.next?.act.label).toBe('Ask the maker for a date');
  });
});

describe('deriveNext · FR3: not-yet-due wording (F3-26, 512-4)', () => {
  const PAY = 'Balance to Woodward & Sons · $3,400 due Aug 30 — WS-188';
  const at = (dueOn: string | null) =>
    deriveNext({
      standing: rankStanding([], [need('pay', 'payment_due', PAY, 'Record payment', dueOn)], NOW),
      ownAct: null,
      clientFirstName: null,
      closed: false,
    });

  it('`— due today` · `— due tomorrow` · `— due in N days` · nothing undated', () => {
    expect(at('2026-08-29')?.sentence).toBe(
      'Pay Woodward & Sons the WS-188 balance, $3,400 — due today.',
    );
    expect(at('2026-08-30')?.sentence).toBe(
      'Pay Woodward & Sons the WS-188 balance, $3,400 — due tomorrow.',
    );
    expect(at('2026-08-30')?.shortSentence).toBe('WS-188 balance, due tomorrow.');
    expect(at('2026-09-02')?.sentence).toBe(
      'Pay Woodward & Sons the WS-188 balance, $3,400 — due in 4 days.',
    );
  });
});
