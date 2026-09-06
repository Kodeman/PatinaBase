import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkoutCustomerFailureBody,
  ensureLinkStripeCustomer,
  ensureStripeCustomer,
} from './invoice-checkout-stripe.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

/**
 * A minimal supabase-js stand-in: `from(table)` chains resolve to the next
 * queued result for that table; `rpc` records its calls and answers from a
 * queue. Every call the two customer helpers make is a terminal
 * `.maybeSingle()` or an awaited update chain.
 */
function fakeAdmin(queues: Record<string, Array<{ data?: unknown; error?: { message: string } | null }>>) {
  const calls: Array<{ table?: string; op: string; args?: unknown }> = [];
  const next = (key: string) => {
    const q = queues[key] ?? [];
    return q.length ? q.shift()! : { data: null, error: null };
  };
  const chain = (table: string, op: string, args?: unknown) => {
    calls.push({ table, op, args });
    const self: Any = {
      select: () => self,
      eq: () => self,
      is: () => self,
      update: (patch: unknown) => chain(table, 'update', patch),
      maybeSingle: () => Promise.resolve(next(`${table}:${op}`)),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(next(`${table}:${op}`)).then(resolve),
    };
    return self;
  };
  return {
    calls,
    admin: {
      from: (table: string) => ({
        select: () => chain(table, 'select'),
        update: (patch: unknown) => chain(table, 'update', patch),
      }),
      rpc: (name: string, args: unknown) => {
        calls.push({ op: `rpc:${name}`, args });
        return Promise.resolve(next(`rpc:${name}`));
      },
    } as Any,
  };
}

function fakeStripe(behaviour: 'ok' | 'throw' = 'ok') {
  const created: Array<{ params: unknown; options: unknown }> = [];
  return {
    created,
    stripe: {
      customers: {
        create: (params: unknown, options: unknown) => {
          created.push({ params, options });
          if (behaviour === 'throw') return Promise.reject(new Error('stripe is down'));
          return Promise.resolve({ id: 'cus_new' });
        },
      },
    } as Any,
  };
}

Deno.test('link customer: created with a name and NO email, persisted through the compare-and-set RPC', async () => {
  const { admin, calls } = fakeAdmin({
    'invoice_links:select': [{ data: { id: 'link-1', stripe_customer_id: null }, error: null }],
    'rpc:set_invoice_link_stripe_customer': [{ data: 'cus_new', error: null }],
  });
  const { stripe, created } = fakeStripe();
  assertEquals(await ensureLinkStripeCustomer(admin, stripe, 'link-1', ' Harper Guest '), {
    ok: true,
    customerId: 'cus_new',
  });
  assertEquals(created.length, 1);
  assertEquals(created[0].params, { name: 'Harper Guest', metadata: { invoice_link_id: 'link-1' } });
  assertEquals('email' in (created[0].params as Record<string, unknown>), false);
  assertEquals(created[0].options, { idempotencyKey: 'patina-invoice-link-customer:link-1' });
  assertEquals(calls.at(-1), {
    op: 'rpc:set_invoice_link_stripe_customer',
    args: { p_link_id: 'link-1', p_stripe_customer_id: 'cus_new' },
  });
});

Deno.test('link customer: the canonical winner is used, never the unpersisted candidate', async () => {
  const { admin } = fakeAdmin({
    'invoice_links:select': [{ data: { id: 'link-1', stripe_customer_id: null }, error: null }],
    'rpc:set_invoice_link_stripe_customer': [{ data: 'cus_first_writer', error: null }],
  });
  assertEquals(await ensureLinkStripeCustomer(admin, fakeStripe().stripe, 'link-1', null), {
    ok: true,
    customerId: 'cus_first_writer',
  });
});

