# Critique of Direction B — "The Record" · feasibility lens

Reviewer: feasibility critic. Method: every named view, RPC, edge function, table, column and
migration in `source/direction-b.md` checked against `main @ 3cd84ecb3`, the delta ledger
(`research/12-backend-reality.md` §12), `research/17-gap-fills.md`, and the verified findings.
Every finding id B cites resolves in `research/31-verified-findings.json`; no refuted finding is
built on; the duplicate clusters (F16=F34, F30=F37, F32=F04, F22=F26, F49=F81=F172) are cited
correctly. What follows is what does **not** hold.

Severity key — **Blocking**: a load-bearing claim is false, or a wave's cost is stated as
something the code cannot do. **Major**: the direction survives but a named delta, file list or
mechanism is wrong and must be rewritten before anyone estimates it. **Minor**: accuracy,
sequencing or disclosure.

---

## Blocking

### BL-1 · §5 "What Walt sees before he pays" (5) + M5a — the payment screen does not calculate shipping or tax

**Problem.** The order sheet prints `Piece $4,200.00` / **"Shipping and tax are calculated on the
next screen."** and defends it as *"honest, because Stripe calculates them"*, then says the receipt
"prints the full total from the webhook's `shipping` jsonb". Stripe calculates neither on this
session, and `shipping` is an address, not a charge. Walt is charged exactly $4,200.00, hands over a
US address, and Patina ships a $4,200 physical good with no freight and no sales tax collected.

**Evidence.** `supabase/functions/create-checkout-session/index.ts` — the direct-order payable
(`:541-556`) sets `lineItemQuantity` × `lineItemUnitAmountCents`, `shippingAddressCollection:
{ allowed_countries: ['US'] }` and nothing else; there is no `automatic_tax` and no
`shipping_options` anywhere in the function (grep: one hit for "tax", the comment at `:973` —
*"exactly balance + fee (no tax/shipping on this session config)"*). `00276_direct_orders.sql:41-63`
snapshots `unit_price_cents / amount_cents` only; `shipping jsonb` is the Stripe
`shipping_details` address stamped on settle (`research/12-backend-reality.md` §5).

**Why it is blocking, not major.** This is the single most-read line in the direction's most
scrutinised screen, it is the line the direction offers as proof of its own honesty doctrine, and
behind it sits a real tax-liability exposure on the first dollar Patina takes from a homeowner. It
also propagates: M8's `$4,200.00 · paid Sep 3` is then the whole price of a delivered piece.

**Fix I would accept.** Either (a) price the money completion into W4 as an explicit backend delta —
`automatic_tax` (Stripe Tax + the registrations that implies, which is a Kody ruling, not an
engineering task) plus a freight quote as `shipping_options` on the direct-order payable — and keep
the copy; or (b) keep the rail as built and print what it does: one line, one price, and a
seller-of-record line that states shipping and tax are billed separately, which no one will accept —
which is the argument for (a). What must not ship is the current pairing of a true-sounding sentence
with a session that adds nothing.

### BL-2 · §5 order state machine · B-5 · W4 — "reuse `fulfillment-notify`'s vocabulary and templates verbatim against `direct_orders`" is not possible, and the delta is not the smallest compliant one

**Problem.** B adds nine columns to `direct_orders` (`designer_id`, `project_id`,
`commission_rate`, `fulfillment_status`, `shipped_at`, `delivered_at`, `tracking_number`, `carrier`,
`eta_date`), a second attribution model, a second notification path, and an "ops write path" priced
as a phrase — next to an existing, complete client-truth order rail that already has all of it.

**Evidence.**
- `supabase/functions/fulfillment-notify/core.ts:101` reads `.from('fulfillment_orders')` and `:212`
  writes `fulfillment_client_notifications`. It cannot be pointed at `direct_orders` "verbatim";
  reuse means generalising the function, which is a rewrite of the one piece B priced at zero.
- `00350_fulfillment_core.sql:68-89` — `public.fulfillment_orders` already carries
  `designer_profile_id`, `designer_attribution jsonb`, `designer_client_id`, `ship_to jsonb`,
  `product_subtotal_cents`, `freight_charged_cents`, `tax_cents`, `stripe_payment_intent_id UNIQUE`;
  `:92-98` — `fulfillment_order_items` is the line-level state machine (status derived, exception
  overlay), i.e. the machine B is re-deriving as a text column with a CHECK.
