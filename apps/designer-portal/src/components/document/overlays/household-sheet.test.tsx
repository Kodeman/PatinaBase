/**
 * HouseholdSheet — the "Phone on file" leg (00583).
 *
 * A captured household's phone is saved through the same payload as its name
 * and email, and an emptied phone must reach the mutation as an explicit null:
 * that null is the whole reason 00583 hydrates client_phone on INSERT only, so
 * the payload shape is worth pinning here rather than inferring it from SQL.
 */
import { fireEvent, render, screen, act, waitFor } from '@testing-library/react';
import { HouseholdSheet } from './household-sheet';

const mutate = jest.fn();
const mockInvite = jest.fn();
let mockClient: Record<string, unknown> | undefined;
let mockLetterStatus: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: null,
  isLoading: false,
  isError: false,
};
let mockFlags: Record<string, boolean> = {};

jest.mock('@patina/supabase', () => ({
  useClient: () => ({ data: mockClient }),
  useDesignerClientForClientUser: () => ({ data: undefined }),
  useUpdateClientContact: () => ({ mutate, isPending: false }),
  useClientInvitationStatus: () => mockLetterStatus,
  useInviteAndLinkClient: () => ({
    mutate: mockInvite,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: mockFlags[key] === true, isLoading: false }),
}));

// The People room's row, as the sheet mounts it: its own act is a button.
jest.mock('../people/directory/client-letter-line', () => ({
  ClientLetterLine: ({ clientName }: { clientName: string }) => (
    <p data-testid="client-letter-line">
      On your roster · no letter sent · <button type="button">{`Write to ${clientName}`}</button>
    </p>
  ),
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
  ClientPicker: ({ placeholder }: { placeholder?: string }) => (
    <button type="button" data-testid="client-picker-trigger">
      {placeholder}
    </button>
  ),
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

describe('HouseholdSheet — FR4 Fix 7: the relationship sheet’s invite control (one-voice)', () => {
  const ASHFORDS = {
    ...CAPTURED_CLIENT,
    client_name: 'The Ashfords',
    client_email: 'ashfords@example.com',
  };
  const renderRelationship = (landOnRepair = true) =>
    render(
      <HouseholdSheet
        open
        onClose={jest.fn()}
        engagementKind="relationship"
        projectId={null}
        proposalId={null}
        clientProfileId={null}
        designerClientId="dc-ashford"
        clientName="The Ashfords"
        landOnRepair={landOnRepair}
      />,
    );

  beforeEach(() => {
    mockInvite.mockReset();
    mockClient = { ...ASHFORDS };
    mockLetterStatus = { data: null, isLoading: false, isError: false };
    mockFlags = { 'one-voice': true };
  });

  it('mounts `Invite the Ashfords` and the repair lands with focus on it, not the dialog', async () => {
    renderRelationship();
    const invite = screen.getByRole('button', { name: 'Invite the Ashfords' });
    await waitFor(() => expect(invite).toHaveFocus());
  });

  it('the invite arms before it sends (J2): Send invite fires useInviteAndLinkClient', () => {
    renderRelationship();
    fireEvent.click(screen.getByRole('button', { name: 'Invite the Ashfords' }));
    expect(mockInvite).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Invite ashfords@example.com' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(mockInvite).toHaveBeenCalledWith(
      { designerClientId: 'dc-ashford' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('with the letter on: the People room’s client-letter row, its `Write to …` taking focus', async () => {
    mockFlags = { 'one-voice': true, 'client-invite-letter': true };
    renderRelationship();
    expect(screen.getByTestId('client-letter-line')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull();
    const write = screen.getByRole('button', { name: 'Write to The Ashfords' });
    await waitFor(() => expect(write).toHaveFocus());
  });

  it('a letter already sent, no email on file, or a login: nothing mounts', () => {
    mockFlags = { 'one-voice': true, 'client-invite-letter': true };
    mockLetterStatus = { data: { state: 'sent' }, isLoading: false, isError: false };
    const { unmount } = renderRelationship();
    expect(screen.queryByTestId('client-letter-line')).toBeNull();
    unmount();

    mockFlags = { 'one-voice': true };
    mockClient = { ...ASHFORDS, client_email: null };
    const second = renderRelationship();
    expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull();
    second.unmount();

    mockClient = { ...ASHFORDS, client_id: 'profile-1' };
    renderRelationship();
    expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull();
  });

  it('flag off: no invite row (the sheet is today’s)', () => {
    mockFlags = {};
    renderRelationship();
    expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull();
  });

  it('proposal kind: the repair lands on the picker `Invite or choose a client…`', async () => {
    render(
      <HouseholdSheet
        open
        onClose={jest.fn()}
        engagementKind="proposal"
        projectId={null}
        proposalId="prop-1"
        clientProfileId={null}
        designerClientId="dc-elena"
        clientName="Elena Marlowe"
        proposalStatus="draft"
        landOnRepair
      />,
    );
    const picker = screen.getByRole('button', { name: 'Invite or choose a client…' });
    await waitFor(() => expect(picker).toHaveFocus());
  });
});

describe('HouseholdSheet — the phone on file', () => {
  beforeEach(() => {
    mutate.mockReset();
    mockClient = { ...CAPTURED_CLIENT };
    mockFlags = {};
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

  // F3-R2-16 — a caller whose own door already promised the form (the
  // People room's "Edit details") shouldn't ask the designer to click
  // "Edit details" a second time once the sheet is open.
  it('startEditing opens straight into the form, with no "Edit details" click needed', () => {
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
        startEditing
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Phone on file')).toHaveValue('(555) 014-2200');
  });

  it('every on-document caller is unaffected — startEditing defaults to the read view', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Phone on file')).toBeNull();
  });

  // F3-R2-12 — on-demand mounting means this effect's first hydrate can now
  // land after the designer has already started typing; it must not
  // re-fire (and clobber their keystrokes) on every later `client` refetch
  // of the SAME relationship.
  it('does not re-hydrate the form on a background refetch of the same relationship', () => {
    const { rerender } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Phone on file'), {
      target: { value: '(555) 999-0000' },
    });

    // A background refetch resolves with the SAME relationship id — the
    // typed value must survive it.
    mockClient = { ...CAPTURED_CLIENT };
    act(() => {
      rerender(
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
    });

    expect(screen.getByLabelText('Phone on file')).toHaveValue('(555) 999-0000');
  });
});
