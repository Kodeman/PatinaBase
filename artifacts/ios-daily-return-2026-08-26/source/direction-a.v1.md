# Direction A — Since You Were Here

**Within canon. Zero amendments.** No tab bar (C1). Option B's Today contract stands (C23). Canonical
names (C4). Honesty (C5). Brand voice (C6). Everything below is built on the twenty shared planks;
none of it is restated here.

---

## 1. Name, thesis, and the day it is built around

**Thesis.** The app already ships one card for the one thing that matters, one orb that is supposed
to be the relationship, and one screen where the work lives — and all three are currently empty of
the other person. Direction A fills them, and adds one line that says what moved while you were
gone. No new modules, no new navigation.

The word Patina owns and nobody else can is **somebody else did something about your house while you
were asleep.** That is the only genuinely variable reward in the product (U1 §3), it is fully
computed on the backend, and it is rendered nowhere a returning person looks. A puts it on the first
screen in the one place the contract already gives us: the Today header, the one Next Move, and the
Companion's collapsed hint.

The surface keeps its shipped name on screen — the header word is **"Today"** (C23); the Daily Room
is what we call it in code and in this document.

### The day

**7:40am — Walt, Madison, discovering, no designer, no order.** First screen: `WEDNESDAY · AUG 26` /
`Today`, then one mono line under it — `SINCE YOU WERE HERE · SATURDAY` / "A new story, and two new
pieces." Below it the Next Move, then the story card — `MATERIAL STUDY / A defense of imperfect
linen / On wrinkles, slubs, and the quiet honesty of natural fibers` — with an unread dot that is on
because he has not opened *that* story, and goes off when he does. If nothing published and nothing
arrived, the line reads "Nothing new since Saturday." and he closes the app in four seconds with his
time respected. That is the bargain, and it is the one he already keeps with the Journal Sentinel.

**12:30pm — Ruth, Des Moines, activeProject.** First screen: the same header, then
`SINCE YOU WERE HERE · THURSDAY` / "Leah sent a proposal, and your invoice came due." Then the one
Next Move, which is no longer one decision out of four items: `NEXT MOVE` / **"Leah is waiting on
three things"** / "A rug colour since Aug 22 · $4,250 due Sep 1 · a proposal by Sep 8" → opens
**Your Studio**. Below it, the story. She has no room, so no Active Room card renders — the home is
three blocks and that is honest. The Companion's collapsed hint reads `LEAH HARTWELL · YOUR
DESIGNER`, and tapping it opens a panel whose first row is **"Message Leah"**.

**9:10pm — Maya, Grand Rapids, discovering, one room.** First screen: `SINCE YOU WERE HERE ·
YESTERDAY` / "Three new pieces for the Living Room." The Next Move is **"Three new pieces for the
Living Room"** / "New this week, chosen for this room." → opens the room-scoped Browse pieces (the
existing `.roomEmergence` route). Below the story: `ACTIVE ROOM / Living Room / 18 × 14 ft · 3 pieces
saved / $3,590 of your $9,000`. That last line is the ritual — a room getting fuller, computed from
saves the app can finally hold (SP-11, SP-14) against the budget the quiz already collected.

**After two weeks away.** `SINCE YOU WERE HERE · TWO WEEKS AGO`, and then the same one sentence,
built from the same counts, with dates: "Leah sent a proposal on the 3rd, and your invoice came due
on the 1st." Nothing scolds. Nothing decayed while she was gone: the two silent fourteen-day timers
(the design-request promotion window and the Companion's graduation to `.learned`) re-anchor to
**last-seen**, not to wall-clock, so absence does not quietly delete the one card that explains her
designer (F189).

---

## 2. Home composition per tier

Four modules, in the shipped order, at every tier — plus one line inside the existing header. Nothing
is added below the Active Room; the home still does not scroll into a rail.

| Order | Block | guest | discovering | engaged | activeProject |
|---|---|---|---|---|---|
| 1 | `DailyGreetingHeader` — date · `Today` · `?` · bell · monogram | as today | as today | as today | as today |
| 1b | **Since-you-were-here line** (new, inside the header block) | absent on first launch; from the second launch on | yes | yes | yes |
| 2 | `TodayNextMoveCard` — one move | room ladder | room / new-pieces / room-scoped Browse | **"You're matched with {designer}"** | **the attention queue, named by the designer** |
| 3 | `DailyStoryCard` | yes | yes | yes | yes |
| 4 | `TodayActiveRoomCard` | when a room exists | when a room exists + fill line | when a room exists | when a room exists (absent for `client@patina.dev`, which has none) |
| — | Companion hearth, 120 pt | hint: "Look around" | hint: room + saved count | hint: **`{DESIGNER} · YOUR DESIGNER`** | hint: **`{DESIGNER} · YOUR DESIGNER`** |

**Where the C2-vs-C23 conflict is being leaned on, named for Kody.** Two places, both small.

1. **The since-line lives in the header block, not as a fifth module.** The Today contract constrains
   what Today *presents* — "exactly one prioritized next move, one real editorial or taste story, and
   one active room" — and says nothing about the greeting header, which already carries a date, a help
   glyph, a bell and a monogram. A adds one mono label and one sentence there. Read the contract as
   "four blocks, full stop" and this is an amendment and A is wrong; I read it as a count constraint on
   the modules, with the date line as precedent. **Your call.**
2. **The one Next Move carries the whole waiting queue.** "Exactly one prioritized next move" is one
   card, one route, one act, and A keeps that — one card, one arrow, into **Your Studio**. The detail
   line names what is behind it, in date order, because a count you cannot see behind is the thing
   Ruth stopped believing (F41). U1 reached the same reading independently (U1 §7 item 4).

**What A re-mounts from the orphaned July rail:** nothing on the home. Not `StudioHubSection`, not
`MarketplaceLinksSection`, not `WorkWithDesignerCTA`, not `RoomChipRail`, not `DailyProductCard`. The
brief permits a Studio door "below the four modules" if the acceptance doc allows it — I do not think
it does, and I would rather answer the same findings through a card the contract already grants me.
`AddToRoomSheet` and `AddedToRoomToast` do get mounted, but by SP-11/SP-14, not by A.

**What is honestly new day to day, per tier.**

- **guest / discovering** — the story, when editorial publishes (see §4); new catalog rows since the
  last visit, from `products.created_at`; the room's own fill, which only the person can move. If
  none of those changed, the line says so.
- **engaged** — the design request's stage, which advances without the person: `held → inTouch →
  introduced → booked → matched`. Every one of those transitions is already a real event with real
  copy (`DesignRequestStatusService:118-190`) and, for the accept, already fires a push
  (`00330_accept_design_request.sql:182`).
- **activeProject** — the designer. Proposals sent, decisions raised, invoices issued, messages
  answered, phases advanced. All of it already exists server-side and none of it reaches Today.

---

## 3. The investment the app remembers, and where it shows on return

| Investment | Where it is stored | Where it shows on return under A |
|---|---|---|
| The room | SwiftData `RoomModel` + `rooms` | Active Room card, with the fill line: `18 × 14 ft · 3 pieces saved · $3,590 of your $9,000` |
| Saved pieces | `TableItemModel` + `saved_items` (SP-14 makes it durable) | the room's fill line, the room's item list, the Saved door |
| Taste portrait | `StylePreferenceModel` + `client_style_profiles` | the room's budget band now uses the quiz's real `budgetRange` instead of the hard-coded $2K–$5K; the feed already scores against it server-side |
| Design-request draft | SwiftData `DesignRequestDraft` | Next Move — "Finish your design request" (unchanged; it is the best-designed memory in the product) |
| Submitted request | `leads` | Next Move — the stage line, made visible by SP-07 |
| The waiting queue | server: decisions, proposals, invoices, threads | Next Move, one card, with dates |
| **Last seen** (new) | one local timestamp, per device | the since-line, and the re-anchored 14-day windows |
| **Last story read** (new) | one local story id | the unread dot, which now earns itself |

Two of eight were visible on return before (U1 §2); under A it is eight of ten, and the two new ones
are one `UserDefaults` key each. **Last-seen is per device, and A says so**: open Patina on a second
phone and the since-line behaves as if it were a first visit there. A server-side `client_last_seen`
is a wave-3 item, not a first slice.

---

## 4. Return surfaces beyond the app

### Notifications — what earns the permission

**The promise, and the whole promise:** *we will tell you when your designer sends something that
needs you — a decision, a proposal, or an invoice — and when a piece you bought ships. Nothing else.*
No marketing, no "you haven't visited", no new-piece alerts: those live on the home, and Maya's 9pm
ritual does not need a buzz to start.

**When we ask.** Not at cold launch, and not after a design-request submission — which is what happens
today (`PushTokenService.swift:87-108`) and is unrelated to money. A asks at **the first real event**:
the client has a designer and the first proposal / decision / invoice has just landed in the feed. One
screen of copy first (SP-08's sentence, verbatim), then the system prompt. Decline, and the in-app feed
and email still carry everything; we ask once more, months later, only on a *payment overdue and
unread*. `push_permission_prompted` (`trigger`, `outcome`) is new — there is no instrumentation on this
today at all (F190).

**Who sends it.**

| Event | Carrier | Cost |
|---|---|---|
| Designer accepts your request | **existing caller #1**, `accept_design_request` (00330) | **zero** — it already fires |
| Match ceremony / consult slots | **existing callers #2, #3** (00331, 00334) | zero |
| Proposal sent · decision raised · invoice sent or due | **one new call site** | one SECURITY DEFINER function, `notify_client_attention(entity_type, entity_id, client_id)`, containing the single new `PERFORM public.invoke_edge_function('apns-send', …)`, called from the three existing write paths (`proposal-send`, `00092_decision_cron.sql`, `invoice-send` / `invoice-reminders`). Those three paths already write the client-facing `notification_log` row under SP-08; A adds the push next to the row. One call site, three sources, on a pattern proven three times in SQL. |
| A piece you bought ships | **existing caller #4**, `fulfillment-notify` — for **Path B** (designer-sourced, BOH `fulfillment_orders`) only, and only when an operator presses send | zero, and honestly limited: **A does not pretend Path A direct orders get shipping push in wave 1.** See §5. |

Push payloads carry `entity_type` / `entity_id`; `NotificationRouter` already routes `proposal`,
`invoice`, `decision` and has been waiting for a sender (`NotificationRouter.swift:66-74`). New
events: `push_received`, `push_opened` (prop `entity_type`).

### Widgets

**One new app-extension target.** The project declares exactly three targets today and no extension
of any kind (`project.pbxproj:177,200,223`), so this is a real cost, priced honestly: a WidgetKit
extension, an App Group so the app can hand it a small cached payload on every badge refresh, a
timeline provider that refreshes on app foreground and on push, provisioning for a second bundle id,
and a second thing to keep in sync at review time. Call it **one engineer-week in wave 3**, not a
free win.

What it shows — small Home Screen widget and Lock Screen `accessoryRectangular`, same content:

- with work waiting: `3 THINGS WAITING` / "Rug colour · overdue Aug 22"
- with nothing waiting: `NOTHING NEEDS YOU` / "Living Room · 3 pieces"
- signed out: the strata mark and the wordmark. Nothing else.

No badge number invented, no count of anything the person did not do. Deep-links via `patina://` into
the Studio or the room. New event: `widget_tapped`.

