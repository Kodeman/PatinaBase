# Critique of Direction B — "The Record" · homeowner lens

**Critic seat:** H1 (Maya, 32, Grand Rapids) · H2 (Ruth, 47, Des Moines) · H3 (Walt, 63, Madison),
read in turn from `research/2x-panel-h1.md`, `-h2.md`, `-h3.md`.
**Target:** `source/direction-b.md` (assumes `source/shared-planks.md` ships).
**Test applied:** would I open this tomorrow at my hour? after two weeks away? what on the first
screen is honestly new? would I buy a $4,000 piece here, and what is missing before I would? which
mechanic feels like being "engaged" — the thing that makes Walt leave?

Severity: **blocking** = a homeowner would not return, or would not trust the purchase.
**major** = the direction's own promise is not delivered for one of the three seats.
**minor** = it costs a beat of trust or a beat of time.

Findings are cited in their surviving form (F18, F21, F33, F35, F39, F57, F75, F82, F88, F94, F116,
F149, F166, F181 were refuted as written; F04=F31=F32, F16=F34, F22=F26, F30=F37 merged).

---

## Blocking

### BL-1 · Maya has no record. The direction's whole mechanism is designer-gated.
**Hits:** §1 (the day) · §2 (home composition, discovering + guest) · §7 (F13/F16 claimed answered) ·
M1 screen sheet, "Tier" row.

**The problem.** The thesis is "the app opens on a dated record of what moved while you were away."
The M1 screen sheet then says: *"guest/discovering: no record block, no designer seat."* At the tier
where returning is hardest to earn — the acquisition tier, the one Maya lives in and stays in, because
"designer sounds like money we don't have" — the record does not mount. What she gets at 9:10pm is
her own room (state she made), **NEW THIS WEEK** (renders only when a row's `published_at` is inside
seven days, otherwise absent), and the story. And B's own honesty rule closes the last door:
*"No activity row for the reader's own actions. If you did it, it is state, not news."* So on Maya's
home, the only thing that can change is the one thing B forbids from changing anything.

Direction B answers F13 ("only the date changes") and F16=F34 ("two weeks reads like two minutes")
for Ruth and Walt and reproduces both for Maya.

**Evidence.** H1 T2: *"the honest answer to 'why open it today' is: because the date changed"*;
H1 T11: *"I wouldn't have opened it. Two weeks is exactly how long it takes an app with no reason to
open to fall off my home screen."* F13 S0 · F16(=F34) S0 · F131 S1 (the editorial well holds three
stories) · C29 (21 products, 3 stories locally; no prod counts and no usage data were available).
`direction-b.md` §2 "**discovering** — same four blocks, plus **Saved** once the count is above zero";
M1 sheet "Tier".

**Fix I would accept.** Mount the record at every tier, with that tier's own true rows, and say out
loud in §2 what they are:
- the piece's own world — a saved piece's price moved, came back, or its maker published (all real
  timestamps on rows the app already reads);
- the room, dated as state rather than news — `Living Room · you added the Brass Arc Floor Lamp on
  Tuesday` is already in B's M2 as a Saved line; it belongs on the record with a date;
- the story, on a named cadence (see MJ-7).

And name a supply floor for **NEW THIS WEEK**: if the catalogue cannot publish weekly, §2 must say
so, and the direction must stop calling itself the record at the tier where there is none.

---

### BL-2 · Ruth's actual orders are excluded from the order screen.
**Hits:** §5 (path table, Path B) · M8 "Studio → Ordered" · §7 (F19/F66/F90/F198 claimed answered).

**The problem.** M8 is titled *"where is it"* and answers T8 — for `direct_orders` only. The screen
sheet says the rest out loud: *"Path B pieces appear on the designer's invoice rail instead, not
here."* Ruth's entire question is *"can I check on my house the way I check on a package"* and every
piece she is waiting on was bought by Leah. She would open Ordered, find it empty or find one lamp
she bought herself, and go back to texting her designer — which H2's walk names as the habit this app
was built to replace.

