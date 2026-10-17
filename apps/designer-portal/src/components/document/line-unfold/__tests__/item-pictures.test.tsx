/**
 * US-37 #2: the line's own pictures in the unfold. Each act goes to its 00807
 * hook, the move acts are keyboard acts, unlinking says the file stays, and
 * a line with no library piece has nothing to pick from.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const mockImages: { current: unknown[] } = { current: [] };
const mockAdd = jest.fn();
const mockUpload = jest.fn();
const mockSetPrimary = jest.fn();
const mockReorder = jest.fn();
const mockUnlink = jest.fn();

jest.mock('@patina/supabase', () => ({
  FFE_ITEM_IMAGE_TYPES: {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  },
  useFfeItemImages: () => ({ data: mockImages.current, isLoading: false }),
  useAddFfeItemImage: () => ({ mutateAsync: mockAdd, isPending: false }),
  useUploadFfeItemImage: () => ({ mutateAsync: mockUpload, isPending: false }),
  useSetFfeItemPrimaryImage: () => ({ mutateAsync: mockSetPrimary, isPending: false }),
  useReorderFfeItemImages: () => ({ mutateAsync: mockReorder, isPending: false }),
  useUnlinkFfeItemImage: () => ({ mutateAsync: mockUnlink, isPending: false }),
}));

import { ItemPictures, UNLINK_COPY } from '../item-pictures';

const picture = (id: string, position: number, isPrimary = false) => ({
  id,
  item_id: 'line-sofa',
  project_id: 'project-1',
  url: `https://img.test/${id}.jpg`,
  storage_path: null,
  source: 'library',
  source_product_id: 'product-sofa',
  position,
  is_primary: isPrimary,
  created_by: null,
  created_at: '2026-10-17T00:00:00Z',
});

const LIBRARY_LINE = {
  id: 'line-sofa',
  name: 'Linen sofa',
  product_id: 'product-sofa',
  product: {
    images: ['https://img.test/a.jpg', 'https://img.test/b.jpg', 'https://img.test/lib-extra.jpg'],
  },
};

const CUSTOM_LINE = { id: 'line-sofa', name: 'Linen sofa', product_id: null, product: null };

const renderPictures = (item: Record<string, unknown> = LIBRARY_LINE, canEdit = true) =>
  render(<ItemPictures item={item as never} projectId="project-1" canEdit={canEdit} />);

const group = (n: number, total: number, primary = false) =>
  screen.getByRole('group', { name: `Picture ${n} of ${total}${primary ? ', primary' : ''}` });

/** Frames run after React has committed, as in a browser. */
const frames: FrameRequestCallback[] = [];
const flushFrames = () => act(() => frames.splice(0).forEach((cb) => cb(0)));

beforeEach(() => {
  jest.clearAllMocks();
  mockImages.current = [picture('a', 0, true), picture('b', 1), picture('c', 2)];
  [mockAdd, mockUpload, mockSetPrimary, mockReorder, mockUnlink].forEach((fn) =>
    fn.mockResolvedValue(undefined),
  );
  frames.length = 0;
  jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => frames.push(cb));
});

afterEach(() => {
  (window.requestAnimationFrame as jest.Mock).mockRestore?.();
});

