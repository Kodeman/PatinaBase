/**
 * The two project-roster surfaces read the same book.
 *
 * The Call Sheet and the open-document's project-team region are one
 * projection: the same six bands, the same names, in the same order. A studio
 * that saw a different roster in two places would have two rosters.
 */

import { fireEvent, render, type RenderResult } from '@testing-library/react';
import type { PeopleDirectorySeat, ProjectRosterRow } from '@patina/supabase';
import { CallSheet } from '../call-sheet';
import { ProjectTeamRoster } from '../project-team-roster';

const useProjectRoster = jest.fn();
const usePeopleSeats = jest.fn();
const useProjectV2 = jest.fn();
const mockRolodexPicker = jest.fn(() => null);

// QA-2: the head now mounts the Add sheet itself. This spec is about the rows
// beneath it, so the sheet is stubbed the way the picker and the access card
// already are.
jest.mock('../../people/directory/add-person-sheet', () => ({
  AddPersonSheet: () => null,
}));

jest.mock('@patina/supabase', () => {
  const BID = ['prospect', 'invited', 'bidding', 'declined', 'no_response'];
  const DONE = ['closeout', 'warranty', 'off_job', 'retired'];
  return {
    useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
    usePeopleSeats: (...args: unknown[]) => usePeopleSeats(...args),
    useProjectV2: (...args: unknown[]) => useProjectV2(...args),
    useProjectConsentOrg: () => ({ data: 'studio-1' }),
    // QA-2: the head mounts the Add sheet, which asks which studio holds
    // the book (the directory fold, the membership list behind it).
    useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
    usePeopleDirectory: () => ({ data: [] }),
    useProjectRecordedStudio: () => ({ data: 'studio-1' }),
    useSiteAccessCard: () => ({ data: null, isLoading: false }),
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
    useUpdateProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCloseProjectPartySeat: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRemoveProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSendPartySms: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useChannelConsent: () => ({ data: { verdict: null, record: null } }),
    useComplianceDocuments: () => ({ data: [] }),
    fieldLinkUrl: (token: string) => token,
    AUTHORITY_SCOPE_LABELS: {},
    COMPLIANCE_DOC_TYPE_LABELS: {},
    SEAT_DELETE_REFUSAL_SENTENCES: { consent: '', bid: '', waiver: '', unknown: '' },
    // W2 r1: the sheet reads the rule ROWS and the routed people's channels,
    // so one predicate and one clause serve every face (CR-5/6/14/15/22).
    useContactRules: () => ({ data: [] }),
    useStudioContactChannelsFor: () => ({ data: [] }),
    useStudioContacts: () => ({ data: [] }),
    seatDeleteRefusal: () => null,
  };
});

jest.mock('../use-project-authority', () => ({
  useProjectAuthority: () => ({ data: {} }),
}));

jest.mock('../rolodex-picker', () => ({
  RolodexPicker: (props: unknown) => mockRolodexPicker(props),
}));

jest.mock('../site-access-card', () => ({
  SiteAccessCard: () => null,
  useSiteAccessSummary: () => '',
}));

