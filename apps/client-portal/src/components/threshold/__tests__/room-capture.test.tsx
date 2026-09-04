import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoomScan } from '@patina/supabase';

// ── Boundaries ──────────────────────────────────────────────────────────────
// One read for the captures, one for the sharing, one for the client's own
// designers, and two mutations. The 3D canvas is the scans surface's own
// module and is stubbed: what this band owes the client is the plate and the
// two acts.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useRoomScans: jest.fn(),
  useRoomScanAssociations: jest.fn(),
  useShareRoomScan: jest.fn(),
  useRevokeScanAccess: jest.fn(),
}));

jest.mock('@/hooks/use-my-designers', () => ({
  __esModule: true,
  useMyDesigners: jest.fn(),
}));

jest.mock('@/components/scans/ClientViewerCanvas', () => ({
  __esModule: true,
  ClientViewerCanvas: ({ mode }: { mode: string }) => (
    <div data-testid="stub-canvas" data-mode={mode} />
  ),
}));

import {
  useRevokeScanAccess,
  useRoomScanAssociations,
  useRoomScans,
  useShareRoomScan,
} from '@patina/supabase';
import { useMyDesigners } from '@/hooks/use-my-designers';

import { RoomCapture, StrayCaptures } from '../room-capture';

const scansMock = useRoomScans as jest.Mock;
const associationsMock = useRoomScanAssociations as jest.Mock;
const designersMock = useMyDesigners as jest.Mock;
const shareMock = useShareRoomScan as jest.Mock;
const revokeMock = useRevokeScanAccess as jest.Mock;

const share = { mutate: jest.fn(), isPending: false, isError: false };
const revoke = { mutate: jest.fn(), isPending: false, isError: false };

type Capture = RoomScan & { project_room_id?: string | null };

function scan(overrides: Partial<Capture> = {}): Capture {
  return {
    id: 'scan-1',
    user_id: 'client-1',
    project_id: 'project-1',
    name: 'Entry & stair hall',
    room_type: 'entry',
    dimensions: null,
    floor_area: 18.5,
    features: null,
    furniture_detected: [],
    style_signals: null,
    suggested_styles: [],
    scan_data: null,
    thumbnail_url: 'https://scans.example/entry.jpg',
    model_url: null,
    model_url_gltf: null,
    annotations: null,
    measurements: null,
    status: 'ready',
    scanned_at: '2026-06-19',
    processed_at: null,
    created_at: '2026-06-19',
    ...overrides,
  };
}

function association(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assoc-1',
    scanId: 'scan-1',
    consumerId: 'client-1',
    designerId: 'designer-1',
    status: 'active',
    sharedAt: '2026-06-19',
    expiresAt: null,
    designer: { id: 'designer-1', fullName: 'Nora Quist', businessName: 'Quist Interiors' },
    ...overrides,
  };
}

function designer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'designer-1',
    fullName: 'Nora Quist',
    businessName: 'Quist Interiors',
    avatarUrl: null,
    ...overrides,
  };
}

function setSources({
  scans = [scan()] as Capture[],
  associations = [] as unknown[],
  designers = [] as unknown[],
} = {}) {
  scansMock.mockReturnValue({ data: scans });
  associationsMock.mockReturnValue({ data: associations });
  designersMock.mockReturnValue({ data: designers });
}

function band(props: Partial<{ roomId: string; roomName: string }> = {}) {
  return (
    <RoomCapture
      projectId="project-1"
      roomId={props.roomId ?? 'room-1'}
      roomName={props.roomName ?? 'Entry & stair hall'}
    />
  );
}

async function openThePlate() {
  await userEvent.click(screen.getByRole('button', { name: /the room as captured/i }));
}

