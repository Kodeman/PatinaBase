// Pure helpers for designer-invite, split out of index.ts so they're
// testable without importing a module that calls Deno.serve() at load time.

/**
 * business_name is never overwritten on a re-invite. If the target profile
 * already carries a non-empty business_name, the invite-time value is
 * dropped and businessNameKept is true so the caller can report that the
 * existing name was kept.
 */
export function resolveBusinessNameForUpsert(
  existingBusinessName: string | null | undefined,
  requestedBusinessName: string | undefined,
): { businessName?: string; businessNameKept: boolean } {
  const existing = existingBusinessName?.trim();
  if (existing) {
    return { businessNameKept: true };
  }
  const requested = requestedBusinessName?.trim();
  return requested
    ? { businessName: requested, businessNameKept: false }
    : { businessNameKept: false };
}
