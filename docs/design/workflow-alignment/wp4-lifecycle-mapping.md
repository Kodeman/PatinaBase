# WP4 Track 1 — the procurement lifecycle, step by evidence

**Ruling:** R7 (deck folio 12, mockup M7) · **Checkpoint ruling:** rendering
grammar, zero new schema, one migration NOT authorized · **Date:** 2026-08-12

This is the mapping table behind `deriveProcurementLifecycle` (Rail B) and
`deriveFulfillmentLifecycle` (Rail A). It exists so that any reading the glass
produces can be argued with: every settled step below names the column that
settled it.

The fifteen steps and three gates are **rendering grammar over read models that
already exist**. Nothing here is a stored product object; no step has a table,
no transition has a migration. That is decision №8, and it stays open — §5 is
its docket.

---

## 1. The contract

Defined in `packages/types/src/procurement-lifecycle.ts`, shared by both rails
so that the admin portal and the designer portal read the same fifteen words.

| # | Step | # | Step |
|---|------|---|------|
| 01 | Cleared to produce | 09 | Received / inspect |
| 02 | Released to maker | 10 | Accepted or issue |
| 03 | Acknowledged | 11 | Stored |
| 04 | Awaiting inputs | 12 | Install released |
| 05 | Released | 13 | Installed |
| 06 | In production | 14 | Punch / service |
| 07 | Ready to ship | 15 | Closed |
| 08 | In transit | | |

Gates interrupt the run after steps 04, 09 and 11:

| Gate | After | Reads |
|---|---|---|
| Complete to produce | 04 | acknowledged **and** deposits cleared |
| Received and dispositioned | 09 | inspected at full count **and** no open claim |
| Warehouse + site ready | 11 | *no fact exists on either rail* |

**Reading shape.** Per step `{ state, evidence? }` where state is
`settled | live | future | no-record`; per gate `{ state, qualifier? }` where
state is `settled | open | unreached | no-record`; plus a rail tag
(`studio | patina`). Evidence is `{ at, source }`, where `source` names the
actual column.

**The one-live-step invariant** lives in `assembleProcurementReading`, not in
either mapper, so neither rail can break it: the live step is the
highest-ordinal evidenced step, and it is live unless it is terminal (step 15),
in which case nothing is live.

**`no-record` is not `future`.** A step behind the trail's position with no
fact behind it reads `no-record` and renders quiet with a "no record"
microcopy. A step ahead of the position reads `future` and renders
dashed-outline and empty. Neither is ever drawn as if it happened, and neither
blocks anything.

---

## 2. Rail B — studio procurement (`deriveProcurementLifecycle`)

`apps/designer-portal/src/lib/document/procurement-lifecycle.ts`. Inputs are
rows the existing hooks already fetch.

| # | Step | Evidence | Source column |
|---|---|---|---|
| 01 | Cleared to produce | a PO exists **and** every `deposit`-kind payment is `paid` (no deposit rows ⇒ vacuously true) | `po_payments.kind` / `.state` / `.paid_date` |
| 02 | Released to maker | PO was sent | `purchase_orders.sent_at` |
| 03 | Acknowledged | vendor acknowledged | `purchase_orders.acknowledged_at` |
| 04 | Awaiting inputs | **none — §5.1** | — |
| 05 | Released | production began (one fact evidences 05 and 06) | `purchase_orders.status='in_production'`, dated by `project_ffe_items.last_status_change_at` |
| 06 | In production | same fact | same |
| 07 | Ready to ship | **none — §5.2** | — |
| 08 | In transit | PO shipped | `purchase_orders.status='shipped'`, dated by `confirmed_eta` |
| 09 | Received / inspect | goods landed | `purchase_orders.delivered_date`, else `project_ffe_items.status='delivered'` |
| 10 | Accepted or issue | the inspection's item-grain write-back and/or a claim on this line | `project_ffe_items.received_quantity`, `damage_claims.ffe_item_id` |
| 11 | Stored | **none — §5.3** | — |
| 12 | Install released | **none — §5.4** | — |
| 13 | Installed | item machine reached installed | `project_ffe_items.status='installed'` |
| 14 | Punch / service | **none — §5.5** | — |
| 15 | Closed | **none — §5.5** | — |

**Steps do not imply one another on this rail.** A delivered line whose PO was
never marked sent reads step 02 as `no-record`, because that is what the book
actually knows. (Rail A's `line_state` chain is ordered and *is* an exception —
see §3.)

