# 2x — Panel seat D1 · Leah Hartwell, solo residential designer, Columbus OH

**Seat:** D1 (Opus). Eight years, six to ten clients a year, one job always in install. I sell product
at trade margin. I came off Ivy and a Google Sheet and I run every job in The Document. I am judging
the Patina client app as the other half of the portal I already live in.

**Tasks run:** T1, T2, T6, T7, T8, T9, T10, T14 (per instruments §1, designer seat).

**Evidence basis.** Every screen below is a shot from
`artifacts/ios-daily-return-2026-08-26/shots/`, walked on iPhone 17 Pro / iOS 26.5 against the local
Supabase stack. The `activeProject` account (`client@patina.dev`) is seeded with three projects, four
proposals, two overdue decisions and **one open invoice, INV-2026-0142, $4,250.00, from "Leah
Hartwell"** — so the walk is literally my own client. Where I reason from code rather than a shot I
say so and the finding's confidence reflects it. Camera / LiDAR / AR are unwalkable in Simulator; I
did not build any finding on them.

**Standing facts I am holding** (instruments §6b): the shipped home is Option B's "Today" — four
modules at every tier, accepted, not a mistake (C23). Direct orders are live on the backend with no
iOS client and **no designer attribution at all** (C24). Apple Pay is already inside the hosted
Checkout the invoice screen opens (C25). Push send is real and fires for design requests and BOH
shipping — never for anything money-shaped (C26). The local edge-function 503 on
`create-checkout-session` and the codeless OTP mail are environment faults, not product defects
(C27); the product-detail `PGRST201` trap and the device-scoped local store are app-side and fair
game.

---

## The walk

### T1 — "My client just installed this. What is the first thing that happens to them?"

**First glance:** A blank white launch screen, then a wall. `PATINA`, the strata mark, **"Welcome
home"**, **"Start with a piece you love"**, and three stacked buttons — **Sign in with Apple**,
**Continue with Google**, **Continue with email** — over **"Look around first →"** and **"Have a
password? Sign in"** (g-02). Nothing on this screen says the word *designer*, or *project*, or
*proposal*. It is a shopping app's front door.

**Where I'd tap:** My client has an account I caused to exist — Aspen Loft Refresh is already in the
portal, the invoice is already raised. So they tap **"Have a password? Sign in"**, the smallest,
lowest, brownest line on the screen. The three big buttons are for somebody who found Patina on
their own. The person I sent here is second-class on the first screen.

**Where I'd hesitate:** After sign-in the app lands on **"Today"** and my client is greeted by
**"Bring your first room into Patina"** if their state is anything less than activeProject — I saw
exactly that on the `engaged` account (c-31), a homeowner whose lead a designer *accepted and
claimed on Aug 18*. And in the walk the guest lane's typed room and taste portrait were adopted
wholesale by the account that signed in next: the client's Profile reads **"✦ Modern Warmth"**,
**"1 ROOMS"**, **"1 SAVED"** (c-26) for an account with zero rooms and zero saved items on the
server. If two people in a household share a phone — and they do, constantly, in my jobs — one
person's taste profile becomes the other's.

**Where I'd leave:** I wouldn't; I'd phone. But my *client* leaves at the moment they realise the
app has no idea who I am. There is no sign out and no Account screen either (c-27, c-28), so a
couple sharing an iPad cannot swap seats.

**Would I come back tomorrow for this?** No — and neither would they. Nothing in the first five
minutes tells my client this is where their job lives.

**Obviousness: 2** (I could find sign-in; my client would second-guess every step).

*Findings: D1-28, D1-31.*

---

### T2 — "7:40am, coffee, phone in hand. Why would my client open Patina today?"

**First glance:** `WEDNESDAY · AUG 26` / **"Today"**, a bell, a `?`, a monogram. Then exactly three
cards: **NEXT MOVE — "Review a project decision" / "2 decisions need your eye."**, an editorial hero
**"MAKER SPOTLIGHT / The Grain Whisperer of Maine"**, and **"ACTIVE ROOM / Living Room"** (c-03).
Under the orb, in mono: `2 PROJECT DECISIONS WAITING`.

**Where I'd tap:** Next Move. It is the only thing on the screen about *their* job.

