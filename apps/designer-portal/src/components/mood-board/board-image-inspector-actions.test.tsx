import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardImageInspectorActions } from './board-image-inspector-actions';

const useCapability = jest.fn();
const remove = jest.fn();

jest.mock('@/hooks/use-background-removal', () => ({
  useBackgroundRemovalCapability: (...args: unknown[]) => useCapability(...args),
  useRemoveBoardItemBackground: () => ({ mutateAsync: remove, isPending: false, error: null }),
}));

jest.mock('@/components/ui/controls', () => ({
  Button: ({ children, onClick, disabled }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

const imageItem = {
  id: 'item-1',
  type: 'image' as const,
  x: 0,
  y: 0,
  width: 240,
  height: 180,
  zIndex: 1,
  rotation: 0,
  locked: false,
  imageUrl: 'https://assets.example/original.jpg',
  content: null,
  data: {},
};

describe('BoardImageInspectorActions', () => {
  beforeEach(() => {
    remove.mockReset();
    useCapability.mockReturnValue({
      data: { available: false, code: 'background_removal_not_configured' },
    });
  });

  it('shows no removal action when the vendor capability is unavailable', () => {
    const { container } = render(
      <BoardImageInspectorActions boardId="board-1" item={imageItem} onUpdate={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('applies a cutout while preserving the original in one controller patch', async () => {
    useCapability.mockReturnValue({
      data: {
        available: true,
        quota: {
          studioMonthly: { limit: 25, used: 2, remaining: 23, resetAt: '2026-09-01' },
          globalDaily: { limit: 100, used: 10, remaining: 90, resetAt: '2026-08-04' },
        },
      },
    });
    remove.mockResolvedValue({
      originalUrl: 'https://assets.example/original.jpg',
      cutoutUrl: 'https://assets.example/item-1-cutout.png',
      idempotentReplay: false,
      quota: {},
    });
    const onUpdate = jest.fn();
    render(
      <BoardImageInspectorActions boardId="board-1" item={imageItem} onUpdate={onUpdate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove background' }));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalledWith('item-1', {
      imageUrl: 'https://assets.example/item-1-cutout.png',
      data: { original_image_url: 'https://assets.example/original.jpg' },
    });
    expect(screen.getByText('23 studio credits remain this month')).toBeInTheDocument();
  });

  it('reverts to the retained original as one controller patch', () => {
    const onUpdate = jest.fn();
    render(
      <BoardImageInspectorActions
        boardId="board-1"
        item={{
          ...imageItem,
          imageUrl: 'https://assets.example/item-1-cutout.png',
          data: {
            original_image_url: 'https://assets.example/original.jpg',
            thumbnail_url: 'https://assets.example/thumb.jpg',
          },
        }}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revert background removal' }));
    expect(onUpdate).toHaveBeenCalledWith('item-1', {
      imageUrl: 'https://assets.example/original.jpg',
      data: { thumbnail_url: 'https://assets.example/thumb.jpg' },
    });
  });
});