- `supabase/functions/fulfillment-intake/core.ts:33-58` — a **generic** normaliser: it reads a Stripe
  PaymentIntent's metadata (`lines`, `designer_profile_id`, `designer_attribution`, `ship_to`,
  totals) into `fulfillment_intake_order`, idempotent per PI, cron-driven every minute (00354).
  `create-checkout-session` already stamps `metadata` on **both** the session and the
  `payment_intent_data` (`:44-45` of the header contract), and the direct-order metadata is
  `{ payable_type: 'direct_order', direct_order_id }`.
- The ops surface B prices as a phrase exists: `apps/admin-portal/src/app/api/admin/fulfillment/
  shipments/[shipmentId]/{eta,pod,deliver}/route.ts`, plus vendors and config routes.
- F198 ("Shipping push exists but never reaches a client order") is a finding about a rail that
  works, aimed at the wrong table — not a reason to build a second rail.

**Fix I would accept.** Either (a) route a settled direct order into the rail that exists — widen the
direct-order loader's `payment_intent_data.metadata` with `lines` / `designer_*` / `ship_to` /
totals, enqueue a `fulfillment_intake` task on settle, and keep only `designer_id`, `project_id`,
`commission_rate` on `direct_orders` — which buys the state machine, the client templates, the push,
the damage/claims evidence path and the admin UI for one metadata change and one enqueue; or (b) keep
the parallel design and say plainly in B-5 that `fulfillment-notify` must be generalised, name the
second ops surface as designer/admin-portal work with a wave and an owner, and argue why two order
tables is the right answer. Silence on (a) is the problem — a feasibility judge reading W4's
"1 migration; 1 webhook branch; 1 apns-send call site; ops write path" is being under-quoted.

---

## Major

### MA-1 · §9 first slice — the file list is short by two files and one of the two "no new network calls" claims is wrong in an instructive way

**Problem.** B says the record "composes dated rows from data the home already fetches on appear:
`StudioQueueBuilder`'s items and their dates…", and that "W1 adds no network calls".

**Evidence.** Half right, and the half that is right is better than B says: `DailyRoomView.swift:60-78`
runs `BadgeCountService.refresh()` on appear, and that refresh (`BadgeCountService.swift:80-86`)
fetches **all five** collections — `DecisionsAPIClient.listPending`, `listThreadSummaries`,
`listProposals`, `listInvoices`, `listProjects` — concurrently. The rows are then thrown away down to
five `Int`s (`:88-105`). `StudioQueueBuilder` is not fed by the home at all; its only caller is
`StudioHubViewModel.swift:80`. So W1 needs `BadgeCountService` to retain the arrays (a change to a
shared `@Observable` singleton the Studio rail, the Companion and Today all read) — a file the slice
does not list — or a second fetch, which contradicts the perf claim.

