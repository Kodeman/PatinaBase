# Critique of Direction A — "Since You Were Here" · the homeowner lens

Read as H1 (Maya, 32, Grand Rapids — discovering, one room, 9:10pm), H2 (Ruth, 47, Des Moines —
activeProject, mid-procurement, 12:30pm) and H3 (Walt, 63, Madison — discovering, no designer,
7:40am), against `source/direction-a.md`, the twenty shared planks, and the panel reports
`research/2x-panel-h1.md` / `h2.md` / `h3.md`.

Direction A is the better-written of the two documents I have read and it is the one that took the
homeowner seats seriously: all three of us named a "what moved while I was gone" line, and A is the
only place it exists. Everything below is about whether the line can actually be filled, and for
whom.

---

## The three verdicts, in our own voices

### Maya — 9:10pm, discovering, one room, $6–9k for the year

**Would I open this tomorrow?** Once, to see whether the room got fuller. Not on the strength of
what A promises me tonight. A's evening scene gives me two things: `SINCE YOU WERE HERE ·
YESTERDAY / "Three new pieces for the Living Room."` and `$3,590 of your $9,000`. The first needs
new pieces to exist — the catalog is 21 rows (C29) and A names no one who adds to it before wave 4,
which it calls "not engineering." The second is a number the app cannot compute: the quiz stores a
*band* (`StyleQuizViewModel.swift:239-247` → `"5000-15000"`), and $9,000 is a figure somebody chose.
So the ritual A calls "the ritual" is two legs and neither one holds weight.

**What is honestly new on my first screen?** On most nights: nothing, and A will say so. I said this
in my own report and I meant it — "Honest beats frequent — but *nothing* beats nothing."

**Two weeks away?** I would not have gotten there. I am a guest for my first week, and a guest's
second launch is the wall (`g-38-relaunch-returning-guest.png`, F28 S0). A's composition table
promises me a since-line "from the second launch on." The second launch says `Welcome home` to
somebody it just forgot.

**$4,000?** Yes, eventually, and A is close: the buyable gate, the shipping figure, the damage
owner. What is missing is the one thing I asked for first — the app knows my room is 18 × 14 and
never tells me the table fits.

**Being "engaged"?** The 40%-filled budget track on the room screen. I asked for the figures. A bar
that fills as my money leaves is a different thing.

**My finding, unanswered:** F54 / F105 — Devon. A declines it, honestly, and I understand. But
Ruth's version of it (sharing a *decision*) needs no household at all, and A doesn't look at that.

### Ruth — 12:30pm, activeProject, three projects, one open invoice

**Would I open this tomorrow?** Yes — A earns it. All three of the things I asked for are in this
document: one honest count, a way to message Leah, and a "since you were last here" line. The
Companion holding `LEAH HARTWELL · YOUR DESIGNER` with `Message Leah` as its first row is the best
single move in either direction.

**What is honestly new?** Nothing that isn't a chore. Read the screen A drew for me: `SINCE YOU WERE
HERE · THURSDAY / "Leah sent a proposal, and your invoice came due."` then `NEXT MOVE / "Leah is
waiting on three things"`. Same three items, twice, in two tenses, both computed from
`BadgeCountService`. My question was whether I can check on my house the way I check on a package.
A tells me what I owe on a schedule. It never tells me where the dining table is, and the phases and
milestones that would say so are already being downloaded and thrown away (F76, F125).

**Two weeks away?** Better than today, genuinely. The line with dates is right.

**$4,000?** I don't buy directly — Leah does. A's order object is for orders *I* place. My deposit
line ("Dining table — deposit (50%)") still has no status anywhere (F90, F202).

**Being "engaged"?** "Leah is waiting on three things," where one of the three is a $4,250 bill.
Leah is not waiting on my money; Stripe is. Do not put a dunning notice in her mouth.

**My finding, unanswered:** F101 — my real rooms. A removes the stranger's Living Room, which is
right, and leaves my dining room and primary bedroom existing only as line items on a bill. And
F106 — in dark mode, at my usual hour, there is no Pay button in sight.

