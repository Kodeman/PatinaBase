# Mood Board UX Audit — Synthesis (Fable, 2026-08-31)

Inputs: prod-test report + follow-up, 5 panel reports (canvas expert, visual/UI, IA/workflow, Marisol solo-designer persona, Devon studio persona). ~60 raw findings deduped below. Prior-program context: MoodBoard GA 2026-08-03; the acceptance ledger's waived rows predicted two of the observed prod failures.

## The one-sentence diagnosis

The room itself is above class average (clean canvas/persistence seam, genuinely good command engine, rich multi-select, faithful templates, solid exports) — but a post-GA document-kind split silently stranded the healthy proposal-owned path, so **all new client work lands on the project-owned path, where creation, group drag, and duplicate are broken and Share was never wired in**.

## Fix-now defect list (path-independent; do regardless of direction)

| # | Defect | Root cause (verified) | Effort |
|---|---|---|---|
| D1 | Blank-board creation fails on project boards (F1) | `useUpsertBoard` throws on project owners by design (use-boards.ts:594-596) yet `BoardsBuilder.handleBlank` calls it unconditionally (boards-builder.tsx:179-189). Fix = route through an owner-aware RPC like `materialize_board_template` already does (IA-2). | S |
| D2 | Multi-select group drag + Cmd+D duplicate fail on project boards (F2/F3) | Project leg of `apply_board_room_state` payload/validation (controller:841-913); one bug family (CI-05). AC1.11 waived exactly this assertion; AC1.21's green was unit-only. | S–M |
| D3 | No Share on project boards (F4) | Explicit `owner.kind === 'proposal'` gate at board-room-shell.tsx:912-914; backend mint/resolve/revoke for project shares already Passed (AC2.16 SQL-SHARE) (IA-3, VD6). | S |
| D4 | Boards front door missing for new work (F7) | `commercialDocumentExperience()` maps all new agreements to the facet-less `ServiceAgreementDraftingRoom` (no BoardsBuilder import) — unannounced side effect of the commercial-document split, postdates GA (IA-1). Needs a ruling on WHERE (see ask), but some front door must return. | M |
| D5 | Desk recents strip regression | Mounted at GA (21127d615), deleted 2026-08-26 by the Desk-roster rewrite (51986bbc0) with no replacement; component + tests intact and orphaned (IA-4; reverses Ruling #1). | S |
| D6 | Cover-generation edge function failing in prod (F5) | Non-2xx on room exit; AC3.11 passed local-stack only (DV9). Investigate prod config/logs. | S–M |
| D7 | Raw backend errors shown to users | controller:828 interpolates `normalized.message` into the toast — systemic, not just F1 (VD2). | S |
| D8 | Failed save blocks room exit, no retry | `requestExit` refuses while `persistenceError` set; banner has no retry (CI-06). | S |
| D9 | URL unfurl inert (F8) | "SOURCE URL" field stores text, fetches nothing; waived AC3.12 materialized. Designers' top sourcing gesture. | M |
| D10 | Broken "Furniture plan by zone" starter asset (F6) | Seeded template ships a missing image. | S |

## Path A — "The Steady Hand" (interaction polish & trust)
Make the canvas hand-feel genuinely Figma-class. Evidence base: canvas expert CI-01…CI-25; prod obs #2/3/7; Marisol's deadline chaos.
- Core: drag threshold (CI-04) and stop re-stacking on every drag (CI-03); Shift-constrain convention (CI-08 — revisits AC1.13 ruling, justified: Figma/FigJam/Canva all read Shift as constrain); untangle Alt's triple booking (CI-09); 24px handle hit-areas + directional cursors (CI-10); cascade placement for every add (CI-11/VD9); visible zoom controls at all widths (CI-02 — the canvas already ships the cluster, the shell suppresses it); rotated-item resize math (CI-07); in-place note editing (CI-24).
- Depth: touch pinch/pan (CI-01), selection-model depth (CI-19), lock visibility (CI-15), a11y names/live-regions/tab-order (CI-13/14/16), shortcut scoping (CI-17), wayfinding cue/minimap (CI-22), rAF-coalesced pointer moves (CI-25).
- Scope: mostly `BoardRoomCanvas.tsx` + shell; design-system package → deploy-portal.sh rebuild rules apply. Risk: low, contained; visual-regression + e2e already exist. Effort: M overall (core S–M, depth M).
- What it does NOT do: nothing for sharing, clients, or studio workflows.

## Path B — "The Client Loop" (presentation → reaction → decision)
Complete the moment the board was made for: designer finishes at 9pm, client reacts overnight, approved pins march into procurement. Evidence: Marisol M1 (the flagship solo workflow is impossible end-to-end today), F4/D3, VD12/VD14 parity waivers, IA-11, DV10.
- Core: share parity + discoverability everywhere boards appear (D3 plus list-card affordances); a lightweight verdict-capable guest link (revisits Ruling #2's "guest never offers verdicts" boundary — justification: for a new client with no portal login, the reaction loop is Patina's differentiator and it's currently unreachable; keep it token-scoped, revocable, per-pin tap reactions only); visible verdict → send-to-schedule flow with an explicit "approved pieces → purchase pipeline" moment (validates Marisol M5, closes IA-11's suspected dead-end).
- Depth: edit/present placeholder parity (VD12) + close the waived four-surface parity AC (VD14); visual double-Escape prompt (CI-20); prefetch assets before Present for client-wifi resilience; per-project verdict rollup on board cards → a small cross-project "boards awaiting reaction / approved / stalled" view (DV10-lite).
- Scope: shell/share dialog, client-portal share page + board-block, document_shares scope work (schema mostly done), verdicts UI. Migrations touch Strata. Risk: medium — guest-verdict security must stay structural (share-token scoping); revenue-adjacent guest surface. Effort: M–L.
- What it does NOT do: canvas hand-feel, studio delegation.

## Path C — "The Studio Engine" (sourcing, templates, oversight)
Make boards work for teams and volume. Evidence: Devon DV1–DV18; IA-5/6/7; F8.
- Core: real URL unfurl (D9 — the sourcing wedge; feeds the price-true procurement spine); bulk "promote all" on template materialization (DV3 — revisits the strip-owner-links ruling only in degree, not kind); internal direction layer distinct from client verdicts (DV6 — never scoped in the PRD); cross-project boards view (DV8/DV10: mount the recents strip, then a studio-wide status rollup).
- Depth: naming prompt at creation (IA-6, kills "Board 2"); archived-boards list (IA-7); studio-template asset validation at save (DV13); unify the worktable strip's creation with the picker (IA-5); revisit realtime presence for the junior-delegation scenario (DV7 — the ruling's own reconsideration trigger).
- Scope: portal features + a couple of migrations (internal comments, rollup views). Risk: medium — new surface area, but little touches the canvas. Effort: L.
- What it does NOT do: hand-feel polish, guest client loop.

## Recommendation

1. **Fix-now list first, this week** — D1–D8 are small, severe, and mostly one bug family plus three one-line-to-small wires. The suite is embarrassing on exactly the path all new work takes; no direction bet matters until it's credible.
2. **Then Path B** — it completes Patina's actual differentiator (board → client reaction → procurement). Both personas independently named the same gap: Marisol can't leave the link, Devon can't report on reactions. Path A's core items (threshold, re-stack, cascade, zoom buttons) are small enough to fold into B's wave as hygiene; Path A's depth and Path C wait for the next cycle, with C prioritized if studio-seat growth is the quarter's goal.
3. **Rulings the deck must ask for** (next R### after R127): (a) where the boards front door lives for new work — restore a Boards facet on new agreements, or commit to the project surface as canonical (D4); (b) whether guest links may carry lightweight verdicts (revises Ruling #2's boundary); (c) Shift-constrain convention change (revises AC1.13); (d) confirm the desk recents strip returns (re-affirm Ruling #1 against the 08-26 Desk rewrite).

## Protect list (strengths every path must not regress)
Command engine + partial-rollback undo; canvas/persistence seam; smart guides + group resize; template materialization fidelity + promote-to-selection; share dialog design (the house's best dialog); export trio; ⌘K recents; 44px touch-target discipline; allow-listed return paths; "Working boards vs Signed direction" lifecycle split.
