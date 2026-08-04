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

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'proj-1',
  projectTitle: 'Ellsworth Residence',
  clientName: 'The Ellsworths',
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
