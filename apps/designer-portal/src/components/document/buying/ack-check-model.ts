/**
 * C-27 (D1-06, d2 §M3): the acknowledgment check's arithmetic. Pure, so the
 * prefill, the agrees / differs word, the signed money delta, the v2 payload
 * and the stamp copy are tested without a render.
 *
 * The comparison mirrors log_po_acknowledgment_v2 (00705), which stays the
 * authority: numbers compare as numbers, text compares trimmed, single-spaced
 * and case-folded (_po_ack_norm), and a PO value that is blank asks for
 * nothing, so nothing can differ from it.
 */

import type {
  AckLineField,
  AckState,
  PoAckBasis,
  PoAckLineRow,
  PoAcknowledgmentLineInput,
  PoAcknowledgmentRequest,
  VendorQuoteWithLines,
} from '@patina/supabase';
import { latestQuoteForLine } from '../line-unfold/quote-model';

/** usePoAckBasis plus the PO's freight estimate. */
export interface AckBasis extends PoAckBasis {
  /** Sum of the PO's freight cost-line estimates; null when it has none. */
  freightCents: number | null;
}

export type AckRowField = Exclude<AckLineField, 'dimensions' | 'other'> | 'ship_date' | 'freight';
type AckRowKind = 'money' | 'count' | 'text' | 'date';

export interface AckRow {
  key: string;
  ffeItemId: string | null;
  field: AckRowField;
  /** The piece's name; null on the PO-level rows (ship date, freight). */
  piece: string | null;
  kind: AckRowKind;
  /** The PO value, in the form the buyer types: dollars, a count, text, a date. */
  ordered: string;
  /** The vendor's quote for the same value, when one exists (C-29). */
  quoted: string | null;
  /** For the money delta: the line's ordered quantity and unit trade price. */
  qty: number;
  unitCents: number | null;
}

const FIELD_WORD: Record<AckRowField, string> = {
  qty: 'qty',
  unit_price: 'price',
  sku: 'SKU',
  finish: 'finish',
  fabric: 'fabric',
  ship_date: 'Ship date',
  freight: 'Freight',
};

const FIELD_KIND: Record<AckRowField, AckRowKind> = {
  qty: 'count',
  unit_price: 'money',
  sku: 'text',
  finish: 'text',
  fabric: 'text',
  ship_date: 'date',
  freight: 'money',
};

export function rowLabel(piece: string | null, field: string): string {
  const word = FIELD_WORD[field as AckRowField] ?? field.replace(/_/g, ' ');
  return piece ? `${piece} · ${word}` : word.charAt(0).toUpperCase() + word.slice(1);
}

const blank = (v: string | null | undefined) => (v ?? '').trim() || null;

/** Cents as the dollars a buyer types ("1920.00"). */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

/** "$1,980.00", "1980", "1,980.5" → cents; anything else → null. */
export function parseMoneyCents(input: string): number | null {
  const v = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

export function parseCount(input: string): number | null {
  const v = input.trim();
  return /^[1-9]\d{0,8}$/.test(v) ? Number(v) : null;
}

export const fmtCents = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });

/** "+$60.00" / "−$60.00". */
export const fmtSignedCents = (cents: number) =>
  `${cents < 0 ? '−' : '+'}${fmtCents(Math.abs(cents))}`;

/**
 * The rows of the check: every value the PO states, pre-filled. THEY
 * CONFIRMED starts as WE ORDERED, so the buyer types only what differs.
 * QUOTED is the line's live quote from this maker (C-29), when there is one.
 */
export function ackRows(basis: AckBasis, quotes: readonly VendorQuoteWithLines[] = []): AckRow[] {
  const rows: AckRow[] = [];
  const itemIds = new Set(basis.lines.map((l) => l.id));
  for (const line of basis.lines) {
    const { spec, product } = line;
    const trade = line.trade_price_cents ?? line.unit_price_cents;
    const qty = line.quantity ?? 1;
    const quote = latestQuoteForLine(quotes, line.id, basis.vendorId);
    const values: Array<[AckRowField, string | null, string | null]> = [
      ['qty', line.quantity != null ? String(line.quantity) : null, null],
      ['unit_price', trade != null ? centsToInput(trade) : null, quote ? centsToInput(quote.unitTradeCents) : null],
      ['sku', blank(spec?.sku) ?? blank(product?.sku), null],
      ['finish', blank(spec?.finish) ?? blank(product?.finish), null],
      ['fabric', blank(spec?.color_fabric), null],
    ];
    for (const [field, ordered, quoted] of values) {
      if (ordered == null) continue;
      rows.push({
        key: `${line.id}:${field}`,
        ffeItemId: line.id,
        field,
        piece: line.name?.trim() || 'Line',
        kind: FIELD_KIND[field],
        ordered,
        quoted,
        qty,
        unitCents: trade ?? null,
      });
    }
  }
  if (basis.requestedShipOn) {
    rows.push(headerRow('ship_date', basis.requestedShipOn.slice(0, 10), null));
  }
  if (basis.freightCents != null) {
    const quote = quotes.find(
      (q) =>
        !q.superseded_by &&
        (!basis.vendorId || q.vendor_id === basis.vendorId) &&
        q.freight_estimate_cents != null &&
        q.vendor_quote_lines?.some((l) => itemIds.has(l.ffe_item_id)),
    );
    rows.push(
      headerRow(
        'freight',
        centsToInput(basis.freightCents),
        quote?.freight_estimate_cents != null ? centsToInput(quote.freight_estimate_cents) : null,
      ),
    );
  }
  return rows;
}

