import { fireEvent, render, screen } from '@testing-library/react';
import DocumentPage from './page';

let mockHydrated = false;
const mockRetryDocumentResolution = jest.fn();
let mockDocumentQuery: Record<string, unknown>;

jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: undefined }),
  useProjectPhases: () => ({ data: [] }),
  useProposalFeedback: () => ({ data: [] }),
  useProjectRoster: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => mockHydrated,
}));

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => mockDocumentQuery,
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useHoldDocument: jest.fn(),
}));

jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobileActiveDoc: jest.fn(),
}));

jest.mock('@/components/document/phase-timeline', () => ({
  PhaseTimeline: ({ projectId }: { projectId: string }) => (
    <div data-testid="legacy-schedule">Legacy schedule · {projectId}</div>
  ),
}));

jest.mock('@/components/document/schedule/schedule-rule', () => ({
  ScheduleRule: ({
    projectId,
    projectTitle,
  }: {
    projectId: string;
    projectTitle: string;
  }) => (
    <div data-testid="schedule-rule">
      Schedule rule · {projectId} · {projectTitle}
    </div>
  ),
}));

jest.mock('@/components/document/schedule/schedule-confirm-strip', () => ({
  ScheduleConfirmStrip: ({ projectId }: { projectId: string }) => (
    <div data-testid="schedule-confirm">Confirm schedule · {projectId}</div>
  ),
}));

jest.mock('@/components/document/phase-advance-control', () => ({
  PhaseAdvanceControl: ({
    projectId,
    phases,
  }: {
    projectId: string;
    phases: readonly unknown[] | undefined;
  }) => (
    <div data-testid="phase-handoffs">
      Phase handoffs · {projectId} · {phases?.length ?? 0}
    </div>
  ),
}));

jest.mock('@/hooks/use-document-presence', () => ({
  useDocumentPresence: () => [],
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: undefined }),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-section-work', () => ({
  gateState: jest.fn(),
  useSectionGates: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  rememberDocumentInHand: jest.fn(),
}));

const fulfilledParams = {
  status: 'fulfilled',
  value: { id: 'missing-document' },
  then: () => undefined,
} as unknown as Promise<{ id: string }>;

describe('DocumentPage hydration render behavior', () => {
  beforeEach(() => {
    mockHydrated = false;
    mockRetryDocumentResolution.mockReset();
    mockDocumentQuery = {
      data: { kind: 'missing' },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: mockRetryDocumentResolution,
    };
  });

  it('keeps a warm non-loading client result on the server loading tree until hydration', () => {
    const { rerender } = render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByText('Picking up…')).toBeVisible();
    expect(screen.queryByText('No document answers to this name.')).not.toBeInTheDocument();

    mockHydrated = true;
    rerender(<DocumentPage params={fulfilledParams} />);

    expect(screen.queryByText('Picking up…')).not.toBeInTheDocument();
    expect(screen.getByText('No document answers to this name.')).toBeVisible();
  });

  it('offers a retry instead of hanging when document resolution fails', () => {
    mockHydrated = true;
    mockDocumentQuery = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch: mockRetryDocumentResolution,
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.queryByText('Picking up…')).not.toBeInTheDocument();
    expect(screen.getByText('This document could not be picked up.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRetryDocumentResolution).toHaveBeenCalledTimes(1);
  });
});
