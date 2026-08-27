# 2x — Panel seat H1 · Maya (32) & Devon (34), Grand Rapids MI

**Who I am.** First house, closed in May — a 1,400 sq ft 1950s ranch with a living room that has
been empty all summer. Budget is $6–9k for the year and I'm spending it slowly, one right thing at
a time. My ritual is twenty minutes on the couch after dishes: Pinterest, Wayfair, Facebook
Marketplace, and Zillow because I never uninstalled it. "Designer" sounds like money we don't have.
**My question: will this give me a reason at 9pm that Pinterest doesn't?**

**How I walked it.** Fresh install, guest first, then signed in. iPhone 17 Pro simulator, iOS 26.5,
local stack. Every screen I quote is a shot in `shots/`. Scan, LiDAR and AR could not be exercised
in the Simulator — where I talk about those I say so and mark the finding at confidence ≤ 0.6.
Local edge functions were down for the walk (503s), so the Companion's server replies and the
Stripe hand-off are environment, not product, and I have not written them up.

---

## T1 — "Fresh install. What is this for, and what do I do first?"

**First glance:** A blank white flash, then a wall. `PATINA`, `"Welcome home"`, `"Start with a
piece you love"`, and three buttons stacked: `Sign in with Apple` (real Apple logo), `Continue with
Google` (a bare letter G), `Continue with email` (an emoji envelope ✉️). Three icon systems in
three buttons. Under them, `Look around first →` and, oddly, `Have a password? Sign in`.
(`g-02-first-screen-after-splash.png`, `g-01-splash.png`.)

**Where I'd tap:** `Look around first`. I have not agreed to anything yet and I'm not making an
account for a store I've never seen. This is the right button to have, and it is the best decision
the app makes.

**Where I'd hesitate:** I land on `Today` with a coach mark in bright iOS blue — the only blue in an
otherwise warm brown app — and the bubble sits **on top of** the card it's describing
(`g-09-home-tour-step1.png`). Two steps, then a Companion card: `"I'm your Companion."` /
`"Tap me any time, anywhere in Patina — I'll show you the way to what's next."` So the app has told
me twice where things are and I still can't see a single door: no tabs, no menu, no "Browse", no
"Saved" (`g-12-home-discovering-top.png`).

**Where I'd leave:** Didn't. The one card on screen — `"Bring your first room into Patina"` — is a
clear instruction and I'd follow it.

**Would I come back tomorrow for this?** Yes, once — because it told me exactly one thing to do.

**Obviousness: 4** for what to do first; **2** for what the app *is*.

Findings: H1-38, H1-39, H1-40, H1-41, H1-46

---

## T2 — "7:40am, coffee, phone in hand. Why would I open Patina *today*?" (return probe)

**First glance:** `WEDNESDAY · AUG 26` · `Today`. One card: `NEXT MOVE` /
`"Bring your first room into Patina"` / `"A short scan gives the Companion a real space to work
from."` One brown gradient with no photograph in it: `MAKER SPOTLIGHT` /
`"The Grain Whisperer of Maine"` / `"Jonathan Chilton on 40 years of listening to wood"` /
`4 MIN READ` with a small clay dot in the corner. Then the black orb and `NEXT STEPS`.
(`g-12-home-discovering-top.png`.)

**What is actually new since yesterday — exactly:** the date string. That's it. I checked this
across four different days-worth of shots and four different accounts: the guest home
(`g-12`), the same guest an hour later (`g-39-home-after-idle.png`), a signed-in client
(`c-03-home-top-activeproject.png`), a matched client (`c-31-engaged-home-top.png`), dark mode
(`d-01-home-top.png`) and the very last frame of the whole program (`final-handoff-state.png`) —
**the same Maine woodworker story is on every one of them.** The clay dot that means "unread" is on
every one of them too. The Next Move only changes when *I* change something. So the honest answer
to "why open it today" is: because the date changed.

**What would have to be there:** one thing that moved without me. New from the makers this week.
The piece I saved dropped $200. My room got a third piece and here's what it looks like now. A
story I haven't read, and a dot that goes off when I've read it.

**Where I'd tap:** the story, once. Then nothing — the page ends.

**Where I'd hesitate:** the dot. I tapped that story yesterday. It's still marked new.

