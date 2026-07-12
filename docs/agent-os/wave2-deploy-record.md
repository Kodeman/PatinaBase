# Wave 2 — Agent OS production deploy record

**Deployed:** 2026-07-12 (~19:30 UTC) · **Repo HEAD:** `ac9f5faa` · **Target:** Strata (`bkvcixdmuyejfzcijpdg`) + Cloudflare Workers
**Authorization:** Kody, this session — "Ship each wave."

This is the most sensitive deploy of the Agent OS program: it **redeploys the live money-path
`stripe-webhook`**. The webhook change is strictly additive (1 import + 1 guarded call site emitting
an `agent_tasks` reconciliation task AFTER the money-path switch; money-path enqueue failures are
swallowed so they can never release the idempotency claim or replay a payable flip).

---

## What shipped

**Migrations (00304–00308) → Strata, applied clean:**
- `00304` stripe-event-processor cron (`*/5 * * * *`)
- `00305` designer_prospects + pipeline_stage_events + `move_pipeline_stage` RPC
- `00306` products (+vendor_sku/finishes/freight_class/pricing_tiers), promotion_audit_log CHECK
  widen (+`catalog_commit`), catalog_feed_batches/items staging, `catalog-feeds` storage bucket
- `00307` catalog-normalizer cron (`45 9 * * *`)
- `00308` concierge_orders + `advance_concierge_order` + `check_concierge_payment_discrepancies`
  + concierge-discrepancy-daily cron (`15 10 * * *`)

**Edge functions → Strata:**
- NEW `stripe-event-processor` (script 1.1MB)
- NEW `catalog-normalizer` (script 90kB)
- REDEPLOY `stripe-webhook` (additive reconciliation emission; script 1.19MB)

**Admin portal → Cloudflare Workers** (`patina-admin-portal`, version `d7c836d2-cb7f-417b-9e15-45bb1db47b77`):
/mission-control gains Pipelines + Orders tabs; /feeds gains catalog upload. `admin.patina.cloud` → 307.

---

## Pre-flight (all green)
- HEAD = `ac9f5faa`; git status = known noise + the pre-existing staged `Mobile.xcworkspace/contents.xcworkspacedata` (untouched).
- `supabase migration list`: remote applied through 00303; exactly 00304–00308 unapplied.
- **CHECK-widen constraint-name check:** the existing constraint on Strata was named exactly
  `promotion_audit_log_action_type_check` (`CHECK action_type IN ('promote','demote','merge','undo')`),
  so 00306's `DROP CONSTRAINT IF EXISTS … / ADD CONSTRAINT …` reconciled it in place — no
  second-constraint hazard. Post-deploy it reads `…('promote','demote','merge','undo','catalog_commit')`.

## stripe-webhook 400-gate (post-redeploy, before any event widening)
- Bogus `stripe-signature` → `400 {"error":"invalid_signature"}`
- Absent `stripe-signature` → `400 {"error":"missing_signature"}`
- Signature verification intact; function loaded; money path protected.

## Post-deploy Strata verifications (A–J) — all PASS
- **A** max migration = `00308`
- **B** 7 Agent OS crons present + active: agent-queue-groom, marketplace-vitals-nightly,
  morning-brief-daily, cowork-intake-bridge, stripe-event-processor, catalog-normalizer,
  concierge-discrepancy-daily
- **C** constraint includes `catalog_commit`
- **D** concierge_orders / designer_prospects / pipeline_stage_events / catalog_feed_batches /
  catalog_feed_items tables + advance_concierge_order / check_concierge_payment_discrepancies /
  move_pipeline_stage functions present; products has all 4 new columns
- **E** `move_pipeline_stage('concierge_order', …)` raises `concierge_order stage moves are not yet supported (W2.3)`
- **F** stripe-event-processor idle invoke → 200, claimed 0, job_runs succeeded
- **G** catalog-normalizer idle invoke → 200, claimed 0, job_runs succeeded
- **H** check_concierge_payment_discrepancies() → `{ok:0,flagged:0,scanned:0,damage_tasks:0,payment_tasks:0}`, job_runs succeeded
- **I** stripe-event-processor cron already firing on `*/5` (succeeded at 19:30:00Z)
- **J** money-path tables intact (stripe_webhook_events=3, invoice_payments=2, po_payments=0, direct_orders=1)

---

## Owed to Kody (NOT done in this deploy)

1. **Subscribe the 16 new Stripe event types** on the prod webhook endpoint (disputes / payouts /
   fraud / account / transfer / fee / balance / charge.succeeded) — Kody's Stripe-dashboard step
   (needs his Stripe access), per the checklist §5. Until then only the already-subscribed reconcile
   types emit tasks: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
   (the 3 subscribed types that are in `RECONCILE_EVENT_TYPES`). Expect `stripe_event` tasks to begin
   appearing from real prod activity on those 3 even before the 16 are added — intended + safe.
2. **24h watch** of the Stripe delivery dashboard + `supabase functions logs stripe-webhook` /
   `stripe-event-processor` per checklist §7.
3. **Authenticated Mission Control walk** of the new /pipelines + /orders tabs (super_admin, magic-link).
4. **Entra checklist** for the cowork intake bridge (still dormant).
5. **One live test-mode Checkout** to fully confirm the money path settles post-redeploy (belt-and-
   suspenders; the bad-sig-400 gate + additive diff already cover the deploy).

## Rollback (if ever needed)
Unsubscribe the new events first (deliveries stop immediately); optionally `select
cron.unschedule('stripe-event-processor')`; optionally redeploy the prior `stripe-webhook` build.
Migrations are cron-only where relevant and idempotent — leaving them is harmless.
