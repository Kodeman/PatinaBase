import { resolveCursor } from '@/content/teaching-releases';
import { DAY_MS, TEACHING_LABEL_WORD } from './constants';
import {
  alreadyKnew,
  byRank,
  fasterWayReady,
  isNewVisit,
  labelFor,
  nextStateAfterClose,
  resolveBindings,
  selectTeachingNote,
  sinceLineFor,
} from './select';
import type {
  BoundaryLog,
  SelectInputs,
  TeachingNote,
  TeachingNoteState,
  TeachingRelease,
} from './types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const OLD = '2026-08-01-old-thing';
const GALLEY = '2026-09-10-galley-parts';
const PRINT = '2026-09-11-invoice-print';
const TINY = '2026-09-12-tiny-fix';

const MANIFEST: readonly TeachingRelease[] = [
  { id: OLD, shippedOn: '2026-08-01', sizeClass: 'useful', featureKeys: ['people'] },
  { id: GALLEY, shippedOn: '2026-09-10', sizeClass: 'workflow_changing', featureKeys: ['galley'] },
  { id: PRINT, shippedOn: '2026-09-11', sizeClass: 'useful', featureKeys: ['ledger'] },
  { id: TINY, shippedOn: '2026-09-12', sizeClass: 'minor', featureKeys: ['people'] },
];

const NOW = Date.parse('2026-09-25T14:00:00Z');
const MOUNTED = NOW - 60_000;
const SURFACE = 'designer-portal/document/accounts';
const OTHER_SURFACE = 'designer-portal/document/hours';
const iso = (ms: number) => new Date(ms).toISOString();

function note(over: Partial<TeachingNote> = {}): TeachingNote {
  return {
    noteKey: 'galley-parts@1',
    kind: 'release',
    audience: 'all',
    trigger: 'return',
    surfaceKey: 'designer-portal/desk',
    releaseId: GALLEY,
    body: 'Signed parts now draw their own purchase orders.',
    priority: 3,
    recedeOn: [],
    maxDisplays: 3,
    provenance: 'agent',
    ...over,
  };
}

type Fired = { surface: string; boundary: string; at: number };
function log(fired: Fired[] = []): BoundaryLog {
  return {
    firedOn: (surface, boundary, since = -Infinity) =>
      fired.some((f) => f.surface === surface && f.boundary === boundary && f.at >= since),
  };
}

function state(over: Partial<TeachingNoteState> = {}): TeachingNoteState {
  return {
    v: 1,
    cursor: { lastSeenReleaseId: OLD },
    visit: {
      startedAt: iso(NOW - 5 * 60_000),
      prevStartedAt: iso(NOW - 3 * DAY_MS),
      lastActiveAt: iso(NOW - 60_000),
      unsolicitedShown: null,
    },
    recentUnsolicited: [],
    ignoredStreak: 0,
    quiet: { off: false, until: null },
    seen: {},
    ...over,
  };
}

function inputs(over: Partial<SelectInputs> = {}): SelectInputs {
  return {
    notes: [note()],
    releases: MANIFEST,
    manifest: MANIFEST,
    state: state(),
    signals: {
      role: 'owner',
      used: {
        galley: false,
        ledger: false,
        hours: false,
        people: false,
        field_capture: false,
        client_page: false,
        purchase_orders: false,
        seats: false,
      },
      lastAt: {},
      createdAt: '2026-08-15T00:00:00Z',
    },
    flags: { 'teaching-notes': { value: true, isLoading: false } },
    now: NOW,
    atRest: { desk: true, anchor: true, act: true },
    boundaries: log(),
    pinnedProjectIds: [],
    bindings: {},
    surfaceMountedAt: MOUNTED,
    ...over,
  };
}

const used = (x: SelectInputs, ...keys: (keyof SelectInputs['signals']['used'])[]) => ({
  ...x.signals,
  used: { ...x.signals.used, ...Object.fromEntries(keys.map((k) => [k, true])) },
});

const anchorNote = (over: Partial<TeachingNote> = {}) =>
  note({
    noteKey: 'print-anchor@1',
    trigger: 'anchor',
    surfaceKey: SURFACE,
    releaseId: PRINT,
    boundary: 'invoice_sent',
    ...over,
  });

