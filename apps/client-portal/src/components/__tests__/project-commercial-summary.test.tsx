import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectCommercialSummary } from '../project-commercial-summary';
import {
  useAcknowledgeBudgetCheckpoint,
  useProjectCommercialSummary,
} from '@/hooks/use-commercial-client';

jest.mock('@/hooks/use-commercial-client', () => ({
  useProjectCommercialSummary: jest.fn(),
  useAcknowledgeBudgetCheckpoint: jest.fn(),
}));

const mockSummary = useProjectCommercialSummary as jest.Mock;
const mockAcknowledge = useAcknowledgeBudgetCheckpoint as jest.Mock;

describe('ProjectCommercialSummary', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockReset();
    mockAcknowledge.mockReturnValue({ mutate, isPending: false, isSuccess: false, error: null });
    mockSummary.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        authority: {
          id: 'a1', projectId: 'p1', agreementId: 'ds1', state: 'active', currency: 'USD',
          ceilingCents: 1_800_000, authorizedCents: 1_800_000, accruedCents: 600_000,
          invoicedCents: 300_000, pendingAuthorizationCents: 50_000, remainingCents: 1_200_000,
          retainerAmountCents: 300_000, retainerPaidCents: 300_000,
          retainerActivationPolicy: 'retainer_paid', activeRateVersion: 1, billingThrough: null,
          rates: [],
        },
        workingBudget: {
          id: 'b1', projectId: 'p1', version: 3, state: 'published', currency: 'USD',
          lowTotalCents: 5_400_000, targetTotalCents: 7_400_000, highTotalCents: 9_800_000,
          lines: [], checkpoint: { id: 'c1', state: 'published', publishedAt: '2026-08-01', acknowledgedAt: null, overrideReason: null, evidenceFingerprint: null },
        },
        furnishingsAuthorizations: [],
      },
    });
  });

  it('renders a curated services summary and the authorization ceiling posture', () => {
    render(<ProjectCommercialSummary projectId="p1" />);
    expect(screen.getByText('$12,000 remaining')).toBeInTheDocument();
    expect(screen.getByText(/\$500 of captured work is pending additional authorization/i)).toBeInTheDocument();
  });

  it('labels the working-budget checkpoint as nonbinding and calls the acknowledgement boundary', () => {
    render(<ProjectCommercialSummary projectId="p1" />);
    expect(screen.getByText(/does not authorize the studio to purchase anything/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /acknowledge working budget/i }));
    expect(mutate).toHaveBeenCalledWith('c1');
  });
});
