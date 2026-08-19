# Stripe rail verification — account alignment + e2e proof (2026-08-19)

**Status: diagnosis is read-only analysis; no secrets read or written, no DB
rows changed.** Builds on `docs/ops/stripe-webhook-reconciliation-2026-08.md`
(2026-08-18), which established that two different Stripe accounts have
touched prod: `…JmCVe1Jxdu` (**Middle West Studio**, Kody's signed-in
account, endpoint `we_1TsqNv…`) and `…JomPTxIV9m` (the account behind all
real historical traffic — sandbox `acct_1T6KiaJomPTxIV9m` per the 2026-07-08
deploy record). Kody has since ruled Middle West Studio (`acct_1T6KiLJmCVe1Jxdu`)
canonical for prod, and `STRIPE_WEBHOOK_SECRET` was realigned to it on
2026-08-18.

## 1. Diagnosis: does `STRIPE_SECRET_KEY` match Middle West too?

**(a) Webhook secret** — confirmed Middle West. `STRIPE_WEBHOOK_SECRET`'s
`updated_at` in `supabase secrets list` is `2026-08-18T22:32:35.342Z`, which
lines up exactly with the alignment fix and the two synthetic
`evt_claude_secret_verify_20260818*` rows in `stripe_webhook_events`
(`22:33:20` / `22:33:36`).

**(b) Secret key** — best read-only evidence, no value read:

- `supabase secrets list` shows `STRIPE_SECRET_KEY`'s `updated_at` as
  `2026-07-08T10:47:45.232Z` — the **original rail deploy**, and it has not
  been touched since (specifically: not touched on 2026-08-18, when only
  `STRIPE_WEBHOOK_SECRET` and the `SUPABASE_*` bundle moved).
- The `project-stripe-integration` memory record (originating from that same
  2026-07-08 deploy session) states plainly: *"sandbox `acct_1T6KiaJomPTxIV9m`
  … Live `acct_1T6KiLJmCVe1Jxdu` NOT activated."* The key set that day —
  the one still on file — was the sandbox key for `acct_1T6KiaJomPTxIV9m`
  (id fragment `JomPTxIV9m`), not Middle West.
