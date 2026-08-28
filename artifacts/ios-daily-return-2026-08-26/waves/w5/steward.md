# W5 — steward setup (the purchase wave)

Written by the W5 steward before any lane opens. Everything below is verified against the tree and
the running local stack on 2026-08-28; nothing is quoted from the plan without being re-checked.

---

## 1. Base, worktrees, devices

**Base sha — `main` tip, W4 merged:**

```
$ git -C /Users/kody/Code/patina-merged log --oneline -1 main
05b3f9a18 docs(ios): Daily Return — W4 wave record (four rounds, rulings, walks), plan + scripts, RESUME
```

**Backend worktree created (unsandboxed, per the sandbox rule):**

```
$ git worktree add /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w5-d -b daily-return/w5-d main
Preparing worktree (new branch 'daily-return/w5-d')
HEAD is now at 05b3f9a18 …

$ cd .codex/worktrees/agent-dr-w5-d && git rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w5-d
$ git status --porcelain          → (empty; clean tree)
$ git log --oneline -1            → 05b3f9a18
```

`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` copied in from the main checkout and
confirmed still gitignored in the worktree:

```
$ git check-ignore -v apps/mobile/Patina/Patina/App/Configuration/Secrets.swift
.gitignore:53:apps/mobile/…/Secrets.swift	apps/mobile/…/Secrets.swift
```

**The two client worktrees are NOT created yet.** Per the brief they branch off **D's** branch, not
off `main`, because C1's buyability gate and C2's Ordered list both read columns and policies 00540
introduces and both want `packages/supabase/src/database.types.ts` regenerated. Create them once D
has a first commit:

```
git worktree add .codex/worktrees/agent-dr-w5-c1 -b daily-return/w5-c1 daily-return/w5-d
git worktree add .codex/worktrees/agent-dr-w5-c2 -b daily-return/w5-c2 daily-return/w5-d
# then copy Secrets.swift into each; then `xcrun simctl clone 973D1724-… "dr-w5-c1"` (and c2)
```

**W4 cleanup — nothing to do; it was already done.**

```
$ xcrun simctl list devices | grep -ci 'dr-w'      → 0        (no dr-w4-{d,h1,h2,int} clones remain)
$ git worktree list | grep -i 'dr-w'               → (no rows) (no agent-dr-w4-* worktrees remain)
$ git branch --list 'daily-return/*'               → (no rows) (before creating w5-d)
```

The review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro) is present and **Booted** —
it belongs to the W5 walker, not to a lane.

The six pre-existing worktrees under `.codex/worktrees/` (`agent-cifix`, `agent-mediatests`,
`agent-repoint`, `agent-splatcam`, `agent-ui-deck`, `agent-ui-polish`) belong to other programs and
were left untouched.

---

## 2. The Stripe reality check — read-only, local only

Method: `docker inspect supabase_edge_runtime_supabase` (the local edge runtime; it is **Exited
(255) 8 hours ago**, so the stack's functions are down and want a `supabase start`/restart before any
walk). Only the **length and last four characters** of each variable were read; no value was printed,
logged, or written anywhere.

| Variable | Present | Shape | Verdict |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | yes | prefix `sk_test_`, **length 32**, tail `alls` | **PLACEHOLDER.** A real Stripe test key is ~107 characters. This is the 32-char stand-in W0's re-walk already caught (`research/05-rewalk.md`) |
| `STRIPE_WEBHOOK_SECRET` | yes | prefix `whsec_te`, length 13, tail `t123` | **set, but also a placeholder** (`whsec_test123`) |

**Consequences for the wave, stated plainly:**

