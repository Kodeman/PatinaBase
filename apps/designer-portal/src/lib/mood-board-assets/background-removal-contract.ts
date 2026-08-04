export interface BackgroundRemovalQuotaWindow {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

export interface BackgroundRemovalQuota {
  studioMonthly: BackgroundRemovalQuotaWindow;
  globalDaily: BackgroundRemovalQuotaWindow;
}

export type BackgroundRemovalCapability =
  | { available: true; quota: BackgroundRemovalQuota }
  | {
      available: false;
      code: 'background_removal_not_configured';
    };

export interface BackgroundRemovalResult {
  originalUrl: string;
  cutoutUrl: string;
  quota: BackgroundRemovalQuota;
  idempotentReplay: boolean;
}

export interface RemoveBoardItemBackgroundInput {
  boardId: string;
  itemId: string;
  idempotencyKey: string;
}

export type BackgroundRemovalLimitScope = 'studio_monthly' | 'global_daily';

export interface BackgroundRemovalErrorDetails {
  scope?: BackgroundRemovalLimitScope;
  limit?: number;
  resetAt?: string;
}

export interface BackgroundRemovalErrorDescriptor {
  code: string;
  message: string;
  details?: BackgroundRemovalErrorDetails;
}

const DOMAIN_ERROR_MESSAGES = {
  background_removal_invalid_request: 'The request body must be empty.',
  background_removal_idempotency_key_required: 'A valid Idempotency-Key header is required.',
  background_removal_not_configured: 'Background removal is not configured.',
  background_removal_limit_reached: 'Background removal limit reached.',
  background_removal_idempotency_conflict: 'That request key was already used.',
  background_removal_in_progress: 'This background-removal request is already in progress.',
  background_removal_source_unavailable: 'This image cannot be processed.',
  background_removal_failed: 'Background removal failed. Try again later.',
  background_removal_unavailable: 'Background removal is temporarily unavailable.',
  board_item_not_found: 'Board item not found.',
  authentication_required: 'Authentication required.',
  background_removal_forbidden: 'You do not have access to this board item.',
  background_removal_conflict: 'Background removal could not be started for this item.',
} as const;

type DomainErrorCode = keyof typeof DOMAIN_ERROR_MESSAGES;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function domainCode(value: unknown): DomainErrorCode | null {
  return typeof value === 'string' && value in DOMAIN_ERROR_MESSAGES
    ? (value as DomainErrorCode)
    : null;
}

function fallbackCodeForStatus(status: number): DomainErrorCode {
  if (status === 400) return 'background_removal_invalid_request';
  if (status === 401) return 'authentication_required';
  if (status === 403) return 'background_removal_forbidden';
  if (status === 404) return 'board_item_not_found';
  if (status === 409) return 'background_removal_conflict';
  if (status === 422) return 'background_removal_source_unavailable';
  if (status === 429) return 'background_removal_limit_reached';
  if (status === 503 || status === 504) return 'background_removal_unavailable';
  return 'background_removal_failed';
}

function quotaDetails(value: unknown): BackgroundRemovalErrorDetails | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const scope =
    record.scope === 'studio_monthly' || record.scope === 'global_daily'
      ? record.scope
      : undefined;
  const limit =
    typeof record.limit === 'number' && Number.isFinite(record.limit)
      ? record.limit
      : undefined;
  const resetAt = typeof record.resetAt === 'string' ? record.resetAt : undefined;

  return scope || limit !== undefined || resetAt
    ? { ...(scope ? { scope } : {}), ...(limit !== undefined ? { limit } : {}), ...(resetAt ? { resetAt } : {}) }
    : undefined;
}

/**
 * Converts either a direct portal error or @patina/api-routes' nested backend
 * error into the small, vendor-neutral contract the browser is allowed to see.
 */
export function normalizeBackgroundRemovalError(
  payload: unknown,
  status: number,
): BackgroundRemovalErrorDescriptor {
  const root = asRecord(payload);
  const apiError = asRecord(root?.error);
  const apiDetails = asRecord(apiError?.details);
  const backendDetails = asRecord(apiDetails?.backendDetails);

  const code =
    domainCode(backendDetails?.code) ??
    domainCode(apiError?.code) ??
    domainCode(root?.code) ??
    fallbackCodeForStatus(status);
  const details =
    code === 'background_removal_limit_reached'
      ? quotaDetails(backendDetails ?? apiError?.details ?? root)
      : undefined;

  return {
    code,
    message: DOMAIN_ERROR_MESSAGES[code],
    ...(details ? { details } : {}),
  };
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizeQuotaWindow(value: unknown): BackgroundRemovalQuotaWindow | null {
  const record = asRecord(value);
  if (!record) return null;
  const limit = finiteNonNegativeNumber(record.limit);
  const used = finiteNonNegativeNumber(record.used);
  const remaining = finiteNonNegativeNumber(record.remaining);
  const resetAt = typeof record.resetAt === 'string' ? record.resetAt : null;
  if (limit === null || used === null || remaining === null || !resetAt) return null;
  return { limit, used, remaining, resetAt };
}

export function sanitizeBackgroundRemovalQuota(value: unknown): BackgroundRemovalQuota | null {
  const record = asRecord(value);
  if (!record) return null;
  const studioMonthly = sanitizeQuotaWindow(record.studioMonthly);
  const globalDaily = sanitizeQuotaWindow(record.globalDaily);
  return studioMonthly && globalDaily ? { studioMonthly, globalDaily } : null;
}

export function sanitizeBackgroundRemovalCapability(
  value: unknown,
): BackgroundRemovalCapability | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.available === false && record.code === 'background_removal_not_configured') {
    return { available: false, code: 'background_removal_not_configured' };
  }
  if (record.available === true) {
    const quota = sanitizeBackgroundRemovalQuota(record.quota);
    return quota ? { available: true, quota } : null;
  }
  return null;
}

export function sanitizeBackgroundRemovalResult(value: unknown): BackgroundRemovalResult | null {
  const record = asRecord(value);
  if (!record) return null;
  const quota = sanitizeBackgroundRemovalQuota(record.quota);
  if (
    typeof record.originalUrl !== 'string' ||
    typeof record.cutoutUrl !== 'string' ||
    typeof record.idempotentReplay !== 'boolean' ||
    !quota
  ) {
    return null;
  }
  return {
    originalUrl: record.originalUrl,
    cutoutUrl: record.cutoutUrl,
    quota,
    idempotentReplay: record.idempotentReplay,
  };
}
