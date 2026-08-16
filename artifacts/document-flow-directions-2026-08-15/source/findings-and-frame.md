# The firm's frame, findings ledger, shared planks, comparison, and feedback questions
Source material for the deck. All claims below survived adversarial verification against main@70ce2eb2 (2026-08-15).

## The engagement

Patina asked an outside UX firm: *"Review how a designer starts a job, loosely specs things, and progresses through finalizing the spec. Review the order of this flow in The Document. It is not intuitive; designers have to hunt for things. Propose two ways to make this a natural flow — designers should be able to accomplish what they need, when they need it."*

Method: we walked the code (the paper's actual render order in doc/[id]/page.tsx), the decision record (DECISIONS I114/I135/I136), and Patina's own prior audits (the July discoverability review with pilot designer Leah fleeing to the legacy portal twice; the August audits and journey walks). Every finding below carries its citation. Both proposals were then adversarially verified against the code and revised — the numbers presented are the ones that survived.

## Credit where due (credibility paragraph — the deck must include this)

I135 ("The Project, Composed") and I136 ("The Shelved Spine") — shipped 2026-08-14/15 — already fixed real friction: one inked leader per region head, always-visible row verbs, fold seams, the red-letter needs zone, reference material moved to shelves, the schedule editor folded by default, the guide directly under the letterhead activating in place. The remaining problem is narrower and deeper: **the order of the paper, the number of clocks, and where the spec tools live relative to the work.**

## Findings ledger (the diagnosis)

F1 — **History sits between the guide and the work.** PreviousWork (settled Brief/Discovery/Direction/Proposal bars) renders above the schedule and the active section (page.tsx ~1049), so the designer scrolls past the record to reach the live work.

F2 — **The index and the paper disagree.** The spine's running index declares "Reading order down the paper": schedule → approvals → ffe → money (document-index.ts:18–23). The DOM mounts approvals (page.tsx:1035) *above* the schedule ledger (~1256). The document's own table of contents contradicts its body.

F3 — **Two regions on one page are named "Schedule."** ScheduleRuleRegion (the date editor, top of paper, fold key `schedule-rule`) and ScheduleSpine (the phase ledger inside the Project section, fold key `schedule`). I136 had to mint distinct fold keys precisely because they collide.

F4 — **Three clocks tell different times.** Seven spine sections, eleven residential workflow stages (a thin sub-label), and project_phases (the schedule). DECISIONS I114 left the section↔stage mapping explicitly unresolved: "Direction (a section that seals) and stage 05 (a stage that completes) overlap without agreeing." A project doc's spine advances only on current_phase ∈ (installation, final_walkthrough) (migration 00327:98–102) — stage completion never moves it.

F5 — **"Begin the Direction" skips the Direction section.** The verb hard-jumps to the Drafting Room route (/drafting/[proposalId]); the Direction section that exists on the doc is never landed on; and the relationship's /doc/[id] stops resolving once the proposal is minted — the one verified dead bookmark in the flow.

F6 — **Loose speccing's tools are a route or a viewport away.** Empty FF&E's only verb is "Open the spec book" — a route off the paper. Mood boards live only in a ≥1440px shelf leaf. The spine's running index, rooms list, and shelves do not exist below 1440px; the room lens self-releases below 1440px. A piece can enter the schedule through four different doors (Add-a-line sheet, Library placement, spec book, capture/scan).

F7 — **"Add a room" was demoted by mechanism, not by ruling.** I135's one-inked-leader rule mechanically pushed it to a secondary verb; DECISIONS flags it "for a design ruling" — still open.

F8 — **Finalize's verbs are scattered and the wall is silent.** Proposal authoring lives in a separate 8-facet room while the doc shows a read-only preview; approvals draft/publish/supersede were demoted to secondary entries; the release-for-authorization ceremony hides inside the FF&E region head; verdict state is a 9px whisper; after Send there is no stated designer-side path — no printed "Nudge / Revise / awaiting countersign."

## Shared planks (both directions agree — present once, before the two directions)

SP1 — **"Begin the Direction" lands on the Direction section of the doc** — the Drafting Room (while it exists) is reached from there and returns there.
SP2 — **No doc id ever 404s** — a relationship-id alias so the one verified dead bookmark dies; the seal-side alias (R6 redirect) already exists.
SP3 — **A stated verb at the send wall** — printed lifecycle state ("Sent 3 days ago — nudge / revise / awaiting countersign") instead of silence.
SP4 — **The add-room ruling** — an empty region's leader is its constructive verb; with rooms present, "Add a room" prints in flow. Answers I135's open flag.
SP5 — **The boards question** — both directions want board content touchable from the paper during speccing; both acknowledge this reverses I136's same-day transplant and put it to the team as an explicit amendment, not a silent change.

## Side-by-side comparison

| | A — The Work Order | B — The Worktable |
|---|---|---|
| Thesis | Same surface, collated: one fixed canonical order | The stage composes the paper: four tables, tools on the table |
| What moves | Regions reorder once, for everyone, forever | Region weight re-composes per stage; order stable within a table |
| The three clocks | Merged into one instrument (the Rule); sealing semantics as a gated follow-up | Consumed as-is: sections pick the table, stages pick the setting; forces the I114 resolution |
| Drafting Room | Kept as a room, reached from the Direction section | Retired along its own Scope/Vision/Offer movements onto Tables II/III |
| Doctrine | Compliant except one cut amendment (boards seam) | Seven explicit amendments incl. the section-grammar rewrite (A5) — deepest change |
| Risk profile | Regression risk concentrated in the Rule UI merge | Trust risk (shapeshifting) mitigated by stale-table pinning + announced turns; scope risk in Tables II/III |
| Journey (same job) | ~13 hunts → ~6; 1 dead bookmark → 0 | ~13 surfaces → ~6–7 presses; 1 dead end → 0 |
| First slice | The S set: Record to the foot, index-from-order, add-room ruling (days, not sprints) | The Speccing table: landing fix + alias, inline composer, library reach-in, rooms rail (3–4 sprints) |
| Total cost | S×3 · M×8 · L×1 (+ L×2 gated/deferred) | S×3–4 · M×5 · L×1 (Finalize table) across 4 tables |
| Ships value fastest | Yes — first slice is days | No — but first slice attacks the loudest complaint hardest |

**The firm's read (present as recommendation, clearly labeled as ours to accept or reject):** these are not exclusive. A's canonical order and index-from-order are the substrate B's tables would compose on; A's S-set could ship while B's Speccing table is designed. If forced to one: A de-risks the whole surface for every stage; B transforms the stage the complaint names. The honest sequencing is A's S-set first (days), then decide whether the next investment is A's Rule or B's Speccing table.

## Feedback questions for the Patina team (the deck's closing page)

Q1 — **Boards on the paper (SP5):** I136 moved boards to the shelves yesterday; both directions want them touchable during speccing. Reverse for the direction stage, or hold the shelf line?
Q2 — **The clocks:** Is the team ready to rule the I114 section↔stage mapping (A's sealing semantics needs it; B's table selector forces a smaller version of it)? Who owns that ruling?
Q3 — **Fixed order vs stage composition:** Does the studio trust a paper that re-weights at ceremonies (B), or is the fixed collation (A) the ceiling of acceptable motion?
Q4 — **First slice:** A's S-set (days) vs B's Speccing table (3–4 sprints) — appetite?
Q5 — **The Drafting Room's future:** room reached from the Direction section (A) or retirement along its movements (B)?
Q6 — **Intake capture:** Is pre-proposal capture (client's Pinterest exports at Discovery) a real complaint worth a new store (B's slice-2 candidate), or inferred?
Q7 — **Below 1440px:** Both directions restore reachability (<1440 index strip in A; compact table tools in B). Priority relative to desktop work?
