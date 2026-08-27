# 2x — Panel seat U3 · UX lens: commerce

**Seat:** U3 — commerce UX (browse → save → decide → buy → track), Opus.
**Evidence:** the 155-shot walk (`shots/`, indexed in `research/01-shot-ledger.md`), the walkers'
observations (`research/03-walk-observations.md`), code at `main @ 3cd84ecb3`, the local Supabase
stack (`127.0.0.1:54322`, read-only SELECTs run by this seat), and `research/12-backend-reality.md`
§1/§4/§5/§12 + `research/17-gap-fills.md` G1/G2/G3.
**Tasks run:** T3, T4, T6, T7, T8, T10, plus the seven U3 questions.
**Standing facts held:** C23 (Option B's "Today" is the shipped home, accepted), C24 (direct orders
live on the backend, no iOS client, no designer attribution), C25 (Apple Pay already rides the
hosted Checkout), C26 (push send is real and fires for nothing money-shaped), C27 (local edge-503,
codeless OTP mail and the keychain are environment, not product).

Simulator limits declared once: scan/LiDAR/AR were unreachable, so every AR- or scan-dependent
claim below is code-read and capped at confidence ≤ 0.6 with what would settle it.

---

## T3 — "Find a sofa for our living room."

**First glance:** "Browse pieces" over "10 pieces curated for your space", a row of chips
— "All · Seating · Tables · Lighting · Storage" — and then a grid that is visibly broken:
the left column runs off the left edge of the phone. The first card reads "M & BOARD /
rloom Oak / ing Table / ,200" (g-15). Its price is literally cut in half by the screen edge.

**Where I'd tap:** "Seating", because I asked for a sofa. It gives me "3 pieces curated for your
space": "Meadow Linen Sectional — $6,800", "Velvet Club Chair — $1,250", and a third card that is a
blank brown gradient labelled "UNKNOWN MAKER" with no photograph at all (g-16). The three cards
overlap each other at three different sizes.

**Where I'd hesitate:** on the sectional's card. $6,800 with a "43% match" badge and one line of
rationale — "Its style tags connect to your Warm Modern portrait." Nothing on the card, and
nothing anywhere behind it, tells me how wide it is, when it would arrive, whether it is in stock,
what the fabric is, who actually made it, or who I'd be buying from. I tap the card to find out and
get "Couldn't load product / Let's try that again" (g-17) — and then I discover the screen has no
Back button, no navigation, no Companion. The only way out of a product page in this app is to kill
the app (g-17c).

**Where I'd leave:** Wayfair, in the time it takes to force-quit. A shopping app whose product page
cannot be opened is not a shopping app.

**Would I come back tomorrow for this?** No. The one screen where a piece is supposed to argue for
itself has never rendered in any lane of this walk.

**Obviousness: 2** — I found the grid quickly, but it is unreadable, unsearchable, and terminates in
a trap.

*Findings produced:* U3-01, U3-02, U3-03, U3-04, U3-05, U3-06, U3-07, U3-08, U3-09, U3-10, U3-11,
U3-12, U3-13.

---

## T4 — "Save it. Find it again tomorrow."

**First glance:** every card carries a ♥ in its top-right corner, and a ⋯ menu whose first row is
"Save" (g-20). This is the one commerce gesture the app makes obvious.

**Where I'd tap:** the heart. Nothing happens that I can see — the outline stays an outline after
the tap (d-check10), there is no toast, no count, no "Saved to Living Room". The dark lane tapped
hearts twice and never got a saved item at all.

**Where I'd hesitate:** the next morning. I open "Saved" and land on the **Boards** tab, which says
"No boards yet / Save pieces from recommendations to create your first board" with a "Create Board"
button (c-22) — while the Companion row I just came through said "1 SAVED PIECE". My piece is one
tab over under "All items", priced "$4200" with no thousands separator (c-22b). If I take the app's
advice and create a board, it stays empty forever: nothing in the app can put a piece into a board
(`CollectionsViewModel.addToBoard` has no call site).

**Where I'd leave:** back to a Pinterest board that at least holds what I put in it, and to a
screenshot in Photos — which is what I would actually do here.

**Would I come back tomorrow for this?** Only if I trusted the save. I don't: the save gives no
feedback, the default tab denies it exists, and tapping the saved row lands back in the broken
product page (c-25).

