/**
 * The Day Sheet's derivation (US-25 slice 4) — every Q1 guard the contract
 * binds: at most five lines, no overflow count, "Not today" one working day,
 * acted needs waiting on others, an unread feed never an empty sheet, and
 * Mine against the studio's. Plus slice 4 item 5: a job's roster line, its
 * band's Next and its first sheet line read the same head need.
 */
import type { NeedState } from '@patina/supabase';
import type {
  DeskFolder,
  DocumentStateRow,
  NeedKind,
  NeedLine,
} from '@/lib/document/desk-derivation';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { deriveDeskNeedList, rankDeskNeeds } from '@/lib/document/desk-need-list';
import { deriveDeskRoster } from '@/lib/document/desk-roster-derivation';
import { classOfNeed, deskLeadNeed } from '@/lib/document/need-class';
import { deriveHandoffNeeds, deskDesignersOf, type DeskLeads } from '@/lib/document/desk-scope';
import {
  DAY_SHEET_LINES,
  deriveDaySheet,
  draftedForWords,
  groupSheetByJob,
  localDay,
  nextWorkingDay,
  timeWord,
  type DaySheetInput,
  type SheetEntry,
  type SheetNeedState,
} from '@/lib/document/day-sheet';

// Friday 9 October 2026, mid-morning local time.
const FRIDAY = new Date(2026, 9, 9, 10, 0, 0);

function entry(i: number, over: Partial<NeedLine> = {}, projectId = `p${i}`): DeskNeed {
  const kind = (over.kind ?? 'task_due') as NeedKind;
  const key = `${kind}:r${i}`;
  return {
    key,
    projectId,
    projectName: `Job ${i}`,
    need: {
      key,
      kind,
      text: `Thing ${i} is due`,
      actionLabel: 'Open the task',
      stamp: { label: 'DUE', color: 'var(--color-clay)' },
      urgent: false,
      owner: 'designer',
      ...over,
    } as NeedLine,
  };
}

function state(needKey: string, over: Partial<NeedState> = {}): NeedState {
  return {
    needKey,
    projectId: 'p',
    deferredUntil: null,
    actedAt: null,
    waitingOn: null,
    setAsideUntil: null,
    setAsideReason: null,
    ...over,
  };
}

function sheet(over: Partial<DaySheetInput> = {}) {
  return deriveDaySheet({
    needs: [],
    states: new Map(),
    leads: new Map(),
    meUserId: 'me',
    scope: 'studio',
    unreadFeeds: [],
    now: FRIDAY,
    ...over,
  });
}

const EIGHT = Array.from({ length: 8 }, (_, i) => entry(i + 1));

describe('deriveDaySheet — Q1 guards', () => {
  it('caps the sheet at five lines with eight needs, in rank order', () => {
    expect(DAY_SHEET_LINES).toBe(5);
    const result = sheet({ needs: EIGHT });
    expect(result.lines).toHaveLength(5);
    expect(result.lines.map((l) => l.key)).toEqual(EIGHT.slice(0, 5).map((e) => e.key));
    expect(result.empty).toBe(false);
  });

  it('carries no count anywhere in its output — no overflow, no streak, no cleared-today', () => {
    const result = sheet({ needs: EIGHT });
    expect(Object.keys(result).sort()).toEqual(
      ['alsoYours', 'empty', 'lines', 'setAside', 'standing', 'unchecked', 'waitingOn'].sort(),
    );
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/\d+ more/i);
    expect(text).not.toMatch(/cleared|streak|overflow|remaining/i);
  });

  it('leaves out a setup chore, as the band never leads with one', () => {
    const setup = entry(9, { kind: 'schedule_unconfigured' as NeedKind });
    expect(classOfNeed(setup.need.kind)).toBe(3);
    expect(sheet({ needs: [setup] }).lines).toEqual([]);
  });
});

describe('deriveDaySheet — Not today lasts one working day', () => {
  it('a Friday "Not today" returns the need on Monday', () => {
    expect(nextWorkingDay(FRIDAY)).toBe('2026-10-12');
    // Saturday and Sunday also come back on Monday; a Tuesday on Wednesday.
    expect(nextWorkingDay(new Date(2026, 9, 10, 9))).toBe('2026-10-12');
    expect(nextWorkingDay(new Date(2026, 9, 11, 9))).toBe('2026-10-12');
    expect(nextWorkingDay(new Date(2026, 9, 13, 9))).toBe('2026-10-14');
  });

  it('keeps a deferred need off the sheet until the day it names, then brings it back', () => {
    const [a, b] = EIGHT;
    const states = new Map([[a.key, state(a.key, { deferredUntil: nextWorkingDay(FRIDAY) })]]);
    const keys = (now: Date) => sheet({ needs: [a, b], states, now }).lines.map((l) => l.key);
    expect(keys(FRIDAY)).toEqual([b.key]);
    expect(keys(new Date(2026, 9, 10, 9))).toEqual([b.key]); // Saturday
    expect(keys(new Date(2026, 9, 11, 21))).toEqual([b.key]); // Sunday night
    expect(keys(new Date(2026, 9, 12, 8))).toEqual([a.key, b.key]); // Monday
  });

  it('holds a deferred need in Coming back until the day it names (F4)', () => {
    const [a, b] = EIGHT;
    const until = nextWorkingDay(FRIDAY);
    const states = new Map([[a.key, state(a.key, { deferredUntil: until })]]);
    const result = sheet({ needs: [a, b], states });
    expect(result.setAside).toEqual([{ need: a, until, reason: null }]);
    expect(sheet({ needs: [a, b], states, now: new Date(2026, 9, 12, 8) }).setAside).toEqual([]);
  });

  it('lets a sixth need step up for one put off on an earlier day, never printing six', () => {
    // No `updatedAt` of today: the deferral was written before this morning.
    const states = new Map([[EIGHT[0].key, state(EIGHT[0].key, { deferredUntil: '2026-10-12' })]]);
    const result = sheet({ needs: EIGHT, states });
    expect(result.lines.map((l) => l.key)).toEqual(EIGHT.slice(1, 6).map((e) => e.key));
  });

  it('keeps a "Not today" written today on its line, settled, and refills nothing (U-Q2)', () => {
    const states = new Map([
      [EIGHT[0].key, {
        ...state(EIGHT[0].key, { deferredUntil: '2026-10-12' }),
        updatedAt: new Date(2026, 9, 9, 9, 30).toISOString(),
      }],
    ]);
    const result = sheet({ needs: EIGHT, states });
    expect(result.lines.map((l) => l.key)).toEqual(EIGHT.slice(0, 5).map((e) => e.key));
    expect(result.lines[0].settled).toEqual({
      kind: 'not_today',
      at: new Date(2026, 9, 9, 9, 30).toISOString(),
      until: '2026-10-12',
    });
    expect(result.alsoYours.map((l) => l.key)).toEqual(EIGHT.slice(5).map((e) => e.key));
    expect(result.setAside).toEqual([]);
  });
});

