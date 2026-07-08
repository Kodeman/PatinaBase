# Task 0 report — Orders service serves cleanly without Stripe credentials

## Why boot currently succeeds today (root cause)

Traced the full path from env var to Stripe SDK call:

1. `services/orders/src/config/configuration.ts` maps `STRIPE_SECRET_KEY` into a **nested** config
   namespace: `stripe.secretKey` (line 26). It never registers a top-level `STRIPE_SECRET_KEY` key.
2. `services/orders/src/config/stripe.module.ts` (before this change) called
   `configService.get<string>('STRIPE_SECRET_KEY')!` — the **raw env var name**, not `'stripe.secretKey'`.
3. `@nestjs/config`'s `ConfigService.get()` (traced in
   `node_modules/.pnpm/@nestjs+config@3.3.0.../dist/config.service.js`) resolves in this order:
   validated-env → `process.env[propertyPath]` → internal custom-config object → default. For
   `'STRIPE_SECRET_KEY'` with the var unset: `process.env.STRIPE_SECRET_KEY` is `undefined`, and
   `internalConfig['STRIPE_SECRET_KEY']` doesn't exist either (only `internalConfig.stripe.secretKey`
   does, wrong path). So `.get()` returns `undefined`. The `!` non-null assertion is a **compile-time**
   assertion only — it does nothing at runtime.
4. So the old code ran `new Stripe(undefined, { apiVersion: ..., typescript: true })`.
5. Traced the Stripe Node SDK constructor (`stripe@14.25.0/cjs/stripe.core.js`): `_setApiKey(key)` is
   `if (key) { this._setApiField('auth', ...) }` — **no validation, no throw** when `key` is falsy. It
   just leaves `this._api.auth = null`. Empty string behaves identically to `undefined` here (both
   falsy).

Net effect: `new Stripe(undefined, ...)` **succeeds silently** and produces a fully-formed but
unauthenticated Stripe client. The app boots fine (matches the observed 200 healthy Worker). The
failure only surfaces the first time a Stripe-touching code path actually calls the API — e.g. the old
`webhooks.service.ts` would throw `TypeError: Cannot read properties of null (reading 'webhooks')`
inside `stripe.webhooks.constructEvent`, which the existing `catch` block in `handleStripeWebhook`
swallows into a generic `BadRequestException('Webhook signature verification failed')` — a genuinely
misleading 400 with no hint that the real problem is a missing API key. Confirmed this exact failure
mode with a red test before fixing it (see below).

## What changed

### 1. `services/orders/src/config/stripe.module.ts`
- `STRIPE_CLIENT` factory now returns `null` when `STRIPE_SECRET_KEY` is unset or empty, instead of
  constructing a Stripe client with a missing key.
- Added `export function assertStripeConfigured(stripe: Stripe | null): asserts stripe is Stripe` —
  throws `new ServiceUnavailableException('stripe_not_configured: ...')` (HTTP 503, body contains
  `stripe_not_configured`) when the client is `null`. One shared helper, per the brief, instead of five
  ad hoc checks.

### 2. Guarded the 5 Stripe-touching modules
Added `assertStripeConfigured(this.stripe);` as the **first line** of every method that calls into the
Stripe SDK — before any DB reads/writes — so a misconfigured environment fails fast with a clear 503
and zero side effects, rather than a late/confusing failure partway through:

- `modules/checkout/checkout.service.ts`: `createCheckoutSession`, `createPaymentIntent`
  (`getOrCreateStripeCoupon` is only reachable from `createCheckoutSession`, so it's covered
  transitively).
- `modules/payments/payments.service.ts`: `capturePayment`, `cancelPayment`, `getPaymentIntent`.
  (`findByOrder` is DB-only and intentionally left unguarded — still works with Stripe unset.)
- `modules/refunds/refunds.service.ts`: `createRefund`. (`findByOrder`, `getRefundStats` are DB-only,
  left unguarded.)
- `modules/webhooks/webhooks.service.ts`: `handleStripeWebhook` (the sole Stripe entry point in that
  service; all the private `handle*` methods are only reachable from it).
- `modules/reconciliation/reconciliation.service.ts`: see below — special-cased per the brief.

### 3. Reconciliation: cron vs. manual trigger split
The brief requires the cron to skip silently (no crash-loop) while the module still fails fast for
request paths. Both were previously the same method (`@Cron`-decorated `runReconciliation()`, also
called directly by `ReconciliationController.run()` for `POST /reconciliation/run`). Split into two:

- `runReconciliation()` — unchanged name/signature, still what the controller calls. Now starts with
  `assertStripeConfigured(this.stripe)`, so the manual HTTP trigger gets a 503 when unconfigured.
