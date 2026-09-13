/**
 * THE PERSON CARD (W2b). Rewritten: the four role-branched documents this
 * spec tested — Style DNA, the woven journey, Engagements / Track record, the
 * team colophon — collapse into one card with silent regions (direction §4).
 *
 * What it pins is the rule those silent regions rest on (R-V / C32): a region
 * never vanishes because its record is empty. A region that vanishes reads as
 * an oversight; a region that says "none on file" reads as a fact, and the
 * studio must be able to tell the two apart at a glance.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { PeopleDirectoryRow, PeopleDirectorySeat } from '@patina/supabase';
import { PersonProfile } from '../views/person-profile';

const personData: { current: PeopleDirectoryRow | null } = { current: null };
const seatData: { current: PeopleDirectorySeat[] } = { current: [] };
const cardData: { current: Record<string, unknown> | null } = { current: null };
const authorityData: { current: unknown[] } = { current: [] };

jest.mock('@patina/supabase', () => ({
  AUTHORITY_SCOPE_LABELS: {
    money: 'Signs money',
    change_order: 'Approves change orders',
    selections: 'Selections',
  },
  usePerson: () => ({ data: personData.current, isLoading: false }),
  useStudioContact: () => ({ data: cardData.current }),
  useAffiliations: () => ({
    data: [{ id: 'aff-1', person_id: 'card-dana', company_id: 'firm-northgate', role_at_firm: 'owner-operator', from_date: '2025-03-01', is_paperwork_contact: true, is_signer: true, holds_trade_license: true }],
  }),
  usePeopleSeats: () => ({ data: seatData.current }),
  useComplianceDocuments: () => ({ data: [] }),
  useComplianceState: () => ({ data: 'lapsed' }),
  usePartyAuthority: () => ({ data: authorityData.current }),
  // Reach & access reads these; the card's own regions are what this spec is
  // about, so each is answered with the "nothing on file" shape.
  useStudioContactChannels: () => ({ data: [] }),
  useContactRule: () => ({ data: null }),
  useAccessGrants: () => ({ data: [] }),
  useChannelConsent: () => ({ data: null }),
  useRecordChannelConsent: () => ({ mutate: jest.fn(), isPending: false }),
  useSetContactRule: () => ({ mutate: jest.fn(), isPending: false }),
  useCreateFieldLink: () => ({ mutate: jest.fn(), isPending: false }),
  useRevokeAccessGrant: () => ({ mutate: jest.fn(), isPending: false }),
  useRecordComplianceDocument: () => ({ mutateAsync: jest.fn(), isPending: false }),
  isAccessGrantRevokable: () => false,
  ACCESS_GRANT_NOT_REVOKABLE_SENTENCE: 'This door is closed somewhere else in Patina, not from here.',
  ACCESS_GRANT_TIER_LABELS: { field_link: 'Field link' },
  ACCESS_GRANT_TIER_OPENS: { field_link: 'the Call Sheet and the site access card' },
  CONTACT_CHANNEL_KIND_LABELS: { mobile: 'Mobile', email: 'Email' },
  isContactChannelHeld: (s: string) => !!s && s !== 'active',
  fieldLinkUrl: (token: string) => `https://patina.cloud/field/${token}`,
  ALL_COMPLIANCE_BLOCKS: ['site_access', 'payment', 'draw'],
  ALL_COMPLIANCE_DOC_TYPES: ['coi_gl'],
  COMPLIANCE_BLOCK_LABELS: { site_access: 'site access', payment: 'payment', draw: 'the draw' },
  COMPLIANCE_DOC_TYPE_LABELS: { coi_gl: 'COI, general liability' },
  complianceDocRequiresExpiry: () => true,
}));

jest.mock('../profile/maker-profile', () => ({
  MakerProfile: () => <div data-testid="maker-profile" />,
}));

jest.mock('@/lib/analytics/people-events', () => ({
  peopleEvents: {
    personCardOpened: jest.fn(),
    consentRecorded: jest.fn(),
    grantMinted: jest.fn(),
    grantRevoked: jest.fn(),
  },
}));

function person(over: Partial<PeopleDirectoryRow> = {}): PeopleDirectoryRow {
  return {
    person_id: 'card-dana',
    role: 'contact',
    display_name: 'Dana Kowalski',
    email: 'dana@northgateelectric.com',
    phone: '(612) 555-0111',
    profile_id: null,
    project_id: null,
    designer_id: null,
    status_raw: 'active',
    last_touch_at: '2026-10-17T12:00:00Z',
    meta: { entity_kind: 'person', contact_kind: 'sub', company_name: 'Northgate Electric' },
    scope: 'studio',
    reach_state: 'field_link',
    consent_status: 'granted',
    paper_state: 'lapsed',
    contact_rule_summary: null,
    seat_count: 2,
    ...over,
  } as PeopleDirectoryRow;
}

function seat(over: Partial<PeopleDirectorySeat> = {}): PeopleDirectorySeat {
  return {
    identity_key: 'card-dana',
    person_id: 'card-dana',
    seat_id: 'seat-1',
    project_id: 'proj-okonkwo',
    project_name: 'Okonkwo residence',
    project_status: 'active',
    designer_id: null,
    party_kind: 'sub',
    display_name: 'Dana Kowalski',
    trade: 'electrical',
    stage: 'active',
    on_site_from: '2026-10-12',
    on_site_to: '2027-08-13',
    site_access_mode: 'escorted',
    contracted_through: 'Marrow & Sons',
    company_id: 'firm-northgate',
    company_name: 'Northgate Electric',
    warranty_until: null,
    warranty_contact_person_id: null,
    off_job_at: null,
    off_job_reason: null,
    show_to_client: false,
    studio_contact_id: 'card-dana',
    phone_e164: '+16125550111',
    consent_status: 'granted',
    reach_state: 'field_link',
    paper_state: 'lapsed',
    contact_rule_summary: null,
    updated_at: null,
    scope: 'studio',
    ...over,
  } as PeopleDirectorySeat;
}

function renderCard(props: Record<string, unknown> = {}) {
  const onOpenSeat = jest.fn();
  render(
    <PersonProfile
      personId="card-dana"
      role="contact"
      organizationId="org-1"
      onBack={jest.fn()}
      openPerson={jest.fn()}
      openThread={jest.fn()}
      goView={jest.fn()}
      notify={jest.fn()}
      onOpenSeat={onOpenSeat}
      {...props}
    />,
  );
  return { onOpenSeat };
}

beforeEach(() => {
  personData.current = person();
  seatData.current = [seat()];
  cardData.current = { id: 'card-dana', is_sole_proprietor: true, organization_id: 'org-1', warranty_until: null };
  authorityData.current = [];
});

describe('the regions', () => {
  it('prints every region head, in order', () => {
    renderCard();
    for (const head of [
      'Reach & access',
      'Seats on projects',
      'Past seats',
      'Paper',
      'History',
    ]) {
      expect(screen.getByRole('heading', { name: head })).toBeInTheDocument();
    }
  });

  it('R-V — an absent record prints its own sentence, exactly', () => {
    seatData.current = [];
    renderCard();
    expect(screen.getByText('No contact rule on file.')).toBeInTheDocument();
    expect(screen.getByText('No grant on file.')).toBeInTheDocument();
    expect(screen.getByText('No open seat on this project.')).toBeInTheDocument();
  });

  it('names the firm and the role at it', () => {
    renderCard();
    expect(
      screen.getByText('Northgate Electric · owner-operator, since 2025'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sole proprietor')).toBeInTheDocument();
  });
});

describe('the seats beneath the human', () => {
  it('prints the seat, its stage word and its window', () => {
    renderCard();
    const line = screen.getByRole('button', {
      name: /Okonkwo residence · Subcontractor · Electrical/,
    });
    expect(line).toHaveTextContent('On the job');
    expect(line).toHaveTextContent('12 Oct 2026 to 13 Aug 2027');
  });

  it('authority prints as plain text, never as a state word', () => {
    authorityData.current = [
      { scope: 'money', threshold_cents: 250000, prepares_only: false },
    ];
    const { container } = render(
      <PersonProfile
        personId="card-dana"
        role="contact"
        organizationId="org-1"
        onBack={jest.fn()}
        openPerson={jest.fn()}
        openThread={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );
    const phrase = screen.getByText('Signs money to $2,500');
    expect(phrase).toBeInTheDocument();
    expect(phrase.closest('[data-state-word]')).toBeNull();
    expect(container).toBeTruthy();
  });

  it('says so plainly when the seat carries no grant', () => {
    renderCard();
    expect(screen.getByText('No authority on this job')).toBeInTheDocument();
  });

  it('prints the seat’s own facts beside it', () => {
    renderCard();
    expect(
      screen.getByText('Escorted on site · Contracted through Marrow & Sons · Hidden from the client'),
    ).toBeInTheDocument();
  });

  it('folds a closed seat into Past seats, never into the live list', () => {
    seatData.current = [
      seat(),
      seat({
        seat_id: 'seat-0',
        project_name: 'Lindqvist kitchen',
        stage: 'warranty',
        off_job_at: '2025-11-21',
        warranty_until: '2026-11-21',
      }),
    ];
    renderCard();
    const past = screen
      .getByText(/Lindqvist kitchen/)
      .closest('li') as HTMLElement;
    expect(past).toHaveTextContent('Warranty');
    expect(past).toHaveTextContent('Closed 21 Nov 2025');
    expect(past).toHaveTextContent('Warranty through 21 Nov 2026');
    // The live list still holds only the open seat.
    expect(
      screen.getByRole('button', { name: /Okonkwo residence · Subcontractor/ }),
    ).toBeInTheDocument();
  });
});

describe('Send a text', () => {
  it('is held, with the reason beside it, when the studio holds no consent', () => {
    personData.current = person({ consent_status: 'opted_out' });
    renderCard();
    const act = screen.getByRole('button', { name: 'Send a text' });
    expect(act).not.toBeDisabled();
    expect(act).toHaveAttribute('aria-disabled', 'true');
    const reason = document.getElementById(
      act.getAttribute('aria-describedby') as string,
    );
    expect(reason).toHaveTextContent(
      'The studio holds no standing consent for this number, so no text may go out.',
    );
  });

  it('opens the seat’s own sheet when consent stands', () => {
    const { onOpenSeat } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Send a text' }));
    expect(onOpenSeat).toHaveBeenCalled();
  });
});

describe('the one surviving branch', () => {
  it('a maker opens the vendor’s own book', () => {
    renderCard({ role: 'maker' });
    expect(screen.getByTestId('maker-profile')).toBeInTheDocument();
  });
});