1. **`stripe_key_real = false`.** `create-checkout-session` will construct a `Stripe` client and the
   first API call (`checkout.sessions.create`) fails with Stripe's `Invalid API Key provided:
   sk_test_…`, returned as `{ error: 'stripe_error', detail: <Stripe's message> }` at a 502
   (`create-checkout-session/index.ts:1175-1179`). **That detail string must never reach the
   homeowner** — it is the exact C5 leak W0 found on the Pay path. C1's order sheet maps every
   non-2xx from this function to Patina copy and prints the server `detail` nowhere.
2. **The W5 acceptance criterion "test-mode end-to-end on the simulator with a Stripe test card"
   cannot be met until Kody supplies a real `sk_test_` key** in the local functions env (the build
   plan's W5 row already says so). Until then the honest claim level is: create → 502 → the sheet's
   error branch; settle proven by **replaying a signed webhook fixture / the deno tests**, not by a
   live Checkout.
3. `STRIPE_WEBHOOK_SECRET` being a placeholder means a locally-forwarded Stripe CLI event will fail
   signature verification. D's settle work is therefore gated on **deno unit tests +
   `supabase/tests` pgTAP**, not on live webhook delivery.
4. R11 stands: Kody checks the Stripe dashboard himself; **test mode only**, and no agent touches
   Strata secrets.

---

## 3. Migration tip and D's number

```
$ ls supabase/migrations | tail -4
00537_house_on_today.sql
00538_client_account_anonymize.sql
00539_saved_item_note_and_presence.sql
_pending
```

**Tip = `00539`** (minted by W4's lane D; W4's `integration.md` §7 recorded the shift and said W5
moves to 00540). **D's provisional number is `00540`.** The build-plan W5 row still says "00539" —
that is stale by one; 00540 is correct.

`_pending/00106` stays unapplied. Re-check `ls supabase/migrations | tail` immediately before the
integration merge, per the standing rule; renumber on collision, and if a renumber lands after a
local apply, D re-runs `supabase db reset` for the wave.

**D owns the local database for W5** — one `supabase db reset` owner, no exceptions (C1/C2 must not
reset).

---

## 4. Inventory — what each edge function's direct-order branch does TODAY

Read in full at the cited lines. This is the "before" picture D's diff is measured against.

### 4a. `create-checkout-session/index.ts` — the `direct_order_id` branch

Entry (`:1200-1273`): body accepts `direct_order_id` / `directOrderId`; `payment_method` is parsed
but **deliberately dropped for direct orders** (`:1269-1270`) so both rails always ride — which is
why Apple Pay appears (see §5). Dispatch at `:1260-1264` → `loadDirectOrderPayable` →
`startCheckout` (the shared driver, *not* the invoice attempt machine).

`loadDirectOrderPayable` (`:474-587`):
- selects 10 columns from `direct_orders` by id (`:479-488`); **not-found and not-owner both collapse
  to 404** `direct_order_not_found` (`:496-500`).
- refuses `paid` (409 `direct_order_already_paid`), `canceled` (409 `direct_order_canceled`),
  `refunded` (409 `direct_order_refunded`, before any Stripe call), `amount_cents <= 0`
  (409 `nothing_due`).
- returns a `Payable` with: `amountCents = order.amount_cents`; **`lineItemQuantity =
  order.quantity` and `lineItemUnitAmountCents = order.unit_price_cents`** (a real per-unit line, not
  a lump); `shippingAddressCollection: { allowed_countries: ['US'] }`;
  `metadata: { payable_type: 'direct_order', direct_order_id: order.id }` — **exactly two keys**;
  `successUrl` / `cancelUrl` = `${CLIENT_PORTAL_URL}/orders?order=<id>&checkout=success|cancelled`
  (`:554-555`); `hasInFlightPayment` = "a completed session on a not-yet-paid order is in flight"
  (`:561-576`); `onSessionCreated` stamps `stripe_checkout_session_id` (`:577-585`);
  `onStaleSession` is a no-op.

`startCheckout` (`:1085-1180`) — the session actually created (`:1131-1160`):
```
mode: 'payment', customer, payment_method_types: ['card','us_bank_account'],
payment_method_options: { us_bank_account: { verification_method: 'automatic' } },
line_items: [ one line — quantity × unit_amount ],
…shipping_address_collection (direct order only),
metadata: payable.metadata,  payment_intent_data: { metadata: payable.metadata },
success_url, cancel_url
```
**Verified absent from the whole file: `automatic_tax`, `shipping_options`.** The only hit for either
string family is `shipping_address_collection` at `:1154`. So today the session charges
`quantity × unit_price` and nothing else — no freight, no tax.

**D's deltas here:** fold `products.shipping_flat_cents` into the amount (the plan puts the fold in
`create_direct_order` so `amount_cents` is the truth the sheet prints); add `automatic_tax` +
`shipping_options` **only** when `fulfillment_config → direct_orders.tax_shipping_enabled` is true;
widen `payment_intent_data.metadata` to the fulfillment-intake contract (§4c). Note the metadata is
passed to **both** `metadata` and `payment_intent_data.metadata` from one object — Stripe caps
metadata at 50 keys / 500 chars per value, so the `lines` JSON must stay small.

### 4b. `stripe-webhook/index.ts` — the direct-order settle branch (`:1056-1509`)

Dispatch: `payableTypeOf()` (`:812-819`) reads `metadata.payable_type`; `'direct_order'` routes to
the four handlers below. Row resolution is always session id → PI id → `metadata.direct_order_id`
(`resolveDirectOrder`, `:1102-1133`).

| Handler | Lines | What it does today |
|---|---|---|
| `handleDirectOrderSessionCompleted` | `:1398-1426` | `payment_status === 'paid'` → `markDirectOrderPaid` + receipt/ops emails; otherwise (ACH initiated) stamps the PI id only, status untouched |
| `handleDirectOrderAsyncPaymentSucceeded` | `:1428-1442` | same flip + emails |
| `handleDirectOrderAsyncPaymentFailed` | `:1444-1487` | already-`paid` → return; else clears **both** `stripe_checkout_session_id` and `stripe_payment_intent_id` guarded on the session id, then failure email + `notification_log` in_app row |
| `handleDirectOrderPaymentIntentSettled` | `:1490-1509` | belt-and-suspenders: on `succeeded` only, flip + emails; `failed` is a deliberate no-op |

`markDirectOrderPaid` (`:1164-1190`) is the transition D's new side effects must ride:
`.update({status:'paid', paid_at, [pi], [shipping]}).eq('id',row.id).eq('status','pending_payment')
.select('id')` → **returns true only on the call that actually flipped**. Everything that must happen
once (the earnings credit, the intake enqueue, the project-thread system message) hangs off that
boolean, exactly as the emails do — not off the event.

`extractDirectOrderShipping` (`:1142-1151`) already produces the `shipping` jsonb
(`session.shipping_details ?? session.collected_information.shipping_details`, plus
`customer_details.email`) — that is the `ship_to` source for the intake payload.

**Verified absent from the entire direct-order branch: any mention of `designer`, `commission`,
`project`, `ffe`, `fulfillment`, or `designer_earnings`.** (Matches `17-gap-fills.md` §G3 and
`00301_marketplace_vitals.sql:37-40` — "No designer attribution (client_id is the buyer)".)

**D's deltas here:** on `flipped === true` — (1) `enqueue_agent_task('fulfillment_intake', {
payment_intent_id })`; (2) one `designer_earnings` insert (`source_type='product_commission'`,
`order_id = direct_orders.id`, `commission_rate` from the order snapshot) with `ON CONFLICT DO
NOTHING` against 00540's partial unique index; (3) the settle system message into the project thread.
Every one of the three must be wrapped so a failure cannot fail (and thus retry) the webhook — the
same discipline `sendDirectOrderPaidEmails` already uses (`:1298-1300`).

### 4c. `fulfillment-intake/core.ts` — `normalizeIntakePayload` (`:33-58`)

Reads **only `pi.metadata`**, JSON-parsing three of the keys. The exact contract D's session metadata
must satisfy:

| Payload path | Metadata key | Notes |
|---|---|---|
| `payment_intent.id` / `.livemode` | (from the PI object) | not metadata |
| `client.name` | `client_name` | defaults `'Unknown Client'` |
| `client.email` | `client_email` | |
| `client.profile_id` | `client_profile_id` | this is what the new client-scoped RLS keys on |
| `designer.profile_id` | `designer_profile_id` | |
| `designer.designer_client_id` | `designer_client_id` | |
| `designer.attribution` | `designer_attribution` | **JSON-encoded** |
| `ship_to` | `ship_to` | **JSON-encoded** |
| `totals.captured_total_cents` | `captured_total_cents` | falls back to `pi.amount` |
| `totals.product_subtotal_cents` | `product_subtotal_cents` | |
| `totals.freight_charged_cents` | `freight_charged_cents` | |
| `totals.tax_cents` | `tax_cents` | |
| `lines` | `lines` | **JSON-encoded array**; `[]` when absent |

Idempotency is **in SQL** — `fulfillment_intake_order(p_payload jsonb, p_actor text)`
(`00353:52`, `service_role` only, `:138-139`) does `ON CONFLICT (stripe_payment_intent_id) DO
NOTHING` and returns the existing `order_id`. So a redelivered PI is a pure no-op. D adds nothing to
this file's logic; D only has to make the metadata real.

**⚠ The gap nobody has closed: nothing in the repo enqueues a `fulfillment_intake` task.** Grepped
across `supabase/migrations`, `supabase/functions` and `supabase/seed`: the only hits are the cron
that *claims* them (`00354_fulfillment_crons.sql:6,41`), the worker that *processes* them
(`fulfillment-intake/core.ts:74-118`), and the tests. **The producer is D's to write.** Do not assume
"the enqueue already exists because the worker does."

### 4d. Migrations, as they actually stand

- **`00276_direct_orders.sql`** — `direct_orders` has exactly: `id, client_id → profiles (RESTRICT),
  product_id → products, product_name, quantity, unit_price_cents, amount_cents, currency,
  status, stripe_checkout_session_id, stripe_payment_intent_id, shipping jsonb, created_at,
  paid_at`. **No `designer_id`, no `project_id`, no `commission_rate`** (Q5's three columns are the
  delta). RLS: `direct_orders_select_own` `FOR SELECT TO authenticated USING (client_id = auth.uid())`
  and **nothing else** — no INSERT/UPDATE/DELETE policy for `authenticated`, by design.
  `create_direct_order(p_product_id uuid, p_quantity int default 1)` is SECURITY DEFINER,
  `search_path = public, pg_temp`, raises on unauthenticated, clamps quantity to 10, requires
  `patina_managed OR vendors.is_patina_catalog`, requires `price_retail > 0`, snapshots
  `product_name`/`price_retail`, `REVOKE … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated`
  (`:200-201`). **`price_retail` is already integer cents** — no dollars→cents conversion.
- **`00277`** adds `'refunded'` to the status CHECK (`:85-93`) and the earnings-reversal key; its
  earnings path reads `invoice_payments`, never `direct_orders`.
- **`00301:37-40,157,172`** folds `direct_orders` GMV into platform-wide numerators and states the
  no-attribution fact in its own comment.
- **`00308_transaction_tracker.sql:80`** — ⚠ **not in the plan and worth knowing**:
  `concierge_orders.direct_order_id uuid REFERENCES public.direct_orders(id) ON DELETE SET NULL`, and
  `:533-539` emits a `direct_order_paid` ledger event. A third consumer of the row already exists;
  D should not break it.
- **`00350_fulfillment_core.sql`** —
  `fulfillment_orders` (`:68-89`): `stripe_payment_intent_id text UNIQUE`, `client_name`,
  `client_email`, `ship_to jsonb`, **`client_profile_id → profiles`**, `designer_client_id`,
  `designer_profile_id`, `designer_attribution jsonb`, `captured_total_cents`,
  `product_subtotal_cents`, `freight_charged_cents`, `tax_cents`, `intake_at`. **No status column —
  status is derived.**
  `fulfillment_order_items` (`:92-113`): the line state machine
  `intake|split|transmitted|acknowledged|in_production|shipped|delivered|settled|cancelled`.
  `fulfillment_shipments` (`:160-176`): `mode(parcel|ltl|white_glove)`, `carrier`, `tracking`,
  `shipped_at`, `delivered_at`, `current_eta`, `eta_history`. **No `tracking_url` column** — M8's
  carrier→URL map stays client-side, as the spec says.
  RLS (`:305-331`, the `DO $$ … FOREACH` block): every one of the eight tables gets
  `<t>_select_admin` (admin-domain only) + `<t>_select_agent_reader`, `REVOKE ALL … FROM public,
  anon`, `GRANT SELECT … TO authenticated, agent_reader`. **There is no client-scoped policy of any
  kind** — a homeowner holds the table GRANT and matches no policy, so she reads zero rows. Q6's
  `client_profile_id = auth.uid()` policy is the whole of "where is it". Also note every one of these
  tables carries `trg_<t>_writer_guard` (`:298-301`) — writes require the
  `app.fulfillment_writer` GUC; the client never writes and no client UPDATE policy is added.
- **`00351_fulfillment_events_config.sql`** — `fulfillment_config (key text PK, value jsonb,
  description, updated_by, updated_at)` at `:77`, seeded at `:103-111` with
  `commission_rate_default = {"rate":0.16}` (`:104`) among six others. ⚠ **`fulfillment_config` is
  writer-guarded too** — 00351 itself does `SELECT set_config('app.fulfillment_writer','migration',
  true);` (`:101`) immediately before its INSERT. **00540 must do the same before inserting its three
  new keys**, or the insert is refused. `ON CONFLICT (key) DO NOTHING` is the house idiom.
  Critique M3 stands: `app_settings` does not exist; `fulfillment_config` is the table.
- **`00014_portal_business_features.sql`** — `designer_earnings` (`:299-328`): `designer_id`,
  `source_type` (comment already lists `'product_commission'` — **no CHECK constraint**, so no
  vocabulary migration is needed), `proposal_id`, `proposal_item_id`, **`order_id UUID` at `:307`
  with the comment *"Future: when orders table exists"* and no FK and no unique index**,
  `gross_amount`, `platform_fee`, `net_amount`, `commission_rate DECIMAL(5,4)` (`:313`), `status`,
  `payout_id`, `paid_at`, `earned_at`. ⚠ **`order_id` is un-namespaced**: a partial unique index on
  `order_id WHERE order_id IS NOT NULL` is global to the column. Verified today **nothing writes it**
  (the only insert path is 00178's invoice credit at `:646` and 00277's reversal, neither of which
  sets `order_id`), so the index is safe now — but D should say so in the migration banner, because
  a future second rail writing `order_id` would collide.
  `designer_clients` (`:72-95`): `designer_id`, `client_id`, `nickname`, `notes`, `tags`, `source`,
  `lead_id`, `status` (default `'active'`; live vocabulary `lead|proposal|active|completed|nurture`),
  `total_projects`, `total_revenue`, `first_project_at`, `last_project_at` — the roster attribution
  key.
- **`00536_client_side_server_gaps.sql:118-134`** — `public.client_designer_roster`, a
  `security_invoker = false` view owned by `postgres`, **four columns** (`designer_id`, `client_id`,
  `status`, `created_at`), body-filtered `WHERE client_id = auth.uid() AND status = 'active'`.
  The base-table client policy was deliberately **dropped** (it leaked the designer's CRM row —
  `notes`, `satisfaction_score`, `total_revenue`, …). ⚠ **The view scopes to `status = 'active'`
  only.** R3's roster attribution ("a client on a roster with no live lead or project") therefore
  sees only `active` roster rows from the client side; `lead`/`proposal`/`nurture` rows are invisible
  to the client app. If W5 wants those to credit, that is a **server-side** resolution inside
  `create_direct_order` (which is SECURITY DEFINER and can read the base table), not a widened view —
  and it should be a stated decision, not a silent one.

### 4e. What already exists on the client, so nobody rebuilds it

- `Core/State/DesignerRelationship.swift` **exists** (shipped W1a) — `enum DesignerRelationship {
  none, roster(designerId:), lead(leadId:designerId:studioName:), project(projectId:designerId:
  studioName:) }` with `isLive` (`.lead`/`.project` only — `.roster` is **false**) and `designerId`
  (non-nil for roster too). `DesignerRelationshipResolver.resolve(lead:projects:roster:)` implements
  the precedence and the same-day roster tie → `.none`. **C1 consumes this; C1 does not write it.**
  It closes critique M15.
- `Features/Home/Models/HouseRecord.swift` already has `Kind.orderMoved` (`:32`) and a `RouteToken`
  round-trip. C2 writes the **producer**, not the enum.
- **Absent, all new in W5:** `Features/Purchase/`, `Features/Orders/`,
  `Core/Network/DirectOrdersAPIClient.swift`, `Core/Network/FulfillmentAPIClient.swift`,
  `Core/Models/DirectOrder*.swift`. Zero iOS references to `direct_order` / `create_direct_order`
  anywhere — this is genuinely unbuilt on the client, as `12-backend-reality.md` §5 said.
- Buyability-gate columns **all exist** after 00533: `products.dimensions jsonb`, `lead_time_weeks`,
  `brand`, `description`, `patina_managed`, **`photo_verified_at`** and **`shipping_flat_cents`**
  (added by `00533:51-52`), all appended to `get_recommendations`' `RETURNS TABLE` (`00533:86-95`).
  `returns_policy_key` (direction A) was **never created** — the responsibility text is a
  `fulfillment_config` key instead, per M3. The piece detail reads `products` directly
  (`ProductAPIClient`, `select=*,vendors(...)`), so the gate can read every field without an RPC.
- Existing tests D must keep green: `supabase/functions/_tests/stripe-rail.test.ts` (38
  `direct_order` references), `_tests/direct_order_rpc.assert.sql`, `_tests/fulfillment-intake.test.ts`,
  `_tests/refund_reconciliation.assert.sql`, and `supabase/tests/**` (notably `rls/`, `billing/`,
  `commercial/`).

---

## 5. Money rules carried into every lane brief (canon, not opinion)

- Physical goods **never** through IAP (C15). Stripe hosted Checkout in `SFSafariViewController`.
- **Apple Pay is already inside that hosted Checkout** — both session paths pass `card`
  (`create-checkout-session:935-961`, `:1131-1140`), there is no `ui_mode`, no `wallets` hash, no
  suppression. It is a **device probe, not a build**; do **not** add `PaymentSheet` or any Stripe
  SPM dependency. The one live gotcha: the *invoice* branch narrows `payment_method_types` to a
  single rail when a caller claims one — a future "pay by bank" toggle would silently delete Apple
  Pay. The direct-order branch drops `payment_method` on purpose (`:1269-1270`), so both rails ride.
- Internal payable state is the source of truth; Stripe reconciles toward it, never the reverse.
- `commission_rate` snapshotted at create, **immutable after `paid`** (a trigger, not a convention).
- The earnings credit fires **once** — partial unique index on `order_id` + `ON CONFLICT DO NOTHING`,
  riding `markDirectOrderPaid`'s guarded flip, not the event.
- **R3, absolutely:** a client with `DesignerRelationship.isLive` **never sees Buy** — Path B "Ask
  <designer first name> to source this" pre-empts it, with no "Buy it myself" secondary and no
  disclosure line, until the designer-side settle notice is device-proven. Buy draws only behind
  `FeatureFlags.shared.isOn(.directOrders)` **and** a passing buyability gate (price > 0, a seller of
  record — `patina_managed` or a selling vendor — `dimensions`, `lead_time_weeks`, `brand`,
  `photo_verified_at`).
- **The order sheet prints the session's real total.** The tax/delivery line reads *"Delivery and tax
  are added at payment. You'll see the full total before you pay."* **only** when the server says
  `direct_orders.tax_shipping_enabled`; otherwise it reads *"Delivery and tax are not included yet."*
  and **Path A stays off**. (Critique M14 — the copy must not outrun the setting.)
- **No vendor or system error text ever reaches a homeowner** (C5). The 502 `detail` from
  `create-checkout-session` is Stripe's own sentence; it is logged, never rendered.
- **No painted tracker.** Until a real fulfillment state exists the line is *"We'll email you when it
  ships."* Order placed shows no invented step rail.
- Brand voice (C6), canonical names (C4), honesty (C5) throughout.

---

## 6. OWNED-FILE MAP — the integration contract

One writer per path. A lane that needs a file outside its map asks the steward; it does not edit and
disclose afterwards. Pathspec commits only; no `git add -A`; no pushes from lanes.

### D — backend (worktree `agent-dr-w5-d`, branch `daily-return/w5-d`, base `main` 05b3f9a18)

| Path | Note |
|---|---|
| `supabase/migrations/00540_*.sql` | **the wave's only migration** — Q5's three columns + snapshot-in-`create_direct_order` + the immutable-after-paid trigger; the `designer_earnings` partial unique index on `order_id`; the client-scoped SELECT policies on `fulfillment_orders` / `fulfillment_order_items` / `fulfillment_shipments` (`client_profile_id = auth.uid()`, `TO authenticated`); the three `fulfillment_config` keys (`direct_orders.responsibility_paragraph`, `direct_orders.contact`, `direct_orders.tax_shipping_enabled` default **false**) behind `set_config('app.fulfillment_writer','migration',true)` |
| `supabase/functions/create-checkout-session/**` | the direct-order branch only |
| `supabase/functions/stripe-webhook/**` | the direct-order settle branch only |
| `supabase/functions/fulfillment-intake/**` | only if the intake side needs a change; prefer none |
| `supabase/functions/_shared/direct-order-*.ts` | **new**, only if shared logic is genuinely needed. ⚠ a `_shared/*` edit forces a redeploy of **every** importing function — do not touch an existing `_shared` file |
| `supabase/tests/**` | pgTAP: the new policies, the immutability trigger, the unique index |
| `supabase/functions/_tests/**` | deno: the widened metadata, the enqueue, the earnings credit, the config gate |
| `supabase/seed/**` | a buyable seeded piece + a settled order for the walk; regenerate `00-legacy-grants.sql` via `python3 scripts/generate-legacy-grants.py` if 00540 adds a GRANT — never hand-edit it |
| `packages/supabase/src/database.types.ts` | regenerated after 00540 (the three new columns + the policies' tables) |

Gates: `supabase db reset` (**D owns it for the wave**) + `supabase/tests` pgTAP + `deno test` on the
touched functions + `pnpm turbo type-check --filter=@patina/client-portal` if the regenerated types
move anything under it.

### C1 — the piece and the purchase (worktree `agent-dr-w5-c1`, off D's branch)

| Path | Note |
|---|---|
| `apps/mobile/Patina/Patina/Features/ProductDetail/**` | the purchase action bar, the fit line, the gate-failed variant |
| `apps/mobile/Patina/Patina/Features/Purchase/**` | **new** — `BuyabilityGate`, `OrderSheet`, `OrderHandoff`, `OrderPlaced`, `AskDesignerSheet`, `AskAboutPieceSheet` |
| `apps/mobile/Patina/Patina/Core/Network/DirectOrdersAPIClient.swift` | **new** — `create_direct_order` RPC + `create-checkout-session {direct_order_id}` + the poll-on-dismiss (3 s / 60 s, the `InvoicesViewModel` pattern) |
| `apps/mobile/Patina/Patina/Core/Models/DirectOrder*.swift` | **new** |
| `apps/mobile/Patina/Patina/Features/Companion/**` | **piece-context rows only** — nothing else in Companion |

C1 **reads** `Core/State/DesignerRelationship.swift` and **does not modify it**.

### C2 — the order, after (worktree `agent-dr-w5-c2`, off D's branch)

| Path | Note |
|---|---|
| `apps/mobile/Patina/Patina/Features/Orders/**` | **new** — `OrderedListView`, `OrderDetailView`, over **both** rails |
| `apps/mobile/Patina/Patina/Features/Profile/Views/StudioHubView.swift` | the **Ordered** row only |
| `apps/mobile/Patina/Patina/Features/Notifications/**` | order entity routing only |
| `apps/mobile/Patina/Patina/Features/Home/Models/HouseRecord.swift` + the `Core/…` producer | the `orderMoved` producer (the `Kind` case already exists) |
| `apps/mobile/Patina/Patina/Core/Network/FulfillmentAPIClient.swift` | **new** — the client-scoped read over `fulfillment_orders` / `_order_items` / `_shipments` |

### Shared / contested — steward-arbitrated, nobody edits unilaterally

`packages/supabase/src/database.types.ts` (**D only**) · `Core/State/DesignerRelationship.swift`
(**frozen this wave**) · `App/Coordinators/Coordinator.swift` and the route→tab table (**neither
lane**; if an order route is needed, C2 asks) · `supabase/config.toml` (**D only**) ·
`apps/mobile/Patina/Patina.xcodeproj` (auto-synchronised file groups — **never hand-edited**).

---

## 7. Gates, per the plan's global constraints

- **iOS per lane:** `ios-gate.sh build` + `xcodebuild test -only-testing:PatinaTests -destination
  id=<that lane's clone>`, foreground. First `xcodebuild` in a fresh tree can fail on
  `GitCommit.swift` — run it twice. A failure with **no `error:` line** is shared-DerivedData
  contention — re-run.
- **`ios-gate.sh lint-delta` and `ios-gate.sh all` are the steward's alone**, on the integration
  branch (lint-delta adds temp worktrees to the shared `.git`; `all` grabs the first iPhone simulator).
- **SQL:** `supabase db reset` + `supabase/tests` pgTAP — **D only**.
- **Edge functions:** `deno test` where tests exist (they do: `_tests/stripe-rail.test.ts`,
  `_tests/fulfillment-intake.test.ts`).
- **Claim levels** (patina-ios-verification): compile-green / sim-verified / device-verified. Apple
  Pay, universal links, APNs delivery are **device** claims — **this wave produces none**. With the
  placeholder Stripe key, even the "sim-verified end-to-end purchase" claim is unavailable until Kody
  supplies a real `sk_test_`.
- **Screen capture:** `xcrun simctl io <udid> screenshot` or blitz only. **Never** `screencapture` or
  any desktop-region capture — the desktop is Kody's.

---

## 8. Open, for Fable — decisions W5 will hit

1. **The Stripe key blocks the acceptance criterion.** `sk_test_`-prefixed but 32 chars = the
   placeholder. Either Kody drops a real test key into the local functions env before the walk, or
   the wave's purchase claim is downgraded to "create → error branch, settle proven by fixture" and
   said so in the walk record. This is the single largest risk to W5's headline.
2. **The build plan's W5 row says migration `00539`; the free number is `00540`.** One-word edit.
3. **`client_designer_roster` exposes only `status = 'active'`.** R3's roster attribution may want
   `lead`/`proposal` rows too. Server-side resolution inside `create_direct_order` (SECURITY DEFINER)
   is the safe shape; widening the view re-opens the CRM-leak 00536 closed. Needs a word before D
   writes the resolution query.
4. **`designer_earnings.order_id` is a shared, un-namespaced column** taking a global partial unique
   index. Safe today (nothing writes it); worth a banner in 00540 so a future rail does not collide.
5. **Nothing enqueues `fulfillment_intake` today** — the producer is new work, not a wiring change.
   It is the seam between "paid" and "where is it", and it is the most likely place for the wave to
   quietly not work.
6. **`concierge_orders.direct_order_id` (00308) already consumes `direct_orders`** and emits a
   `direct_order_paid` ledger event. Not in the plan; D must not break it.
7. **The responsibility paragraph and the contact are Kody's copy, not engineering's.** 00540 creates
   the two `fulfillment_config` keys; until they hold real text, `tax_shipping_enabled` stays false
   and Path A stays off — which is exactly what B §5 requires.
8. Still open from W4 and unowned: `RouteTabTable.rootRoute(for: .studio) == .profile`
   (W4 §6.10) — C2 lands the Ordered row inside Studio and will meet it.

---

## 9. Steward state at handoff

- `main` untouched; nothing pushed; no git command run in the main checkout except reads.
- `daily-return/w5-d` created at `05b3f9a18`, clean, `Secrets.swift` in place and ignored.
- C1/C2 worktrees + `dr-w5-c1` / `dr-w5-c2` simulator clones deliberately **not** created yet — they
  branch from D.
- No W4 residue: zero `dr-w4-*` simulators, zero `agent-dr-w4-*` worktrees, zero `daily-return/*`
  branches other than the one created here.
- The local edge runtime container is **Exited** — restart the stack before any walk.
- No secret value was read, printed, or stored anywhere; only variable length and prefix/tail shape.
