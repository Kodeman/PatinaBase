# Critique — Direction A "Since You Were Here" · feasibility lens

**Reviewed:** `source/direction-a.md` (693 lines) against `main` `3cd84ecb3`, `research/12-backend-reality.md` §12,
`research/17-gap-fills.md`, `apps/mobile/Patina/OPTION_B_ACCEPTANCE.md`, and the migration/edge-function tree.
Every claim below was checked in the code; file:line is the evidence, not a citation of the direction's own text.

**Headline.** A is the more disciplined of the two documents on canon and on refusals, and most of its
*client-side* claims survive contact with the code. Three things do not: the first slice cannot compute the
two of three flagship moments it is sold on (discovering + guest), the purchase mock charges a total the rail
cannot take, and the wave-2/3 backend ledger re-implements a fulfillment rail that already shipped with
attribution, freight, tax, damage claims **and** the push caller A wants to borrow vocabulary from.

**Verified correct, so the author does not re-litigate them:** `direct_orders` + `create_direct_order` +
`create-checkout-session{direct_order_id}` + `stripe-webhook` settle + receipt email all exist
(`00276_direct_orders.sql`, `create-checkout-session/index.ts:1202,553`, `stripe-webhook/index.ts:576,1181,1242`);
`apns-send` has exactly the five callers named and none touches money (`00330:182`, `00331:342`, `00334:120`,
`fulfillment-notify/index.ts:42`, `site-request-dispatch/index.ts:225`); `NotificationRouter` already routes
proposal/invoice/decision (`NotificationRouter.swift:60-88`); the permission prompt really does fire once, after a
design request (`PushTokenService.swift:91-108`); the project declares exactly three targets and no extension
(`project.pbxproj:177,200,223`); the invoice poll is 3s/60s (`InvoicesViewModel.swift:81-82`); the story dot is
hard-coded `true` (`DailyStory.swift:45`); `PatinaSheetHeader` has zero product call sites (only its own
`#Preview`); the home already refreshes `BadgeCountService` on `.task` and on `scenePhase → .active`
(`DailyRoomView.swift:73-76,88-95`), so the attention half of the since-line adds no network call; the two
fourteen-day decays are real (`DesignRequestStatusService.swift:352`, `CompanionCoachingModelTests.swift:123-150`);
the lead filter that hides the matched designer is real (`DesignRequestStatusService.swift:738`,
`client_request_id=not.is.null`); and all 67 finding ids A cites resolve to `verified` rows in
`31-verified-findings.json`, with none drawn from the refuted set.

---

## BLOCKING

### B1 · §1 "The day", §2 (guest/discovering row), §9 first slice, M2 — the since-line has no data source for two of the three moments it is sold on

**Problem.** A's slice says: *"Everything here is client-side except one function, and none of it needs the SP-10
migration"*, and item 1 builds the line *"over counts the home already fetches on appear."* That is true for the
**activeProject** line ("Leah sent a proposal, and your invoice came due"). It is false for the two moments the
thesis leads with:

- **Walt 7:40am** — *"A new story, and two new pieces."* The "two new pieces" half needs catalog recency.
- **Maya 9:10pm** — *"Three new pieces for the Living Room."* and the Next Move *"New this week, chosen for
  this room."*

**Evidence.**
- `get_recommendations` — the only feed the app reads — projects 15 columns and **neither `created_at` nor
  `published_at`** (`supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300`). Its own comment calls the
  signature a *"FROZEN iOS contract"* (`:302`), i.e. widening it is exactly the DROP/recreate A says the slice
  does not need.
- `BadgeCountService` fetches decisions, thread summaries, proposals, invoices, projects — no catalog at all
  (`BadgeCountService.swift:85-96`). "The counts the home already fetches" contains no product recency.