describe('deriveDaySheet — acted needs wait on others', () => {
  it('moves an acted need to waitingOn with who and since', () => {
    const maker = entry(1, { owner: 'maker' });
    const named = entry(2);
    const states = new Map([
      [maker.key, state(maker.key, { actedAt: '2026-10-03T15:00:00.000Z' })],
      [named.key, state(named.key, { actedAt: '2026-10-05T15:00:00.000Z', waitingOn: 'Fenmoor Joinery' })],
    ]);
    const result = sheet({ needs: [maker, named], states });
    expect(result.lines).toEqual([]);
    expect(result.waitingOn).toEqual([
      { need: maker, who: 'the maker', since: '2026-10-03T15:00:00.000Z' },
      { need: named, who: 'Fenmoor Joinery', since: '2026-10-05T15:00:00.000Z' },
    ]);
    expect(result.empty).toBe(true);
  });

  it('sets a need set aside to one side until the day it comes back', () => {
    const a = entry(1);
    const states = new Map([[a.key, state(a.key, { setAsideUntil: '2026-10-20', setAsideReason: 'client away' })]]);
    const result = sheet({ needs: [a], states });
    expect(result.lines).toEqual([]);
    expect(result.setAside).toEqual([{ need: a, until: '2026-10-20', reason: 'client away' }]);
  });
});

describe('deriveDaySheet — an honest empty sheet (fix-now 6)', () => {
  it('is empty only when there are no lines and every feed answered', () => {
    expect(sheet().empty).toBe(true);
    expect(sheet().unchecked).toEqual([]);
  });

  it('an unread feed blocks empty and is named', () => {
    const result = sheet({ unreadFeeds: ['purchase orders', 'invoices'] });
    expect(result.lines).toEqual([]);
    expect(result.empty).toBe(false);
    expect(result.unchecked).toEqual(['purchase orders', 'invoices']);
  });
});

describe('deriveDaySheet — Mine against the studio’s', () => {
  const mine = entry(1, {}, 'p-mine');
  const hers = entry(2, {}, 'p-hers');
  const leads: DeskLeads = new Map([
    ['p-mine', { leadUserId: 'me', leadName: 'Leah Warner', assignedAt: '2026-10-01T00:00:00Z' }],
    ['p-hers', { leadUserId: 'anneke', leadName: 'Anneke Sund', assignedAt: '2026-10-01T00:00:00Z' }],
  ]);

  it('Mine keeps only the jobs this seat leads', () => {
    expect(sheet({ needs: [mine, hers], leads, scope: 'mine' }).lines).toEqual([mine]);
  });

  it('the studio’s keeps every job', () => {
    expect(sheet({ needs: [mine, hers], leads, scope: 'studio' }).lines).toEqual([mine, hers]);
  });

  it('is never empty on Mine while a leadless inquiry of mine has a need', () => {
    const inquiry = entry(3, { kind: 'new_lead' as NeedKind }, 'eng-inquiry');
    const theirs = entry(4, {}, 'eng-theirs');
    const designers = new Map<string, string | null>([
      ['eng-inquiry', 'me'],
      ['eng-theirs', 'anneke'],
    ]);
    const result = sheet({ needs: [inquiry, theirs], leads, designers, scope: 'mine' });
    expect(result.lines).toEqual([inquiry]);
    expect(result.empty).toBe(false);
    // Someone else's leadless job alone leaves Mine empty.
    expect(sheet({ needs: [theirs], leads, designers, scope: 'mine' }).empty).toBe(true);
  });

  it('Mine with nothing of hers says nothing needs her — the studio’s still has work', () => {
    expect(sheet({ needs: [hers], leads, scope: 'mine' }).empty).toBe(true);
    expect(sheet({ needs: [hers], leads, scope: 'studio' }).empty).toBe(false);
  });
});

describe('timeWord (Q5)', () => {
  const now = new Date(2026, 9, 9, 14, 0, 0);
  it('says a recent event in words, inside 24 hours only', () => {
    expect(timeWord(new Date(2026, 9, 9, 13, 59, 30).toISOString(), now)).toBe('just now');
    expect(timeWord(new Date(2026, 9, 9, 13, 20).toISOString(), now)).toBe('40 minutes ago');
    expect(timeWord(new Date(2026, 9, 9, 12, 0).toISOString(), now)).toBe('2 hours ago');
    expect(timeWord(new Date(2026, 9, 8, 18, 0).toISOString(), now)).toBe('yesterday');
    expect(timeWord(new Date(2026, 9, 8, 13, 0).toISOString(), now)).toBeNull();
    expect(timeWord(null, now)).toBeNull();
    expect(timeWord('2026-10-09T23:00:00Z', new Date('2026-10-09T12:00:00Z'))).toBeNull();
  });
  it('reads local calendar days', () => {
    expect(localDay(FRIDAY)).toBe('2026-10-09');
  });
});

