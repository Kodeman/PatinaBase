/**
 * The ladder's two derivations, on the Vandersteen specimen and on a paper with
 * nothing on it yet. Every string here is the print contract's, verbatim
 * (reconciliation "The ladder", OD-14, OD-8/DL-04); the digits are the
 * specimen's.
 */

import {
  deriveLadderDoors,
  deriveLadderSegments,
  type LadderInput,
} from '../lens-ladder-derivation';
import { LENS_VALUE_MAX_CHARS } from '../lens-constants';
import type { MoneyLadder } from '../money-ladder';
import type { TicketInput, TicketLine } from '../ticket-derivation';

const NOW = new Date(2026, 7, 25); // 2026-08-25, the specimen's day

const rung = (cents: number | null) => ({ cents, note: '', word: '' });

const ladder = (owed: number, notDrawn: number): MoneyLadder => ({
  budget: rung(18_450_000),
  plan: rung(17_124_000),
  authorized: rung(14_160_000),
  moved: rung(null),
  owed: rung(owed),
  notDrawn: rung(notDrawn),
});

const ROOMS = [
  { id: 'r1', name: 'Living room' },
  { id: 'r2', name: 'Dining room' },
  { id: 'r3', name: 'Primary bedroom' },
  { id: 'r4', name: 'Mudroom' },
];

/** 36 lines across the four rooms, one of them damaged. */
function lines(): TicketLine[] {
  const out: TicketLine[] = [];
  for (let i = 0; i < 36; i += 1) {
    out.push({
      stamp: i === 0 ? 'damaged' : 'ordered',
      roomId: ROOMS[i % ROOMS.length].id,
      specified: true,
    });
  }
  return out;
}

function ticket(overrides: Partial<TicketInput> = {}): TicketInput {
  return {
    section: 'project',
    phase: { name: 'Procurement & Orders', position: 4, of: 6 },
    project: true,
    rooms: { settled: true, list: ROOMS },
    pieces: { settled: true, lines: lines() },
    drawings: { settled: true, sheetCount: 12 },
    boards: { settled: true, count: 3 },
    money: {
      settled: true,
      failed: false,
      ladder: ladder(1_750_000, 1_230_000),
      owedDays: 22,
      undrawnKind: 'deposit',
      owedSince: '2026-08-03',
    },
    dates: {
      settled: true,
      schedule: {
        selection: 'installation' as never,
        fidelity: 'committed' as never,
        positionText: 'Week 3',
        install: { date: '2026-09-15', fidelity: 'committed' as never },
      },
    },
    people: { settled: true, callSheetEnabled: true, rosterCount: 5 },
    now: NOW,
    ...overrides,
  };
}

function input(overrides: Partial<LadderInput> = {}): LadderInput {
  return {
    ticket: ticket(),
    approvals: {
      settled: true,
      awaiting: 2,
      overdue: 1,
      overdueDays: 6,
      records: 4,
    },
    care: { settled: true, closed: 0, total: 6 },
    record: { settled: true, complete: 12 },
    damagedOn: '2026-08-26',
    ...overrides,
  };
}

const byKey = (model: LadderInput) =>
  Object.fromEntries(
    deriveLadderSegments(model).map((segment) => [segment.key, segment]),
  );

