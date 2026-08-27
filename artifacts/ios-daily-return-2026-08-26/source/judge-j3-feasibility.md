# Judge J3 · Feasibility

**The Daily Return · Patina iOS client · 2026-08-26 · main `3cd84ecb3`**

Rubric per `source/instruments.md` §8: first-slice realism · backend deltas vs C13 and the §12 ledger ·
Apple review and data risk · rollback. Ten points each, forty total per direction. **Scores are not
averaged with J1 or J2.**

Method: every load-bearing mechanism claim in both documents was re-read against the code on `main`,
not against the critiques. Where a direction and the code disagree, the code decides. Verifications
performed for this judgment are listed in §5 so a reader can re-run them.

---

## 1. Scoring table

| Cell | A | B | One line of reasoning |
|---|---|---|---|
| **First-slice realism** | **8** | **7** | A prices six items at 10 iOS days + 2 parallel backend days and cuts two items out of v1 to get there; B lists the slice file-by-file but never budgets a day, and says three different things about whether the slice needs amendment B-3. Both omit or misstate something real — A omits two files, B omits the estimate. |
| **Backend deltas vs C13 / §12** | **9** | **8** | Both are migrations + edge functions only, no new service, no cron, no realtime; both correctly reduce the order rail to "settle onto `fulfillment_orders` + one client-scoped SELECT policy". A's ledger is ten deltas and **zero new columns on `direct_orders`**; B's is roughly twice the surface and puts one column on a table whose SELECT policy is `USING (true)`. |
| **Apple review + data risk** | **9** | **8** | Both keep physical goods on external hosted Checkout (C15) and both name SP-20's account deletion as the real release gate. A reads compliance more completely (4.8, and the design-fee invoice named as a service billed externally rather than pretended away). B's consumer-protection gate is the better one — a responsibility paragraph and *one reachable human* — but it carries an unnamed profile-timestamp exposure and a commission rate that is NULL on every row. |
| **Rollback** | **9** | **7** | A gives four independent fail-closed flags plus one route, and names the two things that do not roll back — money moved, and the notification authorization, which is one-way per install — then converts the second into a shipping rule. B's flags are good and its evaluate-once-at-launch rule is excellent, but W2 swaps a navigation root across 105 verified call sites, and B never names the permission grant as unrollable. |
| **Total** | **35 / 40** | **30 / 40** | |

---

## 2. Cell reasoning, with the evidence

### 2.1 First-slice realism — A 8, B 7

**A · 8.** The slice is six items, each with a day figure, totalling **10 iOS days plus 2 backend days in a
parallel lane**, and it is visibly *smaller* than A's v1: the permission moment and the six-string scan
repair were both moved to wave 2, and the catalog half of the line is deferred by construction with the
reason cited (`get_recommendations` projects neither `created_at` nor `published_at`, and its own comment
calls the signature `FROZEN iOS contract` — verified at `supabase/migrations/00246_aesthete_quiz_bridge.sql:273-305`).
Prerequisites are stated as prerequisites (SP-07, SP-08, SP-13, SP-20; SP-11/SP-14 gate two mocks) and the
gate command is named with the screens it must cover. That is a slice a lead could hand to one engineer
on Monday.

Two verified defects keep it off a 9:

- **Two files are missing from the list.** Items 2 and 3 build a dated queue "over rows the home already
  fetches (`BadgeCountService.swift:85-96`)" and take "dates from `StudioQueueBuilder`". Neither supplies
  what A needs today. `BadgeCountService.refresh()` fetches all five collections concurrently and then
  **discards every row down to five `Int`s** (`apps/mobile/Patina/Patina/Services/Badges/BadgeCountService.swift:82-105`).
  `StudioQueueBuilder` emits **one rolled-up row per kind with a count and a `min()` due date** —
  `payableInvoiceRow` / `pendingDecisionRow` / `pendingProposalRow`
  (`apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift:82-140`) — not one row
  per decision with its own date. Both edits are small and neither costs a network call (`StudioQueueContext`
  already holds the full rows and the builder "performs no network work", `:1-60`), so A's *architecture*
  survives; its *file list* does not. B named both, and A's critique log treats them as B's problem.
