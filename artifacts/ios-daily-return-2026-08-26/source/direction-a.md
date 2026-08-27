# Direction A — Since You Were Here

**Within canon. Zero amendments.** No tab bar (C1). Option B's Today contract stands (C23). Canonical names (C4). Honesty (C5). Brand voice
(C6). Built on the twenty shared planks; none of them restated here. *v2: four critiques were read line by line; every blocking and major item
is built into the document below or answered with evidence in **§12 · Critique log**.*

---

## 1. Name, thesis, and the day it is built around

**Thesis.** The app already ships one card for the one thing that matters, one orb that is supposed to be the relationship, and one screen where
the work lives — and all three are currently empty of the other person. Direction A fills them, and adds one line that says what moved while you
were gone. No new modules, no new navigation.

The word Patina owns and nobody else can is **somebody else did something about your house while you were asleep.** It is the only genuinely
variable reward in the product (U1 §3), it is computed on the backend, and it is rendered nowhere a returning person looks. A puts it on the
first screen, in the places the contract already gives us: the Today header, the one Next Move, the Companion's hint. Two rules govern that
line, and they are what v1 got wrong:

- **It draws only when something moved.** No eyebrow, no null sentence, no "Nothing new since Saturday." An app that prints a dated record of
  your absence four mornings running is counting the days you were away at you. When nothing moved, Today is the header, the Next Move, the
  story and the room — exactly as it ships now.
- **The dates go on the facts, not on the person.** The mono label is `WHAT MOVED`; the sentence carries the dates. "Leah sent a proposal on the
  3rd. Your invoice came due on the 1st." (H3's own wording.) The direction keeps its name; the screen does not print it.

The surface keeps its shipped name — the header word is **"Today"** (C23); the Daily Room is what we call it in code.

### The day, told honestly per wave

**7:40am — Walt, Madison, discovering, no designer, no order.** *Wave 1:* no line. `WEDNESDAY · AUG 26` / `Today`, the Next Move (the room
ladder), the story with an unread dot that is finally real — on because he has not opened *that* story, off when he does. **A does not stage a
daily reward for Walt it cannot pay.** At discovering, wave 1 buys him an honest *weekly* return: a story he has not read, on a published
cadence, and a dot that stops lying. *Wave 2*, once `get_recommendations` carries `created_at` and the story bank is stocked (§9): `WHAT MOVED`
/ "Two new pieces, and a story about linen — since Saturday."

**12:30pm — Ruth, Des Moines, activeProject.** `WHAT MOVED` / **"Leah moved Aspen Loft into Installation & Styling on Monday. A proposal arrived
Thursday."** The house first, the chores second — and both halves are already on the device (§2). Then the one Next Move: `NEXT MOVE` / **"Leah
is waiting on two things"** / "A rug colour since Aug 22 · a proposal by Sep 8 · your invoice is due Sep 1" *[example dates throughout §1 and §11 — the
seed carries none]* → **Your Studio**. Leah is named on
what Leah raised; the invoice is Patina's to ask for, in Patina's voice. Below it, the story. She has no room, so no Active Room card renders —
the home is three blocks and that is honest. The Companion's hint reads `LEAH HARTWELL · YOUR DESIGNER`; tapping it opens a panel headed by her.

**9:10pm — Maya, Grand Rapids, discovering, one room.** *Wave 1:* `WHAT MOVED` / "The jute rug has been in the Living Room since Sunday." — her
own room, moved by her, unseen since; she did it three days ago on a bus and has not looked. *Wave 2:* "Three new pieces for the Living Room."
Below the story: `ACTIVE ROOM / Living Room / 18 × 14 ft · 3 pieces saved / $3,590 saved · your range $5K+`. **The range is the label the quiz
itself printed** (`StyleQuizViewModel.swift:239-247` → `"$5K+"`), not a number derived from a band. See §3.

