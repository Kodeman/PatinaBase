// Pure helpers for the po-send edge function (Wave 4, W4-T3).
//
// Everything here is dependency-free and side-effect-free so it unit-tests
// under plain `deno test` without booting Deno.serve (index.ts imports this
// module; index.test.ts tests it directly).

// ─── Payload parsing ─────────────────────────────────────────────────────────

export type PoSendMode = 'preview' | 'send' | 'mark_sent';

export interface PoSendPayload {
  purchaseOrderId: string;
  mode: PoSendMode;
  recipientEmail?: string;
  message?: string;
  ccDesigner: boolean;
}

const VALID_MODES: ReadonlySet<string> = new Set(['preview', 'send', 'mark_sent']);

export type ParseResult =
  | { ok: true; payload: PoSendPayload }
  | { ok: false; error: string };

/**
 * Validate the request body. Error strings double as the response `error`
 * codes (invoice-send idiom): 'invalid_body', 'purchaseOrderId_required',
 * 'invalid_mode', 'invalid_recipient'. `mode` defaults to 'send'.
 */
export function parsePoSendBody(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;

  const purchaseOrderId =
    typeof b.purchaseOrderId === 'string' ? b.purchaseOrderId.trim() : '';
  if (!purchaseOrderId) {
    return { ok: false, error: 'purchaseOrderId_required' };
  }

  let mode: PoSendMode = 'send';
  if (b.mode !== undefined && b.mode !== null) {
    if (typeof b.mode !== 'string' || !VALID_MODES.has(b.mode)) {
      return { ok: false, error: 'invalid_mode' };
    }
    mode = b.mode as PoSendMode;
  }

  let recipientEmail: string | undefined;
  if (b.recipientEmail !== undefined && b.recipientEmail !== null) {
    const candidate =
      typeof b.recipientEmail === 'string' ? b.recipientEmail.trim() : '';
    if (!candidate || !candidate.includes('@')) {
      return { ok: false, error: 'invalid_recipient' };
    }
    recipientEmail = candidate;
  }

  const message =
    typeof b.message === 'string' && b.message.trim() ? b.message.trim() : undefined;

  return {
    ok: true,
    payload: {
      purchaseOrderId,
      mode,
      recipientEmail,
      message,
      ccDesigner: b.ccDesigner === true,
    },
  };
}

// ─── Recipient resolution ────────────────────────────────────────────────────

export interface VendorRecipientSource {
  orders_email?: string | null;
  contact_info?: Record<string, unknown> | null;
}

/**
 * Resolve the vendor recipient via the 00188 fallback chain:
 * explicit override → vendors.orders_email → contact_info->>'email'.
 * Blank/whitespace values fall through; returns null when nothing usable.
 */
export function resolveVendorRecipient(
  vendor: VendorRecipientSource | null | undefined,
  override?: string | null,
): string | null {
  const overrideEmail = override?.trim();
  if (overrideEmail) return overrideEmail;

  const ordersEmail = vendor?.orders_email?.trim();
  if (ordersEmail) return ordersEmail;

  const contactEmail = vendor?.contact_info?.email;
  if (typeof contactEmail === 'string' && contactEmail.trim()) {
    return contactEmail.trim();
  }

  return null;
}

// ─── Sidemark fallback ───────────────────────────────────────────────────────
//
// Server-side port of the Order Assistant's sidemark generator
// (apps/designer-portal/src/components/portal/procurement/order-assistant/
// sidemark.ts, W3-T3b): `{STUDIO≤3}-{CLIENT-or-PROJECT≤8}`, uppercase,
// non-alphanumerics stripped, empty segments omitted. The room segment is
// intentionally dropped server-side — a PO can span rooms.