describe('deriveLadderSegments · the Vandersteen specimen', () => {
  it('prints one segment per stop the project spread mounts, in paper order', () => {
    expect(deriveLadderSegments(input()).map((s) => s.key)).toEqual([
      'approvals',
      'schedule',
      'ffe',
      'money',
      'care',
      'record',
    ]);
  });

  it('names every stop from the one label table', () => {
    expect(deriveLadderSegments(input()).map((s) => s.name)).toEqual([
      'Client approvals',
      'Schedule',
      'Pieces',
      'Money',
      'Closing the book',
      'The record',
    ]);
  });

  it('states the print contract’s value on every stop', () => {
    const segments = byKey(input());
    expect(segments.approvals.value).toBe('2 AWAITING · 1 OVERDUE 6D');
    expect(segments.schedule.value).toBe('INSTALL SEP 15 · 3 WEEKS');
    expect(segments.ffe.value).toBe('36 LINES · 1 DAMAGED AUG 26');
    expect(segments.money.value).toBe('$17,500 OUT · $12,300 UNDRAWN');
    expect(segments.care.value).toBe('0 OF 6 CLOSED OUT');
    expect(segments.record.value).toBe('12 COMPLETE');
  });

  it('splices the room count into Pieces at the narrow measure and drops the date (OD-14)', () => {
    const segments = byKey(input());
    expect(segments.ffe.narrowValue).toBe('36 LINES · 4 ROOMS · 1 DAMAGED');
    // Every other stop is one string at both measures.
    for (const key of ['approvals', 'schedule', 'money', 'care', 'record']) {
      expect(segments[key].narrowValue).toBe(segments[key].value);
    }
  });

  it('keeps every value inside the 30-character cap at both measures', () => {
    for (const segment of deriveLadderSegments(input())) {
      expect((segment.value ?? '').length).toBeLessThanOrEqual(
        LENS_VALUE_MAX_CHARS,
      );
      expect((segment.narrowValue ?? '').length).toBeLessThanOrEqual(
        LENS_VALUE_MAX_CHARS,
      );
    }
  });

  it('carries the paper’s own count line for the stop announcement (OD-7)', () => {
    const segments = byKey(input());
    expect(segments.ffe.countLine).toBe('36 lines · 4 rooms · 1 damaged');
    expect(segments.approvals.countLine).toBe(
      '2 awaiting the client · 1 overdue 6d',
    );
    expect(segments.money.countLine).toBe('$17,500 out · $12,300 not drawn');
    expect(segments.care.countLine).toBe('0 of 6 closed out');
  });

  it('takes every extent from a count, never from a rect', () => {
    const segments = byKey(input());
    expect(segments.ffe.extent).toBe(40); // 36 lines + 4 rooms
    expect(segments.approvals.extent).toBe(4); // approval records
    expect(segments.care.extent).toBe(6);
    expect(segments.record.extent).toBe(12);
    expect(segments.money.extent).toBe(5); // the ladder's rungs that carry money
  });

  it('floors each segment at 36px and grows it by the lines its value wraps to', () => {
    const segments = byKey(input());
    // `12 COMPLETE` is one line at both measures → the bare floor.
    expect(segments.record.floorPx).toBe(36);
    expect(segments.record.narrowFloorPx).toBe(36);
    // Each measure floors on ITS OWN string: 27 chars over 23 and 30 over 15
    // are both two lines, so `2 × 15.4 + 8` either way.
    expect(segments.ffe.floorPx).toBe(39);
    expect(segments.ffe.narrowFloorPx).toBe(39);
    // `$17,500 OUT · $12,300 UNDRAWN` is 29 — two lines at 23, two at 15.
    expect(segments.money.narrowFloorPx).toBe(39);
    // `0 OF 6 CLOSED OUT` is 17: one line at 23, two at 15.
    expect(segments.care.floorPx).toBe(36);
    expect(segments.care.narrowFloorPx).toBe(39);
  });

  it('hangs the rooms off Pieces alone, and marks the one in hand', () => {
    const segments = byKey(input({ heldRoomId: 'r3' }));
    expect(segments.ffe.rooms?.map((room) => room.name)).toEqual([
      'Living room',
      'Dining room',
      'Primary bedroom',
      'Mudroom',
    ]);
    expect(segments.ffe.rooms?.filter((room) => room.held)).toEqual([
      { id: 'r3', name: 'Primary bedroom', held: true },
    ]);
    expect(segments.money.rooms).toBeUndefined();
  });

  it('prints four stops on install and on care — no money, no schedule', () => {
    for (const section of ['install', 'care'] as const) {
      const model = input({ ticket: ticket({ section }) });
      expect(deriveLadderSegments(model).map((s) => s.key)).toEqual([
        'approvals',
        'ffe',
        'care',
        'record',
      ]);
    }
  });

  it('prints no stop at all on a spread before the work starts (OD-2)', () => {
    const model = input({ ticket: ticket({ section: 'proposal' }) });
    expect(deriveLadderSegments(model)).toEqual([]);
  });

  it('is a press target only where the stop’s root is on the paper', () => {
    const segments = byKey(input({ mountedKeys: ['approvals', 'ffe'] }));
    expect(segments.approvals.mounted).toBe(true);
    expect(segments.record.mounted).toBe(false);
  });
});

