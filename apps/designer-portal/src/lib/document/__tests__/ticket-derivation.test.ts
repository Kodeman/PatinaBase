import type { MoneyLadder, MoneyRung } from '@/lib/document/money-ladder';
import {
  deriveTicket,
  deriveTicketHead,
  deriveTicketIdentity,
  deriveTicketSeam,
  type TicketInput,
  type TicketLine,
  type TicketRow,
  type TicketRowKey,
} from '@/lib/document/ticket-derivation';

const NOW = new Date(2026, 7, 25); // Tuesday, August 25 2026

const SELECTION = {
  activePhaseId: 'phase-procurement',
  reason: 'today-in-window' as const,
};

const rung = (cents: number | null, note: string, word: string): MoneyRung => ({
  cents,
  note,
  word,
});

const emptyLadder = (): MoneyLadder => ({
  budget: rung(null, 'nothing approved yet', 'budget'),
  plan: rung(null, 'no working budget yet', 'plan'),
  authorized: rung(null, 'nothing executed yet', 'authorized'),
  moved: rung(null, 'nothing in motion yet', 'moved'),
  owed: rung(null, 'nothing owed yet', 'owed'),
  notDrawn: rung(null, 'nothing standing undrawn', 'not drawn'),
});

const specimenLadder = (): MoneyLadder => ({
  ...emptyLadder(),
  authorized: rung(14_160_000, 'ordered', 'authorized'),
  owed: rung(1_750_000, 'out · Invoice 2026-114, 22 days', 'owed'),
  notDrawn: rung(1_230_000, 'deposit · PO-2026-0418, 50% at release', 'not drawn'),
});

const lines = (
  count: number,
  stamp: TicketLine['stamp'],
  specified: boolean,
  roomId: string | null = null,
): TicketLine[] =>
  Array.from({ length: count }, () => ({ stamp, roomId, specified }));

/** Nothing read yet, nothing filed, nothing owed — every source settled. */
function emptyInput(section: TicketInput['section'] = 'project'): TicketInput {
  return {
    section,
    phase: null,
    rooms: { settled: true, list: [] },
    pieces: { settled: true, lines: [] },
    drawings: { settled: true, sheetCount: 0 },
    boards: { settled: true, count: 0 },
    money: {
      settled: true,
      failed: false,
      ladder: emptyLadder(),
      owedDays: null,
      undrawnKind: null,
      owedSince: null,
    },
    dates: { settled: true, schedule: null },
    people: { settled: true, callSheetEnabled: true, rosterCount: 0 },
    now: NOW,
  };
}

/** The Vandersteen residence — direction-b §8's specimen, M2's drawn ticket. */
function specimenInput(): TicketInput {
  return {
    ...emptyInput('project'),
    phase: { name: 'Procurement & Orders', position: 4, of: 6 },
    rooms: {
      settled: true,
      list: [
        { id: 'living', name: 'Living room' },
        { id: 'dining', name: 'Dining room' },
        { id: 'primary', name: 'Primary bedroom' },
        { id: 'mud', name: 'Mudroom' },
      ],
    },
    pieces: {
      settled: true,
      lines: [
        ...lines(25, 'ordered', true, 'living'),
        ...lines(6, 'delivered', true, 'dining'),
        ...lines(2, 'shipped', true, 'primary'),
        ...lines(1, 'damaged', true, 'living'),
        ...lines(2, 'specified', false, 'mud'),
      ],
    },
    money: {
      settled: true,
      failed: false,
      ladder: specimenLadder(),
      owedDays: 22,
      undrawnKind: 'deposit',
      // Invoice 2026-114's own due date, 22 days before NOW.
      owedSince: '2026-08-03',
    },
    dates: {
      settled: true,
      schedule: {
        selection: SELECTION,
        fidelity: 'committed',
        positionText: 'Week 3',
        install: { date: '2026-09-15', fidelity: 'committed' },
      },
    },
  };
}