const firedHere = log([{ surface: SURFACE, boundary: 'invoice_sent', at: NOW - 1000 }]);

const pick = (slot: 'desk' | 'anchor' | 'act', x: SelectInputs, surface = SURFACE) =>
  selectTeachingNote(slot, surface, x)?.noteKey ?? null;

// ─── Gates before candidates ─────────────────────────────────────────────────

describe('selectTeachingNote gates', () => {
  it('returns the eligible release note on the Desk', () => {
    expect(pick('desk', inputs())).toBe('galley-parts@1');
  });

  it('fails closed on the teaching-notes system flag: off, loading or absent', () => {
    expect(pick('desk', inputs({ flags: { 'teaching-notes': { value: false, isLoading: false } } }))).toBeNull();
    expect(pick('desk', inputs({ flags: { 'teaching-notes': { value: true, isLoading: true } } }))).toBeNull();
    expect(pick('desk', inputs({ flags: {} }))).toBeNull();
  });

  it('is silent while quiet is switched off, in every slot including act', () => {
    const quiet = state({ quiet: { off: true, until: null } });
    const act = note({ noteKey: 'galley-act@1', trigger: 'act', surfaceKey: SURFACE });
    expect(pick('desk', inputs({ state: quiet }))).toBeNull();
    expect(pick('act', inputs({ state: quiet, notes: [act] }))).toBeNull();
  });

  it('is silent until auto-quiet ends', () => {
    expect(pick('desk', inputs({ state: state({ quiet: { until: iso(NOW + DAY_MS) } }) }))).toBeNull();
    expect(pick('desk', inputs({ state: state({ quiet: { until: iso(NOW - DAY_MS) } }) }))).toBe(
      'galley-parts@1'
    );
  });

  it('is silent when the slot is not at rest', () => {
    expect(pick('desk', inputs({ atRest: { desk: false, anchor: true, act: true } }))).toBeNull();
  });

  it('allows one unsolicited note per visit, across slots', () => {
    const shown = state({ visit: { ...state().visit, unsolicitedShown: 'other@1' } });
    expect(pick('desk', inputs({ state: shown }))).toBeNull();
    expect(
      pick('anchor', inputs({ state: shown, notes: [anchorNote()], boundaries: firedHere }))
    ).toBeNull();
  });

  it('allows two unsolicited notes per rolling seven days', () => {
    const two = state({ recentUnsolicited: [iso(NOW - DAY_MS), iso(NOW - 2 * DAY_MS)] });
    const oneStale = state({ recentUnsolicited: [iso(NOW - DAY_MS), iso(NOW - 8 * DAY_MS)] });
    expect(pick('desk', inputs({ state: two }))).toBeNull();
    expect(pick('desk', inputs({ state: oneStale }))).toBe('galley-parts@1');
  });
});

// ─── Candidate filter ────────────────────────────────────────────────────────

