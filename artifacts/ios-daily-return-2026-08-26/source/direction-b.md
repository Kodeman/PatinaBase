# Direction B — **The Record**

**The Daily Return · Patina iOS client · 2026-08-26 · main `3cd84ecb3` · may amend canon · v2**

Assumes every plank in `source/shared-planks.md` ships. Nothing below restates one. v2 answers the homeowner, designer, feasibility and canon critiques; every blocking and major item is resolved in place or rebutted with evidence in **§12 Critique log**. Backend citations resolve to `research/12-backend-reality.md` and `research/17-gap-fills.md` — never to a section of this document.

---

## 1. Name, thesis, and the day it is built around

**Thesis.** Patina's return object is the house, not the catalogue: the app opens on a dated record of what moved while you were away — who did it, what it costs, what is waiting on you — and the pieces are a door off that record, not the front of it.

The name is the app's own editorial copy, seeded in `00143_editorial_stories.sql:167`: *"Patina is not a finish. It is a record."* The product has been saying this in an article nobody can reach twice while its home screen forgets every visit.

**Why this and not more marketplace.** The one genuinely variable thing Patina owns is *another person did something about your house* — a proposal raised, a decision asked, an invoice due, a piece shipped. All of it is computed on the backend today and rendered on no screen a returning person lands on (F08, F30, F80, F91). Meanwhile the home is built around idle browsing, whose strongest surface — the piece detail — does not load (F04) and cannot take money (F12). B inverts the weight.

**The day.**

- **7:40am — Walt, Madison.** `WEDNESDAY · AUG 26` / `Good morning.` then `SINCE YOU WERE LAST HERE · THU, AUG 20`, one card with two eyebrows. **MOVED**: *"Leah sent a proposal to review."* `Aug 22`; *"Your dining table shipped."* `Aug 25`. **NEEDS YOU**: *"Leah asked about the rug colour."* `asked Aug 22 · overdue`. If nothing moved it says **"Nothing moved since Thursday."** and gives him the workshop story with its real date. He gets his coffee's worth in eight seconds and closes the app. That is a success, not a failure — and it is the metric this direction asks to be judged on.
- **12:30pm — Ruth, Des Moines.** The same screen, opened for the fourth time today. The record does not empty out between opens: it is a rolling seven days, and rows added since this morning carry a quiet `new` tick. Her question — *"can I check on my house the way I check on a package?"* — is answered by the shape of the screen, and by an **Ordered** list holding the pieces *Leah* bought as well as the lamp she bought herself.
- **9:10pm — Maya, Grand Rapids.** Discovering, one room, three saved. The greeting, then the record with a **MOVED** eyebrow only — *"The Brass Arc Floor Lamp you saved is $100 less than when you saved it."* `Aug 24`; *"A new story from the workshop."* `Aug 25` — then **YOUR HOUSE** (`Living Room · 3 saved pieces · you added the Brass Arc Floor Lamp on Tuesday`), then **NEW THIS WEEK** if and only if three or more pieces genuinely published inside seven days, then the story. Some weeks her record is empty and says so. This direction does not claim a daily reason to open at her tier; it claims an honest weekly one (§2, supply floor).
- **After two weeks away.** `You were last here on the 12th.` The record groups by week and runs longer. Nothing decays, nothing scolds, no count of days missed. The two silent 14-day decays that exist today (F189) are removed, not extended: a matched request stays on the record until it resolves. On a first run or a reinstall there is no gap to name — the header is the greeting alone.

---

## 2. Home composition per tier

Order is top→bottom. "New" means new relative to `main` today. **The record mounts at every tier**; what differs is which true rows it can hold.

**guest** — the app no longer opens on a wall (F108, F117, F165; C9 already says guests browse, so this is a restoration, not an amendment).
1. Header — date · time-of-day greeting (`TimeOfDay`, a complete unused token set).
2. **The record**, MOVED only — the story published since the last visit, and `New this week`'s count when the floor is met. Empty → `Nothing moved since Thursday.` A guest's first return is carried by block 3, not by this one, and §9 does not pretend otherwise.
3. **Your house** — `Start with a room`, two acts side by side: **"Type the dimensions"** and **"Scan it"**. The light act is first (F120: today the only act is the heaviest one).
4. **New this week** — rail from `get_recommendations`, filtered to `published_at` inside 7 days. **Supply floor: renders at ≥3 rows, never pads.** Honestly new because the timestamp is real — and only ever populated if someone publishes (cadence, below).
5. **From the workshop** — the story card, with its own publish date on it.
6. One quiet line above the tab bar: **"Sign in to keep this on every device."** No sheet, no wall.

**discovering** — the same blocks, and the record now has its own rows: *a saved piece was withdrawn* (`products.deleted_at` set since the last visit); *a saved piece's price changed* against `saved_items.price_cents_at_save`, one column added to SP-14's mirror migration — the row states both numbers and never a countdown, a scarcity count or a was/now strike; and *the story*. **`Three pieces joined Patina this week.` lives under NEW THIS WEEK, not in the record**: the record is people acting on your house, and the catalogue is not a person. Plus a **Saved** summary row once anything is saved — *the row is a summary; the tab is the door* (SP-12 removes the zero-count gate, F14). Block 3 shows the room the person made, with its real numbers and its own dated state line (`you added the Brass Arc Floor Lamp on Tuesday`).

**engaged** — SP-07 makes the matched designer visible; Direction B gives her a permanent seat.
1. Header. 2. **The record** — first row is the fact the app hides today: *"Leah Hartwell picked up your request."* `Aug 18`.
3. **Your designer** — name, studio, one line of what she is doing, **"Message"** (SP-13 supplies thread creation). Persists from the moment a designer exists until she is gone (F09, F79, F25). Its data is `DesignRequestStatusService.promotedRequest` (`designerName`/`studioName`), which only resolves once SP-07's `client_request_id` filter is dropped — the seat does not replace that fix, it depends on it.
4. Your house · New this week · From the workshop.

**activeProject**
1. Header.
2. **The record** — one card, two eyebrows, each with its own truthful empty: **NEEDS YOU** (max 3, ordered by the date it was asked) and **MOVED** (max 3, newest first). Every row carries its date and its state on the right: `overdue`, `by Sep 8`, `$4,250.00 · due Sep 1`, or nothing. `See all →` when there are more. NEEDS YOU empty: **"Nothing needs you right now."** MOVED empty: **"Nothing moved since Thursday."** The window is a rolling seven days (grouped by week beyond that), not "since your last visit" — rows added since the last visit carry a `new` tick, so the fourth open of the day still shows the record rather than an empty card.
3. **Your designer** — Leah Hartwell · Hartwell Studio · "Aspen Loft Refresh" · **Message**.
4. **Your house** — a rail of the client's rooms. Where a project has rooms they are read from `project_rooms` (read-only cards the client did not type, carrying real `budget_cents`/`committed_cents`); the rooms the client typed or scanned sit beside them, plus **Add a room**. An activeProject client's house is never an empty state.
5. **From the workshop** — the story, demoted below the record when nothing has published since the last visit.

**What is honestly new, day to day, and why**

| Source | Honest? | Why |
|---|---|---|
| A designer act (proposal, decision, invoice, message) | yes | another person did it; the row carries the date they did it |
| An order moving (`fulfillment_order_items.line_state`) | yes, once §5 ships | a carrier scan and an operator's hand, not a marketing event |
| A saved piece withdrawn or repriced | yes | a real change to a real row, stated in both numbers |
| `products.published_at` inside 7 days, ≥3 rows | yes, at the publishing cadence | a real timestamp; below the floor the block does not draw |
| The story, with its publish date shown | yes, at one a week | three rows exist today; the block never claims daily novelty |
| The room getting fuller | yes | the person did it themselves — shown as dated state, never as "news" |
| A project phase changing | **not yet** | project detail discards the phases it fetches (F76, F125); no phase row until W3 gives it a destination |
| The date string alone | **no** | that is what the app does today (F13) |

**Cadence, named.** One editorial story a week, published Thursday, and a catalogue publishing pass that clears the three-row floor in the same week — both owned by whoever owns `editorial_stories` and the admin publish route (**a Kody ruling: name the owner**). The story query is reordered `published_at desc, sort_order desc` so a newer story cannot be buried by a lower sort order (F46=F61, F131). If the cadence is not owned, the blocks go dark rather than repeat — the honest failure, and the reason discovering is promised a weekly return and not a daily one.

Rejected outright: any row on the record generated by the reader's own action dressed as an event.

---

## 3. The investment the app remembers, and where it shows on return