const valueOf = (rows: TicketRow[], key: TicketRowKey) =>
  rows.find((row) => row.key === key)!.value;

const ORDER: TicketRowKey[] = [
  'rooms',
  'pieces',
  'drawings',
  'spec',
  'boards',
  'money',
  'dates',
  'people',
];

describe('deriveTicket — eight rows, always', () => {
  it.each(['project', 'install', 'care'] as const)(
    'prints eight rows in order on a %s document',
    (section) => {
      const rows = deriveTicket(emptyInput(section));
      expect(rows).toHaveLength(8);
      expect(rows.map((row) => row.key)).toEqual(ORDER);
    },
  );

  it('prints the same eight rows on a specimen-full project', () => {
    const rows = deriveTicket(specimenInput());
    expect(rows.map((row) => row.key)).toEqual(ORDER);
  });

  it('labels every row with one word', () => {
    const rows = deriveTicket(emptyInput());
    expect(rows.map((row) => row.label)).toEqual([
      'Rooms',
      'Pieces',
      'Drawings',
      'Spec',
      'Boards',
      'Money',
      'Dates',
      'People',
    ]);
  });
});

/**
 * The four stages before the work starts. A document standing on one of them
 * has no project yet — no rooms, no scheme, no schedule, no money moving — so
 * the ticket's job there is to say so eight times without inventing a figure.
 */
const BEFORE_THE_WORK = ['brief', 'discovery', 'direction', 'proposal'] as const;

describe('deriveTicket — the four spreads before the work starts', () => {
  it.each(BEFORE_THE_WORK)(
    'prints the same eight rows, in the same order, on a %s document',
    (section) => {
      const rows = deriveTicket(emptyInput(section));
      expect(rows).toHaveLength(8);
      expect(rows.map((row) => row.key)).toEqual(ORDER);
    },
  );

  it.each(BEFORE_THE_WORK)(
    'says what a %s document has none of, without naming an install it has no use for',
    (section) => {
      const rows = deriveTicket(emptyInput(section));
      expect(valueOf(rows, 'rooms')).toBe('No rooms yet');
      expect(valueOf(rows, 'pieces')).toBe('No pieces yet');
      expect(valueOf(rows, 'drawings')).toBe('Nothing filed');
      expect(valueOf(rows, 'spec')).toBe('Nothing specified yet');
      expect(valueOf(rows, 'boards')).toBe('No boards yet · start one');
      expect(valueOf(rows, 'money')).toBe('Nothing moving yet');
      expect(valueOf(rows, 'dates')).toBe('No dates yet');
      expect(valueOf(rows, 'people')).toBe('Nobody on it yet');
    },
  );

  it.each(BEFORE_THE_WORK)(
    'opens on a %s document only what such a spread actually prints',
    (section) => {
      const rows = deriveTicket(emptyInput(section));
      // No Project region stands on these four spreads
      // (`paperRegionsForSection` returns nothing), so the three rows that
      // index a region state their figure and open nothing — while the three
      // leaf rows, which have a page of their own, open on every section
      // (direction-b §4, F48).
      expect(rows.map((row) => row.door.kind)).toEqual([
        'expand',
        'none',
        'leaf',
        'leaf',
        'leaf',
        'none',
        'none',
        'overlay',
      ]);
    },
  );

  it.each(BEFORE_THE_WORK)(
    'still states the schedule’s own position on a %s document that has one',
    (section) => {
      const rows = deriveTicket({
        ...emptyInput(section),
        dates: {
          settled: true,
          schedule: {
            selection: SELECTION,
            fidelity: 'band',
            positionText: 'Band',
            install: null,
          },
        },
      });
      expect(valueOf(rows, 'dates')).toBe('Band');
    },
  );

  it('keeps the install-date register where the work is', () => {
    expect(valueOf(deriveTicket(emptyInput('install')), 'dates')).toBe(
      'No install date yet',
    );
    expect(valueOf(deriveTicket(emptyInput('care')), 'dates')).toBe(
      'No install date yet',
    );
  });

  it.each(BEFORE_THE_WORK)(
    'prints the phase on a %s document, and never the section word',
    (section) => {
      const head = deriveTicketHead({
        ...emptyInput(section),
        phase: { name: 'Schematic Design', position: 2, of: 6 },
      });
      expect(head.phase).toBe('Schematic Design · 2 of 6');
      expect(head.phase).not.toMatch(/brief|discovery|direction|proposal/i);
    },
  );
});