**A guest does not have this day.** A guest's second launch is the gate: session, quiz and portrait are discarded and the screen says `Welcome
home` to somebody it just forgot (F28 S0, F36 S0, F113; `g-38-relaunch-returning-guest.png`). SP-06 repairs *ownership* at first sign-in, which
a returning guest never reaches. **A's day begins at sign-in, and A says so** rather than promising a returning guest a line the app cannot
draw. Guest-session durability is a hole in the floor, not a direction feature — §9 puts it to Kody as such.

**After two weeks away.** The same one sentence, same sources, with dates. Nothing scolds, and nothing decayed while she was gone: the
design-request promotion window re-anchors to **last seen** rather than wall-clock, so absence stops deleting the one card that explains her
designer (F189) — with a 60-day ceiling, past which the card reads as history, not news.

## 2. Home composition per tier

Four modules, in the shipped order, at every tier — plus one block inside the existing header. Nothing is added below the Active Room; the home
still does not scroll into a rail.

| Order | Block | guest | discovering | engaged | activeProject |
|---|---|---|---|---|---|
| 1 | `DailyGreetingHeader` — date · `Today` · `?` · bell · monogram | as today | as today | as today | as today |
| 1b | **`WHAT MOVED` block** (new, inside the header) | **absent — a guest is returned to the gate** | wave 2 (catalog) / wave 1 (her own room) | yes — the request's stage | yes |
| 2 | `TodayNextMoveCard` — one move | room ladder | room / new-pieces / room-scoped Browse | **"You're matched with {designer}"** | **the queue, named by who raised it; when it is empty, the phase** |
| 3 | `DailyStoryCard` | yes | yes | yes | yes |
| 4 | `TodayActiveRoomCard` | when a room exists | when a room exists + fill line | when a room exists | when a room exists (absent for `client@patina.dev`, which has none) |
| — | Companion hearth, 120 pt | hint: "Look around" | hint: room + saved count | hint: **`{DESIGNER} · YOUR DESIGNER`** | hint: **`{DESIGNER} · YOUR DESIGNER`** |

**The activeProject zero state, specified.** On the days between milestones — most days — the queue is empty and the Next Move must still be
exactly one card (C23). It becomes the house rather than the chores: `NEXT MOVE` / `Aspen Loft is in Installation & Styling` / `Leah's next
milestone is the final walkthrough` → Your Studio. `current_phase` is already on the project row the home fetches (`ProjectsAPIClient.swift:25`,
via `BadgeCountService.swift:85`). That is F58, answered in composition, not only in routing.

**Card weight follows content.** When the queue is non-empty, `TodayNextMoveCard` takes the hero footprint (the 300 pt the story card holds
today) and `DailyStoryCard` renders as a 96 pt row beneath it. Still four modules, still one story — but on the morning Leah needs an answer, a
maker profile from Maine is no longer the largest object on the screen (D1's exact complaint). On a quiet day the weights swap back.

**Where the C2-vs-C23 conflict is being leaned on, named for Kody.** Three places, all small. (1) **The `WHAT MOVED` block lives in the header,
not as a fifth module.** The Today contract constrains what Today *presents* — "exactly one prioritized next move, one real editorial or taste
story, and one active room" — and says nothing about the greeting header, which already carries a date, a help glyph, a bell and a monogram.
Read the contract as "four blocks, full stop" and this is an amendment and A is wrong; I read it as a count constraint on the modules, with the
date line as precedent. (2) **The one Next Move carries the whole waiting queue.** One card, one route, one act; the detail line names what is
behind it, in date order, because a count you cannot see behind is the thing Ruth stopped believing (F41). U1 reached the same reading
independently. (3) **Module weight is content-driven** (above): the contract counts modules, not heights. If Kody reads it as fixing the story
card's hero treatment, item 3 comes out. **Your call on all three.**

**What A re-mounts from the orphaned July rail:** nothing on the home. Not `StudioHubSection`, not `MarketplaceLinksSection`, not
`WorkWithDesignerCTA`, not `RoomChipRail`, not `DailyProductCard`. `AddToRoomSheet` and `AddedToRoomToast` are mounted by SP-11/SP-14, not by A.

**What is honestly new day to day, per tier.** *Guest:* nothing (above). *Discovering:* wave 1, her own room's fill, unseen since she moved it,
plus a story she has not opened; wave 2, catalog rows newer than her last visit from `products.created_at` (the column exists,
`00001_initial_schema.sql:44`; the projection does not — §9). *Engaged:* the request's stage, which advances without her — `held → inTouch →
introduced → booked → matched`, each a real transition with real copy (`DesignRequestStatusService.swift:158-215`), the accept already firing a
push (`00330:182`). *ActiveProject:* **the phase, first** — `current_phase` and `updated_at` arrive on every home appear inside
`listProjects()`, which `BadgeCountService` already calls (`ProjectsAPIClient.swift:25,29`; `BadgeCountService.swift:85`). Store the last-seen
phase per project id; when it differs, the house moved and the line says so — **zero new network calls, zero backend delta.** Then the queue.

## 3. The investment the app remembers, and where it shows on return

| Investment | Where it is stored | Where it shows on return under A |
|---|---|---|
| The room | SwiftData `RoomModel` + `rooms` | Active Room card + fill line: `18 × 14 ft · 3 pieces saved · $3,590 saved · your range $5K+` |
| Saved pieces | `TableItemModel` + `saved_items` (SP-14 makes it durable) | the fill line, the room's item list, the Saved door — with the save date and room on the row (F197, F203) |
| Taste portrait | `StylePreferenceModel` + `client_style_profiles` | the room's range line, in the quiz's own words; the feed already scores against it server-side |
| Design-request draft | SwiftData `DesignRequestDraft` | Next Move — "Finish your design request" (unchanged; the best-designed memory in the product) |
| Submitted request | `leads` | Next Move — the stage line, made visible by SP-07's one-line filter fix |
| The waiting queue | server: decisions, proposals, invoices, threads | Next Move, one card, with dates |
| **The project's phase** (new) | server (`projects.current_phase`) + one local dictionary | the `WHAT MOVED` line, and the empty-queue Next Move |
| **Last seen** (new) | one local timestamp, per device | the `WHAT MOVED` line; the re-anchored promotion window |
| **Last story read** (new) | one local story id | the unread dot, which now earns itself |

**On money, plainly: A prints the band, never a point figure.** The quiz offers four options and stores a `"min-max"` string with a display
label (`QuizModels.swift:103-109`; `StyleQuizViewModel.swift:239-247,278`). `$9,000` is not producible from any of them, and deriving a midpoint
*is* choosing a figure, which §10 forbids. So the fill line reads `$3,590 saved · your range $5K+` — her spend beside her own answer, in her own
words. No percentage, no track; when the answer is `TBD` the money half is omitted, not zeroed. **The better long answer is to ask once, on the
room** — "What are you spending on this room?", editable, stored on `rooms`, blank until answered: a real product decision with a one-column
cost, named rather than smuggled in behind a band. *Your call.*

**Option B's memory clause, named rather than skated past** (`OPTION_B_ACCEPTANCE.md:30-33`). Both new keys are **recency**, which the same
contract lists among the real signals context may use (`:28-29`). They are device-local and hold no content — a timestamp, a story id, a phase
string per project — and they appear in the memory inspector with everything else. **Clearing memory clears them**, and the next open behaves as
a first visit: the block does not draw, the dot resets to unread. Last-seen is per device and A says so; **on a device that has seen a
sign-out** (SP-20 restores it) the keys reset with the account, so two people on one iPad do not inherit each other's absence. A server-side
`client_last_seen` is a wave-3 item.

## 4. Return surfaces beyond the app

### Notifications — what earns the permission

**The promise, and the whole promise** — SP-08's sentence, verbatim, in the pre-permission screen and in this document, with no second version
anywhere: *"We'll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else."* Shipping
joins that sentence in the release that can send it, and not before. No marketing, no "you haven't visited", no new-piece alerts.

**When we ask.** Not at cold launch, and not after a design-request submission — which is what happens today (`PushTokenService.swift:91-108`)
and is unrelated to money. A asks at **the first real event**: the client has a designer and the first proposal / decision / invoice has just
landed. One screen of copy first (M8), then the system prompt. **We ask once, ever** — a decline costs nothing, because email is the durable
rail and the in-app feed the floor, and a re-ask triggered by a debt is the best-mannered version of the thing §10 refuses. If the person
declines our screen and later wants it, Settings carries the switch; if they denied the *system* prompt, iOS will not show it again this
install. `push_permission_prompted` (`trigger`, `outcome`) is new (F190).

| Event | Carrier | Cost |
|---|---|---|
| Designer accepts your request | **existing caller #1**, `accept_design_request` (`00330:182`) | **zero** — it already fires |
| Match ceremony / consult slots | **existing callers #2, #3** (`00331:342`, `00334:120`) | zero |
| Proposal sent · decision raised · invoice sent or overdue | **one new call site** — `notify_client_attention(entity_type, entity_id, client_id)`, one SECURITY DEFINER function holding the single new `invoke_edge_function('apns-send', …)`, called from the three write paths SP-08 already touches (`proposal-send`, `00092_decision_cron.sql`, `invoice-send` / `invoice-reminders`) | one function |
| A piece ships | **existing caller #4**, `fulfillment-notify` — which now serves **both** rails, because settled direct orders become `fulfillment_orders` rows (§5) | zero new templates |

**It fires once per entity transition, never once per cron evaluation.** `invoice-reminders` is a recurring job; the push rides the *transition
into* sent, raised, or overdue-and-unread, guarded by the same `notification_log` row SP-08 writes. A client is not nagged by her studio's
reminder cadence, and Leah's name is not on a repeating buzz. Payloads carry `entity_type` / `entity_id`; `NotificationRouter` already routes
`proposal`, `invoice`, `decision` and has been waiting for a sender (`NotificationRouter.swift:60-88`); new events `push_received`,
`push_opened`.

### Widgets

**One new app-extension target.** The project declares exactly three targets and no extension of any kind (`project.pbxproj:177,200,223`), so
this is a real cost: a WidgetKit extension, an App Group for a small cached payload, a timeline provider refreshing on foreground and on push, a
second bundle id to provision, and a second thing to keep in sync at review time. **One engineer-week in wave 3**, not a free win.

**The widget carries what moved, not what is owed.** Small Home Screen and Lock Screen `accessoryRectangular`, same content: something moved →
`LEAH SENT A PROPOSAL` / `Tuesday`; nothing waiting → `NOTHING NEEDS YOU` / "Living Room · 3 pieces"; signed out → the strata mark and the
wordmark, nothing else. No badge number, no count of anything the person did not do — including on the highest-exposure, lowest-context surface
in the product, which is where v1 broke its own rule. Deep-links via `patina://`. New event: `widget_tapped`.

**Live Activities: no.** They fit exactly one thing — a delivery or install window — and A's wave-2 order derives its status from line states no
vendor has acknowledged yet: a countdown for a date we do not have. **Wallet pass: no.** There is no honest artifact.

### Email

Email is already the durable rail and already cron-scheduled — `invoice-reminders`, `proposal-nudge`, `decision-resolved-notify`, the
direct-order receipt and failure mails, all through `_shared/send-email.ts`. A changes two things, both cheap. First, the proposal **signature
confirmation**: `proposal-sign-confirmation` is deployed with no caller (only `packages/supabase/src/hooks/use-proposals.ts:1777-1778` notes the
RPC does not send it) — one invoke, not a build. Second, **the piece link opens the app**, because SP-03 adds associated domains and one
client-facing piece route. **A narrows v1's claim:** invoice, proposal and decision mails point at portal routes with no in-app destination, and
`patina://` reaches only auth, room and piece (F199); `patina://proposal/<id>`, `patina://invoice/<id>` and `patina://decision/<id>` are named
here as the wave-2 delta they are.

## 5. The purchase path

**The rail is the one that exists.** `public.direct_orders` (00276) + `create_direct_order` + `create-checkout-session`'s `direct_order_id`
branch + `stripe-webhook`'s settle branch + the receipt email (C24). Money is taken in **hosted Stripe Checkout inside
`SFSafariViewController`** — the container the invoice screen already uses — and **Apple Pay is already inside it** (C25). A ships no
PaymentSheet: it buys a native sheet and one fewer context switch, and costs an SPM dependency, a merchant-id entitlement, a new backend mode,
and a re-do of ACH, surcharge and settle-polling. **A does add the one thing nobody has done: open a real Checkout on a real device with a card
in Wallet and look.** That probe is a day, not an hour: it needs a signed build (none is installable — the last TestFlight build expired
2026-08-10), a payable invoice, and a Stripe environment that is not the known two-account mismatch, named up front.

**Apple compliance.** Physical goods, external payment, no IAP — 3.1.3(e) / 3.1.5(a). Sign in with Apple already ships
(`Features/Authentication/Views/SignInWithAppleButton.swift`), so 4.8 is satisfied. The app *does* hand a **design-fee invoice** to the same
Safari Checkout today (C10) — a service, billed externally, sitting under 3.1.3(d)/(e) rather than opening 3.1.1. A names it rather than
claiming there is no service in the app; A sells no digital service of its own, so 3.1.1 stays shut.

### Three paths, and the rule that picks between them

