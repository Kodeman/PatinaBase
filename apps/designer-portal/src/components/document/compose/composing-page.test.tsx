import { fireEvent, render, screen } from '@testing-library/react';
import { ComposingPage } from './composing-page';

jest.mock('@patina/supabase', () => ({
  useStyleArchetypes: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-compose-piece', () => ({
  useComposePiece: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ id: 'piece-1' }),
    isPending: false,
  }),
}));

jest.mock('../rooms/room-shell', () => ({
  RoomShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../strata-mark', () => ({
  StrataMark: () => <span data-testid="strata-mark" />,
}));

jest.mock('../document-action', () => ({
  DocumentAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));

describe('ComposingPage quiet facets', () => {
  it('opens the first incomplete section and keeps exactly one section in hand', () => {
    render(<ComposingPage />);

    const identity = screen.getByRole('button', { name: /Identity/i });
    const commerce = screen.getByRole('button', { name: /Commerce/i });

    expect(identity).toHaveAttribute('aria-expanded', 'true');
    expect(commerce).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toHaveLength(1);

    fireEvent.click(commerce);

    expect(identity).toHaveAttribute('aria-expanded', 'false');
    expect(commerce).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toHaveLength(1);
    expect(commerce).toHaveTextContent('not yet written');
  });
});
