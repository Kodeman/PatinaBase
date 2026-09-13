/**
 * THE ADD SHEET, WIDENED (W2b / SPEC §5.5).
 *
 * Eight kind words, a household member who writes a `client_rep` seat without
 * the string ever reaching a face (C5), a named other who must be named (PR-f),
 * a trade a sub cannot be added without, and the chain a seat pulls behind it:
 * the card the rule and the channels hang on (Leah task 1).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AddPersonSheet } from '../add-person-sheet';

const addParty = jest.fn();
const promote = jest.fn();
const addChannel = jest.fn();
const setRule = jest.fn();
const setAuthority = jest.fn();

jest.mock('@patina/supabase', () => ({
  useAddClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddProjectParty: () => ({ mutateAsync: addParty, isPending: false }),
  useAddStudioContactChannel: () => ({ mutateAsync: addChannel, isPending: false }),
  useFindOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePromoteToStudioContact: () => ({ mutateAsync: promote, isPending: false }),
  useSaveVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetContactRule: () => ({ mutateAsync: setRule, isPending: false }),
  useSetPartyAuthority: () => ({ mutateAsync: setAuthority, isPending: false }),
  useStudioContacts: () => ({
    data: [
      {
        id: 'firm-cedar',
        entity_kind: 'company',
        company_name: 'Cedar & Iron Framing',
      },
    ],
  }),
  useStudioIdentity: () => ({ data: { name: 'Middle West Studio' } }),
  useUpdateStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useOrganizations: () => ({ data: [{ id: 'org-1', type: 'design_studio' }] }),
  peopleKeys: { all: ['people-directory'] },
  peopleSeatKeys: { all: ['people-directory-seats'] },
}));

jest.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({
    data: [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Okonkwo residence' },
    ],
  }),
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('@/lib/analytics/events', () => ({ clientEvents: { create: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const PROJECT = '11111111-1111-4111-8111-111111111111';

function openSheet() {
  render(<AddPersonSheet open onClose={jest.fn()} onAdded={jest.fn()} />);
}

beforeEach(() => {
  addParty.mockReset().mockResolvedValue({
    id: 'seat-new',
    project_id: PROJECT,
    studio_contact_id: null,
  });
  promote.mockReset().mockResolvedValue({ id: 'card-new' });
  addChannel.mockReset().mockResolvedValue({});
  setRule.mockReset().mockResolvedValue({});
  setAuthority.mockReset().mockResolvedValue({});
});

describe('the kind switch', () => {
  it('offers eight words, in order, inside a labelled group', () => {
    openSheet();
    const group = screen.getByRole('group', { name: 'What kind of person' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'a client',
      'a household member',
      'a maker',
      'a GC',
      'a sub',
      'an installer',
      'a receiver',
      'someone else',
    ]);
  });

  it('marks the chosen word pressed', () => {
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'a sub' }));
    expect(screen.getByRole('button', { name: 'a sub' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('a sub', () => {
  beforeEach(() => {
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'a sub' }));
  });

  it('needs a trade — a sub with none cannot be found by the trade line', async () => {
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: PROJECT } });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Joe Wozniak' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the roster' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A sub or an installer needs the trade they work in.',
    );
    expect(addParty).not.toHaveBeenCalled();
  });

  it('matches a firm the studio already keeps, rather than typing it twice', () => {
    expect(screen.getByLabelText('Company')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Company'), {
      target: { value: 'firm-cedar' },
    });
    expect(screen.queryByLabelText('New company name')).not.toBeInTheDocument();
  });

  it('writes the seat, mints the card, files the channels and the rule', async () => {
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: PROJECT } });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Dana Kowalski' },
    });
    fireEvent.change(screen.getByLabelText('Trade'), { target: { value: 'electrical' } });
    fireEvent.change(screen.getByLabelText('Mobile'), {
      target: { value: '(612) 555-0111' },
    });
    fireEvent.change(screen.getByLabelText('How to reach them'), {
      target: { value: 'Text only. The email on file bounces.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the roster' }));

    await waitFor(() => expect(setRule).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({ partyKind: 'sub', trade: 'electrical' }),
    );
    expect(promote).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(addChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'card-new',
        channelKind: 'mobile',
        value: '(612) 555-0111',
        smsCapable: true,
      }),
    );
    expect(setRule).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'person',
        subjectId: 'card-new',
        reason: 'Text only. The email on file bounces.',
        channelsForbidden: ['email'],
      }),
    );
  });

  it('the consequence sentence names the job and says what it never opens', () => {
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: PROJECT } });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Joe Wozniak' },
    });
    const sentence = document.getElementById('add-party-consequence') as HTMLElement;
    expect(sentence).toHaveTextContent('Okonkwo residence Call Sheet');
    expect(sentence).toHaveTextContent('It never opens billing or the agreement.');
  });

  it('R-J — says plainly that nothing defaulted from the agreement', () => {
    expect(screen.getByText('Nothing defaulted from the agreement.')).toBeInTheDocument();
  });

  it('an invite is an invite, and the sheet says so', () => {
    fireEvent.click(
      screen.getByLabelText(/They gave prior express consent for text updates/),
    );
    expect(
      screen.getByText(/is invited, not consenting, until they reply YES/),
    ).toBeInTheDocument();
  });
});

describe('a household member (PR-c / C5)', () => {
  it('writes a client_rep seat, and the string never reaches a face', async () => {
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'a household member' }));
    expect(document.body.textContent).not.toContain('client_rep');
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: PROJECT } });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Chidi Okonkwo' },
    });
    fireEvent.change(screen.getByLabelText('Authority'), {
      target: { value: 'Signs money to $2,500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the roster' }));
    await waitFor(() => expect(addParty).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({ partyKind: 'client_rep' }),
    );
    await waitFor(() =>
      expect(setAuthority).toHaveBeenCalledWith(
        expect.objectContaining({
          engagementId: 'seat-new',
          scope: 'change_order',
          sourceClause: 'Signs money to $2,500',
        }),
      ),
    );
  });
});

describe('someone else (PR-f)', () => {
  it('must be named before the seat is written', async () => {
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'someone else' }));
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: PROJECT } });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Ray Thao' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the roster' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Say what they are to this job.',
    );
    expect(addParty).not.toHaveBeenCalled();
  });

  it('carries the written label onto the seat', async () => {
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'someone else' }));
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: PROJECT } });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Ray Thao' },
    });
    fireEvent.change(screen.getByLabelText('What they are to this job'), {
      target: { value: 'city inspector' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the roster' }));
    await waitFor(() => expect(addParty).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({ partyKind: 'other', trade: 'city inspector' }),
    );
  });
});

describe('the whole sheet', () => {
  it('carries no placeholder attribute anywhere', () => {
    const { container } = render(
      <AddPersonSheet open onClose={jest.fn()} onAdded={jest.fn()} />,
    );
    expect(container.querySelectorAll('[placeholder]')).toHaveLength(0);
  });
});
