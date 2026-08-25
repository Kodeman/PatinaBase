# Appendix — Review instruments (paste into briefs verbatim)

## §1 Task script (T1–T16)

Walkers run T1→T16 in order, in one sitting, as one week. Never skip a task because it "obviously has no path" — narrate the search; the search is the finding. P1 additionally runs T1 as "back after ten days away".

| # | She says | Path today | Stage(s) | Success looks like |
|---|---|---|---|---|
| T1 | "Tell me what today actually needs — across everything." | `/desk` → Needs-your-hand folios + Studio Pulse (`desk/page.tsx:28-31,340`) | all | Narrates her day in <2 min without opening a document |
| T2 | "Show me everything that's in install." | **none** — no fleet/roster tier; ⌘K searches names, not phases | project/install | One surface answers a phase-wide question (open T4) |
| T3 | "What's my next move on this one?" | `/doc/[id]` guide; precedence gate → need → proposal lifecycle → stage default (`document-guide.ts:316-398`) | all 7 | One sentence, one named act, one click to where it happens |
| T4 | "Change the fabric on the living room sofa." | Project · FF&E region → room heading → line unfold; ≥1440 room lens lifts, never filters | project, install | ≤2 acts to the editable line |
| T5 | "Pull up the mood board for the primary bedroom." | ≥1440 shelves → Mood boards leaf → `/board/[id]`; <1440 **none** except desk Recent boards / ⌘K by name; speccing stage prints a strip | direction, project | Boards reachable at every width and from their room |
| T6 | "Where's the floor plan? Where's the spec book?" | ≥1440 Plan room / Spec book leaves; ⌘K "The plan room"; <1440 **none** | project, install | Reachable on a 1280 laptop |
| T7 | "Did the Hendricks ever open my proposal? Nudge them." | Proposal section send-wall state line (I137 SP3); from desk only if a `hesitating_proposal` need derives | proposal | Sent-state + age legible without opening the doc |
| T8 | "Add the mudroom." | FF&E → "Add a room" scored-ink line at the foot of the room list (I137 SP4) | project | Found unaided, first pass |
| T9 | "Bill the deposit. And who still owes me?" | doc money region + account band; ⌘K "Draw an invoice"; Accounts sheet `g a`; desk receivable lines | project, install, care | Picks one door without a shrug; paid/unpaid/due in one glance |
| T10 | "Install slipped a week — move it and tell me what it hits." | Schedule region → date edit → ripple (`schedule-ripple-derivation.ts`) | project, install | Sees downstream damage before committing |
| T11 | "Put this down, pick up the Byrnes." | Esc / Put down → `/desk` → folio; or ⌘K (D1 forbids tabs/split) | all | One trip; she knows which trip |
| T12 | "New inquiry — start them." | ⌘K "Capture a lead · begin a Brief" → `/ceremony/[leadId]`; or "Open a project · no proposal needed" (`registry.tsx:253-278`) | brief | The difference between the two verbs is obvious before picking |
| T13 | "Did Sturdy Oak confirm the PO?" | Orders sheet `g o` → vendors page; or a `po_unacknowledged` need routes to the ledger (`document-guide.ts:208-245`) | project, install | Ack state visible per PO without leaving the project's frame |
| T14 | "The console came in damaged — file it." | Orders → Receiving page (`damage_claim` / `awaiting_inspection` needs) | install | Claim filed where she saw the damage |
| T15 | "Who's on this job? I need the painter's cell." | Call sheet doorway (flag `call-sheet`, absent when off, `shelves.ts:52-58,75-88`); ⌘K "Open the call sheet"; People `g p` | project, install | One roster, reachable with the doc in hand |
| T16 | "Client asked a question — answer it where it's on the record." | The Post bell / `g t` → `/people?thread=`; or a `message` margin item | all | Reply lands on the record without leaving the project |

## §2 Practitioner personas (Interior Design team)

**How to walk (all four, every task), first person, present tense:**
```
T{n} — {the task in my words}
First glance:      what my eye lands on in the first 3 seconds, named literally
Where I'd click:   the exact word/control I'd reach for, and why
Where I'd hesitate: the moment I stop, and what I'm asking myself
Where I'd give up: browser tab / call someone / old tool — or "didn't"
Obviousness: {1-5}  (1 could not find · 3 second guess · 5 without thinking)
```
Rate *what to do* and *how to get there* separately when they differ. Quote labels verbatim. "I expected a ___ and there wasn't one" is the deliverable.

