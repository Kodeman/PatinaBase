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
  normalizePartyPhoneForCompare: (phone: string | null | undefined) => {
    const digits = (phone ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return null;
  },
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

  // F3-R2-03 — a cosmetic reformat of the same number must not read as a
  // change (which would otherwise silently revoke a granted/pending
  // consent server-side).
  it('does not send a phone patch for a cosmetic reformat of the same number', async () => {
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Same digits as the prefilled '5551234567', just reformatted.
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '(555) 123-4567' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sal R. Moretti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'party-1',
      projectId: 'project-1',
      patch: { displayName: 'Sal R. Moretti' },
    });
  });

  // F3-R2-03 — the inline caution only appears once the phone is actually
  // edited on a granted/pending party, never for an untouched field or a
  // not_asked/opted_out one.
  it('warns inline only when editing the phone would clear a granted consent', () => {
    personData.current = person({ status_raw: 'granted' });
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.queryByText(/clears their texting opt-in/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '5559876543' } });
    expect(screen.getByText(/clears their texting opt-in/i)).toBeInTheDocument();
  });

  it('never warns for a not_asked party even after editing the phone', () => {
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '5559876543' } });

    expect(screen.queryByText(/clears their texting opt-in/i)).not.toBeInTheDocument();
  });
});
