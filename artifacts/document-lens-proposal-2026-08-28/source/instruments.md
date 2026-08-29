# Appendix — Review instruments, "The Smart Lens" (paste into briefs verbatim)

**The ask (Kody, 2026-08-28) — verbatim, quoted in every brief:**

> "We are getting close to a design that feels right on the document. The spine on the left is still cluttered and could be better utilized to navigate the ins and outs of the document. The main header contains great info but takes up most of the screen height when opened up, each section is crammed into the next and the margin seems cramped for the space needed for the functionality it contains. Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work with them to design the document so that it contains the needed information and actions, while feeling uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on what is needed as the designers move through the document. Present your strongest proposal to achieve this in an html document accompanied with a high fidelity mockup showcasing how the team will accomplish this challenging User experience and UI requirements."

The unit of analysis for every seat in this program is **four scroll states x three widths**: `s0 top` (scrollY 0) · `s1 seam` (the letterhead just gone, the ticket pinned as its two-line seam) · `s2 mid` (the FF&E region head at the top of the frame, under the seam) · `s3 foot` (the Record and colophon in frame); at 1440x900, 1280x800 and 390x844. A finding without a scroll state is out of scope.

---

## §1 Task script (T1–T16)

Walkers run T1→T16 in order, in one sitting, as one week. Never skip a task because it "obviously has no path" — narrate the search; the search is the finding. P1 additionally runs T1 as "back after ten days away".

The last two columns are new for this program. *Where in the scroll it lives* is the scroll state at which the task's door or answer is actually on screen (`top` · `seam` · `mid` · `foot` · `all` — `all` means the door is sticky chrome, an overlay sheet, or off the document entirely). *What I passed to get here* names the blocks in mount order she scrolled through to reach it — that column is the frame-budget indictment written as a path.

