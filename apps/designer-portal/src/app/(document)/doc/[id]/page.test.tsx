import { render, screen } from '@testing-library/react';
import DocumentPage from './page';

let mockHydrated = false;

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
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => mockHydrated,
}));

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    data: { kind: 'missing' },
    isLoading: false,
    isFetching: false,
  }),
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useHoldDocument: jest.fn(),
}));

jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobileActiveDoc: jest.fn(),
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
});