// Slice 4 item 5 — the Desk line and the band cannot disagree: the roster
// line's head need is the band's Next (`deskLeadNeed`, FR3 F3-4) and the
// job's first line on the Day Sheet, by key.
describe('one head need per job — roster line, band and sheet agree', () => {
  const NOW = new Date('2026-08-25T12:00:00Z');
  const row = {
    engagement_id: 'eng-ash',
    project_id: 'p-ash',
    title: 'Ash house',
    client_name: 'Ash family',
    active_section: 'project',
    current_phase: null,
    updated_at: '2026-08-01T00:00:00Z',
  } as unknown as DocumentStateRow;
  const line = (kind: string, recordId: string, over: Partial<NeedLine> = {}) =>
    ({
      key: `${kind}:${recordId}`,
      kind,
      text: `${kind} on ${recordId}`,
      actionLabel: 'Open it',
      stamp: { label: 'DUE', color: 'var(--color-clay)' },
      urgent: false,
      owner: 'designer',
      ...over,
    }) as NeedLine;
  const needs = [
    line('schedule_unconfigured', 'project:p-ash'),
    line('task_due', 't-1', { dueOn: '2026-08-28' }),
    line('overdue_invoice', 'inv-9', { dueOn: '2026-08-10', urgent: true }),
    line('po_unacknowledged', 'po-3', { at: '2026-08-20T00:00:00Z' }),
  ];
  const folder = { row, need: needs[0], needs } as unknown as DeskFolder;

  it('prints the same key on all three', () => {
    const input = { folders: [folder], chips: [], live: [row], oneVoice: true };
    const roster = deriveDeskRoster(input, NOW);
    const rosterKey = roster.groups.flatMap((g) => g.lines)[0].needKey;
    const bandHead = deskLeadNeed(needs.filter((n) => classOfNeed(n.kind) !== 3), NOW);
    const sheetHead = deriveDaySheet({
      needs: deriveDeskNeedList(input, NOW),
      states: new Map(),
      leads: new Map(),
      meUserId: 'me',
      scope: 'studio',
      unreadFeeds: [],
      now: NOW,
    }).lines.find((l) => l.projectId === 'p-ash');

    expect(rosterKey).toBe('overdue_invoice:inv-9');
    expect(bandHead?.key).toBe(rosterKey);
    expect(sheetHead?.key).toBe(rosterKey);
  });
});

