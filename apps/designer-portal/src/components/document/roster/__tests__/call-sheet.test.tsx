/**
 * The Call Sheet's own pixels (SPEC §5.4 #1–#3, #6, #8–#10).
 *
 * The head names the job, folds the site access card to one line with a way in,
 * and counts the WINDOW. Beneath it the six bands print in one order, with
 * Bidding standing apart from the crew.
 *
 * The picker and the site access card are stubbed: each has its own spec, and
 * stacking a second overlay here would make this one about overlays.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { PeopleDirectorySeat, ProjectRosterRow } from '@patina/supabase';
import { CallSheet } from '../call-sheet';

const useProjectRoster = jest.fn();
const usePeopleSeats = jest.fn();

/** QA-R13-1: the row resolves the job a consent record NAMES, so the sheet's
 *  own project name is never substituted into R-Q's sentence. */
jest.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: [] }),
}));

jest.mock('@patina/supabase', () => {
  const BID = ['prospect', 'invited', 'bidding', 'declined', 'no_response'];
  const DONE = ['closeout', 'warranty', 'off_job', 'retired'];
  return {
    useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
    usePeopleSeats: (...args: unknown[]) => usePeopleSeats(...args),
    useProjectConsentOrg: () => ({ data: 'studio-1' }),
    // QA-2: the head's Add sheet needs the studio that holds the book, folded
    // from the directory exactly as the Room and the picker fold it.
    useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
    usePeopleDirectory: () => ({ data: [] }),
    useSiteAccessCard: () => ({
      data: {
        key_holder_engagement_id: 'seat-ngozi',
        changed_at: '2026-10-16T14:00:00Z',
        lockbox_version: 'Lockbox, version 3',
        told_refs: [],
        emergency_lines: [],
      },
      isLoading: false,
    }),
    rosterBandFor: (
      seat: { stage: string | null; on_site_from: string | null },
      today: string,
    ) => {
      const stage = seat.stage ?? '';
      if (DONE.includes(stage)) return 'done';
      if (BID.includes(stage)) return 'bidding';
      if (seat.on_site_from && seat.on_site_from > today) return 'later';
      return 'this_week';
    },
    rosterDateKey: () => '2026-10-20',
    // The row's own rails — collapsed rows never call them, but the module
    // must resolve.
    useUpdateProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCloseProjectPartySeat: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRemoveProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSendPartySms: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useChannelConsent: () => ({ data: { verdict: null, record: null } }),
    useComplianceDocuments: () => ({ data: [] }),
    fieldLinkUrl: (t: string) => t,
    AUTHORITY_SCOPE_LABELS: { money: 'Signs money', selections: 'Selections' },
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
    // r8 BLOCKING-1: the face reads the same answer the write does.
    bidStageOutcome: (
      previous: { bidOutcome: string | null; stage: string | null },
      next: string | null | undefined,
    ) => {
      const stages: Record<string, string> = {
        asked: 'invited',
        quoted: 'bidding',
        selected: 'awarded',
        declined: 'declined',
        no_response: 'no_response',
        withdrawn: 'off_job',
      };
      const outcome = next ?? null;
      const moved = outcome !== (previous.bidOutcome ?? null);
      const pastTheBid = [
        'mobilized',
        'active',
        'closeout',
        'warranty',
        'retired',
      ].includes(previous.stage ?? '');
      const writes = !!outcome && moved && (!pastTheBid || outcome === 'withdrawn');
      return {
        outcome,
        moved,
        pastTheBid,
        stage: writes ? stages[outcome as string] : null,
      };
    },
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
  };
});

// The project-wide authority read is a react-query hook of its own; the sheet
// under test is about the bands and the head, not about a QueryClientProvider.
jest.mock('../use-project-authority', () => ({
  useProjectAuthority: () => ({ data: {} }),
}));

const mockRolodexPicker = jest.fn(() => null);
jest.mock('../rolodex-picker', () => ({
  RolodexPicker: (props: unknown) => mockRolodexPicker(props),
}));