function words(input: string): string[] {
  return input.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

function initialsOrPrefix(input: string | null | undefined, max: number): string {
  if (!input) return '';
  const ws = words(input);
  if (ws.length === 0) return '';
  if (ws.length >= 2) {
    return ws
      .slice(0, max)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return ws[0].slice(0, max).toUpperCase();
}

function compactName(input: string | null | undefined, max: number): string {
  if (!input) return '';
  return input.replace(/[^A-Za-z0-9]+/g, '').slice(0, max).toUpperCase();
}

export interface FallbackSidemarkParts {
  studioName?: string | null;
  clientName?: string | null;
  projectName?: string | null;
}

/** Generate the fallback sidemark; '' when no segment has usable input. */
export function buildFallbackSidemark(parts: FallbackSidemarkParts): string {
  const studio = initialsOrPrefix(parts.studioName, 3);
  const middle =
    compactName(parts.clientName, 8) || compactName(parts.projectName, 8);
  return [studio, middle].filter(Boolean).join('-');
}

// ─── Send-time consistency guard (W4-T4) ─────────────────────────────────────
//
// Pre-00186 purchase orders were created with CLIENT-price total_cents, and
// their po_payments schedule was derived from that number. The PO document's
// line table prints TRADE prices, so emailing such a PO would pair a payment
// schedule with a line total it doesn't sum to — an incoherent vendor document
// that indirectly discloses the designer's markup (deposit amounts leak client
// pricing). Item re-pricing after creation drifts the same way. The index
// handler refuses mode 'send' when the sums disagree (422 po_out_of_sync);
// 'preview' (flagged via `warnings`) and 'mark_sent' stay allowed so the
// designer can still inspect the document / record an outside-Patina order.

export interface PoTotalsCoherence {
  poTotalCents: number;
  tradeTotalCents: number;
  paymentsTotalCents: number;
  coherent: boolean;
}

/**
 * Verify the three totals a sendable PO must agree on:
 *
 *   Σ line trade totals (COALESCE(trade, unit, 0) × qty — the sum the PDF
 *   prints)  ===  purchase_orders.total_cents  ===  Σ po_payments.amount_cents
 *
 * Post-00186 POs always cohere (the create RPC derives total_cents and the
 * payment schedule from the trade total). Incoherence flags a pre-00186
 * client-price PO, or one whose linked items were re-priced after creation —
 * equally incoherent to send.
 */
export function checkPoTotalsCoherence(
  poTotalCents: number,
  payments: Array<{ amount_cents: number }>,
  items: Array<{
    trade_price_cents?: number | null;
    unit_price_cents?: number | null;
    quantity?: number | null;
  }>,
): PoTotalsCoherence {
  const paymentsTotalCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const tradeTotalCents = items.reduce(
    (sum, item) =>
      sum +
      (item.trade_price_cents ?? item.unit_price_cents ?? 0) * (item.quantity ?? 1),
    0,
  );
  return {
    poTotalCents,
    tradeTotalCents,
    paymentsTotalCents,
    coherent: tradeTotalCents === poTotalCents && paymentsTotalCents === poTotalCents,
  };
}

/**
 * Human message for the po_out_of_sync 422 — rendered VERBATIM by the portal
 * (poSendErrorMessage in po-send-actions.tsx duplicates this string; keep
 * them in lockstep).
 */
export const PO_OUT_OF_SYNC_DETAIL =
  "This PO's payment schedule no longer matches its item pricing — item prices " +
  'may have changed since creation, or the PO predates trade-cost totals. ' +
  'Recreate the PO or mark it sent manually.';

// ─── Display labels ──────────────────────────────────────────────────────────

/** Human label for a purchase_orders.payment_pattern value. */
export function paymentPatternLabel(pattern: string): string {
  switch (pattern) {
    case 'fifty_fifty':
      return '50% deposit, 50% balance';
    case 'thirty_seventy':
      return '30% deposit, 70% balance';
    case 'full_upfront':
      return '100% up front';
    case 'net_30':
      return 'Net 30';
    case 'custom_milestones':
      return 'Custom milestones';
    default:
      return pattern;
  }
}

/** Human label for a po_payments row: explicit label, else capitalized kind. */
export function paymentRowLabel(payment: {
  kind: string;
  label?: string | null;
}): string {
  const explicit = payment.label?.trim();
  if (explicit) return explicit;
  const kind = payment.kind || 'payment';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

// ─── Vendor-safe spec notes ──────────────────────────────────────────────────

/**
 * Strip internal-only lines from project_ffe_items.notes before printing
 * them on a vendor-facing document. Proposal activation appends the
 * designer's internal_notes with an "Internal: " prefix (see
 * activate_proposal_as_project carry table) — those must never reach the
 * vendor. Returns null when nothing vendor-safe remains.
 */
export function vendorSafeSpecNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const kept = notes
    .split('\n')
    .filter((line) => !/^\s*internal:/i.test(line))
    .join('\n')
    .trim();
  return kept || null;
}
