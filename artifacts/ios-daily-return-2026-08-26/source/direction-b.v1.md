# Direction B — **The Record**

**The Daily Return · Patina iOS client · 2026-08-26 · main `3cd84ecb3` · may amend canon**

Assumes every plank in `source/shared-planks.md` ships. Nothing below restates one.

---

## 1. Name, thesis, and the day it is built around

**Thesis.** Patina's return object is the house, not the catalogue: the app opens on a dated record
of what moved while you were away — who did it, what it costs, what is waiting on you — and the
pieces are a door off that record, not the front of it.

The name is the app's own editorial copy, seeded in `00143_editorial_stories.sql:167`:
*"Patina is not a finish. It is a record."* The product has been saying this in an article nobody
can reach twice while its home screen forgets every visit.

**Why this and not more marketplace.** The one genuinely variable thing Patina owns is *another
person did something about your house* — a proposal raised, a decision asked, an invoice due, a piece
shipped. All of it is computed on the backend today and rendered on no screen a returning person
lands on (F08, F30, F80, F91). Meanwhile the home is built around idle browsing, whose strongest
surface — the piece detail — does not load (F04) and cannot take money (F12). B inverts the weight.

**The day.**

- **7:40am — Walt, Madison.** First screen: `WEDNESDAY · AUG 26` / `Good morning.` then
  `SINCE YOU WERE LAST HERE · THU, AUG 20` and three dated lines, oldest need first:
  *"Leah asked about the rug colour."* `Aug 22 · overdue`; *"Leah sent a proposal to review."*
  `by Sep 8`; *"Three pieces joined Patina this week."* `Aug 25`. If nothing moved it says
  **"Nothing moved since Thursday."** and gives him the workshop story with its real date. He gets
  his coffee's worth in eight seconds and closes the app. That is a success, not a failure.
- **12:30pm — Ruth, Des Moines.** Same first screen. The top line is the thing waiting on her, with
  the date it was asked and the word `overdue`, and one tap is the decision itself. Her question —
  *"can I check on my house the way I check on a package?"* — is answered by the shape of the screen.
- **9:10pm — Maya, Grand Rapids.** Discovering tier, one room. First screen: the greeting, then
  **YOUR HOUSE** — `Living Room · 3 pieces · $2,400 of $9,000` — then **NEW THIS WEEK**, a rail of
  pieces whose `published_at` is genuinely inside seven days, then the story. The record for a person
  with no designer is her own room filling up. Nothing about her house is invented.
- **After two weeks away.** The header reads `You were last here on the 12th.` The record groups by
  week and runs longer. Nothing decays, nothing scolds, no count of days missed. The two silent
  14-day decays that exist today (F189) are removed, not extended: a matched request stays on the
  record until it resolves.

---

## 2. Home composition per tier

Order is top→bottom. "New" means new relative to `main` today.

**guest** — the app no longer opens on a wall (F108, F117, F165; C9 already says guests browse, so
this is a restoration, not an amendment).
1. Header — date · time-of-day greeting (`TimeOfDay`, already a complete unused token set).
2. **Your house** — `Start with a room`, two acts side by side: **"Type the dimensions"** and
   **"Scan it"**. The light act is first (F120: today the only act is the heaviest one).
3. **New this week** — horizontal rail from `get_recommendations`, filtered to `published_at` inside
   7 days. Honestly new because the timestamp is real. Empty → the block does not render.
4. **From the workshop** — the story card, with its own publish date on it.
5. One quiet line above the tab bar: **"Sign in to keep this on every device."** No sheet, no wall.

**discovering** — same four blocks, plus **Saved** once the count is above zero
(`3 saved · you added the Brass Arc Floor Lamp on Tuesday`). The room block now shows the room the
person made, with its real numbers.

**engaged** — SP-07 makes the matched designer visible; Direction B gives her a permanent seat.
1. Header.
2. **The record** — first line is the true fact the app hides today:
   *"Leah Hartwell picked up your request."* `Aug 18`.
3. **Your designer** — name, studio, one line of what she is doing, and **"Message"** (SP-13 supplies
   thread creation). This block persists from the moment a designer exists until she is gone (F09,
   F79, F25).
4. Your house · New this week · From the workshop.

**activeProject**
1. Header.
2. **The record** — one dated list, at most five rows, ordered *what needs you* first, then *what
   moved*. Every row carries its date and its state on the right: `overdue`, `by Sep 8`,
   `$4,250.00 · due Sep 1`, or nothing. `See all →` when there are more. Empty state:
   **"Nothing needs you right now."** followed by the last thing that moved and when.
3. **Your designer** — Leah Hartwell · Hartwell Studio · "Aspen Loft Refresh" · **Message**.
4. **Your house** — a rail of the client's rooms with real progress (`3 pieces · $2,400 of $9,000`),
   plus **Add a room**.
5. **From the workshop** — the story.

**What is honestly new, day to day, and why**

| Source | Honest? | Why |
|---|---|---|
| A designer act (proposal, decision, invoice, message, phase) | yes | another person did it; the row carries the date they did it |
| An order moving (`fulfillment_status`) | yes, once §5 ships | a carrier scan, not a marketing event |
| `products.published_at` inside 7 days | yes | a real timestamp on a real row |
| The story, with its publish date shown | yes, at editorial's cadence | three rows exist; the block never claims daily novelty |
| The room getting fuller | yes | the person did it themselves — shown as state, never as "news" |
| The date string alone | **no** | that is what the app does today (F13) |

Rejected outright: any row on the record generated by the reader's own action dressed as an event.

---

## 3. The investment the app remembers, and where it shows on return

