/**
 * SPIKE W4-T1 — can a Supabase Deno edge function render a PO PDF?
 *
 * Option A probe: @react-pdf/renderer via npm: specifier, no JSX
 * (React.createElement only — edge functions are .ts).
 *
 * Approximates the real PO doc at
 * apps/designer-portal/src/lib/pdf-templates/po-template.tsx:
 * header line, 3-row item table (name/qty/amount), totals line.
 *
 * GET/POST → application/pdf bytes. `x-render-ms` header carries the
 * in-worker render time. See docs/handoffs/procurement-wave4-pdf-spike.md
 * for the decision memo.
 *
 * NOT product code — throwaway proof for the Wave 4 po-send design.
 */
import React from 'npm:react@19.1.0';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from 'npm:@react-pdf/renderer@4.3.0';

const h = React.createElement;

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 10, fontFamily: 'Helvetica', color: '#2C2926' },
  header: { borderBottom: '1pt solid #2C2926', paddingBottom: 16, marginBottom: 24 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: '#5C4A3C' },
  label: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#5C4A3C',
  },
  table: { border: '1pt solid #E5E2DD', borderRadius: 2 },
  tableHead: { flexDirection: 'row', backgroundColor: '#E5E2DD', padding: 8 },
  tableRow: { flexDirection: 'row', padding: 8, borderTop: '1pt solid #E5E2DD' },
  cellName: { flex: 3 },
  cellQty: { flex: 1, textAlign: 'right' },
  cellAmount: { flex: 1, textAlign: 'right' },
  totals: { marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsRow: {
    width: 200,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTop: '1pt solid #2C2926',
    fontWeight: 700,
  },
});

interface SpikeLine {
  name: string;
  quantity: number;
  amountCents: number;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function SpikePO(props: { poNumber: string; lines: SpikeLine[] }) {
  const total = props.lines.reduce((sum, l) => sum + l.amountCents, 0);

  return h(
    Document,
    null,
    h(
      Page,
      { size: 'LETTER', style: styles.page },
      // Header line
      h(
        View,
        { style: styles.header },
        h(Text, { style: styles.title }, 'Purchase Order'),
        h(Text, { style: styles.meta }, `${props.poNumber} · edge-runtime spike`)
      ),
      // 3-row item table
      h(
        View,
        { style: styles.table },
        h(
          View,
          { style: styles.tableHead },
          h(Text, { style: [styles.cellName, styles.label] }, 'Item'),
          h(Text, { style: [styles.cellQty, styles.label] }, 'Qty'),
          h(Text, { style: [styles.cellAmount, styles.label] }, 'Amount')
        ),
        ...props.lines.map((line, idx) =>
          h(
            View,
            { key: idx, style: styles.tableRow },
            h(Text, { style: styles.cellName }, line.name),
            h(Text, { style: styles.cellQty }, String(line.quantity)),
            h(Text, { style: styles.cellAmount }, fmt(line.amountCents))
          )
        )
      ),
      // Totals line
      h(
        View,
        { style: styles.totals },
        h(
          View,
          { style: styles.totalsRow },
          h(Text, null, 'Total Due'),
          h(Text, null, fmt(total))
        )
      )
    )
  );
}

Deno.serve(async (_req: Request) => {
  const started = performance.now();
  try {
    const buffer = await renderToBuffer(
      SpikePO({
        poNumber: 'PO-2026-SPIKE',
        lines: [
          { name: 'Walnut credenza, custom stain', quantity: 1, amountCents: 412500 },
          { name: 'Bouclé lounge chair', quantity: 2, amountCents: 376000 },
          { name: 'Hand-knotted wool rug 9x12', quantity: 1, amountCents: 289900 },
        ],
      })
    );
    const renderMs = Math.round(performance.now() - started);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="po-spike.pdf"',
        'x-render-ms': String(renderMs),
      },
    });
  } catch (err) {
    console.error('[po-pdf-spike] render failed', err);
    return new Response(
      JSON.stringify({
        error: 'render_failed',
        message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
