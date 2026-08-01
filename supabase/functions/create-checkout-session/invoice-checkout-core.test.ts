import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type InvoiceCheckoutAttempt,
  type InvoiceCheckoutGateway,
  InvoiceCheckoutIntegrityError,
  type InvoiceCheckoutSession,
  runInvoiceCheckout,
} from './invoice-checkout-core.ts';

function attempt(overrides: Partial<InvoiceCheckoutAttempt> = {}): InvoiceCheckoutAttempt {
  return {
    attemptId: 'attempt-1',
    paymentId: 'payment-1',
    invoiceId: 'invoice-1',
    payerId: 'client-1',
    stripeCustomerId: 'cus_client_1',
    amountCents: 12_500,
    currency: 'usd',
    state: 'claimed',
    stripeIdempotencyKey: 'invoice-checkout:attempt-1',
    stripeCheckoutSessionId: null,
    ...overrides,
  };
}

function sessionFor(
  claimed: InvoiceCheckoutAttempt,
  overrides: Partial<InvoiceCheckoutSession> = {}
): InvoiceCheckoutSession {
  return {
    id: 'cs_attempt_1',
    status: 'open',
    paymentStatus: 'unpaid',
    url: 'https://checkout.stripe.test/cs_attempt_1',
    amountTotal: claimed.amountCents,
    currency: claimed.currency,
    customerId: claimed.stripeCustomerId,
    metadata: {
      payable_type: 'invoice',
      invoice_id: claimed.invoiceId,
      checkout_attempt_id: claimed.attemptId,
      payer_id: claimed.payerId,
    },
    ...overrides,
  };
}

Deno.test(
  'invoice Checkout: concurrent tabs share one claim, idempotency key, session, and payment identity',
  async () => {
    const claimed = attempt();
    const createdByKey = new Map<string, InvoiceCheckoutSession>();
    const createKeys: string[] = [];
    let finalizeCalls = 0;

    const gateway = (): InvoiceCheckoutGateway => ({
      claim: async () => ({ ...claimed }),
      retrieveSession: async () => {
        throw new Error('not expected');
      },
      createSession: async (value) => {
        createKeys.push(value.stripeIdempotencyKey);
        await Promise.resolve(); // place both tabs on the create boundary
        const existing = createdByKey.get(value.stripeIdempotencyKey);
        if (existing) return existing;
        const created = sessionFor(value);
        createdByKey.set(value.stripeIdempotencyKey, created);
        return created;
      },
      finalize: async (value, sessionId) => {
        finalizeCalls += 1;
        return {
          ...value,
          state: 'session_created',
          stripeCheckoutSessionId: sessionId,
        };
      },
      failExpired: async () => {
        throw new Error('not expected');
      },
    });

    const [left, right] = await Promise.all([
      runInvoiceCheckout(gateway()),
      runInvoiceCheckout(gateway()),
    ]);

    assertEquals(left.kind, 'ready');
    assertEquals(right.kind, 'ready');
    if (left.kind !== 'ready' || right.kind !== 'ready') return;
    assertEquals(left.session.id, right.session.id);
    assertEquals(left.attempt.attemptId, right.attempt.attemptId);
    assertEquals(left.attempt.paymentId, right.attempt.paymentId);
    assertEquals(createKeys, [claimed.stripeIdempotencyKey, claimed.stripeIdempotencyKey]);
    assertEquals(createdByKey.size, 1);
    assertEquals(finalizeCalls, 2); // finalize RPC is itself exact-idempotent
  }
);

Deno.test(
  'invoice Checkout: exact open session reuse returns authoritative identities',
  async () => {
    const claimed = attempt({
      state: 'session_created',
      stripeCheckoutSessionId: 'cs_attempt_1',
    });
    const result = await runInvoiceCheckout({
      claim: async () => claimed,
      retrieveSession: async () => sessionFor(claimed),
      createSession: async () => {
        throw new Error('must reuse');
      },
      finalize: async () => {
        throw new Error('already finalized');
      },
      failExpired: async () => {
        throw new Error('not expired');
      },
    });
    assertEquals(result.kind, 'ready');
    if (result.kind === 'ready') {
      assertEquals(result.reused, true);
      assertEquals(result.attempt.amountCents, 12_500);
      assertEquals(result.attempt.paymentId, 'payment-1');
      assertEquals(result.session.id, 'cs_attempt_1');
    }
  }
);