- **The decision call site is in the wrong file.** A's §4 table wires `notify_client_attention` to "the three
  write paths SP-08 already touches (`proposal-send`, `00092_decision_cron.sql`, `invoice-send` /
  `invoice-reminders`)". `00092_decision_cron.sql` is a **pg_cron schedule** — `cron.schedule('decision-reminders-daily', '0 9 * * *', …)`
  invoking `decision-reminders` (verified `supabase/migrations/00092_decision_cron.sql:1-20`). Nothing in it
  fires on decision creation. The decision push needs a new `AFTER INSERT` trigger on `client_decisions`
  (`supabase/migrations/00062_client_management_v2.sql:68`), which A never names, so item 6's two days are
  estimated against a call site that does not exist.

**B · 7.** B's slice is the more *legible* of the two: five new files, four modified files, a new
`PushPrimerView`, and a named backend lane. It catches both of A's mechanism errors — it adds the
`BadgeCountService` retain-rows change and the per-item `StudioQueueBuilder` variant by name, and it
specifies the decision push as "**a new `AFTER INSERT` SECURITY DEFINER trigger** on `client_decisions`,
in the `00289…` shape — `00092` is a pg_cron schedule". Both corrections are right and I verified both.
It also adds a detail A does not have: every `apns-send` call passes a `notification_log_id`, "without it
the push lands and the in-app row does not."

Three things hold it below A:

- **There is no estimate.** The slice is asserted at "≤ 2 weeks, one iOS engineer + edge functions" and never
  costed. It carries three new persistence/model types, a new card with two eyebrows and two empty states,
  three API-client embeds, a greeting change, a monogram relabel, a brand-new pre-permission screen with the
  `UNUserNotificationCenter` flow, and a test matrix spanning record ordering, both empties, the two-weeks
  header, first run, second open, Dynamic Type XXL and a dark pass over the money screens. It is the *larger*
  of the two slices carrying the *smaller* stated cost. A judge scoring realism has to mark an unbudgeted
  fortnight below a budgeted one.
- **`RecordSnapshotStore` is specified as an App Group snapshot in W1**, moved forward from W5. The instant
  cold-launch paint is the right call — but the App Group is the *widget's* requirement; painting inside the
  app needs no entitlement and no provisioning change. B pulled a signing dependency into the first slice to
  buy something the app container already gives it.
- **B says three different things about whether the slice amends canon.** The slice preamble: "It requires
  none of the amendments and ships inside Option B's mount." B-3's own cost line: "*Cost:* W1 — this is the
  first slice." The wave table: B-3 sits under **W3**. And the record *is* a fifth Today module against a
  contract that reads "Today presents exactly one prioritized next move, one real editorial or taste story,
  and one active room" (`apps/mobile/Patina/OPTION_B_ACCEPTANCE.md:36-38`). Whether the first slice needs a
  Kody ruling before it can ship is the single most schedule-relevant fact about it, and B states it three
  incompatible ways. A leans on the same contract — it argues `WHAT MOVED` lives inside the greeting header,
  which the contract does not enumerate — but A names the lean in §2 in three numbered places and writes
  "**Your call on all three.**" A ruling dependency you can see is cheaper than one you have to reconcile.

### 2.2 Backend deltas vs C13 and the §12 ledger — A 9, B 8

**Both pass C13 outright**: migrations and edge functions only, no new NestJS service, `services/orders` left
dormant, no new cron, no realtime (the badge poll floor stays). Both correctly converge on the largest
structural insight in the program — that a settled direct order should land on the **existing** fulfillment
rail rather than growing a second order object. I verified the rail supports it: `fulfillment_orders` carries
`client_profile_id`, `designer_profile_id`, `designer_attribution`, `product_subtotal_cents`,
`freight_charged_cents`, `tax_cents`, `captured_total_cents` and no status column
(`supabase/migrations/00350_fulfillment_boh_core.sql:67-89`); `normalizeIntakePayload` maps a Stripe PI plus
its metadata cart onto `fulfillment_intake_order` idempotently
(`supabase/functions/fulfillment-intake/core.ts:33-70`); and the three read tables really are admin-only —
the RLS loop creates exactly `%_select_admin` and `%_select_agent_reader`
(`00350_fulfillment_boh_core.sql:305-330`). So both directions' "one new client-scoped SELECT policy is the
whole answer to *where is it*" is correct, and it is the cheapest high-value delta either document proposes.

