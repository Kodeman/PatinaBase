/**
 * The Document's Call Sheet mount (Wave 5) — the dead-chevron fix.
 *
 * /doc/[id]/page.tsx mounted <CallSheet> with no `onOpenProfile`, so no roster
 * row could open PartyProfileSheet and the promote route from the sheet (Wave
 * 2's PromoteBand, which lives inside it) was orphaned. This spec holds the
 * wiring the page now delegates to: the chevron exists on party rows, it
 * carries the party's id and kind through, and the profile sheet opens over
 * the call sheet without closing it.
 *
 * PartyProfileSheet itself is stubbed — its own surface has its own specs, and
 * what matters here is the props it receives.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProjectRosterRow } from '@patina/supabase';
import { CallSheetMount } from '../call-sheet-mount';

const useProjectRoster = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
  useUpdateProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRemoveProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendPartySms: () => ({ mutateAsync: jest.fn(), isPending: false }),
  fieldLinkUrl: (t: string) => t,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));

jest.mock('../rolodex-picker', () => ({ RolodexPicker: () => null }));

// The chevron's destination, stubbed to its props. Rendered only when open so
// "is the profile up?" is a presence question, matching the real sheet's own
// closed state (RoomSheet renders nothing while closed).
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

function row(over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: 'party-1',
    source: 'party',
    project_id: 'proj-1',
    kind: 'sub',
    display_name: 'Rosa Martínez',
    company_name: null,
    email: null,
    phone: null,
    trade: 'tile',
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

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'proj-1',
  projectTitle: 'Ellsworth Residence',
  clientName: 'Harold Ellsworth',
  clientProfileId: 'client-profile-1',
};

beforeEach(() => {
  useProjectRoster.mockReset();
  useProjectRoster.mockReturnValue({ data: [row()], isLoading: false });
  partyProfileProps.mockClear();
  props.onClose.mockClear();
});

describe('CallSheetMount — the chevron is wired', () => {
  it('renders a chevron for a party row on the page’s own mount', () => {
    render(<CallSheetMount {...props} />);
    expect(
      screen.getByRole('button', { name: /Open Rosa Martínez's profile/ }),
    ).toBeInTheDocument();
  });

  it('opens the party profile with the party id and kind the row carries', () => {
    render(<CallSheetMount {...props} />);

    expect(screen.queryByTestId('party-profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open Rosa Martínez's profile/ }));

    const sheet = screen.getByTestId('party-profile');
    expect(sheet).toHaveAttribute('data-party-id', 'party-1');
    expect(sheet).toHaveAttribute('data-role', 'sub');
    // The call sheet is still underneath — a sheet never unmounts what it
    // opened from (D1).
    expect(screen.getByText('Everyone on Ellsworth Residence, and how to reach them.'))
      .toBeInTheDocument();
  });

  it('puts the profile away without closing the call sheet', () => {
    render(<CallSheetMount {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Open Rosa Martínez's profile/ }));
    expect(screen.getByTestId('party-profile')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close the profile' }));
    expect(screen.queryByTestId('party-profile')).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('passes the document’s client identity down to the sheet', () => {
    render(<CallSheetMount {...props} />);
    expect(
      screen.getByRole('button', { expanded: false, name: /Harold Ellsworth/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('The client')).toBeInTheDocument();
  });

  it('opens no profile for a kind people_directory has no row for', () => {
    useProjectRoster.mockReturnValue({
      data: [row({ kind: 'vendor', display_name: 'Ochoa Lighting' })],
      isLoading: false,
    });
    render(<CallSheetMount {...props} />);
    expect(screen.queryByRole('button', { name: /profile/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('party-profile')).not.toBeInTheDocument();
  });
});
