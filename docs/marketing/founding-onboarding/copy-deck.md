# Founding Designer Onboarding — Copy Deck

**Campaign:** The First Six Weeks
**Status:** Final copy, ready for template build (Wave 3)
**Source of truth for design/slugs/subjects:** `scratchpad/campaign-design-handoff.md`

This deck carries the final, send-ready copy for all 17 emails plus the 10 in-app
Post notes. Subjects and previews are **fixed** by the handoff and must not be
changed in template build. Bodies are written to be read whole with images off,
each with exactly one primary CTA.

## Conventions for the template team

- **Tokens** are `{{snake_case}}`. Render inline exactly as written.
- `{{action_link}}` = the recipient's single-use magic sign-in link (invite track).
- `{{app_url}}` = the designer portal base (e.g. `https://app.patina.cloud`).
  Deep links are written as `{{app_url}}/path`.
- `{{personal_observation}}` on T0 is **required** — no send without it.
- `{{firsts_summary}}` on E10 is a rendered sentence built from the recipient's
  engagement events (e.g. "You captured your first lead on the 12th; the
  Hendricks proposal went out on the 26th").
- `{{client_first_name}}` on M1/M2 is the signing client's first name.
- CTA lines below name the button label and its target. Where a body shows
  `**[ Label ]**`, that is the single primary button; the CTA line is the wiring.
- Letters (T0, N2, W0, E10) must render as letters — no feature grids, no
  screenshots, generous line spacing.
- N2 renders plain-text style (no gold header block, no button) — a real note.

---

## T0 — designer-invite

- track: invite | category: transactional
- from: Kody at Patina <kody@patina.cloud>
- subject: An invitation to Patina
- preview: Your desk is set. One click signs you in — no password.
- variables: first_name, personal_observation (required), action_link
- cta: Open your desk → {{action_link}}

### Body

{{first_name}},

I've been following your work — {{personal_observation}}. That's exactly the eye we built Patina for.

Patina connects designers with Midwest workshops that build furniture to last — kiln-dried hardwood, honest joinery, pieces that earn their patina. You design. The makers build. Your clients get heirlooms with a story worth telling.

You're one of the first designers we're inviting, which means two things: your desk is already set up, and your opinion will shape what we build next.

One promise up front, stated plainly: a quarter of our commission goes back to the designers who teach the system. When Patina earns, you earn.

The practical part:

- The button below signs you in. No password, no forms — the link is yours alone. If it lapses, reply and I'll send a fresh one.
- You'll land at your desk. A one-minute walkthrough shows you around — six stops, skippable.
- Bring one client to mind. Your first ten minutes will make sense of the rest.

**[ Open your desk ]**

Questions, doubts, or a better week to start — reply to this email. It comes straight to me.

— Kody
Founder, Patina
*Where Time Adds Value*

### In-app note

None — invite track, not a spine email.

---

## N1 — designer-invite-nudge-1

- track: invite | category: transactional
- from: Kody at Patina <kody@patina.cloud>
- subject: Holding your seat
- preview: The desk is still set. One click, no password, ten minutes.
- skip if: designer_first_signin
- variables: first_name, action_link
- cta: Open your desk → {{action_link}}

### Body

{{first_name}},

A few days back I sent you a way into Patina. That first link may have quietly expired by now — they don't last forever — so here's a fresh one, good through the week.

Nothing has changed on my end. Your desk is still set up and waiting, exactly as I left it. You're one of the first designers we've asked in, and that seat isn't going anywhere this week.

When you have ten quiet minutes, the button below signs you in. No password, no forms. You land at your desk, and the rest makes sense from there.

**[ Open your desk ]**

If the timing is just wrong, that's alright too — reply and tell me. This address comes straight to me.

— Kody

### In-app note

None — invite track, not a spine email.

---

## N2 — designer-invite-nudge-2

- track: invite | category: transactional
- from: Kody at Patina <kody@patina.cloud> (plain-text style — no header block, no button)
- subject: Is the timing wrong?
- preview: No pitch. Just a question — and an offer to hold your invitation.
- skip if: designer_first_signin
- variables: first_name
- cta: Reply with a better month (plain reply — no button)

### Body

{{first_name}},

I've written twice now, so I'll take the hint that the timing might just be wrong — a busy season, a full plate, or Patina isn't a this-month thing.

No trouble at all. If there's a better month, reply with it and I'll hold your invitation open until then. If I don't hear back, that's fine too — this is the last of these you'll get from me. No drip, no chasing.

The door stays open either way.

— Kody

### In-app note

None — invite track, not a spine email.

---

## W0 — designer-welcome

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: Your desk is ready
- preview: One client, one document. Here's your first ten minutes.
- send: first sign-in + 2h
- skip if: —
- variables: first_name
- cta: Go to your desk → {{app_url}}/desk

### Body

{{first_name}},

Good — you're in. Here's the whole idea, small enough to keep:

**Everything for a client lives in one document.** The brief, the boards, the orders, the care notes when the last piece lands — one set of pages, start to finish. No project folders scattered across six tools.

**The desk only shows what needs your hand.** When a document needs you, it lands there as a folder with one plain line about why. A quiet desk isn't an empty desk — it means the work is in motion.

That's it. Two ideas.

Your first move: capture a lead. A name and a note — under a minute — and the desk takes it from there. If you'd rather look around first, press **⌘K** and type anything: a person, a piece, the word "invoice."

If you skipped the walkthrough (fair), you can replay it anytime from the Help shelf — six stops, about a minute.

**[ Go to your desk ]**

I read every reply on this address. Tell me where it creaks.

— Kody

### In-app note

"Welcome. Replay the walkthrough anytime from the Help shelf." → {{app_url}}/help

---

## E2 — onboarding-document-model

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: One client, one document
- preview: Everything for a client — brief to care — lives on one set of pages.
- send: day 2
- skip if: project_created
- variables: first_name
- cta: Capture a lead → {{app_url}}/desk

### Body

{{first_name}},

Here's the one idea Patina is built on, worth sitting with for a minute.

Everything for a client lives in one document. The first brief, the boards you'll build, the orders that go to the makers, the care notes when the last piece is delivered — one continuous set of pages, start to finish. Not a folder here, a spreadsheet there, a thread somewhere else.

The document does the organizing. When it needs your hand — a proposal to approve, a delivery to confirm — it lands on your desk as a folder with one plain line about why. The rest of the time it waits, holding everything in place.

There is nothing to configure. You start a document by capturing a client — a name and a note is enough, under a minute — and the desk shapes it from there.

So bring one real client to mind, and start their document today.

**[ Capture a lead ]**

Tell me where it snags. I read every reply.

— Kody

### In-app note

"Your first folder starts with a name. Under a minute." → {{app_url}}/desk

---

## E3 — onboarding-capture

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: Your eye, everywhere
- preview: Clip a piece from any site. Scan a room from your pocket. It all lands on your shelf.
- send: day 4
- skip if: first_capture
- variables: first_name
- cta: Get the clipper → {{app_url}}/library

### Body

{{first_name}},

Your taste doesn't live on one website, so Patina doesn't ask it to.

The clipper is a browser button. See a piece you like — on a maker's site, a magazine, anywhere — and one click puts it on your shelf. The source comes with it: where it's from, who makes it, what it cost. Provenance travels with the clip, so a find in March still has its story in September.

Patina Field is the same shelf in your pocket. Walk a room and it captures the true dimensions — wall to wall, floor to ceiling — from the walk-through itself. No tape measure, no graph paper. You leave with measurements you can trust and a room ready to design.

Both take about two minutes to set up. Do the clipper first.

Clip one thing today — the ugliest sconce you can find counts. The point is to feel how fast your eye becomes your shelf.

**[ Get the clipper ]**

— Kody

### In-app note

"The clipper takes two minutes to set up. Then anything you find is yours to keep." → {{app_url}}/library

---

## E4 — onboarding-library

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: Three shelves
- preview: Yours, your studio's, and the makers' — every piece with its provenance.
- send: day 7
- skip if: never
- variables: first_name
- cta: Walk the Library → {{app_url}}/library

### Body

{{first_name}},

Your Library has three shelves, and the difference between them matters.

Your shelf holds what you've clipped — your finds, your eye, private until you decide otherwise. The studio shelf is shared: what your team gathers, in one place, so nobody re-hunts a source someone already found. And the Patina catalog is the makers' shelf — real pieces from real Midwest workshops, listed workshop by workshop.

Open any piece and you get the Piece: who built it, from what, and where. Walnut from a family mill in Indiana reads differently than "brown, wood-look" — and here it's named, so you can stand behind it when a client asks.

Everything is reachable by name. Press **⌘K**, type "walnut sideboard" or a maker you remember, and you're there.

Spend five minutes walking the catalog. Find one piece you'd put in a real room this year.

**[ Walk the Library ]**

— Kody

### In-app note

"Three shelves: yours, your studio's, the makers'." → {{app_url}}/library

---

## E5 — onboarding-drafting-room

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: From shelf to proposal
- preview: Boards, palettes, phases — then a signature.
- send: day 10
- skip if: proposal_sent
- variables: first_name
- cta: Open the Drafting Room → {{app_url}}/desk

### Body

{{first_name}},

This is where the Library becomes a plan.

In the Drafting Room, you pull Pieces from any shelf — yours, the studio's, the makers' — straight onto boards. Palettes hold the thread that ties a room together, the through-line a client can feel but rarely name. Phases set the pace and the money: what happens first, what it costs, what comes after.

When it's ready, the proposal goes to your client for a signature — inside Patina. No PDF to export, no attachment to chase, no "did you get my email." They open it, they see the work, they sign.

Honest about the effort: your first board is an evening's work, not a template to wrestle into shape. You're arranging pieces you already like into an order that makes sense.

Start with the client you captured in week one. Their document is open and waiting.

**[ Open the Drafting Room ]**

— Kody

### In-app note

"Your first board is one blank page away." → {{app_url}}/desk

---

## E6 — onboarding-open-requests

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: Work, waiting on the desk
- preview: Homeowners post real requests. You claim the ones that fit your eye.
- send: day 14
- skip if: design_request_claimed
- variables: first_name
- cta: See open requests → {{app_url}}/desk

### Body

{{first_name}},

Some of the work on Patina comes looking for you.

Homeowners post requests — real ones. A request holds the rooms, often already scanned with their true dimensions, a budget the homeowner has named, and the project in their own words: what they have, what they want, what's not working. You read it the way you'd read a good first phone call.

Claiming is simple, and it's first-come. When a request fits your eye and your calendar, you take it — and the moment you do, it's yours. The homeowner is told a designer has the project. A document opens with their brief already inside, nothing to re-enter.

Claim what fits. Pass on what doesn't — no penalty, no explaining. These are people who came to Patina looking for a designer, not leads to talk into anything.

Have a look at what's open on your desk today.

**[ See open requests ]**

— Kody

### In-app note

"Requests are on your desk. Claim what fits." → {{app_url}}/desk

---

## E7 — onboarding-hours

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: Hours that keep themselves
- preview: The timer runs while a document is in your hand. The ledger does the remembering.
- send: day 18
- skip if: hours_logged
- variables: first_name
- cta: Open Hours → {{app_url}}/desk?sheet=hours

### Body

{{first_name}},

Billing the hours you actually worked shouldn't cost you a Sunday night trying to remember them.

There is a quiet timer in the studio drawer. Pick up a document to work on it, and time starts logging against that client. Set it down, and it stops. You don't start it and you don't stop it — it follows the work.

The Hours ledger is where it all lands, and it is yours to keep honestly. An entry ran long? Trim it. A phone call you forgot to open the document for? Add it. Nudge things up or down until the book reads true. It's your book — the timer just does the remembering so you don't have to.

The payoff is plain: at invoice time, the hours are already there, already sorted by client, waiting.

Open Hours and look at what it already caught this week.

**[ Open Hours ]**

— Kody

### In-app note

"Hours logged themselves this week. Have a look." → {{app_url}}/desk?sheet=hours

---

## E8 — onboarding-books

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: The books, in order
- preview: Invoices out, payments in, purchase orders tracked — one sheet each.
- send: day 24
- skip if: invoice_sent
- variables: first_name
- cta: Open Accounts → {{app_url}}/desk?sheet=accounts

### Body

{{first_name}},

Once work is signed, the money has its own quiet order.

Accounts is one sheet. A signed proposal becomes a deposit invoice in about two minutes — the numbers are already there. Your receivables sit in one view: what's out, what's paid, what's late. Reminders go out on their own, so you are not the one nagging a client about a balance.

Orders is the other sheet. Every purchase order carries its maker, its dates, and its status, so "where's the credenza" has an answer you can read off a screen instead of chasing down a workshop.

Both sheets slide over the document when you need them and slide back when you're done. The ledgers serve the work — the work never bends to the ledgers.

If anything of yours is signed, send the deposit invoice today. It's the shortest path from yes to money in.

**[ Open Accounts ]**

— Kody

### In-app note

"Signed work is waiting on an invoice. Two minutes." → {{app_url}}/desk?sheet=accounts

---

## E9 — onboarding-aesthete

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: Teach it your taste
- preview: Patina learns your eye the way an apprentice would — by watching, and by asking.
- send: day 30
- skip if: never
- variables: first_name
- cta: Sit with Aesthete → {{app_url}}/library

### Body

{{first_name}},

By now Patina has watched you work a little — the pieces you clip, the ones you scroll past, the rooms you build. Aesthete is where that turns into something useful to you.

It's a short conversation. What you like, and why. The words you'd actually use for a room — warm, quiet, a little worn — not a style label off a menu. You talk; it listens; it learns your eye the way a good apprentice would, by watching and by asking.

What you get back is plain: better pieces surfaced sooner, fewer misses, a catalog that slowly starts to feel sorted by you instead of by everyone.

And here is the part I'll always state plainly: a quarter of our commission goes back to the designers who teach the system. Teaching Aesthete your taste is real work, and it's paid work. When Patina gets smarter, the designers who taught it share in what it earns.

Give Aesthete ten minutes with your least favorite trend.

**[ Sit with Aesthete ]**

— Kody

### In-app note

"Aesthete is in the Library when you have ten minutes." → {{app_url}}/library

---

## E10 — onboarding-six-weeks

- track: spine | category: sequence
- from: Kody at Patina <kody@patina.cloud>
- subject: Six weeks in
- preview: What you've set up, what's ahead, and one ask.
- send: day 40
- skip if: never
- variables: first_name, firsts_summary
- cta: Back to the desk → {{app_url}}/desk (secondary, soft: reply)

### Body

{{first_name}},

Six weeks. Here's what you've actually done — pulled from your own record, not a brochure:

{{firsts_summary}}

That's a practice starting to run on one set of pages instead of six browser tabs and your memory.

You were one of the first designers we asked in, and that wasn't a courtesy. What snagged for you, what felt obvious, what didn't — it's shaping what we build next. The founding cohort is small on purpose, so each voice actually moves things.

So, one ask: reply and tell me the roughest edge you hit in these six weeks. Not the tidy version — the real one. I read every reply on this address, and the rough ones are the useful ones.

This is the last of the onboarding notes. From here it's the Founding Circle letter once a month and the weekly digest — both easy to leave whenever you like. The desk is yours to keep.

**[ Back to the desk ]**

— Kody
Founder, Patina

### In-app note

"Six weeks in. The letter's in your email — and the desk is yours." → {{app_url}}/desk

---

## M1 — milestone-proposal-sent

- track: milestone | category: transactional
- from: Kody at Patina <kody@patina.cloud>
- subject: It's in their hands now
- preview: What your client sees, and when you'll hear back.
- trigger: engagement_events insert `proposal_sent` (once ever, immediate)
- variables: first_name, client_first_name
- cta: Watch it on your desk → {{app_url}}/desk

### Body

{{first_name}},

Your proposal is with {{client_first_name}} now. Here's what happens on their side.

They get a clean page — your boards, the phases, the numbers — and one button to sign. No PDF to download, no login to fumble. When they sign, you'll know within the minute.

You don't have to hover. Patina nudges them for you, gently, on a sensible schedule — so following up never falls to you, and you're never the one pestering a client.

You can watch its status any time from your desk: sent, opened, signed. That's the whole loop.

**[ Watch it on your desk ]**

— Kody

### In-app note

None — milestone track, not a spine email.

---

## M2 — milestone-proposal-signed

- track: milestone | category: transactional
- from: Kody at Patina <kody@patina.cloud>
- subject: Signed.
- preview: {{client_first_name}} said yes. Here's the handoff from paper to workshop.
- trigger: engagement_events insert `proposal_signed` (once ever, immediate)
- variables: first_name, client_first_name
- cta: Open the document → {{app_url}}/desk

### Body

{{first_name}},

{{client_first_name}} signed. That's a real yes, and it's worth a moment before the next thing.

Here's the handoff from paper to workshop, already in reach:

The deposit invoice is ready to send — a signed proposal fills it in for you. Purchase orders can go to the makers whenever you're set. And the hours you've been logging are already sitting against this client, waiting for that first invoice.

None of it is urgent tonight. But when you're ready, it's all a short step from where the signature left off.

**[ Open the document ]**

— Kody

### In-app note

None — milestone track, not a spine email.

---

## M3 — milestone-request-claimed

- track: milestone | category: transactional
- from: Kody at Patina <kody@patina.cloud>
- subject: It's yours
- preview: You claimed it. The document is already open.
- trigger: engagement_events insert `design_request_claimed` (once ever, immediate)
- variables: first_name
- cta: Open the brief → {{app_url}}/desk

### Body

{{first_name}},

You claimed the request — so it's yours now, and no one else can take it. Here's what that set in motion.

The homeowner has been told their project has a designer. The clock on the work starts from here. And a document is already open on your desk with their brief inside — the rooms, the scan and its real dimensions, their own words about what they want. Nothing to re-enter.

Your first move is the easy one: open the document and read it end to end, the way you'd listen through a first call before saying a word.

**[ Open the brief ]**

— Kody

### In-app note

None — milestone track, not a spine email.

---

## M4 — milestone-first-payment

- track: milestone | category: transactional
- from: Kody at Patina <kody@patina.cloud>
- subject: First money through the books
- preview: Paid, recorded, reconciled — and the Pledge is now in motion.
- trigger: engagement_events insert `payment_received` (once ever, immediate)
- variables: first_name
- cta: See it in Accounts → {{app_url}}/desk?sheet=accounts

### Body

{{first_name}},

A payment cleared. It's recorded against the client, reconciled in Accounts, and sitting in your receivables as paid — nothing left for you to file.

This is also the moment the Pledge stops being a line in a welcome letter: a quarter of our commission goes back to the designers who teach the system — and what Patina earned on this payment is part of that promise.

First money through the books is a quiet milestone, but it's the one the whole thing is built to reach. Well earned.

**[ See it in Accounts ]**

— Kody

### In-app note

None — milestone track, not a spine email.

---

## In-app Post notes (index)

Same-day pairing with each spine email, ≤2 lines, one deep link.

| Email | Post note | Deep link |
|-------|-----------|-----------|
| W0 | Welcome. Replay the walkthrough anytime from the Help shelf. | {{app_url}}/help |
| E2 | Your first folder starts with a name. Under a minute. | {{app_url}}/desk |
| E3 | The clipper takes two minutes to set up. Then anything you find is yours to keep. | {{app_url}}/library |
| E4 | Three shelves: yours, your studio's, the makers'. | {{app_url}}/library |
| E5 | Your first board is one blank page away. | {{app_url}}/desk |
| E6 | Requests are on your desk. Claim what fits. | {{app_url}}/desk |
| E7 | Hours logged themselves this week. Have a look. | {{app_url}}/desk?sheet=hours |
| E8 | Signed work is waiting on an invoice. Two minutes. | {{app_url}}/desk?sheet=accounts |
| E9 | Aesthete is in the Library when you have ten minutes. | {{app_url}}/library |
| E10 | Six weeks in. The letter's in your email — and the desk is yours. | {{app_url}}/desk |