- A **direct** `products` read is possible (catalog rows are readable by `anon` and `authenticated`,
  `00152_three_layer_catalog.sql:291-299`, and `ProductAPIClient.swift:99` already issues one), but it is
  **unscoped** — it can count new rows, not new rows *"chosen for this room"*, because room/taste scoping lives
  in `get_aesthete_matches`. And it is a **new network call on the home**, which contradicts A's own risk line
  *"Nothing here adds a network call to the home."*
- The grounding already flagged this: `12-backend-reality.md` §12, row "New since last visit" — *"Not directly
  assessed this pass … Needs its own investigation before scoping — flag as open, don't assume either way."*
  A assumed.

**Why blocking.** The slice as written delivers Ruth's 12:30pm screen and (with SP-07) James's engaged screen.
It delivers neither Walt's 7:40am reward nor Maya's 9:10pm screen — and M2 is one of the six required mocks.
A slice that ships only the activeProject tier is a slice of one tier, not a slice of the thesis, and the deck
would claim otherwise.

**Fix I would accept.** Split the line honestly. Wave 1 = the **attention** half only (proposals, decisions,
invoices, threads, design-request stage) — all already fetched as full rows, no migration, no new call. Move the
**catalog** half to wave 2 and add `created_at` to the SP-10 DROP/recreate A is already riding (one more column
on a migration already being written, which is genuinely cheap). Re-cast 7:40am and 9:10pm in §1 as
story-and-room moments for the first slice, and say so.

---

### B2 · §5 "What Walt sees before he pays", M5a — the order sheet prints a total the rail cannot charge

