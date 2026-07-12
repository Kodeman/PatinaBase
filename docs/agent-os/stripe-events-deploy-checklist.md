# WP-2.1 — Stripe event emission + reconciliation processor: prod deploy checklist

This touches the **live money path** (the deployed `stripe-webhook` edge function). The
code change to `stripe-webhook` is strictly additive — it only *adds* a reconciliation
task to `agent_tasks` after the existing money handlers run — but the deploy still moves a
function that settles real payments, so treat it with care.

**Prerequisites (must already be live on Strata):**
- Wave-0 queue core: `agent_tasks` + RPCs (`00297`), `job_runs` (`00300`).
- The `_shared/agent-queue.ts` twin (Deno) is bundled per-function at deploy time.
- Wave-1 is live (Mission Control inbox renders `awaiting_review` tasks + EvidencePack).

All Supabase commands assume the CLI is linked to Strata (`bkvcixdmuyejfzcijpdg`).

---

## What ships

| Artifact | Path | Notes |
|---|---|---|
| Migration | `supabase/migrations/00304_stripe_event_processor_cron.sql` | cron only — no schema. Re-check the number against `main`'s head before push; renumber the file + banner if it collides. |
| New edge fn | `supabase/functions/stripe-event-processor/` (`core.ts` + `index.ts`) | claims + reconciles `stripe_event` tasks. |
| New module | `supabase/functions/stripe-webhook/reconcile-emit.ts` | consts + `enqueueStripeEventTask`, imported by the webhook. |
| Webhook edit | `supabase/functions/stripe-webhook/index.ts` | additive: 1 import + 1 call site after the money-path switch. |
| config | `supabase/config.toml` `[functions.stripe-event-processor]` | `verify_jwt = true` (cron-invoked via `invoke_edge_function`). |

---

## Deploy sequence (only under an explicit in-session ship request)

1. **Migration → Strata.**
   ```bash
   supabase db push
   ```
   Verify the cron landed (probe the object, not the ledger):
   ```bash
   # via psql against Strata, or the Supabase SQL editor:
   select jobname, schedule, active from cron.job where jobname = 'stripe-event-processor';
   ```
   Expect one row, `*/5 * * * *`, `active = t`.

2. **Deploy the processor edge fn.**
   ```bash
   supabase functions deploy stripe-event-processor
   ```
   Confirm `STRIPE_SECRET_KEY` is set on Strata (it already exists — the webhook uses it):
   ```bash
   supabase secrets list   # names only — never echo values
   ```

3. **Deploy the webhook (additive).**
   ```bash
   supabase functions deploy stripe-webhook
   ```
   `reconcile-emit.ts` is bundled with it automatically (relative import). No other
   function imports `reconcile-emit.ts`, so nothing else needs redeploy.

4. **Verify the money path still settles (test mode) — do this BEFORE widening the
   subscribed events.** Run a real test-mode Checkout for a seeded invoice (or replay a
   prior `checkout.session.completed` from the Stripe dashboard) and confirm the
   `invoice_payments` row still flips to `succeeded` and the receipt still sends. The
   additive emit must not have changed this. Then confirm a reconcile task appeared:
   ```sql
   select task_type, priority, status, run_after
   from public.agent_tasks
   where source = 'stripe-webhook' and task_type = 'stripe_event'
   order by created_at desc limit 5;
   ```

5. **Add the new event types to the prod webhook endpoint.** Only `payment_intent.*`,
   `charge.refunded`, and (implicitly) `checkout.session.*` are subscribed today. Add the
   13 reconcile-only types the processor handles:

   `charge.succeeded`, `charge.dispute.created`, `charge.dispute.updated`,
   `charge.dispute.closed`, `charge.dispute.funds_withdrawn`,
   `charge.dispute.funds_reinstated`, `radar.early_fraud_warning.created`, `payout.paid`,
   `payout.failed`, `account.updated`, `account.application.deauthorized`,
   `transfer.created`, `transfer.reversed`, `application_fee.created`,
   `application_fee.refunded`, `balance.available`.

   **Dashboard:** Developers → Webhooks → the Patina endpoint → *Select events* → add each
   type → save. **Or via the Stripe API** (replace `WE_ID` with the endpoint id from
   `stripe webhook_endpoints list`):
   ```bash
   stripe webhook_endpoints update WE_ID \
     --enabled-events charge.succeeded \
     --enabled-events "charge.dispute.created" \
     --enabled-events "charge.dispute.updated" \
     --enabled-events "charge.dispute.closed" \
     --enabled-events "charge.dispute.funds_withdrawn" \
     --enabled-events "charge.dispute.funds_reinstated" \
     --enabled-events "radar.early_fraud_warning.created" \
     --enabled-events "payout.paid" \
     --enabled-events "payout.failed" \
     --enabled-events "account.updated" \
     --enabled-events "account.application.deauthorized" \
     --enabled-events "transfer.created" \
     --enabled-events "transfer.reversed" \
     --enabled-events "application_fee.created" \
     --enabled-events "application_fee.refunded" \
     --enabled-events "balance.available"
   ```
   > `--enabled-events` **replaces** the list, so include the currently-subscribed money
   > types too (`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   > `checkout.session.async_payment_failed`, `payment_intent.succeeded`,
   > `payment_intent.payment_failed`, `charge.refunded`) in the same call, or use the
   > dashboard's additive *Select events* UI to avoid dropping them.

6. **Fire one benign event and watch it land.**
   ```bash
   stripe events resend EVT_ID   # a recent payout.paid or balance.available
   ```
   Confirm: webhook delivery = 200 in the Stripe dashboard; a `stripe_event` task appears
   in `agent_tasks`; within ~5 min (next cron tick) the processor completes it (`done` for a
   clean payout.paid, `awaiting_review` for anything it can't prove) with an EvidencePack
   (`artifacts.checks` + `artifacts.verdict`); a `job_runs` row for `stripe-event-processor`
   records the outcome counts.

7. **Watch the delivery dashboard + function logs for 24h.**
   ```bash
   supabase functions logs stripe-event-processor
   supabase functions logs stripe-webhook
   ```
   Expected steady state: reconcile tasks flowing, disputes/fraud/failed-payout/partial-
   refund/orphan events all landing `awaiting_review`; clean payouts/balances landing
   `done`. Investigate any repeated `failed` non-fatal task (transient Stripe fetch errors
   back off; a persistent one means a bad `STRIPE_SECRET_KEY` or an API-version drift).

---

## Rollback

**Unsubscribe the new events FIRST, then (optionally) revert the code.** The functions
tolerate the absence of the new events — `stripe-webhook` only emits for subscribed types,
and `stripe-event-processor` simply finds nothing to claim.

1. Dashboard/API: remove the 16 added event types from the webhook endpoint (or restore the
   pre-deploy `--enabled-events` list). Deliveries stop immediately.
2. Optional: `select cron.unschedule('stripe-event-processor');` on Strata to stop the
   processor cron (queued tasks simply sit).
3. Optional: redeploy the previous `stripe-webhook` build to drop the emit call site. Not
   required — with the events unsubscribed the emit never fires for reconcile-only types,
   and for money-path types the emit is already best-effort/swallowed.

The migration (`00304`) is cron-only and idempotent; leaving it in place is harmless.