| Path | Who sees it | The rule |
|---|---|---|
| **A · Buy it** | a signed-in client with **no live designer relationship**, when the piece is buyable | `create_direct_order` → hosted Checkout → receipt → a `fulfillment_orders` row |
| **B · Ask your designer to source this** | **every client with a live designer relationship**, on every piece, room or no room | opens the project thread with the piece named (SP-13's RPC) |
| **C · Get design help with this room** | discovering, on a piece that is not buyable | the canonical designer CTA (C4), labelled as what it is |

**The rule, stated once and at one scope: a live designer relationship — an accepted lead or an active project — pre-empts Buy for that client,
everywhere.** Not the room, not the tier badge: the relationship. v1 gated Buy per room and attributed per client, which left Ruth
(activeProject, zero rooms) able to self-checkout under a promise that said she could not. §6's promise is now literally true.

**Then attribution has one job left, and it is the one D1 actually asked for.** A client can sit on a designer's roster (`designer_clients`,
`00014:72-90`) — sent here to browse — with no accepted lead and no active project. She sees Buy. **Her order credits that designer**, at
`products.commission_rate` where set (`00152_three_layer_catalog.sql:52`) and otherwise `fulfillment_config.commission_rate_default`
`{"rate":0.16}` (`00351:104`) — the rail's own default, not an invented one. Two roster designers and no active project: most recent row wins; a
same-day tie draws no credit line and files the order uncredited rather than guessing. That is "a client doing my sourcing for free" (D1), paid.

**What "buyable" means — seven fields, every one a column.** Maker (`products.brand`), dimensions, lead time (`lead_time_weeks`) and price
(`price_retail`) exist, and SP-10 returns them. Three are new in wave 2: `shipping_flat_cents`, `returns_policy_key`, and
**`photo_verified_at`**. `image_url` is non-null on 17 of 21 rows and the pictures are wrong — a dining table shown with green velvet chairs, a
planter set shown as a mint plastic pot (F06, six seats) — so "a real photograph" is a judgement, not a gate, and A makes it a column a human
sets. The **Buy** control does not draw unless all seven are non-null. That is a small number of pieces at first, and it is correct: sell six
honestly rather than twenty-one with the dimensions missing.