**Where I'd leave:** Pinterest, in about forty seconds, because Pinterest always has something I
haven't seen.

**Would I come back tomorrow for this?** No. Nothing here is different tomorrow.

**Obviousness: 5** (there is nothing to find) — **and that is the problem.**

Findings: H1-01, H1-02, H1-03, H1-32

---

## T3 — "Find a sofa for our living room."

**First glance:** There is no way to look for a sofa from the home screen. No search field anywhere
in the app. I open the orb: `"Where to begin?"` → `Add your first space` · `Style quiz` ·
`Your recommendations` — subtitled `TAKE THE QUIZ FIRST` — · `Sign in`
(`g-14b-companion-next-steps.png`). There is no "Browse" row until I've done a quiz.

**Where I'd tap:** the quiz, because it's the toll gate. Five questions. I pick `Warm Minimal` and
I'm told I'm `Warm Modern` (`g-08-quiz-result.png`) — a name that wasn't one of the four options.
Then `Browse pieces` / `"10 pieces curated for your space"` (`g-15-browse-pieces-grid.png`).

**Where I'd hesitate:** immediately, and hard. **The left column of the grid is off the screen.**
I can read `M & BOARD`, `rloom Oak / ing Table`, `,200`. Cards are four different sizes. Under the
`Seating` filter they overlap each other and one is a blank brown rectangle
(`g-16-filter-chip-seating.png`). Worse: the photographs are wrong.
`Heirloom Oak Dining Table` by `ROOM & BOARD` shows a white table with **green velvet chairs**.
`Live-Edge Coffee Table` by `LEE INDUSTRIES` shows **an old ladder-back chair sitting in grass**.
A terracotta planter shows a mint-green plastic pot, and its maker line reads `UNKNOWN MAKER`.
Ten pieces. No sofa filter result I'd trust.

Then I tap the dining table to see it properly and get `"Couldn't load product"` /
`"Let's try that again"` on an otherwise blank screen with **no back button anywhere**
(`g-17-piece-detail-top.png`). Retry does the same (`g-17b`). Swiping back from the edge does
nothing (`g-17c`). I have to kill the app.

**Where I'd leave:** Wayfair. On Wayfair I type "sofa," I filter to 80" wide, and I get dimensions.
Here I never once saw a width, a depth, a lead time, or a shipping line — those aren't hidden,
they don't exist on the screen at all.

**Would I come back tomorrow for this?** No. It's ten pieces, half of them mislabeled, and the
detail page is broken.

**Obviousness: 2** — the browse door is behind a quiz behind an orb.

Findings: H1-04, H1-05, H1-06, H1-07, H1-08, H1-19, H1-20, H1-42

---

## T4 — "Save it. Find it again tomorrow."

**First glance:** There is a ♥ on each card, so saving is one tap. Good. Except a sideways swipe
across a card also fires the heart — I toggled a save by accident while testing whether the grid
scrolled (`g-15c-browse-after-right-swipe.png`).

**Where I'd tap:** the ♥, then the orb → `Saved`. The screen opens on a tab called **`Boards`** that
says `"No boards yet"` while the Companion row I just tapped said `1 SAVED PIECE`
(`g-21-saved-empty-boards-tab.png`). I have to find the second tab, `All items`, to see my one
piece — where it renders as **`$4200`**, with no comma, next to a grid that wrote it `$4,200`
(`g-22b-saved-all-items.png`).

**Where I'd hesitate:** I made a board, because the empty state told me to. It stayed empty. There
is no way to put a piece in a board anywhere in the app
(`Features/Collections/ViewModels/CollectionsViewModel.swift:101` — `addToBoard` has no caller).
And a piece I save the way the app invites me to save doesn't count toward the counter that decides
whether the `Saved` row appears at all — the dark-mode walker with zero saves had **no door to Saved
in the entire app** (`01-shot-ledger.md`, d-05 row).

**Where I'd leave:** Pinterest, and this one stings. Pinterest is *only* this. If the "save it for
later" part is shakier than Pinterest's, the whole nightly ritual has no reason to move here.

**Would I come back tomorrow for this?** No — and worse, when I do come back the piece shows
`Add to Room` again as if I'd never saved it, and saving twice makes two rows
(`ProductDetailViewModel.swift:104-125`).

