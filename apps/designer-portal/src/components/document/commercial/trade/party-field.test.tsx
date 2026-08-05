import { fireEvent, render, screen } from '@testing-library/react';

let mockParties: { data: Record<string, unknown>[] } = { data: [] };
const rolodexProps: Record<string, unknown>[] = [];

jest.mock('@patina/supabase', () => ({
  useProjectParties: () => mockParties,
}));

jest.mock('../../roster/rolodex-picker', () => ({
  RolodexPicker: (props: Record<string, unknown>) => {
    rolodexProps.push(props);
    return (
      <div data-testid="rolodex-picker">
        <button
          type="button"
          onClick={() => (props.onAdded as (name: string) => void)('Kesler Drapery')}
        >
          add-from-rolodex
        </button>
      </div>
    );
  },
}));

import { PartyField, TRADE_PARTY_KINDS } from './party-field';

const party = (overrides: Record<string, unknown> = {}) => ({
  id: 'party-1',
  display_name: 'Atelier Marchand',
  party_kind: 'sub',
  trade: 'drapery',
  company_name: 'Atelier Marchand LLC',
  profile_id: null,
  ...overrides,
});

describe('PartyField', () => {
  beforeEach(() => {
    mockParties = { data: [] };
    rolodexProps.length = 0;
  });

  it('offers only the subs and installers already on the job', () => {
    mockParties = {
      data: [
        party(),
        party({ id: 'party-2', display_name: 'Ridge Install', party_kind: 'installer' }),
        party({ id: 'party-3', display_name: 'Hardwick Supply', party_kind: 'vendor' }),
        party({ id: 'party-4', display_name: 'The Ellsworths', party_kind: 'client' }),
      ],
    };
    render(<PartyField projectId="project-1" partyId={null} onSelect={() => {}} />);

    expect(screen.getByText('Atelier Marchand')).toBeVisible();
    expect(screen.getByText('Ridge Install')).toBeVisible();
    expect(screen.queryByText('Hardwick Supply')).not.toBeInTheDocument();
    expect(screen.queryByText('The Ellsworths')).not.toBeInTheDocument();
  });

  it('reads the chosen party as one settled line with a change beside it', () => {
    mockParties = { data: [party()] };
    render(
      <PartyField projectId="project-1" partyId="party-1" onSelect={() => {}} />,
    );

    expect(screen.getByTestId('trade-party-chosen')).toBeVisible();
    expect(screen.getByText('Atelier Marchand')).toBeVisible();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByRole('radiogroup')).toBeVisible();
  });

  it('reports the pick to its caller', () => {
    const onSelect = jest.fn();
    mockParties = { data: [party()] };
    render(<PartyField projectId="project-1" partyId={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('radio', { name: /Atelier Marchand/ }));
    expect(onSelect).toHaveBeenCalledWith('party-1');
  });

  it('says plainly when the job has no trades on it yet', () => {
    render(<PartyField projectId="project-1" partyId={null} onSelect={() => {}} />);
    expect(
      screen.getByText('No subs or installers on this job yet.'),
    ).toBeVisible();
  });

  it('opens the rolodex pre-scoped to subs and installers, and selects who lands', () => {
    const onSelect = jest.fn();
    const { rerender } = render(
      <PartyField projectId="project-1" partyId={null} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText('Someone new'));
    expect(rolodexProps[0]).toMatchObject({
      projectId: 'project-1',
      scopeKinds: TRADE_PARTY_KINDS,
    });

    fireEvent.click(screen.getByText('add-from-rolodex'));
    // The party lands on the call sheet a beat later; when it does, it is the
    // one the designer came for.
    mockParties = {
      data: [party({ id: 'party-9', display_name: 'Kesler Drapery' })],
    };
    rerender(
      <PartyField projectId="project-1" partyId={null} onSelect={onSelect} />,
    );
    expect(onSelect).toHaveBeenCalledWith('party-9');
  });

  it('offers no change and no rolodex once the scope is beyond a draft', () => {
    mockParties = { data: [party()] };
    render(
      <PartyField
        projectId="project-1"
        partyId="party-1"
        onSelect={() => {}}
        disabled
      />,
    );
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });
});
