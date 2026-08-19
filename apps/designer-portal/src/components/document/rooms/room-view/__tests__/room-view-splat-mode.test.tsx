/**
 * Room View — the SPLAT mode row gate (Rendered Room v2, W2).
 *
 * The rule: SPLAT is offered only when the scan's CURRENT Room File registers a
 * `splat` artifact — or when a dev `?splatUrl=` override is in play, which is the only
 * way to reach the projection before the W2 read path exists. A scan whose Room File
 * registers nothing must not see the control, and an OLDER version's artifact must not
 * resurrect it.
 *
 * `@patina/supabase` is mocked at the package boundary (it is not aliased in this
 * app's tsconfig `paths`, so an ordinary package mock applies — patina-testing Trap 1),
 * which lets the gate be driven directly off the hook contract that `useSplatUrl`'s own
 * vitest suite pins.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoomGeometryDocument } from '@patina/supabase';
import { RoomView } from '../room-view';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';

const mockUseRoomFiles = jest.fn(() => ({ data: [] as unknown[] }));
const mockUseSplatUrl = jest.fn();

// One stand-in for BOTH dynamic canvases (Mesh's and Splat's) — they are told
// apart by the prop each is handed, which is also what proves the right URL
// reached the right one.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MockCanvas(props: { modelUrl?: string; splatUrl?: string }) {
    return props.splatUrl !== undefined ? (
      <div data-testid="splat-canvas" data-splat-url={props.splatUrl} />
    ) : (
      <div data-testid="model-canvas" />
    );
  },
}));

jest.mock('@/lib/analytics', () => ({
  roomEvents: {
    roomOpened: jest.fn(),
    modeSwitched: jest.fn(),
    measureUsed: jest.fn(),
  },
}));

jest.mock('@patina/supabase', () => ({
  useRoomFiles: (...args: unknown[]) => mockUseRoomFiles(...(args as [])),
  useScanRefineArtifacts: () => ({ data: undefined }),
  useRoomScan: () => ({ data: { id: 'scan-1', model_url_gltf: null } }),
  useSignedScanModelUrl: () => ({ data: null, isFetching: false }),
  useSplatUrl: (...args: unknown[]) => mockUseSplatUrl(...(args as [])),
}));

/** `useSplatUrl`'s answer for a Room File that registers no splat. */
const NO_ARTIFACT = {
  hasArtifact: false,
  artifact: null,
  url: null,
  unavailable: 'no-artifact' as const,
  isLoading: false,
};

/** …and for one that does, with the read path still missing. */
const PENDING = {
  hasArtifact: true,
  artifact: { object_id: 'obj-1', version: 1 },
  url: null,
  unavailable: 'read-path-pending' as const,
  isLoading: false,
};

/** …and for one that resolves — a dev `?splatUrl=` override, or the read path. */
const RESOLVED = {
  hasArtifact: true,
  artifact: { object_id: 'obj-1', version: 1 },
  url: '/fixtures/splat/room-fixture.ply',
  unavailable: null,
  isLoading: false,
};

beforeEach(() => {
  mockUseRoomFiles.mockReturnValue({ data: [] });
  mockUseSplatUrl.mockReturnValue(NO_ARTIFACT);
});

function parsedDoc(): RoomGeometryDocument {
  return {
    engagementId: 'eng-1',
    activeSection: 'discovery',
    parseStatus: 'parsed',
    documentClientName: 'Elena Vasquez',
    ownerClientName: 'Elena Vasquez',
    roomType: 'living_room',
    scannedAt: '2026-07-16T15:24:00Z',
    qualityGrade: 'good',
    coveragePercentage: 92,
  } as unknown as RoomGeometryDocument;
}

function renderRoomView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoomView
        roomId="scan-1"
        doc={parsedDoc()}
        geometry={prototypeRoom()}
        thicknessConvention
        isLoading={false}
      />
    </QueryClientProvider>,
  );
}

