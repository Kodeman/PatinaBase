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
  payPaid: '', // PO_A deposit → paid via checkout.session.completed (tests b, d, e1)
  payFail: '', // PO_B balance → async_payment_failed (test c)
  payNonCatalog: '', // PO_C deposit → create-checkout 422
  payAlreadyPaid: '', // PO_D deposit, state=paid → create-checkout 409
  invoice: '',
  invPay: '',
};
const EVT = {
  inv: `evt_inv_${RUN}`,
  poPaid: `evt_po_paid_${RUN}`,
  poPaidPi: `evt_po_paid_pi_${RUN}`, // DISTINCT event, same PI as poPaid — exercises the settle guard
  poFail: `evt_po_fail_${RUN}`,
};
const SESS = {
  inv: `cs_inv_${RUN}`,
  poPaid: `cs_po_paid_${RUN}`,
  poFail: `cs_po_fail_${RUN}`,
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

  const po = (tag: string, isCatalog: boolean, pattern = 'fifty_fifty') =>
    insert('purchase_orders', {
      designer_id: ids.designerA,
      project_id: ids.project,
      vendor_id: ids.vendor,
      payment_pattern: pattern,
      total_cents: 10000,
      status: 'confirmed',
      is_patina_catalog: isCatalog,
      po_number: `PO-${MARKER}-${tag}`,
      notes: MARKER,
    });

  ids.poA = await po('A', true);
  ids.poB = await po('B', true);
  ids.poC = await po('C', false);
  ids.poD = await po('D', true);

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
}

async function cleanup() {
  const payIds = [ids.payPaid, ids.payFail, ids.payNonCatalog, ids.payAlreadyPaid].filter(Boolean);
  const poIds = [ids.poA, ids.poB, ids.poC, ids.poD].filter(Boolean);
  if (payIds.length) await admin.from('procurement_notifications').delete().in('subject_payment_id', payIds);
  if (ids.invoice) {
    await admin.from('designer_earnings').delete().eq('invoice_id', ids.invoice);
    await admin.from('invoice_payments').delete().eq('invoice_id', ids.invoice);
    await admin.from('invoices').delete().eq('id', ids.invoice);
  }
  if (payIds.length) await admin.from('po_payments').delete().in('id', payIds);
  if (poIds.length) await admin.from('purchase_orders').delete().in('id', poIds);
  if (ids.project) await admin.from('projects').delete().eq('id', ids.project);
  if (ids.vendor) await admin.from('vendors').delete().eq('id', ids.vendor);
  await admin.from('stripe_webhook_events').delete().in('id', [EVT.inv, EVT.poPaid, EVT.poPaidPi, EVT.poFail]);
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
  } finally {
    await cleanup();
  }
});
