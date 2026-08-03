// capture-from-url · durable per-user quota response helpers.
//
// The database owns quota accounting and concurrency (00410). This module is
// intentionally pure: it fails closed on a malformed RPC response and keeps
// the browser-facing 429 contract stable and easy to test.

export interface AllowedQuotaDecision {
  allowed: true;
  limit: Record<string, number>;
  remaining: Record<string, number>;
  retry_after_seconds: 0;
  reset_at: string;
}

export interface DeniedQuotaDecision {
  allowed: false;
  reason: "ten_minute_limit" | "daily_limit";
  limit: number;
  remaining: number;
  retry_after_seconds: number;
  reset_at: string;
}

export type QuotaDecision = AllowedQuotaDecision | DeniedQuotaDecision;

function finiteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function numericRecord(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return finiteNonNegativeInteger(record.ten_minutes) &&
    finiteNonNegativeInteger(record.day);
}

function validResetAt(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Validate the SECURITY DEFINER RPC's JSON before trusting it. */
export function parseQuotaDecision(value: unknown): QuotaDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  if (row.allowed === true) {
    if (
      !numericRecord(row.limit) || !numericRecord(row.remaining) ||
      row.retry_after_seconds !== 0 || !validResetAt(row.reset_at)
    ) return null;
    return {
      allowed: true,
      limit: row.limit,
      remaining: row.remaining,
      retry_after_seconds: 0,
      reset_at: row.reset_at,
    };
  }

  if (row.allowed === false) {
    if (
      (row.reason !== "ten_minute_limit" && row.reason !== "daily_limit") ||
      !finiteNonNegativeInteger(row.limit) ||
      !finiteNonNegativeInteger(row.remaining) ||
      !finiteNonNegativeInteger(row.retry_after_seconds) ||
      row.retry_after_seconds < 1 || !validResetAt(row.reset_at)
    ) return null;
    return {
      allowed: false,
      reason: row.reason,
      limit: row.limit,
      remaining: row.remaining,
      retry_after_seconds: row.retry_after_seconds,
      reset_at: row.reset_at,
    };
  }

  return null;
}

export function rateLimitBody(decision: DeniedQuotaDecision) {
  return {
    error: "url_unfurl_rate_limited",
    code: "url_unfurl_rate_limited",
    rate_limit: {
      reason: decision.reason,
      limit: decision.limit,
      remaining: decision.remaining,
      retry_after_seconds: decision.retry_after_seconds,
      reset_at: decision.reset_at,
    },
  };
}

/**
 * Build RPC arguments from the caller already verified with auth.getUser.
 * Keeping this function body-only-id-free makes the identity boundary explicit
 * at the call site and directly testable.
 */
export function quotaRpcArgsForVerifiedCaller(verifiedCallerId: string): {
  p_user_id: string;
} {
  return { p_user_id: verifiedCallerId };
}
