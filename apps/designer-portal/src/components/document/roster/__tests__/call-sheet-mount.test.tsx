/**
 * The Document's Call Sheet mount — the chevron's destination.
 *
 * The sheet forwards `onOpenSeat` rather than stacking a second overlay of its
 * own; this component is the caller that mounts the person. What matters here
 * is the wiring: the chevron exists on a seat the directory's party branch
 * admits, it carries that seat's id and kind through, it opens nothing for a
 * kind the branch excludes, and the call sheet stays open underneath (D1).
 *
 * PartyProfileSheet itself is stubbed — its own surface has its own specs.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { PeopleDirectorySeat } from '@patina/supabase';
import { CallSheetMount } from '../call-sheet-mount';

const usePeopleSeats = jest.fn();

// QA-2: the head now mounts the Add sheet itself. This spec is about the rows
// beneath it, so the sheet is stubbed the way the picker and the access card
// already are.
jest.mock('../../people/directory/add-person-sheet', () => ({
  AddPersonSheet: () => null,
}));

/** QA-R13-1: the row resolves the job a consent record NAMES, so the sheet's
 *  own project name is never substituted into R-Q's sentence. */
jest.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: [] }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectRoster: () => ({ data: [], isLoading: false }),
  usePeopleSeats: (...args: unknown[]) => usePeopleSeats(...args),
  useProjectConsentOrg: () => ({ data: 'studio-1' }),
  // QA-2: the head mounts the Add sheet, which asks which studio holds
  // the book (the directory fold, the membership list behind it).
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
  usePeopleDirectory: () => ({ data: [] }),
  useProjectRecordedStudio: () => ({ data: 'studio-1' }),
  useSiteAccessCard: () => ({ data: null, isLoading: false }),
  rosterBandFor: () => 'this_week',
  rosterDateKey: () => '2026-10-20',
  useUpdateProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCloseProjectPartySeat: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRemoveProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendPartySms: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useChannelConsent: () => ({ data: { verdict: null, record: null } }),
  useComplianceDocuments: () => ({ data: [] }),
  fieldLinkUrl: (t: string) => t,
  AUTHORITY_SCOPE_LABELS: {},
  COMPLIANCE_DOC_TYPE_LABELS: {},
  SEAT_DELETE_REFUSAL_SENTENCES: { consent: '', bid: '', waiver: '', unknown: '' },
  // W2 r1: the sheet reads the rule ROWS and the routed people's channels,
  // so one predicate and one clause serve every face (CR-5/6/14/15/22).
  useContactRules: () => ({ data: [] }),
  useStudioContactChannelsFor: () => ({ data: [] }),
  useStudioContacts: () => ({ data: [] }),
  // ── W3/P2 ────────────────────────────────────────────────────────────
  useProjectPartyBids: () => ({ data: {} }),
  useSetPartyBid: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useComplianceNotices: () => ({ data: [] }),
  indexComplianceNotices: () => new Map(),
  ALL_SEAT_BID_OUTCOMES: [
    'asked',
    'quoted',
    'selected',
    'declined',
    'no_response',
    'withdrawn',
  ],
  SEAT_BID_OUTCOME_ACTS: {
    asked: 'Asked for a price',
    quoted: 'They quoted',
    selected: 'Selected',
    declined: 'They declined',
    no_response: 'No response',
    withdrawn: 'They withdrew',
  },
  // MAJOR-3: the consequence sentence names a destination, so it reads the
  // STATE map, not the act map.
  SEAT_BID_OUTCOME_LABELS: {
    asked: 'Bidding',
    quoted: 'Bidding',
    selected: 'Awarded',
    declined: 'Declined',
    no_response: 'No response',
    withdrawn: 'Off the job',
  },
  // MAJOR-1 / MAJOR-7: the bid follows its COLUMNS, not the band.
  seatCarriesBid: (bid: Record<string, unknown> | null | undefined) =>
    !!bid &&
    [
      'bidDueAt',
      'bidOutcome',
      'bidValidUntil',
      'bidQuotedByPersonId',
      'bidAmountCents',
      'bidAskedAt',
      'bidQuotedAt',
      'bidSelectedAt',
    ].some((key) => bid[key] != null),
  useProjectHousehold: () => ({ data: null }),
  useAddHouseholdMember: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateClientHousehold: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetHouseholdThreshold: () => ({ mutateAsync: jest.fn(), isPending: false }),
  HOUSEHOLD_MEMBER_ROLE_LABELS: {
    client: 'decides the work',
    client_rep: 'signs for the household',
  },
  seatDeleteRefusal: () => null,
}));

