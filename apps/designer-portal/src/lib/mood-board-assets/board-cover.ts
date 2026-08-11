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
  createSignedUrl(path: string): Promise<string>;
}

function safePathSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} must be a safe storage-path segment`);
  }
  return value;
}

export function createMoodBoardCoverStorage(): MoodBoardCoverStorage {
  const bucket = createBrowserClient().storage.from(BOARD_ASSET_BUCKET);
  return {
    async upload(path, blob) {
      const { error } = await bucket.upload(path, blob, {
        contentType: 'image/png',
        cacheControl: '300',
        upsert: false,
      });
      if (error) throw new Error(error.message);
    },
    async createSignedUrl(path) {
      const { data, error } = await bucket.createSignedUrl(path, 3600);
      if (error) throw new Error(error.message);
      if (!data?.signedUrl) throw new Error('Board cover signing returned no URL');
      return data.signedUrl;
    },
  };
}

/**
 * Paint a create-only, versioned 800×600 launcher cover. The caller persists
 * its canonical key through useUpsertBoard only after upload and signing.
 */
export async function generateAndUploadMoodBoardCover(options: {
  ownerId: string;
  boardId: string;
  input: MoodBoardRasterInput;
  storage?: MoodBoardCoverStorage;
  renderer?: (
    input: MoodBoardRasterInput,
    options?: MoodBoardCoverOptions,
  ) => Promise<MoodBoardRasterResult>;
  createVersionId?: () => string;
}): Promise<{ url: string; path: string; raster: MoodBoardRasterResult }> {
  const ownerId = safePathSegment(options.ownerId, 'Owner ID');
  const boardId = safePathSegment(options.boardId, 'Board ID');
  const versionId = safePathSegment(
    options.createVersionId?.() ?? globalThis.crypto.randomUUID(),
    'Cover version ID',
  );
  const path = `${ownerId}/boards/${boardId}/cover-${versionId}.png`;
  const raster = await (options.renderer ?? renderMoodBoardCover)(options.input);
  const storage = options.storage ?? createMoodBoardCoverStorage();
  await storage.upload(path, raster.blob);
  return { path, url: await storage.createSignedUrl(path), raster };
}
