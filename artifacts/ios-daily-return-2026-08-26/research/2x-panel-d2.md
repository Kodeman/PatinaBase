# D2 — Priya, Minneapolis. Principal, three-person studio.

Eleven live jobs, two designers, one procurement coordinator under me. My inbox is the enemy. I'm not
looking at this app as a homeowner would — I'm looking at it as the other half of The Document, the
half I don't control, deciding whether I hand my clients a login the week we sign. I review, I don't
edit. My question the whole way through: **would sending clients here cut Tuesday's forty emails in
half, or triple them?**

Evidence: iPhone 17 Pro Simulator, local stack, build `3cd84ecb3`. Client account `client@patina.dev`
(activeProject, three projects, four proposals, one open $4,250 invoice, two overdue decisions,
designer of record "Leah Hartwell") and `james.okafor@example.com` (engaged, lead accepted eight days
ago). I'm treating the seeded "Leah Hartwell" studio as a stand-in for my own — the mechanism is what
I'm judging, not the name.

---

## T1 — "Fresh install. What is this for, and what do I do first?"

**First glance:** A pure white launch screen — no wordmark, no color — then "Welcome home / Start
with a piece you love." Nothing here says "your designer is waiting" or even hints this is a place
where a professional relationship lives. It reads like any furniture app.

**Where I'd tap:** "Have a password? Sign in" — because if I'm handing this to a client I've already
signed, I want the fast lane, not the marketplace onboarding. It's a small link under a stack of four
buttons, easy to miss on a first look.

**Where I'd hesitate:** if I *did* take the default path — Apple/Google/email, three onboarding pages,
a five-question style quiz, a two-step tour, a Companion intro — that's roughly fourteen taps before
the app says anything relevant to a client of mine. None of those fourteen taps mention a designer,
a project, or the fact that someone might already be expecting them on the other side.

**Where I'd leave:** I wouldn't leave the app, but I'd already be drafting the text I'd have to send a
new client to get them past onboarding to the part that matters: "tap Have a password, use the email
I set you up with, skip the quiz for now."

**Would I come back tomorrow for this?** Not the right question for me — the question is whether this
first five minutes is safe to hand a client mid-relationship. Today it isn't: it never once
acknowledges the relationship exists.

**Obviousness: 2** — I can find "Sign in," but nothing on this screen tells a client that's what
they should do instead of the marketplace path.

---

## T2 — "7:40am, coffee, phone in hand. Why would I open Patina today?"

**First glance:** Signed in as my activeProject client: "Today," a Next Move card — "Review a project
decision / 2 decisions need your eye" — a maker-spotlight story, and an "ACTIVE ROOM / Living Room"
card. Four blocks. That's the whole screen.

**Where I'd tap:** the Next Move card, because it's the only thing that reads as news.

**Where I'd hesitate:** nowhere on this screen is my studio's name, my name, or even the word
"designer." If I sent ten clients here on ten different mornings, none of their home screens would
ever say whose work this is. And this client has an $18,500 proposal expiring in thirteen days and a
$4,250 invoice due in six — neither shows up here. Only decisions and unread messages earn a Next
Move card; proposals and invoices don't have a branch at all.

**Where I'd leave:** I wouldn't, but this is the moment I realize the home screen can't do the one
job I need it to do — remind my client that money is moving and I'm waiting on them.

**Would I come back tomorrow for this?** As the studio checking on a client, maybe once. As the thing
I'm counting on to get my client to self-serve instead of emailing me — no, because it won't even
tell them what's actually due.

**Obviousness: 3**

---

## T8 — "I've ordered / my designer ordered — where is it?"

**First glance:** Nothing on Today. I tap the unlabeled monogram avatar (top-right corner, no text)
into Profile, scroll past the stats, and land on "STUDIO / The work around your home, in one place."

**Where I'd tap:** "Awaiting you" — the block that should be the whole answer to "where is it."

