# Mood Board — "A Room for the Board"

Development handoff package for the reimagined Patina mood board. The direction
deck was approved 2026-08-03; the four scope questions it left open are now
decided (see [Decision log](#decision-log)).

**Status (2026-08-03):** MoodBoard is deployed to direct 100% GA from main merge
`625d8bbdf6db6e72ce5202488fcea189be68c7d2`, preserving Kody's 31 explicit
historical pre-production/manual waivers. Deployment verification and the
controlled authenticated designer/guest smoke passed; four former waivers and
both Phase 1 analytics probes now have complete production evidence. Active
status is 50 Passed, 27 Waived, 2 In progress, 5 Adapted, and 1 Superseded. The
two In progress rows require future organic client-verdict or disabled
background-removal telemetry. See the
[acceptance ledger](./06-acceptance-evidence.md) and
[release baseline](./07-release-baseline.md).

## Reading order

| # | Doc | What it is | Read if |
|---|-----|-----------|---------|
| 1 | [00-mood-board-prd.md](./00-mood-board-prd.md) | Master PRD — problem, goals, personas, competitive context, epics + user stories, non-goals, risks | Always. Start here. |
| 2 | [04-technical-foundations.md](./04-technical-foundations.md) | Reuse inventory, data model, undo/autosave design, canvas growth, export architecture, unified renderer, risk register, verification strategy | Before writing any code in any phase. |
| 3 | [01-phase-1-the-room.md](./01-phase-1-the-room.md) | Phase 1 spec — the dedicated editor route and the interaction bar | Building Phase 1. |
| 4 | [02-phase-2-the-audience.md](./02-phase-2-the-audience.md) | Phase 2 spec — unified presentation renderer, on-canvas verdicts, board share, project boards | Building Phase 2. |
| 5 | [03-phase-3-the-reach.md](./03-phase-3-the-reach.md) | Phase 3 spec — composition-true export, URL unfurl, background removal, image pipeline, templates | Building Phase 3. |
| 6 | [05-implementation-addendum.md](./05-implementation-addendum.md) | Current-repository reconciliation, locked runtime contracts, security decisions, and production order | Implementing or reviewing any phase. |
| 7 | [06-acceptance-evidence.md](./06-acceptance-evidence.md) | Live owner/status/evidence ledger for all 85 numbered acceptance criteria | Every handoff, merge gate, and release review. |
| 8 | [07-release-baseline.md](./07-release-baseline.md) | Dated M1–M8 query contracts, observed M3 proxy, unrecoverable legacy gaps, and approved prospective decisions | Release decision and post-GA measurement setup. |

Docs 01–03 are self-contained specs. Doc 04 is the shared substrate every phase
depends on — the undo/autosave contract in particular is a Phase 1 hard
prerequisite and is specified there, not in the phase doc.

## Phase summary

| Phase | Name | Schema | Release policy | Ships |
|-------|------|--------|----------------|-------|
| 1 | The Room | storage compatibility | Integration gate; no runtime feature flag | `/board/[boardId]` full-screen editor + the 2026 interaction bar |
| 2 | The Audience | additive share/project continuity | Integration gate; no runtime feature flag | One composition renderer for every client surface, on-canvas verdicts, board-scoped share, project-phase boards |
| 3 | The Reach | templates, durable cleanup/rate state, media ledger | One GA release after all phase gates | Composition-true PNG/PDF, URL unfurl, background removal, image pipeline, templates |

## Decision log

Rulings by **Kody**, 2026-08-03, on the open questions raised by the direction
deck (S22).

| # | Question | Ruling | Where specified |
|---|----------|--------|-----------------|
| 1 | Drafting facet: launcher strip, or board entry at desk level too? | **Both.** The drafting-room Boards facet becomes a launcher strip of board covers, *and* boards become first-class at desk/document level (recent boards + ⌘K deep links). | [Phase 1 · R1.2, R1.3](./01-phase-1-the-room.md#r12--entry-points) |
| 2 | Presentation mode: client render too, or designer-driven only at first? | **The unified client render.** Client portal, guest share, and the designer proposal mirror all move to the new full-bleed composition renderer. Sections are visible to clients. One render path, no duplicates. | [Phase 2 · R2.1](./02-phase-2-the-audience.md#r21--the-unified-composition-renderer), [04 · Unified renderer](./04-technical-foundations.md#unified-renderer-plan-phase-2-ruling-2) |
| 3 | Background removal: in-house or third-party? | **Third-party API first**, behind a media-service endpoint. Revisit in-house (rembg/ONNX on the inference worker) only if volume justifies it. Cutout is stored as a *new* image in the `proposal-mood-boards` bucket; the original is retained so the action is revertible. | [Phase 3 · R3.4](./03-phase-3-the-reach.md#r34--background-removal) |
| 4 | Templates: seed a starter set, or let studios grow their own? | **Both.** "Save board as template" (studio-grown) plus a small Patina-seeded starter set. Requires a Phase 3 migration (`board_templates`). | [Phase 3 · R3.6](./03-phase-3-the-reach.md#r36--board-templates) |

## GA release decision

Rulings by **Kody**, 2026-08-03:

- Ship directly to **100% GA**. There is no active designer cohort for a
  meaningful canary; run one controlled authenticated smoke walk after deploy.
- Preserve the historical approval for 31 named release waivers while allowing
  later production evidence to close them. Four are now Passed, leaving 50
  Passed, 27 Waived, 2 production-only In progress, 5 Adapted, and 1
  Superseded.
- Use a prospective M2 baseline that closes after **both 30 days and 50
  completed room sessions**; accept the current M3 proxy and compare it with
  the first **10 genuine, distinct Done boards**.
- Monitor M8 over the first **20 eligible client renders or 30 days**, inspect
  every failure before 20, and publish a D+30 report even with a lower sample.
  A critical privacy/auth issue or renderer failures above 2% requires evidence
  capture and a request for Kody's approval before rollback.
- Launch background removal disabled and defer the media Prisma schema work to
  its later enablement. Launch board-asset cleanup in dry-run mode only; require
  two clean reports before considering destructive cleanup.
- Maintain the **MoodBoard GA** PostHog dashboard and review it manually on D+7
  (**2026-08-10**) and D+30 (**2026-09-02**), without automated external sends
  or a second task queue.

The measurement definitions, monitoring window, and full approval record are in
[07-release-baseline.md](./07-release-baseline.md).

### Production evidence

- Applied Supabase migrations 00406–00411 and deployed Edge versions
  `capture-from-url` v16, `spec-pdf` v18, and `board-asset-cleanup` v1. The
  spec-sheet PDF retry passed after safe-image hotfix `ee8151e8`.
- Verified healthy media deployment
  `dd07e64e-d7f1-4c7b-84d0-525a2c14de80`, client deployment
  `f10ceebd-5d8a-4eda-91da-567c913bff36`, and designer deployment
  `50f6cce1-3535-43fe-aa93-39fa670059e4`. Mirror-parity hotfix `8406a864`
  restored persisted section bands and the documented `surface = mirror`
  presentation event; both passed the live probe.
- Cleanup dry-run job 49718 succeeded with zero candidates and zero deletions;
  destructive cleanup remains disabled.
- The [MoodBoard GA PostHog dashboard](https://us.posthog.com/project/326191/dashboard/1949127)
  is ready with corrected 17-series GA0 coverage, M1–M8, export-failure,
  guest-renderer, and critical-exception tiles. The production walk exercised
  the editor, Present/Edit, three exports, template lifecycle, scoped share
  create/view/revoke, all three proposal entry sources, and project
  continuation. Retained QA boards
  `0ac0e62f-3969-4e11-b83f-8163c4637788` and
  `a34f2026-647c-4b67-b0fc-7a3f1a6db9a5` are excluded from organic KPI
  reporting. AC2.25 and AC3.27 remain In progress only because no client
  verdict or disabled background-removal event was manufactured; M8's first
  eligible authenticated client render remains prospective.

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
