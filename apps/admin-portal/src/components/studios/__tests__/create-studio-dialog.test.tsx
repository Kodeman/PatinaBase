import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateStudioDialog } from '@/components/studios/CreateStudioDialog';

// Mirrors add-vendor-dialog.test.tsx's pattern: mock the mutation hook and
// the UserSearchPicker (which has its own debounced search hook), keep the
// dialog chrome itself real.

const mockMutateAsync = jest.fn();
const mockReset = jest.fn();
let isPending = false;

jest.mock('@/hooks/use-studios', () => ({
  useCreateStudio: jest.fn(() => ({
    mutateAsync: mockMutateAsync,
    reset: mockReset,
    get isPending() {
      return isPending;
    },
  })),
}));

jest.mock('@/components/shared/UserSearchPicker', () => ({
  UserSearchPicker: ({ value, onChange }: any) => (
    <div data-testid="user-search-picker">
      {value ? (
        <span data-testid="selected-user">{value.email}</span>
      ) : (
        <button
          type="button"
          data-testid="pick-user"
          onClick={() => onChange({ id: 'user-1', email: 'owner@example.com' })}
        >
          Pick user
        </button>
      )}
    </div>
  ),
}));

describe('CreateStudioDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isPending = false;
    mockMutateAsync.mockResolvedValue({ studioId: 'studio-1' });
  });

  it('renders nothing when closed', () => {
    render(<CreateStudioDialog open={false} onOpenChange={jest.fn()} />);
    expect(screen.queryByText('Create Studio')).not.toBeInTheDocument();
  });

  it('keeps submit disabled until an owner and name are provided', () => {
    render(<CreateStudioDialog open onOpenChange={jest.fn()} />);

    const submit = screen.getByRole('button', { name: /create studio/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId('pick-user'));
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/studio name/i), {
      target: { value: 'Acme Studio' },
    });
    expect(submit).toBeEnabled();
  });

  it('submits the owner id and trimmed name', async () => {
    render(<CreateStudioDialog open onOpenChange={jest.fn()} />);

    fireEvent.click(screen.getByTestId('pick-user'));
    fireEvent.change(screen.getByLabelText(/studio name/i), {
      target: { value: '  Acme Studio  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create studio/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      ownerUserId: 'user-1',
      name: 'Acme Studio',
    });
  });

  it('closes on Cancel without calling the mutation', () => {
    const onOpenChange = jest.fn();
    render(<CreateStudioDialog open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
