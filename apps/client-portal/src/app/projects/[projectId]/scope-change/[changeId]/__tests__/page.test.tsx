import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';

import ClientScopeChangeApprovalPage from '../page';

const mockRefresh = jest.fn();
let mockRequest: Record<string, unknown>;
let mockUserId = 'client-1';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: mockUserId } }),
}));

jest.mock('@patina/supabase', () => ({
  useScopeChangeRequest: () => ({ data: mockRequest, isLoading: false }),
  useApproveScopeChange: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeclineScopeChange: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCancelClientScopeChangeRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

async function renderPage() {
  const params = Promise.resolve({ projectId: 'project-1', changeId: 'change-1' });
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <ClientScopeChangeApprovalPage params={params} />
      </Suspense>,
    );
    await params;
  });
}

const clientRequest = (overrides: Record<string, unknown> = {}) => ({
  id: 'change-1',
  project_id: 'project-1',
  requested_by: 'client-1',
  title: 'Move the reading light',
  description: 'Please move it beside the chair.',
  status: 'approved',
  additional_ffe_budget_cents: 0,
  additional_design_fee_cents: 0,
  timeline_impact_weeks: 0,
  new_total_budget_cents: 0,
  new_rooms: [],
  new_ffe_items: [],
  approved_at: '2026-08-01T00:00:00.000Z',
  approved_by_name: 'Designer Name',
  applied_at: null,
  ...overrides,
});

describe('client scope-change request semantics', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockUserId = 'client-1';
    mockRequest = clientRequest();
  });

  it('presents designer acceptance as review, not client authorization', async () => {
    await renderPage();

    expect(await screen.findByText('Scope Change Request')).toBeInTheDocument();
    expect(screen.getByTestId('scope-change-status-badge')).toHaveTextContent('Accepted');
    expect(screen.getByText(/accepted by your designer/i)).toBeInTheDocument();
    expect(screen.getByText(/not a client authorization/i)).toBeInTheDocument();
    expect(screen.queryByText('Scope Change Authorization')).not.toBeInTheDocument();
    expect(screen.queryByText(/new total project value/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/approved by designer name/i)).not.toBeInTheDocument();
  });

  it('calls an applied client-origin request fulfilled', async () => {
    mockRequest = clientRequest({
      status: 'applied',
      applied_at: '2026-08-02T00:00:00.000Z',
    });

    await renderPage();

    expect(screen.getByTestId('scope-change-status-badge')).toHaveTextContent('Fulfilled');
    expect(screen.getByText(/marked fulfilled on/i)).toBeInTheDocument();
    expect(screen.queryByText(/applied to your project on/i)).not.toBeInTheDocument();
  });

  it('retains authorization and impact copy for a designer-authored amendment', async () => {
    mockRequest = clientRequest({
      requested_by: 'designer-1',
      status: 'sent',
      approved_at: null,
      additional_design_fee_cents: 25_000,
      new_total_budget_cents: 125_000,
    });

    await renderPage();

    expect(screen.getByText('Scope Change Authorization')).toBeInTheDocument();
    expect(screen.getByTestId('scope-change-status-badge')).toHaveTextContent(
      'Awaiting Your Review',
    );
    expect(screen.getByText('Impact Summary')).toBeInTheDocument();
    expect(screen.getByText('New Total Project Value')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve Change' })).toBeInTheDocument();
  });
});