**Where I'd hesitate:** the header above it says **"4 things need your eye,"** the block right below
it says **"Awaiting you 3,"** and the footer pinned above the Companion orb says
**"4 THINGS NEED YOUR EYE"** — three counts, one screen, and Today itself and the Companion panel
both separately say "2 project decisions waiting." That's four different numbers for one client's
open items. If a client calls me confused about how many things they owe me, I can't tell them which
number the app meant either.

**Where I'd leave:** I open the proposal — "SIGNED (1)" sits over a $100,000 document that has never
actually been signed (the seed has zero signed proposals; this is `status: accepted` wearing the
wrong label). I open it and the sign sheet itself restates nothing — no amount, no line items, no
date, just a name field. On the proposal I *can* open, the Companion orb sits directly on top of the
"Sign proposal" button, clipping its own label. I open a decision — a colour choice between "Natural"
and "Sand," both $850, neither with an image, and two identical black buttons with no way to ask a
question first. I open Invoices — "Pay $4,250.00" fails, and the error text shoves the disclaimer
copy half off the bottom of the screen with no retry path but tapping the same button again. I open
Messages — "Conversation 0 / No project conversations yet," permanently, no compose button anywhere.
I open Budget — "$4,250 BILLED" is presented as the budget "across your projects," on an account
whose three projects total $725,000.

Every one of those is a moment where, if I were the client, I would stop trusting the number on the
screen and text my studio to confirm it by hand.

**Would I come back tomorrow for this?** No — not as a system I'd trust to answer "where is it"
without me picking up the phone anyway. That's the entire premise of my inbox problem, restated back
to me by the product that's supposed to solve it.

**Obviousness: 2** — every surface is reachable in three or four taps; nothing on any of them is
reachable *and trustworthy* at the same time.

---

## T9 — "Get a designer's help with this room."

I ran this as the client who already has me — the activeProject account's Studio → "Get design help,"
and again on the engaged account (a lead I accepted eight days ago, per the seed).

**First glance:** "Your design request" / "No scans on this phone yet / You can scan a room to attach
— or request design help without one below." The screen has no idea this client already has a
project with me, or, on the engaged account, that I already accepted their lead over a week ago.

**Where I'd tap:** there's only one button — "Request without a scan" — which opens a fresh
budget/timeline/vision intake form. Not a message to me. Not a "your request is already in progress"
status. A brand-new lead form.

**Where I'd hesitate:** right here, hard. I don't know what happens if my already-matched client
submits this. Does it create a second `leads` row? Does it re-enter the matching pool and land on a
*different* designer's desk? Nothing on screen or in the flow tells me, and the backend model
(`leads`, `claim_design_request`) has no concept of "this homeowner already has a designer" gating the
submit.

**Where I'd leave:** before I'd ever let a client tap "Send" on this. I'd rather they text me directly
and skip the app entirely for this one job — which is the opposite of what a "Get design help" button
should train them to do.

**Would I come back tomorrow for this?** No — I'd actively steer clients away from this control once
they have a designer, which means one of the app's exactly-eleven visible controls is now off-limits
to recommend.

**Obviousness: 1** — for the job "ask my existing designer something," this button does something
else entirely, and looks identical to first-contact intake.

---

## T10 — "The designer sent a proposal / an invoice is due. How do I find out?"

**First glance:** the bell → "Notifications / Nothing yet / Updates from your designer will land
here." — on the same account that has a $4,250 invoice due in six days and an $18,500 proposal
expiring in thirteen. Below the empty state sits a "Get design help" button — the acquisition CTA,
handed to a client who already has a designer.

**Where I'd tap:** nothing here leads to the invoice or the proposal. I'd have to already know to go
find Studio myself.

**Where I'd hesitate:** the copy is a promise — "updates from your designer will land here" — and it
is actively false for this account, right now, while real money is outstanding.

**Where I'd leave:** this is the exact moment my client texts me: "did you send an invoice? the app
says nothing's happened." I did send it. The app just never told them. Confirmed at the code level,
not just this screen: no push, in-app row, or notification of any kind fires for a proposal-sent or
invoice-due event anywhere in the backend — the only five things that ever page a client's phone are
design-request/lead-stage changes and an admin-triggered shipping update. Sign and pay are
polling-only.