describe('deriveTicket — the ninth row, `The client’s copy`', () => {
  const onFinalize = (sent: boolean) =>
    deriveTicket({
      ...emptyInput('proposal'),
      clientCopy: { settled: true, sent },
    });

  it('stands only where a proposal document has a copy to print', () => {
    for (const section of [...BEFORE_THE_WORK, 'project', 'install', 'care'] as const) {
      expect(deriveTicket(emptyInput(section))).toHaveLength(8);
    }
    const rows = onFinalize(true);
    expect(rows).toHaveLength(9);
    expect(rows.map((row) => row.key)).toEqual([...ORDER, 'clientcopy']);
  });

  it('names the copy, and opens the leaf the shelf used to open', () => {
    const row = onFinalize(true).find((r) => r.key === 'clientcopy')!;
    expect(row.label).toBe('Copy');
    expect(row.value).toBe('The client’s copy · as sent, live');
    expect(row.door).toEqual({ kind: 'leaf', shelf: 'clientcopy' });
    expect(row.exception).toBeNull();
  });

  it('never confuses a copy not yet sent with one still being read', () => {
    expect(onFinalize(false).find((r) => r.key === 'clientcopy')!.value).toBe(
      'The client’s copy · not sent yet',
    );
    const reading = deriveTicket({
      ...emptyInput('proposal'),
      clientCopy: { settled: false, sent: false },
    });
    expect(reading.find((r) => r.key === 'clientcopy')!.value).toBe('Reading…');
  });

  it('carries no exception into the seam', () => {
    const rows = onFinalize(false);
    expect(deriveTicketSeam(rows, 'The job · Proposal').exceptions).toBe(
      'Nothing overdue',
    );
  });
});

describe('deriveTicket — honest empties', () => {
  const rows = deriveTicket(emptyInput());

  it('says what is empty, in the product’s own words', () => {
    expect(valueOf(rows, 'rooms')).toBe('No rooms yet');
    expect(valueOf(rows, 'pieces')).toBe('No pieces yet');
    expect(valueOf(rows, 'drawings')).toBe('Nothing filed');
    expect(valueOf(rows, 'spec')).toBe('Nothing specified yet');
    expect(valueOf(rows, 'boards')).toBe('No boards yet · start one');
    expect(valueOf(rows, 'money')).toBe('Nothing moving yet');
    expect(valueOf(rows, 'dates')).toBe('No install date yet');
    expect(valueOf(rows, 'people')).toBe('Nobody on it yet');
  });

  it('never confuses an unread source with an empty one', () => {
    const unread = deriveTicket({
      ...emptyInput(),
      rooms: { settled: false, list: [] },
      pieces: { settled: false, lines: [] },
      drawings: { settled: false, sheetCount: 0 },
      boards: { settled: false, count: 0 },
      dates: { settled: false, schedule: null },
    });
    for (const key of ['rooms', 'pieces', 'drawings', 'spec', 'boards', 'dates'] as const) {
      expect(valueOf(unread, key)).toBe('Reading…');
    }
  });

  it('names the call sheet’s absence, never its emptiness', () => {
    const input = emptyInput();
    const off = deriveTicket({
      ...input,
      people: { ...input.people, callSheetEnabled: false },
    });
    expect(valueOf(off, 'people')).toBe(
      "the call sheet isn't turned on for this studio",
    );
    const door = off.find((row) => row.key === 'people')!.door;
    expect(door).toEqual({
      kind: 'overlay',
      overlay: 'call-sheet',
      available: false,
    });
  });
});

