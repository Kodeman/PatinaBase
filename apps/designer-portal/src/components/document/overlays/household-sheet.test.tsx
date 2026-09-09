/**
 * HouseholdSheet — the "Phone on file" leg (00583).
 *
 * A captured household's phone is saved through the same payload as its name
 * and email, and an emptied phone must reach the mutation as an explicit null:
 * that null is the whole reason 00583 hydrates client_phone on INSERT only, so
 * the payload shape is worth pinning here rather than inferring it from SQL.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { HouseholdSheet } from './household-sheet';

const mutate = jest.fn();
let mockClient: Record<string, unknown> | undefined;

jest.mock('@patina/supabase', () => ({
  useClient: () => ({ data: mockClient }),
  useDesignerClientForClientUser: () => ({ data: undefined }),
  useUpdateClientContact: () => ({ mutate, isPending: false }),
}));

jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => null,
}));

const CAPTURED_CLIENT = {
  id: 'dc-1',
  client_id: null,
  client: null,
  client_name: 'The Okafors',
  client_email: 'okafors@example.com',
  client_phone: '(555) 014-2200',
  notes: 'Prefers evenings',
  status: 'lead',
};

const renderSheet = () =>
  render(
    <HouseholdSheet
      open
      onClose={jest.fn()}
      engagementKind="relationship"
      projectId={null}
      proposalId={null}
      clientProfileId={null}
      designerClientId="dc-1"
      clientName="The Okafors"
    />,
  );

describe('HouseholdSheet — the phone on file', () => {
  beforeEach(() => {
    mutate.mockReset();
    mockClient = { ...CAPTURED_CLIENT };
  });

  it('shows the captured phone in the read view', () => {
    renderSheet();
    expect(screen.getByText('(555) 014-2200')).toBeInTheDocument();
  });

  it('saves an edited phone alongside the name and email', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Phone on file'), {
      target: { value: '(555) 014-2299' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      {
        clientId: 'dc-1',
        updates: {
          client_name: 'The Okafors',
          client_email: 'okafors@example.com',
          client_phone: '(555) 014-2299',
          notes: 'Prefers evenings',
        },
      },
      expect.anything(),
    );
  });

  it('sends an emptied phone as null rather than dropping the field', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Phone on file'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.objectContaining({ client_phone: null }),
      }),
      expect.anything(),
    );
  });

  it('offers a client with a Patina account notes only — their phone is their own', () => {
    mockClient = {
      ...CAPTURED_CLIENT,
      client_id: 'profile-1',
      client: { full_name: 'Ada Okafor', email: 'ada@example.com', phone: '(555) 990-0001' },
    };
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));

    expect(screen.queryByLabelText('Phone on file')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).toHaveBeenCalledWith(
      { clientId: 'dc-1', updates: { notes: 'Prefers evenings' } },
      expect.anything(),
    );
  });
});
