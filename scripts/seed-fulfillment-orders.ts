#!/usr/bin/env -S deno run -A
// scripts/seed-fulfillment-orders.ts — BOH (S0, task C2) local dev seed.
//
// POSTs 5 fabricated capture payloads to the locally-served fulfillment-intake
// edge function's seed path ({ seed_pi: {...}, actor }) — see
// supabase/functions/fulfillment-intake/{index,core}.ts. This is deliberately
// NOT a direct SQL insert of fulfillment_orders/_order_items rows: every order
// flows through the SAME normalize → fulfillment_intake_order RPC path a real
// captured Stripe PaymentIntent would (spec §12 "no side doors" — the RPC is
// the only writer of BOH lifecycle tables, gated by the app.fulfillment_writer
// GUC, 00350).
//
// Idempotent: fulfillment_intake_order keys on stripe_payment_intent_id
// (ON CONFLICT DO NOTHING → returns the existing order_id, writes nothing
// further, 00353). Re-running this script with the same pi ids is a pure
// no-op — same 5 orders, same order ids, no new ledger/event rows.
//
// No absolute timestamps appear anywhere in these payloads: fulfillment_orders
// .intake_at is stamped by the RPC itself via DEFAULT now() at INSERT time
// (00350) — the intake payload contract carries no date/time field at all.
// There is therefore nothing in the payload to "relativize"; this comment
// documents that omission is intentional, not an oversight.
//
// Runbook (two-phase — see S0-PLAN.md D8, orders are NOT produced by a bare
// `supabase db reset`):
//   # terminal 1:
//   supabase functions serve --env-file supabase/functions/_tests/test.env --no-verify-jwt
//   # terminal 2:
//   cd supabase && supabase db reset          # loads vendor-profiles + catalog-dev SQL seeds
//   cd .. && pnpm seed:fulfillment            # POSTs 5 orders through the intake fn
//
// Env:
//   SUPABASE_URL              default http://127.0.0.1:54321
//   SUPABASE_SERVICE_ROLE_KEY required (no default — never hardcode a key in
//                              a committed file, even a local-only one; get it
//                              from `supabase status -o env` in the same shell)

const URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. Run `supabase status -o env` in ' +
      'the supabase/ dir and export SERVICE_ROLE_KEY as SUPABASE_SERVICE_ROLE_KEY, ' +
      'then re-run `pnpm seed:fulfillment`.',
  );
  Deno.exit(1);
}

// ─── Product fixtures this seed depends on (supabase/seed/products.sql +
// fulfillment-catalog-dev.sql, which maps the 6 ids below to 5 vendors and
// creates the 2 deliberately-unmapped bff… ids). ────────────────────────────
const MAPPED = {
  oakDiningTable: 'a0000000-0000-0000-0000-000000000001', // vendor 101
  walnutCredenza: 'a0000000-0000-0000-0000-000000000002', // vendor 102
  liveEdgeCoffeeTable: 'a0000000-0000-0000-0000-000000000003', // vendor 103
  meadowLinenSectional: 'a0000000-0000-0000-0000-000000000010', // vendor 101
  brassArcFloorLamp: 'a0000000-0000-0000-0000-000000000011', // vendor 102
  velvetClubChair: 'a0000000-0000-0000-0000-000000000012', // vendor 111
  marbleSideTable: 'a0000000-0000-0000-0000-000000000013', // vendor 118
};
const UNMAPPED = {
  brassSconce: 'bff00000-0000-0000-0000-0000000000f1',
  oakStool: 'bff00000-0000-0000-0000-0000000000f2',
};

interface SeedLine {
  product_id: string;
  item_name: string;
  qty: number;
  unit_price_cents: number;
}
interface SeedTotals {
  productSubtotalCents: number;
  freightChargedCents: number;
  taxCents: number;
}
interface SeedOrderSpec {
  piId: string;
  clientName: string;
  clientEmail: string;
  shipTo: Record<string, string>;
  lines: SeedLine[];
  totals: SeedTotals;
}

