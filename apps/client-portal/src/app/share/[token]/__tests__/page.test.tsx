import { render, screen } from '@testing-library/react';
import { createServiceClient } from '@patina/supabase/server';
import SharePage from '../page';
import { captureMoodBoardShareViewed } from '@/lib/analytics/mood-board-server';
import { signServiceAuthorizedBoards } from '@/lib/guest-proposal-document';

jest.mock('@patina/supabase/server', () => ({
  createServiceClient: jest.fn(),
}));

jest.mock('@/lib/analytics/mood-board-server', () => ({
  captureMoodBoardShareViewed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@patina/design-system', () => ({
  BoardComposition: ({
    board,
    fit,
    fullBleed,
    interactive,
  }: {
    board: { id: string; name: string; items?: Array<{ image_url?: string }> };
    fit: string;
    fullBleed: boolean;
    interactive: boolean;
  }) => (
    <div
      data-testid="board-composition"
      data-board-id={board.id}
      data-fit={fit}
      data-full-bleed={String(fullBleed)}
      data-interactive={String(interactive)}
      data-image-url={board.items?.[0]?.image_url}
    >
      {board.name}
    </div>
  ),
}));

jest.mock('@/components/proposal-document', () => ({
  ProposalDocument: () => <div data-testid="proposal-document" />,
}));

const TOKEN = 'a'.repeat(64);

describe('board-scoped guest share', () => {
  it('omits a service-read board whose private media projection is not source-coherent', async () => {
    const unsafePath = 'studio-b/boards/board-b/private.png';
    const createSignedUrls = jest.fn().mockResolvedValue({
      data: [{
        path: 'studio-a/boards/board-a/safe.png',
        signedUrl: 'https://storage.example/signed/safe.png',
      }],
      error: null,
    });
    const admin = {
      rpc: jest.fn()
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: false, error: null }),
      storage: { from: jest.fn(() => ({ createSignedUrls })) },
    };

    const result = await signServiceAuthorizedBoards(admin, [
      {
        id: 'board-a',
        proposal_board_items: [{ image_url: 'studio-a/boards/board-a/safe.png' }],
      },
      { id: 'board-b', proposal_board_items: [{ image_url: unsafePath }] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'board-a' });
    expect(JSON.stringify(result)).not.toContain(unsafePath);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ['studio-a/boards/board-a/safe.png'],
      3600,
    );
  });

  it('renders exactly the resolved board through the canonical composition', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        shareId: 'share-1',
        studioName: 'Patina Studio',
        board: {
          id: 'board-1',
          name: 'Warm Modern',
          canvas_width: 1600,
          canvas_height: 1000,
          background_color: '#FAF8F5',
          sections: [],
          items: [
            {
              id: 'item-1',
              type: 'note',
              x: 20,
              y: 30,
              width: 240,
              height: 120,
              z_index: 0,
              rotation: 0,
              content: 'Texture direction',
              data: {},
            },
          ],
        },
      },
      error: null,
    });
    (createServiceClient as jest.Mock).mockReturnValue({ rpc });

    render(await SharePage({ params: Promise.resolve({ token: TOKEN }) }));

    const composition = screen.getByTestId('board-composition');
    expect(composition).toHaveAttribute('data-board-id', 'board-1');
    expect(composition).toHaveAttribute('data-fit', 'contain');
    expect(composition).toHaveAttribute('data-full-bleed', 'true');
    expect(composition).toHaveAttribute('data-interactive', 'false');
    expect(screen.queryByTestId('proposal-document')).not.toBeInTheDocument();
    expect(screen.getByText('Shared by Patina Studio')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('resolve_board_share', { p_token: TOKEN });
    expect(captureMoodBoardShareViewed).toHaveBeenCalledTimes(1);
    expect(captureMoodBoardShareViewed).toHaveBeenCalledWith({
      boardId: 'board-1',
      shareId: 'share-1',
    });
    expect(JSON.stringify((captureMoodBoardShareViewed as jest.Mock).mock.calls)).not.toContain(
      TOKEN,
    );
  });

  it('signs a frozen board edition before sending private media to the guest render', async () => {
    const path = 'owner-1/boards/board-1/source.png';
    const rpc = jest.fn().mockResolvedValue({
      data: {
        shareId: 'share-1',
        studioName: 'Patina Studio',
        board: {
          id: 'board-1',
          name: 'Warm Modern',
          items: [{ id: 'item-1', type: 'image', image_url: path, data: {} }],
        },
      },
      error: null,
    });
    const createSignedUrls = jest.fn().mockResolvedValue({
      data: [{ path, signedUrl: 'https://storage.example/signed/source.png' }],
      error: null,
    });
    (createServiceClient as jest.Mock).mockReturnValue({
      rpc,
      storage: { from: jest.fn(() => ({ createSignedUrls })) },
    });

    render(await SharePage({ params: Promise.resolve({ token: TOKEN }) }));

    expect(createSignedUrls).toHaveBeenCalledWith([path], 3600);
    expect(screen.getByTestId('board-composition')).toHaveAttribute(
      'data-image-url',
      'https://storage.example/signed/source.png',
    );
  });

  it('falls through without leaking scope when neither resolver accepts a token', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    (createServiceClient as jest.Mock).mockReturnValue({ rpc });

    render(await SharePage({ params: Promise.resolve({ token: TOKEN }) }));

    expect(screen.getByText('This link isn’t available')).toBeInTheDocument();
    expect(rpc).toHaveBeenNthCalledWith(1, 'resolve_board_share', { p_token: TOKEN });
    expect(rpc).toHaveBeenNthCalledWith(2, 'resolve_document_share', { p_token: TOKEN });
    expect(captureMoodBoardShareViewed).not.toHaveBeenCalled();
  });
});