describe('deriveTicket — the specimen reads as drawn', () => {
  const rows = deriveTicket(specimenInput());

  it('summarises the rooms and the schedule', () => {
    expect(valueOf(rows, 'rooms')).toBe('4 rooms · 36 lines');
  });

  it('indexes the pieces, exception included', () => {
    expect(valueOf(rows, 'pieces')).toBe(
      '25 ordered · 6 delivered · 2 in transit · 1 damaged · 2 unspecified',
    );
  });

  it('counts the spec against the whole schedule', () => {
    expect(valueOf(rows, 'spec')).toBe('34 of 36 specified · by room');
  });

  it('reads the money ladder', () => {
    expect(valueOf(rows, 'money')).toBe(
      '$141,600 ordered · $17,500 owed you, 22 days · $12,300 deposit not drawn',
    );
  });

  it('states the install day the facts carried, and how far out it is', () => {
    expect(valueOf(rows, 'dates')).toBe(
      'Install Tuesday, September 15 · three weeks out',
    );
  });

  it('never states a day the facts did not carry', () => {
    const input = specimenInput();
    const banded = deriveTicket({
      ...input,
      dates: {
        settled: true,
        schedule: {
          selection: SELECTION,
          fidelity: 'band',
          positionText: 'Week 3',
          install: { date: '2026-09-15', fidelity: 'band' },
        },
      },
    });
    expect(valueOf(banded, 'dates')).toBe('Week 3');
  });

  it('expands the Rooms row to chips that carry their own line counts', () => {
    const door = rows.find((row) => row.key === 'rooms')!.door;
    expect(door).toEqual({
      kind: 'expand',
      rooms: [
        { id: 'living', name: 'Living room', lineCount: 26 },
        { id: 'dining', name: 'Dining room', lineCount: 6 },
        { id: 'primary', name: 'Primary bedroom', lineCount: 2 },
        { id: 'mud', name: 'Mudroom', lineCount: 2 },
      ],
    });
  });

  it('sends each row to its own door', () => {
    expect(rows.map((row) => row.door.kind)).toEqual([
      'expand',
      'unfold-region',
      'leaf',
      'leaf',
      'leaf',
      'unfold-region',
      'unfold-region',
      'overlay',
    ]);
  });
});

describe('deriveTicket — a row only opens what the spread prints', () => {
  it('unfolds Pieces, Money and Dates on the project spread', () => {
    const rows = deriveTicket(emptyInput('project'));
    expect(rows.map((row) => row.door.kind)).toEqual([
      'expand',
      'unfold-region',
      'leaf',
      'leaf',
      'leaf',
      'unfold-region',
      'unfold-region',
      'overlay',
    ]);
  });

  it.each(['install', 'care'] as const)(
    'gives Money and Dates no door on a %s spread, where neither region mounts',
    (section) => {
      const rows = deriveTicket(emptyInput(section));
      const doorOf = (key: TicketRowKey) =>
        rows.find((row) => row.key === key)!.door;
      expect(doorOf('pieces')).toEqual({ kind: 'unfold-region', region: 'ffe' });
      expect(doorOf('money')).toEqual({ kind: 'none' });
      expect(doorOf('dates')).toEqual({ kind: 'none' });
    },
  );

  it('reads the regions the caller states over the ones the section implies', () => {
    const rows = deriveTicket({
      ...emptyInput('install'),
      paperRegions: ['approvals', 'schedule', 'ffe', 'money'],
    });
    const doorOf = (key: TicketRowKey) =>
      rows.find((row) => row.key === key)!.door;
    expect(doorOf('money')).toEqual({ kind: 'unfold-region', region: 'money' });
    expect(doorOf('dates')).toEqual({
      kind: 'unfold-region',
      region: 'schedule',
    });
  });

  it('still states the figure on the row that cannot open', () => {
    const rows = deriveTicket({
      ...specimenInput(),
      section: 'install',
      paperRegions: ['approvals', 'ffe'],
    });
    expect(valueOf(rows, 'money')).toBe(
      '$141,600 ordered · $17,500 owed you, 22 days · $12,300 deposit not drawn',
    );
  });
});