**Obviousness: 3** — saving is one tap; *finding* it again is three, behind a bubble, in the wrong
tab.

*Findings produced:* U3-14, U3-15, U3-16, U3-17, U3-18, U3-19, U3-20, U3-21.

---

## T6 — "Is this the one? Help me decide."

**First glance:** the ⋯ menu on the card: "Save · Share · Not for me · View details" (g-20). Four
verbs, and "View details" leads to the trap.

**Where I'd tap:** "Share", to show my partner. The iOS sheet comes up titled **"Patina Designer
Portal — app.patina.cloud"** (g-19). No product name in the preview, no image, no price — I am
handing my partner a link to the *designer portal*, under the designer portal's name, and because
the app declares no associated domain, that link cannot open Patina even if they have it installed.

**Where I'd hesitate:** looking for the two things that actually settle a furniture decision — a
side-by-side compare and a place to write "too big for the bay window". Neither exists. The
`notes` field is in the model and in the save payload; nothing writes it. And there is no "ask my
designer about this piece" on any product surface — the one designer CTA the glossary ratifies,
"Get design help", appears on eleven screens and not on the piece.

The app's own decision surface, when a designer *is* engaged, is worse than the browse card: "Rug
color - Natural vs Sand", two options at **$850 each**, both with **no image and no swatch** (c-18).
A colour decision, presented without colour, with money attached.

**Where I'd leave:** to a text thread with my partner, with a screenshot attached.

**Would I come back tomorrow for this?** No — nothing I do here is remembered as *thinking*. The app
remembers that I liked something, never why, and never what I compared it against.

**Obviousness: 2** — the aids that exist are hidden in a ⋯ menu; the aids that matter are absent.

*Findings produced:* U3-22, U3-23, U3-24, U3-25.

---

## T7 — "Buy it." — the purchase probe

**First glance:** there is no cart, no price-inquiry, no "where to buy", no vendor link, and no
"Buy" anywhere in the app. The terminus of every browse path is one button.

**The dead end, verbatim** (`Features/ProductDetail/Views/ProductDetailView.swift:377`):

> **`Add to Room`** — and, once tapped — **`Saved ✓`**

with, in the top bar, only: back chevron · `?` · Share · ♥.

**Where I'd tap:** nowhere, because there is nothing to tap. The nearest commercial act is six taps
into a lead form — Companion → "Get design help" → pick scans → details → review → "Send request" —
which is a request to be introduced to a human, not a purchase.

**Where I'd hesitate:** at the mismatch between what the backend can do and what the screen offers.
`public.direct_orders` is built end to end — `create_direct_order` RPC, the `direct_order_id` branch
in `create-checkout-session`, the settle branch in `stripe-webhook`, receipt and failure emails — and
I confirmed against the local catalog that **19 of the 21 products are already `patina_managed`,
i.e. already pass the RPC's buyability gate**. The money rail is armed and pointed at a button
nobody drew. The entire delta is client-side.

**Where I'd leave:** the maker's own site — except the app won't tell me who the maker is
(`source_url` exists on `products` and is never returned), so I'd leave to Google.

**Would I come back tomorrow for this?** No. Nothing here converts.

**Obviousness: 1** — I could not find a purchase path because there is none.

*Findings produced:* U3-26, U3-27, U3-28, U3-29.

---

## T8 — "I've ordered / my designer ordered — where is it?"

**First glance:** nothing on Today. The home is four modules — date, one Next Move, one story, one
Active Room — and it does not scroll (c-04, confirmed pixel-identical in dark, d-01/d-02). A client
with three projects, four proposals, an open $4,250 invoice and two overdue decisions sees none of
it on the first screen.

**Where I'd tap:** the unlabelled monogram in the top-right corner, then scroll Profile to "STUDIO /
The work around your home, in one place." That page is genuinely good at *state*: "Awaiting you 3 —
Decisions · 2 project choices are ready · Overdue · Aug 22 / Invoice · $4,250.00 remaining · Due
Sep 1 / Proposal · Aspen Loft — Living Room Refresh · Review by Sep 8" (c-06b).

