import { fireEvent, render, type RenderResult } from '@testing-library/react';
import type { ProjectRosterRow } from '@patina/supabase';
import { CallSheet } from '../call-sheet';
import { ProjectTeamRoster } from '../project-team-roster';

const useProjectRoster = jest.fn();
const useProjectV2 = jest.fn();
const mockRolodexPicker = jest.fn(() => null);

jest.mock('@patina/supabase', () => ({
  useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
  useProjectV2: (...args: unknown[]) => useProjectV2(...args),
  useUpdateProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRemoveProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendPartySms: () => ({ mutateAsync: jest.fn(), isPending: false }),
  fieldLinkUrl: (token: string) => token,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));

jest.mock('../rolodex-picker', () => ({
  RolodexPicker: (props: unknown) => mockRolodexPicker(props),
}));

function row(id: string, over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: id,
    source: 'party',
    project_id: 'project-1',
    kind: 'sub',
    display_name: id,
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: null,
    studio_contact_id: null,
    profile_id: null,
    show_to_client: false,
    has_active_field_link: false,
    sms_consent_status: 'not_asked',
    updated_at: null,
    ...over,
  };
}

function groupSnapshot(view: RenderResult) {
  return Array.from(view.baseElement.querySelectorAll<HTMLElement>('[data-roster-group]')).map(
    (group) => ({
      group: group.dataset.rosterGroup,
      rows: Array.from(group.querySelectorAll('li')).map((item) =>
        item.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    }),
  );
}

function expectMatchingSurfaces(rows: ProjectRosterRow[]) {
  useProjectRoster.mockReturnValue({ data: rows, isLoading: false });
  useProjectV2.mockReturnValue({
    data: { client: { id: 'client-1', full_name: 'Margaret Ellsworth' } },
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
  const callSheetGroups = groupSnapshot(callSheet);
  callSheet.unmount();

  const team = render(<ProjectTeamRoster projectId="project-1" />);
  expect(groupSnapshot(team)).toEqual(callSheetGroups);
  return team;
}

beforeEach(() => {
  useProjectRoster.mockReset();
  useProjectV2.mockReset();
  mockRolodexPicker.mockClear();
});

describe('Project roster surfaces', () => {
  it('show the same people, roles, and grouping for a GC-led project', () => {
    const team = expectMatchingSurfaces([
      row('lead', {
        source: 'team',
        kind: 'lead_designer',
        display_name: 'Leah Warner',
        profile_id: 'lead-1',
      }),
      row('gc', { kind: 'gc', display_name: 'Danny Ochoa' }),
      row('sub', { kind: 'sub', display_name: 'Rosa Martínez', trade: 'tile' }),
    ]);

    expect(team.container.querySelector('[data-roster-group="buildSupply"]')?.textContent)
      .toContain('Danny Ochoa');
  });

  it('show the same direct trades without inventing a GC', () => {
    const team = expectMatchingSurfaces([
      row('electric', { kind: 'sub', display_name: 'Maya Electric', trade: 'electrical' }),
      row('installer', { kind: 'installer', display_name: 'North Star Install' }),
    ]);

    const build = team.container.querySelector('[data-roster-group="buildSupply"]');
    expect(build?.textContent).toContain('Maya Electric');
    expect(build?.textContent).toContain('North Star Install');
    expect(build?.textContent).not.toContain('General Contractor');
  });

  it('opens the shared picker scoped to GC and direct trade roles', () => {
    useProjectRoster.mockReturnValue({ data: [], isLoading: false });
    useProjectV2.mockReturnValue({ data: { client: null }, isLoading: false });
    const view = render(<ProjectTeamRoster projectId="project-1" />);

    expect(view.getByText('Build the project team')).toBeInTheDocument();
    expect(view.getByText(/Start with · GC or trade/)).toBeInTheDocument();
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
});