**Problem.** M5a's money block reads `Piece $4,200.00` · `White-glove delivery $350.00` · `Sales tax calculated
at checkout` · `Total today $4,550.00 + tax`. Nothing in the delta ledger makes any of that true.

**Evidence.**
- `create_direct_order` writes `amount_cents := price_retail * qty` — no freight, no tax
  (`00276_direct_orders.sql:176-183`).
- `create-checkout-session`'s direct-order branch bills exactly `order.amount_cents` with
  `shippingAddressCollection` only — **no `shipping_options`, no `automatic_tax` anywhere in the file**
  (`create-checkout-session/index.ts:541-553`; grep for `automatic_tax` returns nothing).
- A's own delta table lists only `products.shipping_flat_cents` / `returns_policy_key` and a designer
  snapshot inside `create_direct_order`. A column on `products` does not move money.

Result as specified: the sheet says $4,550 + tax, Stripe collects $4,200. That is a money bug on a $4k purchase
and it is printed on the direction's flagship purchase mock.

**Fix I would accept.** Either (a) name the real deltas — freight into `amount_cents` (a signature/behaviour
change to the RPC), a Checkout `shipping_options` line or a second line item, and `automatic_tax: {enabled:true}`
with the tax registration decision that implies — or (b) cut the shipping and tax lines from the sheet and print
`Shipping and tax are shown at checkout.` above the button. (b) is one copy change and is compatible with the
rail as it stands today.

---

### B3 · §5 order state machine + §9 backend deltas — nine new columns re-implement a shipped rail, and the sheet promises a claims process only that rail has

**Problem.** A adds to `direct_orders`: `designer_id`, `project_id`, `commission_rate`, `fulfillment_status`
(CHECK over five values), `shipped_at`, `delivered_at`, `tracking_number`, `carrier`, `eta_date` — plus a new ops
write path — and says it is *"adopting `fulfillment-notify`'s vocabulary verbatim … so one push template set
serves both rails."* The vocabulary is copyable; the *function* is not: `fulfillment-notify` takes
`{action:'draft', order_id, transition}` where `order_id` is a **`fulfillment_orders`** id
(`fulfillment-notify/index.ts:10,89`). So wave 3 is a second, parallel fulfillment rail with its own ops surface,
not a reuse.

**Evidence that the smaller delta exists.** `public.fulfillment_orders` (00350, Rail A, "Patina merchant of
record" — `docs/design/back-of-house/back-of-house-spec-v1.md:23`) already carries, in one row
(`00350_fulfillment_core.sql:68-89`):

| A proposes to add to `direct_orders` | Already on `fulfillment_orders` |
|---|---|
| `designer_id`, `project_id`, `commission_rate` | `designer_profile_id`, `designer_client_id`, `designer_attribution` jsonb |
| shipping figure + tax + total (B2) | `product_subtotal_cents`, `freight_charged_cents`, `tax_cents`, `captured_total_cents` |
| `fulfillment_status` CHECK five states | line-level state machine on `fulfillment_order_items` (`:104`), status **derived** (`:89`) |
| `shipped_at`, `delivered_at`, `tracking_number`, `carrier`, `eta_date` | `fulfillment_shipments` (`:163` — parcel/ltl/white_glove) |
| — (A has none) | `fulfillment_exceptions` type `'damage'` with `evidence_r2_keys`, claims window (`:186-200`) |
| a new ops write path | the BOH admin surface that already writes all of the above |
| shipping push "in wave 3" | `fulfillment-notify` → `apns-send`, already wired (`fulfillment-notify/index.ts:42`) |

And the bridge already exists: `fulfillment-intake` turns a **Stripe PaymentIntent** into that whole row —
client, designer attribution, ship_to, subtotal/freight/tax/total, lines — idempotently, from one `agent_tasks`
row of type `fulfillment_intake` (`fulfillment-intake/core.ts:33-57,72-95`; `index.ts:1-11`).

So the smallest compliant delta for A's entire wave-2/3 order story is: **populate the direct-order Checkout
session's metadata to the intake contract, and `enqueue_agent_task('fulfillment_intake', {payment_intent_id})`
from `stripe-webhook`'s existing direct-order settle branch** (`stripe-webhook/index.ts:1181`). Zero new columns.
It inherits tracking, shipments, exceptions, the derived status, the ops UI, and the push.

**The promise this breaks.** M5a's copy: *"If it arrives damaged, Patina handles the claim with Nordic Atelier —
one number, in your receipt."* There is no claims object anywhere in A's design. `fulfillment_exceptions` is the
one that exists, on the rail A declines to use. Printing that sentence over a table with no claim mechanism is
the exact honesty failure A spends §10 refusing.

**Fix I would accept.** Either route settled direct orders into `fulfillment_orders` via `fulfillment-intake`
and delete six of the nine proposed columns, or state in §5 why a client-selected order is *not* a Rail-A order
(both are Patina merchant-of-record) and say plainly that wave 3 builds a second ops surface and a second claims
process — and cost it. Until one of those, the damage sentence comes off the sheet.

---

### B4 · §3 investment table, M2, M4 — the room fill line's denominator is a number no user can have chosen

**Problem.** `$3,590 of your $9,000`, sourced in M2's screen sheet to *"`StylePreferenceModel.budgetRange` — **the
person's own answer, never a figure we chose**"*, and labelled in M4 `YOUR BUDGET · FROM YOUR QUIZ ANSWER`.

**Evidence.** The quiz offers four options and nothing else — `Thoughtful Starter $500 – $2,000 per room`,
`Curated Comfort $2,000 – $5,000 per room`, `Heirloom Investment $5,000+ per room`, `Let's Discuss`
(`QuizModels.swift:103-109`) — mapped to `(500,2000)`, `(2000,5000)`, `(5000,15000)`, `(0,0)`
(`StyleQuizViewModel.swift:239-247`) and persisted as the string `"min-max"` (`:278`). `$9,000` is not producible
from any of them; the top band is open-ended and its `15000` ceiling is an internal stand-in. Deriving a single
denominator from a band **is** choosing a figure — which breaks C5 and A's own §10 (*"No invented figure
anywhere"*), on the line A calls "the ritual".

**Fix I would accept.** Print the band the person actually chose (`$3,590 saved · your range $2,000–$5,000`), or
drop the money half of the fill line and keep the piece count, or — best, and a real product decision worth
making — ask for a room budget once, store it on the room, and label it as the person's number. Any of the
three; not a derived midpoint.

