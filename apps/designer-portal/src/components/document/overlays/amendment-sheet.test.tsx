import { fireEvent, render, screen } from '@testing-library/react';

const mockUseProjectV2 = jest.fn();
const mockUseScopeChangeRequests = jest.fn();
const mockAccept = jest.fn();
const mockApply = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectV2: (projectId: string) => mockUseProjectV2(projectId),
  useScopeChangeRequests: (projectId: string) => mockUseScopeChangeRequests(projectId),
  useAcceptClientScopeChangeRequest: () => ({
    mutate: mockAccept,
    isPending: false,
  }),
}));

jest.mock('@/hooks/use-amendments', () => ({
  useComposeAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useSendAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useApplyAmendment: () => ({ mutate: mockApply, isPending: false }),
}));

jest.mock('./doc-sheet', () => ({
  DocSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

jest.mock('../document-action', () => ({
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DocumentAction: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { AmendmentSheet } from './amendment-sheet';

const project = {
  id: 'project-1',
  name: 'Prairie House',
  client_id: 'client-1',
  designer_id: 'designer-1',
  budget_cents: 100_000,
};

function amendment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    project_id: project.id,
    requested_by: project.client_id,
    title: 'Add a reading lamp',
    description: 'Please add one beside the chair.',
    status: 'sent',
    sent_at: '2026-08-01T12:00:00.000Z',
    applied_at: null,
    additional_ffe_budget_cents: 0,
    additional_design_fee_cents: 0,
    timeline_impact_weeks: 0,
    new_total_budget_cents: 0,
    new_rooms: [],
    ...overrides,
  };
}

function renderSheet(request = amendment()) {
  mockUseProjectV2.mockReturnValue({ data: project });
  mockUseScopeChangeRequests.mockReturnValue({ data: [request] });

  render(
    <AmendmentSheet projectId={project.id} clientName="Jordan Rivera" open onClose={jest.fn()} />,
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: new RegExp(`^${request.title as string}`),
    }),
  );
}

beforeEach(() => {
  mockUseProjectV2.mockReset();
  mockUseScopeChangeRequests.mockReset();
  mockAccept.mockReset();
  mockApply.mockReset();
});

describe('AmendmentSheet client-origin scope lifecycle', () => {
  it('labels an inbound request and routes acceptance through the checked RPC hook', () => {
    renderSheet();

    expect(screen.getByText('Client request')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept client request' }));

    expect(mockAccept).toHaveBeenCalledWith(
      { requestId: 'request-1', projectId: 'project-1' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('keeps designer-authored sent amendments in the client-response flow', () => {
    renderSheet(amendment({ requested_by: 'designer-1' }));

    expect(screen.getByText('With the client')).toBeInTheDocument();
    expect(
      screen.getByText('With Jordan Rivera — it settles here when they answer.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept client request' })).not.toBeInTheDocument();
  });

  it('presents accepted inbound work as fulfillment instead of an amendment apply', () => {
    renderSheet(
      amendment({
        status: 'approved',
        approved_at: '2026-08-01T13:00:00.000Z',
        approved_by_name: 'Scope Designer',
      }),
    );

    expect(screen.queryByRole('button', { name: 'Apply to the project' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark fulfilled' }));
    expect(mockApply).toHaveBeenCalledWith(
      { requestId: 'request-1', projectId: 'project-1' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});