describe('RoomCapture — the room as captured', () => {
  beforeEach(() => {
    share.mutate = jest.fn();
    revoke.mutate = jest.fn();
    shareMock.mockReturnValue(share);
    revokeMock.mockReturnValue(revoke);
    setSources();
  });

  it('reads only this project’s captures', () => {
    render(band());

    expect(scansMock).toHaveBeenCalledWith({ projectId: 'project-1' });
  });

  it('says nothing about a room nobody has captured', () => {
    setSources({ scans: [scan({ name: 'Library & lounge' })] });
    const { container } = render(band({ roomName: 'Primary bedroom' }));

    expect(container).toBeEmptyDOMElement();
  });

  it('matches the capture to its band by name, whatever the case', () => {
    setSources({ scans: [scan({ name: '  entry & STAIR hall ' })] });
    render(band());

    expect(screen.getByRole('button', { name: /the room as captured/i })).toBeInTheDocument();
  });

  it('prefers the capture’s own scope room over its name', () => {
    setSources({
      scans: [
        scan({ id: 'by-name', name: 'Entry & stair hall' }),
        scan({ id: 'by-room', name: 'Untitled scan', project_room_id: 'room-1' }),
      ],
    });
    render(band());

    expect(screen.getByTestId('room-capture')).toHaveAttribute(
      'data-room-capture',
      'by-room',
    );
  });

  it('does not hand a band a capture routed to a different scope room', () => {
    setSources({
      scans: [scan({ name: 'Entry & stair hall', project_room_id: 'room-9' })],
    });
    const { container } = render(band());

    expect(container).toBeEmptyDOMElement();
  });

  it('takes the newest of two captures that answer to one name', () => {
    // `useRoomScans` orders created_at desc; the band reads the first match.
    setSources({
      scans: [
        scan({ id: 'newer', created_at: '2026-07-01' }),
        scan({ id: 'older', created_at: '2026-05-01' }),
      ],
    });
    render(band());

    expect(screen.getByTestId('room-capture')).toHaveAttribute('data-room-capture', 'newer');
  });

  it('lays the capture down, and puts it away', async () => {
    render(band());

    const act = screen.getByRole('button', { name: /the room as captured/i });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('room-capture-plate')).not.toBeInTheDocument();

    await userEvent.click(act);
    expect(screen.getByTestId('room-capture-plate')).toBeInTheDocument();
    expect(screen.getByTestId('room-capture-caption')).toHaveTextContent(
      'Captured room · Entry & stair hall · 19 June',
    );

    await userEvent.click(screen.getByRole('button', { name: /put the capture away/i }));
    expect(screen.queryByTestId('room-capture-plate')).not.toBeInTheDocument();
  });

  it('carries the room’s measure and the day it was walked, as /scans did', async () => {
    setSources({
      scans: [scan({ dimensions: { width: 3.14, length: 4.2, height: 2.6, unit: 'm' } })],
    });
    render(band());
    await openThePlate();

    expect(screen.getByTestId('room-capture-caption')).toHaveTextContent(
      'Captured room · Entry & stair hall · 4.2 × 3.1 m · 19 June',
    );
  });

  it('stands the still on the plate and says why there is no model yet', async () => {
    render(band());
    await openThePlate();

    expect(screen.getByTestId('room-capture-still')).toHaveAttribute(
      'src',
      'https://scans.example/entry.jpg',
    );
    expect(screen.getByTestId('room-capture-pending')).toHaveTextContent(
      '3D model not yet available.',
    );
    expect(screen.queryByTestId('room-capture-model')).not.toBeInTheDocument();
  });

  it('does not promise a failed capture is still processing', async () => {
    setSources({ scans: [scan({ status: 'failed', thumbnail_url: null })] });
    render(band());
    await openThePlate();

    expect(screen.getByTestId('room-capture-failed')).toHaveTextContent(
      'This capture did not finish. Ask your studio to walk the room again.',
    );
    expect(screen.queryByTestId('room-capture-pending')).not.toBeInTheDocument();
  });

  it('says as much for a capture still processing, with no still to show', async () => {
    setSources({ scans: [scan({ status: 'processing', thumbnail_url: null })] });
    render(band());
    await openThePlate();

    expect(screen.queryByTestId('room-capture-still')).not.toBeInTheDocument();
    expect(screen.getByTestId('room-capture-pending')).toBeInTheDocument();
  });

  it('gives the model its own frame, and both readings of the room', async () => {
    setSources({ scans: [scan({ model_url_gltf: 'https://scans.example/entry.glb' })] });
    render(band());
    await openThePlate();

    expect(screen.getByTestId('room-capture-model')).toBeInTheDocument();
    expect(screen.getByTestId('stub-canvas')).toHaveAttribute('data-mode', 'orbit');

    await userEvent.click(screen.getByRole('button', { name: /seen from above/i }));
    expect(screen.getByTestId('stub-canvas')).toHaveAttribute('data-mode', 'floorplan');

    await userEvent.click(screen.getByRole('button', { name: /seen from the room/i }));
    expect(screen.getByTestId('stub-canvas')).toHaveAttribute('data-mode', 'orbit');
  });

  it('names who the room is shown to, until when, and takes it back', async () => {
    setSources({ associations: [association({ expiresAt: '2026-08-03' })] });
    render(band());
    await openThePlate();

    expect(screen.getByTestId('room-capture-share')).toHaveTextContent(
      'Shown to Nora Quist since 19 June · until 3 August.',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Stop showing this room to Nora Quist' }),
    );
    expect(revoke.mutate).toHaveBeenCalledWith({ associationId: 'assoc-1' });
  });

  it('falls back to the business name when the designer’s name is blank', async () => {
    setSources({ associations: [association({ designer: { id: 'd', fullName: '  ', businessName: 'Quist Interiors' } })] });
    render(band());
    await openThePlate();

    expect(screen.getByTestId('room-capture-share')).toHaveTextContent('Shown to Quist Interiors');
  });

  it('offers the room only to the client’s own designers, with the old payload', async () => {
    setSources({ designers: [designer()] });
    render(band());
    await openThePlate();

    expect(screen.getAllByRole('button', { name: /^show this room to/i })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Show this room to Nora Quist' }));
    expect(share.mutate).toHaveBeenCalledWith({
      scanId: 'scan-1',
      designerId: 'designer-1',
      accessLevel: 'full',
    });
  });

  it('does not offer the room to someone already looking at it', async () => {
    setSources({ associations: [association()], designers: [designer()] });
    render(band());
    await openThePlate();

    expect(screen.queryByRole('button', { name: /^show this room to/i })).not.toBeInTheDocument();
  });

  it('says so when an act fails', async () => {
    revokeMock.mockReturnValue({ ...revoke, isError: true });
    setSources({ associations: [association()] });
    render(band());
    await openThePlate();

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t revoke. Please try again.');
  });
});

