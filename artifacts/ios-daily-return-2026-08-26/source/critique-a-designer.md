# Critique — Direction A "Since You Were Here" — Designer Lens

**Reviewer stance:** read as D1 (Leah, solo residential, Columbus), D2 (Priya, three-person studio,
Minneapolis), D3 (Tom, procurement-heavy, Milwaukee) in turn, against `source/direction-a.md`
(committed as-is against main `3cd84ecb3`). Five questions carried through every section: does the
client see me; do purchases credit me and land on my schedule; does this cut my inbox or add a
channel; what competes with the relationship; is the through-designer path honest about who answers
when a piece arrives damaged.

**Method note — panel claims I did NOT carry forward**, per the verified-corrections that override
the merged findings: I do not treat "Choose this" as an unconfirmed one-tap commit (D1-18/D2-18) —
`DecisionConsentSheet` already exists; I do not repeat D1-27 (Studio rows unreachable by VoiceOver) —
flagged as a harness artifact; I do not treat missing per-item proposal *prices* as a bug A should
fix (D1-08/D3-26's price half) — that's a server-side `client_visibility_tier` policy ruling, not a
UI gap. Where a panel finding is answered by a **shared plank** (SP-01…SP-20, inherited by both
directions per the document's own framing) I say so and don't re-charge Direction A for it.

---

## Blocking

### B1 — The Buy/Ask gate is room-scoped; the relationship it's protecting is client-scoped

**Section hit.** §5, "Three paths, and the rule that picks between them" (`direction-a.md:204-214`)
against "Attribution" (`:243-263`).

**The problem.** Path A (Buy) is gated off by *"no designer is engaged on **the room** it is for"*.
Attribution, one paragraph later, is scoped differently: *"if the buyer has a live designer
relationship — an accepted lead or an active project — every direct order she places is credited to
that designer."* Those are two different scopes (room vs. client), and the document never reconciles
them. For a client who plainly has a designer but no room to check the gate against — Ruth-shaped:
activeProject, zero rooms (the document's own M1 scenario, `:39`) — or for any piece browsed outside
a room context, "the room it is for" has nothing to test. Read literally, Buy draws for her anyway.
Money still lands on Leah's ledger (attribution is client-scoped), but the *experience* the client
gets is unmediated self-checkout on exactly the tier where a designer relationship is most
established — the "protected" promise in §6 ("**Buy never appears on a room she is engaged on**")
has a hole precisely where D1/D3 are most sensitive to one.

This isn't a hypothetical I'm inventing: the document's own M5 mock proves the gap is real. "5a ·
Order sheet" is drawn only for the *discovering, no designer* case; **"the engaged variant is
described, not drawn"** (`:586-587`) — the one scenario where "Credited to Leah Hartwell" would
actually print on an order *sheet* (as opposed to a Path-B thread) is the exact undefined case above,
and the direction never shows what it looks like.

The document itself names the stakes of an underspecified rule, one section earlier, about the
*other* half of this same mechanism: **"any rule with a gap in it is a rule Tom will find the gap
in"** (`:252`). That line is aimed at attribution scope; it applies with equal force to the gate
scope, and here the gate has the gap.

**Evidence.** `direction-a.md:204-214, 243-263, 585-587`; D3's stated walk-away condition
("if a 'buy now' ships... before designer attribution exists," `research/2x-panel-d3.md:207-211`) —
attribution *does* exist here, which is why this lands as blocking-on-ambiguity rather than
blocking-on-the-thing-D3-named, but the promise in §6 is still broken as literally specified.

**Fix I'd accept.** State the gate at the same scope as the attribution rule: Buy is unavailable to
**any client with a live designer relationship** (accepted lead or active project), full stop, not
conditioned on a room existing for that piece. If a narrower, room-scoped reading is actually
intended, say so explicitly and draw the M5 engaged-variant order sheet so the boundary is visible,
not asserted in prose. Either resolution is fine; shipping the current silent gap is not.

---

## Major

### M1 — The editorial story stays the biggest thing on the screen the morning money is waiting

**Section hit.** §11, M1 mock (`direction-a.md:486-498`).

**Problem.** D1's original complaint about the shipped app was exact: *"The editorial card is
beautiful and it is the largest object on my client's home screen; a maker profile from Maine
outranks the money they owe me"* (`research/2x-panel-d1.md:76-77`). Direction A makes the Next Move
card say more (the whole queue, with dates) but does not touch its size relative to the story card,
which the mock spec calls out explicitly: `TodayNextMoveCard`... 16pt padding, no stated fixed
height, then **`DailyStoryCard` unchanged: 300pt `hero` gradient**, offWhite headline text
(`:494-496`). On Ruth's own scenario (M1, the account with a proposal, an invoice, and a rug-colour
decision all live), the tallest, most colorful object on her first screen is still a maker profile
from Maine. What competes with the relationship isn't only a future Buy button — it's what's
visually loudest the morning a designer needs her client's attention.

**Evidence.** `direction-a.md:486-498`; `research/2x-panel-d1.md:74-80`.

**Fix I'd accept.** Let the Next Move card's visual weight scale with what it's carrying — at minimum
match the story card's footprint when the queue is non-empty — while keeping it the one card, one
route the Today contract requires. Doesn't need a redesign; needs the same card to read as urgent as
the number inside it.

### M2 — "Message Leah" is the Companion's always-suggested row, independent of whether anything needs saying

**Section hit.** §11, M7 mock (`direction-a.md:644-661`).

**Problem.** Priya's (D2) single test for the whole program is stated up front: *"would sending
clients here cut Tuesday's forty emails in half, or triple them?"* (`research/2x-panel-d2.md:6-7`).
M7 fixes the real defect (SP-13: a client can now actually start a thread) but then makes
**"Message Leah"** the panel's one contractually-suggested row (clay wash on the icon tile,
`:650-651`) on *every* visit, regardless of whether the queue has anything in it. A UI that promotes
messaging as the default suggested action, every time, for every client, is a UI tuned to generate
inbound messages — the opposite of what closes Priya's inbox. Nothing in the direction ties the
suggested slot to state.

**Evidence.** `direction-a.md:644-661`; `research/2x-panel-d2.md:6-7, 229-233`.

**Fix I'd accept.** Make the suggested row state-driven: **"What's waiting"** suggested when the
queue is non-empty (the more urgent act), **"Message Leah"** suggested only when the queue is empty
(where a proactive check-in is actually the useful nudge, not noise on top of open items).

### M3 — Nothing tells the designer when the client acted

**Section hit.** §4, "Return surfaces beyond the app" (`direction-a.md:126-186`), in full.

**Problem.** Every notification, widget, and email described in §4 flows one direction: Patina to
client. The direction never asks the inverse of its own premise — when a client signs a proposal,
pays an invoice, answers a decision, or (new, via SP-13) opens a thread, does the *designer* find out
anywhere other than opening the portal cold? D2's stated need cuts both ways: she needs to *"trust
the state I see in the portal reflects what they did"* (`research/2x-panel-d2.md:235`) without
picking up the phone to confirm it — that only holds if she's told, not just the client. As specified,
"Message Leah" (M2 above) plus the money rail becomes a second silent inbox the designer has to poll,
which is the precise failure mode she's measuring the whole app against.

**Evidence.** `direction-a.md:126-186` (no designer-facing notification anywhere in the section);
`research/2x-panel-d2.md:229-235`.

**Fix I'd accept.** At minimum, name whether the existing designer-portal notification/email rail
(out of this program's scope, but real) already covers sign/pay/decide/message events — if it does,
say so in one line so the omission reads as "already handled elsewhere," not "unexamined."

### M4 — "Lands on her FF&E schedule" overstates what the mechanism actually does

**Section hit.** §5, Path B description (`direction-a.md:209`).

**Problem.** The claim: Path B *"opens the project thread with the piece named (SP-13's RPC), **so
the piece lands on her FF&E schedule and her margin, not ours**."* SP-13, as scoped in
`shared-planks.md`, wires `rpc_start_project_thread` and puts the piece's name in the thread's
**opening message** — a structured, in-app conversation starter, not a write to any schedule or
FF&E table. The designer still has to read the thread and add the line herself, in the portal, by
hand — the same manual step she takes today from a text message, just moved to a channel she now has
to check (see M3). That's still real value (structured, attributed, in-app, attached to the right
project) — but it is not automation, and the document's own phrasing implies it is. Nowhere in the
waves or backend-deltas ledger (`:394-419`) is a write to an FF&E/schedule table scoped for Wave 2.

**Evidence.** `direction-a.md:209`, `394-419`; `source/shared-planks.md` SP-13 section (the RPC and
its "piece named in the opening message" scope).

**Fix I'd accept.** Correct the sentence to what's actually built: "so the piece reaches her, named
and attributed, on the project thread — hers to add to her schedule." If automatic FF&E population is
wanted, scope it as its own backend delta with an owner, not implied by a messaging RPC.

### M5 — A recurring cron is listed as a push trigger with no stated de-duplication

**Section hit.** §4, "Who sends it" table (`direction-a.md:149`), against §10
(`direction-a.md:452-460`).

**Problem.** The new push call sites are named as *"proposal-send, `00092_decision_cron.sql`,
invoice-send / **invoice-reminders**"* (`:149`). `invoice-reminders` is a recurring cron, not a
one-time send. If each reminder cycle re-fires `notify_client_attention`, the client (and the
designer, whose name rides the notification per §6) gets a repeating push about the same unpaid
invoice — which is exactly the shape of the thing §10 disclaims by name: *"no fake scarcity... no
completeness meter that never fills... no loss framing"* (`:453-457`). A designer reading this
section would want to know her client isn't going to feel nagged by her studio's own reminder cadence.

**Evidence.** `direction-a.md:149, 452-460`.

**Fix I'd accept.** State explicitly: the push fires once per entity reaching an attention-worthy
state (sent / raised / due), not once per cron evaluation — `invoice-reminders` triggers a push only
on the *transition into* overdue-and-unread, matching the "one more, months later, only on a payment
overdue and unread" re-ask rule already written for the permission prompt (`:139-140`).

### M6 — The document claims the unexplained match number "comes down"; its own mock still draws it, on the Buy screen

**Section hit.** §7 (`direction-a.md:329`) against §11, M3 mock (`direction-a.md:543-544`).

**Problem.** The findings-answered table states: *"the unexplained match percentage comes down"*
(citing F158 + SP-18). SP-18's actual scope (`shared-planks.md`) is Profile's `"63% MATCH"` and the
room's bare `"— MATCH"` stat — it does not name the per-piece match pill on product cards or piece
detail. And Direction A's own M3 mock still draws **`88% MATCH`** (DM Mono 10, capsule) on the piece
detail, with no stated rationale attached, sitting directly above the `Buy it · $4,200` button
(`:543-544`) — the one screen §5 says must be honest before Walt pays real money
(`"What Walt sees before he pays $4,000"`, `:264-271`, which lists maker, photo, dimensions, lead
time, materials, story — and never mentions or defends the match pill). This is the same species of
unexplained-number problem D1 flagged in the browse grid (`46% MATCH`, no rationale,
`research/2x-panel-d1.md:134-136`) surviving, unexamined, on the highest-stakes screen in the
direction.

**Evidence.** `direction-a.md:329, 543-544, 264-271`; `research/2x-panel-d1.md:134-136`;
`source/shared-planks.md` SP-18.

**Fix I'd accept.** Apply SP-18's own repair rule to the piece card too: label what the percentage
matches against (the taste portrait, plainly, in words) or drop it from the buy surface. Don't claim
the fix landed everywhere in §7 when §11 shows it didn't land here.

### M7 — The "quiet day" cost is priced for money, not for the relationship

**Section hit.** §8.1 (`direction-a.md:339-343`).

**Problem.** The document is honest that on a day nothing is pending, *"her route back to the Studio
is the 36-point monogram again"* — and prices this against Ruth's money-chasing case. It doesn't
reason through the parallel cost to the relationship itself: a quiet day is also the day nothing on
screen reminds the client the Studio, or the designer, exists at all — no label on the monogram, no
Studio door, nothing but a bare circle. That's exactly the moment D1 wants filled, not with an
urgent card, but with the lower-stakes thing she said is worth more to her than any commission:
*"browsing beside me... a save that reaches my FF&E schedule is a client doing my sourcing for free"*
(`research/2x-panel-d1.md:349-352`). A door that only appears when something is overdue trains the
opposite habit — open the app only when summoned, not to browse with your designer.

**Evidence.** `direction-a.md:339-343`; `research/2x-panel-d1.md:338-352`.

**Fix I'd accept.** Not a redesign — I'd accept the document simply naming this second cost
alongside the first, so Kody is ruling on both, and considering whether the monogram earns a label
even without amending the Today module count (a label is chrome, not a fifth module).

### M8 — The project screen's discarded phases/timeline is named as "direction work" and Direction A doesn't do it

**Section hit.** §7 findings-answered table (`direction-a.md:309-330`) — the gap is what's absent
from it.

**Problem.** Shared plank SP-05 explicitly carves this out: the project screen *"fetches phases and
milestones it then discards (F76, F125) — rendering what it already has is direction work; removing
what it should never have shown is not"* (`source/shared-planks.md`, SP-05 section). Direction A
removes the leaked strings (inherits SP-05) but never claims F76/F125 in §7, and nothing in the first
slice or waves renders the phases/milestones/selections the screen already fetches. This is D1's
third stated ask, verbatim: *"The project screen already fetches phases, milestones and selections
and throws them away. Render them and my Tuesday inbox halves"* (`research/2x-panel-d1.md:347-349`).
It's explicitly in scope per SP-05's own framing and Direction A leaves it on the table.

**Evidence.** `direction-a.md:309-330` (no F76/F125 row); `source/shared-planks.md` SP-05;
`research/2x-panel-d1.md:347-349`.

**Fix I'd accept.** One line in §7 either claiming it (with a wave) or explicitly declining it in §8
with a cost, the way A does for the tab bar and the household. Silence reads as "forgotten," not
"declined."

---

## Minor

### m1 — Attribution assumes one designer per client; the data model scopes designer per project

**Section hit.** §5, "Attribution" (`direction-a.md:243-263`).

**Problem.** The resolution rule reads "if the buyer has a live designer relationship... credited to
that designer" — singular. But `designer_id` lives on `invoices`/`leads` at the project/lead level,
not the client level (`research/12-backend-reality.md:99, 139`), so a client with two active projects
under two different designers has no stated tie-breaker for a piece unrelated to either project's
room. The Risks section names testing against `client@patina.dev` (three projects) before the Buy
control draws anywhere (`:427-430`), which is reassuring diligence — it just doesn't say what the
resolution query does when the three projects don't share one designer.

**Evidence.** `direction-a.md:243-263, 427-430`; `research/12-backend-reality.md:99, 139`.

**Fix I'd accept.** One sentence: most-recent active project wins, or "credit is ambiguous → Buy
doesn't draw, full stop" (fail toward protecting the designer, per the document's own instinct
elsewhere).