**Where I'd hesitate:** the invoice I am being asked to pay is "Dining table — deposit (50%)
$2,650.00" and "Primary bedroom nightstands (pair) — deposit (50%) $1,600.00" (c-13b). I have paid
a deposit on a dining table. **Where is the dining table?** It appears nowhere else in the app: not
on the project, not in a room, not as a piece, not as an order. The project screen is three stats,
an Invoices row, and a boxed instruction written for my designer — "Set up phases, payments, and
FF&E in the portal →" — plus a stat labelled "CLIENT VIEW / Milestone" (c-08). It also prints
"BUDGET $120,000" while "Your budget / ACROSS YOUR PROJECTS" says "$4,250 BILLED" (c-15).

There is no order object in the client app at all, and on the backend `direct_orders.status` stops
at `pending_payment / paid / canceled` — there is no shipped, no delivered, no ETA, no tracking
number. The one place in the whole platform that speaks the shipping vocabulary I want
("confirmed / in_production / shipped / delivered / eta_change / substitution") is
`fulfillment-notify`, which rides the designer-sourced BOH rail and only fires when an admin
operator presses send.

**Where I'd leave:** text my designer. Which is exactly the phone call D1 said she will not accept.

**Would I come back tomorrow for this?** Ruth would — once — and find the same screen, because
nothing computes "what changed since you last looked".

**Obviousness: 2** — the Studio is good; it is three acts behind an unlabelled circle, and it
answers "what do you owe" instead of "where is my table".

*Findings produced:* U3-30, U3-31, U3-32, U3-33, U3-34, U3-47.

---

## T10 — "The designer sent a proposal / an invoice is due. How do I find out?"

**First glance:** the bell. I tap it and get "Notifications / Nothing yet / Updates from your
designer will land here." with a **"Get design help"** button (c-21) — the acquisition CTA, shown to
a client who has a designer, three projects and four open items. Zero rows, while the Studio one
screen away says two decisions are overdue since Aug 22.

**Where I'd tap:** into the proposal, because it is the biggest number. The list reads "AWAITING
YOUR REVIEW (1) · Aspen Loft — Living Room Refresh · $18,500.00 · Expires Sep 8" and, under it,
**"SIGNED (1) · Sample accepted proposal · $100,000.00"** (c-09) — for a proposal that is `accepted`,
not signed; the seed carries zero signed proposals. That word on a six-figure document is not a
label, it is a legal claim.

**Where I'd hesitate:** at the signature. The sheet reads "SIGN PROPOSAL / Aspen Loft — Living Room
Refresh / Type your full name to e-sign. Signing confirms the scope and kicks off your project." and
that is *all* it says (c-11c) — no amount, no date, no line items, no terms, no acknowledgement
checkbox. One screen behind it the terms read "Deposits are non-refundable once procurement begins.
Custom items are final sale." I am typing my legal name into a box that restates none of it.

Then the invoice: "Pay $4,250.00 / Pay securely by card or bank transfer." (c-13b). The screen that
takes $4,250 never says when it is due — "Due Sep 1, 2026" is printed on the list I just left and
dropped on the detail. In the walk the hand-off failed (a known local 503, not an app defect) and
the *failure UX* is the finding: a single red line, "Unable to start payment. Please try again.",
injected under a still-fully-enabled button, shoving "Pay securely by card or bank transfer" half
off the bottom edge, with no retry, no spinner, and no way to reach a human about $4,250 (c-14).

**How I actually find out today:** I open the app and hope the Next Move changed. Push send is real
and provisioned, and **not one of its five callers touches an invoice, a proposal, a decision or an
order**. The permission is asked exactly once per install, only after a design request is submitted,
with no pre-permission screen — so a client who never files a request is never asked at all.

**Where I'd leave:** email, which is the only channel that actually notifies me.

**Would I come back tomorrow for this?** Only out of anxiety, which is the wrong reason and the one
Patina's voice forbids engineering.

**Obviousness: 2** — the acts exist and are well made; nothing tells me they are waiting.

*Findings produced:* U3-35, U3-36, U3-37, U3-38, U3-39, U3-40, U3-41, U3-42, U3-43, U3-44, U3-45,
U3-46.

---

## The seven U3 questions

### 1. The purchase dead end, verbatim

Every browse path in the app terminates on `ProductDetailView`'s action bar
(`Features/ProductDetail/Views/ProductDetailView.swift:338-399`), whose entire commercial vocabulary
is one button:

> **`Add to Room`** → once tapped → **`Saved ✓`**

Top bar: back chevron · `?` · **Share** · **♥**. No cart, no "Buy", no "Request a quote", no vendor
link, no `source_url`, no price-inquiry, no stock, no "where to buy". Grep confirms zero hits for
`direct_order`, `create_direct_order`, or "buy now" anywhere in `apps/mobile/Patina`.

Two aggravating facts. First, on the standard route `.pieceDetail(pieceId:)` no room context is
passed (`ContentView.swift:292-294`), so even "Add to Room" does not add to a room — it writes a
local `TableItemModel` row. Second, in this build the screen never renders at all: it fails with
PostgREST `PGRST201` (ambiguous `vendors(...)` embed, two FKs) at
`Core/Network/ProductAPIClient.swift:99`, and the failed screen exposes exactly one element — the
retry link — so the user is trapped until they force-quit (g-17, g-17c, c-25, d-04, x-04).

**The honest one-liner for the deck:** *the app's last word on a $6,800 sofa is "Saved ✓".*

### 2. Trust fields — what exists vs what is shown

Columns from `supabase/migrations/00001_initial_schema.sql:29-45`, `00060`, `00152`; RPC contract
from `00246_aesthete_quiz_bridge.sql:193-300`; decode from `Core/Models/ProductModel.swift:12-66`;
render from `ProductDetailView.swift:141-267`. "Populated" = live count over the 21-row local
catalog, read by this seat.

| Trust field | Column on `products`? | Returned by `get_recommendations`? | Decoded by the app? | Shown on the detail? | Populated (local, 21 rows) |
|---|---|---|---|---|---|
| Name | ✔ | ✔ | ✔ | ✔ | 21/21 |
| Price (retail) | ✔ `price_retail` cents | ✔ `price_cents` | ✔ | ✔ | 21/21 |
| Trade price | ✔ `price_trade` | ✘ | ✘ | ✘ | — |
| **Dimensions** | ✔ `dimensions jsonb` | **✘** | **✘** | **✘** | **0/21** |
| Materials | ✔ `materials text[]` | ✔ as `material_tags` | ✔ | ✔ (·-joined subtitle) | 14/21 |
| **Lead time** | ✔ `lead_time_weeks` (CHECK-required for `layer='studio'` only) | ✘ | ✘ | ✘ | **1/21** |
| **Stock / availability** | **no column** | ✘ | ✘ | ✘ | — |
| **Shipping / delivery** | **no column** | ✘ | ✘ | ✘ | — |
| **Returns / who is responsible** | **no column** | ✘ | ✘ | ✘ | — |
| Description | ✔ `description` | ✘ | ✘ | ✘ | 14/21 |
| Maker name | via `vendors.name` | ✔ `maker_name` | ✔ | ✔ mono tag | **7/21** (14 rows have no `vendor_id` → "Unknown Maker") |
| Maker location | `vendors.made_in` | ✔ `maker_location` | ✔ | ✔ | **0/104 vendors** |
| Maker story | `vendors.brand_story` | ✔ `maker_story` | ✔ | ✔ story card | **0/104 vendors** |
| Brand | ✔ `products.brand` | **✘** | ✘ | ✘ | 21/21 |
| Maker's own page | ✔ `source_url` | ✘ | ✘ | ✘ | 9/21 |
| Badges ("Provenance") | ✔ `products.tags` | ✔ | ✔ | ✔ emoji chips | — |
| Match score | engine | ✔ | ✔ | ✔ "{n}% match" | — |
| AR model | **no column** | `NULL::text` hard-coded | always nil | button never draws | 0 |
| Commission rate | ✔ `commission_rate` | ✘ | ✘ | ✘ | orphaned — no write path reads it |

**Two conclusions.** (a) Of the five fields T3 asks to be legible — price, maker, materials,
dimensions, lead time — **two do not exist in the app at any layer**, and a third (maker) is
populated for a third of the catalog and shows the *retailer* where a brand column with the real
name sits unused: "Heirloom Oak Dining Table" is labelled **ROOM & BOARD** while its `brand` reads
"Nordic Atelier". (b) The provenance layer — the whole brand thesis — is **empty in this
environment: 0 of 104 vendors carry `made_in` or `brand_story`**. The maker tag and the maker-story
card have nothing to render. *What would settle this:* the same two counts against Strata's
`vendors`/`products`; no prod read was available to this program.