| Investment | Stored where | Where it shows on return in Direction B |
|---|---|---|
| Rooms (typed or scanned) | SwiftData `RoomModel` + `rooms`; project rooms in `project_rooms` | **Your house** — the persistent object of the whole direction |
| Room budget | local `RoomModel.budgetCents` first, mirrored to `rooms.budget_cents` on sync (SP-14's shape); `project_rooms.budget_cents` where a project owns the room | the room's own line: `$2,400 in saved pieces · budget $9,000` — labelled, never a spend figure the app cannot support |
| Saved pieces | `TableItemModel` + `saved_items` (SP-14 mirrors them) | Pieces tab → **Saved**; the room they were saved into; each row prints its **save date, room and note** (F197, F170) |
| Taste portrait | `client_style_profiles` | nowhere, until one quiz owns one name (F96, F140) — the taste line is cut, §10 |
| Design request | `leads` | the record's first row at engaged, until it resolves |
| Decisions / proposals / invoices | server | the record's NEEDS YOU rows, with the dates the acting screens drop today (F102) |
| Orders | `direct_orders` → `fulfillment_orders` (§5) | the record's MOVED rows, and Studio → **Ordered** |
| Last visit | `patina.house.lastSeenAt` (UserDefaults) **and** a `profiles.last_seen_at` mirror in W3 — the second device needs it before the widget does | the record's own header — the thing the app has never had (F16=F34) |

Two of eight investments are visible on return today (U1 Q2). Direction B makes it eight.

---

## 4. Return surfaces beyond the app

**Push — what earns the permission.** Four events, named in the ask, and nothing else:

> **"We'll tell you when your designer sends a proposal, when an invoice comes due, when a decision is waiting, and when something you ordered moves. Nothing else."**

The ask moves off the design-request submit (where it fires silently today, unrelated to money — F47, F167) to the first of those four events, behind that one screen. `apns-send` is complete and provisioned (C26). `NotificationRouter` already handles `proposal` and `invoice` payloads nobody emits (F199) — the routes exist before the senders. **Every call site passes a `notification_log_id`**, which `apns-send` updates with delivery status (`apns-send/index.ts:9-10, 22-24`); without it the push lands and the in-app row does not, which is half of F08.

| Event | Where the call actually lives | Wave |
|---|---|---|
| Proposal sent | HTTP POST to `apns-send` from the `proposal-send` **edge function** (the `fulfillment-notify/index.ts:42` shape) | W1 |
| Invoice sent / due | the same POST from `invoice-send` and the `invoice-reminders` cron | W1 |
| Decision raised | **a new `AFTER INSERT` SECURITY DEFINER trigger** on `client_decisions`, in the `00289_design_request_client_status_notifications.sql` shape — `00092` is a pg_cron schedule, and nothing fires on decision creation today | W1 |
| Order moved | **no new call site.** Once a settled direct order lands on `fulfillment_orders` (§5), `fulfillment-notify` already resolves the client from `client_profile_id` and sends the six transitions | W4 |

**Deep links.** SP-03 adds associated domains — an entitlement `Patina.entitlements` does not carry today; Direction B extends `DeepLinkHandler` past `room`/`piece` to `invoice`, `proposal`, `decision`, `thread`, `order` (F199, F169) — otherwise every email the platform already sends still lands in Safari.

**Widgets — one new WidgetKit target** (the app has three targets and no extension, F130; the target needs an App Group entitlement and its own bundle id under ASC app `6762007888`).
- *Small (Home Screen)*: eyebrow `SINCE THU`, one line — the top row of the record. Empty: **"Nothing moved since Thursday."**
- *Lock Screen rectangular*: `PATINA` over `Rug colour — asked Aug 22`.
- **No count on either.** A running tally of chores on the Lock Screen is the instrument §10 refuses with a true number in it. The count is fine inside the app, where it is a list.
- Data via App Group + a `WidgetKit` timeline refreshed **on app foreground** and by timeline policy. A delivered alert does not run app code, and adding `content-available` would change the payload for all five existing `apns-send` callers — so the widget can be **one open behind**, and the direction says so rather than promising a refresh it cannot make.

**Live Activity** — only once `line_state = shipped` and an ETA are real (W6), for a delivery window. Its delta is **not none**: ActivityKit needs a per-activity push token and the `liveactivity` push type, and `apns-send` resolves `device_push_tokens` and sends one alert shape to `APNS_TOPIC` (`00335:22-30`). Either an activity-token table plus a push-type branch, or the activity updates in foreground only and goes stale when the app is closed. W6 chooses when it gets there.

**One local notification**, opt-in, from the invoice screen: **"Remind me the day before."** The app can schedule none today (F127); this is the only one it should.

**Email** is already live and cron-scheduled for invoices, decisions and proposals. The delta is not more email — it is that its links open the app.

---

## 5. The purchase path

**The rule, once: the designer on the job owns the piece.** Everything below follows from it.

**The buyability gate.** `Buy` draws only on a piece with a positive price, a seller of record (`patina_managed`, or a catalogue vendor that sells), `dimensions`, `lead_time_weeks`, a resolvable `brand`, and an image verified against the piece. Everything else falls to Path C. This turns the "omit when null" rendering rule into a structural one: a $4,200 order sheet can never ship missing the two facts Walt leads with, over a photograph of somebody else's chairs (F17, F142, F143, F06). F151's 19-of-21 count is the *seller* half of the gate only; until the catalogue data pass lands, fewer rows pass — the gate is honest about that, and the pass is named in §10.

| Path | Who sees it | Trigger | Mechanism |
|---|---|---|---|
| **A · Buy it** | guest (sign-in at the tap), discovering, any client with no designer engaged | the buyability gate passes | `create_direct_order` → `create-checkout-session {direct_order_id}` → `SFSafariViewController` → `stripe-webhook` settles → receipt email → intake onto the fulfillment rail |
| **B · Ask your designer** | engaged, activeProject | a designer is engaged | a structured message into the project thread naming the piece, price and room; she sources it on her own rail |
| **C · Ask about this piece** | any tier | the gate fails, price is null, or made-to-order | the same sheet; with no designer it writes to the `leads` rail with a `product_id`. **At engaged/activeProject, Path C routes through Path B's thread and never writes a second lead** — the duplicate-lead failure SP-07 exists to close |

At engaged/activeProject the piece's primary act is **"Ask Leah to source this"**. Underneath it, a secondary text act — **"Buy it myself"** — which opens the order sheet with one added line:

> **"Ordered in your name. Leah sees it on your project and is credited at the piece's trade rate. This doesn't change your price."**

`direct_orders.commission_rate` is snapshotted from **`products.commission_rate`** (`00152_three_layer_catalog.sql:52`) at create — a per-piece rate, which is why the copy says "the piece's trade rate" and not "her trade rate": it is not negotiated with her, and a client reading a disclosure deserves to know it does not come out of his price. At engaged tier with no project yet, `project_id` is null and `designer_id` is not; the settle notice still fires, into `rpc_start_direct_thread`'s thread.

Walt is not blocked from buying his own chair; Leah is not disintermediated by his doing it. That is the whole compromise, and it is only possible because of the plumbing below.

**Order state machine — one small migration, and an existing rail.**

```
create_direct_order ── pending_payment ──► canceled
                            │ checkout.session.completed
                            ▼
                          paid ──► refunded              (00277 trigger, unchanged)
                            │ settle stamps PI metadata + enqueues fulfillment_intake
                            ▼
      fulfillment_orders + fulfillment_order_items   (00350, already built)
      intake → transmitted → acknowledged → in_production → shipped → delivered → settled
      status is DERIVED from the min line stage + an exception overlay — never a text column
```

`public.direct_orders` gains **three** columns, not nine: `designer_id → profiles`, `project_id → projects`, `commission_rate numeric` — snapshotted at create, immutable after `paid`. Everything else already exists on the fulfillment rail: `fulfillment_orders` carries `client_profile_id`, `designer_profile_id`, `designer_attribution`, `ship_to`, freight and tax (`00350:68-89`); `fulfillment_order_items` is the line-level state machine (`:92-98`); `fulfillment_shipments` carries `carrier`, `tracking`, `eta_history` (`:160-173`); `fulfillment-intake/core.ts:33-58` is a generic, idempotent, cron-driven Stripe-PI→order normaliser; `fulfillment-notify` already writes the client's six transitions; and the operator surface exists (`apps/admin-portal/.../fulfillment/shipments/[id]/{eta,pod,deliver}`).

So W4's real backend delta is: three columns; a widening of the direct-order branch's `payment_intent_data.metadata` (`lines`, `client_*`, `designer_*`, `ship_to`, totals); one enqueue on settle; a `designer_earnings` credit; and **one new client-scoped SELECT policy** over `fulfillment_orders` / `fulfillment_order_items` / `fulfillment_shipments` for `client_profile_id = auth.uid()` — today those tables are admin-and-agent-read only (`00350:316-325`). That last policy is what makes M8 answer T8 for Ruth, whose furniture Leah bought.

The earnings credit keys on **`designer_earnings.order_id`** with a partial unique index added in the same migration — the column has been reserved since `00014:307` (*"Future: when orders table exists"*), with `source_type = 'product_commission'` already in its comment, and the invoice path's guard is the same shape (`00277:207-208`). There is no Stripe-event column on that table and this direction does not add one. Fulfillment is written by ops, never the client — there is no client UPDATE policy and there should not be one.

**Money, honestly.** Today `create-checkout-session`'s direct-order payable bills quantity × unit price, collects a US address, and sets **no** `automatic_tax` and **no** `shipping_options` (its own comment at `:973` says so). W4 adds both to that branch, and **Stripe Tax registration is a Kody ruling, not an engineering task**. Until that ruling and the responsibility paragraph below both exist, **Path A stays behind its flag and Paths B and C ship** — asking a designer to source a piece is a complete answer to both questions.

**What Walt sees before he pays.** The order sheet, in this order, none of it invented:

1. The piece, its maker and their town — `Heirloom Oak Dining Table` / `NORDIC ATELIER`.
2. The description the database already holds and no screen returns: *"Solid quarter-sawn white oak with hand-rubbed tung oil finish. Each table is made to order by a three-person workshop outside Aarhus."* (`supabase/seed/products.sql:6`).
3. Size and lead time — guaranteed present by the buyability gate.
4. **"Your Living Room's longest wall is 18 ft. This table is 7 ft."** — the numbers, not a promise. It draws only for a room measured after SP-19's segmented unit control lands, because today's 12 × 13 pt / 6 × 13 pt toggle silently persists its unit and two of three walks left with a 2,713 sq ft living room (F40). A wrong fit line on a made-to-order table is worse than none.
5. Money: `Piece $4,200.00` / **"Delivery and tax are added at payment. You'll see the full total before you pay."** — true only once the delta above ships; until then Path A does not ship.
6. Who is responsible: **"Sold and shipped by Patina."** or **"Sold by Nordic Atelier, Aarhus."** from `products.patina_managed`, **plus one config-driven paragraph naming who is responsible for delivery, damage and return, and one contact that resolves**.
7. **"Payment opens securely in Safari."** — no wallet promised (C25: Apple Pay is already inside that Checkout, and is a device probe, not a build).

**Returns and damage — a gate, not a reserved line.** No column and no copy exists anywhere (F144), and this direction does not invent policy. It sets a condition instead: **W4 ships Path A only with (a) a config-driven responsibility paragraph, printed on the order sheet *and* on `Order placed.`, and (b) one reachable human — an address or a number, not the word "support".** The named route is **Patina support, cc'd to the designer of record when one exists**, and a claim on an attributed order posts the same system message into the project thread as the purchase does, because D3's lived experience is that the client calls their designer regardless of who is officially responsible. The policy text itself is a **Kody ruling**; if it is not made, Path A stays flagged off.

**What D3 sees after — on the day, not in a future program.** Three things, all in W4: (1) **a system message in the project thread the moment the order settles** — *"Ruth bought the Heirloom Oak Dining Table — $4,200.00, credited at the piece's trade rate."* — into the idempotent thread SP-13 already builds, so Leah learns from the channel she watches; (2) **the order on the rail she already knows** — because settle routes into `fulfillment_orders`, the piece arrives carrying `designer_profile_id` and `designer_attribution` on the same table her own designer-sourced orders land on, with the operator surface already built; (3) **an earnings credit** on `designer_earnings`, keyed on `order_id`. The FF&E-schedule join in the designer portal is **W7** — a read-only list of attributed orders filterable by project — and it is in the wave table and the delta ledger, not in prose.

**Apple compliance (C15).** Physical goods, external payment, Stripe hosted Checkout in `SFSafariViewController` — the rail invoices already use. No IAP anywhere. No digital good is sold; if a paid consultation is ever sold in-app, that is a separate 3.1.1 conversation and this direction does not open it.

---

## 6. The designer in the client's home

Today she is named exactly once, in mono type, under a bill (F09), and the app offers "Get design help" to people who already have her (F72, F160). Direction B:

1. **A permanent block on the home** from the moment a designer exists: portrait or monogram, name, studio, the project, and one line of what she is doing. Not a card that appears when there is news; a seat.
2. **She is the subject of the record.** Every row that is her work reads as hers — *"Leah asked about the rug colour."*, *"Leah sent a proposal to review."* — never *"A decision is ready."* This needs a name the client cannot fetch today: only invoices embed the designer (`InvoicesAPIClient.swift:194`), while `DecisionsAPIClient`, `ProposalsAPIClient` and `ProjectsAPIClient` return `designer_id` and no name. `profiles` SELECT is `USING (true)` (`00013:57-58`), so W1 adds one `designer:profiles!…(id,full_name,business_name)` embed to each of those three clients and reuses `RemoteInvoiceDesignerRef.displayName`'s existing `"your designer"` fallback rather than inventing a second one.
3. **Message, from where the question occurs** — on the home block, on the piece, on the decision (SP-13 supplies the thread; Direction B supplies the placement, with the piece or decision named in the opening message so her inbox arrives pre-contexted). And because `rpc_start_project_thread` is idempotent per project, **every one of those entry points adds a message to the same conversation, not a new inbox item** — the answer to D2's test.
4. **The re-match funnel is off** wherever she exists. `"Get design help"` renders at discovering only (F24, F72, F111, F128, F160).
5. **Purchases credit her, notify her, and land on her rail** — §5, including the ones she did not source.
6. **Nothing of hers leaks into the client's phone** — SP-05 removes `"CLIENT VIEW / Milestone"` and the portal instruction; Direction B adds no new designer-facing string to the client build.

---

## 7. Findings answered

Planks answer their own list. These are the ones Direction B answers on top of them.

| Findings | What changes |
|---|---|
| F13, F16(=F34), F186, F188, F209 | The record, dated, on a rolling seven-day window against a stored last visit; the greeting reads the hour from `TimeOfDay` |
| F30(=F37), F41, F80, F91, F58 | One card, two eyebrows, every waiting item on it — proposals and invoices included; it never falls back to a room ask while money is open |
| F08, F85, F38, F07, F199, F47, F167 | Four money/order pushes, earned behind one screen of named copy, each passing a `notification_log_id`; deep links extended |
| F11, F121, F126, F134, F98, F50, F14 | A four-destination tab bar; Studio, Pieces and Saved stop hiding behind a 36 pt monogram — and W1 labels that monogram `Studio` with a waiting count so the fix does not depend on the flag |
| F49(=F81,=F172), F137 | The Companion leaves the content plane for the tab bar's trailing slot; nothing floats over a primary act |
| F108, F117, F165, F120 | Guests land on the house, not a wall; the first act is the light one |
| F09, F79, F25, F72, F160, F111, F128 | The designer has a permanent seat and a name on every row she wrote; the acquisition CTA stops being offered to her clients |
| F12, F32(=F04), F151, F153, F150, F87 | A purchase act on the piece, behind a buyability gate: Buy, or Ask your designer, or Ask about it |
| F17, F142, F143, F06 | The gate: no size, no lead time, no verified image → no Buy button, ever |
| F22(=F26), F152 | `designer_id`, `project_id`, `commission_rate` snapshotted on every direct order; an earnings credit keyed on `order_id`; a settle notice in the designer's thread |
| F19, F66, F154, F90, F198, F202 | Settled orders land on the existing fulfillment rail; **Ordered** lists both rails, so the pieces the designer bought are on it too |
| F99, F101, F123 | The house is the client's rooms — `project_rooms` for the ones a project owns, local rooms beside them |
| F40, F51 | `Edit dimensions` on the room, and the fit line prints the numbers it used; `TYPED, NOT SCANNED` replaces the `JUST SCANNED` / `MANUAL ENTRY` pair |
| F52, F170, F197 | The cheapest half of deciding: the note that already exists on a saved row is exposed, and every saved row prints its date and its room. Compare is refused, by name (§10) |
| F54, F105, F129, F168 | A second seat on the house (W6) — read-mostly, one invite |
| F189 | Both silent 14-day decays removed; absence changes nothing |
| F158 | The unexplained match percentage comes down — it is real but its denominator is behind an unlabelled tap |
| F46(=F61), F131 | One story a week, published Thursday, ordered `published_at desc`, demoted when nothing published |
| F62, F145, F146 | A maker layer over `vendors` (W6) — the provenance argument gets a screen |
| F130, F127 | The app's first extension: one widget target; one opt-in local reminder on the invoice |
| F106, F161, F76, F125, F77 | The dark-mode pass in W1 covers the money screens; Studio sorts live projects above finished ones, names **Files**, and W3 gives project detail the timeline it already fetches |

**Left open on purpose:** F43 (true catalogue search — the Pieces tab ships chips and a server-side category, not full-text search; §10), F196/F192 (server-side filtering lands with search), F144's *policy text* (a Kody ruling — but §5 now gates Path A on it), F71/F95 (line prices are a server-side visibility policy — SP-04 names it), F06's catalogue data pass (a content pass, now behind the buyability gate so it cannot reach a checkout), F96/F140 (two quizzes, two names — a ruling, and the reason the taste line is cut), F119.

---

## 8. Amendments

> Form: `B-n amends C# — what · why (findings) · cost · rollback`. Every one has findings behind it.

**B-1 amends C1 (no tab bar).** *What:* a four-destination tab bar — **Today · Spaces · Pieces · Studio** — plus the Companion in the bar's trailing slot, replacing the unlabelled monogram and the conditional orb rows as the app's navigation. *Why:* F11 (the money rail sits behind an unlabelled monogram), F121 + F138 (the home returns four elements and does not scroll), F126 + F134 (the entire Studio hides behind a 36 pt control in the hardest-reached corner), F98, F14, F50. R29 scheduled this re-evaluation for post-Track-D and U25 logged the evidence without litigating it; this direction litigates it. *Cost:* one wave (W2), and it is **a navigation refactor, not five bullets**: because M1's fifth slot is the Strata mark, this is a **hand-rolled bar, not a `TabView`** — which forfeits system tab semantics and makes the VoiceOver, Dynamic Type and iOS 26 bar treatments explicit work we own. Add: four `NavigationStack`s under one root, a route→tab table for `AppRoute`'s 30+ cases and the **105** `navigate(to:)` call sites, deep-link and push tab entry, `CompanionSafeArea`'s 120 pt inset retired, the Companion's `handleIntent` routing and the NEXT STEPS nav-count decay (C8, R09) re-checked against a multi-stack root, and both roots maintained for one release. *Fallback if the flag never flips:* W1 ships a **labelled `Studio` control with a waiting count** in the monogram's place, so the highest-consensus designer complaint is fixed with or without B-1. *Rollback:* PostHog flag `house-first`, fail-closed (C16), **evaluated once at launch and held** so a late-arriving flag cannot swap the root mid-session; the present `DailyRoomView` + orb root stays mounted on the off branch for one release.

**B-2 amends C8 and C23 (Companion geometry).** *What:* the collapsed Companion stops being a centered floating orb over content and becomes the tab bar's trailing slot — same Strata mark, same coaching phases, same ≤6 rows, same panel; it expands to a sheet from the bar. *Why:* F49 (=F81, =F172) the orb sits on "Sign proposal" and "Browse Picks for This Room"; F137 body copy runs into it at XXL; the Hearth is an opaque `safeAreaInset` painted over scrolled content, so padding is not the fix. Option B's own contract says *"the Hearth is reserved layout space, not a persistent visible bar"* and *"app content does not render beneath the active Companion shape"* — the shipped implementation contradicts both, and a tab slot honours them literally. *Cost:* resting geometry and motion rework in `CompanionOverlay` / `StrataMarkView`; supersedes SP-19's Hearth clause (SP-19's status-bar and 44 pt work stands). *Rollback:* same flag.