---

## MAJOR

### A1 · §7 findings table — F186, F188, F209 are answered by nothing in A
Row 1 maps `F13, F16 (=F34), F186, F188, F209` to the since-line. F13/F16/F34 are day-to-day and absence findings
and are genuinely answered. F186 *"Says 'Today' but never reads the hour"*, F188 *"'Today' reads the same at
7:40am and 9pm"*, F209 *"'Today' never becomes 'good evening'"* are **hour-of-day** findings. Nothing in A reads
the clock: the header keeps its date, and the since-line is date-granular. §1 stages three times of day, but what
differs between them is tier and what moved, not the hour. **Fix:** drop the three from the table, or add the
one thing that would earn them (a greeting that reads the hour) and price it — it is genuinely a half-day.

### A2 · §1, §9 — "Since you were here" is undefined for the most common case: the second open of the same day
Every example in the direction is a multi-day gap (SATURDAY, THURSDAY, YESTERDAY, TWO WEEKS AGO). Nothing says
what the line reads when the person opened it three hours ago — which for a daily-return app is the modal case.
A naive implementation prints `SINCE YOU WERE HERE · TODAY` / "Nothing new since 9:41am" at every re-open, which
reads as a scold and is precisely the shape §10 refuses. **Fix:** define the rule (suppress the block entirely
below an N-hour gap; keep the last *material* change until it is acted on, not until it is seen), and put it in
the M1 screen-sheet states.

### A3 · §9 first slice — the arithmetic is over two weeks before the hidden dependencies
Item days as listed: 3 + 2 + 3 + 1 + 0.5 + 1 = **10.5 iOS days** (item 7 is the edge/SQL lane, item 8 an hour).
Ten and a half working days is already 2.1 weeks for one engineer, with zero slack, and it excludes: the M8
pre-permission screen, which M8 itself marks *"Components: **new** screen"* while item 6 charges 1 day for
"the permission moment moves"; the Studio route (minor 2); and the engaged-tier identity path (A4). It also
presupposes four planks land in or before the same release for its own screens to be true — SP-07 (M9 says so
outright), SP-08 (item 6's screen and the `notification_log` rows item 7 pushes next to), SP-13 ("Message Leah"
is a dead end at engaged without `rpc_start_project_thread`/`rpc_start_direct_thread` wiring and the
`MessagingAPIClient` create method that plank adds), SP-11/SP-14 (M2's fill line, M4's item list). **Fix:** state
the plank prerequisites as prerequisites, cut to what fits (items 1-attention-half, 2, 4, 5, 7), and move item 3
to wave 2.