// captured_total_cents = product_subtotal_cents + freight_charged_cents +
// tax_cents on every order — the T1 capture ledger entry (Dr 1000 = captured
// total; Cr 4000/4100/2100 = the three components) only balances if this
// holds (00352 ledger_post_t1_capture). Freight/tax are deliberately 0 on two
// orders (C/D) to exercise ledger_post's zero-line-skip path (D12).
const ORDERS: SeedOrderSpec[] = [
  {
    // Order 1 — 5 lines / 5 distinct vendors (101/102/103/111/118).
    piId: 'pi_boh_seed_1',
    clientName: 'Priya Anand',
    clientEmail: 'priya.anand@example.com',
    shipTo: { line1: '412 Sycamore Ln', city: 'Austin', state: 'TX', postal_code: '78704' },
    lines: [
      { product_id: MAPPED.oakDiningTable, item_name: 'Heirloom Oak Dining Table', qty: 1, unit_price_cents: 420000 },
      { product_id: MAPPED.walnutCredenza, item_name: 'Walnut Credenza', qty: 1, unit_price_cents: 360000 },
      { product_id: MAPPED.liveEdgeCoffeeTable, item_name: 'Live-Edge Coffee Table', qty: 1, unit_price_cents: 210000 },
      { product_id: MAPPED.velvetClubChair, item_name: 'Velvet Club Chair', qty: 1, unit_price_cents: 125000 },
      { product_id: MAPPED.marbleSideTable, item_name: 'Marble Side Table', qty: 1, unit_price_cents: 89900 },
    ],
    totals: { productSubtotalCents: 1204900, freightChargedCents: 15000, taxCents: 90000 },
  },
  {
    // Order 2 — single line.
    piId: 'pi_boh_seed_2',
    clientName: 'Marcus Webb',
    clientEmail: 'marcus.webb@example.com',
    shipTo: { line1: '88 Harbor View Dr', city: 'Portland', state: 'ME', postal_code: '04101' },
    lines: [
      { product_id: MAPPED.meadowLinenSectional, item_name: 'Meadow Linen Sectional', qty: 1, unit_price_cents: 680000 },
    ],
    totals: { productSubtotalCents: 680000, freightChargedCents: 25000, taxCents: 51000 },
  },
  {
    // Order 3 — mixed: 1 mapped + 1 UNMAPPED line (zero freight, exercises
    // the ledger zero-line-skip path).
    piId: 'pi_boh_seed_3',
    clientName: 'Odalys Ferreira',
    clientEmail: 'odalys.ferreira@example.com',
    shipTo: { line1: '2210 Birchwood Ct', city: 'Denver', state: 'CO', postal_code: '80206' },
    lines: [
      { product_id: MAPPED.brassArcFloorLamp, item_name: 'Brass Arc Floor Lamp', qty: 1, unit_price_cents: 89000 },
      { product_id: UNMAPPED.brassSconce, item_name: 'Unmapped Brass Sconce', qty: 1, unit_price_cents: 48000 },
    ],
    totals: { productSubtotalCents: 137000, freightChargedCents: 0, taxCents: 8000 },
  },
  {
    // Order 4 — mixed: 1 mapped + 1 UNMAPPED line (zero tax — a resale/exempt
    // ship-to, and the ledger's other zero-line-skip path).
    piId: 'pi_boh_seed_4',
    clientName: 'Grant Okafor',
    clientEmail: 'grant.okafor@example.com',
    shipTo: { line1: '77 Prospect Ave', city: 'Brooklyn', state: 'NY', postal_code: '11215' },
    lines: [
      { product_id: MAPPED.oakDiningTable, item_name: 'Heirloom Oak Dining Table', qty: 1, unit_price_cents: 420000 },
      { product_id: UNMAPPED.oakStool, item_name: 'Unmapped Oak Stool', qty: 1, unit_price_cents: 32000 },
    ],
    totals: { productSubtotalCents: 452000, freightChargedCents: 12000, taxCents: 0 },
  },
  {
    // Order 5 — single mapped line, qty 2.
    piId: 'pi_boh_seed_5',
    clientName: 'Nora Lindqvist',
    clientEmail: 'nora.lindqvist@example.com',
    shipTo: { line1: '19 Fenwick Row', city: 'Charleston', state: 'SC', postal_code: '29401' },
    lines: [{ product_id: MAPPED.marbleSideTable, item_name: 'Marble Side Table', qty: 2, unit_price_cents: 89900 }],
    totals: { productSubtotalCents: 179800, freightChargedCents: 9000, taxCents: 14000 },
  },
];

/** Build a fabricated Stripe PaymentIntent object matching what
 *  fulfillment-intake/core.ts#normalizeIntakePayload expects: metadata carries
 *  the JSON-encoded cart + totals (BOH intake contract §3). */
function buildSeedPi(spec: SeedOrderSpec): Record<string, unknown> {
  const capturedTotalCents = spec.totals.productSubtotalCents + spec.totals.freightChargedCents + spec.totals.taxCents;
  return {
    id: spec.piId,
    livemode: false,
    amount: capturedTotalCents,
    metadata: {
      client_name: spec.clientName,
      client_email: spec.clientEmail,
      ship_to: JSON.stringify(spec.shipTo),
      captured_total_cents: String(capturedTotalCents),
      product_subtotal_cents: String(spec.totals.productSubtotalCents),
      freight_charged_cents: String(spec.totals.freightChargedCents),
      tax_cents: String(spec.totals.taxCents),
      lines: JSON.stringify(spec.lines),
    },
  };
}

async function main() {
  console.log(`[seed-fulfillment-orders] ${new Date(Date.now()).toISOString()} — posting ${ORDERS.length} orders to ${URL}/functions/v1/fulfillment-intake`);
  let failed = 0;
  for (const spec of ORDERS) {
    const seed_pi = buildSeedPi(spec);
    const res = await fetch(`${URL}/functions/v1/fulfillment-intake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY!,
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({ seed_pi, actor: 'seed:boh' }),
    });
    const body = await res.text();
    console.log(`${spec.piId} -> HTTP ${res.status} ${body}`);
    if (!res.ok) failed++;
  }
  if (failed > 0) {
    console.error(`[seed-fulfillment-orders] ${failed}/${ORDERS.length} orders failed`);
    Deno.exit(1);
  }
  console.log('[seed-fulfillment-orders] done');
}

await main();
