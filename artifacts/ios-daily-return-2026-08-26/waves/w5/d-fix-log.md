# W5 · lane D (backend) — fix round

Against `d-review.md` (reviewed at `5dbfc4db4`). Branch `daily-return/w5-d`, worktree
`.codex/worktrees/agent-dr-w5-d`, base `main` `05b3f9a18`.

Every **blocking** and every **major** is changed, except **D-M4**, which is rebutted with
evidence and left as a stated decision. Seven of the fourteen minors are also changed; the rest are
answered at the bottom.

---

## BLOCKING

### D-B1 · The client could read the designer's commission rate, twice — **CHANGED, both**

The finding was right on both counts, and the second one had a third leak the review did not name.

**Leak 1 — `fulfillment_orders.designer_attribution`.** `buildDirectOrderIntakeMetadata` no longer
writes `commission_rate` into the sub-object at all
(`create-checkout-session/direct-order.ts`). The rate is now not read anywhere in
`create-checkout-session`: it is out of `DirectOrderFacts` and out of `loadDirectOrderPayable`'s
`select`, so the function that opens Checkout cannot leak a term it never loads. Ops reads the
snapshot off `direct_orders` as service_role. Pinned by two new assertions in
`_tests/direct-order-checkout.test.ts` — one on the parsed sub-object, one that no metadata value
anywhere contains the string `commission`.

**Leak 2 — `direct_orders.commission_rate` itself.** 00540 §1b now does what §8(b) does one table
over:

```sql
REVOKE SELECT ON public.direct_orders FROM authenticated;
GRANT SELECT (id, client_id, product_id, product_name, quantity, unit_price_cents,
              amount_cents, currency, status, stripe_checkout_session_id,
              stripe_payment_intent_id, shipping, created_at, paid_at,
              designer_id, project_id) ON public.direct_orders TO authenticated;
```

**Leak 3, which the review did not have — the RPC return.** A composite returned by a function is
**not** filtered by the table's column ACL, so `create_direct_order RETURNS public.direct_orders`
would have handed the rate straight back on the create call, and only there — the worst of both
answers. The stored snapshot is untouched; the returned copy is masked:

```sql
  v_order.commission_rate := NULL;
  RETURN v_order;
```

**The consumers that had to move with it** (both in this branch, both gated):

- `packages/supabase/src/hooks/use-direct-orders.ts` — `select('*')` would now 42501. It names its
  sixteen columns; its unit test asserts the argument contains neither `*` nor `commission_rate`.
- `_tests/direct_order_rpc.assert.sql` A13 now reads the snapshot from the table and asserts the
  returned copy is NULL.

**Evidence.** Behavioural, as `authenticated`, in `supabase/tests/rls/fulfillment_client_read_test.sql`
§4b: `SELECT count(commission_rate) FROM direct_orders` and `SELECT * FROM direct_orders LIMIT 1`
both raise `insufficient_privilege`, while the sixteen granted columns select fine. Catalog
assertions in `supabase/tests/commercial/direct_order_attribution_test.sql` §8
(`has_column_privilege`), including that `service_role` keeps the rate. Both files pass.

Recorded in the migration's own hazard banner as **(c)**, with the argument (direction B §5
discloses *that* a commission exists and that it does not change her price; never the number) and
the note that this is the same reasoning as §8(b), applied consistently rather than differently.

### D-B2 · `tax_shipping_enabled` hard-failed the intake — **CHANGED, and the mechanism corrected**

The consequence the review named is real and now closed. Its *mechanism* was one layer off, and the
correction matters because it is louder than described:

- The review named `trg_ledger_entry_balanced` (00352:106-109), a deferred constraint trigger
  raising at COMMIT.
- The arm that actually fires first is **`chk_fulfillment_captured_identity` (00360:428-430)** — a plain
  table CHECK on `fulfillment_orders`, `captured = subtotal + freight + tax`. It refuses the row at
  the INSERT; the ledger entry is never reached. Verified: the new pgTAP file's unbalanced case
  raises `new row for relation "fulfillment_orders" violates check constraint
  "chk_fulfillment_captured_identity"`, not an unbalanced-entry error.
- Either way the whole intake transaction aborts, no `fulfillment_orders` row is written, and the
  task fails deterministically. The review's conclusion stands unchanged.