| # | She says | Path today | Stage(s) | Success looks like | Where in the scroll it lives | What I passed to get here |
|---|---|---|---|---|---|---|
| T1 | "Tell me what today actually needs — across everything." | `/desk` → Needs-your-hand folios + Studio Pulse (`desk/page.tsx:28-31,340`) | all | Narrates her day in <2 min without opening a document | all — off the paper entirely; inside a document the top band is the nearest thing and it answers for one job | nothing; the desk is the entry. Inside a doc, everything: the whole paper answers one client |
| T2 | "Show me everything that's in install." | **none** — no fleet/roster tier; ⌘K searches names, not phases | project/install | One surface answers a phase-wide question (open T4) | all — no scroll offset holds it, on any spread | n/a — there is nothing to pass |
| T3 | "What's my next move on this one?" | `/doc/[id]` guide; precedence gate → need → proposal lifecycle → stage default (`document-guide.ts:316-398`) | all 7 | One sentence, one named act, one click to where it happens | top — `document-guide.tsx` XOR `red-letter-zone.tsx` is the third block on the paper | letterhead (40px title + household + 11px vitals + Phases fold + optional 44px in-hand row) then the 8-row job ticket (~300px unfolded) — ~600–700px of the 900 frame before the sentence |
| T4 | "Change the fabric on the living room sofa." | Project · FF&E region → room heading → line unfold; ≥1440 room lens lifts, never filters | project, install | ≤2 acts to the editable line | mid — the FF&E region inside `worktable/table-frame.tsx` | letterhead · ticket · guide/red-letter · `letterhead-instruments` · approvals (`mt-6 py-6`) · schedule frame (`mb-4`) · stage line · ScheduleSpine · RoomFilesSection |
| T5 | "Pull up the mood board for the primary bedroom." | ≥1440 shelves → Mood boards leaf → `/board/[id]`; <1440 **none** except desk Recent boards / ⌘K by name; speccing stage prints a strip | direction, project | Boards reachable at every width and from their room | top only — the `Boards` leaf is a job-ticket row; the two-line seam carries identity + worst two exceptions, so the door is gone from `s1` down | letterhead |
| T6 | "Where's the floor plan? Where's the spec book?" | ≥1440 Plan room / Spec book leaves; ⌘K "The plan room"; <1440 **none** | project, install | Reachable on a 1280 laptop | top only — `Drawings` and `Spec` are ticket rows; both leaves are dead below 1440 (no routes) and gone from `s1` down at 1440 | letterhead |
| T7 | "Did the Hendricks ever open my proposal? Nudge them." | Proposal section send-wall state line (I137 SP3); from desk only if a `hesitating_proposal` need derives | proposal | Sent-state + age legible without opening the doc | mid — on the proposal spread, inside the section body | letterhead · ticket · guide · instruments (the proposal spread has no approvals or schedule regions to pass, and no running index in the rail) |
| T8 | "Add the mudroom." | FF&E → "Add a room" scored-ink line at the foot of the room list (I137 SP4) | project | Found unaided, first pass | mid, deep — below all four rooms of the FF&E body | everything through T4's path plus the entire room list (Living 14 lines · Dining 8 · Primary 9 · Mudroom 5) |
| T9 | "Bill the deposit. And who still owes me?" | doc money region + account band; ⌘K "Draw an invoice"; Accounts sheet `g a`; desk receivable lines | project, install, care | Picks one door without a shrug; paid/unpaid/due in one glance | mid→foot for the money region and AccountBand; `all` for the `Money` ticket row and ⌘K | the full FF&E region — the longest body on the paper — then MoneyRegion (`mb-5`) |
| T10 | "Install slipped a week — move it and tell me what it hits." | Schedule region → date edit → ripple (`schedule-ripple-derivation.ts`) | project, install | Sees downstream damage before committing | seam **and** mid — `schedule/schedule-rule-region.tsx` sits at `mb-4` above the stage line (folded by default), the ScheduleSpine again inside the worktable | letterhead · ticket · guide/red-letter · instruments · approvals |
| T11 | "Put this down, pick up the Byrnes." | Esc / Put down → `/desk` → folio; or ⌘K (D1 forbids tabs/split) | all | One trip; she knows which trip | all — `doc-spine.tsx:48`, top of a sticky h-screen rail | nothing; it never leaves the frame at ≥1180. At 390 it is behind the mobile bar's More |
| T12 | "New inquiry — start them." | ⌘K "Capture a lead · begin a Brief" → `/ceremony/[leadId]`; or "Open a project · no proposal needed" (`registry.tsx:253-278`) | brief | The difference between the two verbs is obvious before picking | all — ⌘K only; pure recall, no scroll offset holds it | nothing on the paper |
| T13 | "Did Sturdy Oak confirm the PO?" | Orders sheet `g o` → vendors page; or a `po_unacknowledged` need routes to the ledger (`document-guide.ts:208-245`) | project, install | Ack state visible per PO without leaving the project's frame | all — the answer is off-paper, on a sheet over it; the door is the ticket's `Money` row (top only) or a chord | letterhead, if she uses the ticket row; nothing, if she uses `g o` |
| T14 | "The console came in damaged — file it." | Orders → Receiving page (`damage_claim` / `awaiting_inspection` needs) | install | Claim filed where she saw the damage | all — off-paper sheet; the damage is visible in the FF&E line at `mid`, the claim is not filed there | the FF&E body to *see* it, then out of the document to *act* on it |
| T15 | "Who's on this job? I need the painter's cell." | Call sheet doorway (flag `call-sheet`, absent when off, `shelves.ts:52-58,75-88`); ⌘K "Open the call sheet"; People `g p` | project, install | One roster, reachable with the doc in hand | top only — the ticket's `People` row opens the call-sheet overlay; gone from `s1` down | letterhead |
| T16 | "Client asked a question — answer it where it's on the record." | The Post bell / `g t` → `/people?thread=`; or a `message` margin item | all | Reply lands on the record without leaving the project | all — the margin rail is `sticky top-0 h-screen` at ≥1440, a fixed sheet at 1180–1439, chips behind the bar at 390 | nothing at 1440; at 1280 the sheet must be opened first, and it covers the paper |

---

## §2 Practitioner personas (Interior Design team)

**How to walk (all four, every task), first person, present tense:**
```
T{n} — {the task in my words}
First glance:      what my eye lands on in the first 3 seconds, named literally
Where I'd click:   the exact word/control I'd reach for, and why
Where I'd hesitate: the moment I stop, and what I'm asking myself
Where I'd give up: browser tab / call someone / old tool — or "didn't"
Frame budget: of the screen in front of me, what fraction was carrying this task?
Obviousness: {1-5}  (1 could not find · 3 second guess · 5 without thinking)
```
The `Frame budget` line is mandatory and never skipped. Answer it as a fraction or a percentage of the visible frame plus one clause naming what the rest of the screen was doing — e.g. "about a fifth; the other four fifths were the letterhead and the ticket telling me things I already knew". Name the scroll state you are in (`top` · `seam` · `mid` · `foot`) on every task.

Rate *what to do* and *how to get there* separately when they differ. Quote labels verbatim. "I expected a ___ and there wasn't one" is the deliverable.

**P1 · Solo residential principal, 6 live projects (Leah-like) — Opus.** Madison WI; two-person studio, one job always in install. Came off Ivy (kept invoicing, resented double entry) and a Google Sheets FF&E schedule she trusts more than any app; Houzz Pro one season. Phases = the Patina Six (Consultation · Schematic · Development · Procurement · Installation · Completion; `the-document-schedule-package.md:117-118`). Expects, in order: where this job is right now, what's late, what the client is waiting on me for, the FF&E schedule. Metaphor tolerance high but conditional — will not accept one that costs a click or hides a number; her tell is fleeing to the old portal rather than arguing. Stakes: an unopened proposal past her real patience window; install week with a missing/damaged piece; Tuesday triage from one screen. Grounded in `leah-session-01-first-tuesday.html` (time-to-true-read, unaided margin acts, old-portal flights, "did the margin feel like your work or like notifications?") and `leah-session-05-one-pager.md` (which phase makes her sigh; the two-hour credenza retrace).

