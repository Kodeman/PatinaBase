import { render, screen } from '@testing-library/react';
import type { ProjectRosterRow } from '@patina/supabase';
import { CallSheet } from '../call-sheet';

const useProjectRoster = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
  // Consumed by RosterRow's unfold rails — collapsed rows never call them,
  // but the module must resolve.
  useUpdateProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRemoveProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendPartySms: () => ({ mutateAsync: jest.fn(), isPending: false }),
  fieldLinkUrl: (t: string) => t,
}));

let mockFlagValue = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: mockFlagValue, isLoading: false }),
}));

// The picker is its own sheet with its own spec — stub it so this spec is
// about the call sheet's own pixels (and so a second overlay never stacks).
// Kept as a prop-capturing mock (not just () => null) so the openMode specs
// below can assert what CallSheet hands it — `open`/`startInAdd` — without
// depending on the picker's own rendering.
const mockRolodexPicker = jest.fn(() => null);
jest.mock('../rolodex-picker', () => ({
  RolodexPicker: (props: unknown) => mockRolodexPicker(props),
}));

function row(over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: `r-${Math.random().toString(36).slice(2)}`,
    source: 'party',
    project_id: 'proj-1',
    kind: 'sub',
    display_name: 'Someone',
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

const ROSTER = [
  row({ source: 'team', kind: 'team', display_name: 'Leah Warner', profile_id: 'p-1' }),
  row({ kind: 'client', display_name: 'Margaret Ellsworth', profile_id: 'p-2' }),
  row({ kind: 'gc', display_name: 'Danny Ochoa', has_active_field_link: true }),
  row({ kind: 'sub', trade: 'tile', display_name: 'Rosa Martínez' }),
];

// The default props carry NO client identity — the specs below that are about
// the roster's own rows stay exactly as they were before Wave 5's synthetic
// client row existed. The client-side specs pass it explicitly.
const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'proj-1',
  projectTitle: 'Ellsworth Residence',
};

beforeEach(() => {
  mockFlagValue = true;
  useProjectRoster.mockReset();
  useProjectRoster.mockReturnValue({ data: ROSTER, isLoading: false });
  mockRolodexPicker.mockClear();
});