This is not a missing backend. `fulfillment_orders` is the designer-sourced rail, it carries
`client_profile_id`, and its status vocabulary is the *same six words* B adopts verbatim for
`direct_orders` — B is already copying the templates and leaving the rows behind.

**Evidence.** H2 T8 (three disagreeing counts, then *"I'd text Leah directly, which is exactly the
habit this app was supposed to replace"*); H3 T8: *"On my phone, 'where is it' resolves to a bill."*
F66 S1 · F19 S0 · F90 S1 · F198 S2 · F202 S2 (the deposit is for a table the app never shows).
`research/17-gap-fills.md` G1 caller #4 — `fulfillment-notify` resolves the recipient from
`fulfillment_orders.client_profile_id` (`fulfillment-notify/core.ts:101-102, 257-262`), vocabulary at
`supabase/functions/_shared/fulfillment-templates.ts:31-37`, rail at
`supabase/migrations/00350_fulfillment_core.sql:75`. `direction-b.md` §5 path table; M8 screen sheet
"Data" and "Tier" rows.

**Fix I would accept.** Ordered reads **both rails into one list** — `direct_orders` for what I
bought, `fulfillment_orders` scoped to `client_profile_id` for what my designer bought — one card,
one four-step rail, the same six words. Where the designer-sourced row is operator-driven, say so on
the card (`Leah updates this as it moves`) rather than showing nothing. If RLS does not yet let the
homeowner read her own `fulfillment_orders`, that is the delta to price in W4, and it is smaller than
the migration B is already writing.

---

### BL-3 · The Buy button can ship over a piece with no size, no lead time, and the wrong photograph.
**Hits:** §5 ("What Walt sees before he pays", items 2–3) · M3 items 6–7 · M5a.

**The problem.** B's honesty rule is right — *"Size and lead time (SP-10), omitted entirely when null
rather than faked."* Applied to today's data, the $4,200 order sheet renders: the name, the
description, the price, a seller line — **and no dimensions and no lead time**, over a photograph
that, on this catalogue, is frequently a different object. M3 marks its own numbers *(example copy —
`dimensions` and `lead_time_weeks` are empty in the seed)*, and SP-10 records that filling them is a
catalogue data pass nobody has been assigned. F06 is on B's own "left open on purpose" list as
"a content pass."

So the direction ships a purchase act on exactly the screen Walt spelled out, missing exactly the two
things he leads with, above a picture of somebody else's chairs.

**Evidence.** H3 T7: *"the width, depth and seat height… A downsizer buys by the inch"*; H3 closing:
*"the photograph has to be the actual chair… Everything above is worthless until the picture is
true."* H1 closing #1: *"Tell me it will fit… the dimensions column exists in the database and is
never sent to the app; that's the cheapest trust win here."* F17 S0 · F142 S1 · F143 S1 · F06 S3
(cited by six seats) · `shared-planks.md` SP-10 "Backend delta" (the data pass) and "Risk"
(F144 not invented here).

**Fix I would accept.** A **buyability gate**, one boolean, no new screen: `Buy` draws only on a
piece that has a verified image, `dimensions`, `lead_time_weeks`, a resolvable maker (`brand`), and a
seller of record. Everything else falls to Path C — `Ask about this piece` — which B already has.
That turns B's honesty rule from a rendering choice into a structural one, and it is the same gate
that stops F06 reaching a checkout.

---

### BL-4 · Nobody answers the phone when it arrives scuffed.
**Hits:** §5 "Returns and damage" · M5a item 6 · M5c.

**The problem.** B reserves the line, prints the seller of record, names *"a named support contact on
Path A"*, and flags the policy text as a Kody ruling that prints from config once written. There is
no support-contact field anywhere in the product — F144 says no shipping, returns or responsibility
copy exists as a column at all. So on the day W4 ships, the order sheet's "who is responsible" row is
a company name and a promise of a person who has no address.

For Walt this is not a polish item; it is the decision. He said the answer to this question is what
decides whether he buys here or from the maker.

**Evidence.** H3 closing: *"who carries it up, and — the one that decides it — who answers the phone
when it arrives scuffed. If the answer is 'the maker, good luck', I will buy from the maker and skip
the middle."* H1 closing #3: *"Tell me who is responsible… and whose name is on that."* F144 S1.
`direction-b.md` §5 "Returns and damage".

**Fix I would accept.** W4 does not ship Path A without (a) one config-driven paragraph naming who is
responsible for delivery, damage and return, printed on the order sheet **and** on `Order placed.`,
and (b) one reachable human — an address or a number that resolves, not "support". If the ruling is
not made in time, Path A stays behind its flag and Paths B and C ship; asking a designer to source it
is a complete answer to responsibility, and B already has that path.

---

### BL-5 · The fit line can be confidently wrong, and the room cannot be corrected.
**Hits:** §5 item 4 · M3 item 8 · M4.

**The problem.** *"Fits your Living Room's 18 ft wall with 3 ft to spare."* is the best sentence in
either direction — and it is computed from a room the homeowner typed into a screen where the unit
control is 12×13 pt (`ft`) and 6×13 pt (`m`), with a colour change as its only feedback, and where
the chosen unit is silently persisted in `patina.scan.manual_entry.unit` and restored on the next
visit. Two of the three homeowner walks came out of that screen with a 2,713 sq ft living room, and
neither could repair it — M4 offers `Set a budget for this room` and no way to change the numbers,
even though `.roomSettings(roomId:)` already exists as a route.

A wrong fit line on a $4,200 made-to-order table is worse than no fit line. It is the app telling
Walt it will fit, in the app's own voice, using a number the app got wrong and would not let him fix.

**Evidence.** H1 T5: *"the room has a wrong number on it that I can't fix and nothing can go in it"*;
H3 T5: *"This is the screen where I decide the app does not actually know my house… I would not trust
the next number it showed me either."* F40 S1 (the real finding — reach, not a conversion bug; the
unit persists and restores) · SP-19 "Where" (`ScanFallbackEntryView.swift:140-166`, `:265-280`) ·
route table `research/10-code-anatomy.md:31` (`.roomSettings(roomId:)` →
`Features/Rooms/Views/RoomSettingsView.swift`).