**P1 · Solo residential principal, 6 live projects (Leah-like) — Opus.** Madison WI; two-person studio, one job always in install. Came off Ivy (kept invoicing, resented double entry) and a Google Sheets FF&E schedule she trusts more than any app; Houzz Pro one season. Phases = the Patina Six (Consultation · Schematic · Development · Procurement · Installation · Completion; `the-document-schedule-package.md:117-118`). Expects, in order: where this job is right now, what's late, what the client is waiting on me for, the FF&E schedule. Metaphor tolerance high but conditional — will not accept one that costs a click or hides a number; her tell is fleeing to the old portal rather than arguing. Stakes: an unopened proposal past her real patience window; install week with a missing/damaged piece; Tuesday triage from one screen. Grounded in `leah-session-01-first-tuesday.html` (time-to-true-read, unaided margin acts, old-portal flights, "did the margin feel like your work or like notifications?") and `leah-session-05-one-pager.md` (which phase makes her sigh; the two-hour credenza retrace).

**P2 · Principal of a three-person studio — Sonnet.** Milwaukee; two designers + a procurement coordinator; Studio Designer (bookkeeper insists) + Dropbox + Monday meeting; eleven live jobs. Expects first: who has the ball, what changed since Friday, what's about to cost us money. Reviews FF&E, never edits it. Tolerance low-to-medium; won't tolerate asking a junior where something is. Stakes: reading eleven jobs before Monday's meeting (today = open eleven documents); a junior's uncommitted PO before the vendor's price expires; an install date moving unannounced. **Her test: strict one-document focus (D1) meets an oversight job** — say where it costs her and what, unsoftened.

**P3 · Junior designer, week one — Sonnet.** 24, Minneapolis, two years out of school; Mydoma internship, Canva, Excel. No legacy portal to flee to; only escape is asking. Expects a list of what I'm supposed to do in school words: floor plan, furniture schedule, purchase order, invoice, punch list. Tolerance near zero on first contact — recognition, never recall. Stakes: finding the FF&E schedule unaided; finding "the board"; "did that PO go out?" in front of a client. **Special assignment:** on every screen list *every* label she cannot define from the label alone, verbatim — start with `Client approvals`, `Schedule`, `Project · FF&E`, `Design authority` (`document-index.ts:36-52`) and `Plan room`, `Spec book`, `Mood boards`, `Call sheet`, `Knowledge` (`shelves.ts:33-72`); say what she thought each meant before clicking.

**P4 · FF&E/procurement-heavy designer — Sonnet.** Oak Park IL; six-figure FF&E budgets, quarterly installs; Design Manager for POs/receiving, a freight portal, a printed binder at install. Expects first: the FF&E schedule with order status per line, then what's arriving this week, then exceptions (unacknowledged, backordered, damaged). Tolerance medium; rejects any composition that separates a piece from its PO state. Stakes: install-day minus 10 reconciliation; a damage claim inside the carrier window; a vendor who never acknowledged. **Special assignment:** on T13/T14 note every time the answer requires leaving the document for a ledger sheet and whether the return trip preserved her place (sheets are supposed to slide over the document, `registry.tsx:53-54`, D8).

## §3 UX/UI lens briefs

**U1 · Information architecture & wayfinding (Opus).** Heuristics: information scent; Nielsen match-to-real-world, recognition over recall, user control & freedom; hub-and-spoke vs flat; label↔content correspondence. (1) Draw the reachability graph of `/desk` and `/doc/[id]` — every surface, every door, shortest act-count; where is anything >2 acts? (2) Three "room" nouns (`The Rooms` `g r`; the spine rooms block; `/room/[id]/file`) and three "board" doors (shelf leaf, speccing strip, desk Recent boards) — which collisions cost a wrong turn? (3) `Design authority` labels the money region — does anything carry scent toward money? (4) `Knowledge` opens onto nothing (`shelves.ts:64-70`) — what does a dead shelf cost? (5) Correct home for cross-project questions (T2): desk, a new tier, or a lens? (6) Is Desk Contents (labels + doorways only, R95) doing wayfinding work? (7) Which surfaces are ⌘K-only (pure recall)?

**U2 · Interaction & flow / next-action clarity (Sonnet).** Heuristics: visibility of system status; single primary action; Fitts; Hick; progressive disclosure; goal gradient. (1) Trace `deriveDocumentGuide` precedence — at each stage is the sentence the actual next move? (2) `stageCopy` one act per stage (`document-guide.ts:91-141`), e.g. `project` → "Review active work" — name every stage whose leader verb is a shrug, not an act. (3) I135's one-leader contract demoted real primaries — which regions now lead with the wrong word? (4) Where do ≥2 controls compete for one job (money has ≥3 doors)? (5) Round-trip cost after a sheet / leaf / Esc — is she where she was? (6) Where is a decision asked without its consequence shown (T10 ripple, T13 ack)? (7) Always-visible `···` at FF&E row density — help or noise? (8) Where is flag-gated `call-sheet` absence indistinguishable from "nobody on this job"?