describe('CallSheet — the sheet', () => {
  it('renders the sub-line and the vitals in one mono string', () => {
    render(<CallSheet {...props} />);
    expect(
      screen.getByText('Everyone on Ellsworth Residence, and how to reach them.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('4 ON THE JOB · 0 REACHABLE BY TEXT · 2 WITH ACCOUNTS'),
    ).toBeInTheDocument();
  });

  it('renders the three groups with their counts, and nothing else', () => {
    render(<CallSheet {...props} />);
    expect(screen.getByText('Studio side')).toBeInTheDocument();
    expect(screen.getByText('Client side')).toBeInTheDocument();
    expect(screen.getByText('Build & supply')).toBeInTheDocument();
    // Studio 1 · Client 1 · Build & supply 2 (gc + sub)
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('omits a group entirely when nobody is in it', () => {
    useProjectRoster.mockReturnValue({
      data: [row({ kind: 'gc', display_name: 'Danny Ochoa' })],
      isLoading: false,
    });
    render(<CallSheet {...props} />);
    expect(screen.getByText('Build & supply')).toBeInTheDocument();
    expect(screen.queryByText('Studio side')).not.toBeInTheDocument();
    expect(screen.queryByText('Client side')).not.toBeInTheDocument();
  });

  it('permits exactly ONE primary in the action region (scored ink)', () => {
    const { baseElement } = render(<CallSheet {...props} />);
    const region = baseElement.querySelector(
      '[data-action-region="call-sheet-actions"]',
    );
    expect(region).not.toBeNull();
    expect(
      region!.querySelectorAll('[data-action-variant="primary"]'),
    ).toHaveLength(1);
    // …and it is FROM THE ROLODEX, not NEW PERSON (slide 11, mnote 2).
    expect(
      region!.querySelector('[data-action-variant="primary"]')?.textContent,
    ).toContain('From the rolodex');
  });
});

// ============================================================================
// THE CLIENT (Wave 5) — v_project_roster has no client branch, so the project's
// actual client (projects.client_id) never appeared on their own call sheet.
// The document hands their identity down; the sheet prepends the row.
// ============================================================================

describe('CallSheet — the client on the call sheet', () => {
  // Deliberately NOT the ROSTER's client-kind party row (Margaret) — the
  // dedupe specs below own that collision.
  const withClient = {
    ...props,
    clientName: 'Harold Ellsworth',
    clientProfileId: 'client-profile-1',
  };

  // The sheet also prints the client name as its mono sub-line, so rows are
  // queried by their own unfold button rather than by bare text.
  const clientRows = () =>
    screen.queryAllByRole('button', { expanded: false, name: /Harold Ellsworth/ });

  it('shows the client on the client side, and says so in mono', () => {
    render(<CallSheet {...withClient} />);
    expect(clientRows()).toHaveLength(1);
    expect(screen.getByText('The client')).toBeInTheDocument();
    expect(screen.getByText('Client side')).toBeInTheDocument();
  });

  it('counts the client in the vitals the sheet prints', () => {
    render(<CallSheet {...withClient} />);
    // 5 rows shown (4 roster + the client), 3 with accounts (2 roster + the
    // client's own profile). Nobody is textable — no consent is granted.
    expect(
      screen.getByText('5 ON THE JOB · 0 REACHABLE BY TEXT · 3 WITH ACCOUNTS'),
    ).toBeInTheDocument();
  });

  it('gives the client no party affordances — not even a chevron', () => {
    render(<CallSheet {...withClient} onOpenProfile={jest.fn()} />);
    expect(
      screen.queryByRole('button', { name: /Open Harold Ellsworth's profile/ }),
    ).not.toBeInTheDocument();
  });

  it('stands in for the empty state when nobody else is on the job yet', () => {
    useProjectRoster.mockReturnValue({ data: [], isLoading: false });
    render(<CallSheet {...withClient} />);
    expect(screen.queryByText('– No one is on the call sheet yet.')).not.toBeInTheDocument();
    expect(clientRows()).toHaveLength(1);
    expect(
      screen.getByText('1 ON THE JOB · 0 REACHABLE BY TEXT · 1 WITH ACCOUNTS'),
    ).toBeInTheDocument();
  });

  it('never reads the client twice when a party row already claims them', () => {
    useProjectRoster.mockReturnValue({
      data: [
        row({
          kind: 'client',
          display_name: 'Harold Ellsworth',
          profile_id: 'client-profile-1',
        }),
      ],
      isLoading: false,
    });
    render(<CallSheet {...withClient} />);
    // One row, not two — and it is the party row (no THE CLIENT pill), the
    // one with a phone number and actions under it.
    expect(clientRows()).toHaveLength(1);
    expect(screen.queryByText('The client')).not.toBeInTheDocument();
    expect(
      screen.getByText('1 ON THE JOB · 0 REACHABLE BY TEXT · 1 WITH ACCOUNTS'),
    ).toBeInTheDocument();
  });
});

describe('CallSheet — the empty sheet', () => {
  beforeEach(() => {
    useProjectRoster.mockReturnValue({ data: [], isLoading: false });
  });

  it('states the emptiness and offers the first name', () => {
    render(<CallSheet {...props} />);
    expect(screen.getByText('– No one is on the call sheet yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add the first name' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Studio side')).not.toBeInTheDocument();
  });

  it('still tells the truth in the vitals line', () => {
    render(<CallSheet {...props} />);
    expect(
      screen.getByText('0 ON THE JOB · 0 REACHABLE BY TEXT · 0 WITH ACCOUNTS'),
    ).toBeInTheDocument();
  });
});

describe('CallSheet — the flag', () => {
  it('renders nothing at all when `call-sheet` is off', () => {
    mockFlagValue = false;
    const { baseElement } = render(<CallSheet {...props} />);
    expect(baseElement.querySelector('[data-call-sheet-region]')).toBeNull();
    expect(screen.queryByText('Studio side')).not.toBeInTheDocument();
  });
});

// ============================================================================
// openMode — FIX 2 (kickoff/instrument open modes). document:open-call-sheet
// carries an optional { mode } detail; the page forwards it straight through
// as this prop. 'picker'/'add' pre-address the RolodexPicker so the doorway
// skips the intermediate roster list; the default 'sheet' behaves exactly as
// before (the picker stays closed until the sheet's own actions open it).
// ============================================================================

describe('CallSheet — openMode', () => {
  it('opens straight to the rolodex picker when openMode="picker"', () => {
    render(<CallSheet {...props} openMode="picker" />);

    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, startInAdd: false }),
    );
  });

  it('opens the picker already in its add-a-person state when openMode="add"', () => {
    render(<CallSheet {...props} openMode="add" />);

    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, startInAdd: true }),
    );
  });

  it('leaves the picker closed for the default "sheet" mode', () => {
    render(<CallSheet {...props} />);

    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false, startInAdd: false }),
    );
  });

  it('never pre-addresses the picker while the sheet itself is closed', () => {
    render(<CallSheet {...props} open={false} openMode="picker" />);

    expect(mockRolodexPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false }),
    );
  });
});
