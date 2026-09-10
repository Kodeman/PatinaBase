/**
 * QA 2026-09-09, flow E: adding a field-crew person with no project picked
 * looked like a no-op — the refusal printed at the foot of the sheet and
 * nothing announced it. The refusal is now an alert, and it still writes
 * nothing.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddPersonSheet } from '../add-person-sheet';

const addPartyMutateAsync = jest.fn();

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'designer-1' } }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useStudioIdentity: () => ({ data: { name: 'Middle West Studio' }, isLoading: false }),
  useProjects: () => ({ data: [], isLoading: false }),
  useAddProjectParty: () => ({
    mutateAsync: addPartyMutateAsync,
    isPending: false,
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  addPartyMutateAsync.mockReset();
});

describe('AddPersonSheet — a field kind with no project', () => {
  it('says why in an alert, and adds nobody', () => {
    renderWithClient(<AddPersonSheet open onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'a sub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to roster' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Field crew work a project — pick which one they’re on.',
    );
    expect(addPartyMutateAsync).not.toHaveBeenCalled();
  });
});
