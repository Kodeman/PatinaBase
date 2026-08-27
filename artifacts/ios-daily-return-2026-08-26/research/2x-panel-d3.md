# Panel D3 — Tom, 51, kitchen/bath + furnishings, Milwaukee (Sonnet)

Procurement-heavy. Six-figure FF&E budgets. Sells product at trade margin. Been burned once
already by a client who bought the "same" piece direct off a maker's site and called me when it
arrived damaged — I ate the fallout on a job I didn't even source. My question walking in: *if my
client buys a $3,200 sideboard in this app, who gets paid, who's responsible when it arrives
damaged, and does it show up on my FF&E schedule?* I run The Document every day. I'm reading this
as the other half of my own tool.

Tasks run: T3, T6, T7, T8, T14. Walk accounts: guest lane pre-quiz browse + `client@patina.dev`
(activeProject, three projects, `Aspen Loft Refresh` mid-procurement, INV-2026-0142 $4,250 open).

---

## T3 — "Find a sofa for our living room."

**First glance:** "Browse pieces / 10 pieces curated for your space." The two-column grid is not a
grid — the left card sits with its edge sliced off-screen, its copy reading "M & BOARD" / "rloom
Oak" / "ing Table" / ",200" where the maker, name, and price should be whole. The right card,
"Live-Edge Coffee Table" by Lee Industries, $2,100, is a photograph of an old wooden ladder-back
chair sitting in grass — not a coffee table. A third card reads "UNKNOWN MAKER."

**Where I'd tap:** The Lee Industries card, because if a client is about to spend $2,100 on my
recommendation I want to see what they'll see on the product page before I let them near it.

**Where I'd hesitate:** Before I even reach a product page — the grid itself. I sell provenance.
"Its style tags connect to your Warm Modern portrait" is exactly the kind of soft-sell copy I'd
want working *for* me, and it's sitting under a photo that doesn't match the piece and a maker tag
that's half off the left edge of the phone.

**Where I'd leave:** The tap. Every single product — I tried three — returns "Couldn't load
product / Let's try that again," and retrying does nothing. There is no back button, no chrome,
nothing but the retry link. The only way out is force-quitting the app.

**Would I come back tomorrow for this?** No. I would not point a client at a browse surface I
can't myself open a single item from.

**Obviousness: 1** — the grid is findable via the Companion, but nothing past it opens.

---

## T6 — "Is this the one? Help me decide."

**First glance:** With the piece detail dead, the only decision surface I can actually reach is the
browse card's ⋯ menu: **Save · Share · Not for me · View details.** Separately, my client has two
open Decisions on the Aspen Loft job — I open one: "Rug color - Natural vs Sand."

**Where I'd tap:** Share, to see what a client sends a spouse for a second opinion on a piece.

**Where I'd hesitate:** The share sheet's title card reads **"Patina Designer Portal —
app.patina.cloud."** My client, sharing a chair from *their* app, hands their spouse a link
branded to a tool with my competitors' name on it, not theirs, not mine. And there's no "ask my
designer about this" anywhere on the piece screen itself — the only route to me from a product is
two taps into the Companion menu, and only if you already know the orb opens a menu. On the Rug
color decision: two options, "Natural" and "Sand," both **$850**, both with **no image at all** —
a color choice presented with no color — and a single black "Choose this" per option with no
confirmation step, no "are you sure," nothing.

**Where I'd leave:** I don't tap "Choose this" — an $850 irreversible pick on one look at two
identical black buttons isn't something I'd let a client do without calling me first anyway, and
that's the point: nothing on this screen gives them a reason to feel confident doing it alone.

**Would I come back tomorrow for this?** No — there's no compare, no notes field even though the
data model has one waiting, and the one decision aid a $2,000+ purchase actually needs — ask a
human before you commit — isn't on the screen where you're deciding.

**Obviousness: 2** — the ⋯ menu is easy to find; nothing inside it is built for a real decision.

---

## T7 — "Buy it."

