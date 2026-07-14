// Shared PO PDF builder for Supabase Edge Functions (Wave 4, W4-T3).
//
// Renders the outbound purchase-order document with @react-pdf/renderer
// under the Deno edge runtime — approach proven by spike W4-T1
// (docs/handoffs/procurement-wave4-pdf-spike.md, Option A). Version pins,
// React.createElement (edge functions are .ts — no JSX), base-14 Helvetica
// (no Font.register, nothing fetched at render time) all come straight from
// the spike.
//
// Layout ports the portal reference template at
// apps/designer-portal/src/lib/pdf-templates/po-template.tsx
// (header / meta blocks / line table / totals / footer) and extends it with
// the send-flow fields: sidemark, ship-to block, vendor contact, payment
// terms summary, per-line room + spec notes, TRADE pricing. The reference
// template's `background:` style bug is fixed here — react-pdf's prop is
// `backgroundColor` (with `background:` the table-head shading silently
// drops; spike memo "Style gotcha").

import React from 'npm:react@19.1.0';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from 'npm:@react-pdf/renderer@4.3.0';

const h = React.createElement;

// ─── Data contract ───────────────────────────────────────────────────────────

export interface PoPdfPaymentRow {
  /** Human label, e.g. "Deposit", "Balance", or the custom milestone label. */
  label: string;
  amountCents: number;
  /** ISO date (YYYY-MM-DD) or null when the due date is event-driven. */
  dueDate: string | null;
}

export interface PoPdfLine {
  name: string;
  /** Room name, or null when the item has no room assignment. */
  room: string | null;
  quantity: number;
  /** TRADE unit price in cents (COALESCE(trade, unit, 0) — 00186 semantics). */
  unitTradeCents: number;
  lineTotalCents: number;
  /** Vendor-safe spec notes (internal lines already stripped), or null. */
  specNotes: string | null;
  /** FF&E category, e.g. "seating", or null. */
  category: string | null;
}

export interface PoPdfData {
  poNumber: string;
  /** ISO date/timestamp the document is issued. */
  issuedAt: string;
  /** Studio / business name shown as the ordering party. */
  studioName: string;
  /** Optional public studio logo URL (Designer Studios). Rendered small atop the
   *  "From" block; null/undefined → no logo, byte-identical to the pre-logo PDF. */
  studioLogoUrl?: string;
  /** Designer's personal name (may equal studioName). */
  designerName: string;
  designerEmail: string | null;
  vendorName: string;
  /** Address-ish vendor contact lines (email / phone / address / website). */
  vendorContactLines: string[];
  projectName: string;
  sidemark: string | null;
  /** Free-text ship-to block (newlines preserved), or null. */
  shipTo: string | null;
  /** Payment pattern summary, e.g. "50% deposit, 50% balance". */
  paymentPatternLabel: string;
  payments: PoPdfPaymentRow[];
  lines: PoPdfLine[];
  /** TRADE total in cents (Σ line totals). */
  tradeTotalCents: number;
}

