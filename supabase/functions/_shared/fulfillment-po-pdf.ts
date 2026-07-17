// Shared Back-of-House PO PDF builder (S3, spec §5.3). PATTERN-COPIED from
// _shared/po-pdf.ts (the proven procurement-Wave-4 react-pdf-under-Deno path) —
// NEVER edit that file; this is the fulfillment-domain sibling. Renders the
// "paper the PO will become" the composer previews and the vendor receives:
// Patina masthead, PO number, side-mark, ship-to, requested ship date,
// blind-ship instruction, the vendor's change-window + claims terms, and the
// qty/cost line table.
//
// Fonts (S3 Task-1 spike, OUTCOME A): Playfair Display masthead + DM Mono PO
// number / line table, embedded via _shared/fulfillment-fonts.ts (base64 data
// URLs → real FontFile2 embedding, nothing fetched at render). Body/labels stay
// base-14 Helvetica. React.createElement (edge fns are .ts — no JSX). Version
// pins match po-pdf.ts.

import React from 'npm:react@19.1.0';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from 'npm:@react-pdf/renderer@4.3.0';
import { registerFulfillmentFonts } from './fulfillment-fonts.ts';

const h = React.createElement;

// ─── Data contract ───────────────────────────────────────────────────────────

export interface FulfillmentPoPdfLine {
  /** Vendor-facing line number (plain digits — DM Mono has no circled-digit
   *  glyphs, and the vendor PO doesn't need the Workbench's ①… thread). */
  lineLabel: string;
  vendorSku: string | null;
  description: string;
  qty: number;
  /** TRADE unit cost in cents (what Patina pays the vendor). */
  unitCostCents: number;
  lineTotalCents: number;
}

export interface FulfillmentPoPdfData {
  poNumber: string;
  /** ISO date/timestamp the document is issued. */
  issuedAt: string;
  /** Blind-ship carton mark ({SURNAME}-{orderNo}); never the full client name. */
  sideMark: string | null;
  vendorName: string;
  /** Address-ish vendor contact lines (email / phone / address), or empty. */
  vendorContactLines: string[];
  /** Free-text ship-to block (newlines preserved), or null. */
  shipTo: string | null;
  /** Requested ship date — ISO (YYYY-MM-DD) or null. */
  requestedShip: string | null;
  /** When true the vendor ships in unbranded/neutral packaging (R1.6). */
  blindShip: boolean;
  /** Human payment-terms label, e.g. "Net 30". */
  paymentTermsLabel: string | null;
  /** Vendor change window in days (vendor_profiles.change_window_days), or null. */
  changeWindowDays: number | null;
  /** Vendor claims window in days (vendor_profiles.claims_window_days), or null. */
  claimsWindowDays: number | null;
  lines: FulfillmentPoPdfLine[];
  /** Σ line totals — the PO's trade cost. */
  productCostCents: number;
}

// ─── Styles (ported from po-template.tsx / po-pdf.ts + the §5.3 presentation) ─

const INK = '#2C2926';
const MOCHA = '#6B5D52';
const OAK = '#9A8B7A';
const RULE_SOFT = '#EFEBE4';
const PEARL = '#E7E3DC';
const PAPER = '#FFFDF9';

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: INK, backgroundColor: PAPER },
  // Masthead: serif wordmark left, mono PO number right, 2pt ink rule below.
  mast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottom: `2pt solid ${INK}`,
    paddingBottom: 12,
    marginBottom: 20,
  },
  wordmark: { fontFamily: 'Playfair Display', fontWeight: 500, fontSize: 22, color: INK },
  poNo: { fontFamily: 'DM Mono', fontSize: 11, letterSpacing: 1, color: INK },
  twoCol: { flexDirection: 'row', gap: 28, marginBottom: 18 },
  block: { flex: 1 },
  label: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, color: OAK, marginBottom: 3 },
  value: { fontSize: 10.5, color: INK },
  valueMono: { fontFamily: 'DM Mono', fontSize: 10.5, color: INK },
  valueSmall: { fontSize: 9, color: MOCHA, marginTop: 2 },
  instruction: {
    fontSize: 9,
    color: MOCHA,
    marginBottom: 18,
    paddingVertical: 6,
    borderTop: `1pt solid ${RULE_SOFT}`,
    borderBottom: `1pt solid ${RULE_SOFT}`,
  },
  // Line table — DM Mono per the presentation's pogrid.
  table: { marginBottom: 16 },
  tableHead: {
    flexDirection: 'row',
    borderBottom: `1pt solid ${INK}`,
    paddingBottom: 4,
    marginBottom: 2,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 5, borderBottom: `1pt solid ${RULE_SOFT}` },
  headCell: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: OAK },
  cellLine: { width: 24, fontFamily: 'DM Mono', fontSize: 11 },
  cellSku: { flex: 2, fontFamily: 'DM Mono', fontSize: 10 },
  cellDesc: { flex: 5, fontFamily: 'DM Mono', fontSize: 10 },
  cellQty: { flex: 1, textAlign: 'right', fontFamily: 'DM Mono', fontSize: 10 },
  cellCost: { flex: 2, textAlign: 'right', fontFamily: 'DM Mono', fontSize: 10 },
  totals: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  totalsBlock: { width: 220 },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTop: `1pt solid ${INK}`,
  },
  totalsLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: MOCHA },
  totalsValue: { fontFamily: 'DM Mono', fontSize: 12, color: INK },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    textAlign: 'center',
    fontSize: 8,
    color: OAK,
    borderTop: `1pt solid ${PEARL}`,
    paddingTop: 8,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isBareDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(isBareDate ? { timeZone: 'UTC' } : {}),
  });
}

