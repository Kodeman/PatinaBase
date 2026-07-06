# Procurement, Orders & Billing — Detailed PRD

## 1. Header

**Area:** Procurement, Orders & Billing (Patina designer-portal money spine)

**Status by sub-feature:**

| Sub-feature | Status |
|---|---|
| Procurement (designer → vendor POs) | Shipped (pilot-gated) |
| Invoicing & A/R (designer → client) | Shipped |
| Time tracking → earnings | Shipped |
| Legacy NestJS orders service | Shipped (deployed, vestigial — not wired into live flow) |
| Procurement notifications feed UI | Planned (backend only, no UI) |
| Payment-data visibility gating (v2) | Planned |
| Invoice/Stripe refund state machine | Planned |
| QuickBooks export | Shipped |

**Last reconciled:** 2026-07-06

**Source docs:**
- `docs/handoffs/procurement-wave4-pdf-spike.md`
- `docs/handoffs/procurement-workspace-sprint-1-report.md`
- `docs/handoffs/procurement-workspace-sprint-2-report.md`
- `docs/handoffs/procurement-workspace-sprint-3-report.md`
- `docs/handoffs/procurement-workspace-wave-1.1-architect-dossier.md`
- `docs/handoffs/procurement-workspace-wave-1.3a-portal-conventions-dossier.md`
- `docs/handoffs/procurement-workspace-wave-2.1-architect-dossier.md`
- `docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md`
- `docs/follow-ups/procurement-payment-gating-v2.md`
- `docs/follow-ups/procurement-pilot-metrics.md`
- `docs/prds/Projects/patina-designer-portal-mvp-additions-spec.md`
- `supabase/CLAUDE.md`
- `docs/prds/AE/aesthete-engine-delivery-log.md`

## 2. Overview

This is the money spine of Patina's designer workflow: what the designer buys (vendor purchase orders), what the designer bills (client invoices + A/R), what the designer earns (time tracking → design-fee earnings), plus a largely-vestigial legacy NestJS e-commerce order stack.

The primary user is the interior designer / studio owner. Leah Walker is the v1 design partner and a solo owner, so most multi-actor gating (studio member roles, non-owner payment visibility) is currently inert/unused. The client sees issued invoices and pays them online; vendors receive PO PDFs by email but have no login of their own.

There are three money subsystems, all money stored in integer cents:

1. **Procurement** (designer → vendor): Supabase-native `purchase_orders` / `po_payments` / `receiving_inspections` / `damage_claims`, driven by DB triggers + SECURITY DEFINER RPCs + a `po-send` PDF/email edge function + a QuickBooks export. Lives at `/portal/procurement/*`, behind the PostHog flag `procurement-workspace-pilot`.
2. **Invoicing & A/R** (designer → client): Supabase-native `invoices` / `invoice_line_items` / `invoice_payments`, Stripe Checkout for online client payment (`create-checkout-session` + `stripe-webhook`), an automated dunning cadence (`invoice-reminders` cron), and a manual chase. There are two front doors: the `/portal/billing/*` zone AND The Document's "Accounts book".
3. **Time → Earnings**: `project_time_entries` (+ `project_unbilled_time` view) feed invoice `time` lines; paid invoices write `designer_earnings` rows surfaced at `/portal/earnings`.

Separately, a retained NestJS **orders** service (`services/orders`, port 3015) implements a full cart/checkout/order/fulfillment/payment/refund e-commerce stack (Stripe PaymentIntents + EasyPost), deployed and proxied from all three portals, but NOT wired into the live designer procurement flow.

## 3. As-Built Architecture

### 1. Procurement — designer → vendor purchase orders (Supabase-native)

Base tables land in `supabase/migrations/00148_procurement_workspace_v1.sql` (`purchase_orders`, `po_payments`), `00150_receiving_and_damage_claims.sql` (`receiving_inspections`, `damage_claims`, `delivery_events`), `00151_procurement_notifications.sql` (`procurement_notifications` + `trg_notify_payment_due`). The "procurement overhaul" (Waves 1–5) then made the DB authoritative:

