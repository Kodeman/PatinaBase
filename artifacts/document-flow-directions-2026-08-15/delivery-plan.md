# Start to Signature — delivery plan (program `sts`)

Ratified 2026-08-15 by Kody's Q1–Q7 rulings on the "Start to Signature" deck. Fable architects/orchestrates/reviews; agents execute. Full scope = the ratified sequence; excluded only what is gated on Kody's still-owed I114 mapping session (A's L-b sealing semantics, the Rule merge — not in the ratified path; B's tables read `active_section` only, which needs no I114 ruling).

## Rulings in force
Q1 boards REVERSED for speccing stage (DECISIONS amendment required) · Q2 I114 session owed by Kody (nothing here depends on it) · Q3 ceremonies trusted (Worktable is the destination) · Q4 A's S-set first · Q5 Drafting Room retires in two steps (landing fix now; decomposition later waves) · Q6 intake store HELD (Table I honest seams only) · Q7 <1440 same bar, same slice (A4 doctrine: no display:none for table tools).

## Waves

**W1 — Collation + shared planks (GA, no flag).** One Opus agent, sequential, main checkout, branch `sts/wave1-collation`.
1. The Record: PreviousWork moves below the active section (foot of paper, before colophon).
2. Canonical-order: one array drives both paper composition order and the spine running index (`document-index.ts` derives from it).
3. Add-room ruling (SP4): "Add a room" as an in-flow scored-ink line at the foot of the FF&E room list; RegionHead ledger unchanged (one-leader contract polices the head only). DECISIONS entry answering I135's flag.
4. SP1: "Begin the Direction" lands on the Direction section of the doc; the Drafting Room is reached via an inked leader in the Direction section and returns to the doc.
5. SP2: relationship-id alias — after a proposal is minted, `/doc/<relationshipId>` resolves (router.replace, mirroring the existing R6 seal-side pattern) instead of dead-ending.
6. SP3: send-wall state line — printed lifecycle state with verbs at the proposal instruments ("Sent N days ago — nudge / revise / awaiting countersign").
Gate: designer-portal type-check + targeted jest. Adversarial review (separate context) before W2.

**W2 — Worktable core (flag `worktable`, fail-closed).** One Opus agent, sequential, branch `sts/wave2-worktable-core`.
- Table selector: `active_section` → table (I intake: brief|discovery · II speccing: direction + proposal-draft · III finalize: proposal sent→signed · IV delivery: project|install), lifecycle refinement from `liveProposal.status`; settings within Delivery via `selectActivePhase`.
- Stale-table pinning: table key snapshotted at mount; changes arm a "The table is ready to turn — turn it" line; data live, composition pinned.
- Generalized seams: non-active domains compress to scored one-line seams that unfold in place; future domains print honest "opens with the Direction"-style seams (no fake affordances — Q6).
- Region re-weighting composition in `doc/[id]/page.tsx` behind the flag; flag off = W1 behavior exactly. Fixed skeleton untouched (letterhead, spine, margin, guide, colophon, Esc).
- DECISIONS drafts for amendments A1 (stage-derived weight) + A5 (table layer over section grammar).
Gate: type-check + jest; flag-off parity is a review item. Adversarial review before W3.

**W3 — The Speccing table (parallel Sonnet lanes, worktrees, integration branch `sts/wave3-speccing`).**
- 3a inline composer: the loose scheme on the paper for direction-stage docs (Scope/Vision movements — the drafting FF&E builder mounted on the table; empty state's leader = "Add a line" in place).
- 3b boards strip: NEW proposal-keyed strip component (wraps the Boards facet's read); board→line assignment; Q1 reversal DECISIONS entry (amends I136 for the speccing stage only).
- 3c library reach-in: search field on the table opening the Library as an overlay sheet (D1-clean; one door for pieces).
- 3d rooms rail: proposal-keyed room lens as a segmented row on the table head, all widths (amendment A7).
Every lane ships its <1440 compact form in the same lane (Q7/A4). Lanes touch only their own new components + a narrow mount-point contract in the table composition defined by W2. Integration + review before W4.

**W4 — Finalize, Delivery, Intake tables + Drafting Room decomposition (mixed lanes, worktrees, integration branch `sts/wave4-tables`).**
- 4a (Opus) Table III: ProposalWatch as the spread; verdict roll-up headline; lifecycle×verdict leader derivation (draft+gaps→"Finish the draft" … all-approved-unsigned→"Nudge {client}" … "Revise & supersede"); Offer facets (Phases/Exclusions/Payments/Terms) fold-open under the spread; preview rail → shelf leaf ≥1440, existing overlay act <1440; `/drafting` route kept as redirect (Q5 step 2).
- 4b (Sonnet) Table IV: release-for-authorization lifted to the table head (leader when releasable); MoneyRegion compressed to an unfoldable seam; Install setting (selectActivePhase on installation or committed install window → FF&E install grade + InstallWindowCeremony + CareBand spread, procurement seams). Gate verbs (deriveGates) Table IV only.
- 4c (Sonnet) Table I: intake spread (lead/discovery + household chip promotion) + honest future seams. No capture drop, no board tile (Q6).
- DECISIONS: A2-as-reversal, A3, A4-as-doctrine, A6 (Decisions strip is a margin read — if 4a includes it), A7.
Integration + review before W5.

**W5 — Program verification + closeout.** Full designer-portal type-check + jest suite; flag-off/flag-on walkthrough parity notes; DECISIONS consolidation (one reviewer pass over all entries); worktree/branch retirement per patina-parallel-work §10; push. Deploy is NOT part of this program (no explicit deploy request); flag retirement awaits Kody's walk.

## Constraints (all agents)
- Doctrine: one route `/doc/[id]`, no tabs; scored ink, no buttons; RegionHead one inked leader; margin = notifications (D2); left edge = orientation; seams fold in place.
- Read `.agents/skills/patina-verification/SKILL.md` before claiming green; the designer-portal gates are `pnpm --filter @patina/designer-portal type-check` and targeted jest via `pnpm --filter @patina/designer-portal test -- <spec>`.
- Pathspec commits only; never `git add -A`; never stash; never `reset --hard`.
- Source briefs with corrected costs/critical files: `artifacts/document-flow-directions-2026-08-15/source/`.