**Where I'd hesitate:** I swipe up and nothing moves (c-04 is the same page). Three projects, four
proposals, an open $4,250 invoice due Sep 1 and a proposal expiring Sep 8 — and Today shows one of
them, as a headline, once. The editorial card is beautiful and it is the largest object on my
client's home screen; a maker profile from Maine outranks the money they owe me. And the moment my
client answers those two decisions, the Next Move card falls back to **"Return to Living Room"** —
the anatomy's ladder is strictly ordered (`TodayExperience.swift:48-160`) — so an active six-figure
project with nothing pending disappears from the home entirely.

**Where I'd hesitate again:** the count. Home says **"2 decisions need your eye."**, the Companion
says **"2 project decisions waiting."** (c-05), and the Studio says **"4 things need your eye"** over
a block headed **"Awaiting you 3"** (c-06b). Three numbers, one inbox. My clients will ask me which
one is right, and I will not know.

**Where I'd leave:** My client leaves for their email, where my message actually is.

**Would I come back tomorrow for this?** Only on the days I have queued something — and only if they
happen to open the app, because nothing tells them.

**Obviousness: 3.**

*Findings: D1-15, D1-16, D1-37.*

---

### T6 — "Is this the one? Help me decide."

**First glance:** Two places a client decides in here, and they are strangers to each other. There is
the decision I raised — **"DECISION / Rug color - Natural vs Sand"**, "The jute rug from Studio Piet.
Natural is warmer, Sand is more neutral.", two cards, **Natural** badged **"Recommended"** and
**Sand**, both `$850`, both with **"Choose this"** (c-18). And there is a piece in the marketplace —
which, when tapped, renders **"Couldn't load product"** / **"Let's try that again"** and nothing else
(c-25).

**Where I'd tap:** On the decision, "Choose this". One tap. No confirmation, no summary, no "are you
sure" — the shallowest act in the whole app is the one that spends $850 of my client's money and
commits my procurement.

**Where I'd hesitate:** A **colour** decision with no colour on it. Two identical cards, no swatch,
no photo, no rug. I wrote "Natural is warmer, Sand is more neutral" and that sentence is doing all
of the work. My client will not decide from that. They will text me a photo request, which is the
exact phone call this screen was supposed to save me.

And there is nothing here to ask with. No "ask your designer", no comment, no defer, no "neither".
The Studio's Conversation block reads **"No project conversations yet."** with no compose field
anywhere (c-19). A client staring at a $850 fork has no in-app way to say a word to me.

**Where I'd leave:** They leave for my mobile number.

**Would I come back tomorrow for this?** As a decision surface, yes, once — it is genuinely the best
idea in the app. As built, it costs me a call instead of saving one.

**Obviousness: 4** for the decision, **1** for the piece (the detail screen is a dead end with no
Back button; the walk had to force-quit, four times, across four lanes).

*Findings: D1-09, D1-18, D1-19, D1-21.*

---

### T7 — "Buy it."

**First glance:** There is nothing to buy. The browse grid says **"Browse pieces / 10 pieces curated
for your space"** with cards priced `$2,100`, `$4,200` and a `46% match` badge (g-15) — and the
terminus of every one of those cards is a piece detail that will not load, or, in code, a primary
button reading **`Add to Room`** that becomes **`Saved ✓`** (`ProductDetailView.swift:377`). No cart,
no Buy, no quote, no vendor link, no `source_url`.

**Where I'd tap:** Nowhere. As Leah, this is the one screen in the app that does *not* worry me.
Nothing here competes with me today.

**Where I'd hesitate:** Hard, and for the opposite reason. `public.direct_orders` is built end to end
on the backend — RPC, checkout session, webhook settle, receipt email — and it has **no `designer_id`,
no `project_id`, no `commission_rate`, no FF&E link**
(`supabase/migrations/00276_direct_orders.sql:48-67`), which the platform's own migration states out
loud (`00301_marketplace_vitals.sql:37-40`). The day a **Buy now** button appears on that piece
detail, my client buys the $3,200 sideboard I specified, at retail, from inside the app I sent them
to, and I get nothing. Not the margin, not the line on the schedule, not the notice. Then it arrives
damaged and they call me anyway.

**Where I'd hesitate again:** what my client sees before they'd pay $4,000. No dimensions (the
`products.dimensions` column exists and is neither returned by `get_recommendations` nor decoded by
the app), no lead time, no stock, no shipping, no returns, no "who is responsible". Half the cards
say **"UNKNOWN MAKER"** on a marketplace whose whole pitch is provenance, and the photography is
wrong: **"Live-Edge Coffee Table"** by Lee Industries is a ladder-back chair on grass, **"Heirloom
Oak Dining Table"** is a set of green velvet chairs (g-15). The left column of the grid is literally
off the screen — "M & BOARD", "rloom Oak / ing Table", ",200".

