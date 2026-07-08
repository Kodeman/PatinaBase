/**
 * capture-from-url — the shared shape the `capture-from-url` edge function
 * returns, and the refresh diff-builder.
 *
 * On refresh we NEVER silently overwrite a record (the brand): buildRefreshDiff
 * compares what's on file against what the page now says and returns ONLY the
 * fields the page carries AND that differ, each with before/after, so the Piece
 * Room can offer a per-field accept. Fields the page no longer carries are never
 * proposed — a refresh can add or correct, but never wipe.
 *
 * Pure + dependency-free (the fetch + SSRF guard live in the edge function; this
 * runs in the portal).
 */

export interface ExtractedProduct {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  priceRetailCents?: number | null;
  images?: string[];
  sourceUrl?: string | null;
}

export type RefreshField = 'name' | 'brand' | 'description' | 'price_retail' | 'images';

export interface RefreshFieldChange {
  field: RefreshField;
  label: string;
  before: string | number | string[] | null;
  after: string | number | string[];
}

export interface RefreshCurrentRecord {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  price_retail?: number | null;
  images?: string[] | null;
}

/** Proposed field changes from a refresh: only what the page carries AND differs. */
export function buildRefreshDiff(
  current: RefreshCurrentRecord,
  extracted: ExtractedProduct,
): RefreshFieldChange[] {
  const changes: RefreshFieldChange[] = [];

  const textField = (
    field: Extract<RefreshField, 'name' | 'brand' | 'description'>,
    label: string,
    before: string | null | undefined,
    after: string | null | undefined,
  ) => {
    const next = typeof after === 'string' ? after.trim() : '';
    if (next && next !== (before ?? '').trim()) {
      changes.push({ field, label, before: before ?? null, after: next });
    }
  };
  textField('name', 'Name', current.name, extracted.name);
  textField('brand', 'Brand', current.brand, extracted.brand);
  textField('description', 'Description', current.description, extracted.description);

  const price = extracted.priceRetailCents;
  if (price != null && Number.isFinite(price) && price !== (current.price_retail ?? null)) {
    changes.push({ field: 'price_retail', label: 'Price', before: current.price_retail ?? null, after: price });
  }

  const images = (extracted.images ?? []).filter((u): u is string => !!u && u.trim() !== '');
  const currentImages = current.images ?? [];
  if (images.length > 0 && JSON.stringify(images) !== JSON.stringify(currentImages)) {
    changes.push({ field: 'images', label: 'Images', before: currentImages, after: images });
  }

  return changes;
}