**Fix I would accept.** Two moves, both small. (a) M4 gets `Edit dimensions` beside the budget act,
on the existing `.roomSettings` route. (b) The fit line states the numbers it used —
*"Your Living Room's longest wall is 18 ft. This table is 7 ft."* — so a wrong room reads as a wrong
room instead of as a promise, and draws only for a room whose measurements were entered after SP-19's
segmented control lands.

---

## Major

### MJ-1 · The record's window collapses on the second open of the day.
**Hits:** §3 (last visit) · §9 first slice (`Core/Persistence/LastSeenStore.swift`).

`patina.house.lastSeenAt` is written on `scenePhase → .active`. Ruth checks on this the way she
checks packages — several times a day. Walt opens at 7:40 and again after the paper. On the second
open the header reads `SINCE YOU WERE LAST HERE · 7:40AM` and the card reads `Nothing moved since
7:40am`: true, useless, and it retires the direction's best screen for the rest of the day. The
mechanic works exactly once per absence.

**Evidence.** H2 persona: *"checks packages the way other people check the weather"*; H2 T11 asks for
a line *"the way a tracking page tells me a box changed facilities"* — a tracking page shows the whole
chain every time you open it, not only what changed since your last look. `direction-b.md` §9.

**Fix.** Separate "last seen" from the record's window. Keep a rolling window (seven days, grouped by
week after that), and mark rows added since the last visit with a quiet rule or a `new` tick. A second
open then shows the same record with nothing marked new, instead of an empty card.

### MJ-2 · Chores crowd out "what moved" — the exact thing Walt asked for.
**Hits:** §2 activeProject block 2 · §1 (the 7:40am day) · M1 block 2.

The record is *"at most five rows, ordered what needs you first, then what moved."* Ruth's seeded
account has four items waiting (two decisions, an invoice, a proposal), so "what moved" gets one row —
and after two weeks away, when the catch-up matters most, it gets none. Walt asked for the opposite in
so many words.

