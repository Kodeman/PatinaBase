/**
 * CeremonyArrival — door-navigation intent (I74a / W2-T5). Props-only
 * component (lead/scans/tags all passed in, no data hooks of its own), so the
 * only mock needed is `next/navigation`'s router — a cheap target per
 * patina-testing's "pure component" guidance. Covers both scan doors: the
 * primary "tap to walk it" frame and a secondary thumbnail.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import type { Lead, LeadRoomScan } from '@patina/supabase';
import { CeremonyArrival } from '../ceremony-arrival';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const baseLead: Lead = {
  id: 'lead-1',
  homeowner_id: null,
  designer_id: 'designer-1',
  project_type: 'living_room',
  project_description: 'A quiet reading corner.',
  budget_range: '10k_25k',
  timeline: 'this_quarter',
  location_city: 'Austin',
  location_state: 'TX',
  location_zip: null,
  match_score: null,
  match_reasons: [],
  status: 'accepted',
  response_deadline: null,
  contacted_at: null,
  accepted_at: null,
  declined_at: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  contact_name: null,
  contact_email: null,
  source: null,
};

function scanRow(overrides: Partial<LeadRoomScan> & { id: string; scan_id: string }): LeadRoomScan {
  return {
    lead_id: 'lead-1',
    is_primary: false,
    position: 0,
    created_at: '2026-07-01T00:00:00Z',
    scan: {
      id: overrides.scan_id,
      name: 'Living room scan',
      room_type: 'living_room',
      thumbnail_url: 'https://example.com/thumb.jpg',
      floor_area: 220,
      dimensions: null,
      status: 'parsed',
      model_url: 'https://example.com/model.glb',
      model_url_gltf: null,
      suggested_styles: null,
    },
    ...overrides,
  };
}

describe('CeremonyArrival — scan doors navigate to the Room View', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('the primary scan frame ("Tap to walk it") pushes /room/<scanId>?from=document&docId=<lead.id> (A2)', () => {
    const scans = [scanRow({ id: 'row-1', scan_id: 'scan-primary', is_primary: true })];
    render(<CeremonyArrival lead={baseLead} scans={scans} tags={[]} />);

    fireEvent.click(screen.getByText('Tap to walk it').closest('button')!);
    expect(mockPush).toHaveBeenCalledWith('/room/scan-primary?from=document&docId=lead-1');
  });

  it('a secondary scan thumbnail pushes its own /room/<scanId>?from=document&docId=<lead.id> (A2)', () => {
    const scans = [
      scanRow({ id: 'row-1', scan_id: 'scan-primary', is_primary: true }),
      scanRow({ id: 'row-2', scan_id: 'scan-secondary' }),
    ];
    render(<CeremonyArrival lead={baseLead} scans={scans} tags={[]} />);

    fireEvent.click(screen.getByTitle('Living room scan'));
    expect(mockPush).toHaveBeenCalledWith('/room/scan-secondary?from=document&docId=lead-1');
  });

  it('does not navigate anywhere when the lead has no scans', () => {
    render(<CeremonyArrival lead={baseLead} scans={[]} tags={[]} />);
    expect(screen.queryByText('Tap to walk it')).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