**Obviousness: 2** — saving is easy, finding it again is not.

Findings: H1-10, H1-11, H1-12, H1-13, H1-14, H1-44

---

## T5 — "See it in my room."

**First glance:** The Next Move card has a camera glyph and promises `"A short scan"`. Tapping it
gives me a **typed form**: `TELL US ABOUT YOUR SPACE` / `"What kind of room?"` with emoji tiles
(🛋 🛏 🍽 💻 🍳 ✨), two number fields, and steppers for windows and doors
(`g-25-manual-room-entry-metric.png`). No explanation of why the camera didn't open, and no Back,
Close or Cancel on the screen at all. (Simulator has no LiDAR, so the fallback is expected — the
*silence* about it is not.)

**Where I'd tap:** `LENGTH 18`, `WIDTH 14`. The field says `ft`. In the far top-right corner there
is a `ft / m` toggle roughly the size of a grain of rice.

**Where I'd hesitate:** the next screen. `"Here's what I see."` — **`46 ft` × `59 ft`, `2713 SQUARE
FEET`** (`g-27-room-with-recommendations.png`). My whole house is 1,400 square feet. The app
converted my feet as if they were metres, and it did it because a 6-point tap target flipped with no
visible change. It then offers me `Rescan` for a room I typed by hand, and `0 ITEMS DETECTED` for a
form. I press `This Looks Right` — which is a lie I'm being asked to sign — and the number follows
me everywhere: `Living Room / 2713 SQ FT · 2 WINDOWS`, `59' × 46'`
(`g-28b-room-view.png`), onto the home card `2713 sq ft · 0 pieces saved` (`g-40b`), and later onto
the account as `SCANNED AUG 26` (`c-06c`).

Then the room says `"A blank canvas"` / `"We've already found pieces that would fit this space"` —
two sentences that contradict each other — and gives me three competing exits at once: body copy
saying browse your Daily Room, a black button `Browse Picks for This Room`, and a link
`SEE RECOMMENDATIONS →`, with the Companion orb parked on top of them. The button opens the same
generic `"10 pieces curated for your space"` — no room name, no filtering (`g-27b-room-picks.png`)
— and **there is no way to put any of those pieces into the room.** The ⋯ menu offers
`Save · Share · Not for me · View details` and nothing else, even when I entered the grid from the
room's own button (`g-27c`, `g-20-card-more-menu.png`). The room counts `0 ITEMS` forever.

`IN AR` reads `0` on every room screen and is never defined. Code-read: no product row has a 3D
model, so the AR button never draws and the AR screen's own copy is
`"3D model not available for this product"`.

**Where I'd leave:** here. This is the feature I actually wanted — see it in my room — and it is
the most broken thing in the app.

**Would I come back tomorrow for this?** No. The room has a wrong number on it that I can't fix and
nothing can go in it.

**Obviousness: 1** — I could not find a way to add a piece to a room at all.

Findings: H1-15, H1-16, H1-17, H1-18, H1-34, H1-43

---

## T6 — "Is this the one? Help me decide."

**First glance:** The piece detail is where deciding would happen, and I can't get to it — every tap
lands on `"Couldn't load product"`. So I decided from a card. What a card gives me: maker,
name, price, a `46% match` badge, and one line — `"Its style tags connect to your Warm Modern
portrait."`

**Where I'd tap:** ⋯ , hoping for "compare" or "ask someone". I get
`Save · Share · Not for me · View details` (`g-20-card-more-menu.png`).

**Where I'd hesitate:** everywhere. There is no compare. There is no notes field. There is nothing
on a piece that says "ask a designer about this one" — the help CTA is on eleven other screens and
not this one. And `46% match` — matched to what? My Profile shows `48% MATCH` under a heading that
never says what is being matched (`g-36-profile-guest.png`), and the taste-portrait screen has an
unlabeled progress bar sitting at about 45% under `WHY PATINA SEES THIS` (`g-08-quiz-result.png`).
Three percentages, none of them explained, on the screens meant to build my confidence.

