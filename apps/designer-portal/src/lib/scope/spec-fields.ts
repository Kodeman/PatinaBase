/**
 * Spec custom fields (Track S² · S6) — pure helpers for the schedule's
 * designer-defined columns. `field_key` is an IMMUTABLE slug derived from the
 * def's name at create; the item `custom_fields` jsonb is keyed by it, so
 * activation/clone carry values verbatim (no id remap). Renaming a def changes
 * only its display `name` — never its field_key.
 *
 * Pure + dependency-free (jest-friendly). The Fields manager and the per-item
 * value editors both derive from these.
 */

export type SpecFieldKind = 'text' | 'number' | 'url';

export const SPEC_FIELD_KINDS: SpecFieldKind[] = ['text', 'number', 'url'];

export interface SpecFieldDef {
  id: string;
  proposal_id?: string | null;
  project_id?: string | null;
  field_key: string;
  name: string;
  kind: SpecFieldKind;
  sort_order: number;
}

/**
 * Slugify a def name into a field_key candidate: lowercase, every run of
 * non-alphanumerics → a single underscore, trimmed of edge underscores. An
 * empty/symbol-only name falls back to 'field'.
 */
export function slugifyFieldKey(name: string): string {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'field';
}

/**
 * A field_key unique within the owner's existing keys. Appends `_2`, `_3`… on
 * collision (case-insensitive), so two "Finish" fields become finish, finish_2.
 */
export function deriveUniqueFieldKey(
  name: string,
  existingKeys: Array<string | null | undefined>,
): string {
  const base = slugifyFieldKey(name);
  const taken = new Set(
    existingKeys.filter((k): k is string => !!k).map((k) => k.toLowerCase()),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/**
 * Coerce a raw input string to the stored value for a kind. number → a finite
 * Number or null; text/url → the trimmed string or null. An empty/invalid value
 * returns null so the caller can DELETE the key (keeping custom_fields lean).
 */
export function coerceFieldValue(kind: SpecFieldKind, raw: string): string | number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (kind === 'number') {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return t;
}

/** Format a stored custom_fields value for display (row / form / PDF). */
export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Apply one field's new raw value to a custom_fields object, returning a NEW
 * object (never mutates). An empty value deletes the key; otherwise the coerced
 * value is written under field_key.
 */
export function withFieldValue(
  customFields: Record<string, unknown> | null | undefined,
  fieldKey: string,
  kind: SpecFieldKind,
  raw: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(customFields ?? {}) };
  const coerced = coerceFieldValue(kind, raw);
  if (coerced === null) delete next[fieldKey];
  else next[fieldKey] = coerced;
  return next;
}

/** The next sort_order for a new def (one past the current max, else 0). */
export function nextFieldSortOrder(defs: Array<{ sort_order: number }>): number {
  return defs.reduce((max, d) => Math.max(max, d.sort_order + 1), 0);
}

/**
 * Reorder a def within the list by one step and return the id→sort_order pairs
 * that changed (for a minimal persist). `dir` −1 moves earlier, +1 later.
 */
export function reorderedFieldDefs<T extends { id: string; sort_order: number }>(
  defs: T[],
  id: string,
  dir: -1 | 1,
): Array<{ id: string; sort_order: number }> {
  const ordered = [...defs].sort((a, b) => a.sort_order - b.sort_order);
  const idx = ordered.findIndex((d) => d.id === id);
  if (idx === -1) return [];
  const swapWith = idx + dir;
  if (swapWith < 0 || swapWith >= ordered.length) return [];
  const a = ordered[idx];
  const b = ordered[swapWith];
  // Swap their sort_order values; only these two rows change.
  return [
    { id: a.id, sort_order: b.sort_order },
    { id: b.id, sort_order: a.sort_order },
  ];
}