/** Vendor change/claims terms → a single vendor-facing sentence for the terms
 *  block. Both windows are optional; the sentence adapts to what's present. */
export function formatTermsLine(data: FulfillmentPoPdfData): string {
  const bits: string[] = [];
  if (data.paymentTermsLabel) bits.push(data.paymentTermsLabel);
  bits.push(
    data.changeWindowDays != null
      ? `Changes accepted within ${data.changeWindowDays} day${data.changeWindowDays === 1 ? '' : 's'} of this PO`
      : 'Changes accepted until production start',
  );
  bits.push(
    data.claimsWindowDays != null
      ? `Damage/shortage claims within ${data.claimsWindowDays} day${data.claimsWindowDays === 1 ? '' : 's'} of delivery`
      : 'Damage/shortage claims per standard terms',
  );
  return bits.join(' · ');
}

/** Blind-ship instruction sentence, or the plain packing-slip note otherwise. */
export function formatInstruction(blindShip: boolean): string {
  return blindShip
    ? 'Blind ship · include the Patina packing slip only — no vendor branding, invoices, or pricing in the carton.'
    : 'Include the Patina packing slip with the shipment.';
}

// ─── Document tree ───────────────────────────────────────────────────────────

function PoDocument(data: FulfillmentPoPdfData) {
  return h(
    Document,
    null,
    h(
      Page,
      { size: 'LETTER', style: styles.page },
      // Masthead
      h(
        View,
        { style: styles.mast },
        h(Text, { style: styles.wordmark }, 'Patina'),
        h(Text, { style: styles.poNo }, `PURCHASE ORDER · ${data.poNumber}`),
      ),
      // Vendor / Ship To
      h(
        View,
        { style: styles.twoCol },
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Vendor'),
          h(Text, { style: styles.value }, data.vendorName),
          ...data.vendorContactLines.map((line, i) =>
            h(Text, { key: i, style: styles.valueSmall }, line),
          ),
        ),
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Ship To'),
          h(Text, { style: styles.value }, data.shipTo || '—'),
        ),
      ),
      // Side-mark / Requested ship / Payment terms
      h(
        View,
        { style: styles.twoCol },
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Side-mark'),
          h(Text, { style: styles.valueMono }, data.sideMark || '—'),
        ),
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Requested Ship'),
          h(Text, { style: styles.value }, fmtDate(data.requestedShip)),
        ),
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Terms'),
          h(Text, { style: styles.value }, data.paymentTermsLabel || 'Per agreement'),
        ),
      ),
      // Terms sentence (change window + claims)
      h(
        View,
        { style: styles.block },
        h(Text, { style: styles.label }, 'Change & Claims'),
        h(Text, { style: [styles.valueSmall, { marginTop: 0, marginBottom: 12 }] }, formatTermsLine(data)),
      ),
      // Instructions (blind ship)
      h(Text, { style: styles.instruction }, formatInstruction(data.blindShip)),
      // Line table
      h(
        View,
        { style: styles.table },
        h(
          View,
          { style: styles.tableHead },
          h(Text, { style: [styles.cellLine, styles.headCell] }, 'Line'),
          h(Text, { style: [styles.cellSku, styles.headCell] }, 'Vendor SKU'),
          h(Text, { style: [styles.cellDesc, styles.headCell] }, 'Description'),
          h(Text, { style: [styles.cellQty, styles.headCell] }, 'Qty'),
          h(Text, { style: [styles.cellCost, styles.headCell] }, 'Cost'),
        ),
        ...data.lines.map((line, i) =>
          h(
            View,
            { key: i, style: styles.tableRow },
            h(Text, { style: styles.cellLine }, line.lineLabel),
            h(Text, { style: styles.cellSku }, line.vendorSku || '—'),
            h(Text, { style: styles.cellDesc }, line.description),
            h(Text, { style: styles.cellQty }, String(line.qty)),
            h(Text, { style: styles.cellCost }, fmt(line.lineTotalCents)),
          ),
        ),
      ),
      // Totals
      h(
        View,
        { style: styles.totals },
        h(
          View,
          { style: styles.totalsBlock },
          h(
            View,
            { style: styles.totalsRow },
            h(Text, { style: styles.totalsLabel }, 'PO Total (Trade)'),
            h(Text, { style: styles.totalsValue }, fmt(data.productCostCents)),
          ),
        ),
      ),
      // Footer
      h(
        Text,
        { style: styles.footer },
        `Patina · patina.cloud · ${data.poNumber} · issued ${fmtDate(data.issuedAt)}`,
      ),
    ),
  );
}

/**
 * Render the fulfillment PO document to PDF bytes. Registers the brand fonts
 * (idempotent) then `renderToBuffer` (a Node Buffer under Deno npm-compat,
 * wrapped as Uint8Array so callers can hand it to `Response`, `storage.upload`,
 * or base64-encode it for an email attachment).
 */
export async function buildFulfillmentPoPdf(data: FulfillmentPoPdfData): Promise<Uint8Array> {
  registerFulfillmentFonts();
  const buffer = await renderToBuffer(PoDocument(data));
  return new Uint8Array(buffer);
}
