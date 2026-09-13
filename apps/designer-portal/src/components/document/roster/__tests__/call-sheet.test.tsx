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

jest.mock('@patina/supabase', () => {
  const BID = ['prospect', 'invited', 'bidding', 'declined', 'no_response'];
  const DONE = ['closeout', 'warranty', 'off_job', 'retired'];
  return {
    useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
    usePeopleSeats: (...args: unknown[]) => usePeopleSeats(...args),
    useProjectConsentOrg: () => ({ data: 'studio-1' }),
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
    expect(document.querySelector('[data-call-sheet-vitals]')).toHaveTextContent(
      '1 on the job this week · 2 reachable by text · 2 with accounts · 3 on paper',
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

  it('opens it already adding on New person', () => {
    render(<CallSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /New person/ }));
    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, startInAdd: true }),
    );
  });

  it('honours a pre-addressed open mode', () => {
    render(<CallSheet {...props} openMode="add" />);
    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, startInAdd: true }),
    );
  });
});
