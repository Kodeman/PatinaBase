/**
 * `useClientScans` (letterhead-instruments.tsx) — the designer-scan union, Wave 1P.
 *
 * The sibling suite (letterhead-instruments-scan-door.test.tsx) mocks auth.getUser() to
 * `{ user: null }` in every case, so the designer leg there never runs. This suite exists to
 * exercise it: a per-leg mock keyed on the `.eq('user_id', …)` argument, so the client leg and
 * the designer leg can return different rows.
 *
 * Pins Ruling 4-B (the door prefers the CLIENT's scan), the dedupe precedence
 * (the designer's stamp wins a shared id, so a self-scan reads as hers), and the
 * project scoping of the designer leg (`room_scans.project_id`, 00265) — the
 * door must never open a room that belongs to another project, or to none.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  status: string;
  /** `room_scans.project_id` (00265) — nullable; an unlinked scan belongs to
   *  no document. */
  project_id: string | null;
  images: unknown[];
}

/** A chainable stand-in for the PostgREST filter builder. */
interface ScanQueryBuilder {
  select: () => ScanQueryBuilder;
  eq: (column: string, value: string) => ScanQueryBuilder;
  order: () => ScanQueryBuilder;
  limit: () => Promise<{ data: ScanRow[]; error: null }>;
}

/** Rows per `room_scans.user_id`, so the two legs can differ. */
const scansByUser: Record<string, ScanRow[]> = {};
/** The `user_id`s whose leg also filtered `.eq('status', 'ready')` (Ruling 7-B). */
const readyFilteredUsers: string[] = [];
/** The `user_id`s whose leg also filtered `.eq('project_id', …)` — the door
 *  must never offer a room that belongs to another project. */
const projectFilteredUsers: string[] = [];
/** The signed-in designer, or null for a signed-out read. */
let designerId: string | null = 'designer-uid';

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    // One builder per `from()` call, so the two legs record their own filters.
    from: () => {
      let userId = '';
      let readyOnly = false;
      let projectId: string | null = null;
      const builder: ScanQueryBuilder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === 'user_id') userId = value;
          if (column === 'status') {
            readyOnly = true;
            readyFilteredUsers.push(userId);
          }
          if (column === 'project_id') {
            projectId = value;
            projectFilteredUsers.push(userId);
          }
          return builder;
        },
        order: () => builder,
        limit: () =>
          Promise.resolve({
            data: (scansByUser[userId] ?? []).filter(
              (r) =>
                (!readyOnly || r.status === 'ready') &&
                (projectId === null || r.project_id === projectId),
            ),
            error: null,
          }),
      };
      return builder;
    },
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

function scan(
  id: string,
  createdAt: string,
  status = 'ready',
  projectId: string | null = 'proj-1',
): ScanRow {
  return { id, name: id, created_at: createdAt, status, project_id: projectId, images: [] };
}

/** The QueryClient of the most recent render, so a case can wait on the read. */
let lastQueryClient: QueryClient | null = null;

function renderInstruments() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  lastQueryClient = qc;
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

/** Wait on the read itself, so "no door" is a settled fact, not a race. */
async function settled() {
  await waitFor(() =>
    expect(
      lastQueryClient?.getQueryState(['document-client-scans', 'client-1', 'proj-1'])
        ?.status,
    ).toBe('success'),
  );
}

beforeEach(() => {
  for (const key of Object.keys(scansByUser)) delete scansByUser[key];
  readyFilteredUsers.length = 0;
  projectFilteredUsers.length = 0;
  lastQueryClient = null;
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

  it("ignores the designer's not-yet-ready scan, as the Discovery picker does", async () => {
    scansByUser['client-1'] = [];
    scansByUser['designer-uid'] = [
      scan('still-uploading', '2026-08-01T00:00:00Z', 'processing'),
    ];

    renderInstruments();
    await settled();

    // Ruling 7-B: ready-only on the designer leg, untouched on the client leg.
    expect(readyFilteredUsers).toEqual(['designer-uid']);

    // Nothing ready on either side — the door has nothing to open.
    expect(screen.queryByText('Your scan')).toBeNull();
    expect(screen.queryByText('The scan')).toBeNull();
  });

  it("never offers the designer's scan from ANOTHER project", async () => {
    // The whole P1 finding: unscoped, this door opened a room in a different
    // client's house. `room_scans.project_id` (00265) is the scope.
    scansByUser['client-1'] = [];
    scansByUser['designer-uid'] = [
      scan('another-house', '2026-08-01T00:00:00Z', 'ready', 'proj-2'),
    ];

    renderInstruments();
    await settled();

    // The project filter rides the designer leg only — the client leg keeps its
    // pre-union behaviour byte-for-byte.
    expect(projectFilteredUsers).toEqual(['designer-uid']);

    expect(screen.queryByText('Your scan')).toBeNull();
    expect(screen.queryByText('The scan')).toBeNull();
  });

  it("never offers a designer scan that is linked to no project at all", async () => {
    // project_id is nullable: a scan she took before any project existed
    // belongs to no document, so it must not answer for this one.
    scansByUser['client-1'] = [];
    scansByUser['designer-uid'] = [
      scan('unlinked', '2026-08-01T00:00:00Z', 'ready', null),
    ];

    renderInstruments();
    await settled();

    expect(screen.queryByText('Your scan')).toBeNull();
    expect(screen.queryByText('The scan')).toBeNull();
  });
});
