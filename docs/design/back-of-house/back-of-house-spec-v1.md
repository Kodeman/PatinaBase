# Back of House — Spec v1
**Fulfillment Operations System · cut 2026-07-16 · lands at `docs/design/back-of-house/back-of-house-spec-v1.md`**

The spec is intent; DECISIONS.md is history; the codebase is truth. Section
numbers are frozen from this cut — new material folds into existing
sections, §14 open questions keep their numbers permanently.

Feel authority: `back-of-house-presentation.html` (screens, type, spacing)
and `back-of-house-prd.md` (narrative rationale). Claude Code ports their
**intent, never their markup**. Where this spec and the PRD disagree, this
spec wins — it post-dates the founding interview (R1).

---

## §1 · Scope & placement

One operator fulfills client orders spanning up to six drop-ship vendors,
with no warehouse. v1 is **manual on purpose**: every operator action writes
a typed event (§11) so automation rungs are justified by observed data.

- Lives in **`apps/admin`**, new `/fulfillment` zone (R1.5). No new
  deployment surface. Domain logic in `@strata/fulfillment`.
- Serves **Rail A only** (Designer Selections, Patina merchant of record).
- Leah's only surface: substitution review cards at
  `/mission-control?assignee=leah` (R1.4, §9.4).
- Design grain: typography-first, no box shadows on content, Strata rules
  not tabs, exception-first. Queue band placement obeys the action test
  (the-document R22): waiting → Watching, never Needs Action Now.

## §2 · Domain model & state machines

Five nouns: **Order** (client truth) · **Vendor PO** (operator unit) ·
**Shipment** (physical movement) · **Exception** (overlay with clock,
evidence, financial outcome) · **Ledger entry** (financial truth).

**Line-level state machine** (on `order_items.line_state`):
`intake → split → transmitted → acknowledged → in_production → shipped →
delivered → settled`, with `cancelled` terminal from any pre-`shipped`
state. Order status is **always derived** (min stage across lines +
exception overlay), never written.

**Vendor PO states:** `draft → sent → acknowledged → in_production →
shipped → delivered → settled`, `cancelled` terminal. Exceptions overlay
lines/POs/shipments without removing lifecycle state.

**SLA clocks (business-hours aware, from `fulfillment_config`):**
intake→queue visible ≤ 1 min (system) · split confirmed ≤ 4 bus. hours ·
ack chase at 2 bus. days after send · tracking entered ≤ 24 h of ship
notice · inspection window per carrier profile (days).

## §3 · Intake contract (greenfield, R1.1)

Fulfillment defines the contract; iOS binds later. A Supabase Edge Function
receives Stripe `payment_intent.succeeded` (metadata carries client,
designer attribution, cart lines with catalog ids, ship-to, totals incl.
tax + freight charged) and performs, transactionally:

1. Insert `orders` + `order_items` (vendor proposed from catalog mapping;
   missing mapping → `unmapped` flag, R1.7).
2. Post the **capture** ledger entry (§8 template T1).
3. Write `fulfillment_events: order.intake`.

Phase 0 exercises this via a **seed script** (§12) that fabricates capture
payloads — same code path, no fake side doors.

## §4 · Schema (additive; all tables new per R1.2)

Minimal upstream tables (`vendors`, `catalog_items`, `clients`,
`designers`) are created here, each commented
`-- minimal · ownership migrates later`. Core fulfillment tables as drafted
in the PRD §7 (`orders`, `order_items`, `vendor_pos`, `vendor_po_lines`,
`shipments`, `exceptions`, `vendor_profiles`, `fulfillment_events`,
`client_notifications`) with these deltas from R1:

- `order_items.vendor_id` **nullable** + `mapping_state
  ('mapped'|'unmapped')`; split cannot confirm while any line is unmapped.
- `vendor_profiles.transmission_type check in ('email','portal','csv')`
  (R1.6); all other protocol facts are data fields.
- `leah_reviews` (id, exception_id, payload jsonb — comparison card —,
  status `pending|approved|rejected`, ruled_at) (R1.4).
