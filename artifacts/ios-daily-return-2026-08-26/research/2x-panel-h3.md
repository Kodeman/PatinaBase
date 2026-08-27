# 2x — Panel seat H3 · Walt (63), Madison WI

Downsizing from a four-bedroom to a two-bedroom condo. Fewer, better pieces. I read the maker's
story before I read the price. I buy once and keep it thirty years. I am skeptical of apps and
allergic to being "engaged." My morning is Apple News, the weather, the Journal Sentinel on the
iPad, and coffee. I have the money; I want my time respected.

**My question: does this respect my time, and would I trust it with a four-thousand-dollar chair?**

Evidence: the 2026-08-26 Simulator walk (`shots/`, `research/01-shot-ledger.md`,
`research/03-walk-observations.md`) plus code-read grounding (`research/10-code-anatomy.md`,
`research/15-task-paths.md`, `research/12-backend-reality.md`, `research/17-gap-fills.md`).
Camera, LiDAR and AR claims are code-read only — no device was walked. Local-environment faults
(edge functions 503, OTP mail without a code, the keychain outliving uninstall) are excluded per
instruments §6b C27.

---

## T1 — "Fresh install. What is this for, and what do I do first?"

**First glance:** A blank white screen — no wordmark, nothing — and then a gate. `PATINA`, three
gold strata lines, `"Welcome home"`, `"Start with a piece you love"`. Then a stack: a black
**`Sign in with Apple`**, **`Continue with Google`** with a bare letter G, **`Continue with email`**
with a little cartoon envelope, `or`, and finally **`Look around first →`**. At the bottom,
`"Have a password? Sign in"`.

**Where I'd tap:** `Look around first`. I am not handing an app my Apple ID before it has told me
what it is. That the door I want is the fourth option, below the fold of my attention and under a
divider, tells me who this screen was designed for — them, not me.

**Where I'd hesitate:** At the envelope. Apple's logo is real, Google gets a typed letter "G", and
the email button gets a stock emoji. Three icon systems in three stacked buttons on the first screen
of a company whose entire pitch is craft. If they can't make three buttons agree, what does the
$4,000 chair look like when it arrives?

Then the tour. `"Step 1 of 2"` — `"Welcome to Patina"` / `"This is your Daily Room — picks and
stories chosen for your space."` in a bubble that sits directly on top of the card it is describing,
with `Skip` and `Next` in iOS system blue — the only blue anywhere in this warm brown app. Step 2 of
2 covers the same card again. Then a third card: `"I'm your Companion."` / `"Tap me any time,
anywhere in Patina — I'll show you the way to what's next."` Three overlays in a row, each one
hiding the thing it points at.

Underneath all of it: `WEDNESDAY · AUG 26`, `Today`, one card — **`Bring your first room into
Patina`** / `"A short scan gives the Companion a real space to work from."` — one story,
`MAKER SPOTLIGHT / The Grain Whisperer of Maine / Jonathan Chilton on 40 years of listening to
wood`, and a dark circle labelled `NEXT STEPS`.

**Where I'd leave:** Didn't. The story headline is the first thing in this app I actually wanted.
Forty years of listening to wood — that is my kind of sentence.

**Would I come back tomorrow for this?** Yes — for the story, not for the app. One good essay about
a maker is worth a return. Nothing else here has asked me for anything I mind giving.

**Obviousness: 4.** I knew the one thing to do. I just didn't want to do it, because "a short scan"
of a condo I haven't moved into yet is not my first move.

*Findings: H3-01, H3-02, H3-03, H3-04, H3-05.*

---

## T2 — "7:40am, coffee, phone in hand. Why would I open Patina today?" *(the return probe)*

**First glance:** `WEDNESDAY · AUG 26`. `Today`. `NEXT MOVE / Review a project decision / 2 decisions
need your eye.` The Grain Whisperer of Maine, again, with a small clay dot in its top-right corner
saying it is unread. `ACTIVE ROOM / Living Room`. `2 PROJECT DECISIONS WAITING`.

**Answering the probe exactly.** What is new on this first screen since yesterday: **the date line,
and nothing else.** `WEDNESDAY · AUG 26` becomes `THURSDAY · AUG 27`. That is the only guaranteed
change on the screen (`DailyRoomViewModel.swift:85-89`).

What is *not* new: the word `Today` is a literal string, not a greeting — the app never reads the
time of day on this screen at all. The story is the single highest-sorted row in a table of **three**
rows, fetched `limit=1`; it will be the Grain Whisperer tomorrow, next week, and in October, and its
"unread" dot is hard-coded on, so it will keep telling me it is new every morning until an editor
publishes something. The Next Move only moves when a state machine moves — and the state machines
are all things *I* have to do first. The Active Room only changes when I put something in it, which
(see T5) I cannot do.