**And the app says whether it fits.** When a room exists and both values are non-null, one line under the dimensions and again on the order
sheet above the button: `38″ wide · your Living Room is 18 × 14 ft`. Both numbers are on the device and nothing joins them today. No backend, no
new data, and the cheapest trust win in either direction (H1's first buy requirement, verbatim).

**A guest tapping Buy hits the soft wall first.** `create_direct_order` raises `not authenticated` and EXECUTE is revoked from `anon`
(`00276:143,200-201`), so Path A is scoped to signed-in clients and the guest gets the existing C9 auth sheet, over context, never ejecting —
**and nothing is written until she is authenticated**, so a dismissed sheet strands no row.

### The order object — one rail, not a second one

v1 proposed nine new columns on `direct_orders` and a new ops write path. That re-implemented a rail that already shipped. **A takes the smaller
delta.**

```
create_direct_order → pending_payment ──→ canceled
                             │ checkout.session.completed
                             ▼
                           paid ──→ refunded              (00277 trigger, exists)
                             │ stripe-webhook enqueues fulfillment_intake
                             ▼
   public.fulfillment_orders (00350) — status DERIVED from line states:
   intake → transmitted → acknowledged → in_production → shipped → delivered → settled
   + fulfillment_shipments (tracking, carrier, ETA) + fulfillment_exceptions 'damage' (claims window, evidence)
```

`fulfillment_orders` already carries `designer_profile_id`, `designer_client_id`, `designer_attribution`, `product_subtotal_cents`,
`freight_charged_cents`, `tax_cents`, `captured_total_cents` and a derived status (`00350:68-89`); `fulfillment-notify` already pushes six
transitions (`fulfillment-notify/index.ts:42`); and `fulfillment-intake` already mints the whole row idempotently from a PaymentIntent
(`fulfillment-intake/core.ts:33-57`). So the delta is: **put the intake-contract metadata on the direct-order Checkout session, and enqueue
`fulfillment_intake` from the settle branch that already exists** (`stripe-webhook/index.ts:1181`). **Zero new columns on `direct_orders`.**

One thing it does need: the client cannot read her own order. RLS on the fulfillment tables grants SELECT to `authenticated` behind an
**admin-only** policy (`00350:314-329`). A adds a client-scoped SELECT policy on `fulfillment_orders`, `fulfillment_order_items` and
`fulfillment_shipments` (`client_profile_id = auth.uid()`) — one migration, no new tables. **That policy is the whole answer to "where is it".**
It is also the answer for Ruth: the dining table Leah ordered is a Rail-A `fulfillment_orders` row today, invisible to the client app. One
policy and one screen, and both rails land on the same surface. Until it ships, **a designer-sourced piece has no client-visible status, and A
says so** rather than implying its order object covers her (F90, F202, F198 stand through wave 1).

**The money on the sheet equals the money the session charges.** Today `create_direct_order` writes `amount_cents := price_retail * qty`
(`00276:176-183`) and the Checkout branch bills exactly that, with no `shipping_options` and no `automatic_tax`
(`create-checkout-session/index.ts:541-553`). So wave 2 names two real deltas: **freight folds into `amount_cents`** inside the RPC from
`products.shipping_flat_cents`, and **`automatic_tax: { enabled: true }`** goes on the direct-order branch. The second implies a sales-tax
registration decision that is Kody's, not engineering's — **and the Buy control does not ship until it is made.** No sheet in this document
prints a total the rail cannot take.

### Attribution, written once

`stripe-webhook`'s settle branch inserts one `designer_earnings` row using columns that already exist and have been waiting for this: `order_id`
(commented *"Future: when orders table exists"*) and `commission_rate` (`00014:307,313`), with `source_type = 'product_commission'`, which its
own comment already lists (`:304`) — no CHECK migration. Stripe retries, so: a **partial unique index on `order_id WHERE order_id IS NOT NULL`**
plus `ON CONFLICT DO NOTHING`, the shape 00277 already uses for contra rows. The settle update is itself guarded —
`.eq('status','pending_payment')` returns rows only on the first delivery (`stripe-webhook/index.ts:1181-1188`) — so the insert rides a
transition, not an event.

**Price:** one policy migration, one column trio on `products` riding SP-10's DROP/recreate, one resolution query inside `create_direct_order`
(already SECURITY DEFINER), the session metadata, one enqueue, one earnings insert, and **one row in the designer portal so she can see it — a
tracked wave-2 deliverable with an owner.** Free today: the client rail is unbuilt, so nothing needs backfilling; after the button ships, the
same change means reconciling money that already moved. **The alternative, named:** ship Buy with no attribution, which
`00301_marketplace_vitals.sql:37-40` documents as today's state — the version D3 said he would walk over.

**What Walt sees before he pays $4,000.** On the piece: the maker and the town · a photograph somebody signed off on · `38″ W × 20″ D × 30″ H` ·
whether it fits his room · `Ships in 10–12 weeks` · materials in words · the maker's story attached to the object. On the order sheet: the
piece, white-glove shipping with a figure, tax as the session will compute it, the total, the lead time, **who answers if it arrives scuffed** —
true now, because the claim lands in `fulfillment_exceptions` with an evidence window on the rail the order joins at settle (`00350:186-200`) —
and, with a roster designer, "Credited to Leah Hartwell." After: an order row that persists, the receipt email, and the order in Your Studio.

**What D3 sees after.** The order on the same BOH surface his own Rail-A orders live on, with the client, the piece and the date; the commission
on his earnings ledger; the piece attached to the job rather than floating in a catalog he cannot see. The FF&E line is written in the designer
portal — outside this lane, and A says so.

## 6. The designer in the client's home

**Visible.** The Companion is Option B's declared relationship layer and it holds no relationship today. Under A, from the moment a designer is
claimed — **at engaged as well as activeProject** — the collapsed hint reads `LEAH HARTWELL · YOUR DESIGNER` instead of a count, on every day
including the quiet ones; the expanded panel is headed by her (portrait or monogram from `profiles.avatar_url`, her name, studio and credential
from `IntroductionInfo.credentialLine`); the Next Move names her, on what she raised; every notification says who sent it.

- The first row is **`Message Leah`** — a personalization of the shipped `"Message your designer"` row that already appears on five screens; the
  five keep their label unless a later wave standardizes one. At engaged, where there is no project, it calls
  `rpc_start_direct_thread(counterpart)`; SP-13 covers exactly that case.
- **The suggested row is state-driven, not fixed:** `What's waiting` when the queue is non-empty, `Message Leah` only when it is empty. A UI
  that promotes messaging by default on every visit is tuned to generate inbound mail — the opposite of D2's test.
- `StudioIdentityLine` is reused in the panel header. It is keyed by **project id** (`StudioIdentityLine.swift:19,36-39`), so an engaged client
  with no project needs the second initializer over `StudioIdentityService.identity(forDesigner:)`, which exists (`:81`). The defect to repair
  is the **nil-identity** case, where the view renders nothing (`:15-17,23`); the missing-logo monogram fallback already exists (`:45-60`).

The panel stays inside its contract: ≤6 rows, one suggested, a concise attention summary, records in Your Studio.

**Credited.** §5. Path B for every engaged client; Path A credited on the roster case; the credit line printed where the client can read it.
**Protected.** Buy never draws for a client with a live designer relationship — no room condition, no exception. Threads open on projects she
already owns. No "compare designers", no rating, no marketplace of professionals inside a client's own house.

**The other direction, named.** Everything in §4 flows Patina → client. When a client signs, pays, answers or opens a thread, the designer must
learn it without polling: `rpc_start_project_thread` writes its system message, and the portal's own notification rail carries sign/pay events
today. A does not own that portal and does not claim it is handled — **§9 lists "confirm the designer-facing notify covers sign / pay / decide /
thread-opened" as a wave-2 prerequisite with an owner.** A second silent inbox is D2's stated failure mode and it will not be discovered later.

## 7. Findings answered

| Findings | What changes under A |
|---|---|
| F13, F16 (=F34) | the `WHAT MOVED` line: a first screen that differs after two weeks, on a real last-seen timestamp — and draws nothing when nothing moved |
| F76, F125 | the phase the project screen already fetches is rendered as a dated timeline, and a phase advance writes the line (wave 2) |
| F58 | the empty-queue Next Move becomes the current phase and the next milestone — a live project stops vanishing from Today |
| F30 (=F37), F80, F91, F41 | the Next Move carries the whole waiting queue with dates, from the one `BadgeCountService` count |
| F11, F98, F121, F126, F134, F119, **F50** | the money rail, Browse and the Studio get a home door — the Next Move card and a real `AppRoute.studio`, which the Companion's `Your Studio` row also points at |
| F09, F79, F160 | the designer is named on Today, in the hint, in the panel header, and in every notification |
| F189 | the design-request promotion window re-anchors to last-seen, with a 60-day ceiling |
| F46 (=F61), F131 | the unread dot earns itself from a stored read; the story served is the highest `sort_order` the reader has not opened |
| F07, F38, F127, F47, F167, F199 | one new `apns-send` call site carries proposal / decision / invoice, once per transition; the permission is asked once, at the first real event, behind one screen naming exactly what will be sent; the piece deep-link lands in the app (SP-03), three more routes scoped in wave 2 |
| F130 | one small widget on Home and Lock Screen, carrying what moved, priced as a new target |
| F190 | `today_moved_line_shown/tapped`, `push_permission_prompted`, `push_received/opened`, `widget_tapped`, `order_path_shown`, `order_started`, `order_placed` |
| F12, F04 (=F31, =F32), F151, F153 | Buy it / Ask your designer / Get design help, on the rail that already exists, gated at one scope |
| F19, F66, F90, F202, F198 | a client-readable order object — one RLS policy on `fulfillment_orders` — carrying **both** rails: her own purchase and the piece Leah ordered (wave 2) |
| F22 (=F26), F152 | attribution resolved at create, credited at settle into `designer_earnings.order_id`, idempotent |
| F144, F86, **F17**, F06 (with SP-10) | dimensions, lead time, shipping figure, returns owner and a verified photograph become a build-time gate on the Buy control rather than missing copy; `products.photo_verified_at` means a human signs off on the picture or the piece is not sellable |
| F51 | the typed form stops calling itself a scan: six strings — `Rescan`, `0 ITEMS DETECTED`, `This Looks Right`, `JUST SCANNED` over `MANUAL ENTRY` — say what the flow is |
| F123, F65, F15, F197, F203 (with SP-11/SP-14) | the room fill line — pieces and money against the person's own range, never a derived figure — and the Saved row carries its save date and room |
| F99, F161 | an activeProject client with no room is never pitched a stranger's room, nor a scan, as her next move; the projects list sorts active before completed |
| F158 (with SP-18) | Profile's unexplained percentage comes down — SP-18's own scope names it; and A takes the piece detail's match pill down itself, which SP-18 does not cover |
| D1-08 / D3-26 | proposal selections read the same product photo feed rather than a wordmark glyph (wave 2) |

Everything else in the 213 is a shared plank, refuted, or declined below.

## 8. Amendments — none. Where A declines, and what it costs

**Zero amendments.** No canon row is bent. Here is what that costs, plainly.

1. **No tab bar (C1).** The home still has no permanent Browse, Saved or Studio door. A gets Ruth to her money through the one Next Move — which
   now always points at something, because the empty state is the phase — but on a quiet day her route to the Studio is still the monogram, or
   the Companion. **This is the single largest thing Direction B can beat A on.** The second cost, which v1 missed: at engaged and above the
   hearth hint carries `LEAH HARTWELL · YOUR DESIGNER` every day, so the relationship is never invisible; at **discovering** there is no such
   label, and D1's "browsing beside me" habit has no home-screen anchor at all.
2. **No fifth module, no Studio rail on the home (C23).** An activeProject client cannot see three projects, four proposals and an open invoice
   on the first screen — only the count and the next act. F11 is answered by a door.
3. **No household, no second seat, no shared room.** Maya's third reason to open the app daily — "Devon in here with me" — goes unanswered. F54,
   F105, F129, F168 stand. Every $2,000 decision in that house is made by two people on one couch, and A gives them one phone.
4. **No search, no compare, no notes on a saved piece.** F43, F52, F162, F170 stand. Twenty-one rows and five client-side chips is a browse
   surface for a catalog that has not arrived; A does not build search ahead of inventory.
5. **No per-user story algorithm, and no editorial promise A cannot keep.** A earns the dot and serves the unopened story; it does not build a
   rotation RPC for a table with three rows. **The cadence is a gate, not a footnote:** the discovering branch of the `WHAT MOVED` line does not
   ship until twelve stories are banked and a named person owns a weekly publish. Naming that person is Kody's — but A refuses to ship a daily
   reward against an empty well, and the refusal is a §9 prerequisite rather than a hope.
6. **No AR.** SP-18 takes the affordances down; A does not put them back. `usdz_url` is null on every row (F64, F110, F182).
7. **No hour-of-day greeting.** F186, F188 and F209 want "Today" to know it is evening. Nothing in A reads the clock and A does not pretend
   otherwise: v1's findings table claimed them and answered something else. Building it is half a day, and it would put a second name on a
   header C23 fixed as `Today`. Declined; the three stand.
8. **No rooms of her own for Ruth (F101).** Removing a stranger's Living Room is SP-18/SP-11 work; giving Ruth's dining room and primary bedroom
   a home in the app is not something A builds. F101 stands — moved here from v1's findings table, where it was claimed and not answered.
9. **No PaymentSheet.** One context switch into Safari remains; F200 is answered with a sentence.
10. **R32's ratified order, and where A steps out of it — named, because §8 is the section for it.** R32 sequences the backlog **reviews →
    scope-change requests → direct orders → GDPR**, and C11 calls direct orders "not yet designed." A's wave 2 builds item **#3** and builds
    neither #1 nor #2. C24 says the backend already exists and "the attribution decision is open and free to make now" — which licenses
    *deciding attribution*, and A reads it as also licensing the client surface, on the grounds that the backend jumped the queue first and an
    unattributed rail is the live risk. That is a reading, not a ruling, and the same kind of lean as the C23 one in §2. **Your call.** If the
    answer is "hold to R32", wave 2 becomes reviews and scope-change requests, wave 1 is unaffected, and A loses its purchase story rather than
    its return story.

## 9. First slice, waves, deltas, risks, rollback

### Prerequisites, stated as prerequisites

The slice assumes, in or before the same release: **SP-07** (the one-line lead filter — M9 is inert without it), **SP-08** (the pre-permission
copy and the client-facing `notification_log` rows the push rides), **SP-13** (`MessagingAPIClient` gains a create call, or "Message Leah" is a
dead end), **SP-20** (Sign Out, which the last-seen reset depends on); **SP-11 / SP-14** gate M2's fill line and M4's item list. And one
dependency that belongs to nobody yet: **two quizzes give one taste two names** — `Warm Modern` from the Companion quiz, `Modern Warmth` from
the post-room quiz, four of five questions asked twice (F96, F140). **One result vocabulary before the fill line ships**, the same way the
editorial cadence gates the discovering line.

### First slice — two weeks, one iOS engineer + edge functions

Everything here is client-side except item 6. No migration, no new network call on the home.

1. **`AppRoute.studio` + the destination arm.** One enum case, one arm; the Next Move and the Companion's `Your Studio` row both point at it
   instead of depositing Ruth on Profile. Repairs F50 for free. *(0.5 day)*
2. **Last seen, last phase, and the `WHAT MOVED` line — attention half only.** Two `UserDefaults` keys plus one small dictionary; one sentence
   builder over rows the home already fetches (`BadgeCountService.swift:85-96` for the queue, `current_phase` for the house); the block does not
   draw when nothing moved. *(3 days)*
3. **The Next Move carries the queue, and has an empty state.** One branch at the top of `TodayExperience.nextMove` fed by `BadgeCountService`,
   dates from `StudioQueueBuilder`; a second branch naming the phase when the queue is empty. Card weight follows content. *(2.5 days)*
4. **The Companion holds the designer.** Hint, panel header, `Message Leah` as a state-driven suggested row, the second `StudioIdentityLine`
   initializer and the nil-identity fix. *(3 days)*
5. **The unread dot earns itself.** One stored story id; remove the hard-coded `true` (`DailyStoryCard.swift:80-87`) and serve the highest
   unopened. *(1 day)*
6. **`notify_client_attention`** — the one new push call site, wired to the three write paths, firing once per transition. *(edge/SQL, 2 days,
   parallel lane)*

**That is 10 iOS days.** Two items v1 put in the slice are out: **the permission moment moves to wave 2** (it needs M8's new screen, SP-08's
rows and a device probe), and **the six-string scan-vocabulary repair** rides wave 2 with SP-11. The line's catalog half is wave 2 by
construction: `get_recommendations` projects neither `created_at` nor `published_at` (`00246_aesthete_quiz_bridge.sql:273-300`, whose comment at
`:302` calls the signature FROZEN), `BadgeCountService` fetches no catalog, and a direct `products` read would be unscoped and would add the
home network call A says it does not add. **So wave 1 is the activeProject and engaged tiers, and §1 says so.**

**Gate:** `xcodebuild` on the Patina scheme plus the app's unit tests, then a Simulator pass at Dynamic Type XXL and in dark mode on **the home,
the Studio, the Companion panel, invoice detail, proposal detail, decision detail and (wave 2) the order sheet** — per
`patina-ios-verification`. The money screens are where the observed dark and XXL failures are: no Pay button at the natural scroll stop in dark
mode (F106), the Dynamic Island over a proposal title (F107), the orb clipping `Sign proposal` (F49, F81). Nothing here is a device claim except
the two probes, which are.

### Waves

- **Wave 2 — the purchase, the order, and the rest of the line.** `products`: `shipping_flat_cents`, `returns_policy_key`, `photo_verified_at`,
  plus `created_at` and SP-10's fields projected through `get_recommendations`'s DROP/recreate (one migration, not two). The client-scoped
  SELECT policy on the three fulfillment tables. `create_direct_order`'s designer resolution + freight. The Checkout session's intake metadata
  and `automatic_tax`. The settle branch's `fulfillment_intake` enqueue and `designer_earnings` insert. Three new iOS screens (act bar, order
  sheet, order placed) and the order surface in Your Studio reading `fulfillment_orders`. The phase timeline on project detail. The permission
  moment and M8. The scan-vocabulary repair. The designer-portal earnings row, tracked. Prerequisite: **confirm the designer-facing notify
  covers sign / pay / decide / thread-opened.**
