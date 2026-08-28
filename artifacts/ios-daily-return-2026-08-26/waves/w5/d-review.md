# W5 · lane D (backend) — adversarial review

**Reviewed:** `daily-return/w5-d` @ `5dbfc4db4` (base `main` `05b3f9a18`), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w5-d`.
Three commits, 16 files, +2549/−26. Read-only review; no gate was re-run.

Checked against `source/direction-b.md` §5 + §11 M3/M5/M7/M8, `source/direction-a.md` §5
("Three paths", "Attribution, written once"), `source/rulings-2026-08-27.md` R3/Q5/Q6/Q11,
`source/build-plan.md` "Global constraints" + "### W5", `source/build-plan-critique.md`
M3/M14/M15, and the money rules in the lane brief.

## Verdict in one line

The migration is unusually careful work — the attribution resolver genuinely mirrors
`DesignerRelationshipResolver.resolve`, the earnings credit is idempotent on a real partial
unique index, the freeze is a trigger and not a convention, the two shipped 00276 refusal
strings are byte-identical, and the `fulfillment_shipments` SECURITY DEFINER reach-through and
the `fulfillment_order_items` column narrowing are both correct and both non-obvious. Three
things stop me from calling it done: a commercial term the client can now read, a config flag
that hard-fails the fulfillment rail rather than merely understating it, and the fact that
under R3 the designer-facing settle notice can never fire from the app it was built for.

## What I verified as correct (so Fable does not re-check it)

- **Attribution order** — active project → live lead → roster → nobody, ambiguity stops
  resolution rather than falling through. Mirrors `DesignerRelationship.swift` exactly:
  `l.status NOT IN ('declined','expired')` == `DesignRequestStage.isTerminal`
  (`.closed`/`.expired`, `DesignRequestStatusService.swift:91`); the archived-project list is
  `StudioQueueBuilder.projectIsArchived`'s five names verbatim, `::text`-cast off the
  `project_status` enum. The two stated divergences (`projects.first` vs most-recent-created;
  local calendar vs UTC day) are real and correctly disclosed.
- **The roster query has no `WHERE client_id` and does not need one** — `client_designer_roster`
  (00536) is `security_invoker = false`, owned by postgres, and filters `dc.client_id =
  auth.uid()` inside the view. `auth.uid()` reads the `request.jwt.claims` GUC, so it still
  resolves correctly inside a SECURITY DEFINER function. I checked this specifically because a
  `security_invoker = true` view here would have credited a stranger's designer.
- **The same-day tie cannot misfire on one designer twice** — `designer_clients` carries
  `UNIQUE(designer_id, client_id)` (00014:99), so the runner-up is always a different designer.
- **Idempotency** — `ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING` infers the
  partial index correctly (00178's idiom), `FOUND` is false on a conflict, and gating the thread
  message on `v_credited` makes both effects fire on the same single call. Both hang off
  `markDirectOrderPaid`'s `.eq('status','pending_payment')` flip, not off the event.
- **`designer_earnings` shape** — `project_id` exists (00178:182), `source_type` and `status`
  carry no CHECK, `'confirmed'` matches the invoice rail (00178:657). No CHECK migration needed,
  as claimed.
- **Grants** — `create_direct_order` authenticated-only, `get_direct_order_terms`
  authenticated-only, `settle_direct_order_attribution` service_role only (REVOKEd from
  `authenticated`), `fulfillment_po_belongs_to_caller` authenticated. All eleven statements
  correctly replayed into `00-legacy-grants.sql` **after** its blanket re-GRANT, so the column
  narrowing survives `supabase db reset`.
- **No RLS leakage across clients.** `fulfillment_orders` is `client_profile_id = auth.uid()`;
  `fulfillment_order_items`' USING subquery over `fulfillment_orders` is itself RLS-filtered and
  therefore self-scoping; `fulfillment_shipments` reaches through the PO with a definer predicate
  that returns a bare boolean and is true only for the caller's own orders. Probing arbitrary PO
  ids yields `false`. `fulfillment_shipments` carries no cost column, so the un-narrowed row is
  safe. `fulfillment_vendor_pos`/`_po_lines` stay policy-less.
- **The column narrowing is safe.** All twelve admin-portal BOH routes go through
  `getAuthenticatedAdmin`, which returns `createAdminClient()` — a service-role client
  (`apps/admin-portal/src/lib/supabase-admin.ts:20,33`). No `authenticated` reader of
  `fulfillment_order_items` exists in the repo.
- **PI metadata, not session metadata**, is what was widened; the session keeps its two
  dispatch keys; `payable_type`/`direct_order_id` are still present on the PI so webhook
  resolution is unchanged. Keys and shapes match `normalizeIntakePayload` exactly.
- **Session reuse** correctly compares `amount_subtotal` when tax/shipping is on — Stripe puts
  shipping in `total_details.amount_shipping`, outside `amount_subtotal`, so the comparison holds.
- **`customer_update` is legal** — `startCheckout` always passes `customer: customerId`.
- **Freight folds once, not per unit**, and is exactly recoverable as
  `amount_cents − quantity × unit_price_cents`; pre-00540 rows yield 0. Pinned by pgTAP §4 and
  `A12`.
- **`select('*')` on `direct_orders` is safe from PGRST201** — `use-direct-orders.ts:68` embeds
  nothing, so the two new `profiles`/`projects` FKs introduce no ambiguous-embed break.
- **The settle wrapper never throws**, and `sendDirectOrderPaidEmails` swallows
  (`index.ts:1340`), so a downstream failure cannot cost the paid flip.
- **`get_direct_order_terms` fails closed** — a missing key yields NULL text and FALSE, so the
  sheet can never promise tax/delivery the rail was not told to keep.
- **Tests are real, not decorative.** The pgTAP files assert behaviour (refusal codes by name,
  credited gross = rate × piece subtotal = 134400, the exact notice sentence, the freeze on all
  three columns, `insufficient_privilege` on `unit_cost_cents`, zero rows for a stranger and for
  anon), and the deno suite covers fail-closed parsing, both flag states, the metadata caps, and
  the never-throws contract.

---

## BLOCKING

### D-B1 · The client can read the designer's commission rate — twice
**Severity: blocking · Confidence: high (mechanism verified; the ruling on whether it matters is Kody's)**

The migration's own §8(b) banner states the principle correctly — "the policy is right and the
row is too wide" — and applies it to `fulfillment_order_items`' `unit_cost_cents`. It is not
applied one table over, and this branch opens two new reads of a commercial term:

1. **`fulfillment_orders.designer_attribution`.** `buildDirectOrderIntakeMetadata`
   (`direct-order.ts:184`) puts `commission_rate` inside `md.designer_attribution`;
   `fulfillment_intake_order` stores the whole `designer` sub-object into
   `fulfillment_orders.designer_attribution` (00353:87); the **new**
   `fulfillment_orders_select_client` policy grants the buyer the entire row. So the buyer reads
   `{"attribution":{"commission_rate":0.16,…}}` on her own order.
2. **`direct_orders.commission_rate`.** The column is new, `direct_orders_select_own` is
   `client_id = auth.uid()` with no column narrowing, and `useDirectOrders`
   (`packages/supabase/src/hooks/use-direct-orders.ts:69`) already does `select('*')`. Every
   existing client-portal order list now returns the rate.

Direction B §5 is deliberate about this: the copy says "the piece's trade rate", not a number,
and the disclosure's whole point is *that* a commission exists and *that* it does not change her
price. `unit_cost_cents` was withheld on strictly weaker grounds (the vendor cost is arguably
less inferable than the rate, which multiplies straight into the price she just paid).

**Fix options:** strip `commission_rate` from the `designer_attribution` payload (ops can read it
off `direct_orders` as service_role); and/or narrow `authenticated`'s grant on `direct_orders` to
a column list, as §8(b) does for items. Either is a few lines. A ruling that "the rate is a
disclosure and may be read" is also a legitimate outcome — but then §8(b)'s reasoning should say
why the two are treated differently.

### D-B2 · Flipping `tax_shipping_enabled` does not understate the totals — it hard-fails the intake
**Severity: blocking · Confidence: high**

`buildDirectOrderIntakeMetadata` omits `captured_total_cents` (so `normalizeIntakePayload` falls
back to `pi.amount`) and hardcodes `tax_cents: '0'`, with `freight_charged_cents` fixed at the
pre-tax fold. The report frames the consequence as "the split can understate what Stripe took…
ops reconciles". It is worse than that:

- `fulfillment_intake_order` writes those four numbers onto `fulfillment_orders` and calls
  `ledger_post_t1_capture` (00353:130).
- That posts `Dr 1000 = captured_total_cents` against `Cr 4000+4100+2100 = subtotal + freight + tax`
  (00352:178-186).
- Balance is enforced by `trg_ledger_entry_balanced`, a **`CONSTRAINT TRIGGER … DEFERRABLE
  INITIALLY DEFERRED`** (00352:106-109), which raises at COMMIT.

So with the flag on, `pi.amount` includes Stripe Tax and any shipping rate while the three
credits do not, the entry is unbalanced, the whole `fulfillment_intake_order` transaction aborts,
**no `fulfillment_orders` row is written**, and the `fulfillment_intake` task fails
deterministically on every retry until it parks. The client's "where is it" — the entire point of
Q6 — never appears, and the failure is invisible to anyone not reading `agent_tasks`.

This is armed by a one-row `fulfillment_config` UPDATE, which is exactly how Kody will turn on
the "Delivery and tax are added at payment" copy once Stripe Tax is ruled (Q11). Nothing in the
migration comment, the config row's own `description`, or the deno suite says "do not flip this
until the settle stamps real totals".

**Fix (smallest honest one):** on the flag-on path, take the totals from
`checkout.session.completed`'s `amount_subtotal` / `total_details.amount_tax` /
`total_details.amount_shipping` and pass them into the intake payload (or re-stamp the PI
metadata on settle) so the three components sum to `pi.amount`. **Minimum acceptable:** change
the comment and the config `description` to say the flag is not flippable yet and why, and add a
test that pins the balance identity.

### D-B3 · Under R3 the designer-facing settle notice can never fire from the app
**Severity: blocking (ruling, not code) · Confidence: high**

Compose the three rules and the notice is dead on the surface it was built for:

- R3: Buy draws only for a client with **no** live designer relationship.
- `create_direct_order` sets `project_id` **only** from an active project — i.e. only for a client
  R3 pre-empts.
- `settle_direct_order_attribution` posts the thread message **only** when `project_id IS NOT NULL`.
- D flagged, correctly, that the lead/roster case (direction B §5: "the settle notice still fires,
  into `rpc_start_direct_thread`'s thread") is not built.

Therefore every order the iOS client can create is roster-attributed → credited → **silent**.
Direction B §5's "what D3 sees after" deliverable (1) — "a system message in the project thread
the moment the order settles… so Leah learns from the channel she watches" — ships unreachable,
and W5's own acceptance line **"Leah's thread carries the settle message" cannot be walked
through the app**. It can only be demonstrated by buying from the client-portal as a client with
an active project, which is a different surface and a different tier.

Fable needs to rule one of: (a) build the `rpc_start_direct_thread` direct-thread notice in W5
after all (it is ~20 lines in the same RPC, and the resolve-or-create shape is already written
twice); (b) accept that the notice is dormant until B's "Buy it myself" flip and rewrite the
acceptance criterion; (c) walk it from the client-portal and say so in `walk.md`. Today the wave
would report a criterion met by a code path no walker can reach.

---

## MAJOR

### D-M1 · A refunded direct order keeps its earnings credit
**Severity: major · Confidence: high**

`handleDirectOrderRefund` (`stripe-webhook/index.ts:1793`) flips `direct_orders.status` to
`'refunded'` and emails ops. Nothing touches `designer_earnings`. The row stays
`status = 'confirmed'`, `gross_amount = rate × subtotal`, and the partial unique index on
`order_id` means it can never be re-credited — but it is also never reversed.

The invoice rail solved exactly this in 00277: a contra row keyed on
`reverses_invoice_payment_id` with its own partial-unique latch, "because the credit's
`ON CONFLICT` anchors the forward insert". 00540 creates the first `order_id`-keyed credit and
does not give it the same treatment, so the direct-order rail is the only payable that pays a
commission on money that went back. "Internal payable state is the source of truth" cuts both
ways: the payable state says refunded and the ledger says earned.

Out of the literal W5 brief (Q5 names create and settle, not refund), which is why I am not
calling it blocking — but it is a money defect introduced by this branch and it should not be
discovered by a designer's payout.

### D-M2 · Attribution unfreezes after a refund
**Severity: major · Confidence: high**

`direct_orders_freeze_attribution` guards on `OLD.status = 'paid'`. The settle flip passes
(intended), the refund flip passes (it does not move the three columns), and every UPDATE
**after** the refund has `OLD.status = 'refunded'` — so `designer_id`, `project_id` and
`commission_rate` become mutable again on a row that has already moved money in both directions.
Q5 says "immutable after paid"; the honest reading is "immutable from paid onward".

`OLD.status IN ('paid','refunded')` closes it; the pgTAP §5 block should gain a fourth probe.

### D-M3 · `dimensions IS NULL` is a weak gate on a JSONB column
**Severity: major · Confidence: medium (no such row exists in any seed today)**

`products.dimensions` is `JSONB` (00001:35, `{ width, height, depth, unit }`) with no shape
constraint. The gate is `IF v_product.dimensions IS NULL`. So `'{}'::jsonb`, `'null'::jsonb`
(which is *not* SQL NULL), `'[]'::jsonb` and `'{"unit":"in"}'` all pass, and the order sheet
ships without the size — which is precisely the failure direction B §5 built the gate to stop
("a $4,200 order sheet can never ship missing the two facts Walt leads with").

The same function rejects a blank `brand` with `btrim(brand) = ''`, so the inconsistency is
internal, not just theoretical. Suggested:
`jsonb_typeof(dimensions) <> 'object' OR dimensions = '{}'::jsonb` → `not_buyable:dimensions`,
ideally also requiring at least a width. Nothing writes `{}` today; a catalogue import or the
data pass named in B §10 easily could.

### D-M4 · The settle notice is a `system` message, so nothing notifies Leah
**Severity: major · Confidence: high**

`comms_messages_notification_dispatch` (00105:43-46) fires
`WHEN (NEW.system = FALSE AND NEW.deleted_at IS NULL)` and its own function re-checks
`IF NEW.system … RETURN`. The settle notice is inserted with `system = TRUE`, so no email and no
push goes out. `comms_bump_thread_activity` (00101:196) *is* unconditional, so the thread rises
in her list — but "Leah learns from the channel she watches" is satisfied only if she opens it.

Not necessarily wrong (system messages are deliberately quiet platform-wide), but direction B §5
leans on this notice as the designer's *learning* mechanism, and it should be a conscious call
rather than an inherited trigger predicate.

### D-M5 · A zero commission rate silences the notice as well as the credit
**Severity: major · Confidence: high**

`IF v_order.designer_id IS NOT NULL AND COALESCE(v_order.commission_rate, 0) > 0` gates the
credit, and the notice is gated on `v_credited`. `commission_rate = 0.0000` passes the new CHECK
and is a perfectly legal catalogue value (`products.commission_rate` is nullable
`NUMERIC(4,2)` that nothing has ever written). Such an order is *attributed* — `designer_id` and
`project_id` are set — and the designer is told nothing at all.

Coupling the two was a good instinct (the sentence says "credited", so it must not draw where
there is no credit), but the fallout is that the one case where a designer most needs to know her
client bought something is the case where she is told least. Either post a rate-free variant of
the sentence for a zero-rate attributed order, or refuse a zero rate at create.

---

## MINOR

- **D-m1 · The notice prints the wrong number for the wrong thing.** `to_char(amount_cents/100.0)`
  is the *total including folded freight*, in a sentence whose second clause is "credited at the
  piece's trade rate" — and the credit is on `quantity × unit_price_cents`. Quantity is not named
  either, so two tables at $4,200 read as "bought the Heirloom Oak Dining Table — $8,400.00".
  Direction B §5's exemplar is a one-piece, freight-free order, which is exactly the only case the
  pgTAP pins. *(minor · high)*
- **D-m2 · The commission-units guard raises a different error than documented.** The banner and
  the report both say a `16.00` in `products.commission_rate` "raises a check_violation at
  create". `v_rate` is declared `NUMERIC(5,4)` (max 9.9999), so the assignment raises `22003
  numeric_value_out_of_range` before the CHECK is ever reached. Still loud, still before money
  moves — but the stated class is wrong, and a value like `5.00` (meaning 5%) *does* reach the
  CHECK. *(minor · high)*
- **D-m3 · The settle effects run after a best-effort email helper.** `sendDirectOrderPaidEmails`
  swallows today, so this is latent — but it is called first, and the flip it rides is
  once-only. If that helper ever stops swallowing, the credit and the intake are lost with no
  retry path. Run `logDirectOrderSettleEffects` first. *(minor · high)*
- **D-m4 · The seed's own count contradicts the report.** `direct-orders-dev.sql` says "7 of the
  21 catalog rows today … The other 14 keep the honest refusal"; the report says "7 of 19 …
  the other 12". Local seeds define 14 catalog products (12 in `products.sql`, 2 in
  `fulfillment-catalog-dev.sql`); `cloudflare-phase1-staging.sql` adds more but runs *after* this
  file. One of the two committed/reported numbers is wrong; one `select count(*)` settles it.
  C5. *(minor · high that they disagree; medium on which is right)*
- **D-m5 · `photo_verified_at` is asserted on photography the research says is wrong.** The column
  means "a human confirmed the photography is the piece it claims to be"; F06 documents the
  dining table shown with green velvet chairs. The seed banner is admirably explicit that "on a
  dev stack that human is the seed, and the pictures are stock", and the file is a dev seed — but
  it is wired into the **staging** `sql_paths` array too, so staging will also show a verified
  badge over a stock photo. Worth Fable's eye given C5 and given that the gate's credibility is
  the whole argument for it. *(minor · high)*
- **D-m6 · The three new `.assert.sql` cases cannot gate.** `direct_order_rpc.assert.sql`'s FAIL
  branches only `RAISE NOTICE`, so A11/A12/A13 pass silently on regression unless a human reads
  the output; and the file lives under `supabase/functions/_tests/`, which
  `scripts/run-sql-tests.sh` does not walk (it globs `supabase/tests/**`). Pre-existing pattern,
  inherited. The real coverage is in `supabase/tests/commercial/`, which does gate. *(minor · high)*
- **D-m7 · One pgTAP comment overstates its assertion.** "The two 00276 refusals are UNCHANGED and
  must stay so — iOS and the `_tests` assert suite both read these strings" sits above an
  assertion that counts `create_direct_order` overloads. I diffed the five strings against 00276
  myself and they are byte-identical, so the claim is true — the test simply does not test it.
  *(minor · high)*
- **D-m8 · No `waves/w5/d-tasks.md`.** The plan's opening instruction is that each lane
  implementer writes its bite-sized task list into `waves/<wave>/<lane>-tasks.md` **before**
  coding, and the reviewer checks the tasks against the plan. W1b, W2 and W4 have one; W5 lane D
  does not, on the branch or in the program folder. I reviewed the diff against the spec directly
  instead. *(minor · high)*
- **D-m9 · R3's pre-emption is client-side only.** Nothing server-side stops an engaged client
  minting a direct order. This is *correct* — direction B's later "Buy it myself" flip needs the
  RPC to keep working — but it means R3 is one `FeatureFlags`/resolver bug away from being void,
  with no backstop. Worth stating in the wave record so it is a decision and not an oversight.
  *(minor · high)*
- **D-m10 · The cross-surface consequence D flagged is real and needs a ruling before any prod
  push.** `photo_verified_at` is NULL on every Strata row, so `create_direct_order` will refuse
  **every** product for the existing client-portal buy paths
  (`apps/client-portal/src/app/quiz/results/results-view.tsx`, `/orders/page.tsx`, both via
  `useCreateDirectOrder`). Behaviourally that is what direction B intends; operationally the
  catalogue data pass in B §10 must precede the migration, not follow it. *(minor · high)*
- **D-m11 · `automatic_tax` with inline `price_data` and no `tax_behavior`.** Stripe generally
  requires a tax behavior (per-price or an account default) when automatic tax is on; neither
  line item sets one. A second flag-on landmine alongside D-B2, and equally untested. *(minor ·
  medium — not verifiable without a live test-mode key)*
- **D-m12 · The `pi.shipping` fallback is unverified against live Stripe.** D says so honestly.
  If Stripe does not populate `payment_intent.shipping` for a payment-mode session with
  `shipping_address_collection`, `fulfillment_orders.ship_to` lands NULL and ops must read the
  address from `direct_orders.shipping`. One look on the first real test-mode order settles it;
  the three new unit tests pin the fallback logic, not Stripe's behaviour. *(minor · medium)*
- **D-m13 · The buyer reads the settle notice too, in the third person.** Both participants are on
  the project thread, so she sees "Project Client bought the DO Buyable Piece — $4,200.00,
  credited at the piece's trade rate." about herself. Moot while D-B3 holds; live the moment the
  "Buy it myself" flip lands. Voice (C6). *(minor · high)*
- **D-m14 · Local ACL gap, pre-existing.** `anon` keeps SELECT on the eight BOH tables and on
  `direct_orders` locally because 00350/00276 revoke inside a `DO … EXECUTE format()` block and
  `generate-legacy-grants.py` replays only top-level statements. D found it, documented it in the
  test file, and asserted anon by rows instead — the right call. Deserves a generator ticket.
  *(minor · high)*

---

## Points the brief asked about, answered plainly

| Brief question | Answer |
|---|---|
| Attribution order + tie rule | Correct, and a true mirror of the client resolver. |
| Commission fallback chain | Correct: `products.commission_rate` → `fulfillment_config.commission_rate_default` (`{"rate":0.16}`, 00351:104) → literal `0.16`. Snapshotted even when uncredited. |
| Immutability after paid — trigger, not convention | Trigger, yes. Incomplete after refund (**D-M2**). |
| Earnings credit idempotent | Yes. Partial unique index + `ON CONFLICT DO NOTHING` + `FOUND`. Never reversed on refund (**D-M1**). |
| Gate server-side with stable codes | Yes. Four new `not_buyable:<field>` codes, prefix-matchable; five shipped codes byte-identical. `dimensions` is weakly typed (**D-M3**). |
| Policies `TO authenticated`, client-scoped, no leakage | Yes on all three, joins reasoned through. But `fulfillment_orders`' row is too wide (**D-B1**). |
| `get_direct_order_terms` grants | Correct: `REVOKE ALL … PUBLIC, anon` + `GRANT EXECUTE … authenticated`. Fails closed. |
| PI metadata (not session) widened | Yes, and the session keeps only its two dispatch keys. |
| Tax/shipping strictly behind the flag | Behind it, yes. Not *safe* behind it (**D-B2**). |
| Settle never loses paid state on downstream failure | Correct — never throws, logs loudly. Ordering is fragile (**D-m3**). |
| Thread message idempotent | Yes, keyed on the same insert as the credit. Unreachable from the app (**D-B3**); silent at rate 0 (**D-M5**); no notification (**D-M4**). |
| Seeds honest | Structurally yes and unusually well-annotated; two caveats (**D-m4**, **D-m5**). `shipping_flat_cents` deliberately unseeded, so the walk exercises neither the fold nor the Delivery line — tests only. |
| Additive-only | Yes except two deliberate narrowings: `REVOKE SELECT ON fulfillment_order_items FROM authenticated` (verified safe) and the four new gate refusals (a live behaviour change on the client-portal, **D-m10**). |
| Tests real | Yes. The pgTAP files assert behaviour and would fail on regression; the deno suite is genuine unit coverage of the money arithmetic. Gaps: no refund test, no post-refund freeze test, no ledger-balance test for the flag-on path. |