- **State chain (`00184_procurement_state_chain.sql`)** — four triggers: (A) `aaa_ffe_ratchet_to_po_stage` (linking an item to a PO ratchets item status up to the PO's stage; `aaa_` prefix orders it before the 00084 stamp trigger); (B) `trg_po_status_cascade_to_items` (PO status → linked items, cancellation unlinks/rolls back in-flight items to `approved`, plus the deposit/balance flip); (C) `trg_receiving_inspection_side_effects` (stamps `delivered_date` on all outcomes, advances PO to `delivered` on CLEAN only, shifts net-30 balance to delivered+30d, marks items received); (D) `trg_deposit_paid_flips_balance` (deposit-paid-second path). Helpers `ffe_status_rank`, `po_status_to_ffe_stage`, `flip_pending_balance_to_due`.
- **Dual pricing (`00185_ffe_dual_pricing.sql`)** — `project_ffe_items` gains `trade_price_cents` + `markup_percent` (client price stays in `unit_price_cents`). Three-tier idempotent backfill. Also REPAIRS an activation bug (`activate_proposal_as_project` was copying trade cents into the client column) and adds dual pricing to `apply_decision` FF&E feed-through.
- **Atomic create (`00186_create_purchase_order_rpc.sql`)** — `create_purchase_order(...)` RETURNS `purchase_orders`: owner assert, `FOR UPDATE` item locks, server-side guards (cross-project / already-linked / decision-blocked), server-computed **TRADE** total, header + payment-pattern rows (ported from the removed client-side `buildPaymentRowsForPattern`), item linking. Also `log_po_acknowledgment(...)` (widened in `00190_ack_any_active_status.sql` to accept any non-cancelled status). **Semantic flip:** `purchase_orders.total_cents` is now the vendor TRADE total; pre-00186 rows keep client-price totals.
- **Send (`00188_po_send_columns.sql`)** — `po_number` / `ship_to` / `po_document_path` / `sent_at`, `po_counters` (per-designer PO-XXXX sequence), `vendors.orders_email`, and `assign_po_number(p_po_id)`.
- **Crons (`00189_procurement_crons.sql`)** — `po-payments-due-daily` (14:00 UTC, pending→due flip, 90-day floor) and `delivery-this-week-weekly` (Mon 13:00 UTC, arms `delivery_this_week` notification).
- **`00199_activation_carry_vendor_id.sql`** — activation now carries `vendor_id` onto FF&E lines so the Order Assistant can mount.

Data/UI: `packages/supabase/src/hooks/use-procurement.ts` (2184 lines — `useCreatePurchaseOrder`, `useLogPOAcknowledgment`, `useSendPurchaseOrder`, `useCreateReceivingInspection`, `useDamageClaims`, `useDeliveryCalendar`, `useQboExport`, `useProcurementNotifications`, etc.). Screens under `apps/designer-portal/src/app/(portal)/portal/procurement/{by-vendor,by-status,calendar,receiving}/page.tsx` (root redirects to by-vendor). Components in `apps/designer-portal/src/components/portal/procurement/` — the multi-step `order-assistant/` (steps: coverage → details → review, with `sidemark.ts`), `order-via-patina.tsx`, `po-send-actions.tsx`, `log-inspection-drawer.tsx`, `damage-claim-drawer.tsx`, `payment-pill.tsx`, `qbo-export-modal.tsx`. The whole zone is gated by PostHog flag `procurement-workspace-pilot` (layout + top-bar).

### 2. Invoicing & A/R — designer → client (Supabase-native + Stripe)

- **Core (`00178_invoices_v1.sql`)** — `invoices` (draft→sent→partially_paid→paid, void while uncollected), `invoice_line_items` (kinds milestone/time/adhoc), `invoice_payments`, `invoice_counters` (per-designer `INV-NNNN`), `stripe_webhook_events` (idempotency ledger). RPCs `issue_invoice` (assigns number, recomputes totals from lines, flips linked milestones to outstanding), `record_invoice_payment` (manual/offline only — rejects `stripe`), `void_invoice`, and internal `apply_invoice_payment_effects` fired by an AFTER trigger on `invoice_payments` — the ONE brain for amount_paid rollup, status flips, milestone paid-through, and `designer_earnings` rows. Extends `profiles.stripe_customer_id` and `designer_earnings` with `invoice_id`/`invoice_payment_id`/`project_id`.
- **`00182_invoices_void_draft_fix.sql`** — allows voiding a never-issued draft (dropped the number-when-issued CHECK).
- **FF&E billing bridge (`00187_invoice_ffe_lines.sql`)** — adds line kind `ffe` + `ffe_item_id` (one live billing slot per item), extends `void_invoice` to release FF&E slots, and adds `get_ffe_invoice_coverage(project_id)` (uninvoiced|invoiced|paid) powering the Order Assistant's soft client-payment gate.
- **Dunning (`00209_invoice_chase.sql`)** — `invoices.ar_last_chased_at` + `chase_invoice(id)` for the manual Desk/Accounts chase, distinct from the automated cadence columns.
- **Stripe online pay** — `create-checkout-session` (loads/authorizes invoice, lazy Stripe customer, session reuse/stale cleanup, card + us_bank_account, inserts a pending `invoice_payments` row) → `stripe-webhook` (signature verify, idempotency claim, flips the payment row only; the 00178 trigger owns all effects; receipt email + designer `notification_log` row; ACH async paths; `charge.refunded` recorded-only). `invoice-send` (issue/resend + manual A/R nudge) and `invoice-reminders` (daily cadence at due−3/+1/+7/+14, cron in `00181_invoice_reminders_cron.sql`, then `ar_flagged_at` hands off to the human A/R page).

Data/UI: `packages/supabase/src/hooks/use-invoices.ts` (`useInvoices`, `useCreateDraftInvoice`, `useUpsertLineItems`, `useIssueInvoice`, `useRecordPayment`, `useSendInvoice`, `useChaseInvoice`, `useStartCheckout`, `useVoidInvoice`, `useArAging`/`computeArAging`, `useFfeInvoiceCoverage`). Zone screens: `/portal/billing/invoices` (+ `/new`, `/[id]`, `/[id]/print`) and `/portal/billing/ar`. Second front door in The Document: `apps/designer-portal/src/components/document/accounts/{invoice-folio,invoice-composer,invoice-overlays}.tsx`.

### 3. Time tracking → earnings

`00177_project_time_entries.sql` — `project_time_entries` (NULL `duration_minutes` = running timer, one-per-user partial unique index), invoiced-entry lock trigger `guard_invoiced_time_entry`, `project_unbilled_time` view (rate resolution: entry snapshot → project change-order hourly rate → profile default → 0), `project_phases.estimated_hours`, `profiles.default_hourly_rate_cents`. `00198_time_entry_source_activity.sql` adds `raw_seconds`/`idle_seconds`/`source`/`activity` (all additive; canonical `duration_minutes` untouched). Hooks are designer-portal-local (`apps/designer-portal/src/hooks/use-time-tracking.ts` — 783 lines: `useStartTimer`/`useStopTimer`/`useDiscardTimer`/`useRunningTimer`, `useCreateTimeEntry`, `useClaimTimeEntries`, `useStudioTimeReport`) plus the Document `document-time-provider.tsx`/`hours-ledger.tsx`. Screens `/portal/time` (studio report), `/portal/projects/[id]/time`, `/portal/earnings` (`packages/supabase/src/hooks/use-earnings.ts` over `designer_earnings`/`designer_payouts` from `00014_portal_business_features.sql`).

### 4. Legacy NestJS orders service (deployed, mostly unused by the live flow)

`services/orders` (`@patina/orders`, port 3015, Prisma schema `svc_orders`) implements carts, checkout, orders, fulfillment (EasyPost + mock carrier via `carrier.factory.ts`), payments (Stripe PaymentIntents capture), refunds, reconciliation (`@Cron` every 6h vs Stripe), and Stripe webhooks. Consumed by `apps/admin-portal .../(dashboard)/orders`, designer `apps/designer-portal/src/hooks/use-orders.ts` + `/api/orders*` proxy routes, and client-portal `/api/orders/cart*` proxies. This is a separate e-commerce stack — the designer procurement flow does NOT create orders-service orders; "Order via Patina" just writes a Supabase PO with `is_patina_catalog=true`.

## 4. Data Model

### Procurement (public schema)

- `purchase_orders` (00148; +`sidemark`,`acknowledged_at` in 00186; +`po_number`,`ship_to`,`po_document_path`,`sent_at` in 00188). `total_cents` = vendor TRADE total post-00186 (pre-00186 rows = client price). Enum `purchase_order_payment_pattern` (fifty_fifty / thirty_seventy / full_upfront / net_30 / custom_milestones).
- `po_payments` (00148) — kind deposit/balance/milestone; state pending/due/paid; `due_date`,`paid_date`,`sort_order`,`label`. Per-PO number sequence in `po_counters` (00188, RLS zero-policy, RPC-only).
- `receiving_inspections`, `damage_claims` tables + `delivery_events` VIEW (all 00150). `procurement_notifications` + enum `procurement_notification_kind` (00151; `delivery_this_week` armed in 00189).
- `project_ffe_items` — +`trade_price_cents`,`markup_percent` (00185); `purchase_order_id` link, `received_quantity`, `blocked_by_decision_id`.
- `vendors` — +`orders_email` (00188).
- **RPCs:** `create_purchase_order` / `log_po_acknowledgment` (00186, widened 00190), `assign_po_number` (00188), `activate_proposal_as_project` (dual-pricing repair 00185, vendor_id carry 00199), `apply_decision` (dual-pricing FF&E feed-through 00185). All SECURITY DEFINER, owner-scoped `designer_id=auth.uid()`.
- **Triggers:** state chain A–D (00184), `trg_notify_payment_due` (00151).

### Invoicing / A/R (public schema)

- `invoices` (00178) — status draft/sent/partially_paid/paid/void; `payment_terms_days` default 15; `subtotal_cents`/`tax_rate`/`tax_cents`/`total_cents`/`amount_paid_cents`; `stripe_checkout_session_id`; cadence cols `reminder_count`/`last_reminder_at`/`ar_flagged_at`; +`ar_last_chased_at` (00209). Number-when-issued CHECK dropped in 00182.
- `invoice_line_items` (00178; kind CHECK rebuilt for `ffe` + `ffe_item_id` in 00187) — kinds milestone/time/adhoc/ffe; partial-unique slots for `milestone_id` and `ffe_item_id`.
- `invoice_payments` (00178) — method stripe/check/wire/ach_manual/cash/other; status pending/succeeded/failed/refunded; unique on `stripe_payment_intent_id` and `stripe_checkout_session_id`.
- `invoice_counters` (00178, RPC-only), `stripe_webhook_events` (00178, service-role only).
- `profiles.stripe_customer_id` (00178).
- **RPCs:** `issue_invoice` / `record_invoice_payment` / `void_invoice` (00178, void extended 00187) / `chase_invoice` (00209) — SECURITY DEFINER, `designer_id=auth.uid()`; `apply_invoice_payment_effects` (00178, service_role only, fired by AFTER trigger `apply_invoice_payment_effects_on_change`); `get_ffe_invoice_coverage` (00187, SECURITY INVOKER read-model).
- **RLS:** designers own their invoices; direct UPDATE limited to drafts (post-issue transitions via RPC); clients can SELECT non-draft invoices/lines/payments on their projects.

### Time / Earnings (public schema)

- `project_time_entries` (00177; +`raw_seconds`/`idle_seconds`/`source`/`activity` in 00198) — `invoice_id` FK wired by 00178. Trigger `guard_invoiced_time_entry` locks invoiced entries. View `project_unbilled_time` (security_invoker).
- `designer_earnings` / `designer_payouts` (00014) — earnings extended with `invoice_id`/`invoice_payment_id`/`project_id` (00178); one earnings row per succeeded payment, source_type `design_fee`, `platform_fee=0`, gross=net.

### Legacy orders (svc_orders Prisma schema, separate DB namespace)

- `services/orders/prisma/schema.prisma` — Order, OrderItem, Cart, CartItem, Payment, Shipment, Refund, Reconciliation, Discount, Address, IdempotencyKey, OutboxEvent, AuditLog. Not in the `public` Supabase namespace; isolated to the `svc_orders` schema (via `?schema=svc_orders` in `DATABASE_URL`), accessed only by the NestJS service.

## 5. API / Edge / Service Surface

### Supabase edge functions (Deno) — `supabase/functions/`

- `create-checkout-session` — POST `{invoiceId}` → `{url}`. verify_jwt default (on). Authorizes caller as invoice client or designer; guards status sent/partially_paid + amount_due>0; lazy Stripe customer; session reuse/expire; inserts pending stripe `invoice_payments` row. Env: `STRIPE_SECRET_KEY`, `CLIENT_PORTAL_URL`.
- `stripe-webhook` — **verify_jwt = false** (config.toml, the only one) — Stripe signature instead. On self-hosted prod the Stripe endpoint URL must carry `?apikey=<ANON_KEY>` past Kong. Handles checkout.session.completed / async_payment_(succeeded|failed) / payment_intent.(succeeded|payment_failed) / charge.refunded(record-only). Flips `invoice_payments` only; 00178 trigger owns effects. Env: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `CLIENT_PORTAL_URL`.
- `po-send` — POST `{purchaseOrderId, mode: preview|send|mark_sent, recipientEmail?, message?, ccDesigner?}`. Calls `assign_po_number` AS THE CALLER, renders PDF via `_shared/po-pdf.ts`, uploads to `project-documents/{projectId}/po-{poNumber}.pdf`, emails vendor (orders_email → contact_info.email). Send is guarded 422 `po_out_of_sync` when line-trade-total ≠ total_cents ≠ Σ po_payments (blocks pre-00186 client-price POs). verify_jwt default.
- `invoice-send` — POST `{invoiceId, message?, type: sent|reminder}`. Emails client via `sendCompliantEmail`; type `reminder` = manual A/R nudge that does NOT perturb the automated cadence.
- `invoice-reminders` — cron-invoked (00181, 15:00 UTC). Cadence due−3/+1/+7/+14 keyed by `reminder_count`; final stage stamps `ar_flagged_at` + designer escalation, then hands off to the human A/R page.
- `qbo-export` — POST (studio_owner role required, else 403). One QuickBooks "Bills" CSV row per `po_payments` event; two-step DB-scoped query; preview mode returns JSON stats.

### NestJS orders service (`services/orders`, port 3015, `/api/orders*` + `/api/admin/orders*` proxies)

- Controllers: orders (list/get/status/cancel), carts (CRUD + discounts), checkout, fulfillment (+ EasyPost `webhooks.controller`), payments (PaymentIntent capture/confirm), refunds, reconciliation, webhooks (Stripe), health/version. Middleware: idempotency; interceptor: audit. Consumed by `use-orders.ts` and admin `ordersService`. Note: unused by the live procurement flow.

### No time-tracking RPCs

All `project_time_entries` access is direct table CRUD via the browser Supabase client (RLS-enforced); timers are plain INSERT/UPDATE (NULL duration = running). There is no `start_timer`/`stop_timer` RPC.

## 6. UI Surfaces

### Designer portal (`apps/designer-portal`, port 3000)

- **Procurement** (PostHog flag `procurement-workspace-pilot`): `/portal/procurement` → redirect to `/portal/procurement/by-vendor`; `/by-status`; `/calendar`; `/receiving`. Components: multi-step `order-assistant/` (coverage→details→review + sidemark), `order-via-patina.tsx`, `po-send-actions.tsx`, `log-inspection-drawer.tsx`, `log-acknowledgment-popover.tsx`, `damage-claim-drawer.tsx`, `eta-quick-edit-drawer.tsx`, `receiving-tabs.tsx`, `receiving-kpi-row.tsx`, `vendor-section-card.tsx`, `payment-pill.tsx`, `qbo-export-modal.tsx`, `blocked-by-decision-notice.tsx`.
- **Billing/A-R** (zone): `/portal/billing` → redirect to `/portal/billing/invoices`; `/invoices/new`; `/invoices/[id]`; `/invoices/[id]/print`; `/portal/billing/ar`.
- **Billing (Document Accounts book):** `components/document/accounts/{invoice-folio,invoice-composer,invoice-overlays}.tsx` (Receivables + dunning chase via `chase_invoice`).
- **Time:** `/portal/time` (studio report), `/portal/projects/[id]/time`; header `TimerButton`, `command-palette` timer, Document `hours-ledger`.
- **Earnings:** `/portal/earnings` (MetricBlock rollups, monthly, payouts).

### Client portal (`apps/client-portal`, port 3002)

- Issued-invoice view + Stripe pay (`/invoices/[id]?checkout=success|cancelled`, wired by `create-checkout-session` success/cancel URLs).
- Legacy cart/order proxies: `/api/orders/cart*`, `/api/orders/[id]/{payments,fulfillments,checkout/payment-intent}` → NestJS orders.

### Admin portal (`apps/admin-portal`, port 3001)

- `/(dashboard)/orders` — legacy orders list/detail (status filters created/paid/fulfilled/closed/refunded/canceled) via `ordersService` → NestJS orders.

### e2e coverage

- `apps/designer-portal/e2e/procurement/{by-status-filters,coverage,expediting,order-flow,pricing}.spec.ts`; `apps/designer-portal/e2e/billing/invoices.spec.ts`.

## 7. Reconciliation & Gaps

### Drift (spec-vs-reality)

- ⚠ `purchase_orders.total_cents` has TWO semantics in the same column: pre-00186 rows carry CLIENT-price totals (old UI summed client prices), post-00186 rows carry vendor TRADE totals (server-computed by `create_purchase_order`). The column comment documents it and `po-send` refuses to email an incoherent pre-00186 PO (422 `po_out_of_sync`), but any consumer/report assuming one semantic is wrong for mixed data.
- ⚠ Invoicing now has TWO front doors that the docs treat as one: the zone `/portal/billing/{invoices,ar}` pages AND The Document "Accounts book" (`components/document/accounts/invoice-*.tsx` + Receivables dunning). They read/write the same `invoices`/`invoice_payments` tables; the manual chase (`chase_invoice`, 00209) exists specifically for the Desk/Accounts surface.
- ⚠ "Order via Patina" implies a Patina-merchant fulfillment path, but the component (`order-via-patina.tsx`) only writes a Supabase `purchase_orders` row with `is_patina_catalog=true` and `payment_pattern='full_upfront'` to satisfy NOT NULL — its own comment defers "Stripe / Patina-side fulfillment plumbing (eventual orders-service work)". No orders-service order is created.
- ⚠ The retained NestJS `orders` service (carts/checkout/orders/fulfillment/payments/refunds, Stripe PaymentIntents + EasyPost) is deployed (prod compose port 3015) and proxied from all three portals, but is NOT part of the live designer procurement/billing flow — designer POs and client invoice payments are entirely Supabase-native (`purchase_orders`/`po_payments`, `invoice_payments` + `stripe-webhook`). It reads as a full subsystem in `services/orders` but is effectively legacy/vestigial for the current product.
- ⚠ Root `CLAUDE.md` claims "52 SQL migrations" and "33+ Deno edge functions"; the repo actually has 252 migration files (numbered 00001–00254) and ~40 edge functions. The invoicing/procurement migrations (00177–00190, 00198–00199, 00209) all post-date that count.
- ⚠ `designer_earnings` from invoice payments are always written with `platform_fee=0` and `net_amount=gross` (`apply_invoice_payment_effects`, 00178) — the `platform_fee` concept the earnings model implies is never exercised for designer-issued invoices; Stripe rows land as status `confirmed`, manual methods as `paid`.
- ⚠ Time-tracking hooks are NOT in `@patina/supabase` (unlike invoices/procurement/earnings) — they live designer-portal-local at `apps/designer-portal/src/hooks/use-time-tracking.ts`, so other portals cannot reuse them; the Document surfaces its own `document-time-provider.tsx`.

### Known bugs / TODOs

- ⚠ Procurement in-app notifications have no feed UI: `procurement_notifications` + the hooks `useProcurementNotifications`/`useProcurementUnreadCount`/`useMarkProcurementNotificationRead` exist in `@patina/supabase`, but grep finds ZERO designer-portal components consuming them — the daily/weekly crons write rows nothing renders.
- ⚠ Payment-data visibility gating for non-owner designers is deferred to v2 (`docs/follow-ups/procurement-payment-gating-v2.md`): every designer who can see a PO sees its payment pills/amounts. The `studio_members` table + re-pointed `useIsStudioOwner()` are specced but not built. Only the QBO export is gated (studio_owner role).
- ⚠ Invoice/Stripe refunds are v2: `stripe-webhook` records `charge.refunded` in the events ledger only ("refund state machine is v2") with no state change. (The unused NestJS orders service has a refunds module, but it is not on the invoice path.)
- ⚠ Procurement pilot is not GA — gated behind PostHog flag `procurement-workspace-pilot`; non-pilot users see a "Coming soon" placeholder. Flag setup + the 5-metric PostHog dashboard are a manual Kody step (`docs/follow-ups/procurement-pilot-metrics.md`).
- ⚠ Analytics events `procurement_status_advanced` and `procurement_conflict_acknowledged` are documented but explicitly NOT wired (deferred to v1.1) — so the pilot's order-day-duration and conflicts-prevented metrics only have approximations.
- ⚠ Stripe is not confirmed production-configured: needs real `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, and the prod webhook endpoint URL must be registered with `?apikey=<ANON_KEY>` to pass Kong key-auth (per critical-gaps memory + stripe-webhook header comment). No live-payment smoke on prod recorded.
- ⚠ The 90-day lower bound on `po-payments-due-daily` (00189) is a documented temporary guard against stale pre-00189 rows flooding feeds — intended to be dropped in a later migration once prod cycles; still present.
- ⚠ EasyPost shipping / carrier fulfillment exists only inside the unused NestJS orders service (`fulfillment/carriers/easypost.carrier.ts`); the live procurement flow tracks delivery manually via `receiving_inspections` and PO `confirmed_eta`, with no carrier-tracking integration.
- ⚠ Time idle detection: `project_time_entries.idle_seconds` (00198) is an annotation-only column never subtracted; the idle detector that writes it was slated for a Slice-6 polish pass and may not be wired.
- ⚠ Milestone-kind and ffe-kind invoice line CHECKs vs `ON DELETE SET NULL` create a documented sharp edge: deleting a `project_ffe_items` row (or milestone) that a live invoice line references fails loudly until the invoice is voided/released — intended, but a foot-gun for bulk cleanup.

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Confirm/complete Stripe production configuration (live keys + prod webhook endpoint registered with `?apikey=`) and run a real end-to-end client-payment smoke on prod before relying on online invoice payment. | P0 |
| Build a procurement notifications feed UI (bell/inbox) consuming the existing `useProcurementNotifications` hooks — the deposit_due/balance_due/delivery_this_week rows are being generated with nothing to render them. | P1 |
| Decide the invoicing front-door strategy: reconcile the zone `/portal/billing` pages with The Document Accounts book so there is one canonical UI (or an explicit, documented split) over the same tables. | P1 |
| Formally deprecate or delete the unused NestJS orders service (carts/checkout/orders/fulfillment/payments/refunds) OR document its intended future role — it is deployed, proxied, and Stripe/EasyPost-wired but disconnected from the live flow, which is a maintenance and security surface. | P1 |
| Ship the invoice/Stripe refund state machine (currently `charge.refunded` is record-only) so partial/full refunds flow back into `invoice_payments`/`apply_invoice_payment_effects`/`designer_earnings`. | P1 |
| Implement v2 payment-data gating (`studio_members` + re-pointed `useIsStudioOwner`) when a non-owner designer/bookkeeper joins a studio; per `procurement-payment-gating-v2.md`. | P2 |
| Wire the deferred analytics events (`procurement_status_advanced`, `procurement_conflict_acknowledged`) and stand up the Procurement Pilot PostHog dashboard, then graduate the pilot off the flag. | P2 |
| Backfill/normalize pre-00186 client-price `purchase_orders.total_cents` to trade totals (or migrate a `client_total_cents` column) so the dual-semantics column and the `po_out_of_sync` guard can be retired; drop the 00189 90-day floor once prod cycles. | P2 |

## 9. Status & Deploy

**On main:** all procurement + invoicing + time/earnings migrations (00177–00190, 00198–00199, 00209) and all six area edge functions (create-checkout-session, stripe-webhook, po-send, invoice-send, invoice-reminders, qbo-export) are on `main`.

**On prod (DB):** the procurement/invoicing bundle shipped to prod at commit `c224b0e7` (2026-06-16, migrations 00177–00220 + apps). The 2026-07-02 "tier 1" prod deploy (`cb15fb37`) then applied 00230–00254 (prod tip 00229 → **00254**, the 25 migrations 00230–00254 applied via `docker exec … psql -U supabase_admin` because the pooler tunnel runs as non-owner `postgres`). So the DB tier for this entire area is on prod through 00254.

**On prod (edge functions):** the six area edge fns were baked into `ghcr.io/kodeman/edge-runtime:latest` and deployed with the 2026-06-16 push, so they are live. (The 2026-07-02 note flags that the edge-runtime image rebuild for NEW fns — proposal-nudge etc. — is still pending, but that does not affect the billing/procurement fns already in the image.)

**On prod (app tier):** the designer-portal billing/procurement/earnings/time UI shipped at `c224b0e7`. Procurement is gated behind the PostHog flag `procurement-workspace-pilot` (initial cohort = Kody + 2 designers TBD). The Document "Accounts book" invoicing surfaces and the newest proposal-watch/portal work are on `main`; whether the latest designer-portal image is redeployed to prod is not confirmed here.

**Crons:** `invoice-reminders-daily` (15:00 UTC), `po-payments-due-daily` (14:00 UTC), `delivery-this-week-weekly` (Mon 13:00 UTC) are scheduled via pg_cron and depend on the `app.settings` GUCs resolving the edge-fn URL + service key.

**Caveat:** ⚠ Stripe live-key configuration and a prod webhook endpoint registered with `?apikey=` are still open (see Section 7) — schema/functions are deployed but real-money online payment is unverified on prod.

## 10. Superseded Sources

- `docs/handoffs/procurement-workspace-sprint-1-report.md`
- `docs/handoffs/procurement-workspace-sprint-2-report.md`
- `docs/handoffs/procurement-workspace-sprint-3-report.md`
- `docs/handoffs/procurement-workspace-wave-1.1-architect-dossier.md`
- `docs/handoffs/procurement-workspace-wave-1.3a-portal-conventions-dossier.md`
- `docs/handoffs/procurement-workspace-wave-2.1-architect-dossier.md`
- `docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md`
- `docs/handoffs/procurement-wave4-pdf-spike.md`
