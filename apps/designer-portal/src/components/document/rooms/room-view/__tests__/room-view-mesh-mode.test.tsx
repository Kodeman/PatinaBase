/**
 * Room View — the MESH mode row gate (Rendered Room v2, P1).
 *
 * The rule: MESH is offered only when the scan carries a GLB (`room_scans.model_url_gltf`).
 * A scan with only the iOS USDZ (`model_url`) must not see the control at all, because
 * GLTFLoader cannot read a USDZ — offering it would be offering a mode that can only fail.
 *
 * `@patina/supabase` is mocked at the package boundary (it is NOT aliased in this app's
 * tsconfig `paths`, so an ordinary package mock applies — see patina-testing Trap 1).
 * The stage itself is never mounted here: this asserts the control row only, which keeps
 * `model-canvas`'s ESM-only `three/examples` loaders out of the Jest module graph.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoomGeometryDocument } from '@patina/supabase';
import { RoomView } from '../room-view';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';

const mockUseRoomScan = jest.fn();
const mockUseSignedScanModelUrl = jest.fn(() => ({ data: null, isFetching: false }));

// Keeps the real `model-canvas` chunk (three + the ESM-only `three/examples`
// loaders) out of the Jest module graph when MESH actually mounts — the same
// mock `model/__tests__/model-stage.test.tsx` uses.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MockModelCanvas() {
    return <div data-testid="model-canvas" />;
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
  useRoomFiles: () => ({ data: [] }),
  useScanRefineArtifacts: () => ({ data: undefined }),
  useRoomScan: (...args: unknown[]) => mockUseRoomScan(...args),
  useSignedScanModelUrl: (...args: unknown[]) => mockUseSignedScanModelUrl(...args),
}));

beforeEach(() => {
  mockUseSignedScanModelUrl.mockClear();
  mockUseSignedScanModelUrl.mockReturnValue({ data: null, isFetching: false });
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

describe('RoomView — MESH mode gate', () => {
  it('offers MESH when the scan carries a GLB', () => {
    mockUseRoomScan.mockReturnValue({
      data: {
        id: 'scan-1',
        model_url: 'https://storage.invalid/room.usdz',
        model_url_gltf: 'https://storage.invalid/room.glb',
      },
    });

    renderRoomView();

    expect(screen.getByRole('button', { name: 'Mesh' })).toBeInTheDocument();
    // The projections it sits beside are untouched.
    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument();
  });

  it('hides MESH for a USDZ-only scan', () => {
    mockUseRoomScan.mockReturnValue({
      data: {
        id: 'scan-1',
        model_url: 'https://storage.invalid/room.usdz',
        model_url_gltf: null,
      },
    });

    renderRoomView();

    expect(screen.queryByRole('button', { name: 'Mesh' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument();
  });

  it('hides MESH while the scan row is still unresolved', () => {
    mockUseRoomScan.mockReturnValue({ data: undefined });

    renderRoomView();

    expect(screen.queryByRole('button', { name: 'Mesh' })).not.toBeInTheDocument();
  });
});

describe('RoomView — signing is deferred until MESH is activated', () => {
  const scan = {
    id: 'scan-1',
    model_url: 'https://storage.invalid/room.usdz',
    model_url_gltf: 'https://storage.invalid/room.glb',
  };

  /** What every call to the signing hook was handed, in order. */
  function sourcesPassed(): unknown[] {
    return mockUseSignedScanModelUrl.mock.calls.map((call) => call[0]);
  }

  it('never asks Storage to sign anything on a Plan-only visit', () => {
    mockUseRoomScan.mockReturnValue({ data: scan });

    renderRoomView();

    // The hook is still CALLED (it is a hook; it must be), but with a null
    // source, which is what leaves the underlying query disabled. A Plan-only
    // visit costs zero Storage calls.
    expect(mockUseSignedScanModelUrl).toHaveBeenCalled();
    expect(sourcesPassed().every((s) => s == null)).toBe(true);
  });

  it('passes the scan through only once MESH is switched on', async () => {
    mockUseRoomScan.mockReturnValue({ data: scan });
    const user = userEvent.setup();

    renderRoomView();
    const callsBeforeSwitch = sourcesPassed().length;

    await user.click(screen.getByRole('button', { name: 'Mesh' }));

    const after = sourcesPassed().slice(callsBeforeSwitch);
    expect(after.length).toBeGreaterThan(0);
    expect(after.at(-1)).toBe(scan);
  });

  it('still defers signing for a scan with no GLB, even after other switches', async () => {
    mockUseRoomScan.mockReturnValue({ data: { ...scan, model_url_gltf: null } });
    const user = userEvent.setup();

    renderRoomView();
    await user.click(screen.getByRole('button', { name: 'Orbit' }));

    // No GLB means no MESH control and nothing to sign — switching elsewhere
    // must not start signing a URL that cannot be loaded anyway.
    expect(sourcesPassed().every((s) => s == null)).toBe(true);
  });
});