**P2 · Principal of a three-person studio — Sonnet.** Milwaukee; two designers + a procurement coordinator; Studio Designer (bookkeeper insists) + Dropbox + Monday meeting; eleven live jobs. Expects first: who has the ball, what changed since Friday, what's about to cost us money. Reviews FF&E, never edits it. Tolerance low-to-medium; won't tolerate asking a junior where something is. Stakes: reading eleven jobs before Monday's meeting (today = open eleven documents); a junior's uncommitted PO before the vendor's price expires; an install date moving unannounced. **Her test: strict one-document focus (D1) meets an oversight job** — say where it costs her and what, unsoftened.

**P3 · Junior designer, week one — Sonnet.** 24, Minneapolis, two years out of school; Mydoma internship, Canva, Excel. No legacy portal to flee to; only escape is asking. Expects a list of what I'm supposed to do in school words: floor plan, furniture schedule, purchase order, invoice, punch list. Tolerance near zero on first contact — recognition, never recall. Stakes: finding the FF&E schedule unaided; finding "the board"; "did that PO go out?" in front of a client. **Special assignment:** on every screen list *every* label she cannot define from the label alone, verbatim — start with `Client approvals`, `Schedule`, `Project · FF&E`, `Design authority` (`document-index.ts:36-52`) and `Plan room`, `Spec book`, `Mood boards`, `Call sheet`, `Knowledge` (`shelves.ts:33-72`); say what she thought each meant before clicking. **Second assignment for this program:** name every element that was on screen and then was not, with no act of hers in between — and say what she thought had happened to it.

**P4 · FF&E/procurement-heavy designer — Sonnet.** Oak Park IL; six-figure FF&E budgets, quarterly installs; Design Manager for POs/receiving, a freight portal, a printed binder at install. Expects first: the FF&E schedule with order status per line, then what's arriving this week, then exceptions (unacknowledged, backordered, damaged). Tolerance medium; rejects any composition that separates a piece from its PO state. Stakes: install-day minus 10 reconciliation; a damage claim inside the carrier window; a vendor who never acknowledged. **Special assignment:** on T13/T14 note every time the answer requires leaving the document for a ledger sheet and whether the return trip preserved her place (sheets are supposed to slide over the document, `registry.tsx:53-54`, D8) — and whether it preserved her **scroll offset**, which is a separate question and the one this program cares about.

---

## §3 UX/UI lens briefs

All five lenses analyse the **four scroll states x three widths** grid and say so per finding. A claim about "the document" that does not name a state and a width is not a finding.

