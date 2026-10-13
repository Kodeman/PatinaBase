/**
 * Measured rooms (US-28 S10a; uplift.md (c) area 3): Sections by job, the
 * client beside the job's tick in the eyebrow, at most three room Cards per
 * Section, the rest ledger rows.
 */

jest.mock('next/navigation', () => ({
  usePathname: () => '/rooms',
}));

const mockUseRoomRoster = jest.fn();
jest.mock('@patina/supabase', () => ({
  useRoomRoster: () => mockUseRoomRoster(),
}));

const mockUseDocumentEngagement = jest.fn();
jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: (id: string) => mockUseDocumentEngagement(id),
}));

jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: () => undefined,
}));

const mockRoomFileFlag = jest.fn(() => ({ value: false, isLoading: false }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => mockRoomFileFlag(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('../../room-shell', () => ({
  RoomShell: ({ title, count, children }: { title: string; count?: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {count && <span data-testid="room-count">{count}</span>}
      {children}
    </div>
  ),
}));

import { render, screen, within } from '@testing-library/react';
import type { RoomRosterScan, RoomRosterScanRow } from '@patina/supabase';
import { RoomsIndex } from '../rooms-index';
import { groupRoomsByJob, ROOM_CARD_CAP } from '../rooms-by-job';
import { buildRoomRosterEntry } from '@/lib/room-view/roster-from-rows';

const PELL = '11111111-1111-4111-8111-111111111111';
const MARSH = '22222222-2222-4222-8222-222222222222';

function scan(overrides: Partial<RoomRosterScanRow>): RoomRosterScan {
  return {
    scan: {
      active_section: 'project',
      coverage_percentage: 0.9,
      created_at: '2026-09-29T15:00:00+00',
      depth_ft: 15,
      document_client_name: 'Rosalind Fairweather',
      engagement_id: PELL,
      engagement_kind: 'project',
      floor_area_sqft: 180,
      name: 'Room',
      owner_client_name: null,
      parse_status: 'pending',
      quality_grade: 'good',
      room_type: 'dining_room',
      scan_id: 'scan-0',
      scanned_at: '2026-09-29T15:00:00+00',
      status: 'ready',
      user_id: 'u-1',
      wall_height_ft: 9,
      width_ft: 12,
      ...overrides,
    },
    elements: [],
  };
}

const PELL_ROOMS = ['dining_room', 'kitchen', 'scullery', 'pantry', 'hall'].map((type, i) =>
  scan({ scan_id: `pell-${i}`, room_type: type }),
);
const MARSH_ROOM = scan({
  scan_id: 'marsh-0',
  engagement_id: MARSH,
  document_client_name: 'Owen and Cait Brannigan',
  active_section: 'proposal',
  room_type: 'kitchen',
});
const ORPHAN = scan({
  scan_id: 'orphan-0',
  engagement_id: null,
  engagement_kind: null,
  active_section: null,
  document_client_name: null,
  name: 'Home office',
  room_type: 'office',
});

beforeEach(() => {
  mockUseRoomRoster.mockReset();
  mockUseDocumentEngagement.mockReset();
  mockUseDocumentEngagement.mockImplementation((id: string) => ({
    data:
      id === PELL
        ? { kind: 'engagement', row: { title: 'Pell Court Dining' } }
        : id === MARSH
          ? { kind: 'engagement', row: { title: 'Marsh Street Kitchen' } }
          : undefined,
    isLoading: false,
  }));
});

describe('groupRoomsByJob', () => {
  it('caps a job at three Cards and sends the rest to rows, unfiled scans last', () => {
    const groups = groupRoomsByJob([...PELL_ROOMS, MARSH_ROOM, ORPHAN].map(buildRoomRosterEntry));
    expect(ROOM_CARD_CAP).toBe(3);
    expect(groups.map((g) => g.key)).toEqual([PELL, MARSH, 'unfiled']);
    expect(groups[0].cards.map((e) => e.roomId)).toEqual(['pell-0', 'pell-1', 'pell-2']);
    expect(groups[0].rows.map((e) => e.roomId)).toEqual(['pell-3', 'pell-4']);
    expect(groups[0].stageClass).toBe('st-project');
    expect(groups[1].stageClass).toBe('st-proposal');
    expect(groups[2].engagementId).toBeNull();
  });
});

describe('RoomsIndex', () => {
  it('renders one closing Section per job with the client beside the tick and the stage word', () => {
    mockUseRoomRoster.mockReturnValue({ data: [...PELL_ROOMS, MARSH_ROOM], isLoading: false, isError: false });
    const { container } = render(<RoomsIndex />);

    const sections = container.querySelectorAll('section.section[data-rooms-job]');
    expect(sections).toHaveLength(2);

    const pell = sections[0] as HTMLElement;
    const tick = within(pell).getByText('Rosalind Fairweather');
    expect(tick).toHaveClass('tick', 'st-project');
    expect(within(pell).getByText('Project')).toBeInTheDocument();
    expect(within(pell).getByRole('link', { name: 'Pell Court Dining' })).toHaveAttribute(
      'href',
      `/doc/${PELL}`,
    );
    expect(pell).toHaveAccessibleName('Pell Court Dining');
  });

  it('shows at most three room Cards per Section; the fourth room on is a ledger row', () => {
    mockUseRoomRoster.mockReturnValue({ data: [...PELL_ROOMS, MARSH_ROOM], isLoading: false, isError: false });
    const { container } = render(<RoomsIndex />);
    const [pell, marsh] = Array.from(container.querySelectorAll('section[data-rooms-job]'));

    expect(pell.querySelectorAll('[data-room-card]')).toHaveLength(3);
    expect(pell.querySelectorAll('[data-room-row]')).toHaveLength(2);
    expect(within(pell as HTMLElement).getByRole('link', { name: 'Pantry' })).toHaveAttribute(
      'href',
      '/room/pell-3',
    );

    expect(marsh.querySelectorAll('[data-room-card]')).toHaveLength(1);
    expect(marsh.querySelectorAll('[data-room-row]')).toHaveLength(0);
    expect(within(marsh as HTMLElement).getByText('Owen and Cait Brannigan')).toHaveClass('st-proposal');
  });

  it('gathers scans with no Document in a last Section with no tick', () => {
    mockUseRoomRoster.mockReturnValue({ data: [MARSH_ROOM, ORPHAN], isLoading: false, isError: false });
    const { container } = render(<RoomsIndex />);
    const sections = container.querySelectorAll('section[data-rooms-job]');
    const last = sections[sections.length - 1] as HTMLElement;
    expect(last).toHaveAttribute('data-rooms-job', 'unfiled');
    expect(within(last).getByText('Not filed to a job')).toBeInTheDocument();
    expect(last.querySelector('.tick')).toBeNull();
    expect(within(last).getByRole('link', { name: 'Office' })).toBeInTheDocument();
  });

  it('falls back to "The Document" until the job name resolves', () => {
    mockUseDocumentEngagement.mockReturnValue({ data: undefined, isLoading: true });
    mockUseRoomRoster.mockReturnValue({ data: [MARSH_ROOM], isLoading: false, isError: false });
    render(<RoomsIndex />);
    expect(screen.getByRole('link', { name: 'The Document' })).toHaveAttribute('href', `/doc/${MARSH}`);
  });

  it('gives each room Card its act: an undrawn room opens the scan (rooms-p1)', () => {
    mockUseRoomRoster.mockReturnValue({ data: [MARSH_ROOM], isLoading: false, isError: false });
    const { container } = render(<RoomsIndex />);
    const card = container.querySelector('[data-room-card]') as HTMLElement;
    const act = within(card).getByRole('link', { name: 'Open the scan of the kitchen' });
    expect(act).toHaveTextContent('Open the scan');
    expect(act).toHaveAttribute('href', '/room/marsh-0');
    expect(act.closest('.foot')).not.toBeNull();
  });

  it('a drawn room opens its room file while the room file is on', () => {
    mockRoomFileFlag.mockReturnValue({ value: true, isLoading: false });
    const drawn = scan({
      scan_id: 'marsh-0',
      engagement_id: MARSH,
      document_client_name: 'Owen and Cait Brannigan',
      room_type: 'kitchen',
      parse_status: 'parsed',
    });
    expect(buildRoomRosterEntry(drawn).geometry).not.toBeNull();
    mockUseRoomRoster.mockReturnValue({ data: [drawn], isLoading: false, isError: false });
    const { container } = render(<RoomsIndex />);
    const card = container.querySelector('[data-room-card]') as HTMLElement;
    expect(
      within(card).getByRole('link', { name: 'Open the room file for the kitchen' }),
    ).toHaveAttribute('href', '/room/marsh-0/file');
    mockRoomFileFlag.mockReturnValue({ value: false, isLoading: false });
  });

  it('an empty roster is the one empty state, not a dashed box', () => {
    mockUseRoomRoster.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(<RoomsIndex />);
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
    expect(screen.getByText('No rooms have been scanned yet.')).toBeInTheDocument();
    expect(screen.getByTestId('room-count')).toHaveTextContent('0 scanned rooms');
  });
});