**B-3 amends C23 (the Today contract).** *What:* "exactly one prioritized next move" becomes "exactly one record, in two eyebrows — what needs you, what moved" — one card, at most six rows, with a truthful empty for each half. The one-story and one-active-room clauses stand; the room becomes a rail. *Why:* F13, F16 (=F34), F30 (=F37), F80 + F91, F58. *Cost:* W1 — this is the first slice. *Rollback:* the record is an additive mount; removing it restores Option B's Today exactly.

**B-4 amends C2 and C3 (marketplace-first home).** *What:* the home is house-first; the catalogue is a tab. The orphaned July rail (`HomeStudioBlock`, `MarketplaceLinksSection`, `RoomChipRail`, …) is **not** re-mounted — the Pieces tab does its job with a door that cannot hide. *Why:* F108 + F117 + F165, F120, F99 + F101, F11. The editorial feel C3 protects is kept — the story block survives with a date on it and a named cadence. *Cost:* none beyond B-1 and B-3. *Rollback:* same flag.

**B-5 amends C24 (direct orders carry no attribution).** *What:* three additive columns — `designer_id`, `project_id`, `commission_rate` — plus a settle-time route onto the existing fulfillment rail (metadata widening + one `fulfillment_intake` enqueue), a client-scoped SELECT policy over the three BOH read tables, and an earnings credit keyed on `order_id` with a partial unique index. *Why:* F22 (=F26), F152 (`00301_marketplace_vitals.sql:37-40` states the gap outright), F19 + F66, F154, F90, F198, F202. D1 and D3 both named an unattributed buy-now as the thing that ends the relationship. *Cost:* one migration, one webhook branch, one metadata widening, one policy — and **no second order table, no second notification path, no second ops surface**. *Rollback:* every column is additive and nullable; the client feature sits behind flag `direct-orders`.