describe('selectTeachingNote candidate filter', () => {
  it('maps slots to triggers: desk → return, anchor → anchor, act → act; pull_only never', () => {
    const ret = note();
    const anc = anchorNote();
    const act = note({ noteKey: 'galley-act@1', trigger: 'act', surfaceKey: SURFACE });
    const pull = note({ noteKey: 'pull@1', trigger: 'pull_only' });
    const x = inputs({ notes: [pull, act, anc, ret], boundaries: firedHere });
    expect(pick('desk', x)).toBe('galley-parts@1');
    expect(pick('anchor', x)).toBe('print-anchor@1');
    expect(pick('act', x)).toBe('galley-act@1');
    expect(pick('desk', inputs({ notes: [pull] }))).toBeNull();
  });

  it('matches the surface in place, but not on the Desk', () => {
    const x = inputs({ notes: [anchorNote()], boundaries: firedHere });
    expect(pick('anchor', x, OTHER_SURFACE)).toBeNull();
    expect(pick('desk', inputs({ notes: [note({ surfaceKey: 'anything/else' })] }))).toBe('galley-parts@1');
  });

  it('matches the audience to her role', () => {
    const owner = note({ audience: 'owner' });
    const hand = note({ audience: 'hand' });
    const asHand = (x: SelectInputs) => ({ ...x, signals: { ...x.signals, role: 'hand' as const } });
    expect(pick('desk', inputs({ notes: [owner] }))).toBe('galley-parts@1');
    expect(pick('desk', asHand(inputs({ notes: [owner] })))).toBeNull();
    expect(pick('desk', inputs({ notes: [hand] }))).toBeNull();
    expect(pick('desk', asHand(inputs({ notes: [note({ audience: 'all' })] })))).toBe('galley-parts@1');
  });

  it("requires the note's own flag to be on; loading counts as off", () => {
    const flagged = [note({ flag: 'agreement-parts' })];
    const base = { 'teaching-notes': { value: true, isLoading: false } };
    expect(pick('desk', inputs({ notes: flagged }))).toBeNull();
    expect(
      pick('desk', inputs({ notes: flagged, flags: { ...base, 'agreement-parts': { value: true, isLoading: true } } }))
    ).toBeNull();
    expect(
      pick('desk', inputs({ notes: flagged, flags: { ...base, 'agreement-parts': { value: true, isLoading: false } } }))
    ).toBe('galley-parts@1');
  });

  it('drops an expired note', () => {
    expect(pick('desk', inputs({ notes: [note({ expiresAt: iso(NOW - 1) })] }))).toBeNull();
    expect(pick('desk', inputs({ notes: [note({ expiresAt: iso(NOW + DAY_MS) })] }))).toBe('galley-parts@1');
  });

  it('never returns a dismissed note', () => {
    const seen = { 'galley-parts@1': { n: 0, first: iso(NOW - DAY_MS), out: 'dismissed' as const } };
    expect(pick('desk', inputs({ state: state({ seen }) }))).toBeNull();
  });

  it('never returns an acted, retired or superseded note, nor one at maxDisplays closes', () => {
    for (const out of ['acted', 'retired_max', 'superseded'] as const) {
      expect(pick('desk', inputs({ state: state({ seen: { 'galley-parts@1': { n: 1, out } } }) }))).toBeNull();
    }
    expect(pick('desk', inputs({ state: state({ seen: { 'galley-parts@1': { n: 3, out: null } } }) }))).toBeNull();
    expect(pick('desk', inputs({ state: state({ seen: { 'galley-parts@1': { n: 2, out: null } } }) }))).toBe(
      'galley-parts@1'
    );
  });

  it('waits for a prerequisite to reach a terminal outcome', () => {
    const later = note({ prerequisite: 'first@1' });
    expect(pick('desk', inputs({ notes: [later] }))).toBeNull();
    expect(pick('desk', inputs({ notes: [later], state: state({ seen: { 'first@1': { n: 1, out: null } } }) }))).toBeNull();
    expect(pick('desk', inputs({ notes: [later], state: state({ seen: { 'first@1': { out: 'acted' } } }) }))).toBe(
      'galley-parts@1'
    );
  });

  it('teaches only releases after the cursor', () => {
    expect(pick('desk', inputs({ state: state({ cursor: { lastSeenReleaseId: GALLEY } }) }))).toBeNull();
    expect(pick('desk', inputs({ state: state({ cursor: { lastSeenReleaseId: null } }) }))).toBe('galley-parts@1');
  });

  it('teaches nothing on an unknown cursor and marks no write', () => {
    const s = Object.freeze(state({ cursor: { lastSeenReleaseId: '2099-01-01-newer-deploy' } }));
    const before = JSON.stringify(s);
    const x = inputs({ state: s, notes: [note(), note({ noteKey: 'print@1', releaseId: PRINT })] });
    expect(pick('desk', x)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
    expect(resolveCursor('2099-01-01-newer-deploy', MANIFEST)).toEqual({ index: MANIFEST.length - 1, unknown: true });
  });

  it('derives the first-load cursor from account creation before it is written', () => {
    const uninitialised = state({ cursor: undefined });
    const createdAfterGalley = (x: SelectInputs) => ({
      ...x,
      signals: { ...x.signals, createdAt: '2026-09-10T12:00:00Z' },
    });
    expect(pick('desk', createdAfterGalley(inputs({ state: uninitialised })))).toBeNull();
    const print = note({ noteKey: 'print@1', releaseId: PRINT });
    expect(pick('desk', createdAfterGalley(inputs({ state: uninitialised, notes: [print] })))).toBe('print@1');
  });

  it('never teaches a minor release', () => {
    expect(pick('desk', inputs({ notes: [note({ noteKey: 'tiny@1', releaseId: TINY })] }))).toBeNull();
  });

  it('teaches a release only when its copy is published (in releases)', () => {
    const unpublished = MANIFEST.filter((r) => r.id !== GALLEY);
    expect(pick('desk', inputs({ releases: unpublished }))).toBeNull();
  });

  it('keeps a cursor on an unpublished release as a known position', () => {
    const print = note({ noteKey: 'print@1', releaseId: PRINT });
    const x = inputs({
      notes: [print],
      releases: MANIFEST.filter((r) => r.id !== GALLEY),
      state: state({ cursor: { lastSeenReleaseId: GALLEY } }),
    });
    expect(pick('desk', x)).toBe('print@1');
  });

  it('fills the act slot only from workflow_changing releases', () => {
    const galleyAct = note({ noteKey: 'galley-act@1', trigger: 'act', surfaceKey: SURFACE });
    const printAct = note({ noteKey: 'print-act@1', trigger: 'act', surfaceKey: SURFACE, releaseId: PRINT });
    const ownerAct = note({ noteKey: 'owner-act@1', kind: 'owner_capability', trigger: 'act', surfaceKey: SURFACE, releaseId: undefined });
    expect(pick('act', inputs({ notes: [printAct, ownerAct] }))).toBeNull();
    expect(pick('act', inputs({ notes: [printAct, galleyAct] }))).toBe('galley-act@1');
  });

  it('lets the act slot ignore the visit ceiling, but a shown act note never returns', () => {
    const act = note({ noteKey: 'galley-act@1', trigger: 'act', surfaceKey: SURFACE });
    const ceilinged = state({
      visit: { ...state().visit, unsolicitedShown: 'other@1' },
      recentUnsolicited: [iso(NOW - DAY_MS), iso(NOW - 2 * DAY_MS)],
    });
    expect(pick('act', inputs({ notes: [act], state: ceilinged }))).toBe('galley-act@1');
    const shownOnce = state({ seen: { 'galley-act@1': { first: iso(NOW - DAY_MS), last: iso(NOW - DAY_MS) } } });
    expect(pick('act', inputs({ notes: [act], state: shownOnce }))).toBeNull();
  });

  it('never returns an already_knew release note, even when otherwise eligible', () => {
    const withSignal = note({ successSignal: 'po_drawn' });
    const knew = (lastAt: string | null) => {
      const x = inputs({ notes: [withSignal] });
      return { ...x, signals: { ...x.signals, lastAt: { po_drawn: lastAt } } };
    };
    expect(pick('desk', knew('2026-09-12T09:00:00Z'))).toBeNull();
    expect(pick('desk', knew('2026-09-01T09:00:00Z'))).toBe('galley-parts@1');
    expect(pick('desk', knew(null))).toBe('galley-parts@1');
  });

  it('teaches an unused benefit only in the anchor slot and only while unused', () => {
    const benefit = anchorNote({
      noteKey: 'hours-benefit@1',
      kind: 'unused_benefit',
      releaseId: undefined,
      featureKey: 'hours',
      flag: 'hours-note',
    });
    const oldAccount = (x: SelectInputs) => ({ ...x, signals: { ...x.signals, createdAt: '2026-06-01T00:00:00Z' } });
    const base = inputs({
      notes: [benefit],
      boundaries: firedHere,
      flags: { 'teaching-notes': { value: true, isLoading: false }, 'hours-note': { value: true, isLoading: false } },
    });
    expect(pick('anchor', oldAccount(base))).toBe('hours-benefit@1');
    expect(pick('anchor', { ...oldAccount(base), signals: used(oldAccount(base), 'hours') })).toBeNull();
    expect(pick('desk', oldAccount({ ...base, notes: [{ ...benefit, trigger: 'return' }] }))).toBeNull();
  });

  it('teaches a faster way only after use plus its named boundary', () => {
    const faster = anchorNote({
      noteKey: 'invoice-faster@1',
      kind: 'faster_way',
      releaseId: undefined,
      featureKey: 'ledger',
      flag: 'faster',
    });
    const flags = { 'teaching-notes': { value: true, isLoading: false }, faster: { value: true, isLoading: false } };
    const base = inputs({ notes: [faster], boundaries: firedHere, flags });
    expect(pick('anchor', base)).toBeNull();
    expect(pick('anchor', { ...base, signals: used(base, 'ledger') })).toBe('invoice-faster@1');
    expect(pick('anchor', { ...base, signals: used(base, 'ledger'), boundaries: log() })).toBeNull();
  });

  it('shows an anchor note only after its boundary fired on this surface after mount', () => {
    const x = inputs({ notes: [anchorNote()] });
    expect(pick('anchor', x)).toBeNull();
    expect(
      pick('anchor', { ...x, boundaries: log([{ surface: OTHER_SURFACE, boundary: 'invoice_sent', at: NOW - 1000 }]) })
    ).toBeNull();
    expect(
      pick('anchor', { ...x, boundaries: log([{ surface: SURFACE, boundary: 'invoice_sent', at: MOUNTED - 1 }]) })
    ).toBeNull();
    expect(pick('anchor', { ...x, boundaries: firedHere })).toBe('print-anchor@1');
  });

  it('drops a note whose bindings cannot resolve, rather than printing a hole', () => {
    const bound = note({ body: 'Parts on {project} now draw POs.', bindings: { project: 'projectName' } });
    expect(pick('desk', inputs({ notes: [bound] }))).toBeNull();
    expect(pick('desk', inputs({ notes: [bound], bindings: { projectName: 'Sonnenberg' } }))).toBe('galley-parts@1');
    const undeclared = note({ body: 'Parts on {project} now draw POs.' });
    expect(pick('desk', inputs({ notes: [undeclared], bindings: { projectName: 'Sonnenberg' } }))).toBeNull();
  });

  it('holds every note in the first hour of an account', () => {
    const x = inputs({ state: state({ cursor: { lastSeenReleaseId: null } }) });
    expect(pick('desk', { ...x, signals: { ...x.signals, createdAt: iso(NOW - 30 * 60_000) } })).toBeNull();
  });

  it('keeps the first week clear of faster ways and of invoicing, Hours and seats', () => {
    const young = (x: SelectInputs) => ({ ...x, signals: { ...x.signals, createdAt: iso(NOW - 3 * DAY_MS) } });
    const galley = inputs({ state: state({ cursor: { lastSeenReleaseId: null } }) });
    expect(pick('desk', young(galley))).toBe('galley-parts@1');
    const print = inputs({
      notes: [note({ noteKey: 'print@1', releaseId: PRINT })],
      state: state({ cursor: { lastSeenReleaseId: null } }),
    });
    expect(pick('desk', young(print))).toBeNull();
    expect(pick('desk', print)).toBe('print@1');
    const faster = note({
      noteKey: 'people-faster@1',
      kind: 'faster_way',
      releaseId: undefined,
      featureKey: 'people',
      boundary: 'invite_sent',
      flag: 'faster',
    });
    const fx = inputs({
      notes: [faster],
      flags: { 'teaching-notes': { value: true, isLoading: false }, faster: { value: true, isLoading: false } },
    });
    const ready = {
      ...fx,
      signals: { ...used(fx, 'people'), lastAt: { invite_sent: iso(NOW - DAY_MS) } },
    };
    expect(pick('desk', ready)).toBe('people-faster@1');
    expect(pick('desk', young(ready))).toBeNull();
  });

  it('teaches an owner capability only once she has invited a hand', () => {
    const owner = note({
      noteKey: 'seats@1',
      kind: 'owner_capability',
      audience: 'owner',
      releaseId: undefined,
      featureKey: 'seats',
      flag: 'seats-note',
    });
    const x = inputs({
      notes: [owner],
      flags: { 'teaching-notes': { value: true, isLoading: false }, 'seats-note': { value: true, isLoading: false } },
    });
    expect(pick('desk', x)).toBeNull();
    expect(pick('desk', { ...x, signals: used(x, 'seats') })).toBe('seats@1');
  });

  it('defers a Desk note to an anchor twin on a surface she has used', () => {
    const desk = note({ noteKey: 'print@1', releaseId: PRINT });
    const x = inputs({ notes: [desk, anchorNote()] });
    expect(pick('desk', x)).toBe('print@1');
    expect(pick('desk', { ...x, signals: used(x, 'ledger') })).toBeNull();
  });
});

// ─── Exported rules ──────────────────────────────────────────────────────────

describe('alreadyKnew and fasterWayReady', () => {
  it('measures a release against its ship date and any other note against publishedAt', () => {
    const x = inputs();
    const at = (lastAt: string) => ({ ...x, signals: { ...x.signals, lastAt: { sig: lastAt } } });
    expect(alreadyKnew(note({ successSignal: 'sig' }), at('2026-09-10T10:00:00Z'))).toBe(true);
    expect(alreadyKnew(note({ successSignal: 'sig' }), at('2026-09-09T10:00:00Z'))).toBe(false);
    const other = note({ kind: 'client_promise', releaseId: undefined, successSignal: 'sig', publishedAt: '2026-09-20T00:00:00Z' });
    expect(alreadyKnew(other, at('2026-09-21T00:00:00Z'))).toBe(true);
    expect(alreadyKnew(other, at('2026-09-19T00:00:00Z'))).toBe(false);
    expect(alreadyKnew(note(), at('2026-09-21T00:00:00Z'))).toBe(false);
  });

  it('readies a faster way on the Desk when its boundary happened last visit', () => {
    const faster = note({ kind: 'faster_way', releaseId: undefined, featureKey: 'hours', boundary: 'time_logged' });
    const x = inputs();
    const withLast = (lastAt: string) => ({ ...x, signals: { ...used(x, 'hours'), lastAt: { time_logged: lastAt } } });
    expect(fasterWayReady(faster, 'desk', SURFACE, withLast(iso(NOW - DAY_MS)))).toBe(true);
    expect(fasterWayReady(faster, 'desk', SURFACE, withLast(iso(NOW - 10 * DAY_MS)))).toBe(false);
    const unused = { ...x, signals: { ...x.signals, lastAt: { time_logged: iso(NOW - DAY_MS) } } };
    expect(fasterWayReady(faster, 'desk', SURFACE, unused)).toBe(false);
  });
});

describe('byRank', () => {
  it('orders pinned-project-bound → never seen → oldest last-seen → priority desc → manifest → input order', () => {
    const seenAt = (key: string, daysAgo: number) => ({ [key]: { n: 1, last: iso(NOW - daysAgo * DAY_MS) } });
    const bound = note({ noteKey: 'bound', body: 'On {p}.', bindings: { p: 'projectName' }, priority: 1 });
    const fresh = note({ noteKey: 'fresh', priority: 1 });
    const oldSeen = note({ noteKey: 'old-seen', priority: 1 });
    const newSeen = note({ noteKey: 'new-seen', priority: 5 });
    const x = inputs({
      notes: [newSeen, oldSeen, fresh, bound],
      pinnedProjectIds: ['proj-1'],
      state: state({ seen: { ...seenAt('bound', 1), ...seenAt('old-seen', 9), ...seenAt('new-seen', 2) } }),
    });
    expect([...x.notes].sort(byRank(x)).map((n) => n.noteKey)).toEqual(['bound', 'fresh', 'old-seen', 'new-seen']);
    expect([...x.notes].sort(byRank({ ...x, pinnedProjectIds: [] }))[0].noteKey).toBe('fresh');

    const hi = note({ noteKey: 'hi', priority: 5 });
    const lo = note({ noteKey: 'lo', priority: 1 });
    const olderRelease = note({ noteKey: 'older', releaseId: OLD, priority: 1 });
    const createdFirst = note({ noteKey: 'created-first', kind: 'client_promise', releaseId: undefined, priority: 1 });
    const createdSecond = note({ noteKey: 'created-second', kind: 'client_promise', releaseId: undefined, priority: 1 });
    const y = inputs({ notes: [createdFirst, createdSecond, lo, olderRelease, hi] });
    expect([...y.notes].sort(byRank(y)).map((n) => n.noteKey)).toEqual([
      'hi',
      'older',
      'lo',
      'created-first',
      'created-second',
    ]);
  });
});

describe('resolveBindings', () => {
  it('fills body, act label and an encoded href', () => {
    const n = note({
      body: 'Print {num} for {client}.',
      act: { label: 'Print {num}', hrefTemplate: '/invoices/{id}/print?c={client}' },
      bindings: { num: 'invoiceNumber', id: 'invoiceId', client: 'personName' },
    });
    expect(resolveBindings(n, { invoiceNumber: 'INV-0002', invoiceId: 'abc', personName: 'Paul & Ann' })).toEqual({
      body: 'Print INV-0002 for Paul & Ann.',
      act: { label: 'Print INV-0002', href: '/invoices/abc/print?c=Paul%20%26%20Ann' },
    });
    expect(resolveBindings(n, { invoiceNumber: 'INV-0002', invoiceId: ' ', personName: 'Paul' })).toBeNull();
    expect(resolveBindings(note(), {})).toEqual({ body: note().body, act: null });
  });
});

describe('labelFor', () => {
  it('dates a release note by its RELEASE, not its publish date', () => {
    const n = note({ releaseId: PRINT, publishedAt: '2026-09-20T00:00:00Z' });
    expect(labelFor(n, MANIFEST)).toBe(`${TEACHING_LABEL_WORD} · 11 SEP`);
    expect(labelFor(note({ releaseId: OLD }), MANIFEST)).toBe('WORKSHOP NOTE · 1 AUG');
  });

  it('prints the word alone for other notes and unknown releases', () => {
    expect(labelFor(note({ kind: 'client_promise', releaseId: undefined }), MANIFEST)).toBe('WORKSHOP NOTE');
    expect(labelFor(note({ releaseId: 'nope' }), MANIFEST)).toBe('WORKSHOP NOTE');
  });
});

describe('nextStateAfterClose', () => {
  it('counts the close and the ignore streak without mutating the input', () => {
    const s = Object.freeze(state({ seen: { k: { n: 1, first: iso(NOW - DAY_MS) } } }));
    const next = nextStateAfterClose(s, 'k', NOW);
    expect(next.seen?.k).toEqual({ n: 2, first: iso(NOW - DAY_MS) });
    expect(next.ignoredStreak).toBe(1);
    expect(s.seen?.k.n).toBe(1);
  });

  it('retires the note at maxDisplays', () => {
    expect(nextStateAfterClose(state({ seen: { k: { n: 2 } } }), 'k', NOW).seen?.k.out).toBe('retired_max');
    expect(nextStateAfterClose(state({ seen: { k: { n: 0 } } }), 'k', NOW, 1).seen?.k.out).toBe('retired_max');
    expect(nextStateAfterClose(state({ seen: { k: { n: 2, out: 'dismissed' } } }), 'k', NOW).seen?.k.out).toBe('dismissed');
  });

  it('goes quiet for 30 days at a streak of three, then resets the streak', () => {
    const next = nextStateAfterClose(state({ ignoredStreak: 2 }), 'k', NOW);
    expect(next.ignoredStreak).toBe(0);
    expect(next.quiet).toEqual({ off: false, until: iso(NOW + 30 * DAY_MS) });
  });
});

describe('isNewVisit', () => {
  it('starts a visit after 30 minutes away, or when nothing is recorded', () => {
    expect(isNewVisit(state({ visit: { lastActiveAt: iso(NOW - 29 * 60_000) } }), NOW)).toBe(false);
    expect(isNewVisit(state({ visit: { lastActiveAt: iso(NOW - 30 * 60_000) } }), NOW)).toBe(true);
    expect(isNewVisit(state({ visit: undefined }), NOW)).toBe(true);
  });
});

describe('sinceLineFor', () => {
  it('is null unless the previous visit started 30 or more days ago', () => {
    expect(sinceLineFor(state(), MANIFEST, [], NOW)).toBeNull();
    expect(sinceLineFor(state({ visit: {} }), MANIFEST, [], NOW)).toBeNull();
  });

  it('lists at most three non-minor releases since then, workflow-changing first, then newest', () => {
    const many: TeachingRelease[] = [
      ...MANIFEST,
      { id: '2026-09-13-a', shippedOn: '2026-09-13', sizeClass: 'useful', featureKeys: ['hours'] },
      { id: '2026-09-14-b', shippedOn: '2026-09-14', sizeClass: 'useful', featureKeys: ['hours'] },
    ];
    const away = state({ visit: { prevStartedAt: '2026-08-14T09:10:00Z' } });
    expect(sinceLineFor(away, many, ['proj-1'], NOW)).toEqual({
      items: [many[1], many[5], many[4]],
      changesHref: '/help/changes',
    });
  });
});