Then the naming: the Companion quiz called me `Warm Modern`, the second quiz that runs after you
make a room called the same result `Modern Warmth` (`g-28-room-view-final.png`), and a different
account's profile says `Style Explorer`. Four questions of five are asked twice across the two
quizzes with different answer options. If the app can't keep one name for my taste, I'm not
trusting its 46%.

**Where I'd leave:** I'd text a picture to Devon and my sister, which is exactly what I do now.

**Would I come back tomorrow for this?** No — there's nothing to come back *to* on a piece.

**Obviousness: 2.**

Findings: H1-21, H1-19, H1-20

---

## T7 — "Buy it." (purchase probe)

**The dead end, verbatim.** The furthest a piece can go in this app is a black button that says:

> **`Add to Room`** — and once tapped — **`Saved ✓`**

That's it. No `Buy`, no `Add to cart`, no `Request a quote`, no price-inquiry, no link to the
maker's own page. The only Stripe rail in the app belongs to invoices a designer raises, which I
don't have and can't get without hiring one.

**How many taps I spent looking:** five. Orb (1) → `Your recommendations` (2) → tap the card (3) →
`Let's try that again` (4) → edge-swipe back, which does nothing (5) — then I force-quit the app,
because that screen has no back button. On the day the detail screen works, the count is three taps
to the terminus and there is nothing at the end of it. **Taps to money: undefined. There is no
path.**

**Where I'd hesitate:** the honest version of this is that I don't know what Patina *is*. It shows
me a $4,200 dining table by Room & Board with a photo of somebody else's chairs and gives me no way
to buy it, no dimensions to check, no lead time, no shipping, and no returns policy. On the maker's
own site I'd have all five and a checkout.

**Where I'd leave:** Google the piece name, buy it from whoever sells it. Which is the worst
outcome for everyone here.

**Would I come back tomorrow for this?** No.

**Obviousness: 1** — there is nothing to find, and I looked.

Findings: H1-09, H1-04, H1-06

---

## T8 — "I've ordered / my designer ordered — where is it?"

**First glance:** I have nothing to track, because nothing in this app can be ordered. So I checked
what would happen if something were: there is no order screen, no order history, no shipping status
anywhere in the app. The bell says `"Nothing yet"` (`g-29-notifications-guest.png`).

**Where I'd tap:** the bell, then Profile, looking for anything shaped like "your stuff." Profile
has a block called `STUDIO` / `"The work around your home, in one place."` and under it, for me,
`"Nothing needs your attention right now."` right above `"Your Studio begins with a project. / Sign
in to see conversations, decisions, proposals, invoices, and shared files."` — two lines that argue
with each other (`g-36-profile-guest.png`).

**Where I'd hesitate:** on the fact that the *backend already has* a direct-order table with
`pending_payment / paid / canceled` and a Stripe settle path, and the app has not one line of code
that touches it (`12-backend-reality.md` §5). So the app's answer to "where is it" isn't "not built
yet," it's "we built the till and never put it in the shop."

**Where I'd leave:** I check packages in the carrier's app like everyone else.

**Would I come back tomorrow for this?** No — nothing here knows about anything I own.

**Obviousness: 1.**

Findings: H1-47, H1-28

---

## T9 — "Get a designer's help with this room."

**First glance:** "Designer" still sounds like money we don't have, so this is the task I'd do last
and most warily. There's no `Get design help` on the home at all. I find it in the orb, and it opens
`Your design request` — whose entire body is `"No scans on this phone yet"` /
`"You can scan a room to attach — or request design help without one below."` with exactly one
button: `Request without a scan` (`g-30-designer-consultation.png`). It offers me a scan and then
gives me nowhere to do it.

**Where I'd tap:** `Request without a scan` → a four-field form (`What kind of help?` / `Budget
(optional)` / `Timeline` / `Your vision (optional)`) → `Review` → `Send request`.

**Where I'd hesitate:** at `Send request`, which is where **the whole auth wall drops on me**
(`g-33-after-send-request.png`, `g-35-auth-wall-no-dismiss.png`). Nothing in four screens warned me
an account was needed. And this version of the wall is not the friendly one — the sign-in sheet
elsewhere has a `Cancel`; this one has **no Cancel, no ✕, and no `Look around first`**. The only way
out is to guess that dragging it down works. I had just typed my budget into a form. That is the
exact moment I decide whether these people are careful.

**And the other half:** I looked at what happens *after* a designer says yes. The account whose
request was accepted and claimed eight days ago sees a home reading `"Bring your first room into
Patina"` — byte-for-byte the guest home (`c-31-engaged-home-top.png`) — no designer, no status, no
match, and no `Your studio` row in the orb at all (`c-32-engaged-companion.png`). Its Studio is five
stacked zeroes (`c-32c`). The one true fact about that account appears nowhere in the app.