Deno.test('link customer: an existing customer is reused without a Stripe call', async () => {
  const { admin } = fakeAdmin({
    'invoice_links:select': [{ data: { id: 'link-1', stripe_customer_id: 'cus_existing' }, error: null }],
    'rpc:set_invoice_link_stripe_customer': [{ data: 'cus_existing', error: null }],
  });
  const { stripe, created } = fakeStripe();
  assertEquals((await ensureLinkStripeCustomer(admin, stripe, 'link-1', 'x')).ok, true);
  assertEquals(created.length, 0);
});

Deno.test('link customer: failures are named and never leak past the helper', async () => {
  const missing = fakeAdmin({ 'invoice_links:select': [{ data: null, error: null }] });
  assertEquals(await ensureLinkStripeCustomer(missing.admin, fakeStripe().stripe, 'link-x', null), {
    ok: false,
    error: 'invoice_link_not_found',
    status: 500,
  });

  const persist = fakeAdmin({
    'invoice_links:select': [{ data: { id: 'link-1', stripe_customer_id: null }, error: null }],
    'rpc:set_invoice_link_stripe_customer': [{ data: null, error: { message: 'rpc down' } }],
  });
  assertEquals(await ensureLinkStripeCustomer(persist.admin, fakeStripe().stripe, 'link-1', null), {
    ok: false,
    error: 'customer_persistence_failed',
    detail: 'Checkout was not opened.',
    status: 500,
  });

  const thrown = fakeAdmin({
    'invoice_links:select': [{ data: { id: 'link-1', stripe_customer_id: null }, error: null }],
  });
  assertEquals(await ensureLinkStripeCustomer(thrown.admin, fakeStripe('throw').stripe, 'link-1', null), {
    ok: false,
    error: 'stripe_error',
    status: 502,
    detail: 'stripe is down',
  });
});

Deno.test('payer customer: keyed on the explicit payer id; an existing id short-circuits Stripe', async () => {
  const { admin } = fakeAdmin({
    'profiles:select': [
      { data: { id: 'client-1', email: 'h@test.invalid', full_name: 'Harper', stripe_customer_id: 'cus_h' }, error: null },
      { data: { stripe_customer_id: 'cus_h' }, error: null },
    ],
  });
  const { stripe, created } = fakeStripe();
  assertEquals(await ensureStripeCustomer(admin, stripe, 'client-1'), { ok: true, customerId: 'cus_h' });
  assertEquals(created.length, 0);
});

Deno.test('payer customer: a fresh profile gets a customer WITH its email, compare-and-set on the profile', async () => {
  const { admin, calls } = fakeAdmin({
    'profiles:select': [
      { data: { id: 'client-1', email: 'h@test.invalid', full_name: 'Harper', stripe_customer_id: null }, error: null },
      { data: { stripe_customer_id: 'cus_new' }, error: null },
    ],
    'profiles:update': [{ error: null }],
  });
  const { stripe, created } = fakeStripe();
  assertEquals(await ensureStripeCustomer(admin, stripe, 'client-1'), { ok: true, customerId: 'cus_new' });
  assertEquals(created[0].params, { email: 'h@test.invalid', name: 'Harper', metadata: { profile_id: 'client-1' } });
  assertEquals(created[0].options, { idempotencyKey: 'patina-profile-customer:client-1' });
  assertEquals(calls.some((c) => c.table === 'profiles' && c.op === 'update'), true);
});

Deno.test('payer customer: a missing profile is payer_profile_not_found', async () => {
  const { admin } = fakeAdmin({ 'profiles:select': [{ data: null, error: null }] });
  assertEquals(await ensureStripeCustomer(admin, fakeStripe().stripe, 'nobody'), {
    ok: false,
    error: 'payer_profile_not_found',
    status: 500,
  });
});

Deno.test('failure body: the same keys the signed-in path always sent', () => {
  assertEquals(checkoutCustomerFailureBody({ ok: false, error: 'payer_profile_not_found', status: 500 }), {
    error: 'payer_profile_not_found',
  });
  assertEquals(
    checkoutCustomerFailureBody({ ok: false, error: 'stripe_error', status: 502, detail: 'down' }),
    { error: 'stripe_error', detail: 'down' }
  );
});
