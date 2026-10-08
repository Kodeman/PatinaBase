/**
 * US-19 FR8 F8-1 (design-review-8.md §2, D7) — under one-voice the phone dock
 * centre holds only the band's Next or the letterhead's Message stand-in;
 * ProposalWatch's filled "Mark signed" must stop registering as the mobile
 * primary action. Flag off is byte-identical to pre-FR8 behaviour.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ProposalWatch } from '../proposal-watch';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@patina/supabase', () => ({
  useActivateProposal: () => ({ isPending: false, mutateAsync: async () => 'project-7' }),
}));

const awaiting = {
  status: 'sent',
  awaitingClient: true,
  terminal: false,
  settled: false,
  stamp: { label: 'Sent', color: '#000', ink: '#000' },
  sentAt: null,
  openedCount: 0,
  lastOpenedAt: null,
  readingSeconds: 0,
  mostReadSectionLabel: null,
  record: [],
  isAwaitingAged: false,
  awaitingDays: 0,
  acceptedAt: null,
};
jest.mock('@/hooks/use-proposal-watch', () => ({
  useProposalWatch: () => ({ watch: awaiting }),
}));
jest.mock('@/hooks/use-proposal-project', () => ({
  useProposalProject: () => ({ data: null, isLoading: false }),
}));
jest.mock('@/hooks/use-proposals', () => ({ useProposal: () => ({ data: null }) }));

let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: mockOneVoice, isLoading: false }),
}));

jest.mock('../stamp', () => ({ Stamp: () => null }));
jest.mock('../signed-stamp', () => ({ SignedStamp: () => null }));
jest.mock('../proposal-version-history', () => ({ ProposalVersionHistory: () => null }));
jest.mock('../proposal-share-instrument', () => ({ ProposalShareInstrument: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));
jest.mock('../drafting/proposal-mirror', () => ({ ProposalPreviewRail: () => null }));
jest.mock('../overlays/send-sheet', () => ({ SendSheet: () => null }));
jest.mock('../overlays/mark-signed-sheet', () => ({ MarkSignedSheet: () => null }));

const mockUseMobilePrimaryAction = jest.fn();
jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: (...args: unknown[]) => mockUseMobilePrimaryAction(...args),
}));
jest.mock('../mobile/lifecycle-mobile-action', () => ({
  MOBILE_ACTION_PRIORITY: { lifecycle: 1 },
  signedProposalMobileAction: () => null,
}));
jest.mock('../document-action', () => ({
  DocumentActionGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DocumentActionRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DocumentAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

beforeEach(() => {
  mockOneVoice = false;
  mockUseMobilePrimaryAction.mockClear();
});

describe('ProposalWatch — F8-1 phone dock centre under one-voice', () => {
  it('one-voice ON: a sent, unsettled watch registers no primary action', () => {
    mockOneVoice = true;
    render(<ProposalWatch proposalId="proposal-1" clientName="Ana Reyes" />);
    const lastCall =
      mockUseMobilePrimaryAction.mock.calls[mockUseMobilePrimaryAction.mock.calls.length - 1];
    expect(lastCall[0]).toBeNull();
  });

  it('one-voice OFF: the same watch registers Mark signed, unchanged', () => {
    mockOneVoice = false;
    render(<ProposalWatch proposalId="proposal-1" clientName="Ana Reyes" />);
    const lastCall =
      mockUseMobilePrimaryAction.mock.calls[mockUseMobilePrimaryAction.mock.calls.length - 1];
    expect(lastCall[0]).toMatchObject({ actionKey: 'mark-proposal-signed' });
  });
});
