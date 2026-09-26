import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getCurrentTeachingSurface, record, resetTeachingBoundaries } from '@/lib/teaching/boundaries';
import type { TeachingNote, TeachingNoteState } from '@/lib/teaching/types';
import { resetTeachingNoteSession, useReturnNote, useTeachingNoteFor } from './use-teaching-note';

const STATE_KEY = ['teaching-note-state'];
const DESK = 'designer-portal/document/desk';
const NOW = Date.parse('2026-09-25T15:00:00Z');
const MIN = 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

let mockNotes: TeachingNote[] | undefined;
let mockReleases: unknown[] | undefined;
let mockState: TeachingNoteState | undefined;
let mockSignals: unknown;
let mockFlags: Record<string, { value: boolean; isLoading: boolean }>;
let mockAtRest: boolean;
let client: QueryClient;

function setIn(target: unknown, path: string[], value: unknown): unknown {
  const [head, ...rest] = path;
  const base = (target && typeof target === 'object' ? target : {}) as Record<string, unknown>;
  return { ...base, [head]: rest.length ? setIn(base[head], rest, value) : value };
}

const mockPatch = jest.fn(async (path: string[], value: unknown) => {
  const next = setIn(client.getQueryData(STATE_KEY), path, value);
  client.setQueryData(STATE_KEY, next);
  return next;
});

jest.mock('./use-teaching-data', () => ({
  TEACHING_NOTE_STATE_KEY: ['teaching-note-state'],
  useTeachingNotes: () => ({ data: mockNotes }),
  useTeachingReleases: () => ({ data: mockReleases }),
  useTeachingNoteState: () => ({ state: mockState, patch: mockPatch, isLoading: !mockState }),
  useTeachingSignals: () => ({ data: mockSignals }),
}));
jest.mock('./use-feature-flags', () => ({ useFeatureFlags: () => mockFlags }));
jest.mock('./use-teaching-at-rest', () => ({ useTeachingAtRest: () => mockAtRest }));
jest.mock('@patina/supabase', () => ({
  useProjects: () => ({ data: [{ id: 'p1', name: 'Olsen lake house' }], isLoading: false }),
}));
const mockCapture = jest.fn();
jest.mock('@/lib/analytics/teaching-events', () => ({
  captureTeachingEvent: (...args: unknown[]) => mockCapture(...args),
}));

const RELEASE_NOTE: TeachingNote = {
  noteKey: 'galley-parts@1',
  kind: 'release',
  audience: 'all',
  trigger: 'return',
  surfaceKey: DESK,
  releaseId: '2026-09-10-galley-parts',
  body: 'A signed part now draws its PO.',
  priority: 5,
  recedeOn: ['document:galley-opened'],
  maxDisplays: 3,
  provenance: 'agent',
};

const OWNER_NOTE: TeachingNote = {
  noteKey: 'hand-hours@1',
  kind: 'owner_capability',
  audience: 'owner',
  trigger: 'return',
  surfaceKey: DESK,
  featureKey: 'seats',
  body: 'Your hand can log hours against a job.',
  priority: 1,
  recedeOn: [],
  maxDisplays: 3,
  provenance: 'agent',
};

const ANCHOR_NOTE: TeachingNote = {
  noteKey: 'ledger-delivery@1',
  kind: 'faster_way',
  audience: 'all',
  trigger: 'anchor',
  surfaceKey: 'designer-portal/document/accounts',
  anchor: 'invoice-sent',
  featureKey: 'ledger',
  boundary: 'invoice_sent',
  body: 'The delivery row shows when {invoiceNumber} was read.',
  bindings: { invoiceNumber: 'invoiceNumber' },
  priority: 3,
  recedeOn: [],
  maxDisplays: 3,
  provenance: 'agent',
};

