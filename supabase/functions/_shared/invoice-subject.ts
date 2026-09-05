/**
 * The two things every invoice letter derives from its row: what the letter is
 * *for*, and which brand signs it.
 *
 * Both live here rather than in each function because the five that send
 * invoice mail — create-checkout-session, invoice-send, invoice-reminders,
 * stripe-webhook, invoice-check-intent — each run `Deno.serve` at module load,
 * so no test can import them. A chain written inline in an `index.ts` is
 * therefore unprovable: it can be deleted and every gate stays green. Written
 * here, one unit test pins it for all five (2026-09-05 review, R4-1).
 */

/** The parts of an invoice row that say what the letter is for. */
export interface InvoiceSubjectRow {
  project?: { name?: string | null } | null;
  title?: string | null;
}

/** The parts of an invoice row that say whose letterhead signs it. */
export interface InvoiceBrandingRow {
  project_id?: string | null;
  designer_id?: string | null;
  studio_id?: string | null;
}

/**
 * What the letter is *for*: the house, else the studio invoice's own regarding
 * line, else a plain word for the studio's own book.
 *
 * `fallback` is the last rung only — the Stripe line item says "Studio invoice"
 * where a letter says "your studio".
 */
export function invoiceSubjectName(
  invoice: InvoiceSubjectRow,
  fallback = 'your studio'
): string {
  return invoice.project?.name ?? invoice.title ?? fallback;
}

/**
 * The anchors `resolveStudioIdentity` reads, in its precedence order.
 *
 * `studio_id` is the load-bearing one: a studio invoice has no project to read
 * the letterhead from, and `_primary_studio_for(designer)` is the wrong studio
 * for a designer who runs two.
 */
export function invoiceBrandingRef(
  invoice: InvoiceBrandingRow
): { projectId: string | null; designerId: string | null; studioId: string | null } {
  return {
    projectId: invoice.project_id ?? null,
    designerId: invoice.designer_id ?? null,
    studioId: invoice.studio_id ?? null,
  };
}
