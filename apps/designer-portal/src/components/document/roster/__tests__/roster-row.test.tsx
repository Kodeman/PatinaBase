import { fireEvent, render, screen } from '@testing-library/react';
import type { ProjectRosterRow } from '@patina/supabase';
import { RosterRow } from '../roster-row';

const updateMutate = jest.fn();
const removeMutate = jest.fn();
const createLinkMutate = jest.fn();
const sendSmsMutate = jest.fn();

jest.mock('@patina/supabase', () => ({
  useUpdateProjectParty: () => ({ mutateAsync: updateMutate, isPending: false }),
  useRemoveProjectParty: () => ({ mutateAsync: removeMutate, isPending: false }),
  useCreateFieldLink: () => ({ mutateAsync: createLinkMutate, isPending: false }),
  useSendPartySms: () => ({ mutateAsync: sendSmsMutate, isPending: false }),
  fieldLinkUrl: (token: string) => `https://client.patina.cloud/field/${token}`,
}));

function row(over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: 'party-1',
    source: 'party',
    project_id: 'proj-1',
    kind: 'sub',
    display_name: 'Rosa Martínez',
    company_name: 'Martínez Tile Works',
    email: 'rosa@martineztile.co',
    phone: '(513) 555-0148',
    trade: 'tile',
    job_title: null,
    staff_role: null,
    studio_contact_id: null,
    profile_id: null,
    show_to_client: false,
    has_active_field_link: true,
    sms_consent_status: 'granted',
    updated_at: null,
    ...over,
  };
}

beforeEach(() => {
  updateMutate.mockReset().mockResolvedValue({});
  removeMutate.mockReset().mockResolvedValue({});
  createLinkMutate.mockReset().mockResolvedValue({ id: 'l-1', token: 'tok' });
  sendSmsMutate.mockReset().mockResolvedValue({});
});

const ul = (node: React.ReactElement) => render(<ul>{node}</ul>);

describe('RosterRow — folded', () => {
  it('carries the reach chip and unfolds on the row, not the chevron', () => {
    const onToggle = jest.fn();
    const onOpenProfile = jest.fn();
    ul(
      <RosterRow
        row={row()}
        group="buildSupply"
        expanded={false}
        onToggle={onToggle}
        onOpenProfile={onOpenProfile}
      />,
    );

    expect(screen.getByText('Field link')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open Rosa Martínez's profile/ }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('shows no chevron for a team row — there is no party profile to open', () => {
    ul(
      <RosterRow
        row={row({ source: 'team', kind: 'team', roster_id: 'tm-1' })}
        group="studioSide"
        expanded={false}
        onToggle={jest.fn()}
        onOpenProfile={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /profile/ })).not.toBeInTheDocument();
  });
});

describe('RosterRow — unfolded actions', () => {
  it('shows phone, email, the full consent chip and the four words', () => {
    ul(
      <RosterRow row={row()} group="buildSupply" expanded onToggle={jest.fn()} />,
    );
    expect(screen.getByText('(513) 555-0148')).toBeInTheDocument();
    expect(screen.getByText('rosa@martineztile.co')).toBeInTheDocument();
    expect(screen.getByText('Texting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy field link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show to client' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('disables TEXT until consent is granted, and says why', () => {
    ul(
      <RosterRow
        row={row({ sms_consent_status: 'not_asked' })}
        group="buildSupply"
        expanded
        onToggle={jest.fn()}
      />,
    );
    const text = screen.getByRole('button', { name: 'Text' });
    expect(text).toBeDisabled();
    expect(text).toHaveAttribute(
      'title',
      'Texting opens once they opt in and a number is on file.',
    );
  });

  it('SHOW TO CLIENT writes showToClient for the party row', () => {
    ul(
      <RosterRow row={row()} group="buildSupply" expanded onToggle={jest.fn()} />,
    );
    const toggle = screen.getByRole('button', { name: 'Show to client' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(updateMutate).toHaveBeenCalledWith({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { showToClient: true },
    });
  });

  it('hides SHOW TO CLIENT (and REMOVE, and the SMS words) for a team row', () => {
    ul(
      <RosterRow
        row={row({
          source: 'team',
          kind: 'team',
          roster_id: 'tm-1',
          staff_role: 'senior_designer',
          job_title: 'Lead designer',
        })}
        group="studioSide"
        expanded
        onToggle={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Show to client' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Text' })).not.toBeInTheDocument();
    // The studio-side second element is role + title when they differ.
    expect(screen.getByText('Senior Designer · Lead designer')).toBeInTheDocument();
  });
});

describe('RosterRow — REMOVE is an inline confirm, never window.confirm', () => {
  it('swaps a confirm band into the row and only then removes', () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    ul(
      <RosterRow row={row()} group="buildSupply" expanded onToggle={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(removeMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText('– Take Rosa Martínez off the call sheet?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removeMutate).toHaveBeenCalledWith({ id: 'party-1', projectId: 'proj-1' });
    confirmSpy.mockRestore();
  });

  it('KEEP puts the band away without removing anyone', () => {
    ul(
      <RosterRow row={row()} group="buildSupply" expanded onToggle={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(removeMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Show to client' })).toBeInTheDocument();
  });
});
