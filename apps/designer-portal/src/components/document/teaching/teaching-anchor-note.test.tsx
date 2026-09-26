import { createRef, type ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TeachingNote, TeachingNoteState } from '@/lib/teaching/types';
import {
  getCurrentTeachingSurface,
  record,
  resetTeachingBoundaries,
} from '@/lib/teaching/boundaries';
import { resetTeachingNoteSession } from '@/hooks/use-teaching-note';
import { TeachingAnchorNote } from './teaching-anchor-note';

// jest cannot load @patina/help-system or the live reads: the teaching reads,
// flags and at-rest are mocked, and the real selector decides.
const ACCOUNTS = 'designer-portal/document/accounts';
const NOW = Date.parse('2026-09-25T15:00:00Z');
const MIN = 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const mockNote: TeachingNote = {
  noteKey: 'invoice-print@1',
  kind: 'faster_way',
  audience: 'all',
  trigger: 'anchor',
  surfaceKey: ACCOUNTS,
  featureKey: 'ledger',
  boundary: 'invoice_sent',
  body: 'An invoice prints as its own letterhead page.',
  priority: 3,
  recedeOn: [],
  maxDisplays: 3,
  provenance: 'agent',
};

let client: QueryClient;
const mockState: TeachingNoteState = {
  v: 1,
  cursor: { lastSeenReleaseId: null },
  visit: { startedAt: iso(NOW - 20 * MIN), lastActiveAt: iso(NOW - 10 * MIN) },
};

jest.mock('@/hooks/use-teaching-data', () => ({
  TEACHING_NOTE_STATE_KEY: ['teaching-note-state'],
  useTeachingNotes: () => ({ data: [mockNote] }),
  useTeachingReleases: () => ({ data: [] }),
  useTeachingNoteState: () => ({ state: mockState, patch: async () => mockState, isLoading: false }),
  useTeachingSignals: () => ({
    data: { role: 'owner', used: { ledger: true }, lastAt: {}, createdAt: '2026-08-01T00:00:00Z' },
  }),
}));
jest.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({ 'teaching-notes': { value: true, isLoading: false } }),
}));
jest.mock('@/hooks/use-teaching-at-rest', () => ({ useTeachingAtRest: () => true }));
jest.mock('@patina/supabase', () => ({ useProjects: () => ({ data: [], isLoading: false }) }));
jest.mock('@/lib/analytics/teaching-events', () => ({ captureTeachingEvent: jest.fn() }));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  resetTeachingNoteSession();
  resetTeachingBoundaries();
  client = new QueryClient();
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  jest.restoreAllMocks();
});

describe('TeachingAnchorNote', () => {
  it('renders nothing before its boundary fires on this surface, and the note after', () => {
    const hostRef = createRef<HTMLDivElement>();
    const tree = () => (
      <div ref={hostRef}>
        <TeachingAnchorNote surfaceKey={ACCOUNTS} hostRef={hostRef} />
      </div>
    );
    const { rerender } = render(tree(), { wrapper });
    expect(screen.queryByRole('note')).toBeNull();
    expect(getCurrentTeachingSurface()).toBe(ACCOUNTS);

    // A firing on another surface does not count.
    act(() => record({ boundaryKey: 'invoice_sent', at: NOW, surfaceKey: 'designer-portal/document/hours' }));
    rerender(tree());
    expect(screen.queryByRole('note')).toBeNull();

    // The tagged mutation succeeds here: the subscriber attributes it to the surface this note declared.
    act(() => record({ boundaryKey: 'invoice_sent', at: NOW, surfaceKey: getCurrentTeachingSurface() }));
    rerender(tree());
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('An invoice prints as its own letterhead page.');
    expect(note).toHaveTextContent('WORKSHOP NOTE');
  });

  it('clears its surface on unmount', () => {
    const hostRef = createRef<HTMLDivElement>();
    const { unmount } = render(<TeachingAnchorNote surfaceKey={ACCOUNTS} hostRef={hostRef} />, { wrapper });
    expect(getCurrentTeachingSurface()).toBe(ACCOUNTS);
    unmount();
    expect(getCurrentTeachingSurface()).toBe('unknown');
  });
});