### m2 — The designer-portal confirmation row has no committed date or owner

**Section hit.** §5 "Price" paragraph (`direction-a.md:254-258`) vs. §9 Backend deltas table
(`:407-419`).

**Problem.** "One row in the designer portal so she can see it" is promised in prose and again under
Wave 2 ("sequenced alongside," `:400`), but doesn't appear in the itemized backend-deltas ledger,
which is fair — it's portal front-end work, not a migration/edge-function delta the table is scoped
to capture — but it's also the only way a designer verifies she was paid correctly for a sale she
didn't personally make. Worth a firmer commitment given what's riding on it.

**Evidence.** `direction-a.md:254-258, 396-400, 407-419`.

**Fix I'd accept.** Name it as a tracked Wave 2 deliverable with the same rigor as the iOS pieces,
not just "sequenced alongside."

### m3 — Proposal selections still show a logo glyph instead of the piece's photo

**Section hit.** §7 findings-answered table — absent.

**Problem.** D1 and D3 both raised this, and it survives independent of the (correctly out-of-scope)
per-item price question: *"the 'Selections' list... each illustrated with the Patina wordmark glyph...
I sell photography and provenance at trade margin; a proposal that shows my client five unpriced
logo-placeholders isn't selling anything for me"* (`research/2x-panel-d3.md:167-171`). This is a
distinct, live complaint about missing product photography on the sign sheet, not the price-visibility
policy this review's corrections rule out of scope. Direction A's §7 table has no row for it.