- **Wave 3 — the surfaces.** Order history and shipment detail, the widget target, the three additional deep-link routes, and a server-side
  `client_last_seen` if the second-device case earns it.
- **Wave 4 — the catalog.** `vendors.made_in` / `brand_story` (0 of 104 populated today, F146), dimensions, lead times, shipping figures,
  verified photography, and the editorial bank. Not engineering, and the thing that decides whether any of this sells.

### Backend deltas (C13-compliant: migrations + edge functions only, no new services)

| Delta | Kind | Wave |
|---|---|---|
| `notify_client_attention()` SECURITY DEFINER + one `invoke_edge_function('apns-send', …)` | migration | 1 |
| client-scoped SELECT policy on `fulfillment_orders` / `_items` / `_shipments` | migration | 2 |
| `products`: `shipping_flat_cents`, `returns_policy_key`, `photo_verified_at` | migration | 2 |
| `get_recommendations`: project `created_at` + SP-10's fields (one DROP/recreate) | migration, riding SP-10 | 2 |
| `create_direct_order`: resolve the roster designer, fold freight into `amount_cents` | migration (CREATE OR REPLACE) | 2 |
| `create-checkout-session`: intake metadata, `automatic_tax`, universal-link success URL | edge function | 2 |
| `stripe-webhook`: enqueue `fulfillment_intake`; insert `designer_earnings` (`order_id`, `commission_rate`) | edge function | 2 |
| partial unique index `designer_earnings(order_id) WHERE order_id IS NOT NULL` | migration | 2 |
| one invoke of the deployed `proposal-sign-confirmation` | edge function | 2 |
| `editorial_stories.product_ids` (or `products.story_id`) — or the maker-story card does not draw | migration | 3 |

No new tables. No cron. No realtime — the badge poll floor stays (R29). **Nine new columns on `direct_orders` and a second ops surface are
gone**, replaced by one RLS policy and two existing functions.

### Risks

- **The permission grant is spent, not rolled back.** `armFirstSubmissionPromptGate()` flips a `UserDefaults` flag once
  (`PushTokenService.swift:103-108`), and once iOS records a denial no PostHog flag brings the prompt back. So **the ask ships *with*
  `notify_client_attention`, in the same release, or not at all** — and only after a **device push probe**: one signed build, one real token,
  one proposal, one buzz. No installable TestFlight build exists (the last expired 2026-08-10), so a fresh archive is a precondition of wave 2,
  not a discovery inside it. The Apple Pay probe rides the same build.
- **Apple review.** External payment for physical goods is the compliant path and A stays on it. The live exposures belong to the planks: in-app
  account deletion (5.1.1(v), SP-20) is release-gating.
- **Data.** The attribution rule decides money. Ship it with the read written against `james.okafor@example.com` (one accepted lead) and
  `client@patina.dev` (three projects) before the Buy control draws anywhere; and the tax registration decision gates the button.
- **Truthfulness of the line.** The badge floor is `scenePhase → .active` plus home appear, with no realtime, so a stale count could name
  something already dealt with. Build the line from the same fetch that paints the card, never a cache, and let pull-to-refresh rewrite it.
- **Guest-session durability is a hole in the floor.** F28/F36/F113 sit under every tier A builds on. A does not scope it and does not pretend
  it is scoped. **Put it to Kody as a missing plank.**

### Rollback

The five client-side wave-1 items are four PostHog fail-closed flags (C16) — the line, the queue branch, the Companion designer header, the dot
— plus one route, and any one turns off without the others. `notify_client_attention` is a `DROP FUNCTION` and three one-line reverts; no data
is written that a drop would strand. Wave 2's columns are additive and nullable, the Buy control is flag-gated, and the RLS policy is a `DROP
POLICY`. **Two things do not roll back:** money that has moved — which is why attribution ships *before* the button — and **the notification
authorization, which is one-way per install**. A bad permission moment is not reverted; it is spent.

## 10. What Direction A deliberately does not do

- **No tab bar.** Not as a compromise, not as a "just Studio" bar. C1 stands and A lives with §8.1.
- **No streaks, no badges, no "you haven't visited in 3 days", no fake scarcity, no countdown on a proposal's expiry, no "4 others saved this",
  no completeness meter that never fills, no randomised feed shuffle, no loss framing on a room.** All considered, all rejected: they reward the
  app's need for opens rather than the house getting finished, and Walt would delete the app before he finished reading the notification. The
  hard-coded unread dot already shipped is the shape of the mistake, and A removes it — replacing the hard-coded `true` with a stored read —
  rather than extending it.
- **No count of what the person owes on a Lock Screen**, and **no second permission ask keyed to money owed.** The widget carries what moved; we
  ask once, ever.
- **No push for new pieces**, **no second navigation system**, **no new module on Today**, and **no selling a design consultation as an in-app
  digital product.** A buzz for inventory is the first step toward a buzz for nothing; the Companion gains content, not weight; 3.1.1 is not
  this program's fight.
- **No invented figure anywhere.** Where a column is empty, the line does not print. Where a person answered with a range, the app prints the
  range. Where nothing moved, the app says nothing.

## 11. Mock manifest

Frame 402 × 874, Dynamic Island, status bar `9:41`, home indicator. Tokens per `research/16-token-table.md`: home gutter **20**, pushed screens
start at **top 56**, Companion owns the bottom **120**, Today cards **flat** at radius **16**, every DM Mono label **uppercase**, an unloaded
product image a **strata mark on `Background.secondary`**, never a grey box. Sheets use the hand-rolled Patina header (drag handle 36×4, title
`h5` 18 Playfair Medium, mono sub-label 9), **not** `PatinaSheetHeader`, which has zero call sites. Retry copy is **`Let's try that again`**
(C4); loading is **`One moment…`**. Content is seed-real unless marked *[example]*: pieces from `supabase/seed/products.sql`, stories from
`00143_editorial_stories.sql`, money from `INV-2026-0142` / `client@patina.dev` (C29). Rooms are device-local, so a named room is *[example]*;
**every calendar date here is *[example]*** — the seed carries none for the rug decision, proposal or phase change.

