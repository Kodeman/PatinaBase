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

Every `source` string names the column that **actually fired** for that reading
— it is the audit trail, so a mapping with two possible sources reports which
one it used.

| # | Step | Evidence | Source column |
|---|---|---|---|
| 01 | Cleared to produce | a **live** PO (status not `draft`, not `cancelled`) **and** every `deposit`-kind payment is `paid` (no deposit rows ⇒ vacuously true) | `po_payments.kind` / `.state` / `.paid_date` |
| 02 | Released to maker | PO was sent | `purchase_orders.sent_at` |
| 03 | Acknowledged | vendor acknowledged | `purchase_orders.acknowledged_at` |
| 04 | Awaiting inputs | **none — §5.1** | — |
| 05 | Released | production began (one fact evidences 05 and 06) | `purchase_orders.status='in_production'` **or** `project_ffe_items.status='production'`, dated by `project_ffe_items.last_status_change_at` |
| 06 | In production | same fact | same |
| 07 | Ready to ship | **none — §5.2** | — |
| 08 | In transit | PO shipped — **UNDATED** | `purchase_orders.status='shipped'` **or** `project_ffe_items.status='shipped'` |
| 09 | Received / inspect | goods landed | `purchase_orders.delivered_date`, else `purchase_orders.status='delivered'`, else `project_ffe_items.status='delivered'` |
| 10 | Accepted or issue | a claim on this line (the ISSUE half) and/or the clean-outcome write-back (the ACCEPTED half) | `damage_claims.ffe_item_id`, `project_ffe_items.received_quantity` |
| 11 | Stored | **none — §5.3** | — |
| 12 | Install released | **none — §5.4** | — |
| 13 | Installed | item machine reached installed | `project_ffe_items.status='installed'` |
| 14 | Punch / service | **none — §5.5** | — |
| 15 | Closed | **none — §5.6** | — |

**Step 01 renders undated.** The only date the clearing could carry is
`po_payments.paid_date`, and a payment date *is* a payment fact — rendering it
beside "Cleared to produce" would put money on the glass while №7 is open. The
step says the work is cleared, not when anybody paid; **the date can return if
№7 settles.** The `source` string still names `po_payments` internally, because
it is an audit trail and is never rendered.

**Step 08 renders undated.** The book records no departure: `confirmed_eta` is
an expectation about *arrival*, and dating a shipping step with it would report
a fact that does not exist. The ETA appears exactly once, in the ledger's
Expected column, under the `~` convention that marks it approximate. The
missing departure fact is docketed at §5.7.

**Step 10's date** takes the earliest **open** claim; open outranks resolved,
because an unresolved issue is the live fact. With no open claim it falls back
to the earliest claim of any state, then to `delivered_date`.

**A draft PO takes no position on the trail**, which is what keeps the orders
book saying "draft" out loud rather than promoting an unwritten order to
"Cleared to produce".

**A cancelled PO evidences NOTHING** — not step 01, not its send date, not its
acknowledgment, not a delivery. Exactly as on Rail A: the order was withdrawn,
so the trail reports no position rather than leaving the work standing wherever
it stopped. (The orders register has always filtered cancelled rows out of the
ledger anyway, pre-dating this work.)

**Steps do not imply one another on this rail.** A delivered line whose PO was
never marked sent reads step 02 as `no-record`, because that is what the book
actually knows. (Rail A's `line_state` chain is ordered and *is* an exception —
see §3.)

### Gate readings

A gate has five readings. **`settled` requires both position and terms** — the
trail must have *reached* the gate AND its terms be met; terms satisfied at a
position the work has not arrived at reads `unreached`, not `settled`.

| Reading | Means | Draws |
|---|---|---|
| `unreached` | the work has not arrived | quiet, pearl border |
| `open` | the work is standing at it with a term outstanding | **oak stop bar** + the term |
| `settled` | reached, and every term met | oak bar + a Settled stamp |
| `passed-unsealed` | the work moved past it and the terms were never evidenced | quiet, "no record" |
| `no-record` | the rail holds nothing that could ever bear on it | quiet, "no record" |

`passed-unsealed` exists so the trail **never draws finished work as stopped**.
An installed credenza whose PO was never acknowledged has a missing signature,
not a blockage, and an oak stop bar under it would be a lie about the present.

The counterweight is `holdsOpen`: a term that is a **live condition** — an
unresolved claim, a short receipt, an inspection never logged, uncleared order
terms — keeps its gate `open` even once the trail's position is nominally past
it. The distinction is the whole design: *a live stop stops; an unrecorded seal
goes quiet.*

