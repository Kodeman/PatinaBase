// The card's click site stashes the Rooms origin via usePathname() — override
// the global jest.setup.js mock (which returns '/') so it reads as the real
// roster route.
jest.mock('next/navigation', () => ({
  usePathname: () => '/rooms',
}));

import { render, screen, fireEvent } from '@testing-library/react';
import type { RoomRosterScanRow } from '@patina/supabase';
import type { RoomGeometry, RoomRosterEntry } from '@/lib/room-view/geometry';
import { resolveRosterClientName, resolveRosterDocRef } from '@/lib/room-view/roster-from-rows';
import { readRoomOrigin, clearRoomOrigin } from '@/lib/document/room-origin';
import { RoomCard, RoomRow } from '../room-card';

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════

function makeScanRow(overrides: Partial<RoomRosterScanRow> = {}): RoomRosterScanRow {
  return {
    active_section: 'brief',
    coverage_percentage: 0.91,
    created_at: '2026-07-14T18:43:35.498894+00',
    depth_ft: 14.0092,
    document_client_name: 'Elena Ruiz',
    engagement_id: 'a7e20e55-5416-400f-8d46-fb6dc38ca82c',
    engagement_kind: 'lead',
    floor_area_sqft: 196.2577,
    name: 'Formal Dining Room',
    owner_client_name: 'Elena Ruiz',
    parse_status: 'parsed',
    quality_grade: 'excellent',
    room_type: 'dining_room',
    scan_id: '9ca186a1-07c8-429d-ac35-f10ba43fe187',
    scanned_at: '2026-07-14T18:43:35.498894+00',
    status: 'ready',
    user_id: 'a0000000-0000-0000-0000-000000000004',
    wall_height_ft: 10,
    width_ft: 14.0092,
    ...overrides,
  };
}

