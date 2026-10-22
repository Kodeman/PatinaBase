import { describe, it, expect, vi, beforeEach } from 'vitest';

// The storage API at the `@supabase/ssr` boundary and React Query, so the
// source-preview queryFn runs directly and the buckets it signs are visible.

const createSignedUrls = vi.fn(async (paths: string[], _expiresIn: number) => ({
  data: paths.map((path) => ({ path, signedUrl: `signed:${path}`, error: null })),
  error: null,
}));
const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `public:${path}` } }));
const storageFrom = vi.fn((_bucket: string) => ({ createSignedUrls, getPublicUrl }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: storageFrom } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({}),
}));

import {
  normalizeClientEditions,
  useClientEditionSourceUrls,
  type ClientEditionImage,
} from '../use-client-editions';

type SourceQuery = { queryFn: () => Promise<Record<string, string>> };

const image = (over: Partial<ClientEditionImage>): ClientEditionImage => ({
  assetId: 'a',
  plateRole: 'held',
  cropKey: 'none',
  rank: 1,
  chapterKey: null,
  alt: null,
  captionWhat: null,
  captionWhose: null,
  captionWhen: null,
  sourceKind: null,
  sourceUrl: null,
  sourceTable: null,
  attributionKind: null,
  ground: null,
  width: null,
  height: null,
  focal: null,
  subjectBox: null,
  focalOrigin: null,
  ...over,
});

const previews = (images: ClientEditionImage[]) =>
  (useClientEditionSourceUrls(images) as unknown as SourceQuery).queryFn();

beforeEach(() => {
  storageFrom.mockClear();
  createSignedUrls.mockClear();
  getPublicUrl.mockClear();
});

describe('useClientEditionSourceUrls — the bucket follows the source table (D3)', () => {
  it('signs a path in the bucket its source table names, even when the kind says otherwise', async () => {
    // Deduplicated bytes: the list's kind is maker, but this address is a scan's path.
    const urls = await previews([
      image({
        assetId: 'a-scan',
        sourceKind: 'maker',
        sourceTable: 'room_scan_images',
        sourceUrl: 'scans/u-1/s-1/room.jpg',
      }),
      image({ assetId: 'a-render', sourceKind: 'scan', sourceTable: 'project_rooms', sourceUrl: '/p-1/r-1/render.png' }),
      image({ assetId: 'a-board', sourceKind: 'board', sourceTable: 'project_boards', sourceUrl: 'pr-1/board.jpg' }),
      image({
        assetId: 'a-item',
        sourceKind: 'scan',
        sourceTable: 'project_ffe_item_images',
        sourceUrl: 'items/chair.jpg',
      }),
    ]);
    expect(urls).toEqual({
      'a-scan': 'signed:scans/u-1/s-1/room.jpg',
      'a-render': 'signed:p-1/r-1/render.png',
      'a-board': 'signed:pr-1/board.jpg',
      'a-item': 'public:items/chair.jpg',
    });
    expect(storageFrom).toHaveBeenCalledWith('room-scans');
    expect(storageFrom).toHaveBeenCalledWith('room-renders');
    expect(storageFrom).toHaveBeenCalledWith('proposal-mood-boards');
    expect(storageFrom).toHaveBeenCalledWith('project-item-images');
    // One signing per private bucket; the item bucket is public, never signed.
    expect(createSignedUrls).toHaveBeenCalledTimes(3);
    // The maker kind never sent the scan's path to the public item bucket.
    expect(getPublicUrl).toHaveBeenCalledTimes(1);
    expect(getPublicUrl).toHaveBeenCalledWith('items/chair.jpg');
  });

  it('an unknown source table gets no preview', async () => {
    const urls = await previews([
      image({ assetId: 'a-x', sourceKind: 'scan', sourceTable: 'site_photos', sourceUrl: 'x/y.jpg' }),
      image({ assetId: 'a-proto', sourceKind: 'upload', sourceTable: 'toString', sourceUrl: 'x/z.jpg' }),
    ]);
    expect(urls).toEqual({});
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('without a source table, the bucket follows the kind as before', async () => {
    const urls = await previews([
      image({ assetId: 'a-scan', sourceKind: 'scan', sourceUrl: 'scans/u-1/s-1/room.jpg' }),
      image({ assetId: 'a-item', sourceKind: 'upload', sourceUrl: 'items/chair.jpg' }),
      image({ assetId: 'a-maker', sourceKind: 'maker', sourceUrl: 'items/maker.jpg' }),
    ]);
    expect(urls).toEqual({
      'a-scan': 'signed:scans/u-1/s-1/room.jpg',
      'a-item': 'public:items/chair.jpg',
    });
    expect(storageFrom).toHaveBeenCalledWith('room-scans');
  });

  it('a hotlink is shown as it is, whatever its table', async () => {
    const urls = await previews([
      image({
        assetId: 'a-hot',
        sourceKind: 'maker',
        sourceTable: 'project_ffe_item_images',
        sourceUrl: 'https://example.com/chair.jpg',
      }),
    ]);
    expect(urls).toEqual({ 'a-hot': 'https://example.com/chair.jpg' });
    expect(storageFrom).not.toHaveBeenCalled();
  });
});

describe('normalizeClientEditions — the image keys 00845 adds', () => {
  const envelope = (images: Record<string, unknown>[]) => ({
    showMakers: false,
    editions: [{ id: 'e-1', seq: 1, status: 'approved', images }],
  });

  it('keeps ground, attributionKind and sourceTable as the list sends them', () => {
    const [edition] = normalizeClientEditions(
      envelope([{ assetId: 'a', ground: 'white', attributionKind: 'maker', sourceKind: 'scan', sourceTable: 'room_scan_images' }]) as never,
    ).editions;
    expect(edition.images[0]).toMatchObject({
      ground: 'white',
      attributionKind: 'maker',
      sourceKind: 'scan',
      sourceTable: 'room_scan_images',
    });
  });

  it('reads an older list without them as null', () => {
    const [edition] = normalizeClientEditions(envelope([{ assetId: 'a', sourceKind: 'upload' }]) as never).editions;
    expect(edition.images[0].ground).toBeNull();
    expect(edition.images[0].attributionKind).toBeNull();
    expect(edition.images[0].sourceTable).toBeNull();
  });
});
