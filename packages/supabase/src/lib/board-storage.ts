import {
  normalizeProposalBoardReference,
  proposalBoardUrlToPath,
  PROPOSAL_BOARD_BUCKET,
} from './storage-url';

const BOARD_MEDIA_KEYS = new Set([
  'cover_image_url',
  'image_url',
  'thumbnail_url',
  'original_image_url',
  'source_image_url',
  'coverImageUrl',
  'imageUrl',
  'thumbnailUrl',
  'originalImageUrl',
  'sourceImageUrl',
]);

interface SignedUrlEntry {
  path?: string | null;
  signedUrl?: string | null;
  error?: unknown;
}

export interface BoardStorageSigningClient {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{ data: SignedUrlEntry[] | null; error: unknown }>;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function transformBoardMedia(
  value: unknown,
  transform: (reference: string) => string | null,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => transformBoardMedia(entry, transform));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (BOARD_MEDIA_KEYS.has(key) && typeof entry === 'string') {
        return [key, transform(entry)];
      }
      return [key, transformBoardMedia(entry, transform)];
    }),
  );
}

function collectBoardMediaPaths(value: unknown, paths: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectBoardMediaPaths(entry, paths);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, entry] of Object.entries(value)) {
    if (BOARD_MEDIA_KEYS.has(key) && typeof entry === 'string') {
      const path = proposalBoardUrlToPath(entry);
      if (path) paths.add(path);
    } else {
      collectBoardMediaPaths(entry, paths);
    }
  }
}

/** Normalize only explicit media fields; arbitrary board copy is never parsed. */
export function normalizeBoardMediaValue<T>(value: T): T {
  return transformBoardMedia(
    value,
    (reference) => normalizeProposalBoardReference(reference) as string,
  ) as T;
}

/**
 * Batch-sign every distinct canonical mood-board reference in a projection.
 * External HTTPS URLs pass through. A per-object signing miss becomes `null`
 * so a private bare key is never emitted as a browser URL.
 */
export async function signBoardMediaValue<T>(
  client: BoardStorageSigningClient,
  value: T,
  expiresIn = 3600,
): Promise<T> {
  const paths = new Set<string>();
  collectBoardMediaPaths(value, paths);
  if (paths.size === 0) return value;

  const { data, error } = await client.storage
    .from(PROPOSAL_BOARD_BUCKET)
    .createSignedUrls(Array.from(paths), expiresIn);
  if (error) throw error;

  const signedByPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      signedByPath.set(entry.path, entry.signedUrl);
    }
  }

  return transformBoardMedia(value, (reference) => {
    const path = proposalBoardUrlToPath(reference);
    if (!path) return reference;
    return signedByPath.get(path) ?? null;
  }) as T;
}

export async function signBoardMediaReference(
  client: BoardStorageSigningClient,
  reference: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!reference) return null;
  const path = proposalBoardUrlToPath(reference);
  if (!path) return reference;
  const result = await signBoardMediaValue(
    client,
    { image_url: reference },
    expiresIn,
  );
  return result.image_url;
}
