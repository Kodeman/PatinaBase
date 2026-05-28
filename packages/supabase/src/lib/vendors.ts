/**
 * Vendor resolution for the capture pipeline.
 *
 * Given a partial vendor signal from a captured page (a domain extracted
 * from the URL, optionally a display name), find an existing `vendors` row
 * or create a stub one. Used by the Chrome extension capture, the
 * (eventual) mobile capture flow, and the in-portal URL-paste path.
 *
 * Idempotent and race-tolerant:
 *   1. Lookup by case-insensitive website (matches `idx_vendors_website_lower`
 *      added in migration 00152; a future migration upgrades that to a
 *      UNIQUE index — at which point an INSERT race surfaces as 23505 and
 *      we fall back to a SELECT).
 *   2. Lookup by exact case-insensitive name.
 *   3. INSERT a stub. On 23505 unique-violation, re-SELECT (another caller
 *      won the race).
 *
 * Returns a minimal `{ id, name, website, isPatinaCatalog }` envelope —
 * callers don't need the full vendor row to wire a capture.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';

export interface ResolvedVendor {
  id: string;
  name: string;
  website: string | null;
  /** Reflects `vendors.is_patina_catalog` so the caller can pick the
   * Patina-handled vs. external-vendor procurement path downstream. */
  isPatinaCatalog: boolean;
  /** True when this call created the row (vs. found an existing match). */
  created: boolean;
}

export interface ResolveVendorInput {
  /** Page URL — preferred signal. The host is extracted and case-folded. */
  url?: string | null;
  /** Display name from JSON-LD / OG meta. Used when URL doesn't match. */
  name?: string | null;
}

const NULL_VENDOR_NAME = 'Unknown vendor';

/**
 * Pull the host out of a URL and normalize:
 *   • lowercase
 *   • strip leading `www.`
 * Returns null when the URL is missing/malformed — caller falls back to
 * name lookup.
 */
function normalizeDomain(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

/**
 * Resolve a vendor for a capture. Always returns a vendor row — either
 * existing or freshly created. Throws on transient DB errors.
 *
 * NOTE on layer interaction: the resolved vendor has no layer of its own.
 * `is_patina_catalog` (migration 00149) is the vendor-level flag that
 * tells procurement which order path applies. The three-layer **product**
 * column lives on `products`, not on vendors.
 */
export async function resolveVendor(
  input: ResolveVendorInput,
  client: SupabaseClient<Database> = createBrowserClient(),
): Promise<ResolvedVendor> {
  const domain = normalizeDomain(input.url);

  // 1. Try website lookup. The 00152 index is non-unique today, so we
  //    `.limit(1)` to be safe across duplicate placeholder rows in dev seed.
  if (domain) {
    const { data, error } = await client
      .from('vendors')
      .select('id, name, website, is_patina_catalog')
      .ilike('website', `%${domain}%`)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      throw new Error(`resolveVendor: lookup by website failed: ${error.message}`);
    }
    const row = data?.[0];
    if (row) {
      return toResolved(row, false);
    }
  }

  // 2. Try name lookup if a name was supplied. Exact case-insensitive
  //    match — fuzzy matching is a separate concern (PRD §6.1 promotion
  //    duplicate detection) and shouldn't run on every capture.
  const trimmedName = input.name?.trim();
  if (trimmedName) {
    const { data, error } = await client
      .from('vendors')
      .select('id, name, website, is_patina_catalog')
      .ilike('name', trimmedName)
      .limit(1);
    if (error) {
      throw new Error(`resolveVendor: lookup by name failed: ${error.message}`);
    }
    const row = data?.[0];
    if (row) {
      return toResolved(row, false);
    }
  }

  // 3. Create a stub. Name precedence: caller name → domain → fallback.
  const stubName = trimmedName ?? domain ?? NULL_VENDOR_NAME;
  const stubWebsite = domain ? `https://${domain}` : null;

  const { data: inserted, error: insertError } = await client
    .from('vendors')
    .insert({ name: stubName, website: stubWebsite })
    .select('id, name, website, is_patina_catalog')
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      // A concurrent capture won the race and inserted first. Re-SELECT.
      const recovered = await client
        .from('vendors')
        .select('id, name, website, is_patina_catalog')
        .ilike('website', stubWebsite ?? `${stubName}`)
        .limit(1);
      const row = recovered.data?.[0];
      if (row) return toResolved(row, false);
    }
    throw new Error(`resolveVendor: insert failed: ${insertError.message}`);
  }

  return toResolved(inserted!, true);
}

function toResolved(
  row: { id: string; name: string; website: string | null; is_patina_catalog: boolean | null },
  created: boolean,
): ResolvedVendor {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    isPatinaCatalog: row.is_patina_catalog ?? false,
    created,
  };
}
