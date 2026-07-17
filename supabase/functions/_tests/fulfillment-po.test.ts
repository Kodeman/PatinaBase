// Deno tests for the BOH PO Composer engine (S3, spec §5.3).
//   • buildFulfillmentPoPdf renders a valid PDF that EMBEDS the brand fonts
//     (FontFile2 / PlayfairDisplay / DMMono) — the Task-1 spike posture, not a
//     Helvetica fallback. (react-pdf Flate-compresses content streams, so the
//     rendered text isn't raw-greppable — we assert the building blocks + the
//     embedded-font descriptors instead.)
//   • the pure building blocks (buildPoPdfData / formatTermsLine /
//     formatInstruction / paymentTermsLabel / formatShipTo) produce the masthead
//     PO number, side-mark, and terms strings the paper shows.
//   • runFulfillmentPo writes exactly one po.transmitted log line per mode
//     (email → record_transmission w/ the Resend id; portal/csv → w/ the
//     operator reference) and the dry-run email path is exercised for `send`.
//
// Run: deno test --no-check -A --node-modules-dir=auto supabase/functions/_tests/fulfillment-po.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildFulfillmentPoPdf,
  formatTermsLine,
  formatInstruction,
  type FulfillmentPoPdfData,
} from '../_shared/fulfillment-po-pdf.ts';
import {
  buildPoPdfData,
  paymentTermsLabel,
  formatShipTo,
  runFulfillmentPo,
  type PoContext,
  type FulfillmentPoDeps,
} from '../fulfillment-po/core.ts';
import type { ComplianceSendResult } from '../_shared/send-email.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_CTX: PoContext = {
  poId: 'po-1',
  poNumber: 'PO-2026-00001-A',
  orderNo: 1,
  clientName: 'Priya Anand',
  vendorId: 'v-1',
  vendorName: 'Room & Board',
  vendorContactLines: ['po@roomandboard.example', '800-301-9720'],
  shipTo: { line1: '412 Sycamore Ln', city: 'Austin', state: 'TX', postal_code: '78704' },
  requestedShip: null,
  sideMark: 'ANAND-1',
  terms: 'net_30',
  productCostCents: 273000,
  transmissionType: 'email',
  poEmail: 'po@roomandboard.example',
  portalUrl: null,
  csvColumnSpec: null,
  blindShip: true,
  changeWindowDays: 3,
  claimsWindowDays: 14,
  paymentTerms: 'net_30',
  leadTimeDays: 21,
  lines: [
    {
      lineLabel: '1',
      vendorSku: 'DW-CR72',
      description: 'Heirloom Oak Dining Table',
      qty: 1,
      unitCostCents: 273000,
      lineTotalCents: 273000,
    },
  ],
};

function pdfData(): FulfillmentPoPdfData {
  return buildPoPdfData(SAMPLE_CTX, '2026-07-17T12:00:00Z');
}

// ─── Building blocks ─────────────────────────────────────────────────────────

Deno.test('paymentTermsLabel maps the coded terms', () => {
  assertEquals(paymentTermsLabel('net_30'), 'Net 30');
  assertEquals(paymentTermsLabel('fifty_fifty'), '50% deposit, 50% balance');
  assertEquals(paymentTermsLabel('prepay'), 'Prepay');
  assertEquals(paymentTermsLabel(null), null);
});

Deno.test('formatShipTo builds a two-line block', () => {
  assertEquals(formatShipTo(SAMPLE_CTX.shipTo), '412 Sycamore Ln\nAustin, TX 78704');
  assertEquals(formatShipTo(null), null);
});

Deno.test('buildPoPdfData carries the masthead PO number, side-mark, terms + derived requested ship', () => {
  const d = pdfData();
  assertEquals(d.poNumber, 'PO-2026-00001-A');
  assertEquals(d.sideMark, 'ANAND-1');
  assertEquals(d.paymentTermsLabel, 'Net 30');
  assertEquals(d.blindShip, true);
  // requestedShip derived from lead_time_days (21) added to issuedAt.
  assertEquals(d.requestedShip, '2026-08-07');
  assertEquals(d.productCostCents, 273000);
});

Deno.test('formatTermsLine composes the change-window + claims sentence', () => {
  const line = formatTermsLine(pdfData());
  assert(line.includes('Net 30'), line);
  assert(line.includes('Changes accepted within 3 days of this PO'), line);
  assert(line.includes('Damage/shortage claims within 14 days of delivery'), line);
});

Deno.test('formatInstruction switches on blind ship', () => {
  assert(formatInstruction(true).startsWith('Blind ship'));
  assert(formatInstruction(false).startsWith('Include the Patina packing slip'));
});

Deno.test('buildFulfillmentPoPdf renders a valid PDF that EMBEDS the brand fonts', async () => {
  const bytes = await buildFulfillmentPoPdf(pdfData());
  assert(bytes.length > 3000, `PDF too small: ${bytes.length}`);
  const s = new TextDecoder('latin1').decode(bytes);
  assert(s.startsWith('%PDF-'), 'not a PDF');
  assert(s.includes('FontFile2'), 'brand TTF not embedded (FontFile2 missing)');
  assert(s.includes('PlayfairDisplay'), 'Playfair Display not embedded');
  assert(s.includes('DMMono'), 'DM Mono not embedded');
});