### 3. The three purchase paths, by tier, with the Apple rule

Apple's rule first, because it decides the shape: **physical goods must not use in-app purchase**
(App Store Review Guidelines 3.1.3(e) / 3.1.5(a)) — they must be paid for outside IAP, and Stripe
hosted Checkout in `SFSafariViewController` is exactly the compliant rail the invoice screen already
ships. IAP is only in scope for a *digital* good; a design consultation sold as a digital service
would be a separate 3.1.1 conversation, so if a direction ever sells a "consultation" as a
standalone in-app digital product, it must say so explicitly. Physical furniture: external payment,
always. Nothing in the paths below touches IAP.

| Path | Who sees it | When it applies | Mechanism today | Delta to ship |
|---|---|---|---|---|
| **A · Direct** — "Buy it" | guest (sign-in wall at the tap) · discovering · engaged | The piece is `patina_managed` or sold by a Patina-catalog vendor **and** the buyer has no designer on this room | `create_direct_order(product_id, qty)` → `create-checkout-session {direct_order_id}` → `SFSafariViewController` → `stripe-webhook` settles, emails a receipt | **Client-side only**: one order sheet, one button, reuse `InvoicesViewModel`'s poll-on-dismiss pattern |
| **B · Through your designer** | activeProject (and engaged, once a designer is claimed) | A designer is engaged on the room the piece is being placed in — the piece belongs on her FF&E schedule and the margin is hers | Nothing today. The designer's rail is proposals → invoices → hosted Checkout (C10), raised in the portal | Client: "Ask Leah to source this" writes a request the designer sees in The Document. Backend: a request table, or reuse the decision/selection rail |
| **C · Quote / made-to-order** | any tier | Price is absent or the piece is bespoke (custom sizing, COM fabric, `lead_time_weeks` unknown) | Nothing today; there is no price-inquiry affordance anywhere | Client: "Ask about this piece"; backend: reuse the design-request/lead rail with a `product_id` |

**Tier rule, stated once:** *the presence of a designer on the room decides the path, not the
tier badge.* Path B must pre-empt Path A wherever a designer is engaged on that room — otherwise the
app competes with the designer inside her own client's phone, which is the single thing D1/D3 said
would stop them sending clients here.

### 4. Minimum viable order state machine, and where it lives

**Where it lives: `public.direct_orders` (00276), extended by one migration.** Not
`services/orders` — that Prisma `Order` model is dormant, its Stripe module unset in every
environment, and C13 forbids new NestJS services. Not a new table — the existing one already
snapshots money, carries RLS (`client_id = auth.uid()`, SELECT-own), and is already wired into
`create-checkout-session` and `stripe-webhook`.

Today's vocabulary is `pending_payment → paid → canceled` (+ `refunded` from 00277). That is a
*payment* machine, not an *order* machine. The minimum honest addition:

```
                    create_direct_order
                            │
                     pending_payment ──── canceled (abandon / expiry)
                            │ stripe-webhook: checkout.session.completed
                            ▼
                          paid ──────────── refunded (charge.refunded, 00277 trigger)
                            │
   ── fulfillment_status ───┴──────────────────────────────────────────────
      unfulfilled → confirmed → in_production → shipped → delivered
                                     └── eta_change / substitution (events, not states)
```

- One migration: `direct_orders.fulfillment_status text` (default `'unfulfilled'`, CHECK over the
  five values), `shipped_at`, `delivered_at`, `tracking_number`, `carrier`, `eta_date`.
- **Adopt `fulfillment-notify`'s vocabulary verbatim** (`_shared/fulfillment-templates.ts:31-37`)
  rather than inventing a second one — the platform already speaks
  `confirmed / in_production / shipped / delivered / eta_change / substitution` on the BOH rail, and
  reusing it means one push template set for both rails.
- Writer: an admin/ops surface or an edge function, never the client (there is no client UPDATE
  policy and there should not be one).
- **Attribution belongs in the same migration** (see Q3 Path B and finding U3-28):
  `designer_id`, `project_id`, `commission_rate` snapshotted at create time. Adding it now is free;
  adding it after the client ships means backfilling money.