function seat(id: string, over: Partial<PeopleDirectorySeat> = {}): PeopleDirectorySeat {
  return {
    identity_key: id,
    person_id: `card-${id}`,
    seat_id: id,
    project_id: 'project-1',
    project_name: 'Ellsworth Residence',
    project_status: 'active',
    designer_id: null,
    party_kind: 'sub',
    display_name: id,
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

function teamRow(over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: 'lead',
    source: 'team',
    project_id: 'project-1',
    kind: 'team',
    display_name: 'Leah Warner',
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: 'Lead designer',
    studio_contact_id: null,
    profile_id: 'lead-1',
    show_to_client: null,
    has_active_field_link: false,
    sms_consent_status: null,
    updated_at: null,
    ...over,
  };
}

function bandSnapshot(view: RenderResult) {
  return Array.from(view.baseElement.querySelectorAll<HTMLElement>('[data-roster-band]')).map(
    (band) => ({
      band: band.dataset.rosterBand,
      rows: Array.from(band.querySelectorAll('li')).map((item) =>
        item.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    }),
  );
}

function expectMatchingSurfaces(rows: ProjectRosterRow[], seats: PeopleDirectorySeat[]) {
  useProjectRoster.mockReturnValue({ data: rows, isLoading: false });
  usePeopleSeats.mockReturnValue({ data: seats, isLoading: false });
  useProjectV2.mockReturnValue({
    data: { name: 'Ellsworth Residence', client: { id: 'client-1', full_name: 'Margaret Ellsworth' } },
    isLoading: false,
  });

  const callSheet = render(
    <CallSheet
      open
      onClose={jest.fn()}
      projectId="project-1"
      projectTitle="Ellsworth Residence"
      clientName="Margaret Ellsworth"
      clientProfileId="client-1"
    />,
  );
  const callSheetBands = bandSnapshot(callSheet);
  callSheet.unmount();

  const team = render(<ProjectTeamRoster projectId="project-1" />);
  expect(bandSnapshot(team)).toEqual(callSheetBands);
  return team;
}

beforeEach(() => {
  useProjectRoster.mockReset();
  usePeopleSeats.mockReset();
  useProjectV2.mockReset();
  mockRolodexPicker.mockClear();
});

describe('Project roster surfaces', () => {
  it('show the same people and the same bands for a GC-led project', () => {
    const team = expectMatchingSurfaces(
      [teamRow()],
      [
        seat('gc', { party_kind: 'gc', display_name: 'Danny Ochoa' }),
        seat('sub', { display_name: 'Rosa Martínez', trade: 'tile' }),
      ],
    );
    expect(
      team.baseElement.querySelector('[data-roster-band="this_week"]')?.textContent,
    ).toContain('Danny Ochoa');
  });

  it('show the same direct trades without inventing a GC', () => {
    const team = expectMatchingSurfaces(
      [],
      [
        seat('electric', { display_name: 'Maya Electric', trade: 'electrical' }),
        seat('installer', { party_kind: 'installer', display_name: 'North Star Install' }),
      ],
    );
    const band = team.baseElement.querySelector('[data-roster-band="this_week"]');
    expect(band?.textContent).toContain('Maya Electric');
    expect(band?.textContent).toContain('North Star Install');
    expect(band?.textContent).not.toContain('General Contractor');
  });

  it('opens the shared picker scoped to GC and direct trade roles', () => {
    useProjectRoster.mockReturnValue({ data: [], isLoading: false });
    usePeopleSeats.mockReturnValue({ data: [], isLoading: false });
    useProjectV2.mockReturnValue({ data: { client: null }, isLoading: false });
    const view = render(<ProjectTeamRoster projectId="project-1" />);

    expect(view.getByText('Build the project team')).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Add GC or trade' }));
    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        projectId: 'project-1',
        scopeKinds: expect.arrayContaining(['gc', 'sub', 'installer']),
        startInAdd: false,
      }),
    );
  });

  it('distinguishes a roster it could not read from an empty one', () => {
    const retryProject = jest.fn();
    useProjectRoster.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    usePeopleSeats.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    useProjectV2.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: retryProject,
    });

    const view = render(<ProjectTeamRoster projectId="project-1" />);
    expect(view.getByRole('alert')).toHaveTextContent('could not be read');
    expect(view.queryByText('Build the project team')).not.toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Try again' }));
    expect(retryProject).toHaveBeenCalledTimes(1);
  });

  it('keeps loading distinct from empty guidance', () => {
    useProjectRoster.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    usePeopleSeats.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    useProjectV2.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const view = render(<ProjectTeamRoster projectId="project-1" />);
    expect(view.getByText('Reading the roster…')).toBeInTheDocument();
    expect(view.queryByText('Build the project team')).not.toBeInTheDocument();
  });
});