Second omission: `StudioQueueBuilder` **rolls up**. `payableInvoiceRow` / `pendingDecisionRow` /
`pendingProposalRow` (`StudioQueueBuilder.swift:82-140`) each emit **one** row per kind with a count
label. M1 draws two separate decision rows with separate dates ("the rug colour" Aug 22, "the dining
chairs" Aug 24). That is a per-item flattening plus per-kind copy generation, not "expose the dates
it already computes".

**Fix I would accept.** Add `Core/.../BadgeCountService.swift` (retain rows) and a per-item
`StudioQueueRow` variant to the slice's file list, and restate the perf claim as "no *new* network
calls — the home already fetches these five collections and discards them", which is a stronger
sentence than the one B wrote.

### MA-2 · §1/§2/M1 — the record's copy needs a designer name the app cannot fetch for decisions or proposals

**Problem.** Every record row in the mock is attributed — *"Leah asked about the rug colour."*,
*"Leah sent a proposal to review."* — and §6.2 makes attribution the direction's rule. Today the
designer is named in exactly one place, and it is the one B's own §6 opens with (F09, under a bill).

**Evidence.** `InvoicesAPIClient.swift:194` embeds
`designer:profiles!invoices_designer_id_fkey(id,full_name,business_name)` — invoices only.
`DecisionsAPIClient.swift:56-82` (`RemoteClientDecision`) carries `project:projects(name)` and no
designer. `ProposalsAPIClient.swift:41` has `designer_id` and no embed.
`ProjectsAPIClient.swift:15-30` has `designer_id`, no name. At engaged tier the name exists
(`DesignRequestStatusService.promotedRequest.designerName/studioName`, the surface SP-07 unlocks) —
at activeProject with no invoice, it does not.

Good news the direction can use: `00013_profiles_table.sql:57-58` — profiles SELECT is
`USING (true)`, so the embed is legal on every one of these queries.

**Fix I would accept.** Name the widening in the slice: one `designer:profiles!…` embed on the
decisions, proposals and projects clients, and one fallback string for the row when no designer
resolves (`RemoteInvoiceDesignerRef.displayName` already ships `"your designer"` —
`InvoicesAPIClient.swift:34-39` — reuse it rather than inventing a second fallback).

### MA-3 · §7 — F99 and F101 are claimed as answered, and the proposed data source cannot reach the rooms they are about

**Problem.** "F99, F101, F123 → The house is the client's rooms with real numbers." F99/F101 are
about Ruth's *project* rooms — "dining room + primary bedroom, per my own invoice's note" — which
live on the designer's side. B's data source (§3, M1 screen sheet) is local `RoomModel` + a new
`rooms.budget_cents`. Ruth's dining room appears in neither. The mock is honest about this (the room
rail is marked *(example copy — the local seed has zero rooms)*) — but then the findings table should
not claim the finding.

**Evidence.** `00066_proposal_project_flow_v2.sql:219-236` — `project_rooms` already carries `name`,
`room_type`, `dimensions`, `floor_area_sqft`, **`budget_cents`, `committed_cents`, `actual_cents`**
and a `room_id` FK to `rooms`. That is B's "Your house" block, already modelled, with a true spend
numerator. Its RLS is designer/studio-scoped (`00316_studio_shared_workspace_rls.sql:148`,
`00066` "Designers manage their project rooms") — the client cannot read it.

**Fix I would accept.** Add one delta to W3: a client-scoped SELECT policy (or a read-only RPC) over
`project_rooms` for `projects.client_id = auth.uid()`, and source the activeProject room rail from it.
That answers F99/F101 for real, gives the rail true numbers, and removes the need for MA-4's new
column on the project side.

### MA-4 · §3 / W3 — `rooms.budget_cents` is a column the client's rooms never reach

**Problem.** The room budget — the number under every room card in M1, M2 and M4 — is proposed as one
server column. The client app's rooms are local-first and frequently have no server row at all.

**Evidence.** `RoomStore.swift:102-178` — rooms are SwiftData rows created immediately, "independent
of network"; `remoteId` is set only on a successful sync (`:160`), and `RoomCreationCoordinator.swift`
exists specifically for "the offline / signed-out path". The walk confirms it on a **signed-in**
client: shot `c-23-your-spaces.png` shows the account's only room badged **"SAVED ON THIS PHONE"**
alongside stats `0 ITEMS / — BUDGET / — MATCH` (`research/01-shot-ledger.md:149`). Guests, by C9,
never have a server row.

**Fix I would accept.** State the storage rule: budget is written to the local `RoomModel` first and
mirrored to `rooms.budget_cents` when (if) the room syncs — the same shape SP-14 uses for saves — or
make room sync a precondition of the budget act and say so on screen. As written, Maya (discovering,
one typed room, the persona the block is designed for) is the most likely person to lose it.

### MA-5 · §2 / M1 / M4 — "$2,400 of $9,000" is a saved-piece sum printed against a budget

**Problem.** The numerator is the sum of the pieces the person **saved** into the room; the
denominator is money they intend to **spend**. Saving is not buying. §10 forbids "a completeness meter
without a true denominator" — this is the inverse and the same sin: a true denominator with a false
numerator, on the screen the direction points at as "real progress".