describe('deriveDaySheet — an aggregate acts one record at a time (SQ-751 F7)', () => {
  const twoPos = (): DeskNeed => {
    const base = entry(1, {
      kind: 'po_unacknowledged' as NeedKind,
      key: 'po_unacknowledged:po-1',
      recordId: 'po-1',
      text: '2 POs sent — no acknowledgment',
      at: '2026-10-01T09:00:00.000Z',
      records: [
        { recordId: 'po-1', at: '2026-10-01T09:00:00.000Z', dueOn: '2026-10-01T09:00:00.000Z' },
        { recordId: 'po-2', at: '2026-10-03T09:00:00.000Z', dueOn: '2026-10-03T09:00:00.000Z' },
      ],
    });
    return { ...base, key: base.need.key };
  };

  it('a PO chased today holds the line, settled in place under its own key; the second waits in the job (U-Q2)', () => {
    const chased = new Date(2026, 9, 9, 8, 0).toISOString();
    const result = sheet({
      needs: [twoPos()],
      states: new Map([['po_unacknowledged:po-1', state('po_unacknowledged:po-1', { actedAt: chased })]]),
    });
    expect(result.lines.map((l) => [l.key, l.need.recordId, l.need.at, l.settled?.kind, l.settled?.at])).toEqual([
      ['po_unacknowledged:po-1', 'po-1', '2026-10-01T09:00:00.000Z', 'acted', chased],
    ]);
    // The second PO is not promoted anywhere on the sheet: it stays in the job.
    expect(result.alsoYours).toEqual([]);
    expect(result.waitingOn).toEqual([]);
    expect(JSON.stringify(result.lines)).not.toContain('"key":"po_unacknowledged:po-2"');
  });

  it('a PO chased on an earlier day leaves the line standing for the second, under its own key', () => {
    const result = sheet({
      needs: [twoPos()],
      states: new Map([
        ['po_unacknowledged:po-1', state('po_unacknowledged:po-1', { actedAt: new Date(2026, 9, 8, 8, 0).toISOString() })],
      ]),
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      key: 'po_unacknowledged:po-2',
      need: { key: 'po_unacknowledged:po-2', recordId: 'po-2', at: '2026-10-03T09:00:00.000Z' },
    });
    expect(result.lines[0].settled).toBeUndefined();
    expect(result.waitingOn).toEqual([]);
  });

  it('the second PO, chased today after the first was chased earlier, settles in place under its key', () => {
    const chased = new Date(2026, 9, 9, 9, 0).toISOString();
    const result = sheet({
      needs: [twoPos()],
      states: new Map([
        ['po_unacknowledged:po-1', state('po_unacknowledged:po-1', { actedAt: new Date(2026, 9, 8, 8, 0).toISOString() })],
        ['po_unacknowledged:po-2', state('po_unacknowledged:po-2', { actedAt: chased })],
      ]),
    });
    expect(result.lines.map((l) => [l.key, l.settled?.kind, l.settled?.at])).toEqual([
      ['po_unacknowledged:po-2', 'acted', chased],
    ]);
  });

  describe('six jobs, the chased aggregate on the fifth line (R2 — no refill)', () => {
    const po = (i: number, day: number, over: Partial<NeedLine> = {}): DeskNeed => {
      const at = new Date(2026, 8, day, 9, 0).toISOString();
      const base = entry(i, {
        kind: 'po_unacknowledged' as NeedKind,
        recordId: `r${i}`,
        text: 'PO sent — no acknowledgment',
        at,
        dueOn: at,
        ...over,
      });
      return { ...base, key: base.need.key };
    };
    // Sep 25's PO leads job 5's aggregate; its second PO, Oct 2, is newer than job 6's.
    const aggregate = po(5, 25, {
      text: '2 POs sent — no acknowledgment',
      records: [
        { recordId: 'r5', at: new Date(2026, 8, 25, 9).toISOString(), dueOn: new Date(2026, 8, 25, 9).toISOString() },
        { recordId: 'r5b', at: new Date(2026, 9, 2, 9).toISOString(), dueOn: new Date(2026, 9, 2, 9).toISOString() },
      ],
    });
    const needs = rankDeskNeeds([po(1, 21), po(2, 22), po(3, 23), po(4, 24), aggregate, po(6, 28)], FRIDAY);
    const jobs = (lines: readonly SheetEntry[]) => lines.map((l) => l.projectId);
    const chasedToday = new Date(2026, 9, 9, 9, 30).toISOString();

    it('crosses the cutoff: keyed to its second PO, job 5 would rank under job 6', () => {
      const second = aggregate.need.records![1];
      const rekeyed = {
        ...aggregate,
        key: 'po_unacknowledged:r5b',
        need: { ...aggregate.need, key: 'po_unacknowledged:r5b', recordId: 'r5b', at: second.at, dueOn: second.dueOn },
      };
      expect(jobs(rankDeskNeeds([...needs.filter((n) => n !== aggregate), rekeyed], FRIDAY))).toEqual(
        ['p1', 'p2', 'p3', 'p4', 'p6', 'p5'],
      );
    });

    it('her chase today keeps Today’s five lines the same jobs, in the same order', () => {
      const before = sheet({ needs });
      expect(jobs(before.lines)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);

      const after = sheet({
        needs,
        states: new Map([['po_unacknowledged:r5', state('po_unacknowledged:r5', { actedAt: chasedToday })]]),
      });
      expect(jobs(after.lines)).toEqual(jobs(before.lines));
      expect(after.lines.map((l) => l.key)).toEqual(before.lines.map((l) => l.key));
      expect(after.lines[4].settled).toEqual(expect.objectContaining({ kind: 'acted', at: chasedToday }));
      expect(jobs(after.alsoYours)).toEqual(['p6']);
      expect(after.standing.get('p5')).toBe('settled');
    });

    it('the holder’s chase today holds the line the same way, in the studio’s scope', () => {
      const leads: DeskLeads = new Map([
        ['p5', { leadUserId: 'u-jordan', leadName: 'Jordan Reyes', assignedAt: '2026-09-01T00:00:00Z' }],
      ]);
      const after = sheet({
        needs,
        leads,
        teammateActs: new Map([['po_unacknowledged:r5', [{ userId: 'u-jordan', actedAt: chasedToday }]]]),
      });
      expect(jobs(after.lines)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
      expect(after.lines[4]).toMatchObject({
        key: 'po_unacknowledged:r5',
        settled: { kind: 'acted', at: chasedToday, by: 'u-jordan' },
      });
      expect(jobs(after.alsoYours)).toEqual(['p6']);
    });
  });

  it('settles in place once every record is acted on today (U-Q2)', () => {
    const first = new Date(2026, 9, 9, 8, 0).toISOString();
    const result = sheet({
      needs: [twoPos()],
      states: new Map([
        ['po_unacknowledged:po-1', state('po_unacknowledged:po-1', { actedAt: first })],
        ['po_unacknowledged:po-2', state('po_unacknowledged:po-2', { actedAt: new Date(2026, 9, 9, 9, 0).toISOString() })],
      ]),
    });
    expect(result.lines.map((l) => [l.key, l.settled?.kind, l.settled?.at])).toEqual([
      ['po_unacknowledged:po-1', 'acted', first],
    ]);
    expect(result.waitingOn).toEqual([]);
  });

  it('waits once every record was acted on before today', () => {
    const result = sheet({
      needs: [twoPos()],
      states: new Map([
        ['po_unacknowledged:po-1', state('po_unacknowledged:po-1', { actedAt: new Date(2026, 9, 8, 8, 0).toISOString() })],
        ['po_unacknowledged:po-2', state('po_unacknowledged:po-2', { actedAt: new Date(2026, 9, 8, 9, 0).toISOString() })],
      ]),
    });
    expect(result.lines).toEqual([]);
    expect(result.waitingOn.map((w) => w.need.key)).toEqual(['po_unacknowledged:po-1']);
  });

  it('ranks the re-keyed line by its own record before the five are taken (SQ-774 R5)', () => {
    // The review input: aggregate P1 Oct 1 / P2 Oct 10, independent P3 Oct 5; P1 acted.
    const monday = new Date(2026, 9, 12, 10, 0, 0);
    const po = (recordId: string, at: string) => ({ recordId, at, dueOn: at });
    const aggregate = entry(1, {
      kind: 'po_unacknowledged' as NeedKind,
      key: 'po_unacknowledged:p1',
      recordId: 'p1',
      text: '2 POs sent — no acknowledgment',
      at: '2026-10-01T09:00:00.000Z',
      dueOn: '2026-10-01T09:00:00.000Z',
      records: [po('p1', '2026-10-01T09:00:00.000Z'), po('p2', '2026-10-10T09:00:00.000Z')],
    });
    const independent = entry(3, {
      kind: 'po_unacknowledged' as NeedKind,
      key: 'po_unacknowledged:p3',
      recordId: 'p3',
      text: 'PO sent — no acknowledgment',
      at: '2026-10-05T09:00:00.000Z',
      dueOn: '2026-10-05T09:00:00.000Z',
    });
    const needs = [
      { ...aggregate, key: aggregate.need.key },
      { ...independent, key: independent.need.key },
    ];
    const result = sheet({
      // As the Desk hands them in: already ranked by the one shared order.
      needs: rankDeskNeeds(needs, monday),
      states: new Map([
        ['po_unacknowledged:p1', state('po_unacknowledged:p1', { actedAt: '2026-10-09T08:00:00.000Z' })],
      ]),
      now: monday,
    });
    expect(result.lines.map((line) => line.key)).toEqual([
      'po_unacknowledged:p3',
      'po_unacknowledged:p2',
    ]);
  });
});

describe('deriveDaySheet — a later hand-off survives the composed Desk pipeline (SQ-774 R4)', () => {
  it('a read of the Oct 1 hand-off never silences the Oct 10 one on the final sheet', () => {
    const now = new Date(2026, 9, 12, 10, 0, 0);
    const leads: DeskLeads = new Map([
      ['p1', {
        leadUserId: 'me',
        leadName: 'Bea Lund',
        previousLeadUserId: 'leah',
        previousLeadName: 'Leah Hartwell',
        assignedAt: '2026-10-10T09:00:00.000Z',
      }],
    ]);
    const live = [
      { project_id: 'p1', engagement_id: 'e1', title: 'Ridge House', designer_id: 'leah' } as DocumentStateRow,
    ];
    // B read the earlier hand-off on Oct 1; the job was handed to her again Oct 10.
    const states = new Map([
      ['handoff:p1', state('handoff:p1', { projectId: 'p1', actedAt: '2026-10-01T09:00:00.000Z' })],
    ]);
    // The Desk page's own composition: hand-offs → the ranked list → the sheet.
    const handoffs = deriveHandoffNeeds(live, leads, 'me', states);
    expect(handoffs).toHaveLength(1);
    const needs = deriveDeskNeedList(
      { folders: [], chips: [], live, scope: 'mine', leads, meUserId: 'me' },
      now,
      handoffs,
    );
    const result = deriveDaySheet({
      needs,
      states,
      leads,
      meUserId: 'me',
      scope: 'mine',
      designers: deskDesignersOf(live),
      unreadFeeds: [],
      now,
    });
    expect(result.lines.map((line) => line.key)).toEqual(['handoff:p1']);
    expect(result.waitingOn).toEqual([]);
    expect(result.empty).toBe(false);

    // Read at or after the standing assignment, it is gone from the sheet.
    const readNow = new Map([
      ['handoff:p1', state('handoff:p1', { projectId: 'p1', actedAt: '2026-10-11T09:00:00.000Z' })],
    ]);
    const after = deriveDaySheet({
      needs: rankDeskNeeds(handoffs, now),
      states: readNow,
      leads,
      meUserId: 'me',
      scope: 'mine',
      designers: deskDesignersOf(live),
      unreadFeeds: [],
      now,
    });
    expect(after.lines).toEqual([]);
    expect(after.waitingOn).toEqual([]);
  });
});

describe('deriveDaySheet — a hand-off with no name on record (SQ-777 F5)', () => {
  it('keeps the hand-off line and its note, naming "the previous lead"', () => {
    const now = new Date(2026, 9, 12, 10, 0, 0);
    // Valid ids, a note its writer left, and a standing assignment; the
    // previous lead's profile has no full_name, which the resolver maps to ''.
    const leads: DeskLeads = new Map([
      ['p1', {
        leadUserId: 'me',
        leadName: 'Bea Lund',
        previousLeadUserId: 'leah',
        previousLeadName: '',
        assignedAt: '2026-10-10T09:00:00.000Z',
      }],
    ]);
    const live = [
      { project_id: 'p1', engagement_id: 'e1', title: 'Ridge House', designer_id: 'leah' } as DocumentStateRow,
    ];
    const seat = { handoff_note: 'Ridge House is yours from today', invited_by: 'leah' };
    const handoffs = deriveHandoffNeeds(live, leads, 'me', new Map(), seat);
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].need.text).toMatch(
      /^The previous lead handed you Ridge House on .+ · Read the previous lead's note$/,
    );
    expect(handoffs[0].need.actionLabel).toBe('Read the note');
    const result = deriveDaySheet({
      needs: deriveDeskNeedList(
        { folders: [], chips: [], live, scope: 'mine', leads, meUserId: 'me' },
        now,
        handoffs,
      ),
      states: new Map(),
      leads,
      meUserId: 'me',
      scope: 'mine',
      designers: deskDesignersOf(live),
      unreadFeeds: [],
      now,
    });
    expect(result.lines.filter((line) => line.key.startsWith('handoff:'))).toHaveLength(1);
  });
});