**U3 · Visual hierarchy & layout across tiers (Sonnet).** Heuristics: Gestalt proximity/common region; type scale & rhythm; F-pattern; density vs legibility; graceful degradation. Tiers ≥1440 / 1180–1439 / 390. (1) First viewport per tier — work or chrome? (2) Enumerate exactly what is lost 1440→1280 (shelves, rooms block, running index, room-lens hold). (3) Zero shadows (D4) — how is depth carried, where does it fail to separate regions? (4) Where does the Record at the foot (I137) get in the way or become undiscoverable? (5) Does the red-letter zone read urgent without a badge, or decorative? (6) At 390 can she complete T3, T4, T9, T13? Rank tiers by task coverage. (7) Per-region fold persists in localStorage — can a returning designer tell folded from empty?

**U4 · Content design & lexicon (Sonnet; loads `patina-brand-voice`).** Heuristics: the brand skill (Playfair/Inter/DM Mono; plain-spoken Midwest; lexicon patina/provenance/workshop/maker/studio/trade; never AI/engine framing); match-to-real-world; plain-language pairing (studio word + trade word); label-first-word discipline. (1) Inventory every label on `/desk` and `/doc/[id]` at ≥1440: what P3 thinks it means, what it is. (2) Propose pairings that keep the voice for `Design authority`, `Knowledge`, `Call sheet`, `The Record`, `Plan room`, `In this document`. (3) `Next up` appears only in the unavailable branch (`document-guide.ts:329`) — should the guide have one stable name? (4) The seven section names vs the Patina Six — name each mismatch a designer trips on. (5) Registry aliases speak Programa/Houzz (`registry.tsx:47-49`) — do the *visible* labels, or only ⌘K? (6) Every need line and guide sentence: is it how she'd say it to herself (Leah-01 Q3)? Rewrite each that isn't. (7) Flag any engine/AI drift.

**U5 · Reach — keyboard, mobile, accessibility (Sonnet).** WCAG 2.2 AA (2.4.1, 2.4.3, 2.4.7, 1.4.3, 2.5.8); landmarks; keyboard-trap freedom; Fitts on the 60px drawer; touch targets. (1) Landmark map of `/doc/[id]` — can a screen-reader user reach the margin without traversing the paper? (2) `g` chords (`registry.tsx:85-221`) — announced anywhere visible? (3) Esc stack (bubble → sheet → put-down) — announced, predictable? (4) Drawer strip target sizes, focus order, contrast at flat edges. (5) No toast layer (R83) — are inline bands announced (live region)? (6) At 390 which of T1–T16 are reachable; which controls <44×44? (7) Room lens lift perceivable non-visually and at 4.5:1? (8) Any hover-only affordance anywhere? (Doctrine says no — verify.)

## §4 Finding schema

```json
{ "id": "U1-07", "lens": "U1", "persona": null, "task_ids": ["T2","T13"],
  "key": "desk|1440|off|no-phase-wide-view",
  "surface": "/desk", "width": "1440|1280|390|all", "flag": "off|on|both",
  "title": "No surface answers a phase-wide question",
  "observation": "verbatim what is on screen — labels quoted exactly",
  "why_it_blocks": "obvious-what-to-do | obvious-how-to-get-there | both",
  "evidence": { "shots": ["w1440-desk.png"], "refs": ["apps/designer-portal/src/app/(document)/desk/page.tsx:28-31"] },
  "severity": "blocker|high|medium|low", "confidence": 0.9,
  "already_ruled": null, "suggested_fix": "one line, one move",
  "hesitation_seconds_estimate": 45 }
```
Rules: exactly one of `lens`/`persona` non-null; no `task_ids` → drop; `title` ≤10 words states the problem; `observation` verbatim; `evidence` at least one of shots/refs; `severity` blocker = task impossible, high = only by luck/memory, medium = hesitation, low = polish; `confidence` <0.5 must append "what would settle this"; `already_ruled` cites the DECISIONS id — still valid, just not free for Lane A; `key` = `surface|width|flag|kebab-slug` so identical findings collide across lenses.

## §5 Canon guard (authors before drafting; verifiers before judging)

