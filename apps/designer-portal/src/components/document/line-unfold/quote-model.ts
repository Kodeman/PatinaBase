/**
 * C-29 (d2 §M2): vendor quotes — the pure pieces the Quote cell, the record
 * sheet and the order paper share (the request's body is quote-request.ts). The studio
 * enters every quote (R-PB8). R6 is open, so a quote's valid-until is a date
 * and nothing more: no age glyph, no threshold.
 */

import {
  isChangeOrderRequired,
  type PaymentPattern,
  type VendorQuoteRequest,
  type VendorQuoteWithLines,
} from '@patina/supabase';
import { fmtDay, fmtUsd } from '@/lib/document/format';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// ─── Recording a quote ──────────────────────────────────────────────────────

export interface QuoteLineCandidate {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  quantity: number | null;
}

export interface RecordQuoteLineForm {
  ffeItemId: string;
  include: boolean;
  /** Dollars as typed. */
  unitTrade: string;
  /** Whole weeks as typed. */
  leadTimeWeeks: string;
  qty: number | null;
}

export interface RecordQuoteForm {
  vendorId: string;
  projectId: string;
  quoteRef: string;
  validUntil: string;
  /** Dollars as typed. */
  crating: string;
  freightEstimate: string;
  paymentPattern: PaymentPattern | '';
  documentPath: string | null;
  supersedesQuoteId: string | null;
  lines: readonly RecordQuoteLineForm[];
}

/** '' → null; a dollar amount → whole cents; anything else → undefined. */
export function dollarsToCents(input: string): number | null | undefined {
  const s = input.replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return undefined;
  return Math.round(Number(s) * 100);
}

function wholeWeeks(input: string): number | null | undefined {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n <= 260 ? n : undefined;
}

export type BuiltQuote = { ok: true; request: VendorQuoteRequest } | { ok: false; reason: string };

/** record_vendor_quote's p_request, or the one thing the form still needs. */
export function buildRecordQuoteRequest(form: RecordQuoteForm): BuiltQuote {
  const lines: NonNullable<VendorQuoteRequest['lines']> = [];
  for (const line of form.lines) {
    if (!line.include) continue;
    const unit = dollarsToCents(line.unitTrade);
    if (unit == null) return { ok: false, reason: 'Each chosen line needs its unit trade price.' };
    const weeks = wholeWeeks(line.leadTimeWeeks);
    if (weeks === undefined) return { ok: false, reason: 'Lead time is whole weeks, up to 260.' };
    lines.push({
      ffeItemId: line.ffeItemId,
      unitTradeCents: unit,
      ...(line.qty != null ? { qty: line.qty } : {}),
      ...(weeks != null ? { leadTimeWeeks: weeks } : {}),
    });
  }
  if (lines.length === 0) return { ok: false, reason: 'Choose a line and give its price.' };
  const crating = dollarsToCents(form.crating);
  const freight = dollarsToCents(form.freightEstimate);
  if (crating === undefined || freight === undefined) {
    return { ok: false, reason: 'Crating and freight are dollar amounts.' };
  }
  const validUntil = form.validUntil.trim();
  if (validUntil && !YMD.test(validUntil)) return { ok: false, reason: 'Good through is a date.' };
  const request: VendorQuoteRequest = {
    vendorId: form.vendorId,
    projectId: form.projectId,
    lines,
  };
  if (form.quoteRef.trim()) request.quoteRef = form.quoteRef.trim();
  if (validUntil) request.validUntil = validUntil;
  if (crating != null) request.cratingCents = crating;
  if (freight != null) request.freightEstimateCents = freight;
  if (form.paymentPattern) request.paymentPattern = form.paymentPattern;
  if (form.documentPath) request.documentPath = form.documentPath;
  if (form.supersedesQuoteId) request.supersedesQuoteId = form.supersedesQuoteId;
  return { ok: true, request };
}

// ─── Reading a quote on a line ──────────────────────────────────────────────

export interface LineQuote {
  quoteId: string;
  vendorId: string;
  quoteRef: string | null;
  validUntil: string | null;
  unitTradeCents: number;
  leadTimeWeeks: number | null;
  appliedAt: string | null;
}

/**
 * The live quote for a line: the newest one (useVendorQuotes reads newest
 * first) that is not superseded and prices this line, from this maker when one
 * is named.
 */
export function latestQuoteForLine(
  quotes: readonly VendorQuoteWithLines[] | null | undefined,
  ffeItemId: string,
  vendorId?: string | null,
): LineQuote | null {
  for (const quote of quotes ?? []) {
    if (quote.superseded_by) continue;
    if (vendorId && quote.vendor_id !== vendorId) continue;
    const line = (quote.vendor_quote_lines ?? []).find((l) => l.ffe_item_id === ffeItemId);
    if (!line) continue;
    return {
      quoteId: quote.id,
      vendorId: quote.vendor_id,
      quoteRef: quote.quote_ref,
      validUntil: quote.valid_until,
      unitTradeCents: line.unit_trade_cents,
      leadTimeWeeks: line.lead_time_weeks,
      appliedAt: line.applied_at,
    };
  }
  return null;
}

/** "quoted $1,840 · good through 30 October · Hewn ref Q-2291" — dates only (R6). */
export function quoteSentence(quote: LineQuote, vendorName?: string | null): string {
  const ref = quote.quoteRef?.trim();
  return [
    `quoted ${fmtUsd(quote.unitTradeCents)}`,
    quote.validUntil ? `good through ${fmtDay(quote.validUntil)}` : null,
    ref ? `${vendorName ? `${vendorName} ` : ''}ref ${ref}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ─── Using the quoted price ─────────────────────────────────────────────────

/** apply_vendor_quote_to_lines for one line: trade only, never the client price. */
export function applyQuoteArgs(quote: Pick<LineQuote, 'quoteId'>, ffeItemId: string, projectId: string) {
  return { quoteId: quote.quoteId, ffeItemIds: [ffeItemId], projectId };
}

export type ApplyRefusal =
  /** Signed or executed: the client re-approves the price as a change order. */
  | { route: 'change_order'; sentence: string }
  /** Sent, not yet signed: void & supersede the authorization to edit. */
  | { route: 'void_authorization'; sentence: string }
  | { route: 'error'; sentence: string };

/** Where a refused apply goes. A change_order_required refusal is routed, never retried. */
export function applyRefusal(error: unknown): ApplyRefusal {
  if (isChangeOrderRequired(error)) {
    const message = String((error as { message?: unknown }).message ?? '');
    if (/sits on an? sent authorization/.test(message)) {
      return {
        route: 'void_authorization',
        sentence:
          'This line is on an authorization that is with the client. Void & supersede it to use this price.',
      };
    }
    return {
      route: 'change_order',
      sentence:
        'The client signed for this line, so a new price is a change order they approve first.',
    };
  }
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && /is on a purchase order/.test(message)) {
    return { route: 'error', sentence: 'This line is on a purchase order — change the price there.' };
  }
  if (typeof message === 'string' && /superseded/.test(message)) {
    return { route: 'error', sentence: 'A newer quote replaced this one.' };
  }
  return { route: 'error', sentence: 'The quoted price could not be used.' };
}

/** The amendment sheet is the change order (R8/R81); the account band owns it. */
export function openChangeOrder() {
  window.dispatchEvent(new CustomEvent('document:compose-amendment'));
}