**Evidence.** `research/2x-panel-d1.md` D1-08; `research/2x-panel-d3.md:167-171` (D3-26).

**Fix I'd accept.** Claim it explicitly (even just "SP-10's product photography feed extends to
proposal selections") or decline it by name in §8.

### m4 — Unclear whether the engaged tier gets "Message Leah" too

**Section hit.** §11, M7 mock (`direction-a.md:644-661`), only drawn for activeProject.

**Problem.** SP-13 explicitly covers a matched client with no project yet via
`rpc_start_direct_thread(counterpart)` (`source/shared-planks.md` SP-13), and §2's composition table
gives the engaged tier the same `{DESIGNER} · YOUR DESIGNER}` hint as activeProject (`:71`) — but the
direction never confirms the engaged-tier Companion panel inherits the "Message Leah" first row, or
whether James (engaged, matched eight days ago, per D1's T9 walk) still gets the panel D1 said was
"no Studio row at all" (`research/2x-panel-d1.md:220`).

**Evidence.** `direction-a.md:71, 644-661`; `research/2x-panel-d1.md:213-243`.

**Fix I'd accept.** One line confirming the engaged-tier panel header and message row, since this is
precisely the tier D1's T9 called "the single worst screen in the app for my business."

---

## What is genuinely good — the author must keep this

1. **Designer visibility is woven through, not bolted on.** The collapsed hint reads
   `{DESIGNER} · YOUR DESIGNER}` from the moment a designer is claimed, the expanded panel is headed
   by her portrait/monogram-with-fallback and a credential line, the Next Move names her, and every
   notification says who sent it (§6). This is a direct, thorough answer to the loudest complaint
   across all three seats — *"I found it once. On the invoice"* (D1), *"my name appears exactly once
   in the entire app"* (D2), *"where I appear, full stop: once"* (D3) — and it answers it everywhere
   a client would look, not just on Today.

2. **Attribution ships before the button, by design.** The rollback section states it outright: *"The
   only non-revertible step is money that has moved, which is why attribution ships **before** the
   button"* (`:446`). This is exactly the sequencing D1 and D3 named as the difference between "the
   other half of my tool" and "the thing I was afraid of before I opened it." Getting the order right
   here is the single most important decision in the whole direction.

3. **"The rule is the relationship, not the tier badge."** Gating Buy on whether a designer is
   engaged — not on the client's engagement tier — is the correct axis, even though I've flagged a
   real gap in how that scope is defined (B1). The instinct is right and worth keeping exactly as
   stated once the scope question is resolved.

4. **The damage-liability line is on the order sheet, in writing, before the client pays.** *"If it
   arrives damaged, Patina handles the claim with Nordic Atelier — one number, in your receipt"*
   (§5, M5a) answers D3's opening fear — bought direct, arrives damaged, designer eats the fallout —
   directly and in the client-facing copy itself, not just in a policy doc.

5. **The push promise is scoped to what it can actually deliver, and asked for at the right moment.**
   *"we will tell you when your designer sends something that needs you... Nothing else"* (§4), asked
   only after the first real money event, is precisely what closes D2's stated gap: acts that
   *"actually land without a phone call to confirm it happened."* One new call site riding three
   existing write paths, rather than a new notification system, is honest sizing.

6. **The engaged-tier bug is correctly diagnosed, not re-designed around.** M9 correctly identifies
   that `TodayExperience.swift:80-91` already renders the matched-designer branch and that SP-07's
   one-line filter fix — not new UI — is what makes it reachable. Building on the real cause instead
   of inventing a parallel module is the kind of restraint this review needs more of.

7. **Zero amendments, and the costs are named instead of hidden.** §8 says plainly what "no tab bar"
   and "no fifth module" cost the money rail's reachability. Even where I think the reasoning
   under-covers the relationship side of that cost (M7), stating the cost at all — rather than
   asserting the Next Move card solves everything — is exactly the honesty a designer reviewing a
   roadmap should be able to trust.

8. **Rollback is real, not decorative.** Four independent wave-1 flags, additive/nullable wave-2
   columns, and a flag-gated Buy control mean the designer-facing promises (visibility, attribution)
   can ship and be reverted without stranding money that's already moved. For a reviewer whose whole
   job is trusting what a client-facing surface will do to her business, a plan that can be turned
   off cleanly matters as much as the plan itself.