**Evidence.** H3 "three things that would make me open this every day," #2: *"Three facts, in order,
that the house and the person did while I was asleep — not three chores I owe. That single line is the
difference between an app that keeps my house and an app that nags me."* C29 (four open items on
`client@patina.dev`). F30(=F37) S0.

**Fix.** Two eyebrows inside the one card — `NEEDS YOU` (max 3) and `MOVED` (max 3) — each with its
own truthful empty (B's `Nothing needs you right now.` already serves the first). Same block, same
mount, same rollback.

### MJ-3 · "Your house" is empty for the client it was designed for.
**Hits:** §2 activeProject block 4 · §3 (rooms as the persistent object) · §7 (F101/F99 claimed) ·
M1 block 4.

The room rail reads `RoomModel` + `rooms`. B's own mock labels it *(example copy — the local seed has
zero rooms)*. `client@patina.dev` is activeProject with three projects, $725,000 of work, and **zero
rooms**. Ruth's real rooms — dining room, primary bedroom — exist in this product only as text on an
invoice line. So the block that the direction calls "the persistent object of the whole direction"
renders, for her, as an `Add a room` prompt three months into the job. §7 claims F101 and does not
name a mechanism.

**Evidence.** H2 T5: *"there's nothing here that's mine to check on. My real project rooms have no
'space' of their own; they only exist as line items on a bill."* F101 S1 · F202 S2 · C29 (0 rooms).

**Fix.** Seed "Your house" from the project's rooms where the project has them — read-only cards the
client did not type, carrying the project name B already plans to show. An activeProject client's
house should never be an empty-state.

### MJ-4 · The block that has to be there in eight seconds is the one that has to load.
**Hits:** §9 first slice · M1 screen sheet "States".

The record composes from `StudioQueueBuilder`, `notification_log`, `DesignRequestStatusService` and
the story; the loading state is `One moment…`. B's own day says Walt *"gets his coffee's worth in
eight seconds and closes the app."* On a cold launch on cellular he gets a spinner in the space where
the record goes, and the record is the entire product.

