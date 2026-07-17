# Back of House — v1 Handoff Package
**For Claude Code · 2026-07-16 · lands at `docs/design/back-of-house/back-of-house-v1-package.md`**

Read order: this package → `back-of-house-spec-v1.md` (normative) →
`DECISIONS.md` (R1 rationale) → `back-of-house-presentation.html` +
`back-of-house-prd.md` (feel + narrative; port intent, never markup).
Authority order: codebase → spec → prototypes → DECISIONS.md.

---

## Part A — the DECISIONS.md block

This is a **new track**: `docs/design/back-of-house/DECISIONS.md` lands
whole (D1 charter · R1 founding ruling, thirteen calls · O1–O3), footer
included — nothing to append, the file is the block. Your entries start at
**I1** in this file, not the-document's. Log the S0 audit findings as I1
before building. Cross-track references fully qualified ("the-document
R22").

## Part B — the build plan

Eight slices across three phases (eight weeks — Phase 2 grew one week to
carry the ledger, R1.3). Sequence gates: **S0 gates everything · S6 gates
S7**. Everything else may interleave within its phase. Screenshot review
drops to design authority after **S2, S5, S7** — the bless-vs-rule line
applies: bless your code-only calls with rationale, escalate anything an
operator would *see*.

### Audit-first verifications (run before S0 scaffolding; log as I1)

1. `apps/admin` — confirm it exists; record its router pattern, auth
   approach, Tailwind config, and layout conventions. Scaffold
   `/fulfillment` to match, don't invent.
2. Tables — expectation is greenfield (R1.2), but verify none of
   `vendors, catalog_items, clients, designers, orders` already exist in
   any migration. If any do, stop and reconcile in an I-entry before
   migrating (the-document I25 lesson).
3. Push path (O1 / §14.1) — search for any callable APNs send path
   (service, Edge Function, config). Record found/not-found; wire or
   logged-skip accordingly (§6).
4. R2 + Resend + Stripe env — confirm which credentials exist in the admin
   app's environment; list what Kody must provision (Resend DNS is O3 and
   is Kody's, not yours).
5. Supabase Realtime — confirm it's enabled on this instance before
   building queue live-updates against it.

### Additive schema list (all new; migrations additive-only)

`vendors` · `catalog_items` · `clients` · `designers` *(minimal, marked)* ·
`orders` · `order_items` · `vendor_pos` · `vendor_po_lines` · `shipments` ·
`exceptions` · `vendor_profiles` · `leah_reviews` · `fulfillment_config` ·
`fulfillment_events` · `client_notifications` · `ledger_accounts` ·
`ledger_entries` · `ledger_lines`. Details and constraints: spec §4, §8.

### Phase 0 — Foundation (weeks 1–2)

**S0 · Schema, intake, seeds, telemetry.**
Migrations per spec §4/§8; intake Edge Function per §3; seed script per
§12 (seeds flow through the intake path, no side doors); the single
mutation helper writing `fulfillment_events` (§11) with PostHog mirror;
RLS per §4.
*Accepts when:* seed run produces 5 orders visible by SQL with correct
line states and one capture ledger entry each (balanced); two seeded items
land `unmapped`; every seed mutation appears in `fulfillment_events`; an
unbalanced ledger entry is rejected by the database in a test; UPDATE on
`fulfillment_events` is denied.

**S1 · Fulfillment Queue.**
Three bands with derived placement (spec §5.1); next-action verbs; stage
dots; keyboard j/k/Enter/n/x; Realtime refresh; the zero-invisibility
audit query in CI.
*Accepts when:* every seeded order appears in exactly one band and the
audit query proves it; SLA breach on a seeded stale order moves it to
Needs Action Now with a terracotta age; band placement of an in-transit
order is Watching (the action test holds); full keyboard traversal works
without the mouse.

**S2 · Order Workbench.** *(→ screenshot drop 1)*
Split view per §5.2; proposed split from mapping; unmapped state blocks
confirm until vendor + cost assigned; drag line between POs; money strip
live-recomputes; margin-floor warning from config.
*Accepts when:* the 5-vendor seeded order decomposes to 5 PO drafts on
confirm and every line's ① index appears on both sides; an unmapped line
visibly blocks confirm and unblocks on assignment; dragging a line moves
it and the strip re-figures; strip warns below the configured floor;
confirm advances line states to `split` and logs events.

### Phase 1 — Transmission (weeks 3–4)

**S3 · PO Composer & Transmission Log.**
react-pdf per §5.3; PDF → R2; email transmit via Resend (sandbox until O3
resolves) with message id logged; portal + CSV paths; ack capture with
committed date → client ETA re-date + drafted note; SLA clocks + chase
surfacing in the queue.
*Accepts when:* a generated PO PDF for a seeded vendor carries masthead,
PO number, side-mark, terms, and archives to R2; each transmission type
writes its log line; the log is append-only (correction appends, original
immutable); an unacked PO surfaces "Chase — day 2" on schedule
(business-hours aware); ack capture re-dates the ETA and a drafted note
appears.

**S4 · Notification dispatcher & derived-status API.**
Dispatcher with email + push adapters per §6 (push per the S0 audit:
wired, or logged skip); templates for the five transitions; one-key send
with edit-diff capture; the read-only derived-status endpoint,
client-safe vocabulary only.
*Accepts when:* each transition on a seeded order yields a drafted note
sent with `n`; edits are diffed into `client_notifications`; the freight
ship template carries the inspection-guidance paragraph; no rendered
template or API response contains a vendor name or PO number; push either
delivers or logs `notification.push_skipped` per O1.

### Phase 2 — Movement & Money (weeks 5–8)

**S5 · Shipment Board.** *(→ screenshot drop 2)*
Per §5.4: shipments model, mode chips, LTL/WG appointment requirement,
inspection windows from carrier profile days, POD storage.
*Accepts when:* a parcel and an LTL shipment render with correct chips; an
LTL shipment cannot reach "delivered" flow without a confirmed
appointment; a slipped current-ETA renders the slip; POD upload opens the
countdown and the countdown is loudest-on-board; window close advances
lines toward settle.

**S6 · The minimal ledger.** *(gates S7)*
Chart seed, balance trigger, append-only enforcement, posting templates
T1–T6, wiring T1 to intake (already emitting from S0 — reconcile), daily
Stripe reconciliation view surfacing deltas into the queue.
*Accepts when:* all six templates post balanced entries against a seeded
order walked end-to-end; a reversing-entry correction nets an original to
zero and both survive (no UPDATE path exists); the reconciliation view
shows zero delta on clean seeds and surfaces an injected mismatch in
Needs Action Now.

**S7 · Exception Desk & Settlement.** *(→ screenshot drop 3)*
Four playbooks per §5.5; evidence via tokenized client upload to R2;
`leah_reviews` + the stub card at `/mission-control?assignee=leah`
(mobile-first, approve/pass, seconds-long); settlement three-way match
with tolerance from config, typed reason for out-of-tolerance; T3 + Pledge
accrual posting; cause codes on every close.
*Accepts when:* a seeded damage exception resolves through each path with
the correct T5 postings and the ledger consequence was shown before
commit; a substitution round-trips — card appears on Leah's route, ruling
writes back, client note drafts; settlement of a seeded PO with a $34
freight variance auto-accepts in tolerance and demands a typed reason
beyond it; the Pledge accrual posts at 25% of realized commission and is
tagged per O2; every closed exception has outcome + cause code.

### v1 launch acceptance (unchanged from the ruling)

A 3-vendor order works intake → transmit in under 10 minutes · every state
change offers a client note, no silent gap exceeds 7 days · ledger
reconciles to Stripe daily · the zero-invisibility guarantee holds under
audit.

---

## The kickoff line

Read `docs/design/back-of-house/` (package → spec-v1 → DECISIONS → the two
artifacts), run the Part B audit and log it as I1 in the Back-of-House
DECISIONS.md, then build S0–S2; first screenshot drop for design review is
the Workbench on the seeded 5-vendor order.