**Evidence.** The room's pieces are `SavedItem` / `TableItemModel` rows (`RoomStore.addItem`,
`SP-14`); nothing in the client marks a saved piece as purchased. `project_rooms.committed_cents` /
`actual_cents` (00066:228-230) is where real spend lives, on the designer's side.

**Fix I would accept.** Either label it (`$2,400 in saved pieces · budget $9,000`) or, where a project
exists, source it from `project_rooms.committed_cents` per MA-3. Do not print a spend figure the app
cannot support.

### MA-6 · §4 / M6 — the widget cannot refresh "on push receipt"

**Problem.** "Data via App Group + a `WidgetKit` timeline refreshed on app foreground **and on push
receipt**." A delivered alert does not run app code. Nothing writes the App Group snapshot until the
person opens the app — so the widget shows the last foreground state, which for the two-weeks-away
case is exactly the staleness the widget exists to cure.

**Evidence.** `supabase/functions/apns-send/core.ts:61-73` (`buildApnsPayload`) emits
`aps: { alert, sound }` plus three custom keys and **no `content-available`**.
`apps/mobile/Patina/Patina/Info.plist` declares five usage strings and `CFBundleURLTypes` and **no
`UIBackgroundModes`**. `Patina/Patina.entitlements` carries only `aps-environment` and
`com.apple.developer.applesignin` — no App Group.

**Fix I would accept.** Either add `content-available: 1` plus the `remote-notification` background
mode and name both as deltas (the payload change touches all five existing apns-send callers, so it
is not free), or drop the phrase and refresh on foreground + a WidgetKit timeline policy, and say
plainly that the widget can be up to one open behind.

### MA-7 · B-1 / B-2 / M1 — the drawn bar cannot be a `TabView`, and W2's cost list omits the navigation refactor

**Problem.** W2 is priced as "a `TabView` root in `ContentView.swift`, four route hosts, retiring
`CompanionSafeArea`'s 120 pt inset, re-anchoring the first-launch tour, and a Dynamic-Type pass".
Two things are missing. First, M1 draws a **five**-slot bar whose fifth slot is the Strata mark that
expands a sheet — SwiftUI's `TabView` has no non-tab slot, so this is a hand-rolled bar, which
forfeits exactly the system behaviours (tab VoiceOver semantics, Dynamic Type layout, the iOS 26 bar
treatments) that a "Dynamic-Type pass on the bar" is meant to buy. Second, the app's navigation is one
global path.

**Evidence.** `ContentView.swift:143-160` — a single `NavigationStack` bound to
`coordinator.navigationPath`, root `DailyRoomView`, one `navigationDestination(for: AppRoute.self)`.
`Coordinator.swift:51-144` — `AppRoute` with 30+ cases; **105** `navigate(to:)` call sites across the
app. Four tabs means four paths, a route→tab mapping for every one of those call sites, deep-link and
push routing that decides a tab (`DeepLinkHandler`, `NotificationRouter`), plus B's own promise that
"the present `DailyRoomView` + orb root stays mounted on the off branch for one release" — i.e. every
route host maintained in two navigation shapes simultaneously.

**Fix I would accept.** Say which bar it is (system `TabView` → the Companion moves out of the bar;
custom bar → own the accessibility work explicitly), and price W2 as the navigation refactor it is:
route→tab table, per-tab paths, deep-link/push tab entry, dual-root maintenance. It may still be one
wave; it is not the five bullets currently listed.

### MA-8 · W6 — "Live Activity … backend delta: none" is false

**Problem.** A delivery-window Live Activity that updates remotely needs a different push type and a
different token store than the one the app has.

**Evidence.** ActivityKit remote updates address a **per-activity** push token with the
`liveactivity` push type and the `<bundle>.push-type.liveactivity` topic. `apns-send` resolves tokens
from `device_push_tokens` (`core.ts` `resolveTokens`, `00335_device_push_tokens.sql:22-30`) and sends
one alert shape to `APNS_TOPIC`; there is no activity-token table and no push-type branch.

**Fix I would accept.** Name the delta (an activity-token table + a push-type branch in `apns-send`),
or scope W6's activity as start-and-update-in-foreground only and say the window goes stale when the
app is closed.

