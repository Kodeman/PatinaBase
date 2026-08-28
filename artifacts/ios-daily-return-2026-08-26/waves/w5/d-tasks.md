# W5 · lane D (backend) — task list

⚠ **Written late.** The plan's opening instruction is that each lane implementer writes this
before coding; lane D did not, and the reviewer caught it (`d-review.md` D-m8). This file is
therefore a reconstruction, written at the start of the fix round from the delivered diff and the
brief — accurate about what was built, but it did **not** gate the build. Recorded that way rather
than backdated.

Base `main` `05b3f9a18` · branch `daily-return/w5-d` · worktree `.codex/worktrees/agent-dr-w5-d`.

---

## Round 1 — the build (commits `73cf9e639`, `585f7ab3b`, `5dbfc4db4`)

| # | Task | Where | Done |
|---|---|---|---|
| 1 | Confirm the migration head, mint `00540` | `supabase/migrations/` | ✅ |
| 2 | `direct_orders.designer_id / project_id / commission_rate` + FKs + indexes | 00540 §1 | ✅ |
| 3 | Immutable-after-paid trigger (a trigger, not a convention — the settle is service_role) | 00540 §2 | ✅ |
| 4 | `designer_earnings` partial unique index on `order_id` | 00540 §3 | ✅ |
| 5 | Three `fulfillment_config` keys behind the writer GUC | 00540 §4 | ✅ |
| 6 | `get_direct_order_terms()` — the narrow client read | 00540 §5 | ✅ |
| 7 | `create_direct_order`: the buyability gate (4 new `not_buyable:<field>` codes), the freight fold, server-side attribution mirroring `DesignerRelationshipResolver.resolve` | 00540 §6 | ✅ |
| 8 | `settle_direct_order_attribution()` — the credit + the project-thread notice | 00540 §7 | ✅ |
| 9 | Client-scoped SELECT on the three fulfillment tables + the `unit_cost_cents` column narrowing | 00540 §8 | ✅ |
| 10 | `create-checkout-session`: fold freight into the billed total, widen the **PI** metadata, `automatic_tax`/`shipping_options` behind the config flag | `create-checkout-session/direct-order.ts` + `index.ts` | ✅ |
| 11 | `stripe-webhook`: settle → attribution RPC + `fulfillment_intake` enqueue (the producer nothing in the repo had) | `stripe-webhook/direct-order-settle.ts` + `index.ts` | ✅ |
| 12 | `ship_to` fallback to `pi.shipping` | `fulfillment-intake/core.ts` | ✅ |
| 13 | Seeds: `photo_verified_at` on the gate-passing pieces + one designer-sourced `fulfillment_orders` fixture | `supabase/seed/direct-orders-dev.sql` | ✅ |
| 14 | pgTAP + deno coverage; regenerate `00-legacy-grants.sql` and `database.types.ts` | `supabase/tests/**`, `_tests/**` | ✅ |

## Round 2 — the fix round (this round)

Driven by `d-review.md`; the evidence and the reasoning for each are in `d-fix-log.md`.

| # | Finding | Task | Done |
|---|---|---|---|
| 15 | D-B1 | Strip the rate from `designer_attribution`; narrow `authenticated`'s grant on `direct_orders`; mask the rate on `create_direct_order`'s returned row; move the one `select('*')` consumer | ✅ |
| 16 | D-B2 | Take the captured split from the settled session, pass it on the intake task, read it in the worker; pin the identity with a pgTAP test | ✅ |
| 17 | D-B3 | Build the direct-thread branch of the settle notice — the only one an R3 client can reach | ✅ |
| 18 | D-M1 | `reverses_order_id` + `reverse_direct_order_earnings()`, wired to the refund flip | ✅ |
| 19 | D-M2 | Freeze attribution from paid **onward** (`paid` or `refunded`) | ✅ |
| 20 | D-M3 | Gate `dimensions` on shape, not on `IS NOT NULL` | ✅ |
| 21 | D-M4 | Ruled and documented, not changed — see the fix log | ✅ (rebutted) |
| 22 | D-M5 | File the attribution row at rate 0 too; the sentence varies, not the effect | ✅ |
| 23 | D-m1/m2/m3/m4/m5/m7 | The notice's number and quantity; the stated error class; effect ordering; the seed's count; the staging-seed caveat; the overload-count assertion | ✅ |
| 24 | D-m11 | `tax_behavior: 'exclusive'` on both inline prices when Stripe Tax is on | ✅ |
| 25 | — | Re-run the gate: `supabase db reset`, `run-sql-tests.sh`, deno, `deno check`, regen types | ✅ |