| Investment | Stored where | Where it shows on return in Direction B |
|---|---|---|
| Rooms (typed or scanned) | SwiftData `RoomModel` + `rooms` | **Your house**, block 4 — the persistent object of the whole direction |
| Room budget | new `rooms.budget_cents` (one column; the room already draws a `— BUDGET` stat, c-23) | the room's own line: `$2,400 of $9,000` |
| Saved pieces | `TableItemModel` + `saved_items` (SP-14 mirrors them) | Pieces tab → **Saved** segment; and the room they were saved into |
| Taste portrait | `client_style_profiles` | one line under **New this week**: "In the warm-minimal range you saved" — never a percentage (F158) |
| Design request | `leads` | the record's first line at engaged, until it resolves |
| Decisions / proposals / invoices | server | the record's top rows, with the dates the acting screens drop today (F102) |
| Orders | `direct_orders` (§5) | the record, and Studio → **Ordered** |
| Last visit | new `patina.house.lastSeenAt` (UserDefaults; a `profiles.last_seen_at` mirror later for the widget) | the record's own header — the thing the app has never had (F16=F34) |

Two of eight investments are visible on return today (U1 Q2). Direction B makes it eight.

---

## 4. Return surfaces beyond the app

**Push — what earns the permission.** Four events, named in the ask, and nothing else:

> **"We'll tell you when your designer sends a proposal, when an invoice comes due, when a decision
> is waiting, and when something you ordered moves. Nothing else."**

The ask moves off the design-request submit (where it fires silently today, unrelated to money —
F47, F167) to the first of those four events, behind that one screen. `apns-send` is complete and
provisioned (C26); each event is **one** `invoke_edge_function('apns-send', …)` call site on the
pattern `00330`/`00331`/`00334` already prove. `NotificationRouter` already handles `proposal` and
`invoice` payloads nobody emits (F199) — the routes exist before the senders.

| Event | Backend delta | Wave |
|---|---|---|
| Proposal sent | 1 call site on the existing `proposal-send` path | W1 |
| Invoice sent / due | 1 call site on `invoice-send` + the `invoice-reminders` cron | W1 |
| Decision raised | 1 call site on the decision trigger (`00092`) | W1 |
| Order moved (`confirmed/in_production/shipped/delivered/eta_change/substitution`) | reuse `fulfillment-notify`'s vocabulary and templates verbatim against `direct_orders` | W4 |

**Deep links.** SP-03 adds associated domains; Direction B extends `DeepLinkHandler` past
`room`/`piece` to `invoice`, `proposal`, `decision`, `thread`, `order` (F199, F169) — otherwise
every email the platform already sends still lands in Safari.

**Widgets — one new WidgetKit target** (the app has three targets and no extension, F130).
- *Small (Home Screen)*: eyebrow `SINCE THU`, one line — the top row of the record — and a footer
  count `3 waiting`. Empty: **"Nothing moved since Thursday."**
- *Lock Screen rectangular*: `PATINA · 3 waiting` over `Rug colour — overdue since Aug 22`.
- Data via App Group + a `WidgetKit` timeline refreshed on app foreground and on push receipt. No
  network in the widget.

**Live Activity** — only once `eta_date` and `shipped` are real (W6), for a delivery window. Not
before: an activity with nothing true to show is the fabricated-freshness mistake in a new costume.

**One local notification**, opt-in, from the invoice screen: **"Remind me the day before."**
The app can schedule none today (F127); this is the only one it should.

**Email** is already live and cron-scheduled for invoices, decisions and proposals. The delta is not
more email — it is that its links open the app.

---

## 5. The purchase path

**The rule, once: the designer on the job owns the piece.** Everything below follows from it.

| Path | Who sees it | Trigger | Mechanism | Delta |
|---|---|---|---|---|
| **A · Buy it** | guest (sign-in at the tap), discovering, and any client with no designer engaged | piece is `patina_managed` or catalog-vendor-sold with a positive price | `create_direct_order` → `create-checkout-session {direct_order_id}` → `SFSafariViewController` → `stripe-webhook` settles → receipt email | **client-side only** for create→pay→receipt (§12) |
| **B · Ask your designer** | engaged, activeProject | a designer is engaged | a structured message into the project thread naming the piece, price and room; she sources it on her own rail | **none** in v1 (`rpc_start_project_thread` exists, SP-13 adds the create call) |
| **C · Ask about this piece** | any tier | price is null, or made-to-order | same sheet; with no designer it writes to the `leads` rail with a `product_id` | none |

At engaged/activeProject the piece's primary act is **"Ask Leah to source this"**. Underneath it, a
secondary text act — **"Buy it myself"** — which opens the order sheet with one added line:

> **"Ordered in your name. Leah sees it on your project and is credited at her trade rate."**

Walt is not blocked from buying his own chair; Leah is not disintermediated by his doing it. That is
the whole compromise, and it is only possible because of the migration below.

**Order state machine** — one additive migration on `public.direct_orders`:

```
create_direct_order ── pending_payment ──► canceled
                            │ checkout.session.completed
                            ▼
                          paid ──► refunded            (00277 trigger, unchanged)
                            │
   fulfillment_status: unfulfilled ─► confirmed ─► in_production ─► shipped ─► delivered
                                      (eta_change / substitution are events, not states)
```
Columns added: `designer_id → profiles`, `project_id → projects`, `commission_rate numeric`
(all snapshotted at create, never recomputed), `fulfillment_status text default 'unfulfilled'`
CHECK over the five values, `shipped_at`, `delivered_at`, `tracking_number`, `carrier`, `eta_date`.
The vocabulary is `_shared/fulfillment-templates.ts:31-37` verbatim, so one push/email template set
serves both rails. `stripe-webhook`'s settle branch writes a `designer_earnings` credit when
`designer_id` is present, mirroring `00277_refund_reconciliation.sql:183-208`'s invoice path.
Fulfillment is written by ops/the portal, never the client — there is no client UPDATE policy and
there should not be one.

**What Walt sees before he pays.** The order sheet, in this order, none of it invented:

1. The piece, its maker and their town — `Heirloom Oak Dining Table` / `NORDIC ATELIER`.
2. The description the database already holds and no screen returns:
   *"Solid quarter-sawn white oak with hand-rubbed tung oil finish. Each table is made to order by a
   three-person workshop outside Aarhus."* (`supabase/seed/products.sql:6`). Add `description` to
   SP-10's already-planned RPC widening — one word in a projection.
3. Size and lead time (SP-10), omitted entirely when null rather than faked.
4. **"Fits your Living Room's 18 ft wall with 3 ft to spare."** — computed from the room he typed.
   No maker's own site can print that line.
