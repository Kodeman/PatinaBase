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