**First glance:** There's nothing to find. No cart, no "Buy," no "Request a quote," no vendor
link. The piece screen's only acts are "Add to Room" and, once tapped, "Saved ✓." That's honest —
I don't want a "Buy" button competing with me either. The one money act that *does* exist in the
app is mine: my own invoice, INV-2026-0142, $4,250, sitting open on the Aspen Loft job.

**Where I'd tap:** "Pay $4,250.00" on my client's invoice — the deposit I raised in the portal for
the dining table and the primary-bedroom nightstands. The line items are itemized by piece with
deposit percentages ("Dining table — deposit (50%) — $2,650.00"), which is exactly the kind of
detail I'd want a client to see before they hand over money on my say-so.

**Where I'd hesitate:** Two places. First, the pay button: the tap returns "Unable to start
payment. Please try again." as a single line of red text shoved in below the button — the button
itself stays fully enabled with no spinner, no retry control, no way to reach a human about a
$4,250 payment that didn't start. If my client hits that, I'm the one who gets the call, not
Patina. Second, and this is the one that actually worries me: the backend already has a complete
"buy now" rail — `direct_orders`, a checkout session type, a webhook settle branch, receipt
emails, all wired — and it has **no `designer_id`, no `project_id`, no `commission_rate` column at
all.** It's not on iOS today. But it's fully built on the server, and the day someone flips it on
without answering the attribution question first, a client can buy the "same" sideboard direct
through Patina, off my FF&E schedule entirely, and the first I'll hear about it is the damage call.

**Where I'd leave:** I wouldn't — my invoice is the one thing here that's mine, and it works (when
the local stack isn't down). But I'm leaving this task with the exact fear I walked in with,
confirmed in the schema.

**Would I come back tomorrow for this?** For the invoice, yes — it's the rail I already trust,
built from The Document. For anything else on this screen, no.

**Obviousness:** n/a for "buy" — there is nothing to find, which today is the correct answer.

---

## T8 — "I've ordered / my designer ordered — where is it?"

**First glance:** Today shows "Review a project decision / 2 decisions need your eye," an
editorial story, and an "Active Room" card. Nothing about the $4,250 invoice due Sep 1. Nothing
about the four proposals. Nothing with my name — or Leah's, the designer on this account — on it
at all.

**Where I'd tap:** The monogram avatar, top-right, unlabeled, then scroll to the Studio hub.

**Where I'd hesitate:** Three places on one screen. The Studio header says "4 things need your
eye," directly above a section titled "Awaiting you **3**," directly above a footer reading "4
THINGS NEED YOUR EYE" — three counts, two numbers, for one inbox. The project detail underneath
"Aspen Loft Refresh" is three stats plus an Invoices row plus a line I did not expect a client to
see: **"Set up phases, payments, and FF&E in the portal →."** That's an instruction I wrote for
myself, in my language, handed to my client, and it isn't even a working button. And the deadlines
that matter — "Due Sep 1," "Expires Sep 8," "Overdue · Aug 22" — are all printed on the list
screens and all gone by the time you reach the screen where you'd act on them.

**Where I'd leave:** The Budget screen. It's headed "Your budget — ACROSS YOUR PROJECTS" and shows
exactly one project's number: $4,250. My client has three projects on this account totaling
$725,000. If a client believes "across your projects" and thinks $4,250 is the whole picture, the
next call I get is "wait, what about the other two jobs?"

**Would I come back tomorrow for this?** No, not to check on my client's account through their
own screen — nothing here would tell me anything changed, and Notifications says "Nothing yet"
while two decisions sit overdue and an invoice sits unpaid. If I want to know status, I'm still
calling or checking The Document, same as today.

**Obviousness: 2** — the path exists and is reachable, but nothing a client sees on open tells
them anything is waiting; they'd have to already know to go dig for it.

---

## T14 — "My client just installed this. What do they see of me, and what do I want them doing
in here between our meetings? Would I send them here to buy?"

Walking it fully as Leah Hartwell's client would see it.

