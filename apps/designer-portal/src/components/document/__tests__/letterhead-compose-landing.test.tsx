/**
 * US-19 FR3 F3-2 (P-2, `one-voice`) — `Nudge {first}` lands on the Message
 * composer: it opens with focus in its note and names the overdue decisions
 * above it. Esc in the composer is taken (F3-1). With the flag off, or with
 * no client to write to, the press is never taken here.
 *
 * The mocking shape is letterhead-instruments.test.tsx's.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_LANDING_EVENTS } from '@/lib/document/act-names';
import { LetterheadInstruments } from '../letterhead-instruments';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
  useProjectV2: () => ({ data: {} }),
  useProjectRoster: () => ({ data: [] }),
  resolveCoverPhoto: () => null,
  publicUrlToPath: () => null,
}));
jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({
    value: key === 'one-voice' ? mockOneVoice : true,
    isLoading: false,
  }),
}));
jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
  useMobileSecondaryAction: jest.fn(),
}));
jest.mock('../overlays/keys-sheet', () => ({ openKeys: jest.fn() }));
jest.mock('../letterhead-vitals', () => ({ openVitalsEditor: jest.fn() }));
jest.mock('../lens-band', () => ({ OPEN_STANDING_SHEET_EVENT: 'document:open-standing-sheet' }));
jest.mock('../client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));
jest.mock('../overlays/household-sheet', () => ({ HouseholdSheet: () => null }));

function renderFor(clientProfileId: string | null = 'client-1') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LetterheadInstruments projectId="proj-1" clientProfileId={clientProfileId} clientName="Nora Chen" />
    </QueryClientProvider>,
  );
}

/** What page.tsx's band press does under one-voice; true when taken. */
function nudge(named: string[]): boolean {
  let taken = false;
  act(() => {
    taken = !window.dispatchEvent(
      new CustomEvent(ACT_LANDING_EVENTS.composeMessage, { detail: { named }, cancelable: true }),
    );
  });
  return taken;
}

const note = () => screen.getByPlaceholderText('A quick note to Nora Chen…');

beforeEach(() => {
  mockOneVoice = true;
});

describe('Nudge {first} lands on the Message composer (F3-2)', () => {
  it('opens the composer with focus in its note, the overdue decisions named', async () => {
    renderFor();
    expect(screen.queryByPlaceholderText('A quick note to Nora Chen…')).toBeNull();

    expect(nudge(['Living room rug', 'Dining chairs'])).toBe(true);
    await waitFor(() => expect(note()).toHaveFocus());
    expect(screen.getByText('Waiting on Nora: Living room rug · Dining chairs')).toBeInTheDocument();
    // The note itself is hers to write; nothing is drafted for her.
    expect(note()).toHaveValue('');
  });

  it('Esc in the composer closes it and is taken, so the paper stays put', async () => {
    renderFor();
    nudge(['Living room rug']);
    await waitFor(() => expect(note()).toHaveFocus());
    const send = screen.getByRole('button', { name: /^Send/ });
    expect(fireEvent.keyDown(send, { key: 'Escape' })).toBe(false);
    expect(screen.queryByPlaceholderText('A quick note to Nora Chen…')).toBeNull();
    expect(screen.queryByText(/^Waiting on Nora/)).toBeNull();
  });

  it('leaves the press untaken with no client to write to', () => {
    renderFor(null);
    expect(nudge(['Living room rug'])).toBe(false);
  });

  it('leaves the press untaken with one-voice off', () => {
    mockOneVoice = false;
    renderFor();
    expect(nudge(['Living room rug'])).toBe(false);
    expect(screen.queryByPlaceholderText('A quick note to Nora Chen…')).toBeNull();
  });
});