Deno.test('invoice Checkout: completed card/webhook lag and ACH both stay processing', async () => {
  const claimed = attempt({
    state: 'processing',
    stripeCheckoutSessionId: 'cs_attempt_1',
  });
  for (const paymentStatus of ['paid', 'unpaid'] as const) {
    const result = await runInvoiceCheckout({
      claim: async () => claimed,
      retrieveSession: async () =>
        sessionFor(claimed, {
          status: 'complete',
          paymentStatus,
          url: null,
        }),
      createSession: async () => {
        throw new Error('not expected');
      },
      finalize: async () => {
        throw new Error('not expected');
      },
      failExpired: async () => {
        throw new Error('not expected');
      },
    });
    assertEquals(result.kind, 'processing');
    assertEquals(result.attempt.paymentId, 'payment-1');
  }
});

Deno.test('invoice Checkout: payer/customer/attempt tampering is never reused', async () => {
  const claimed = attempt({
    stripeCheckoutSessionId: 'cs_attempt_1',
    state: 'session_created',
  });
  for (const badSession of [
    sessionFor(claimed, { customerId: 'cus_foreign' }),
    sessionFor(claimed, {
      metadata: {
        ...sessionFor(claimed).metadata,
        payer_id: 'foreign-client',
      },
    }),
    sessionFor(claimed, {
      metadata: {
        ...sessionFor(claimed).metadata,
        checkout_attempt_id: 'attempt-foreign',
      },
    }),
  ]) {
    await assertRejects(
      () =>
        runInvoiceCheckout({
          claim: async () => claimed,
          retrieveSession: async () => badSession,
          createSession: async () => badSession,
          finalize: async (value) => value,
          failExpired: async () => {},
        }),
      InvoiceCheckoutIntegrityError,
      'does not belong'
    );
  }
});

Deno.test('invoice Checkout: amount/currency drift fails closed', async () => {
  const claimed = attempt({
    stripeCheckoutSessionId: 'cs_attempt_1',
    state: 'session_created',
  });
  await assertRejects(
    () =>
      runInvoiceCheckout({
        claim: async () => claimed,
        retrieveSession: async () => sessionFor(claimed, { amountTotal: 12_501 }),
        createSession: async () => sessionFor(claimed),
        finalize: async (value) => value,
        failExpired: async () => {},
      }),
    InvoiceCheckoutIntegrityError,
    'authoritative claimed invoice balance'
  );
});

Deno.test('invoice Checkout: persistence failure never returns a usable Stripe URL', async () => {
  const claimed = attempt();
  await assertRejects(
    () =>
      runInvoiceCheckout({
        claim: async () => claimed,
        retrieveSession: async () => sessionFor(claimed),
        createSession: async () => sessionFor(claimed),
        finalize: async () => {
          throw new Error('database unavailable after Stripe create');
        },
        failExpired: async () => {},
      }),
    InvoiceCheckoutIntegrityError,
    'database unavailable after Stripe create'
  );
});

Deno.test('invoice Checkout: expired exact session is closed before one fresh claim', async () => {
  const expired = attempt({
    attemptId: 'attempt-expired',
    paymentId: 'payment-expired',
    stripeIdempotencyKey: 'invoice-checkout:attempt-expired',
    stripeCheckoutSessionId: 'cs_expired',
    state: 'session_created',
  });
  const fresh = attempt();
  let claims = 0;
  const failed: string[] = [];
  const result = await runInvoiceCheckout({
    claim: async () => (++claims === 1 ? expired : fresh),
    retrieveSession: async () =>
      sessionFor(expired, {
        id: 'cs_expired',
        status: 'expired',
        url: null,
      }),
    createSession: async (value) => sessionFor(value),
    finalize: async (value, sessionId) => ({
      ...value,
      state: 'session_created',
      stripeCheckoutSessionId: sessionId,
    }),
    failExpired: async (value) => {
      failed.push(value.attemptId);
    },
  });
  assertEquals(result.kind, 'ready');
  assertEquals(claims, 2);
  assertEquals(failed, ['attempt-expired']);
});