5. Money: `Piece $4,200.00` / `Shipping and tax are calculated on the next screen.` — honest,
   because Stripe calculates them; the settled receipt prints the full total from the webhook's
   `shipping` jsonb.
6. Who is responsible: **"Sold and shipped by Patina."** or **"Sold by Nordic Atelier, Aarhus."**
   from `products.patina_managed`, and a named person to reach.
7. **"Payment opens securely in Safari."** — no wallet promised (C25: Apple Pay is already inside
   that Checkout, and is a device probe, not a build).

**What D3 sees after.** `designer_id`, `project_id` and `commission_rate` on the row, an earnings
credit on settle, and the piece on his FF&E schedule — the portal side of the schedule join is named
here and priced out of this direction's scope. Without those columns he has said he walks; adding
them before the client ships is free, and afterwards means backfilling money.

**Apple compliance (C15).** Physical goods, external payment, Stripe hosted Checkout in
`SFSafariViewController` — the rail invoices already use. No IAP anywhere. No digital good is sold;
if a paid consultation is ever sold in-app, that is a separate 3.1.1 conversation and this direction
does not open it.

**Returns and damage.** No column and no copy exists anywhere (F144). Direction B does not invent
policy: it reserves the line, prints the seller of record and the claim route ("Message your
designer" on Path B; a named support contact on Path A), and flags the policy text as a **Kody
ruling** that prints from config once written.

---

## 6. The designer in the client's home

Today she is named exactly once, in mono type, under a bill (F09), and the app offers "Get design
help" to people who already have her (F72, F160). Direction B:

1. **A permanent block on the home** from the moment a designer exists: portrait or monogram, name,
   studio, the project, and one line of what she is doing — sourced from the same project/lead rows
   the app already fetches. Not a card that appears when there is news; a seat.
2. **She is the subject of the record.** Every row that is her work reads as hers — *"Leah asked
   about the rug colour."*, *"Leah sent a proposal to review."* — never *"A decision is ready."*
3. **Message, from where the question occurs** — on the home block, on the piece, on the decision
   (SP-13 supplies the thread; Direction B supplies the placement, with the piece or decision named
   in the opening message so her inbox arrives pre-contexted; D2's inbox is the enemy).
4. **The re-match funnel is off** wherever she exists. `"Get design help"` renders at discovering
   only (F24, F72, F111, F128, F160).
5. **Purchases credit her** — §5, including the ones she did not source.
6. **Nothing of hers leaks into the client's phone** — SP-05 removes `"CLIENT VIEW / Milestone"` and
   the portal instruction; Direction B adds no new designer-facing string to the client build.

---

## 7. Findings answered

Planks answer their own list. These are the ones Direction B answers on top of them.

| Findings | What changes |
|---|---|
| F13, F16(=F34), F186, F188, F209 | The record, dated, against a stored last-visit; the greeting reads the hour from `TimeOfDay` |
| F30(=F37), F41, F80, F91, F58 | One list, one count, every waiting item on it — proposals and invoices included; it never falls back to a room ask while money is open |
| F08, F85, F38, F07, F199, F47, F167 | Four money/order pushes, earned behind one screen of named copy; deep links extended so the mail already sent lands in the app |
| F11, F121, F126, F134, F98, F43, F50, F14 | A four-destination tab bar; Studio, Pieces and Saved stop hiding behind a 36 pt monogram and a conditional orb row |
| F49(=F81,=F172), F137 | The Companion leaves the content plane for the tab bar's trailing slot; nothing floats over a primary act |
| F108, F117, F165, F120 | Guests land on the house, not a wall; the first act is the light one |
| F09, F79, F25, F72, F160, F111, F128 | The designer has a permanent seat; the acquisition CTA stops being offered to her clients |
| F12, F32(=F04), F151, F153, F150, F87 | A purchase act on the piece: Buy, or Ask your designer, or Ask about it |
| F22(=F26), F152 | `designer_id`, `project_id`, `commission_rate` snapshotted on every direct order; an earnings credit on settle |
| F19, F66, F154, F90, F198 | An order object with a fulfillment vocabulary, its own Studio section, and the push that already exists on the other rail |
| F99, F101, F123 | The house is the client's rooms with real numbers; a room's count stops disagreeing with Saved |
| F54, F105, F129, F168 | A second seat on the house (W6) — read-mostly, one invite |
| F189 | Both silent 14-day decays removed; absence changes nothing |
| F158 | The unexplained match percentage comes down; a plain-language taste line replaces it |
| F61, F46, F131 | The story block prints its own publish date and never claims a cadence the well cannot keep |
| F62, F145, F146, F153 | A maker layer over `vendors` (W6) — the provenance argument gets a screen |
| F130 | The app gets its first extension: one widget target |
| F127 | One opt-in local reminder, on the invoice |

**Left open on purpose:** F43 (true catalog search — the Pieces tab ships chips and a server-side
category, not full-text search; named in §10), F196/F192 (server-side filtering lands with search),
F144 (returns policy is a ruling, not code), F71/F95 (line prices are a server-side visibility
policy — SP-04 names it), F6 (the seed's mismatched photography is a content pass).

---

## 8. Amendments

> Form: `B-n amends C# — what · why (findings) · cost · rollback`. Every one has findings behind it.

**B-1 amends C1 (no tab bar).** *What:* a four-destination tab bar — **Today · Spaces · Pieces ·
Studio** — plus the Companion in the bar's trailing slot, replacing the unlabelled monogram and the
conditional orb rows as the app's navigation. *Why:* F11 (the money rail sits behind an unlabelled
monogram), F121 + F138 (the home returns four elements and does not scroll — there is no other
door), F126 + F134 (the entire Studio hides behind a 36 pt control in the hardest-reached corner),
F98 (no Browse door on the home or in the orb), F14 (the Saved door disappears at zero saves), F50
("Your studio" promises three things and lands on a bare projects list), F43. R29 scheduled this
re-evaluation for post-Track-D and U25 logged the evidence — two stable destinations — without
litigating it; this direction litigates it. *Cost:* one wave (W2): a `TabView` root in
`ContentView.swift`, four route hosts, retiring `CompanionSafeArea`'s 120 pt inset, re-anchoring the
first-launch tour, and a Dynamic-Type pass on the bar. *Rollback:* PostHog flag `house-first`,
fail-closed (C16); the present `DailyRoomView` + orb root stays mounted on the off branch for one
release.

**B-2 amends C8 and C23 (Companion geometry).** *What:* the collapsed Companion stops being a
centered floating orb over content and becomes the tab bar's trailing slot — same Strata mark, same
coaching phases, same ≤6 rows, same panel; it expands to a sheet from the bar. *Why:* F49 (=F81,
=F172) the orb sits on "Sign proposal" and "Browse Picks for This Room"; F137 body copy runs into it
at XXL; the Hearth is an opaque `safeAreaInset` painted over scrolled content, so padding is not the
fix. Option B's own contract says *"the Hearth is reserved layout space, not a persistent visible
bar"* and *"app content does not render beneath the active Companion shape"* — the shipped
implementation contradicts both, and a tab slot honours them literally. *Cost:* resting geometry and
motion rework in `CompanionOverlay` / `StrataMarkView`; supersedes SP-19's Hearth clause (SP-19's
status-bar and 44 pt work stands). *Rollback:* same flag.

**B-3 amends C23 (the Today contract).** *What:* "exactly one prioritized next move" becomes
"exactly one record, ordered by what needs you" — one dated list, at most five rows, with a truthful
empty. The one-story and one-active-room clauses stand; the room becomes a rail of the client's
rooms. *Why:* F13 (only the date changes), F16 (=F34) (two weeks reads like two minutes), F30
(=F37) (one of four pending items shown), F80 + F91 (a proposal and an invoice can never reach
Today), F58 (an active project with nothing pending drops off Today entirely). *Cost:* W1 — this is
the first slice. *Rollback:* the record is an additive mount; removing it restores Option B's Today
exactly.

**B-4 amends C2 and C3 (marketplace-first home).** *What:* the home is house-first; the catalogue is
a tab. The orphaned July rail (`HomeStudioBlock`, `MarketplaceLinksSection`, `RoomChipRail`, …) is
**not** re-mounted — the Pieces tab does its job with a door that cannot hide. *Why:* F108 + F117 +
F165 (the fresh install meets a wall and is never framed as the place you work with your designer),
F120 (the only first act is the heaviest one), F99 + F101 (Today shows a room the client never made
while their real rooms live nowhere), F11. The editorial feel C3 protects is kept — the story block
survives with a date on it. *Cost:* none beyond B-1 and B-3. *Rollback:* same flag.

**B-5 amends C24 (direct orders carry no attribution).** *What:* one additive migration —
`designer_id`, `project_id`, `commission_rate`, `fulfillment_status`, `shipped_at`, `delivered_at`,
`tracking_number`, `carrier`, `eta_date` — plus an earnings credit on settle. *Why:* F22 (=F26),
F152 (`00301_marketplace_vitals.sql:37-40` states the gap outright), F19 + F66 (no order object
anywhere), F154 (the state machine stops at `paid`), F90, F198. D1 and D3 both named an unattributed
buy-now as the thing that ends the relationship. *Cost:* one migration, one webhook branch, an ops
write path; the client only reads. *Rollback:* every column is additive and nullable; the client
feature sits behind flag `direct-orders`.

**B-6 amends C11 (direct orders are backlog, not yet designed).** *What:* designed here and
sequenced into W4, under the path rule that a designer on the job owns the piece. *Why:* F12 (buying
ends at "Saved ✓"), F32 (=F04), F151 (19 of 21 catalogue rows already pass the buyability gate),
F153, F150 + F87. *Cost:* W4, client-side for create→pay→receipt (§12 says the chain exists).
*Rollback:* flag `direct-orders`; the piece screen reverts to Save + Ask.

**B-7 amends C4 (canonical names).** *What:* tab labels drop the possessive — **Today · Spaces ·
Pieces · Studio** — while every destination screen keeps its canonical title verbatim ("Your
Spaces", "Browse pieces", "Your Studio", "Saved"), and each tab's VoiceOver label is the canonical
name in full. *Why:* F50 (a label that promises three destinations and delivers one), F194 (one
action under three names), F98. *Cost:* one string table. *Rollback:* trivial.

**No amendment is sought to** C5 (honesty), C6 (voice), C7 (tokens), C9, C10, C12, C13, C15, C16,
C25, C26, C27, C28. The second seat (§9, W6) needs none — a `household_members` junction plus an
invite RPC is exactly the shape C13 prescribes.

---

## 9. First slice, waves, deltas, risks, rollback

**First slice (≤ 2 weeks, one iOS engineer + edge functions) — "the record, and the reason to know
it changed." It requires none of the amendments and ships inside Option B's mount.**

iOS (additive, above the existing Next Move card):
- `Features/Home/Models/HouseRecord.swift` **(new)** — composes dated rows from data the home
  already fetches on appear: `StudioQueueBuilder`'s items and their dates, `NotificationsViewModel`'s
  `notification_log` rows, `DesignRequestStatusService`'s stage, and the story's `published_at`.
- `Features/Home/Views/HouseRecordCard.swift` **(new)** — the block, its empty state, `See all →`.
- `Core/Persistence/LastSeenStore.swift` **(new)** — `patina.house.lastSeenAt`, written on
  `scenePhase → .active`, read before the refresh so the header can name the gap.
- `Features/Home/Views/DailyGreetingHeader.swift` — greeting from `TimeOfDay.current` (zero new
  tokens; the set exists and is unused).
- `Features/Home/Views/DailyRoomView.swift` — mount the record between header and Next Move.
- `Features/Profile/ViewModels/StudioQueueBuilder.swift` — expose the dates it already computes.
- Tests: record ordering, the empty state, the two-weeks-away header, Dynamic Type XXL.

Backend, in parallel: three `invoke_edge_function('apns-send', …)` call sites (proposal sent,
invoice sent/due, decision raised) and the pre-permission screen with the four-event copy from §4.

That slice alone answers F13, F16, F30, F80, F91, F58, F186, F188, F209, F08, F38, F07, F47, F167 —
and it is removable by deleting one mount.

**Waves.**

| W | What | Amendments | Backend delta |
|---|---|---|---|
| W1 | The record · the greeting · money push · earned permission | — | 3 `apns-send` call sites |
| W2 | The tab bar · Companion into the bar · Pieces tab (Browse / Saved segment) · Studio tab | B-1, B-2, B-7 | none |
| W3 | The house on Today (room rail, real progress) · designer seat · room budget · decays removed | B-3, B-4 | `rooms.budget_cents` (1 column) |
| W4 | Purchase — order sheet, Path A checkout, Path B ask, Studio → Ordered, order push | B-5, B-6 | 1 migration on `direct_orders`; 1 `stripe-webhook` branch; 1 `apns-send` call site; ops write path |
| W5 | Widget target (Home + Lock Screen) · deep links to invoice/proposal/decision/order · opt-in due reminder | — | none (AASA is SP-03's portal work) |
| W6 | Second seat on the house · maker pages · Live Activity on a delivery window | — | `household_members` + invite RPC + RLS; a read-only `get_maker` RPC over `vendors` |

**Backend deltas, totalled:** four `apns-send` call sites, one additive migration on
`direct_orders`, one column on `rooms`, one webhook branch, one junction table with an RPC, one
read-only RPC, plus SP-10's already-planned `get_recommendations` widening (add `description` to it).
No new NestJS service; `services/orders` stays dormant (C13).

**Risks.**

- *Apple review.* Physical goods pay outside IAP via hosted Checkout — the compliant rail the app
  already ships (C15). A WidgetKit target is neutral. The real review exposure is **SP-20's account
  deletion** (5.1.1(v)), which is release-gating before the next submission regardless of direction.
  There is no current installable TestFlight build (§11) — a fresh archive precedes any device claim.
- *Data.* The attribution columns touch money. Snapshot at create, never recompute; make
  `commission_rate` immutable after `paid`; the earnings credit fires once, from the webhook, keyed
  on the Stripe event id. Internal payable state stays the source of truth; Stripe reconciles toward
  it.
- *Performance.* W1 adds no network calls — the record composes from data already fetched on
  appear. The widget reads an App Group snapshot, never the network.
- *Device-only.* Apple Pay inside Checkout, the APNs round trip, and universal links are **device
  claims** — none is provable in Simulator, and this program produced no device pass.
- *The tab bar* is the one change Kody has ruled against before; it rides its own flag for exactly
  that reason. Its text-only labels are an HIG deviation, not a violation — if Kody wants symbols,
  add them above the labels without touching the architecture.

**Rollback.** Four PostHog flags, fail-closed (C16): `house-first` (W2–W3), `direct-orders` (W4),
`house-widget` (W5), `second-seat` (W6). W1 is one mount. Every migration is additive-only — turning
the client off leaves unused nullable columns and no orphaned data. The pre-amendment root
(`DailyRoomView` + hearth orb) stays compiled for one release after W2 so the flag has something to
fall back to.

---

## 10. What Direction B deliberately does not do

- **No AR.** `usdz_url` is `NULL` on every path; SP-18 takes the affordance down and this direction
  does not put it back until an asset pipeline exists.
- **No compare surface** (F162), **no product Q&A**, **no client reviews**, **no scope-change
  requests** — the last two are R32's backlog items 1 and 2, sequenced after orders.
- **No cart.** One piece, one order — Patina's unit of purchase is a piece, not a haul.
- **No full-text catalogue search** in this direction. The Pieces tab ships server-side category
  filtering (`p_category` is already a parameter nobody sends) and the existing chips; real search
  over 21 rows is theatre, and over 21,000 rows is its own project. F43 stays open, named.
- **No board remote mirror.** SP-12 either wires boards or removes them; a synced board canvas is
  the "boards-fidelity rabbit hole" the alignment deck already refused.
- **No client-editable project data.** The client answers, signs, pays and asks. They never edit the
  designer's plan.
- **No streaks, badges, points, or day counters.** No countdown urgency on a piece or a proposal.
  No fabricated "new" — the story dot comes from a real read timestamp or it does not draw. No
  speculative push ("your designer may be waiting"). No completeness meter without a true
  denominator (that is what the 48% → 63% match number is). No randomised feed shuffle. No social
  proof ("4 others saved this") over a population that does not exist. No loss framing on a room. No
  permission ask at cold launch. No Wallet pass — an invoice is not a boarding pass. No SMS to
  clients: the 10DLC rail is designer- and trades-facing and stays that way.
- **No activity row for the reader's own actions.** If you did it, it is state, not news.

---

## 11. Mock manifest

Frame 402 × 874, Dynamic Island, `9:41`, home indicator. Tokens per `research/16-token-table.md`.
Gutter **20** on Today, **24** on pushed screens. Today cards are **flat** (no shadow), radius **16**.
Every DM Mono label is uppercase. An unloaded image is a Strata mark on `Background.secondary`,
never a grey box. The tab bar is **83 pt** (49 + 34) with a `pearl` 1 pt hairline on top; it
**replaces** the 120 pt hearth. Content marked *(example copy)* is not in the seed.

Seed content used throughout: designer **Leah Hartwell**; project **Aspen Loft Refresh**
($120,000, "Installation & Styling"); invoice **INV-2026-0142** $4,250.00 due Sep 1, 2026;
proposal **"Aspen Loft — Living Room Refresh"** $18,500.00, review by Sep 8; decision **"Rug color -
Natural vs Sand"**, both options $850, *"The jute rug from Studio Piet. Natural is warmer, Sand is
more neutral."*, overdue Aug 22; pieces **Heirloom Oak Dining Table** $4,200 (Nordic Atelier),
**Woven Jute Area Rug 8x10** $1,450 (Studio Piet), **Live-Edge Coffee Table** $2,100 (Heritage
Lumber), **Brass Arc Floor Lamp** $890 (Schoolhouse), **Velvet Club Chair** $1,250 (Article);
story **"MAKER SPOTLIGHT / The Grain Whisperer of Maine / Jonathan Chilton on 40 years of listening
to wood"**, 4 min.

### M1 — Today, activeProject (light) · **M1d dark variant**

*Tier/state:* `client@patina.dev`, four items waiting, last visit Thu Aug 20.

Blocks, top→bottom, gutter 20:
1. **Header row** — left: `WEDNESDAY · AUG 26` (DM Mono 10, uppercase, tracking 0.5, `Text.muted`)
   over `Good morning.` (Playfair Medium 28, `Text.primary`). Right: bell glyph with a clay dot.
   *The monogram is gone* — Profile lives in the Studio tab. Top inset reserved (SP-19).
2. **The record** — card, `Background.secondary`, radius 16, flat, padding 16.
   Eyebrow `SINCE YOU WERE LAST HERE · THU, AUG 20`. Then five rows, each a Button, 56 pt tall,
   separated by `pearl` hairlines:
   - `Leah asked about the rug colour.` — right: `Aug 22 · overdue` (DM Mono 10, `error #C77B6E`)
   - `Leah sent a proposal to review.` — right: `by Sep 8`
   - `Your invoice is due.` — right: `$4,250.00 · Sep 1`
   - `Leah asked about the dining chairs.` — right: `Aug 24`
   - `Three pieces joined Patina this week.` — right: `Aug 25` (`Text.muted`)
   Footer link `See all →` (Inter Medium 15, `Text.interactive`).
3. **Your designer** — card, `Background.outline` style: 44 pt monogram circle `LH` on `clay` @15%,
   then `Leah Hartwell` (Inter SemiBold 18) over `Hartwell Studio · Aspen Loft Refresh` (Inter 14,
   `Text.secondary`); trailing capsule button `Message`.
4. **Your house** — eyebrow `YOUR HOUSE`; horizontal rail of 240 × 150 room cards: `Living Room`
   over `3 pieces · $2,400 of $9,000` *(example copy — the local seed has zero rooms)*, artwork =
   the `warm` gradient; final card `Add a room` (dashed `pearl` border).
5. **From the workshop** — the existing `DailyStoryCard` with one addition: `AUG 25 · 4 MIN` in the
   corner where the permanent unread dot used to be.
6. **Tab bar** — `Today` `Spaces` `Pieces` `Studio` in Inter Medium 13, active = `Text.primary`,
   inactive = `Text.muted`; trailing 5th slot = `StrataMarkView` at scale 0.8. No icons.

*M1d dark:* `#211E1B` ground, cards `#2C2926`, text `#F2EDE6`, hairlines stay `pearl #E5E2DD`
(reproduce as drawn), `error` and `clay` unchanged.

| Screen sheet | |
|---|---|
| Purpose | Answer "what happened to my house" in the first viewport, before any navigation |
| Entry | Cold launch · tab `Today` · push · widget |
| Components | `DailyRoomView` (existing, recomposed) · `HouseRecordCard` (**new**) · `DesignerSeatCard` (**new**) · `RoomRail` (**new**, `RoomChipRail` is orphaned and not reused) · `DailyStoryCard` (existing) · `PatinaTabBar` (**new**) |
| Copy | as drawn above, verbatim |
| Data | `StudioQueueBuilder` · `notification_log` · `DesignRequestStatusService` · local `RoomModel` + `rooms.budget_cents` · `editorial_stories` · `patina.house.lastSeenAt` |
| States | loading → `One moment…`; empty → `Nothing needs you right now.` + the last thing that moved; error → `Let's try that again` on the failing block only, never the whole screen |
| Interactions | row tap → `studio_queue_item_activated` (existing) + `today_record_line_tapped {kind}` · block shown → `today_record_shown {line_count, days_since_last_seen}` · empty → `today_record_empty_shown` · `designer_card_message_tapped` · `house_room_opened` · `today_editorial_story_tapped` (existing) |
| Tier | guest/discovering: no record block, no designer seat; engaged: record + designer seat, no money rows |
| New vs today | The record, the greeting, the designer seat, the room rail, the dated story chip and the tab bar are new. Today's home is four blocks and a date (`DailyRoomView.swift:104-145`) |

### M2 — Today, discovering (light) · **M2d dark variant**

*Tier/state:* signed in, one room, three saved, no designer.

1. Header — `WEDNESDAY · AUG 26` / `Good evening.` (9:10pm; `TimeOfDay.evening`).
2. **Your house** — full-width 180 pt room card: `Living Room` / `18 × 14 ft · 252 sq ft` /
   `3 pieces · $2,400 of $9,000` *(example copy)*, `warm` gradient artwork; `+ Add a room` below.
3. **New this week** — eyebrow `NEW THIS WEEK`; rail of 160 pt cards, each maker line (DM Mono 10),
   name (Inter Medium 16), price: `Live-Edge Coffee Table · $2,100 · HERITAGE LUMBER`,
   `Ceramic Table Lamp · $420 · LOCAL POTTER`, `Brass Arc Floor Lamp · $890 · SCHOOLHOUSE`.
   Sub-line: `In the warm-minimal range you saved.`
4. **Saved** — one row: `3 saved · you added the Brass Arc Floor Lamp on Tuesday` → Pieces/Saved.
5. **From the workshop** — story card.
6. Tab bar.

| Screen sheet | |
|---|---|
| Purpose | Give a person with no designer an honest reason to open: her room, and pieces that are actually new |
| Entry | cold launch · tab `Today` |
| Components | `RoomHeroCard` (**new**) · `NewThisWeekRail` (**new**, reuses `ProductCard`) · `DailyStoryCard` (existing) |
| Copy | as drawn; `NEW THIS WEEK` renders only when ≥1 row has `published_at` inside 7 days |
| Data | `get_recommendations` + `products.published_at` (a widening SP-10 already opens) · local `RoomModel` · `client_style_profiles` for the taste line |
| States | no room → `Start with a room` with **"Type the dimensions"** and **"Scan it"**; no new pieces → block absent (never a placeholder); no saves → Saved row absent |
| Interactions | `house_add_room_tapped {method}` · `piece_card_tapped` · `today_editorial_story_tapped` |
| Tier | guest = identical minus the Saved row, plus `Sign in to keep this on every device.` above the bar |
| New vs today | Everything above the story. Today a discovering user sees the same four blocks as a guest and an activeProject client (F13) |

### M3 — Piece detail, purchase acts (light) · **M3d dark variant**

*Tier/state:* discovering — **Heirloom Oak Dining Table**, $4,200, `patina_managed`. (The
activeProject variant swaps only the bottom bar — see below.)

1. 340 pt hero (`PatinaAsyncImage`; on failure the Strata mark, not a grey box). Floating bar:
   back · `?` · Share · ♥ (existing).
2. `NORDIC ATELIER` (DM Mono 10, uppercase) — sourced from `products.brand`, not the vendor (SP-10).
3. `Heirloom Oak Dining Table` (Playfair 26).
4. `Quarter-sawn white oak · Hand-rubbed tung oil` (Inter 14, `Text.secondary`).
5. `$4,200` (Playfair Medium 28) with the match pill trailing.
6. **New:** `84″ W × 38″ D × 30″ H` and `Made to order · ships in 10–12 weeks` *(example copy —
   `dimensions` and `lead_time_weeks` are empty in the seed; SP-10 makes them renderable)*.
7. **New:** the real description — *"Solid quarter-sawn white oak with hand-rubbed tung oil finish.
   Each table is made to order by a three-person workshop outside Aarhus."*
8. **New, when a room exists:** `Fits your Living Room's 18 ft wall with 3 ft to spare.` *(example
   copy)*
9. Provenance chips + maker story card (existing).
10. **New:** `Sold and shipped by Patina.`
11. Bottom bar above the tab bar: primary `Buy — $4,200` (capsule, `Interactive.active`, 52 pt),
    secondary ghost `Add to room` (SP-11).

*activeProject variant:* primary becomes `Ask Leah to source this`; the ghost row becomes
`Buy it myself` + `Add to room`. Nothing else changes.

| Screen sheet | |
|---|---|
| Purpose | Let a person decide, then act — buy it, or hand it to their designer |
| Entry | Pieces tab · Saved · a room · the record's catalogue row · a `patina://piece/<id>` link |
| Components | `ProductDetailView` (existing) + `PurchaseActionBar` (**new**) + `FitLine` (**new**) |
| Copy | as drawn; the description is `products.description`, printed, not composed |
| Data | `get_recommendations` widened (SP-10 + `description`); `products.patina_managed` for the seller line |
| States | loading → `One moment…`; failure → `Couldn't load product` / `Let's try that again` **with a working back control** (SP-01); no price → path C, `Ask about this piece` |
| Interactions | `piece_buy_tapped` · `piece_ask_designer_tapped` · `piece_add_to_room_tapped` · `piece_saved` |
| Tier | guest → `Buy — $4,200` opens the auth sheet with a Cancel (SP-09), then the order sheet; engaged/activeProject → Path B primary |
| New vs today | Today the terminus is `Add to Room` → `Saved ✓` with no size, no lead time, no description, no maker's town, no purchase (F12, F17) |

### M4 — The room

*Tier/state:* activeProject, **Living Room**, three pieces in it.

1. 220 pt hero — the `warm` gradient (room-type map: living → `warm`).
2. `Living Room` (Playfair 26) · `18 × 14 ft · 252 sq ft · TYPED, NOT SCANNED` *(example copy)*.
3. Stat row — `3 PIECES` · `$2,400 OF $9,000` · **no "IN AR" cell** (SP-18 removes it).
4. **In this room** — 2-up grid of the pieces put there: `Woven Jute Area Rug 8x10 · $1,450`,
   `Brass Arc Floor Lamp · $890`, `Velvet Club Chair · $1,250`.
5. Single primary act — `Browse pieces for the Living Room` (SP-11 makes it actually room-scoped).
6. `Set a budget for this room` (ghost) → a sheet writing `rooms.budget_cents`.
7. Tab bar (`Spaces` active).

| Screen sheet | |
|---|---|
| Purpose | The room is the thing that gets better with use — the object worth returning to |
| Entry | tab `Spaces` · the room rail on Today · `patina://room/<id>` |
| Components | `RoomProjectView` (existing, trimmed) · `RoomBudgetSheet` (**new**) |
| Copy | as drawn; `TYPED, NOT SCANNED` replaces the contradictory `JUST SCANNED` / `MANUAL ENTRY` pair (F51) |
| Data | local `RoomModel` + `rooms` · `saved_items` scoped by `room_id` · `rooms.budget_cents` (**new column**) |
| States | no pieces → `Nothing in this room yet.` + the one browse act; no budget → the ghost act, never a `—` |
| Interactions | `house_room_opened` · `room_budget_set` · `room_browse_tapped` |
| Tier | identical at every tier; a designer's project name appears on the card only when the room belongs to one |
| New vs today | The pieces grid, the budget, the honest capture label, and the removal of `0 IN AR` (F64, F110, F193) |

### M5 — The purchase flow (three panels in one mock)

**5a · Order sheet** (`.presentationDetents([.large])`, hand-drawn 36 × 4 drag handle per the
de-facto Patina sheet header): title `Order` (Playfair Medium 18) over `HEIRLOOM OAK DINING TABLE`
(DM Mono 9). Then: 72 pt thumbnail + `Nordic Atelier · Aarhus, Denmark` *(example copy)*; the
description paragraph; `84″ W × 38″ D × 30″ H`; `Made to order · ships in 10–12 weeks`; a `pearl`
rule; `Piece` … `$4,200.00`; `Shipping and tax are calculated on the next screen.` (Inter 14,
`Text.muted`); `Sold and shipped by Patina.`; primary `Continue to payment`; caption
`Payment opens securely in Safari.`
*activeProject only, above the primary:* `Ordered in your name. Leah sees it on your project and is
credited at her trade rate.`

**5b · Payment handoff** — `SFSafariViewController` over the sheet, Stripe Checkout chrome, the
Apple Pay button drawn as Stripe renders it (C25 — present because `card` is an accepted method; a
device probe, not a build). Behind it, the app shows `Confirming payment… This usually takes a few
seconds.`

**5c · Order placed** — full screen: Strata mark, `Order placed.` (Playfair 28),
`Heirloom Oak Dining Table · $4,200.00`, `A receipt is on its way to your inbox.`,
`We'll tell you when it ships.` with a checkbox-styled row `Notify me` (this is the push
pre-permission moment), then `See your order` and `Back to Today`.

| Screen sheet | |
|---|---|
| Purpose | Take $4,200 from a person who has never bought furniture from a phone |
| Entry | `Buy — $4,200` on M3 |
| Components | `OrderSheet` (**new**) · `SFSafariViewController` (existing pattern from `InvoicesViewModel`) · `OrderPlacedView` (**new**) |
| Copy | as drawn, verbatim |
| Data | `create_direct_order(p_product_id, p_quantity)` → `create-checkout-session {direct_order_id}` → poll `direct_orders.status` on dismiss (3 s / 60 s, the invoice pattern) → `stripe-webhook` settles |
| States | create fails → the app's error state **above** a dimmed button with `Try again` and `Message your designer` (SP-15's pattern); poll times out → `We haven't seen this payment yet. We'll update this as soon as it clears.` — never the unconditional bank-transfer line (F157); canceled → the sheet returns intact |
| Interactions | `order_sheet_shown` · `order_created` · `order_checkout_opened` · `order_checkout_returned {outcome}` · `order_settled` · `order_failed {reason}` · `push_permission_primer_shown` · `push_permission_result` |
| Tier | guest → auth sheet first, with a Cancel; activeProject → the attribution line, and this whole flow is the secondary act |
| New vs today | Entirely new on iOS. The backend chain exists end-to-end (§12); the attribution columns are B-5 |

### M6 — The return moment

**6a · Lock Screen**, 9:12am: a Patina notification —
title `Leah sent a proposal`, body `Aspen Loft — Living Room Refresh · review by Sep 8`.
Below it the Lock Screen rectangular widget: `PATINA · 3 WAITING` over
`Rug colour — overdue since Aug 22`.

**6b · Home Screen small widget** — `Background.secondary` ground, eyebrow `SINCE THU`, one line
`Leah asked about the rug colour.` (Inter Medium 15, two lines max), footer `3 waiting` (DM Mono 10)
with the Strata mark bottom-right. Empty variant: `Nothing moved since Thursday.`

**6c · What greets you** — tapping the notification opens M1 with the record's top row expanded to
show its date, and the decision one tap away. Tapping the widget opens M1 plain.

| Screen sheet | |
|---|---|
| Purpose | Bring the person back for something true, and land them where it is |
| Entry | APNs push · widget tap · an emailed link (once AASA lands, SP-03) |
| Components | `PatinaWidget` (**new** WidgetKit target — the app's first extension) · `NotificationRouter` (existing, extended) |
| Copy | as drawn; every push names the person and the object, never "you have an update" |
| Data | `apns-send` (existing, provisioned) from four call sites; the widget reads an App Group snapshot written on foreground and on push receipt |
| States | widget with no data → `Open Patina to see your house.`; permission denied → no push, the record still works |
| Interactions | `push_received {kind}` · `push_opened {kind}` · `widget_opened` |
| Tier | discovering/guest get no money pushes and no widget content beyond their room; the widget renders only for signed-in accounts |
| New vs today | The app has one off-app surface (push receive) and no extension target at all (F130, A15) |

### M7 — Ask your designer (Path B sheet)

*Tier/state:* activeProject, from **Woven Jute Area Rug 8x10** — the same rug as the open decision.

Medium detent. Title `Ask Leah` over `WOVEN JUTE AREA RUG 8X10`. A 56 pt thumbnail with
`Studio Piet · $1,450`. A room picker row: `For — Living Room ▾`. A pre-filled, fully editable
message: *"Can we use this rug in the living room?"* Primary `Send to Leah`; caption
`She'll see the piece, the price and the room.`

| Screen sheet | |
|---|---|
| Purpose | Let the client shop *with* the designer instead of around her |
| Entry | `Ask Leah to source this` on M3 · the Companion's `Message your designer` row |
| Components | `AskDesignerSheet` (**new**) · `MessagingAPIClient` (existing) + the create call SP-13 adds |
| Copy | as drawn; the message is editable and never sent without a tap |
| Data | `rpc_start_project_thread(p_project_id)` (idempotent, exists, granted) then `sendMessage` with the product id in metadata |
| States | no project yet → `rpc_start_direct_thread`; send fails → the message is kept and `Try again` offered |
| Interactions | `piece_ask_designer_tapped` · `ask_designer_sent {has_room}` |
| Tier | engaged and activeProject only; at discovering the same control reads `Get design help` and opens the request flow |
| New vs today | The piece screen has no way to reach a person at all (F150, F87); messaging exists but a client cannot start a thread |

### M8 — Studio → Ordered ("where is it")

*Tier/state:* activeProject, one paid order.

Pushed screen (top 24, content starts at 56). Header `ORDERED` / `Your orders`. One card:
72 pt thumbnail; `Heirloom Oak Dining Table`; `NORDIC ATELIER`; a four-step rail —
`Confirmed` `In production` **`Shipped`** `Delivered` — with the current step filled `charcoal` and
the rest `pearl`; `Shipped Sep 12 · arriving Sep 18` *(example copy)*; `$4,200.00 · paid Sep 3`;
rows `Track with the carrier →` and `Message your designer`.

| Screen sheet | |
|---|---|
| Purpose | Answer T8 — "where is it" — in one screen instead of nowhere |
| Entry | tab `Studio` → `Ordered` · the record · an order push |
| Components | `OrderListView` / `OrderDetailCard` (**new**) · `PatinaStatusBadge` (existing) |
| Copy | the five states are `_shared/fulfillment-templates.ts`'s vocabulary verbatim |
| Data | `direct_orders` + the B-5 columns; RLS is already client-SELECT-own |
| States | no orders → the section does not render; paid but `unfulfilled` → `Paid Sep 3. We'll tell you when it ships.`; refunded → `Refunded Sep 20` |
| Interactions | `order_status_opened` · `order_track_tapped` |
| Tier | any tier that has ordered; Path B pieces appear on the designer's invoice rail instead, not here |
| New vs today | No order object exists anywhere in the client app (F19, F66); the state machine stops at `paid` (F154) |