- `fulfillment_config` (key, value jsonb, updated_by, updated_at) seeded
  with the three R1.12 defaults + SLA hours + carrier inspection-window
  days.
- Ledger tables per §8 (real, not stub — R1.3).
- RLS: operator role full; `leah` role scoped to `leah_reviews`; agent
  roles read-only on `fulfillment_events` + queue views. `fulfillment_events`
  and ledger tables: INSERT only (no UPDATE/DELETE grants).

## §5 · The five screens

Feel is specified in the presentation; behavior normative here.

**§5.1 Fulfillment Queue** — three bands (Needs Action Now / Watching /
Quiet), placement derived from SLA clocks + exception pins; next-action
verb per row; six stage dots; keyboard `j/k` move, `Enter` workbench, `n`
send drafted note, `x` exception. **Zero-invisibility invariant:** an audit
query proves every non-settled order maps to exactly one band; CI runs it
against seeds.

**§5.2 Order Workbench** — client order left, vendor PO cards right, mono
indexes ①…ⓝ threading both sides; proposed split from mapping; drag a line
between POs; **Unmapped** lines block confirm until vendor + cost assigned
(R1.7); money strip (captured · vendor cost · freight est · projected
commission · Pledge accrual) recomputes live, warns terracotta below the
margin floor (config).

**§5.3 PO Composer & Transmission Log** — react-pdf render (R1.10) with
masthead, PO number `PO-{yyyy}-{order#}-{A..F}`, side-mark
`{CLIENT}-{order#}`, ship-to, requested ship, blind-ship instruction, the
vendor's change window and claims terms. Transmit per `transmission_type`:
email via Resend from `orders@patina.cloud` (R1.8, message id logged) ·
portal checklist + reference capture · CSV to vendor column spec. PDF →
R2, key on the PO. Ack capture: method, vendor ref, committed ship date →
re-dates client ETA and drafts the client note. The log is append-only;
corrections append.

**§5.4 Shipment Board** — rows are shipments; mode `parcel|ltl|white_glove`;
tracking manual in v1 (schema webhook-ready); LTL/WG require appointment
confirmation; freight ship-notice auto-attaches inspection guidance; POD →
inspection window countdown from carrier profile days.

**§5.5 Exception Desk** — types damage / delay / backorder / substitution
(v1 playbooks) + loss / client-change / cancellation / return (records
exist, playbooks thin). Case file: clock dominant, evidence to R2
(tokenized client upload link), resolution paths rendered as sentences with
their ledger consequence shown in mono **before** commit. Every close
records financial outcome + cause code. Substitution needing aesthetic
judgment → `leah_reviews` card (§9.4); her ruling writes back and drafts
the client note.

## §6 · Client notifications (R1.9)

A **dispatcher** with channel adapters: `email` (Resend) and `push`
(existing APNs path — audited in S0; if not callable, adapter logs
`notification.push_skipped` and email carries alone, O1). Templates per
transition (confirmed · in-production ETA · shipped [+freight inspection
guidance] · delivered check-in · ETA change/exception), rendered with order
data, **never exposing vendor decomposition**. v1: drafted, operator-sent
(`n`); edits diffed into `client_notifications` (the v1.5 auto-send
corpus). **Derived-status API** (read-only endpoint: order status timeline,
client-safe vocabulary) ships now for iOS to bind later.

## §7 · Vendor Directory & scorecards

Protocol sheet = `vendor_profiles` fields, operator-editable (R1.6).
Scorecard computed from `fulfillment_events`: median ack, on-time ship vs
committed, damage rate, fill rate, exception rate by cause — trailing 90 d
with n shown. Feeds the 500-point rubric at renewal (manual export fine in
v1).

## §8 · The minimal ledger (R1.3)

Real double-entry, deliberately small. No multi-currency, no period close,
no sub-ledgers.

