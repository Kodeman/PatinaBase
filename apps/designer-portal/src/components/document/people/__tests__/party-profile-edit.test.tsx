/**
 * F3 — PartyProfileSheet's field-party edit. "Edit" turns the read-only
 * contact card into a form (Name/Company/Trade/Phone/Email); Kind and
 * Project stay read-only, and Save calls `useUpdateProjectParty` with only
 * the fields that actually changed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PartyRole } from '@patina/supabase';
import { PartyProfileSheet } from '../party-profile-sheet';

const updateMutateAsync = jest.fn();
const personData: { current: Record<string, unknown> | null } = { current: null };

jest.mock('@patina/supabase', () => ({
  usePerson: () => ({ data: personData.current }),
  usePartySmsThread: () => ({ data: [] }),
  useSendPartySms: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useActiveFieldLink: () => ({ data: null }),
  useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRevokeFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFieldMediaUrl: () => ({ data: null }),
  useOrganizations: () => ({ data: [] }),
  useProjectParties: () => ({ data: [] }),
  useRecordPartySmsConsent: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateProjectParty: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
  fieldLinkUrl: (token: string) => `https://patina.cloud/field/${token}`,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

function person(over: Partial<Record<string, unknown>> = {}) {
  return {
    person_id: 'party-1',
    display_name: 'Sal Moretti',
    email: 'sal@morettiplumbing.com',
    phone: '5551234567',
    profile_id: null,
    project_id: 'project-1',
    designer_id: null,
    status_raw: 'not_asked',
    last_touch_at: null,
    meta: {
      company_name: 'Moretti Plumbing',
      trade: 'plumbing',
      phone_e164: '+15551234567',
      project_name: 'The Ellsworth Kitchen',
    },
    scope: 'mine',
    ...over,
  };
}

beforeEach(() => {
  updateMutateAsync.mockReset();
  updateMutateAsync.mockResolvedValue({});
  personData.current = person();
});

const ROLE: PartyRole = 'sub';

describe('PartyProfileSheet — edit', () => {
  it('starts read-only, with an Edit action', () => {
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    expect(screen.getByText('Moretti Plumbing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('prefills the form from the record when Edit is pressed', () => {
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Sal Moretti');
    expect(screen.getByLabelText('Company')).toHaveValue('Moretti Plumbing');
    expect(screen.getByLabelText('Trade')).toHaveValue('plumbing');
    expect(screen.getByLabelText('Phone')).toHaveValue('5551234567');
    expect(screen.getByLabelText('Email')).toHaveValue('sal@morettiplumbing.com');
  });

  it('keeps Kind and Project as read-only text, never a control', () => {
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByText(/Subcontractor.*The Ellsworth Kitchen/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Kind')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument();
  });

  it('saves only the changed field', async () => {
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '5559876543' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'party-1',
      projectId: 'project-1',
      patch: { phone: '5559876543' },
    });
  });

  it('returns to the read-only card after Cancel, with no write', () => {
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Someone Else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Moretti Plumbing')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});
