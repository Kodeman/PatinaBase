import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type InvoiceCheckoutAttempt,
  type InvoiceCheckoutGateway,
  InvoiceCheckoutIntegrityError,
  type InvoiceCheckoutSession,
  invoiceCheckoutReturnUrl,
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
    // Defaults describe a LEGACY attempt: no rail, no fee. Every pre-surcharge
    // assertion below must keep passing untouched against these defaults.
    surchargeCents: 0,
    paymentMethod: null,
    currency: 'usd',
    state: 'claimed',
    stripeIdempotencyKey: 'invoice-checkout:attempt-1',
    stripeCheckoutSessionId: null,
    supersededSessionId: null,
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
    // Stripe bills the gross: claimed balance + rail fee.
    amountTotal: claimed.amountCents + claimed.surchargeCents,
    currency: claimed.currency,
    customerId: claimed.stripeCustomerId,
    metadata: {
      payable_type: 'invoice',
      invoice_id: claimed.invoiceId,
      checkout_attempt_id: claimed.attemptId,
      payer_id: claimed.payerId,
      // A legacy attempt stamps no rail keys at all — the session stays byte
      // identical to the pre-surcharge one.
      ...(claimed.paymentMethod
        ? {
            payment_method: claimed.paymentMethod,
            surcharge_cents: String(claimed.surchargeCents),
          }
        : {}),
    },
    ...overrides,
  };
}

Deno.test('invoice Checkout: both return paths carry exact local attempt evidence', () => {
  const claimed = attempt({ attemptId: 'attempt / one', paymentId: 'payment?one' });
  assertEquals(
    invoiceCheckoutReturnUrl('https://client.test/invoices/one?checkout=cancelled', claimed),
    'https://client.test/invoices/one?checkout=cancelled&checkout_attempt_id=attempt%20%2F%20one&payment_id=payment%3Fone'
  );
  assertEquals(
    invoiceCheckoutReturnUrl('https://client.test/invoices/one', claimed),
    'https://client.test/invoices/one?checkout_attempt_id=attempt%20%2F%20one&payment_id=payment%3Fone'
  );
});

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

// ── Surcharge (00428) ───────────────────────────────────────────────────────
// The rail chooser charges balance + fee. The three checkpoints that used to
// assert "session total == claimed balance" now assert "== balance + fee", and
// a rail-bound attempt additionally pins the rail into the session metadata.

Deno.test('invoice Checkout: a card-surcharged session matches at the gross amount', async () => {
  // $125.00 balance @ 300 bps → $3.75 fee → $128.75 charged.
  const claimed = attempt({
    surchargeCents: 375,
    paymentMethod: 'card',
    stripeCheckoutSessionId: 'cs_attempt_1',
    state: 'session_created',
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
    failExpired: async () => {},
  });
  assertEquals(result.kind, 'ready');
  if (result.kind === 'ready') {
    assertEquals(result.session.amountTotal, 12_875);
    // The invoice-applied amount stays the pure balance — the fee never
    // inflates what the ledger will book.
    assertEquals(result.attempt.amountCents, 12_500);
    assertEquals(result.attempt.surchargeCents, 375);
  }
});

Deno.test('invoice Checkout: a session billed net-only on a surcharged attempt fails closed', async () => {
  const claimed = attempt({
    surchargeCents: 375,
    paymentMethod: 'card',
    stripeCheckoutSessionId: 'cs_attempt_1',
    state: 'session_created',
  });
  for (const amountTotal of [
    12_500, // the fee was silently dropped
    13_250, // the fee was applied twice-over / a stale rate
  ]) {
    await assertRejects(
      () =>
        runInvoiceCheckout({
          claim: async () => claimed,
          retrieveSession: async () => sessionFor(claimed, { amountTotal }),
          createSession: async () => sessionFor(claimed),
          finalize: async (value) => value,
          failExpired: async () => {},
        }),
      InvoiceCheckoutIntegrityError,
      'authoritative claimed invoice balance'
    );
  }
});

Deno.test('invoice Checkout: an ACH-capped attempt matches at balance + $5', async () => {
  // Above the $625 cap point, ACH is a flat $5 — the assertion follows the DB,
  // it does not recompute the formula.
  const claimed = attempt({
    amountCents: 1_000_000,
    surchargeCents: 500,
    paymentMethod: 'us_bank_account',
    stripeCheckoutSessionId: 'cs_attempt_1',
    state: 'session_created',
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
    failExpired: async () => {},
  });
  assertEquals(result.kind, 'ready');
  if (result.kind === 'ready') assertEquals(result.session.amountTotal, 1_000_500);
});

Deno.test('invoice Checkout: a tampered rail in session metadata is never reused', async () => {
  const claimed = attempt({
    surchargeCents: 375,
    paymentMethod: 'card',
    stripeCheckoutSessionId: 'cs_attempt_1',
    state: 'session_created',
  });
  // Swapping the stamped rail (or dropping it) would let an ACH-priced session
  // be presented for a card-priced claim.
  for (const badMetadata of [
    { ...sessionFor(claimed).metadata, payment_method: 'us_bank_account' },
    (() => {
      const meta = { ...sessionFor(claimed).metadata };
      delete meta.payment_method;
      return meta;
    })(),
  ]) {
    await assertRejects(
      () =>
        runInvoiceCheckout({
          claim: async () => claimed,
          retrieveSession: async () => sessionFor(claimed, { metadata: badMetadata }),
          createSession: async () => sessionFor(claimed),
          finalize: async (value) => value,
          failExpired: async () => {},
        }),
      InvoiceCheckoutIntegrityError,
      'does not belong'
    );
  }
});

Deno.test(
  'invoice Checkout: a legacy attempt ignores rail metadata Stripe may carry',
  async () => {
    // No rail claimed ⇒ the payment_method comparison drops out entirely, so an
    // extra key (an old session, a Stripe-side addition) cannot break reuse.
    const claimed = attempt({
      stripeCheckoutSessionId: 'cs_attempt_1',
      state: 'session_created',
    });
    const result = await runInvoiceCheckout({
      claim: async () => claimed,
      retrieveSession: async () =>
        sessionFor(claimed, {
          metadata: {
            ...sessionFor(claimed).metadata,
            payment_method: 'card',
            some_future_key: 'whatever',
          },
        }),
      createSession: async () => {
        throw new Error('must reuse');
      },
      finalize: async () => {
        throw new Error('already finalized');
      },
      failExpired: async () => {},
    });
    assertEquals(result.kind, 'ready');
    if (result.kind === 'ready') assertEquals(result.session.amountTotal, 12_500);
  }
);

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