**A · 9 — the smaller ledger, one imprecision.** Ten deltas, wave-tagged, no new tables, no cron, and
**zero new columns on `direct_orders`**. Attribution is resolved inside `create_direct_order` (already
SECURITY DEFINER, verified `supabase/migrations/00276_direct_orders.sql:140-205`) and written once into
`designer_earnings.order_id` — a column reserved since `00014_portal_business_features.sql:307` with the
comment *"Future: when orders table exists"* and `source_type` already listing `'product_commission'` at
`:304`. The idempotency argument is exact: a partial unique index on `order_id WHERE order_id IS NOT NULL`
plus `ON CONFLICT DO NOTHING`, riding a settle that only returns rows on first delivery — verified, since
`markDirectOrderPaid` updates `.eq('status','pending_payment')` and returns `(data ?? []).length > 0`
(`supabase/functions/stripe-webhook/index.ts:1164-1190`).

The imprecision: A writes "put the intake-contract metadata **on the direct-order Checkout session**".
`normalizeIntakePayload` reads `pi.metadata` — the **PaymentIntent's** metadata, re-fetched by the worker
from Stripe by id (`fulfillment-intake/core.ts:34-57`). Session metadata alone delivers nothing to intake;
the widening has to be `payment_intent_data.metadata`. B states this correctly.

**B · 8 — better money shape, materially larger surface, one unnamed exposure.** B's three additive nullable
columns on `direct_orders` (`designer_id`, `project_id`, `commission_rate`), snapshotted at create and
immutable after `paid`, are the better *money* design: a snapshot is auditable and a resolve-at-settle is
not. B also gets the PI-metadata widening, the `order_id` key and the decision trigger right.

Against that, the totalled ledger is about twice A's: four RLS policies, six new columns across four tables,
a `household_members` junction plus an invite RPC plus RLS, a read-only `get_maker` RPC over `vendors`, an
activity-token table plus an `apns-send` push-type branch if the Live Activity updates remotely, and the same
SP-10 recreate with two more columns. Every item is C13-shaped and none of it is a service — this is not a
canon failure, it is a size difference, and B is honest about it by totalling it in one paragraph.

One item is a genuine unnamed risk: **`profiles.last_seen_at`** (W3). `profiles` SELECT is
`CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true)`
(`supabase/migrations/00013_rls_policies.sql:56-58`). Adding a last-app-open timestamp to that table
publishes, to every reader, when each client last opened Patina. B names the column and never names the
exposure. A keeps last-seen device-local in wave 1 and defers a server-side `client_last_seen` to wave 3 —
and separately reasons about the shared-iPad case and Option B's memory clause
(`OPTION_B_ACCEPTANCE.md:28-33`) rather than skating past it.

**One delta available to both that neither found.** `stripe-webhook` already enqueues `fulfillment_intake`
for any `payment_intent.succeeded` whose PI carries `metadata.patina_order = 'boh_v1'`, idempotency-keyed on
`pi.id` with `onConflict: 'ignore'` (`supabase/functions/stripe-webhook/index.ts:2021-2044`). If the
direct-order branch stamps that key alongside the intake contract, the "one new enqueue on settle" both
directions budget may not be needed at all — the existing emitter picks it up. Worth ten minutes before
either ledger is estimated.

### 2.3 Apple review + data risk — A 9, B 8

**Shared and correct.** Physical goods, external payment, hosted Stripe Checkout in `SFSafariViewController`,
no IAP — 3.1.3(e) / 3.1.5(a), the rail invoices already use (C15). Both name **SP-20's in-app account
deletion (5.1.1(v))** as the real release-gating exposure regardless of direction. Both correctly treat
Apple Pay-in-Checkout as a **device probe, not a build** (C25), and both note there is no installable
TestFlight build, so a fresh archive precedes any device claim.