// ─── runFulfillmentPo — one log line per mode + dry-run email ─────────────────

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function fakeDeps() {
  const rpcCalls: RpcCall[] = [];
  const uploads: string[] = [];
  let emailSends = 0;
  let lastEmailFrom: string | undefined;

  const tables: Record<string, unknown> = {
    fulfillment_vendor_pos: {
      id: SAMPLE_CTX.poId,
      order_id: 'o-1',
      vendor_id: SAMPLE_CTX.vendorId,
      po_number: SAMPLE_CTX.poNumber,
      status: 'draft',
      terms: 'net_30',
      side_mark: SAMPLE_CTX.sideMark,
      requested_ship: null,
      product_cost_cents: SAMPLE_CTX.productCostCents,
      pdf_r2_key: null,
    },
    fulfillment_orders: {
      order_no: 1,
      client_name: SAMPLE_CTX.clientName,
      ship_to: SAMPLE_CTX.shipTo,
    },
    vendors: { name: SAMPLE_CTX.vendorName, contact_info: { phone: '800-301-9720' }, website: null, orders_email: 'orders@rb.example' },
    vendor_profiles: {
      transmission_type: 'email',
      po_email: SAMPLE_CTX.poEmail,
      portal_url: null,
      csv_column_spec: null,
      blind_ship: true,
      change_window_days: 3,
      claims_window_days: 14,
      payment_terms: 'net_30',
      lead_time_days: 21,
    },
    fulfillment_vendor_po_lines: [
      {
        qty: 1,
        unit_cost_cents: 273000,
        fulfillment_order_items: { item_name: 'Heirloom Oak Dining Table', vendor_sku: 'DW-CR72', line_index: 1 },
      },
    ],
  };

  function builder(table: string) {
    const isArray = Array.isArray(tables[table]);
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      maybeSingle: () => Promise.resolve({ data: tables[table] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: isArray ? tables[table] : [tables[table]], error: null }),
    };
    return chain;
  }

  const supabase: any = {
    from: (t: string) => builder(t),
    storage: {
      from: () => ({
        upload: (key: string) => {
          uploads.push(key);
          return Promise.resolve({ error: null });
        },
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'http://local/signed' }, error: null }),
      }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  };

  const sendEmail = (_s: unknown, opts: { from?: string }): Promise<ComplianceSendResult> => {
    emailSends += 1;
    lastEmailFrom = opts.from;
    return Promise.resolve({ success: true, id: 'dryrun_42' });
  };

  const deps: FulfillmentPoDeps = {
    supabase,
    sendEmail: sendEmail as FulfillmentPoDeps['sendEmail'],
    now: () => new Date('2026-07-17T12:00:00Z'),
  };
  return { deps, rpcCalls, uploads, get emailSends() { return emailSends; }, get lastEmailFrom() { return lastEmailFrom; } };
}

Deno.test('runFulfillmentPo · preview → PDF bytes, no mutation, no email', async () => {
  const f = fakeDeps();
  const res = await runFulfillmentPo(f.deps, { po_id: 'po-1', mode: 'preview' });
  assertEquals(res.kind, 'pdf');
  if (res.kind === 'pdf') assert(res.bytes.length > 3000);
  assertEquals(f.rpcCalls.length, 0);
  assertEquals(f.emailSends, 0);
});

Deno.test('runFulfillmentPo · send → dry-run email from orders@ + one po.transmitted (method=email, Resend id)', async () => {
  const f = fakeDeps();
  const res = await runFulfillmentPo(f.deps, { po_id: 'po-1', mode: 'send', actor: 'op' });
  assertEquals(res.kind, 'json');
  assertEquals(f.emailSends, 1);
  assertEquals(f.lastEmailFrom, 'Patina Orders <orders@patina.cloud>');
  const tx = f.rpcCalls.filter((c) => c.name === 'fulfillment_record_transmission');
  assertEquals(tx.length, 1);
  assertEquals(tx[0].args.p_method, 'email');
  assertEquals(tx[0].args.p_ref, 'dryrun_42');
  assertEquals(tx[0].args.p_pdf_r2_key, 'fulfillment/po/PO-2026-00001-A.pdf');
});

Deno.test('runFulfillmentPo · mark_transmitted portal → no email + one po.transmitted (method=portal, operator ref)', async () => {
  const f = fakeDeps();
  await runFulfillmentPo(f.deps, { po_id: 'po-1', mode: 'mark_transmitted', method: 'portal', reference: 'RB-88213', actor: 'op' });
  assertEquals(f.emailSends, 0);
  const tx = f.rpcCalls.filter((c) => c.name === 'fulfillment_record_transmission');
  assertEquals(tx.length, 1);
  assertEquals(tx[0].args.p_method, 'portal');
  assertEquals(tx[0].args.p_ref, 'RB-88213');
});

Deno.test('runFulfillmentPo · mark_transmitted csv → one po.transmitted (method=csv, batch ref)', async () => {
  const f = fakeDeps();
  await runFulfillmentPo(f.deps, { po_id: 'po-1', mode: 'mark_transmitted', method: 'csv', reference: 'batch.csv', actor: 'op' });
  assertEquals(f.emailSends, 0);
  const tx = f.rpcCalls.filter((c) => c.name === 'fulfillment_record_transmission');
  assertEquals(tx.length, 1);
  assertEquals(tx[0].args.p_method, 'csv');
  assertEquals(tx[0].args.p_ref, 'batch.csv');
});