### M1 · Today — activeProject, 12:30pm (Ruth) · light + dark
**Tier/state:** activeProject, signed in, three projects, no rooms, 3 items waiting, phase changed Monday *[example]*.

**Layout, top → bottom.** Status bar. 20 pt gutter. `WEDNESDAY · AUG 26` (DM Mono 10, uppercase, tracking 0.5, `Text.muted`) with the bell
(unread dot, clay), `?` and the `C` monogram (36 pt clay circle) right-aligned below; `Today` (Playfair Medium 40, `Text.primary`). **New:**
`WHAT MOVED` (DM Mono 10) and, under it, Inter 14 `Text.secondary`: "Leah moved Aspen Loft into Installation & Styling on Monday. A proposal
arrived Thursday." — 8 pt gap, then 24 before the card. `TodayNextMoveCard`, **now the hero**: `Background.secondary`, radius 16, flat, 20 pt
padding, 48 pt clay-wash icon tile (`hand.raised`), `NEXT MOVE` mono over `Leah is waiting on two things` (Playfair Regular 30) over `A rug
colour since Aug 22 · a proposal by Sep 8 · your invoice is due Sep 1` (Inter 14 `Text.secondary`, two lines), clay ↗ trailing. 16 gap.
`DailyStoryCard` **as a 96 pt row**: 72 pt `hero`-gradient thumbnail left, `MAKER SPOTLIGHT` mono over `The Grain Whisperer of Maine` (Playfair
20) over `4 MIN READ`, clay unread dot **only if unopened**. **No Active Room card** — this account has no room, and the module is absent rather
than faked. Companion hearth: 64 pt charcoal circle, strata mark, hint `LEAH HARTWELL · YOUR DESIGNER`.

**Screen sheet.** *Purpose:* one screen that says what moved and what is owed, in that order. *Entry:* app root; Companion "Home". *Components:*
`DailyGreetingHeader` (existing, + the block), `TodayNextMoveCard` (existing, new branches + weight), `DailyStoryCard` (existing, compact
variant), `CompanionOverlay` (existing, new hint). *Data:* `BadgeCountService` (decisions/proposals/invoices/threads/projects), `current_phase`
from the same fetch, `StudioQueueBuilder` dates, `editorial_stories`, local last-seen. *States:* loading — cards as skeletons, header immediate;
**nothing moved — the block does not draw at all**; **re-opened inside 6 hours — the block holds its last content until the item is acted on,
and never re-dates itself**; empty queue — the Next Move names the phase; error — the existing partial-failure behaviour, never a fabricated
line. *Interactions:* `today_next_move_tapped` (`action_id: openStudioQueue`) → `AppRoute.studio`; block render → `today_moved_line_shown`;
story → `today_editorial_story_tapped`. *Tier:* engaged shows the match branch; discovering the room/pieces branch; guest the room ladder with
no block. *New vs today:* the block, the queue and phase branches, the card weights, the hint. *Dark:* `#211E1B` ground, `#2C2926` card,
`#F2EDE6` text, `#B5A487` mono, clay accents unchanged.

### M2 · Today — discovering, 9:10pm (Maya) · light
**Tier/state:** discovering, signed in, one room *[example: "Living Room", 18 × 14 ft]*, 3 saved pieces, heirloom band.