function headerRow(field: 'ship_date' | 'freight', ordered: string, quoted: string | null): AckRow {
  return { key: field, ffeItemId: null, field, piece: null, kind: FIELD_KIND[field], ordered, quoted, qty: 1, unitCents: null };
}

/** The values the form starts with: every PO value. */
export const prefill = (rows: AckRow[]): Record<string, string> =>
  Object.fromEntries(rows.map((r) => [r.key, r.ordered]));

const norm = (v: string | null | undefined) =>
  (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase() || null;

function parsed(row: Pick<AckRow, 'kind'>, value: string): number | string | null {
  if (row.kind === 'money') return parseMoneyCents(value);
  if (row.kind === 'count') return parseCount(value);
  return value.trim() || null;
}

/** A typed value the RPC would refuse (a price that is not money, a count of 0). */
export const isInvalid = (row: AckRow, value: string) =>
  value.trim() !== '' && (row.kind === 'money' || row.kind === 'count') && parsed(row, value) == null;

export type Agreement = 'agrees' | 'differs';

export function rowAgreement(row: AckRow, value: string): Agreement {
  if (!value.trim()) return 'agrees'; // blank sends nothing; the PO stands
  if (row.kind === 'money' || row.kind === 'count') {
    return parsed(row, value) === parsed(row, row.ordered) ? 'agrees' : 'differs';
  }
  return norm(value) === norm(row.ordered) ? 'agrees' : 'differs';
}

/**
 * The signed money the difference moves: price × the ordered quantity, the
 * quantity × the unit price, freight as it stands. Null where it is not money.
 */
export function moneyDelta(
  field: string,
  ordered: string | null,
  confirmed: string | null,
  line: { qty: number; unitCents: number | null },
  units: 'input' | 'stored' = 'input',
): number | null {
  if (ordered == null || confirmed == null) return null;
  const money = (v: string) => (units === 'stored' ? toInt(v) : parseMoneyCents(v));
  if (field === 'unit_price' || field === 'freight') {
    const a = money(ordered);
    const b = money(confirmed);
    if (a == null || b == null || a === b) return null;
    return field === 'unit_price' ? (b - a) * line.qty : b - a;
  }
  if (field === 'qty') {
    const a = toInt(ordered);
    const b = toInt(confirmed);
    if (a == null || b == null || a === b || line.unitCents == null) return null;
    return (b - a) * line.unitCents;
  }
  return null;
}

const toInt = (v: string) => (/^-?\d+$/.test(v.trim()) ? Number(v.trim()) : null);

export const rowDelta = (row: AckRow, value: string) =>
  moneyDelta(row.field, row.ordered, value.trim() || null, row);

/** log_po_acknowledgment_v2's arguments: the header keys and one entry per stated value. */
export function ackPayload(
  rows: AckRow[],
  values: Record<string, string>,
  header: { vendorOrderRef: string; confirmedEta: string },
): { ack: PoAcknowledgmentRequest; lines: PoAcknowledgmentLineInput[] } {
  const ack: PoAcknowledgmentRequest = {};
  if (header.vendorOrderRef.trim()) ack.vendorOrderRef = header.vendorOrderRef.trim();
  if (header.confirmedEta) ack.confirmedEta = header.confirmedEta;
  const lines: PoAcknowledgmentLineInput[] = [];
  for (const row of rows) {
    const value = (values[row.key] ?? '').trim();
    if (!value) continue;
    if (row.field === 'ship_date') ack.shipDate = value;
    else if (row.field === 'freight') ack.freightCents = parseMoneyCents(value) ?? undefined;
    else {
      const v = parsed(row, value);
      if (v == null) continue;
      lines.push({ ffeItemId: row.ffeItemId, field: row.field, ackValue: v });
    }
  }
  return { ack, lines };
}

// ─── The record and its stamp ───────────────────────────────────────────────

const OPEN = new Set(['mismatch', 'disputed']);
export const isOpenLine = (line: Pick<PoAckLineRow, 'verdict'>) => OPEN.has(line.verdict);

/** po_ack_state_for (00705), for one acknowledgment's lines. */
export function ackStateOf(lines: Pick<PoAckLineRow, 'verdict'>[] | null | undefined): AckState {
  if (!lines) return 'none';
  if (lines.some(isOpenLine)) return 'discrepancy';
  if (lines.some((l) => l.verdict === 'accepted' || l.verdict === 'vendor_corrected')) return 'resolved';
  return 'clean';
}

/**
 * The PO stamp. Terracotta while a difference is open; quiet once it agrees
 * or every difference is answered.
 */
export function ackStampCopy(
  state: AckState | string | null | undefined,
  openCount = 0,
): { label: string; differs: boolean } | null {
  if (state === 'discrepancy') {
    const n = Math.max(openCount, 1);
    return { label: `Acknowledged · ${n} difference${n === 1 ? '' : 's'}`, differs: true };
  }
  if (state === 'resolved') return { label: 'Acknowledged · differences resolved', differs: false };
  if (state === 'clean') return { label: 'Acknowledged · everything agreed', differs: false };
  return null;
}

export const VERDICT_WORD: Record<string, string> = {
  match: 'agrees',
  mismatch: 'differs',
  accepted: 'accepted',
  disputed: 'disputed',
  vendor_corrected: 'corrected',
};

/** A stored ack value, for reading: cents as money, a date as typed. */
export function storedDisplay(field: string, value: string | null): string {
  if (value == null || value === '') return '—';
  if ((field === 'unit_price' || field === 'freight') && /^\d+$/.test(value)) {
    return fmtCents(Number(value));
  }
  return value;
}

/** The text after the `change_order_required:` prefix, in plain words. */
export function changeOrderReason(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? '';
  return message.replace(/^change_order_required:\s*/, '').trim();
}
