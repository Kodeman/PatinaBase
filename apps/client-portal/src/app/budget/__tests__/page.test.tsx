/**
 * Tests for the client Budget & payments page.
 *
 * Data-fetch hooks (@patina/supabase, @/hooks/use-auth) are mocked so each
 * test controls loading/error/data state directly. @patina/design-system is
 * mocked too — its barrel transitively pulls in an ESM-only dependency that
 * Jest's transform can't handle (see project memory: "Jest paths-mapped mock
 * gotcha") — with a small stub that mirrors PaymentScheduleBlock's real
 * fallback-amount math (amount_cents, else percentage of totalCents) so
 * milestone-rendering assertions stay meaningful.
 */

import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { formatCurrency } from '@patina/shared';
import type { Invoice } from '@patina/supabase';

jest.mock('@patina/design-system', () => ({
  PaymentScheduleBlock: ({
    milestones,
    totalCents,
  }: {
    milestones: Array<{
      label: string;
      percentage: number;
      amount_cents: number;
      trigger_condition: string | null;
    }>;
    totalCents: number;
  }) => (
    <div data-testid="payment-schedule-block">
      {milestones.length === 0 ? (
        <p>Payment schedule to be confirmed.</p>
      ) : (
        milestones.map((m, i) => {
          const amountCents =
            m.amount_cents > 0 ? m.amount_cents : Math.round((totalCents * m.percentage) / 100);
          return (
            <div key={i} data-testid="payment-schedule-row">
              <span>{m.label}</span>
              {m.trigger_condition && <span>{m.trigger_condition}</span>}
              <span>{amountCents / 100}</span>
              <span>{m.percentage}%</span>
            </div>
          );
        })
      )}
    </div>
  ),
}));

const mockUseProjects = jest.fn();
const mockUseProposals = jest.fn();
const mockUseProjectInvoices = jest.fn();
const mockUseProposalPaymentMilestones = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjects: () => mockUseProjects(),
  useProposals: (filters: unknown) => mockUseProposals(filters),
  useProposal: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectInvoices: (projectId: string) => mockUseProjectInvoices(projectId),
  useProposalPaymentMilestones: (proposalId: string) => mockUseProposalPaymentMilestones(proposalId),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'client-1' }, isAuthenticated: true, isLoading: false }),
}));

import ClientBudgetPage from '../page';

const project1 = { id: 'proj-1', name: 'Lakeside Retreat' };
const project2 = { id: 'proj-2', name: 'Downtown Loft' };

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    project_id: 'proj-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    title: 'Full Home Design',
    description: null,
    project_address: null,
    client_visibility_tier: 'full',
    total_amount: 4500000, // $45,000.00 in cents
    payment_terms: null,
    payment_notes: null,
    status: 'accepted',
    valid_until: null,
    sent_at: '2026-01-01T00:00:00Z',
    viewed_at: null,
    responded_at: '2026-01-05T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
    version: 1,
    parent_proposal_id: null,
    revision_summary: null,
    client_feedback: null,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    project_id: 'proj-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'INV-0001',
    status: 'sent',
    issue_date: '2026-01-01',
    due_date: '2026-02-01',
    payment_terms_days: 15,
    currency: 'USD',
    subtotal_cents: 100000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 100000,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-01-01T00:00:00Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ms-1',
    proposal_id: 'prop-1',
    phase_id: null,
    label: 'Design deposit',
    percentage: 50,
    amount_cents: 2250000,
    trigger_condition: 'Due at signing',
    sort_order: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseProjects.mockReturnValue({ data: [project1], isLoading: false, isError: false });
  mockUseProposals.mockReturnValue({ data: [makeProposal()], isLoading: false, isError: false });
  mockUseProjectInvoices.mockReturnValue({ data: [], isLoading: false, isError: false });
  mockUseProposalPaymentMilestones.mockReturnValue({
    data: [makeMilestone()],
    isLoading: false,
    isError: false,
  });
});