**Where I'd leave:** My client leaves for the maker's own site, where the sofa has dimensions.

**Would I come back tomorrow for this?** No. And I would not send a client to this grid at all in
its current state.

**Obviousness: 1** — there is no path, and the app never says so.

*Findings: D1-21, D1-22, D1-23, D1-24, D1-25, D1-26.*

---

### T8 — "My designer ordered. Where is it?"

**First glance:** Nothing on Today (c-03). To find the job my client taps the **unlabelled brown
monogram in the top-right corner**, scrolls past their avatar and a `63% MATCH` stat, and arrives at
**"STUDIO / The work around your home, in one place." / "4 things need your eye"** (c-06b). That is
three acts to a list. It is a good list — **Awaiting you 3**: Decisions "2 project choices are ready
/ Overdue · Aug 22", Invoice "$4,250.00 remaining / Due Sep 1", Proposal "Aspen Loft — Living Room
Refresh / Review by Sep 8". That is exactly the screen I want my client looking at. It is behind a
36-point circle with no label.

**Where I'd tap:** "Active projects / Aspen Loft Refresh and 1 more / Installation" → and the project
detail is three stats and a link (c-08). **BUDGET $120,000 · STATUS In Progress · CLIENT VIEW
Milestone**, an Invoices row, and a box reading **"Set up phases, payments, and FF&E in the portal
→"**.

**Where I'd hesitate:** I stop dead there. That last line is *my* to-do, written for *me*, rendered
to my client on their own project screen — and it is not even a button. And **"CLIENT VIEW /
Milestone"** is the raw visibility tier I set in The Document, displayed to the person it governs.
My client is reading my back office. The walk also confirmed the screen successfully fetched
`project_phases` (3827 bytes), `get_client_project_selections`, `project_payment_milestones` and the
proposals list — and rendered **none** of it. No timeline, no rooms, no selections, no phases, no
install date, no designer. The one question T8 asks — *where is it?* — has no answer on the screen
built to answer it.

**Where I'd hesitate again:** the projects list puts **Birch Hollow / Completed / $185,000** above
both live jobs (c-07), and the phase reads the bare word **"Install"** where I wrote "Installation &
Styling". And **"Your budget / ACROSS YOUR PROJECTS"** reports **$4,250 BILLED / $0 PAID / $4,250
OUTSTANDING** (c-15) for a client whose three projects total $725,000. That is a billing summary
wearing the word budget, and my client will read it as their project budget and email me about it.

**Where I'd leave:** They leave and ask me for a status update, which is the email I was told this
app would stop.

**Would I come back tomorrow for this?** Yes, if the list were reachable and the project screen were
honest. Today: no.

**Obviousness: 2** (the monogram is undiscoverable; the Studio itself, once found, is 4).

*Findings: D1-02, D1-03, D1-15, D1-17, D1-27, D1-29, D1-30, D1-32, D1-35, D1-38.*

---

### T9 — "Get a designer's help with this room." (the tier my leads arrive through)

**First glance:** I ran this as the `engaged` account — James Okafor, whose design request a designer
**accepted and claimed on Aug 18**, and who has already uploaded a room scan. His home reads
**"Bring your first room into Patina" / "A short scan gives the Companion a real space to work
from."** (c-31). Byte-for-byte the guest home. His Companion offers **"Add your first space"**,
**"Retake the quiz / REFINE YOUR STYLE"**, **"Your recommendations"**, **"Your profile"** — and no
Studio row at all (c-32). His Studio is five stacked zeroes: **"In progress 0 / No active projects
yet."**, **"Conversation 0"**, **"Money & documents 0 / No shared records yet."**, **"Archive 0"**
(c-32c). His Profile reads **"0 ROOMS / 0 SAVED / — MATCH"**.

**Where I'd tap:** As him, **"Get design help"** — the only designer-shaped row on the screen. It
opens a sheet titled **"Your design request"** which then says **"No scans on this phone yet"** and
offers exactly one act: **"Request without a scan"** (c-33).

**Where I'd hesitate:** That is the moment I'd stop sending anyone here. The single true fact about
this account — *a designer took your job eight days ago* — appears nowhere in the app, and the only
thing the app invites him to do is **file a second request**. In my world that means a duplicate lead
in the pool, another designer claiming it, and me explaining to a client why two studios are calling
them.

