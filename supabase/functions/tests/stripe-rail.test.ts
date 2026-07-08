// Edge-function test harness — payable_type dispatch (invoice + po_payment).
//
// Exercises the LOCAL, running stripe-webhook + create-checkout-session edge
// functions against the shared local dev DB. Signature-valid Stripe payloads
// are minted with the Stripe SDK's generateTestHeaderString + whsec_test123.
//
// Prereq (started by run.sh, or run manually):
//   supabase functions serve --env-file supabase/functions/tests/test.env --no-verify-jwt
//
// Run:
//   supabase/functions/tests/run.sh
// or directly (with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
// / STRIPE_WEBHOOK_SECRET in the env):
//   deno test -A supabase/functions/tests/stripe-rail.test.ts
//
// Fixtures are marker-tagged and deleted in a finally block. The harness never
// runs `supabase db reset` — the local stack is shared across sessions.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? 'whsec_test123';
const WEBHOOK_URL = `${SB_URL}/functions/v1/stripe-webhook`;
const CHECKOUT_URL = `${SB_URL}/functions/v1/create-checkout-session`;

const RUN = crypto.randomUUID().slice(0, 8);
const MARKER = `STRIPE_RAIL_TEST_${RUN}`;
const PW = 'test-password-123456';

const admin: SupabaseClient = createClient(SB_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon: SupabaseClient = createClient(SB_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Stripe webhook signature scheme: header "t=<ts>,v1=<HMAC-SHA256(secret, `${ts}.${payload}`)>".
// The full endpoint secret string (whsec_…) is the HMAC key. Computed with
// SubtleCrypto so it matches the webhook's SubtleCryptoProvider verification.
async function stripeSignature(payload: string, secret: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}

function stripeEvent(id: string, type: string, object: Record<string, unknown>) {
  return {
    id,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
}

async function postSigned(url: string, event: unknown): Promise<Response> {
  const payload = JSON.stringify(event);
  const header = await stripeSignature(payload, WEBHOOK_SECRET);
  return fetch(url, {
    method: 'POST',
    headers: { 'stripe-signature': header, 'content-type': 'application/json' },
    body: payload,
  });
}

async function signIn(email: string): Promise<string> {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PW });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

// ── Fixture ids ─────────────────────────────────────────────────────────────
const ids = {
  designerA: '',
  userB: '',
  vendor: '',
  project: '',
  poA: '',
  poB: '',
  poC: '',
  poD: '',
  poE: '', // cancelled catalog PO → create-checkout 409 (test e4)
  payPaid: '', // PO_A deposit → paid via checkout.session.completed (tests b, d, e1)
  payFail: '', // PO_B balance → async_payment_failed (test c)
  payNonCatalog: '', // PO_C deposit → create-checkout 422
  payAlreadyPaid: '', // PO_D deposit, state=paid → create-checkout 409
  payCancelled: '', // PO_E deposit, PO cancelled → create-checkout 409, no session
  invoice: '',
  invPay: '',
  // ── direct_order fixtures (00267) ──
  product: '', // a buyable Patina-managed product for direct_orders FK
  doPaid: '', // pending_payment → paid via checkout.session.completed (tests f, g, g2)
  doFail: '', // pending_payment → async_payment_failed clears pointers (test h)
  doCanceled: '', // status=canceled → create-checkout 409
  doAlreadyPaid: '', // status=paid → create-checkout 409
};
const EVT = {
  inv: `evt_inv_${RUN}`,
  poPaid: `evt_po_paid_${RUN}`,
  poPaidPi: `evt_po_paid_pi_${RUN}`, // DISTINCT event, same PI as poPaid — exercises the settle guard
  poFail: `evt_po_fail_${RUN}`,
  doPaid: `evt_do_paid_${RUN}`,
  doPaidPi: `evt_do_paid_pi_${RUN}`, // DISTINCT event, same PI as doPaid — settle guard
  doFail: `evt_do_fail_${RUN}`,
  doFailOnPaid: `evt_do_fail_on_paid_${RUN}`, // async_payment_failed against the PAID order (short-circuit)
};
const SESS = {
  inv: `cs_inv_${RUN}`,
  poPaid: `cs_po_paid_${RUN}`,
  poFail: `cs_po_fail_${RUN}`,
  doPaid: `cs_do_paid_${RUN}`,
  doFail: `cs_do_fail_${RUN}`,
};

async function createUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function insert(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select('id').single();
  if (error) throw new Error(`insert ${table} failed: ${error.message}`);
  return (data as { id: string }).id;
}

async function seed() {
  ids.designerA = await createUser(`stripe-rail-a-${RUN}@example.test`);
  ids.userB = await createUser(`stripe-rail-b-${RUN}@example.test`);

  ids.vendor = await insert('vendors', { name: `${MARKER} Vendor` });
  ids.project = await insert('projects', {
    name: `${MARKER} Project`,
    client_id: ids.designerA,
    designer_id: ids.designerA,
    created_by: ids.designerA,
  });

  const po = (tag: string, isCatalog: boolean, pattern = 'fifty_fifty', status = 'confirmed') =>
    insert('purchase_orders', {
      designer_id: ids.designerA,
      project_id: ids.project,
      vendor_id: ids.vendor,
      payment_pattern: pattern,
      total_cents: 10000,
      status,
      is_patina_catalog: isCatalog,
      po_number: `PO-${MARKER}-${tag}`,
      notes: MARKER,
    });

  ids.poA = await po('A', true);
  ids.poB = await po('B', true);
  ids.poC = await po('C', false);
  ids.poD = await po('D', true);
  ids.poE = await po('E', true, 'fifty_fifty', 'cancelled');

  ids.payPaid = await insert('po_payments', {
    purchase_order_id: ids.poA, kind: 'deposit', amount_cents: 5000, state: 'pending',
    stripe_checkout_session_id: SESS.poPaid, notes: MARKER,
  });
  ids.payFail = await insert('po_payments', {
    purchase_order_id: ids.poB, kind: 'balance', amount_cents: 5000, state: 'pending',
    stripe_checkout_session_id: SESS.poFail, notes: MARKER,
  });
  ids.payNonCatalog = await insert('po_payments', {
    purchase_order_id: ids.poC, kind: 'deposit', amount_cents: 5000, state: 'pending', notes: MARKER,
  });
  ids.payAlreadyPaid = await insert('po_payments', {
    purchase_order_id: ids.poD, kind: 'deposit', amount_cents: 5000, state: 'paid',
    paid_date: new Date().toISOString().slice(0, 10), notes: MARKER,
  });
  // Stale 'pending' payment on a CANCELLED PO — must be refused by checkout.
  ids.payCancelled = await insert('po_payments', {
    purchase_order_id: ids.poE, kind: 'deposit', amount_cents: 5000, state: 'pending', notes: MARKER,
  });

  ids.invoice = await insert('invoices', {
    project_id: ids.project,
    designer_id: ids.designerA,
    client_id: ids.designerA,
    invoice_number: `INV-${MARKER}`,
    status: 'sent',
    currency: 'USD',
    total_cents: 8000,
    amount_paid_cents: 0,
  });
  ids.invPay = await insert('invoice_payments', {
    invoice_id: ids.invoice, amount_cents: 8000, method: 'stripe', status: 'pending',
    stripe_checkout_session_id: SESS.inv, recorded_by: ids.designerA,
  });

  // ── direct_order fixtures ──
  // A buyable Patina-managed product (catalog layer satisfies the
  // catalog-requires-management CHECK with patina_managed=true; no owner_user_id
  // needed). Only the FK target matters for these settle/checkout tests.
  ids.product = await insert('products', {
    name: `${MARKER} Product`,
    captured_at: new Date().toISOString(),
    layer: 'catalog',
    status: 'published',
    patina_managed: true,
    price_retail: 5000,
  });

  // designerA is the buying client (has a real profile via the auth trigger),
  // userB is the non-owner used for the 404 authz test.
  const directOrder = (
    sessionId: string | null,
    status: string,
    quantity = 1,
  ) =>
    insert('direct_orders', {
      client_id: ids.designerA,
      product_id: ids.product,
      product_name: `${MARKER} Product`,
      quantity,
      unit_price_cents: 5000,
      amount_cents: 5000 * quantity,
      currency: 'usd',
      status,
      stripe_checkout_session_id: sessionId,
    });

  ids.doPaid = await directOrder(SESS.doPaid, 'pending_payment', 2);
  ids.doFail = await directOrder(SESS.doFail, 'pending_payment');
  ids.doCanceled = await directOrder(null, 'canceled');
  ids.doAlreadyPaid = await insert('direct_orders', {
    client_id: ids.designerA, product_id: ids.product, product_name: `${MARKER} Product`,
    quantity: 1, unit_price_cents: 5000, amount_cents: 5000, currency: 'usd',
    status: 'paid', paid_at: new Date().toISOString(),
  });
}

async function cleanup() {
  const payIds = [ids.payPaid, ids.payFail, ids.payNonCatalog, ids.payAlreadyPaid, ids.payCancelled].filter(Boolean);
  const poIds = [ids.poA, ids.poB, ids.poC, ids.poD, ids.poE].filter(Boolean);
  const doIds = [ids.doPaid, ids.doFail, ids.doCanceled, ids.doAlreadyPaid].filter(Boolean);
  if (payIds.length) await admin.from('procurement_notifications').delete().in('subject_payment_id', payIds);
  if (ids.invoice) {
    await admin.from('designer_earnings').delete().eq('invoice_id', ids.invoice);
    await admin.from('invoice_payments').delete().eq('invoice_id', ids.invoice);
    await admin.from('invoices').delete().eq('id', ids.invoice);
  }
  if (payIds.length) await admin.from('po_payments').delete().in('id', payIds);
  if (poIds.length) await admin.from('purchase_orders').delete().in('id', poIds);
  // direct_orders.client_id FK is ON DELETE RESTRICT — delete orders before the
  // buyer profile/user; product_id references products, so orders before product.
  if (doIds.length) await admin.from('direct_orders').delete().in('id', doIds);
  if (ids.product) await admin.from('products').delete().eq('id', ids.product);
  if (ids.project) await admin.from('projects').delete().eq('id', ids.project);
  if (ids.vendor) await admin.from('vendors').delete().eq('id', ids.vendor);
  await admin.from('stripe_webhook_events').delete().in('id', [
    EVT.inv, EVT.poPaid, EVT.poPaidPi, EVT.poFail,
    EVT.doPaid, EVT.doPaidPi, EVT.doFail, EVT.doFailOnPaid,
  ]);
  if (ids.designerA) await admin.auth.admin.deleteUser(ids.designerA).catch(() => {});
  if (ids.userB) await admin.auth.admin.deleteUser(ids.userB).catch(() => {});
}

async function poPayment(id: string) {
  const { data, error } = await admin
    .from('po_payments')
    .select('id, state, paid_date, stripe_checkout_session_id, stripe_payment_intent_id')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as {
    state: string; paid_date: string | null;
    stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  };
}

async function directOrder(id: string) {
  const { data, error } = await admin
    .from('direct_orders')
    .select('id, status, paid_at, stripe_checkout_session_id, stripe_payment_intent_id, shipping')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as {
    status: string; paid_at: string | null;
    stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
    shipping: Record<string, unknown> | null;
  };
}

async function notifCount(paymentId: string, kind: string): Promise<number> {
  const { count, error } = await admin
    .from('procurement_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('subject_payment_id', paymentId)
    .eq('kind', kind);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

Deno.test('payable_type dispatch — invoice back-compat + po_payment', async (t) => {
  await seed();
  try {
    // (a) INVOICE back-compat: no payable_type in metadata → settles invoice.
    await t.step('invoice checkout.session.completed (no payable_type) settles', async () => {
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.inv, 'checkout.session.completed', {
          id: SESS.inv, object: 'checkout.session', payment_status: 'paid',
          amount_total: 8000, payment_intent: `pi_inv_${RUN}`,
          metadata: { invoice_id: ids.invoice },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const { data } = await admin
        .from('invoice_payments').select('status, stripe_payment_intent_id').eq('id', ids.invPay).single();
      assertEquals(data!.status, 'succeeded');
      assertEquals(data!.stripe_payment_intent_id, `pi_inv_${RUN}`);
    });

    // (b) PO_PAYMENT paid via checkout.session.completed.
    await t.step('po_payment checkout.session.completed → paid', async () => {
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.poPaid, 'checkout.session.completed', {
          id: SESS.poPaid, object: 'checkout.session', payment_status: 'paid',
          amount_total: 5000, payment_intent: `pi_po_${RUN}`,
          metadata: { payable_type: 'po_payment', po_payment_id: ids.payPaid, purchase_order_id: ids.poA },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await poPayment(ids.payPaid);
      assertEquals(row.state, 'paid');
      assert(row.paid_date, 'paid_date stamped');
      assertEquals(row.stripe_payment_intent_id, `pi_po_${RUN}`);
      assertEquals(await notifCount(ids.payPaid, 'payment_received'), 1);
    });

    // (d) Replay of (b) is idempotent — no double effects.
    await t.step('po_payment replay is idempotent', async () => {
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.poPaid, 'checkout.session.completed', {
          id: SESS.poPaid, object: 'checkout.session', payment_status: 'paid',
          amount_total: 5000, payment_intent: `pi_po_${RUN}`,
          metadata: { payable_type: 'po_payment', po_payment_id: ids.payPaid, purchase_order_id: ids.poA },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await poPayment(ids.payPaid);
      assertEquals(row.state, 'paid');
      assertEquals(await notifCount(ids.payPaid, 'payment_received'), 1); // still 1
    });

    // (d2) DISTINCT event (payment_intent.succeeded) for the SAME PaymentIntent
    // after the settle. Event-id dedup can't help here (new event id), so this
    // proves the settle guard itself: resolvePoPayment finds the row by PI id,
    // markPoPaid's .neq('state','paid') no-ops, and no second notification fires.
    await t.step('po_payment payment_intent.succeeded after settle is a no-op (settle guard)', async () => {
      const before = await poPayment(ids.payPaid);
      assertEquals(before.state, 'paid');
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.poPaidPi, 'payment_intent.succeeded', {
          id: `pi_po_${RUN}`, object: 'payment_intent',
          metadata: { payable_type: 'po_payment', po_payment_id: ids.payPaid, purchase_order_id: ids.poA },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await poPayment(ids.payPaid);
      assertEquals(row.state, 'paid');
      assertEquals(row.paid_date, before.paid_date); // paid_date unchanged
      assertEquals(await notifCount(ids.payPaid, 'payment_received'), 1); // still exactly 1
    });

    // (c) PO_PAYMENT async_payment_failed clears the session pointer.
    await t.step('po_payment async_payment_failed clears session pointer', async () => {
      const before = await poPayment(ids.payFail);
      assertEquals(before.stripe_checkout_session_id, SESS.poFail);
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.poFail, 'checkout.session.async_payment_failed', {
          id: SESS.poFail, object: 'checkout.session', payment_status: 'unpaid',
          payment_intent: `pi_po_fail_${RUN}`,
          metadata: { payable_type: 'po_payment', po_payment_id: ids.payFail, purchase_order_id: ids.poB },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await poPayment(ids.payFail);
      assertEquals(row.stripe_checkout_session_id, null); // cleared
      assertEquals(row.state, 'pending'); // state untouched
      assertEquals(await notifCount(ids.payFail, 'payment_failed'), 1);
    });

    // (e) create-checkout-session po branch validation (fails before Stripe).
    await t.step('create-checkout rejects non-designer caller (404)', async () => {
      const tokenB = await signIn(`stripe-rail-b-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
        body: JSON.stringify({ po_payment_id: ids.payPaid }),
      });
      await res.body?.cancel();
      assertEquals(res.status, 404);
    });

    await t.step('create-checkout rejects non-catalog PO (422)', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ po_payment_id: ids.payNonCatalog }),
      });
      await res.body?.cancel();
      assertEquals(res.status, 422);
    });

    await t.step('create-checkout rejects already-paid row (409)', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ po_payment_id: ids.payAlreadyPaid }),
      });
      await res.body?.cancel();
      assertEquals(res.status, 409);
    });

    // (e4) A cancelled PO's stale pending payment is refused BEFORE Stripe —
    // 409 with error 'po_cancelled', and no Checkout session pointer is stamped.
    await t.step('create-checkout rejects cancelled PO (409, no session created)', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ po_payment_id: ids.payCancelled }),
      });
      const body = await res.json();
      assertEquals(res.status, 409);
      assertEquals(body.error, 'po_cancelled');
      // The load-guard returns before any Stripe call — the session pointer on
      // the payment row stays null (no session was ever created).
      const row = await poPayment(ids.payCancelled);
      assertEquals(row.stripe_checkout_session_id, null);
    });

    // ═══ direct_order rail (00267) ═══════════════════════════════════════════

    // (f) DIRECT_ORDER paid via checkout.session.completed → status/paid_at/PI +
    // shipping persisted (top-level shipping_details + customer_details.email).
    await t.step('direct_order checkout.session.completed → paid + shipping persisted', async () => {
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.doPaid, 'checkout.session.completed', {
          id: SESS.doPaid, object: 'checkout.session', payment_status: 'paid',
          amount_total: 10000, payment_intent: `pi_do_${RUN}`,
          shipping_details: {
            name: 'Jane Buyer',
            address: { line1: '1 Test St', city: 'Testville', state: 'CA', postal_code: '90210', country: 'US' },
          },
          customer_details: { email: `buyer-${RUN}@example.test` },
          metadata: { payable_type: 'direct_order', direct_order_id: ids.doPaid },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await directOrder(ids.doPaid);
      assertEquals(row.status, 'paid');
      assert(row.paid_at, 'paid_at stamped');
      assertEquals(row.stripe_payment_intent_id, `pi_do_${RUN}`);
      assert(row.shipping, 'shipping persisted');
      assertEquals(row.shipping!.email, `buyer-${RUN}@example.test`);
      assertEquals(row.shipping!.name, 'Jane Buyer');
      assertEquals((row.shipping!.address as Record<string, unknown>).postal_code, '90210');
    });

    // (g) Exact replay of (f) is idempotent (event-id dedup).
    await t.step('direct_order replay is idempotent', async () => {
      const before = await directOrder(ids.doPaid);
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.doPaid, 'checkout.session.completed', {
          id: SESS.doPaid, object: 'checkout.session', payment_status: 'paid',
          amount_total: 10000, payment_intent: `pi_do_${RUN}`,
          metadata: { payable_type: 'direct_order', direct_order_id: ids.doPaid },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await directOrder(ids.doPaid);
      assertEquals(row.status, 'paid');
      assertEquals(row.paid_at, before.paid_at); // unchanged
    });

    // (g2) DISTINCT event (payment_intent.succeeded) for the SAME PI after the
    // settle. New event id defeats dedup, so this proves the settle guard:
    // markDirectOrderPaid's .eq('status','pending_payment') no-ops on a paid row.
    await t.step('direct_order payment_intent.succeeded after settle is a no-op (settle guard)', async () => {
      const before = await directOrder(ids.doPaid);
      assertEquals(before.status, 'paid');
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.doPaidPi, 'payment_intent.succeeded', {
          id: `pi_do_${RUN}`, object: 'payment_intent',
          metadata: { payable_type: 'direct_order', direct_order_id: ids.doPaid },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await directOrder(ids.doPaid);
      assertEquals(row.status, 'paid');
      assertEquals(row.paid_at, before.paid_at); // paid_at unchanged
    });

    // (h) DIRECT_ORDER async_payment_failed clears the session pointer + PI and
    // leaves status pending_payment (no 'failed' status).
    await t.step('direct_order async_payment_failed clears pointers, stays pending', async () => {
      const before = await directOrder(ids.doFail);
      assertEquals(before.stripe_checkout_session_id, SESS.doFail);
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.doFail, 'checkout.session.async_payment_failed', {
          id: SESS.doFail, object: 'checkout.session', payment_status: 'unpaid',
          payment_intent: `pi_do_fail_${RUN}`,
          metadata: { payable_type: 'direct_order', direct_order_id: ids.doFail },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await directOrder(ids.doFail);
      assertEquals(row.stripe_checkout_session_id, null); // cleared
      assertEquals(row.stripe_payment_intent_id, null); // cleared
      assertEquals(row.status, 'pending_payment'); // untouched
    });

    // (h2) async_payment_failed against the ALREADY-PAID order short-circuits:
    // pointer NOT stripped, status stays paid (no spurious clear on a live order).
    await t.step('direct_order async_payment_failed on a paid order is a no-op (short-circuit)', async () => {
      const before = await directOrder(ids.doPaid);
      assertEquals(before.status, 'paid');
      assertEquals(before.stripe_checkout_session_id, SESS.doPaid);
      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(EVT.doFailOnPaid, 'checkout.session.async_payment_failed', {
          id: SESS.doPaid, object: 'checkout.session', payment_status: 'unpaid',
          payment_intent: `pi_do_${RUN}`,
          metadata: { payable_type: 'direct_order', direct_order_id: ids.doPaid },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await directOrder(ids.doPaid);
      assertEquals(row.status, 'paid'); // untouched
      assertEquals(row.stripe_checkout_session_id, SESS.doPaid); // pointer preserved
    });

    // (i) create-checkout rejects a non-owner (404) — before any Stripe call.
    await t.step('direct_order create-checkout rejects non-owner (404)', async () => {
      const tokenB = await signIn(`stripe-rail-b-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
        body: JSON.stringify({ direct_order_id: ids.doPaid }),
      });
      await res.body?.cancel();
      assertEquals(res.status, 404);
    });

    // (j) create-checkout rejects a canceled order (409, direct_order_canceled).
    await t.step('direct_order create-checkout rejects canceled order (409)', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ direct_order_id: ids.doCanceled }),
      });
      const body = await res.json();
      assertEquals(res.status, 409);
      assertEquals(body.error, 'direct_order_canceled');
    });

    // (k) create-checkout rejects an already-paid order (409).
    await t.step('direct_order create-checkout rejects already-paid order (409)', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ direct_order_id: ids.doAlreadyPaid }),
      });
      const body = await res.json();
      assertEquals(res.status, 409);
      assertEquals(body.error, 'direct_order_already_paid');
    });
  } finally {
    await cleanup();
  }
});