const mockAddPersonSheet = jest.fn(() => null);
jest.mock('../../people/directory/add-person-sheet', () => ({
  AddPersonSheet: (props: unknown) => mockAddPersonSheet(props),
}));

const mockSiteAccessCard = jest.fn(() => null);
jest.mock('../site-access-card', () => ({
  SiteAccessCard: (props: unknown) => mockSiteAccessCard(props),
  useSiteAccessSummary: () =>
    'Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026.',
}));

function seat(over: Partial<PeopleDirectorySeat>): PeopleDirectorySeat {
  return {
    identity_key: 'k',
    person_id: 'card',
    seat_id: 'seat',
    project_id: 'okonkwo',
    project_name: 'Okonkwo residence',
    project_status: 'active',
    designer_id: null,
    party_kind: 'sub',
    display_name: 'Someone',
    trade: null,
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

const SEATS = [
  seat({
    seat_id: 'seat-adaeze',
    party_kind: 'client',
    display_name: 'Adaeze Okonkwo',
    reach_state: 'account',
    consent_status: 'granted',
  }),
  seat({
    seat_id: 'seat-dana',
    display_name: 'Dana Kowalski',
    trade: 'electrical',
    on_site_from: '2026-10-12',
    on_site_to: '2027-08-13',
    reach_state: 'field_link',
    consent_status: 'granted',
  }),
  seat({
    seat_id: 'seat-pete',
    display_name: 'Pete Rusk',
    stage: 'awarded',
    on_site_from: '2026-11-09',
    consent_status: 'opted_out',
  }),
  seat({ seat_id: 'seat-rivera', display_name: 'Rivera Finishes', stage: 'no_response' }),
  seat({
    seat_id: 'seat-granite',
    display_name: 'Granite North',
    stage: 'off_job',
    off_job_at: '2026-10-02',
  }),
];

const ROSTER: ProjectRosterRow[] = [
  {
    roster_id: 'team-priya',
    source: 'team',
    project_id: 'okonkwo',
    kind: 'team',
    display_name: 'Priya Natarajan',
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: 'Lead designer',
    studio_contact_id: null,
    profile_id: 'profile-priya',
    show_to_client: null,
    has_active_field_link: false,
    sms_consent_status: null,
    updated_at: null,
  },
];

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'okonkwo',
  projectTitle: 'Okonkwo residence',
};

beforeEach(() => {
  useProjectRoster.mockReset().mockReturnValue({ data: ROSTER, isLoading: false });
  usePeopleSeats.mockReset().mockReturnValue({ data: SEATS, isLoading: false });
  mockRolodexPicker.mockClear();
  mockSiteAccessCard.mockClear();
});

describe('CallSheet — the head', () => {
  it('names the job', () => {
    render(<CallSheet {...props} />);
    expect(screen.getByText('Call sheet · Okonkwo residence')).toBeInTheDocument();
  });

  it('folds the site access card to one line with a way in (R-U)', () => {
    render(<CallSheet {...props} />);
    expect(document.querySelector('[data-site-access-line]')).toHaveTextContent(
      'Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026.',
    );
    expect(
      screen.getByRole('button', { name: /Open the site access card/ }),
    ).toBeInTheDocument();
  });

  it('opens the site access card from that line (Leah task 3, one click)', () => {
    render(<CallSheet {...props} />);
    expect(mockSiteAccessCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Open the site access card/ }));
    expect(mockSiteAccessCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true }),
    );
  });

  it('counts the window first (SPEC §5.4 #3)', () => {
    render(<CallSheet {...props} />);
    // CR-9: all four numbers close over ONE population — studio side, client
    // side, on the job this week. The last three used to count every band.
    expect(document.querySelector('[data-call-sheet-vitals]')).toHaveTextContent(
      '3 on the job this week · 2 reachable by text · 2 with accounts · 0 on paper',
    );
  });

  it('leads with From the rolodex, then New person, then Print', () => {
    render(<CallSheet {...props} />);
    expect(screen.getByRole('button', { name: /From the rolodex/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New person/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeInTheDocument();
  });
});

describe('CallSheet — the bands', () => {
  it('prints the six bands in one order, Bidding apart from the crew', () => {
    render(<CallSheet {...props} />);
    const bands = Array.from(document.querySelectorAll('[data-roster-band]')).map((el) =>
      el.getAttribute('data-roster-band'),
    );
    expect(bands).toEqual([
      'studioSide',
      'clientSide',
      'this_week',
      'later',
      'bidding',
      'done',
    ]);
    expect(screen.getByText('Studio side')).toBeInTheDocument();
    expect(screen.getByText('On the job · this week')).toBeInTheDocument();
    expect(screen.getByText('On the job · later')).toBeInTheDocument();
    expect(screen.getByText('Bidding')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  /**
   * QA-2 — the count used to sit as a bare sibling of the label inside the
   * <h2>, so no element's text was ever exactly "Studio side": the heading's
   * read "Studio side2" and its accessible name "Studio side 2". SPEC §5.4 #4
   * and direction §3.4 name the band by the plain words, and an e2e locator
   * for the heading could not find one. `getByText` would not have caught it
   * (it reads a node's DIRECT text children only), so this walks textContent.
   */
  it('QA-2 — every band label is an element whose whole text is the label', () => {
    render(<CallSheet {...props} />);
    const labels: Record<string, string> = {
      studioSide: 'Studio side',
      clientSide: 'Client side',
      this_week: 'On the job · this week',
      later: 'On the job · later',
      bidding: 'Bidding',
      done: 'Done',
    };
    for (const [band, label] of Object.entries(labels)) {
      const heading = document.querySelector(`[data-roster-band="${band}"] h2`);
      expect(heading).not.toBeNull();
      const own = Array.from(heading!.querySelectorAll('*')).filter(
        (el) => (el.textContent ?? '').trim() === label,
      );
      expect(own).toHaveLength(1);
    }
  });

  it('never says Build & supply', () => {
    render(<CallSheet {...props} />);
    expect(document.body.textContent).not.toMatch(/Build & supply/i);
  });

  it('puts each name in the band its window decides', () => {
    render(<CallSheet {...props} />);
    const band = (key: string) =>
      document.querySelector(`[data-roster-band="${key}"]`)?.textContent ?? '';
    expect(band('studioSide')).toContain('Priya Natarajan');
    expect(band('clientSide')).toContain('Adaeze Okonkwo');
    expect(band('this_week')).toContain('Dana Kowalski');
    expect(band('later')).toContain('Pete Rusk');
    expect(band('bidding')).toContain('Rivera Finishes');
    expect(band('done')).toContain('Granite North');
  });

  it('says so plainly when nobody is on the job yet', () => {
    usePeopleSeats.mockReturnValue({ data: [], isLoading: false });
    useProjectRoster.mockReturnValue({ data: [], isLoading: false });
    render(<CallSheet {...props} />);
    expect(screen.getByText('– No one is on the call sheet yet.')).toBeInTheDocument();
  });
});

describe('CallSheet — the picker doorways', () => {
  it('opens the picker on From the rolodex', () => {
    render(<CallSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /From the rolodex/ }));
    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, startInAdd: false }),
    );
  });

  // QA-2 (w2 r5): "New person" opened the rolodex picker's inline form, so the
  // Call Sheet could not reach direction §3.5's Add sheet — the kind switch,
  // the contact rule, the consent capture and the authority field — at all.
  it('opens the Add sheet on New person, on this job, not the picker', () => {
    render(<CallSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /New person/ }));
    expect(mockAddPersonSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, initialProjectId: 'okonkwo' }),
    );
    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false }),
    );
  });

  it('honours a pre-addressed open mode', () => {
    render(<CallSheet {...props} openMode="add" />);
    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, startInAdd: true }),
    );
  });
});