**B-6 amends C11 (direct orders are backlog, not yet designed).** *What:* designed here and sequenced into W4, ahead of R32's items #1 (reviews) and #2 (scope change). *Why:* F12, F32 (=F04), F151, F153, F150 + F87 — and, on the sequence itself: the order chain already exists end-to-end on the backend (C24), so orders cost a migration and a screen, while reviews and scope-change are each a new table, a new portal surface and a new client surface with no backend at all. Building the ratified order would mean shipping two greenfield features before the one whose plumbing is already paid for, while a live "Add to Room → Saved ✓" dead end keeps taking $0 from people who wanted to buy. This is a conscious reversal of R32's #1→#2→#3, not an omission. *Cost:* W4. *Rollback:* flag `direct-orders`; the piece screen reverts to Save + Ask.

**B-7 amends C4 (canonical names).** *What:* three moves. (a) Tab labels drop the possessive — **Today · Spaces · Pieces · Studio** — while every destination screen keeps its canonical title verbatim ("Your Spaces", "Browse pieces", "Your Studio"), and each tab's VoiceOver label is that one canonical name in full. (b) **Saved stays its own canonical surface**, with its Boards / All items tabs intact, reached by a labelled `Saved` row at the top of the Pieces tab — not merged into a segment, not sharing the tab's accessibility label (M9 draws it). (c) The home has two names in canon — the glossary's **"Daily Room"** and the shipped header's **"Today"** (C23) — and this direction retires "Daily Room" in favour of the word already on the screen. *Why:* F50, F194, F98, and the fact that a tab's VoiceOver label cannot be two canonical names at once. *Cost:* a string table, one new row on the Pieces tab, and the glossary edit that (c) implies. *Rollback:* trivial.

**B-8 amends C18 (first-launch tour copy is canonical and delivered).** *What:* the ratified three-step tour is **rewritten, not re-anchored**. Step 1's copy — *"This is your Daily Room — picks and stories chosen for your space"* — becomes *"This is Today — what moved in your house, and what is waiting on you."* Step 3's anchor `.profileMonogram` no longer exists (M1: the monogram is gone), so step 3 re-points at the **Studio** tab with new copy — *"Your studio — projects, proposals, invoices and files"* — and `FirstLaunchTourTests`' pinned strings are updated with it. *Why:* B-1, B-3 and B-4 make two of the three ratified sentences false or dangling; naming that as "re-anchoring" would hide a rewrite of tested, ratified copy. *Cost:* three strings, one anchor, one test file. *Rollback:* the tour is gated by the same `house-first` flag as the root it describes.

**No amendment is sought to** C5 (honesty), C6 (voice), C7 (tokens), C9, C10, C12, C13, C15, C16, C25, C26, C27, C28. The second seat (§9, W6) needs none — a `household_members` junction plus an invite RPC is exactly the shape C13 prescribes.

---

## 9. First slice, waves, deltas, risks, rollback

**First slice (≤ 2 weeks, one iOS engineer + edge functions) — "the record, and the reason to know it changed." It requires none of the amendments and ships inside Option B's mount.**