### 5. What Walt needs to see before he pays $4,000 — the pre-payment checklist

Ordered by what would stop him, most-stopping first. ✔ = present today, ✘ = absent.

| # | What Walt must see | Today |
|---|---|---|
| 1 | **The full delivered price**, itemised: piece + shipping + white-glove + tax, before he commits | ✘ — one price, no shipping line, no tax line, no total |
| 2 | **Dimensions**, with the doorway/room check implied | ✘ — column empty (0/21), never returned, never decoded |
| 3 | **Who made it and where** — the name, the town, the workshop | ✘ in practice — 0/104 vendors carry `made_in`; 14/21 pieces read "UNKNOWN MAKER" |
| 4 | **When it arrives** — a real lead-time range, and what changes it | ✘ — `lead_time_weeks` populated on 1 of 21 rows |
| 5 | **Who is responsible if it arrives damaged**, and the claim path | ✘ — no returns copy anywhere in the app |
| 6 | **Materials and finish**, in words a person uses | ~ — `materials` on 14/21, rendered as a ·-joined tag string, not a spec |
| 7 | **A photograph that is of this piece** | ✘ — "Live-Edge Coffee Table" shows a ladder-back chair on grass; "Terracotta Planter Set" shows a mint plastic pot (g-15) |
| 8 | **What happens after he taps pay** — receipt, confirmation, who to call | ~ — the invoice rail says it well ("Payment received — thank you! A receipt is on its way to your inbox."); the piece rail has nothing to say |
| 9 | **The deadline, on the screen that takes the money** | ✘ — "Due Sep 1, 2026" is printed on the list and dropped on the detail (c-12 → c-13) |
| 10 | **A human to reach, named, one tap away** | ✘ — the designer is named exactly once in the entire signed-in app, on the invoice: "Aspen Loft Refresh · from Leah Hartwell", with no photo, no studio, no contact |

Walt's own bar was *"does this respect my time, and would I trust it with a four-thousand-dollar
chair?"* Six of the ten rows are absent outright. The app currently asks him to spend $4,250 on a
screen that will not tell him when it is due.

### 6. Post-purchase — what brings someone back after the order

What exists today, honestly:

- **Nothing on the piece rail**, because there is no order.
- **On the designer rail:** the invoice detail's settle banners are genuinely good —
  "Confirming payment… This usually takes a few seconds.", then "Payment received — thank you! A
  receipt is on its way to your inbox." (`InvoiceDetailView.swift:99-104`). That is the single best
  post-money moment in the app, and it lasts one screen.
- **After that, nothing computes a delta.** No last-seen timestamp, no "since your last visit", no
  receipt history in-app ("PAYMENTS / No payments recorded yet." is the only payments UI), no
  activity feed — Notifications is empty for a client with four open items (c-21).

The four honest return loops an order would create, in cost order:

1. **The status line on Today.** One Next Move branch: "Your dining table shipped" / "Arriving
   Thursday". Free once `fulfillment_status` exists — the Next Move ladder already takes an
   eight-input branch (`TodayExperience.swift:48-160`).
2. **Push on state change.** `apns-send` is complete and provisioned; wiring a transition is *one*
   `PERFORM public.invoke_edge_function('apns-send', …)` call site, on a pattern already proven
   three times in SQL. This is also the pre-permission moment the app currently lacks: "Tell me when
   it ships" is the first honest reason to ask.
3. **The piece landing in the room.** A delivered order that drops its piece into the room it was
   bought for turns a purchase into the app's own return object — the room is the only surface that
   already gets better with use.
4. **The receipt, in the app, forever.** Order history is the boring loop every commerce app has and
   this one does not: what I bought, when, for how much, from whom, and the claim path if it broke.

Explicitly rejected as manipulative or dishonest: order-status *streaks*, "3 people are viewing this
piece", countdown timers on a proposal's expiry, and any badge that counts something the user did
not do. The story card's hard-coded unread dot (`EditorialStoriesAPIClient.swift:119`) is the shape
of the mistake to avoid — a freshness signal that is always on.

### 7. Apple Pay — availability and cost of each container