**Where I appear, full stop:** Once. "Aspen Loft Refresh · from Leah Hartwell," in small type
under the header on the invoice detail screen — the only screen out of the whole app that names
the designer. No photo, no studio name, no bio, no way to tap through to a contact card. Home
doesn't name me. The project screen doesn't name me. The proposal I wrote doesn't name me. If my
client forgets who their designer is between visits, this app will not remind them.

**Where the app leaks my own back-office language at my client:** The project detail's "CLIENT
VIEW / Milestone" stat is a raw internal column name shown as if it were content, and directly
under it, "Set up phases, payments, and FF&E in the portal →" — an instruction written for a
designer's workflow, rendered to the homeowner it's about, and it doesn't even do anything when
tapped. I write my FF&E schedule for myself, not for my client to read half of it as a dead link.

**Where the app puts words in my client's mouth that aren't true:** The Proposals list headers a
$100,000.00 document **"SIGNED (1)."** It was accepted, not signed — the seed has zero signed
proposals, and two screens away the Studio hub's own "Money & documents" block correctly says "1
accepted." Two screens, same document, two different legal words. I will not have my name on a
six-figure scope document that the client-facing app itself can't describe consistently — that's
not a UX nit, that's the kind of thing that ends up in an email with a lawyer cc'd.

**Where the app gets in the way of the one act I actually need my client to do:** The proposal
detail's own Companion bubble sits directly on top of "Sign proposal," clipping the label. That
button is how a job starts. And when they do reach the sign sheet, it restates **nothing** — no
amount, no line items, no date, no terms — just a name field. The $18,500 worth of terms
("Deposits are non-refundable once procurement begins. Custom items are final sale.") live one
screen back, and the "Selections" list they scrolled past to get there shows five line items —
"Walnut sectional sofa," "Hand-knotted wool rug," "Walnut coffee table" — each illustrated with
the Patina wordmark instead of a photo, and no price against any of them. I sell photography and
provenance at trade margin; a proposal that shows my client five unpriced logo-placeholders isn't
selling anything for me.

**Where the app is silent when it should say something:** "Conversation / 0 / No project
conversations yet." is the entire messaging surface — no compose, no thread, no way for a client
to ask me a question from inside the app between meetings. That's not a defect I mind much — it
means every real question still comes to my phone, which is where I already handle it — but it
means the app isn't taking a single email off my plate either. And I have no record inside the app
that a signature actually landed: `sign_proposal` is wired to confirm the scope, but the code's
own carry-forward note says it does not send a confirmation email on sign — if that's still true,
the only proof I have that my client signed is checking The Document myself.

**"Would I send them here to buy?"** There's nothing to buy today, and today that protects me.
What doesn't protect me is what's sitting on the backend already built and unattributed:
`direct_orders` — full checkout, full webhook settle, receipt emails — with no column anywhere for
my client ID, my project, or my commission (`00276_direct_orders.sql`, confirmed against
`00301_marketplace_vitals.sql`). It's one iOS PR from being live. If it ships before someone
answers "whose sale is this," the exact scenario I opened with — client buys direct, piece
arrives damaged, I get the call, I get none of the margin — becomes something this app can do to
me instead of a maker's own website doing it to me.

---

## What I want my client doing here

Sign a proposal, pay a deposit, answer a decision, and see exactly what they're paying for —
itemized, dated, attached to my name. The invoice's line-item breakdown (deposit percentage per
piece) is the one screen in this whole walk that's actually good, and it's good because it's
honest about what it is: my work, priced, dated, attributed to me. I want more of that, not less —
and I want it not undersold by a proposal three taps away that shows the same client five
unpriced logo tiles for the identical scope of work.

## What would make me stop sending clients here

Two things, in order. First, the "SIGNED" mislabel on an unsigned $100,000 document — I will not
send a client to an app that can't accurately describe the legal status of what they signed with
me. That's fixable fast and it needs to be fixed before I'd trust the surface with a real job.
Second, and this is the one I'd actually walk away over: if a "buy now" ships on the
already-built `direct_orders` rail before designer attribution exists on that table. The day my
client can pay Patina directly for a piece I sourced, with no commission, no project link, and no
way for me to even know it happened until something arrives broken — that's the day this app
stops being the other half of my tool and starts being the thing I was afraid of before I ever
opened it.

