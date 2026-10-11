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
import { deriveDeskNeedList } from '@/lib/document/desk-need-list';
import { deriveDeskRoster } from '@/lib/document/desk-roster-derivation';
import { classOfNeed, deskLeadNeed } from '@/lib/document/need-class';
import type { DeskLeads } from '@/lib/document/desk-scope';
import {
  DAY_SHEET_LINES,
  deriveDaySheet,
  localDay,
  nextWorkingDay,
  timeWord,
  type DaySheetInput,
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
      ['empty', 'lines', 'setAside', 'unchecked', 'waitingOn'].sort(),
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

  it('lets a sixth need step up when one is put off, never printing six', () => {
    const states = new Map([[EIGHT[0].key, state(EIGHT[0].key, { deferredUntil: '2026-10-12' })]]);
    const result = sheet({ needs: EIGHT, states });
    expect(result.lines.map((l) => l.key)).toEqual(EIGHT.slice(1, 6).map((e) => e.key));
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

  it('chasing the first PO leaves the line standing for the second, under its own key', () => {
    const result = sheet({
      needs: [twoPos()],
      states: new Map([
        ['po_unacknowledged:po-1', state('po_unacknowledged:po-1', { actedAt: '2026-10-09T08:00:00.000Z' })],
      ]),
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      key: 'po_unacknowledged:po-2',
      need: { key: 'po_unacknowledged:po-2', recordId: 'po-2', at: '2026-10-03T09:00:00.000Z' },
    });
    expect(result.waitingOn).toEqual([]);
  });

  it('waits once every record is acted on', () => {
    const result = sheet({
      needs: [twoPos()],
      states: new Map([
        ['po_unacknowledged:po-1', state('po_unacknowledged:po-1', { actedAt: '2026-10-09T08:00:00.000Z' })],
        ['po_unacknowledged:po-2', state('po_unacknowledged:po-2', { actedAt: '2026-10-09T09:00:00.000Z' })],
      ]),
    });
    expect(result.lines).toEqual([]);
    expect(result.waitingOn.map((w) => w.need.key)).toEqual(['po_unacknowledged:po-1']);
  });
});