### Gate predicates (Rail B)

- **G1 Complete to produce** — settled when `acknowledged_at` is set **and**
  every deposit-kind payment is `paid`. Qualifier when open: `awaiting
  acknowledgment`, else `deposit outstanding`.
- **G2 Received and dispositioned** — settled when an inspection has been
  logged at item grain (`received_quantity` is non-null), the count is not
  short (`received_quantity = quantity`), and no claim on the line is
  `drafted`/`vendor_notified`. Qualifier when open: `awaiting inspection`,
  `open claim`, `short receipt`.
- **G3 Warehouse + site ready** — no fact exists. Reads `unreached` before
  step 11 and `no-record` after. It is never settled and never open.

These are **derived operational seals**, not client ceremonies. No
`client_decisions` row is consulted, no client act settles one, and nothing
they read is rendered as a payment surface, a balance, or a funds-held
indicator (folio 14).

---

## 3. Rail A — Patina fulfilment (`deriveFulfillmentLifecycle`)

In `packages/types/src/procurement-lifecycle.ts` so the admin portal can import
it in Track 3. **Pure function + tests only in this track — no admin UI.**

| `line_state` | Step |
|---|---|
| `intake` | — (rail bookkeeping; draws nothing) |
| `split` | — (rail bookkeeping; draws nothing) |
| `transmitted` | 02 Released to maker |
| `acknowledged` | 03 Acknowledged |
| `in_production` | 06 In production |
| `shipped` | 08 In transit |
| `delivered` | 09 Received / inspect |
| `settled` | 15 Closed |
| `cancelled` | — **off-trail**, see below |

The chain is **ordered**, so reaching `shipped` settles `transmitted`,
`acknowledged` and `in_production` behind it. Those settle **undated**: the item
row carries exactly one date (`line_state_entered_at`) and it belongs to the
current state alone. Dated shipment facts override the undated implication:
`fulfillment_shipments.shipped_at` → step 08,
`fulfillment_shipments.delivered_at` → step 09.

`cancelled` is a **ninth** allowed `line_state` value (00350) that the deck's
eight-state list omits. It is terminal but off-trail: it evidences no step and
takes no position in the order. Shipment and exception facts on a cancelled
line still read, because a crate that arrived damaged arrived damaged whatever
happened to the order.

**Exceptions** (`fulfillment_exceptions`) map onto step 10's *issue* reading —
they are the issue half of "Accepted or issue". `status` is open unless
`resolved` (so `pending_leah` still counts as open); the `type` (damage, delay,
backorder, substitution, loss, client_change, cancellation, return) is carried
through verbatim as the evidence source. Acceptance itself has **no Rail A
fact**, so a line with no exception never claims acceptance — it simply leaves
step 10 unclaimed while G2 settles.

Rail A gates: G1 is `no-record` (the rail has no inputs-complete fact); G2
settles on delivery with no open exception; G3 is `no-record` as on Rail B.

---

## 4. Where it renders

| Surface | File | What it shows |
|---|---|---|
| FF&E line unfold | `components/document/procurement-trail.tsx`, mounted in `line-unfold.tsx` | the full numbered trail — settled stamped, live in clay, future dashed-outline, `no-record` quiet, gates as full-width interrupting bars with an oak left border once reached |
| Orders book, ledger density | `components/document/orders-ledger.tsx` | the row's Stamp becomes the lifecycle **position**; new "Next gate" (name · qualifier) and "Expected" columns. **The fifteen steps never enumerate here.** |

Constraints honoured: zero shadows (D4); all trail type ≥12px — M7's miniature
stamp sizes are a plate device and do not ship; exceptions keep the existing
stamp kinds (`damaged`, `partial`) on the line's own stamp, so the trail adds no
new badge genre; nothing about overdue appears on the trail (R4's device belongs
to the margin and the Desk).

### One hook select was extended (existing columns only)

`packages/supabase/src/hooks/use-project-v2.ts` — `useProjectFFEItems` now also
requests `purchase_orders.delivered_date`, the nested `po_payments`
(`kind, state, due_date, paid_date`), and `damage_claims.created_at`. Every one
of these already exists in the database; none is new schema. Without them the
trail could not evidence steps 01, 09 and 10 at all.

---

## 5. №8 docket — the five missing facts

