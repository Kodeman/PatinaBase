/**
 * Document share links (Schedule & Boards Wave 2 · C2).
 *
 * The raw token is minted AND hashed in the database (create_document_share,
 * 00266): 32 random bytes → 64-char lowercase-hex token; only sha256(token) is
 * stored. The client only ever handles the raw token, to build and validate a
 * link. These pure helpers are that TS surface — the hashing itself never
 * happens in JS (a stale/duplicated hash impl is a footgun; the DB is the one
 * hasher, SQL-proven).
 */

/** The shape the DB emits: 32 bytes as lowercase hex = exactly 64 hex chars. */
export const SHARE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Cheap format gate for a share token — lets the guest route (and tests) reject
 * an obviously-malformed token before any DB round-trip, without leaking whether
 * a well-formed token exists.
 */
export function isLikelyShareToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && SHARE_TOKEN_PATTERN.test(token);
}

/** The in-app path a token resolves at (client portal route `/share/[token]`). */
export function shareLinkPath(token: string): string {
  return `/share/${token}`;
}

/**
 * Absolute share URL for copy-to-clipboard. `origin` should be the client
 * portal origin (no trailing slash needed — we normalize).
 */
export function shareLinkUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}${shareLinkPath(token)}`;
}
