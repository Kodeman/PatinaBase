/**
 * Placeholder-content guard.
 *
 * The Sanity dataset was bulk-seeded with ~137 stub `helpContent` documents
 * whose bodies are literal placeholder copy (e.g. "PLACEHOLDER pending Leah
 * review — explain leads."). Because those bodies are *truthy*, the content
 * resolver treated them as real hits and rendered them to end users, beating
 * the good inline `fallback` props and the intended graceful-absence behavior
 * (spec §13.4).
 *
 * `isPlaceholderContent` recognizes that stub copy so the resolver can treat
 * such a document as a MISS (→ `null`), letting each component fall back to its
 * inline `fallback` or render nothing. Applied at the lowest shared layer
 * (`useHelpContent`'s per-document fetch) so every surface benefits at once.
 */

/** Matches a body that begins with the literal token "PLACEHOLDER". */
const PLACEHOLDER_PREFIX = /^\s*PLACEHOLDER\b/i

/** Matches the editorial review marker the seed script embedded. */
const PENDING_REVIEW_MARKER = /pending leah review/i

/**
 * Flattens a help-content body into plain text for inspection.
 *
 * Bodies arrive either as plain strings (tooltip/empty-state/learn-more) or as
 * Portable-Text block arrays (help articles). For arrays we concatenate the
 * `text` of every span child — mirroring Sanity's `pt::text(...)` — which is
 * enough to detect a leading "PLACEHOLDER" or the review marker.
 */
function bodyToPlainText(body: unknown): string {
  if (typeof body === 'string') return body
  if (!Array.isArray(body)) return ''

  const parts: string[] = []
  for (const block of body) {
    if (!block || typeof block !== 'object') continue
    const children = (block as { children?: unknown }).children
    if (!Array.isArray(children)) continue
    for (const child of children) {
      const text = (child as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join(' ')
}

/**
 * Returns `true` when the given body is recognized as seed/placeholder copy
 * that should never be shown to end users.
 *
 * A body is placeholder when, after trimming, it either begins with the token
 * "PLACEHOLDER" or contains "pending Leah review" (both case-insensitive).
 * Accepts string bodies and Portable-Text/array bodies (plain text is
 * extracted first). Non-string, non-array, empty, or whitespace-only bodies
 * are NOT placeholder — they are handled by existing absence behavior.
 */
export function isPlaceholderContent(body: unknown): boolean {
  const text = bodyToPlainText(body).trim()
  if (text.length === 0) return false
  return PLACEHOLDER_PREFIX.test(text) || PENDING_REVIEW_MARKER.test(text)
}