### Walt — 7:40am, discovering, no designer, skeptical of apps

**Would I open this tomorrow?** No, and A knows it. Its own §8.5: "If editorial does not publish,
Walt's 7:40am reward is 'nothing new', honestly — and that is a business commitment A cannot make
for Kody." I will take a weekly story; I said so. I will not take four consecutive mornings of
`SINCE YOU WERE HERE · SATURDAY / "Nothing new since Saturday."` — that is an app telling me it has
been counting the days I was away and has nothing for me.

**What is honestly new?** The unread dot that finally turns off. That is real and I credit it.

**Two weeks away?** Nothing punishes me, and the two silent fourteen-day decays re-anchoring to
last-seen is a piece of care nobody asked for. Good.

**$4,000?** Closer than anything else here. A gives me the measurements, the lead time, the shipping
figure, who answers the phone when it arrives scuffed, and my designer's name on the order. What it
does not give me is a photograph I can trust: A's buyable gate lists "a real photograph" as one of
six fields, and five of the six are columns while that one is a wish. Today a dining table is
illustrated with green velvet chairs (F06). I said it plainly: everything above is worthless until
the picture is true.

**Being "engaged"?** Three things. The eyebrow that dates my absence. The second permission ask,
which A keys to "a payment overdue and unread." And the widget that says `3 THINGS WAITING` on my
Lock Screen — in a document that promises, two paragraphs later, "no count of anything the person
did not do."

**My finding, unanswered:** F52 — nothing on a piece helps me decide. A declines compare and notes
by name, which is fair. But the ask on the piece is now Path C ("Ask about this piece"), and at
discovering that routes into `Get design help` — a lead form. I wanted to ask about the joinery, not
hire somebody.

---

## Blocking

*A homeowner would not return, or would not trust the purchase.*

### B1 · §1, §2, §8.5 — at guest and discovering, the since-line has no source of "new"

**Problem.** A's variable reward at the two tiers where two of the three of us live has exactly
three sources, and A owns none of them. The story: "A commits editorial to a weekly publish" in §7,
then §8.5 downgrades it to "a business commitment A cannot make for Kody. **Flagged as a dependency,
not a build.**" New catalog rows: the well is 21 products, 17 with images (C29), and no ingestion
rate, supplier or cron is named anywhere; the catalog pass is wave 4 and explicitly "not
engineering." The room's fill: A's own §2 concedes it is "the room's own fill, **which only the
person can move**." Subtract the three and the modal morning at discovering prints "Nothing new
since Saturday." A frames this as time respected. Repeated, it is an empty mailbox with a date
stamp on it.

**Evidence.** `direction-a.md` §1 (7:40am and 9:10pm scenes), §2 ("What is honestly new day to day"
— guest/discovering), §8.5; C29; F13 (S0), F46/F61/F131 (one story, three rows, permanently unread);
shots `g-12-home-discovering-top.png`, `c-31-engaged-home-top.png`. H1 verbatim: "Honest beats
frequent — but *nothing* beats nothing." H3 verbatim: "an honest 'new' once a week beats a fake
'new' every morning."

**Fix I would accept.** Two moves, both small. (1) Promote the editorial cadence from a flag to a
costed line in §9 with an owner, a weekly publish, and a floor — say twelve stories banked before
the since-line's discovering branch ships at all — and let A gate its own feature on it. Walt will
take weekly; he will not take a null four mornings running. (2) Name one "new" the app can compute
without editorial or ingestion, and put it in the §2 table: the room's fill moving is not
disqualified by the person having caused it — she moved it three days ago and has not seen it since,
which is exactly what the line is for. Failing both, say in §1 that at discovering the return is
weekly, not daily, and stop staging a 7:40am scene the data cannot fill.

### B2 · §1, §3, M2, M4 — the fill line's denominator does not exist, and A's own honesty rule forbids inventing it

