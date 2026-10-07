import { fireEvent, render, screen } from '@testing-library/react';

import { AmendmentSheet } from '../amendment-sheet';

let mockProject: Record<string, unknown> | undefined;
const mockCompose = jest.fn();

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: mockProject }),
  useScopeChangeRequests: () => ({ data: [] }),
  useAcceptClientScopeChangeRequest: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-amendments', () => ({
  useComposeAmendment: () => ({ mutate: mockCompose, isPending: false }),
  useSendAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useApplyAmendment: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../doc-sheet', () => ({
  DocSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="doc-sheet">{children}</div> : null,
}));

jest.mock('../household-sheet', () => ({
  HouseholdSheet: () => <div data-testid="household-sheet" />,
}));

function renderSheet() {
  return render(
    <AmendmentSheet projectId="p-1" clientName="" open onClose={jest.fn()} />,
  );
}

function fillCompose() {
  fireEvent.change(screen.getByLabelText(/What.s changing/i), {
    target: { value: 'Add the entryway' },
  });
  fireEvent.change(screen.getByLabelText(/Description/i), {
    target: { value: 'The hall joins the scope.' },
  });
}

describe('AmendmentSheet — F5 (US-19 FR1)', () => {
  beforeEach(() => {
    mockCompose.mockReset();
    mockProject = {
      id: 'p-1',
      name: 'Chen Residence',
      client_id: null,
      total_amount_cents: 0,
      proposal: { id: 'pr-1', designer_client_id: null },
    };
  });

  it('holds Send to the client on a job with no linked client, reason beneath, repair beside', () => {
    renderSheet();
    fillCompose();

    const send = screen.getByRole('button', { name: 'Send to the client' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).not.toBeDisabled();

    const reason = screen.getByText('Link a client first.');
    expect(send.getAttribute('aria-describedby')).toBe(reason.id);
    // Beneath the held act, in the act's own column.
    expect(send.parentElement).toBe(reason.parentElement);

    fireEvent.click(send);
    expect(mockCompose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Link a client' }));
    expect(screen.getByTestId('household-sheet')).toBeInTheDocument();
  });

  it('offers Send plainly once a client is linked through the canonical relationship', () => {
    mockProject = {
      ...mockProject,
      proposal: { id: 'pr-1', designer_client_id: 'dc-1' },
    };
    renderSheet();
    fillCompose();

    const send = screen.getByRole('button', { name: 'Send to the client' });
    expect(send).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText('Link a client first.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link a client' })).toBeNull();
    fireEvent.click(send);
    expect(mockCompose).toHaveBeenCalledTimes(1);
  });

  it('a linked client profile alone also counts as linked', () => {
    mockProject = { ...mockProject, client_id: 'profile-1' };
    renderSheet();
    expect(screen.queryByText('Link a client first.')).toBeNull();
  });

  it('prints no figure when the amendment total is 0', () => {
    renderSheet();
    const sheet = screen.getByTestId('doc-sheet');
    expect(sheet.textContent).not.toMatch(/\$0\b/);
    expect(screen.queryByText('New project total')).toBeNull();
  });

  it('prints the figures once there is money to state', () => {
    mockProject = { ...mockProject, total_amount_cents: 1_200_000 };
    renderSheet();
    expect(screen.getByTestId('doc-sheet').textContent).toMatch(/current \$12,000/);
    expect(screen.getByText('New project total')).toBeInTheDocument();
  });

  it('reads "the client approves it"', () => {
    renderSheet();
    expect(screen.getByTestId('doc-sheet').textContent).toMatch(
      /the client approves it in their portal/,
    );
  });
});
