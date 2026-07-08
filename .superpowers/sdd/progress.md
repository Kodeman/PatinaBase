# SDD Progress Ledger — Stripe integration completion
Plan: /Users/kody/.claude/plans/make-a-plan-to-reflective-pretzel.md
Worktree: .claude/worktrees/stripe-rail · branch payments/stripe-rail · baseline 3b77583f (infra/cloud-migration)

Facts established before execution:
- Orders worker on CF is HEALTHY without Stripe keys (curl /v1/health 200, db connected) — Phase 0 is about clear 503s + regression tests, not a boot fix.
- Strata (bkvcixdmuyejfzcijpdg): stripe-webhook deployed verify_jwt=false; create-checkout-session verify_jwt=true; cron jobs 13/14/17 live.
- Stripe: sandbox acct_1T6KiaJomPTxIV9m (no webhook endpoints, $0 volume); live acct_1T6KiLJmCVe1Jxdu NOT activated.
- Migration numbering: use 00265+ (main has 00260/00261, Wave 1 claims 00262–00264, this branch has 00258/00259).

## Tasks
- Task 0 (orders boots without Stripe credentials): DONE_WITH_CONCERNS. Root cause: `stripe.module.ts`
  read the raw `STRIPE_SECRET_KEY` env var via ConfigService (not the nested `stripe.secretKey` config
  path), got `undefined`, and `new Stripe(undefined, ...)` doesn't throw (SDK just skips setting the
  auth header) — so boot always succeeded but any real Stripe call failed late/unclearly. Fixed:
  `STRIPE_CLIENT` factory now returns `null` when unset; added shared `assertStripeConfigured()` guard
  (503, body contains `stripe_not_configured`) called first-thing in every Stripe-touching method across
  checkout/payments/refunds/webhooks; reconciliation split into `runReconciliation()` (guarded, used by
  the manual `POST /reconciliation/run`) and `scheduledReconciliation()` (the `@Cron` method — skips
  silently with a log line, no throw, no crash-loop). 5 new/extended spec files, TDD red→green
  throughout. Full report: `.superpowers/sdd/task-0-report.md`.
  - Had to restore a completely-missing root `/jest.config.cjs` (not just "broken for filtered runs" as
    assumed — absent from git history entirely, blocked jest for orders/media/projects/types/utils) and
    build `@patina/{utils,types,cache,auth}` dist output before any orders jest suite could run at all.
    Committed the config file separately (`chore(test): ...`) from the Stripe fix so it's easy to
    review/revert independently. Flagged for a second pair of eyes.
  - Pre-existing, unrelated test breakage found (not touched): `webhooks.service.spec.ts` mock missing
    `auditLog.findFirst`; `webhooks.security.spec.ts` missing `NotificationDispatchClient` provider (DI
    resolution fails for the whole file); `carts.service.spec.ts` Decimal error (carts mock pricing —
    explicitly out of scope); `order.entity.spec.ts` discount/tax/shipping calc bugs; dead
    `test/integration/stripe-checkout.e2e.spec.ts` imports a `@patina/testing` package that doesn't
    exist anywhere in the workspace.

## Minor findings for final review triage
- `webhooks.service.spec.ts` and `webhooks.security.spec.ts` are stale relative to `WebhooksService`'s
  current constructor/prisma-mock shape — worth a follow-up task to fix their mocks (unrelated to
  Stripe rail).
- `test/integration/stripe-checkout.e2e.spec.ts` can never run — `@patina/testing` doesn't exist.
  Candidate for deletion or resurrection in a later task.
