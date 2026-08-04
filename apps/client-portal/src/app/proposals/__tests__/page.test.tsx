/**
 * Tests for the client Proposals list page (app/proposals/page.tsx).
 *
 * Regression test for a ~100x currency display bug: `proposals.total_amount`
 * is CENTS (recomputed as Σ line_total_cents — see migration 00165), but the
 * page used to format it with a local dollars-only `formatCurrency`. It now
 * uses the cents-native formatter from `@patina/shared` (the same one
 * `app/budget/page.tsx` uses) — assert a cents value renders as dollars, not
 * 100x too high.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { formatCurrency } from '@patina/shared';
import type { Proposal } from '@patina/supabase';

import ClientProposalsPage from '../page';
import { useClientProposals } from '@/hooks/use-proposals-client';

jest.mock('@/hooks/use-proposals-client', () => {
  const actual = jest.requireActual('@/hooks/use-proposals-client');
  return {
    ...actual,
    useClientProposals: jest.fn(),
  };
});

const mockUseClientProposals = useClientProposals as jest.Mock;

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal-1',
    project_id: null,
    designer_id: 'designer-1',
    client_id: 'client-1',
    title: 'Living Room Refresh',
    description: null,
    project_address: null,
    client_visibility_tier: null,
    total_amount: 750000,
    payment_terms: null,
    payment_notes: null,
    status: 'sent',
    valid_until: null,
    sent_at: '2026-01-01T00:00:00Z',
    viewed_at: null,
    responded_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Proposal;
}

describe('ClientProposalsPage', () => {
  it('renders proposal.total_amount (cents) through the cents-native formatter — not 100x too high', () => {
    mockUseClientProposals.mockReturnValue({
      data: [makeProposal({ total_amount: 750000 })],
      isLoading: false,
    });

    render(<ClientProposalsPage />);

    // 750000 cents === $7,500.00 — the old dollars-only formatter treated
    // total_amount as already-dollars and would have rendered "$750,000".
    expect(screen.getByText(formatCurrency(750000))).toBeInTheDocument();
    expect(screen.queryByText('$750,000')).not.toBeInTheDocument();
  });

  it('treats a missing/zero total_amount as zero rather than throwing', () => {
    mockUseClientProposals.mockReturnValue({
      data: [makeProposal({ total_amount: 0 })],
      isLoading: false,
    });

    render(<ClientProposalsPage />);

    expect(screen.getByText(formatCurrency(0))).toBeInTheDocument();
  });

  it('shows a retryable query failure instead of claiming there are no proposals', () => {
    const refetch = jest.fn();
    mockUseClientProposals.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<ClientProposalsPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load proposals/i);
    expect(screen.queryByText(/no proposals yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('reserves the empty state for a successful empty query', () => {
    mockUseClientProposals.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ClientProposalsPage />);

    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a client-signed design agreement as awaiting the studio', () => {
    mockUseClientProposals.mockReturnValue({
      data: [makeProposal({
        status: 'accepted',
        document_kind: 'design_services',
        commercial_state: 'client_signed',
      } as never)],
      isLoading: false,
      isError: false,
    });

    render(<ClientProposalsPage />);

    expect(screen.getByText(/design services · signed by you · awaiting studio/i)).toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(750000))).not.toBeInTheDocument();
  });
});
