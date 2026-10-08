/**
 * US-19 walk D2 (SQ-542) — REGRESSION for FR5 F5-8 (SQ-540, log-strip.tsx).
 *
 * The walk's condition, composed: Aspen's band `Nudge the client` lands on the
 * letterhead's Message composer (one-voice) while a log-time offer for the
 * PREVIOUS project rides in the provider. Picking up Aspen chained that timer
 * out with `offerStrip: true`; the offer is another project's, so
 * `offerOwnsEdge` is false and the strip paints nothing — but its window-capture
 * Esc listener was armed on `offer` alone, took the key before React's root
 * listener and discarded the unseen offer. The composer never saw Esc and
 * stayed open with its note focused.
 *
 * Without F5-8's yield (focus in a textarea outside the strip) both assertions
 * below fail: the composer stays open and `discardOffer` runs.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_LANDING_EVENTS } from '@/lib/document/act-names';
import { LetterheadInstruments } from '../letterhead-instruments';
import { LogStrip } from '../log-strip';

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
  useMyRateRoles: () => ({ data: [] }),
  resolveCoverPhoto: () => null,
  publicUrlToPath: () => null,
}));
jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
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

// The chained-out offer: the previous project's, so it does not own the edge
// on Aspen's paper and the strip paints nothing.
const mockDiscardOffer = jest.fn().mockResolvedValue(undefined);
// SQ-546 — the same offer on its own paper, painted and owning the edge.
let mockOwnsEdge = false;
jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    offer: {
      entryId: 'entry-halloran',
      projectId: 'halloran-project',
      projectName: 'Halloran',
      suggestedMinutes: 6,
      rawSeconds: 360,
      idleSeconds: 0,
      billable: false,
      hourlyRateCents: null,
      rateSource: 'none',
      rateRole: null,
      ratedAmountCents: null,
    },
    offerOwnsEdge: mockOwnsEdge,
    logOffer: jest.fn(),
    discardOffer: mockDiscardOffer,
  }),
}));

function renderAspenPaper() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LogStrip />
      <LetterheadInstruments projectId="aspen-project" clientProfileId="client-1" clientName="Nora Chen" />
    </QueryClientProvider>,
  );
}

/** page.tsx's band press under one-voice (`landAct` on compose-message). */
function bandNudge() {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(ACT_LANDING_EVENTS.composeMessage, {
        detail: { named: ['Design Development sign-off'] },
        cancelable: true,
      }),
    );
  });
}

const note = () => screen.queryByPlaceholderText('A quick note to Nora…');

describe('walk D2 — band Nudge composer takes Esc over a hidden log-time offer (F5-8 regression)', () => {
  beforeEach(() => {
    mockDiscardOffer.mockClear();
    mockOwnsEdge = false;
  });

  it('Esc in the note closes the composer and leaves the unseen offer alone', async () => {
    renderAspenPaper();
    // The strip is not painted on this paper.
    expect(screen.queryByRole('region', { name: 'Log time offer' })).toBeNull();

    bandNudge();
    await waitFor(() => expect(note()).toHaveFocus());

    // A real keydown dispatched at the focused note, so the window-capture
    // listener runs before React's root listener, as in the browser.
    const notCanceled = fireEvent.keyDown(note() as HTMLElement, { key: 'Escape' });

    expect(note()).toBeNull();
    expect(notCanceled).toBe(false);
    expect(mockDiscardOffer).not.toHaveBeenCalled();
  });

  // SQ-546 (SQ-552 follow-up) — the composer is an open thing: it wears
  // `data-open-thing`, so a VISIBLE offer yields Esc on <body> to it.
  it('a visible offer leaves Esc on <body> alone while the composer is open', async () => {
    mockOwnsEdge = true;
    renderAspenPaper();
    expect(screen.getByRole('region', { name: 'Log time offer' })).toBeInTheDocument();

    // The control: nothing open, Esc on <body> is the offer's (529-6).
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(mockDiscardOffer).toHaveBeenCalledTimes(1);
    mockDiscardOffer.mockClear();

    bandNudge();
    await waitFor(() => expect(note()).toHaveFocus());
    // Focus drops to <body> (a press on bare paper); the composer stays open.
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(note()).toBeInTheDocument();
  });
});
