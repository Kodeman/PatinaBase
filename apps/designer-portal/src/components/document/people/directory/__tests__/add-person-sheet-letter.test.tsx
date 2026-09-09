import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddPersonSheet } from '../add-person-sheet';

const mutateAsync = jest.fn();
let flagValue = { value: false, isLoading: false };

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => flagValue,
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'designer-1' } }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useAddClient: () => ({ mutateAsync, isPending: false }),
  useStudioIdentity: () => ({ data: { name: 'Middle West Studio' }, isLoading: false }),
}));

// AddPersonSheet reads @tanstack/react-query's useQueryClient() directly (not
// through a @patina/supabase hook), so every render needs a real provider.
function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function open() {
  renderWithClient(
    <AddPersonSheet open initialKind="client" onClose={() => {}} onAdded={jest.fn()} />,
  );
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({
    designerClientId: 'dc1',
    profileId: 'p1',
    invited: true,
    alreadyExists: false,
    kind: 'invite',
  });
});

describe('flag OFF — today’s sheet, unchanged', () => {
  beforeEach(() => {
    flagValue = { value: false, isLoading: false };
  });

  it('shows neither the field nor the renamed checkbox', () => {
    open();
    expect(screen.queryByTestId('letter-line-facts')).toBeNull();
    expect(screen.queryByTestId('letter-line-disclosure')).toBeNull();
    expect(screen.getByLabelText(/Send a magic-link invite to Patina/i)).toBeInTheDocument();
  });

  it('sends today’s body shape, with no letter key', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to roster' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('letter');
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('note');
  });
});

describe('flag LOADING — fail closed, never a flash', () => {
  it('renders neither state while PostHog is still answering', () => {
    flagValue = { value: false, isLoading: true };
    open();
    expect(screen.queryByTestId('letter-line-facts')).toBeNull();
    expect(screen.queryByLabelText(/Send Dave the letter/i)).toBeNull();
    expect(screen.queryByLabelText(/magic-link/i)).toBeNull();
  });
});

describe('flag ON — R12’s rename and the letter', () => {
  beforeEach(() => {
    flagValue = { value: true, isLoading: false };
  });

  it('retires every retired word from the designer’s own screen', () => {
    open();
    expect(screen.queryByText(/magic-link/i)).toBeNull();
    expect(screen.queryByText(/invite to Patina/i)).toBeNull();
    expect(screen.getByLabelText('Send them the letter')).toBeInTheDocument();
  });

  it('names the recipient once a name is typed', () => {
    open();
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Dave Okonkwo' },
    });
    expect(screen.getByLabelText('Send Dave the letter')).toBeInTheDocument();
    expect(screen.getByLabelText('A line for Dave')).toBeInTheDocument();
  });

  it('names the studio as the sender in the helper', () => {
    open();
    expect(
      screen.getByText(/They get one email from Middle West Studio with your line in it/),
    ).toBeInTheDocument();
  });

  it('states both acts on the button, and only the one it will do', () => {
    open();
    expect(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    expect(screen.getByRole('button', { name: 'ADD TO YOUR PEOPLE' })).toBeInTheDocument();
  });

  it('folds the field to a disclosure when the letter is off', () => {
    open();
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    expect(screen.queryByLabelText('A line to send with it')).toBeNull();
    expect(screen.getByTestId('letter-line-disclosure')).toBeInTheDocument();
  });

  it('turns the letter back on when the folded field is opened', () => {
    open();
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    fireEvent.click(screen.getByTestId('letter-line-disclosure'));
    expect((screen.getByLabelText('Send them the letter') as HTMLInputElement).checked).toBe(true);
  });

  it('carries the line into the mutation body', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Dave Okonkwo' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.change(screen.getByLabelText('A line for Dave'), {
      target: { value: 'Dave — the drawings are in.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      clientEmail: 'dave@okonkwo.net',
      clientName: 'Dave Okonkwo',
      letter: true,
      note: 'Dave — the drawings are in.',
    });
  });

  it('sends no letter key at all when the checkbox is off', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    fireEvent.click(screen.getByRole('button', { name: 'ADD TO YOUR PEOPLE' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('letter');
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ invite: false });
  });

  it('reports where the letter went (lens-4 §B.7)', async () => {
    const onAdded = jest.fn();
    renderWithClient(
      <AddPersonSheet open initialKind="client" onClose={() => {}} onAdded={onAdded} />,
    );
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Dave Okonkwo' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0][0]).toBe(
      'Dave Okonkwo is on your roster. Your letter is on its way to dave@okonkwo.net.',
    );
  });

  it('does not claim a letter was sent when the checkbox is off and the account already exists (R12/R13)', async () => {
    // The old Branch A: an existing profile, letter off, links silently —
    // the route returns alreadyExists:true with no `kind` at all.
    mutateAsync.mockResolvedValue({
      designerClientId: 'dc1',
      profileId: 'p1',
      invited: false,
      alreadyExists: true,
    });
    const onAdded = jest.fn();
    renderWithClient(
      <AddPersonSheet open initialKind="client" onClose={() => {}} onAdded={onAdded} />,
    );
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Priya Raman' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'priya@ramanhouse.com' },
    });
    fireEvent.click(screen.getByLabelText('Send Priya the letter'));
    fireEvent.click(screen.getByRole('button', { name: 'ADD TO YOUR PEOPLE' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0][0]).toBe(
      'Priya Raman was already on Patina — linked to your roster now; no letter was sent.',
    );
  });

  it('claims a letter was sent when the account already exists and the server confirms a notice fired', async () => {
    mutateAsync.mockResolvedValue({
      designerClientId: 'dc1',
      profileId: 'p1',
      invited: true,
      alreadyExists: true,
      kind: 'notice',
    });
    const onAdded = jest.fn();
    renderWithClient(
      <AddPersonSheet open initialKind="client" onClose={() => {}} onAdded={onAdded} />,
    );
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Priya Raman' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'priya@ramanhouse.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0][0]).toBe(
      'Priya Raman was already on Patina — linked to your roster now; a short letter tells them so.',
    );
  });
});
