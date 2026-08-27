# Critique — Direction B "The Record" — Designer Lens

**Reviewer stance:** read as D1 (Leah, solo residential, Columbus), D2 (Priya, three-person studio,
Minneapolis), D3 (Tom, procurement-heavy, Milwaukee) in turn, against `source/direction-b.md`
(committed as-is against main `3cd84ecb3`). Five questions carried through every section: does the
client see me; do purchases credit me and land on my schedule; does this cut my inbox or add a
channel; what competes with the relationship; is the through-designer path honest about who answers
when a piece arrives damaged.

**Method note — panel claims I did NOT carry forward**, per the verified-corrections that override
the merged findings: I do not treat "Choose this" as an unconfirmed one-tap commit (D1-18/D2-18/
D3-09) — `DecisionConsentSheet` already exists, and B correctly scopes SP-17 to only the surviving
half (defer/neither, colour). I do not repeat D1-27 (Studio rows unreachable by VoiceOver) — a
harness artifact. I do not treat missing per-item proposal *prices* as a bug B should fix (D1-08/
D2-09/D3-26's price half) — `get_client_proposal_bundle` nulls them below `client_visibility_tier =
'full'`; that's a data-policy ruling, and B correctly names it as one (§7, "Left open on purpose").
I do not re-charge B for messaging not existing (D1-09/D2-11/D3-25 as filed) — it exists; B's job is
the narrower surviving finding (a client can't start a thread), and it does that job via SP-13. Where
a panel finding is answered by a **shared plank** (SP-01…SP-20, inherited per the document's own
framing at the top) I say so and don't charge Direction B for it.

---

## Blocking

### B1 — A self-service purchase is invisible to the designer on the day it happens

**Section hit.** §5, "What D3 sees after" (`direction-b.md:215-218`), against §4 (`:117-156`, every
push event fires client-ward only) and Wave 4 (`:389`).

**The problem.** The document's own honesty is what surfaces this: *"What D3 sees after.
`designer_id`, `project_id` and `commission_rate` on the row, an earnings credit on settle, and the
piece on his FF&E schedule — the portal side of the schedule join is named here and priced out of
this direction's scope."* That last clause is the whole finding. D3 walks in asking one question —
*"does it show up on my FF&E schedule?"* (`research/2x-panel-d3.md`, opening line) — and D1's
literal, stated exit condition is a "Buy now" button that gives him *"not the margin, not the line on
the schedule, not the notice"* (`research/2x-panel-d1.md`, "What would make me stop sending clients
here" #1). B-5 fixes the margin (an additive migration + a `designer_earnings` credit — real, and
well-grounded, see "What is genuinely good" below). It does not fix the schedule line — it names the
gap and defers it, unpriced, unscheduled, to a future portal program. And it does not fix the notice
either: every push event in §4's table (proposal sent, invoice due, decision raised, order moved) is
addressed to the **client**; nothing in the document — not §4, not B-5, not the Wave 4 backend-delta
row (`:389`) — puts a message, a badge, or a push in front of the **designer** when a "Buy it myself"
order settles. The Wave 4 slice ships a button that debits nothing from her margin and credits
nothing to her *awareness*: the first time Leah finds out a client bought the sideboard she specified
is when she happens to check a schedule feature that, on this direction's own admission, doesn't
exist yet.

This is the exact scenario D1 said would end the relationship, softened by better plumbing
underneath it, but not resolved by shipping. A designer testing W4 the way the panel tested Option B
— open the app, watch for the thing that's supposed to reassure me — finds nothing changed on her
side at all.

**Evidence.** `direction-b.md:215-218` (the admission), `:119-136` (§4's four events, all
client-directed), `:389` (Wave 4's backend delta lists only the order-side migration, webhook branch,
and one `apns-send` call site — the last of which, cross-checked against §4's table, is the
client-facing "order moved" push, not a designer notice); `research/2x-panel-d1.md` ("What would
make me stop sending clients here" #1); `research/2x-panel-d3.md` (opening paragraph and closing
"What would make me stop sending clients here" #2); F22(=F26), F152.

**Fix I'd accept.** Either of two things, and ideally both: (1) sequence a minimal designer-facing
signal into W4 itself, not a later wave — the cheapest version is a system message posted into the
client's project thread the moment a "Buy it myself" order settles (the direction already builds
this exact channel via SP-13; reuse it: *"[Client name] bought the Heirloom Oak Dining Table —
$4,200.00, credited at your trade rate."*), so the designer learns from the channel she's already
watching, not a portal screen that doesn't exist. (2) Give the FF&E-schedule join a wave number and a
backend-delta line of its own — even a stub ("a read-only list of attributed direct orders, filterable
by project, W7") — rather than leaving it as prose with no place in the ledger at `:393-396`. As
written, the promise in the sentence "the piece on his FF&E schedule" is aspirational language
describing work this direction doesn't do and doesn't schedule.

---

## Major

### M1 — "Credited at her trade rate" doesn't say which of three `commission_rate` columns pays her

**Section hit.** §5, order-sheet copy (`direction-b.md:172`, repeated at M5a `:608`) against the
migration description (`:188-189`).

**Problem.** The client sees, before paying: *"Ordered in your name. Leah sees it on your project and
is credited at her trade rate."* That is a specific, legally-flavored promise, and the mechanism
behind it is underspecified. The schema already has **three** things named `commission_rate`, and B's
migration adds a fourth without saying which of the other three it derives from: `products
.commission_rate NUMERIC(4,2)` (`supabase/migrations/00152_three_layer_catalog.sql:52`, a per-product
figure that predates any notion of a specific client's designer), `designer_earnings.commission_rate
DECIMAL(5,4)` (`supabase/migrations/00014_portal_business_features.sql:313`, on the earnings ledger
itself, alongside a `source_type` column whose comment already anticipates `'product_commission'` and
an `order_id UUID -- Future: when orders table exists`, `:304`/`:308`), and now B-5's new
`direct_orders.commission_rate numeric` (`direction-b.md:188`). "Her trade rate" reads as a
per-designer, per-relationship figure (what a boutique studio actually marks up at); the only
existing column that could plausibly seed it (`products.commission_rate`) is a per-product platform
figure that has nothing to do with which designer is attached to the order. If B-5 snapshots from
`products.commission_rate`, the client-facing sentence is describing a number that isn't actually
Leah's rate — it's the catalog's. If it's meant to be a genuinely new, per-designer figure, that's a
config surface (who sets it? per client? per project? a flat platform default?) this direction never
names.

**Evidence.** `direction-b.md:172, 188-189, 608`; `00152_three_layer_catalog.sql:52`;
`00014_portal_business_features.sql:299-313`; F22(=F26), F152.

**Fix I'd accept.** One sentence naming the source: "`direct_orders.commission_rate` is snapshotted
from `products.commission_rate` at create" (if that's the intent — and if so, soften the client copy
to "credited at the piece's standard rate," not "her trade rate," since it isn't negotiated with her)
— or, if a real per-designer rate is intended, name where it lives and who sets it, as its own line
in the backend-delta ledger.

### M2 — The fix for "money rail behind an unlabeled monogram" rides the one amendment Kody has already said no to once

**Section hit.** §8, B-1 (`direction-b.md:289-301`) and §9 Risks (`:412-414`).

**Problem.** All three panelists name the same shot-level complaint independently: D1-15/D2 (implicit
throughout T8)/D3-15 — the Studio, where every proposal, invoice, and decision lives, sits behind a
36pt unlabeled monogram in the hardest-reached corner of the screen. B-1 is the correct fix (a
labeled, primary-nav destination) and the document is honest that it's the riskiest lever it pulls:
*"The tab bar is the one change Kody has ruled against before; it rides its own flag for exactly that
reason"* (`:412-413`). But the rollback plan for that flag is: *"the present `DailyRoomView` + orb
root stays mounted on the off branch for one release"* (`:301`) — which means if the tab bar is
vetoed again, the exact discoverability problem all three designers flagged as blocking-adjacent
reverts to unsolved, and nothing in W2 or W3 offers a second way to surface Studio that doesn't
depend on the tab bar shipping. The direction bets its single highest-consensus designer complaint
on its single highest-risk amendment, with no non-tab-bar fallback named.

**Evidence.** `direction-b.md:289-301, 412-414`; D1-15, D3-15; `research/2x-panel-d1.md` T8;
`research/2x-panel-d2.md` T8; `research/2x-panel-d3.md` T8.

**Fix I'd accept.** Name a fallback that doesn't require the tab bar: at minimum, label the monogram
("Studio") and give it a persistent badge count when something is waiting, so the discoverability
fix degrades gracefully instead of reverting to zero if `house-first` stays off.

### M3 — The damage/liability claim route is a named line with no name in it

**Section hit.** §5, "Returns and damage" (`direction-b.md:225-228`).

**Problem.** D3 opens his entire walk with one question — *"if my client buys a $3,200 sideboard in
this app, who gets paid, who's responsible when it arrives damaged"* — and closes with the specific
memory of eating that exact call once already for a piece he didn't even sell. B's answer: *"it
reserves the line, prints the seller of record and the claim route ('Message your designer' on Path
B; a named support contact on Path A), and flags the policy text as a Kody ruling that prints from
config once written."* The seller-of-record line ("Sold and shipped by Patina." / "Sold by Nordic
Atelier, Aarhus.") is a genuinely good, concrete fix — see below. But the claim-route half is thinner
than it reads: "Message your designer" is listed for Path B, which in this direction never produces a
Patina-mediated order at all (Path B is a message asking Leah to source the piece on her own rail —
there is no `direct_orders` row, no seller-of-record disclosure, no Stripe transaction to have a claim
against). The claim route that actually matters — for **Path A / "Buy it myself,"** the case with real
money moved through Patina and a designer credited on the row — is "a named support contact," and the
document never names it. Is it Patina support? The vendor? Does the designer get CC'd automatically so
she isn't blindsided by the client calling her anyway, official responsibility or not — which is
D3's actual lived experience, not a hypothetical?

**Evidence.** `direction-b.md:225-228`; `research/2x-panel-d3.md` (opening framing and F144).

**Fix I'd accept.** Name the Path A contact concretely (even "Patina support, cc'd to the designer of
record when one exists" is enough to write down), and state explicitly that a damage claim on an
attributed order auto-notifies the designer in the project thread — the same mechanism B1 above asks
for on the purchase event itself. One notification path can plausibly cover both.

---

## Minor

### m1 — "She is the subject of the record" shares its list with catalog marketing

**Section hit.** §2, the day's row example (`direction-b.md:28-30`) and §6.2 (`:240-241`).

**Problem.** §6 states the design intent plainly: *"She is the subject of the record. Every row that
is her work reads as hers."* The record's own worked example includes a row that isn't hers at all:
*"Three pieces joined Patina this week."* `Aug 25` (`:30`), sitting in the same five-row list, same
visual weight (per M1's spec, only muted text-color distinguishes it, `:482`), as *"Leah asked about
the rug colour."* The ordering rule (what needs you, then what moved) puts it last, which mitigates
this, but the list that's supposed to make her the subject still gives catalog freshness a byline
alongside her name.

**Evidence.** `direction-b.md:28-30, 240-241, 482`.

**Fix I'd accept.** A visual or textual tell that separates "from your designer" rows from "from the
catalog" rows within the same list — even just a leading glyph or a second eyebrow line — so the
record reads unambiguously as hers first.

### m2 — D1's stated highest-value ask — a save that reaches the designer — isn't in this direction, even as a named future item

**Section hit.** §3, "The investment the app remembers" (`direction-b.md:100-114`).

**Problem.** D1's own closing list ranks this above the commission question: *"A save that reaches my
FF&E schedule is worth more to me than any commission Patina could pay... it is the only kind of
shopping in here I would actively encourage"* (`research/2x-panel-d1.md`, "What I want my client doing
here" #4). §3's investment table lists "Saved pieces" with its destination as "Pieces tab → Saved
segment; and the room they were saved into" — nothing about the designer ever seeing what a client
saved. This isn't necessarily wrong to leave out of an iOS-scoped direction, but unlike the FF&E-join
gap (B1, which the document names and defers), this one isn't named at all — a reader would not know
it was considered and cut versus never considered.

**Evidence.** `direction-b.md:100-114`; `research/2x-panel-d1.md` "What I want my client doing here"
#4.

**Fix I'd accept.** One line in §10 ("what B deliberately does not do") naming this as a cut, the way
the document already does for compare surfaces and cart.

### m3 — Path C isn't tier-branched the way A and B are

**Section hit.** §5, Path C row (`direction-b.md:167`).

**Problem.** Path C ("Ask about this piece," for null-price/made-to-order pieces) is given to "any
tier," with mechanism "same sheet; with no designer it writes to the `leads` rail with a
`product_id`." Paths A and B both branch explicitly by tier (A excludes anyone with a designer
engaged; B is engaged/activeProject only). Path C's "with no designer" phrasing implies a branch
exists but never states what happens at engaged/activeProject — does it collapse into Path B's
messaging mechanism (consistent with the rest of the section), or does it still write a `leads` row
even for a matched client, which is the exact duplicate-lead failure mode SP-07 exists to close
(F24=D2-19, D1-14)?

**Evidence.** `direction-b.md:163-167`; F24, F111, F128; `shared-planks.md` SP-07.

**Fix I'd accept.** One clause: "at engaged/activeProject, Path C routes through Path B's thread
instead of the `leads` rail."

### m4 — "Buy it myself" at engaged tier (no project yet) never says where the order attaches

**Section hit.** §5, "Buy it myself" (`direction-b.md:169-172`) against M7's own states row
(`direction-b.md:677`).

**Problem.** Correcting my own first pass: §5's Path B mechanism at engaged tier (no project) *is*
specified — just not in §5's prose. M7's screen sheet, four sections later, names the branch in its
"States" row: *"no project yet → `rpc_start_direct_thread`"* (`:677`), matching SP-13's own two-RPC
split (`shared-planks.md:439-446`). That closes the gap I originally flagged for messaging. What
remains genuinely open: §5 also gives engaged-tier clients the **"Buy it myself"** act (*"At
engaged/activeProject the piece's primary act is 'Ask Leah to source this'. Underneath it... 'Buy it
myself'"*, `:169-170`) — and unlike the messaging path, nothing anywhere names what a "Buy it myself"
order does with `direct_orders.project_id` when there is no project to reference. Does it ship null?
Does the order silently wait for a project to exist? This matters because M1's `designer_earnings`
citation shows the ledger's existing shape leans on `proposal_id`/project-adjacent fields — an
engaged-tier order with a null `project_id` is a real, not hypothetical, row this migration will
produce on day one (any activeProject *or* engaged client can tap "Buy it myself" per §5's own tier
line).

**Evidence.** `direction-b.md:65-73` (engaged tier has no project-scoped block yet), `:169-172`,
`:677`; `shared-planks.md:439-446`.

**Fix I'd accept.** One line: state whether `direct_orders.project_id` is nullable for an
engaged-tier "Buy it myself" order, and if so, whether B1's proposed system-message notice (into
`rpc_start_direct_thread`'s thread) still fires the same way it would for a project-scoped one.

### m5 — The inbox effect of four new "Message" entry points is asserted, not modeled

**Section hit.** §6.3 (`direction-b.md:242-244`) against D2's stated test.

**Problem.** D2's whole review is organized around one question: *"would sending clients here cut
Tuesday's forty emails in half, or triple them?"* B adds a message act to the home block, the piece
screen, and the decision screen (via SP-17's "not yet"/"neither"), each pre-contexted per §6.3. The
document asserts this arrives "pre-contexted" and names D2's inbox concern directly, which is the
right instinct — but it never states the compounding fact that matters to her test: because
`rpc_start_project_thread` is idempotent (one thread per project, per SP-13), every one of these entry
points funnels into the **same** thread rather than spawning new ones. That's actually good news for
D2's test and the document should say so explicitly, rather than leaving a reader to trace it through
a different plank's citation.

**Evidence.** `direction-b.md:242-244`; `shared-planks.md:445` (idempotent, one thread per project);
`research/2x-panel-d2.md` opening framing.

**Fix I'd accept.** One clause added to §6.3: "...and because the thread is idempotent per project
(SP-13), every one of these entry points adds a message to the same conversation, not a new inbox
item."

---

## What is genuinely good — the author must keep this

1. **"She is the subject of the record" is the single best fix in the document, and it answers the
   #1 complaint from all three seats at once.** D1's name appeared once, on a bill (D1-01). D2's
   appeared once, "Aspen Loft Refresh · from Leah Hartwell." D3's appeared once, same line. §6.2's
   rule — every row that is her work reads as hers, by name, permanently, from the moment a designer
   exists — is exactly the fix all three asked for independently, and §2's worked example proves it's
   drawable, not aspirational (`:67-68, 480`).

2. **The acquisition CTA is correctly suppressed, and correctly deferred to the plank that already
   fixes its root cause.** §6.4 turns off "Get design help" wherever a designer exists, and does it by
   citing SP-07's one-line filter fix rather than re-designing the engaged-tier surface — which is
   exactly the instruction the grounding gives ("do not design a new module for it"). This directly
   kills D1's worst-case scenario (T9: "the single worst screen in the app for my business") and
   D2's stated deal-breaker (a client filing a duplicate lead she'd have to sort out).

3. **The attribution migration is real, additive, and reuses a ledger the schema was already built
   for.** B-5's columns are nullable and additive; the earnings credit reuses `designer_earnings`, a
   table whose own 2026-era comment (`00014_portal_business_features.sql:308`) already anticipated
   "when orders table exists." This is the right way to close F22(=F26)/F152 — genuinely low-risk,
   genuinely grounded in what's already there, not invented.

4. **"Ordered in your name. Leah sees it on your project and is credited at her trade rate."
   disclosed before payment, not in fine print.** This is precisely the honest compromise D1 asked
   for: Walt isn't blocked from buying his own chair, and the disclosure that Leah is credited is the
   first thing he reads about it, not something he'd have to dig for. (M1 above is about the mechanics
   behind the sentence, not the decision to put the sentence there in the first place.)

5. **The seller-of-record line defuses D3's exact fear before it happens.** "Sold and shipped by
   Patina." / "Sold by Nordic Atelier, Aarhus." — stated in the order sheet, before money moves — gives
   Tom language he can point to the moment a client calls him about a damaged sideboard he didn't
   sell. That's the single most on-target fix for D3's opening framing in the whole document.

6. **The Companion orb finally stops covering the button it should be helping with.** B-2 moves it out
   of the content plane into the tab bar's trailing slot. D1-34, D2-08, and D3-24 all independently
   caught the same shot — the orb clipping "Sign proposa[l]" — and B-2 is a correct, minimal fix that
   also correctly scopes its supersession (only SP-19's Hearth clause, leaving SP-19's status-bar and
   44pt-target work standing, `:311-312`).

7. **The Ask-designer message is pre-contexted, not a blank compose box.** M7's sheet pre-fills the
   piece, price, and room into an editable message before it ever reaches Leah's thread — this is the
   structured-lead behavior D1 explicitly wants over an unstructured text ("her inbox arrives
   pre-contexted," `:244`), and it's the part of the design that's genuinely original to B rather than
   inherited from a plank.

8. **Decisions keep the designer's queue truthful instead of inventing a new state for "I don't
   know."** SP-17's "not yet"/"neither" routes into the same project thread and leaves the decision
   `pending` — which both gives the client a real way to ask a question (closing D1-19/D2-14/D3-09's
   "no colour, no way to ask" complaint) and avoids a new status a designer's queue would have to
   learn to read. B correctly inherits this rather than re-designing it.

9. **The order/push vocabulary is reused verbatim, not invented twice.**
   `_shared/fulfillment-templates.ts:31-37` serves both the existing BOH rail and the new
   `direct_orders` rail — one set of states
   (`confirmed/in_production/shipped/delivered/eta_change/substitution`), one push template set,
   which keeps M8's "Ordered" screen and any future portal surface speaking the same language a
   designer already knows from the fulfillment side.

10. **Every money-adjacent lever is flagged, additive, and named at the same wave it ships in.** Four
    PostHog flags, fail-closed, the pre-amendment root kept mounted for one release — the kind of
    discipline that protects a designer's trust in the *platform*, not just the screen: nothing here
    risks a broken ship landing on a live job the way D1 and D3 both explicitly said would end the
    relationship.
