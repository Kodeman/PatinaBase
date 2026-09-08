# Panel review — information architecture & wayfinding

Slug: `ia-wayfinding-designer`. Lens: how each design organizes attention and
return paths for a studio principal carrying 16–43 live jobs, and for a
homeowner who opens one page a week and needs to know what she owes.

Findings were written cold (before §7–8) and then tagged **new** / **known** /
**touches**.

---

## Findings

`ID | sev | conf | surface | claim | evidence | change`

### Desk composition under load

IA-01 | P1 | high | proposal | The hero board + "Ready for your hand" push the roster head to ~800 CSS px inside the frame, so at 1440×900 a designer sees zero jobs on first paint; today she sees six jobs and two stage plates | `shots/proposal/slide-08-1440.png` vs `shots/current/desk-final-desk-1440.png` (roster head at ~218 CSS px, `BRIEF · 5` at ~278) | Cap the hero at ~180px and set it beside the greeting, or drop it below the first stage group — **new**

IA-02 | P1 | high | proposal | The proposed roster deletes stage grouping and demotes stage to a text column, so "show me everything in install" goes from one heading scan to reading 43 rows | proposal CSS `.job{grid-template-columns:50px 1.4fr 1fr 1fr auto}` with `<span>Direction</span>`; the slide caption claims grouping "would" be retained but the specimen does not show it | Keep the stage plate headings (`desk-roster.tsx:188-198`); make each plate sticky within its group — **touches: R126** — **new**

IA-03 | P1 | high | proposal | No overdue channel anywhere. The head reads "Every job · 3 shown in this prototype"; no row carries lateness | proposal slide-08 markup vs current `EVERY JOB · 16 LIVE · 1 OVERDUE` + `One thing is overdue — Vandersteen.` + terracotta mark dot and overdue line (`desk-roster.tsx:96-107,118-128`; `desk-roster-derivation.ts:181-186,327`) | Preserve the count triplet, the sentence, and the per-row overdue line — **new**

IA-04 | P2 | high | current | The overdue sentence names the job but is not a link, so the fastest route to the one overdue job in 43 is ⌘K | `desk-roster.tsx:170-172` renders `roster.overdueLine` in a plain `<p>` | Render each named job as an anchor to its `data-roster-line` row — **new**

IA-05 | P2 | high | proposal | "Ready for your hand" is a second queue in everything but name; the deck never says where its three items come from, and its three rows use three different verbs (Review / Open detail / View) | proposal `<aside class="tasks">`; caption "does not add a new task queue" | Derive it from the roster's existing need model (`needKind`, `desk-roster-derivation.ts:60-61`), label it "Needs you first · 3 of 16", and have each row scroll to its roster line rather than open a parallel path — **touches: VISION.md:58 (no task manager)** — **new**

IA-06 | P2 | med | proposal | One job carries three affordances with three labels on one screen — Alder House appears as "Continue the direction" (hero), "Review" (tasks), "Open" (roster) | `shots/proposal/slide-08-1440.png` | One act per job per surface; the hero prints the same verb the roster row prints — **new**

IA-07 | P2 | high | proposal | The hero is the same board every morning ("Continue where you left off") and costs ~330px permanently; on a 43-job studio the last-touched board is stale within a day | proposal `.board{height:260px}` + board footer | Make the hero the job that *moved*, not the board last touched; collapse to a one-line "Yesterday you were in Alder House — resume" when nothing moved — **new**

IA-08 | P2 | high | proposal | At 390 the roster's first row sits roughly 1,300 CSS px down (hero, then three task rows, then the head); today it sits ~520px down | `slide-08-390.png` vs `desk-final-desk-390.png` | On ≤700px: roster first, hero collapsed to a ~96px strip under the greeting — **new**

IA-09 | P2 | high | proposal | The mobile Desk drops the roster entirely and drops project names from the task list, so a task no longer names its house ("Table selection / Prepare") | `slide-12-1440.png`, phone-2 `.line-item` rows | Keep the house name as the row's strong text on mobile — **new**

IA-10 | P3 | high | proposal | Mobile task rows reuse `.line-item` (a money-row primitive) with the verb where a price sits, and are plain `<span>`s, not controls | proposal slide-12 markup | 44px rows with the act as a real button — **new**