**A · 9.** The completer compliance reading in the program. It names 4.8 as satisfied by the shipped
`SignInWithAppleButton`, and — the part nobody else does — it names the **design-fee invoice** the app
already hands to the same Safari Checkout as a *service* billed externally under 3.1.3(d)/(e), rather than
claiming there is no service in the app, while keeping 3.1.1 shut by selling no digital good of its own.
On data: attribution ships **before** the button, the tax-registration ruling **gates** the button, and the
staleness risk in the `WHAT MOVED` line is named with its fix (build the line from the same fetch that paints
the card, never a cache). Its two soft spots: the commission-unit chain is unresolved —
`products.commission_rate` is `NUMERIC(4,2)` (`00152_three_layer_catalog.sql:52`),
`designer_earnings.commission_rate` is `DECIMAL(5,4)` documented *"0.0800 for 8%"* (`00014:313`), and
`fulfillment_config` holds `{"rate":0.16}` (`00351_fulfillment_events_config.sql:104`); three sources, no
declared unit, and A's fallback rule crosses all three. And `returns_policy_key` is a column key with no
policy behind it and no named human.

**B · 8.** Same compliant rail, correctly stated. It adds three review surfaces A does not — a hand-rolled
tab bar, a WidgetKit target, and a Live Activity with a push-type branch. None is a rejection risk, and B is
right that text-only tab labels are "an HIG deviation, not a violation"; but forfeiting `TabView` means the
VoiceOver, Dynamic Type and iOS 26 bar treatments become work B owns, which B does say (B-1, after critique).

B's **consumer-protection posture is better than A's** and this should be graftable rather than lost: Path A
ships only with (a) a config-driven responsibility paragraph naming who owns delivery, damage and return,
printed on the order sheet *and* on `Order placed.`, and (b) **one reachable human — an address or a number,
not the word "support"**, routed to Patina support cc'd to the designer of record. For a $4,200 physical
good bought outside IAP, that is the correct posture and A's `returns_policy_key` is not.

Two data risks pull it back: the `profiles.last_seen_at` exposure above, and a disclosure that can print
against nothing — B's order sheet says the designer is "credited at **the piece's trade rate**", snapshotted
from `products.commission_rate`, a column populated on **zero** rows today (the only `commission_rate` seed
in the tree is `seed/fulfillment-vendor-profiles.sql`, which writes `vendor_profiles`, a different table).
B names no fallback; A names one, imperfectly. B's primer also ships without gating on a device push probe,
where A makes the probe a precondition.

### 2.4 Rollback — A 9, B 7

**A · 9.** Four PostHog fail-closed flags on four *independent* wave-1 items (the line, the queue branch, the
Companion designer header, the dot) plus one route, "any one turns off without the others";
`notify_client_attention` reverts as a `DROP FUNCTION` plus three one-line reverts with no stranded data;
wave-2 columns additive and nullable, the Buy control flagged, the RLS policy a `DROP POLICY`. Then the part
that earns the score: **A names the two things that do not roll back.** Money that has moved — which is why
attribution ships before the button — and **the notification authorization, which is one-way per install**.
That second is code-exact: `armFirstSubmissionPromptGate()` flips a `UserDefaults` key and "returns `true`
exactly once per install; every subsequent call returns `false` without side effects"
(`apps/mobile/Patina/Patina/Services/API/PushTokenService.swift:90-108`), and once iOS records a denial no
flag brings the system prompt back. A turns that into a shipping rule — the ask ships in the same release as
the sender, after a device push probe, or not at all — which is the sharpest piece of rollback reasoning in
either document.

**B · 7.** Four flags (`house-first`, `direct-orders`, `house-widget`, `second-seat`), W1 removable by
deleting one mount, every migration additive-only, the pre-amendment root compiled for one release after W2 —
and one detail better than anything in A: `house-first` is **evaluated once at launch and held**, so a
late-arriving flag cannot swap the navigation root mid-session. That is the right instinct and A should take it.

Two things cost it. First, W2's rollback is the hardest object in either plan. I verified its scale: the app
has **105** `navigate(to:` call sites and **31** `AppRoute` cases (`App/Coordinators/Coordinator.swift:51-144`),
and B's own B-1 adds four `NavigationStack`s under one root, a route→tab table, deep-link and push tab entry,
`CompanionSafeArea`'s 120 pt inset retired, `handleIntent` routing and the NEXT STEPS decay re-checked, and
both roots maintained for a release. A flag can restore the old root; it cannot restore the state carried
across the swap — an open stack, a deep link mid-flight, a push that entered on a tab that no longer exists.
B prices this honestly, which is why it is a 7 and not lower, but the cost is real and it is not a flag flip.
Second, **B never names the permission grant as unrollable** — on the axis where that is the single most
important fact, and while B's own risk section already knows the adjacent one (`device_push_tokens.environment`
yields sandbox tokens until a distribution archive ships).