**The fix is the one the review called for, not the minimum.** `stripe-webhook` now computes the
split from the settled Checkout session and passes it on the `fulfillment_intake` task payload,
where the worker uses it in place of the metadata:

- `directOrderIntakeTotals` / `directOrderTotalsFromSession` / `directOrderTotalsFromPaymentIntent`
  (`stripe-webhook/direct-order-settle.ts`) — captured from `session.amount_total`, tax from
  `total_details.amount_tax`, Stripe shipping from `total_details.amount_shipping`, freight = the
  folded flat freight + that shipping, and **subtotal is whatever is left**. Balanced by
  construction: there is no input, including negative and absurd ones, that makes the four numbers
  disagree.
- On the PaymentIntent-only settle (the belt-and-braces path, reached only when the session event
  was lost) a PI carries no breakdown, so everything above piece + folded freight is booked as tax.
  Stated in the code: it keeps the identity true and puts the overstatement in the account an
  operator would look in, rather than inflating the piece.
- `runDirectOrderSettleEffects` puts `totals` on the enqueue payload — deliberately *not* back onto
  the PaymentIntent, because a Stripe write can fail and this cannot.
- `fulfillment-intake/core.ts` gains `IntakeOverrides` + `intakeOverridesFromTaskPayload` (which
  trusts nothing about the payload's shape) and `normalizeIntakePayload(pi, overrides?)`. Absent
  overrides — BOH, seeds, any pre-00540 task — behaviour is byte-identical to before.
- Both inline prices now carry `tax_behavior: 'exclusive'` when `automatic_tax` is on (this also
  closes **D-m11**).

**Evidence.** New `supabase/tests/commercial/fulfillment_intake_ledger_balance_test.sql` files a
flag-on-shaped balanced split (4200.00 piece + 180.00 freight + 332.00 tax = 4712.00) and asserts
the four numbers land and the T1 entry posts four lines; then files the split the **pre-fix**
metadata would have produced (same captured total, `tax_cents: '0'`) and asserts it is refused by
`chk_fulfillment_captured_identity` and that **no order row survives**. Five new deno cases pin the
arithmetic including the balanced-by-construction property. The `fulfillment-intake` suite pins that
the metadata split does *not* sum and the override one does.

The config row's `description` and the migration's §4 banner now say what flipping the flag does and
does not require — it is safe for the rail; it still needs a Stripe Tax registration, without which
Stripe refuses the session.

### D-B3 · The designer-facing notice could never fire from the app — **CHANGED (option a)**

Built, rather than sent up for a ruling, because the ruling is already written twice:

- direction B §5, verbatim: *"At engaged tier with no project yet, `project_id` is null and
  `designer_id` is not; the settle notice still fires, into `rpc_start_direct_thread`'s thread."*
- R3, verbatim: *"B's 'Buy it myself' is a later flip, **after the settle notice is
  device-proven**."* A notice no walker can reach cannot be device-proven, so the missing branch was
  not a deferrable nicety — it was the gate on the flip.

`settle_direct_order_attribution` now resolves the thread two ways:

| `project_id` | thread |
|---|---|
| not null | the project thread (resolve-or-create, mirroring `rpc_start_project_thread`, 00103:113) |
| null | the designer↔client **direct** thread (resolve-or-create, mirroring `rpc_start_direct_thread`, 00536:196-224) |

Service-role, because both RPCs open with `IF auth.uid() IS NULL THEN RAISE`. The direct branch does
not re-check a relationship predicate: `create_direct_order`'s attribution resolver already
established one, and it is strictly narrower than that RPC's (active project → live lead → active
roster row, versus that RPC's *any* shared project). Participants are inserted with
`comms_resolve_role`, and thread-then-participants inside one transaction is legal because
`comms_participants_cardinality` is a DEFERRABLE constraint trigger (00101:250-259).

**Evidence.** `direct_order_attribution_test.sql` §6a asserts the roster-attributed order — the only
shape R3 lets an iOS buyer make — posts into a `direct` thread carrying both participants, with the
exact sentence, exactly once. §6c keeps the project-thread case. W5's acceptance line "Leah's thread
carries the settle message" is now walkable from the app.

---

## MAJOR

### D-M1 · A refunded order kept its earnings credit — **CHANGED**

00540 gains `designer_earnings.reverses_order_id` + `uniq_designer_earnings_order_reversal`
(partial-unique), and `reverse_direct_order_earnings(p_order_id)` — the 00277:211-243 shape,
choice for choice: a contra row and never a DELETE (the table carries settlement and payout state),
the same status bucket so it nets where the credit sat, `paid_at` NULL, and `order_id` NULL on the
contra because the credit holds `uniq_designer_earnings_order`. Refuses unless
`direct_orders.status = 'refunded'`; a no-op on an order that was never credited; service_role only.

`stripe-webhook`'s `handleDirectOrderRefund` calls it on the same guarded full-refund flip the ops
email rides, through a wrapper that never throws.

Partial refunds are deliberately not pro-rated — 00277 does not either, a partially-refunded order
stays `paid`, and a fractional clawback is an ops decision. The ops email that already fires on
every refund is the route for it. Stated in the migration.

**Evidence.** §6e: an uncredited order reverses nothing; a credited one reverses once; credit +
contra sum to zero; exactly one contra row; the credit itself still exists; a redelivered refund
reverses nothing further.

### D-M2 · Attribution unfroze after a refund — **CHANGED**

`OLD.status IN ('paid','refunded')`. The settle flip and the refund flip both still pass (neither
moves the three columns); every UPDATE after either is refused. The function comment now reads
"from paid ONWARD". §6f is the fourth probe the review asked for.

### D-M3 · `dimensions IS NULL` was a weak gate on JSONB — **CHANGED**

```sql
  IF v_product.dimensions IS NULL
     OR jsonb_typeof(v_product.dimensions) <> 'object'
     OR NULLIF(btrim(COALESCE(v_product.dimensions->>'width', '')), '') IS NULL THEN
    RAISE EXCEPTION 'create_direct_order: not_buyable:dimensions';
  END IF;
```

Width is required, not merely a non-empty object — the order sheet leads with the size, and
`{"unit":"in"}` is not one. Every seeded catalog row carries
`{"width":…,"depth":…,"height":…,"unit":…}` (verified against all nine on a clean reset), so nothing
that passed before stops passing. Three new fixtures (`'{}'`, `'null'::jsonb`, `'{"unit":"in"}'`)
are asserted to refuse by name.

### D-M4 · The notice is a `system` message, so nothing emails or pushes — **REBUTTED, and stated**

The mechanism is exactly as described: `comms_messages_notification_dispatch` fires
`WHEN (NEW.system = FALSE …)` (00105:43-46), so no email and no push. Left as it is, for three
reasons, now written into the function's `COMMENT` so it is a decision and not an inheritance:

1. **It is not silent.** `comms_bump_thread_activity` (00101:196) is unconditional, and
   `rpc_unread_summary` (00103:299-324) counts a message `WHERE m.sender_id IS NULL OR m.sender_id
   <> auth.uid()` — a system message has `sender_id NULL`, so it **counts as unread**. The thread
   rises to the top of her list *and* carries a badge. That is "the channel she watches", which is
   what direction B §5 asks for.
2. **The alternative is worse.** Making it `system = FALSE` would send it as a message from nobody
   (`sender_id` is NULL) through a dispatch path built for human messages, and would email a
   designer a sentence about her client's purchase and her own commission — copy and consent nobody
   has ruled. Q7's permission sentence is the *client's*; the designer-side surface is W7.
3. It is reversible in one predicate later, with a ruling, and nothing about this shape blocks it.

Recorded for Fable rather than silently accepted: if the answer is that Leah should be emailed, the
change is one line plus designer-side copy, and it belongs with W7's attributed-orders list.

### D-M5 · A zero rate silenced the notice as well as the credit — **CHANGED**

The earnings row is now written for **every** attributed order, `gross_amount` possibly 0
(`designer_earnings.gross_amount` is `INTEGER NOT NULL` with no positivity CHECK — 00014:310 —
so a 0-gross row is legal, and it is the honest record: attributed, earned nothing). That keeps
**one** latch for both effects, which is what makes a Stripe redelivery repeat neither. What varies
is the sentence, not the effect:

- `gross > 0` → *"… — $4,200.00, credited at the piece's trade rate."*
- `gross = 0` → *"… — $500.00."* — because claiming a credit that did not happen is a C5 problem,
  and being told nothing at all is a worse one.

**Evidence.** §6d: rate `0.00` snapshots as 0, the settle reports `credited: true` with
`gross_amount: 0`, `thread_message: true`, and the body is the rate-free sentence exactly.

---

## Minors changed

- **D-m1 · the notice printed the wrong number for the wrong thing.** It now prices the **piece**
  (`quantity × unit_price_cents`), which is the same number the commission is on, and names the
  quantity when there is more than one. §6b pins both: a 2 × 100000 order with 18000 of folded
  freight reads *"Roster Client bought 2 × DO Freighted Piece — $2,000.00, credited at the piece's
  trade rate."* — not `$2,180.00`, and not one piece at twice the price.
- **D-m2 · the stated error class was wrong.** Banner (b) now says both: `16.00` raises `22003
  numeric_value_out_of_range` on assignment to `v_rate NUMERIC(5,4)`; `5.00` fits and is caught by
  `direct_orders_commission_rate_is_a_fraction` (`23514 check_violation`).
- **D-m3 · effect ordering.** `logDirectOrderSettleEffects` now runs **before**
  `sendDirectOrderPaidEmails` at all three settle call sites, with the reason in a comment.
- **D-m4 · the seed's count contradicted the report.** Measured on a clean reset: **7 of 19**
  catalog rows verify, **12** keep the refusal. The seed comment said 7 of 21 / 14 and is corrected,
  with the correction named as such.
- **D-m5 · `photo_verified_at` over stock photography.** Kept in both local and staging seed paths —
  staging is a demo stack whose whole catalogue is fictional and which cannot exercise Path A at all
  without it — and the banner now says plainly that on any seeded stack the "verified" claim is the
  seed's and not a human's, that F06's mismatched photography is exactly why the column exists, and
  that **Strata is never seeded**: `photo_verified_at` is NULL on every prod row, so
  `create_direct_order` refuses every prod product until direction B §10's catalogue data pass sets
  it against real photography — a pass that must **precede** this migration reaching prod
  (this is also the answer to **D-m10**).
- **D-m7 · a pgTAP comment overstated its assertion.** The overload count is gone. The two shipped
  00276 refusals are now asserted by **raising them** and comparing the strings byte for byte,
  against two new fixtures. Doing so surfaced a fact worth recording: `products_catalog_requires_management`
  plus `products_normalize_layer_defaults` force `patina_managed = TRUE` on every `layer='catalog'`
  row, so the "no seller of record" refusal can only ever fire for a personal or studio row — i.e.
  a client's own captured piece. The fixture is `layer='personal'` and the test says why.
- **D-m11 · `automatic_tax` with no `tax_behavior`.** Both inline prices (the piece line in
  `startCheckout`, the Delivery line in `directOrderSessionExtras`) carry
  `tax_behavior: 'exclusive'` when and only when Stripe Tax is on. `'exclusive'` is the value the
  flag-on copy promises: tax added on top of the price the sheet printed.

## Minors answered, not changed

- **D-m6 · the three `.assert.sql` cases cannot gate.** True and inherited: the file's FAIL branches
  `RAISE NOTICE`, and `run-sql-tests.sh` globs `supabase/tests/**`, which does not include
  `supabase/functions/_tests/`. Nothing in the repo runs that file at all (grepped: no script,
  workflow, or doc references it). Making only the three new cases raise would leave one file with
  two conventions. The gating coverage for all three already exists in
  `supabase/tests/commercial/direct_order_attribution_test.sql` (the photo refusal, the freight
  fold and its remainder identity, the rate snapshot), which does gate. A13 was corrected anyway,
  because it would otherwise have printed FAIL forever after the §1b masking.
- **D-m8 · no `d-tasks.md`.** Written now, at `waves/w5/d-tasks.md`, and labelled as a
  reconstruction that did not gate the build rather than backdated.
- **D-m9 · R3's pre-emption is client-side only.** Correct, and deliberate: direction B's later "Buy
  it myself" flip needs the RPC to keep working for engaged clients, so a server-side refusal would
  have to be removed again. Stated here so it is a decision — the backstop is the buyability gate
  and the flag, not the relationship.
- **D-m10 · the cross-surface consequence.** Answered under D-m5 above: the catalogue data pass
  precedes the migration reaching prod. Until it does, `create_direct_order` refuses every product
  for the existing client-portal buy paths, which is what direction B intends behaviourally and an
  ops sequencing item operationally.
- **D-m12 · the `pi.shipping` fallback is unverified against live Stripe.** Still true and still
  honest; it needs one real test-mode order, which needs the real `sk_test_` key Kody owes.
- **D-m13 · the buyer reads the notice too, in the third person.** No longer moot, since D-B3 makes
  the direct-thread notice live. Kept as direction B §5 wrote it, verbatim, including the exemplar.
  Both participants are on the thread by construction, and the same disclosure ("credited at the
  piece's trade rate") is what direction B's own "Buy it myself" line says to her face. Flagged for
  Fable as a copy call, not changed unilaterally.
- **D-m14 · the local ACL gap in `generate-legacy-grants.py`.** Unchanged, and worth a generator
  ticket. Note one thing that *did* change: 00540's own `REVOKE SELECT … / GRANT SELECT (…)` on
  `direct_orders` are top-level statements, so the generator **does** replay them after its blanket
  re-GRANT — which is why §4b's behavioural probe holds on a local stack. The anon gap on the eight
  BOH tables (revoked inside a `DO … EXECUTE format()` loop) is untouched.

---

## Gate

Run in this order, in the worktree, after every change above.

| Gate | Result |
|---|---|
| `supabase db reset` | clean replay through `00540`, all 26 seed files |
| `scripts/run-sql-tests.sh` | **137 total · 115 green · 22 expected-fail · 0 unexpected-fail** |
| `deno test _tests/direct-order-checkout.test.ts` | 20 passed, 0 failed |
| `deno test _tests/fulfillment-intake.test.ts` | 18 passed, 0 failed |
| `deno test` stripe-webhook-emit / stripe-event-processor / fulfillment-stripe-recon / agent-queue | 43 passed, 0 failed |
| `deno check` on all six touched function files | clean |
| `_tests/direct_order_rpc.assert.sql` | 13 PASS, 0 FAIL |
| `pnpm turbo type-check --filter=@patina/supabase --filter=@patina/client-portal` | clean |
| `pnpm --filter @patina/supabase test -- use-direct-orders` | 18 passed |
| `packages/supabase/src/database.types.ts` | regenerated with the repo's own command; a clean superset of `main`'s (7 lines beyond round 1's, no deletions) |
| `ls supabase/migrations \| tail` | `00540` still free — `main` is at `00539` |

### One gate that cannot pass, and it is not this branch's

`supabase/functions/_tests/stripe-rail.test.ts` fails **both** of its cases in `seed()`, before any
code under test runs:

```
Error: insert projects failed: studio_id_not_designer_studio
    at insert (stripe-rail.test.ts:150)
    at seed  (stripe-rail.test.ts:159)
```

Proven independent of this branch by a bare probe against the same database, touching nothing 00540
adds:

```sql
SET LOCAL ROLE service_role;
INSERT INTO public.projects (name, client_id, designer_id, created_by) VALUES (…);
-- NOTICE: PROBE: insert refused -> studio_id_not_designer_studio
```

The trigger is `set_project_studio_id` (00317 → 00318 → 00511:2317), all long merged; `seed()` is
byte-identical between `main` and this branch (round 1 touched only `cleanup()` in that file); and
00540 touches no project, organization or membership object. So the harness cannot seed a fixture on
a current stack, and its direct-order cases never execute. **Consequence, stated:** round 1's
addition to that file's `cleanup()` (clearing `agent_tasks` and `designer_earnings` before the
orders they point at) is unexercised, and the "settle proven by fixture" claim rests on the deno
unit suites and pgTAP, not on this harness. It is a pre-existing gap for Fable, not a W5 defect.

### Claim level

Compile-green and DB-proven. **No live Checkout was opened** — the local `STRIPE_SECRET_KEY` is the
32-character placeholder the steward measured, so W5's "test-mode end-to-end with a Stripe test
card" acceptance criterion is still unmet and still blocked on Kody. Everything above is proven by
`supabase db reset` + pgTAP + offline deno, which is the honest level.