**What would have to be there.** For me, at 7:40 with coffee: a maker's story I have not read, dated,
that I could not have read yesterday — the way the Journal Sentinel manages every single morning
without asking me to scan anything. Or one honest line: "Leah moved your install to Sept 14."
Something the *house* did, or something a *person* did, while I was asleep. Right now the app's
answer to "why open me today" is "because you didn't finish yesterday."

**Where I'd tap:** the story. It is the only thing on the page that is about the world rather than
about my chores.

**Where I'd hesitate:** at the dot. Once I notice it is always there, I stop believing it, and then I
stop believing the rest of the chrome too.

**Where I'd leave:** Apple News. It has a new thing every morning and does not pretend.

**Would I come back tomorrow for this?** No. Not for a screen whose only new fact is the date.

**Obviousness: 5** — there is nothing here to find. That is the problem.

*Findings: H3-06, H3-07, H3-08, H3-09.*

---

## T3 — "Find a sofa for our living room."

**First glance:** I look for a search field. There isn't one — not on the home, not on the browse
screen, not anywhere in the app. To get anywhere near a sofa I tap the dark circle at the bottom, get
a panel, and tap `Your recommendations`. Then: `Browse pieces` / `10 pieces curated for your space`,
chips `All · Seating · Tables · Lighting · Storage`.

**Where I'd tap:** `Seating`. Three pieces come back. And the grid is *broken*. The left-hand column
runs off the left edge of the phone: a maker reads `M & BOARD`, a name reads `rloom Oak / ing Table`,
and a price reads `,200`. The cards are four different sizes. Under `Seating` they overlap each
other, and the third one is a plain brown rectangle with no photograph at all.

**Where I'd hesitate:** at the photographs. `Heirloom Oak Dining Table`, Room & Board — the picture
is a white table ringed with green velvet chairs. `Live-Edge Coffee Table`, Lee Industries — the
picture is an old ladder-back chair standing in somebody's lawn. `Terracotta Planter Set` is a
mint-green plastic pot. And two of the ten pieces are made by `UNKNOWN MAKER`, on a marketplace whose
whole argument is that somebody's hands made this.

Then I tap a piece to read about it, and get `Couldn't load product` / `Let's try that again`. Retry
does the same. There is no Back button on that screen. The edge-swipe does nothing. The only way off
it is to kill the app.

**What is legible without hunting**, on the card at least: price, maker, a one-line material note.
**What does not exist anywhere in this application**: dimensions, lead time, whether it is in stock,
what shipping costs, what happens if I don't like it, and the maker's own page. Two of those are
columns that exist in the database and are simply never sent to the phone.

**Where I'd leave:** the maker's own website, on the iPad, where I can read a spec sheet.

**Would I come back tomorrow for this?** No. I cannot measure a chair here, and I cannot open a chair
here.

**Obviousness: 2.** No search, the browse door is hidden behind an unlabelled circle, and the
destination is broken.

*Findings: H3-10, H3-11, H3-12, H3-13, H3-14, H3-15, H3-16.*

---

## T4 — "Save it. Find it again tomorrow."

**First glance:** the little heart on the card. I press it. Something happens, or doesn't — on one
attempt in the dark-mode lane the outline never filled in.

**Where I'd tap:** the heart, then the circle at the bottom, hoping for a "Saved" door.

**Where I'd hesitate:** there is no `Saved` row in that panel until you already have something saved
— and the count it checks is the count of pieces *in a room*, not pieces you hearted from the grid.
So the man who saves the way the app invites him to save can end up with a Saved screen that has no
door anywhere in the application.

When I do get in, it opens on **`Boards`**: `"No boards yet"` / `"Save pieces from recommendations to
create your first board"` / `Create Board`. I make one. It stays empty forever — nothing in this app
can put a piece into a board. I switch to `All items` and there is my table: `ROOM & BOARD /
Heirloom Oak Dining Table / **$4200**`. On the grid the same piece read `$4,200`. A missing comma on
a four-thousand-dollar object is a small thing that reads very loud to me.

**Where I'd leave:** didn't leave, but I stopped trusting the list. Tomorrow the piece detail will
show me `Add to Room` again as though I had never saved it, and press it and I get a second copy.

**Would I come back tomorrow for this?** No. A list I can't organise and a count I can't reconcile is
not an investment, it's a pile.

**Obviousness: 2.** Saving is one tap. Finding it again is three taps and a coin flip on whether the
door exists.

*Findings: H3-17, H3-18, H3-19, H3-20.*

---

## T5 — "See it in my room."

