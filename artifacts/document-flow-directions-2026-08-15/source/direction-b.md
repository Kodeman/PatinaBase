# Direction B — "The Worktable" (stage-adaptive)
Lane B's proposal v1, followed by its revision addendum (v2). The addendum supersedes the cited passages; the deck must present the merged, corrected direction.

---

## v1 proposal

### 1. Thesis

The document already knows what week it is. `document_state` names the active section; the gate derivations name the one act the studio owes; `selectActivePhase` names where today falls in the schedule — and then the paper prints everything at equal weight anyway, and asks the designer to find the work herself. The Worktable ends that. The paper composes itself around the stage: the active stage's work spreads out at the top of the paper with its tools *on* it — the boards strip beside the loose scheme, the library within reach of the empty line, the drafting facets under the send verb — while every other domain compresses to one scored line that unfolds in place. The spine stays the fixed geography; the letterhead stays the fixed name; only the middle of the paper re-weights. A designer never hunts, because the surface she lands on *is* the work she came to do — and everything she is not doing today is one seam away, exactly where it always is.

### 2. Principles

1. **The stage composes the paper; the spine never moves.** Region *order and weight* are stage-derived, the way sections already are (`deriveSections`). The seven-section spine, the letterhead, the margin, and the colophon are the fixed skeleton. The paper re-weights; the document never changes shape.
2. **Tools live on the table, not a route away.** If a stage's work needs a tool — boards, capture, library, drafting facets — the tool mounts on the active region for the duration of that stage. Shelves remain the tools' *home*; the table *borrows* them.
3. **Everything else is one seam.** Any domain not on the table compresses to a scored one-line summary (the settled-bar primitive, generalized) that unfolds in place. Nothing is removed; everything is one press away. This is a re-weighting argument, not new machinery — fold seams and settled bars already exist.
4. **One inked leader per table.** The RegionHead doctrine, applied at table scale: each table has exactly one inked verb (leader derivation corrected per R2 — Tables I–III derive from their own stores; Table IV alone speaks gate).
5. **Transitions are ceremonies, not surprises.** A table never reshuffles under the designer's hands. Tables turn only at the moments the system already marks — a lead accepted, a proposal sealed, an install window committed — and the turn is announced on the paper, never silently.

### 3. The Worktable model — four tables across the job arc