- **G1 Complete to produce** — settled when `acknowledged_at` is set **and**
  every deposit-kind payment is `paid`. Uncleared terms `holdOpen`; a missing
  acknowledgment does not. The qualifier names the term that ACTUALLY holds it
  open, so uncleared terms come first: `terms outstanding`, else
  `awaiting acknowledgment` — **never funds language** (№7, folio 14). The
  acknowledgment branch is currently unreachable in rendering, for the reason
  given at the end of §5: the trail cannot stand at position 4.
- **G2 Received and dispositioned** — settled when an inspection was logged,
  the count is not short, and no claim on the line is `drafted`/`vendor_notified`.
  **"Inspection logged" is `delivered_date` (or a claim), NOT `received_quantity`**
  — 00150 stamps `delivered_date` on the first inspection row whatever its
  outcome, whereas 00184 writes the count only on a *clean* one, so reading the
  count would report a damaged receipt as never inspected. The count governs one
  term only: whether everything ordered turned up. Qualifier ladder, in order:
  `open claim` → `short receipt` → `awaiting inspection`. All three hold the
  gate open — **except `awaiting inspection`, which does NOT hold it open**: an
  inspection nobody logged is a missing record, so once the work has moved on
  the gate goes quiet (`passed-unsealed`) rather than marking finished goods as
  blocked. While the work is still standing at the gate, position alone keeps it
  open and names the term.
- **G3 Warehouse + site ready** — no fact exists on either rail. It is
  `sealable: false`: drawn (its emptiness is the honest report on §5.3) but
  **never named as a next gate**, because promising a stop that will never come
  is its own small lie.

**Next gate** is a *position ahead*, not a to-do list: the first unsettled,
sealable gate whose `afterStep` is at or beyond the live step. A gate the work
has already gone past is never "next", however it ended up. When nothing remains
ahead the ledger renders "—" rather than reaching backwards for something to say.

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
eight-state list omits. It is terminal and **fully off-trail**: nothing on a
cancelled line reads — not the chain, not shipments, not exceptions. 00350's
chain cancels before shipping, so anything hanging off a cancelled line is moot
bookkeeping, and drawing an open backorder on it would raise a problem nobody
has.

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
| FF&E line unfold | `components/document/procurement-trail.tsx`, mounted in `line-unfold.tsx` | the full numbered trail — settled stamped, live in clay, future dashed-outline, `no-record` quiet, gates as full-width interrupting bars with an oak left border **only when `open` or `settled`** |
| Orders book, ledger density | `components/document/orders-ledger.tsx` via `derivePurchaseOrderLifecycle` | the row's Stamp becomes the lifecycle **position** (a draft/cancelled order keeps its own word); "Next gate" (name · qualifier) and "Expected". **The fifteen steps never enumerate here.** |

**Mount guard.** The trail is for GOODS. It never renders on a trade/service
line (`trade_scope_document_id`, or a `trade_*` stamp) — a trade scope runs its
own journey and fifteen goods steps under tile-setting would be fifteen rows of
nonsense. On a furnishings line it renders only once there is a lifecycle to
read: a linked PO, or at least one evidenced step. A `specified` line with
nothing ordered gets no eighteen-row empty scaffold implying work is pending.