**First glance:** `TELL US ABOUT YOUR SPACE` / `What kind of room?` — six tiles with cartoon emoji
(🛋 🛏 🍽 💻 🍳 ✨), `ROOM DIMENSIONS`, two boxes, and in the corner a `ft / m` pair so small I can
barely see which one is selected. The camera icon on the home card promised "a short scan"; this is a
form.

**Where I'd tap:** LENGTH `18`, WIDTH `14`. Living room. Two windows, one door. `Continue to Style
Discovery`.

**Where I'd hesitate:** at the next screen, which stops me cold. `YOUR SPACE` / `Here's what I see.`
— a rectangle labelled **`46 ft`** across and **`59 ft`** down, **`2713 SQUARE FEET`**. I typed
eighteen by fourteen. It has multiplied my feet by 3.28 and handed me back a 2,713 square-foot living
room. Underneath: `Rescan` — for a room nobody scanned — and `0 ITEMS DETECTED`, on a form.

I press `This Looks Right`, because it is the only way forward, and now the lie is permanent:
`Living Room / 2713 SQ FT · 2 WINDOWS`, `59' × 46'`, and later on `Your Spaces` a blue chip reading
`JUST SCANNED` sitting directly above the caption `2713 SQ FT · MANUAL ENTRY`.

The room's own stats read `0 ITEMS`, `— MATCH`, `0 IN AR`. I do not know what "IN AR" is, and per the
code it is zero for every product in the catalogue and always will be — no product carries a 3D
model, so the AR button never draws and the two doors that do exist land on `"3D model not available
for this product"`.

Then the part that ends it: **there is no way to put a piece into the room.** The card menu offers
`Save · Share · Not for me · View details`. No "Add to room". Not even when I enter the grid from the
room's own `Browse Picks for This Room` button — which opens the same generic ten pieces with no room
name on them. Meanwhile the room says `"A blank canvas"` / `"We've already found pieces that would
fit this space. Browse your Daily Room to start building this room."`

**Where I'd leave:** here. This is the screen where I decide the app does not actually know my house.

**Would I come back tomorrow for this?** No — and worse, I would not trust the next number it showed
me either.

**Obviousness: 1.** I could not do the task. The app told me I had.

*Findings: H3-21, H3-22, H3-23, H3-24, H3-25.*

---

## T6 — "Is this the one? Help me decide."

**First glance:** the card menu — `Save`, `Share`, `Not for me`, `View details`. That is the entire
apparatus for deciding.

**Where I'd tap:** `View details`, which is the trap: `Couldn't load product`.

**Where I'd hesitate:** on what is missing. I want two chairs side by side. I want to write "too deep
for the alcove" on one of them. I want to ask a person a question about the joinery. None of those
exist: there is no compare anywhere in the app; the note field exists in the data model and no screen
writes it; and the piece screen has no `Get design help` on it at all — the CTA appears on eleven
other surfaces and not the one where I am looking at the thing I might buy. To ask about the chair I
am looking at, I have to know that the black circle is a menu, open it, and find `Get design help`
there.

**Where I'd leave:** the phone, for the laptop, to look up the maker myself.

**Would I come back tomorrow for this?** No. Deciding is the part I actually need help with, and it
is the part that isn't built.

**Obviousness: 2.**

*Findings: H3-26.* (H3-16 also lands here.)

---

## T7 — "Buy it." *(the purchase probe)*

**Naming the dead end verbatim.** The furthest a piece can take you is a single primary button that
reads:

> **`Add to Room`** — and, once tapped — **`Saved ✓`**

with, above it, only a back chevron, a `?`, a share glyph and a heart. There is no `Buy`, no
`Add to cart`, no `Request a quote`, no `Check availability`, no price-inquiry, no link to the
maker's own page. In this walk I never even reached that button, because every product page in every
lane returned `Couldn't load product` / `Let's try that again`.

**How many taps I spent looking: eleven, and then I stopped.** Circle → `Your recommendations` →
`Seating` → a card (trap; force-quit) → relaunch → circle → `Your recommendations` → the ⋯ menu →
`View details` (trap again) → the heart → `Saved`. Eleven taps, one app kill, and no screen that
would take my money for a chair. **Taps to money: there is no number. There is no path.**

The nearest commercial act the app offers is: circle → `Get design help` → pick scans → details →
review → `Send request` — six taps to a lead form, and then wait for a human. That is not buying.

**What Walt would need before paying $4,000, none of which is on any screen:** the width, depth and
seat height; the wood and the finish; who made it and where; how long until it arrives; what shipping
costs and whether two men bring it upstairs; what happens if it arrives scuffed; and who exactly is
responsible if it does. The app can currently tell me the price and one line of materials.

**Where I'd leave:** the maker's own site, with my credit card, which is exactly where the margin
goes too.

**Would I come back tomorrow for this?** No.

**Obviousness: 1** — I could not find it, because it is not there.

*Findings: H3-27, H3-16.*

---

## T8 — "I've ordered / my designer ordered — where is it?"

**First glance:** `Today` says `Review a project decision`. Nothing on this screen mentions an order,
a delivery, a date, or a dollar.

**Where I'd tap:** I hunt. There is no tab bar and no nav bar. Eventually I try the little gold
circle with a `C` in the top-right corner — no label, about the size of a shirt button — and there it
all is, two levels down, past my avatar and three statistics: `STUDIO` / `"The work around your home,
in one place."`