The table is selected by the existing derivation chain: `row.active_section` (deriveSections' order: brief → discovery → direction → proposal → project → install → care), refined by proposal lifecycle (`liveProposal.status`) and, inside the Delivery table, by `selectActivePhase` over the resolved schedule. No new phase model — this *consumes* the three existing ones: stages pick the table's *setting*, sections pick the table.

**Table I — The Intake Table** (`active_section: brief | discovery`) — rebuilt per R1: the lead record / Discovery capture spread, the household chip promotion, and **honest seams** downstream — each future domain prints its scored line naming what it will become and when its first verb arrives ("Boards — open with the Direction"). Inked leader: "Accept & open Discovery" (brief) → "Begin the Direction" (discovery complete). Turns when the lead is accepted, and when Discovery's readiness reports complete.

**Table II — The Speccing Table** (`active_section: direction`, and `proposal` while draft) — the table the complaint is really about. On the table, in order: (a) the **rooms rail** — Add room first-class on the table head, a proposal-keyed room lens as a segmented row at every width (R6); (b) the **loose scheme** — the Drafting Room's FF&E facet (FFEScheduleBuilder + ScheduleLineUnfold) mounted ON the paper as sketch-grade lines with the composer inline; (c) the **boards strip** — a new proposal-keyed strip component (R3), drag from board → scheme line; (d) the **library reach-in** — a search field on the table reaching the Library in place (overlay sheet, D1-clean), so a piece enters the scheme through one door instead of four; (e) the capture drop (proposal folio, R85). Leader flips "Add to the scheme" → "Draft the proposal" via useDraftingState gaps. Turns when the proposal is sent.

**Table III — The Finalize Table** (proposal sent → signed) — rebuilt per R2 around what a sent proposal actually owns: the ProposalWatch view promoted to the table's spread, the **verdict roll-up as the headline sentence**, the Offer-movement facets (Phases · Exclusions · Payments · Terms) fold-open under the spread (R4), send/nudge/revise as the table head, and a Decisions strip (a read of the margin — amendment A6). Leader derived from proposal lifecycle × verdict roll-up: "Finish the draft" → "Send the proposal" → "Answer the flags" → "Nudge {client}" → "Revise & supersede". Turns at the seal — announced on-paper.

**Table IV — The Delivery Table** (`active_section: project | install`), two settings. **Procurement** (default): ScheduleSpine phase ledger + FF&E in procurement grade + "Release for authorization" lifted onto the table head as the inked leader when releasable lines exist; MoneyRegion compresses to a seam ("$62,400 committed of $80,000 authority") that unfolds in full. **Install**: turns when `selectActivePhase` lands on installation or the InstallWindowCeremony commits a window — making Install a real mode at last: FF&E flips to install grade, InstallWindowCeremony and CareBand spread open, procurement detail seams. Leader: the gate verb (`deriveGates` overdue-first), falling back to "Release for authorization" / "Commit the install window." ProjectApprovalDocumentMount lives here (and on post-signing change-order proposals only — R2).

### 4. The Drafting-Room resolution (redrawn per R4, R5)

**Authoring comes onto the paper; the Drafting Room retires along its own movement rules.** The real eight facets (drafting-room.tsx:465–660) are Rooms · FF&E · Palette · Boards · Phases · Exclusions · Payments · Terms, grouped Scope / Vision / Offer. **Scope + Vision (Rooms, FF&E, Palette, Boards) become the Speccing table itself** — FF&E's facet already wraps the same builder, so "authoring on the paper" is literal. **Offer (Phases, Exclusions, Payments, Terms) fold open on the Finalize table** in their FacetSection seam form. **Nothing needs a full-bleed sheet** — the one width-hungry piece, the ≥1440 live client-copy rail (ProposalPreviewRail), becomes a shelf leaf ("Sarah's copy"); below 1440 the existing "Preview client copy" overlay act remains. The /drafting route redirects one release, then retires.

**The Direction skip, fixed** (reworded per R5): "Begin the Direction" performs the act whose *outcome* the derivation reads (proposal creation against the relationship) and the section flips because the view says so; the designer stays on the same /doc/[id] via the **relationship-id alias**, built as part of this fix (M). The Direction section is no longer skipped because the Direction table *is* the destination.

**The URL rebind**: the seal-side alias already exists (R6 redirect, page.tsx:466–468); the new work is the relationship-id leg. The first paint after the seal prints a one-line note above the Delivery table — "This proposal was signed March 4 and continued as the project document."

### 5. Continuity & trust

**Working ahead / looking back:** spine markers unfold **any domain that exists on this document** in full working grade (scoped per R1), with a quiet dateline: "Money · unfolded out of turn." Future seams focus and state their opening condition. **Nothing unreachable at <1440px** (amendment A4): every table tool has a compact form; display:none is forbidden for table tools. **The fixed skeleton:** letterhead (title, household chip, vitals, red-letter zone), spine with all seven sections, margin rail (D2 untouched for state), guide sentence, colophon, Esc-puts-down. The spine always tells you which table is set before you scroll a pixel.

**Stale-table pinning (R7):** the page snapshots the table key (`active_section` + lifecycle refinement) into local state at mount; derivations that would change the key do not re-compose the paper — they arm a one-line "The table is ready to turn — turn it" note above the current spread. Pressing it (or re-opening the document) adopts the new key. Data inside regions stays live; only the composition is pinned. S.

---

## v2 Revision Addendum (accepted findings; supersedes cited passages)

**R1 — Table I rebuilt honest.** Leads/Discovery have no folio store and no board home; v1's capture drop and Start-a-board tile are withdrawn from the shipping table. Capture and boards begin at Table II where the stores are real (ProposalFolioStrip, proposal-keyed Boards facet). Optional, priced separately: an additive relationship-keyed intake-attachment store (migration + hook + strip: **M**) — slice 2's headline only if intake capture proves a real complaint. The override promise is scoped to domains whose stores exist.

**R2 — Table III rebuilt.** ProjectApprovalDocumentMount returns null without a projectId (project-approval-document-mount.tsx:32) and gates derive from useProjectContextualHandoffs(projectId) — a pre-signing proposal has no gates. Table III's spread is the proposal's own instruments (ProposalWatch, verdict roll-up); its leader derives from proposal lifecycle × verdicts; gate verbs begin at Table IV. ProjectApprovalDocumentMount re-scoped to Table IV + post-signing change-order proposals.

**R3 — Boards strip is a NEW surface.** The mood-board shelf leaf is project-keyed; direction-stage boards are the proposal's Boards facet. The Speccing boards strip is a new proposal-keyed component wrapping BoardsBuilder's read in strip form (**M**). First slice re-costed: **3–4 sprints, not 2** (Direction landing + relationship alias M, inline composer S, library reach-in M, boards strip M, rooms rail S–M). If it must shrink, the boards strip drops to slice 2 before the library reach-in does — the reach-in kills four doors; the strip kills one shelf cliff.

**R4 — Facet decomposition redrawn** against the real eight (no "pricing grid" or "plan markup" facets exist; plan markup is plan-room world, 00429). Scope+Vision → Table II; Offer → Table III; preview rail → shelf leaf; no full-bleed sheets needed.

**R5 — Direction boundary reworded; alias work moved here.** active_section is a derived view column (00191/00327) — never mutated. Keeping the designer on the same /doc/[id] through the flip requires the relationship-id alias, in the first slice at **M**. Seal-side alias already exists (R6 redirect); only the relationship leg is new.

**R6 — Parallel room lens, priced, amendment named.** The project room lens is project-room-keyed and deliberately releases <1440 (I136-errata). The Speccing rooms rail is a parallel proposal-keyed lens (**S–M**). **Amendment A7:** the below-1440 self-release rule applies to shelf-resident lenses; a lens on the table head persists at all widths because its subject is on-screen at all widths.

**R7 — Stale-table pinning mechanism named** (see §5). S.

**R8 — Amendment set completed.** A1 region order/weight stage-derived · A2 shelf content may mount on paper as a table tool — **re-labeled a REVERSAL of I136's same-day boards transplant, stated plainly** · A3 proposal authoring on paper; Drafting Room retires via redirect · A4 compact forms required <1440 (display:none forbidden for table tools) · A5 **the section grammar itself** — retiring "exactly one active section at full grade" amends the seven-section deriveSections grammar (section-derivation.ts:59–67) as consumed by spine states, Desk need lines, deriveFillState, and the D13 mobile sheet; the derivation survives, its consumers gain a table layer; the deepest amendment · A6 a narrow D2 carve-out — the Decisions strip is a *read* of the margin; actions still resolve through the margin; D2 holds for state, carved only for placement · A7 table-head lenses persist at all widths.

**R9 — Journey corrected; shared planks named.** Only one dead end verifies (/doc/<relationshipId> after Begin the Direction); the post-signing proposal bookmark is alive (R6 redirect). The Direction-landing fix, send-wall instrument, and boards-on-paper are shared planks with Direction A. The Worktable's differentiated claims: the **composition** (re-weighting + seams + one leader per table), the **stale-table ceremony**, and the **facet-movement inheritance** (the Drafting Room retiring along its own Scope/Vision/Offer rules).

## Re-walked journey (v2)

| Step | TODAY (surfaces / hunts) | WORKTABLE v2 |
|---|---|---|
| New lead arrives | Desk → doc, brief section; capture at /rooms if needed (2–3 surfaces) | Desk → doc: Intake spread; downstream futures as honest seams (1–2) |
| Accept, open Discovery | Guide action → Discovery (1) | Same (1) |
| Spec a living room, loosely | "Begin the Direction" → Drafting Room, Direction section skipped, relationship URL dead-ends (1 verified dead end); FF&E empty → spec-book route; boards ≥1440 shelf; Library at /library (5–6 surfaces) | Leader lands on the Speccing table at the aliased /doc/[id]: rooms rail, inline scheme on-paper, boards strip, library reach-in (1 surface, 0 routes) ‡shared plank: landing fix |
| Firm it up | Drafting Room, 8 facets; doc read-only (2) | Scope+Vision already on Table II; Offer facets fold open on Table III; client copy on a shelf leaf (1) |
| Send proposal | Drafting Room → send; back to doc (2) | "Send the proposal" — lifecycle-derived leader, gaps-clear flip (1) ‡shared plank: send-wall instrument |
| Client responds | Verdicts a 9px whisper; no stated path at the wall (hunt) | Table III headline = verdict roll-up; leader = proposal-derived verb ("Answer the flags" / "Nudge Sarah") (0 hunts) |
| Approval → release | Signed → R6 rebind (link survives, turn unannounced); release ceremony inside FF&E head (1 hunt) | Turn announced at the seal; Table IV leader = first gate verb, "Release for authorization" when releasable (0 hunts) |

**Tally: ~13 surfaces and one verified dead end → ~6–7 presses on one paper.** (v1 overclaimed both sides; these are the counts that survive the code.)

### Critical files
- apps/designer-portal/src/app/(document)/doc/[id]/page.tsx — table composition, stale-table pinning, relationship-id alias
- apps/designer-portal/src/components/document/rooms/drafting/drafting-room.tsx — the eight facets and movement rules split across Tables II/III
- apps/designer-portal/src/components/document/proposal-instruments.tsx — watch view and lifecycle acts → Table III's spread and leader
- apps/designer-portal/src/lib/document/section-derivation.ts — the grammar amendment A5 layers the table selector over
- apps/designer-portal/src/lib/document/workflow-gate.ts — gate verbs, scoped to Table IV only
