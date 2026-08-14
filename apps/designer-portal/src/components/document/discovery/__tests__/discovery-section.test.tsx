/**
 * DiscoverySection — the "View the scan" door (I74a / A2 wiring, rev1-NAV-1).
 * discovery-section.tsx always appends `docId=${engagementId}` (a required,
 * non-nullable prop here — unlike letterhead-instruments.tsx's optional
 * one), so this only needs to pin the URL shape once the block's own
 * `room_scan_id` is present. Everything else the component pulls in
 * (the schedule line, the call plan, every block editor) is mocked out —
 * `FacetSection` keeps its own editors unmounted while closed (bodyMounted
 * stays false until first opened), so the editors are never exercised here
 * and don't need mocking themselves; only the eagerly-mounted schedule line
 * and call plan do.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { DiscoverySection } from '../discovery-section';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/doc/engagement-1',
}));

let mockDiscoveryRow: Record<string, unknown> | null = null;
jest.mock('@patina/supabase', () => ({
  useDiscovery: () => ({ data: { row: mockDiscoveryRow, prefill: null } }),
  useUpsertDiscovery: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined) }),
  useBeginDirection: () => ({ mutate: jest.fn(), isPending: false }),
  useStyles: () => ({ data: [] }),
  useClientRoomScans: () => ({ data: [] }),
}));

jest.mock('../discovery-schedule-line', () => ({
  DiscoveryScheduleLine: () => null,
}));

jest.mock('../call-plan', () => ({
  CallPlan: () => null,
}));

describe('DiscoverySection — the "View the scan" door', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockDiscoveryRow = null;
  });

  it('pushes /room/<scanId>?from=document&docId=<engagementId> (A2 — scopes back to the current document)', () => {
    mockDiscoveryRow = { room_scan_id: 'scan-99' };

    render(
      <DiscoverySection
        engagementId="engagement-1"
        designerId="designer-1"
        clientProfileId="client-1"
        clientName="The Ellsworths"
      />,
    );

    const door = screen.getByText('View the scan');
    fireEvent.click(door);

    expect(mockPush).toHaveBeenCalledWith('/room/scan-99?from=document&docId=engagement-1');
  });

  it('never renders the door (and never navigates) when the block has no room_scan_id yet', () => {
    mockDiscoveryRow = { room_scan_id: null };

    render(
      <DiscoverySection
        engagementId="engagement-1"
        designerId="designer-1"
        clientProfileId="client-1"
        clientName="The Ellsworths"
      />,
    );

    expect(screen.queryByText('View the scan')).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
