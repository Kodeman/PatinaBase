# Mood Board — "A Room for the Board"

Development handoff package for the reimagined Patina mood board. The direction
deck was approved 2026-08-03; the four scope questions it left open are now
decided (see [Decision log](#decision-log)).

**Status:** approved direction, specs ready for build. Phase 1 is unblocked and
carries zero schema change.

## Reading order

| # | Doc | What it is | Read if |
|---|-----|-----------|---------|
| 1 | [00-mood-board-prd.md](./00-mood-board-prd.md) | Master PRD — problem, goals, personas, competitive context, epics + user stories, non-goals, risks | Always. Start here. |
| 2 | [04-technical-foundations.md](./04-technical-foundations.md) | Reuse inventory, data model, undo/autosave design, canvas growth, export architecture, unified renderer, risk register, verification strategy | Before writing any code in any phase. |
| 3 | [01-phase-1-the-room.md](./01-phase-1-the-room.md) | Phase 1 spec — the dedicated editor route and the interaction bar | Building Phase 1. |
| 4 | [02-phase-2-the-audience.md](./02-phase-2-the-audience.md) | Phase 2 spec — unified presentation renderer, on-canvas verdicts, board share, project boards | Building Phase 2. |
| 5 | [03-phase-3-the-reach.md](./03-phase-3-the-reach.md) | Phase 3 spec — composition-true export, URL unfurl, background removal, image pipeline, templates | Building Phase 3. |

Docs 01–03 are self-contained specs. Doc 04 is the shared substrate every phase
depends on — the undo/autosave contract in particular is a Phase 1 hard
prerequisite and is specified there, not in the phase doc.

## Phase summary

| Phase | Name | Schema | Flag | Ships |
|-------|------|--------|------|-------|
| 1 | The Room | none | `mood-board-editor` | `/board/[boardId]` full-screen editor + the 2026 interaction bar |
| 2 | The Audience | small, additive | `mood-board-editor` | One composition renderer for every client surface, on-canvas verdicts, board-scoped share, project-phase boards |
| 3 | The Reach | one new table | `mood-board-editor` | Composition-true PNG/PDF, URL unfurl, background removal, image pipeline, templates |

## Decision log

Rulings by **Kody**, 2026-08-03, on the open questions raised by the direction
deck (S22).

| # | Question | Ruling | Where specified |
|---|----------|--------|-----------------|
| 1 | Drafting facet: launcher strip, or board entry at desk level too? | **Both.** The drafting-room Boards facet becomes a launcher strip of board covers, *and* boards become first-class at desk/document level (recent boards + ⌘K deep links). | [Phase 1 · R1.2, R1.3](./01-phase-1-the-room.md#r12--entry-points) |
| 2 | Presentation mode: client render too, or designer-driven only at first? | **The unified client render.** Client portal, guest share, and the designer proposal mirror all move to the new full-bleed composition renderer. Sections are visible to clients. One render path, no duplicates. | [Phase 2 · R2.1](./02-phase-2-the-audience.md#r21--the-unified-composition-renderer), [04 · Unified renderer](./04-technical-foundations.md#unified-renderer-plan-phase-2-ruling-2) |
| 3 | Background removal: in-house or third-party? | **Third-party API first**, behind a media-service endpoint. Revisit in-house (rembg/ONNX on the inference worker) only if volume justifies it. Cutout is stored as a *new* image in the `proposal-mood-boards` bucket; the original is retained so the action is revertible. | [Phase 3 · R3.4](./03-phase-3-the-reach.md#r34--background-removal) |
| 4 | Templates: seed a starter set, or let studios grow their own? | **Both.** "Save board as template" (studio-grown) plus a small Patina-seeded starter set. Requires a Phase 3 migration (`board_templates`). | [Phase 3 · R3.6](./03-phase-3-the-reach.md#r36--board-templates) |

### Open items (not decided)

| Item | Status | Owner |
|------|--------|-------|
| Realtime presence / multiplayer cursors | **Open — Phase 4 or never.** Not in scope for Phases 1–3. Reconsider only after Phase 2 usage data shows concurrent-edit collisions. | Kody |
| Pinterest import | **Deferred**, explicitly. The general URL-unfurl path (Phase 3 R3.3) covers most of the need without an API dependency. | — |

## Provenance

- **Direction deck (approved basis):** `docs/design/mood-board-reimagined/mood-board-reimagined-proposal.html`
- **Competitive research:** design-industry platforms (Programa, DesignFiles, Mydoma, Houzz Pro, Studio Designer, SampleBoard) and canvas tools (Milanote, Canva, FigJam, Morpholio Board). Findings summarized in [00-mood-board-prd.md · Competitive context](./00-mood-board-prd.md#4-competitive-context). Research uncertainty flags are carried forward, not flattened.
- **Current-state claims** in these docs were verified by reading the cited source files at the paths given. Line counts are as of 2026-08-03 and will drift.

## Conventions used in this package

- Migration numbers are **never** hardcoded. Every migration is written as
  "next `NNNNN` at build time" — take the number from
  `ls supabase/migrations/*.sql | sort | tail -1` when you write it, and follow
  the **patina-db-migrations** skill.
- Requirements are numbered `R<phase>.<n>` and are individually testable.
  Acceptance criteria reference requirement numbers.
- There is **no CI** on this repo. Every phase doc ends with a verification plan
  naming the exact local commands that gate the work
  (**patina-verification**).
