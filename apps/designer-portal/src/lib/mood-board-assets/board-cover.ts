'use client';

import { createBrowserClient } from '@patina/supabase';
import {
  renderMoodBoardCover,
  type MoodBoardCoverOptions,
  type MoodBoardRasterInput,
  type MoodBoardRasterResult,
} from '@patina/design-system';
import { BOARD_ASSET_BUCKET } from './upload-board-assets';

export interface MoodBoardCoverStorage {
  upload(path: string, blob: Blob): Promise<void>;
  remove(path: string): Promise<void>;
  url(path: string): Promise<string>;
}

function safePathSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} must be a safe storage-path segment`);
  }
  return value;
}

export function createMoodBoardCoverStorage(options: {
  bucket?: string;
  privateUrl?: boolean;
} = {}): MoodBoardCoverStorage {
  const bucket = createBrowserClient().storage.from(options.bucket ?? BOARD_ASSET_BUCKET);
  return {
    async upload(path, blob) {
      const { error } = await bucket.upload(path, blob, {
        contentType: 'image/png',
        cacheControl: '300',
        upsert: true,
      });
      if (error) throw new Error(error.message);
    },
    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw new Error(error.message);
    },
    async url(path) {
      if (!options.privateUrl) return bucket.getPublicUrl(path).data.publicUrl;
      const { data, error } = await bucket.createSignedUrl(path, 3_600);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Cover URL was not returned');
      return data.signedUrl;
    },
  };
}

/**
 * Paint and upsert the canonical 800×600 launcher cover. The caller persists
 * `url` through useUpsertBoard only after the object upload succeeds.
 */
export async function generateAndUploadMoodBoardCover(options: {
  ownerId: string;
  boardId: string;
  input: MoodBoardRasterInput;
  version?: string;
  storage?: MoodBoardCoverStorage;
  renderer?: (
    input: MoodBoardRasterInput,
    options?: MoodBoardCoverOptions,
  ) => Promise<MoodBoardRasterResult>;
}): Promise<{ url: string; path: string; raster: MoodBoardRasterResult }> {
  const ownerId = safePathSegment(options.ownerId, 'Owner ID');
  const boardId = safePathSegment(options.boardId, 'Board ID');
  const version = options.version
    ? safePathSegment(options.version, 'Cover version')
    : null;
  const path = `${ownerId}/boards/${boardId}/${version ? `cover-${version}` : 'cover'}.png`;
  const raster = await (options.renderer ?? renderMoodBoardCover)(options.input);
  const storage = options.storage ?? createMoodBoardCoverStorage();
  await storage.upload(path, raster.blob);
  try {
    return { path, url: await storage.url(path), raster };
  } catch (error) {
    if (version) await storage.remove(path).catch(() => undefined);
    throw error;
  }
}