describe('RoomView — SPLAT mode gate', () => {
  it('offers SPLAT when the current Room File registers a splat artifact', () => {
    mockUseRoomFiles.mockReturnValue({ data: [{ id: 'rf-2', status: 'generated' }] });
    mockUseSplatUrl.mockReturnValue(PENDING);

    renderRoomView();

    expect(screen.getByRole('button', { name: 'Splat' })).toBeInTheDocument();
    // The projections it sits beside are untouched.
    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument();
  });

  it('hides SPLAT when the current Room File registers none', () => {
    mockUseRoomFiles.mockReturnValue({ data: [{ id: 'rf-2', status: 'generated' }] });

    renderRoomView();

    expect(screen.queryByRole('button', { name: 'Splat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument();
  });

  it('hides SPLAT for a scan with no Room File at all', () => {
    renderRoomView();

    expect(screen.queryByRole('button', { name: 'Splat' })).not.toBeInTheDocument();
    // …and asks about nothing, rather than asking about `undefined`.
    expect(mockUseSplatUrl).toHaveBeenCalled();
    expect(mockUseSplatUrl.mock.calls.every((call) => call[0] === null)).toBe(true);
  });
});

describe('RoomView — which Room File the gate reads', () => {
  it('asks about the newest version, not an older one', () => {
    // `useRoomFiles` orders version-desc; the head row is the current generation.
    // An older version's artifacts describe an older solve and must not be read.
    mockUseRoomFiles.mockReturnValue({
      data: [
        { id: 'rf-newest', version: 3, status: 'pending' },
        { id: 'rf-older', version: 2, status: 'generated' },
      ],
    });
    mockUseSplatUrl.mockReturnValue(PENDING);

    renderRoomView();

    expect(mockUseSplatUrl.mock.calls.at(-1)?.[0]).toBe('rf-newest');
  });

  it('does not filter on drawings status — the Present Layer is independent of it', () => {
    // A row whose DRAWINGS are still pending can already carry a trained splat
    // (00376: `present_status` is independent of `status`).
    mockUseRoomFiles.mockReturnValue({ data: [{ id: 'rf-1', version: 1, status: 'pending' }] });
    mockUseSplatUrl.mockReturnValue(PENDING);

    renderRoomView();

    expect(mockUseSplatUrl.mock.calls.at(-1)?.[0]).toBe('rf-1');
    expect(screen.getByRole('button', { name: 'Splat' })).toBeInTheDocument();
  });
});

describe('RoomView — the SPLAT stage', () => {
  it('stays unmounted until SPLAT is switched on, then shows the honest state', async () => {
    mockUseRoomFiles.mockReturnValue({ data: [{ id: 'rf-1', status: 'generated' }] });
    mockUseSplatUrl.mockReturnValue(PENDING);
    const user = userEvent.setup();

    renderRoomView();
    expect(screen.queryByText('Splat · the room as photographed')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Splat' }));

    expect(screen.getByText('Splat · the room as photographed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This room’s walkthrough is captured — the viewer is waiting on its read path.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('splat-canvas')).not.toBeInTheDocument();
  });

  it('mounts the canvas with the resolved URL once one arrives', async () => {
    // The end-to-end shape of the dev walk: `?splatUrl=` reaches `useSplatUrl`,
    // `useSplatUrl` hands the stage a URL, the stage hands it the canvas.
    mockUseRoomFiles.mockReturnValue({ data: [{ id: 'rf-1', status: 'generated' }] });
    mockUseSplatUrl.mockReturnValue(RESOLVED);
    const user = userEvent.setup();

    renderRoomView();
    await user.click(screen.getByRole('button', { name: 'Splat' }));

    expect(screen.getByTestId('splat-canvas')).toHaveAttribute(
      'data-splat-url',
      '/fixtures/splat/room-fixture.ply',
    );
    expect(screen.getByText('Splat · the room as photographed')).toBeInTheDocument();
  });

  it('keeps the splat stage mounted-but-hidden after switching away', async () => {
    // Switching back to Plan must not tear the canvas down and re-download the
    // splat; `room-view.tsx` hides it instead (the `splatMounted` latch).
    mockUseRoomFiles.mockReturnValue({ data: [{ id: 'rf-1', status: 'generated' }] });
    mockUseSplatUrl.mockReturnValue(RESOLVED);
    const user = userEvent.setup();

    renderRoomView();
    await user.click(screen.getByRole('button', { name: 'Splat' }));
    await user.click(screen.getByRole('button', { name: 'Plan' }));

    expect(screen.getByTestId('splat-canvas')).toBeInTheDocument();
  });
});