// US-28 U-Q2 / U-Q11 — Today is the top five of ONE ranked list of the open
// needs and the needs settled today. Settling never changes rank, so no slot
// ever refills. The x4 / x6 specimens (uplift.md "The x4 / x6 inconsistency,
// resolved"), on Monday 12 October 2026.
describe('deriveDaySheet — settled lines stay until the next morning (US-28)', () => {
  const at = (h: number, m: number, day = 12) => new Date(2026, 9, day, h, m).toISOString();
  const job = (
    key: string,
    projectId: string,
    projectName: string,
    over: Partial<NeedLine> = {},
  ): DeskNeed => ({
    key,
    projectId,
    projectName,
    need: {
      key,
      kind: 'task_due',
      text: `${projectName} is due`,
      actionLabel: 'Open the task',
      stamp: { label: 'DUE', color: 'var(--color-clay)' },
      urgent: false,
      owner: 'designer',
      ...over,
    } as NeedLine,
  });
  const morning = [
    job('task_due:hol-1', 'p-holloway', 'Holloway', { dueOn: '2026-10-05' }),
    job('task_due:hol-2', 'p-holloway', 'Holloway', { dueOn: '2026-10-06' }),
    job('task_due:linden', 'p-linden', 'Linden', { dueOn: '2026-10-07' }),
    job('task_due:pell', 'p-pell', 'Pell Court', { dueOn: '2026-10-08' }),
    job('task_due:ines', 'p-ines', 'Ines Calder', { dueOn: '2026-10-09' }),
  ];
  const ainsley = job('new_lead:ainsley', 'eng-ainsley', 'Ainsley Moore', {
    kind: 'new_lead' as NeedKind,
    at: at(11, 20),
  });
  const thornfield = job('proposal_signed:thornfield', 'p-thornfield', 'Thornfield', {
    kind: 'proposal_signed' as NeedKind,
    at: null,
  });
  const needs = [...morning, ainsley, thornfield];
  const morningStates = (): Map<string, SheetNeedState> =>
    new Map<string, SheetNeedState>([
      ['task_due:hol-1', state('task_due:hol-1', { actedAt: at(8, 42), waitingOn: 'Mara' })],
      ['task_due:hol-2', { ...state('task_due:hol-2', { deferredUntil: '2026-10-13' }), updatedAt: at(8, 47) }],
      ['task_due:linden', {
        ...state('task_due:linden', { setAsideUntil: '2026-10-20', setAsideReason: 'client away' }),
        updatedAt: at(9, 5),
      }],
      ['task_due:pell', state('task_due:pell', { actedAt: at(9, 12), waitingOn: 'Fenmoor Joinery' })],
      ['task_due:ines', state('task_due:ines', { actedAt: at(9, 20), waitingOn: 'Ines' })],
    ]);
  const roster = new Map([
    ['p-holloway', { name: 'Holloway', stage: 'install' as const }],
    ['p-linden', { name: 'Linden', stage: 'project' as const }],
    ['p-pell', { name: 'Pell Court', stage: 'project' as const }],
    ['p-ines', { name: 'Ines Calder', stage: 'brief' as const }],
  ]);

  it('x4 at 11:21 — five settled lines hold Today; Ainsley and Thornfield are Also yours', () => {
    const result = sheet({ needs, states: morningStates(), now: new Date(2026, 9, 12, 11, 21) });

    expect(result.lines.map((l) => [l.key, l.settled?.kind, l.settled?.at])).toEqual([
      ['task_due:hol-1', 'acted', at(8, 42)],
      ['task_due:hol-2', 'not_today', at(8, 47)],
      ['task_due:linden', 'set_aside', at(9, 5)],
      ['task_due:pell', 'acted', at(9, 12)],
      ['task_due:ines', 'acted', at(9, 20)],
    ]);
    expect(result.lines[0].settled?.who).toBe('Mara');
    expect(result.lines[2].settled).toMatchObject({ until: '2026-10-20', reason: 'client away' });
    // No slot refilled: the class-2 inquiry arriving after Ines does not
    // outrank the fifth line, and Thornfield stays past five.
    expect(result.alsoYours.map((l) => l.key).sort()).toEqual(
      [ainsley.key, thornfield.key].sort(),
    );
    expect(result.alsoYours.every((l) => !l.settled)).toBe(true);
    expect(result.waitingOn).toEqual([]);
    expect(result.setAside).toEqual([]);
    expect(result.empty).toBe(false);
    expect(Object.fromEntries(result.standing)).toEqual({
      'p-holloway': 'settled',
      'p-linden': 'settled',
      'p-pell': 'settled',
      'p-ines': 'settled',
      'eng-ainsley': 'yours',
      'p-thornfield': 'yours',
    });
    // The morning's four cards and five settled lines.
    expect(groupSheetByJob(result.lines, roster).map((c) => [c.name, c.lines.length])).toEqual([
      ['Holloway', 2],
      ['Linden', 1],
      ['Pell Court', 1],
      ['Ines Calder', 1],
    ]);
  });

  it('x6 at 5:50 pm — the same five lines; Ainsley and Thornfield settle in place in Also yours', () => {
    const states = morningStates();
    states.set(ainsley.key, state(ainsley.key, { actedAt: at(14, 40), waitingOn: 'Ainsley Moore' }));
    states.set(thornfield.key, {
      ...state(thornfield.key, { deferredUntil: '2026-10-13' }),
      updatedAt: at(16, 15),
    });
    const result = sheet({ needs, states, now: new Date(2026, 9, 12, 17, 50) });

    expect(result.lines.map((l) => l.key)).toEqual(morning.map((m) => m.key));
    expect(result.lines.every((l) => l.settled)).toBe(true);
    const byKey = new Map(result.alsoYours.map((l) => [l.key, l.settled]));
    expect(byKey.get(ainsley.key)).toEqual({ kind: 'acted', at: at(14, 40), who: 'Ainsley Moore' });
    expect(byKey.get(thornfield.key)).toEqual({ kind: 'not_today', at: at(16, 15), until: '2026-10-13' });
    expect(result.standing.get('p-thornfield')).toBe('settled');
  });

  it('the next morning (Tuesday) Thornfield is open again and the acted lines wait on others', () => {
    const states = morningStates();
    states.set(ainsley.key, state(ainsley.key, { actedAt: at(14, 40), waitingOn: 'Ainsley Moore' }));
    states.set(thornfield.key, {
      ...state(thornfield.key, { deferredUntil: '2026-10-13' }),
      updatedAt: at(16, 15),
    });
    const result = sheet({ needs, states, now: new Date(2026, 9, 13, 8, 0) });

    expect(result.lines.map((l) => l.key)).toEqual(['task_due:hol-2', thornfield.key]);
    expect(result.lines.every((l) => !l.settled)).toBe(true);
    expect(result.waitingOn.map((w) => w.need.key)).toEqual([
      'task_due:hol-1',
      'task_due:pell',
      'task_due:ines',
      ainsley.key,
    ]);
    expect(result.setAside).toEqual([{ need: morning[2], until: '2026-10-20', reason: 'client away' }]);
    expect(Object.fromEntries(result.standing)).toEqual({
      'p-holloway': 'yours',
      'p-thornfield': 'yours',
      'p-linden': 'back',
      'p-pell': 'others',
      'p-ines': 'others',
      'eng-ainsley': 'others',
    });
  });

  it('M7 — an arrival that outranks a line enters Today; the fifth moves to Also yours with its state', () => {
    const failed = job('payment_failed:pay-1', 'p-pay', 'Marsh Street', {
      kind: 'payment_failed' as NeedKind,
      urgent: true,
      dueOn: '2026-10-02',
    });
    const result = sheet({
      needs: [...needs, failed],
      states: morningStates(),
      now: new Date(2026, 9, 12, 11, 30),
    });

    expect(result.lines).toHaveLength(DAY_SHEET_LINES);
    expect(result.lines[0].key).toBe(failed.key);
    expect(result.lines.map((l) => l.key)).not.toContain('task_due:ines');
    expect(result.alsoYours[0]).toMatchObject({
      key: 'task_due:ines',
      settled: { kind: 'acted', at: at(9, 20), who: 'Ines' },
    });
  });

  it('change 5 — a silent overdue invoice or PO with no state is yours; acted on yesterday is with others', () => {
    const invoice = job('overdue_invoice:inv-1', 'p-inv', 'Invoice job', {
      kind: 'overdue_invoice' as NeedKind,
      owner: 'client',
      dueOn: '2026-10-01',
      urgent: true,
    });
    const po = job('po_unacknowledged:po-1', 'p-po', 'PO job', {
      kind: 'po_unacknowledged' as NeedKind,
      owner: 'maker',
      at: '2026-10-01T09:00:00.000Z',
    });
    const chased = job('po_unacknowledged:po-9', 'p-chased', 'Chased job', {
      kind: 'po_unacknowledged' as NeedKind,
      owner: 'maker',
    });
    const result = sheet({
      needs: [invoice, po, chased],
      states: new Map([[chased.key, state(chased.key, { actedAt: at(16, 0, 11) })]]),
      now: new Date(2026, 9, 12, 9, 0),
    });

    expect(result.lines.map((l) => l.key)).toEqual([invoice.key, po.key]);
    expect(Object.fromEntries(result.standing)).toEqual({
      'p-inv': 'yours',
      'p-po': 'yours',
      'p-chased': 'others',
    });
    expect(result.waitingOn).toEqual([{ need: chased, who: 'the maker', since: at(16, 0, 11) }]);
  });
});

