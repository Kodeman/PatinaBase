import type { MoneyLadder, MoneyRung } from '@/lib/document/money-ladder';
import {
  deriveTicket,
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