const BASE_ENTRY: RoomRosterEntry = {
  roomId: '9ca186a1-07c8-429d-ac35-f10ba43fe187',
  clientName: 'Elena Ruiz',
  roomType: 'dining_room',
  scanDate: '2026-07-14T18:43:35.498894+00',
  areaSqFt: 196.2577,
  dims: { w: 14.0092, d: 14.0092 },
  quality: { grade: 'excellent', coverage: 0.91 },
  docRef: { engagementKind: 'lead', engagementId: 'a7e20e55-5416-400f-8d46-fb6dc38ca82c', phaseLabel: 'Brief' },
  geometry: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// resolveRosterClientName — the fallback chain
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveRosterClientName', () => {
  it('prefers document_client_name', () => {
    const row = makeScanRow({ document_client_name: 'Elena Ruiz', owner_client_name: 'Someone Else' });
    expect(resolveRosterClientName(row)).toBe('Elena Ruiz');
  });

  it('falls back to owner_client_name when document_client_name is null', () => {
    const row = makeScanRow({ document_client_name: null, owner_client_name: 'James Okafor' });
    expect(resolveRosterClientName(row)).toBe('James Okafor');
  });

  it('falls back to the scan name when both client names are null (an orphan scan)', () => {
    const row = makeScanRow({ document_client_name: null, owner_client_name: null, name: 'Home Office' });
    expect(resolveRosterClientName(row)).toBe('Home Office');
  });

  it('returns null when nothing at all is on file', () => {
    const row = makeScanRow({ document_client_name: null, owner_client_name: null, name: null });
    expect(resolveRosterClientName(row)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveRosterDocRef — omission for an orphan scan
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveRosterDocRef', () => {
  it('builds a docRef with a capitalized phase label when an engagement is on file', () => {
    const row = makeScanRow({ engagement_id: 'eng-1', engagement_kind: 'lead', active_section: 'brief' });
    expect(resolveRosterDocRef(row)).toEqual({
      engagementKind: 'lead',
      engagementId: 'eng-1',
      phaseLabel: 'Brief',
    });
  });

  it('returns null for an orphan scan with no engagement_id', () => {
    const row = makeScanRow({ engagement_id: null, engagement_kind: null, active_section: null });
    expect(resolveRosterDocRef(row)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RoomCard — the Card with a plate slot (US-28 S10a)
// ═══════════════════════════════════════════════════════════════════════════

const DRAWN_GEOMETRY: RoomGeometry = {
  width: 12,
  depth: 15,
  wallH: 9,
  thick: 0.45,
  walls: [
    { x1: 0, z1: 0, x2: 12, z2: 0, conf: 'high', name: 'North wall', len: 12 },
    { x1: 12, z1: 0, x2: 12, z2: 15, conf: 'high', name: 'East wall', len: 15 },
    { x1: 12, z1: 15, x2: 0, z2: 15, conf: 'high', name: 'South wall', len: 12 },
    { x1: 0, z1: 15, x2: 0, z2: 0, conf: 'high', name: 'West wall', len: 15 },
  ],
  windows: [],
  doors: [],
  openings: [],
  objects: [],
  floor: [],
};

describe('RoomCard', () => {
  it('stands on the card edge: the S1 .card, never the old ink-border box', () => {
    const { container } = render(<RoomCard entry={BASE_ENTRY} />);
    const card = container.querySelector('[data-room-card]');
    expect(card).toHaveClass('card');
    expect(card?.className).not.toMatch(/doc-ink-border/);
  });

  it('prints quality as an ink word, never a graded dot', () => {
    render(<RoomCard entry={BASE_ENTRY} />);
    expect(screen.getByText('Quality excellent')).toHaveClass('word');
    expect(screen.queryByText('●')).not.toBeInTheDocument();
  });

  it('omits the quality fact when the scan carries no grade', () => {
    render(<RoomCard entry={{ ...BASE_ENTRY, quality: { grade: null, coverage: null } }} />);
    expect(screen.queryByText(/^Quality/)).not.toBeInTheDocument();
  });

  it('an undrawn room shows the silhouette plate and the ink word AWAITING DRAWING, no dashed box', () => {
    render(<RoomCard entry={BASE_ENTRY} />);
    const plate = screen.getByTestId('room-plan-thumb-placeholder');
    expect(plate).toHaveClass('plate');
    expect(plate.className).not.toMatch(/dashed/);
    expect(plate).toHaveAttribute('role', 'img');
    expect(screen.getByText('Awaiting drawing')).toHaveClass('word');
  });

  it('a drawn room holds its plan in the plate and no AWAITING DRAWING word', () => {
    render(<RoomCard entry={{ ...BASE_ENTRY, geometry: DRAWN_GEOMETRY }} />);
    expect(screen.getByTestId('room-plan-thumb')).toHaveClass('plate');
    expect(screen.queryByText('Awaiting drawing')).not.toBeInTheDocument();
    expect(screen.getByText('Dining room · plan drawn from the scan')).toBeInTheDocument();
  });

  it('names the room, not the client, and prints its size in feet and inches', () => {
    render(<RoomCard entry={BASE_ENTRY} />);
    expect(screen.getByRole('link', { name: 'Dining room' })).toBeInTheDocument();
    expect(screen.queryByText('Elena Ruiz')).not.toBeInTheDocument();
    expect(screen.getByText('14′ 0″ × 14′ 0″')).toBeInTheDocument();
    expect(screen.getByText('Room · scanned Tuesday 14 July')).toBeInTheDocument();
  });

  it('falls back to a quiet name when the room type is unknown', () => {
    render(<RoomCard entry={{ ...BASE_ENTRY, roomType: null }} />);
    expect(screen.getByRole('link', { name: 'Unnamed room' })).toBeInTheDocument();
  });

  it('the room name links to the Room View and stashes /rooms as the origin', () => {
    clearRoomOrigin();
    render(<RoomCard entry={BASE_ENTRY} />);
    const link = screen.getByRole('link', { name: 'Dining room' });
    expect(link).toHaveAttribute('href', '/room/9ca186a1-07c8-429d-ac35-f10ba43fe187');
    fireEvent.click(link);
    expect(readRoomOrigin()).toBe('/rooms');
    clearRoomOrigin();
  });
});

describe('RoomRow', () => {
  it('is a ledger row with the room name link, the state words, the size and the day', () => {
    const { container } = render(<RoomRow entry={BASE_ENTRY} />);
    expect(container.querySelector('[data-room-row]')).toHaveClass('lrow');
    expect(screen.getByRole('link', { name: 'Dining room' })).toHaveAttribute(
      'href',
      '/room/9ca186a1-07c8-429d-ac35-f10ba43fe187',
    );
    expect(screen.getByText('Awaiting drawing')).toHaveClass('word');
    expect(screen.getByText('Quality excellent')).toHaveClass('word');
    expect(screen.getByText('Scanned Tuesday 14 July')).toBeInTheDocument();
  });
});

