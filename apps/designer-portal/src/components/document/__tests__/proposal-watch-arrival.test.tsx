/**
 * US-14 §4c(e) — a proposal becoming its project is the same engagement: MarkSigned's walk into
 * the new project, the seal's activation and the seal's link into an open project are each
 * announced with `suppressNextArrival`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { consumeSuppressed } from '@/lib/arrival/nav';
import { ProposalWatch } from '../proposal-watch';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
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
let mockWatch: Record<string, unknown> = awaiting;
jest.mock('@/hooks/use-proposal-watch', () => ({
  useProposalWatch: () => ({ watch: mockWatch }),
}));
let mockProjectLink: { projectId: string } | null = null;
jest.mock('@/hooks/use-proposal-project', () => ({
  useProposalProject: () => ({ data: mockProjectLink, isLoading: false }),
}));
jest.mock('@/hooks/use-proposals', () => ({ useProposal: () => ({ data: null }) }));

jest.mock('../stamp', () => ({ Stamp: () => null }));
jest.mock('../signed-stamp', () => ({ SignedStamp: () => null }));
jest.mock('../proposal-version-history', () => ({ ProposalVersionHistory: () => null }));
jest.mock('../proposal-share-instrument', () => ({ ProposalShareInstrument: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));
jest.mock('../drafting/proposal-mirror', () => ({ ProposalPreviewRail: () => null }));
jest.mock('../overlays/send-sheet', () => ({ SendSheet: () => null }));
jest.mock('../overlays/mark-signed-sheet', () => ({
  MarkSignedSheet: ({ open, onSigned }: { open: boolean; onSigned: (id: string) => void }) =>
    open ? (
      <button type="button" onClick={() => onSigned('project-5')}>
        Mock signed
      </button>
    ) : null,
}));
jest.mock('../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
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
  mockPush.mockClear();
  mockWatch = awaiting;
  mockProjectLink = null;
  consumeSuppressed('/doc/project-5');
  consumeSuppressed('/doc/project-7');
  consumeSuppressed('/doc/project-9');
});

describe('ProposalWatch — the proposal becoming its project (US-14)', () => {
  it('Mark signed walks into the new project, announced', () => {
    render(<ProposalWatch proposalId="proposal-1" clientName="Ana Reyes" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark signed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock signed' }));
    expect(mockPush).toHaveBeenCalledWith('/doc/project-5');
    expect(consumeSuppressed('/doc/project-5')).toBe(true);
  });

  it("the seal's Open the project activates and walks in, announced", async () => {
    mockWatch = { ...awaiting, status: 'accepted', awaitingClient: false, settled: true };
    render(<ProposalWatch proposalId="proposal-1" clientName="Ana Reyes" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/doc/project-7'));
    expect(consumeSuppressed('/doc/project-7')).toBe(true);
  });

  it("the seal's link into the project already open is announced on click", () => {
    mockWatch = { ...awaiting, status: 'accepted', awaitingClient: false, settled: true };
    mockProjectLink = { projectId: 'project-9' };
    render(<ProposalWatch proposalId="proposal-1" clientName="Ana Reyes" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
    expect(consumeSuppressed('/doc/project-9')).toBe(true);
  });
});
