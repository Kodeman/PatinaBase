/**
 * LetterheadInstruments — the "The scan" door (I74a / A2 wiring, rev1-NAV-1).
 * This is the one live scan door with actual conditional URL-building
 * (`engagementId ? \`&docId=${engagementId}\` : ''`), unlike the other five
 * live doors that either always append docId or never do — so both branches
 * are pinned here. Mirrors call-sheet-doorways.test.tsx's mocking shape for
 * this same component (the union of what letterhead-instruments.tsx pulls
 * from `@patina/supabase` + its sibling components), scoped down to just
 * the scan door.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LetterheadInstruments } from '../letterhead-instruments';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'scan-1',
                    name: 'Kitchen scan',
                    created_at: '2026-01-01T00:00:00Z',
                    images: [],
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
  useProjectV2: () => ({ data: undefined }),
  useProjectRoster: () => ({ data: [] }),
  // A resolved hero photo with no path to sign — `useClientScans` passes its
  // `image_url` straight through, which is all this door's own tile-picker
  // (`scans.find((s) => s.image_url)`) needs to surface the scan.
  resolveCoverPhoto: () => ({ image_url: 'https://example.com/hero.jpg' }),
  publicUrlToPath: () => null,
}));

jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('../client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));

function renderInstruments(engagementId?: string | null) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LetterheadInstruments
        projectId="proj-1"
        clientProfileId="client-1"
        clientName="The Ellsworths"
        engagementId={engagementId}
      />
    </QueryClientProvider>,
  );
}

describe('LetterheadInstruments — "The scan" door', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('appends &docId=<engagementId> (A2 — scopes back to the current document) when engagementId is passed', async () => {
    renderInstruments('engagement-1');

    const door = await screen.findByText('The scan');
    fireEvent.click(door);

    expect(mockPush).toHaveBeenCalledWith('/room/scan-1?from=document&docId=engagement-1');
  });

  it('omits docId entirely when engagementId is absent (an older un-scoped caller)', async () => {
    renderInstruments(null);

    const door = await screen.findByText('The scan');
    fireEvent.click(door);

    expect(mockPush).toHaveBeenCalledWith('/room/scan-1?from=document');
  });
});

describe('LetterheadInstruments — "The scan" door provenance (Wave 1P)', () => {
  it('labels the door "The scan" while the client leg supplies it', async () => {
    renderInstruments(null);
    expect(await screen.findByText('The scan')).toBeInTheDocument();
  });
});
