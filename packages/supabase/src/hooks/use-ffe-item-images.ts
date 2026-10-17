/**
 * A project item's own pictures (US-37 #1 + #2, migration 00807).
 *
 * `project_ffe_item_images` holds a snapshot of the library piece's
 * `products.images`, taken when the piece lands on the job, plus uploads.
 * One picture per item is primary. The four acts are RPCs; each refuses
 * anyone outside the job's studio with 42501 and a plain sentence. Unlinking
 * removes the link row, never the stored file.
 *
 * Uploads go to the public `project-item-images` bucket at
 * `${projectId}/${itemId}/${uuid}.${ext}`; the stored url is that object's
 * public URL.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import { specBookKeys } from './use-spec-books';

const getSupabase = () => createBrowserClient();

export const PROJECT_ITEM_IMAGES_BUCKET = 'project-item-images';

export type FfeItemImage = Database['public']['Tables']['project_ffe_item_images']['Row'];
export type FfeItemImageSource = 'library' | 'upload';

export const ffeItemImageKeys = {
  all: ['project-ffe-item-images'] as const,
  item: (itemId: string) => ['project-ffe-item-images', itemId] as const,
};

/** The picture list itself, and every item list that shows the primary. */
function invalidateFfeItemImages(queryClient: QueryClient, projectId: string, itemId: string): void {
  queryClient.invalidateQueries({ queryKey: ffeItemImageKeys.item(itemId) });
  // useProjectFFEItems (every filter variant) and the spec book workbench
  // both select primary_image_url.
  queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
  queryClient.invalidateQueries({ queryKey: specBookKeys.workbench(projectId) });
}

/** An item's pictures in position order (RLS: the job's studio). */
export function useFfeItemImages(itemId: string | null | undefined) {
  return useQuery<FfeItemImage[]>({
    queryKey: ffeItemImageKeys.item(itemId ?? ''),
    enabled: Boolean(itemId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_ffe_item_images')
        .select('*')
        .eq('item_id', itemId as string)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface AddFfeItemImageInput {
  projectId: string;
  itemId: string;
  url: string;
  /** The object path inside `${projectId}/`, for an upload. */
  storagePath?: string | null;
  /** Defaults to 'upload'. */
  source?: FfeItemImageSource;
  /** The library piece a picked picture came from. */
  sourceProductId?: string | null;
}

async function addFfeItemImage(input: AddFfeItemImageInput): Promise<FfeItemImage> {
  const { data, error } = await getSupabase().rpc('add_ffe_item_image', {
    p_item_id: input.itemId,
    p_url: input.url,
    p_storage_path: input.storagePath ?? undefined,
    p_source: input.source ?? 'upload',
    p_source_product_id: input.sourceProductId ?? undefined,
  });
  if (error) throw error;
  return data as FfeItemImage;
}

/** Appends a picture; it becomes primary when the item has none. */
export function useAddFfeItemImage() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: addFfeItemImage,
    onSuccess: (_image, { projectId, itemId }) => {
      invalidateFfeItemImages(queryClient, projectId, itemId);
    },
  });
}

export interface FfeItemImageActInput {
  projectId: string;
  itemId: string;
  imageId: string;
}

/** Makes one picture the item's primary. */
export function useSetFfeItemPrimaryImage() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ imageId }: FfeItemImageActInput): Promise<FfeItemImage> => {
      const { data, error } = await getSupabase().rpc('set_ffe_item_primary_image', {
        p_image_id: imageId,
      });
      if (error) throw error;
      return data as FfeItemImage;
    },
    onSuccess: (_image, { projectId, itemId }) => {
      invalidateFfeItemImages(queryClient, projectId, itemId);
    },
  });
}

export interface ReorderFfeItemImagesInput {
  projectId: string;
  itemId: string;
  /** Every picture on the item, once, in the new order. */
  imageIds: string[];
}

/** Sets the picture order; returns the pictures in that order. */
export function useReorderFfeItemImages() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ itemId, imageIds }: ReorderFfeItemImagesInput): Promise<FfeItemImage[]> => {
      const { data, error } = await getSupabase().rpc('reorder_ffe_item_images', {
        p_item_id: itemId,
        p_image_ids: imageIds,
      });
      if (error) throw error;
      return (data ?? []) as FfeItemImage[];
    },
    onSuccess: (_images, { projectId, itemId }) => {
      invalidateFfeItemImages(queryClient, projectId, itemId);
    },
  });
}

/**
 * Takes a picture off the item. The stored file stays; when it was the
 * primary, the first remaining picture becomes primary.
 */
export function useUnlinkFfeItemImage() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ imageId }: FfeItemImageActInput): Promise<void> => {
      const { error } = await getSupabase().rpc('unlink_ffe_item_image', {
        p_image_id: imageId,
      });
      if (error) throw error;
    },
    onSuccess: (_result, { projectId, itemId }) => {
      invalidateFfeItemImages(queryClient, projectId, itemId);
    },
  });
}

/** The bucket's allowed types (00807), each with its file extension. */
export const FFE_ITEM_IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export interface UploadFfeItemImageInput {
  projectId: string;
  itemId: string;
  file: File;
}

/** Stores the file in the job's folder, then appends it to the item. */
export function useUploadFfeItemImage() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ projectId, itemId, file }: UploadFfeItemImageInput): Promise<FfeItemImage> => {
      const ext = FFE_ITEM_IMAGE_TYPES[file.type];
      if (!ext) throw new Error('unsupported_image_type');
      const storage = getSupabase().storage.from(PROJECT_ITEM_IMAGES_BUCKET);
      const path = `${projectId}/${itemId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await storage.upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data } = storage.getPublicUrl(path);
      return addFfeItemImage({
        projectId,
        itemId,
        url: data.publicUrl,
        storagePath: path,
        source: 'upload',
      });
    },
    onSuccess: (_image, { projectId, itemId }) => {
      invalidateFfeItemImages(queryClient, projectId, itemId);
    },
  });
}