// ─── Styles (ported from po-template.tsx + spike) ────────────────────────────

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 10, fontFamily: 'Helvetica', color: '#2C2926' },
  header: { borderBottom: '1pt solid #2C2926', paddingBottom: 16, marginBottom: 24 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: '#5C4A3C' },
  twoCol: { flexDirection: 'row', gap: 32, marginBottom: 24 },
  block: { flex: 1 },
  label: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#5C4A3C',
    marginBottom: 4,
  },
  // Studio logo (Designer Studios) — small, atop the "From" block. Height-capped
  // so a tall logo can't blow out the row; width scales to the intrinsic ratio.
  fromLogo: { height: 24, marginBottom: 6, objectFit: 'contain' },
  value: { fontSize: 11 },
  valueSmall: { fontSize: 9, color: '#3D3A36', marginTop: 2 },
  table: { border: '1pt solid #E5E2DD', borderRadius: 2 },
  // The portal template wrote `background:` here — react-pdf only honors
  // `backgroundColor` (spike memo gotcha), so the port fixes it.
  tableHead: { flexDirection: 'row', backgroundColor: '#E5E2DD', padding: 8 },
  tableRow: { flexDirection: 'row', padding: 8, borderTop: '1pt solid #E5E2DD' },
  cellItem: { flex: 4 },
  cellRoom: { flex: 2 },
  cellQty: { flex: 1, textAlign: 'right' },
  cellUnit: { flex: 2, textAlign: 'right' },
  cellTotal: { flex: 2, textAlign: 'right', fontWeight: 700 },
  specNotes: { fontSize: 8, color: '#5C4A3C', marginTop: 2 },
  payTable: { border: '1pt solid #E5E2DD', borderRadius: 2, marginBottom: 24 },
  payRow: { flexDirection: 'row', padding: 6, borderTop: '1pt solid #E5E2DD' },
  payHead: { flexDirection: 'row', backgroundColor: '#E5E2DD', padding: 6 },
  payLabel: { flex: 3 },
  payDue: { flex: 2 },
  payAmount: { flex: 2, textAlign: 'right' },
  totals: { marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBlock: { width: 220 },
  totalsTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTop: '1pt solid #2C2926',
    fontWeight: 700,
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 56,
    right: 56,
    textAlign: 'center',
    fontSize: 8,
    color: '#5C4A3C',
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(value: string): string {
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

// ─── Document tree ───────────────────────────────────────────────────────────

function PoDocument(data: PoPdfData) {
  const metaBits = [data.poNumber, `Issued ${fmtDate(data.issuedAt)}`];
  if (data.sidemark) metaBits.push(`Sidemark: ${data.sidemark}`);

  return h(
    Document,
    null,
    h(
      Page,
      { size: 'LETTER', style: styles.page },
      // Header
      h(
        View,
        { style: styles.header },
        h(Text, { style: styles.title }, 'Purchase Order'),
        h(Text, { style: styles.meta }, metaBits.join(' · '))
      ),
      // From / Vendor / Ship To
      h(
        View,
        { style: styles.twoCol },
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'From'),
          data.studioLogoUrl
            ? h(Image, { style: styles.fromLogo, src: data.studioLogoUrl })
            : null,
          h(Text, { style: styles.value }, data.studioName),
          data.designerName && data.designerName !== data.studioName
            ? h(Text, { style: styles.valueSmall }, data.designerName)
            : null,
          data.designerEmail
            ? h(Text, { style: styles.valueSmall }, data.designerEmail)
            : null
        ),
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Vendor'),
          h(Text, { style: styles.value }, data.vendorName),
          ...data.vendorContactLines.map((line, idx) =>
            h(Text, { key: idx, style: styles.valueSmall }, line)
          )
        ),
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Ship To'),
          h(Text, { style: styles.value }, data.shipTo || '-')
        )
      ),
      // Project / Payment terms
      h(
        View,
        { style: styles.twoCol },
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Project'),
          h(Text, { style: styles.value }, data.projectName)
        ),
        h(
          View,
          { style: styles.block },
          h(Text, { style: styles.label }, 'Payment Terms'),
          h(Text, { style: styles.value }, data.paymentPatternLabel)
        )
      ),
      // Payment schedule
      data.payments.length > 0
        ? h(
            View,
            { style: styles.payTable },
            h(
              View,
              { style: styles.payHead },
              h(Text, { style: [styles.payLabel, styles.label] }, 'Payment'),
              h(Text, { style: [styles.payDue, styles.label] }, 'Due'),
              h(Text, { style: [styles.payAmount, styles.label] }, 'Amount')
            ),
            ...data.payments.map((p, idx) =>
              h(
                View,
                { key: idx, style: styles.payRow },
                h(Text, { style: styles.payLabel }, p.label),
                h(Text, { style: styles.payDue }, p.dueDate ? fmtDate(p.dueDate) : '-'),
                h(Text, { style: styles.payAmount }, fmt(p.amountCents))
              )
            )
          )
        : null,
      // Line table (TRADE pricing)
      h(
        View,
        { style: styles.table },
        h(
          View,
          { style: styles.tableHead },
          h(Text, { style: [styles.cellItem, styles.label] }, 'Item'),
          h(Text, { style: [styles.cellRoom, styles.label] }, 'Room'),
          h(Text, { style: [styles.cellQty, styles.label] }, 'Qty'),
          h(Text, { style: [styles.cellUnit, styles.label] }, 'Unit (Trade)'),
          h(Text, { style: [styles.cellTotal, styles.label] }, 'Total')
        ),
        ...data.lines.map((line, idx) => {
          const spec = [line.category, line.specNotes].filter(Boolean).join(' · ');
          return h(
            View,
            { key: idx, style: styles.tableRow },
            h(
              View,
              { style: styles.cellItem },
              h(Text, null, line.name),
              spec ? h(Text, { style: styles.specNotes }, spec) : null
            ),
            h(Text, { style: styles.cellRoom }, line.room ?? '-'),
            h(Text, { style: styles.cellQty }, String(line.quantity)),
            h(Text, { style: styles.cellUnit }, fmt(line.unitTradeCents)),
            h(Text, { style: styles.cellTotal }, fmt(line.lineTotalCents))
          );
        })
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
            { style: styles.totalsTotal },
            h(Text, null, 'Trade Total'),
            h(Text, null, fmt(data.tradeTotalCents))
          )
        )
      ),
      // Footer
      h(Text, { style: styles.footer }, 'Generated by Patina · patina.cloud')
    )
  );
}

/**
 * Render the PO document to PDF bytes. `renderToBuffer` returns a Node
 * Buffer under Deno npm-compat; wrap as Uint8Array so callers can hand it
 * to `Response`, `storage.upload`, or base64-encode it for an email
 * attachment (spike memo "API shape").
 */
export async function buildPoPdf(data: PoPdfData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(PoDocument(data));
  return new Uint8Array(buffer);
}