| # | Ruled — do not silently re-propose | Where |
|---|---|---|
| C1 | Strict one-document focus: no split views, tabs, peek/hold, persistent global nav over an open doc; Esc/Put down is the exit | D1 (DECISIONS.md:12) |
| C2 | Zero shadows anywhere; depth = value contrast + flat stacked edges | D4 (:15), `apps/designer-portal/CLAUDE.md` |
| C3 | Interruptions designer-driven; ships with zero break-through rules | D2 (:13) |
| C4 | Drawer is persistent chrome; ledgers are overlay sheets; no badges/counts | D8 (:19); R96 (`registry.tsx:17-18`) |
| C5 | No toast layer; failures = inline band at the act site | R83 (:2672) |
| C6 | Scored ink — no buttons/plates/boxes | I107 (:6584) |
| C7 | One inked leader per region; overflow always visible, never hover-gated | I135 (:8377, :8389-8393, :8404-8409) |
| C8 | Paper holds the work, shelves hold artifacts; index/rooms/shelves ≥1440 only; room lens lifts, never filters | I136 (:8427ff), errata (:8543) |
| C9 | Boards on shelves except the speccing stage | I136 + Q1 (:8881, :8678) |
| C10 | The Record at the foot of the paper | I137 (:8600, :8608) |
| C11 | Running index derived from mount order (approvals → schedule → ffe → money) | I137; `document-index.ts:33-52` |
| C12 | "Add a room" in flow at the foot of the room list; a demoted act's home is the body it acts on | I137 SP4 |
| C13 | One scored state line between send and seal; nudge prints once | I137 SP3 + errata (:8684) |
| C14 | **The Worktable is the destination**; fail-closed flag; flag-off byte-identical | Q3 / I138 (:8738, :8744-8746) |
| C15 | One registry, one entry, one icon per surface; Contents = labels + doorways only | R93/R94/R95 (`registry.tsx:14-18`) |
| C16 | R113 has two live entries (Field Capture M4 :4213; "Band is a state, not an error" :8081) — cite which | DECISIONS.md |
| C17 | Full-bleed document (D12 :211); D13 mobile spine sheet | DECISIONS.md |
| C18 | Stamps only say true things (R7); settled bars show no unfold hint (R8); files clip as a Folio (R24) | DECISIONS.md |
| C19 | **Thumb Index REMOVED by Kody — "do not re-propose"** — ⚠ NOT logged in DECISIONS.md; deck must ask for an entry | verbal ruling |
| C20 | One icon language; no second iconography | `registry.tsx:4-7, 73-76, 148-151` |

**Known-open (fair game, no amendment needed):** I114 section↔stage mapping (:9405); T4 no fleet view; T2 install-as-label; a flagged line on a sent proposal unanswerable anywhere (I140-errata); money doesn't seam on install/care (I141); `Knowledge` names a non-existent surface.

**Amendment rule (binding):** a direction may amend ruled canon only by (a) naming the entry by id and quoting the clause, (b) stating the trade in one sentence — what is gained, what is given up, (c) stating the rollback. Unnamed or unpriced → rejected on sight, doctrine-cost score 1. Form precedents: I138 A5, I137 SP4. Verifier check is mechanical: for every `already_ruled` finding, the direction either leaves the ground alone or carries a named amendment.

## §6 Direction-lane constraints

Distinct by construction — if Lane B reads as "Lane A but more", both are rejected and re-run.

**Lane A — tighten within doctrine.** Zero D/R amendments; new I-entries and copy freely. Permitted: composition/mount order, labels, leader election within a region, placement of existing acts, guide precedence and sentences, desk composition, ⌘K aliases/shortcuts, what a shelf contains. Ships days–weeks; every move a revert.

**Lane B — restructure where the findings demand it.** May amend doctrine per §5. Likely collisions: roster/fleet tier (T4/T2), true stage modes, persistent project map — each meets D1/D8; name it, price it. Worktable is the destination (C14): build toward it or explain. May propose an I114 mapping as a candidate ruling; first slice must not depend on it. Ships weeks–quarter; rollback is a flag.

**Each lane delivers, in order:** (1) thesis — one falsifiable sentence; (2) IA/map — every surface and door, act-count annotated; (3) per-stage "what's next" organ for all seven sections — wording, placement, tie-break; reconcilable with `deriveDocumentGuide` or explicitly replacing it; (4) item-reach table — rooms · products · boards · documents (plans/spec book) · money · schedule · people × three tiers × act path × count; any cell >2 = declared exception with reason; (5) lexicon stance — old → new with brand-voice justification; positions on `Design authority`, `Knowledge`, `The Record`, `In this document`, the seven names vs the Patina Six; (6) five mock screens M1 desk ≥1440 · M2 doc project ≥1440 · M3 doc 1280 · M4 doc 390 · M5 stage-specific (say why it proves the thesis); (7) Keeps / Refuses / Costs; (8) first slice — smallest shippable thing that makes a Tuesday measurably better, naming the Leah-01 metric it moves (time-to-true-read · unaided acts · old-portal flights); plus (9) how it lands on flag-off and flag-on.