describe('deriveTicket — what is wrong is counted once, and named first', () => {
  it('counts a damaged line with no product as damaged, not unspecified', () => {
    const rows = deriveTicket({
      ...emptyInput(),
      pieces: {
        settled: true,
        lines: [
          ...lines(1, 'damaged', false, 'living'),
          ...lines(2, 'specified', false, 'living'),
        ],
      },
    });
    expect(valueOf(rows, 'pieces')).toBe('1 damaged · 2 unspecified');
    expect(rows.find((row) => row.key === 'pieces')!.exception).toEqual({
      rank: 'money-at-risk',
      phrase: '1 damaged',
      standingSince: null,
    });
    // The Spec row's numerator is untouched: none of the three carries a spec.
    expect(valueOf(rows, 'spec')).toBe('0 of 3 specified · by room');
  });

  it('counts a decision-blocked line with no product as awaiting', () => {
    const rows = deriveTicket({
      ...emptyInput(),
      pieces: { settled: true, lines: lines(1, 'decision_due', false) },
    });
    expect(valueOf(rows, 'pieces')).toBe('1 awaiting a decision');
  });

  it('marks the clause that is wrong so the row leads with it in weight', () => {
    const rows = deriveTicket(specimenInput());
    expect(rows.find((row) => row.key === 'pieces')!.emphasis).toBe('1 damaged');
    expect(rows.find((row) => row.key === 'money')!.emphasis).toBe(
      '$17,500 owed you, 22 days',
    );
    expect(rows.find((row) => row.key === 'rooms')!.emphasis).toBeNull();
  });
});

describe('deriveTicket — the Dates row keeps one register', () => {
  const at = (date: string) =>
    valueOf(
      deriveTicket({
        ...emptyInput(),
        dates: {
          settled: true,
          schedule: {
            selection: SELECTION,
            fidelity: 'committed',
            positionText: null,
            install: { date, fidelity: 'committed' },
          },
        },
      }),
      'dates',
    );

  it('spells the distance at every scale it states one', () => {
    expect(at('2026-09-04')).toContain('· ten days out');
    expect(at('2026-09-15')).toContain('· three weeks out');
    // Fourteen weeks out used to print `14 weeks out` beside `three weeks out`.
    expect(at('2026-12-01')).toContain('· three months out');
  });

  it('lets the date be the whole sentence past a year', () => {
    expect(at('2028-01-10')).toBe('Install Monday, January 10');
  });
});

describe('deriveTicketHead', () => {
  it('draws M2’s two-part band head', () => {
    expect(deriveTicketHead(specimenInput())).toEqual({
      subject: 'The job · Project',
      phase: 'Procurement & Orders · 4 of 6',
    });
  });

  it('carries no phase clause when the resolver placed none', () => {
    expect(deriveTicketHead(emptyInput('care'))).toEqual({
      subject: 'The job · Care',
      phase: null,
    });
  });
});

describe('deriveTicketIdentity', () => {
  it('names section, phase and fraction', () => {
    expect(deriveTicketIdentity(specimenInput())).toBe(
      'The job · Project · Procurement & Orders 4 of 6',
    );
  });

  it('drops the phase clause when the schedule carries no phase', () => {
    expect(deriveTicketIdentity(emptyInput('install'))).toBe(
      'The job · Install',
    );
  });
});