---

## 3. Verdict

**Direction A wins on feasibility, 35 to 30.** It is the smaller, better-sequenced, more reversible plan:
a budgeted ten-day slice, a ten-item C13 ledger with zero new columns on `direct_orders`, the completest
Apple reading, and the only rollback section in the program that names what cannot be rolled back and turns
it into a shipping rule.

**What must ship first, in this order:**

1. **Slice items 1–3, with the two omitted files added** — `AppRoute.studio` and its destination arm
   (0.5 day); last-seen / last-phase and the `WHAT MOVED` **attention half only**; the Next Move carrying the
   dated queue with the empty-state phase branch. Add to the file list: `BadgeCountService` retains the rows
   it already fetches, and `StudioQueueBuilder` gains a per-item row variant. No migration, no new network
   call on the home.
2. **SP-07's one-line lead filter, in or before the same release.** The engaged tier and M9 are inert without
   it, and eight findings share that one cause.
3. **Slice item 6, rewritten** — `notify_client_attention` wired to `proposal-send`, `invoice-send` /
   `invoice-reminders`, and a **new `AFTER INSERT` trigger on `client_decisions`** (not `00092`), each call
   passing a `notification_log_id`. It ships in the same release as the primer, and only after a device push
   probe on a fresh archive. The authorization is spent, not rolled back.
4. **Slice items 4–5** (the Companion holds the designer; the unread dot earns itself) — independent flags,
   independently revertible.

Everything with money in it — the Buy control, freight, `automatic_tax`, attribution — stays in wave 2 behind
its flag, and does not draw until the tax-registration ruling and the responsibility paragraph both exist.

**Not settled by this judgment, and it is Kody's:** A's reading that the greeting header is outside the
"exactly one next move / one story / one active room" count. If that reading is refused, A's `WHAT MOVED`
block becomes an amendment and A's zero-amendment claim goes with it — which is precisely the ruling B files
as B-3 and then contradicts itself about. Either way the ruling is needed before slice item 2 is built, not
after.

---

## 4. Grafts — what A must take from B

1. **The two files A's slice omits.** `BadgeCountService.swift:82-105` discards its rows to five `Int`s and
   `StudioQueueBuilder.swift:82-140` rolls up one row per kind with a `min()` date — both are slice edits, and
   A cites both files as if they already supply dated per-item rows.
2. **The decision call site.** `00092_decision_cron.sql:1-20` is a pg_cron schedule, not a write path; the
   decision push needs a new `AFTER INSERT` SECURITY DEFINER trigger on `client_decisions` in the `00289` shape.
3. **`notification_log_id` on every `apns-send` call** — without it the push lands and the in-app row does not,
   which is half of F08.
4. **PI-metadata precision.** The intake contract reads `pi.metadata` via `normalizeIntakePayload`
   (`fulfillment-intake/core.ts:34-57`) — widen `payment_intent_data.metadata`, not the session's.
5. **B's Path-A gate: a config-driven responsibility paragraph printed twice, plus one reachable human — an
   address or a number, not the word "support".** Stronger than A's `returns_policy_key`, and correct for a
   $4,200 physical good bought outside IAP.