describe('deriveLadderSegments · a paper with nothing on it yet', () => {
  const bare = () =>
    input({
      ticket: ticket({
        rooms: { settled: true, list: [] },
        pieces: { settled: true, lines: [] },
        money: {
          settled: true,
          failed: false,
          ladder: ladder(0, 0),
          owedDays: null,
          undrawnKind: null,
          owedSince: null,
        },
        dates: { settled: true, schedule: null },
      }),
      approvals: {
        settled: true,
        awaiting: 0,
        overdue: 0,
        overdueDays: null,
        records: 0,
      },
      care: { settled: true, closed: 0, total: 0 },
      record: { settled: true, complete: 0 },
      damagedOn: null,
    });

  it('states no figure, and says which kind of empty it is', () => {
    const segments = byKey(bare());
    for (const key of ['approvals', 'ffe', 'money', 'care', 'record']) {
      expect(segments[key].value).toBeNull();
      expect(segments[key].fallback).toBe('NOTHING YET');
    }
    // An install date is not missing, it is not knowable yet.
    expect(segments.schedule.value).toBeNull();
    expect(segments.schedule.fallback).toBe('NOT KNOWN YET');
  });

  it('reads Reading… rather than an honest empty while a source is still out', () => {
    const model = input({
      ticket: ticket({ pieces: { settled: false, lines: [] } }),
    });
    expect(byKey(model).ffe.value).toBe('READING…');
    expect(byKey(model).ffe.fallback).toBeNull();
  });

  it('never lets a schedule frame or band state a day (R107/R108)', () => {
    const model = input({
      ticket: ticket({
        dates: {
          settled: true,
          schedule: {
            selection: 'installation' as never,
            fidelity: 'frame' as never,
            positionText: 'Week 3',
            install: { date: '2026-09-15', fidelity: 'frame' as never },
          },
        },
      }),
    });
    expect(byKey(model).schedule.value).toBe('WEEK 3');
  });
});

describe('deriveLadderDoors', () => {
  it('files the project’s four under this job', () => {
    const doors = deriveLadderDoors({ ticket: ticket(), held: false });
    expect(doors.map((door) => door.label)).toEqual([
      'Plan room',
      'Spec book',
      'Mood boards',
      'Call sheet',
    ]);
  });

  it('adds the client’s copy as a fifth where the ticket prints its ninth row', () => {
    const doors = deriveLadderDoors({
      ticket: ticket({ clientCopy: { settled: true, sent: true } }),
      held: false,
    });
    expect(doors).toHaveLength(5);
    expect(doors[4].key).toBe('clientcopy');
    expect(doors[4].label).toBe('The client’s copy');
  });

  it('offers no dead project door on a proposal with no project behind it', () => {
    const doors = deriveLadderDoors({
      ticket: ticket({
        section: 'proposal',
        project: false,
        clientCopy: { settled: true, sent: false },
      }),
      held: false,
    });
    expect(doors.map((door) => door.key)).toEqual(['clientcopy']);
  });

  it('gives the release a second home while a room is in hand', () => {
    const doors = deriveLadderDoors({ ticket: ticket(), held: true });
    expect(doors.map((door) => door.key)).toContain('release-room');
    expect(doors.find((d) => d.key === 'release-room')?.label).toBe(
      'Put down the room',
    );
    expect(
      deriveLadderDoors({ ticket: ticket(), held: false }).map((d) => d.key),
    ).not.toContain('release-room');
  });

  it('carries the page a leaf has of its own, and opens the rest in place', () => {
    const onOpenLeaf = jest.fn();
    const onOpenCallSheet = jest.fn();
    const doors = deriveLadderDoors({
      ticket: ticket(),
      held: false,
      routes: { planroom: '/doc/p1/plans' },
      onOpenLeaf,
      onOpenCallSheet,
    });
    expect(doors[0].href).toBe('/doc/p1/plans');
    expect(doors[1].href).toBeNull();
    doors[1].onOpen();
    expect(onOpenLeaf).toHaveBeenCalledWith('specbook');
    doors[3].onOpen();
    expect(onOpenCallSheet).toHaveBeenCalled();
  });
});