### MA-9 · §5 / B-5 — the earnings credit's once-only key does not exist, and the right key is already in the schema

**Problem.** "the earnings credit fires once, from the webhook, keyed on the Stripe event id."
`designer_earnings` has no Stripe-event column.

**Evidence.** `00014_portal_business_features.sql:299-324` — the table has `source_type`
(`'product_commission'` is already in its comment), `commission_rate`, and **`order_id UUID`** with
the comment *"Future: when orders table exists"* (`:307`). The invoice path's guard is
`ON CONFLICT (invoice_payment_id) WHERE invoice_payment_id IS NOT NULL`
(`00277_refund_reconciliation.sql:207-208`) — a partial unique index, not an event id.

**Fix I would accept.** Key on `order_id` with a matching partial unique index, added in B-5's
migration, and say so. (This makes B's case stronger, not weaker: the attribution slot B is asking
for was reserved in 2026 by the same schema.)

### MA-10 · §4 push table + §9 W1 — three call sites, three different runtimes, and one cited location is the wrong file

**Problem.** "each event is **one** `invoke_edge_function('apns-send', …)` call site on the pattern
`00330`/`00331`/`00334` already prove", and "Decision raised | 1 call site on the decision trigger
(`00092`)".

**Evidence.** `proposal-send`, `invoice-send` and `invoice-reminders` are **Deno edge functions**
(`supabase/functions/…`), so their push is an HTTP POST to `apns-send` in the
`fulfillment-notify/index.ts:42` shape, not a SQL `invoke_edge_function`. And
`00092_decision_cron.sql:13-30` is a **pg_cron schedule** (`decision-reminders-daily`,
`expire-decisions-daily`) — not a trigger, and nothing anywhere fires on decision *creation*: the
triggers on `client_decisions` are the recommended-option sync (00089), the status guard and status
event (00171), and the field-dispatch court assignment (00284). "Decision raised" needs a new
`AFTER INSERT` SECURITY DEFINER trigger in the `00289_design_request_client_status_notifications.sql`
shape (that file exists precisely because a portal designer's authenticated write cannot satisfy
`notification_log`'s insert policy).

Also unstated: `apns-send` takes an optional `notification_log_id` and updates that row's
status/provider id (`apns-send/index.ts:9-10, 22-24`). Without one, the push lands but the in-app row
and the delivery status do not — which is half of F08.

**Fix I would accept.** Restate the three call sites with their real hosts (two edge-function HTTP
calls, one new SQL trigger), add the trigger to W1's delta line, and say each call site writes/passes
a `notification_log_id`.

---

## Minor

- **MI-1 · §7.** F43 appears both in the answered table ("A four-destination tab bar") and in
  "Left open on purpose" ("true catalog search … F43 stays open, named"), and B-1's *Why* cites it
  too. Pick the second; a door is not a search.
- **MI-2 · M3 screen sheet.** "Data: `get_recommendations` widened (SP-10 + `description`)" is wrong
  for this screen, in B's favour: the piece detail reads the table directly —
  `/rest/v1/products?id=eq.<id>&select=*,vendors(name,made_in,brand_story)`
  (`ProductAPIClient.swift:91-105`) — so `description`, `patina_managed`, `dimensions` and
  `lead_time_weeks` are already reachable there with no RPC change at all. (That `select=*,vendors(…)`
  is the PGRST201 two-FK bug SP-01 owns.) Correct the row and take the win.
- **MI-3 · §5 point 2.** "Add `description` to SP-10's already-planned RPC widening — one word in a
  projection." `get_recommendations` is a documented **frozen** contract: `00246_aesthete_quiz_bridge.sql`
  headers it "FROZEN signature AND RETURNS TABLE (byte-compatible with 00067)", and Postgres cannot
  change a `RETURNS TABLE` with `CREATE OR REPLACE` — it is DROP + CREATE with both GRANTs
  (`authenticated`, `anon`) re-applied and every caller re-verified. SP-10 says this and sizes it L.
  Say "one more column on a DROP/recreate we are already paying for".
- **MI-4 · §2/§9 — `published_at` is not in the RPC and is not populated.** The guest/discovering
  hero block "New this week" filters on `products.published_at`. The column exists
  (`00060_product_catalog_columns.sql:18`) but `get_recommendations`' 14-column RETURNS TABLE does not
  include it (00246), SP-10's widening list is `dimensions / lead_time_weeks / brand / source_url` —
  not `published_at` — and the only writer found is the admin publish route
  (`apps/designer-portal/src/app/api/admin/catalog/products/[id]/publish/route.ts:23`); the local seed's
  INSERT column list omits it entirely (`supabase/seed/products.sql:4-6`). So today the block renders
  empty forever, and M2 draws three named seed pieces under `NEW THIS WEEK` **without** an
  *(example copy)* label, against §11's honesty rule. Add `published_at` to the widening list, name the
  publishing cadence as an editorial dependency, and label or empty the mock rail.
- **MI-5 · §9 first slice.** "Backend, in parallel: three … call sites **and the pre-permission screen
  with the four-event copy**". The primer is iOS work (a view plus a `UNUserNotificationCenter` flow).
  Move it into the iOS list, where it adds files to a slice already at six.
- **MI-6 · §9 rollback.** `PostHogService.isFeatureEnabled` (`:146-153`) reads the SDK's local cache,
  which on a cold first launch is empty and fail-closed (C16) — so `house-first` renders the
  pre-amendment root and can flip to the tab bar mid-session when flags land. Say how the root is
  gated (evaluate once at launch and hold, or accept the flip).
- **MI-7 · W5 "backend delta: none".** True for the server, but the client is not entitlement-free:
  universal links need `com.apple.developer.associated-domains`, which `Patina.entitlements` does not
  carry today (only `aps-environment` and `com.apple.developer.applesignin`), and the widget needs an
  App Group plus its own bundle id and profile under ASC app `6762007888`. SP-03 names the first;
  B should not imply the wave is capability-free.
- **MI-8 · M5b/M5c.** The direct-order Checkout returns to
  `${CLIENT_PORTAL_URL}/orders?order=<id>&checkout=success`
  (`create-checkout-session/index.ts:554`). That page exists
  (`apps/client-portal/src/app/orders/page.tsx`) but it is a **web** page, likely behind a web sign-in,
  rendered inside `SFSafariViewController` before the person dismisses. The mock never says what Walt
  sees between paying and `Order placed.` Name it.
- **MI-9 · M5 states.** The direct-order session also offers `us_bank_account`
  (`create-checkout-session` header `:43`), so ACH is a live rail on a $4,200 order and the
  "3–5 business days" state is genuinely reachable. B handles the *timeout* copy well (F157); add the
  ACH-chosen state to the sheet so the honest case is drawn, not only the dishonest one removed.
- **MI-10 · §9 device-only list.** Good as far as it goes (Apple Pay, the APNs round trip, universal
  links). Add: the widget/App Group, and that `device_push_tokens.environment` is captured per token —
  today's signing yields `sandbox` tokens until a true distribution archive ships
  (`00335_device_push_tokens.sql:8-12`), which compounds the "no current installable TestFlight build"
  B already flags.
- **MI-11 · §5 path table.** Path A's gate is `create_direct_order`'s buyability check
  (`patina_managed` **or** catalog-vendor-sold, positive price); F151's live count is 19 of 21 local
  rows. M3 gives a no-price state (path C) but no state for a piece that fails the *seller* gate. Add
  the third case.
- **MI-12 · §6.1 designer seat.** The seat's data source is unnamed. At engaged it is
  `DesignRequestStatusService.promotedRequest` (`designerName` / `studioName` — the surface SP-07
  unlocks with one filter); at activeProject with no invoice there is no designer name in the client
  at all (MA-2). Also worth one sentence: the seat does **not** replace SP-07's filter — the tier only
  promotes when that filter is dropped, and a seat mounted at a tier nobody reaches shows nothing.

**Checked and clean** (raised so the judge does not have to re-check): Apple compliance under C15 —
physical goods, external Stripe Checkout in `SFSafariViewController`, no IAP, no digital good; Sign in
with Apple already ships and is entitled (`Patina.entitlements`,
`Features/Authentication/Views/SignInWithAppleButton.swift`) so the Google button (F108/F117) carries
no 4.8 exposure; C13 — every delta is a migration, an edge function, a webhook branch or an RPC, and
`services/orders` stays dormant, correctly; C25 — Apple Pay inside hosted Checkout in SFSafariViewController
is drawn as a device probe, not a build; `create_direct_order`, `create-checkout-session`'s
`direct_order_id` branch, the `stripe-webhook` settle branch, `direct_orders`' client-SELECT-own RLS,
`rpc_start_project_thread`, `apns-send` + `device_push_tokens`, `NotificationRouter`'s unused
`proposal`/`invoice`/`decision`/`thread` routes, `DeepLinkHandler`'s `room`/`piece`-only hosts, the
three-target/no-extension project, the 120 pt Hearth arithmetic, and every quoted seed string
(`00143_editorial_stories.sql:167`, `supabase/seed/products.sql:6`,
`_shared/fulfillment-templates.ts:31-37`) verify exactly as written.

---

## What is genuinely good — the author must keep it

1. **The thesis is sourced, not invented.** *"Patina is not a finish. It is a record."* is verbatim
   the app's own seeded editorial (`00143_editorial_stories.sql:167`), in an article the walk found
   unreachable twice. A direction that names itself out of the product's own copy is doing the job.
2. **The honesty table in §2** — six sources of novelty, each marked yes/no with the reason, and the
   date string marked **no** with F13 next to it. This is the single best artifact in either
   direction; it is the thing a judge can hold the built product against in six months.
3. **B-2's diagnosis is code-exact.** The Hearth is `64 + 36 + 20 = 120` inserted as a bottom
   `safeAreaInset` carrying an opaque `PatinaColors.Background.primary` band
   (`CompanionSafeArea.swift:13-50`), and `OPTION_B_ACCEPTANCE.md:15-16` says in its own words
   *"The Hearth is reserved layout space, not a persistent visible bar. App content does not render
   beneath the active Companion shape."* Arguing that the shipped implementation contradicts the
   contract it documents — rather than asking to amend the contract — is the right move and should
   survive any judge who dislikes the tab bar.
4. **The amendments are declared, argued, and individually rollable.** Seven amendments, each with
   findings, cost and a named flag; the orphaned July rail explicitly **not** re-mounted rather than
   smuggled back in under C2. The C2-vs-C23 conflict is named, not dodged.
5. **The purchase rule.** "The designer on the job owns the piece", with `Ask Leah to source this`
   primary and `Buy it myself` retained underneath plus the attribution line — this is the only
   proposal in the program that answers D1 and D3 without blocking Walt, and the columns it needs are
   additive and nullable. Keep it exactly; only its *plumbing* (BL-2, MA-9) needs rewriting.
6. **§10 is the strongest exclusion list in the program.** No cart, no Wallet pass ("an invoice is not
   a boarding pass"), no SMS to clients, no social proof over a population that does not exist, no
   activity row for the reader's own actions ("if you did it, it is state, not news"), no permission
   ask at cold launch, no Live Activity until `shipped` is real. Every one of these is a real
   temptation the direction refused in public.
7. **Empty states are specified everywhere**, and they are truthful: "Nothing moved since Thursday.",
   "Nothing needs you right now." followed by the last thing that moved, `NEW THIS WEEK` absent rather
   than placeholdered, no budget → a ghost act rather than a `—`. The screen sheets carry loading,
   empty and error for every mock — the reviewers can hold the build to them.
8. **W1 is a real slice.** It is additive above an existing card, it composes from collections the
   home already fetches, it needs none of the seven amendments, and it is removable by deleting one
   mount. Even with MA-1's two missing files it is a fortnight's honest work, and it answers the
   program's four S0 findings (F13, F30, F16, F11-adjacent) before any architecture moves. That
   sequencing — the cheapest, most reversible thing first, the navigation argument second — is right.
9. **The risk section does not flatter itself**: it names SP-20's account deletion (5.1.1(v)) as the
   real Apple exposure rather than claiming a clean bill, states that there is no current installable
   TestFlight build, and lists Apple Pay / APNs / universal links as device claims this program cannot
   make. Keep that register when you fix BL-1 and BL-2.
