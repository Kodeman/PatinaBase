import { render, screen } from '@testing-library/react';
import type { Proposal } from '@patina/supabase';
import { formatCurrency } from '@patina/shared';
import { useClientProposals } from '@/hooks/use-proposals-client';
import { useClientCommercialDocument } from '@/hooks/use-commercial-client';
import { AwaitingSignatureCards } from '../awaiting-signature-cards';

jest.mock('@/hooks/use-proposals-client', () => {
  const actual = jest.requireActual('@/hooks/use-proposals-client');
  return {
    ...actual,
    useClientProposals: jest.fn(),
  };
});

jest.mock('@/hooks/use-commercial-client', () => ({
  useClientCommercialDocument: jest.fn(),
}));

const mockUseClientProposals = useClientProposals as jest.Mock;
const mockUseClientCommercialDocument = useClientCommercialDocument as jest.Mock;

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'ds-1',
    project_id: 'project-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    designer_client_id: 'dc-1',
    title: 'Whitfield design services',
    description: null,
    project_address: null,
    client_visibility_tier: null,
    total_amount: 0,
    payment_terms: null,
    payment_notes: null,
    status: 'sent',
    valid_until: null,
    sent_at: '2026-08-01T00:00:00Z',
    proposal_send_dispatch_id: null,
    viewed_at: null,
    responded_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    version: 1,
    parent_proposal_id: null,
    revision_summary: null,
    client_feedback: null,
    document_kind: 'design_services',
    commercial_state: 'sent',
    ...overrides,
  } as unknown as Proposal;
}

describe('AwaitingSignatureCards', () => {
  beforeEach(() => {
    mockUseClientCommercialDocument.mockReturnValue({ data: null, isLoading: false });
  });

  it('renders an instrument card linking to the sign flow for a pending document on this project', () => {
    mockUseClientProposals.mockReturnValue({ data: [proposal()] });
    render(<AwaitingSignatureCards projectId="project-1" />);

    expect(screen.getByText('Awaiting your signature')).toBeInTheDocument();
    expect(screen.getByText('Whitfield design services')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whitfield design services/i })).toHaveAttribute(
      'href',
      '/proposals/ds-1/sign',
    );
  });

  it('shows the total amount from the pending list, no extra round trip needed', () => {
    mockUseClientProposals.mockReturnValue({
      data: [proposal({ total_amount: 1_800_000 })],
    });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.getByText(new RegExp(formatCurrency(1_800_000).replace('$', '\\$')))).toBeInTheDocument();
  });

  it('shows the deposit due on signature for a furnishings authorization, read from the bundle', () => {
    mockUseClientProposals.mockReturnValue({
      data: [
        proposal({
          id: 'fa-1',
          title: 'Living room furnishings',
          document_kind: 'furnishings_authorization',
          total_amount: 2_400_000,
        }),
      ],
    });
    mockUseClientCommercialDocument.mockReturnValue({
      data: { furnishings: { depositRequiredCents: 1_200_000 } },
      isLoading: false,
    });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(
      screen.getByText(new RegExp(formatCurrency(2_400_000).replace('$', '\\$'))),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Deposit ${formatCurrency(1_200_000)} on signature`),
    ).toBeInTheDocument();
  });

  it('omits the deposit line rather than fake a figure when the bundle has none yet', () => {
    mockUseClientProposals.mockReturnValue({
      data: [proposal({ document_kind: 'furnishings_authorization', total_amount: 500_000 })],
    });
    mockUseClientCommercialDocument.mockReturnValue({ data: null, isLoading: true });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.queryByText(/Deposit/)).not.toBeInTheDocument();
  });

  it('excludes documents belonging to a different project', () => {
    mockUseClientProposals.mockReturnValue({
      data: [proposal({ id: 'ds-other', project_id: 'project-2' })],
    });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.queryByTestId('awaiting-signature-cards')).not.toBeInTheDocument();
  });

  it('excludes legacy proposals — they never sign in the portal', () => {
    mockUseClientProposals.mockReturnValue({
      data: [proposal({ document_kind: 'legacy', commercial_state: undefined, status: 'sent' })],
    });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.queryByTestId('awaiting-signature-cards')).not.toBeInTheDocument();
  });

  it('excludes documents that are not in the pending (sent) state', () => {
    mockUseClientProposals.mockReturnValue({
      data: [proposal({ commercial_state: 'executed', status: 'accepted' })],
    });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.queryByTestId('awaiting-signature-cards')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no data yet', () => {
    mockUseClientProposals.mockReturnValue({ data: undefined });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.queryByTestId('awaiting-signature-cards')).not.toBeInTheDocument();
  });
});
