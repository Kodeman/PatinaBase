/**
 * J1 — Begin the Direction moves the document's IDENTITY from the relationship
 * (designer_clients.id, document_state shape D) to the proposal chain (shape B,
 * 00327). The instant the draft proposal exists, /doc/<designerClientId> stops
 * resolving, so the act must land on the successor id the RPC returns — and
 * must keep reading as in-flight until it does.
 * See apps/designer-portal/src/components/document/discovery/discovery-section.tsx.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiscoverySection } from './discovery-section';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockBeginDirectionMutateAsync = jest.fn();
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
    mutateAsync: mockBeginDirectionMutateAsync,
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
    mockReplace.mockClear();
    mockBeginDirectionMutateAsync.mockReset();
    mockUpsertMutateAsync.mockClear();
  });

  it('lands on the successor document id the RPC returns, not the standalone drafting route', async () => {
    mockBeginDirectionMutateAsync.mockResolvedValue('proposal-9');

    render(<DiscoverySection {...PROPS} />);

    const beginButton = screen.getByRole('button', { name: 'Begin the Direction' });
    expect(beginButton).toBeEnabled();

    fireEvent.click(beginButton);

    await waitFor(() =>
      expect(mockBeginDirectionMutateAsync).toHaveBeenCalledWith({
        designerClientId: 'engagement-1',
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/doc/proposal-9'));
    // The old relationship id is a dead end from this instant — never pushed,
    // and never routed to the standalone drafting room.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/drafting\//),
    );
    expect(mockReplace).not.toHaveBeenCalledWith('/doc/engagement-1');
  });

  it('holds the act in-flight until the navigation is issued', async () => {
    let resolveBegin: (id: string) => void = () => undefined;
    mockBeginDirectionMutateAsync.mockImplementation(
      () => new Promise<string>((resolve) => { resolveBegin = resolve; }),
    );

    render(<DiscoverySection {...PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Begin the Direction' }));

    // The RPC is still open: the act reads as in-flight rather than idle.
    const opening = await screen.findByRole('button', { name: 'Opening…' });
    expect(opening).toBeDisabled();

    resolveBegin('proposal-9');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/doc/proposal-9'));
    // Still held after the RPC resolved — the surface is gone only when the
    // successor document mounts and this component unmounts.
    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled();
  });

  it('renders a quiet inline error, not a navigation, when the act fails', async () => {
    mockBeginDirectionMutateAsync.mockRejectedValue({
      message: 'discovery not ready: the five essentials must be captured',
    });

    render(<DiscoverySection {...PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Begin the Direction' }));

    expect(
      await screen.findByText('discovery not ready: the five essentials must be captured'),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    // The act releases so the inline retry is reachable.
    expect(screen.getByRole('button', { name: 'Begin the Direction' })).toBeEnabled();
  });
});