Decision №8 asks whether the item lifecycle is grammar or schema. This track
ships it as **grammar**. Below is what it would cost to make each currently
unevidenced step real, **priced as a future data wave and deliberately not
built**. Each is additive; none is required for the trail to render honestly
today, because an unevidenced step reads `no-record` rather than lying.

| § | Step | Missing fact | What additive evidence would cost |
|---|---|---|---|
| 5.1 | **04 Awaiting inputs** | whether a line is held on COM/CFA/finish approval, and when it cleared | The heaviest of the five, because it is a *sub-workflow*, not a timestamp: an inputs checklist per line (which inputs, requested, received, approved), plus the act that clears each. Roughly one table + one RPC + a line-unfold act. It is also the highest-value: "Awaiting inputs" is the single most common real reason a maker has not started, and today the book cannot say it. |
| 5.2 | **07 Ready to ship** | vendor says the goods are complete and crated, before a carrier has them | One nullable timestamp on `purchase_orders` (`ready_at`) plus somewhere to log it — the existing "log ack" inline act is the natural host. Cheapest of the five. Closes the blind week between "In production" and a tracking number. |
| 5.3 | **11 Stored** | receiver/warehouse custody: where the goods physically are between receipt and install | A location dimension the schema has nowhere for today. Minimally one nullable `storage_location` + `stored_at` on the item; properly, a receiver entity with addresses. Note this is the gating fact for **gate G3**, which is why G3 can never settle today. |
| 5.4 | **12 Install released** | the act of releasing stored goods to a site on a date | One timestamp plus an act, but it depends on 5.3 — releasing from storage is meaningless without storage. Sequence it after 11. |
| 5.5 | **14 Punch / service · 15 Closed** | post-install defect tracking and the line's final closure | Rail A already closes (`line_state='settled'` → step 15), so only Rail B is dark here. Closure is one timestamp; punch/service is a small defect record per line, closely related to the existing `damage_claims` shape and possibly a state extension of it rather than a new table. |

**Recommended sequence if the wave is ever funded:** 5.2 (cheapest, immediate
read), then 5.1 (highest value), then 5.3 → 5.4 as a pair (they unlock gate
G3 together), then 5.5. Nothing here is authorized by this track.

---

## 6. Interpretations made, not ruled

Surfaced rather than decided — each is a place the ratified mapping needed a
judgment call against the real schema.

1. **`purchase_orders.last_status_change_at` does not exist.** The column is on
   `project_ffe_items` (00084). Steps 05/06 therefore take the PO's
   `status='in_production'` as the fact and the *item's*
   `last_status_change_at` as the date.
2. **Step evidence reads both the PO status and the item machine**, because
   neither alone spans the trail: PO status has `in_production` but no
   `installed`; the item machine has `installed` and `production` but no
   `in_production`. Either satisfies its step.
3. **`confirmed_eta` dates step 08.** It is an *expectation*, not a departure —
   but it is the only date a shipped PO carries. The evidence `source` string
   says so explicitly.
4. **`receiving_inspections` is PO-grain and has no FF&E link.** The item-grain
   trace of an inspection is the `received_quantity` count that 00184's trigger
   writes back, so that is what steps 09/10 and gate G2 read.
5. **A draft PO with no payment rows settles step 01 vacuously.** This follows
   the ratified rule literally ("no deposit rows → vacuously true"). It means a
   never-sent draft PO reads "Cleared to produce" as its position. Flagged for
   Kody: if that is too generous a claim, the fix is to require a non-draft
   status as a second term — one line, not a schema change.
6. **The orders ledger keeps PO grain.** M7's book plate shows line-grain rows;
   the shipping ledger groups POs by vendor and carries the send, bulk-ETA and
   ack acts. Rows *gained* the M7 columns rather than changing grain — a
   regrain would have deleted working machinery for a mockup detail.
7. **`po_payment_state` has four values, not three** — `refunded` was added by
   `ALTER TYPE` in 00277. A refunded deposit is treated as **not** paid.

---

## 7. Verification

`packages/types` builds; designer-portal type-check clean; the derivation suite
(`lib/document/__tests__/procurement-lifecycle.test.ts`, 79 tests) covers every
step's evidence mapping, the one-live-step invariant, `no-record` vs `future`,
both gate predicates including the vacuous-deposit case, the Rail A chain, and
exception mapping. The render suite
(`components/document/procurement-trail.test.tsx`, 10 tests) covers the four
step renderings, gate reached/unreached, the zero-shadow rule, the 12px floor,
and the actor-neutral lexicon.