describe('deriveDaySheet — drafted, read and a teammate’s act settle in place (US-28)', () => {
  const monday = new Date(2026, 9, 12, 17, 50);
  const at = (h: number, m: number, day = 12) => new Date(2026, 9, day, h, m).toISOString();

  it('change 7 — a draft saved for the lead settles as drafted, waiting on her', () => {
    const pell = entry(1, {}, 'p-pell');
    const counterpart = entry(2, {}, 'p-pell');
    const leads: DeskLeads = new Map([
      ['p-pell', { leadUserId: 'leah', leadName: 'Leah Warner', assignedAt: '2026-10-01T00:00:00Z' }],
    ]);
    const result = sheet({
      needs: [pell, counterpart],
      leads,
      meUserId: 'jordan',
      states: new Map([
        [pell.key, state(pell.key, { actedAt: at(9, 30), waitingOn: 'Leah' })],
        [counterpart.key, state(counterpart.key, { actedAt: at(9, 40), waitingOn: 'Fenmoor Joinery' })],
      ]),
      now: monday,
    });

    expect(result.lines.map((l) => l.settled)).toEqual([
      { kind: 'drafted', at: at(9, 30), who: 'Leah' },
      { kind: 'acted', at: at(9, 40), who: 'Fenmoor Joinery' },
    ]);
    expect(draftedForWords('Leah')).toBe('Drafted for Leah · she sees this first');
  });

  it('a hand-off read today settles as read, and is gone the next morning', () => {
    const leads: DeskLeads = new Map([
      ['p1', {
        leadUserId: 'me',
        leadName: 'Bea Lund',
        previousLeadUserId: 'leah',
        previousLeadName: 'Leah Hartwell',
        assignedAt: '2026-10-10T09:00:00.000Z',
      }],
    ]);
    const live = [
      { project_id: 'p1', engagement_id: 'e1', title: 'Ridge House', designer_id: 'leah' } as DocumentStateRow,
    ];
    const states = new Map([['handoff:p1', state('handoff:p1', { projectId: 'p1', actedAt: at(9, 0) })]]);
    const read = (now: Date) =>
      deriveDaySheet({
        needs: deriveHandoffNeeds(live, leads, 'me', states, null, now),
        states,
        leads,
        meUserId: 'me',
        scope: 'mine',
        designers: deskDesignersOf(live),
        unreadFeeds: [],
        now,
      });

    expect(read(monday).lines.map((l) => [l.key, l.settled])).toEqual([
      ['handoff:p1', { kind: 'read', at: at(9, 0) }],
    ]);
    expect(read(new Date(2026, 9, 13, 8, 0)).lines).toEqual([]);
  });

  it('U-Q4 — only the job holder’s act settles the line; anyone else’s leaves it open', () => {
    const line = entry(1, {}, 'p-j');
    const leads: DeskLeads = new Map([
      ['p-j', { leadUserId: 'jordan', leadName: 'Jordan Pell', assignedAt: '2026-10-01T00:00:00Z' }],
    ]);
    const withActs = (acts: { userId: string; actedAt: string }[]) =>
      sheet({
        needs: [line],
        leads,
        meUserId: 'leah',
        teammateActs: new Map([[line.key, acts]]),
        now: monday,
      });

    const held = withActs([{ userId: 'jordan', actedAt: at(9, 30) }]);
    expect(held.lines[0].settled).toMatchObject({ kind: 'acted', at: at(9, 30), by: 'jordan' });
    expect(held.standing.get('p-j')).toBe('settled');

    expect(withActs([{ userId: 'anneke', actedAt: at(9, 30) }]).lines[0].settled).toBeUndefined();

    const yesterday = withActs([{ userId: 'jordan', actedAt: at(16, 0, 11) }]);
    expect(yesterday.lines).toEqual([]);
    expect(yesterday.waitingOn).toEqual([
      { need: line, who: line.projectName, since: at(16, 0, 11), by: 'jordan' },
    ]);
    expect(yesterday.standing.get('p-j')).toBe('others');
  });

  describe('R7 — her spent own row never shadows the holder’s act', () => {
    const line = entry(1, {}, 'p-j');
    const leads: DeskLeads = new Map([
      ['p-j', { leadUserId: 'jordan', leadName: 'Jordan Pell', assignedAt: '2026-10-01T00:00:00Z' }],
    ]);
    const read = (own: SheetNeedState, actedAt = at(9, 30)) =>
      sheet({
        needs: [line],
        leads,
        meUserId: 'leah',
        states: new Map([[line.key, own]]),
        teammateActs: new Map([[line.key, [{ userId: 'jordan', actedAt }]]]),
        now: monday,
      });

    it('an expired own “Not today” plus the holder’s act today reads as settled', () => {
      // Put off on Friday until Monday: spent this morning.
      const result = read({ ...state(line.key, { deferredUntil: '2026-10-12' }), updatedAt: at(15, 0, 9) });
      expect(result.lines.map((l) => [l.key, l.settled])).toEqual([
        [line.key, { kind: 'acted', at: at(9, 30), who: line.projectName, by: 'jordan' }],
      ]);
      expect(result.standing.get('p-j')).toBe('settled');
      expect(result.setAside).toEqual([]);
    });

    it('a spent set-aside, or a row Undo cleared today, gives way to the holder too', () => {
      const spentAside = read({ ...state(line.key, { setAsideUntil: '2026-10-09', setAsideReason: 'client away' }), updatedAt: at(9, 0, 5) });
      expect(spentAside.lines[0].settled).toMatchObject({ kind: 'acted', by: 'jordan' });
      const cleared = read({ ...state(line.key), updatedAt: at(8, 0) });
      expect(cleared.lines[0].settled).toMatchObject({ kind: 'acted', by: 'jordan' });
    });

    it('an expired own row plus the holder’s act yesterday waits on others, not open', () => {
      const result = read({ ...state(line.key, { deferredUntil: '2026-10-09' }), updatedAt: at(15, 0, 8) }, at(16, 0, 11));
      expect(result.lines).toEqual([]);
      expect(result.waitingOn).toEqual([{ need: line, who: line.projectName, since: at(16, 0, 11), by: 'jordan' }]);
    });

    it('her own state still in force keeps precedence over the holder’s act', () => {
      const ahead = read({ ...state(line.key, { setAsideUntil: '2026-10-20', setAsideReason: 'client away' }), updatedAt: at(9, 0, 9) });
      expect(ahead.lines).toEqual([]);
      expect(ahead.setAside).toEqual([{ need: line, until: '2026-10-20', reason: 'client away' }]);
      const notToday = read({ ...state(line.key, { deferredUntil: '2026-10-13' }), updatedAt: at(8, 0) });
      expect(notToday.lines[0].settled).toEqual({ kind: 'not_today', at: at(8, 0), until: '2026-10-13' });
    });
  });
});

