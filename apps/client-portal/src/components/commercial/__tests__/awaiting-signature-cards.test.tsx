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

  it('labels a pending trade scope as "Trade scope", not the generic Document fallback', () => {
    mockUseClientProposals.mockReturnValue({
      data: [proposal({ id: 'trade-1', title: 'Whitfield tile work', document_kind: 'trade_scope', commercial_state: 'sent' })],
    });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.getByText('Trade scope')).toBeInTheDocument();
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

  // A trade scope has no per-document depositPercent (that figure is
  // furnishings-only) — its deposit is the first draw in its own schedule
  // (sortOrder 0, "Deposit · on signature"). Before this fix the card only
  // ever read bundle.furnishings, so a client with a pending trade scope saw
  // a total and no deposit at all.
  it('shows the deposit due on signature for a trade scope, read from its first draw', () => {
    mockUseClientProposals.mockReturnValue({
      data: [
        proposal({
          id: 'trade-1',
          title: 'Whitfield tile work',
          document_kind: 'trade_scope',
          total_amount: 1_200_000,
        }),
      ],
    });
    mockUseClientCommercialDocument.mockReturnValue({
      data: {
        tradeScope: {
          draws: [
            { id: 'draw-1', label: 'Deposit', percentage: 25, amountCents: 300_000, sortOrder: 0, gatesOnAcceptance: false, invoiceId: null, invoiceStatus: null, invoicePaidCents: 0 },
            { id: 'draw-2', label: 'Final', percentage: 75, amountCents: 900_000, sortOrder: 1, gatesOnAcceptance: true, invoiceId: null, invoiceStatus: null, invoicePaidCents: 0 },
          ],
        },
      },
      isLoading: false,
    });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(
      screen.getByText(new RegExp(formatCurrency(1_200_000).replace('$', '\\$'))),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Deposit ${formatCurrency(300_000)} on signature`),
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

  // The defect this fences, from the DB side. A furnishings authorization is
  // minted straight from the schedule and never runs through
  // activate_proposal_as_project, so proposals.project_id stays NULL on it —
  // its binding lives in project_commercial_documents. list_client_proposals
  // now COALESCEs the two into the projected `project_id`, which is the key
  // this card filters on. Before the graft the row arrived with no project at
  // all and the card rendered for nobody. The SQL fence for the coalesce itself
  // is section (1c) of supabase/tests/commercial/authorized_schedule_test.sql;
  // this one pins the shape the portal is handed.
  it('renders a furnishings authorization bound through project_commercial_documents', () => {
    mockUseClientProposals.mockReturnValue({
      data: [
        proposal({
          id: 'fa-1',
          title: 'Release one',
          document_kind: 'furnishings_authorization',
          project_id: 'project-1',
          total_amount: 700_000,
        }),
      ],
    });
    render(<AwaitingSignatureCards projectId="project-1" />);

    expect(screen.getByText('Release one')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /release one/i })).toHaveAttribute(
      'href',
      '/proposals/fa-1/sign',
    );
  });

  it('excludes a document the list could not bind to any project at all', () => {
    const row = proposal({
      id: 'fa-2',
      document_kind: 'furnishings_authorization',
    }) as unknown as Record<string, unknown>;
    // jsonb_strip_nulls drops the key entirely when both sides of the COALESCE
    // are NULL. Absent must never read as "belongs to the project I'm on".
    delete row.project_id;
    mockUseClientProposals.mockReturnValue({ data: [row] });
    render(<AwaitingSignatureCards projectId="project-1" />);
    expect(screen.queryByTestId('awaiting-signature-cards')).not.toBeInTheDocument();
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