IA-11 | P2 | med | proposal | "Compact rows" removes a thumbnail and 7px of padding — roughly 15 CSS px per row, ~650px across 43 jobs on a ~3,700px roster. Density theatre | `.roster.compact .job{padding:5px 0}`, `.roster.compact img{display:none}`; `slide-08-1440-state-compact.png` | Make the control a real facet ("Only what needs me" / "By stage" / "By person"), not a padding switch — **new**

IA-12 | P2 | med | both | Neither design gives a principal a per-person view; a studio with two new hires cannot ask "what is Maya carrying?" | registry has People as a room (`registry.tsx:98`) but the roster has no owner facet (`desk-roster-derivation.ts`) | Add an owner facet to the roster head line — it needs no new page — **touches: VISION.md:73 (dashboard)** — **new**

IA-13 | P3 | high | proposal | "Find a project" reveals a hidden inline search field — a third find path beside ⌘K and the studio bar's Find anything | `#findDemo` → `#projectSearch[hidden]` | Bind the button to ⌘K — **new**

IA-14 | P2 | med | proposal | The Desk's two creation doors (Capture a lead / Open a project) disappear; the only header control is "Find a project" | proposal slide-08 header row vs `desk/page.tsx:254-305` | Keep both capture verbs with their DM-Mono sub-labels — **new**

IA-15 | P3 | high | proposal | "Every job · 3 shown in this prototype" prints a prototype caveat inside a product heading; at 390 it wraps and orphans "prototype" mis-baselined against the Playfair | `slide-08-390.png` | Move the caveat to the frame's meta strip — **new**

IA-16 | P2 | med | current | The Studio book-index sits below the roster *and* the boards strip, so at 43 jobs it is ~4,000px down and ⌘K is the only practical route to Orders/Accounts | `desk-contents.tsx:4-9`; composition in `desk/page.tsx` | Give the roster head a right-aligned "The studio" doorway opening the same index as a sheet — **touches: R95** — **new**

IA-17 | P3 | high | current | Recent boards sits after the whole roster, so the studio's creative work is never on screen with the day's work — the proposal's fair point | `recent-boards-strip.tsx` (card 190px, cover 92px), placed after `DeskRoster` | A three-board, 92px strip beside the roster head on ≥1200px — beside, not above — **new**

IA-18 | P3 | med | current | Two margin notes consume ~180 CSS px at 390 before the roster head, leaving ~2 jobs above the fold | `desk-final-desk-390.png`; `desk/page.tsx:358-417` | On ≤700px collapse conditional notes to one line — **new**

### Client landmarks

IA-19 | P1 | high | proposal | The client mockup never says what is owed. It shows a $2,400 selection total against a $2,600 allowance and no invoice at all | `slide-06-1440.png`; current answers money in the first 760px — "The house stands at $11,100 agreed / Owed on the open invoice $4,060 · due 11 September" plus the letterbox naming INV-2026-0301, total, paid, balance, due date | Keep the house-ledger + letterbox pair as the second band, above the decision card on mobile — **touches: R137** — **new**

IA-20 | P1 | high | proposal | The landmark row is at the *bottom* — a wayfinding index printed after the content it indexes is a footer | `.landmarks{border-top;padding-top:16px;margin-top:23px}`, placed after the designer note; `slide-06-1440.png` | Move it to a rule directly under the doorplate and make the names real section anchors — **touches: R135** — **new**

IA-21 | P2 | high | proposal | The three landmarks are the wrong three. Against the homeowner's question order — what is this / what changed / what do I owe / what must I do / where is everything else — they answer 1, 2 and half of 3, and never the act or the papers | `slide-06-1440.png` | Five: Where we are · What changed · What you owe · What needs you · The papers — **new**

IA-22 | P1 | high | current | The doorstep names the ask but does not link to it: "Finished work waits for your acceptance." sits at ~290px; the wall gate that satisfies it is ~1,540px down with no jump | `doorstep.tsx:83-90` renders the sentence as a `<p>`; `#wall`/`#door` anchors already exist and are used by note enclosures (`threshold.tsx:803-830,937,995`) | Make the sentence's object a scored link to `#wall` / `#door` / `#letterbox` — **new**