| | **Hosted Checkout in `SFSafariViewController`** (shipped today) | **Stripe `PaymentSheet`** (stripe-ios) | **Through the designer** (invoice raised in the portal) |
|---|---|---|---|
| Apple Pay available? | **Yes — already.** Apple Pay on the Web works in `SFSafariViewController`, and Stripe Checkout surfaces the wallet automatically wherever `card` is an accepted method. Both session paths pass `card` (`create-checkout-session/index.ts:935-961`, `:1131-1140`); there is no `ui_mode`, no `wallets` hash, no suppression | Yes — but only after every row below | Yes, inherited — it is the same hosted Checkout |
| iOS dependency | none (`SafariServices`) | new SPM deps `StripePaymentSheet` + `StripeCore` | none |
| App config | none | Apple Pay capability + **merchant identifier** entitlement + publishable key shipped in the binary | none |
| Backend | none — the fn already returns `{ url }` | new mode returning PaymentIntent `client_secret` + ephemeral key + customer id | none |
| ACH / `us_bank_account` | works as-is (Financial Connections, `verification_method: 'automatic'`) | must be re-declared and re-tested | works as-is |
| Settle confirmation | existing poll-after-dismiss (3 s / 60 s) | rewrite around the sheet's completion callback | existing |
| Surcharge line | already a real Checkout line item (`index.ts:965-987`) | must be re-modelled | already |
| Apple review risk | none — external payment for physical goods is the compliant path | none for goods; the entitlement is a review touchpoint | none |
| **Net cost** | **$0 — already shipped** | one dependency, one entitlement, one backend mode, one settle rewrite | $0 |

**Verdict:** "add Apple Pay" is a **probe, not a build** — one device, one card in Wallet, one real
invoice, one look. Nobody has done it. The one live gotcha: the invoice branch narrows
`payment_method_types` to a single rail when a caller claims one (`index.ts:935-938`); today iOS
sends only `StartCheckoutBody(invoiceId:)` so both rails ride and the wallet appears — but a future
in-app "pay by bank" toggle would silently delete Apple Pay from that branch. PaymentSheet buys one
fewer context switch and a native sheet; it does **not** buy Apple Pay, which is already there.

---

## Closing lines

**What would make me buy here instead of the maker's own site**

1. **The room is the argument.** No maker's site can show me the piece against my own wall with my
   own dimensions. Patina has the room and the scan and shows me neither on the piece — no
   dimensions, no fit, no AR (`usdz_url` is `NULL` on every path). Ship *fit*, and the maker's site
   cannot compete.
2. **My designer's judgement, attached to the piece.** "Leah picked this for your living room" is
   worth more than any match percentage, and it is the one thing Wayfair structurally cannot say.
   Today the app says "48% MATCH" and never says her name.
3. **One place that remembers the whole purchase.** What I bought, when it ships, who to call when
   it arrives scratched. Right now the app forgets a piece the moment I leave its screen — and it
   cannot even open that screen.

**Retention verdict (this lens)**

**Commerce cannot retain anyone today, and it is closer than it looks.** The funnel is broken at
three distinct places, in descending severity: the product page does not render at all (a
one-line PostgREST fix); there is no purchase act on any surface (a client-only build — the RPC,
the Checkout branch, the webhook settle and the receipt emails are all live, and 19 of 21 catalog
pieces already pass the buyability gate); and there is no order object, so "where is it" — the only
post-purchase reason to return — has nowhere to live. Against that, the money rail the *designer*
raises is well built and genuinely trustworthy in shape: real Checkout, real settle banners, real
poll. The gap is not architecture. It is one screen, one button, and one column of shipping states.
The decision that must not be deferred is **attribution**: a `direct_orders` row credits the designer
nothing today, and adding `designer_id`/`project_id`/`commission_rate` before the client ships is
free, while adding it afterwards means backfilling money.

---

## Findings