**Where I'd leave:** at the wall, if the wall had no way out. I'd try once more.

**Would I come back tomorrow for this?** Yes — *if* the app told me a human had my request. Today
it wouldn't.

**Obviousness: 3** to send; **1** to find out what happened next.

Findings: H1-25, H1-26, H1-27

---

## T10 — "The designer sent a proposal / an invoice is due. How do I find out?"

**First glance:** `Notifications` / `"Nothing yet"` / `"Updates from your designer will land here.
Sign in to stay in the loop."` and a `Sign in` button drawn as **a circle with the words spilling out
both sides of it** (`g-29-notifications-guest.png`).

**Where I'd tap:** nothing. There's nothing to tap.

**Where I'd hesitate:** on what the app can actually send. The push machinery is real and live —
but it fires for exactly three things, all of them design-request lifecycle, plus a shipping
notice an admin has to press send on. **Nothing money-shaped pushes at all**: not a proposal
arriving, not an invoice coming due, not a decision waiting (`17-gap-fills.md` G1). The signed-in
client walked in this program had two decisions overdue since Aug 22, an invoice due Sep 1 and a
proposal expiring Sep 8 — and an empty bell (`c-21-notifications-signed-in.png`,
`d-10-notifications.png`). The way you find out is: open the app and hope the one card changed.

**And what earns the permission:** the app asks for notifications exactly once, right after you
submit a design request, with no screen explaining why (`Services/API/PushTokenService.swift:87-108`).
I never submit a request, so I'm never asked — and then the app has no way to reach me forever.

**Which pushes I'd allow:** "your piece shipped", "your designer answered", "the thing you saved
is back in stock or dropped." Not "come see today's story."

**Would I come back tomorrow for this?** No — there is no "this" yet.

**Obviousness: 1.**

Findings: H1-28, H1-29, H1-30

---

## T11 — "Two weeks away. I'm back." (re-entry probe)

**As a guest — the version that would happen to me:** I force-quit the app at some point, or the
phone did. Coming back, I get the auth wall again: `"Welcome home"` (`g-38-relaunch-returning-guest.png`).
My quiz, my session, my room — gone. The screen says "welcome home" to somebody it just forgot. And
it's incoherent about it: the piece I saved survived, the coach marks are marked seen, my Profile
still shows the `Warm Modern` badge — while the Companion on that same launch insists
`Style quiz / DISCOVER YOUR STYLE` and `Your recommendations / TAKE THE QUIZ FIRST`
(`g-40-companion-inconsistent-persistence.png`). Three surfaces, three answers to "did she take the
quiz."

**As a signed-in person:** the session does survive, and I land on a home that is byte-identical to
the one I left (`c-29-relaunch-returning-client.png`).

**Exactly what is or is not new after two weeks:** the date line. The story is the same Maine
woodworker with the same unread dot. The Next Move is whatever it was, unless I changed something.
There is **no last-visit timestamp anywhere in this app** — not for the story, not for the feed, not
for the room, not for Saved. One hour away and fourteen days away produce the same screen. Two
things do change silently and neither is explained: a matched design-request card vanishes on day
15, and the orb quietly gets calmer at day 14.

**What would have to be there:** one line at the top that says what happened while I was gone —
"3 new pieces from makers you've saved · your room hasn't changed · nothing needs you." Even
"nothing happened" would be worth more than a screen that pretends no time passed.

**Where I'd leave:** I wouldn't have opened it. Two weeks is exactly how long it takes an app with
no reason to open to fall off my home screen.

**Would I come back tomorrow for this?** No.

**Obviousness: 5** (nothing is hidden — nothing is there).

Findings: H1-31, H1-32, H1-01, H1-02

---

## T12 — "Show my partner."

**First glance:** There's a `Share` in the ⋯ menu on a card. I tap it.

