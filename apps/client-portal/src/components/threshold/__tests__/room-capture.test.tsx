import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoomScan } from '@patina/supabase';

// ── Boundaries ──────────────────────────────────────────────────────────────
// One read for the captures, one for the sharing, one for the studio's people,
// and two mutations. The 3D canvas is the scans surface's own module and is
// stubbed: what this band owes the client is the plate and the two acts.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useRoomScans: jest.fn(),
  useRoomScanAssociations: jest.fn(),
  useProjectTeamMembers: jest.fn(),
  useShareRoomScan: jest.fn(),
  useRevokeScanAccess: jest.fn(),
}));

jest.mock('@/components/scans/ClientViewerCanvas', () => ({
  __esModule: true,
  ClientViewerCanvas: () => <div data-testid="stub-canvas" />,
}));

import {
  useProjectTeamMembers,
  useRevokeScanAccess,
  useRoomScanAssociations,
  useRoomScans,
  useShareRoomScan,
} from '@patina/supabase';

import { RoomCapture } from '../room-capture';

const scansMock = useRoomScans as jest.Mock;
const associationsMock = useRoomScanAssociations as jest.Mock;
const teamMock = useProjectTeamMembers as jest.Mock;
const shareMock = useShareRoomScan as jest.Mock;
const revokeMock = useRevokeScanAccess as jest.Mock;

const share = { mutate: jest.fn(), isPending: false, isError: false };
const revoke = { mutate: jest.fn(), isPending: false, isError: false };

function scan(overrides: Partial<RoomScan> = {}): RoomScan {
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
    designer: { id: 'designer-1', fullName: 'Nora Quist', businessName: 'Quist Interiors' },
    ...overrides,
  };
}

function teamMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    project_id: 'project-1',
    user_id: 'designer-1',
    role: 'lead_designer',
    user: { id: 'designer-1', full_name: 'Nora Quist', email: 'nora@example.com' },
    ...overrides,
  };
}

function setSources({
  scans = [scan()],
  associations = [] as unknown[],
  team = [] as unknown[],
} = {}) {
  scansMock.mockReturnValue({ data: scans });
  associationsMock.mockReturnValue({ data: associations });
  teamMock.mockReturnValue({ data: team });
}

describe('RoomCapture — the room as captured', () => {
  beforeEach(() => {
    share.mutate = jest.fn();
    revoke.mutate = jest.fn();
    shareMock.mockReturnValue(share);
    revokeMock.mockReturnValue(revoke);
    setSources();
  });

  it('says nothing about a room nobody has captured', () => {
    setSources({ scans: [scan({ name: 'Library & lounge' })] });
    const { container } = render(<RoomCapture projectId="project-1" roomName="Primary bedroom" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('matches the capture to its band by name, whatever the case', () => {
    setSources({ scans: [scan({ name: '  entry & STAIR hall ' })] });
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);

    expect(screen.getByRole('button', { name: /the room as captured/i })).toBeInTheDocument();
  });

  it('turns the sheet over, and back', async () => {
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);

    const act = screen.getByRole('button', { name: /the room as captured/i });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('room-capture-plate')).not.toBeInTheDocument();

    await userEvent.click(act);
    expect(screen.getByTestId('room-capture-plate')).toBeInTheDocument();
    expect(screen.getByTestId('room-capture-caption')).toHaveTextContent(
      'Captured room · Entry & stair hall',
    );

    await userEvent.click(screen.getByRole('button', { name: /the room as drawn/i }));
    expect(screen.queryByTestId('room-capture-plate')).not.toBeInTheDocument();
  });

  it('stands the still on the plate when no model has come back', async () => {
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);
    await userEvent.click(screen.getByRole('button', { name: /the room as captured/i }));

    expect(screen.getByTestId('room-capture-still')).toHaveAttribute(
      'src',
      'https://scans.example/entry.jpg',
    );
    expect(screen.queryByTestId('room-capture-model')).not.toBeInTheDocument();
  });

  it('gives the model its own frame on the plate once there is one', async () => {
    setSources({ scans: [scan({ model_url_gltf: 'https://scans.example/entry.glb' })] });
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);
    await userEvent.click(screen.getByRole('button', { name: /the room as captured/i }));

    expect(screen.getByTestId('room-capture-model')).toBeInTheDocument();
  });

  it('names who the room is shown to, and takes it back', async () => {
    setSources({ associations: [association()] });
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);
    await userEvent.click(screen.getByRole('button', { name: /the room as captured/i }));

    expect(screen.getByTestId('room-capture-share')).toHaveTextContent(
      'Shown to Nora Quist since 19 June.',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Stop showing this room to Nora Quist' }),
    );
    expect(revoke.mutate).toHaveBeenCalledWith({ associationId: 'assoc-1' });
  });

  it('shows the room to a member of the studio on this project', async () => {
    setSources({ team: [teamMember(), teamMember({ id: 'member-2', user_id: 'client-1', role: 'client' })] });
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);
    await userEvent.click(screen.getByRole('button', { name: /the room as captured/i }));

    expect(screen.getAllByRole('button', { name: /^show this room to/i })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Show this room to Nora Quist' }));
    expect(share.mutate).toHaveBeenCalledWith({
      scanId: 'scan-1',
      designerId: 'designer-1',
      accessLevel: 'full',
      projectId: 'project-1',
    });
  });

  it('does not offer the room to someone already looking at it', async () => {
    setSources({ associations: [association()], team: [teamMember()] });
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);
    await userEvent.click(screen.getByRole('button', { name: /the room as captured/i }));

    expect(screen.queryByRole('button', { name: /^show this room to/i })).not.toBeInTheDocument();
  });

  it('says so when an act fails', async () => {
    revokeMock.mockReturnValue({ ...revoke, isError: true });
    setSources({ associations: [association()] });
    render(<RoomCapture projectId="project-1" roomName="Entry & stair hall" />);
    await userEvent.click(screen.getByRole('button', { name: /the room as captured/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t revoke. Please try again.');
  });
});
