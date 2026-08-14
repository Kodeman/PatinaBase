/**
 * J1 — Begin-the-Direction must not hard-navigate to the standalone
 * `/drafting/[id]` route. The doc's own Direction section (doc/[id]/page.tsx)
 * is real, and useBeginDirection's own onSuccess already invalidates the
 * document-state query the page reads its active_section from — so the page
 * re-renders the Direction section in place once that refetch resolves. See
 * apps/designer-portal/src/components/document/discovery/discovery-section.tsx.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiscoverySection } from './discovery-section';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockBeginDirectionMutate = jest.fn();
const mockUpsertMutateAsync = jest.fn().mockResolvedValue({});

// A fully-ready discovery row — all five essentials captured, so the
// Begin-the-Direction button is enabled without needing to open (and
// mount) any of the block editors.
const READY_ROW = {
  id: 'disc-1',
  designer_client_id: 'engagement-1',
  designer_id: 'designer-1',
  project_type: 'full_room',
  rooms: [{ name: 'Living Room' }],
  budget_min_cents: 3_000_000,
  budget_max_cents: 5_000_000,
  budget_basis: null,
  target_date: '2026-12-01',
  hard_date: null,
  start_urgency: null,
  style_tag_ids: ['tag-1'],
  style_keywords: [],
  lifestyle: [{ room: 'Household', who: 'A family of four', how: 'Daily living' }],
  keep_items: [],
  avoid_items: [],
  decision_makers: [],
  site_notes: null,
  room_scan_id: null,
  ready_at: null,
  seeded_proposal_id: null,
  seeded_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

jest.mock('@patina/supabase', () => ({
  useDiscovery: () => ({ data: { row: READY_ROW, prefill: null } }),
  useUpsertDiscovery: () => ({ mutateAsync: mockUpsertMutateAsync }),
  useBeginDirection: () => ({
    mutate: mockBeginDirectionMutate,
    isPending: false,
  }),
  useStyles: () => ({ data: [] }),
  useClientRoomScans: () => ({ data: [] }),
}));

// Not the subject of this test — stub out the two always-mounted siblings so
// their own hook surfaces (margin notes, ceremony scheduling) don't need
// mocking here. Both render null when their own `open`/data gates are
// closed/absent in real use, same effective behavior.
jest.mock('./call-plan', () => ({
  CallPlan: () => null,
}));
jest.mock('./discovery-schedule-line', () => ({
  DiscoveryScheduleLine: () => null,
}));

const PROPS = {
  engagementId: 'engagement-1',
  designerId: 'designer-1',
  clientProfileId: 'client-profile-1',
  clientName: 'Harper Vale',
};

describe('DiscoverySection — Begin the Direction (J1)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBeginDirectionMutate.mockClear();
    mockUpsertMutateAsync.mockClear();
  });

  it('calls the mutation and does not navigate to the standalone drafting route', async () => {
    render(<DiscoverySection {...PROPS} />);

    const beginButton = screen.getByRole('button', { name: 'Begin the Direction' });
    expect(beginButton).toBeEnabled();

    fireEvent.click(beginButton);

    await waitFor(() => expect(mockBeginDirectionMutate).toHaveBeenCalledWith(
      { designerClientId: 'engagement-1' },
      expect.any(Object),
    ));

    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/drafting\//),
    );
  });

  it('never calls router.push at all on a successful begin', async () => {
    // Simulate useBeginDirection's mutate calling the passed onSuccess, the
    // way React Query actually does — proving that even when the act
    // succeeds, nothing here navigates away from the doc page.
    mockBeginDirectionMutate.mockImplementation((_input, callbacks) => {
      callbacks?.onSuccess?.('new-proposal-id');
    });

    render(<DiscoverySection {...PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Begin the Direction' }));

    await waitFor(() => expect(mockBeginDirectionMutate).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders a quiet inline error, not a navigation, when the act fails', async () => {
    mockBeginDirectionMutate.mockImplementation((_input, callbacks) => {
      callbacks?.onError?.({ message: 'discovery not ready: the five essentials must be captured' });
    });

    render(<DiscoverySection {...PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Begin the Direction' }));

    expect(
      await screen.findByText('discovery not ready: the five essentials must be captured'),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
