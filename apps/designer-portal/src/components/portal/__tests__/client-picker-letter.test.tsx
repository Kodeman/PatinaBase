import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientPicker } from '../client-picker';

// cmdk scrolls the highlighted item into view on selection; jsdom has no
// scrollIntoView implementation.
HTMLElement.prototype.scrollIntoView = jest.fn();

const mutateAsync = jest.fn();
let flagValue = { value: true, isLoading: false };

// A stable reference: ClientPicker drops the armed row whenever the client
// list RE-DERIVES (any reference change), including a background refetch —
// a fresh array literal on every hook call would self-defeat the arming this
// suite exists to test.
const MOCK_CLIENT_ROWS = [
  {
    id: 'dc1',
    client_id: null,
    client_email: 'dave@okonkwo.net',
    client_name: 'Dave Okonkwo',
  },
];

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => flagValue }));
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useInviteAndLinkClient: () => ({ mutateAsync, isPending: false }),
  useClients: () => ({
    data: MOCK_CLIENT_ROWS,
    isLoading: false,
  }),
}));

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ profileId: 'p1', invited: true, alreadyExists: false });
});

// ClientPicker also calls useAddClient (unconditionally), which reaches for
// useQueryClient — a real provider is required even though this suite mocks
// the mutation hooks it cares about.
function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// The row has to be opened and armed (J2) before the confirm block — where the
// folded letter field lives — exists in the DOM at all.
function openAndArm() {
  renderWithClient(<ClientPicker value={null} onChange={() => {}} />);
  fireEvent.click(screen.getByTestId('client-picker-trigger'));
  fireEvent.click(screen.getByRole('option', { name: /Dave Okonkwo/ }));
}

it('the armed row starts folded — a line is offered, never demanded', () => {
  openAndArm();
  expect(screen.getByTestId('letter-line-disclosure')).toBeInTheDocument();
  expect(screen.queryByLabelText('A line for Dave')).toBeNull();
});

it('carries the opened line into the send', async () => {
  openAndArm();
  fireEvent.click(screen.getByTestId('letter-line-disclosure'));
  fireEvent.change(screen.getByLabelText('A line for Dave'), {
    target: { value: 'Dave — the drawings are in.' },
  });
  fireEvent.click(screen.getByTestId('client-picker-invite-send-dc1'));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  expect(mutateAsync.mock.calls[0][0]).toMatchObject({
    designerClientId: 'dc1',
    letter: true,
    note: 'Dave — the drawings are in.',
  });
});

it('sends with no line at all when she writes none', async () => {
  openAndArm();
  fireEvent.click(screen.getByTestId('client-picker-invite-send-dc1'));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  expect(mutateAsync.mock.calls[0][0].note).toBeUndefined();
  expect(mutateAsync.mock.calls[0][0].letter).toBe(true);
});

it('flag off — today’s armed row, no field, no letter key', async () => {
  flagValue = { value: false, isLoading: false };
  openAndArm();
  expect(screen.queryByTestId('letter-line-disclosure')).toBeNull();
  fireEvent.click(screen.getByTestId('client-picker-invite-send-dc1'));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('letter');
  flagValue = { value: true, isLoading: false };
});