---

## Findings

| id | title | severity | confidence | shots |
|---|---|---|---|---|
| D3-01 | Browse grid is broken, cards off-screen | S1 | 0.95 | g-15-browse-pieces-grid.png, g-16-filter-chip-seating.png, d-03-browse-pieces.png, x-03-browse-pieces.png |
| D3-02 | Product photo doesn't match the piece | S1 | 0.9 | g-15-browse-pieces-grid.png |
| D3-03 | Every piece detail hard-fails on load | S0 | 0.95 | g-17-piece-detail-top.png, c-25-piece-detail-client.png, d-04-piece-detail.png, x-04-piece-detail.png |
| D3-04 | No dimensions, lead time, shipping, or liability fields | S1 | 0.8 | — |
| D3-05 | Share sheet brands the piece to the designer portal | S1 | 0.9 | g-19-share-sheet.png |
| D3-06 | No "ask my designer" control on the piece itself | S1 | 0.8 | g-20-card-more-menu.png |
| D3-07 | No compare feature anywhere in the app | S2 | 0.75 | — |
| D3-08 | Notes field exists in data, never exposed in UI | S2 | 0.75 | — |
| D3-09 | Decision detail: two $850 options, no image, no confirm | S1 | 0.9 | c-18-decision-detail.png |
| D3-10 | Buy-now backend built with zero designer attribution | S0 | 0.9 | — |
| D3-11 | Pay-failure UX has no retry, no way to reach a human | S1 | 0.85 | c-14-pay-handoff.png |
| D3-12 | Sign sheet restates no amount, terms, or line items | S1 | 0.9 | c-11c-sign-sheet.png |
| D3-13 | No fulfillment/shipping status on any line item | S1 | 0.75 | c-13b-invoice-detail-scrolled.png |
| D3-14 | Today never surfaces a proposal or invoice | S1 | 0.85 | c-03-home-top-activeproject.png |
| D3-15 | Money rail buried 3–4 acts behind an unlabeled monogram | S1 | 0.9 | c-04b-your-studio-hub.png, c-06b-studio-awaiting-you.png |
| D3-16 | Three different "things waiting" counts, one screen | S2 | 0.9 | c-06b-studio-awaiting-you.png |
| D3-17 | Deadlines shown on the list, dropped on the detail | S1 | 0.85 | c-12-invoices-list.png, c-13-invoice-detail.png, c-09-proposals-list.png, c-10-proposal-detail-top.png, c-06b-studio-awaiting-you.png, c-17-decisions-list.png |
| D3-18 | Notifications empty while money and decisions are overdue | S1 | 0.9 | c-21-notifications-signed-in.png |
| D3-19 | Budget screen shows one of three projects as "the budget" | S1 | 0.9 | c-15-budget.png |
| D3-20 | Proposals list mislabels an accepted proposal "SIGNED" | S0 | 0.9 | c-09-proposals-list.png, c-19-messages-empty.png |
| D3-21 | Designer named exactly once, no photo or contact | S1 | 0.9 | c-13b-invoice-detail-scrolled.png |
| D3-22 | Client screen shows a designer-only FF&E instruction | S1 | 0.9 | c-08-project-detail.png |
| D3-23 | Raw internal column "CLIENT VIEW / Milestone" shown to client | S2 | 0.85 | c-08-project-detail.png |
| D3-24 | Companion bubble clips the "Sign proposal" button | S2 | 0.85 | c-11-proposal-detail-scrolled.png, c-11b-proposal-sign-act.png |
| D3-25 | Messaging is a dead stub — no compose, no thread | S1 | 0.85 | c-19-messages-empty.png |
| D3-26 | Proposal selections show logo placeholders, no per-item price | S1 | 0.85 | c-11c-sign-sheet.png, c-11-proposal-detail-scrolled.png |
| D3-27 | sign_proposal sends no confirmation email | S2 | 0.6 | — |