| id | title | severity | confidence | shots |
|---|---|---|---|---|
| U3-03 | Product detail never renders and traps the user | S0 | 0.95 | g-17, g-17b, g-17c, c-25, d-04, x-04 |
| U3-26 | Every browse path ends at "Saved ✓" | S0 | 0.95 | g-20, g-15 |
| U3-02 | Browse grid runs off the left edge of the screen | S0 | 0.95 | g-15, g-15b, d-03, x-03 |
| U3-41 | Accepted proposal labelled "SIGNED" at $100,000 | S0 | 0.9 | c-09 |
| U3-40 | Sign sheet restates no amount, terms or date | S0 | 0.9 | c-11c, c-11 |
| U3-30 | No order object anywhere in the client app | S0 | 0.9 | c-08, c-13b |
| U3-37 | No push fires for invoices, proposals or decisions | S0 | 0.9 | c-21 |
| U3-27 | Buy-now is armed on the backend and unbuilt on iOS | S1 | 0.9 | g-20 |
| U3-28 | A direct order credits the designer nothing | S1 | 0.9 | — |
| U3-04 | Dimensions exist as a column and nowhere else | S1 | 0.9 | g-15 |
| U3-05 | Lead time never reaches the shopper | S1 | 0.85 | g-15 |
| U3-06 | No shipping, returns or responsibility copy exists | S1 | 0.9 | g-15, c-13b |
| U3-07 | The maker line shows the retailer, not the maker | S1 | 0.75 | g-15, g-22b |
| U3-08 | Provenance layer renders empty on every product | S1 | 0.7 | g-15, g-16 |
| U3-12 | Product photography does not match the product | S1 | 0.85 | g-15, g-16, c-22b |
| U3-14 | Saving a piece gives no visible confirmation | S1 | 0.85 | d-check10, d-check11 |
| U3-15 | Saved opens on an empty tab while an item exists | S1 | 0.9 | c-22, c-22b, g-21 |
| U3-16 | A board can be created but never filled | S1 | 0.9 | c-22 |
| U3-19 | Every saved piece leads back into the trap | S1 | 0.9 | c-22b, c-25 |
| U3-20 | Piece-detail saves are local-only and duplicate | S1 | 0.85 | — |
| U3-21 | The Saved door vanishes for pieces saved from Browse | S1 | 0.8 | c-05 |
| U3-22 | No compare and no notes on any piece | S1 | 0.9 | g-20 |
| U3-23 | Sharing a piece hands over the designer portal | S1 | 0.95 | g-19 |
| U3-24 | No "ask my designer" on the piece surface | S1 | 0.85 | g-20 |
| U3-25 | An $850 colour decision shown without colour | S1 | 0.9 | c-18 |
| U3-32 | Designer-facing FF&E instruction rendered to the client | S1 | 0.95 | c-08 |
| U3-33 | Two budgets for one project, both labelled budget | S1 | 0.9 | c-08, c-15 |
| U3-34 | Due date dropped from the pay screen | S1 | 0.9 | c-12, c-13, c-13b |
| U3-35 | Notifications empty while four things are overdue | S1 | 0.9 | c-21, c-06b |
| U3-38 | Push permission asked once, only after a lead form | S1 | 0.85 | — |
| U3-42 | Payment failure is a red line under a live button | S1 | 0.9 | c-14 |
| U3-43 | Card payers are told a bank transfer has started | S1 | 0.8 | — |
| U3-46 | No delete-account path for an in-app account | S1 | 0.85 | c-28, c-28b, c-27 |
| U3-01 | No search anywhere in the marketplace | S1 | 0.9 | g-15, g-16 |
| U3-29 | No vendor link or price inquiry to leave toward | S1 | 0.85 | g-20 |
| U3-31 | The order state machine stops at "paid" | S1 | 0.9 | — |
| U3-09 | Filters are client-side over twenty rows | S2 | 0.85 | g-16, g-15 |
| U3-10 | Filter chips clip at large text sizes | S2 | 0.9 | x-03 |
| U3-11 | "Browse Picks for This Room" silently drops the room | S2 | 0.8 | g-27b, g-27c |
| U3-17 | Saved rows carry no note, room or save date | S2 | 0.85 | c-22b |
| U3-36 | Shipping push exists but never reaches a client order | S2 | 0.85 | — |
| U3-39 | Push routes exist for money that nothing emits | S2 | 0.8 | — |
| U3-44 | No payment marks before the Checkout hand-off | S2 | 0.7 | c-13b |
| U3-45 | No receipts or payment history in the app | S2 | 0.85 | c-13, c-13b |
| U3-47 | The deposit is for a table the app never shows | S2 | 0.85 | c-13b, c-08 |
| U3-13 | Marketplace copy says "curated" | S3 | 0.8 | g-15, g-16 |
| U3-18 | Saved price renders without a thousands separator | S3 | 0.95 | c-22b, g-22b |
