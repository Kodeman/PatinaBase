/**
 * Trade RFQ guest page — token format gate + the narrow DTO
 * resolve_trade_rfq_link() (Trade Scope RFQ dispatch, Phase 2) returns.
 *
 * mint_trade_rfq_token mints the raw token the same way document_shares and
 * field_link_tokens do: 32 random bytes → 64-char lowercase hex, hashed at
 * rest. The shape is identical to a field or share token, but this is its own
 * distinct guest surface — a separate literal here rather than an import
 * under a name that would blur which credential it gates.
 */

export const TRADE_RFQ_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Cheap format gate — rejects an obviously malformed token before any DB round-trip. */
export function isLikelyTradeRfqToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && TRADE_RFQ_TOKEN_PATTERN.test(token);
}

export type TradeRfqLinkStatus = 'draft' | 'sent' | 'responded' | 'closed';

export interface TradeRfqLinkSection {
  roomName: string | null;
  prose: string;
}

export interface TradeRfqLinkRfq {
  id: string;
  status: TradeRfqLinkStatus;
  respondedAt: string | null;
}

export interface TradeRfqLinkExistingResponse {
  amountCents: number;
  note: string | null;
  respondedAt: string | null;
}

/**
 * The exact narrow JSONB DTO resolve_trade_rfq_link() returns. No scope
 * price, no other bids, no client identity — that is the RPC's own contract,
 * and this page renders exactly these keys and nothing handed to it beyond
 * them (see page.test.tsx's DTO-carried-extra-fields assertion).
 */
export interface TradeRfqLinkDTO {
  studioName: string | null;
  scopeTitle: string | null;
  partyDisplayName: string | null;
  sections: TradeRfqLinkSection[];
  timeline: string | null;
  message: string | null;
  rfq: TradeRfqLinkRfq;
  existingResponse: TradeRfqLinkExistingResponse | null;
}

/** Short "Jul 9, 2026" label; null when unset/unparsable. */
export function formatLongDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "$4,150" — whole dollars, matching the designer-side ledger's money(). */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
