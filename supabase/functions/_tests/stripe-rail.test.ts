// Edge-function test harness — payable_type dispatch (invoice + po_payment).
//
// Exercises the LOCAL, running stripe-webhook + create-checkout-session edge
// functions against the shared local dev DB. Signature-valid Stripe payloads
// are minted with the Stripe SDK's generateTestHeaderString + whsec_test123.
//
// Prereq (started by run.sh, or run manually):
//   supabase functions serve --env-file supabase/functions/_tests/test.env --no-verify-jwt
//
// Run:
//   supabase/functions/_tests/run.sh
// or directly (with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
// / STRIPE_WEBHOOK_SECRET in the env):
//   deno test -A supabase/functions/_tests/stripe-rail.test.ts
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
const EXPIRE_URL = `${SB_URL}/functions/v1/expire-po-session`;

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
  poF: '', // cancelled catalog PO with an OPEN session → expire-po-session clears it
  payPaid: '', // PO_A deposit → paid via checkout.session.completed (tests b, d, e1)
  payFail: '', // PO_B balance → async_payment_failed (test c)
  payNonCatalog: '', // PO_C deposit → create-checkout 422
  payAlreadyPaid: '', // PO_D deposit, state=paid → create-checkout 409
  payCancelled: '', // PO_E deposit, PO cancelled, NO pointer → expire-po-session {expired:0}
  payExpire: '', // PO_F deposit, PO cancelled, WITH pointer+PI → expire-po-session {expired:1}
  invoice: '',
  invPay: '',
  // ── direct_order fixtures (00276) ──
  product: '', // a buyable Patina-managed product for direct_orders FK
  doPaid: '', // pending_payment → paid via checkout.session.completed (tests f, g, g2)
  doFail: '', // pending_payment → async_payment_failed clears pointers (test h)
  doCanceled: '', // status=canceled → create-checkout 409
  doAlreadyPaid: '', // status=paid → create-checkout 409
  doRefunded: '', // status=refunded (00277) → create-checkout 409, no session
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
  // ── refund reconciliation (00277) ──
  refundInvPartial: `evt_refund_inv_partial_${RUN}`, // partial invoice refund → no state change
  refundInv: `evt_refund_inv_${RUN}`, // full invoice refund → reversed
  refundInvReplay: `evt_refund_inv_replay_${RUN}`, // DISTINCT event, same PI — no double reversal
  refundPo: `evt_refund_po_${RUN}`, // full po_payment refund → state refunded
  refundDo: `evt_refund_do_${RUN}`, // full direct_order refund → status refunded
};
const SESS = {
  inv: `cs_inv_${RUN}`,
  poPaid: `cs_po_paid_${RUN}`,
  poFail: `cs_po_fail_${RUN}`,
  poExpire: `cs_po_expire_${RUN}`, // open session on a cancelled PO (expire-po-session)
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
  ids.poF = await po('F', true, 'fifty_fifty', 'cancelled');

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
  // Cancelled PO with an OPEN Checkout session + stale PI — expire-po-session
  // expires the session (swallowing the fake-key failure) and clears BOTH pointers.
  ids.payExpire = await insert('po_payments', {
    purchase_order_id: ids.poF, kind: 'deposit', amount_cents: 5000, state: 'pending',
    stripe_checkout_session_id: SESS.poExpire, stripe_payment_intent_id: `pi_po_expire_${RUN}`,
    notes: MARKER,
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
  ids.doRefunded = await directOrder(null, 'refunded');
  ids.doAlreadyPaid = await insert('direct_orders', {
    client_id: ids.designerA, product_id: ids.product, product_name: `${MARKER} Product`,
    quantity: 1, unit_price_cents: 5000, amount_cents: 5000, currency: 'usd',
    status: 'paid', paid_at: new Date().toISOString(),
  });
}

async function cleanup() {
  const payIds = [ids.payPaid, ids.payFail, ids.payNonCatalog, ids.payAlreadyPaid, ids.payCancelled, ids.payExpire].filter(Boolean);
  const poIds = [ids.poA, ids.poB, ids.poC, ids.poD, ids.poE, ids.poF].filter(Boolean);
  const doIds = [ids.doPaid, ids.doFail, ids.doCanceled, ids.doAlreadyPaid, ids.doRefunded].filter(Boolean);
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
  // notification_log rows (user cascade also clears them, but be tidy):
  // invoice refund notices + the direct-order ACH-failure client notice.
  if (ids.designerA) {
    await admin.from('notification_log').delete()
      .eq('user_id', ids.designerA)
      .in('type', ['invoice_payment_refunded', 'direct_order_payment_failed']);
  }
  await admin.from('stripe_webhook_events').delete().in('id', [
    EVT.inv, EVT.poPaid, EVT.poPaidPi, EVT.poFail,
    EVT.doPaid, EVT.doPaidPi, EVT.doFail, EVT.doFailOnPaid,
    EVT.refundInvPartial, EVT.refundInv, EVT.refundInvReplay, EVT.refundPo, EVT.refundDo,
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

/** in_app direct-order failure notifications for a given order (client inbox). */
async function directOrderFailNotifCount(orderId: string): Promise<number> {
  const { data, error } = await admin
    .from('notification_log')
    .select('metadata')
    .eq('type', 'direct_order_payment_failed')
    .eq('channel', 'in_app');
  if (error) throw new Error(error.message);
  return (data as { metadata: Record<string, unknown> }[]).filter(
    (r) => r.metadata?.direct_order_id === orderId,
  ).length;
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

// ── refund reconciliation helpers (00277) ────────────────────────────────────
async function invoiceRow(id: string) {
  const { data, error } = await admin
    .from('invoices').select('id, status, amount_paid_cents, paid_at').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as { status: string; amount_paid_cents: number; paid_at: string | null };
}

async function invoicePaymentStatus(id: string): Promise<string> {
  const { data, error } = await admin
    .from('invoice_payments').select('status').eq('id', id).single();
  if (error) throw new Error(error.message);
  return (data as { status: string }).status;
}

/** Net sum of designer_earnings for an invoice (credits + reversals). */
async function earningsNet(invoiceId: string): Promise<number> {
  const { data, error } = await admin
    .from('designer_earnings').select('net_amount').eq('invoice_id', invoiceId);
  if (error) throw new Error(error.message);
  return (data as { net_amount: number }[]).reduce((s, r) => s + r.net_amount, 0);
}

/** How many reversal contra rows exist for a given refunded payment. */
async function reversalCount(paymentId: string): Promise<number> {
  const { count, error } = await admin
    .from('designer_earnings')
    .select('id', { count: 'exact', head: true })
    .eq('reverses_invoice_payment_id', paymentId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** notification_log refund rows for a payment, optionally filtered by partial flag. */
async function refundNotifCount(paymentId: string, partial: boolean): Promise<number> {
  const { data, error } = await admin
    .from('notification_log')
    .select('metadata')
    .eq('type', 'invoice_payment_refunded');
  if (error) throw new Error(error.message);
  return (data as { metadata: Record<string, unknown> }[]).filter(
    (r) => r.metadata?.invoice_payment_id === paymentId && r.metadata?.partial === partial,
  ).length;
}

function chargeRefundedEvent(
  eventId: string,
  paymentIntentId: string,
  opts: { full: boolean; captured: number; refunded: number; chargeId?: string },
) {
  return stripeEvent(eventId, 'charge.refunded', {
    id: opts.chargeId ?? `ch_${eventId}`,
    object: 'charge',
    payment_intent: paymentIntentId,
    amount: opts.captured,
    amount_captured: opts.captured,
    amount_refunded: opts.refunded,
    refunded: opts.full,
  });
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

    // ═══ direct_order rail (00276) ═══════════════════════════════════════════

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
      // The client is notified their bank transfer failed (email is dry-run;
      // the in_app notification_log row is the assertable effect). Fires exactly
      // once, keyed to the attempt we cleared.
      assertEquals(await directOrderFailNotifCount(ids.doFail), 1);
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
      // Short-circuit fired before the pointer clear → no client failure notice
      // for a paid order.
      assertEquals(await directOrderFailNotifCount(ids.doPaid), 0);
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

    // (l) create-checkout rejects a refunded order (409, direct_order_refunded)
    // — terminal-dead; minting a session would let the client pay again with no
    // ledger flip. The load-guard returns before any Stripe call, so no session
    // pointer is ever written.
    await t.step('direct_order create-checkout rejects refunded order (409, no session)', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ direct_order_id: ids.doRefunded }),
      });
      const body = await res.json();
      assertEquals(res.status, 409);
      assertEquals(body.error, 'direct_order_refunded');
      // No Stripe call happened → the order's session pointer stays null.
      const row = await directOrder(ids.doRefunded);
      assertEquals(row.stripe_checkout_session_id, null);
    });

    // ═══ expire-po-session (cancelled-PO orphaned Checkout teardown) ══════════

    // (m) Non-owner → 404 not_found (no existence leak), before any effect.
    await t.step('expire-po-session rejects non-owner (404)', async () => {
      const tokenB = await signIn(`stripe-rail-b-${RUN}@example.test`);
      const res = await fetch(EXPIRE_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_order_id: ids.poE }),
      });
      const body = await res.json();
      assertEquals(res.status, 404);
      assertEquals(body.error, 'not_found');
    });

    // (n) A live (non-cancelled) PO → 409 po_not_cancelled with its status. poA
    // is 'confirmed'; the guard returns before touching any payment row.
    await t.step('expire-po-session rejects non-cancelled PO (409)', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(EXPIRE_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_order_id: ids.poA }),
      });
      const body = await res.json();
      assertEquals(res.status, 409);
      assertEquals(body.error, 'po_not_cancelled');
      assertEquals(body.status, 'confirmed');
    });

    // (o) Cancelled PO whose only payment has NO open session → nothing to do,
    // {expired: 0}. (payCancelled on poE has a null session pointer.)
    await t.step('expire-po-session on cancelled PO with no open sessions → {expired:0}', async () => {
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(EXPIRE_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_order_id: ids.poE }),
      });
      const body = await res.json();
      assertEquals(res.status, 200);
      assertEquals(body.expired, 0);
      // The stale pending row is untouched (still null pointer, never had one).
      const row = await poPayment(ids.payCancelled);
      assertEquals(row.stripe_checkout_session_id, null);
    });

    // (p) Cancelled PO with an OPEN session pointer + stale PI → {expired: 1},
    // BOTH pointers cleared. The live sessions.expire call fails against the fake
    // Stripe key and is swallowed (console.warn) — the pointer-clearing DB effect
    // is what we assert. (See wave brief item 2: fails-and-is-swallowed fixture.)
    await t.step('expire-po-session expires open session + clears pointers → {expired:1}', async () => {
      const before = await poPayment(ids.payExpire);
      assertEquals(before.stripe_checkout_session_id, SESS.poExpire);
      assertEquals(before.stripe_payment_intent_id, `pi_po_expire_${RUN}`);
      const tokenA = await signIn(`stripe-rail-a-${RUN}@example.test`);
      const res = await fetch(EXPIRE_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_order_id: ids.poF }),
      });
      const body = await res.json();
      assertEquals(res.status, 200);
      assertEquals(body.expired, 1);
      const row = await poPayment(ids.payExpire);
      assertEquals(row.stripe_checkout_session_id, null); // cleared
      assertEquals(row.stripe_payment_intent_id, null); // stale PI cleared too
      assertEquals(row.state, 'pending'); // state untouched (no 'failed' state)
    });

    // ═══ refund reconciliation (00277) ═══════════════════════════════════════
    // invPay was settled to 'succeeded' in step (a): invoice is 'paid' with one
    // 8000 earnings credit. These steps refund it and the other paid payables.

    // (d) PARTIAL refund of the settled invoice payment → NO state change,
    // notification (marked partial) inserted. Run before the full refund.
    await t.step('invoice PARTIAL refund → no state change + partial notification', async () => {
      const before = await invoiceRow(ids.invoice);
      assertEquals(before.status, 'paid');
      const res = await postSigned(
        WEBHOOK_URL,
        chargeRefundedEvent(EVT.refundInvPartial, `pi_inv_${RUN}`, {
          full: false, captured: 8000, refunded: 2000,
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      // Nothing on the books moved.
      assertEquals(await invoicePaymentStatus(ids.invPay), 'succeeded');
      const after = await invoiceRow(ids.invoice);
      assertEquals(after.status, 'paid');
      assertEquals(after.amount_paid_cents, 8000);
      assertEquals(await earningsNet(ids.invoice), 8000); // credit untouched
      assertEquals(await reversalCount(ids.invPay), 0); // no reversal on partial
      assert((await refundNotifCount(ids.invPay, true)) >= 1, 'partial refund notification exists');
    });

    // (a) FULL refund of the settled invoice payment → payment refunded, invoice
    // reverted (paid → sent), earnings reversed to net 0 (00277 trigger).
    await t.step('invoice FULL refund → refunded + invoice reverted + earnings reversed', async () => {
      const res = await postSigned(
        WEBHOOK_URL,
        chargeRefundedEvent(EVT.refundInv, `pi_inv_${RUN}`, {
          full: true, captured: 8000, refunded: 8000,
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      assertEquals(await invoicePaymentStatus(ids.invPay), 'refunded');
      const inv = await invoiceRow(ids.invoice);
      assertEquals(inv.status, 'sent'); // sole payment refunded → back to sent
      assertEquals(inv.amount_paid_cents, 0);
      assertEquals(inv.paid_at, null);
      assertEquals(await reversalCount(ids.invPay), 1); // exactly one contra row
      assertEquals(await earningsNet(ids.invoice), 0); // credit + reversal net to 0
      assert((await refundNotifCount(ids.invPay, false)) >= 1, 'full refund notification exists');
    });

    // (e) DISTINCT-event replay of (a) (new event id, same PI) → the succeeded
    // guard no-ops the flip, so no second reversal, no second notification.
    await t.step('invoice FULL refund distinct-event replay → no double reversal', async () => {
      const res = await postSigned(
        WEBHOOK_URL,
        chargeRefundedEvent(EVT.refundInvReplay, `pi_inv_${RUN}`, {
          full: true, captured: 8000, refunded: 8000,
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      assertEquals(await invoicePaymentStatus(ids.invPay), 'refunded');
      assertEquals(await reversalCount(ids.invPay), 1); // STILL exactly one
      assertEquals(await earningsNet(ids.invoice), 0);
      assertEquals((await invoiceRow(ids.invoice)).status, 'sent');
      assertEquals(await refundNotifCount(ids.invPay, false), 1); // no second notice
    });

    // (b) FULL refund of the paid po_payment → state 'refunded' (paid_date kept)
    // + payment_refunded procurement notification.
    await t.step('po_payment FULL refund → state refunded + notification', async () => {
      const before = await poPayment(ids.payPaid);
      assertEquals(before.state, 'paid');
      const res = await postSigned(
        WEBHOOK_URL,
        chargeRefundedEvent(EVT.refundPo, `pi_po_${RUN}`, {
          full: true, captured: 5000, refunded: 5000,
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await poPayment(ids.payPaid);
      assertEquals(row.state, 'refunded');
      assert(row.paid_date, 'paid_date kept (historical fact)');
      assertEquals(await notifCount(ids.payPaid, 'payment_refunded'), 1);
      // Stale checkout session pointer cleared so a re-payable row doesn't 409
      // forever against the checkout driver's in-flight predicate; the PI stays
      // (it's the refund-resolution key).
      assertEquals(row.stripe_checkout_session_id, null);
      assertEquals(row.stripe_payment_intent_id, `pi_po_${RUN}`);
    });

    // (c) FULL refund of the paid direct_order → status 'refunded'.
    await t.step('direct_order FULL refund → status refunded', async () => {
      const before = await directOrder(ids.doPaid);
      assertEquals(before.status, 'paid');
      const res = await postSigned(
        WEBHOOK_URL,
        chargeRefundedEvent(EVT.refundDo, `pi_do_${RUN}`, {
          full: true, captured: 10000, refunded: 10000,
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();
      const row = await directOrder(ids.doPaid);
      assertEquals(row.status, 'refunded');
      // Stale checkout session pointer cleared (same reasoning as the po_payment
      // full-refund case above); the PI stays (refund-resolution key).
      assertEquals(row.stripe_checkout_session_id, null);
      assertEquals(row.stripe_payment_intent_id, `pi_do_${RUN}`);
    });
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Payment-method chooser + inline surcharge (00428)
//
// Self-contained: its own fixtures, its own cleanup, no coupling to the
// payable_type walk above. The sibling `invoice_surcharge.assert.sql` proves the
// same money contract in pure SQL inside a rolled-back transaction; what is
// added HERE is the part only a running stack can show — the served
// stripe-webhook settling a GROSS Stripe amount through the real signature path,
// and the invoice-check-intent function's idempotency.
//
// Steps marked (DB) need only the local Supabase stack. Steps marked (SERVE)
// additionally need `supabase functions serve` (see run.sh).
// ─────────────────────────────────────────────────────────────────────────────

const SUR = {
  studio: '',
  designer: '',
  client: '',
  stranger: '',
  project: '',
  invoice: '', // $1,000.00 — card @250bps, the settle walk
  invoiceBig: '', // $10,000.00 — ACH cap
  attemptCard: '',
  paymentCard: '',
  attemptBig: '',
  invoiceLegacy: '', // $1,000.00 — claimed with NO method (the iOS path)
  intentInvoice: '', // untouched invoice for the check-intent steps
};
const SUR_MARKER = `SURCHARGE_RAIL_${RUN}`;
const SUR_EVT = {
  gross: `evt_sur_gross_${RUN}`,
  net: `evt_sur_net_${RUN}`,
  legacy: `evt_sur_legacy_${RUN}`,
};
const CHECK_INTENT_URL = `${SB_URL}/functions/v1/invoice-check-intent`;

/** The studio charges 2.5% on cards — deliberately NOT the 300bps default. */
const SUR_CARD_BPS = 250;

async function surchargeSeed() {
  SUR.designer = await createUser(`surcharge-designer-${RUN}@example.test`);
  SUR.client = await createUser(`surcharge-client-${RUN}@example.test`);
  SUR.stranger = await createUser(`surcharge-stranger-${RUN}@example.test`);

  SUR.studio = await insert('organizations', {
    type: 'design_studio',
    name: `${SUR_MARKER} Studio`,
    slug: `surcharge-rail-${RUN}`,
  });
  await admin.from('organization_members').insert({
    user_id: SUR.designer,
    organization_id: SUR.studio,
    role: 'owner',
    status: 'active',
  });
  await admin.from('studio_billing_settings').insert({
    studio_id: SUR.studio,
    card_surcharge_bps: SUR_CARD_BPS,
    check_remit_to: `${SUR_MARKER}\n1 Remit Way\nDes Moines, IA 50309`,
  });

  // The claim RPC binds the attempt to the payer's canonical Stripe customer;
  // without this it raises invoice_checkout_customer_mismatch.
  await admin
    .from('profiles')
    .update({ stripe_customer_id: `cus_sur_${RUN}` })
    .eq('id', SUR.client);

  SUR.project = await insert('projects', {
    name: `${SUR_MARKER} Project`,
    created_by: SUR.designer,
    designer_id: SUR.designer,
    client_id: SUR.client,
    studio_id: SUR.studio,
  });

  const invoice = (number: string, totalCents: number) =>
    insert('invoices', {
      project_id: SUR.project,
      designer_id: SUR.designer,
      client_id: SUR.client,
      studio_id: SUR.studio,
      invoice_number: number,
      status: 'sent',
      currency: 'USD',
      subtotal_cents: totalCents,
      tax_cents: 0,
      total_cents: totalCents,
      amount_paid_cents: 0,
    });

  SUR.invoice = await invoice(`SUR-${RUN}-A`, 100_000);
  SUR.invoiceBig = await invoice(`SUR-${RUN}-B`, 1_000_000);
  SUR.intentInvoice = await invoice(`SUR-${RUN}-C`, 100_000);
  SUR.invoiceLegacy = await invoice(`SUR-${RUN}-D`, 100_000);
}

async function surchargeCleanup() {
  const invoiceIds = [
    SUR.invoice,
    SUR.invoiceBig,
    SUR.intentInvoice,
    SUR.invoiceLegacy,
  ].filter(Boolean);
  if (invoiceIds.length) {
    await admin.from('designer_earnings').delete().in('invoice_id', invoiceIds);
    await admin.from('invoice_payments').delete().in('invoice_id', invoiceIds);
    await admin.from('invoice_checkout_attempts').delete().in('invoice_id', invoiceIds);
    await admin.from('invoices').delete().in('id', invoiceIds);
  }
  if (SUR.project) await admin.from('projects').delete().eq('id', SUR.project);
  if (SUR.studio) {
    await admin.from('studio_billing_settings').delete().eq('studio_id', SUR.studio);
    await admin.from('organization_members').delete().eq('organization_id', SUR.studio);
    await admin.from('organizations').delete().eq('id', SUR.studio);
  }
  await admin
    .from('stripe_webhook_events')
    .delete()
    .in('id', [SUR_EVT.gross, SUR_EVT.net, SUR_EVT.legacy]);
  for (const userId of [SUR.designer, SUR.client, SUR.stranger].filter(Boolean)) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
}

async function claim(invoiceId: string, payerId: string, method: string | null) {
  const { data, error } = await admin.rpc('claim_invoice_checkout_attempt', {
    p_invoice_id: invoiceId,
    p_payer_id: payerId,
    p_stripe_customer_id: `cus_sur_${RUN}`,
    p_allow_designer_test: false,
    p_payment_method: method,
  });
  if (error) throw new Error(`claim failed: ${error.message}`);
  return data as Record<string, unknown>;
}

async function attemptRow(id: string) {
  const { data, error } = await admin
    .from('invoice_checkout_attempts')
    .select('id, state, amount_cents, surcharge_cents, payment_method, failure_reason')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as {
    state: string;
    amount_cents: number;
    surcharge_cents: number;
    payment_method: string | null;
    failure_reason: string | null;
  };
}

async function paymentRow(id: string) {
  const { data, error } = await admin
    .from('invoice_payments')
    .select('id, status, amount_cents, surcharge_cents, stripe_payment_method_type, note')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as {
    status: string;
    amount_cents: number;
    surcharge_cents: number;
    stripe_payment_method_type: string | null;
    note: string | null;
  };
}

/** Signed-in RPC as a specific user (auth.uid() is the whole authorization). */
async function rpcAs(email: string, fn: string, args: Record<string, unknown>) {
  const token = await signIn(email);
  const asUser = createClient(SB_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return await asUser.rpc(fn, args);
}

Deno.test('invoice surcharge rail — claim, supersede, gross settle, check intent', async (t) => {
  await surchargeSeed();
  try {
    // (a) DB — a card claim prices the studio's 2.5%, and leaves amount_cents
    //     as the pure balance. $1,000.00 × 250bps = $25.00.
    await t.step('(DB) card claim carries the studio fee, not a fatter balance', async () => {
      const claimed = await claim(SUR.invoice, SUR.client, 'card');
      SUR.attemptCard = claimed.attempt_id as string;
      SUR.paymentCard = claimed.payment_id as string;
      assertEquals(claimed.amount_cents, 100_000);
      assertEquals(claimed.surcharge_cents, 2_500);
      assertEquals(claimed.payment_method, 'card');
      assertEquals(claimed.superseded_session_id, null);

      const pending = await paymentRow(SUR.paymentCard);
      assertEquals(pending.status, 'pending');
      assertEquals(pending.amount_cents, 100_000); // the ledger books the balance
      assertEquals(pending.surcharge_cents, 2_500); // the fee rides alongside
    });

    // (b) DB — switching rails supersedes the live card attempt and hands back
    //     its session id so create-checkout-session can expire it in Stripe.
    await t.step('(DB) re-claiming on ACH supersedes with payment_method_changed', async () => {
      // Give the card attempt a session pointer, as finalize would.
      await admin
        .from('invoice_checkout_attempts')
        .update({ state: 'session_created', stripe_checkout_session_id: `cs_sur_card_${RUN}` })
        .eq('id', SUR.attemptCard);
      await admin
        .from('invoice_payments')
        .update({ stripe_checkout_session_id: `cs_sur_card_${RUN}` })
        .eq('id', SUR.paymentCard);

      const claimed = await claim(SUR.invoice, SUR.client, 'us_bank_account');
      assertEquals(claimed.payment_method, 'us_bank_account');
      // $1,000.00 is above the $625.00 ACH cap point → flat $5.00.
      assertEquals(claimed.surcharge_cents, 500);
      assertEquals(claimed.superseded_session_id, `cs_sur_card_${RUN}`);

      const superseded = await attemptRow(SUR.attemptCard);
      assertEquals(superseded.state, 'superseded');
      assertEquals(superseded.failure_reason, 'payment_method_changed');
      // Its pending payment row is failed in the same transaction, so the old
      // rail's money can never be applied twice.
      assertEquals((await paymentRow(SUR.paymentCard)).status, 'failed');

      // Re-claim back onto card so the settle steps below run the card rail.
      const back = await claim(SUR.invoice, SUR.client, 'card');
      SUR.attemptCard = back.attempt_id as string;
      SUR.paymentCard = back.payment_id as string;
      assertEquals(back.surcharge_cents, 2_500);
    });

    // (c) DB — the ACH cap is flat above $625.00 regardless of invoice size.
    await t.step('(DB) ACH is capped at $5.00 on a $10,000 invoice', async () => {
      const claimed = await claim(SUR.invoiceBig, SUR.client, 'us_bank_account');
      SUR.attemptBig = claimed.attempt_id as string;
      assertEquals(claimed.amount_cents, 1_000_000);
      assertEquals(claimed.surcharge_cents, 500);
    });

    // (d) DB — the client sees the fee they're about to pay; a stranger cannot
    //     even learn the invoice exists.
    await t.step('(DB) get_invoice_payment_options: client yes, stranger 404', async () => {
      const asClient = await rpcAs(`surcharge-client-${RUN}@example.test`, 'get_invoice_payment_options', {
        p_invoice_id: SUR.invoice,
      });
      assertEquals(asClient.error, null);
      const opts = asClient.data as { card_surcharge_bps: number; check_remit_to: string | null };
      assertEquals(opts.card_surcharge_bps, SUR_CARD_BPS);
      assert(opts.check_remit_to?.includes('1 Remit Way'), 'remit-to reaches the client');

      const asStranger = await rpcAs(
        `surcharge-stranger-${RUN}@example.test`,
        'get_invoice_payment_options',
        { p_invoice_id: SUR.invoice },
      );
      assert(asStranger.error, 'a stranger must be refused');
      assert(
        asStranger.error!.message.includes('invoice_not_found'),
        `expected invoice_not_found, got ${asStranger.error!.message}`,
      );
    });

    // (e) SERVE — the money moment. Stripe reports the GROSS ($1,025.00); the
    //     invoice must settle at the NET ($1,000.00) with the rail stamped.
    await t.step('(SERVE) signed completed at the gross amount settles + stamps the rail', async () => {
      const sessionId = `cs_sur_settle_${RUN}`;
      await admin
        .from('invoice_checkout_attempts')
        .update({ state: 'session_created', stripe_checkout_session_id: sessionId })
        .eq('id', SUR.attemptCard);
      await admin
        .from('invoice_payments')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', SUR.paymentCard);

      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(SUR_EVT.gross, 'checkout.session.completed', {
          id: sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 102_500, // balance + the 2.5% card fee
          currency: 'usd',
          customer: `cus_sur_${RUN}`,
          payment_intent: `pi_sur_gross_${RUN}`,
          payment_method_types: ['card'],
          metadata: {
            payable_type: 'invoice',
            invoice_id: SUR.invoice,
            checkout_attempt_id: SUR.attemptCard,
            payer_id: SUR.client,
            payment_method: 'card',
            surcharge_cents: '2500',
          },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();

      const settled = await paymentRow(SUR.paymentCard);
      assertEquals(settled.status, 'succeeded');
      assertEquals(settled.amount_cents, 100_000);
      assertEquals(settled.surcharge_cents, 2_500);
      assertEquals(settled.stripe_payment_method_type, 'card');
      // Only the balance touches the invoice — the fee is a payment cost.
      assertEquals((await invoiceRow(SUR.invoice)).amount_paid_cents, 100_000);
    });

    // (f) SERVE — the same event billed NET-ONLY is a mismatch. On the CLAIMED
    //     rail the exact-identity gate refuses it before settlement is even
    //     attempted: the webhook 500s (releasing its idempotency claim so Stripe
    //     retries) and nothing is applied to the invoice. requires_refund is the
    //     settle RPC's answer for the un-gated paths — proven in the sibling
    //     invoice_surcharge.assert.sql (S5), not reachable from here.
    await t.step('(SERVE) a net-only amount_total never reaches the invoice', async () => {
      const claimed = await claim(SUR.invoiceBig, SUR.client, 'card');
      const attemptId = claimed.attempt_id as string;
      const paymentId = claimed.payment_id as string;
      assertEquals(claimed.surcharge_cents, 25_000); // $10,000 × 250bps
      const sessionId = `cs_sur_net_${RUN}`;
      await admin
        .from('invoice_checkout_attempts')
        .update({ state: 'session_created', stripe_checkout_session_id: sessionId })
        .eq('id', attemptId);
      await admin
        .from('invoice_payments')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', paymentId);

      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(SUR_EVT.net, 'checkout.session.completed', {
          id: sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 1_000_000, // the fee never made it onto the session
          currency: 'usd',
          customer: `cus_sur_${RUN}`,
          payment_intent: `pi_sur_net_${RUN}`,
          payment_method_types: ['card'],
          metadata: {
            payable_type: 'invoice',
            invoice_id: SUR.invoiceBig,
            checkout_attempt_id: attemptId,
            payer_id: SUR.client,
            payment_method: 'card',
            surcharge_cents: '25000',
          },
        }),
      );
      // Fail closed: the handler throws, the idempotency claim is released, and
      // Stripe is told to retry rather than being silently accepted.
      assertEquals(res.status, 500);
      await res.body?.cancel();
      assertEquals((await paymentRow(paymentId)).status, 'pending');
      assertEquals((await invoiceRow(SUR.invoiceBig)).amount_paid_cents, 0);
      // The claim row was deleted, so a corrected redelivery can still land.
      const { count: claims } = await admin
        .from('stripe_webhook_events')
        .select('id', { count: 'exact', head: true })
        .eq('id', SUR_EVT.net);
      assertEquals(claims ?? 0, 0);
    });

    // (g) SERVE — the legacy path (iOS calls create-checkout-session with only
    //     an invoiceId) must be untouched: no rail, no fee, and Stripe's
    //     amount_total is the bare balance exactly as it was before 00428.
    await t.step('(SERVE) a no-method claim still settles at the bare balance', async () => {
      const claimed = await claim(SUR.invoiceLegacy, SUR.client, null);
      assertEquals(claimed.payment_method, null);
      assertEquals(claimed.surcharge_cents, 0);
      const attemptId = claimed.attempt_id as string;
      const paymentId = claimed.payment_id as string;
      const sessionId = `cs_sur_legacy_${RUN}`;
      await admin
        .from('invoice_checkout_attempts')
        .update({ state: 'session_created', stripe_checkout_session_id: sessionId })
        .eq('id', attemptId);
      await admin
        .from('invoice_payments')
        .update({ stripe_checkout_session_id: sessionId })
        .eq('id', paymentId);

      const res = await postSigned(
        WEBHOOK_URL,
        stripeEvent(SUR_EVT.legacy, 'checkout.session.completed', {
          id: sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 100_000, // no fee — the pre-surcharge contract
          currency: 'usd',
          customer: `cus_sur_${RUN}`,
          payment_intent: `pi_sur_legacy_${RUN}`,
          // A legacy session offers both rails and stamps no payment_method.
          payment_method_types: ['card', 'us_bank_account'],
          metadata: {
            payable_type: 'invoice',
            invoice_id: SUR.invoiceLegacy,
            checkout_attempt_id: attemptId,
            payer_id: SUR.client,
          },
        }),
      );
      assertEquals(res.status, 200);
      await res.body?.cancel();

      const settled = await paymentRow(paymentId);
      assertEquals(settled.status, 'succeeded');
      assertEquals(settled.amount_cents, 100_000);
      assertEquals(settled.surcharge_cents, 0);
      // Nothing was claimed, so the rail is inferred: an immediately-paid
      // completion on a card+ACH session was a card.
      assertEquals(settled.stripe_payment_method_type, 'card');
      assertEquals((await invoiceRow(SUR.invoiceLegacy)).amount_paid_cents, 100_000);
    });

    // (h) SERVE — "a check is coming" notifies the designer exactly once a day,
    //     writes no ledger row, and stays invisible to anyone but the client.
    await t.step('(SERVE) invoice-check-intent notifies once and is idempotent', async () => {
      const clientToken = await signIn(`surcharge-client-${RUN}@example.test`);
      const post = (token: string) =>
        fetch(CHECK_INTENT_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ invoiceId: SUR.intentInvoice }),
        });

      const first = await post(clientToken);
      assertEquals(first.status, 200);
      const firstBody = await first.json();
      assertEquals(firstBody.ok, true);
      assertEquals(firstBody.alreadyNotified, false);

      const second = await post(clientToken);
      assertEquals(second.status, 200);
      const secondBody = await second.json();
      assertEquals(secondBody.alreadyNotified, true);

      // Exactly one in_app notice for the designer, and no money booked.
      const { data: notices } = await admin
        .from('notification_log')
        .select('metadata')
        .eq('user_id', SUR.designer)
        .eq('type', 'invoice_check_intent')
        .eq('channel', 'in_app');
      assertEquals(
        (notices as { metadata: Record<string, unknown> }[]).filter(
          (r) => r.metadata?.invoice_id === SUR.intentInvoice,
        ).length,
        1,
      );
      const { count: payments } = await admin
        .from('invoice_payments')
        .select('id', { count: 'exact', head: true })
        .eq('invoice_id', SUR.intentInvoice);
      assertEquals(payments ?? 0, 0);
      assertEquals((await invoiceRow(SUR.intentInvoice)).status, 'sent');

      // A stranger is told nothing at all.
      const strangerToken = await signIn(`surcharge-stranger-${RUN}@example.test`);
      const denied = await post(strangerToken);
      assertEquals(denied.status, 404);
      assertEquals((await denied.json()).error, 'invoice_not_found');
    });
  } finally {
    await surchargeCleanup();
  }
});