describe('groupSheetByJob (US-28 change 1)', () => {
  const ash1 = entry(1, {}, 'p-ash') as SheetEntry;
  const birch = entry(2, {}, 'p-birch') as SheetEntry;
  const ashHandoff = entry(3, { kind: 'handoff' as NeedKind }, 'p-ash') as SheetEntry;
  const roster = new Map([
    ['p-ash', { name: 'Ash House', stage: 'project' as const }],
    ['p-birch', { name: 'Birch Lane', stage: 'install' as const }],
  ]);

  it('orders cards by their first line, puts a hand-off first, and reads the stage off the roster', () => {
    const holder = { userId: 'leah', name: 'Leah', mine: true };
    const cards = groupSheetByJob([ash1, birch, ashHandoff], roster, () => holder);

    expect(cards).toEqual([
      { jobId: 'p-ash', name: 'Ash House', stage: 'project', holder, lines: [ashHandoff, ash1] },
      { jobId: 'p-birch', name: 'Birch Lane', stage: 'install', holder, lines: [birch] },
    ]);
  });

  it('falls back to the line’s own name, no stage and no holder', () => {
    expect(groupSheetByJob([birch], new Map())).toEqual([
      { jobId: 'p-birch', name: 'Job 2', stage: null, holder: null, lines: [birch] },
    ]);
  });
});
