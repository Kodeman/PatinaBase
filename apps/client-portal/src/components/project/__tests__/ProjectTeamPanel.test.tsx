import { render, screen } from '@testing-library/react';

import { ProjectTeamPanel } from '../ProjectTeamPanel';

const useProjectParties = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectTeamMembers: () => ({ data: [], isLoading: false }),
  useStudioIdentity: () => ({ data: { name: 'Lake House Studio', source: 'studio' } }),
  useProjectParties: (...args: unknown[]) => useProjectParties(...args),
}));

function party(overrides: Record<string, unknown> = {}) {
  return {
    id: 'party-1',
    project_id: 'project-1',
    party_kind: 'gc',
    display_name: 'Jordan Reyes',
    company_name: 'Reyes Construction',
    email: 'jordan@reyesco.example',
    phone: '+15551234567',
    phone_e164: '+15551234567',
    trade: null,
    sms_consent_status: 'granted',
    sms_consented_at: null,
    sms_opt_out_at: null,
    vendor_id: null,
    profile_id: null,
    studio_contact_id: null,
    show_to_client: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ProjectTeamPanel — On the job', () => {
  it('renders no "On the job" group when there are zero opted-in rows', () => {
    useProjectParties.mockReturnValue({ data: [], isLoading: false });

    render(<ProjectTeamPanel projectId="project-1" />);

    expect(screen.queryByText('On the job')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-on-the-job')).not.toBeInTheDocument();
  });

  it('hides the group when every party row is opted out, even if some exist', () => {
    useProjectParties.mockReturnValue({
      data: [party({ id: 'party-2', show_to_client: false })],
      isLoading: false,
    });

    render(<ProjectTeamPanel projectId="project-1" />);

    expect(screen.queryByText('On the job')).not.toBeInTheDocument();
  });

  it('renders the display name and a plain-English label, with no phone/email/consent', () => {
    useProjectParties.mockReturnValue({
      data: [party()],
      isLoading: false,
    });

    render(<ProjectTeamPanel projectId="project-1" />);

    expect(screen.getByText('On the job')).toBeInTheDocument();
    expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
    expect(screen.getByText('General contractor')).toBeInTheDocument();

    expect(screen.queryByText('+15551234567')).not.toBeInTheDocument();
    expect(screen.queryByText('jordan@reyesco.example')).not.toBeInTheDocument();
    expect(screen.queryByText(/granted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });

  it.each([
    ['gc', null, 'General contractor'],
    ['sub', 'tile', 'Tile'],
    ['sub', null, 'Subcontractor'],
    ['installer', null, 'Installer'],
    ['receiver', null, 'Receiving'],
    ['architect', null, 'Architect'],
    ['photographer', null, 'Photographer'],
    ['stager', null, 'Stager'],
    ['vendor', null, 'Vendor'],
  ])('maps party_kind=%s trade=%s to the label %s', (party_kind, trade, label) => {
    useProjectParties.mockReturnValue({
      data: [
        party({
          party_kind,
          trade,
          display_name: 'On The Job Person',
          company_name: null,
        }),
      ],
      isLoading: false,
    });

    render(<ProjectTeamPanel projectId="project-1" />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('only queries with an explicit show_to_client filter applied client-side', () => {
    useProjectParties.mockReturnValue({
      data: [party({ id: 'a', show_to_client: true }), party({ id: 'b', show_to_client: false })],
      isLoading: false,
    });

    render(<ProjectTeamPanel projectId="project-1" />);

    // Only the opted-in row renders even though the mocked hook returned both.
    expect(screen.getAllByText('Jordan Reyes')).toHaveLength(1);
  });
});