**Would I come back tomorrow for this?** No — there's no honest reason to check Notifications
specifically; it never populates for the two things I most need my client to notice.

**Obviousness: 1**

---

## T12 — "Show my partner."

**First glance:** from the browse grid's ⋯ menu, "Share" opens the iOS share sheet — titled
**"Patina Designer Portal / app.patina.cloud."** A client sharing a chair with their spouse hands them
a link branded as my portal, not theirs.

**Where I'd tap:** Share, because it's the only social act on the whole app.

**Where I'd hesitate:** there's nothing else to hand a partner. No way to share a room, a board, the
Saved list, a project's status, a proposal, or a decision — only ever a single product link. And the
link itself can't open the app even if the partner has it installed (no associated-domains
entitlement; the app only registers a custom `patina://` scheme) — it opens Safari, cold, no context.

**Where I'd leave:** I'd stop recommending "show your partner" as a use of this app at all — there's
no second seat, no invite, no household concept anywhere in the schema or the client. My client's
spouse never becomes a second person the app knows about.

**Would I come back tomorrow for this?** No — nothing here creates a loop for anyone but the
account-holder.

**Obviousness: 3** for the share act itself; **1** for whether anything changes once the second
person lands.

---

## T14 — "My client just installed this. What do they see of me, and what do I want them doing in
here between our meetings? Would I send them here to buy?"

I walked this last because it's the one that actually decides my answer.

**First glance, across every surface:** my name appears exactly once in the entire app — a small
line, "Aspen Loft Refresh · from Leah Hartwell," on the invoice detail screen. No photo, no avatar, no
studio name anywhere else, no bio, no "message your designer" button anywhere near it. The project
detail screen has a component built to show a studio logo and name (`StudioIdentityLine`) — it draws
nothing here. On the engaged account — a homeowner whose lead I personally accepted eight days ago and
who already uploaded a room scan for me to work from — the home and the Companion are byte-identical
to a stranger who has never contacted anyone: "Bring your first room into Patina," "Add your first
space," no "Your studio" row, no trace that a match happened at all.

**Where I'd tap:** I'd look for anything — a call slot, a portfolio link, a thread — that shows my
client the relationship is real and active. On the engaged account there is nothing to tap toward me.
On the activeProject account, the closest thing is that one line on the invoice, and there is no
control near it to reply to me.

**Where I'd hesitate:** on "Get design help," the only client-facing control that names a designer
action — because for a client who already has me, it doesn't lead to me. It leads to a duplicate
intake form with no visible link back to our project (T9, above).

**Where I'd leave:** the moment I imagine a client using this between our meetings and getting
*worse* information than they'd get by doing nothing — a "SIGNED" proposal they haven't signed, a
"budget" that's a sixteenth of the real number, three different counts for the same to-do list. Every
one of those is a call to my studio, not a save.

**Would I come back tomorrow for this?** As the designer, yes, I'd watch this daily, because right now
nothing in the client app is building my client's trust in *me* — every trust signal on screen is
generic "Patina" chrome, and even that chrome is currently telling my client things that aren't true.

**Obviousness: 2** — a client would need to already know my name to notice it's on the invoice at
all, and even then it's one line of small type, not an identity.

---

### What I want my client doing here

Three things, and only three, today: sign the one proposal, pay the one invoice, answer the two
decisions — the acts the app already builds toward — and have all three actually *land* without a
phone call to confirm it happened. That's the whole ask. I don't need a feed, I don't need a feed
algorithm, I don't need a marketplace. I need the money and decision rail to be legible enough that a
client can act on it alone and I can trust the state I see in the portal reflects what they did.

### What would make me stop sending clients here