IA-23 | P1 | high | current | The story pole is a reading indicator that cannot navigate. It holds every section id and renders none as a link; at ≤600px the caret is hidden outright, so on phone it is a list of phase names on a 5,700px page | `story-pole.tsx:88-89` ("the page's sections… by anchor id"), IntersectionObserver at `:114-136`, caret `max-[600px]:hidden` at `:233` | Make each graduation and the "here" label a link to its anchor; on ≤600px a one-line sticky "You are in: Study" jump menu — **new** (distinct from the recorded date-subline and empty-pole gaps, §8 items 1–2, 4 — those are **known**)

IA-24 | P2 | high | proposal | The decision view is a full-screen replacement with no return path; the recorded state offers only "Reset this demo" | `slide-07-1440.png` (frame label "Living room · Table selection", no back link), `slide-07-1440-state-receipt.png` | Expand the decision in place — the deck's own caption says a production decision would — and end the recorded state with "Back to the house" plus the next thing that needs her — **new**

IA-25 | P2 | high | proposal | "Below allowance $200" sits in the same ledger column as Piece / Delivery / Tax / Selection total, so $200 reads as a charge | `slide-07-1440.png` line items | Take it out of the ledger; print one sentence under the total — **new**

IA-26 | P2 | high | proposal | The receipt is a green fill panel and the confirm step a 2px olive box. Colour-as-success on a $2,400 decision reads consumer-app on a surface whose credibility is paper | `.receipt{background:var(--sage)}`, `.inline-confirm{border:2px solid var(--olive)}` | Keep the receipt on paper with a rule and a stamp; colour stays on materials — **touches: VISION.md:73 (red/green status), R126** — **new**

IA-27 | P2 | med | both | Approval and payment never appear together in either design, and neither states their order. The proposal repeats "does not charge you or place an order" five times without ever showing the invoice that eventually will | proposal slides 6, 7, 12; current keeps the letterbox and the wall gate ~1,200px apart | One "What you owe / What needs you" pair under the doorplate naming both and their order — **touches: R137** — **new**

IA-28 | P2 | high | current | The mat's people column lists only "Local Dev Studio · the studio" — Leah Hartwell's name never appears on the house page in this fixture, though the doorplate says "PREPARED FOR NORA ELLISON" | `client-local-dev-desktop.png` foot; `mat.tsx:104-123` | The doorplate carries the designer's name; the mat carries the roster — **new**

IA-29 | P2 | high | current | "Previously" rows truncate mid-title: "Furnishings authorization · Cedar Lane — Authorization No…", "The chair shipped from the workshop this morning. Nothing…" | `client-local-dev-desktop.png` foot | Allow two lines, truncate at the line, make the row open the paper — **new**

IA-30 | P3 | high | current | The PlanKey clips a label to "Built-in shelving, no…" inside the drawing itself | `client-local-dev-desktop.png` plan key | Wrap or shorten at source — **new**

IA-31 | P3 | high | current | An empty room band draws an empty rectangle labelled "Hall" plus "ASK FOR A CHANGE IN HALL" — precisely the "anonymous empty rectangle" the proposal's slide 11 warns against, already shipped | `client-local-dev-desktop.png`, Hall band | A room with nothing in it prints one line, not a box — **new**

IA-32 | P2 | high | current | Every tracking-row thumbnail in the fixture renders as a blank tan block at 64×64 | `tracking-row.tsx:109` (`h-16 w-16`), placeholder at `:112-117`; `client-local-dev-desktop.png` Study band | Raise the piece image to 96–120px on ≥960px; the placeholder carries room + maker, not blank fill — **new** (the 64px size itself was raised by the proposal, slide 2)

IA-33 | P2 | med | both | A client with more than one house has no visible switch. The current portal puts other houses in the mat; the proposal keeps a footer but shows no houses in it | `mat.tsx:16-18`; proposal slide 6 | The doorplate names the house and carries "your other houses" when there is more than one — **touches: R135** — **new**

IA-34 | P2 | high | current | On phone the tester-notes "N" bubble sits over the letterbox's balance line | visible as the dark circle at left in `client-local-dev-desktop.png`; recorded at `client-page-completion-2026-09-04/waves/w2/gates.md:434-438` | Ship the planned reposition before any client walk — **known**

### Global vs local navigation

