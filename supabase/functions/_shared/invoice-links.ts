/**
 * Invoice links — the permanent, account-less address of one issued invoice
 * (00574, The Invoice, Standing Alone): `https://client.patina.cloud/pay/<token>`.
 *
 * The 64-hex token IS the credential (256 bits of entropy is the control; the
 * portal's rate limiter is friction). It therefore never appears in a log
 * line, a Stripe return URL, or an analytics event — only the link's row id
 * does. Every producer (invoice-send, invoice-reminders, stripe-webhook,
 * create-checkout-session) asks `ensure_invoice_link` per letter and never
 * caches the answer, so a Regenerate is honored by the next send.
 */

export const INVOICE_LINK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** `/pay/<token>` — the client-portal path. Refuses anything but a 64-hex token. */
export function invoiceLinkPath(token: string): string {
  if (!INVOICE_LINK_TOKEN_PATTERN.test(token)) {
    // No token in the message: a malformed value is still a secret-shaped one.
    throw new Error('invoice link token is malformed');
  }
  return `/pay/${token}`;
}

/** The absolute link (K6: the client portal host; `pay.patina.cloud` never). */
export function invoiceLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}${invoiceLinkPath(token)}`;
}

/** The narrow client surface this module needs — a service-role supabase-js client satisfies it. */
export interface InvoiceLinkRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * The invoice's live link as an absolute URL, minting one for an issued
 * invoice that somehow has none. `null` is the safety valve — for a draft, a
 * void, a missing invoice, or any failure — so a letter or a Checkout return
 * address falls back to today's `/invoices/<id>` form rather than shipping a
 * broken address (M7). Logs the invoice id, never the token.
 */
export async function ensureInvoiceLinkUrl(
  admin: InvoiceLinkRpcClient,
  baseUrl: string,
  invoiceId: string
): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('ensure_invoice_link', { p_invoice_id: invoiceId });
    if (error) {
      console.error('ensureInvoiceLinkUrl: ensure_invoice_link failed', invoiceId, error.message);
      return null;
    }
    if (typeof data !== 'string' || !INVOICE_LINK_TOKEN_PATTERN.test(data)) {
      return null;
    }
    return invoiceLinkUrl(baseUrl, data);
  } catch (err) {
    console.error(
      'ensureInvoiceLinkUrl: threw',
      invoiceId,
      err instanceof Error ? err.message : 'unknown error'
    );
    return null;
  }
}

/**
 * The address a LETTER puts in front of a client: the invoice's own
 * `/pay/<token>`, or — when there is no link to be had (a draft, a void, a
 * failed mint) — today's signed-in `/invoices/<id>` form. The fallback lives
 * here, beside the helper it guards, so both producers share one definition of
 * "never ship a broken address" (M7) and a test can exercise the real thing.
 *
 * Asked per letter and never cached, so a Regenerate is honored by the next
 * send.
 */
export async function letterPortalUrl(
  admin: InvoiceLinkRpcClient,
  baseUrl: string,
  invoiceId: string
): Promise<string> {
  const link = await ensureInvoiceLinkUrl(admin, baseUrl, invoiceId);
  return link ?? `${baseUrl.replace(/\/$/, '')}/invoices/${invoiceId}`;
}
