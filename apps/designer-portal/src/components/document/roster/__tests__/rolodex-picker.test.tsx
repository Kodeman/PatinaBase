import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectRosterRow, StudioContact } from '@patina/supabase';
import { RolodexPicker } from '../rolodex-picker';

const addPartyMutate = jest.fn();
const addContactMutate = jest.fn();
const useStudioContacts = jest.fn();
const useProjectRoster = jest.fn();
const refetchRoster = jest.fn();

jest.mock('@patina/supabase', () => ({
  useAddProjectParty: () => ({ mutateAsync: addPartyMutate, isPending: false }),
  useAddStudioContact: () => ({ mutateAsync: addContactMutate, isPending: false }),
  useOrganizations: () => ({
    data: [{ id: 'org-1', type: 'design_studio' }],
    isLoading: false,
  }),
  useStudioContacts: (...args: unknown[]) => useStudioContacts(...args),
  useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
  useStudioContactHistory: () => ({
    data: { 'contact-1': { projectCount: 3, lastProjectName: 'Ellsworth', lastAt: null } },
  }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));

const ROSA: StudioContact = {
  id: 'contact-1',
  organization_id: 'org-1',
  entity_kind: 'person',
  company_id: null,
  contact_kind: 'sub',
  full_name: 'Rosa Martínez',
  company_name: 'Martínez Tile Works',
  email: 'rosa@martineztile.co',
  phone: '(513) 555-0148',
  phone_e164: '+15135550148',
  specialties: ['tile'],
  vendor_id: null,
  profile_id: null,
  created_by: null,
  notes: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'proj-1',
};

beforeEach(() => {
  addPartyMutate.mockReset().mockResolvedValue({});
  addContactMutate.mockReset().mockResolvedValue({ id: 'new-contact' });
  props.onClose.mockReset();
  useStudioContacts.mockReset();
  useStudioContacts.mockReturnValue({ data: [ROSA], isLoading: false });
  refetchRoster.mockReset();
  useProjectRoster.mockReset();
  useProjectRoster.mockReturnValue({ data: [], refetch: refetchRoster });
});

describe('RolodexPicker — pre-scoped kinds', () => {
  it('renders only the kinds it was scoped to, plus All', () => {
    render(<RolodexPicker {...props} scopeKinds={['sub']} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subcontractor' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'General Contractor' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photographer' })).not.toBeInTheDocument();
  });

  it('falls back to the full vocabulary when nothing is scoped', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.getByRole('button', { name: 'General Contractor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Photographer' })).toBeInTheDocument();
    // A project's client is set when the project is opened, never picked here.
    expect(screen.queryByRole('button', { name: 'Client' })).not.toBeInTheDocument();
  });
});

describe('RolodexPicker — the hits and their history', () => {
  it('renders the history line, which is the whole value of the rolodex', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.getByText('3 projects · last: Ellsworth')).toBeInTheDocument();
  });

  it('a single click adds the contact as a party carrying its rolodex id', async () => {
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Rosa Martínez/ }));
    await waitFor(() => expect(addPartyMutate).toHaveBeenCalled());
    expect(addPartyMutate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      partyKind: 'sub',
      displayName: 'Rosa Martínez',
      companyName: 'Martínez Tile Works',
      trade: 'tile',
      phone: '(513) 555-0148',
      email: 'rosa@martineztile.co',
      studioContactId: 'contact-1',
    });
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(refetchRoster).toHaveBeenCalledTimes(1);
  });

  it('does not add a rolodex contact already represented on the roster', async () => {
    useProjectRoster.mockReturnValue({
      data: [
        {
          roster_id: 'party-1',
          source: 'party',
          project_id: 'proj-1',
          kind: 'sub',
          display_name: 'Rosa Martínez',
          company_name: 'Martínez Tile Works',
          email: 'rosa@martineztile.co',
          phone: '(513) 555-0148',
          trade: 'tile',
          job_title: null,
          staff_role: null,
          studio_contact_id: 'contact-1',
          profile_id: null,
          show_to_client: false,
          has_active_field_link: false,
          sms_consent_status: 'not_asked',
          updated_at: null,
        } satisfies ProjectRosterRow,
      ],
      refetch: refetchRoster,
    });
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Rosa Martínez/ }));

    expect(
      await screen.findByText('Rosa Martínez is already on the call sheet.'),
    ).toBeInTheDocument();
    expect(addPartyMutate).not.toHaveBeenCalled();
    expect(refetchRoster).not.toHaveBeenCalled();
  });
});

describe('RolodexPicker — the fallback is always visible', () => {
  it('shows the way out even when the rolodex has hits', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.getByText('– No one by that name in the rolodex.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add someone new' })).toBeInTheDocument();
  });

  it('shows it on an empty rolodex too', () => {
    useStudioContacts.mockReturnValue({ data: [], isLoading: false });
    render(<RolodexPicker {...props} />);
    expect(screen.getByText('– No one by that name in the rolodex.')).toBeInTheDocument();
  });

  it('unfolds the inline add form in the SAME sheet', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add someone new' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    // Still one sheet — the hits and the fallback band are still on it.
    expect(screen.getByText('– No one by that name in the rolodex.')).toBeInTheDocument();
  });
});

describe('RolodexPicker — the stamp', () => {
  it('is ON by default', () => {
    render(<RolodexPicker {...props} startInAdd />);
    const stamp = screen.getByRole('checkbox', { name: /Save to the studio rolodex/ });
    expect(stamp).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('so the next project starts with them')).toBeInTheDocument();
  });

  it('ON: writes the rolodex card first, then the party carrying its id', async () => {
    render(<RolodexPicker {...props} scopeKinds={['sub']} startInAdd />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Hector Salas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the call sheet' }));

    await waitFor(() => expect(addPartyMutate).toHaveBeenCalled());
    expect(addContactMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        entityKind: 'person',
        contactKind: 'sub',
        fullName: 'Hector Salas',
      }),
    );
    expect(addPartyMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Hector Salas',
        partyKind: 'sub',
        studioContactId: 'new-contact',
      }),
    );
  });

  it('OFF: adds the party only — nothing touches the studio rolodex', async () => {
    render(<RolodexPicker {...props} scopeKinds={['sub']} startInAdd />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Hector Salas' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Save to the studio rolodex/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to the call sheet' }));

    await waitFor(() => expect(addPartyMutate).toHaveBeenCalled());
    expect(addContactMutate).not.toHaveBeenCalled();
    expect(addPartyMutate).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Hector Salas', studioContactId: null }),
    );
  });

  it('refuses a nameless add, in words, without calling anything', () => {
    render(<RolodexPicker {...props} startInAdd />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to the call sheet' }));
    expect(screen.getByText('A name, at least.')).toBeInTheDocument();
    expect(addPartyMutate).not.toHaveBeenCalled();
    expect(addContactMutate).not.toHaveBeenCalled();
  });
});
