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
/** What a refetch of the person query returns — the read side the sheet asks
 *  when a write matches zero rows. Defaults to "still there". */
const personRefetch = jest.fn();

jest.mock('@patina/supabase', () => ({
  usePerson: () => ({ data: personData.current, refetch: personRefetch }),
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
  personRefetch.mockReset();
  personRefetch.mockImplementation(async () => ({ data: personData.current }));
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

  // The record has not resolved yet. Offering Edit here snapshotted an empty
  // form, and Save then wrote company / trade / phone / email back as null.
  it('offers no Edit action while the record is still loading', () => {
    personData.current = null;
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('offers Edit once the record arrives, prefilled from it', () => {
    personData.current = null;
    const { rerender } = render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

    personData.current = person();
    rerender(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Company')).toHaveValue('Moretti Plumbing');
    expect(screen.getByLabelText('Trade')).toHaveValue('plumbing');
    expect(screen.getByLabelText('Phone')).toHaveValue('5551234567');
    expect(screen.getByLabelText('Email')).toHaveValue('sal@morettiplumbing.com');
  });

  // The form is OPEN and untouched when a newer record lands (a co-member's
  // edit, or the first refetch after the sheet opened): every field the
  // designer has not typed into takes the new values.
  it('re-hydrates an untouched open form when a newer record arrives under it', () => {
    const { rerender } = render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Sal Moretti');

    personData.current = person({
      display_name: 'Sal Moretti Jr',
      email: 'sal.jr@morettiplumbing.com',
      phone: '5550001111',
      meta: {
        company_name: 'Moretti & Sons',
        trade: 'electrical',
        phone_e164: '+15550001111',
        project_name: 'The Ellsworth Kitchen',
      },
    });
    rerender(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Name')).toHaveValue('Sal Moretti Jr');
    expect(screen.getByLabelText('Company')).toHaveValue('Moretti & Sons');
    expect(screen.getByLabelText('Trade')).toHaveValue('electrical');
    expect(screen.getByLabelText('Phone')).toHaveValue('5550001111');
    expect(screen.getByLabelText('Email')).toHaveValue('sal.jr@morettiplumbing.com');
  });

  // The same arrival, with one field typed into: the freeze is the whole
  // form's, so nothing moves once the designer has started.
  it('freezes the whole form once the designer has typed, newer record or not', () => {
    const { rerender } = render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Company'), {
      target: { value: 'Moretti & Sons' },
    });

    personData.current = person({ display_name: 'Sal Moretti Jr' });
    rerender(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Company')).toHaveValue('Moretti & Sons');
    expect(screen.getByLabelText('Name')).toHaveValue('Sal Moretti');
  });

  // The record goes away under an open, untouched form (a query error that
  // drops the cached row). The last good snapshot must stand — blanking it
  // would read as the sheet losing the person's details.
  it('leaves an open form standing when the record disappears under it', () => {
    const { rerender } = render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    personData.current = null;
    rerender(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Name')).toHaveValue('Sal Moretti');
    expect(screen.getByLabelText('Company')).toHaveValue('Moretti Plumbing');
    expect(screen.getByLabelText('Phone')).toHaveValue('5551234567');
    expect(screen.getByLabelText('Email')).toHaveValue('sal@morettiplumbing.com');
  });

  // F3-R2-09's shape, for the field trade: a stored value outside
  // ALL_FIELD_TRADES must round-trip rather than be discarded by an
  // unrelated save.
  it('keeps an out-of-vocabulary trade as its own option', async () => {
    personData.current = person({
      meta: {
        company_name: 'Moretti Plumbing',
        trade: 'stonemasonry',
        phone_e164: '+15551234567',
        project_name: 'The Ellsworth Kitchen',
      },
    });
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Trade')).toHaveValue('stonemasonry');
    expect(
      screen.getByRole('option', { name: 'stonemasonry' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sal R. Moretti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0].patch).toEqual({
      displayName: 'Sal R. Moretti',
    });
  });

  // A raw RLS message or a missing GRANT is a permission refusal however it
  // arrives.
  it('translates a permission refusal on Save into plain words', async () => {
    updateMutateAsync.mockRejectedValue({
      code: '42501',
      message: 'new row violates row-level security policy for table "project_parties"',
    });
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sal R. Moretti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText("Only this project's designer can edit its crew."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/row-level security policy/i),
    ).not.toBeInTheDocument();
  });

  // R3-01 — an RLS-blocked UPDATE matches zero rows and comes back as
  // PGRST116, never 42501: `project_parties_studio_update` (00584) uses one
  // predicate for USING and WITH CHECK, so the row is simply invisible to the
  // write. The reader admitted by 00421's SELECT-only policy on a project
  // whose designer has left the org is exactly that case, and their record is
  // still readable — so the sentence must name authority.
  it('reads a zero-row Save whose record is still readable as a permission refusal', async () => {
    updateMutateAsync.mockRejectedValue({
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    });
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sal R. Moretti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText("Only this project's designer can edit its crew."),
    ).toBeInTheDocument();
    expect(personRefetch).toHaveBeenCalled();
    expect(
      screen.queryByText(/JSON object requested/i),
    ).not.toBeInTheDocument();
  });

  // The other half of the same code: the row really is gone. Calling that a
  // permission problem sent designers looking for authority they already had.
  it('reads a zero-row Save whose record has vanished as a race', async () => {
    updateMutateAsync.mockRejectedValue({
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    });
    personRefetch.mockResolvedValue({ data: null });
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sal R. Moretti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText("This person's record just changed — refresh to see it."),
    ).toBeInTheDocument();
  });

  // A re-read that fails too cannot tell the two apart; say the reachable
  // thing rather than guess.
  it('falls back to the permission sentence when the re-read itself fails', async () => {
    updateMutateAsync.mockRejectedValue({
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    });
    personRefetch.mockRejectedValue(new Error('offline'));
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sal R. Moretti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText("Only this project's designer can edit its crew."),
    ).toBeInTheDocument();
  });

  it('shows a write failure that is not a refusal in its own words', async () => {
    updateMutateAsync.mockRejectedValue(new Error('Network request failed'));
    render(<PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sal R. Moretti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Network request failed')).toBeInTheDocument();
  });
});