describe('ClientBudgetPage', () => {
  it('shows a loading spinner while projects or proposals are still loading', () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ClientBudgetPage />);
    expect(screen.getByTestId('budget-loading')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: project1.name })).not.toBeInTheDocument();
  });

  it("renders a heading for each of the client's projects", () => {
    mockUseProjects.mockReturnValue({
      data: [project1, project2],
      isLoading: false,
      isError: false,
    });
    mockUseProposals.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ClientBudgetPage />);
    expect(screen.getByRole('heading', { name: project1.name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: project2.name })).toBeInTheDocument();
  });

  it('shows an empty state when the client has no projects yet', () => {
    mockUseProjects.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ClientBudgetPage />);
    expect(screen.getByTestId('budget-empty')).toBeInTheDocument();
  });

  it('shows a page-level error message when the project list fails to load', () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ClientBudgetPage />);
    expect(screen.getByTestId('budget-error')).toBeInTheDocument();
  });

  it('shows the "no accepted proposal" empty state for a project without one', () => {
    mockUseProposals.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ClientBudgetPage />);
    expect(
      screen.getByText(/your investment summary will appear once you accept a proposal/i)
    ).toBeInTheDocument();
  });

  it('shows a distinct message when the proposals fetch itself fails, instead of claiming none was accepted', () => {
    mockUseProposals.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ClientBudgetPage />);
    expect(
      screen.queryByText(/your investment summary will appear once you accept a proposal/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/couldn.t load your proposals/i)).toBeInTheDocument();
  });

  it('shows the investment summary total for an accepted proposal', () => {
    render(<ClientBudgetPage />);
    expect(screen.getByText(formatCurrency(4500000))).toBeInTheDocument();
    expect(screen.getByText('Full Home Design')).toBeInTheDocument();
  });

  it('passes the milestones and proposal total through to the payment schedule', () => {
    mockUseProposalPaymentMilestones.mockReturnValue({
      data: [
        makeMilestone({
          label: 'Design deposit',
          percentage: 50,
          amount_cents: 2250000,
          trigger_condition: 'Due at signing',
        }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);
    expect(screen.getByText('Design deposit')).toBeInTheDocument();
    expect(screen.getByText('Due at signing')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('falls back to the percentage-of-total amount when a milestone has no amount_cents', () => {
    mockUseProposalPaymentMilestones.mockReturnValue({
      data: [
        makeMilestone({
          label: 'Final payment',
          percentage: 25,
          amount_cents: 0,
          trigger_condition: null,
        }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);
    // 25% of the $45,000.00 (4,500,000 cent) proposal total = $11,250.00 -> 11250 dollars in the stub.
    expect(screen.getByText('11250')).toBeInTheDocument();
  });

  it('shows payment terms and notes on the investment summary when present', () => {
    mockUseProposals.mockReturnValue({
      data: [
        makeProposal({
          payment_terms: 'net_30',
          payment_notes: 'Split evenly across two checks.',
        }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);
    expect(screen.getByText(/net 30/i)).toBeInTheDocument();
    expect(screen.getByText(/split evenly across two checks/i)).toBeInTheDocument();
  });

  it('omits payment terms copy when neither field is set', () => {
    render(<ClientBudgetPage />);
    expect(screen.queryByText(/net 30/i)).not.toBeInTheDocument();
  });

  it('shows terms alone (no dash separator) when there are no notes', () => {
    mockUseProposals.mockReturnValue({
      data: [makeProposal({ payment_terms: 'due_on_receipt', payment_notes: null })],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);
    expect(screen.getByText('Due on receipt')).toBeInTheDocument();
  });

  it('shows notes alone when there are no terms', () => {
    mockUseProposals.mockReturnValue({
      data: [makeProposal({ payment_terms: null, payment_notes: 'Wire transfer preferred.' })],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);
    expect(screen.getByText('Wire transfer preferred.')).toBeInTheDocument();
  });

  it('humanizes an unmapped payment_terms value instead of printing the raw enum', () => {
    mockUseProposals.mockReturnValue({
      data: [makeProposal({ payment_terms: 'quarterly_installments', payment_notes: null })],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);
    // Falls back to a humanized version of the raw value for anything outside
    // the three values the schema comment anticipates (net_30 /
    // due_on_receipt / custom).
    expect(screen.getByText('quarterly installments')).toBeInTheDocument();
  });

  it("shows paid-to-date and outstanding totals from the project's invoices", () => {
    mockUseProjectInvoices.mockReturnValue({
      data: [
        makeInvoice({
          id: 'inv-1',
          invoice_number: 'INV-0001',
          status: 'paid',
          total_cents: 50000,
          amount_paid_cents: 50000,
        }),
        makeInvoice({
          id: 'inv-2',
          invoice_number: 'INV-0002',
          status: 'sent',
          total_cents: 30000,
          amount_paid_cents: 0,
          due_date: '2026-03-01',
        }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);

    expect(
      within(screen.getByTestId('invoices-paid-to-date')).getByText(formatCurrency(50000))
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('invoices-outstanding')).getByText(formatCurrency(30000))
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /INV-0002/i });
    expect(link).toHaveAttribute('href', '/invoices/inv-2');
  });

  it('shows the invoices empty state when the project has none', () => {
    mockUseProjectInvoices.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ClientBudgetPage />);
    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it("shows an inline error for a project's invoices without hiding its investment summary", () => {
    mockUseProjectInvoices.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ClientBudgetPage />);
    expect(screen.getByText(/couldn.t load invoices/i)).toBeInTheDocument();
    // The investment summary (a different data-fetch) still renders.
    expect(screen.getByText(formatCurrency(4500000))).toBeInTheDocument();
  });

  it('excludes draft and void invoices from the table', () => {
    mockUseProjectInvoices.mockReturnValue({
      data: [
        makeInvoice({ id: 'inv-draft', invoice_number: 'INV-DRAFT', status: 'draft' }),
        makeInvoice({ id: 'inv-void', invoice_number: 'INV-VOID', status: 'void' }),
        makeInvoice({ id: 'inv-sent', invoice_number: 'INV-SENT', status: 'sent' }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientBudgetPage />);
    expect(screen.queryByText('INV-DRAFT')).not.toBeInTheDocument();
    expect(screen.queryByText('INV-VOID')).not.toBeInTheDocument();
    expect(screen.getByText('INV-SENT')).toBeInTheDocument();
  });
});
