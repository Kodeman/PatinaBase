import { renderHook } from '@testing-library/react';

let mockNotes: unknown[] | undefined;
let mockReleases: unknown[] | undefined;
let mockSignals: { role: 'owner' | 'hand' } | null | undefined;
let mockFlags: Record<string, { value: boolean; isLoading: boolean }> = {};
const mockPatch = jest.fn();

jest.mock('./use-teaching-data', () => ({
  useTeachingNotes: () => ({ data: mockNotes, isLoading: false }),
  useTeachingReleases: () => ({ data: mockReleases, isLoading: false }),
  useTeachingSignals: () => ({ data: mockSignals, isLoading: false }),
  useTeachingNoteState: () => ({ state: undefined, patch: mockPatch, isLoading: false }),
}));

jest.mock('./use-feature-flags', () => ({
  useFeatureFlags: (names: readonly string[]) =>
    Object.fromEntries(names.map((n) => [n, mockFlags[n] ?? { value: false, isLoading: false }])),
}));

jest.mock(
  '../content/teaching-releases',
  () => ({
    ...jest.requireActual('../content/teaching-releases'),
    TEACHING_RELEASES: [
      { id: '2026-09-10-galley', shippedOn: '2026-09-10', sizeClass: 'workflow_changing', featureKeys: ['galley'] },
      { id: '2026-09-11-print', shippedOn: '2026-09-11', sizeClass: 'useful', featureKeys: ['ledger'] },
      { id: '2026-09-12-flagged', shippedOn: '2026-09-12', sizeClass: 'useful', featureKeys: ['hours'], flag: 'hours-v2' },
    ],
  }),
);

import { useChangesList } from './use-changes-list';

const note = (over: Record<string, unknown>) => ({
  kind: 'faster_way',
  audience: 'all',
  trigger: 'return',
  surfaceKey: 'designer-portal/document/desk',
  body: 'A sentence.',
  priority: 3,
  recedeOn: [],
  maxDisplays: 3,
  provenance: 'agent',
  ...over,
});

const release = (id: string, shippedOn: string) => ({
  id,
  headline: `Headline ${id}`,
  prose: `Prose ${id}`,
  sizeClass: 'useful',
  shippedOn,
  featureKeys: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSignals = { role: 'hand' };
  mockFlags = {};
  // useTeachingReleases returns manifest (oldest-first) order.
  mockReleases = [
    release('2026-09-10-galley', '2026-09-10'),
    release('2026-09-11-print', '2026-09-11'),
    release('2026-09-12-flagged', '2026-09-12'),
  ];
  mockNotes = [
    note({ noteKey: 'galley@1', kind: 'release', releaseId: '2026-09-10-galley', body: 'Parts print above the fold.', act: { label: 'Open the Galley', hrefTemplate: '/drafting' } }),
    note({ noteKey: 'print@1', kind: 'release', releaseId: '2026-09-11-print', body: 'An invoice prints alone.', act: { label: 'Print {invoiceNumber}', hrefTemplate: '/invoices/{invoiceId}/print' }, bindings: { invoiceNumber: 'invoiceNumber', invoiceId: 'invoiceId' } }),
    note({ noteKey: 'hours-flagged@1', kind: 'release', releaseId: '2026-09-12-flagged', body: 'Hours v2.' }),
    note({ noteKey: 'keys@1', body: 'Press t to log an hour.', act: { label: 'See the keys', hrefTemplate: '/help/article/the-keys' }, publishedAt: '2026-09-01T00:00:00Z' }),
    note({ noteKey: 'seat@1', kind: 'owner_capability', audience: 'owner', body: 'Seats for owners.', publishedAt: '2026-09-20T00:00:00Z' }),
    note({ noteKey: 'bound@1', body: '{projectName} hours can come into an invoice.', bindings: { projectName: 'projectName' } }),
    note({ noteKey: 'flagged@1', flag: 'people-v2', body: 'People behind a flag.', publishedAt: '2026-09-22T00:00:00Z' }),
  ];
});

describe('useChangesList', () => {
  it('lists published releases newest first, each with its own notes as plain views', () => {
    const { result } = renderHook(() => useChangesList());

    expect(result.current.isLoading).toBe(false);
    // The flagged release is off (fail closed), so only two remain, newest first.
    expect(result.current.releases.map((r) => r.id)).toEqual(['2026-09-11-print', '2026-09-10-galley']);
    const [print, galley] = result.current.releases;
    expect(print).toMatchObject({ headline: 'Headline 2026-09-11-print', prose: 'Prose 2026-09-11-print', shippedOn: '2026-09-11' });
    expect(galley.notes).toEqual([
      expect.objectContaining({
        noteKey: 'galley@1',
        body: 'Parts print above the fold.',
        act: { label: 'Open the Galley', href: '/drafting' },
        label: 'WORKSHOP NOTE · 10 SEP',
      }),
    ]);
    // A bound act cannot resolve without a job in hand: the sentence stays, the act goes.
    expect(print.notes).toEqual([expect.objectContaining({ noteKey: 'print@1', act: null })]);
  });

  it('puts every other note under "also", filtered to her role and flags, newest first', () => {
    const { result } = renderHook(() => useChangesList());
    // Owner note hidden from a hand; flag off hides flagged@1; a bound sentence never prints a hole.
    expect(result.current.also.map((n) => n.noteKey)).toEqual(['keys@1']);
    expect(result.current.also[0]).toMatchObject({ label: 'WORKSHOP NOTE', act: { label: 'See the keys', href: '/help/article/the-keys' } });

    mockSignals = { role: 'owner' };
    mockFlags = { 'people-v2': { value: true, isLoading: false } };
    const owner = renderHook(() => useChangesList());
    expect(owner.result.current.also.map((n) => n.noteKey)).toEqual(['flagged@1', 'seat@1', 'keys@1']);
  });

  it('includes notes she dismissed, and writes nothing', () => {
    // The hook never reads teaching state, so a dismissed note is listed like any other.
    const { result } = renderHook(() => useChangesList());
    expect(result.current.also.map((n) => n.noteKey)).toContain('keys@1');
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('shows only notes for everyone while her role is unknown', () => {
    mockSignals = null;
    const { result } = renderHook(() => useChangesList());
    expect(result.current.also.map((n) => n.noteKey)).toEqual(['keys@1']);
  });

  it('is empty, not loading, when nothing is published', () => {
    mockNotes = [];
    mockReleases = [];
    const { result } = renderHook(() => useChangesList());
    expect(result.current).toEqual({ releases: [], also: [], isLoading: false });
  });
});