describe('deriveTicketSeam', () => {
  it('prints the worst two exceptions, in tie-break order', () => {
    const rows = deriveTicket(specimenInput());
    const seam = deriveTicketSeam(rows, deriveTicketIdentity(specimenInput()));
    expect(seam.exceptions).toBe('1 damaged · $17,500 owed you');
  });

  it('drops a third exception whole, never abbreviated', () => {
    const rows = deriveTicket(specimenInput());
    const standing = rows.filter((row) => row.exception != null);
    expect(standing.map((row) => row.key)).toEqual(['pieces', 'spec', 'money']);
    const seam = deriveTicketSeam(rows, 'The job · Project');
    expect(seam.exceptions).not.toContain('unspecified');
    expect(seam.exceptions.split(' · ')).toHaveLength(2);
  });

  it('never elides the identity, however many exceptions stand', () => {
    const rows = deriveTicket(specimenInput());
    const identity = deriveTicketIdentity(specimenInput());
    expect(deriveTicketSeam(rows, identity).identity).toBe(identity);
  });

  it('reads "Nothing overdue" when nothing is', () => {
    const rows = deriveTicket(emptyInput());
    expect(rows.every((row) => row.exception == null)).toBe(true);
    expect(deriveTicketSeam(rows, 'The job · Project').exceptions).toBe(
      'Nothing overdue',
    );
  });

  it('ranks money at risk over a promise past its date over a stuck piece', () => {
    const seam = deriveTicketSeam(
      [
        {
          key: 'spec',
          label: 'Spec',
          value: '',
          emphasis: null,
          door: { kind: 'leaf', shelf: 'specbook' },
          exception: {
            rank: 'piece-stuck',
            phrase: '2 unspecified',
            standingSince: '2026-01-01',
          },
        },
        {
          key: 'money',
          label: 'Money',
          value: '',
          emphasis: null,
          door: { kind: 'unfold-region', region: 'money' },
          exception: {
            rank: 'promise-past-due',
            phrase: '$17,500 owed you',
            standingSince: '2026-08-03',
          },
        },
        {
          key: 'pieces',
          label: 'Pieces',
          value: '',
          emphasis: null,
          door: { kind: 'unfold-region', region: 'ffe' },
          exception: {
            rank: 'money-at-risk',
            phrase: '1 damaged',
            standingSince: null,
          },
        },
      ],
      'The job · Project',
    ).exceptions;
    expect(seam).toBe('1 damaged · $17,500 owed you');
  });

  it('breaks a tie inside a rank on the older date', () => {
    const seam = deriveTicketSeam(
      [
        {
          key: 'money',
          label: 'Money',
          value: '',
          emphasis: null,
          door: { kind: 'unfold-region', region: 'money' },
          exception: {
            rank: 'promise-past-due',
            phrase: 'the newer one',
            standingSince: '2026-08-20',
          },
        },
        {
          key: 'dates',
          label: 'Dates',
          value: '',
          emphasis: null,
          door: { kind: 'unfold-region', region: 'schedule' },
          exception: {
            rank: 'promise-past-due',
            phrase: 'the older one',
            standingSince: '2026-07-01',
          },
        },
      ],
      'The job · Project',
    ).exceptions;
    expect(seam).toBe('the older one · the newer one');
  });

  it('marks a past install day on the project spread, and not on install', () => {
    const past = {
      settled: true,
      schedule: {
        selection: SELECTION,
        fidelity: 'committed' as const,
        positionText: null,
        install: { date: '2026-08-14', fidelity: 'committed' as const },
      },
    };
    const onProject = deriveTicket({ ...emptyInput('project'), dates: past });
    expect(onProject.find((row) => row.key === 'dates')!.exception).toEqual({
      rank: 'promise-past-due',
      phrase: 'Install day has passed',
      standingSince: '2026-08-14',
    });
    expect(valueOf(onProject, 'dates')).toBe('Installed Friday, August 14');

    const onInstall = deriveTicket({ ...emptyInput('install'), dates: past });
    expect(onInstall.find((row) => row.key === 'dates')!.exception).toBeNull();
  });
});
