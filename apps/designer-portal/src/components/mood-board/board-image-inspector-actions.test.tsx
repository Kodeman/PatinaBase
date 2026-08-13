import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardImageInspectorActions } from './board-image-inspector-actions';
import { BackgroundRemovalClientError } from '@/lib/mood-board-assets/background-removal-client';

const useCapability = jest.fn();
const remove = jest.fn();
let mockMutationError: Error | null = null;

jest.mock('@/hooks/use-background-removal', () => ({
  useBackgroundRemovalCapability: (...args: unknown[]) => useCapability(...args),
  useRemoveBoardItemBackground: () => ({
    mutateAsync: remove,
    isPending: false,
    error: mockMutationError,
  }),
}));

jest.mock('@/components/ui/controls', () => ({
  Button: ({ children, onClick, disabled }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
  signBoardMediaValue: jest.fn(async (_client: unknown, value: unknown) => value),
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
  data: { image_url: 'https://assets.example/original.jpg' },
};

describe('BoardImageInspectorActions', () => {
  beforeEach(() => {
    remove.mockReset();
    useCapability.mockClear();
    mockMutationError = null;
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

  it('disables mutable media transforms for private project-board sources', () => {
    const { container } = render(
      <BoardImageInspectorActions
        boardId="board-1"
        item={imageItem}
        enabled={false}
        onUpdate={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(useCapability).toHaveBeenCalledWith(null);
  });

  it('does not probe the media capability for a pin that cannot remove backgrounds', () => {
    const { container } = render(
      <BoardImageInspectorActions
        boardId="board-1"
        item={{ ...imageItem, type: 'note', imageUrl: null, content: 'A note' }}
        onUpdate={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(useCapability).toHaveBeenCalledWith(null);
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
      data: {
        image_url: 'https://assets.example/item-1-cutout.png',
        original_image_url: 'https://assets.example/original.jpg',
      },
    });
    expect(screen.getByText('23 studio credits remain this month')).toBeInTheDocument();
  });

  it('reuses the same idempotency key when the same source is retried', async () => {
    useCapability.mockReturnValue({
      data: {
        available: true,
        quota: {
          studioMonthly: { limit: 25, used: 2, remaining: 23, resetAt: '2026-09-01' },
          globalDaily: { limit: 100, used: 10, remaining: 90, resetAt: '2026-08-04' },
        },
      },
    });
    remove.mockRejectedValue(new Error('ambiguous timeout'));
    render(
      <BoardImageInspectorActions boardId="board-1" item={imageItem} onUpdate={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove background' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Remove background' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));

    expect(remove.mock.calls[1]?.[0].idempotencyKey).toBe(
      remove.mock.calls[0]?.[0].idempotencyKey,
    );
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
            image_url: 'https://assets.example/item-1-cutout.png',
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
      data: {
        image_url: 'https://assets.example/original.jpg',
        thumbnail_url: 'https://assets.example/thumb.jpg',
      },
    });
  });

  it('renders the structured quota cap and reset date', () => {
    useCapability.mockReturnValue({
      data: {
        available: true,
        quota: {
          studioMonthly: { limit: 25, used: 25, remaining: 0, resetAt: '2026-09-01T00:00:00Z' },
          globalDaily: { limit: 100, used: 25, remaining: 75, resetAt: '2026-08-04T00:00:00Z' },
        },
      },
    });
    mockMutationError = new BackgroundRemovalClientError({
      code: 'background_removal_limit_reached',
      message: 'Background removal limit reached.',
      status: 429,
      details: {
        scope: 'studio_monthly',
        limit: 25,
        resetAt: '2026-09-01T00:00:00Z',
      },
    });

    render(
      <BoardImageInspectorActions boardId="board-1" item={imageItem} onUpdate={jest.fn()} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Background-removal limit reached (25 per studio/month). It resets Sep 1.',
    );
  });
});
