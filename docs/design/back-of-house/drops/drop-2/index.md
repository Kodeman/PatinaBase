# Drop 2 — the Shipment Board (S5, live on merged S6 ledger)

**Back of House · screenshot drop for design authority · 2026-07-17**

Wave F combined-pass capture: S5 (Shipment Board, built stackless) and S6
(ledger + settlement + Stripe recon + the shipment RPCs, 00360–00363) merged
on `origin/boh/integration` and verified together live for the first time —
including the appointment-confirm → deliver → ETA-update round trip that
00363 was supposed to unblock.

- **Commit:** `a728b5e9` (`docs(boh): append I10 — S5 shipment board ship
  record`) — HEAD of `origin/boh/integration` at capture time, worktree
  `.claude/worktrees/agent-boh-combined-f` on branch `boh/wave-f-combined`.
- **Viewport:** 1440×900, full-page PNG.
- **Feel authority:** `docs/prds/back-of-house-presentation.html` (Shipment
  Board section). Spec §5.4 (normative).
- **Generator:** the drop-2 PNG is produced by
  `apps/admin-portal/e2e/boh-shipments.spec.ts`'s own screenshot test
  ("drop-2 screenshot — board with all four fixture states visible"), not a
  manual capture — run in isolation (`-g "drop-2 screenshot"`) against a
  freshly reset + reseeded stack so none of the suite's own mutating tests
  (POD upload, etc.) have touched the four fixture rows first.
- **Ignore the two corner glyphs** (a small "N" bottom-left, a colored disc
  bottom-right) — local dev-mode overlays, not part of the Shipment Board UI;
  they do not ship.

## Seed-state recipe (how to reproduce these exact pixels)

```bash
# local stack only — verify DB URL = 127.0.0.1:54322, never Strata
cd supabase && supabase db reset                          # migrations 00001→00363 + reference seeds
supabase functions serve --env-file functions/_tests/test.env --no-verify-jwt   # terminal 2
cd .. && SUPABASE_SERVICE_ROLE_KEY=<local HS256 service key from vault> pnpm seed:fulfillment   # 5 orders through the intake fn
psql "$LOCAL_DB" -f scripts/seed-fulfillment-fixtures.sql            # +4 S1/S3 band fixtures → 9 orders
psql "$LOCAL_DB" -f scripts/seed-fulfillment-shipment-fixtures.sql   # +4 S5 shipment fixtures → 13 orders
# apps/admin-portal/.env.local → NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   + the matching local HS256 anon/service-role keys + NEXT_PUBLIC_ENABLE_FULFILLMENT=true
cd apps/admin-portal && npx playwright test e2e/boh-shipments.spec.ts \
  --project=chromium --workers=1 -g "drop-2 screenshot"    # writes the PNG directly
```

The four shipment fixtures (`scripts/seed-fulfillment-shipment-fixtures.sql`)
are: **Soren Delacroix** (order 10, parcel, in transit — UPS), **Imogen
Farrow** (order 11, LTL, in transit, no appointment confirmed — Deliver/Upload
POD both disabled with a visible reason), **Baxter Linden** (order 12, LTL,
delivered with an inspection window ~2 days from closing — the terracotta
countdown, loudest element on the board), **Odette Marchetti** (order 13,
parcel, in transit, `current_eta` slipped +7 days past `promised_eta` — the
terracotta `JUL 27 · +7` delta). Two S1-fixture rows (Wren Castellano,
delivered/quiet; Dorian Ashford, in-transit/watching) round the board out to
6 visible shipment rows — present because the board reads every shipment,
not just the S5 fixture set.

## Page inventory

| File | Screen | State |
|---|---|---|
| `01-shipment-board-four-states.png` | S5 Shipment Board | 6 shipment rows — the four S5 fixture states (parcel in transit, LTL awaiting appointment/blocked, LTL open inspection window/terracotta, slipped ETA/terracotta) plus two S1 carry-over rows |

## What Wave F verified live (beyond the stackless S5 accepts-when)

- `test:boh-audit` full green on the merged tree: A1–A7 / Q1–Q7 / T1–T5 /
  **L1–L23** / 56 Deno tests.