**Where I'd leave:** He already has. The client who requests help and then sees "Bring your first
room into Patina" every morning for eight days concludes nothing happened.

**Would I come back tomorrow for this?** No. This is the single worst screen in the app for my
business, because it is the exact hand-off point between Patina's funnel and my relationship.

**Obviousness: 1** — the app gives no evidence a designer exists.

*Findings: D1-11, D1-12, D1-13, D1-14.*

---

### T10 — "I sent a proposal / an invoice is due. How does my client find out?"

**First glance:** They don't. The bell says **"Nothing yet" / "Updates from your designer will land
here."** — with a **"Get design help"** button under it (c-21) — while the Studio one screen away
lists two decisions overdue since Aug 22, an invoice due Sep 1 and a proposal to review by Sep 8.
The notification feed is empty on the same device, the same minute, as four live obligations.

**Where I'd tap:** Studio → **"Proposals"** → **"AWAITING YOUR REVIEW (1) / Aspen Loft — Living Room
Refresh / $18,500.00 / Expires Sep 8"** (c-09). Under it: **"SIGNED (1) / Sample accepted proposal /
$100,000.00"**. That proposal was *accepted*, not signed; the seed holds zero signed proposals. The
app is printing the word SIGNED on a six-figure document nobody signed. If that were my client and
my number, I would be on the phone to Patina inside the hour.

**Where I'd hesitate:** The proposal detail drops **"Expires Sep 8"** entirely (c-10) — the deadline
lives only on the card they navigate away from. Same with the invoice: **"Due Sep 1, 2026"** is on
the list (c-12) and gone from the detail (c-13). The screen that asks for $4,250 never says when it
is due.

Then the selections. Five lines — **Walnut sectional sofa · Hand-knotted wool rug · Walnut coffee
table · Reading lounge chair Qty 2 · Floor lamp Qty 2** — each illustrated with the Patina wordmark
glyph, none priced, against an **INVESTMENT $18,500.00** that is never broken down (c-11). The terms
directly above are real and severe: *"Deposits are non-refundable once procurement begins. Custom
items are final sale."* And the Companion orb sits on top of the **"Sign proposal"** button, clipping
it.

**Where I'd hesitate hardest:** the sign sheet. **"SIGN PROPOSAL / Aspen Loft — Living Room Refresh /
Type your full name to e-sign. Signing confirms the scope and kicks off your project."**, a **Full
name** field, a disabled **Sign proposal** button, **Cancel** (c-11c). No amount. No terms. No date.
No line items. No agreement checkbox. That is the instrument that binds my client to a
non-refundable deposit, and it restates nothing. I have been through one scope dispute in eight
years and it was won on paperwork. This is not paperwork.

**Where I'd leave:** The invoice. **"Pay $4,250.00"** with **"Pay securely by card or bank
transfer."** is the right act in the right place, five taps from a cold open. When it failed in the
walk, the screen printed one red line — **"Unable to start payment. Please try again."** — *below*
the still-fully-enabled button, shoving the reassurance copy off the bottom edge, with no spinner, no
retry, and no way to reach a human about $4,250 (c-14). (The 503 behind it is the local environment;
the failure UX is not.)

**Would I come back tomorrow for this?** Only if the app could tell them. It cannot: `apns-send` is
complete, provisioned, and called by exactly five things — three design-request triggers, BOH
fulfillment, and site-request dispatch. **Zero** push callers touch invoices, proposals, decisions or
orders. My client learns a proposal exists by opening the app on a hunch.

**Obviousness: 3** to the Studio list, **5** to pay once there.

*Findings: D1-04, D1-05, D1-06, D1-07, D1-08, D1-10, D1-20, D1-33, D1-34, D1-36.*

---

### T14 — "What do my clients see of me in here, and does this help or compete?"

**First glance:** I searched every signed-in screen for my own name. I found it **once**. On the
invoice: **"Aspen Loft Refresh · from Leah Hartwell"**, one line of brown text under the invoice
number (c-13). Below it, a heading reading **"A NOTE FROM YOUR DESIGNER"** — with no designer
attached to it.

That is the whole of me. No photo. No studio name. No avatar. No credential line. No contact. Not on
Today, not on the project, not on the proposal I wrote, not on the decisions I raised, not on the
budget, not on the notifications screen. The word *designer* otherwise appears in this app only in
empty states — **"Updates from your designer will land here."** (c-21) — and in the acquisition CTA
**"Get design help"**, which is shown to my own client on their Profile and under their empty bell.

