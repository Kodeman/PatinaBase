import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardShareDialog } from './board-share-dialog';

const create = jest.fn();
const revoke = jest.fn();
const writeText = jest.fn();

jest.mock('@patina/supabase', () => ({
  useBoardShares: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: 'share-existing',
        proposal_id: null,
        board_id: 'board-1',
        label: 'Client review',
        visibility: {},
        status: 'active',
        expires_at: null,
        view_count: 3,
        last_viewed_at: '2026-08-02T12:00:00.000Z',
        created_at: '2026-08-01T12:00:00.000Z',
      },
      {
        id: 'share-revoked',
        proposal_id: null,
        board_id: 'board-1',
        label: 'Old link',
        visibility: {},
        status: 'revoked',
        expires_at: null,
        view_count: 0,
        last_viewed_at: null,
        created_at: '2026-07-01T12:00:00.000Z',
      },
    ],
  }),
  useCreateBoardShare: () => ({ mutateAsync: create, isPending: false }),
  useRevokeShare: () => ({ mutateAsync: revoke, isPending: false }),
}));

jest.mock('@patina/design-system', () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/controls', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Button: ({ children, onClick, disabled }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

describe('BoardShareDialog', () => {
  beforeEach(() => {
    create.mockReset();
    revoke.mockReset();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('lists only active board links with usage and revokes in board scope', async () => {
    revoke.mockResolvedValue(undefined);
    render(
      <BoardShareDialog boardId="board-1" boardName="Living room" open onOpenChange={jest.fn()} />,
    );

    expect(screen.getByText('Client review')).toBeInTheDocument();
    expect(screen.getByText(/3 views/)).toBeInTheDocument();
    expect(screen.queryByText('Old link')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith({ shareId: 'share-existing', boardId: 'board-1' }),
    );
  });

  it('mints a raw token once and copies its guest URL immediately', async () => {
    create.mockResolvedValue({ id: 'share-new', token: 'raw-token' });
    const onShareCreated = jest.fn();
    render(
      <BoardShareDialog
        boardId="board-1"
        boardName="Living room"
        open
        onOpenChange={jest.fn()}
        onShareCreated={onShareCreated}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Client review'), {
      target: { value: 'Design review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create and copy link' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        boardId: 'board-1',
        label: 'Design review',
        expiresAt: null,
      }),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/share\/raw-token$/));
    expect(onShareCreated).toHaveBeenCalledWith('share-new');
    await waitFor(() => {
      const link = screen.getByLabelText('Board share link') as HTMLInputElement;
      expect(link.value).toMatch(/\/share\/raw-token$/);
    });
  });
});