IA-35 | P2 | high | proposal | The proposed footer collapses four named ledgers into the word "Ledgers", so Orders, Accounts, Hours and The Post lose their names globally | `.studio-foot` spans (Library / People / The Scans / Ledgers) vs `registry.tsx:163,186,210,224` | Keep The Post visible — it is the studio's mail — and let Ledgers group the other three — **new**

IA-36 | P2 | high | proposal | The proposed footer also drops ⌘K, the identity block, and the time-in-hand readout the live studio bar carries. A footer with no identity is where a two-studio designer loses track of which studio she is billing | `desk-final-desk-1440.png` bar (Library · People · The Scans · Ledgers↑ · Find anything ⌘K · HANDS FREE · THE POST · LH / Leah Hartwell) vs proposal `.studio-foot` | Retain the bar as built; this change is subtraction, not polish — **new**

IA-37 | P2 | med | both | The Contract Room is document-scoped and reachable from no global bar, so finding a signed agreement is a ⌘K-only act | `registry.tsx:127-128` ("proposal in hand") | Add Contract Room to the Ledgers group as a studio-filtered door — **new**

IA-38 | P3 | high | current | At 390 all rooms and ledgers collapse behind "More" and the bar's centre is a per-page act, so Library, People, Orders, Accounts, Hours and The Post are two taps deep with no visible names | `mobile/mobile-bar.tsx:5`; `desk-final-desk-390.png` (THE STUDIO / TODAY / More) | A persistent Ledgers chip or a two-row bar — **new**

### Grouping & labels

IA-39 | P2 | high | proposal | "Ready for your hand" and "Every job" are the studio's language and are right; "One decision ready for you" with a status dot, "Ready to review" as a pill, and "Draft selection" as a pill are software's | `.pill`, `.status:before{width:7px;height:7px;border-radius:50%}`; slides 6, 9 | Put state in the sentence — "One decision waits for you — the table" — **touches: VISION.md:73 (badges)** — **new**

IA-40 | P2 | med | proposal | The stage column mixes stage names with production states: "Direction" is a stage, "In production" and "Installation" are not the paper's seven | proposal `.job` spans vs `ROSTER_STAGE_ORDER` (`desk-roster-derivation.ts:29`) | Stage plate carries the stage; the state sentence carries "waiting on maker" — **new**

IA-41 | P3 | high | current | `EVERY JOB · 16 LIVE · 1 OVERDUE` in DM Mono caps is precise but reads as a system readout; the sentence under it is the studio's voice | `desk-roster.tsx:165-172` | Keep both, lead with the sentence — **new**

IA-42 | P3 | med | proposal | The deck's headline voice ("Start the day with the work worth making") sits one rule above product copy; if any of it reaches the product it fails the homeowner seat | slides 6, 7, 8, 11 heads | Mark deck voice vs. product voice before build — **new**

### Scalability & return paths

IA-43 | P2 | high | proposal | The decision card holds exactly one decision with the primary pinned to its foot; with three decisions the pattern has no answer — three stacked cards push rooms past 2,000px | `.decision-card .primary{margin-top:auto;width:100%}` | A decision *list* under the doorplate: one line each (name · amount · due), first expanded — **new**

IA-44 | P2 | high | proposal | One room photo at a fixed 330px means six rooms = ~1,980px of photography before the first piece | `.room-photo{height:330px}` (245px ≤700px) | Hero photo for the room that changed; the rest as ~140px band headers — **new**

IA-45 | P2 | med | proposal | "Ready for your hand" is a fixed three with no selection rule and no overflow; at 30 open tasks it is arbitrary | proposal slide-08 `.tasks` | Rank by promise date, cap at three, print "and 27 more in the roster" as the link back — **new**

IA-46 | P2 | high | proposal | The proposal has no equivalent to the current portal's deep-link folding, which resolves `#door`, `#wall`, `#letterbox`, `#previously` and per-band anchors at first paint — the thing that makes an emailed link land correctly. A separate decision route breaks all of them | `threshold.tsx:803-830,922,937,944,995` | Whatever the decision view becomes, it must be an anchor on the house page, not a route — **new**

IA-47 | P2 | med | both | After paying, neither design says where you land. The current invoice view ends at "Print / save PDF"; the proposal never shows payment | `invoice-open-desktop.png` | A paid invoice returns to the house page with the doorstep re-stated and the letterbox showing the receipt — **touches: R137** — **new**