**Problem.** A calls `$3,590 of your $9,000` "the ritual" for Maya, and sources the denominator from
"the quiz's real `budgetRange`." `budgetRange` is a **band string**, not a number:
`apps/mobile/Patina/Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:239-247` maps to
`"500-2000"`, `"2000-5000"`, `"5000-15000"`, `"TBD"`, and
`Features/StyleConversation/ViewModels/StyleConversationViewModel.swift:205-212` mirrors it. The top
band's own label is `"$5K+"`. Maya's $6–9k cannot be stored and $9,000 can never come back out.
Whatever A prints there — the max, the midpoint, a rounding — is a figure Patina chose, which A's
§10 forbids ("**No invented figure anywhere.** Where a column is empty, the line does not print") and
which A's own M2 screen sheet forbids in the same sentence it commits the error: "**the person's own
answer, never a figure we chose**."

**Evidence.** File:lines above; `direction-a.md` §1 (9:10pm), §3 investment table, M2 layout + data
rows, M4 budget band (`YOUR BUDGET · FROM YOUR QUIZ ANSWER`), §7 (F158 answered "the room's budget
band is a real number the person chose"), §10.

**Fix I would accept.** Either render the band as a band — `$3,590 spent · your range is $5K–$15K`,
no percentage, no track — or make it a real number by asking once, on the room, where the question
belongs: `What are you spending on this room?`, editable, stored on the room, blank until answered
and the money half of the line omitted while it is blank (A already specifies that omission
behaviour; it just needs a field to omit). Do not derive a point figure from a band.

### B3 · §1, §2, §7 — at activeProject, "since you were here" is the chore list in the past tense

**Problem.** A's thesis is "somebody else did something about your house while you were asleep." At
activeProject both the since-line and the Next Move draw from the same `BadgeCountService` counts,
so Ruth's first screen states the same three items twice — `"Leah sent a proposal, and your invoice
came due."` above `"Leah is waiting on three things" / "A rug colour since Aug 22 · $4,250 due Sep 1
· a proposal by Sep 8"`. Every one of the three is something she owes. Walt named the failure mode
for her: "Three facts, in order, that the *house* and the *person* did while I was asleep — not
three chores I owe."

Ruth's stated stake is "not knowing an install date moved." A surfaces no phase, no milestone, no
install date and no delivery. The cheapest possible answer is already on the wire: the project
screen fetches phases and milestones and discards them (F76, F125), and SP-05 explicitly hands
rendering them to the directions — "rendering what it already has is direction work." A does not
take it. Nor does A answer "where is the table Leah ordered": A's order object is `direct_orders`,
client-placed only, so §7's row "an order object in the client app" reads as an answer to F19/F66
and covers only orders Ruth places herself. Her deposit line items carry no status anywhere (F90,
F202), and Path B rides `fulfillment-notify`, which fires only when an operator presses send (C26).

**Evidence.** `direction-a.md` §1 (12:30pm), §2 (activeProject row), §7 (F30/F80/F91/F58/F41 row;
F19/F66/F154 row); F76, F125, F90, F202, F19, F66; SP-05; shots `c-03-home-top-activeproject.png`,
`c-06b-studio-awaiting-you.png`, `c-13-invoice-detail.png`.

**Fix I would accept.** (1) Build the since-line from a union of attention counts **and** at least
one non-obligation event, ordered with the non-obligation first — a phase advance qualifies and
costs nothing, because the data is already on the device. (2) Render the phases the project screen
already downloads, and let a phase change write a since-line. (3) In §5, state in one sentence that
a designer-sourced piece has no client-visible status under A and which wave gets it, so §7 stops
reading as an answer to "where is it."

### B4 · §2 — the guest's second launch is the gate, so the guest row of the composition table cannot run

**Problem.** §2 gives guest a since-line "absent on first launch; **from the second launch on**." A
guest's second launch is the auth wall: the session, the quiz and the taste portrait are discarded
on relaunch and the screen that greets her reads `Welcome home` (F28 S0, F36 S0, F113 S1; shot
`g-38-relaunch-returning-guest.png`). SP-06 cites F28 but repairs *ownership* — scoping the local
store and adding a claim sheet **at the first sign-in** — which a returning guest never reaches.
So A's central mechanic never runs at the tier where Maya spends her first week, and the table
promises her something the app forgets.

**Evidence.** `direction-a.md` §2 (row 1b, guest column); SP-06 ("What changes"); F28, F36, F113;
`g-38-relaunch-returning-guest.png`; H1 T11 verbatim: "The screen says 'welcome home' to somebody it
just forgot."

**Fix I would accept.** Either add guest-session durability to the first slice — or, if it belongs
to the floor, name it as a plank the floor is missing and put it to Kody as such — or change the
guest row to "absent: a guest is returned to the gate," and say in §1 that A's day begins at
sign-in. What cannot stand is the row as written.

---

## Major

### J1 · §1, §9, M1, M7 — the one door A stakes everything on lands on Profile, not the Studio

There is no `.studio` case in `AppRoute` (`App/Coordinators/Coordinator.swift:51-144`: `profile`,
`projectList`, `decisionList`, `proposalList`, `invoiceList`, `budget`, `documentList` — no studio).
A's Next Move routes ".profile → StudioHub", which means Profile: the avatar, `1 ROOMS / 1 SAVED /
63% MATCH` (F158, a percentage with no rationale), then a scroll down to `STUDIO`. Walt walked that
route: "two levels down, past my avatar and three statistics." A's §8.1 concedes the tab bar is the
one place Direction B beats it; a door that deposits Ruth on a stats page spends the defence A has
left. Worse, the Companion row A keeps in M7, `Your Studio`, is the row that lands on a bare
projects list today — F50, "'Your studio' promises three things, delivers one," three seats
including Ruth, carried by no plank and no direction.
**Fix:** add `AppRoute.studio` in the first slice and point both the Next Move and the Companion row
at it. It is one enum case and one destination arm, and it repairs F50 for free. Shots:
`c-04b-your-studio-hub.png`, `c-26-profile.png`.

### J2 · §4 vs M8 — two different push promises, and the prose one promises a send wave 1 cannot make

§4: "a decision, a proposal, or an invoice — **and when a piece you bought ships**. Nothing else."
M8 prints SP-08's sentence without the shipping clause. §8.7: "No shipping push for a direct order
in wave 1 ... F198 stands until then." A's own risk register names the consequence: "If wave 1 asks
before the money rail can send, the promise is broken the first week."
**Fix:** one sentence, the M8 one, in both places. Shipping joins the promise in the release that
can send it.

### J3 · §4 — the second permission ask is keyed to money owed

"we ask once more, months later, only on a *payment overdue and unread*." A re-ask triggered by a
debt is the best-mannered available version of the thing Walt says he deletes apps over — "a red
number invented to make me tap" — and it sits in a document whose §10 forbids fake urgency.
**Fix:** one ask, ever. A declined grant costs nothing, because A has already established email as
the durable rail and the in-app feed as the floor.

### J4 · §4 — the widget counts what he has not done, which A's own rule forbids

Widget copy: `3 THINGS WAITING` / `Rug colour · overdue Aug 22`. Four lines later: "No badge number
invented, **no count of anything the person did not do**." Both cannot hold. The Lock Screen is the
highest-exposure, lowest-context surface A proposes, and this is the copy that goes there.
**Fix:** the widget carries what moved, not what is owed — `LEAH SENT A PROPOSAL` / `Tue`. Keep
`NOTHING NEEDS YOU` as the calm state. If the count survives, delete the honesty claim; better to
keep the claim.

### J5 · §1, M1 — "Leah is waiting on three things" puts a bill in a person's mouth

One of the three is `$4,250 due Sep 1`. Leah is not waiting on Ruth's money; Patina is, through
Stripe. Attributing collection to the named designer is the fastest available way to make Ruth
resent either the app or the person she is three months into a relationship with — and Ruth's
presence here rests entirely on that relationship (`c-13-invoice-detail.png` is the one place Leah
appears today, F09).
**Fix:** name the designer only on what she raised — "Leah is waiting on two things · your invoice is
due Sep 1" — or make the headline neutral ("Three things are waiting") and attribute per item in the
detail line.

### J6 · §5 — "a real photograph" is not a checkable gate

A's buyable gate is six fields, and the Buy control "does not draw unless all six are non-null."
Five are columns. The sixth is a judgement: today `image_url` is non-null on 17 of 21 rows and the
pictures are wrong — a dining table shown with green velvet chairs, a coffee table shown as a
ladder-back chair standing in a lawn, a terracotta planter set shown as a mint-green plastic pot
(F06, six seats; `g-15-browse-pieces-grid.png`). Both Walt and Maya put this above every other buy
requirement. As written, the gate admits every one of those rows.
**Fix:** make the sixth gate a column — `products.photo_verified_at`, set by a human — added in the
same wave-2 migration at no extra cost and required non-null for Buy to draw. Then "sell six
honestly rather than twenty-one with the dimensions missing" is a true sentence.

### J7 · §5, M3, M5a — the app knows the room and never says whether it fits

Maya's first buy requirement, verbatim: "Tell me it will fit. Width, depth, height, and — since the
app knows my room — 'this fits your 18 × 14 living room' ... it's the one thing an app that has
scanned my room should hand me." M3 prints `38″ W × 20″ D × 30″ H`. The room holds `18 × 14 ft`.
Both numbers are on the device and nothing joins them, not on the piece and not on the order sheet.
**Fix:** one line under the dimensions when a room exists and both values are non-null — `38″ wide ·
your Living Room is 18 × 14 ft` — repeated on the order sheet above `Continue to payment`. No
backend, no new data, and it is the cheapest trust win either direction has available.

### J8 · §7 — F51 and F101 are listed as answered and a different thing is answered

§7 files F99, F101, F51 under "an activeProject client with no room is never pitched a scan as her
next move." F51 is "A typed form calls itself a scan": the Next Move promises `A short scan`, the
fallback opens a typed form, the summary offers `Rescan` and `0 ITEMS DETECTED` and asks her to
press `This Looks Right`, and Your Spaces later badges it `JUST SCANNED` above `MANUAL ENTRY`
(`g-25-manual-room-entry-metric.png`, `g-27-room-with-recommendations.png`, `c-23-your-spaces.png`).
That is Maya's and Walt's finding, at discovering, on a flow A leaves untouched apart from omitting
one chip in M2. F101 is the same shape: removing the stranger's room does not give Ruth her dining
room.
**Fix:** take the vocabulary repair (six strings) into A's slice, or move F51 and F101 into §8's
declines where a reader can see them. A table row that claims a finding it does not answer is the
one kind of dishonesty this document otherwise never commits.

### J9 · §2 — no activeProject Next Move when the queue is empty

§2 gives activeProject "the attention queue, named by the designer" with no fallback branch, while
the Today contract requires exactly one next move. On the day Ruth has nothing waiting — which is
most days between milestones — her home is a header, a null since-line, no Next Move, a Maine
woodworker, and no Active Room (she has none). §8.1 concedes the routing consequence of this and not
the composition one. F58 is listed as answered in §7 and this is precisely what F58 is about.
**Fix:** specify the zero-state branch, and make it the one thing that is about her house rather
than her chores — the current phase, the next milestone date, the piece that shipped.

### J10 · §9 — the verification gate names the screens where the failures are not

A's gate: "a Simulator pass at Dynamic Type XXL and in dark mode on **the home, the Studio and the
Companion panel**." The observed dark and XXL failures are on the money screens: no Pay button
visible at the natural scroll stop in dark mode (F106 — Ruth: "wondering, at night, whether the
missing Pay button ... means the invoice already got paid, or the app just broke";
`d-08-invoice-detail.png`), the Dynamic Island covering a proposal title at XXL (F107), the orb
clipping `Sign proposal` (F49, F81).
**Fix:** add invoice detail, proposal detail, decision detail and the new order sheet to the named
gate.

### J11 · §2, §3 — the taste portrait A prints money against has two names and two questionnaires

A's fill line, the room's budget band and the feed's scoring all read the style profile. Two quizzes
exist and disagree: the Companion quiz returns `Warm Modern`, the post-room quiz calls the same
result `Modern Warmth`, and four of five questions are asked twice with different options (F96,
F140). Maya: "If the app can't keep one name for my taste, I'm not trusting its 46%." Neither a
plank nor either direction picks it up.
**Fix:** name it as a §9 dependency the way A names the editorial cadence, or take the one-word
repair — one result vocabulary — into the slice. A is about to print a budget against that row.

---

## Minor

### n1 · §1 — the eyebrow dates his absence, not the news
`SINCE YOU WERE HERE · SATURDAY` puts the app's memory of Walt at the top of his first screen, and
on the modal morning the block reads `SINCE YOU WERE HERE · SATURDAY / "Nothing new since
Saturday."` — his absence named twice, with nothing to show for it. His own version dates the
events: "Leah sent a proposal on the 3rd. Your invoice came due on the 1st."
**Fix:** drop the eyebrow's reference to him; put the dates on the facts. When there is nothing,
print nothing.

### n2 · §2 vs M1 — two empty behaviours for one line
§2 says the line is "absent on first launch"; M1's states say the empty case is `"Nothing new since
Thursday."` when counts are unchanged. Which one runs on the day nothing moved?
**Fix:** pick one, say it once. (Absent is the quieter one, and consistent with n1.)

### n3 · M4 — the budget track is a bar that fills as her money leaves
M4 draws "a 4pt pearl track with a clay fill at 40%." Maya asked for the figures ("$2,400 of our
$9,000"), not a meter. A meter is the one place A's ritual leans toward the mechanics §10 rejects.
**Fix:** keep the two figures, drop the track.

### n4 · §3 — last-seen is per device; the shared-device case is unnamed
A names the second-phone case honestly. It does not name the household case: Maya's own report
mentions "the iPad we share," and with SP-20 restoring Sign Out two people will alternate on one
device, where a since-line built from one person's last visit is wrong for the other.
**Fix:** one sentence — on a device that has seen a sign-out, last-seen resets with the account.

### n5 · §4 — "every link in those mails lands in the app" is more than SP-03 buys
SP-03 adds associated domains plus one client-facing **piece** route. Invoice, proposal and decision
mails point at portal routes with no in-app destination, and `patina://` reaches only auth, room and
piece (F199, which §7 lists as answered by the push call site — that covers the push half, not the
link half).
**Fix:** name the three additional deep-link cases and the routes they need, or narrow the claim to
the piece link.

### n6 · M3 — the maker-story card claims a join nobody has named
"Maker-story card, tinted `earth`, linking to the story when one features this piece." Three stories,
21 products, and no column linking one to the other appears anywhere in the grounding. Walt's fourth
buy reason is exactly this: "Put that essay on the product page, and put the product on the essay,
and the price stops being a comparison and starts being a reason."
**Fix:** name the join as a backend delta (`editorial_stories.product_ids`, or `products.story_id`),
or the card does not draw. Note that the provenance layer under it is empty today — 0 of 104 vendors
carry `made_in` or `brand_story` (F146) — so M3's `NORDIC ATELIER · AARHUS, DENMARK` is wave-4 data
drawn as wave-2 UI.

### n7 · §7 — F161 stands unlisted on the screen A routes Ruth toward
`Birch Hollow / Completed / $185,000` sorts above two in-progress projects on the list at the end of
A's activeProject path. Cheap, and it is the first thing she reads there.
**Fix:** sort active first.

### n8 · §3 — a Saved row still says nothing about when or for which room
A's investment table has Saved showing on return via "the room's fill line, the room's item list,
the Saved door," while the row itself reads `ROOM & BOARD / Heirloom Oak Dining Table / $4200`
(F197, F203; `g-22b-saved-all-items.png`). Maya's ritual is a room getting fuller over weeks; a
saved-on date is the smallest possible evidence that time passed.
**Fix:** date and room on the row. SP-14 is already open in that file.

### n9 · §5 — Path C at discovering answers a question with a lead form
"Ask about this piece" at discovering "opens `Get design help` with the piece attached." Walt wanted
to ask about the joinery (F52, declined in §8.4 — fine); what he gets instead is an intake form for
hiring somebody, which is the exact move that makes him close the app. If the honest answer is "we
have nobody to answer that yet," say that on the button rather than converting a question into a
lead.
**Fix:** at discovering, either the control does not draw or it says what it is.

---

## What is genuinely good — the author must keep it

1. **The since-line itself, and the truthful null.** All three of us asked for this independently and
   in almost the same words (H1: "one thing that moved without me, on the first screen, that is
   true"; H2: "a 'since you were last here' line that's actually true"; H3: "one line, dated, above
   everything"). It is the correct idea. Everything blocking above is about filling it, not about
   whether to have it.
2. **The Next Move carrying the whole waiting queue, with dates.** `"A rug colour since Aug 22 ·
   $4,250 due Sep 1 · a proposal by Sep 8"` answers the single loudest complaint in Walt's walk —
   "the urgency is printed on the page you leave and dropped on the page you act" — and Ruth's first
   of three asks. One card, one route, dates visible: correct.
3. **The designer in the Companion.** The collapsed hint reading `LEAH HARTWELL · YOUR DESIGNER`, the
   panel headed by her portrait and credential line, and `Message Leah` as the first row is the best
   move in either document. Today she is "named exactly once in the entire product — on the invoice"
   (F09, `c-13-invoice-detail.png`). This fixes it in the one place that was designed to hold a
   relationship and holds none.
4. **Re-anchoring the two silent fourteen-day decays to last-seen.** Nobody asked for this. It is the
   quiet correct instinct — absence must not delete the card that explains her designer — and it is
   half a day of work.
5. **§10, written out by name.** No streaks, no badges, no "you haven't visited in 3 days," no
   countdown on a proposal's expiry, no "4 others saved this," no loss framing on a room. Walt's one
   refusal in his own report is answered line for line. Put §10 in the deck verbatim.
6. **The buyable gate.** "Sell six honestly rather than twenty-one with the dimensions missing" is
   the most Patina sentence in either document, and it is the answer to Walt's chain-of-custody
   demand. (J6 is about making the sixth field checkable, not about weakening the gate.)
7. **Attribution decided before the button ships.** Walt: "the backend order table has no column for
   her at all, which tells me nobody has decided that question yet. **Decide it before you ship the
   button.**" A decides it, snapshots it at create time, and prints `Credited to Leah Hartwell.`
   where the client can read it. Keep the sequencing argument too — "free today ... after the Buy
   button ships, the same change means reconciling money that already moved."
8. **The damage line on the order sheet.** "If it arrives damaged, Patina handles the claim with
   Nordic Atelier — one number, in your receipt." That is the sentence that decides a $4,000
   purchase, and it is written the way a person talks.
9. **The order-placed screen refusing a fake tracker.** "Nordic Atelier starts it this week. We'll
   email you when it ships." — "**not** a fake tracker, because `fulfillment_status` lands in wave 2."
   That restraint is the whole brand.
10. **Naming the C2-vs-C23 conflict out loud, with "Your call."** Two small leans, both stated, both
    argued from the contract's own text. That is how a direction should handle a canon it cannot
    amend.
11. **The permission moment.** Asked at the first real event, behind one screen of copy that names
    exactly what will be sent, with the decline path carried by email and the feed. Walt would have
    said yes to that screen. (J2 and J3 are about the promise's wording and the second ask, not the
    moment.)
12. **Declining AR rather than restoring it.** `usdz_url` is null on every row; A takes the
    affordances down with SP-18 and does not put them back. Subtracting a feature the app cannot
    perform is the right call and an unpopular one.
