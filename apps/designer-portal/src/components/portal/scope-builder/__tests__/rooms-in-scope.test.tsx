import { fireEvent, render, screen } from '@testing-library/react';
import { RoomsInScope } from '../rooms-in-scope';

const mutation = () => ({
  mutate: jest.fn(),
  mutateAsync: jest.fn().mockResolvedValue(undefined),
  isPending: false,
  isError: false,
});

jest.mock('@patina/supabase', () => ({
  useProposalScopeRooms: () => ({ data: [], isLoading: false }),
  useAddScopeRoom: () => mutation(),
  useUpdateScopeRoom: () => mutation(),
  useRemoveScopeRoom: () => mutation(),
  useReorderProposalScopeRooms: () => mutation(),
  useFFECategories: () => ({ data: [] }),
  useCreateFFECategory: () => mutation(),
}));

jest.mock('@patina/design-system', () => ({
  FFECategoryPicker: () => null,
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: new Proxy({}, { get: () => jest.fn() }),
}));

jest.mock('@/components/document/document-action', () => ({
  DocumentAction: ({
    children,
    onClick,
    actionKey,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    actionKey: string;
    variant?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      data-action-key={actionKey}
      data-action-variant={variant}
    >
      {children}
    </button>
  ),
}));

describe('RoomsInScope — US-28 S9 Add a room', () => {
  it('offers "Add a room" as a scored secondary act, not a boxed button', () => {
    render(<RoomsInScope proposalId="proposal-1" />);

    const add = screen.getByRole('button', { name: /Add a room/ });
    expect(add).toHaveAttribute('data-action-key', 'add-room');
    expect(add).toHaveAttribute('data-action-variant', 'secondary');
    expect(screen.queryByText('+ Add Room')).not.toBeInTheDocument();

    fireEvent.click(add);
    expect(
      screen.queryByRole('button', { name: /Add a room/ }),
    ).not.toBeInTheDocument();
  });
});
