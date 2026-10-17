import { describe, it, expect, vi, beforeEach } from 'vitest';

// US-37 #1+#2 (00807): a project item's own pictures. useQuery/useMutation
// return their own config, so a test runs queryFn / mutationFn / onSuccess.

function makeChain(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { chain, calls };
}

const order: string[] = [];
const rpc = vi.fn(async (name: string, _args: unknown): Promise<{ data: unknown; error: unknown }> => {
  order.push(`rpc:${name}`);
  return { data: { id: 'img-1' }, error: null };
});
const from = vi.fn();
const upload = vi.fn(async (path: string, _file: unknown, _options: unknown) => {
  order.push(`upload:${path}`);
  return { data: { path }, error: null as unknown };
});
const getPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://cdn.test/project-item-images/${path}` },
}));
const storageFrom = vi.fn(() => ({ upload, getPublicUrl }));

vi.mock('../../client', () => ({
  createBrowserClient: () => ({ from, rpc, storage: { from: storageFrom } }),
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  ffeItemImageKeys,
  PROJECT_ITEM_IMAGES_BUCKET,
  useAddFfeItemImage,
  useFfeItemImages,
  useReorderFfeItemImages,
  useSetFfeItemPrimaryImage,
  useUnlinkFfeItemImage,
  useUploadFfeItemImage,
} from '../use-ffe-item-images';
import { specBookKeys } from '../use-spec-books';

interface MutationConfig<TVars> {
  retry: unknown;
  mutationFn: (vars: TVars) => Promise<unknown>;
  onSuccess: (result: unknown, vars: TVars) => void;
}

async function run<TVars>(config: unknown, vars: TVars) {
  const mutation = config as MutationConfig<TVars>;
  const result = await mutation.mutationFn(vars);
  mutation.onSuccess(result, vars);
  return result;
}

const invalidatedKeys = () => invalidateQueries.mock.calls.map((call) => call[0].queryKey);

/** The picture list and both item-list readers that select primary_image_url. */
const ITEM_IMAGE_KEYS = [
  ['project-ffe-item-images', 'i1'],
  ['project-ffe-items', 'p1'],
  specBookKeys.workbench('p1'),
];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
});

describe('useFfeItemImages', () => {
  it('reads one item\'s pictures in position order under its own key', async () => {
    const { chain, calls } = makeChain({ data: [{ id: 'img-1' }], error: null });
    from.mockReturnValue(chain);
    const config = useFfeItemImages('i1') as unknown as {
      queryKey: unknown[];
      enabled: boolean;
      queryFn: () => Promise<unknown>;
    };
    expect(config.queryKey).toEqual(ffeItemImageKeys.item('i1'));
    expect(config.enabled).toBe(true);
    await expect(config.queryFn()).resolves.toEqual([{ id: 'img-1' }]);
    expect(from).toHaveBeenCalledWith('project_ffe_item_images');
    expect(calls).toContainEqual(['eq', ['item_id', 'i1']]);
    expect(calls.filter(([method]) => method === 'order').map(([, args]) => args[0])).toEqual([
      'position',
      'created_at',
      'id',
    ]);
  });

  it('stays idle without an item', () => {
    const config = useFfeItemImages(null) as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });
});

describe('picture acts', () => {
  it('add calls add_ffe_item_image and refreshes the item lists', async () => {
    const config = useAddFfeItemImage();
    await run(config, {
      projectId: 'p1',
      itemId: 'i1',
      url: 'https://img.test/a.jpg',
      source: 'library' as const,
      sourceProductId: 'prod-1',
    });
    expect(rpc).toHaveBeenCalledWith('add_ffe_item_image', {
      p_item_id: 'i1',
      p_url: 'https://img.test/a.jpg',
      p_storage_path: undefined,
      p_source: 'library',
      p_source_product_id: 'prod-1',
    });
    expect(invalidatedKeys()).toEqual(ITEM_IMAGE_KEYS);
    expect((config as unknown as MutationConfig<unknown>).retry).toBe(false);
  });

  it('set-primary, reorder and unlink name their RPC and refresh the item lists', async () => {
    await run(useSetFfeItemPrimaryImage(), { projectId: 'p1', itemId: 'i1', imageId: 'img-2' });
    expect(rpc).toHaveBeenLastCalledWith('set_ffe_item_primary_image', { p_image_id: 'img-2' });
    expect(invalidatedKeys()).toEqual(ITEM_IMAGE_KEYS);

    invalidateQueries.mockClear();
    await run(useReorderFfeItemImages(), {
      projectId: 'p1',
      itemId: 'i1',
      imageIds: ['img-2', 'img-1'],
    });
    expect(rpc).toHaveBeenLastCalledWith('reorder_ffe_item_images', {
      p_item_id: 'i1',
      p_image_ids: ['img-2', 'img-1'],
    });
    expect(invalidatedKeys()).toEqual(ITEM_IMAGE_KEYS);

    invalidateQueries.mockClear();
    await run(useUnlinkFfeItemImage(), { projectId: 'p1', itemId: 'i1', imageId: 'img-2' });
    expect(rpc).toHaveBeenLastCalledWith('unlink_ffe_item_image', { p_image_id: 'img-2' });
    expect(invalidatedKeys()).toEqual(ITEM_IMAGE_KEYS);
    // Unlink never reaches storage.
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('a refused act surfaces the error and refreshes nothing', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'refused' } });
    const mutation = useUnlinkFfeItemImage() as unknown as MutationConfig<unknown>;
    await expect(
      mutation.mutationFn({ projectId: 'p1', itemId: 'i1', imageId: 'img-2' }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('useUploadFfeItemImage', () => {
  it('stores the file in the job folder first, then adds it as an upload', async () => {
    const file = { type: 'image/png', name: 'chair.png' } as unknown as File;
    await run(useUploadFfeItemImage(), { projectId: 'p1', itemId: 'i1', file });

    expect(storageFrom).toHaveBeenCalledWith(PROJECT_ITEM_IMAGES_BUCKET);
    const [path, , options] = upload.mock.calls[0];
    expect(path).toMatch(/^p1\/i1\/[0-9a-f-]{36}\.png$/);
    expect(options).toEqual({ contentType: 'image/png', upsert: false });
    expect(order).toEqual([`upload:${path}`, 'rpc:add_ffe_item_image']);
    expect(rpc).toHaveBeenCalledWith('add_ffe_item_image', {
      p_item_id: 'i1',
      p_url: `https://cdn.test/project-item-images/${path}`,
      p_storage_path: path,
      p_source: 'upload',
      p_source_product_id: undefined,
    });
    expect(invalidatedKeys()).toEqual(ITEM_IMAGE_KEYS);
  });

  it('a failed upload adds nothing', async () => {
    upload.mockResolvedValueOnce({ data: null as unknown as { path: string }, error: { message: 'too big' } });
    const mutation = useUploadFfeItemImage() as unknown as MutationConfig<unknown>;
    const file = { type: 'image/jpeg', name: 'a.jpg' } as unknown as File;
    await expect(mutation.mutationFn({ projectId: 'p1', itemId: 'i1', file })).rejects.toMatchObject({
      message: 'too big',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a type the bucket will not take before storing anything', async () => {
    const mutation = useUploadFfeItemImage() as unknown as MutationConfig<unknown>;
    const file = { type: 'image/gif', name: 'a.gif' } as unknown as File;
    await expect(mutation.mutationFn({ projectId: 'p1', itemId: 'i1', file })).rejects.toThrow(
      'unsupported_image_type',
    );
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