/** A returning designer: last Desk load 10 minutes ago, visit under way. */
function state(over: Partial<TeachingNoteState> = {}): TeachingNoteState {
  return {
    v: 1,
    cursor: { lastSeenReleaseId: null },
    visit: { startedAt: iso(NOW - 20 * MIN), lastActiveAt: iso(NOW - 10 * MIN) },
    ...over,
  };
}

function prime(s: TeachingNoteState | undefined) {
  mockState = s;
  if (s) client.setQueryData(STATE_KEY, s);
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

type DeskProps = { ready?: boolean; taken?: boolean; onScreen?: 'teaching-note' | 'setup-whisper' | null };
const renderDesk = (initial: DeskProps = {}) =>
  renderHook((props: DeskProps) => useReturnNote({ pinnedProjectIds: [], ...props }), {
    wrapper,
    initialProps: initial,
  });

const DAY = 24 * 60 * MIN;
const RELEASES = [
  { id: '2026-09-10-galley-parts', shippedOn: '2026-09-10', sizeClass: 'workflow_changing', featureKeys: ['galley'], headline: 'Parts draw POs' },
];
const SIGNALS = { role: 'owner', used: {}, lastAt: {}, createdAt: '2026-08-01T00:00:00Z' };
/** Back after 40 days: the since-line's return. */
const AWAY = () => state({ visit: { startedAt: iso(NOW - 40 * DAY), lastActiveAt: iso(NOW - 39 * DAY) } });

const patched = (path: string[]) => mockPatch.mock.calls.filter(([p]) => p.join('.') === path.join('.'));
const captured = (name: string) => mockCapture.mock.calls.filter(([n]) => n === name);

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  resetTeachingNoteSession();
  resetTeachingBoundaries();
  mockPatch.mockClear();
  mockCapture.mockClear();
  client = new QueryClient();
  mockNotes = [RELEASE_NOTE];
  mockReleases = RELEASES;
  mockSignals = SIGNALS;
  mockFlags = { 'teaching-notes': { value: true, isLoading: false } };
  mockAtRest = true;
  prime(state({ visit: { startedAt: iso(NOW - 3 * 60 * MIN), lastActiveAt: iso(NOW - 2 * 60 * MIN) } }));
});

afterEach(async () => {
  // Unmount now and let each mount's close land inside its own test.
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  jest.restoreAllMocks();
});

