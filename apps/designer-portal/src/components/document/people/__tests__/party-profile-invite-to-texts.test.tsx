/**
 * Invite-to-texts (SMS consent for an EXISTING party) — the party profile
 * sheet's dead-end hint ("Add a phone and turn on 'Text updates'…", which
 * pointed at a control that only ever existed in AddPersonSheet's CREATE
 * path) is replaced with a real not_asked → pending flow, guarded the same
 * way AddPersonSheet's create-time consent guard is (phone + source +
 * non-blank evidence), and gated by the TCPA rules from 00432:
 *
 *  · opted_out is NEVER designer-flippable — only the recipient's own STOP/
 *    START reply changes that state, so the sheet renders it as a locked
 *    explanatory state, never a control.
 *  · pending renders as "invite sent" — no resend control in v1.
 *  · the invite control only ever appears for a not_asked party WITH a phone
 *    on file (no phone → nothing to text → no control).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { PartyRole } from '@patina/supabase';
import { PartyProfileSheet } from '../party-profile-sheet';

const recordConsentMutate = jest.fn();
const recordConsentState = { isPending: false };

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
  useRecordPartySmsConsent: () => ({
    mutate: recordConsentMutate,
    isPending: recordConsentState.isPending,
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
    email: null,
    phone: '5551234567',
    profile_id: null,
    project_id: 'project-1',
    designer_id: null,
    status_raw: 'not_asked',
    last_touch_at: null,
    meta: { phone_e164: '+15551234567' },
    scope: 'mine',
    ...over,
  };
}

beforeEach(() => {
  recordConsentMutate.mockReset();
  recordConsentState.isPending = false;
  personData.current = null;
});

const ROLE: PartyRole = 'sub';

describe('PartyProfileSheet — opted_out is a locked state, never a designer-flippable control', () => {
  it('renders the STOP/START explanation with no checkbox and no invite action', () => {
    personData.current = person({ status_raw: 'opted_out' });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    expect(
      screen.getByText(
        'They opted out by text. Only they can rejoin by replying START.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Invite to texts')).not.toBeInTheDocument();
  });
});

describe('PartyProfileSheet — pending renders as "invite sent", no resend control', () => {
  it('shows the waiting copy with no button to re-send', () => {
    personData.current = person({ status_raw: 'pending' });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    expect(
      screen.getByText(/Invite sent — waiting on their reply/),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole('button').some((el) => /resend/i.test(el.textContent ?? '')),
    ).toBe(false);
    expect(screen.queryByText('Invite to texts')).not.toBeInTheDocument();
  });
});

describe('PartyProfileSheet — the invite control is hidden without a phone on file', () => {
  it('shows a phone-needed hint instead of the checkbox/consent form', () => {
    personData.current = person({ status_raw: 'not_asked', phone: null, meta: {} });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    expect(
      screen.getByText('Add a phone number to invite this party to texts.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Invite to texts')).not.toBeInTheDocument();
  });
});

describe('PartyProfileSheet — not_asked with a phone shows the invite-to-texts flow', () => {
  it('the submit control starts disabled with a title/aria-label explaining why (F7)', () => {
    personData.current = person({ status_raw: 'not_asked' });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    const submit = screen.getByRole('button', {
      name: /Invite to texts — check the consent box above first/,
    });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('title', 'Check the consent box above first');
  });

  it('requires a consent method and non-blank evidence before it will submit, and the error is announced (role=alert, F7)', () => {
    personData.current = person({ status_raw: 'not_asked' });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    // No method chosen, no evidence typed yet.
    fireEvent.click(screen.getByText('Invite to texts'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Record how and where they gave prior consent before sending a text.',
    );
    expect(recordConsentMutate).not.toHaveBeenCalled();
  });

  it('both form fields carry a real associated label (F7)', () => {
    personData.current = person({ status_raw: 'not_asked' });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByLabelText('How consent was given')).toBeInTheDocument();
    expect(screen.getByLabelText('Consent record')).toBeInTheDocument();
  });

  it('fires the hook with the exact four-field consent bundle once the guard is satisfied — no dead projectId (F8)', () => {
    personData.current = person({ status_raw: 'not_asked' });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('How consent was given'), {
      target: { value: 'verbal' },
    });
    fireEvent.change(screen.getByLabelText('Consent record'), {
      target: { value: 'Told me at the site kickoff on Aug 8' },
    });
    fireEvent.click(screen.getByText('Invite to texts'));

    expect(recordConsentMutate).toHaveBeenCalledTimes(1);
    const [input] = recordConsentMutate.mock.calls[0];
    expect(input).toEqual({
      partyId: 'party-1',
      phone: '5551234567',
      smsConsentSource: 'verbal',
      smsConsentEvidence: 'Told me at the site kickoff on Aug 8',
    });
  });
});

describe('PartyProfileSheet — granted keeps the existing texting composer', () => {
  it('renders the send-a-text composer, not the invite flow', () => {
    personData.current = person({ status_raw: 'granted' });
    render(
      <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
    );

    expect(screen.getByLabelText('Send a text')).toBeInTheDocument();
    expect(screen.queryByText('Invite to texts')).not.toBeInTheDocument();
  });
});
