/**
 * `useClientScans` (letterhead-instruments.tsx) — the designer-scan union, Wave 1P.
 *
 * The sibling suite (letterhead-instruments-scan-door.test.tsx) mocks auth.getUser() to
 * `{ user: null }` in every case, so the designer leg there never runs. This suite exists to
 * exercise it: a per-leg mock keyed on the `.eq('user_id', …)` argument, so the client leg and
 * the designer leg can return different rows.
 *
 * Pins Ruling 4-B (the door prefers the CLIENT's scan) and the dedupe precedence
 * (the designer's stamp wins a shared id, so a self-scan reads as hers).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LetterheadInstruments } from '../letterhead-instruments';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

interface ScanRow {
  id: string;
  name: string;
  created_at: string;
  images: unknown[];
}

/** Rows per `room_scans.user_id`, so the two legs can differ. */
const scansByUser: Record<string, ScanRow[]> = {};
/** The signed-in designer, or null for a signed-out read. */
let designerId: string | null = 'designer-uid';

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          order: () => ({
            limit: () =>
              Promise.resolve({ data: scansByUser[userId] ?? [], error: null }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
      }),
    },
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: designerId ? { id: designerId } : null } }),
    },
  }),
  useProjectV2: () => ({ data: undefined }),
  useProjectRoster: () => ({ data: [] }),
  // Every scan resolves a hero with a ready-to-use URL, so the door's
  // `withImage` filter keeps them all and nothing needs signing.
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

function scan(id: string, createdAt: string): ScanRow {
  return { id, name: id, created_at: createdAt, images: [] };
}

function renderInstruments() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <LetterheadInstruments
        projectId="proj-1"
        clientProfileId="client-1"
        clientName="The Ellsworths"
        engagementId={null}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(scansByUser)) delete scansByUser[key];
  designerId = 'designer-uid';
  mockPush.mockClear();
});

describe('LetterheadInstruments — the designer-scan union (Wave 1P)', () => {
  it("opens the CLIENT's scan even when the designer has a newer one (Ruling 4-B)", async () => {
    scansByUser['client-1'] = [scan('client-scan', '2026-01-01T00:00:00Z')];
    scansByUser['designer-uid'] = [scan('my-newer-scan', '2026-08-01T00:00:00Z')];

    renderInstruments();

    const door = await screen.findByText('The scan');
    fireEvent.click(door);
    expect(mockPush).toHaveBeenCalledWith('/room/client-scan?from=document');
  });

  it("surfaces the designer's OWN scan, labelled 'Your scan', when the client has none", async () => {
    // The whole point of spec §11.2: before the union this door did not exist here at all.
    scansByUser['client-1'] = [];
    scansByUser['designer-uid'] = [scan('my-scan', '2026-08-01T00:00:00Z')];

    renderInstruments();

    const door = await screen.findByText('Your scan');
    fireEvent.click(door);
    expect(mockPush).toHaveBeenCalledWith('/room/my-scan?from=document');
    expect(screen.queryByText('The scan')).toBeNull();
  });

  it("reads a self-scan as hers when the designer IS the client (dedupe precedence)", async () => {
    const shared = scan('shared-scan', '2026-05-01T00:00:00Z');
    scansByUser['client-1'] = [shared];
    scansByUser['designer-uid'] = [shared];

    renderInstruments();

    // The designer leg lands last, so its stamp wins the shared id.
    expect(await screen.findByText('Your scan')).toBeInTheDocument();
    expect(screen.queryByText('The scan')).toBeNull();
  });

  it('falls back to the client leg alone when nobody is signed in', async () => {
    designerId = null;
    scansByUser['client-1'] = [scan('client-scan', '2026-01-01T00:00:00Z')];
    scansByUser['designer-uid'] = [scan('never-read', '2026-08-01T00:00:00Z')];

    renderInstruments();

    expect(await screen.findByText('The scan')).toBeInTheDocument();
    expect(screen.queryByText('Your scan')).toBeNull();
  });
});