Constraints honoured: zero shadows (D4); all trail type ≥12px — M7's miniature
stamp sizes are a plate device and do not ship. The shared `Stamp` gained a
`size` prop (`xs` = the historical 10px default, unchanged everywhere;
`sm` = 12px) so the trail and the ledger's lifecycle stamp hold one floor with
one component. Exceptions keep the existing stamp kinds (`damaged`, `partial`)
on the line's own stamp, so the trail adds no new badge genre; nothing about
overdue appears on the trail (R4's device belongs to the margin and the Desk).

Both call sites memoize their derivation (`useMemo` keyed on the row / the
fetched orders), so a reading is computed once per fetch rather than per render.

### One hook select was extended — opt-in, existing columns only

`packages/supabase/src/hooks/use-project-v2.ts` — `useProjectFFEItems` accepts
`{ withLifecycle: true }`, which adds `purchase_orders.delivered_date` and the
nested `po_payments` (`kind, state, due_date, paid_date`) to the PO embed.
`damage_claims.created_at` is added unconditionally (one scalar on an embed
already fetched).

**It is off by default and the flag is part of the query key.** Only the
designer portal's `ffe-section.tsx` opts in, because only the Document draws the
trail; the client portal's `ffe-status.tsx` and `FFEPipelinePanel.tsx` fetch
exactly what they fetched before and never pay for the second-level embed.
Keying on the flag matters: without it a lifecycle-less cache entry could be
served to a trail-drawing caller, whose PO would arrive with no payments and
whose trail would silently under-report.

Every column already exists in the database; none is new schema. Without them
the trail could not evidence steps 01, 09 and 10 at all.

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
| 5.5 | **14 Punch / service** | post-install defect tracking | A small defect record per line, closely related to the existing `damage_claims` shape — possibly a state extension of it rather than a new table. |
| 5.6 | **15 Closed** | the line's final closure | Rail A already closes (`line_state='settled'` → step 15), so only Rail B is dark. One timestamp. |
| 5.7 | **08's departure** (carrier / tracking / actual ship date) | when the goods actually LEFT, and how to follow them | Step 08 renders today, but **undated** — the book has no departure fact at all, only `confirmed_eta`, which is an arrival guess. Rail A already carries this (`fulfillment_shipments.shipped_at`, `carrier`, `tracking`), so this is Rail B catching up: a shipments concept on `purchase_orders`, or minimally `shipped_at` + `carrier` + `tracking`. High value for the same reason 5.2 is — it closes the blind stretch between the workshop and the door. |
| 5.8 | **returns / RMA** | goods sent BACK | Rail B has no return concept, so step 10 currently collapses damage, short receipt, and return into one reading, and a returned item has nowhere truthful to sit. Rail A has `fulfillment_exceptions.type='return'`; Rail B would need the equivalent — most naturally as a `damage_claims` resolution path rather than a new object. |

**Recommended sequence if the wave is ever funded:** 5.2 and 5.7 first (cheapest
and highest immediate read — together they make the shipping stretch legible),
then 5.1 (highest value overall), then 5.3 → 5.4 as a pair (they unlock gate G3
together), then 5.5/5.6, then 5.8. Nothing here is authorized by this track.

**One consequence worth stating plainly:** because step 04 has no fact (§5.1),
gate G1 can never read `open` from a *missing acknowledgment* alone — the trail
cannot stand at position 4. G1 does read `open` on uncleared terms, which are a
live condition. M7's book plate shows a row reading "Awaiting inputs · Complete
to produce · COM open"; that row is not reachable until §5.1 is built, and the
trail renders honestly without it rather than faking the step.

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
3. **Step 08 is undated.** `confirmed_eta` is an expectation about arrival, not
   a departure, so it dates nothing on the trail; it renders only in the
   ledger's Expected column. The missing departure fact is docketed at §5.7.
4. **`receiving_inspections` is PO-grain and has no FF&E link.** Steps 09/10 and
   gate G2 read `delivered_date` (stamped on the first inspection, any outcome)
   as the fact that an inspection happened, and `received_quantity` (written
   only on a clean outcome) purely as the full-count term.
5. **A draft or cancelled PO takes no position on the trail.** The
   vacuous-deposit rule ("no deposit rows → vacuously true") applies only to a
   *live* order; without that term a never-sent draft would read "Cleared to
   produce", which is a claim about an unwritten document. **Ruled during
   review**; the ledger keeps saying "draft" and "cancelled".
6. **The orders ledger keeps PO grain**, through its own entry point
   `derivePurchaseOrderLifecycle`. M7's book plate shows line-grain rows; the
   shipping ledger groups POs by vendor and carries the send, bulk-ETA and ack
   acts. Rows *gained* the M7 columns rather than changing grain — a regrain
   would have deleted working machinery for a mockup detail. **Gate G2 cannot
   settle at this grain** (disposition is item-level), so it never claims a seal
   and offers no qualifier — the register has nothing to name. Nothing at this
   grain can evidence steps 10+ either, since the PO status machine stops at
   `delivered`, so the gate never goes quiet: it reads `unreached` before
   delivery and `open` indefinitely from delivery onward. That is honest —
   receipt genuinely is the next thing that happens to these goods, which is
   what M7's book plate names — and it resolves only if line-grain data reaches
   the register.
7. **`po_payment_state` has four values, not three** — `refunded` was added by
   `ALTER TYPE` in 00277. A refunded deposit is treated as **not** paid.
8. **"Expected" is a shipment expectation only.** An earlier pass let it fall
   back to the nearest unpaid payment due date; that would have put a money date
   in a column about goods, which folio 14 forbids. Removed — a line with no
   confirmed ETA expects nothing, and the R18 unscheduled "NO DATE" mark
   survives untouched.

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