### A4 · §6, §9 item 3 — "reuse `StudioIdentityLine`" does not work at the tier A most wants to fix
`StudioIdentityLine` is keyed by **project id** and resolves through `identity(forProject:)`
(`StudioIdentityLine.swift:19,36-39`). An **engaged** client has an accepted lead and no project (C29;
A's own M9 says "no project yet"), yet M7's screen sheet says *"Tier: header only at engaged and above."*
The service does have `identity(forDesigner:)` (`StudioIdentityService.swift:81`), so this is fixable with a
second initializer — but as written the mechanism fails exactly where the engaged tier is currently
byte-identical to guest. Related, in the same paragraph: A says the line *"gets the fallback it lacks so a solo
designer with no brand logo is not invisible."* The **missing-logo** fallback already exists — `AsyncImage`'s
non-success phases all fall through to a monogram (`:45-60`). What is missing is the **nil-identity** case: the
view renders nothing at all when the resolver has no brand (`:15-17,23`). Repair the right defect.

### A5 · §9 risks + gate — the one-per-install permission grant is spent on Simulator evidence
The riskiest irreversible act in wave 1 is the notification ask. The gate is `xcodebuild` + unit tests + a
Simulator pass. APNs delivery to a real device is device-only; `12-backend-reality.md:399-401` records that
**there is no current installable TestFlight build** (the last expired 2026-08-10) — A cites this under Risks
but does not act on it — and the delta ledger's own correction says the open item is *"prove it reaches a real
device in prod (a walk, not a build)."* **Fix:** put a device push probe next to the Apple Pay probe in item 8,
and make the permission-moment move (item 6) depend on it, the way A already makes the ask depend on the sender.

### A6 · §9 rollback — two of the wave-1 acts are not revertible, and the section says they are
*"Every wave-1 item is client-side and independently revertible"* — item 7 is a migration (A does give it a
DROP, so the sentence is just loose). The real gap: *"The only non-revertible step is money that has moved."*
The **notification authorization is a one-way door per install**: `armFirstSubmissionPromptGate()` flips a
`UserDefaults` flag once (`PushTokenService.swift:103-108`), and once iOS has recorded a denial no flag flip in
PostHog brings the prompt back. **Fix:** say so, and add the operational consequence — a bad wave-1 permission
moment is not rolled back, it is *spent*, which is the argument for A5's device gate.

### A7 · §2/§3 — two new remembered keys, and the Option B memory clause is never named, in a document whose banner is "Zero amendments"
`OPTION_B_ACCEPTANCE.md:30-33` (Context and Today contract): *"Memory is privacy-conscious, locally inspectable,
off by default, and only begins after an explicit customer opt-in. It can be disabled or cleared at any time."*
A adds **last-seen** and **last-story-read** and calls them "one `UserDefaults` key each" without touching the
clause. The defence is available — the same contract lists **recency** among the allowed real signals (`:28-29`)
— but A does not make it, and §8 claims *"No canon row is bent."* **Fix:** one paragraph in §3 saying which
bucket these fall into, whether they appear in the memory inspector, and what "clear memory" does to the
since-line (my expectation: it disappears and the next open behaves as a first visit — which is fine, and worth
saying).

### A8 · §5 attribution — no idempotency key, and the columns A wants already exist
`stripe-webhook` is retried by Stripe. The only unique slot on `designer_earnings` is `invoice_payment_id`
(`00277_refund_reconciliation.sql:205-207`); a direct-order settle has none, so a redelivered event writes a
**second commission row** for the same order. Also, `designer_earnings` already carries `order_id UUID` —
commented *"Future: when orders table exists"* — and `commission_rate DECIMAL(5,4)`
(`00014_portal_business_features.sql:307,313`), and `source_type` is plain TEXT whose comment already lists
`'product_commission'` (`:304`), so no CHECK migration is needed. **Fix:** use `order_id` + `commission_rate`,
add a partial unique index on `order_id WHERE order_id IS NOT NULL`, and `ON CONFLICT DO NOTHING` — the shape
00277 already uses for its contra rows.

### A9 · §5 path table — a guest cannot buy, and the flow has no sign-in step
Path A's rule reads *"any tier, when the piece is buyable…"*. `create_direct_order` raises
`'create_direct_order: not authenticated'` on a null `auth.uid()` and EXECUTE is revoked from `anon`
(`00276_direct_orders.sql:143,200-201`). So a guest tapping `Buy it · $4,200` must hit the C9 soft wall first.
M5's states list creating / hand-off failure / poll timeout and no auth state at all. **Fix:** either scope Path A
to signed-in tiers in the table, or add the auth sheet to M5a's entry path and states (C9: presents over context,
never ejects) — and say what happens to the half-built order when the sheet is dismissed.