**Evidence.** `direction-b.md` §1 (the 7:40am beat) and §9 ("W1 adds no network calls — the record
composes from data already fetched on appear"); the badge floor is five parallel fetches refreshed on
home appear (`research/10-code-anatomy.md`, A10 badge-poll paragraph), and the Studio queue itself is
built on the Profile route today.

**Fix.** Persist the composed record and paint it instantly, then refresh quietly behind it. B already
builds exactly this store in W5 for the widget's App Group snapshot — move it to W1, where it pays
twice: the widget gets its data and the cold launch gets its first frame.

### MJ-5 · The trade-rate line discloses a payment without saying whether it costs me anything.
**Hits:** §5 (Path A at activeProject) · M5a activeProject line.

*"Ordered in your name. Leah sees it on your project and is credited at her trade rate."* A homeowner
reads that as: there is a cut, and nobody has told me its size or who pays it. Walt wants the chain of
custody in plain words and will assume the worst of a sentence that half-explains a payment.

**Evidence.** H3 closing: *"I want to buy it through her, see her name on the order, and know she is
paid for it"* — paired with his standing demand for the full chain in plain words. F22(=F26) S0,
F152 S1 (the attribution columns B is adding).

**Fix.** One clause: *"This doesn't change your price."* — the commission is snapshotted against the
same total, so it should be true; if it is not true, print the amount. Do not ship the sentence as
drafted.

### MJ-6 · You leave the app not knowing the total.
**Hits:** §5 item 5 · M5a.

`Piece $4,200.00` / `Shipping and tax are calculated on the next screen.` Freight and white-glove on a
made-to-order oak table is not a rounding error, and the handoff is out of the app into Safari. Maya
is spending $6–9k for the whole year and budgets to the dollar; Walt wants to know what the number is
before he commits to finding out.

**Evidence.** H1 closing #3 (*"Lead time, shipping, what happens when it arrives scratched"*); H3 T7
(*"what shipping costs and whether two men bring it upstairs"*). F144 S1.

**Fix.** Print a delivery estimate or a range where the vendor or `patina_managed` config can give
one; where it cannot, say what happens in the buyer's terms — *"You'll see the full total, including
delivery, before you pay."* — and keep the piece price as the only figure on the sheet.

### MJ-7 · The story keeps a daily slot on a well of three, and B now prints the date on it.
**Hits:** §2 (all four tiers, "From the workshop") · M1 block 5.

SP-18 fixed the fabricated unread dot and explicitly handed the cadence question to the directions:
*"three stories is not a daily habit and nobody should pretend it is."* B keeps the block at every
tier, adds `AUG 25 · 4 MIN`, and never names an owner or a rate. A visibly stale date is more honest
than an undated card and *less* returnable — it tells Walt every morning that nothing has been
published since the 25th. The query also still sorts `sort_order.desc` before `published_at.desc`, so
a newer story with a lower sort order never surfaces at all.

**Evidence.** H3 "three things," #1: *"A dated maker's story I could not have read yesterday… an
honest 'new' once a week beats a fake 'new' every morning. That is the Journal Sentinel bargain."*
H1 T2: *"the same Maine woodworker story is on every one of them."* F46(=F61) S1 · F131 S1 ·
`research/10-code-anatomy.md:118` (the ordering) · `shared-planks.md` SP-18 ("how often a new story
arrives… is direction work").

**Fix.** Name the cadence and its owner in §2 — one row a week is enough — order by `published_at`
with `sort_order` as tie-break, and at activeProject drop the block below the record when nothing has
published since the last visit.

### MJ-8 · `3 waiting` is the one badge in the document.
**Hits:** §4 (widgets) · M6a · M6b.

`PATINA · 3 WAITING` on the Lock Screen and `3 waiting` in the Home Screen widget's footer are a
running count of chores parked on the glass. B's §10 refuses badges, points, day counters and invented
red numbers; this is the same instrument with a true number in it. Walt is the seat that deletes apps
over it, and he is the seat most likely to have a Lock Screen widget.

**Evidence.** H3 closing parenthesis: *"one thing I would refuse: streaks, badges, 'you haven't
visited in 3 days' guilt, or a red number invented to make me tap. I am sixty-three, I have money, and
I will delete an app that tries that on me."* F189 S2 (B's own removal of the two silent decays shows
the instinct is there).

**Fix.** Name the thing, not the count: `Rug colour — overdue since Aug 22`, alone. Drop `3 waiting`
from both widgets. The count is fine inside the app, where it is a list; on the Lock Screen it is a
scoreboard.

### MJ-9 · Deciding is still not built, and B declines it explicitly.
**Hits:** §10 ("No compare surface (F162), no product Q&A") · §7 (F52/F170/F197 absent).

T6 — *"Is this the one?"* — is where both browsing homeowners stop. F52 ("Nothing on a piece helps you
decide", S1) is answered by no plank and by neither §7 nor §10; F170 (a note field exists in the data
model and no screen writes it) and F197 (saved rows carry no note, room or save date) are unanswered
too — while B's own M2 prints *"you added the Brass Arc Floor Lamp on Tuesday"*, which needs the save
date it never asks for.

**Evidence.** H3 T6: *"I want two chairs side by side. I want to write 'too deep for the alcove' on
one of them. I want to ask a person a question about the joinery. None of those exist."* H1 T6:
*"There is no compare. There is no notes field."* F52 S1 · F162 S2 · F170 S2 · F197 S2.

**Fix.** Take the cheapest half and say you are taking it: expose the note that already exists on a
saved row, and print each saved row's date and room. One field, no new screen, and it turns Saved from
a pile into the investment §3 claims it is. Compare can stay refused — say so under F52's name, not
only F162's.

### MJ-10 · The taste line rests on a portrait the app names two different ways.
**Hits:** §3 (taste portrait) · M2 block 3 sub-line.

Replacing the unexplained percentage with *"In the warm-minimal range you saved."* is right (F158).
But the two quizzes that write that portrait disagree — the Companion quiz says `Warm Modern`, the
post-room quiz calls the same result `Modern Warmth`, another account reads `Style Explorer` — and
F96/F140 are answered by no plank and by neither direction.

**Evidence.** H1 T6: *"If the app can't keep one name for my taste, I'm not trusting its 46%."*
F96 S1 · F140 S1 · F119 S1.

**Fix.** One quiz, one name — or drop the line. A sentence in the reader's own words is only worth
printing if the app can keep it the same tomorrow.

---

## Minor

- **MN-1 · A red `overdue` on line one at 7:40am.** §2 / M1 block 2. `SINCE YOU WERE LAST HERE` plus
  `error #C77B6E` on the first row is the one place B edges into scolding, and Walt is allergic to it.
  Hold the red for money that is actually late; for a decision, the date in mono does the work.
  (H3's refusal list; F189 shows B's instinct is otherwise sound.)
- **MN-2 · First run and reinstall are undefined.** §3 / §9. With no `patina.house.lastSeenAt` there
  is no gap to name and §9 never says what the header reads. Name it — the greeting alone is enough.
- **MN-3 · Last-seen is device-local.** §3 stores it in UserDefaults and defers a `profiles.last_seen_at`
  mirror "later for the widget." Walt reads on an iPad; Maya and Devon share a couch and a tablet. The
  second device needs the mirror before the widget does. (H1 T12; F54 S1.)
- **MN-4 · The dark invoice loses its Pay button.** F106 S1 is answered by no plank and by B; the money
  screens are this direction's spine and its dark variants stop at M1d/M2d/M3d. Ruth pays at night.
  (H2 T13: *"whether the missing Pay button… means the invoice already got paid, or the app just
  broke."*)
- **MN-5 · A finished project still sorts above two live ones.** F161 S2, H2 T8 — the Studio tab
  inherits it unchanged from today.
- **MN-6 · Phase rows have nowhere to land.** §2's honest-sources table counts "phase" as a record
  source, and project detail discards the phases and selections it already fetched (F76 S1, F125 S1).
  Either don't emit a phase row in W1, or give it a destination that holds the timeline.
- **MN-7 · §7's table under-claims.** F51 is answered in M4's screen sheet (`TYPED, NOT SCANNED`) and
  missing from §7; F52, F96, F106 and F144's client-facing half appear in neither §7 nor §10's
  deliberate refusals. Reconcile the table so a judge can score what B actually does.
- **MN-8 · §2 re-uses the phrasing that produced F14.** "*plus **Saved** once the count is above
  zero*" is the gate SP-12 removes. Harmless once the tab bar lands in W2, but W1 ships first — say
  "the row is a summary, the tab is the door."
- **MN-9 · Documents never appear.** F77 S1. Today's guest Studio promises *"conversations, decisions,
  proposals, invoices, and shared files"*; B's Studio tab names everything but the files.
- **MN-10 · The permission primer has copy but no drawing.** §4 gives the four-event sentence and §5's
  M5c gives the post-purchase `Notify me`. The primer screen that a person who never buys will
  actually meet — the one behind the first proposal — is named and never drawn. §9's mock spec asks
  for the return moment; draw it.
- **MN-11 · One row on the record is Patina talking about itself.** *"Three pieces joined Patina this
  week."* sits in a list of things people did about your house. It is honest, and it still reads as
  merchandising in the one place that must never merchandise. It belongs under **NEW THIS WEEK**.

---

## What is genuinely good — the author must keep it

1. **The thesis, and where the name came from.** "The record" is lifted from the app's own seeded
   editorial line (`00143_editorial_stories.sql:167`), and the observation that the product has been
   saying it in an article nobody can reach twice is the sharpest sentence in either direction.
   Technology stays silent; the house is the object. This is Patina's voice.
2. **`SINCE YOU WERE LAST HERE · THU, AUG 20`, dated rows, and `Nothing moved since Thursday.`**
   The honest empty is the single best decision in the document. All three seats asked for it in their
   own words (H3: *"Even 'nothing happened' would be worth more than a screen that pretends no time
   passed"*), and it answers F16(=F34) and F13 without inventing a thing.
3. **"He gets his coffee's worth in eight seconds and closes the app. That is a success, not a
   failure."** That is the correct definition of return for this audience and it should survive into
   whatever ships. Keep it as a stated success metric, not a throwaway.
4. **§10's refusal list.** No streaks, no badges, no day counters, no fake urgency, no social proof
   over a population that does not exist, no Wallet pass, no permission ask at cold launch, no
   speculative push — and above all *"No activity row for the reader's own actions. If you did it, it
   is state, not news."* That last rule is the most useful honesty instrument produced by this whole
   program. Keep it verbatim.
5. **The designer as a permanent seat, and every row written as hers.** *"Leah asked about the rug
   colour."* instead of *"A decision is ready."* answers F09 — she is currently named exactly once, in
   mono, under a bill — and it is what H2 and H3 both closed their walks asking for.
6. **`"Leah Hartwell picked up your request."` as the first line at engaged.** H1 said the one thing
   that would bring her back was the app telling her a human had her request. §2 puts that sentence at
   the top of the screen.
7. **The four-event push promise, stated verbatim, asked after the first real event.** *"We'll tell
   you when your designer sends a proposal, when an invoice comes due, when a decision is waiting, and
   when something you ordered moves. Nothing else."* Walt named two of the four unprompted and said he
   would grant them. Moving the ask off the design-request submit is right (F47, F167).
8. **The purchase compromise.** `Ask Leah to source this` primary, `Buy it myself` secondary,
   `designer_id` / `project_id` / `commission_rate` snapshotted at create. H3 asked for exactly this
   and added *"decide it before you ship the button."* B decides it before it ships the button.
9. **The order sheet's order of contents** — piece, the real description the database already holds,
   size and lead time, the fit line, money, who is responsible, where payment happens — is Walt's own
   checklist in Walt's own order. Do not reshuffle it.
10. **Taking the fulfillment vocabulary verbatim** from `_shared/fulfillment-templates.ts` so one
    template set serves both rails. Right instinct — finish it per BL-2.
11. **Removing both fourteen-day decays** (F189) and refusing to replace them with anything. Absence
    changes nothing is the correct posture for all three seats.
12. **`TYPED, NOT SCANNED`** replacing the contradictory `JUST SCANNED` / `MANUAL ENTRY` pair (F51).
    Small, and it restores trust in every number derived from the room.

---

## The three tests, answered

**Would I open this tomorrow at my hour?**
Walt, 7:40am — **yes**, once BL-3/BL-4 are settled: three dated lines and a truthful empty is a
morning paper, and closing the app after eight seconds is allowed. Ruth, 12:30pm — **yes**, and she is
the seat B serves best, until she taps Ordered and finds none of her furniture in it (BL-2).
Maya, 9:10pm — **no**, not as drafted: her tier has no record, and B's own honesty rule forbids the
only thing on her home that changes (BL-1).

**After two weeks away?** Ruth and Walt: yes — `You were last here on the 12th.`, grouped by week,
nothing decayed, nothing scolding. But the catch-up they need most is the half that gets crowded out
by chores (MJ-2), and the mechanic only fires once per absence (MJ-1).

**What on the first screen is honestly new?** At activeProject: another person's act, dated — the
strongest honest answer either direction has. At discovering: the date, again (BL-1).

**Would I buy a $4,000 piece here?** Not until the piece can say its size, its lead time, its real
photograph and its seller of record (BL-3), until someone is named who answers when it arrives
scuffed (BL-4), until the fit line stops being a promise built on an uncorrectable number (BL-5), and
until I know the total before I leave the app (MJ-6). Every one of those has a small fix.

**Which mechanic feels like being "engaged"?** `3 WAITING` on the Lock Screen (MJ-8), and `overdue` in
red at the top of the morning (MN-1). Everything else in this direction is clean.
