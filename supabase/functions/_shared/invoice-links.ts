/**
 * Invoice links — the permanent, account-less address of one issued invoice
 * (00574, The Invoice, Standing Alone): `https://client.patina.cloud/pay/<token>`.
 *
 * The 64-hex token IS the credential (256 bits of entropy is the control; the
 * portal's rate limiter is friction). It therefore never appears in a log
 * line, a Stripe return URL, or an analytics event — only the link's row id
 * does.
 *
 * SINCE 00636 (CRM-29) only sha256(token) is stored, so the address cannot be
 * re-emitted by anyone, Patina included: `ensure_invoice_link` MINTS a fresh
 * token per call and returns it once, which is "regenerate on send". Every
 * caller of `letterPortalUrl`/`ensureInvoiceLinkUrl` is a letter, and each
 * letter now carries its own live address with a 30-day clock; the previous
 * letter's address dies. A caller that only needs to know WHETHER a live link
 * exists must ask `hasLiveInvoiceLink` instead — minting one for a boolean
 * would revoke the address a payer is standing on.
 *
 * When there is no fresh address to carry, a letter falls back to
 * `letterFallbackUrl` — the client portal's own `/?invoice=<id>` shape, NOT
 * `/invoices/<id>`, which is not a page (W4 r6 MAJOR-1).
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
 * void, a missing invoice, a Checkout already standing on the address, or any
 * failure — so a letter or a Checkout return address falls back to the
 * letterbox form (`letterFallbackUrl`) rather than shipping a broken address
 * (M7). Logs the invoice id, never the token.
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
 * Where a letter points when it has no `/pay/<token>` to carry.
 *
 * `/invoices/<id>` IS NOT A PAGE (W4 r6 MAJOR-1). The client portal holds
 * exactly one route under that prefix — `/invoices/[invoiceId]/print` — the
 * middleware neither rewrites nor exempts the path, so a holder of that
 * address was bounced to `/auth/signin?callbackUrl=/invoices/<id>` and then to
 * not-found. Under 00574 the branch was effectively unreachable (a NULL meant
 * draft/void/missing, and no letter is sent for those); 00636's
 * Checkout-in-flight guard made NULL a routine answer, so the dead address
 * became reachable for as long as an attempt stands.
 *
 * `/?invoice=<id>` is the shape that exists: the Threshold's letterbox folds
 * to the named letter (`useNamedInvoice`), which is the move `door-gate.tsx`
 * already took for the deposit offer (W4 r1 B-1). It is a signed-in surface —
 * the account-less payer is served by holding the letter instead, which is why
 * `invoice-reminders` no longer writes to an invoice mid-payment.
 */
export function letterFallbackUrl(baseUrl: string, invoiceId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/?invoice=${encodeURIComponent(invoiceId)}`;
}

/**
 * The address a LETTER puts in front of a client: the invoice's own
 * `/pay/<token>`, or — when there is no link to be had (a draft, a void, a
 * Checkout standing on the current address, a failed mint) — the letterbox
 * form above. The fallback lives here, beside the helper it guards, so both
 * producers share one definition of "never ship a broken address" (M7) and a
 * test can exercise the real thing.
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
  return link ?? letterFallbackUrl(baseUrl, invoiceId);
}

/**
 * Does this invoice have an active, unexpired link?
 *
 * create-checkout-session needs exactly this and nothing more: it decides
 * whether a Checkout return may ride the `/pay/return/<nonce>` form. It used to
 * ask `ensureInvoiceLinkUrl`, which under 00636 would mint a token nobody would
 * ever read AND revoke the link the payer is mid-payment on. Failure answers
 * false, which keeps the driver's own non-token return address (M7).
 */
export async function hasLiveInvoiceLink(
  admin: InvoiceLinkRpcClient,
  invoiceId: string
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('invoice_link_is_live', { p_invoice_id: invoiceId });
    if (error) {
      console.error('hasLiveInvoiceLink: invoice_link_is_live failed', invoiceId, error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error(
      'hasLiveInvoiceLink: threw',
      invoiceId,
      err instanceof Error ? err.message : 'unknown error'
    );
    return false;
  }
}