iOS (additive, above the existing Next Move card):
- `Features/Home/Models/HouseRecord.swift` **(new)** — composes the two eyebrows from data the home already fetches.
- `Features/Home/Views/HouseRecordCard.swift` **(new)** — the card, both empties, `See all →`.
- `Core/Persistence/RecordSnapshotStore.swift` **(new)** — App Group snapshot of the composed record, painted **instantly** on launch and refreshed behind it. Moved here from W5, where it was only the widget's data source; on a cold cellular launch the record is the product and must not be a spinner.
- `Core/Persistence/LastSeenStore.swift` **(new)** — `patina.house.lastSeenAt`, written on `scenePhase → .active`, used only to mark rows `new`; the record's own window is a rolling 7 days.
- `Core/Services/BadgeCountService.swift` — **retain the rows it already fetches.** It runs on home appear and fetches all five collections (`DecisionsAPIClient.listPending`, `listThreadSummaries`, `listProposals`, `listInvoices`, `listProjects`) concurrently, then discards them down to five `Int`s (`:80-105`). This is a shared `@Observable` singleton the Studio rail and the Companion also read — the change is small and it is not free.
- `Features/Profile/ViewModels/StudioQueueBuilder.swift` — a **per-item** row variant. `payableInvoiceRow` / `pendingDecisionRow` / `pendingProposalRow` (`:82-140`) each emit one rolled-up row per kind with a count; the record draws one row per decision, with its own date.
- `Core/Networking/{Decisions,Proposals,Projects}APIClient.swift` — one `designer:profiles!…` embed each (§6.2).
- `Features/Home/Views/DailyGreetingHeader.swift` — greeting from `TimeOfDay.current`.
- `Features/Home/Views/DailyRoomView.swift` — mount the record between header and Next Move; label the monogram `Studio` with its waiting count (B-1's fallback).
- `Features/Notifications/Views/PushPrimerView.swift` **(new)** — the pre-permission screen with §4's four-event copy and the `UNUserNotificationCenter` flow. This is iOS work, not backend work.
- Tests: record ordering, both empties, the two-weeks-away header, first run (no gap line), the second-open case, Dynamic Type XXL, and a dark-mode pass that includes the invoice and proposal screens (F106).

Backend, in parallel: two edge-function HTTP call sites to `apns-send` (`proposal-send`, `invoice-send` + `invoice-reminders`) and **one new `AFTER INSERT` SECURITY DEFINER trigger** on `client_decisions` in the `00289` shape, each passing a `notification_log_id`.

That slice answers F13, F16, F30, F80, F91, F58, F186, F188, F209, F08, F38, F07, F47, F167 — and it is removable by deleting one mount. **It adds no *new* network calls**: the home already fetches these five collections and throws the rows away.

**Waves.**

| W | What | Amendments | Backend delta |
|---|---|---|---|
| W1 | The record · the greeting · the snapshot · money push · earned permission · the labelled Studio door | — | 2 `apns-send` HTTP call sites; 1 new decision trigger |
| W2 | The tab bar (hand-rolled) · Companion into the bar · Pieces tab · Saved as its own destination · tour rewrite | B-1, B-2, B-7, B-8 | none |
| W3 | The house on Today (project rooms + local rooms, real numbers) · designer seat · room budget · saved-row date/room/note · decays removed · project timeline | B-3, B-4 | client-scoped SELECT policy (or read RPC) over `project_rooms`; `rooms.budget_cents`; `saved_items.price_cents_at_save`; `profiles.last_seen_at` |
| W4 | Purchase — buyability gate, order sheet, Path A checkout, Path B ask, settle→fulfillment intake, Ordered over both rails, designer settle notice | B-5, B-6 | 3 columns on `direct_orders`; PI-metadata widening + intake enqueue; `automatic_tax` + `shipping_options`; client SELECT policy on 3 BOH tables; `designer_earnings` credit + partial unique index on `order_id` |
| W5 | Widget target (Home + Lock Screen) · deep links to invoice/proposal/decision/order · opt-in due reminder | — | none server-side (AASA is SP-03's portal work); client entitlements: App Group + associated-domains |
| W6 | Second seat on the house · maker pages · Live Activity on a delivery window | — | `household_members` + invite RPC + RLS; a read-only `get_maker` RPC over `vendors`; **if the activity updates remotely: an activity-token table + a push-type branch in `apns-send`** |
| W7 | Designer portal: attributed orders on the FF&E schedule (read-only, filterable by project) | — | portal work over `fulfillment_orders.designer_profile_id`; no new table |

**Backend deltas, totalled:** two `apns-send` call sites and one trigger; three columns on `direct_orders`; one metadata widening plus one enqueue; four RLS policies (three BOH read tables, one `project_rooms`); three columns elsewhere (`rooms.budget_cents`, `saved_items.price_cents_at_save`, `profiles.last_seen_at`); one webhook branch; one junction table with an RPC; one read-only RPC; plus SP-10's already-planned `get_recommendations` widening — to which this direction adds `description` and **`published_at`**. That RPC is a **frozen contract** (`00246_aesthete_quiz_bridge.sql`), so it is a DROP + CREATE with both GRANTs re-applied — SP-10 already pays for that; B adds two columns to a recreate that is happening anyway. No new NestJS service; `services/orders` stays dormant (C13).

**Risks.**

- *Apple review.* Physical goods pay outside IAP via hosted Checkout — the compliant rail the app already ships (C15). A WidgetKit target is neutral. The real review exposure is **SP-20's account deletion** (5.1.1(v)), release-gating before the next submission regardless of direction. There is no current installable TestFlight build — a fresh archive precedes any device claim.
- *Data.* The attribution columns touch money. Snapshot at create, never recompute; `commission_rate` immutable after `paid`; the earnings credit fires once, keyed on `order_id` by a partial unique index. Internal payable state stays the source of truth; Stripe reconciles toward it.
- *Tax.* `automatic_tax` implies registrations Patina may not hold. This is the one delta that is a **ruling, not a task**, and Path A is gated on it together with the responsibility paragraph.
- *Performance.* W1 adds no new network calls and paints from a local snapshot before any fetch.
- *Device-only.* Apple Pay inside Checkout, the APNs round trip, universal links, and the widget's App Group are **device claims** — none is provable in Simulator, this program produced no device pass, and `device_push_tokens.environment` yields `sandbox` tokens until a distribution archive ships (`00335:8-12`).
- *The tab bar* is the one change Kody has ruled against before; it rides its own flag, and B-1 now carries a fallback that fixes the discoverability complaint even if the flag never flips. Its text-only labels are an HIG deviation, not a violation.

**Rollback.** Four PostHog flags, fail-closed (C16): `house-first` (W2–W3), `direct-orders` (W4), `house-widget` (W5), `second-seat` (W6). W1 is one mount. Every migration is additive-only. The pre-amendment root stays compiled for one release after W2.

---

## 10. What Direction B deliberately does not do

- **No AR.** `usdz_url` is `NULL` on every path; SP-18 takes the affordance down and this direction does not put it back until an asset pipeline exists.
- **No compare surface.** F162 *and* F52 — nothing on a piece helps you decide — are refused by name. B takes only the cheapest half of deciding (the note, the save date, the room) and leaves side-by-side comparison, product Q&A and client reviews unbuilt.
- **No scope-change requests** (R32 item 2) and **no client reviews** (item 1) — reversed behind orders, with the reasoning in B-6.
- **No taste line.** Until one quiz owns one name (F96, F140), the app does not print a sentence about your taste it cannot repeat tomorrow.
- **No saved-piece feed to the designer.** D1 ranks a save that reaches her FF&E schedule above any commission; it is a portal surface, it is not in this direction, and it is named here as a cut rather than left unmentioned.
- **No cart.** One piece, one order — Patina's unit of purchase is a piece, not a haul.
- **No full-text catalogue search.** The Pieces tab ships server-side category filtering (`p_category` is already a parameter nobody sends) and the existing chips; search over 21 rows is theatre and over 21,000 rows is its own project. F43 stays open, named — and a door is not a search.
- **No board remote mirror.** SP-12 either wires boards or removes them.
- **No client-editable project data.** The client answers, signs, pays, asks — and now corrects the dimensions of a room they typed themselves. They never edit the designer's plan.
- **No streaks, badges, points, or day counters.** No countdown urgency on a piece or a proposal. No fabricated "new" — the story dot comes from a real read timestamp or it does not draw. No speculative push. No count of waiting chores on the Lock Screen. No percentage whose denominator is hidden behind an unlabelled tap (the match number is real — U02, F158 — and it is still the wrong instrument). No randomised feed shuffle. No social proof ("4 others saved this") over a population that does not exist. No scarcity or was/now framing on a repriced piece. No loss framing on a room. No permission ask at cold launch. No Wallet pass — an invoice is not a boarding pass. No SMS to clients: the 10DLC rail is designer- and trades-facing and stays that way.
- **No activity row for the reader's own actions. If you did it, it is state, not news.**

---

## 11. Mock manifest

Frame 402 × 874, Dynamic Island, `9:41`, home indicator. Tokens per `research/16-token-table.md`. Gutter **20** on Today, **24** on pushed screens. Today cards are **flat** (no shadow), radius **16**. Every DM Mono label is uppercase. An unloaded image is a Strata mark on `Background.secondary`, never a grey box. The tab bar is **83 pt** (49 + 34) with a `pearl` 1 pt hairline on top; it **replaces** the 120 pt hearth. Content marked *(example copy)* is not in the seed. Red (`error`) is reserved for money that is actually late; a decision's date carries itself in mono.

Seed content used throughout: designer **Leah Hartwell**; project **Aspen Loft Refresh** ($120,000, "Installation & Styling"); invoice **INV-2026-0142** $4,250.00 due Sep 1, 2026; proposal **"Aspen Loft — Living Room Refresh"** $18,500.00, review by Sep 8; decision **"Rug color - Natural vs Sand"**, both options $850, overdue Aug 22; pieces **Heirloom Oak Dining Table** $4,200 (Nordic Atelier), **Woven Jute Area Rug 8x10** $1,450 (Studio Piet), **Live-Edge Coffee Table** $2,100 (Heritage Lumber), **Brass Arc Floor Lamp** $890 (Schoolhouse), **Velvet Club Chair** $1,250 (Article); story **"MAKER SPOTLIGHT / The Grain Whisperer of Maine"**, 4 min.

### M1 — Today, activeProject (light) · **M1d dark variant**

*Tier/state:* `client@patina.dev`, four items waiting, last visit Thu Aug 20.

1. **Header row** — left `WEDNESDAY · AUG 26` (DM Mono 10, tracking 0.5, `Text.muted`) over `Good morning.` (Playfair Medium 28); right, bell glyph with a clay dot. *The monogram is gone* — Profile lives in the Studio tab. Top inset reserved (SP-19).
2. **The record** — card, `Background.secondary`, radius 16, flat, padding 16. Header line `SINCE YOU WERE LAST HERE · THU, AUG 20`. Two eyebrow groups, rows 56 pt, `pearl` hairlines. `NEEDS YOU`: `Leah asked about the rug colour.` / `asked Aug 22 · overdue`; `Leah sent a proposal to review.` / `by Sep 8`; `Your invoice is due.` / `$4,250.00 · Sep 1` (in `error #C77B6E` only once the due date has passed). `MOVED`: `Your dining table shipped.` / `Aug 25 · new`; `Leah added two pieces to the proposal.` / `Aug 24`. Footer link `See all →` (Inter Medium 15, `Text.interactive`).
3. **Your designer** — 44 pt monogram circle `LH` on `clay` @15%, `Leah Hartwell` (Inter SemiBold 18) over `Hartwell Studio · Aspen Loft Refresh`; trailing capsule button `Message`.
4. **Your house** — eyebrow `YOUR HOUSE`; rail of 240 × 150 cards: `Dining Room` / `$18,400 of $32,000 committed` *(example copy — from `project_rooms`)*; `Living Room` / `3 saved pieces · budget $9,000` *(example copy)*; final card `Add a room` (dashed `pearl`).
5. **From the workshop** — `DailyStoryCard` with `AUG 25 · 4 MIN` where the permanent unread dot was.
6. **Tab bar** — `Today` `Spaces` `Pieces` `Studio` in Inter Medium 13, active `Text.primary`, inactive `Text.muted`; trailing 5th slot = `StrataMarkView` at 0.8. No icons. Hand-rolled, so VoiceOver labels are set explicitly: "Today", "Your Spaces", "Browse pieces", "Your Studio", "Companion".

*M1d dark:* `#211E1B` ground, cards `#2C2926`, text `#F2EDE6`, hairlines `pearl #E5E2DD`, `error` and `clay` unchanged.

| Screen sheet | |
|---|---|
| Purpose | Answer "what happened to my house" in the first viewport, before any navigation |
| Entry | Cold launch · tab `Today` · push · widget |
| Components | `DailyRoomView` (recomposed) · `HouseRecordCard` (**new**) · `DesignerSeatCard` (**new**) · `RoomRail` (**new**) · `DailyStoryCard` (existing) · `PatinaTabBar` (**new**, custom) |
| Copy | as drawn, verbatim |
| Data | `BadgeCountService`'s five collections (rows retained) · per-item `StudioQueueBuilder` rows · `notification_log` · `DesignRequestStatusService` · `project_rooms` + local `RoomModel` · `editorial_stories` · `RecordSnapshotStore` |
| States | first paint → the last snapshot, instantly; refresh failure → the snapshot stands with `Let's try that again` on the failing group only; NEEDS YOU empty → `Nothing needs you right now.`; MOVED empty → `Nothing moved since Thursday.` |
| Interactions | `today_record_line_tapped {kind}` · `today_record_shown {needs_count, moved_count, days_since_last_seen}` · `today_record_empty_shown {half}` · `designer_card_message_tapped` · `house_room_opened` |
| Tier | guest/discovering: the record mounts with MOVED only, no designer seat; engaged: + the designer seat and the request row, no money rows |
| New vs today | The record, the greeting, the designer seat, the room rail, the dated story chip, the tab bar. Today's home is four blocks and a date (`DailyRoomView.swift:104-145`) |

### M2 — Today, discovering (light) · **M2d dark variant**

*Tier/state:* signed in, one room, three saved, no designer. 9:10pm.

1. Header — `WEDNESDAY · AUG 26` / `Good evening.` (`TimeOfDay.evening`).
2. **The record**, `MOVED` only: `The Brass Arc Floor Lamp you saved is $100 less than when you saved it.` / `Aug 24 · new` *(example copy)*; `A new story from the workshop.` / `Aug 25`. Empty variant drawn alongside: `Nothing moved since Thursday.`
3. **Your house** — full-width 180 pt room card: `Living Room` / `18 × 14 ft · 252 sq ft` / `3 saved pieces · budget $9,000` / `You added the Brass Arc Floor Lamp on Tuesday` *(example copy)*; `+ Add a room` below.
4. **New this week** — eyebrow `NEW THIS WEEK`; rail of 160 pt cards *(example copy — no local row carries a `published_at`)*: `Live-Edge Coffee Table · $2,100 · HERITAGE LUMBER`, `Ceramic Table Lamp · $420 · LOCAL POTTER`, `Brass Arc Floor Lamp · $890 · SCHOOLHOUSE`. Footer row: `Three pieces joined Patina this week.`
5. **Saved** — one summary row: `3 saved · Brass Arc Floor Lamp, Tuesday`. 6. **From the workshop** — story card. 7. Tab bar.

| Screen sheet | |
|---|---|
| Purpose | Give a person with no designer an honest reason to open — and an honest silence when there isn't one |
| Entry | cold launch · tab `Today` |
| Components | `HouseRecordCard` (**new**) · `RoomHeroCard` (**new**) · `NewThisWeekRail` (**new**, reuses `ProductCard`) · `DailyStoryCard` |
| Copy | as drawn; `NEW THIS WEEK` renders only at **≥3** rows with `published_at` inside 7 days |
| Data | `get_recommendations` widened with `description` + `published_at` (SP-10's DROP/recreate) · `saved_items` + `price_cents_at_save` · `products.deleted_at` · local `RoomModel` |
| States | no room → `Start with a room` with **"Type the dimensions"** and **"Scan it"**; no new pieces → block absent; nothing moved → the record's empty line, drawn, not hidden |
| Interactions | `house_add_room_tapped {method}` · `piece_card_tapped` · `today_record_line_tapped {kind}` |
| Tier | guest = identical minus the saved rows, plus `Sign in to keep this on every device.` |
| New vs today | Everything above the story. Today a discovering user sees the same four blocks as a guest and an activeProject client (F13) |

### M3 — Piece detail, purchase acts (light) · **M3d dark variant**

*Tier/state:* discovering — **Heirloom Oak Dining Table**, $4,200, `patina_managed`, gate passed.

1. 340 pt hero (`PatinaAsyncImage`; on failure the Strata mark). Floating bar: back · `?` · Share · ♥.
2. `NORDIC ATELIER` (DM Mono 10) — `products.brand`, not the vendor (SP-10). 3. `Heirloom Oak Dining Table` (Playfair 26). 4. `Quarter-sawn white oak · Hand-rubbed tung oil` (Inter 14, `Text.secondary`). 5. `$4,200` (Playfair Medium 28).
6. **New:** `84″ W × 38″ D × 30″ H` and `Made to order · ships in 10–12 weeks` *(example copy — empty in the seed; the buyability gate means a piece without them shows Path C instead)*.
7. **New:** the real description, printed from `products.description`.
8. **New, when a measured room exists:** `Your Living Room's longest wall is 18 ft. This table is 7 ft.` *(example copy)*
9. Provenance chips + maker story card (existing). 10. **New:** `Sold and shipped by Patina.` + the responsibility line from config.
11. Bottom bar above the tab bar: primary `Buy — $4,200` (capsule, `Interactive.active`, 52 pt), secondary ghost `Add to room` (SP-11).

*activeProject variant:* primary becomes `Ask Leah to source this`; the ghost row becomes `Buy it myself` + `Add to room`. *Gate-failed variant:* no `Buy`; primary is `Ask about this piece`, with the reason stated plainly — `We don't have this piece's size and lead time yet.`

| Screen sheet | |
|---|---|
| Purpose | Let a person decide, then act — buy it, or hand it to their designer |
| Entry | Pieces tab · Saved · a room · a `patina://piece/<id>` link |
| Components | `ProductDetailView` (existing) + `PurchaseActionBar` (**new**) + `FitLine` (**new**) |
| Copy | as drawn; the description is printed, not composed |
| Data | the detail reads the table directly — `products?id=eq.<id>&select=*,vendors(...)` (`ProductAPIClient.swift:91-105`) — so `description`, `dimensions`, `lead_time_weeks` and `patina_managed` need **no RPC change here**; that same `select` is SP-01's PGRST201 two-FK bug |
| States | loading → `One moment…`; failure → `Couldn't load product` / `Let's try that again` **with a working back control** (SP-01); gate fails or price null → Path C |
| Interactions | `piece_buy_tapped` · `piece_ask_designer_tapped` · `piece_add_to_room_tapped` · `piece_saved` |
| Tier | guest → `Buy` opens the auth sheet with a Cancel (SP-09), then the order sheet; engaged/activeProject → Path B primary |
| New vs today | Today the terminus is `Add to Room` → `Saved ✓` with no size, lead time, description, maker's town or purchase (F12, F17) |

### M4 — The room

*Tier/state:* activeProject, **Living Room**, three pieces in it.

1. 220 pt hero — the `warm` gradient (living → `warm`). 2. `Living Room` (Playfair 26) · `18 × 14 ft · 252 sq ft · TYPED, NOT SCANNED` *(example copy)*. 3. Stat row — `3 SAVED PIECES` · `$2,400 OF $9,000 BUDGET` · **no "IN AR" cell** (SP-18).
4. **In this room** — 2-up grid: `Woven Jute Area Rug 8x10 · $1,450`, `Brass Arc Floor Lamp · $890`, `Velvet Club Chair · $1,250`.
5. Single primary act — `Browse pieces for the Living Room` (SP-11 makes it room-scoped).
6. Two ghost acts side by side — `Edit dimensions` (the existing `.roomSettings(roomId:)` route) and `Set a budget`. 7. Tab bar (`Spaces` active).

| Screen sheet | |
|---|---|
| Purpose | The room is the thing that gets better with use — and the numbers on it must be correctable |
| Entry | tab `Spaces` · the room rail on Today · `patina://room/<id>` |
| Components | `RoomProjectView` (existing, trimmed) · `RoomSettingsView` (existing, now reachable) · `RoomBudgetSheet` (**new**) |
| Copy | as drawn; `TYPED, NOT SCANNED` replaces the `JUST SCANNED` / `MANUAL ENTRY` pair (F51); the stat is labelled `SAVED PIECES`, never spend |
| Data | local `RoomModel` (budget written locally first, mirrored to `rooms.budget_cents` on sync) · `saved_items` scoped by `room_id` · `project_rooms` where a project owns the room, in which case the stat reads `committed_cents` and is labelled as such |
| States | no pieces → `Nothing in this room yet.` + the one browse act; no budget → the ghost act, never a `—`; unsynced room → the budget still saves, locally |
| Interactions | `house_room_opened` · `room_budget_set` · `room_dimensions_edited` · `room_browse_tapped` |
| Tier | identical at every tier; a project's name appears only when the room belongs to one |
| New vs today | The pieces grid, the budget, `Edit dimensions`, the honest capture label, the removal of `0 IN AR` (F64, F110, F193) |

### M5 — The purchase flow (three panels in one mock)

**5a · Order sheet** (`.presentationDetents([.large])`, 36 × 4 drag handle): title `Order` (Playfair Medium 18) over `HEIRLOOM OAK DINING TABLE` (DM Mono 9). Then 72 pt thumbnail + `Nordic Atelier · Aarhus, Denmark` *(example copy)*; the description paragraph; `84″ W × 38″ D × 30″ H`; `Made to order · ships in 10–12 weeks`; a `pearl` rule; `Piece` … `$4,200.00`; `Delivery and tax are added at payment. You'll see the full total before you pay.` (Inter 14, `Text.muted`); `Sold and shipped by Patina.`; the responsibility paragraph and `Questions or damage: patina.cloud/help · (608) 555-0147` *(example copy — config-driven, and Path A does not ship until it is real)*; primary `Continue to payment`; caption `Payment opens securely in Safari.` *activeProject only, above the primary:* `Ordered in your name. Leah sees it on your project and is credited at the piece's trade rate. This doesn't change your price.`

**5b · Payment handoff** — `SFSafariViewController` over the sheet, Stripe Checkout chrome, the Apple Pay button as Stripe renders it (C25 — a device probe, not a build). On success the session returns to a static Patina thank-you page that carries no sign-in — **W4 repoints the direct-order `success_url` off the client-portal `/orders` page** (`create-checkout-session:554`), which is a web surface behind a web login and the wrong thing to show inside a sheet. Behind it the app shows `Confirming payment… This usually takes a few seconds.`

**5c · Order placed** — full screen: Strata mark, `Order placed.` (Playfair 28), `Heirloom Oak Dining Table · $4,200.00 · total with delivery and tax`, `A receipt is on its way to your inbox.`, the responsibility line again, `We'll tell you when it ships.` with a `Notify me` row (the push pre-permission moment), then `See your order` and `Back to Today`.

| Screen sheet | |
|---|---|
| Purpose | Take $4,200 from a person who has never bought furniture from a phone |
| Entry | `Buy — $4,200` on M3 |
| Components | `OrderSheet` (**new**) · `SFSafariViewController` (the `InvoicesViewModel` pattern) · `OrderPlacedView` (**new**) |
| Copy | as drawn, verbatim |
| Data | `create_direct_order(p_product_id, p_quantity)` → `create-checkout-session {direct_order_id}` (+ `automatic_tax`, `shipping_options`, widened PI metadata) → poll `direct_orders.status` on dismiss (3 s / 60 s, the invoice pattern) → `stripe-webhook` settles → `fulfillment_intake` enqueue |
| States | create fails → the error **above** a dimmed button with `Let's try that again` and `Message your designer`; poll times out → `We haven't seen this payment yet. We'll update this as soon as it clears.` — never the unconditional bank-transfer line (F157); **ACH chosen** (`us_bank_account` is live on this session) → `Your bank transfer is on its way. This usually clears in 3–5 business days.`; canceled → the sheet returns intact |
| Interactions | `order_sheet_shown` · `order_created` · `order_checkout_opened` · `order_checkout_returned {outcome}` · `order_settled` · `order_failed {reason}` · `push_permission_primer_shown` · `push_permission_result` |
| Tier | guest → auth sheet first, with a Cancel; activeProject → the attribution line, and this flow is the secondary act |
| New vs today | Entirely new on iOS. The backend chain exists end-to-end (`research/12-backend-reality.md` §5); the attribution and the tax/freight completion are B-5 |

### M6 — The return moment

**6a · Lock Screen**, 9:12am: title `Leah sent a proposal`, body `Aspen Loft — Living Room Refresh · review by Sep 8`. Below it the Lock Screen rectangular widget: `PATINA` over `Rug colour — asked Aug 22`. No count.

**6b · Home Screen small widget** — `Background.secondary` ground, eyebrow `SINCE THU`, one line `Leah asked about the rug colour.` (Inter Medium 15, two lines max), Strata mark bottom-right. Empty variant: `Nothing moved since Thursday.`

**6c · The permission primer** — full sheet, met at the first real event: Strata mark, `Four things, and nothing else.` (Playfair 24), the four named events as four mono lines, §4's sentence verbatim, then `Turn these on` and `Not now` — no dark-pattern asymmetry; `Not now` is a real button.

**6d · What greets you** — tapping the notification opens M1 with the record's top row expanded to its date and the decision one tap away. Tapping the widget opens M1 plain.

| Screen sheet | |
|---|---|
| Purpose | Bring the person back for something true, and land them where it is |
| Entry | APNs push · widget tap · an emailed link (once AASA lands, SP-03) |
| Components | `PatinaWidget` (**new** WidgetKit target — the app's first extension) · `PushPrimerView` (**new**) · `NotificationRouter` (existing, extended) |
| Copy | as drawn; every push names the person and the object, never "you have an update" |
| Data | `apns-send` from two edge functions and one new trigger, each passing a `notification_log_id`; the widget reads the App Group snapshot written on foreground — it can be one open behind, by design |
| States | widget with no data → `Open Patina to see your house.`; permission denied → no push, the record still works |
| Interactions | `push_received {kind}` · `push_opened {kind}` · `widget_opened` · `push_permission_primer_shown` |
| Tier | discovering/guest get no money pushes; the widget renders only for signed-in accounts |
| New vs today | The app has one off-app surface (push receive), no extension target (F130, A15), and asks for permission once, after a design request, with no copy at all (F47, F167) |

### M7 — Ask your designer (Path B sheet)

*Tier/state:* activeProject, from **Woven Jute Area Rug 8x10** — the same rug as the open decision.

Medium detent. Title `Ask Leah` over `WOVEN JUTE AREA RUG 8X10`. A 56 pt thumbnail with `Studio Piet · $1,450`. A room picker row: `For — Living Room ▾`. A pre-filled, fully editable message: *"Can we use this rug in the living room?"* Primary `Send to Leah`; caption `She'll see the piece, the price and the room.`

| Screen sheet | |
|---|---|
| Purpose | Let the client shop *with* the designer instead of around her |
| Entry | `Ask Leah to source this` on M3 · Path C at engaged/activeProject · the Companion's `Message your designer` row |
| Components | `AskDesignerSheet` (**new**) · `MessagingAPIClient` (existing) + SP-13's create call |
| Copy | as drawn; the message is editable and never sent without a tap |
| Data | `rpc_start_project_thread(p_project_id)` (idempotent, exists, granted) then `sendMessage` with the product id in metadata — one thread per project, so every entry point adds to one conversation |
| States | no project yet → `rpc_start_direct_thread`; send fails → the message is kept and `Let's try that again` offered |
| Interactions | `piece_ask_designer_tapped` · `ask_designer_sent {has_room}` |
| Tier | engaged and activeProject only; at discovering the same control reads `Get design help` |
| New vs today | The piece screen has no way to reach a person at all (F150, F87); messaging exists but a client cannot start a thread |

### M8 — Studio → Ordered ("where is it"), over both rails

*Tier/state:* activeProject — one piece Leah bought, one the client bought.

Pushed screen (top 24, content starts at 56). Header `ORDERED` / `Your orders`. Two cards: `Heirloom Oak Dining Table` / `NORDIC ATELIER` / four-step rail `Confirmed` `In production` **`Shipped`** `Delivered`, current step `charcoal`, the rest `pearl` / `Shipped Sep 12 · arriving Sep 18` *(example copy)* / `$4,200.00 · paid Sep 3` / rows `Track with the carrier →` and `Message your designer` / footer `You ordered this.` — then `Woven Jute Area Rug 8x10` / `STUDIO PIET` / rail at `In production` / `Leah updates this as it moves.` *(example copy)* / `Message your designer`.

| Screen sheet | |
|---|---|
| Purpose | Answer T8 — "where is it" — in one screen, for everything on the job, not only what you bought yourself |
| Entry | tab `Studio` → `Ordered` · the record's MOVED rows · an order push |
| Components | `OrderListView` / `OrderDetailCard` (**new**) · `PatinaStatusBadge` (existing) |
| Copy | the states are `_shared/fulfillment-templates.ts:31-37`'s six transitions verbatim |
| Data | one list over `fulfillment_orders` + `fulfillment_order_items` + `fulfillment_shipments` scoped to `client_profile_id = auth.uid()` (**the new SELECT policy — today those tables are admin/agent-read only, `00350:316-325`**); `direct_orders` supplies the paid-but-not-yet-intaken window. `Track with the carrier →` resolves `carrier` + `tracking` through a client-side carrier→URL template map (no `tracking_url` column exists, and none is added) |
| States | no orders → the section does not render; paid but not yet on the rail → `Paid Sep 3. We'll tell you when it ships.`; refunded → `Refunded Sep 20`; designer-sourced → `Leah updates this as it moves.` rather than a blank rail |
| Interactions | `order_status_opened` · `order_track_tapped` |
| Tier | any tier that has ordered, or whose designer has |
| New vs today | No order object exists anywhere in the client app (F19, F66); the state machine stops at `paid` (F154); the shipping push exists and reaches nobody (F198) |

### M9 — The Pieces tab, and Saved as its own door

*Tier/state:* discovering, three saved.

Tab root, gutter 20. Header `Browse pieces` (Playfair 26). Directly under it a full-width labelled row — `Saved` · `3 pieces` · chevron — pushing the canonical **Saved** surface with its **Boards / All items** tabs unchanged. Then the category chips (`ALL` `SEATING` `TABLES` `LIGHTING` `RUGS` …) and the one-card-size grid (SP-02). On the pushed Saved screen each row now prints `$890 · Brass Arc Floor Lamp` over `Living Room · saved Tuesday` and, where one exists, the note the data model has always held and no screen wrote: *"too deep for the alcove"*.

| Screen sheet | |
|---|---|
| Purpose | Give browsing a door that cannot hide, and keep Saved a canonical surface rather than a segment |
| Entry | tab `Pieces` · the Saved summary row on Today · `patina://piece/<id>`'s back path |
| Components | `EmergenceView` (existing) · `SavedRow` (**new**) · `TableView` (existing Saved surface) |
| Copy | tab label `Pieces`; screen title `Browse pieces`; row label `Saved` — the two canonical names stay distinct, and the tab's VoiceOver label is `Browse pieces` alone (B-7) |
| Data | `get_recommendations` with `p_category` (a parameter nobody sends today) · `saved_items` with `saved_at`, `room_id`, `note` (F197, F170) |
| States | nothing saved → the row reads `Saved` · `Nothing yet` and still draws (F14); no results for a chip → `Nothing here yet.` and the chip stays selected |
| Interactions | `browse_category_selected {category}` · `saved_opened` · `saved_note_edited` |
| Tier | identical at every tier; guest saves are local and belong to the guest (SP-06) |
| New vs today | Browse has no door on the home or in the orb (F98); Saved's door disappears at zero (F14); a saved row carries no date, room or note (F197) |

---

## 12. Critique log

Every blocking and major item from the four critiques, with its disposition. Minors taken without comment: homeowner MN-1…MN-11 (red reserved for late money; first-run header; `last_seen_at` mirror in W3; money screens in the dark pass; project sort; no phase row until W3; §7 reconciled; "the row is a summary — the tab is the door"; Files named in Studio; the primer drawn as M6c; the catalogue row moved under NEW THIS WEEK); designer m1–m5; feasibility MI-1…MI-12; canon N1–N4.

| Item | Disposition |
|---|---|
| **H·BL-1** Maya has no record | **Changed** — §1, §2: the record mounts at every tier; discovering rows = a saved piece withdrawn or repriced, the story, and the catalogue count moved under NEW THIS WEEK; supply floor (≥3) and a named weekly cadence; §2 states plainly that discovering is promised a weekly return, not a daily one |
| **H·BL-2** Ruth's orders excluded | **Changed** — §5 routes settled direct orders onto `fulfillment_orders`; M8 is one list over both rails, gated by a new client-scoped SELECT policy |
| **H·BL-3** Buy over a piece with no size | **Changed** — §5's buyability gate; M3's gate-failed variant |
| **H·BL-4** Nobody answers the phone | **Changed** — §5 gates Path A on a config responsibility paragraph + one reachable human, printed twice; otherwise B and C ship |
| **H·BL-5** Fit line / uncorrectable room | **Changed** — M4 `Edit dimensions` on `.roomSettings`; the fit line prints its numbers and waits for SP-19 |
| **H·MJ-1** Window collapses on second open | **Changed** — rolling 7-day window; `lastSeenAt` only marks rows `new` |
| **H·MJ-2** Chores crowd out what moved | **Changed** — two eyebrows, max 3 each, two empties |
| **H·MJ-3** Your house empty for activeProject | **Changed** — `project_rooms` read-only cards (§2 block 4; W3 policy) |
| **H·MJ-4** The record is a spinner | **Changed** — `RecordSnapshotStore` moved from W5 to W1 |
| **H·MJ-5** Trade rate discloses a payment | **Changed** — "the piece's trade rate… This doesn't change your price.", with the source column named |
| **H·MJ-6** No total before leaving | **Changed** — `automatic_tax` + `shipping_options` priced into W4 as a Kody tax ruling; the copy promises the full total before payment; Path A gated on it |
| **H·MJ-7** Story cadence | **Changed** — one a week, Thursday, ordered `published_at desc`, demoted when nothing published; the owner is a named ruling |
| **H·MJ-8** `3 WAITING` badge | **Changed** — the count is off both widgets |
| **H·MJ-9** Deciding not built | **Changed** — note, save date and room exposed (F170, F197); compare refused under F52's name too |
| **H·MJ-10** Taste line, two names | **Changed** — the line is cut until one quiz owns one name |
| **H·BL-1 sub-fix** "put *you added the lamp Tuesday* on the record" | **Rebutted** — that row is the reader's own act, which this direction's rule forbids and which the same critique ranks as "the most useful honesty instrument produced by this whole program" (critique, "keep it" #4). The date is kept and moved to where it belongs: the room's own state line (M2 block 3), which reads dated without claiming news |
| **D·B1** Self-buy invisible to the designer | **Changed** — a settle-time system message into the idempotent project thread, the order landing on her own fulfillment rail with `designer_profile_id`, and the FF&E join given W7 and a ledger line |
| **D·M1** Which `commission_rate` | **Changed** — snapshotted from `products.commission_rate` (`00152:52`); the copy corrected to "the piece's trade rate" |
| **D·M2** No fallback if the tab bar is vetoed | **Changed** — W1 labels the monogram `Studio` with a waiting count, independent of `house-first` |
| **D·M3** Claim route unnamed | **Changed** — "Patina support, cc'd to the designer of record", and a claim posts into the project thread |
| **F·BL-1** Shipping and tax are not calculated | **Changed** — fix (a): both priced into W4, the ruling named, Path A gated |
| **F·BL-2** `fulfillment-notify` cannot be reused verbatim | **Changed** — fix (a) adopted whole: nine columns become three, settle enqueues `fulfillment_intake`, the existing rail supplies the state machine, the templates, the push and the ops surface |
| **F·MA-1** File list short by two | **Changed** — `BadgeCountService` (retain rows) and a per-item `StudioQueueBuilder` row added; the perf claim restated as "no *new* network calls" |
| **F·MA-2** Designer name unfetchable | **Changed** — three `designer:profiles!…` embeds in W1, reusing `displayName`'s `"your designer"` fallback |
| **F·MA-3** F99/F101 unreachable | **Changed** — a client-scoped policy over `project_rooms` in W3, and the rail sources from it |
| **F·MA-4** `rooms.budget_cents` unreachable | **Changed** — §3 states the local-first + mirror-on-sync rule |
| **F·MA-5** `$2,400 of $9,000` | **Changed** — labelled `saved pieces` vs `budget`; `committed_cents` where a project owns the room |
| **F·MA-6** Widget cannot refresh on push | **Changed** — claim dropped; foreground + timeline policy; "one open behind" stated |
| **F·MA-7** Not a `TabView`; refactor unpriced | **Changed** — B-1 names the hand-rolled bar, the accessibility work, and the route→tab/105-call-site refactor |
| **F·MA-8** Live Activity delta is not none | **Changed** — activity-token table + push-type branch named, or foreground-only |
| **F·MA-9** Earnings key does not exist | **Changed** — keyed on `designer_earnings.order_id` with a partial unique index |
| **F·MA-10** Three runtimes; `00092` is a cron | **Changed** — §4's table restated: two edge-function POSTs, one new `AFTER INSERT` trigger, each passing `notification_log_id` |
| **C·B1** Tour copy is rewritten, not re-anchored | **Changed** — new amendment **B-8** naming both steps, the new copy, and the pinned test file |
| **C·B2** B-7's names don't line up 1:1 | **Changed** — Saved stays its own canonical destination behind a labelled row (not a segment); the home's two canon names reconciled to "Today"; **M9** drawn |
| **C·M1** B-6 never argues the sequence reversal | **Changed** — the reasoning moved into B-6 |
| **C·M2** M7's `Try again` | **Changed** — `Let's try that again` |
| **C·M3** §10 mischaracterises the match number | **Changed** — reworded to "no percentage whose denominator is hidden behind an unlabelled tap", with U02/F158 acknowledged |