IA-48 | P3 | med | proposal | Two elevations on one screen — the app frame carries `--lift` and the decision card carries its own `0 3px 12px` — in a system with one shadow token at three sites | `.app-frame{box-shadow:var(--lift)}`, `.decision-card{box-shadow:0 3px 12px #2c29260a}` | Pick one; leave the page flat — **touches: D4, R126** — **new**

IA-49 | P3 | med | proposal | The slide-9 document spine (Brief · Direction · Selections · Procurement · Installation) is a plain five-word rail; the live document's spine already carries phase-of-6, line and room counts, and money outstanding | `document-final-document-ffe-1440.png` left rail (Client approvals 2 in the log · Schedule phase 4 of 6 · Pieces 36 lines · 4 rooms · Money $17,500 outstanding); the deck's evidence register cites no spine file | Leave the spine alone — the proposal did not inspect it — **touches: D1** — **new**

IA-50 | P3 | high | proposal | The current Desk's empty state ("Nothing needs your hand. The work is in motion.", `desk-roster.tsx:224-227`) is better than the proposal's "Nothing needs you today." panel; the proposal's version belongs on the client page only | slide-11 | Keep the current line on the Desk — **new**

---

## What the proposal gets right

- **The diagnosis is correct and specific.** At 16–43 jobs the studio's own creative work — boards, materials, rooms — is never on screen at the same time as the day's work, because `RecentBoardsStrip` sits after the entire roster. That is a real IA fault, not a taste complaint.
- **It names the client page's missing verb.** "See the room → understand the change → make a choice → see the recorded consequence" is the right sequence, and the current Threshold's weakest link is exactly the third step: the doorstep announces an ask it does not link to.
- **The interaction inventory is honest.** Every prototype control writes into a `role="status"` region and the copy says nothing is sent. That restraint is unusual in a design deck and it is exactly right for a money surface.
- **"Approval is not an order and not a payment" is stated at every point.** Five separate restatements is one too many, but the principle protects the homeowner's trust and Patina's liability, and the current portal is quieter about it than it should be.
- **The failure and empty specimens are real specimens** — a retry with the choice preserved, a no-photo state that names the room rather than drawing a blank rectangle. The live portal ships the blank rectangle today (IA-31).
- **44px targets, visible focus at 3px offset 4px, reduced-motion behaviour, 16px body, reflow without horizontal scroll** — a complete accessibility floor stated as a contract rather than a wish.
- **"Do not use designer dwell time as a goal"** — it read the studio promise correctly and wrote the metric constraint into its own acceptance gates.

## What's already excellent in the current portals

- **The roster's density rule and its ordering.** One line per job, headings that never fold, nothing folded on first paint, overdue tier first within each stage group and then oldest promise first (`desk-roster-derivation.ts:278-283`). Six jobs and two stage plates above the fold at 1440×900 is a genuinely hard thing to achieve and it works.
- **The stage plates.** Seven pigmented plates give the fastest possible answer to "everything in install" at zero acts, and they are plates, not bands — the row stays on cream.
- **The overdue trio** — count in the head, a sentence naming what is late, a terracotta line on the row — three levels of the same fact, each legible on its own.
- **The house ledger + letterbox pair.** Agreed total, owed, invoice number, paid, balance and due date inside the first screen, and the letterbox marked `data-never-dim` so no filtering pass can hide money owed. That is the single most professional decision in either portal.
- **The invoice.** Line items with makers, a note in the designer's voice, three payment methods each priced honestly with its fee, and one filled dark button carrying the exact amount. A studio principal can open this in front of a client without apologising — and it proves a filled primary is already Patina-native where money is at stake.
- **The FF&E document rail** — phase-of-6, 36 lines · 4 rooms, $17,500 outstanding — a spine that navigates *and* reports.
- **"Absence is silence."** A region with nothing to say renders nothing, and the doorstep holds its measure open rather than letting an ask appear and vanish. Most portals would have shipped a zero.
- **The deep-link fold.** `#door`, `#wall`, `#letterbox`, `#previously` and per-band anchors resolved server-side at first paint, chosen so a note's enclosure never points at a gate that will not draw.

## Top 5 changes for polish & professionalism