**Live Activities: no.** They fit exactly one thing — a delivery or install window — and A's wave-1
order machine stops at `paid` (§5). Proposing one now would be proposing a countdown for a date we do
not have. **Wallet pass: no.** There is no honest artifact.

### Email

Email is already the durable rail and already cron-scheduled — `invoice-reminders`, `proposal-nudge`,
`decision-resolved-notify`, the direct-order receipt and failure mails, all through
`_shared/send-email.ts`. A changes two things, both cheap: the proposal **signature confirmation**
`sign_proposal` never sends (SP-04), and — the one with leverage — every link in those mails lands
**in the app**, because SP-03 adds associated domains. Until that ships, an email about an invoice
opens a web page and the app never sees the return.

---

## 5. The purchase path

**The rail is the one that exists.** `public.direct_orders` (00276) + `create_direct_order` +
`create-checkout-session`'s `direct_order_id` branch + `stripe-webhook`'s settle branch + the receipt
email (C24). Money is taken in **hosted Stripe Checkout inside `SFSafariViewController`** — the same
container the invoice screen already uses — and **Apple Pay is already inside it** (C25): both session
paths include `card`, and Apple Pay on the Web works in `SFSafariViewController`. A ships no
PaymentSheet: it buys a native sheet and one fewer context switch, and costs an SPM dependency, a
merchant-id entitlement, a new backend mode, and a re-do of ACH, surcharge and settle-polling. **A
does add the one thing nobody has done: open a real Checkout on a real device with a card in Wallet
and look.** That probe is a task in wave 1, not a build.