**Where I'd hesitate:** the share sheet says I am about to send Devon a link titled
**`Patina Designer Portal`** / `app.patina.cloud` (`g-19-share-sheet.png`). I am a homeowner
sharing a chair, and the app is handing my husband the *designer's* portal, under the designer
portal's name. I would not send that. And even if I did, the app can't open it — there's no
universal-link entitlement, so the link opens Safari even on a phone with Patina installed.

**Where I'd tap next:** I look for a way to get Devon *in*. There isn't one. No invite, no
household, no second seat, no shared board — I checked the backend too, there's no such table
(`12-backend-reality.md` §7). There's no way to share a room, a board, or my saved list at all.
There is also **no Sign Out control anywhere in the app** (`g-37-settings-guest.png`,
`c-27-account-row-inert.png`), so on the iPad we share, whoever signs in first owns it. When I did
sign in, the room and the piece I'd saved as a guest silently moved into my account and were
counted as account data (`c-03`, `c-05`, `c-26`) — nice for me, alarming when I picture Devon's
account picking up my afternoon.

**Where I'd leave:** iMessage, with a screenshot. Which is what I do today.

**Would I come back tomorrow for this?** No — and this matters more than it sounds. We decide
together. An app only one of us can hold is a browsing app, not a buying app.

**Obviousness: 2.**

Findings: H1-22, H1-23, H1-24, H1-45, H1-44

---

## T13 — "One-handed on the bus · dark mode · larger text."

**First glance:** One-handed is genuinely good. Every card is full-width in the bottom two-thirds
and the orb sits in the fat part of my thumb's arc. Dark mode is the nicest thing in the app —
cream on near-black, clean contrast, nothing clipped (`d-01-home-top.png`).

**Where I'd hesitate:** three places.

1. **The clock overprints the app.** Every scrolling screen slides its own heading up under the
   status bar — `WEDNESDAY · AUG 26` collides with `9:41` on the home (`g-40b`), `Guest` gets
   sliced on Profile (`g-36b`), and at large text the Dynamic Island itself covers a proposal's
   title (`x-02-profile-studio-rows.png`).
2. **Bigger text breaks the shop.** At XXL, the filter row runs off the edge — `Storage` is clipped
   to `Stor` with no scroll cue (`x-03-browse-pieces.png`) — and the already-broken grid pushes
   further off-screen.
3. **One screen ignores dark mode entirely.** The room summary renders in full light theme inside
   an all-dark app, and its own headline washes out to nearly invisible
   (`d-06a-room-summary-light-locked.png`).

And the targets. The `ft / m` toggle that corrupted my room is 6 points wide. The `Boards` tab is
46×17. The retry link on the trapped product screen is 125×17. I have thumbs and a phone case.

Also, on at least three screens the Companion orb parks itself on top of the primary button —
`Browse Picks for This Room` (`g-28b`, `c-24`) and, for the signed-in client, `Sign proposal`
(`c-11`). The most important button on the screen is the one thing covered.

**Would I come back tomorrow for this?** Neutral — reach isn't a reason to return, but it's a reason
to leave.

**Obviousness: 4.**

Findings: H1-33, H1-34, H1-35, H1-36, H1-37

---

## T14 — "What do I see of a designer in here?" (run as the homeowner)

**First glance:** Nothing. At my tier the word "designer" appears twice, both times in an empty
state: `"Updates from your designer will land here."` and `"Get design help"`. There is no
designer's name, no studio, no face, no portfolio, nowhere in the app I can reach.