- `scheduledReconciliation()` — new method, now carries the `@Cron(CronExpression.EVERY_6_HOURS)`
  decorator. Checks `if (!this.stripe)`, logs a warning, and returns without throwing; otherwise
  delegates to `runReconciliation()`.

`ReconciliationController` was not touched — it already calls `runReconciliation()` by name, which
still exists with the same signature.

### 4. Environment fix required to run tests at all (see "Deviation" below)
Created `/jest.config.cjs` at the repo root — see next section for why.

## Deviation from the brief: missing root `jest.config.cjs`

The brief's "known repo gotcha" says: *"root-level jest.config.cjs is broken for some workspace-filtered
runs; run jest from within services/orders if the workspace filter misbehaves."* Investigation found
this understates the problem: **the file does not exist anywhere in git history, on any branch,** and
every one of the 6 workspace configs that `require('../../jest.config.cjs')`
(`services/orders`, `services/media`, `services/projects`, `packages/types`, `packages/utils`) fails
immediately with `Cannot find module '../../jest.config.cjs'` — regardless of cwd, so "run jest from
within services/orders" does not actually work as stated.

Since this made it impossible to run *any* jest suite for `services/orders` (blocking the entire test
requirement of this task), I restored a conventional base config at the repo root: `testEnvironment:
'node'`, ts-jest transform, `testRegex: '.*\\.spec\\.ts$'`, `testPathIgnorePatterns` excluding
`/test/` (so the pre-existing, already-broken `test/integration/*.e2e.spec.ts` — which imports a
`@patina/testing` package that doesn't exist anywhere in the workspace — stays out of the default
`test` run, matching its apparent original intent of running only under the separate `test:e2e`
config). This is a minimal, additive, non-destructive fix (a missing file, not a design decision I'm
overriding) and is committed as a separate `chore(test):` commit from the actual Stripe fix, so it's
easy to review/revert independently.

Also had to build `@patina/utils`, `@patina/types`, `@patina/cache`, and `@patina/auth`
(`pnpm --filter <pkg> build`) — this fresh worktree had no `dist/` output for any workspace package,
and several of these resolve to their compiled `dist/` via `package.json` `main` (same pattern
CLAUDE.md documents for portal deploys). This is a one-time local build step, not a code change —
nothing under `packages/` was modified.

## Tests added (TDD: red confirmed before each fix)

- `services/orders/src/config/stripe.module.spec.ts` (new) — `StripeModule` boots without throwing
  and resolves `STRIPE_CLIENT` to `null` for unset/empty `STRIPE_SECRET_KEY`; constructs a real
  `Stripe` instance when a key is present; `assertStripeConfigured` throws a 503 with
  `stripe_not_configured` in the body for `null`, and is a no-op for a configured client. This is the
  "focused module test" satisfying requirement 4's first bullet (app/module bootstraps without throw).
- `services/orders/src/modules/checkout/checkout.service.spec.ts` (extended) — new describe block:
  `createCheckoutSession` and `createPaymentIntent` both reject with a 503
  (`ServiceUnavailableException`, body contains `stripe_not_configured`) when `STRIPE_CLIENT` is
  `null`, and do so **before** calling `prisma.cart.findUnique` (asserted `not.toHaveBeenCalled()`).
  This is requirement 4's second bullet.
- `services/orders/src/modules/payments/payments.service.spec.ts` (new) — `capturePayment`,
  `cancelPayment`, `getPaymentIntent` all 503 fast (no DB call first); `findByOrder` (non-Stripe)
  still works with Stripe unconfigured.
- `services/orders/src/modules/refunds/refunds.service.spec.ts` (new) — `createRefund` 503s fast;
  `findByOrder` (non-Stripe) still works.
- `services/orders/src/modules/webhooks/webhooks.stripe-guard.spec.ts` (new, separate from the two
  pre-existing webhook spec files — see below) — `handleStripeWebhook` 503s with `stripe_not_configured`
  when unconfigured.
- `services/orders/src/modules/reconciliation/reconciliation.service.spec.ts` (new) —
  `runReconciliation()` (manual/HTTP path) 503s fast, no DB write; `scheduledReconciliation()` (the
  `@Cron` method) logs a warning and resolves without throwing when unconfigured, and delegates to
  `runReconciliation()` when Stripe *is* configured.

For every guard added, I first ran the new test against the pre-fix code to confirm a red failure with
the *old*, unclear error (404s from downstream DB lookups reached before any Stripe call, a raw
`TypeError`/`BadRequestException` from the webhook path, etc.), then implemented the guard and
confirmed green. Full red/green transcripts are in the session; representative example: the webhook
guard test initially failed with

