/**
 * Invoice links (The Invoice, Standing Alone · 00574).
 *
 * The permanent, account-less address of one issued invoice:
 * `https://client.patina.cloud/pay/<token>` (K6 — `pay.patina.cloud` never).
 * The token IS the credential — 32 random bytes minted in the database as
 * 64-char lowercase hex — so it never reaches a log line, a Stripe return
 * URL, or an analytics event.
 *
 * The `document-share` twin: pure helpers only, no hashing in JS.
 */

/** The shape the DB emits: 32 bytes as lowercase hex = exactly 64 hex chars. */
export const INVOICE_LINK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Cheap format gate for an invoice-link token — lets the guest route (and
 * tests) reject an obviously-malformed token before any DB round-trip, without
 * leaking whether a well-formed token exists.
 */
export function isLikelyInvoiceLinkToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && INVOICE_LINK_TOKEN_PATTERN.test(token);
}

/** The in-app path a token resolves at (client portal route `/pay/[token]`). */
export function invoiceLinkPath(token: string): string {
  return `/pay/${token}`;
}

/**
 * Absolute pay-link URL for copy-to-clipboard. `origin` should be the client
 * portal origin (no trailing slash needed — we normalize).
 */
export function invoiceLinkUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}${invoiceLinkPath(token)}`;
}