**U1 · Attention & focus architecture (Opus, high effort).** Heuristics: Tufte's data-ink ratio; Nielsen aesthetic-and-minimalist design; preattentive features and visual hierarchy; working-memory chunking (~4 items); foveal vs peripheral load; progressive disclosure; signal-to-noise as a measured ratio, not a mood.
(1) At each of the twelve state-width cells, classify **every** element on screen into exactly one of *carrying my task* / *orienting me* / *neither*; give px area and % of the frame per class, and reconcile the totals with the frame budget in `12-layout-measurements.json`. Disagreements with the measurement file are findings against the file or against the classification — say which.
(2) Name every pair of elements on one screen where the second answers a question the first has already answered. Start where the duplicates are cheapest to prove: project identity (40px letterhead title vs the folded seam's identity line), stage (the tab plate vs the vitals row vs the guide sentence), money (the ticket's `Money` row vs the MoneyRegion head vs the AccountBand), install date (vitals vs the ticket's `Dates` row vs the schedule head).
(3) Define the **irreducible set** — what may never leave the frame at any offset — and defend each member by naming the exact moment its absence costs an act. A member you cannot defend that way is not in the set.
(4) Where does always-visible cost more than it gives? Name every element present at all four states and say at how many of them it is actually read.
(5) At 1440 `s0` the first region head lands at y 700–790 of 900 (78–88%). Say what fraction of that band is a decision she already made, and what would have to become true for the first head to land at 405px (45%). Do not design the answer; state the arithmetic constraint.
(6) Chunking: count literally how many independent things the top band asks her to hold at once at `s0`, at each width. Then count at `s1`.
(7) The 1180–1439 tier drops the 200px rail to a 56px glyph column and the 232px margin to a fixed sheet. Using your own classification numbers, say whether attention improves or degrades and by how much — this is the natural experiment already in the code.
(8) Name every place where the ask's "uncluttered" and Patina's "nothing hides" genuinely pull apart — where a quieter screen would be an emptier screen that has lost a fact. These are the decisions the proposal must make, and naming them is the deliverable.

**U2 · Disclosure & scent (Sonnet, medium).** Heuristics: information foraging and scent (Pirolli & Card); progressive disclosure; Norman signifiers; recognition over recall; change blindness; the closed-door problem.
(1) Inventory **every** disclosure on the document today, one row each: trigger · persistence layer · what unmounts vs what stays mounted · what the closed form still says. Cover at minimum the Phases fold in `letterhead-vitals.tsx`, the ticket seam (`job-ticket.tsx:362`, sentinel `:345`), `region/use-region-fold.ts` per region, the schedule frame's folded-by-default, the ticket's room chips, the margin's Drafts collapsible, the 1180–1439 margin sheet, and the 390 Sections sheet.
(2) For each: is the closed form distinguishable from **empty** on sight, with no hover and no expansion? `use-region-fold` unmounts the body and leaves a 44px `FoldSeam` — say precisely what that seam tells a returning designer about a region holding 16 lines versus a region holding none.
(3) What scent survives condensation? Per region, name the one string that must still print when the region is out of frame, and say whether a number, a count or a word carries it.
(4) State the **rule** that decides which regions may yield and which never may (the red-letter zone and money are the obvious never-yield candidates) — a rule, not a list, so it survives a region we have not built yet.
(5) Name every moment a designer is surprised by a disappearance: an element on screen at one offset and gone at the next with no act of hers between. Give the offset.
(6) The fold key `patina:doc-fold:{docId}:{region}` outlives the session and the document. Where does a returning designer inherit a state she cannot see she is in? What breaks when `forceOpen` (voice 1) overrides a stored choice (voice 2) that overrides a latched default (voice 3)?
(7) Scroll-position condensation and chosen folding will coexist. What must be visibly different between them, and what happens when both are true of one region at once?
(8) For each region, write the sentence a condensed state must be able to say in <= 40 characters. If a region cannot say anything true in 40 characters, that is the finding.

**U3 · The spine as instrument (Sonnet, medium).** Heuristics: Lynch's legibility (paths, edges, districts, landmarks); map vs list; You-Are-Here; Gestalt common region and continuity; Fitts on a 200px column; scent.
(1) Ink vs void: from `12-layout-measurements.json` (`inkPx / railHeightPx`, longest empty run, interactive-child count, marker-row extent), state what the rail *is* at each of the four scroll states, at 1440 and at 1280.
(2) Apply the 2026-08-14 second-look test — *"something earns the left edge only if it is true across the whole document at once, or true outside this document"* — to each current tenant in turn: Put down (`doc-spine.tsx:48`), the seven-mark row (`:99-110`), the active label pair, `spine-running-index.tsx`, `spine-timer.tsx`, the presence line, the `doc-breath` on the active mark. Rule each **in** or **out**, with the sentence that decides it. The rail's top third mixing four tenses (leaving / the whole arc / this minute / right now) is the diagnosis to test, not to assume.
(3) The seven StrataMark markers sit in a **horizontal** row inside a vertical column at >=1440, with future marks inert. Say what that arrangement teaches correctly about the arc, and what it teaches wrongly about *this* document's depth.
(4) `spine-running-index.tsx` prints regions only on the project spread (approvals/schedule/ffe/money; approvals+ffe on install/care) and **nothing** on brief/discovery/direction/proposal (`lib/document/document-index.ts` `paperRegionsForSection`). Describe the pre-work rail as P3 reads it in week one. Then say what an index line reads with no number behind it — an empty region's line is a design problem before it is a data problem.
(5) At 1180–1439 the rail is a 56px glyph column. Enumerate exactly what is lost and whether any of it re-appears anywhere else at that width.
(6) If the rail were a map of the paper's **depth** rather than a second copy of its headings, name what it would have to show that it does not today: position within the whole · each region's extent · which regions carry an exception · distance to the next thing that needs her · where she has already been.
(7) Where should Put down, the in-hand timer and the presence line live if the rail becomes a map, and what does moving each one cost? Answer for both desktop widths.
(8) Say what a navigator would need to know before touching the rail that no measurement in this evidence pack tells her.

**U4 · Motion & choreography (Sonnet, medium).** Heuristics: object constancy and motion-as-continuity; the 100/300/1000ms perception bands and the Doherty threshold; anticipation and follow-through only where they carry meaning; hysteresis / Schmitt trigger; WCAG 2.3.3; layout thrash and cumulative layout shift.
(1) For each existing move — `doc-raise` 270ms (`globals.css:249`, applied `page.tsx:1764`), `doc-sheet-up` (`:237`), `doc-breath` 3s (`:271`), `fold-in` / `fold-arrow-flip` 300ms `--ease-editorial` (`:404-437`), `desk-settle` 320ms + 60ms stagger (`:384`), `strata-sweep` (`:468`), `.row-wash` 260/200ms (`:327-349`), `.doc-elevated` (`:294`) — write the sentence a designer would say about what just happened. Name any move that means nothing.
(2) Scroll-driven condensation needs honest thresholds. At what offset does a region leave `full`? What hysteresis band prevents oscillation at the boundary? The existing precedents are `use-document-running-index.ts`'s `-20% 0px -62% 0px` band and its 700ms jump lock — say whether they are the right shape for density, and give numbers that survive a 4x slow reading.
(3) State the rule for what may animate on a condense and what may never. Layout properties (height, margin, grid-template-rows) move everything below them; the R99 precedent is a rule that "pins beneath the title at reduced height, labels fold into the line, zero layout shift". Say whether that precedent generalises.
(4) Momentum: a trackpad fling crosses three thresholds in 200ms. What does the lens do on the way down, and what does it do on the way back up? Asymmetry here is a design decision, so name it.
(5) Give the reduced-motion equivalent of every behaviour as a **form** — a flat tint, an instant swap, a static rule, a printed word — never "n/a" and never "no animation" alone. Say which of the 12 existing reduced-motion blocks needs a sibling.
(6) `doc-breath` is the system's only ambient motion. Does a lens need a second one? If yes, name it, its site, and the sentence it says; if no, say so plainly and defend the budget.
(7) Where would motion produce a change a screen reader never hears — a state change with no trigger and no announcement? Hand these to U5 by id.
(8) Which moves must be identical at 1440, 1280 and 390, and which must differ? Give the reason per move, not per width.

**U5 · Reach (Sonnet, medium).** WCAG 2.2 AA, cited by success criterion number. Every finding names a state and a width.
(1) Landmark map of `/doc/[id]` at each width. Can a screen-reader user reach the margin rail without traversing the whole paper? What is the DOM reading order at 1180–1439 when the margin is a `fixed` sheet rather than `col-start-3`?
(2) **2.4.11 Focus Not Obscured (Minimum).** The ticket seam is `sticky top-0 z-[4]` (`job-ticket.tsx:362`) and publishes `--doc-seam-height` (`:60`). Tab to the first act below the seam at each scroll state and say whether it is obscured. Enumerate every consumer of `--doc-seam-height` (`globals.css:1026-1037`, `commercial/money-region.tsx:48`) that would have to change if the seam's height became dynamic.
(3) Focus when a region unmounts under the caret: `use-region-fold` unmounts the folded body. Where does focus go today (`region/fold-seam.tsx`)? Where must it go under a lens that condenses on **scroll** rather than on a click — an act the designer never took?
(4) **2.3.3 Animation from Interactions** and **2.2.2**: scroll-driven condensation is motion she did not ask for. State the reduced-motion contract, and say whether `prefers-reduced-motion` alone is sufficient or whether a visible control is required.
(5) **4.1.2 / 4.1.3**: a region changing density is a state change with no trigger. What must be announced, on what element, and how often before announcement becomes noise? Note there is no toast layer (R83) — announcements are inline.
(6) **2.5.8 Target Size (Minimum)**: every target under 24x24 at 390, and under 44x44 wherever touch is likely — the 60px studio drawer strip (`studio-drawer.tsx:289`), the mobile bar's three zones (`mobile/mobile-bar.tsx:216`), the 56px glyph rail at 1280, the margin chips (`margin-item.tsx`).
(7) **1.4.3** contrast per lens state: a condensed region's text will sit at reduced ink weight. Give the floor value, name the ramp tokens (`#4E4339` / `#5A4E43` / `#65594E`) that would fail against paper `#FCFAF6` and rail stock `#E8E3DB`, and say at what weight the floor is crossed.
(8) Any hover-only affordance, at any width, in any state — doctrine says none, so verify, because an automatic return in the rubric depends on the answer. Then say which of T1–T16 are reachable at 390 today, and which of those a lens must not be allowed to make worse.

## §3b Engineering feasibility seat

**E1 · Engineering feasibility (Opus, high effort). Assess, do not design.** You are not proposing a lens. You are telling the authors what each thing a lens could ask for actually costs in this tree. Every answer carries at least one `file:line` and a **cost band**: `days` (one to three days, one engineer) · `week` (about a week) · `weeks` (two or more weeks, or touches a contract other code depends on). Where a cost depends on a choice the authors have not made, give the band for each branch and name the fork.

1. **Condensing the header.** The job ticket is `sticky top-0 z-[4]` (`job-ticket.tsx:362`) with a sentinel above it (`doc-ticket-sentinel`, `:345`) and publishes `SEAM_HEIGHT_VAR = '--doc-seam-height'` (`:60`). What does it cost to make the seam's height a continuous function of scroll rather than a two-state fold? Enumerate every consumer of that variable (`globals.css:1026-1037`, `commercial/money-region.tsx:48`, every `[data-index-region]` scroll-margin) and say what breaks first. Assess `animation-timeline: scroll()` for this — browser support in the portal's target matrix, behaviour under `prefers-reduced-motion`, and what the JS fallback has to be if it is not available. Cost band per approach.
2. **Regions that yield focus.** `region/use-region-fold.ts` folds by **unmounting** the body under three voices (`forceOpen` > `localStorage` > latched default). A density lens needs bodies to stay mounted at reduced ink. Assess: IntersectionObserver thresholds; `content-visibility: auto` with `contain-intrinsic-size` (and what it does to `Ctrl+F`, to the running-index observer, and to scroll anchoring); React 19 concurrency and whether a density change can be a transition. What does the third voice become? Cost band per approach.
3. **The running index everywhere.** `hooks/use-document-running-index.ts` uses a `-20% 0px -62% 0px` band and a 700ms jump lock; `lib/document/document-index.ts` `paperRegionsForSection` returns nothing for brief/discovery/direction/proposal. What does it cost to index every region on every one of the seven spreads, and to bring the index to the 1180–1439 tier where the rail is 56px? Name the data the pre-work spreads would need and whether it exists.
4. **The tests.** Per file, one row: break / rewrite / delete, with the reason and the cost band — `e2e/document/quiet-responsive-shell.spec.ts` (ticket rows = 8; spine widths), `components/document/__tests__/job-ticket.test.tsx` (asserts `--doc-seam-height` at :519/:524/:529), `__tests__/responsive-document-shell.test.tsx` (`data-spine-regime` :187), `__tests__/shelved-spine.test.tsx`, `doc-spine.test.tsx`, `region/__tests__/{use-region-fold,fold-seam,region-head}.test.tsx`, and the trap `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` — a regex pinning <=1500 characters between `data-active-section` and `<SectionStageLineMount`. Say explicitly what happens to that regex if anything is inserted between those two points. Also name the gates that must stay green regardless (`lib/document/__tests__/shadow-gate.test.ts`, `contrast.test.ts`).
5. **The three riskiest things any lens could ask for**, ranked, each with the file it lands in, the cost band, and the observation that would prove the risk real in the first week of building.

---

## §4 Finding schema

```json
{ "id": "U1-07", "lens": "U1", "persona": null, "task_ids": ["T3","T4"],
  "key": "doc|1440|s0|header-stack-eats-78pct",
  "surface": "/doc/[id]", "width": "1440|1280|390|all",
  "scroll_state": "top|seam|mid|foot|all",
  "flag": "off|on|both",
  "title": "Header stack leaves 12% of the frame for the work",
  "observation": "verbatim what is on screen — labels quoted exactly",
  "why_it_blocks": "clutter | crowding | orientation | information-loss | motion",
  "frame_cost_estimate": 700,
  "evidence": { "shots": ["w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:362"] },
  "severity": "blocker|high|medium|low", "confidence": 0.9,
  "already_ruled": null, "suggested_fix": "one line, one move",
  "hesitation_seconds_estimate": 45 }
```

Rules — the wayfinding rules stand, plus three fields new to this program:

- exactly one of `lens` / `persona` non-null; no `task_ids` → drop; `title` <=10 words and states the problem; `observation` verbatim; `evidence` at least one of shots/refs.
- `severity`: blocker = task impossible · high = only by luck or memory · medium = hesitation · low = polish. `confidence` < 0.5 must append "what would settle this".
- `already_ruled` cites the DECISIONS id **for the record only** — under the canon latitude in §5 it is context, never a cost.
- **`scroll_state` is required** and is one of `top` · `seam` · `mid` · `foot` · `all`. A finding without it is out of scope and the collator drops it.
- **`why_it_blocks`** is one of `clutter` (too much on screen at once) · `crowding` (things too close to each other to read as separate) · `orientation` (she cannot say where she is or what she is in) · `information-loss` (something true is not on screen and cannot be got to) · `motion` (a movement misleads, jars, or cannot be stilled).
- **`frame_cost_estimate`** is a number: the px of a 900px frame this defect consumes or wastes at the state named. At 390 normalise to the 844 frame and say so in `observation`. An estimate is fine; a missing number is not.
- `key` = `surface|width|scroll_state|kebab-slug` so identical findings collide across seats. Two seats that find the same thing at the same offset must produce the same key.

---

## §5 Canon latitude

```
CANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md
(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT
penalise them — a refuter labels what a move amends, for the record only. Four hard no-gos
stand and are not re-proposable:
  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent
       global nav over an open doc. Esc / Put down is the exit.
  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),
       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.
       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style
       sweep, not source grep).
  NG3  The Thumb Index — removed by Kody, "do not re-propose".
  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair
       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights
       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),
       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text
       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted
       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal
       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install
       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms
       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,
       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.
       The proposal BUILDS ON this register; it does not restyle it. "Typography goes no further
       than the mockup" (R126). THE STUDIO desk block is untouched.
Kody's taste on record: large tinted surfaces read as "silly/terrible"; colour belongs on small
state-carrying things; "the sections and animated highlighting" were loved; "don't push the
typography further".
Everything else — composition, mount order, disclosure, motion, the spine's job, the header's
job, spacing tokens, what appears when — is open ground.
```

---

## §6 Proposal contract

X, Y, the revisers and the merge author all deliver these eleven sections, in this order, with these names. A missing section is a return.

1. **Thesis** — <=120 words, containing exactly one **falsifiable sentence**: a claim about this design that a measurement in `12-layout-measurements.json` or the mockup probe could show to be false. Underline it or set it off; the judges look for it first.
2. **What stays identical** — mandatory. The R126 register, the tokens, the type scale, the stamps, the tab plates, the wash, the desk block, and every organ you are not touching. A proposal that cannot list what it leaves alone has not decided what it is.
3. **Lens mechanics table** — one row per mechanic, columns exactly: `trigger · what changes · from→to · duration & easing · reduced-motion equivalent · what never moves · F-ids`. No empty cells. `from→to` carries real values (px, opacity, ink weight). `what never moves` is the promise the row makes about layout. `F-ids` cite the verified findings the row answers.
4. **Organ by organ** — spine · header · region heads and spacing · margin · motion grammar · the 1180–1439 tier · 390. Each with a before→after and the **mount-order consequence**: what moves in `page.tsx`'s child order, what no longer mounts, what mounts somewhere new.
5. **The lens state machine** — the five states `at rest · reading · editing · condensed · mobile`. Per state: the lens line, the rail, each region's density, the margin, the entry trigger, the exit trigger, and **the reverse of every transition**. A transition with no stated reverse is a violation of the honesty law.
6. **Frame budget** — a table against `12-layout-measurements.json`: today's chrome / header / work split per scroll state x width, and the target. This is where the falsifiable claim gets its numbers. Targets must at least address SC1–SC4.
7. **Findings addressed** — every verified blocker and high, answered or refused with a reason. A refusal is legitimate; silence is not.
8. **Canon note** — what this builds on in R126, and what it changes that an existing ruling describes: **named, not priced**. Cite the id, quote <=25 words, say what it becomes. Then NG1, NG2, NG3, NG4, each with one sentence saying **how** this proposal leaves it untouched — not a claim, a mechanism.
9. **Engineering path** — waves, each valuable on its own. Per wave: the files by real path, the mechanism, the tests. Answer explicitly what becomes of (a) `use-region-fold`'s three voices, (b) the ticket seam and every `--doc-seam-height` consumer, (c) the running-index observer's `-20% 0px -62% 0px` band and its 700ms jump lock. List every test rewritten or deleted by real path, including the 1500-char regex in `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19`. Name the gates that stay green (`shadow-gate.test.ts`, `contrast.test.ts`). State the rollback for each wave.
10. **Risks** — at least five, each with **the falsifying observation**: the thing we would see, in the first week of building or the first week of use, that proves the risk has come true.
11. **Refuses** — at least four. Things a reader will expect and this proposal deliberately does not do, each with the reason it was refused rather than deferred.

---

## §7 Judge rubric

Seven axes, scored 1–10 each, **never averaged**. Expanded anchors and the critic pass live in `source/rubric.md`; this is the same instrument in short form.

| Axis | 3 | 6 | 9 |
|---|---|---|---|
| 1 Uncluttered & peaceful | Elements are removed but the frame budget barely moves; "peaceful" is asserted, not measured; or the screen is quieter because a fact was deleted | First region head at 1440 rest lands at or under 45% of the frame, with the numbers given; every element removed from a band has a named new home | Every state x width has a measured budget under target, the top band carries at most five things, and a practitioner's walk says it got quieter without saying anything got lost |
| 2 Lens honesty | Something disappears with no reversal in one act; or a condensed state is indistinguishable from an empty one; or a state is legible only on hover | Every condensation names its reverse act and the string it still prints; folded-by-choice and condensed-by-position are visibly different | Plus the <=40-char condensed line is specified per region, the both-at-once collision is ruled, and a designer can tell from a still screenshot which state she is in |
| 3 Orientation at depth | At the foot she cannot say which document, which region, or how to get back; at least one of T1–T16 costs more than today | Identity, stage and current region legible at every offset at 1440 and 1280; all T-tasks <=2 acts at >=1440 | Plus the rail reads as a map (position, extent, exception, distance) on all seven spreads including pre-work, and 390 loses no task the desktop has |
| 4 Engineering credibility | Waves are a program; mechanisms named without files; the three named mechanisms left unanswered; tests unnamed | Each wave valuable alone with real paths; `use-region-fold`, the seam variable and the index observer all answered; test blast radius enumerated; rollback stated | Plus a first wave shipping in days behind a fail-closed flag, the 1500-char regex handled explicitly, the two gates shown green, and any browser-feature dependence carrying a named JS fallback |
| 5 Motion discipline | A move exists that is not in the grammar table; a reduced-motion cell reads "n/a"; a tint larger than a row; layout shift unaddressed | Grammar table complete with every column filled; hysteresis stated with numbers; zero layout shift claimed with the mechanism that delivers it | Plus every reduced-motion cell is a real form carrying the same information, the ambient-motion budget is defended, hysteresis survives a 4x reading, and momentum and reverse-scroll are ruled |
| 6 Still Patina | Restyles the R126 register, pushes the type further, adds a second icon language, or introduces a large tinted surface | Register intact; new organs built from existing tokens, weights and rules; colour only on small state-carrying things | Plus the new organs look like they were always there — a practitioner cannot pick new from R126 in a still — and the proposal names what it deliberately did not restyle |
| 7 The 390 form | 390 is a separate design, or carries a shorter task list than the desktop | The same lens in one column; every desktop task reachable; targets >=44px | Plus the mobile bar and spine sheet speak the same lens vocabulary, the condensed line is the same string as desktop's, and 390 is the state that proves the thesis rather than the one that survives it |

**Automatic returns — and only these two.** (a) Any violation of NG1, NG2, NG3 or NG4. (b) Any hover-only affordance. There is **no** unpriced-amendment return in this program: under §5 amendments are never priced and never penalised, and a returned proposal for naming a ruling would be a scoring error. A refuter labels what a move amends for the record; that label carries no cost.

**J1 · practitioner lens** scores axes **1, 2, 3, 7** and names the persona behind each score — which of P1–P4 is speaking when the score is what it is.
**J2 · product/engineering lens** scores axes **4, 5, 6** and cites a file per cost claim.
Both judges end with (a) which persona is **worse off** under the proposal they favour, named and unsoftened, and (b) an **explicit merge instruction**: which organ comes from which proposal, and what dies.

---

## §8 Mock specimen — "same data, one lens"

**The Vandersteen residence** — Shorewood Hills, Madison WI. Marit & Dale Vandersteen. Studio: Middlewest Studio (Madison). Opened 2026-03-02 · phase Procurement & Orders (4 of 6) · section `project` · **install Tuesday 2026-09-15, three weeks out**. Today is Tuesday 2026-08-25; in-hand timer 0:47; The Post 3 unread (one a Vandersteen question about the mudroom bench; dot only, never a count).

Rooms: Living room 14 lines (11 ordered, 2 in transit, 1 damaged) · Dining room 8 (8 ordered, 6 delivered) · Primary bedroom 9 (7 ordered, 2 awaiting client approval, overdue) · Mudroom 5 (3 ordered, 2 unspecified).

Red-letter zone shows exactly two: **OVERDUE 6 days** — Primary bedroom client approval on the Hartland wool rug + walnut nightstands, sent 2026-08-13, owner Client. **OVERDUE 3 days** — Living room fabric selection for the reading chair; workroom needs COM by 2026-08-22 to hold install, owner Designer.

Unacknowledged PO: **PO-2026-0418** · Sturdy Oak Woodworks, Dodgeville WI · dining table + 6 side chairs · $14,880 · sent 2026-08-11, 14 days no ack · 8-week lead time already past install math. Damage claim: Living room brass-and-oak console, Fond du Lac Ironworks, delivered 2026-08-19, top panel gouged, photographed at receiving, claim drafted not filed, carrier window closes 2026-08-26 (tomorrow).

Second client: **The Byrne remodel** — Cedarburg WI, Erin Byrne, section `proposal`; design agreement sent 2026-08-19, 6 days, never opened; $9,400 fee, four milestones; no nudge sent.

Money: FF&E budget approved $184,500 · specified $171,240 · ordered $141,600 · invoiced $96,400 · paid $78,900 · outstanding $17,500 (Invoice 2026-114, 22 days) · deposit due not drawn $12,300 (PO-2026-0418, 50% at release) · design fee $34,000, 3 of 4 milestones billed · hours this week 6.4 (Mon 2.1 · Tue 4.3).

Desk (six live): Vandersteen (`project`) · Byrne (`proposal`) · Okonkwo kitchen, Middleton WI (`install`, completed 2026-08-14, punch list pending) · Reinhardt lake house, Green Lake WI (`discovery`) · Kaminski condo, Milwaukee (`direction`) · one more quiet project.
