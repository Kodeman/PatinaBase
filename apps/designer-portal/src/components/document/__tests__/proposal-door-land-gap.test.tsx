/**
 * US-19 FR3 F3-2 (510-6, `one-voice`) — the band's `Write the proposal`
 * (focusId `ACT_TARGET_IDS.contractRoomDoor`, activate) resolves to the
 * Direction card's door, which walks into the Drafting Room at `?land=gap`.
 * With the flag off the door carries no id and walks in as before.
 *
 * The mocking shape is direction-card-390.test.tsx's.
 */
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_TARGET_IDS } from '@/lib/document/act-names';
import { ProposalInstruments } from '../proposal-instruments';

let mockOneVoice = true;
const mockPush = jest.fn();
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));
jest.mock('@patina/supabase', () => ({ useProposalFeedback: () => ({ data: [] }) }));
jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({
    data: { id: 'proposal-1', status: 'draft', document_kind: 'legacy', project_id: null },
    isLoading: false,
  }),
  useProposalEngagement: () => ({ data: [] }),
  useProposalEngagementStats: () => ({ data: null }),
  useNudgeProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({ state: 'Drafting', pct: 40, fill: [1, 0, 0], gaps: ['a palette'] }),
}));
jest.mock('../proposal-watch', () => ({ ProposalWatch: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../proposal-version-history', () => ({ ProposalVersionHistory: () => null }));
jest.mock('../overlays/share-sheet', () => ({ ShareSheet: () => null }));
jest.mock('../commercial/service-agreement-instruments', () => ({
  ServiceAgreementInstruments: () => null,
}));
jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
  useMobileSecondaryAction: jest.fn(),
}));
jest.mock('@/lib/document/room-origin', () => ({ rememberRoomOrigin: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: jest.fn() }),
  usePathname: () => '/doc/proposal-1',
}));

function renderCard() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProposalInstruments proposalId="proposal-1" clientName="Elena Marlowe" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockOneVoice = true;
  mockPush.mockClear();
});

describe('Write the proposal walks in at the first gap (F3-2, 510-6)', () => {
  it('the band’s target id is the door, and the door walks in at ?land=gap', () => {
    renderCard();
    const door = document.getElementById(ACT_TARGET_IDS.contractRoomDoor);
    expect(door).toBe(screen.getByRole('button', { name: /Write the proposal/ }));
    // What the page's anchor landing does with `activate: true`.
    act(() => door?.click());
    expect(mockPush).toHaveBeenCalledWith('/drafting/proposal-1?land=gap');
  });

  it('keeps Continue drafting, no id, and the plain walk-in with one-voice off', () => {
    mockOneVoice = false;
    renderCard();
    expect(document.getElementById(ACT_TARGET_IDS.contractRoomDoor)).toBeNull();
    act(() => screen.getByRole('button', { name: /Continue drafting/ }).click());
    expect(mockPush).toHaveBeenCalledWith('/drafting/proposal-1');
  });
});