jest.mock('../use-project-authority', () => ({
  useProjectAuthority: () => ({ data: {} }),
}));

jest.mock('../rolodex-picker', () => ({ RolodexPicker: () => null }));
jest.mock('../site-access-card', () => ({
  SiteAccessCard: () => null,
  useSiteAccessSummary: () => '',
}));

const partyProfileProps = jest.fn();
jest.mock('../../people/party-profile-sheet', () => ({
  PartyProfileSheet: (props: {
    open: boolean;
    partyId: string | null;
    role: string;
    onClose: () => void;
  }) => {
    partyProfileProps(props);
    return props.open ? (
      <div data-testid="party-profile" data-party-id={props.partyId} data-role={props.role}>
        <button type="button" onClick={props.onClose}>
          Close the profile
        </button>
      </div>
    ) : null;
  },
}));

function seat(over: Partial<PeopleDirectorySeat> = {}): PeopleDirectorySeat {
  return {
    identity_key: 'k',
    person_id: 'card-rosa',
    seat_id: 'seat-rosa',
    project_id: 'proj-1',
    project_name: 'Ellsworth Residence',
    project_status: 'active',
    designer_id: null,
    party_kind: 'sub',
    display_name: 'Rosa Martínez',
    trade: 'tile',
    stage: 'active',
    on_site_from: null,
    on_site_to: null,
    site_access_mode: null,
    contracted_through: null,
    company_id: null,
    company_name: null,
    warranty_until: null,
    warranty_contact_person_id: null,
    off_job_at: null,
    off_job_reason: null,
    show_to_client: false,
    studio_contact_id: null,
    phone_e164: null,
    consent_status: null,
    reach_state: 'on_paper',
    paper_state: null,
    contact_rule_summary: null,
    updated_at: null,
    scope: 'studio',
    ...over,
  };
}

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'proj-1',
  projectTitle: 'Ellsworth Residence',
  clientName: 'Harold Ellsworth',
  clientProfileId: 'client-profile-1',
};

beforeEach(() => {
  usePeopleSeats.mockReset().mockReturnValue({ data: [seat()], isLoading: false });
  partyProfileProps.mockClear();
  props.onClose.mockClear();
});

describe('CallSheetMount — the chevron is wired', () => {
  it('draws a chevron for a seat the directory admits', () => {
    render(<CallSheetMount {...props} />);
    expect(screen.getByRole('button', { name: 'Open Rosa Martínez' })).toBeInTheDocument();
  });

  it('opens the person with the seat id and the kind the row carries', () => {
    render(<CallSheetMount {...props} />);
    expect(screen.queryByTestId('party-profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Rosa Martínez' }));

    const sheet = screen.getByTestId('party-profile');
    expect(sheet).toHaveAttribute('data-party-id', 'seat-rosa');
    expect(sheet).toHaveAttribute('data-role', 'sub');
    // The call sheet is still underneath — a sheet never unmounts what it
    // opened from (D1).
    expect(screen.getByText('Call sheet · Ellsworth Residence')).toBeInTheDocument();
  });

  it('puts the person away without closing the call sheet', () => {
    render(<CallSheetMount {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Rosa Martínez' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close the profile' }));
    expect(screen.queryByTestId('party-profile')).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('passes the document own client identity down to the sheet', () => {
    render(<CallSheetMount {...props} />);
    expect(screen.getByText('Harold Ellsworth')).toBeInTheDocument();
    expect(screen.getByText('The client')).toBeInTheDocument();
  });

  // CR-3 — R-AA, "no inert buttons". The chevron used to render for every
  // CARDED seat of every kind and `openSeat` refused silently for the kinds
  // `seatProfileRole` excludes (client, client_rep, other, vendor) — a
  // focusable control announced "Open Ochoa Lighting" that did nothing, and
  // `personCardOpened` fired before the refusal. Where there is no door, there
  // is now no chevron.
  it('prints no chevron at all for a kind the directory party branch excludes', () => {
    usePeopleSeats.mockReturnValue({
      data: [seat({ party_kind: 'vendor', display_name: 'Ochoa Lighting' })],
      isLoading: false,
    });
    render(<CallSheetMount {...props} />);
    expect(
      screen.queryByRole('button', { name: 'Open Ochoa Lighting' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('party-profile')).not.toBeInTheDocument();
  });
});