**Where I'd hesitate:** immediately, at the arithmetic. That one screen says `4 things need your eye`
under the headline, `Awaiting you  3` in the block below it, and `4 THINGS NEED YOUR EYE` in the
footer — while the home screen and the Companion both say `2 PROJECT DECISIONS WAITING`. Three
different totals for one inbox, two of them fourteen millimetres apart.

The rows themselves are the best thing in this app: `Decisions / 2 project choices are ready /
Overdue · Aug 22`, `Invoice / $4,250.00 remaining / Due Sep 1`, `Proposal / Aspen Loft — Living Room
Refresh / Review by Sep 8`. That is genuinely what I want to see. Then I tap `Invoice` and the
**`Due Sep 1`** is gone — the invoice detail never says when it is due. Same with the proposal:
`Expires Sep 8` on the card, absent on the document. Same with the decisions: `Overdue · Aug 22` on
the hub, nowhere on the list. The urgency is printed on the page you leave and dropped on the page
you act.

And for a physical object — "where is my dining table" — there is nothing at all. The app has no
order, no shipment, no tracking, no delivery date. There is a `direct_orders` table on the backend
with three states (`pending_payment / paid / canceled`) and no client code; there is a separate
shipping rail that can say `shipped` and `delivered` but only for designer-sourced procurement and
only when an operator presses send. On my phone, "where is it" resolves to a bill.

**Where I'd leave:** I'd text Leah. Which is the whole thing this screen was supposed to prevent.

**Would I come back tomorrow for this?** Yes, honestly — the Studio hub is the one screen worth
returning to. It's just buried under an unlabelled button and it contradicts itself.

**Obviousness: 2.**

*Findings: H3-31, H3-32, H3-33, H3-34, H3-52, H3-53, H3-54.*

---

## T9 — "Get a designer's help with this room."

**First glance:** as a signed-in man whose design request a designer accepted eight days ago, my home
screen reads: `NEXT MOVE / Bring your first room into Patina / A short scan gives the Companion a
real space to work from.` The same card the app shows a stranger who has never opened it. My
Companion panel has no `Your studio` row at all. My Studio is five stacked zeroes: `In progress 0 /
No active projects yet.`, `Conversation 0`, `Money & documents 0 / No shared records yet.`,
`Archive 0`, and above them `"Nothing needs your attention right now."`

The single true fact about my account — that a professional read my request and said yes — appears
nowhere in the app.

**Where I'd tap:** `Get design help`, hoping it shows me the request I already made. It opens
`Your design request` — and shows me `No scans on this phone yet` / `"You can scan a room to attach —
or request design help without one below"` with one button: **`Request without a scan`**. It is
offering to file a *second* request. There is no scan affordance on the sheet that offers scanning.

**Where I'd hesitate:** as a guest, earlier, I filled the whole form — kind of help, budget, timeline,
my vision — pressed `Review`, pressed `Send request`, and only *then* got a full-screen wall:
`Welcome home / Start with a piece you love`, with no `Cancel`, no `✕`, and no `Look around first`.
Nothing in the four screens before it said an account would be needed. The draft survives, which is
decent. The ambush does not.

**Where I'd leave:** email. Which is what I was trying to avoid.

**Would I come back tomorrow for this?** No — there is nothing to come back *to*. A matched request
is invisible.

**Obviousness: 3** — finding the CTA is easy; finding the *status* is impossible.

*Findings: H3-35, H3-36, H3-37.*

---

## T10 — "The designer sent a proposal / an invoice is due. How do I find out?"

**First glance:** the bell, top-right, with no badge. I tap it: `Notifications` / `Nothing yet` /
`"Updates from your designer will land here."` and a button offering **`Get design help`** — sold to
a man who already has a designer, three projects and an open invoice.

Meanwhile, two screens away: two decisions overdue since Aug 22, $4,250 due Sep 1, a proposal
expiring Sep 8. Zero notifications.

**Where I'd tap:** nowhere. There is nothing to tap.

**Where I'd hesitate:** on the honest answer to the question, which is: *you find out by opening the
app and hoping the one card changed.* There are no widgets, no Lock Screen, no Live Activities, no
Shortcuts, and the app cannot even schedule a local reminder to itself. Push exists and works — the
sender is live and provisioned — but not one of its five callers touches an invoice, a proposal, a
decision or an order. Every one of them is about a design request or a shipment.