**Tables:** `ledger_accounts` (code, name, type
asset|liability|equity|revenue|expense) · `ledger_entries` (id, memo,
source_event_id → fulfillment_events, refs jsonb, posted_at) ·
`ledger_lines` (entry_id, account_code, debit_cents, credit_cents; check:
exactly one side > 0). **Balance enforced at the database** (constraint
trigger: per-entry Σdebits = Σcredits, non-empty). Append-only: no
UPDATE/DELETE grants; corrections are reversing entries referencing the
original.

**Seeded chart:** 1000 Cash—Stripe Clearing · 1100 Claims Receivable ·
1200 Vendor Deposits · 2000 Vendor Payables · 2100 Sales Tax Payable ·
2200 Pledge Liability—Teaching Royalties · 2300 Client Credits Payable ·
3000 Retained Earnings · 4000 Product Revenue · 4100 Freight Revenue ·
4900 Refunds (contra-revenue) · 5000 COGS · 5100 Freight Expense · 5200
Damage & Claims · 5300 Pledge Expense—Teaching Royalties.

**Posting templates (the fixed v1 set):**
T1 capture — Dr 1000 / Cr 4000, 4100, 2100.
T2 vendor deposit at PO (terms-dependent) — Dr 1200 / Cr 1000.
T3 settle — Dr 5000, 5100 / Cr 2000 (clearing 1200 first); plus Pledge
accrual Dr 5300 / Cr 2200 at 25% of realized commission (per-vendor rate,
config).
T4 refund — Dr 4900 (+2100 reversal) / Cr 1000.
T5 damage outcomes — claim: Dr 1100 / Cr 5200; client credit: Dr 5200 /
Cr 2300; recovery: Dr 1000 / Cr 1100.
T6 freight true-up — variance to 5100 with the typed reason in memo.

Pledge postings are **tagged, not legally characterized** (O2). **Daily
reconciliation view:** Stripe balance transactions vs account 1000
activity; deltas surface in the queue's Needs Action Now.

## §9 · Integration boundaries

**§9.1 Stripe** — intake webhook (§3) + reconciliation feed. **§9.2 R2** —
PO PDFs, PODs, evidence photos; keys on records. **§9.3 Resend** — PO email
+ client email; domain verification is O3. **§9.4 Leah** — `leah_reviews`
is the contract; the stub card renders pending items mobile-first at the
route; Mission Control proper adopts both later. **§9.5 iOS** — the
derived-status API (§6); vendor entities never cross it. **§9.6 PostHog** —
mirrors `fulfillment_events` for funnels.

## §10 · Config (R1.12)

`fulfillment_config`, UI-editable: per-vendor commission (seed 16%) ·
settlement variance tolerance (seed greater of $25 / 2% of PO) · margin
floor warning (seed 25%) · SLA hours · carrier inspection-window days ·
business-hours calendar.

## §11 · Telemetry — the Run Log

Every mutation flows through one helper that writes `fulfillment_events`
(event_type, actor, refs, payload before→after, duration_ms). Nothing
mutates outside it — this is a review gate, not a convention. PostHog
mirror. The weekly automation-candidates digest is v1.1; the data starts
day one.

## §12 · Seeds (R1.6, R1.1)

Six placeholder vendor profiles covering all three transmission types and
varied terms (prepay / 50-50 / net-30) · sample catalog with vendor
mapping, including **two deliberately unmapped items** · five seeded orders
via the intake path, including one 5-line/5-vendor order and one
single-line order · config defaults · chart of accounts.

## §13 · Non-goals (v1)

No vendor API/EDI, no auto PO transmission, no carrier tracking webhooks
(schema-ready only), no vendor self-serve portal, no inventory sync, no
auto client notifications, no multi-operator assignment, no returns
automation, no 3PL receiving, no period close in the ledger.

## §14 · Open questions (numbers permanent)

**14.1** = O1, callable push path. **14.2** = O2, counsel items (tax /
money transmission / Pledge characterization). **14.3** = O3, Resend DNS.
**14.4** — carrier profile source of truth: per-vendor (vendor-arranged
freight) vs a separate carriers table; v1 folds carrier facts into
`vendor_profiles` + shipment fields; revisit if Patina-arranged freight
arrives.
