import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BoardReactions,
  parseGuestReactions,
  type GuestReaction,
} from '../board-reactions';

const rpc = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

const board = {
  id: 'board-1',
  name: 'Living room direction',
  canvas_width: 800,
  canvas_height: 600,
  background_color: '#FAF8F5',
  sections: [],
  items: [
    {
      id: 'pin-1',
      type: 'note',
      x: 10,
      y: 10,
      width: 200,
      height: 120,
      z_index: 0,
      rotation: 0,
      content: 'A note',
      data: {},
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('parseGuestReactions', () => {
  it('keeps well-formed rows and drops anything else', () => {
    const parsed = parseGuestReactions([
      { boardItemId: 'pin-1', verdict: 'approved', body: 'yes' },
      { boardItemId: 'pin-2', verdict: 'comment', body: null },
      { boardItemId: 42, verdict: 'approved' },
      null,
      'nope',
    ]);
    expect(parsed).toEqual<GuestReaction[]>([
      { boardItemId: 'pin-1', verdict: 'approved', body: 'yes' },
    ]);
  });

  it('returns nothing when the payload carried no reactions key', () => {
    expect(parseGuestReactions(undefined)).toEqual([]);
  });
});

describe('BoardReactions', () => {
  it('sends a tap through the token-scoped RPC', async () => {
    const user = userEvent.setup();
    render(<BoardReactions token={'a'.repeat(64)} board={board} reactions={[]} />);

    await user.click(screen.getAllByRole('button', { name: 'Approve' })[0]);

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith('submit_board_share_reaction', {
      p_token: 'a'.repeat(64),
      p_board_item_id: 'pin-1',
      p_verdict: 'approved',
      p_body: null,
    });
  });

  it('rolls the tap back and says so when the link refuses the write', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'refused' } });
    const user = userEvent.setup();
    render(<BoardReactions token={'a'.repeat(64)} board={board} reactions={[]} />);

    const approve = screen.getAllByRole('button', { name: 'Approve' })[0];
    await user.click(approve);

    await waitFor(() =>
      expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
        /could not be sent/i,
      ),
    );
    expect(
      screen.getAllByRole('button', { name: 'Approve' })[0],
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a standing reaction and carries its note back with a new tap', async () => {
    const user = userEvent.setup();
    render(
      <BoardReactions
        token={'a'.repeat(64)}
        board={board}
        reactions={[{ boardItemId: 'pin-1', verdict: 'approved', body: 'love it' }]}
      />,
    );

    expect(
      screen.getAllByRole('button', { name: 'Approve' })[0],
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getAllByLabelText('Add a note for the studio')[0],
    ).toHaveValue('love it');

    await user.click(screen.getAllByRole('button', { name: 'Pass' })[0]);

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith(
      'submit_board_share_reaction',
      expect.objectContaining({ p_verdict: 'rejected', p_body: 'love it' }),
    );
  });
});
