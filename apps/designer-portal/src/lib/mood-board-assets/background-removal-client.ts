import {
  normalizeBackgroundRemovalError,
  sanitizeBackgroundRemovalCapability,
  sanitizeBackgroundRemovalResult,
  type BackgroundRemovalCapability,
  type BackgroundRemovalErrorDetails,
  type BackgroundRemovalResult,
  type RemoveBoardItemBackgroundInput,
} from './background-removal-contract';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export class BackgroundRemovalClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: BackgroundRemovalErrorDetails;

  constructor(options: {
    code: string;
    message: string;
    status: number;
    details?: BackgroundRemovalErrorDetails;
  }) {
    super(options.message);
    this.name = 'BackgroundRemovalClientError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

function fallbackFingerprint(value: string): string {
  // Two independently seeded FNV-1a passes keep retries deterministic in
  // older WebViews without Web Crypto. This is a uniqueness key, not a
  // security boundary; modern browsers use SHA-256 below.
  const hash = (seed: number): string => {
    let current = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      current ^= value.charCodeAt(index);
      current = Math.imul(current, 0x01000193) >>> 0;
    }
    return current.toString(16).padStart(8, '0');
  };
  return `${hash(0x811c9dc5)}${hash(0x9e3779b9)}`;
}

async function requestFingerprint(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof TextEncoder !== 'undefined') {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('').slice(0, 32);
    } catch {
      // Deterministic fallback preserves retry safety if Web Crypto is denied.
    }
  }
  return fallbackFingerprint(value);
}

/**
 * Stable across an ambiguous timeout/reload for the same source, but changes
 * when the item points at a different source image. The source URL itself is
 * never sent to the endpoint.
 */
export async function backgroundRemovalIdempotencyKey(input: {
  boardId: string;
  itemId: string;
  sourceUrl: string;
}): Promise<string> {
  const fingerprint = await requestFingerprint(
    `${input.boardId}\n${input.itemId}\n${input.sourceUrl}`,
  );
  return `moodboard-bg:${fingerprint}`;
}

async function responsePayload(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function requestBackgroundRemoval<T>(
  url: string,
  init: RequestInit,
  sanitize: (value: unknown) => T | null,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    throw new BackgroundRemovalClientError({
      code: 'background_removal_unavailable',
      message: 'Background removal is temporarily unavailable.',
      status: 0,
    });
  }
  const payload = await responsePayload(response);

  if (!response.ok) {
    const error = normalizeBackgroundRemovalError(payload, response.status);
    throw new BackgroundRemovalClientError({ ...error, status: response.status });
  }

  const wrapped = payload as Partial<ApiSuccess<unknown>> | null;
  const data = wrapped?.success === true ? wrapped.data : null;
  const sanitized = sanitize(data);
  if (!sanitized) {
    throw new BackgroundRemovalClientError({
      code: 'background_removal_failed',
      message: 'Background removal returned an invalid response.',
      status: 502,
    });
  }
  return sanitized;
}

export function getBackgroundRemovalCapability(
  boardId: string,
): Promise<BackgroundRemovalCapability> {
  return requestBackgroundRemoval(
    `/api/media/boards/${encodeURIComponent(boardId)}/background-removal-capability`,
    { method: 'GET', cache: 'no-store' },
    sanitizeBackgroundRemovalCapability,
  );
}

export function removeBoardItemBackground(
  input: RemoveBoardItemBackgroundInput,
): Promise<BackgroundRemovalResult> {
  return requestBackgroundRemoval(
    `/api/media/boards/${encodeURIComponent(input.boardId)}/items/${encodeURIComponent(input.itemId)}/remove-background`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
    },
    sanitizeBackgroundRemovalResult,
  );
}

export const moodBoardAssetsApi = {
  getBackgroundRemovalCapability,
  removeBoardItemBackground,
};