- Every real, non-synthetic row ever written to `stripe_webhook_events`
  carries object ids with the `JomPTxIV9m` fragment
  (`cs_test_a18XhoI83l…`, `pi_3TqtSzJomPTxIV9m0eoQ0Qa6`,
  `ch_3TqtSzJomPTxIV9m0ZvuZ4Hw`) from 2026-07-08, plus the six rejected
  2026-08-12 deliveries the reconciliation doc traced to the same account.
  That is exactly what you'd expect if `create-checkout-session` — the only
  function whose `STRIPE_SECRET_KEY` usage actually **mints objects under an
  account** (`supabase/functions/create-checkout-session/index.ts:1244`,
  `new Stripe(STRIPE_SECRET_KEY, …)`) — has been creating sessions under the
  sandbox account the whole time. (`stripe-webhook` also references
  `STRIPE_SECRET_KEY`, but only to satisfy the SDK constructor for signature
  verification — `index.ts:103-104` — it doesn't determine which account the
  webhook trusts; that's `STRIPE_WEBHOOK_SECRET` alone.)
- Two Middle-West-tagged events (`evt_3TsrIGJmCVe1Jxdu…`, 2026-07-13) and one
  more (`evt_1Tv5yVJmCVe1JxduDCyjt5IY`, 2026-07-20) did pass signature
  verification at the time — proving the *webhook secret* pointed at some
  Middle West endpoint briefly before drifting out of sync by 2026-08-12.
  None of those three are checkout-shaped (`payment_intent.succeeded`,
  `charge.succeeded`, `balance.available` — no `checkout.session.*`), so they
  don't indicate `create-checkout-session` ever minted anything under
  Middle West; they're consistent with manual/dashboard-side test activity
  on that account, orthogonal to `STRIPE_SECRET_KEY`.

**Verdict: MISMATCH (high confidence from documented history, not a literal read of the key).** `STRIPE_SECRET_KEY`
almost certainly still holds the sandbox account's key
(`acct_1T6KiaJomPTxIV9m` / `…JomPTxIV9m`), not Middle West's
(`acct_1T6KiLJmCVe1Jxdu`). `STRIPE_WEBHOOK_SECRET` was correctly realigned to
Middle West on 2026-08-18, but `STRIPE_SECRET_KEY` was never touched in that
fix. Today, a real checkout completed via `create-checkout-session` would be
minted under the sandbox account; Stripe would attempt delivery to whatever
endpoint is registered on **that** account (historically
`we_1TqnOnJomPTxIV9m1K6KNpJA` → same URL), signed with **that** account's
whsec — which is not what `STRIPE_WEBHOOK_SECRET` holds now. Every real
payment would 400 at the signature check exactly like the 2026-07-20→08-18
gap, just now in the opposite direction. This is inference from an unchanged
digest + a documented deploy record, not a literal read of the key's
account — see the settling check below if more certainty is wanted before
Kody acts.

**What would make this certain instead of high-confidence:** a
`stripe.accounts.retrieve()` call made *from inside* the already-configured
edge function runtime (which has `STRIPE_SECRET_KEY` in its own `Deno.env`)
would return the account id/business name with zero secret exposure — but
that requires deploying a diagnostic code path, which this task deliberately
did not do (out of scope for a read-only diagnosis, and not requested).
Kody can settle it in ten seconds without touching prod: Stripe Dashboard →
**switch to Middle West Studio** → Developers → API keys → compare the
**key's last-4** shown there against `supabase secrets list`'s
`STRIPE_SECRET_KEY` digest is not comparable directly (it's a one-way hash,
not last-4) — instead just re-set it (step 2 below); re-setting is cheap and
removes all ambiguity in one move.

## 2. If mismatch: exact steps for Kody

1. Stripe Dashboard → confirm you're on **Middle West Studio**
   (`acct_1T6KiLJmCVe1Jxdu`) — same account as the now-aligned webhook
   endpoint `we_1TsqNv…`.
2. Developers → API keys → reveal the **Secret key** (`sk_live_…` for real
   money, `sk_test_…` if staying in test mode for now — match whichever mode
   the webhook endpoint `we_1TsqNv…` is configured for).
3. Set it on Strata:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_... --project-ref bkvcixdmuyejfzcijpdg
   ```
4. Redeploy **every function that references `STRIPE_SECRET_KEY`** — edge
   functions snapshot env at deploy, and a stale copy will keep minting
   objects under the old account:
   ```bash
   supabase functions deploy stripe-webhook --project-ref bkvcixdmuyejfzcijpdg
   supabase functions deploy create-checkout-session --project-ref bkvcixdmuyejfzcijpdg
   supabase functions deploy stripe-event-processor --project-ref bkvcixdmuyejfzcijpdg
   supabase functions deploy expire-po-session --project-ref bkvcixdmuyejfzcijpdg
   supabase functions deploy fulfillment-stripe-recon --project-ref bkvcixdmuyejfzcijpdg
   supabase functions deploy fulfillment-intake --project-ref bkvcixdmuyejfzcijpdg
   ```
   (found via `grep -rl STRIPE_SECRET_KEY supabase/functions --include="*.ts"`
   — re-run that grep before deploying in case the list has grown.)
5. Run the e2e proof in §3 below before considering the rail live.

Do not set the key without pulling the value from the **Middle West Studio**
dashboard specifically — pulling it while signed into the wrong account
reproduces the exact bug this doc exists to catch.

## 3. E2e proof procedure (run after §2, or now if diagnosis turns out whole)

Test-mode only. Uses the real `create-checkout-session` → Stripe Checkout →
`stripe-webhook` path — no synthetic events.

1. **Pick or create a test invoice** with a small `total_amount_cents` (e.g.
   $5) on a test client, or use the existing pattern from the 2026-07-08
   smoke (`INV-0002`-style row) — anything with `status` eligible for
   checkout.
2. **Create a checkout session** the same way the client portal does: call
   `create-checkout-session` with that invoice's id (through the portal UI is
   easiest and also proves the client-side wiring; a direct authenticated
   POST works too — the function is `verify_jwt`-gated, so needs a caller
   JWT).
3. **Complete checkout** using a Stripe test card (`4242 4242 4242 4242`, any
   future expiry/CVC) on the hosted Checkout page. Or async-complete via
   ACH test flow if that's the path being verified.
4. **Confirm the webhook round-trip**, in order:
   - `checkout.session.completed` (and, shortly after,
     `payment_intent.succeeded`) land in `public.stripe_webhook_events` with
     `processed_at` timestamps just after step 3 — query:
     ```sql
     select id, type, processed_at, payload->>'livemode' as livemode
     from public.stripe_webhook_events
     order by processed_at desc limit 5;
     ```
   - Re-POST the same event id (or let Stripe's own retry do it) and confirm
     `{ "received": true, "duplicate": true }` — the idempotency claim
     working, not a double-apply.
   - The matching `invoice_payments` row (found via the session id from
     step 2, or `metadata.invoice_id`) flips `status: pending → succeeded`
     via a **guarded** transition (`.eq('status','pending')` in
     `stripe-webhook/index.ts`), and `apply_invoice_payment_effects`
     (the `00178`→`00277` trigger) produces the rollup — invoice status,
     milestone paid-through, `designer_earnings` — without any hand-rolled
     accounting in the webhook handler.
   - A receipt email fires via `sendCompliantEmail` and an `in_app`
     `notification_log` row is created for the designer (best-effort — a
     failure here must not fail the webhook itself).
5. **Tamper check**: run the signer script against a captured payload with
   `--corrupt` and confirm a `400 { "error": "invalid_signature" }` — proves
   the *current* `STRIPE_WEBHOOK_SECRET` is actually being enforced, not
   silently bypassed:
   ```bash
   supabase functions serve stripe-webhook --no-verify-jwt
   node scripts/dev/sign-stripe-event.mjs --secret whsec_localdev --corrupt \
     --url http://127.0.0.1:54321/functions/v1/stripe-webhook payload.json
   ```
   (local-only sanity check on handler shape; the prod signature is proven by
   step 4 succeeding against the real Stripe delivery, not by this script.)
6. **Cross-check the Stripe Dashboard** (Middle West Studio, test mode) for
   the same session/PaymentIntent/event ids seen in `stripe_webhook_events` —
   confirms both sides agree on the same account and the same objects.

If all of §3 passes with the aligned keys from §2, the rail is whole:
`create-checkout-session` mints under Middle West, Stripe delivers to Middle
West's endpoint, `stripe-webhook` verifies with Middle West's secret, and the
payable-state tables update via the normal guarded path.

## 4. Housekeeping — synthetic rows

Two rows inserted during the 2026-08-18 secret-verification work carry no
real payment data and are safe to delete once Kody confirms he no longer
wants them as a marker of when the webhook secret was fixed:

```sql
delete from public.stripe_webhook_events
where id in (
  'evt_claude_secret_verify_20260818',
  'evt_claude_secret_verify_20260818_proxy'
);
```

Optional, entirely Kody's call (same posture as the 2026-08-18 doc).

## 5. Known non-blocking hole (flagged per skill policy)

Unrelated to this diagnosis but must be flagged whenever `po_payments` comes
up: the RLS policy "Designers manage payments on their purchase orders"
(`00148`) is `FOR ALL TO authenticated`, so a designer's own authenticated
session can flip `po_payments.state` to `'paid'` client-side with no Stripe
payment involved. Don't treat `po_payments.state = 'paid'` as proof of funds
received in any reconciliation built on top of this doc.

## 6. If diagnosis instead comes back "whole"

Skip straight to §3 — the e2e proof is the same regardless of which way the
diagnosis lands, it's just the thing that turns "keys look aligned" into
"the rail actually moves money end to end."
