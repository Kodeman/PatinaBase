import { createBrowserClient } from '@patina/supabase';
import {
  prepareBoardImage,
  type BrowserImagePreparationRuntime,
  type PreparedBoardImage,
  type PrepareBoardImageOptions,
} from './image-preparation';

export const BOARD_ASSET_BUCKET = 'proposal-mood-boards';

export interface BoardAssetStorage {
  upload(
    path: string,
    file: File,
    options: { contentType: string; cacheControl: string; upsert: false },
  ): Promise<{ path: string }>;
  getPublicUrl(path: string): string;
  remove(paths: string[]): Promise<void>;
}

export interface UploadedBoardAssetVariant {
  path: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
}

export interface UploadedBoardImage {
  /** Canonical proposal_board_items.image_url value. */
  image_url: string;
  /** Canonical proposal_board_items.data derivative reference. */
  data: { thumbnail_url: string };
  assetId: string;
  aspectRatio: number;
  assets: {
    display: UploadedBoardAssetVariant;
    thumbnail: UploadedBoardAssetVariant;
  };
}

export type PrepareBoardImage = (
  file: File,
  options: PrepareBoardImageOptions,
) => Promise<PreparedBoardImage>;

export type BoardImageUploadStage = 'preparing' | 'uploading' | 'complete' | 'error';

export interface BoardImageUploadProgress {
  file: File;
  index: number;
  total: number;
  stage: BoardImageUploadStage;
}

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} must be a safe storage-path segment`);
  }
  return value;
}

export function createBoardAssetStorage(): BoardAssetStorage {
  const bucket = createBrowserClient().storage.from(BOARD_ASSET_BUCKET);
  return {
    async upload(path, file, options) {
      const { data, error } = await bucket.upload(path, file, options);
      if (error) throw new Error(error.message);
      if (!data?.path) throw new Error('Board asset upload returned no path');
      return { path: data.path };
    },
    getPublicUrl(path) {
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket.remove(paths);
      if (error) throw new Error(error.message);
    },
  };
}

async function cleanupBestEffort(storage: BoardAssetStorage, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await storage.remove(paths);
  } catch {
    // Upload failure remains the actionable error. The server-side two-pass
    // orphan ledger is the safety net if this best-effort removal also fails.
  }
}

export async function uploadPreparedBoardImage(options: {
  ownerId: string;
  boardId: string;
  image: PreparedBoardImage;
  storage?: BoardAssetStorage;
}): Promise<UploadedBoardImage> {
  const ownerId = safeSegment(options.ownerId, 'Owner ID');
  const boardId = safeSegment(options.boardId, 'Board ID');
  const assetId = safeSegment(options.image.assetId, 'Asset ID');
  const storage = options.storage ?? createBoardAssetStorage();
  const prefix = `${ownerId}/boards/${boardId}/${assetId}`;
  const expectedPaths = {
    display: `${prefix}.${options.image.display.extension}`,
    thumbnail: `${prefix}-thumb.${options.image.thumbnail.extension}`,
  };
  const uploadedPaths: string[] = [];

  try {
    const display = await storage.upload(expectedPaths.display, options.image.display.file, {
      contentType: options.image.display.mimeType,
      cacheControl: '3600',
      upsert: false,
    });
    uploadedPaths.push(display.path);
    const thumbnail = await storage.upload(
      expectedPaths.thumbnail,
      options.image.thumbnail.file,
      {
        contentType: options.image.thumbnail.mimeType,
        cacheControl: '3600',
        upsert: false,
      },
    );
    uploadedPaths.push(thumbnail.path);

    const displayUrl = storage.getPublicUrl(display.path);
    const thumbnailUrl = storage.getPublicUrl(thumbnail.path);
    return {
      image_url: displayUrl,
      data: { thumbnail_url: thumbnailUrl },
      assetId,
      aspectRatio: options.image.aspectRatio,
      assets: {
        display: {
          path: display.path,
          url: displayUrl,
          width: options.image.display.width,
          height: options.image.display.height,
          mimeType: options.image.display.mimeType,
        },
        thumbnail: {
          path: thumbnail.path,
          url: thumbnailUrl,
          width: options.image.thumbnail.width,
          height: options.image.thumbnail.height,
          mimeType: options.image.thumbnail.mimeType,
        },
      },
    };
  } catch (error) {
    await cleanupBestEffort(storage, uploadedPaths);
    throw error;
  }
}

function randomAssetId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('The browser cannot generate a board asset ID');
  }
  return globalThis.crypto.randomUUID();
}

/**
 * Canonical source-file entry point. Each file is decoded and re-encoded before
 * upload; if a later file fails, every object from this batch is removed.
 */
export async function prepareAndUploadBoardImages(options: {
  ownerId: string;
  boardId: string;
  files: readonly File[];
  runtime?: BrowserImagePreparationRuntime;
  storage?: BoardAssetStorage;
  createAssetId?: () => string;
  prepare?: PrepareBoardImage;
  onProgress?: (progress: BoardImageUploadProgress) => void;
}): Promise<UploadedBoardImage[]> {
  const storage = options.storage ?? createBoardAssetStorage();
  const prepare = options.prepare ?? prepareBoardImage;
  const createAssetId = options.createAssetId ?? randomAssetId;
  const usedIds = new Set<string>();
  const uploaded: UploadedBoardImage[] = [];
  let activeIndex = -1;

  try {
    for (const [index, file] of options.files.entries()) {
      activeIndex = index;
      options.onProgress?.({ file, index, total: options.files.length, stage: 'preparing' });
      const assetId = createAssetId();
      if (usedIds.has(assetId)) throw new Error('Board asset IDs must be unique per batch');
      usedIds.add(assetId);
      const image = await prepare(file, { assetId, runtime: options.runtime });
      if (image.assetId !== assetId) {
        throw new Error('Prepared board asset ID does not match its allocation');
      }
      options.onProgress?.({ file, index, total: options.files.length, stage: 'uploading' });
      uploaded.push(
        await uploadPreparedBoardImage({
          ownerId: options.ownerId,
          boardId: options.boardId,
          image,
          storage,
        }),
      );
      options.onProgress?.({ file, index, total: options.files.length, stage: 'complete' });
    }
    return uploaded;
  } catch (error) {
    const failedFile = options.files[activeIndex];
    if (failedFile) {
      options.onProgress?.({
        file: failedFile,
        index: activeIndex,
        total: options.files.length,
        stage: 'error',
      });
    }
    const priorPaths = uploaded.flatMap((item) => [
      item.assets.display.path,
      item.assets.thumbnail.path,
    ]);
    await cleanupBestEffort(storage, priorPaths);
    throw error;
  }
}