Code confirms the shape of it: `StudioIdentityLine` (a 20 pt logo or two-initial monogram plus studio
name) is mounted on exactly one screen, `ProjectDetailView`, and renders **nothing at all** while
resolving or when the resolver finds no brand — so a solo designer trading under a personal name is
invisible even there (`Features/Projects/Views/StudioIdentityLine.swift:18-41`).

**Where I'd tap:** Nowhere, because there is nothing of mine to tap. What my client *can* do here, in
acts from a cold open: answer a decision (3), reply to a thread (impossible — no thread surface
exists), sign a proposal (6), pay an invoice (5), browse (4), request *another* designer (2).

**Does it help or compete?** Today it does neither, which is its own answer. It does not compete —
there is no purchase path, so nothing can be bought around me. It also does not help, because the
three things I would pay for — my client seeing me, my client acting on what I am waiting on without
a phone call, and my client shopping *with* me — are respectively absent, buried two acts behind an
unlabelled monogram, and broken.

The competition risk is not on the screen; it is in the schema. `direct_orders` exists, is wired to
Stripe end to end, and has nowhere to put a designer. The client-side "Buy now" button is the only
missing piece. Whoever adds that button decides, in the same commit, whether Patina is my supplier or
my competitor.

**Would I come back tomorrow for this?** I would open the portal, which is where my job actually
lives. The client app is not yet the other half of it.

**Obviousness: 1** — my client cannot tell, from this app, that they have a designer.

*Findings: D1-01, D1-02, D1-09, D1-11, D1-24, D1-28, D1-32.*

---

## What I want my client doing here

1. **Answering the thing I am waiting on, the morning I raise it.** Decisions are the best idea in
   this app and the cheapest thing I own — one tap unblocks a purchase order. Put the decision on
   Today with my name and my face on it, put the option's photo on the card, and let them ask me a
   question without leaving the screen.
2. **Signing and paying without me chasing.** Both acts already exist and both already work. What
   they need is a deadline that travels to the screen where the act happens, a sign sheet that
   restates the amount and the terms it binds, and a push the moment I send.
3. **Seeing the job move between our meetings.** The project screen already fetches phases,
   milestones and selections and throws them away. Render them and my Tuesday inbox halves.
4. **Browsing beside me, not around me.** Saving pieces to *their* room, into a board I can open in
   The Document, is worth more to me than any commission Patina could pay. A save that reaches my
   FF&E schedule is a client doing my sourcing for free — and it is the only kind of shopping in
   here I would actively encourage.
5. **Knowing who I am.** Studio name, portrait, one line of credential, on Today, permanently, from
   the moment a project exists. Not because I am vain — because every screen in here currently reads
   as *Patina* talking to *my client* about *their* home, and I am the party being disintermediated
   by omission.

## What would make me stop sending clients here

1. **A "Buy now" button on a piece with no designer attribution.** This is the one that ends it, and
   it is one client-side commit away from shipping. `direct_orders` has no `designer_id`, no
   `project_id`, no commission snapshot, and the earnings ledger is invoice-only. If my client buys
   the sideboard I specified and I get neither the margin nor a line on the schedule, Patina has
   become a retailer using my client list.
2. **"SIGNED" printed on a proposal nobody signed** (c-09), and a sign sheet that restates no amount
   and no terms (c-11c). These are legal artefacts. One dispute and they are exhibits.
3. **My back office rendered to my client** — "Set up phases, payments, and FF&E in the portal →"
   and "CLIENT VIEW / Milestone" on their own project screen (c-08). It reads as sloppiness, and
   sloppiness in my client's hands is mine, not Patina's.
4. **The re-match funnel running inside my live job** — "Get design help" under an empty bell and on
   the Profile of a client who has a designer (c-21, c-32c), and an `engaged` client whose only
   available act is filing a second request (c-33).
5. **A store that looks broken.** Cards off the left edge, "UNKNOWN MAKER", a coffee table
   illustrated with a chair on grass, and a piece detail that traps you with no Back button (g-15,
   c-25). I cannot send a client with a $120,000 budget to a screen that looks like that and keep
   their confidence in my judgement.

---

## Findings