**Where I'd hesitate:** I looked at what a client with a real designer sees, because that's the
future the app is selling me. The designer is named **exactly once in the entire product** — on the
invoice, as `"Aspen Loft Refresh · from Leah Hartwell"` (`c-13-invoice-detail.png`) — with no photo,
no studio, no way to contact her. Not on the project, not on the proposal, not on the decisions, not
on Today. Meanwhile the client's own project screen shows them a stat labelled `CLIENT VIEW /
Milestone` and a link reading `"Set up phases, payments, and FF&E in the portal →"` — instructions
written for the designer, handed to the homeowner (`c-08-project-detail.png`).

And the messaging surface is one grey line: `Conversation 0 / "No project conversations yet."` with
no compose (`c-19-messages-empty.png`). If I hired someone through this app, I could not say a word
to them inside it.

**What I'd want them doing here:** the opposite. I'd want to open this app and see *her* — the
person who picked these three chairs, why, and what she's waiting on from me.

**Would I come back tomorrow for this?** Not as it stands. The relationship the app is selling is
invisible in the app.

**Obviousness: 1.**

Findings: H1-27, H1-21

---

## Three things that would make me open this every day

1. **Something that moved without me, on the first screen, that is true.** One line under `Today`:
   "New this week from makers in your palette — 4 pieces," or "Your Living Room: nothing new," and
   an unread dot that actually goes off when I read the story. Right now the only honest thing on
   that screen is the date, and the one dot that claims freshness is hard-coded on. Honest beats
   frequent — but *nothing* beats nothing.
2. **A room that fills up.** Let a piece land in Living Room. Show me the room getting fuller —
   3 of maybe 6 things, $2,400 of our $9,000, this sofa next to that rug — and I will open it
   nightly the way I opened Zillow before we closed. That's the ritual Pinterest can't have,
   because Pinterest doesn't know my room. Today the room counts `0 ITEMS` and there is no way to
   change that number.
3. **Devon in here with me.** One shared list, both of us can add and heart, and a share link that
   opens *this app* and says Patina, not "Patina Designer Portal." Every $2,000 decision in this
   house is made by two people on one couch.

## What would make me buy here instead of the maker's own site

Honestly: a way to buy at all. Right now the furthest a piece goes is `Add to Room` → `Saved ✓`.
Past that, four things, in this order:

1. **Tell me it will fit.** Width, depth, height, and — since the app knows my room — "this fits
   your 18 × 14 living room" (with the *right* numbers, not 2,713 square feet). This is the one
   thing the maker's own site usually makes me do with a tape measure, and it's the one thing an app
   that has scanned my room should hand me. The dimensions column exists in the database and is
   never sent to the app; that's the cheapest trust win here.
2. **Show me the real piece.** A photo of the thing I'm buying. A dining table listing showing green
   velvet chairs and a coffee table listing showing a chair in a field cost more trust than any
   feature could earn back.
3. **Tell me who is responsible.** Lead time, shipping, what happens when it arrives scratched, and
   whose name is on that. Four thousand dollars of furniture is a promise about a delivery day, not
   a picture.
4. **Give me the maker's story where the price is.** `The Grain Whisperer of Maine` is the best copy
   in this app and it sits on the home screen, disconnected from anything I can buy. Put Jonathan
   Chilton on the table he made and I would rather buy it here than on a site that shows me a
   swatch grid. That is the only thing this app has that Wayfair can never have — and today it's
   decoration.

---

## Findings

| id | title | severity | confidence | shots |
|---|---|---|---|---|
| H1-01 | Only the date changes from one morning to the next | S0 | 0.90 | g-12, g-39, d-01, final-handoff-state |
| H1-02 | Story "unread" dot is on permanently | S1 | 0.85 | g-12, d-01, c-31 |
| H1-03 | The same story is on the home every day | S1 | 0.90 | g-12, c-03, d-01, final-handoff-state |
| H1-04 | Every piece detail fails and traps you | S0 | 0.95 | g-17, g-17b, g-17c, d-04, x-04 |
| H1-05 | Browse grid runs off both edges of the screen | S0 | 0.95 | g-15, g-15b, g-16, d-03, x-03 |
| H1-06 | No dimensions on any piece, anywhere | S1 | 0.85 | g-15, g-22b |
| H1-07 | Product photos show a different piece entirely | S0 | 0.90 | g-15, g-22b |
| H1-08 | "UNKNOWN MAKER" on a provenance marketplace | S1 | 0.85 | g-15 |
| H1-09 | No way to buy; the piece ends at "Saved ✓" | S0 | 0.95 | g-20, g-17 |
| H1-10 | Saved renders the price as "$4200" | S3 | 0.95 | g-22b, c-22b |
| H1-11 | Saved opens on an empty "Boards" tab | S2 | 0.90 | g-21, g-22, c-22 |
| H1-12 | A board can be created but never holds a piece | S1 | 0.85 | g-21 |
| H1-13 | Saved has no door until something is saved | S1 | 0.85 | g-14b, d-09, x-09 |
| H1-14 | Tomorrow the saved piece says "Add to Room" again | S1 | 0.75 | g-22b |
| H1-15 | No way to put a piece in a room | S0 | 0.90 | g-20, g-27c, g-28b |
| H1-16 | A 6-point toggle turned 18×14 ft into 2713 sq ft | S0 | 0.95 | g-25, g-27, d-06a |
| H1-17 | "Captured", "Rescan", "SCANNED" for a typed form | S1 | 0.90 | g-26, g-27, c-06c |
| H1-18 | AR is offered on every room and never works | S1 | 0.60 | g-28b, c-24, d-06 |
| H1-19 | Two quizzes give my taste two different names | S1 | 0.90 | g-08, g-26, g-28 |
| H1-20 | "48% MATCH" never says matched to what | S2 | 0.80 | g-36, g-15, g-08 |
| H1-21 | No compare, no notes, no ask-about-this-piece | S1 | 0.85 | g-20 |
| H1-22 | Sharing a piece sends the designer portal | S0 | 0.95 | g-19 |
| H1-23 | The shared link cannot open the app | S1 | 0.85 | g-19 |
| H1-24 | No way to bring my partner in | S1 | 0.85 | g-19, g-37 |
| H1-25 | Auth wall lands at the last tap, no escape | S0 | 0.95 | g-31, g-33, g-35 |
| H1-26 | Request sheet offers a scan it cannot take | S2 | 0.90 | g-30, c-33, x-06 |
| H1-27 | A matched homeowner's home is the guest home | S0 | 0.90 | c-31, c-32, c-32c |
| H1-28 | Nothing money-shaped can ever notify me | S0 | 0.90 | g-29, c-21, d-10 |
| H1-29 | Notification permission asked once, unexplained | S1 | 0.85 | g-29 |
| H1-30 | "Sign in" drawn as a circle, label overflowing | S3 | 0.95 | g-29 |
| H1-31 | A returning guest is dumped at "Welcome home" | S0 | 0.90 | g-38, s-04, g-40 |
| H1-32 | Nothing anywhere says what changed since last visit | S1 | 0.90 | c-29, g-12, d-01 |
| H1-33 | Headings scroll under the status-bar clock | S2 | 0.90 | g-40b, g-36b, x-02 |
| H1-34 | The Companion orb covers the primary button | S1 | 0.85 | g-28b, c-24, c-11 |
| H1-35 | Filter chips clip to "Stor" at large text | S2 | 0.90 | x-03 |
| H1-36 | Room summary renders light inside dark mode | S2 | 0.90 | d-06a |
| H1-37 | Core controls are far under 44 points | S1 | 0.85 | g-25, g-21, g-17 |
| H1-38 | No Browse door on the home or in the orb | S1 | 0.90 | g-12, g-13, g-14b |
| H1-39 | The tour's save-loop step never renders | S2 | 0.80 | g-09, g-10 |
| H1-40 | Coach marks cover the card they describe | S2 | 0.90 | g-09, g-10, g-14 |
| H1-41 | Launch screen is blank white | S3 | 0.85 | g-01 |
| H1-42 | No search anywhere in the app | S1 | 0.90 | g-15, g-14b |
| H1-43 | "Browse Picks for This Room" is not room-filtered | S1 | 0.90 | g-27b |
| H1-44 | Guest room and saves follow the next account in | S0 | 0.90 | c-03, c-05, c-26, c-34 |
| H1-45 | There is no Sign Out anywhere | S1 | 0.95 | g-37, g-37b, c-27, c-30 |
| H1-46 | Settings "Account >" row does nothing | S1 | 0.85 | g-02b, g-37b, c-27 |
| H1-47 | No order exists to track, on either side | S1 | 0.90 | g-29, c-21 |

**Evidence note.** H1-18 is confidence 0.60 because AR and LiDAR cannot be exercised in the
Simulator; what is sim-verified is only the `0` / `IN AR` stat on the room screens. What would
settle it: one device run against a product row that has a non-null `usdz_url` — today the
recommendation RPC returns `NULL::text` for every row, so the button is unreachable by construction
rather than by hardware.