The day a client tells me they filed a second design request because the app gave them nothing that
recognized we were already working together — that's not a bug I can shrug off to Kody's backlog,
that's the product actively duplicating my own intake pipeline against a client I've already signed.
A close second, and it would only take one instance: a client asking me "wait, did I already sign
that?" because the list told them "SIGNED" on a document sitting in their inbox unsigned. Either one
of those, once, and I go back to PDFs and email — at least I control what those say.

---

## Findings

| id | title | severity | confidence | shots |
|---|---|---|---|---|
| D2-01 | Launch screen is blank white, no wordmark | S3 | 0.95 | g-01-splash.png |
| D2-02 | Onboarding never frames the app as where a client works with their designer | S2 | 0.8 | g-02-first-screen-after-splash.png, g-09-home-tour-step1.png, g-11-companion-intro-card.png |
| D2-03 | Companion intro pre-empts first-launch tour step 2 | S3 | 0.75 | g-09-home-tour-step1.png |
| D2-04 | Signed-in Today has zero designer/studio identity | S1 | 0.9 | c-03-home-top-activeproject.png |
| D2-05 | Next Move never surfaces an open proposal or due invoice | S1 | 0.85 | c-03-home-top-activeproject.png |
| D2-06 | Three disagreeing "things needing attention" counts on one screen | S1 | 0.9 | c-06b-studio-awaiting-you.png, c-03-home-top-activeproject.png |
| D2-07 | Proposals list mislabels an unsigned $100,000 proposal "SIGNED" | S0 | 0.95 | c-09-proposals-list.png |
| D2-08 | Companion orb covers the "Sign proposal" button | S1 | 0.95 | c-11-proposal-detail-scrolled.png |
| D2-09 | Sign sheet restates no amount, line items, terms, or date | S1 | 0.9 | c-11c-sign-sheet.png |
| D2-10 | "Your studio" Companion row lands on a bare projects list, not messages/decisions | S2 | 0.85 | c-07-projects-list.png |
| D2-11 | Messaging is a static "Conversation 0" with no compose or thread affordance | S1 | 0.9 | c-19-messages-empty.png |
| D2-12 | "Your budget" shows one invoice, not the client's real $725,000 across projects | S1 | 0.9 | c-15-budget.png |
| D2-13 | Decision detail has no way to ask a question or defer before an irreversible choice | S1 | 0.85 | c-18-decision-detail.png |
| D2-14 | A colour decision is presented with no image or swatch for either option | S2 | 0.85 | c-18-decision-detail.png |
| D2-15 | Deadlines shown on list cards vanish on the detail screen the client acts on | S1 | 0.9 | c-12-invoices-list.png, c-13-invoice-detail.png |
| D2-16 | Pay-invoice failure UX shoves body copy off-screen with no real retry path | S1 | 0.85 | c-14-pay-handoff.png |
| D2-17 | Project detail leaks two designer/internal-facing strings verbatim | S1 | 0.9 | c-08-project-detail.png |
| D2-18 | The cheapest, most binding client act (a decision) has no confirmation step | S2 | 0.75 | c-18-decision-detail.png |
| D2-19 | "Get design help" from an already-matched client files an indistinguishable second lead | S0 | 0.9 | c-33-engaged-design-request-again.png |
| D2-20 | Engaged client's home/Companion show zero trace of the accepted designer | S0 | 0.9 | c-31-engaged-home-top.png, c-32-engaged-companion.png |
| D2-21 | Notifications promises "updates from your designer" and never delivers one | S1 | 0.9 | c-21-notifications-signed-in.png |
| D2-22 | No backend trigger ever fires for a proposal-sent or invoice-due event | S1 | 0.85 | (code-read; see refs) |
| D2-23 | The one push permission prompt fires silently, unexplained, unrelated to money | S2 | 0.8 | (code-read; see refs) |
| D2-24 | Shared piece link is titled "Patina Designer Portal" | S2 | 0.9 | g-19-share-sheet.png |
| D2-25 | No way to share a room/board/status; no household or second-person concept | S2 | 0.85 | (code-read; see refs) |
| D2-26 | Shared links can't open the app even when installed (no associated domains) | S2 | 0.8 | (code-read; see refs) |