### A10 · §4/§5 — the paid buyer lands on a web page, not in the app
`create-checkout-session` sets `successUrl` / `cancelUrl` to the **client portal** (`/orders?order=…`,
`create-checkout-session/index.ts:553-554`, `CLIENT_PORTAL_URL` default `https://client.patina.cloud`).
After Apple Pay completes, the buyer is looking at a web page in `SFSafariViewController`; M5c "Order placed" is
only reachable when they dismiss it and the 3s/60s poll lands. A is already buying associated domains in SP-03
for email links and never applies them here. **Fix:** point the success URL at a universal link that opens
`patina://order/<id>` (SP-03 makes this nearly free), or draw the Safari success page in M5 and say the buyer
must tap Done — do not imply the app catches the return.

---

## MINOR

1. **M9's copy cannot be produced by the table it cites as verbatim.** The title `You're matched with Leah
   Hartwell` is `.matched`'s `cardTitle`; the detail *"She has your request in hand — an introduction is on its
   way."* is a paraphrase of `.held`'s `subtitle` (*"{studio} has taken your request in hand — introduction on
   its way."*) — two different stages, and `.matched`'s real subtitle is *"You're working with {designer}."*
   (`DesignRequestStatusService.swift:158-215`). Today the `cardTitle` goes into the **detail** slot and the
   title is the fixed *"See your design request"* (`TodayExperience.swift:80-91`, `DailyRoomView.swift:184-191`).
   M9's *"the card itself is already built"* / *"New vs today: the since-line and the decay re-anchor"* is
   therefore wrong by one title/detail swap. Cheap to fix, but it is a screen sheet claiming verbatim copy.
2. **There is no Studio route.** `AppRoute` has no `.studio`; `StudioHubView()` is embedded inside `ProfileView`
   (`ProfileView.swift:123`) and `.profile.displayName` is `"Profile"` (`Coordinator.swift:130`). A half-names
   this (*"or, better, straight to the Studio once it has its own route"*) — price the route, because "Leah is
   waiting on three things" landing on a screen called Profile is the F126/F134 problem again.
3. **F32 is cited without its merge.** The plank ledger and the program correction both give `F04=F31=F32`;
   A correctly merges F16=F34, F30=F37, F22=F26, then cites F32 bare.
4. **§10 contradicts slice item 4 on the story dot.** §10: *"the hard-coded unread dot … A removes it rather
   than extending it."* Item 4: *"The unread dot earns itself."* Both are defensible together (remove the
   hard-coded `true` at `DailyStory.swift:45`, replace with a stored read) — say it once, that way.
5. **Re-anchoring the Companion graduation to last-seen has a cost A does not name.** Fourteen days of
   *presence* means a once-a-month user never graduates to `.learned` and the `NEXT STEPS` label never decays
   (C8). Consider re-anchoring only the design-request promotion window.
6. **The promotion window needs a ceiling.** Re-anchored to last-seen with no cap, a person absent six months
   returns to a "matched" card presented as current. Add an absolute upper bound and say what replaces it.
7. **"We ask once more, months later" cannot be a second system prompt** if the first was *denied* — iOS shows
   the authorization alert once per install. It can only be an in-app screen with an Open-Settings button.
   M8's states should distinguish "declined our screen" (a real second ask is possible) from "denied the system
   prompt" (Settings only).
8. **The Apple Pay probe is not an hour.** Its preconditions: a signed build on a device (no installable
   TestFlight build exists), a payable invoice in an environment whose Stripe keys are test-mode with a known
   two-account mismatch, and — locally — an edge stack where *every* function returns 503 (C27), which is
   exactly why `create-checkout-session` could not be seen in the walk. Budget a day around the hour, and say
   which environment the probe runs against.
9. **The Apple risk list is missing two true statements and softens a third.** Sign in with Apple already ships
   (`Features/Authentication/Views/SignInWithAppleButton.swift`, `AuthViewModel.swift:326-342`), so 4.8 is
   satisfied — worth stating, since a reviewer of §9 will ask. And *"A sells no digital service in the app, so
   3.1.1 is not opened"* is loose: the app already hands a **design-fee invoice** to the same Safari Checkout
   (C10). That is fine under 3.1.3(d)/(e), but name it rather than claiming there is no service in the app.
10. **`products.commission_rate` already exists** (`00152_three_layer_catalog.sql:52`) — good — but so does a
    platform default on the other rail (`fulfillment_config` seeds `commission_rate_default` `{"rate":0.16}`,
    `00351_fulfillment_events_config.sql:104`). Say which wins instead of "a platform default otherwise".
11. **`notify_client_attention` may be the larger shape.** `notification-dispatch` already accepts
    `channel: "push"` and does nothing with it but write a log row — *"actual push integration is future work"*
    (`notification-dispatch/index.ts:186-208`). Adding the `apns-send` call **there** is one edge-function edit
    and every existing caller inherits it, versus a migration plus three edge-function call sites. A's SQL shape
    may still be right (it puts the push next to the row, in the same transaction) — say why.
12. **`proposal-sign-confirmation` exists as a deployed function with no caller** (only
    `packages/supabase/src/hooks/use-proposals.ts:1777-1778` warns that the RPC does not send it). A's §4 line
    "the signature confirmation never sends" is right; the fix is one invoke, not a build — worth saying, since
    §4 presents it as one of only two email changes.

---

## What is genuinely good — keep all of this

1. **The C2-vs-C23 conflict is named, located, and handed to Kody** with the two exact places A leans on it and
   an explicit "Your call." Almost every direction document in this repo's history has buried a conflict like
   that in a mock. This one does not.
2. **§8 is the best section in the document.** Eight declines, each with the surviving finding ids and the
   severity it costs — including *"This is the single largest thing Direction B can beat A on."* That sentence
   is worth more to the judging than any mock.
3. **The widget is priced honestly as a new target**, with the pbxproj evidence (verified: `:177,200,223` are
   the app, unit-test and UI-test product types, and there is no extension), an App Group, a second bundle id
   and "one engineer-week in wave 3, not a free win."
4. **Live Activities and Wallet are refused with a mechanical reason** — the wave-1 state machine stops at
   `paid`, verified: `direct_orders.status` CHECK is `pending_payment / paid / canceled`
   (`00276_direct_orders.sql:60-61`). Refusing a countdown for a date the system does not hold is exactly right.
5. **"The ask ships *with* `notify_client_attention`, in the same release, or not at all."** The single best
   risk line in either direction. Keep it verbatim.
6. **The buyable gate** — six non-null fields or the Buy control does not draw, *"sell six honestly rather than
   twenty-one with the dimensions missing"* — turns F144/F86 into a build-time invariant instead of copy.
7. **Path B pre-empts Path A on a room where a designer is engaged, stated as a relationship rule, not a tier
   badge.** This is the answer D1/D3 asked for, and the rule survives the tier taxonomy changing under it.
8. **Attribution ships before the button.** Verified free today: no client rail exists
   (`00301_marketplace_vitals.sql:37-40`) and `designer_earnings.order_id` is sitting unused for it. Sequencing
   an irreversible money decision ahead of the surface that moves money is the right instinct.
9. **The mock manifest's token discipline is exact** — home gutter 20, pushed screens top 56, Companion owns the
   bottom 120, Today cards flat at radius 16, DM Mono uppercase, strata mark instead of a grey box, and
   *"not `PatinaSheetHeader`, which has zero call sites"* — all four match `16-token-table.md:171-175,430-431`
   and the `PatinaSheetHeader` claim checks out (previews only).
10. **M5b is drawn as bare Safari chrome with no Patina styling**, with the reason stated: *"pretending otherwise
    would be a lie about who takes the money."* Keep both the drawing and the sentence.
11. **The Companion panel stays inside the acceptance contract** — ≤6 rows, one suggested, a concise attention
    summary, records stay in Studio (`OPTION_B_ACCEPTANCE.md:44-49`) — while finally putting a person in the
    relationship layer.
12. **The missing TestFlight build is named as a precondition** rather than discovered later
    (`12-backend-reality.md:399-401`). Now act on it (A5).