- `boh-shipments.spec.ts` 7/7 live against a real running stack (chromium),
  including the LTL-blocked-without-appointment negative (UI disabled state
  **and** the API's 409 `appointment_required`).
- Settlement round-trip: a delivered PO settled through `fulfillment_settle_po`
  with a $34 (3400¢) variance inside tolerance → auto-accepted; T3 + a
  separate tagged pledge-accrual entry + T6 freight true-up all posted,
  each individually balanced; PO and its line advanced `delivered → settled`;
  the order left the queue entirely; the queue-bands audit re-run clean.
- Stripe recon round-trip: the live `fulfillment-stripe-recon` edge function
  ingested 13 fixture transactions matching every live T1/T4 capture on
  account 1000 → `ledger_stripe_recon_v` zero-delta, zero orders pinned,
  `job_runs` row `succeeded`; a single injected mismatched fixture tx pinned
  its order into `needs_action_now` / `reconcile_stripe` with a nonzero
  `recon_delta_cents`, the recon view showing the nonzero day, `job_runs`
  `succeeded`; the underlying zero-invisibility invariant (every non-settled
  order in exactly one queue row, no dupes) held throughout; running the
  function with the fake local Stripe key and no fixtures returned the
  graceful `{skipped: "stripe_not_configured"}` and a `job_runs` row of
  `status='skipped'`.

## Known deviations

**A genuine bug, found and NOT patched (this was a read-only verification
pass — reported for a fix task):**

1. **The appointment-confirm API route's RPC call does not match 00363's
   shipped signature.** `apps/admin-portal/src/app/api/admin/fulfillment/
   shipments/[shipmentId]/appointment/route.ts` calls
   `fulfillment_confirm_appointment` with three named parameters
   (`p_shipment_id`, `p_confirmed_at`, `p_actor`) and a code comment
   documenting the RPC it expects S6 to land with that exact 3-arg shape.
   00363 actually shipped `fulfillment_confirm_appointment(p_shipment_id uuid,
   p_actor text)` — **two** arguments, no `p_confirmed_at`; the RPC always
   stamps `now()` internally. PostgREST resolves this as `PGRST202` ("could
   not find the function ... with parameters p_actor, p_confirmed_at,
   p_shipment_id"), which the route's error-mapping only recognizes as
   Postgres's raw `42883` — so the route falls through to a generic 500
   instead of either succeeding or returning its intended honest 501. Verified
   live: `POST /api/admin/fulfillment/shipments/{id}/appointment` as a signed-
   in admin → **HTTP 500**,
   `{"error":"Could not find the function public.fulfillment_confirm_appointment(p_actor, p_confirmed_at, p_shipment_id) in the schema cache"}`.
   The RPC itself is sound — called directly with the correct 2-arg signature
   it stamps `appointment_confirmed_at` and logs `shipment.appointment_confirmed`
   correctly (verified via psql), and `fulfillment_record_delivery`'s
   appointment gate correctly unblocks Deliver once that column is set
   (verified live via the `pod` route, HTTP 200, `inspectionClosesAt`
   stamped). The fix is route-side: drop `p_confirmed_at` from the call (or
   have a future migration add the 3-arg overload) — not attempted here.
2. `fulfillment_update_shipment_eta` has **no admin-portal UI/API route**
   yet — S5's board reads `current_eta`/`eta_history` but nothing in the
   portal writes them; verified directly via RPC (psql) only. Matches I10's
   "S5 built stackless" framing — an S5/S6 follow-up gap, not a regression.
3. **Needs Action Now still reads crowded** (carried from Drop 1, unchanged).

**Methodology note, not a product bug:** the live recon-mismatch injection
(above) was deliberately aimed at order 8 (Wren Castellano) — which is also
the exact fixture `fulfillment_queue_bands.assert.sql`'s **Q5** check depends
on ("delivered fixture order is quiet"). Re-running the full band-audit file
after that injection shows Q5 failing (order 8 now `needs_action_now` /
`reconcile_stripe`, by design — that's the pin the test was verifying) while
Q1–Q4/Q6–Q7 and the underlying zero-invisibility invariant (checked directly:
`expected = actual = distinct_orders = 12, dupes = 0`) stay green. Picking a
different unsettled order for the injection would have avoided the collision;
noted here rather than re-run, since the invariant itself was independently
confirmed.

**S6's decisions flagged for design authority at C3 (BOH-DECISIONS I9,
named here per the Wave F brief — none re-litigated this pass):**

1. **Pledge freight term** — only the freight variance moves the realized-
   commission basis the pledge accrues against, not the full freight amount.
2. **The separate pledge entry** — pledge accrual posts as its own tagged
   ledger entry (`pledge_tag: true`) rather than as extra lines on the T3
   settle entry. Verified live this pass: order 10's settlement posted T3
   (273000¢) and a distinct pledge entry (3150¢ = 25% of a 12600¢ realized
   commission) as two separately-balanced entries sharing one source event.
4. **T2 deposit basis = product cost only** — freight is unknown at PO
   time, so the prepay/fifty-fifty deposit never includes an estimated
   freight component.
5. **Recon pin fires only when a matching balance tx exists AND the order is
   unsettled** — a delta on an already-settled order shows in
   `ledger_stripe_recon_v` but never surfaces in the queue (documented
   limitation, not exercised this pass — the live mismatch above was
   deliberately injected on an unsettled order).
6. **The mirror's resolved `payment_intent_id` column** — resolved once at
   ingest time from the (expanded) source charge, not re-resolved later.
7. **Parcel appointment-confirm allowed as a trivial stamp** — confirming an
   appointment on a parcel shipment (which needs none) is a harmless
   idempotent no-op rather than a raised error, so a mis-routed UI call can't
   500. (Not exercised this pass — only the LTL fixture's appointment was
   confirmed live.)
8. **The capture-identity CHECK hardening** — `fulfillment_orders` now
   enforces `captured_total_cents = product_subtotal_cents +
   freight_charged_cents + tax_cents` at the table level, not just
   transitively through the T1 ledger-balance trigger.