describe('StrayCaptures — the captures no band claimed', () => {
  beforeEach(() => {
    share.mutate = jest.fn();
    revoke.mutate = jest.fn();
    shareMock.mockReturnValue(share);
    revokeMock.mockReturnValue(revoke);
    setSources();
  });

  const rooms = [{ roomId: 'room-1', name: 'Entry & stair hall' }];

  function stray(scans: Capture[]) {
    setSources({ scans });
    return render(<StrayCaptures projectId="project-1" userId="client-1" rooms={rooms} />);
  }

  it('reads the client’s own captures, as /scans did', () => {
    stray([]);

    expect(scansMock).toHaveBeenCalledWith({ userId: 'client-1' });
  });

  it('says nothing when every capture found its band', () => {
    const { container } = stray([scan()]);

    expect(container).toBeEmptyDOMElement();
  });

  it('stands a capture no band claimed, project-less ones included', () => {
    stray([
      scan({ id: 'nameless', name: 'Scan 12 June', project_id: null }),
      scan({ id: 'placed' }),
    ]);

    expect(screen.getByTestId('stray-captures')).toBeInTheDocument();
    expect(screen.getAllByTestId('room-capture')).toHaveLength(1);
    expect(screen.getByText('Scan 12 June')).toBeInTheDocument();
  });

  // A capture filed against no house has no house of its own; drawn in every
  // house it reads as one capture per house.
  it('leaves a houseless capture to the one house that holds the unfiled ones', () => {
    setSources({ scans: [scan({ id: 'nameless', name: 'Scan 12 June', project_id: null })] });
    const { container } = render(
      <StrayCaptures
        projectId="project-1"
        userId="client-1"
        rooms={rooms}
        standsUnfiled={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('leaves another house’s capture to that house', () => {
    const { container } = stray([
      scan({ id: 'elsewhere', name: 'Their kitchen', project_id: 'project-2' }),
    ]);

    expect(container).toBeEmptyDOMElement();
  });

  it('stands the walk a band claimed but never drew', () => {
    // A re-scan of the same room: the band shows the newest, and the older one
    // had no surface anywhere while "claimed" was taken for "has a home".
    stray([
      scan({ id: 'newest', created_at: '2026-07-01', scanned_at: '2026-07-01' }),
      scan({ id: 'older', created_at: '2026-06-19', scanned_at: '2026-06-19' }),
    ]);

    expect(screen.getAllByTestId('room-capture')).toHaveLength(1);
    expect(screen.getByTestId('stray-captures')).toBeInTheDocument();
    expect(document.querySelector('[data-room-capture="older"]')).toBeInTheDocument();
  });

  it('says a read failed rather than showing a client with no rooms', () => {
    scansMock.mockReturnValue({ data: undefined, isError: true });
    render(<StrayCaptures projectId="project-1" userId="client-1" rooms={rooms} />);

    expect(screen.getByTestId('captures-error')).toHaveTextContent(
      'Couldn’t load your rooms. Please refresh.',
    );
  });
});