**Layout.** Header as M1; `WHAT MOVED` / "The jute rug has been in the Living Room since Sunday." *(wave 1; wave 2 replaces it with "Three new
pieces for the Living Room.")* Next Move: icon tile `sparkles`, `NEXT MOVE` / `Return to the Living Room` / "Three pieces are gathering there."
→ the room. Story row: `EDITOR'S NOTE / Patina: The slow shape of home`, `3 MIN READ`, dot on. `TodayActiveRoomCard`: 180 pt `warm` gradient
artwork, no `ROOM SCAN` chip (typed room, not scanned), then `ACTIVE ROOM` mono / `Living Room` (Playfair 26) / `18 × 14 ft · 3 pieces saved`
(Inter 14 muted) / **new** `$3,590 saved · your range $5K+` (DM Mono 10, `Text.secondary`) / chevron. Hearth hint: `LIVING ROOM · 3 SAVED`.

**Screen sheet.** *Purpose:* the nightly twenty minutes, with a room visibly closer to done. *Entry:* root. *Components:* as M1 +
`TodayActiveRoomCard` (existing, one new line). *Data:* `RoomStore` + `saved_items` for the spend; `StylePreferenceModel.budgetRange`'s
**display label** for the range — the person's own answer, printed as she gave it; wave 2 adds `get_recommendations.created_at` for the
new-pieces count. *States:* nothing moved → no block; band `TBD` → the money half omitted, not zeroed; unsynced saves → `SAVED ON THIS PHONE`.
*Interactions:* `today_next_move_tapped` (`action_id: exploreRoomNew`), `today_active_room_tapped` (`saved_item_count`). *Tier:* guest identical
minus the money half and the block. *New vs today:* the block, the fill line.

### M3 · Piece detail — Heirloom Oak Dining Table · light (discovering) + dark (activeProject)
**Tier/state:** light = discovering, no designer, buyable, one room on the device. Dark = activeProject, Leah engaged.

**Layout.** 340 pt hero photo (the seed's real image) with a floating bar: `BackChevronButton`, `?`, Share, ♥ — 36 pt circles, `offWhite` @92%,
pearl hairline. Content starts 24 below: maker tag `NORDIC ATELIER · AARHUS, DENMARK` *[example — `products.brand` is real, `vendors.made_in` is
empty on all 104 rows, F146]* (DM Mono 10); `Heirloom Oak Dining Table` (Playfair Regular 26); `Quarter-sawn white oak · Hand-rubbed tung oil`
(Inter 14 muted); price row `$4,200` (Playfair 26) — **and no match pill.** An unexplained percentage does not sit above a Buy button; where a
rationale exists it prints as words, and where it does not, nothing prints. **Three lines under the price:** `38″ W × 20″ D × 30″ H`
*[example]*, `38″ wide · your Living Room is 18 × 14 ft` (only when a room exists and both are non-null), `Ships in 10–12 weeks` *[example]* —
each omitted entirely when null. Then the seed's own description, provenance chips, and a maker-story card tinted `earth` — **drawn only once
the story↔product join exists (wave 3 delta).** Bottom action bar, above the 120 pt hearth, never under it: **light — primary `Buy it · $4,200`
(charcoal capsule, 52 pt) + secondary ghost `Get design help with this room`; dark — primary `Ask Leah to source this` + secondary ghost `Save
to the Living Room`.** Under the primary, Inter 12 muted: `Payment opens securely in Safari.`

**Screen sheet.** *Purpose:* decide, and act on the decision. *Entry:* browse card, Saved row, room item, `patina://piece/<id>`, push `product`.
*Components:* `ProductDetailView` (existing; SP-01 fixes the load, SP-10 the fields), **new** act bar. *Data:* `products` direct fetch with the
qualified vendor embed; `brand`, `dimensions`, `lead_time_weeks`, `shipping_flat_cents`, `returns_policy_key`, `photo_verified_at`. *States:*
loading — strata mark on `Background.secondary`; error — `"Couldn't load product"` / `"Let's try that again."` **with a back chevron** (SP-01);
not buyable → the primary becomes `Get design help with this room` at discovering, `Ask Leah to source this` once she has a designer; **guest
tapping Buy → the C9 auth sheet over context, nothing written until she signs in**. *Interactions:* `product_detail_opened`, `order_path_shown`
(prop `path`), `order_started`, `designer_ask_tapped`, `product_saved`. *Tier:* **a live designer relationship — accepted lead or active project
— replaces Buy with Ask, room or no room.** *New vs today:* the act bar, the three spec lines, the maker line's source, the pill's removal.

### M4 · The room — Living Room · light
**Tier/state:** discovering, one room *[example]*, three saved pieces.

**Layout.** 240 pt `warm` gradient hero with ⚙ top-right; `Living Room` (Playfair 32) at top 56 of the content; meta `18 × 14 FT · NORTH-FACING
· 2 WINDOWS · ENTERED AUG 24` (DM Mono 10) — **entered, not scanned** (F51). Stat row, two tiles not three — `3 ITEMS` and `$3,590 SAVED` —
**`IN AR` and the bare `MATCH` are gone** (SP-18). Under it one plain line, no track: `YOUR RANGE · $5K+ · FROM YOUR QUIZ ANSWER`. A bar that
fills as her money leaves is a meter, and she asked for figures. `YOUR ITEMS`: three rows, 64 pt thumbnail, name, maker, price **and the save
date** — `Velvet Club Chair · Article · $1,250 · saved Aug 24`, `Brass Arc Floor Lamp · Schoolhouse · $890 · saved Aug 22`, `Woven Jute Area Rug
8x10 · Studio Piet · $1,450 · saved Sunday` *[example dates]*. One primary act above the hearth: `Browse pieces for the Living Room` (SP-11's
single CTA).

**Screen sheet.** *Purpose:* the object of return — a room that visibly fills. *Entry:* Active Room card, Your Spaces, `patina://room/<uuid>`,
push `room`. *Components:* `RoomProjectView` (existing; SP-11/SP-18 do most of this), **new** range line and save dates. *Data:* `RoomStore`,
`saved_items`, `StylePreferenceModel.budgetRange` label. *States:* empty room → `"A blank canvas"` + one CTA; unsynced → `SAVED ON THIS PHONE`;
band `TBD` → the range line is absent, not zeroed. *Interactions:* `room_channel_viewed`, `product_detail_opened`, `marketplace_row_tapped`.
*Tier:* identical at every tier. *New vs today:* the honest stat row, the range line, the save dates, one CTA instead of three.

### M5 · The purchase — three panels, drawn side by side
**Tier/state:** discovering (Walt), Heirloom Oak Dining Table, one room on the device, **no live designer relationship** — the only tier where
this sheet exists. **The credited variant is drawn as an inset on 5a**: the roster case, where a designer sent him here and is credited without
being engaged — the one place "Credited to…" prints on a Buy sheet.

**5a · Order sheet** (`.medium` detent, hand-rolled header). Drag handle 36×4 muted @25%, top 18 / bottom 14. `Heirloom Oak Dining Table`
(Playfair Medium 18), sub `NORDIC ATELIER · MADE TO ORDER` (DM Mono 9). 24 pt gutter. 56 pt thumbnail beside `Quarter-sawn white oak`. Money
block, Inter 14, label left / figure right, pearl hairline between: `Piece  $4,200.00` · `White-glove delivery $350.00` *[example — from
`shipping_flat_cents`, folded into `amount_cents`]* · `Sales tax  added at checkout` · rule · `Total $4,550.00 plus tax` (Inter SemiBold).
**This total is the session's `amount_total`; the tax line draws only once `automatic_tax` is enabled, and the Buy control does not ship before
that decision is made.** Then: `38″ wide · your Living Room is 18 × 14 ft` · `Ships in 10–12 weeks.` · `If it arrives damaged, Patina handles
the claim with Nordic Atelier — one number, in your receipt.` **Inset, credited variant:** `Credited to Leah Hartwell.` *[example roster
designer]* Primary `Continue to payment` (52 pt charcoal capsule); caption `Payment opens securely in Safari. Apple Pay works there if it's set
up on this iPhone.`; ghost `Get design help with this room`.

**5b · Payment hand-off.** `SFSafariViewController` over the sheet: Safari chrome, the Stripe Checkout page with the Apple Pay button above the
card form, `$4,550.00` — drawn as the system surface it is, **no Patina chrome on it**, because pretending otherwise would be a lie about who
takes the money. **Third panel:** the Safari **success** page, because `successUrl` points at the client portal today
(`create-checkout-session/index.ts:553-554`) and the buyer must tap **Done** to come back. Wave 2 repoints it at the universal link that opens
`patina://order/<id>`; until then A draws the extra tap rather than implying the app catches the return.

**5c · Order placed.** Full screen, no sheet. `ORDERED · AUG 26` (DM Mono 10) / `Heirloom Oak Dining Table` (Playfair 26) / `Nordic Atelier ·
Aarhus`. A `success` badge reading `PAID`. Then: `$4,550.00 paid` · `Receipt emailed to walt@…` · `Nordic Atelier starts it this week. We'll
email you when it ships.` — **not** a fake tracker: the order joins `fulfillment_orders` at settle and its status is derived from line states no
vendor has acknowledged yet. Credited variant: `Leah Hartwell is credited on this order.` Buttons: `Back to Today`, ghost `Your orders`.

**Screen sheet (all three).** *Purpose:* take money without lying about what happens next. *Entry:* piece detail `Buy it`. *Components:* **all
new** — `OrderSheet`, existing `SafariView`, `OrderPlacedView`. *Data:* `create_direct_order` RPC → `create-checkout-session{direct_order_id}` →
`{url}` → `SFSafariViewController` → the invoice rail's 3s/60s poll on `direct_orders.status` → `fulfillment_orders` for everything after.
*States:* **not signed in — the C9 sheet first, over context, and the order is created only after**; creating — the button dims and spins;
hand-off failure — the app's own error state **above** the button with `Let's try that again` and `Get design help with this room` (SP-15's
shape); poll timeout → `"We haven't seen this payment yet. We'll update this as soon as it clears."`, never an unconditional bank-transfer
banner. *Interactions:* `order_started`, `order_checkout_opened`, `order_placed`, `order_failed`. *Tier:* the sheet never opens for a client
with a live designer relationship — Path B does. *New vs today:* everything; zero iOS code references `direct_order` at head.

### M6 · The return moment — Lock Screen push + the Today it opens
**Tier/state:** activeProject, notifications granted, proposal just sent.

**Left panel — Lock Screen.** iOS lock wallpaper, clock, one notification card: the Patina app icon, `Patina`, `now`, title **`Leah sent a
proposal`**, body **`Aspen Loft — Living Room Refresh. Read it by Sep 8.`** *[example date]*. Below it, the Lock Screen `accessoryRectangular`
widget: `LEAH SENT A PROPOSAL` / `Tuesday` — what moved, not what is owed. **Right panel — the app it opens:** M1's Today, its block reading
"Leah moved Aspen Loft into Installation & Styling on Monday. A proposal arrived Thursday.", so the push and the screen agree — the failure mode
we design against is a notification that opens a screen which knows nothing about it.

**Screen sheet.** *Purpose:* the one honest interruption. *Entry:* `notify_client_attention` → `apns-send`; widget timeline. *Components:*
system notification; **new** widget extension; `NotificationRouter` (existing, already handles `proposal`). *Data:* `notification_log` +
`device_push_tokens`; the widget reads a small App Group cache written on every badge refresh. *States:* permission not granted → no push; the
feed and email carry it; nothing waiting → `NOTHING NEEDS YOU` / the room; signed out → wordmark only. *Interactions:* `push_received`,
`push_opened` (`entity_type`), `widget_tapped`. *Tier:* engaged gets only the design-request pushes that already fire; discovering and guest get
none and are never asked. *New vs today:* the send for money and decisions, the widget target, the pre-permission screen.

### M7 · The Companion, expanded — Your Designer *(extra)*
**Tier/state:** activeProject, panel open on the home; the engaged variant is identical minus the `What's waiting` count, with `Message Leah`
calling `rpc_start_direct_thread`.

**Layout.** The panel rises from the hearth over a dimmed home: `Background.primary`, 24 pt radius, 24 pt gutter. Header row — 44 pt portrait or
clay monogram, `Leah Hartwell` (Playfair Medium 18), `YOUR DESIGNER · HARTWELL & CO · NCIDQ` (DM Mono 9, from `IntroductionInfo`). Then five
rows, 56 pt each, pearl hairlines, chevrons: **`What's waiting`** with a trailing `3` — **suggested (clay wash on the tile) because the queue is
non-empty** — then `Message Leah`, `Your Studio` (→ `AppRoute.studio`, not a bare projects list), `Saved`, `Your profile`. **When the queue is
empty the suggestion moves to `Message Leah`** and `What's waiting` reads `Nothing right now`. No records, no counts beyond the one summary.

**Screen sheet.** *Purpose:* make the relationship layer hold a relationship. *Entry:* the hearth, anywhere. *Components:* `CompanionOverlay`
(existing), `CompanionAreaBuilders` (existing rows), **new** header. *Data:* `profiles`, `StudioIdentityService.identity(forDesigner:)`,
`IntroductionInfo`, `BadgeCountService`. *States:* no designer → today's `"Where to next?"` panel, unchanged; **nil identity → the name and
monogram still draw** (the defect today is the whole view rendering nothing, `StudioIdentityLine.swift:15-17`); loading → the header reserves
its height. *Interactions:* `companion_panel_opened`, `companion_quick_action_tapped`. *Tier:* header at engaged and above. *New vs today:* the
header, the message row, the state-driven suggestion; the row cap and the ≤1-suggested rule are unchanged.

### M8 · The permission moment *(extra, wave 2)*
**Tier/state:** activeProject, first proposal has just landed, permission never asked.

**Layout.** A full-bleed `Background.primary` sheet, no chrome. Strata mark, 32 pt. `Playfair Regular 26`: `Only when something needs you.` Then
Inter 16 `Text.secondary`, SP-08's sentence verbatim and the only version of it in this document: `We'll tell you when your designer sends
something that needs you — a decision, a proposal, or an invoice. Nothing else.` Then three DM Mono lines with clay dots: `A DECISION TO MAKE` ·
`A PROPOSAL TO READ` · `AN INVOICE COMING DUE`. Primary `Turn on notifications`; ghost `Not now`.

**Screen sheet.** *Purpose:* spend the one grant well. *Entry:* the first client-facing `notification_log` row of type
proposal/decision/invoice. *Components:* **new** screen; existing `PushTokenService`. *Data:* none — copy only. *States:* **declined our screen
→ never asked again, Settings carries the switch; denied the system prompt → iOS will not show it again this install, and the Settings row
deep-links there.** *Interactions:* `push_permission_prompted` (`trigger`, `outcome`). *Tier:* engaged and activeProject only. *New vs today:*
the app has no pre-permission copy anywhere.

### M9 · Today — engaged (James) *(extra)*
**Tier/state:** engaged — one accepted lead, designer matched, no project yet (`james.okafor@example.com`, C29).

**Layout.** Header + `WHAT MOVED` / "Leah Hartwell picked up your request on the 18th." *[example date]*. Next Move: `NEXT MOVE` / `You're
matched with Leah Hartwell` / `You're working with Leah Hartwell.` → `.designRequests`. Story row. No Active Room. Hearth hint `LEAH HARTWELL ·
YOUR DESIGNER`.

**Screen sheet.** *Purpose:* the tier that is currently byte-identical to guest. *Entry:* root. *Components:* existing —
`TodayExperience.swift:80-91` renders this branch already; SP-07's one-line filter fix is what lets it run. **Copy correction from v1:** today
the stage's `cardTitle` lands in the *detail* slot under the fixed title `"See your design request"` (`DailyRoomView.swift:184-191`); A swaps
them so the title is `.matched`'s `cardTitle` and the detail its own subtitle (`DesignRequestStatusService.swift:158-215`) — one title/detail
swap, not a new card. *Data:* `leads` + `match_ceremonies` via `DesignRequestStatusService`. *States:* stage advances change the copy from the
existing stage table, verbatim; terminal stages hold for 14 days from **last seen**, capped at 60 days. *Interactions:* `today_next_move_tapped`
(`action_id: trackDesignRequest`). *Tier:* engaged only. *New vs today:* the block, the decay re-anchor, the title/detail swap.

## 12. Critique log

Every blocking and major item from the four critiques is built into the document above, except the two answered with a reason at the end.

**Homeowner.** B1 → no daily reward is staged at discovering in wave 1, the line draws only when something moved, and the discovering branch is
gated on a banked-story floor and a named weekly owner (§1, §8.5). B2 → the band is printed as the quiz's own label, the point figure is gone,
the room-budget question is named with its cost (§3). B3 → the phase leads the line from `current_phase` already on the device; F76/F125
claimed; §5 says plainly that a designer-sourced piece has no client status until the wave-2 policy. B4 → the guest row reads *absent*; A's day
begins at sign-in. J1 → `AppRoute.studio` is slice item 1, F50 claimed. J2 → one promise, SP-08's, in §4 and M8. J3 → one ask, ever. J4 → the
widget carries what moved. J5 → "Leah is waiting on two things"; the invoice is asked for in Patina's voice. J6 → `products.photo_verified_at`.
J7 → the fit line on M3 and M5a. J8 → F51 taken, F101 declined in §8.8. J9 → the empty-queue Next Move names the phase. J10 → the gate names the
money screens. J11 → one taste vocabulary is a §9 prerequisite. **n1–n9 all taken:** the eyebrow no longer dates the person; nothing-moved draws
nothing; the budget track is gone; sign-out resets last-seen; SP-03's claim is narrowed; the maker-story join is a named delta or the card does
not draw; active projects sort first; Saved rows carry date and room; Path C at discovering is labelled `Get design help with this room`.

**Designer.** B1 → the gate moves to client scope, and attribution now covers the roster case, which makes the credited order sheet a real
screen (inset on M5a). M1 → card weight follows content. M2 → the suggested row is state-driven. M3 → §6 names the designer-facing return path
as a wave-2 prerequisite with an owner. M4 → the FF&E sentence is corrected to what SP-13 does. M5 → the push fires once per entity transition.
M6 → the match pill comes off the piece detail. M7 → §8.1 prices the relationship cost too, separating engaged (the hint carries her name daily)
from discovering (nothing does). M8 → F76/F125 claimed, wave 2. m1 → most-recent roster row wins, a tie draws no credit; m2 → the portal
earnings row is tracked; m3 → proposal selections read the photo feed (§7); m4 → §6 confirms the engaged panel.

**Feasibility.** B1 → the slice ships the attention half only; the catalog half rides SP-10's DROP/recreate with `created_at`. B2 → the sheet
prints the session's own total; freight folds into `amount_cents`; `automatic_tax` is a named delta and a named business decision that gates the
button. B3 → adopted whole: settled direct orders become `fulfillment_orders` rows through `fulfillment-intake`; nine columns and a second ops
surface are deleted; the damage sentence is backed by `fulfillment_exceptions`; the missing piece is one client-scoped RLS policy. B4 → §3. A1 →
F186/F188/F209 dropped, declined in §8.7. A2 → the six-hour suppression rule is in M1's states. A3 → prerequisites named, slice cut to 10 days,
the permission moment moved to wave 2. A4 → the second `identity(forDesigner:)` initializer and the nil-identity fix. A5 → a device push probe
gates the permission moment. A6 → the authorization is spent, not rolled back. A7 → §3 names Option B's memory clause and what clearing memory
does. A8 → `order_id` + `commission_rate` + partial unique index + `ON CONFLICT DO NOTHING`. A9 → the C9 soft wall, nothing written until
sign-in. A10 → the Safari success page is drawn and the universal-link repoint is a named delta. **Minors 1–10 and 12 all taken** (M9's copy
corrected; the Studio route priced; F04=F31=F32 merged; only the promotion window re-anchors, capped at 60 days; 4.8 and the design-fee invoice
named; `fulfillment_config`'s 0.16 default cited).

**Canon.** B1 → §8.10 names R32's order, the item A builds ahead of it, A's reading of C24, and hands it over. M1 → `Let's try that again`
everywhere. M2 → the guest wall. N1 → the `Message Leah` divergence is named. N2 → F17 cited. N3 → every mock date is `[example]`.

**Answered with a reason, not a change.**

1. **Canon M3 — "F158's citation is scoped to a screen A never draws."** Respectfully, no: SP-18's own "What changes" names Profile explicitly —
   *"Profile's `63% MATCH` … gets the rationale line the app already computes, or comes down"* — and lists **F158** among its findings answered
   (`source/shared-planks.md`, SP-18). The plank touches Profile; A inherits it; the citation stands. The adjacent half of the objection is
   right and is fixed: SP-18 does *not* cover the per-piece pill, so A takes the `88% MATCH` capsule off the piece detail itself (designer M6).
2. **Feasibility minor 11 — "put the `apns-send` call in `notification-dispatch` instead."** A keeps the SQL shape: that function's push branch
   writes a `notification_log` row and returns, commented *"actual push integration is future work"* (`notification-dispatch/index.ts:184-208`),
   and **no money path calls it**. SP-08's durable half writes its client-facing rows from the write paths themselves
   (`00092_decision_cron.sql`, `invoice-reminders`, `proposal-send`), because `notification_log`'s INSERT policy is service-role only. Putting
   the push inside `notify_client_attention` keeps it in the same transaction as the row it announces, so a client is never buzzed about a row
   that rolled back. **If SP-08 routes those three paths through `notification-dispatch` instead, A's call site moves there and the migration
   disappears** — coordination, not disagreement.