**Shared planks:** copy fixes, mislabels, a missing act, a dead-end shelf — never structure — adopted identically by both lanes and drawn identically in both mocks. A plank in only one mock is not a plank.

## §7 Judge rubric (1–10 per axis; two lenses; never averaged)

J1 practitioner-workflow (names the persona per score; weights 1,2,3,6). J2 product/engineering feasibility (cites file/ruling per cost; weights 4,5,6,7).

| Axis | 3 | 6 | 9 |
|---|---|---|---|
| 1 Obviousness of next act | Exists but shrug-verb or competing leader | One real act per stage in studio language | One act, every state, in her words, reason visible |
| 2 Findability ≤2 acts | ≥1 class recall/⌘K-only; ≥3 cells over at 1280 | All 7 classes ≤2 at ≥1440; ≤2 exceptions below | All 7 classes ≤2 at all tiers with visible scent |
| 3 First-week legibility (P3) | ≥3 labels opaque on sight | Every label decodable without a glossary | Junior completes T1, T4, T8, T13 unaided day one |
| 4 Distance from today | Reorders paper / adds tier / changes section grammar | One wave of composition + copy over existing derivations | Composition, labels, placement, copy only; every move a revert |
| 5 Doctrine cost | ≥2 amendments, or any unnamed (**unnamed = 1**) | One named amendment with trade + rollback | Zero — or one that closes a known-open item |
| 6 Effort to first value | First slice is a program | Ships in a week, moves a named metric | Ships in days, moves a metric, valuable alone |
| 7 Risk | Touches sealing semantics / send-seal wall / depends on I114 | Fail-closed flag or presentation-only | Additive, reversible, no data-model change |

A direction with no findings citation for a major move is returned, not scored. Each judge states which persona is worse off under the direction they favor.

## §8 Mock specimen — "same data, two shapes"

**The Vandersteen residence** — Shorewood Hills, Madison WI. Marit & Dale Vandersteen. Studio: Middlewest Studio (Madison). Opened 2026-03-02 · phase Procurement & Orders (4 of 6) · section `project` · **install Tuesday 2026-09-15, three weeks out**. Today is Tuesday 2026-08-25; in-hand timer 0:47; The Post 3 unread (one a Vandersteen question about the mudroom bench; dot only, never a count).

Rooms: Living room 14 lines (11 ordered, 2 in transit, 1 damaged) · Dining room 8 (8 ordered, 6 delivered) · Primary bedroom 9 (7 ordered, 2 awaiting client approval, overdue) · Mudroom 5 (3 ordered, 2 unspecified).

Red-letter zone shows exactly two: **OVERDUE 6 days** — Primary bedroom client approval on the Hartland wool rug + walnut nightstands, sent 2026-08-13, owner Client. **OVERDUE 3 days** — Living room fabric selection for the reading chair; workroom needs COM by 2026-08-22 to hold install, owner Designer.

Unacknowledged PO: **PO-2026-0418** · Sturdy Oak Woodworks, Dodgeville WI · dining table + 6 side chairs · $14,880 · sent 2026-08-11, 14 days no ack · 8-week lead time already past install math. Damage claim: Living room brass-and-oak console, Fond du Lac Ironworks, delivered 2026-08-19, top panel gouged, photographed at receiving, claim drafted not filed, carrier window closes 2026-08-26 (tomorrow).

Second client: **The Byrne remodel** — Cedarburg WI, Erin Byrne, section `proposal`; design agreement sent 2026-08-19, 6 days, never opened; $9,400 fee, four milestones; no nudge sent.

Money: FF&E budget approved $184,500 · specified $171,240 · ordered $141,600 · invoiced $96,400 · paid $78,900 · outstanding $17,500 (Invoice 2026-114, 22 days) · deposit due not drawn $12,300 (PO-2026-0418, 50% at release) · design fee $34,000, 3 of 4 milestones billed · hours this week 6.4 (Mon 2.1 · Tue 4.3).

Desk (six live): Vandersteen (`project`) · Byrne (`proposal`) · Okonkwo kitchen, Middleton WI (`install`, completed 2026-08-14, punch list pending) · Reinhardt lake house, Green Lake WI (`discovery`) · Kaminski condo, Milwaukee (`direction`) · one more quiet project.