| id | title | sev | conf | shots / refs |
|---|---|---|---|---|
| D1-01 | Designer named once, on the invoice only | S0 | 0.95 | c-13-invoice-detail.png |
| D1-02 | Portal instruction for me rendered to my client | S0 | 0.95 | c-08-project-detail.png |
| D1-03 | "CLIENT VIEW / Milestone" exposes the visibility tier | S1 | 0.90 | c-08-project-detail.png |
| D1-04 | Accepted proposal labelled "SIGNED" | S0 | 0.95 | c-09-proposals-list.png |
| D1-05 | Sign sheet restates no amount and no terms | S0 | 0.95 | c-11c-sign-sheet.png |
| D1-06 | Proposal expiry vanishes on the detail | S1 | 0.90 | c-09, c-10 |
| D1-07 | Invoice due date vanishes on the detail | S1 | 0.90 | c-12, c-13 |
| D1-08 | Proposal selections carry no prices and no images | S1 | 0.95 | c-11-proposal-detail-scrolled.png |
| D1-09 | No way to message the designer from anywhere | S0 | 0.95 | c-19-messages-empty.png |
| D1-10 | Notifications empty while four items are due | S0 | 0.95 | c-21, c-06b |
| D1-11 | Empty bell pitches a designer to an engaged client | S1 | 0.90 | c-21-notifications-signed-in.png |
| D1-12 | Engaged home is the guest home verbatim | S0 | 0.95 | c-31-engaged-home-top.png |
| D1-13 | Matched client's Studio is five zeroes | S1 | 0.90 | c-32c-engaged-studio-rows.png |
| D1-14 | Engaged client's only act is a second request | S1 | 0.90 | c-33-engaged-design-request-again.png |
| D1-15 | Money rail sits behind an unlabelled monogram | S0 | 0.90 | c-03, c-04, c-06b |
| D1-16 | Three counts for one inbox, two on one screen | S1 | 0.95 | c-06b, c-03 |
| D1-17 | "Your budget" shows $4,250 against $725,000 of work | S1 | 0.95 | c-15, c-07 |
| D1-18 | An $850 decision commits on one unconfirmed tap | S1 | 0.90 | c-18-decision-detail.png |
| D1-19 | A colour decision shows no colour | S1 | 0.95 | c-18-decision-detail.png |
| D1-20 | Overdue flag dropped on the decisions list | S2 | 0.90 | c-06b, c-17 |
| D1-21 | Piece detail is a hard trap with no way back | S0 | 0.95 | c-25-piece-detail-client.png |
| D1-22 | Sharing a piece hands out the designer portal | S1 | 0.95 | g-19-share-sheet.png |
| D1-23 | No commercial next step on any piece | S1 | 0.90 | g-15 + ProductDetailView.swift:338-399 |
| D1-24 | A direct order would credit the designer nothing | S0 | 0.90 | 00276_direct_orders.sql:48-67 |
| D1-25 | Browse grid is geometrically broken | S1 | 0.95 | g-15-browse-pieces-grid.png |
| D1-26 | Product photography does not match the products | S1 | 0.95 | g-15-browse-pieces-grid.png |
| D1-27 | Studio rows unreachable by VoiceOver | S1 | 0.85 | c-06d-studio-money-documents.png |
| D1-28 | No sign out and no Account screen | S1 | 0.95 | c-27, c-28 |
| D1-29 | Project detail discards the data it fetched | S1 | 0.90 | c-08-project-detail.png |
| D1-30 | Completed project sorts above the live ones | S2 | 0.95 | c-07-projects-list.png |
| D1-31 | Guest's room and taste portrait adopted by the account | S0 | 0.90 | c-03, c-26, c-34 |
| D1-32 | No document surface for the client | S1 | 0.90 | c-19-messages-empty.png |
| D1-33 | Push never fires for proposals, invoices or decisions | S0 | 0.90 | 17-gap-fills.md G1 |
| D1-34 | Companion orb sits on the "Sign proposal" button | S1 | 0.90 | c-11-proposal-detail-scrolled.png |
| D1-35 | "Your studio" row lands on a bare projects list | S1 | 0.90 | c-04b, c-07 |
| D1-36 | Payment failure offers no retry and no human | S1 | 0.85 | c-14-pay-handoff.png |
| D1-37 | An active project with nothing pending leaves Today | S1 | 0.85 | c-03 + TodayExperience.swift:48-160 |
| D1-38 | "Installation & Styling" truncated to the verb "Install" | S3 | 0.90 | c-07-projects-list.png |

38 findings. Machine-readable copy: `research/2x-panel-d1.json`.