And the permission: the app asks exactly once per install, immediately after you submit a design
request, with no explanation of what it would send. A man like me, who never submits a request, is
never asked at all. If it *had* asked me, at the right moment, with the right sentence — "Tell me
when Leah needs a decision, and when something ships" — I would have said yes. Those are the only two
I'd allow.

**Where I'd leave:** email, again. Email is where this relationship actually lives.

**Would I come back tomorrow for this?** No — nothing brings me back; I'd have to remember to check.

**Obviousness: 1** for finding out; **4** for acting once you have found out.

*Findings: H3-38, H3-39, H3-40, H3-41, H3-51, H3-55.*

---

## T11 — "Two weeks away. I'm back." *(the re-entry probe)*

**First glance:** exactly what I left. `WEDNESDAY · AUG 26` becomes whatever day it is; everything
else is identical. `Today`. `NEXT MOVE / Review a project decision / 2 decisions need your eye.` The
Grain Whisperer of Maine with its permanent unread dot. `ACTIVE ROOM / Living Room`. `2 PROJECT
DECISIONS WAITING`.

**Answering the probe exactly.** What is new since two weeks ago: **the date line**; the Next Move
*if* one of eight state machines advanced; the bell badge *if* the backend wrote a row (it hasn't);
the story *if* an editor published (there are three stories total and none is dated). A relaunch of
the signed-in client produced a byte-identical Today. Nothing on this screen is keyed to "since your
last visit" — there is no last-seen timestamp for the feed, the story, the room, or the saved list,
anywhere in the app.

**What would have to be there.** One line, dated, above everything: "While you were away — Leah sent
a proposal on the 3rd, the invoice came due on the 1st, and your dining table shipped on the 9th."
Three facts, in order, with dates. That is the whole re-entry design. Absent that, one hour away and
fourteen days away produce the same screen, which means the app has no memory of me — and an app with
no memory of me cannot claim to be keeping my house.

Two things *do* silently change at fourteen days, and neither is explained: a matched design-request
card disappears from the home on day fifteen, and the Companion quietly "graduates" and stops
labelling itself.

If I had been a guest, it would be worse: a force-quit throws the guest all the way back to the gate
with the quiz, the portrait and the session discarded — and the gate says `Welcome home` to someone
it just forgot.

**Where I'd tap:** the decisions, because that is the one thing that is genuinely mine to do.

**Where I'd hesitate:** on whether anything happened at all while I was gone. The app's silence is
indistinguishable from nothing having happened.

**Where I'd leave:** neutral. Nothing punished me for being away — but nothing noticed either.

**Would I come back tomorrow for this?** No. Absence costs nothing here, and so does presence.

**Obviousness: 5** — nothing to find; **1** for "what changed".

*Findings: H3-42, H3-43.* (H3-06 and H3-38 land here too.)

---

## T12 — "Show my partner."

**First glance:** the ⋯ menu on the card has `Share`. Good.

**Where I'd tap:** `Share` — and the iOS sheet comes up titled **`Patina Designer Portal`** /
`app.patina.cloud`. I am a homeowner sending my wife a chair, and the app hands her a link to the
*designer portal*, under the designer portal's name. She will read that as "Walt is hiring somebody."

**Where I'd hesitate:** on what she can do with it. The app has no associated-domains entitlement, so
that link cannot open the app even if she has it installed — it opens Safari. And there is no invite,
no household, no second seat, no shared account anywhere in this product. My wife cannot see my room,
cannot see my saved list, cannot see the proposal she is also paying for, and cannot say "not that
one" inside the app.

For us, furniture is a two-person decision and always has been. A tool that only holds one of us is a
tool one of us will stop using.

**Where I'd leave:** I'd text her a photograph of the screen. Which is what everyone actually does,
and which tells you what the share button is worth.

**Would I come back tomorrow for this?** No.

**Obviousness: 3** — sharing is one tap and shares the wrong thing.

*Findings: H3-28, H3-29, H3-30.*

---

## T13 — "One-handed on the bus · dark mode · larger text."

**First glance, dark:** genuinely good. Near-black ground, cream serif, the brown story card holds
up, nothing illegible. Somebody cared about this. Credit where it is due.

**Where I'd tap:** the bottom cards — the `NEXT MOVE` card and the `ACTIVE ROOM` card are big,
full-width and low on the screen, which is right for one hand. The circle at the bottom is the best
placed control in the app.

**Where I'd hesitate:** at everything in the top-right corner. The bell, the `?` and the monogram are
three small circles in the far corner, and that monogram is the *only* door to my projects, my
proposals, my invoices and my budget. On a bus, with one hand, that is a stretch and a fumble.

At larger type — which I use, because I am sixty-three — three things break:

- The status bar draws straight over the content beneath it. The `9:41` clock sits on top of
  `Awaiting payment`, on top of `Invoices / 1 shared invoice`, on top of `Terms`, on top of
  `Active projects`. At XXL the Dynamic Island itself covers a proposal's title and its
  `Review by Sep 8` line, and covers a sheet's own `Close` button.
- The filter row loses its last chip: `Storage` clips to `Stor` at the screen edge with nothing to
  say it scrolls.
- The black circle floats on top of the thing I am trying to press. It clips `Sign proposal`. It
  clips `Browse Picks for This Room`. On the proposal at XXL, the body text under `Space Plan` runs
  straight underneath it and is cut off mid-sentence.

And the touch targets are small everywhere: the `ft / m` toggle that silently ruined my room
measurements is six points wide; the retry link on the broken product screen is seventeen points
tall; the `Boards` tab is seventeen points tall. Apple has said forty-four for fifteen years.

One oddity: the room summary screen renders in light cream while the entire rest of the app is dark —
the only screen that ignores the setting.

**Where I'd leave:** I wouldn't leave over this; I'd just be slower and more annoyed, and I'd stop
using it on the bus.

**Would I come back tomorrow for this?** Neutral. Dark mode earns goodwill; the corner buttons and
the floating circle spend it.

**Obviousness: 3.**

*Findings: H3-22, H3-44, H3-45, H3-46, H3-47.*

---

## T14 — "What do I see of the designer I am paying?"

*(I run this as the client, not the designer — it is the same question from the paying end.)*

**First glance:** nothing. Her name is not on the home screen. It is not on the project. It is not on
the proposal I am being asked to sign. It is not on the decisions she is waiting on. In the entire
signed-in app, `Leah Hartwell` appears **once**: on the invoice, as `Aspen Loft Refresh · from Leah
Hartwell`, in small brown type under the invoice number, followed by a heading that says
`A NOTE FROM YOUR DESIGNER` without naming which designer. No photograph. No studio. No credentials.
No way to reach her. The only other place the word "designer" appears is the empty notification
screen: `"Updates from your designer will land here."`

**Where I'd tap:** her name. It isn't a link.

**Where I'd hesitate:** on the project screen, which shows me two things written for her, not for me.
A statistic labelled `CLIENT VIEW / Milestone` — that is a database setting about how much I am
allowed to see, shown to me — and a boxed line reading `Set up phases, payments, and FF&E in the
portal →`, which is an instruction to my designer, rendered on my phone, and which is not even a
button. Underneath, the screen tells me almost nothing: budget, status, an Invoices row. No timeline,
no rooms, no schedule, no selections — though the app fetched the phases and the selections and threw
them away.

Then the two documents.

The proposal: `INVESTMENT $18,500.00`, three paragraphs of real writing I liked, five selections
—`Walnut sectional sofa`, `Hand-knotted wool rug`, `Walnut coffee table`, `Reading lounge chair`,
`Floor lamp` — each illustrated with the Patina logo and priced at nothing, and terms that are
serious: `"Deposits are non-refundable once procurement begins. Custom items are final sale."` I
press `Sign proposal` and the sheet that appears says: `"Type your full name to e-sign. Signing
confirms the scope and kicks off your project."` — and **restates no amount, no line items, no terms,
no date, and offers no checkbox.** I am being asked to type my legal name into a box that has
forgotten to mention the eighteen thousand five hundred dollars and the non-refundable clause one
screen back. I have signed contracts for houses with more ceremony than this.

The proposals list, meanwhile, files a $100,000 document under a header reading **`SIGNED (1)`** —
and nobody signed it. It was accepted. On a six-figure document those are not the same word.

And the decision: `Rug color - Natural vs Sand`, two options, both `$850`, neither with a picture — a
*colour* decision presented with no colour — and two identical black `Choose this` buttons. One tap
and it is done. No confirmation, no way to defer, no way to say "neither", no way to ask her a
question. The shallowest act in the app is the irreversible eight-hundred-and-fifty-dollar one, and
the deepest is paying a bill.

**Where I'd hesitate hardest:** `Conversation 0 / No project conversations yet.` There is no compose,
no thread, no "message your designer" anywhere. A man with an overdue decision, an unpaid invoice and
an expiring proposal cannot say one word to the person on the other end from inside this app.

**Where I'd leave:** the phone, for Leah's mobile number.

**Would I come back tomorrow for this?** Yes, to pay the bill, once. Not as a habit.

**Obviousness: 2** for finding the money; **1** for finding the person.

*Findings: H3-48, H3-49, H3-50, H3-51, H3-52, H3-53, H3-54, H3-55, H3-56, H3-57.*

---

## Three things that would make me open this every day

1. **A dated maker's story I could not have read yesterday.** The one thing on this app's first
   screen that I genuinely wanted was `The Grain Whisperer of Maine — Jonathan Chilton on 40 years of
   listening to wood`. Give me a new one on a schedule, put the date on it, and retire the permanent
   unread dot — an honest "new" once a week beats a fake "new" every morning. That is the Journal
   Sentinel bargain and it has held for a hundred and fifty years.
2. **A "since you were last here" line, with dates, at the top of Today.** "Leah sent a proposal on
   the 3rd. Your invoice came due on the 1st. The dining table shipped on the 9th." Three facts, in
   order, that the *house* and the *person* did while I was asleep — not three chores I owe. That
   single line is the difference between an app that keeps my house and an app that nags me.
3. **My designer, with a face and a way to answer her.** Her name, her studio, and one line —
   "Leah is waiting on you for the rug colour" — with a reply box under it. Right now she is a
   signature at the bottom of a bill. Make her the reason I open the app and I will open it daily,
   because the relationship is the product; the catalogue isn't.

*(And one thing I would refuse: streaks, badges, "you haven't visited in 3 days" guilt, or a red
number invented to make me tap. I am sixty-three, I have money, and I will delete an app that tries
that on me before I finish reading the notification.)*

## What would make me buy here instead of the maker's own site

Right now, nothing — and I mean that literally: the app cannot take money for a chair, so the
question is hypothetical until the button exists. Here is what would have to be on the screen before
I typed a card number for a four-thousand-dollar chair:

- **The measurements.** Width, depth, height, seat height, arm height, and the door it has to fit
  through. Not one of these exists anywhere in the app today. A downsizer buys by the inch.
- **The full chain of custody, in plain words.** Who made it, where, from what, how long until it
  arrives, who carries it up, and — the one that decides it — **who answers the phone when it
  arrives scuffed.** If the answer is "the maker, good luck", I will buy from the maker and skip the
  middle.
- **My designer's name on the purchase.** If Leah picked it, I want to buy it *through* her, see her
  name on the order, and know she is paid for it. I am not interested in a tool that lets me
  quietly go around the professional I hired — and today the backend order table has no column for
  her at all, which tells me nobody has decided that question yet. Decide it before you ship the
  button.
- **The story attached to the object, permanently.** The Grain Whisperer piece is exactly why I would
  pay a premium here rather than at Room & Board. Put that essay on the product page, and put the
  product on the essay, and the price stops being a comparison and starts being a reason.
- **And the photograph has to be the actual chair.** Today a dining table shows green velvet chairs
  and a coffee table shows a ladder-back chair on a lawn. Everything above is worthless until the
  picture is true.

---

## Findings

| id | title | severity | confidence | shots / refs |
|---|---|---|---|---|
| H3-01 | Fresh install is met by a wall, not a room | S1 | 0.85 | g-02-first-screen-after-splash.png |
| H3-02 | Three icon systems in three stacked buttons | S2 | 0.9 | g-02-first-screen-after-splash.png |
| H3-03 | Launch screen is blank white, no wordmark | S3 | 0.85 | g-01-splash.png |
| H3-04 | Tour's middle step never renders | S2 | 0.9 | FirstLaunchTour.swift:227-252 |
| H3-05 | Coach marks cover the cards they explain | S2 | 0.9 | g-09-home-tour-step1.png |
| H3-06 | Only the date changes between two mornings | S0 | 0.95 | c-03, c-29, d-00 |
| H3-07 | Story's unread dot is permanently on | S1 | 0.95 | c-03-home-top-activeproject.png |
| H3-08 | One story, forever, out of three that exist | S1 | 0.9 | g-12, c-03, c-31 |
| H3-09 | Says "Today" but never reads the hour | S2 | 0.9 | g-12-home-discovering-top.png |
| H3-10 | No search anywhere in the app | S1 | 0.9 | 15-task-paths.md T3 |
| H3-11 | Browse grid runs off the left edge | S0 | 0.95 | g-15, g-16, d-03, x-03 |
| H3-12 | Dimensions and lead time exist nowhere | S0 | 0.95 | 10-code-anatomy.md A5 |
| H3-13 | Photographs do not match the pieces | S0 | 0.9 | g-15, g-22b |
| H3-14 | "UNKNOWN MAKER" on a provenance marketplace | S1 | 0.85 | g-15, g-16 |
| H3-15 | "46% match" names nothing it matches | S2 | 0.85 | g-15-browse-pieces-grid.png |
| H3-16 | Every piece detail fails and traps the user | S0 | 0.95 | g-17, c-25, d-04, x-04 |
| H3-17 | Saved has no door until something is saved | S1 | 0.85 | CompanionActionRows.swift:219 |
| H3-18 | Saved opens on boards that can never fill | S1 | 0.9 | g-21, c-22 |
| H3-19 | Saved prints "$4200" without a comma | S3 | 0.95 | g-22b-saved-all-items.png |
| H3-20 | Re-saving a piece inserts a duplicate | S2 | 0.75 | ProductDetailViewModel.swift:104-125 |
| H3-21 | 18 × 14 ft is stored as 59' × 46' | S0 | 0.95 | g-25, d-06a, g-27, g-28b |
| H3-22 | Unit toggle is a 6-point silent target | S1 | 0.9 | g-25-manual-room-entry-metric.png |
| H3-23 | A typed form calls itself a scan | S1 | 0.9 | g-27, c-23 |
| H3-24 | No way to put a piece into a room | S0 | 0.9 | g-20, g-27c, g-28b |
| H3-25 | "0 IN AR" counts a feature that cannot exist | S1 | 0.6 | g-28b + 00246:281 |
| H3-26 | Nothing on a piece helps you decide | S1 | 0.9 | g-20-card-more-menu.png |
| H3-27 | Buying ends at "Add to Room / Saved ✓" | S0 | 0.95 | ProductDetailView.swift:338-399 |
| H3-28 | Sharing a chair sends the designer portal | S1 | 0.95 | g-19-share-sheet.png |
| H3-29 | The shared link cannot open the app | S2 | 0.9 | Patina.entitlements:5-10 |
| H3-30 | No partner, household or second seat | S1 | 0.9 | 12-backend-reality.md §7 |
| H3-31 | No order object; "where is it" is a bill | S1 | 0.9 | 12-backend-reality.md §5 |
| H3-32 | The whole Studio hides behind a 36pt monogram | S1 | 0.9 | c-03, c-06b |
| H3-33 | Three totals for one inbox, two on one screen | S1 | 0.95 | c-06b-studio-awaiting-you.png |
| H3-34 | Deadlines vanish on the screen you act on | S1 | 0.95 | c-09, c-13, c-06b |
| H3-35 | The engaged home is the guest home | S0 | 0.9 | c-31, c-32c |
| H3-36 | Design help offers a second request, not status | S1 | 0.9 | g-30, c-33 |
| H3-37 | Guest hits an escape-less wall at the last tap | S1 | 0.9 | g-35-auth-wall-no-dismiss.png |
| H3-38 | "Nothing yet" while three things are due | S0 | 0.95 | c-21, c-06b, d-10 |
| H3-39 | The one permission ask gives no reason | S1 | 0.9 | PushTokenService.swift:87-108 |
| H3-40 | Push is live but fires for nothing money-shaped | S1 | 0.9 | 17-gap-fills.md G1 |
| H3-41 | Empty bell sells design help to a matched client | S2 | 0.9 | c-21-notifications-signed-in.png |
| H3-42 | Two weeks away looks like one hour away | S0 | 0.95 | c-29, c-03 |
| H3-43 | A returning guest is forgotten and called "home" | S1 | 0.85 | 01-shot-ledger.md:112 |
| H3-44 | Status bar draws over scrolled content | S1 | 0.95 | c-28, c-19, c-11c, c-14 |
| H3-45 | Filter row clips "Storage" to "Stor" at XXL | S2 | 0.9 | x-03-browse-pieces.png |
| H3-46 | The orb covers the button it should help with | S1 | 0.9 | x-05, g-28b |
| H3-47 | Room summary ignores dark mode | S2 | 0.8 | d-06a-room-summary-light-locked.png |
| H3-48 | The designer is named once, on the bill | S0 | 0.95 | c-13, c-08, c-19 |
| H3-49 | The project screen shows the designer's to-do | S1 | 0.95 | c-08-project-detail.png |
| H3-50 | No way to say a word to the designer | S0 | 0.9 | c-19-messages-empty.png |
| H3-51 | The signature sheet restates nothing | S0 | 0.95 | c-11c-sign-sheet.png |
| H3-52 | An accepted proposal is filed as "SIGNED" | S0 | 0.9 | c-09-proposals-list.png |
| H3-53 | "Your budget" is a bill, not a budget | S1 | 0.9 | c-15-budget.png |
| H3-54 | An $850 choice is one tap and irreversible | S1 | 0.9 | c-18-decision-detail.png |
| H3-55 | Payment failure is one red line under a live button | S1 | 0.9 | c-14-pay-handoff.png |
| H3-56 | No Sign Out and no Delete Account anywhere | S1 | 0.9 | c-28, c-28b |
| H3-57 | "Account >" has a chevron and does nothing | S1 | 0.9 | c-28-settings-client.png |

Machine-readable: `research/2x-panel-h3.json` (57 findings, §5 schema).