```
[ERROR] Webhook signature verification failed: Cannot read properties of null (reading 'webhooks')
Expected constructor: ServiceUnavailableException
Received constructor: BadRequestException
```

which is precisely the "late, unclear failure" the brief describes.

## Test evidence

Command: `cd services/orders && npx jest --silent` (also verified `pnpm --filter @patina/orders test`
gives identical results).

```
Test Suites: 4 failed, 9 passed, 13 total
Tests:       30 failed, 123 passed, 153 total
```

The 4 failing suites and all 30 failing tests are **pre-existing and unrelated to this change** —
confirmed by running the identical command before touching any source (after fixing the environment
issues above, which was needed just to get the suite to execute at all):

- `src/domain/entities/__tests__/order.entity.spec.ts` — pre-existing business-logic bugs in
  discount/tax/shipping total calculations (domain entity, not touched by this task).
- `src/modules/carts/carts.service.spec.ts` — `[DecimalError] Invalid argument: undefined` from
  `carts.service.ts` mock pricing — this is explicitly listed as out of scope in the brief
  ("carts.service.ts mock pricing").
- `src/modules/webhooks/webhooks.service.spec.ts` — `TypeError: this.prisma.auditLog.findFirst is not
  a function`; the mock Prisma client in that spec file is missing an `auditLog.findFirst` stub used
  by the pre-existing idempotency check (`checkDuplicateEvent`), unrelated to Stripe configuration.
- `src/modules/webhooks/webhooks.security.spec.ts` — `Nest can't resolve dependencies of the
  WebhooksService ... NotificationDispatchClient` — this spec's `Test.createTestingModule` providers
  list was never updated when `NotificationDispatchClient` was added as a constructor dependency, so
  every test in the file fails at `compile()` before running.

Before-vs-after counts line up exactly: baseline (once the environment was unblocked, before any of my
source changes) was `4 failed, 4 passed` suites / `30 failed, 106 passed` tests; after my changes it's
`4 failed, 9 passed` suites / `30 failed, 123 passed` tests — same 4 suites, same 30 failing tests,
+5 new suites / +17 new tests, all passing. Zero regressions.

Also ran `npx tsc --noEmit -p tsconfig.json` — clean except for the pre-existing
`test/integration/stripe-checkout.e2e.spec.ts` referencing a `@patina/testing` package that doesn't
exist anywhere in the workspace (dead/orphaned integration test, out of scope, not touched, not part
of the default `test` run's `testPathIgnorePatterns`).

## Self-review notes

- Kept the field type of the injected client as `Stripe` (not `Stripe | null`) in every consuming
  service's constructor, matching existing code style — NestJS's `@Inject('STRIPE_CLIENT')` isn't
  compile-time linked to the factory's return type either way, so this doesn't weaken anything; the
  `assertStripeConfigured` call is the actual runtime guarantee, and every method that touches
  `this.stripe` calls it first.
- Deliberately did *not* touch `main.ts` rawBody handling, checkout DTO shapes, `carts.service.ts`
  mock pricing, `orders-refactored.*`, the EasyPost webhook TODO, or anything under `infra/` — all
  explicitly out of scope per the brief.
- Did not touch `test/integration/stripe-checkout.e2e.spec.ts` (imports a non-existent
  `@patina/testing` package) or the two pre-existing broken webhook spec files — fixing unrelated,
  pre-existing test breakage felt out of scope for "park Stripe cleanly," and I didn't want to
  conflate my diff with unrelated fixes. Flagging as a residual concern below.
- The `jest.config.cjs` restoration and the `packages/{utils,types,cache,auth}` builds were both
  necessary just to get a runnable baseline; committed the config file (it's source, was simply
  missing) but did **not** commit any `dist/` build output (those are gitignored build artifacts,
  regenerated locally, not part of the diff).

## Concerns for the reviewer

1. **New root `jest.config.cjs`** — a genuine gap-fill, but it's shared infrastructure touching 5
   other workspaces I didn't otherwise touch. Worth a second pair of eyes, especially if there's a
   reason it was intentionally absent that I'm not aware of.
2. **Pre-existing test breakage in scope-adjacent files** (`webhooks.service.spec.ts` missing
   `auditLog.findFirst` mock, `webhooks.security.spec.ts` missing `NotificationDispatchClient`
   provider) — both predate this change and are unrelated to Stripe configuration, but they live in
   the same module I was asked to guard. Left unfixed per the "existing tests still pass" framing
   (nothing I did made them worse), but someone should circle back.
3. `test/integration/stripe-checkout.e2e.spec.ts` references `@patina/testing`, a package that does
   not exist in this workspace at all — this test can never run as written. Pre-existing, out of
   scope, flagging for visibility.