describe('ItemPictures', () => {
  it('shows every picture in order and marks the primary in type, not a badge', () => {
    renderPictures();
    const list = screen.getByRole('list', { name: 'Pictures of Linen sofa' });
    const rows = within(list).getAllByTestId('line-picture');
    expect(rows.map((row) => row.querySelector('img')?.getAttribute('src'))).toEqual([
      'https://img.test/a.jpg',
      'https://img.test/b.jpg',
      'https://img.test/c.jpg',
    ]);
    expect(rows[0]).toHaveAttribute('data-primary', 'true');
    expect(within(group(1, 3, true)).getByText('Primary')).toBeInTheDocument();
    expect(
      within(group(1, 3, true)).queryByRole('button', { name: 'Make primary' }),
    ).toBeNull();
  });

  it('Make primary sends that picture to useSetFfeItemPrimaryImage', () => {
    renderPictures();
    fireEvent.click(within(group(3, 3)).getByRole('button', { name: 'Make primary' }));
    expect(mockSetPrimary).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemId: 'line-sofa',
      imageId: 'c',
    });
  });

  it('Earlier and Later reorder through useReorderFfeItemImages, and hold at the ends', async () => {
    renderPictures();
    expect(within(group(1, 3, true)).getByRole('button', { name: 'Earlier' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(group(3, 3)).getByRole('button', { name: 'Later' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await act(async () => {
      fireEvent.click(within(group(2, 3)).getByRole('button', { name: 'Earlier' }));
    });
    expect(mockReorder).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemId: 'line-sofa',
      imageIds: ['b', 'a', 'c'],
    });
    // The move shows at once, and the moved picture keeps the keyboard.
    flushFrames();
    const moved = within(group(1, 3)).getByRole('button', { name: 'Earlier' });
    expect(moved).toHaveAttribute('data-picture-act', 'earlier-b');
    expect(moved).toHaveFocus();

    mockReorder.mockClear();
    await act(async () => {
      fireEvent.click(within(group(1, 3)).getByRole('button', { name: 'Later' }));
    });
    expect(mockReorder).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemId: 'line-sofa',
      imageIds: ['a', 'b', 'c'],
    });
  });

  it('Unlink says the file stays and goes to useUnlinkFfeItemImage', () => {
    renderPictures();
    expect(UNLINK_COPY).toBe('Unlink — the file stays');
    const unlink = within(group(2, 3)).getByRole('button', { name: 'Unlink — the file stays' });
    fireEvent.click(unlink);
    expect(mockUnlink).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemId: 'line-sofa',
      imageId: 'b',
    });
  });

  it('uploads several pictures at once, one after another, through useUploadFfeItemImage', async () => {
    renderPictures();
    const input = screen.getByTestId('line-pictures-file');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('multiple');

    const first = new File(['1'], 'front.jpg', { type: 'image/jpeg' });
    const second = new File(['2'], 'side.png', { type: 'image/png' });
    const gif = new File(['3'], 'spin.gif', { type: 'image/gif' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [first, gif, second] } });
    });

    // Names, not File objects: a failing diff over a File exhausts jest's printer.
    expect(
      mockUpload.mock.calls.map(([arg]) => `${arg.projectId}/${arg.itemId}/${arg.file.name}`),
    ).toEqual(['project-1/line-sofa/front.jpg', 'project-1/line-sofa/side.png']);
    expect(mockUpload.mock.calls[0][0].file).toBe(first);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'spin.gif is not a JPEG, PNG, WebP or AVIF picture, so it was not added.',
    );
    // The refusal ends in "added." too; its tone comes from the act, not the words.
    expect(status).toHaveClass('text-[var(--color-terracotta-ink)]');
  });

  it('announces upload progress and completion in its always-mounted status', async () => {
    const finishUpload: Array<() => void> = [];
    mockUpload.mockImplementation(
      () => new Promise<void>((resolve) => { finishUpload.push(resolve); }),
    );
    renderPictures();
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    const files = [
      new File(['1'], 'front.jpg', { type: 'image/jpeg' }),
      new File(['2'], 'side.png', { type: 'image/png' }),
      new File(['3'], 'back.webp', { type: 'image/webp' }),
    ];
    fireEvent.change(screen.getByTestId('line-pictures-file'), { target: { files } });
    expect(status).toHaveTextContent('Uploading 1 of 3 pictures…');
    await act(async () => { finishUpload[0](); });
    expect(status).toHaveTextContent('Uploading 2 of 3 pictures…');
    await act(async () => { finishUpload[1](); });
    await act(async () => { finishUpload[2](); });
    await waitFor(() => expect(status).toHaveTextContent('3 pictures added.'));
    expect(status).toHaveClass('text-[var(--color-charcoal)]');
  });

  it.each([
    ['middle', [picture('a', 0, true), picture('c', 1)], 'b', 'c'],
    ['last', [picture('a', 0, true), picture('b', 1)], 'c', 'b'],
  ])('restores focus after the refetch removes the %s picture', async (_label, nextImages, removedId, targetId) => {
    const view = renderPictures();
    let resolveMutation!: () => void;
    mockUnlink.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveMutation = resolve; }));
    fireEvent.click(within(group(removedId === 'b' ? 2 : 3, 3)).getByRole('button', { name: UNLINK_COPY }));
    await act(async () => { resolveMutation(); });
    // mutateAsync resolves before invalidation/refetch; the old rows still exist here.
    expect(screen.getAllByTestId('line-picture')).toHaveLength(3);
    act(() => {
      mockImages.current = nextImages;
      view.rerender(<ItemPictures item={LIBRARY_LINE} projectId="project-1" canEdit />);
    });
    const targetPosition = nextImages.findIndex((image) => image.id === targetId) + 1;
    expect(within(group(targetPosition, nextImages.length)).getByRole('button', { name: 'Make primary' })).toHaveFocus();
  });

  it('restores focus to Upload when unlinking the only picture after refetch', async () => {
    mockImages.current = [picture('only', 0, true)];
    const view = renderPictures();
    let resolveMutation!: () => void;
    mockUnlink.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveMutation = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: UNLINK_COPY }));
    await act(async () => { resolveMutation(); });
    act(() => {
      mockImages.current = [];
      view.rerender(<ItemPictures item={LIBRARY_LINE} projectId="project-1" canEdit />);
    });
    expect(screen.getByRole('button', { name: 'Upload pictures' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('restores focus to an available act after Make primary refetch', async () => {
    const view = renderPictures();
    let resolveMutation!: () => void;
    mockSetPrimary.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveMutation = resolve; }));
    fireEvent.click(within(group(3, 3)).getByRole('button', { name: 'Make primary' }));
    await act(async () => { resolveMutation(); });
    act(() => {
      mockImages.current = [picture('a', 0), picture('b', 1), picture('c', 2, true)];
      view.rerender(<ItemPictures item={LIBRARY_LINE} projectId="project-1" canEdit />);
    });
    expect(within(group(3, 3, true)).getByRole('button', { name: 'Earlier' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('a line with no library piece still takes uploads but offers nothing from the library', () => {
    mockImages.current = [];
    renderPictures(CUSTOM_LINE);
    expect(screen.getByText('No pictures on this piece yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload pictures' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'From the library item' })).toBeNull();
  });

  it("lists only the library item's pictures not already linked, and adds one through useAddFfeItemImage", async () => {
    renderPictures();
    const open = screen.getByRole('button', { name: 'From the library item' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');

    const offered = screen.getByRole('list', { name: 'Library item pictures not on this piece' });
    expect(within(offered).getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual([
      'https://img.test/lib-extra.jpg',
    ]);
    fireEvent.click(within(offered).getByRole('button', { name: 'Add library picture 1' }));
    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith({
        projectId: 'project-1',
        itemId: 'line-sofa',
        url: 'https://img.test/lib-extra.jpg',
        source: 'library',
        sourceProductId: 'product-sofa',
      }),
    );
  });

  it("states the RPC's refusal sentence in place", async () => {
    mockUnlink.mockRejectedValue({
      code: '42501',
      message: "Only the studio on this job can change this piece's pictures.",
    });
    renderPictures();
    fireEvent.click(within(group(2, 3)).getByRole('button', { name: UNLINK_COPY }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        "Only the studio on this job can change this piece's pictures.",
      ),
    );
  });

  it('reads the pictures without acts where the line cannot be edited', () => {
    renderPictures(LIBRARY_LINE, false);
    expect(screen.getAllByTestId('line-picture')).toHaveLength(3);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
