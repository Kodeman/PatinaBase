import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const renderDesk = (initial: { ready?: boolean; taken?: boolean } = {}) =>
  renderHook((props: { ready?: boolean; taken?: boolean }) => useReturnNote({ pinnedProjectIds: [], ...props }), {
    wrapper,
    initialProps: initial,
  });

const patched = (path: string[]) => mockPatch.mock.calls.filter(([p]) => p.join('.') === path.join('.'));
const captured = (name: string) => mockCapture.mock.calls.filter(([n]) => n === name);

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  resetTeachingNoteSession();
  mockPatch.mockClear();
  mockCapture.mockClear();
  client = new QueryClient();
  mockNotes = [RELEASE_NOTE];
  mockReleases = [
    { id: '2026-09-10-galley-parts', shippedOn: '2026-09-10', sizeClass: 'workflow_changing', featureKeys: ['galley'], headline: 'Parts draw POs' },
  ];
  mockSignals = { role: 'owner', used: {}, lastAt: {}, createdAt: '2026-08-01T00:00:00Z' };
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

  it('loading at first paint: no note, and no retry this visit', async () => {
    prime(undefined);
    const { result, rerender, unmount } = renderDesk();
    expect(result.current.note).toBeNull();

    // The state arrives after first paint: still nothing for this mount…
    prime(state({ visit: { startedAt: iso(NOW - 3 * 60 * MIN), lastActiveAt: iso(NOW - 2 * 60 * MIN) } }));
    rerender({});
    expect(result.current.note).toBeNull();
    await waitFor(() => expect(patched(['visit'])).toHaveLength(1));
    unmount();

    // …nor for the next Desk load in the same visit.
    prime(client.getQueryData<TeachingNoteState>(STATE_KEY));
    const again = renderDesk();
    expect(again.result.current.note).toBeNull();
  });

  it('a flag still loading at first paint counts as loading', () => {
    mockFlags = { 'teaching-notes': { value: false, isLoading: true } };
    const { result } = renderDesk();
    expect(result.current.note).toBeNull();
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

  it('marks a new visit after 30 minutes away, and only touches lastActiveAt inside a visit', async () => {
    const started = iso(NOW - 3 * 60 * MIN);
    renderDesk();
    await waitFor(() =>
      expect(patched(['visit'])).toEqual([
        [
          ['visit'],
          { startedAt: iso(NOW), prevStartedAt: started, lastActiveAt: iso(NOW), unsolicitedShown: null },
        ],
      ])
    );

    mockPatch.mockClear();
    resetTeachingNoteSession();
    prime(state({ visit: { startedAt: iso(NOW - 20 * MIN), lastActiveAt: iso(NOW - 10 * MIN), unsolicitedShown: 'x@1' } }));
    renderDesk();
    await waitFor(() => expect(patched(['visit', 'lastActiveAt'])).toEqual([[['visit', 'lastActiveAt'], iso(NOW)]]));
    expect(patched(['visit'])).toHaveLength(0);
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
    await waitFor(() => expect(patched(['visit'])).toHaveLength(1));
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

  it('reports already_knew once per note per session', async () => {
    mockSignals = {
      role: 'owner',
      used: {},
      lastAt: { po_drawn: '2026-09-20T00:00:00Z' },
      createdAt: '2026-08-01T00:00:00Z',
    };
    mockNotes = [{ ...RELEASE_NOTE, successSignal: 'po_drawn' }];
    const { result, unmount } = renderDesk();
    expect(result.current.note).toBeNull();
    await waitFor(() => expect(captured('help.teaching_note.already_knew')).toHaveLength(1));
    unmount();
    renderDesk();
    await act(async () => {});
    expect(captured('help.teaching_note.already_knew')).toHaveLength(1);
  });

  it('returns the since-line after 30 days away', () => {
    prime(state({ visit: { startedAt: iso(NOW - 40 * 24 * 60 * MIN), lastActiveAt: iso(NOW - 39 * 24 * 60 * MIN) } }));
    const { result } = renderDesk();
    expect(result.current.sinceLine).toEqual({
      items: [expect.objectContaining({ id: '2026-09-10-galley-parts' })],
      changesHref: '/help/changes',
    });
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
});
