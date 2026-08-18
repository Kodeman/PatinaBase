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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoomGeometryDocument } from '@patina/supabase';
import { RoomView } from '../room-view';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';

const mockUseRoomScan = jest.fn();

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
  useSignedScanModelUrl: () => ({ data: null, isFetching: false }),
}));

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