6. **Snapshot the commission at create, immutable after `paid`** (B's `direct_orders.commission_rate`), and
   resolve the unit question A leaves open across `products.commission_rate` NUMERIC(4,2),
   `designer_earnings.commission_rate` DECIMAL(5,4) ("0.0800 for 8%"), and `fulfillment_config {"rate":0.16}`.
7. **Evaluate root-level flags once at launch and hold them**, so a late-arriving flag cannot change a root
   mid-session.
8. **B-1's fallback, which costs A nothing under C1:** label the 36 pt monogram **`Studio`** with its waiting
   count. It is the highest-consensus discoverability complaint in the program and A's §8.1 concedes the door
   without fixing the label.

---

## 5. What was verified for this judgment

Every item below was read on `main @ 3cd84ecb3`; file:line is the evidence, not a citation of either document.

| Claim | Result | Evidence |
|---|---|---|
| `BadgeCountService` fetches five collections, discards rows to `Int`s | confirmed | `Services/Badges/BadgeCountService.swift:82-105` |
| `RemoteProject` carries `current_phase` + `updated_at` (A's phase line, zero new calls) | confirmed | `Core/Network/ProjectsAPIClient.swift:15-30` |
| `StudioQueueBuilder` rolls up one row per kind with a `min()` date; performs no network work | confirmed | `Features/Profile/ViewModels/StudioQueueBuilder.swift:1-14, 82-140` |
| No `AppRoute.studio`; 31 cases | confirmed | `App/Coordinators/Coordinator.swift:51-144` |
| 105 `navigate(to:` call sites (B-1's figure) | confirmed exactly | `grep -rn "navigate(to:" apps/mobile/Patina/Patina` |
| Three targets, no extension of any kind | confirmed | `Patina.xcodeproj/project.pbxproj:145-225` |
| `fulfillment_orders` shape; SELECT is admin + agent_reader only | confirmed | `migrations/00350_fulfillment_boh_core.sql:67-89, 305-330` |
| `fulfillment-intake` normalizes **PI** metadata, idempotent via `fulfillment_intake_order` | confirmed | `functions/fulfillment-intake/core.ts:33-70` |
| `designer_earnings.order_id` reserved; `commission_rate` DECIMAL(5,4) "0.0800 for 8%" | confirmed | `migrations/00014_portal_business_features.sql:299-320` |
| `create_direct_order` writes `price_retail * qty`, no freight, no tax; anon revoked | confirmed | `migrations/00276_direct_orders.sql:140-205` |
| Direct-order Checkout sets no `automatic_tax`, no `shipping_options` ("no tax/shipping on this session config") | confirmed | `functions/create-checkout-session/index.ts:530-575, 960-985` |
| Settle guard returns rows only on first delivery | confirmed | `functions/stripe-webhook/index.ts:1164-1190` |
| An existing `fulfillment_intake` emitter fires on `metadata.patina_order='boh_v1'`, idempotent on `pi.id` | confirmed — unclaimed by both | `functions/stripe-webhook/index.ts:2021-2044` |
| `get_recommendations` is a FROZEN contract projecting neither `created_at` nor `published_at` | confirmed | `migrations/00246_aesthete_quiz_bridge.sql:273-305` |
| `00092_decision_cron.sql` is a pg_cron schedule, not a decision write path (A wrong, B right) | confirmed | `migrations/00092_decision_cron.sql:1-20` |
| `products.commission_rate` NUMERIC(4,2); `fulfillment_config` default `{"rate":0.16}`; no product rows seeded | confirmed | `migrations/00152_three_layer_catalog.sql:52`; `migrations/00351_fulfillment_events_config.sql:104` |
| `products.published_at` exists but is unset in the seed (B's NEW THIS WEEK has no data today) | confirmed | `migrations/00060_product_catalog_columns.sql:18`; `seed/products.sql` — 0 occurrences |
| `profiles` SELECT is `USING (true)` (B's `last_seen_at` exposure) | confirmed | `migrations/00013_rls_policies.sql:56-58` |
| Push authorization gate flips a `UserDefaults` key exactly once per install | confirmed | `Services/API/PushTokenService.swift:90-108` |
| Option B contract: "exactly one prioritized next move, one real editorial or taste story, and one active room"; memory "off by default … explicit customer opt-in" | confirmed | `apps/mobile/Patina/OPTION_B_ACCEPTANCE.md:28-38` |

Two minor path errors in Direction B's slice list, noted and not scored: `BadgeCountService` lives at
`Services/Badges/`, not `Core/Services/`, and the API clients at `Core/Network/`, not `Core/Networking/`.

**Not verifiable in this program, for either direction:** anything on a device. Apple Pay inside the hosted
Checkout, the APNs round trip, universal links, and an App Group read from a widget are all device claims;
no device pass was run, and there is no installable TestFlight build (the last expired 2026-08-10). Both
directions say so. Neither should be scored as if it had proved otherwise.