describe('useReturnNote', () => {
  it('resolves the Desk note from cache and binds it for <MarginNote>', () => {
    const { result } = renderDesk();
    expect(result.current.note).toMatchObject({
      noteKey: 'galley-parts@1',
      body: 'A signed part now draws its PO.',
      label: 'WORKSHOP NOTE · 10 SEP',
      act: null,
    });
    expect(result.current.bind).toEqual({
      noteKey: 'galley-parts@1',
      seen: false,
      actionEvents: ['document:galley-opened'],
      label: 'WORKSHOP NOTE · 10 SEP',
      act: undefined,
      placement: 'default',
      captureEvents: false,
      onSeen: expect.any(Function),
    });
  });

  it('flag off: no note, and nothing is written or captured', async () => {
    mockFlags = { 'teaching-notes': { value: false, isLoading: false } };
    const { result } = renderDesk();
    expect(result.current.note).toBeNull();
    expect(result.current.bind).toBeNull();
    await act(async () => {});
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('a read still loading at first paint: undecided and nothing written, then it decides when the read arrives', async () => {
    prime(undefined);
    const { result, rerender } = renderDesk();
    expect(result.current.decided).toBe(false);
    expect(result.current.note).toBeNull();
    await act(async () => {});
    expect(mockPatch).not.toHaveBeenCalled();

    // The state arrives after first paint: the same Desk load decides now.
    prime(state({ visit: { startedAt: iso(NOW - 3 * 60 * MIN), lastActiveAt: iso(NOW - 2 * 60 * MIN) } }));
    rerender({});
    expect(result.current.decided).toBe(true);
    expect(result.current.note?.noteKey).toBe('galley-parts@1');
    await waitFor(() => expect(patched(['visit', 'startedAt'])).toEqual([[['visit', 'startedAt'], iso(NOW)]]));
  });

  it('a cold cache on a return after 30 days: the since-line still renders once the reads arrive', async () => {
    mockNotes = undefined;
    mockReleases = undefined;
    mockSignals = undefined;
    prime(undefined);
    const { result, rerender } = renderDesk();
    expect(result.current.decided).toBe(false);
    expect(result.current.sinceLine).toBeNull();
    await act(async () => {});
    // Nothing written while loading, so prevStartedAt has not rolled forward.
    expect(mockPatch).not.toHaveBeenCalled();

    mockNotes = [RELEASE_NOTE];
    mockReleases = RELEASES;
    mockSignals = SIGNALS;
    prime(AWAY());
    rerender({});
    expect(result.current.sinceLine).toEqual({
      items: [{ id: '2026-09-10-galley-parts', headline: 'Parts draw POs' }],
      changesHref: '/help/changes',
    });
    await waitFor(() =>
      expect(patched(['visit', 'prevStartedAt'])).toEqual([[['visit', 'prevStartedAt'], iso(NOW - 40 * DAY)]])
    );
  });

  it('a flag still loading counts as off: no note and nothing written, even once it resolves', async () => {
    mockFlags = { 'teaching-notes': { value: false, isLoading: true } };
    const { result, rerender } = renderDesk();
    expect(result.current.note).toBeNull();
    await act(async () => {});
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();

    // This Desk load was decided without teaching: it stays unrecorded, so the
    // visit (and a since-line it might start) waits for the next load.
    mockFlags = { 'teaching-notes': { value: true, isLoading: false } };
    rerender({});
    await act(async () => {});
    expect(result.current.note).toBeNull();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('waits for `ready`, then decides once', () => {
    const { result, rerender } = renderDesk({ ready: false });
    expect(result.current.note).toBeNull();
    expect(result.current.decided).toBe(false);
    rerender({ ready: true });
    expect(result.current.decided).toBe(true);
    expect(result.current.note?.noteKey).toBe('galley-parts@1');
  });

  it('initialises the cursor once, from the first-load value', async () => {
    prime(state({ cursor: undefined, visit: undefined }));
    const { unmount } = renderDesk();
    await waitFor(() => expect(patched(['cursor'])).toEqual([[['cursor'], { lastSeenReleaseId: null }]]));
    unmount();
    renderDesk();
    await act(async () => {});
    expect(patched(['cursor'])).toHaveLength(1);
  });

  it('writes a new visit leaf by leaf, never a whole visit, and only lastActiveAt inside a visit', async () => {
    mockNotes = [];
    const started = iso(NOW - 3 * 60 * MIN);
    prime(state({ visit: { startedAt: started, lastActiveAt: iso(NOW - 2 * 60 * MIN), unsolicitedShown: 'old@1' } }));
    renderDesk();
    await waitFor(() => expect(patched(['visit', 'startedAt'])).toHaveLength(1));
    expect(mockPatch.mock.calls).toEqual([
      [['v'], 1],
      [['visit', 'prevStartedAt'], started],
      [['visit', 'unsolicitedShown'], ''],
      [['visit', 'lastActiveAt'], iso(NOW)],
      [['visit', 'startedAt'], iso(NOW)],
    ]);

    mockPatch.mockClear();
    resetTeachingNoteSession();
    prime(state({ visit: { startedAt: iso(NOW - 20 * MIN), lastActiveAt: iso(NOW - 10 * MIN), unsolicitedShown: 'x@1' } }));
    renderDesk();
    await waitFor(() => expect(patched(['visit', 'lastActiveAt'])).toEqual([[['visit', 'lastActiveAt'], iso(NOW)]]));
    expect(mockPatch.mock.calls).toEqual([[['visit', 'lastActiveAt'], iso(NOW)]]);
  });

  it('a stale tab confirms a new visit against the stored row: it never restarts, or clears, a visit another tab is in', async () => {
    mockNotes = [];
    // Its cache last saw a Desk load two hours ago; since then another tab
    // has been in a visit and showed that visit's note.
    const stored = state({
      visit: {
        startedAt: iso(NOW - 20 * MIN),
        prevStartedAt: iso(NOW - 3 * 60 * MIN),
        lastActiveAt: iso(NOW - 5 * MIN),
        unsolicitedShown: 'other@1',
      },
    });
    mockPatch.mockImplementationOnce(async (path: string[], value: unknown) => {
      const next = setIn(stored, path, value);
      client.setQueryData(STATE_KEY, next);
      return next;
    });
    renderDesk();
    await waitFor(() => expect(patched(['visit', 'lastActiveAt'])).toEqual([[['visit', 'lastActiveAt'], iso(NOW)]]));
    expect(mockPatch.mock.calls).toEqual([
      [['v'], 1],
      [['visit', 'lastActiveAt'], iso(NOW)],
    ]);
    expect(client.getQueryData<TeachingNoteState>(STATE_KEY)?.visit?.unsolicitedShown).toBe('other@1');
  });

  it('a new visit clears the last visit’s note, so the Desk may teach again', () => {
    prime(state({ visit: { startedAt: iso(NOW - 3 * 60 * MIN), lastActiveAt: iso(NOW - 2 * 60 * MIN), unsolicitedShown: 'old@1' } }));
    const { result } = renderDesk();
    expect(result.current.note?.noteKey).toBe('galley-parts@1');
  });

  it('one per visit: displaying writes unsolicitedShown + recentUnsolicited, and the visit’s next load shows none', async () => {
    const { unmount } = renderDesk();
    await waitFor(() => expect(patched(['visit', 'unsolicitedShown'])).toEqual([[['visit', 'unsolicitedShown'], 'galley-parts@1']]));
    expect(patched(['recentUnsolicited'])).toEqual([[['recentUnsolicited'], [iso(NOW)]]]);
    expect(patched(['seen', 'galley-parts@1', 'first'])).toHaveLength(1);
    expect(patched(['seen', 'galley-parts@1', 'last'])).toHaveLength(1);
    expect(captured('help.teaching_note.shown')).toHaveLength(1);
    unmount();

    // Ten minutes later the Desk loads again, inside the same visit.
    await waitFor(() => expect(patched(['seen', 'galley-parts@1', 'n'])).toHaveLength(1));
    prime(client.getQueryData<TeachingNoteState>(STATE_KEY));
    const again = renderDesk();
    expect(again.result.current.note).toBeNull();
  });

  it('owner capability outranks a release on the Desk', () => {
    mockNotes = [RELEASE_NOTE, OWNER_NOTE];
    mockSignals = { role: 'owner', used: { seats: true }, lastAt: {}, createdAt: '2026-08-01T00:00:00Z' };
    const { result } = renderDesk();
    expect(result.current.note?.noteKey).toBe('hand-hours@1');
  });

  it('taken: selects nothing but still records the Desk load', async () => {
    const { result } = renderDesk({ taken: true });
    expect(result.current.note).toBeNull();
    await waitFor(() => expect(patched(['visit', 'startedAt'])).toHaveLength(1));
    expect(captured('help.teaching_note.shown')).toHaveLength(0);
  });

  it('onSeen("dismissed") writes out: dismissed, resets the streak, and captures dismissed', async () => {
    prime(state({ visit: undefined, ignoredStreak: 2 }));
    const { result } = renderDesk();
    act(() => result.current.bind!.onSeen('dismissed'));
    await waitFor(() => expect(patched(['seen', 'galley-parts@1', 'out'])).toEqual([[['seen', 'galley-parts@1', 'out'], 'dismissed']]));
    await waitFor(() => expect(patched(['ignoredStreak'])).toEqual([[['ignoredStreak'], 0]]));
    expect(captured('help.teaching_note.dismissed')).toHaveLength(1);
  });

  it('onSeen("acted") writes out: acted and captures acted; unmounting after is not a close', async () => {
    prime(state({ visit: undefined }));
    const { result, unmount } = renderDesk();
    act(() => result.current.bind!.onSeen('acted'));
    await waitFor(() => expect(patched(['seen', 'galley-parts@1', 'out'])).toEqual([[['seen', 'galley-parts@1', 'out'], 'acted']]));
    expect(captured('help.teaching_note.acted')).toHaveLength(1);
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(patched(['seen', 'galley-parts@1', 'n'])).toHaveLength(0);
    expect(captured('help.teaching_note.receded')).toHaveLength(0);
  });

  it('a show that ends without × or the act is a close: n + 1, streak + 1, receded', async () => {
    prime(state({ visit: undefined }));
    const { unmount } = renderDesk();
    unmount();
    await waitFor(() => expect(patched(['seen', 'galley-parts@1', 'n'])).toEqual([[['seen', 'galley-parts@1', 'n'], 1]]));
    await waitFor(() => expect(patched(['ignoredStreak'])).toEqual([[['ignoredStreak'], 1]]));
    expect(patched(['seen', 'galley-parts@1', 'out'])).toHaveLength(0);
    expect(captured('help.teaching_note.receded')[0][1]).toMatchObject({ note_key: 'galley-parts@1', reason: 'closed' });
  });

  it('onSeen("closed") at maxDisplays retires the note', async () => {
    prime(state({ visit: undefined, seen: { 'galley-parts@1': { n: 2, first: iso(NOW - 9 * 24 * 60 * MIN) } } }));
    const { result } = renderDesk();
    act(() => result.current.bind!.onSeen('closed'));
    await waitFor(() => expect(patched(['seen', 'galley-parts@1', 'out'])).toEqual([[['seen', 'galley-parts@1', 'out'], 'retired_max']]));
    expect(patched(['seen', 'galley-parts@1', 'n'])).toEqual([[['seen', 'galley-parts@1', 'n'], 3]]);
    expect(captured('help.teaching_note.receded')[0][1]).toMatchObject({ reason: 'retired_max' });
  });

  it('already_knew is stored once as seen.<key>.out with its one event; a later session reads it and reports nothing', async () => {
    mockSignals = { ...SIGNALS, lastAt: { po_drawn: '2026-09-20T00:00:00Z' } };
    mockNotes = [{ ...RELEASE_NOTE, successSignal: 'po_drawn' }];
    const { result, unmount } = renderDesk();
    expect(result.current.note).toBeNull();
    await waitFor(() =>
      expect(patched(['seen', 'galley-parts@1', 'out'])).toEqual([[['seen', 'galley-parts@1', 'out'], 'already_knew']])
    );
    expect(captured('help.teaching_note.already_knew')).toHaveLength(1);
    unmount();

    // A reload: the session memory is gone, the stored out is not.
    resetTeachingNoteSession();
    prime(client.getQueryData<TeachingNoteState>(STATE_KEY));
    const again = renderDesk();
    await act(async () => {});
    expect(again.result.current.note).toBeNull();
    expect(patched(['seen', 'galley-parts@1', 'out'])).toHaveLength(1);
    expect(captured('help.teaching_note.already_knew')).toHaveLength(1);
  });

  it('a success signal after the note was shown is not already_knew', async () => {
    mockSignals = { ...SIGNALS, lastAt: { po_drawn: '2026-09-20T00:00:00Z' } };
    mockNotes = [{ ...RELEASE_NOTE, successSignal: 'po_drawn' }];
    prime(state({ seen: { 'galley-parts@1': { n: 1, first: '2026-09-15T00:00:00Z' } } }));
    renderDesk();
    await waitFor(() => expect(patched(['visit', 'lastActiveAt'])).toHaveLength(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(patched(['seen', 'galley-parts@1', 'out'])).toHaveLength(0);
    expect(captured('help.teaching_note.already_knew')).toHaveLength(0);
  });

  it('returns the since-line after 30 days away', () => {
    prime(state({ visit: { startedAt: iso(NOW - 40 * 24 * 60 * MIN), lastActiveAt: iso(NOW - 39 * 24 * 60 * MIN) } }));
    const { result } = renderDesk();
    expect(result.current.sinceLine).toEqual({
      items: [{ id: '2026-09-10-galley-parts', headline: 'Parts draw POs' }],
      changesHref: '/help/changes',
    });
  });

  it('the since-line is the visit’s one unsolicited note: no teaching note is chosen beside it', async () => {
    prime(state({ visit: { startedAt: iso(NOW - 40 * 24 * 60 * MIN), lastActiveAt: iso(NOW - 39 * 24 * 60 * MIN) } }));
    const { result } = renderDesk();
    expect(result.current.sinceLine).not.toBeNull();
    expect(result.current.note).toBeNull();
    expect(result.current.bind).toBeNull();
    await act(async () => {});
    expect(patched(['visit', 'unsolicitedShown'])).toHaveLength(0);
    expect(captured('help.teaching_note.shown')).toHaveLength(0);
  });

  it('declares the Desk as the current teaching surface on mount', () => {
    expect(getCurrentTeachingSurface()).toBe('unknown');
    renderDesk();
    expect(getCurrentTeachingSurface()).toBe(DESK);
  });
});

describe('useTeachingNoteFor', () => {
  const ACCOUNTS = 'designer-portal/document/accounts';

  beforeEach(() => {
    mockNotes = [ANCHOR_NOTE];
    mockSignals = { role: 'owner', used: { ledger: true }, lastAt: {}, createdAt: '2026-08-01T00:00:00Z' };
    prime(state({ visit: { startedAt: iso(NOW - 20 * MIN), lastActiveAt: iso(NOW - 10 * MIN) } }));
  });

  const renderAnchor = (fired: boolean) =>
    renderHook(
      () =>
        useTeachingNoteFor(ACCOUNTS, {
          slot: 'anchor',
          host: null,
          anchor: 'invoice-sent',
          bindings: { invoiceNumber: 'INV-0002' },
          boundaries: { firedOn: () => fired },
        }),
      { wrapper }
    );

  it('shows nothing on mount, before the surface is at rest', () => {
    mockAtRest = false;
    const { result } = renderAnchor(true);
    expect(result.current.note).toBeNull();
  });

  it('shows nothing until its boundary fires', () => {
    const { result } = renderAnchor(false);
    expect(result.current.note).toBeNull();
  });

  it('at rest after the boundary: an anchor-placed note, and it stays once shown', async () => {
    const { result, rerender } = renderAnchor(true);
    expect(result.current.note?.body).toBe('The delivery row shows when INV-0002 was read.');
    expect(result.current.bind).toMatchObject({ placement: 'anchor', captureEvents: false, label: 'WORKSHOP NOTE' });

    mockAtRest = false;
    rerender();
    expect(result.current.note?.noteKey).toBe('ledger-delivery@1');
    await waitFor(() => expect(patched(['visit', 'unsolicitedShown'])).toHaveLength(1));
  });

  it('by default reads the real tagged-boundary log: only a firing on this surface counts', () => {
    const { result, rerender } = renderHook(
      () =>
        useTeachingNoteFor(ACCOUNTS, {
          slot: 'anchor',
          host: null,
          anchor: 'invoice-sent',
          bindings: { invoiceNumber: 'INV-0002' },
        }),
      { wrapper }
    );
    expect(result.current.note).toBeNull();

    record({ boundaryKey: 'invoice_sent', at: NOW, surfaceKey: 'designer-portal/document/hours' });
    rerender();
    expect(result.current.note).toBeNull();

    record({ boundaryKey: 'invoice_sent', at: NOW, surfaceKey: ACCOUNTS });
    rerender();
    expect(result.current.note?.body).toBe('The delivery row shows when INV-0002 was read.');
  });
});

describe('one unsolicited line per visit, in the stored visit', () => {
  const reload = () => {
    cleanup();
    resetTeachingNoteSession();
    prime(client.getQueryData<TeachingNoteState>(STATE_KEY));
  };

  it('the since-line on screen claims the visit and the 7-day cap, so an anchor note in the same visit stays away', async () => {
    mockNotes = [RELEASE_NOTE, ANCHOR_NOTE];
    mockSignals = { ...SIGNALS, used: { ledger: true } };
    prime(AWAY());
    const { result } = renderDesk({ onScreen: 'teaching-note' });
    expect(result.current.sinceLine).not.toBeNull();
    await waitFor(() => expect(patched(['visit', 'unsolicitedShown'])).toEqual([[['visit', 'unsolicitedShown'], 'since-line']]));
    expect(patched(['recentUnsolicited'])).toEqual([[['recentUnsolicited'], [iso(NOW)]]]);

    prime(client.getQueryData<TeachingNoteState>(STATE_KEY));
    const anchor = renderHook(
      () =>
        useTeachingNoteFor('designer-portal/document/accounts', {
          slot: 'anchor',
          host: null,
          anchor: 'invoice-sent',
          bindings: { invoiceNumber: 'INV-0002' },
          boundaries: { firedOn: () => true },
        }),
      { wrapper }
    );
    expect(anchor.result.current.note).toBeNull();
  });

  it('a reload after the since-line shows the same line, and claims nothing twice', async () => {
    prime(AWAY());
    renderDesk({ onScreen: 'teaching-note' });
    await waitFor(() => expect(patched(['recentUnsolicited'])).toHaveLength(1));

    reload();
    const { result } = renderDesk({ onScreen: 'teaching-note' });
    expect(result.current.sinceLine).not.toBeNull();
    expect(result.current.note).toBeNull();
    await waitFor(() => expect(patched(['visit', 'lastActiveAt'])).toHaveLength(2));
    expect(patched(['visit', 'unsolicitedShown'])).toHaveLength(1);
    expect(patched(['recentUnsolicited'])).toHaveLength(1);
  });

  it('a reload mid-visit after a teaching note: no since-line and no second note', async () => {
    // A 40-day return whose visit already showed its note, ten minutes ago.
    prime(
      state({
        visit: {
          startedAt: iso(NOW - 10 * MIN),
          prevStartedAt: iso(NOW - 40 * DAY),
          lastActiveAt: iso(NOW - 5 * MIN),
          unsolicitedShown: 'galley-parts@1',
        },
      })
    );
    const { result } = renderDesk({ onScreen: 'teaching-note' });
    expect(result.current.decided).toBe(true);
    expect(result.current.sinceLine).toBeNull();
    expect(result.current.note).toBeNull();
    expect(result.current.unsolicitedShown).toBe('galley-parts@1');
    await act(async () => {});
    expect(patched(['visit', 'unsolicitedShown'])).toHaveLength(0);
  });

  it('the whisper on screen claims the visit (not the 7-day cap); after a reload the Desk offers no teaching note', async () => {
    mockNotes = [];
    renderDesk({ onScreen: 'setup-whisper' });
    await waitFor(() => expect(patched(['visit', 'unsolicitedShown'])).toEqual([[['visit', 'unsolicitedShown'], 'setup-whisper']]));
    expect(patched(['recentUnsolicited'])).toHaveLength(0);

    // A note is ready by the reload, but the visit's line has shown.
    reload();
    mockNotes = [RELEASE_NOTE];
    const { result } = renderDesk();
    expect(result.current.decided).toBe(true);
    expect(result.current.note).toBeNull();
    expect(result.current.unsolicitedShown).toBe('setup-whisper');
  });

  it('teaching off: the arbiter’s since-line or whisper on screen writes nothing', async () => {
    mockFlags = { 'teaching-notes': { value: false, isLoading: false } };
    renderDesk({ onScreen: 'setup-whisper' });
    await act(async () => {});
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