**Apple compliance.** Physical goods, external payment, no IAP — Guidelines 3.1.3(e) / 3.1.5(a). A
sells no digital service in the app, so 3.1.1 is not opened.

### Three paths, and the rule that picks between them

| Path | Who sees it | The rule |
|---|---|---|
| **A · Buy it** | any tier, when the piece is buyable and **no designer is engaged on the room it is for** | `create_direct_order` → hosted Checkout → receipt |
| **B · Ask your designer to source this** | any tier where a designer is engaged | opens the project thread with the piece named (SP-13's RPC), so the piece lands on her FF&E schedule and her margin, not ours |
| **C · Ask about this piece** | when the piece is not buyable — no shipping figure, no lead time, or bespoke | opens the same thread at engaged/activeProject; at discovering it opens `Get design help` with the piece attached |

**The rule, stated once: a designer engaged on the room pre-empts Buy.** Not the tier badge — the
relationship. Path B is what Leah and Tom said would keep them sending clients here, and Path A
appearing where she is engaged is the single thing that would stop them.

**What "buyable" means, and why it is a gate rather than a fabrication.** A piece is buyable only
when it carries a maker, a real photograph, dimensions, a lead time, a flat shipping figure and a
returns/damage owner. Four exist as columns today, two do not — A's migration adds
`products.shipping_flat_cents` and `products.returns_policy_key`, riding SP-10's
`get_recommendations` DROP/recreate rather than opening a second one, and the **Buy** control does not
draw unless all six are non-null. That is a small number of pieces at first, and it is correct: sell
six honestly rather than twenty-one with the dimensions missing. Everything else shows Path C.

### The order state machine

```
   create_direct_order → pending_payment ──→ canceled
                                │ checkout.session.completed
                                ▼
                              paid ──→ refunded          (00277 trigger, exists)
                                │
   fulfillment_status:  unfulfilled → confirmed → in_production → shipped → delivered
                                        (wave 2; eta_change / substitution are events, not states)
```

One migration on `direct_orders`: `fulfillment_status` (default `'unfulfilled'`, CHECK over the five
values), `shipped_at`, `delivered_at`, `tracking_number`, `carrier`, `eta_date` — **adopting
`fulfillment-notify`'s vocabulary verbatim** (`_shared/fulfillment-templates.ts:31-37`) so one push
template set serves both rails. The writer is ops or an edge function; the client never gets an
UPDATE policy. **Wave 1 ships `unfulfilled` only** and says so on screen: "Ordered Aug 26. Nordic
Atelier starts it this week — we'll email you when it ships."

### Attribution — the open decision, and A's answer

**Propose:** the same migration adds `designer_id`, `project_id` and `commission_rate` to
`direct_orders`, **snapshotted at create time**, and `stripe-webhook`'s settle branch inserts a
`designer_earnings` row the way `00277_refund_reconciliation.sql:183-208` already does from
`invoice_payments`. The rule: **if the buyer has a live designer relationship — an accepted lead or an
active project — every direct order she places is credited to that designer**, whether or not the
designer picked the piece, at `products.commission_rate` where set and a platform default otherwise.
Not "only pieces the designer selected": the client cannot be asked to adjudicate that, and any rule
with a gap in it is a rule Tom will find the gap in.

**Price:** one migration (three columns + three on the fulfillment side, one CHECK), one designer
resolution query inside `create_direct_order` (it is already SECURITY DEFINER), one branch in the
webhook settle, and one row in the designer portal so she can see it. Roughly a week of backend, and
**free today** — the client rail is unbuilt, so nothing needs backfilling. After the Buy button ships,
the same change means reconciling money that already moved.

**The alternative, named:** ship Buy with no attribution, which is what the table does today and what
`00301_marketplace_vitals.sql:37-40` documents. That is the version D3 said he would walk over, and
he is right to: it makes the client app the thing designers were afraid of before they opened it.

### What Walt sees before he pays $4,000

On the piece: the maker and the town · a photograph of the actual piece · `38″ W × 20″ D × 30″ H` ·
`Ships in 10–12 weeks` · materials in words · the maker's story attached to the object, not floating
on the home screen. On the order sheet, before he commits: the piece, shipping named as white-glove
with a figure, tax stated as calculated at checkout, the total, the lead time repeated, **who answers
if it arrives scuffed**, and — when a designer is engaged — the line "Credited to Leah Hartwell."
After: an order row that persists, the receipt email, and the order visible in Your Studio forever.

### What D3 sees after

The order on his schedule with the client, the piece and the date; the commission credited on his
earnings ledger; and, because `project_id` is on the row, the piece attached to the job rather than
floating in a marketplace he cannot see. The FF&E line itself is written in the designer portal —
that build is outside this lane and A says so rather than implying it is free.

---

## 6. The designer in the client's home

**Visible.** The Companion is Option B's declared relationship layer and it currently holds no
relationship. Under A, from the moment a designer is claimed:

- the collapsed hint reads `LEAH HARTWELL · YOUR DESIGNER` instead of a count;
- the expanded panel is headed by her — portrait or monogram from `profiles.avatar_url`, her name,
  and one line of studio and credential from the introduction payload the app already receives
  (`IntroductionInfo.credentialLine`) — and its first row is **"Message Leah"**;
- the Next Move names her: "Leah is waiting on three things";
- every notification says who sent it;
- `StudioIdentityLine` — which exists and is mounted only on the project detail — is reused in the
  panel header, and gets the fallback it lacks so a solo designer with no brand logo is not invisible.

The panel stays inside its contract: ≤6 rows, one suggested, "a concise attention summary" and doors —
the records stay in Your Studio.

**Credited.** §5. Path B first, Path A attributed, the credit line printed on the order sheet where
the client can see it. A client who knows her designer is paid for the piece has one fewer reason to
buy it somewhere else.

**Protected.** Buy never appears on a room she is engaged on. Threads open on projects she already
owns, with the system message the RPC writes. There is no "compare designers", no rating, no
marketplace of professionals inside a client's own house.

---

## 7. Findings answered

| Findings | What changes under A |
|---|---|
| F13, F16 (=F34), F186, F188, F209 | the since-line: a first screen that differs after two weeks, built on a real last-seen timestamp |
| F30 (=F37), F80, F91, F58, F41 | the Next Move carries the whole waiting queue with dates, from the one `BadgeCountService` count |
| F11, F98, F121, F126, F134, F119 | the money rail and Browse both get a home door — the Next Move card — without a fifth module or a tab bar |
| F09, F79, F25, F73, F160 | the designer is named on Today, in the Companion hint, in the panel header, and in every notification |
| F189 | the two silent 14-day decays re-anchor to last-seen; absence stops deleting the card that explains her |
| F46, F61, F131, F13 | the unread dot earns itself from a stored read; the story served is the highest-`sort_order` one the reader has *not* opened; editorial commits to a weekly publish, and the app never claims a cadence editorial is not keeping |
| F07, F38, F199, F127 | one new `apns-send` call site carries proposal / decision / invoice; the existing caller already carries the designer-accept |
| F47, F167 | the permission is asked at the first real event, after one screen that names exactly what will be sent |
| F130 | one small widget on Home and Lock Screen, priced as a new target |
| F190 | `today_since_line_shown/tapped`, `push_permission_prompted`, `push_received/opened`, `widget_tapped`, `order_path_shown`, `order_started`, `order_placed` |
| F12, F32, F151, F153 | Buy it / Ask your designer / Ask about this piece, on the rail that already exists |
| F19, F66, F154 | an order object in the client app, and a fulfillment vocabulary borrowed rather than invented |
| F22 (=F26), F152 | attribution snapshotted on `direct_orders` and credited to `designer_earnings` at settle |
| F144, F86 (with SP-10) | shipping figure, returns owner and lead time become the gate on the Buy control rather than missing copy |
| F123, F65, F15 (with SP-11/SP-14) | the room fill line — pieces and money against the quiz's real budget |
| F99, F101, F51 | an activeProject client with no room is never pitched a scan as her next move |
| F158 (with SP-18) | the unexplained match percentage comes down; the room's budget band is a real number the person chose |

Everything else in the 213 is a shared plank, refuted, or declined below.

---

## 8. Amendments — none. Where A declines, and what it costs

**Zero amendments.** No canon row is bent. Here is what that costs, plainly.

1. **No tab bar (C1).** The home still has no permanent Browse, Saved or Studio door. A gets Ruth to
   her money and Maya to her pieces through the one Next Move — which works only while that card is
   pointed at the right thing. On the day Ruth has nothing waiting, her route back to the Studio is
   the 36-point monogram again (F126, F134 survive at reduced severity). **This is the single largest
   thing Direction B can beat A on.**
2. **No fifth module, no Studio rail on the home (C23).** An activeProject client cannot see her
   three projects, four proposals and open invoice on the first screen — only the count and the next
   act. F11 is answered by a door, not by presence.
3. **No household, no second seat, no shared room (C2/C23 silent, but it is a new object).** Maya's
   third reason to open the app daily — "Devon in here with me" — goes unanswered. F54, F105, F129,
   F168 stand. Every $2,000 decision in that house is made by two people on one couch, and A gives
   them one phone.
4. **No search, no compare, no notes on a saved piece.** F43, F52, F162, F170 stand. Twenty-one rows
   and five client-side chips is a browse surface for a catalog that has not arrived yet; A does not
   build search ahead of inventory.
5. **No per-user story algorithm.** A commits editorial to a weekly publish and earns the dot; it
   does not build a rotation RPC for a table with three rows. If editorial does not publish, Walt's
   7:40am reward is "nothing new", honestly — and that is a business commitment A cannot make for
   Kody. **Flagged as a dependency, not a build.**
6. **No AR.** SP-18 takes the affordances down; A does not put them back. `usdz_url` is null on every
   row and an asset pipeline is a different program (F64, F110, F182).
7. **No shipping push for a direct order in wave 1**, because `fulfillment_status` lands in wave 2 and
   `fulfillment-notify` rides the designer-sourced rail only. F198 stands until then.
8. **No PaymentSheet, no in-app card entry.** One context switch into Safari remains. F200 is
   answered with a sentence, not a native sheet.

---

## 9. First slice, waves, deltas, risks, rollback

### First slice — two weeks, one iOS engineer + edge functions

Everything here is client-side except one function, and none of it needs the SP-10 migration.

1. **Last seen + the since-line.** Two `UserDefaults` keys; one sentence builder over counts the home
   already fetches on appear; truthful fallback when nothing moved. *(iOS, 3 days)*
2. **The Next Move carries the queue.** One new branch at the top of `TodayExperience.nextMove`, fed by
   `BadgeCountService`, routing to `.profile → StudioHub` — or, better, straight to the Studio once it
   has its own route. Dates come from `StudioQueueBuilder`, which computes them already. *(2 days)*
3. **The Companion holds the designer.** Hint, panel header, "Message Leah" as the first row, reusing
   `StudioIdentityLine` and the introduction payload. *(3 days)*
4. **The unread dot earns itself.** One stored story id; serve the highest unopened. *(1 day)*
5. **Decays re-anchor to last-seen.** Two comparisons. *(0.5 day)*
6. **The permission moment moves** to the first real event, behind SP-08's screen; instrument the
   outcome. *(1 day)*
7. **`notify_client_attention`** — the one new push call site, wired to the three existing write
   paths. *(edge/SQL, 2 days)*
8. **The Apple Pay probe** — one device, one card in Wallet, one real invoice Checkout, one
   screenshot. *(1 hour, and it decides §5's copy)*

**Gate:** `xcodebuild` on the Patina scheme plus the app's unit tests, then a Simulator pass at
Dynamic Type XXL and in dark mode on the home, the Studio and the Companion panel — per
`patina-ios-verification`; nothing here is a device claim except the Apple Pay probe, which is
explicitly a device claim.

### Waves

- **Wave 2 — the purchase.** The migration (`direct_orders`: attribution + fulfillment columns;
  `products`: `shipping_flat_cents`, `returns_policy_key`, riding SP-10's DROP/recreate), the
  `create_direct_order` designer resolution, the webhook's `designer_earnings` branch, and the three
  new iOS screens: the act bar on the piece, the order sheet, the order placed / order detail. The
  designer-portal row that shows her the credit is portal work, sequenced alongside.
- **Wave 3 — the surfaces.** Fulfillment states written by ops, shipping push through
  `fulfillment-notify`'s vocabulary, order history in Your Studio, and the widget target.
- **Wave 4 — the catalog pass.** Editorial fills `vendors.made_in` / `brand_story`, dimensions, lead
  times, shipping figures and real photography. Not engineering, and the thing that decides whether
  any of this sells anything.

### Backend deltas (C13-compliant: migrations + edge functions only, no new services)

| Delta | Kind | Wave |
|---|---|---|
| `notify_client_attention()` SECURITY DEFINER + one `invoke_edge_function('apns-send', …)` | migration | 1 |
| `direct_orders`: `designer_id`, `project_id`, `commission_rate` | migration | 2 |
| `direct_orders`: `fulfillment_status`, `shipped_at`, `delivered_at`, `tracking_number`, `carrier`, `eta_date` | migration | 2 |
| `create_direct_order`: resolve + snapshot the designer | migration (CREATE OR REPLACE) | 2 |
| `stripe-webhook`: `designer_earnings` insert on direct-order settle | edge function | 2 |
| `products`: `shipping_flat_cents`, `returns_policy_key` + projection through `get_recommendations` | migration, riding SP-10 | 2 |
| an ops write path for `fulfillment_status` | edge function or admin portal | 3 |

No new tables beyond columns; no cron; no realtime — the badge poll floor stays (R29).

### Risks

- **Apple review.** External payment for physical goods is the compliant path and A stays on it. The
  live exposures are elsewhere and belong to the planks: in-app account deletion (5.1.1(v), SP-20) is
  release-gating, and there is **no current installable TestFlight build** — the only one expired
  2026-08-10. A submission needs a fresh archive before anything here can be walked on a device.
- **Data.** The attribution rule decides money. Get the resolution query wrong and a designer is
  credited for a purchase on a job she is not on, or missed on one she is. Ship it with the read
  written against `james.okafor@example.com` (one accepted lead) and `client@patina.dev` (three
  projects) before the Buy control draws anywhere.
- **Truthfulness of the since-line.** The badge floor is `scenePhase → .active` plus home appear, with
  no realtime, so a stale count could name something already dealt with. Build the line from the same
  fetch that paints the card, never a cache, and let pull-to-refresh rewrite it. Nothing here adds a
  network call to the home.
- **The permission spend.** One grant per install. If wave 1 asks before the money rail can send, the
  promise is broken the first week. The ask ships **with** `notify_client_attention`, in the same
  release, or not at all.

### Rollback

Every wave-1 item is client-side and independently revertible: the since-line, the queue branch, the
Companion designer header and the dot are four separate PostHog fail-closed flags (C16), so any one
turns off without the others. The new SQL function is a `DROP FUNCTION` and three one-line reverts; no
data is written that a drop would strand. Wave 2's columns are additive and nullable, and the Buy
control is flag-gated — turning it off leaves an ordinary catalog with no orphaned rows. The only
non-revertible step is money that has moved, which is why attribution ships **before** the button.

---

## 10. What Direction A deliberately does not do

- **No tab bar.** Not as a compromise, not as a "just Studio" bar. C1 stands and A lives with §8.1.
- **No streaks, no badges, no "you haven't visited in 3 days", no fake scarcity, no countdown on a
  proposal's expiry, no "4 others saved this", no completeness meter that never fills, no randomised
  feed shuffle, no loss framing on a room.** All considered, all rejected: they reward the app's need
  for opens rather than the house getting finished, and Walt would delete the app before he finished
  reading the notification. The hard-coded unread dot already shipped is the shape of the mistake, and
  A removes it rather than extending it.
- **No push for new pieces.** New pieces belong on the home. A buzz for inventory is the first step
  toward a buzz for nothing.
- **No second navigation system.** The Companion gains content, not weight; the row cap holds.
- **No new module on Today**, no matter how good the content would be.
- **No selling a design consultation as an in-app digital product.** That opens 3.1.1 and it is not
  this program's fight.
- **No invented figure anywhere.** Where a column is empty, the line does not print. Where editorial
  has not published, the app says nothing is new.

---

## 11. Mock manifest

Frame 402 × 874, Dynamic Island, status bar `9:41`, home indicator. Tokens per
`research/16-token-table.md`: home gutter **20**, pushed screens start at **top 56**, Companion owns
the bottom **120**, Today cards are **flat** at radius **16**, every DM Mono label is **uppercase**,
an unloaded product image is a **strata mark on `Background.secondary`**, never a grey box. Sheets use
the hand-rolled Patina header (drag handle 36×4, title `h5` 18 Playfair Medium, mono sub-label 9),
**not** `PatinaSheetHeader`, which has zero call sites.

Content is seed-real unless marked *[example]*: pieces from `supabase/seed/products.sql`, stories from
`00143_editorial_stories.sql`, money from `INV-2026-0142` / `client@patina.dev` (C29). Rooms are
device-local objects, so a named room is *[example]*.

### M1 · Today — activeProject, 12:30pm (Ruth) · light + dark
**Tier/state:** activeProject, signed in, three projects, no rooms, 3 items waiting.

**Layout, top → bottom.** Status bar. 20pt gutter throughout. `WEDNESDAY · AUG 26` (DM Mono 10,
uppercase, tracking 0.5, `Text.muted`) with the bell (unread dot, clay), `?` and the `C` monogram
(36pt clay circle) right-aligned on the row below; `Today` (Playfair Medium 40, `Text.primary`) with
its inline `?`. **New:** one mono line `SINCE YOU WERE HERE · THURSDAY` and, under it, Inter 14
`Text.secondary`: "Leah sent a proposal, and your invoice came due." — 8pt gap, then 24 before the
card. `TodayNextMoveCard`: `Background.secondary`, radius 16, flat, 16pt padding, 48pt clay-wash icon
tile (`hand.raised`), `NEXT MOVE` mono over `Leah is waiting on three things` (Playfair Regular 26)
over `A rug colour since Aug 22 · $4,250 due Sep 1 · a proposal by Sep 8` (Inter 14 `Text.secondary`,
two lines), clay ↗ arrow trailing. 16 gap. `DailyStoryCard` unchanged: 300pt `hero` gradient,
`4 MIN READ` capsule, clay unread dot top-right **only if unopened**, `MAKER SPOTLIGHT` mono over
`The Grain Whisperer of Maine` (Playfair 26, offWhite) over `Jonathan Chilton on 40 years of listening
to wood`. **No Active Room card** — this account has no room, and the module is absent rather than
faked. Companion hearth: 64pt charcoal circle, strata mark, hint `LEAH HARTWELL · YOUR DESIGNER`.

**Screen sheet.** *Purpose:* one screen that says what moved and what is owed. *Entry:* app root;
Companion "Home". *Components:* `DailyGreetingHeader` (existing, + since-line), `TodayNextMoveCard`
(existing, new branch), `DailyStoryCard` (existing), `CompanionOverlay` (existing, new hint).
*Data:* `BadgeCountService` (decisions/proposals/invoices/threads), `StudioQueueBuilder` dates,
`editorial_stories`, local last-seen. *States:* loading — the three cards as skeletons, header
immediate; empty — no since-line on first launch ever, "Nothing new since Thursday." when counts are
unchanged; error — the existing partial-failure behaviour, never a fabricated line. *Interactions:*
tap card → `studio_queue_item_activated` path via `today_next_move_tapped` (`action_id:
openStudioQueue`); since-line render → `today_since_line_shown`; story → `today_editorial_story_tapped`.
*Tier:* engaged shows the match branch instead; discovering shows the room/pieces branch; guest shows
the room ladder. *New vs today:* the since-line, the queue branch, the Companion hint.
*Dark:* `#211E1B` ground, `#2C2926` card, `#F2EDE6` text, `#B5A487` mono, clay accents unchanged.

### M2 · Today — discovering, 9:10pm (Maya) · light
**Tier/state:** discovering, signed in, one room *[example: "Living Room", 18 × 14 ft]*, 3 saved
pieces, style profile complete.

**Layout.** Header as M1; since-line `SINCE YOU WERE HERE · YESTERDAY` / "Three new pieces for the
Living Room." Next Move: icon tile `sparkles`, `NEXT MOVE` / `Three new pieces for the Living Room` /
"New this week, chosen for this room." → room-scoped Browse. Story card:
`EDITOR'S NOTE / Patina: The slow shape of home / Why the things you live with should age the way you
do`, `3 MIN READ`, unread dot on. `TodayActiveRoomCard`: 180pt `warm` gradient artwork with the
`ROOM SCAN` chip omitted (manual room), then `ACTIVE ROOM` mono / `Living Room` (Playfair 26) /
`18 × 14 ft · 3 pieces saved` (Inter 14 muted) / **new fill line** `$3,590 of your $9,000` (DM Mono
10, `Text.secondary`) / chevron. Hearth hint: `LIVING ROOM · 3 SAVED`.

**Screen sheet.** *Purpose:* the nightly twenty minutes, with a room that is visibly closer to done.
*Entry:* root. *Components:* as M1 + `TodayActiveRoomCard` (existing, one new line). *Data:*
`get_recommendations` `created_at` (new projection) for the "new this week" count; `RoomStore` +
`saved_items` for the fill; `StylePreferenceModel.budgetRange` for the denominator — **the person's
own answer, never a figure we chose**. *States:* no new pieces → "Return to the Living Room" /
"3 pieces are gathering there." (existing copy); no budget answer → the money half of the fill line
is omitted, not zeroed. *Interactions:* `today_next_move_tapped` (`action_id: exploreRoomNew`),
`today_active_room_tapped` (`saved_item_count`). *Tier:* guest identical minus the fill money.
*New vs today:* since-line, the new-pieces branch, the fill line.

### M3 · Piece detail — Heirloom Oak Dining Table · light (discovering) + dark (activeProject)
**Tier/state:** light = discovering, no designer, buyable. Dark = activeProject with Leah engaged.

**Layout.** 340pt hero photo (the seed's real image) with a floating bar: `BackChevronButton`, `?`,
Share, ♥ — 36pt circles, `offWhite` @92%, pearl hairline. Content starts 24 below: maker tag
`NORDIC ATELIER · AARHUS, DENMARK` (DM Mono 10, uppercase) — **from `products.brand`, not the
retailer**; `Heirloom Oak Dining Table` (Playfair Regular 26); `Quarter-sawn white oak · Hand-rubbed
tung oil` (Inter 14 muted); price row `$4,200` (Playfair 26) with the `88% MATCH` pill (DM Mono 10,
`success` on `success` @12%, capsule). **New two lines under the price:** `38″ W × 20″ D × 30″ H`
*[example — the column exists and is unpopulated]* and `Ships in 10–12 weeks` *[example]*, each
omitted entirely when null. Then `Made to order in a three-person workshop outside Aarhus.` (the
seed's own description). Provenance chips. Maker-story card, tinted `earth`, linking to the story
when one features this piece. Bottom action bar, above the 120pt hearth, never under it: **light —
primary `Buy it · $4,200` (charcoal capsule, 52pt) + secondary ghost `Ask about this piece`; dark —
primary `Ask Leah to source this` + secondary ghost `Save to the Living Room`.** Under the primary,
Inter 12 muted: `Payment opens securely in Safari.`

**Screen sheet.** *Purpose:* decide, and act on the decision. *Entry:* browse card, Saved row, room
item, `patina://piece/<id>`, push `product`. *Components:* `ProductDetailView` (existing; SP-01 fixes
the load, SP-10 the fields), **new** act bar. *Data:* `products` direct fetch with the qualified
vendor embed; `brand`, `dimensions`, `lead_time_weeks`, `shipping_flat_cents`, `returns_policy_key`.
*States:* loading — strata mark on `Background.secondary`; error — `"Couldn't load product"` /
`"Let's try that again."` **with a back chevron** (SP-01); not buyable → the primary becomes
`Ask about this piece`. *Interactions:* `product_detail_opened`, `order_path_shown` (prop `path`),
`order_started`, `designer_ask_tapped`, `product_saved`. *Tier:* a designer engaged on the room
replaces Buy with Ask — the rule is the relationship, not the badge. *New vs today:* the act bar, the
two spec lines, the maker line's source.

### M4 · The room — Living Room · light
**Tier/state:** discovering, one room *[example]*, three saved pieces.

**Layout.** 240pt `warm` gradient hero with ⚙ top-right; `Living Room` (Playfair 32) at top 56 of the
content; meta `18 × 14 FT · NORTH-FACING · 2 WINDOWS · ENTERED AUG 24` (DM Mono 10). Stat row, two
tiles not three — `3 ITEMS` and `$3,590 OF $9,000` — **`IN AR` and the bare `MATCH` are gone**
(SP-18). Budget band: a 4pt pearl track with a clay fill at 40%, label `YOUR BUDGET · FROM YOUR
QUIZ ANSWER`. `YOUR ITEMS`: three rows, 64pt thumbnail, name, maker, price — `Meadow Linen Sectional /
Woodward & Sons / $6,800` is deliberately **not** here; the three are `Velvet Club Chair · Article ·
$1,250`, `Brass Arc Floor Lamp · Schoolhouse · $890`, `Woven Jute Area Rug 8x10 · Studio Piet ·
$1,450`. One primary act above the hearth: `Browse pieces for the Living Room` (SP-11's single CTA).

**Screen sheet.** *Purpose:* the object of return — a room that visibly fills. *Entry:* Active Room
card, Your Spaces, `patina://room/<uuid>`, push `room`. *Components:* `RoomProjectView` (existing;
SP-11/SP-18 do most of this), **new** budget band source. *Data:* `RoomStore`, `saved_items`,
`StylePreferenceModel.budgetRange`. *States:* empty room → `"A blank canvas"` + one CTA; unsynced →
`SAVED ON THIS PHONE`; no budget answer → the band is absent, not zeroed. *Interactions:*
`room_channel_viewed`, `product_detail_opened`, `marketplace_row_tapped`. *Tier:* identical at every
tier; at activeProject the room also lists pieces Leah placed, once Path B orders carry `project_id`.
*New vs today:* the real budget band, the honest stat row, one CTA instead of three.

### M5 · The purchase — three panels, drawn side by side
**Tier/state:** discovering (Walt), Heirloom Oak Dining Table, no designer engaged. The engaged
variant is described, not drawn.

**5a · Order sheet** (`.medium` detent, hand-rolled header). Drag handle 36×4 muted @25%, top 18 /
bottom 14. `Heirloom Oak Dining Table` (Playfair Medium 18), sub `NORDIC ATELIER · MADE TO ORDER`
(DM Mono 9). 24pt gutter. 56pt thumbnail beside `Quarter-sawn white oak`. Then a money block, Inter
14, label left / figure right, pearl hairline between: `Piece  $4,200.00` · `White-glove delivery
$350.00` *[example — from the new column]* · `Sales tax  calculated at checkout` · then a 1pt rule and
`Total today  $4,550.00 + tax` (Inter SemiBold). Then two plain lines: `Ships in 10–12 weeks.` and
`If it arrives damaged, Patina handles the claim with Nordic Atelier — one number, in your receipt.`
**Engaged variant adds one line here:** `Credited to Leah Hartwell.` Primary `Continue to payment`
(52pt charcoal capsule); caption `Payment opens securely in Safari. Apple Pay works there if it's set
up on this iPhone.`; ghost `Ask about this piece`.

**5b · Payment hand-off.** `SFSafariViewController` over the sheet: Safari chrome, the Stripe Checkout
page with the Apple Pay button above the card form, `$4,550.00`. Drawn as the system surface it is —
**no Patina chrome on it**, because that is the compliant rail and pretending otherwise would be a
lie about who takes the money.

**5c · Order placed.** Full screen, no sheet. `ORDERED · AUG 26` (DM Mono 10) / `Heirloom Oak Dining
Table` (Playfair 26) / `Nordic Atelier · Aarhus`. A `success` status badge reading `PAID`. Then:
`$4,550.00 paid` · `Receipt emailed to walt@…` · `Nordic Atelier starts it this week. We'll email you
when it ships.` — **not** a fake tracker, because `fulfillment_status` lands in wave 2. Engaged
variant: `Leah Hartwell is credited on this order.` Buttons: `Back to Today`, ghost `Your orders`.

**Screen sheet (all three).** *Purpose:* take money without lying about what happens next. *Entry:*
piece detail `Buy it`. *Components:* **all new** — `OrderSheet`, existing `SafariView`, `OrderPlacedView`.
*Data:* `create_direct_order` RPC → `create-checkout-session{direct_order_id}` → `{url}` →
`SFSafariViewController` → the invoice rail's existing 3s/60s poll on `direct_orders.status`.
*States:* creating — the button dims and shows the spinner; hand-off failure — the app's own error
state **above** the button with `Try again` and `Ask about this piece` (SP-15's shape); poll timeout →
`"We haven't seen this payment yet. We'll update this as soon as it clears."`, never an unconditional
bank-transfer banner. *Interactions:* `order_started`, `order_checkout_opened`, `order_placed`,
`order_failed`. *Tier:* the sheet never opens where a designer is engaged on the room — Path B does.
*New vs today:* everything; zero iOS code references `direct_order` at head.

### M6 · The return moment — Lock Screen push + the Today it opens
**Tier/state:** activeProject, notifications granted, invoice due in six days.

**Left panel — Lock Screen.** iOS lock wallpaper, clock, and one notification card: the Patina app
icon, `Patina`, `now`, title **`Leah sent a proposal`**, body **`Aspen Loft — Living Room Refresh.
Read it by Sep 8.`** Below it, the Lock Screen `accessoryRectangular` widget: `3 THINGS WAITING` /
`Rug colour · overdue Aug 22`. **Right panel — the app it opens:** M1's Today, with the since-line
reading `SINCE YOU WERE HERE · THURSDAY` / "Leah sent a proposal, and your invoice came due.", so the
push and the screen agree — the failure mode we are designing against is a notification that opens a
screen which knows nothing about it.

**Screen sheet.** *Purpose:* the one honest interruption. *Entry:* `notify_client_attention` →
`apns-send`; widget timeline. *Components:* system notification; **new** widget extension;
`NotificationRouter` (existing, already handles `proposal`). *Data:* `notification_log` +
`device_push_tokens`; the widget reads a small App Group cache written on every badge refresh.
*States:* permission not granted → no push, the in-app feed and email carry it; widget with nothing
waiting → `NOTHING NEEDS YOU` / the room; signed out → wordmark only. *Interactions:*
`push_received`, `push_opened` (`entity_type`), `widget_tapped`. *Tier:* engaged gets only the
design-request pushes that already fire; discovering and guest get none, and are never asked for the
permission. *New vs today:* the send for money and decisions, the widget target, the pre-permission
screen (SP-08's copy, A's timing).

### M7 · The Companion, expanded — Your Designer *(extra)*
**Tier/state:** activeProject, panel open on the home.

**Layout.** The panel rises from the hearth over a dimmed home: `Background.primary`, 24pt radius,
24pt gutter. Header row — 44pt portrait or clay monogram, `Leah Hartwell` (Playfair Medium 18),
`YOUR DESIGNER · HARTWELL & CO · NCIDQ` (DM Mono 9, uppercase, muted, from `IntroductionInfo`). Then
five rows, 56pt each, pearl hairlines, chevrons: **`Message Leah`** (suggested — clay wash on the icon
tile), `What's waiting` with a trailing `3`, `Your Studio`, `Saved`, `Your profile`. No records, no
counts beyond the one summary — the contract keeps Studio records in Studio.

**Screen sheet.** *Purpose:* make the relationship layer hold a relationship. *Entry:* the hearth,
anywhere. *Components:* `CompanionOverlay` (existing), `CompanionAreaBuilders` (existing rows), **new**
header. *Data:* `profiles`, `StudioIdentityService`, `IntroductionInfo`, `BadgeCountService`.
*States:* no designer → today's `"Where to next?"` panel, unchanged; designer without a logo → the
monogram fallback, so a solo designer is not invisible; loading → the header reserves its height and
does not pop. *Interactions:* `companion_panel_opened`, `companion_quick_action_tapped`.
*Tier:* header only at engaged and above. *New vs today:* the header and the message row; the row cap
and the ≤1-suggested rule are unchanged.

### M8 · The permission moment *(extra)*
**Tier/state:** activeProject, first proposal has just landed, permission never asked.

**Layout.** A full-bleed `Background.primary` sheet, no chrome. Strata mark, 32pt. `Playfair Regular
26`: `Only when something needs you.` Then Inter 16 `Text.secondary`, the plank's sentence verbatim:
`We'll tell you when your designer sends something that needs you — a decision, a proposal, or an
invoice. Nothing else.` Then three DM Mono lines with clay dots: `A DECISION TO MAKE` · `A PROPOSAL TO
READ` · `AN INVOICE COMING DUE`. Primary `Turn on notifications`; ghost `Not now`.

**Screen sheet.** *Purpose:* spend the one grant well. *Entry:* the first client-facing
`notification_log` row of type proposal/decision/invoice. *Components:* **new** screen; existing
`PushTokenService`. *Data:* none — copy only. *States:* declined → never asked again except once, on a
first overdue-and-unread payment. *Interactions:* `push_permission_prompted` (`trigger`, `outcome`).
*Tier:* engaged and activeProject only. *New vs today:* the app has no pre-permission copy anywhere.

### M9 · Today — engaged (James / Walt-shaped) *(extra)*
**Tier/state:** engaged — one accepted lead, designer matched, no project yet
(`james.okafor@example.com`, C29).

**Layout.** Header + since-line `SINCE YOU WERE HERE · AUG 18` / "Leah Hartwell picked up your
request." Next Move: `NEXT MOVE` / `You're matched with Leah Hartwell` / `She has your request in
hand — an introduction is on its way.` → `.designRequests`. Story. No Active Room (no room). Hearth
hint `LEAH HARTWELL · YOUR DESIGNER`.

**Screen sheet.** *Purpose:* the tier that is currently byte-identical to guest. *Entry:* root.
*Components:* existing — `TodayExperience.swift:80-91` renders this branch already; SP-07's one-line
filter fix is what lets it run. *Data:* `leads` + `match_ceremonies` via `DesignRequestStatusService`.
*States:* stage advances change the copy from the existing stage table, verbatim; terminal stages hold
for 14 days from **last seen**, not from the stage anchor. *Interactions:*
`today_next_move_tapped` (`action_id: trackDesignRequest`). *Tier:* engaged only. *New vs today:* the
since-line and the decay re-anchor; the card itself is already built and unreachable.
