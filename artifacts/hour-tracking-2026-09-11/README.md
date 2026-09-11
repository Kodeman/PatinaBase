# The Studio's Own Clock — hour tracking, reviewed and proposed

**The ask.** Kody, 2026-09-11: review the time-tracking implementation; hours easy to log anywhere; every entry carries who · what · project · rate · billable; views for my / a member's / a project's / the studio's hours; a panel of PMs and UX/UI experts reviews the portal and Patina Field; a business-first HTML proposal, no prose.

**Kody's four program rulings.**

| # | Ruling |
|---|---|
| 1 | Panel method = code + docs review only. No live walks. |
| 2 | Standing rulings (R19, D10, R64, R69, Vision §6) are open for challenge; every challenge names its cost. |
| 3 | The proposal carries waves + effort bands + dependencies + ship gates. |
| 4 | Run as a Workflow, the shape of the Agreement Room and Desk Cards panels. |

**Folder map.**

- `briefing/` — `panel-brief-common.md` (the charge, seven cruxes, memo contract) · `current-state.md` (three exploration reports) · `rulings-digest.md` · `architecture-draft.md` (Opus blueprint, pre-panel)
- `panel/` — nine seat memos: `pm-studio-ops`, `pm-billing`, `pm-timetrack-veteran`, `ux-mobile`, `ux-web`, `ux-reporting`, `leah`, `feasibility`, `critic` — 218 findings
- `synthesis.md` — verdict on today (26 defects, path:line each), criteria table, capture per surface, the four views, rate truth, money hand-off, ruling sheet HT-1…HT-40, deletions, dissents
- `architecture.md` — eight waves W0–W7 with DB/portal/iOS/edge/events/tests, exact gates, dependency table, critical path, parallel lanes, risks, not-in-v1, deletions, rulings mapped to waves
- `deck/src/index.html` — "The Studio's Own Clock", 16 sheets
- `review/` — five rounds: `01-*`, `02-fix-log*`, `03-rereview-*` (content + technical lenses), `shots/` render checks
- `rulings.md` — the ruling sheet, HT-1…HT-40, blank until Kody rules

**The verdict, in three.**

1. **Today.** Capture inside a document is the best thing in the product — zero taps, entry written before she is asked — and everything around it fails: the hour prices at $0 or NULL on the commonest project kind, a new hire's hours are stranded money no later agreement can promote, and three of the four views exist in the database and in no click path.
2. **The shape.** One server-owned answer for rate and billable on every path; one sheet with one admin-gated lens for all four views; one new door per surface (⌘K, the mobile sheet, a Field tile) plus a date field; a per-entry CSV. No new route, no dashboard, no daily nudge, no approval workflow — the invoiced-entry lock already exists.
3. **The ask of Kody.** Forty rulings; four gate the first line of code (HT-1 server owns the rate · HT-4 rate-card rows bind to a person · HT-10 narrow or keep the studio read · HT-37 wire or delete `useStudioTimeReport`) and three decide whether the first hire trusts the clock (HT-30, HT-35, HT-36).

**Waves.** W0 live money bugs + one hook module (M) → W1 rate truth + studio rate card (L) → W2 the four views, one scope lens (M) → W3 capture with nothing in hand + backdating (M) → W4 internal/admin time (L) → W5 the bookkeeper's Friday: CSV + statement (M) → W6 Patina Field: an hour that is not a visit (M) → W7 rate cards bind to people (M). Critical path 15–25 eng-days; 30–50 total; up to three worktrees at once. Widget / App Intents / Live Activity: deferred whole (XL, un-gateable by `capture-gate.sh`).

**Two things the panel refuted in the briefing.** A studio-wide read policy already exists (`time_entries_studio_read`, 00316:237-240) — Wave 2 needs no new SELECT policy; and `useUpdatePhaseEstimates` has no callers, so `project_phases.estimated_hours` is a budget nobody can set.

**Published.** Deck: https://claude.ai/code/artifact/9a461b37-a73b-4778-8357-809f52db0d98

**Review status.** Six rounds, two lenses (content, technical + design). Final: `review/03-rereview-final.md` — clean; render sweep `ALL ASSERTIONS PASS (14 viewports x 4)` at 390 / 700 / 861 / 1001 / 1024 / 1280 / 1440. Two rate holes confirmed against the head classifier body (00578:2599-2820). One program-level item open for Kody: the deck shape (cover + 14 + colophon) has no written contract — R5-15.