**1. Desk — "The day's line", a three-item band *inside* the roster, not above it.**
Surface: `/desk`. Structure: between `roster.overdueLine` and the first stage plate, a rule-topped band of at most three lines. Ordering: overdue first, then earliest promise date, then most recent client reply; one line per job, never two lines for the same job. Labels: head `Needs you first · 3 of 16`; each line prints the job's Playfair name, the same state sentence the roster row prints, and the same `DocumentAction` verb. Sources: the roster's existing `needKind` / `overdue` model — no new query, no second queue. States: fewer than three needs → prints only what exists; zero → the band does not render (absence is silence); 43 jobs → still three, with "and 12 more below" as a scored link to the first stage plate. 1440: the band is ~120px, so the first stage plate still lands above 900px. 390: the band is the first thing under the greeting and the margin notes collapse to one line. Why: it answers the proposal's "the entry experience is overwhelmingly textual" without spending 500px on a board that is the same every morning, and it makes the overdue job reachable in one glance instead of one search. *touches: VISION.md:58 (no task manager) — this is a view of the roster, not a queue.*

**2. Client — a landmark ledger directly under the doorplate.**
Surface: the Threshold, between the doorplate and the doorstep. Structure: one rule, five DM-Mono links at 11.5px / 0.04em tracking, 44px tall, wrapping to two rows under 700px. Labels and order, fixed: `Where we are` → `#story-pole`, `What changed` → the existing since-toggle, `What you owe` → `#letterbox`, `What needs you` → `#wall` or `#door` (whichever renders first), `The papers` → `#mat`. States: a landmark whose target does not render is omitted, never disabled; a settled house shows three; a house with no invoice shows four; the money landmark is `data-never-dim`. 1440: one row, left-aligned, ~44px tall. 390: two rows, still above the doorstep sentence. Why: it answers the homeowner's five questions in her order, in the studio's words, and it is a ledger of what is on this page — not the seven-destination header R135 deleted. *touches: R135.*

**3. Make the story pole navigable.**
Surface: `story-pole.tsx`. Structure: each graduation label and the "you are here" line become anchors to the section ids the component already holds (`:88-89`); the caret stays a reading mark and does not become a control. States: struck phases link to their band; the held phase links to the doorstep; future phases are not links (nothing to reach yet). 1440: no visual change beyond an underline on hover/focus and a 2px clay focus ring. ≤600px: replace the hidden caret with a single sticky line — `You are in: Study` — that opens the same list as a sheet. Why: a 4,400–5,700px page with a 170px rail that shows position and cannot move you is the largest single wayfinding cost in the client portal, and on phone the rail currently does nothing at all.

**4. Roster head facets instead of a density toggle.**
Surface: the Desk roster head. Structure: right-aligned on the head line, two scored controls — `Only what needs me` (filters to rows with a mark) and `All hands` (owner facet listing the studio's people from the People registry). Ordering inside a facet is unchanged. Labels stay the studio's: `Every job · 16 live · 1 overdue` on the left; facets carry no counts of their own. States: one live person → the owner facet does not render; a filter with no results prints "Nothing needs your hand today" rather than an empty list; the active facet is stated in the head sentence, not in a pill. 1440: both controls fit on the head line. 390: they wrap to a second line under the head, still above the first plate. Why: it gives a principal with two new hires the one view she cannot get today, and it replaces a padding switch that saves ~15px a row with a control that actually reduces what she has to read. *touches: VISION.md:73 (dashboard) — this is a facet on one roster, not a zone.*

**5. Decisions expand in place, and every recorded state ends with a way back.**
Surface: the Threshold. Structure: the decision opens as an in-page section at its own anchor (`#decision-<id>`), never a route; multiple decisions render as a list of one-line summaries — name · amount · due — with the earliest expanded. After a recorded decision the section becomes a paper record with a stamp, on paper, no green fill, ending with two lines: what happens next, and `Back to the house` returning to the landmark ledger with the doorstep re-read. The same rule for a paid invoice. States: one decision, three decisions, zero decisions (the section does not render), a failed save (body ink under a hairline, the choice preserved), long piece names (two lines, no clip). 1440: the expanded decision uses the full measure with the money ledger right-aligned. 390: money ledger first, materials second, act last and full-width. Why: it preserves the anchor contract every note and email depends on, and it means no homeowner ever finishes an act on a page that has no exit. *touches: R137, R51 (the record is the confirmation — still no toast), VISION.md:73 (no green success fill).*
