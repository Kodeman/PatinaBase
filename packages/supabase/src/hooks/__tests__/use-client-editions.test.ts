import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryObserver, MutationObserver, type UseMutationOptions } from '@tanstack/react-query';

// The storage API at the `@supabase/ssr` boundary and React Query, so the
// source-preview queryFn runs directly and the buckets it signs are visible.

const createSignedUrls = vi.fn(async (paths: string[], _expiresIn: number) => ({
  data: paths.map((path) => ({ path, signedUrl: `signed:${path}`, error: null })),
  error: null,
}));
const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `public:${path}` } }));
const storageFrom = vi.fn((_bucket: string) => ({ createSignedUrls, getPublicUrl }));
const rpc = vi.fn();
let queryClient: QueryClient;

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc, storage: { from: storageFrom } }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => queryClient,
}));

import {
  normalizeClientEditions,
  clientEditionsKey,
  clientEditionsQueryOptions,
  useApproveClientEdition,
  useHoldClientEdition,
  type ClientEditions,
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
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  rpc.mockReset();
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

  it('signs a field capture in capture-media even when its kind says otherwise', async () => {
    const urls = await previews([
      image({ assetId: 'a-capture', sourceKind: 'maker', sourceTable: 'field_captures', sourceUrl: '/u-1/c-1/photo.jpg' }),
    ]);
    expect(urls).toEqual({ 'a-capture': 'signed:u-1/c-1/photo.jpg' });
    expect(storageFrom).toHaveBeenCalledTimes(1);
    expect(storageFrom).toHaveBeenCalledWith('capture-media');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['u-1/c-1/photo.jpg'], 3600);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('signs a legacy installed source without a source table in capture-media', async () => {
    const urls = await previews([
      image({ assetId: 'a-installed', sourceKind: 'installed', sourceUrl: 'u-1/c-1/photo.jpg' }),
    ]);
    expect(urls).toEqual({ 'a-installed': 'signed:u-1/c-1/photo.jpg' });
    expect(storageFrom).toHaveBeenCalledTimes(1);
    expect(storageFrom).toHaveBeenCalledWith('capture-media');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['u-1/c-1/photo.jpg'], 3600);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('an unknown source table gets no preview', async () => {
    const urls = await previews([
      image({ assetId: 'a-installed', sourceKind: 'installed', sourceTable: 'unknown_captures', sourceUrl: 'u-1/c-1/photo.jpg' }),
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

describe('normalizeClientEditions — projectClosed (00848)', () => {
  it('keeps a closed job as the list sends it', () => {
    expect(normalizeClientEditions({ showMakers: false, projectClosed: true, editions: [] } as never).projectClosed).toBe(true);
  });

  it('reads an older list, or nothing, as open', () => {
    expect(normalizeClientEditions({ showMakers: false, editions: [] } as never).projectClosed).toBe(false);
    expect(normalizeClientEditions(null).projectClosed).toBe(false);
  });
});


describe('edition acts — confirmed success survives a failed list refetch', () => {
  it.each(['approve', 'hold'] as const)('%s cannot resurrect its act from stale awaiting_review data', async (act) => {
    const projectId = 'p-closed';
    const editionId = 'e-closing';
    const initial = normalizeClientEditions({ projectClosed: true, editions: [
      { id: editionId, seq: 1, status: 'awaiting_review', closing: true, held: false, images: [] },
    ] } as never);
    queryClient.setQueryData(clientEditionsKey(projectId), initial);
    const observer = new QueryObserver(queryClient, { ...clientEditionsQueryOptions(projectId), staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    rpc.mockImplementation(async (name: string) => name === 'list_client_editions'
      ? { data: null, error: new Error('list unavailable') }
      : { data: null, error: null });
    const options = (act === 'approve' ? useApproveClientEdition() : useHoldClientEdition()) as unknown as UseMutationOptions<void, Error, { projectId: string; editionId: string; overrides: {} }>;
    const mutation = new MutationObserver(queryClient, options);
    try {
      await mutation.mutate({ projectId, editionId, overrides: {} });
      await vi.waitFor(() => expect(observer.getCurrentResult().isRefetchError).toBe(true));
      expect(rpc).toHaveBeenCalledWith('list_client_editions', { p_project_id: projectId });
      const cached = queryClient.getQueryData<ClientEditions>(clientEditionsKey(projectId))!;
      expect(mutation.getCurrentResult().isPending).toBe(false);
      // PressBand offers Approve only for awaiting_review; Hold only if not held.
      if (act === 'approve') {
        expect(cached.editions.some((edition) => edition.status === 'awaiting_review')).toBe(false);
        expect(cached.editions[0].status).toBe('approved');
      } else {
        expect(cached.editions[0]).toMatchObject({ status: 'awaiting_review', held: true });
      }
      expect(cached.projectClosed).toBe(true);
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });

  it('a refused approval leaves the draft available for review', async () => {
    const initial = normalizeClientEditions({ editions: [{ id: 'e-1', seq: 1, status: 'awaiting_review', images: [] }] } as never);
    queryClient.setQueryData(clientEditionsKey('p-1'), initial);
    rpc.mockResolvedValue({ data: null, error: new Error('approval refused') });
    const options = useApproveClientEdition() as unknown as UseMutationOptions<void, Error, { projectId: string; editionId: string; overrides: {} }>;
    const mutation = new MutationObserver(queryClient, options);
    await expect(mutation.mutate({ projectId: 'p-1', editionId: 'e-1', overrides: {} })).rejects.toThrow('approval refused');
    expect(queryClient.getQueryData(clientEditionsKey('p-1'))).toEqual(initial);
    queryClient.clear();
  });
});
