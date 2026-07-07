// Pure helpers for the quote-request-send edge function (Wave 0B).
//
// Dependency-free + side-effect-free so they unit-test under plain `deno test`
// without booting Deno.serve (index.ts imports this module; index.test.ts
// tests it directly). Mirrors supabase/functions/po-send/lib.ts.

// ─── Payload parsing ─────────────────────────────────────────────────────────

export type QuoteRequestSendMode = 'preview' | 'send';

export interface QuoteRequestSendPayload {
  quoteRequestId: string;
  mode: QuoteRequestSendMode;
  /** Overrides the vendor recipient chain (orders_email → contact_info.email). */
  recipientEmail?: string;
}

const VALID_MODES: ReadonlySet<string> = new Set(['preview', 'send']);

export type ParseResult =
  | { ok: true; payload: QuoteRequestSendPayload }
  | { ok: false; error: string };

/**
 * Validate the request body. Error strings double as the response `error`
 * codes (po-send idiom): 'invalid_body', 'quoteRequestId_required',
 * 'invalid_mode', 'invalid_recipient'. `mode` defaults to 'send'.
 */
export function parseQuoteRequestSendBody(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;

  const quoteRequestId =
    typeof b.quoteRequestId === 'string' ? b.quoteRequestId.trim() : '';
  if (!quoteRequestId) {
    return { ok: false, error: 'quoteRequestId_required' };
  }

  let mode: QuoteRequestSendMode = 'send';
  if (b.mode !== undefined && b.mode !== null) {
    if (typeof b.mode !== 'string' || !VALID_MODES.has(b.mode)) {
      return { ok: false, error: 'invalid_mode' };
    }
    mode = b.mode as QuoteRequestSendMode;
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

  return { ok: true, payload: { quoteRequestId, mode, recipientEmail } };
}

// ─── Recipient resolution ────────────────────────────────────────────────────
//
// Duplicated from po-send/lib.ts on purpose: edge functions are separate deploy
// units (no cross-function import), and the fallback chain
// orders_email → contact_info->>'email' is the vendor-recipient contract shared
// by BOTH senders (00188). Keep the two in lockstep.

export interface VendorRecipientSource {
  orders_email?: string | null;
  contact_info?: Record<string, unknown> | null;
}

/**
 * Resolve the vendor recipient: explicit override → vendors.orders_email →
 * contact_info->>'email'. Blank/whitespace values fall through; returns null
 * when nothing usable remains.
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
