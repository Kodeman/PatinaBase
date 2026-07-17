// The card's click site stashes the Rooms origin via usePathname() — override
// the global jest.setup.js mock (which returns '/') so it reads as the real
// roster route.
jest.mock('next/navigation', () => ({
  usePathname: () => '/rooms',
}));

import { render, screen, fireEvent } from '@testing-library/react';
import type { RoomRosterScanRow } from '@patina/supabase';
import type { RoomRosterEntry } from '@/lib/room-view/geometry';
import { resolveRosterClientName, resolveRosterDocRef } from '@/lib/room-view/roster-from-rows';
import { readRoomOrigin, clearRoomOrigin } from '@/lib/document/room-origin';
import { RoomCard } from '../room-card';

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
// RoomCard — pure-props rendering
// ═══════════════════════════════════════════════════════════════════════════

describe('RoomCard', () => {
  it('renders the docref line as a link to the document when docRef is present', () => {
    render(<RoomCard entry={BASE_ENTRY} />);
    // Exact match: the outer whole-card link's accessible name also CONTAINS
    // this text (it concatenates every descendant), so a substring match
    // would ambiguously hit both links.
    const docLink = screen.getByRole('link', { name: '→ the document · Brief' });
    expect(docLink).toHaveAttribute('href', '/doc/a7e20e55-5416-400f-8d46-fb6dc38ca82c');
  });

  it('omits the docref line entirely for an orphan scan (docRef null)', () => {
    render(<RoomCard entry={{ ...BASE_ENTRY, docRef: null }} />);
    expect(screen.queryByText(/the document/i)).not.toBeInTheDocument();
  });

  it('falls back to a quiet placeholder when the client name is unresolved', () => {
    render(<RoomCard entry={{ ...BASE_ENTRY, clientName: null }} />);
    // Appears twice: the visible name line, and the stretched card link's
    // sr-only accessible-name span (see the next test).
    expect(screen.getAllByText('Unnamed room').length).toBeGreaterThan(0);
  });

  it('the whole card links to the Room View, not just the docref line', () => {
    render(<RoomCard entry={BASE_ENTRY} />);
    const cardLink = screen.getByRole('link', { name: 'Open the room for Elena Ruiz' });
    expect(cardLink).toHaveAttribute('href', '/room/9ca186a1-07c8-429d-ac35-f10ba43fe187');
  });

  it('stashes /rooms as the room origin when the card is clicked (Phase-2 gate fix)', () => {
    clearRoomOrigin();
    render(<RoomCard entry={BASE_ENTRY} />);
    const cardLink = screen.getByRole('link', { name: 'Open the room for Elena Ruiz' });
    fireEvent.click(cardLink);
    // Previously a no-op (isRoomPath('/rooms') blocked the stash) — the
    // origin silently stayed '/desk' and the leave affordance read
    // "← the Desk" instead of "← the Rooms".
    expect(readRoomOrigin()).toBe('/rooms');
    clearRoomOrigin();
  });
});
