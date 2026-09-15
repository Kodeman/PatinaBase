# Rulings digest — everything already decided about time in Patina

Source of record: `docs/design/the-document/DECISIONS.md` (append-only). Line numbers as of 2026-09-11. **For this program Kody has ruled these OPEN FOR CHALLENGE** — a seat may recommend amending or overturning any of them, but must state the cost of doing so and tag the recommendation `CHALLENGES: <id>`.

| ID | Line | Ruling (paraphrase; read the source before citing) |
|---|---|---|
| **D9** | :20 | Time: capture in the document (spine timer), review in the drawer (Hours ledger). |
| **D10** | :21 | Suggestive, adjustable capture. Timer counts, designer adjusts up or down, nothing auto-trims. <60s discards silently. Idle detection only annotates. |
| **D11** | :22 | Timer auto-starts on pick up — was provisional pending Leah's gut-check; fall back to one-tap start if it felt surveilling. |
| **R4** | :131 | Ruling on O3 — time system unification: extend `project_time_entries` additively (minutes canonical, `raw_seconds` additive); never fork a parallel table. D10/D11 stand. |
| **R19** | :668 | D11 RESOLVED — auto-start ratified (2026-06-12). Evidence: timer unnoticed through a real work block; Leah: "punch card — comfortable." Manual start remains only as the spine/bar control for documents picked up without intent to work. |
| **R20** | :679 | Write-first close-out; the log strip has NO timeout — persists until acted on or chained out. |
| **R64** | :2359 | Runaway-timer bound: a contiguous idle gap ≥ 30 min marks the timer abandoned; close-out proposes the *active* duration (idle annotated, never summed); provider auto-pauses accumulation at last-activity (+grace). 30-min number is "watch with data." |
| **R65** | :2378 | Track 6 provisionals resolved — R64 confirmed as written. |
| **R69** | :2555 | The at-rest running readout rests at minute resolution — no per-second motion in peripheral chrome (spine timer, mobile bar). Precise mm:ss only in the opened mobile timer sheet. Kody-directed; to confirm with Leah. |
| **R75** | :2640 | Export opens the composer — the time→invoice pull-through ("Export week → Accounts" pre-claims the week's unbilled entries). Closes BIL-04. |
| **R77** | :2648 | The full Hours ledger: week paging, all-time unbilled balance + "Bill it", per-document lens, delete-with-confirm; retires `/portal/time` and `/portal/projects/[id]/time`. Closes PRJ-14 / BIL-11 / BIL-12. |
| **R82** | — | The Record ledger (quiet, at-rest system rows) — referenced by the draft's nudge design. Verify the line before citing. |
| **margin rule** | `apps/designer-portal/src/lib/document/margin-groups.ts:6-13` | "time" is not a margin item the margin prints: it is the studio's own clock; every surface that lists the margin excludes it. |

## Vision (`docs/vision/VISION.md`) — binding above every design doc

- §2 (:29-31): the customer is a growing studio at the moment it adds its first hands while workload doubles. "The studio owner is delegating for the first time, her own hours are already spoken for twice, and the thing she cannot afford is a new system to learn."
- §3 (:38-46): two streams — studio subscription (floor) and margin on furniture (upside). Hours feed neither directly; they feed the studio's *own* invoicing, which is what keeps the subscription paid.
- §4 (:50): **"To the studio: you won't notice Patina.** It is not a place you go. It prompts and collects information when and where you need it, then gets out of the way. Success is that she doesn't notice — so we will never optimize the studio surface for engagement."
- §5 (:58): The Document — "One living document per engagement. No dashboards, no task manager, no tab bars."
- §6 (:70-76): saying no to — the "AI" label; consumer-first thinking; engagement metrics for the studio surface; **tab / zone / dashboard UI, shadows, red/green status, badges**; funnel-spam growth; scope creep; launching to an empty room.
- §8 (:93): feature test — which surface, which studio moment, which stream, which promise? None → side journey.

## Field Companion program (`docs/design/field-companion/field-companion-package.md`)

- FC-R3 (:154, :1403-1436): "one act writes both rows — the Visits block is the record, the Hours entry is its billing shadow." Field writes a **completed** entry only, never a running timer (the portal's timer owns the one-running-timer index).

## Prior open items that touch hours

- `docs/design/the-document/the-document-needs-ruling-2026-07.md:18-20` — BIL-12 (time entry deletion) and PRJ-14 (ledger history/unbilled balance) — both since closed by R77.
- `docs/product/designer-portal-workflow-gap-analysis.html:501-692` — competitive floor: Studio Designer 5 concurrent timers + GL; Houzz Pro invoices from time entries; Programa time→invoice lines + "Smart Timer" 2026; DesignFiles top tier. Patina scored 0 on "time tracking & billing" at the time of that audit (pre-00177).
- `docs/Prog/programa-teardown-patina-gap-map.html:322` — Programa: global start/pause/resume timer with smart project assignment, manual entries attachable to tasks, grouping by project/person/date, export, time-to-invoice-line conversion.
- `docs/marketing/founding-onboarding/copy-deck.md:379,627` — drip email E7: "Hours logged themselves this week. Have a look." → `/desk?sheet=hours` (note: the live doorway is `?book=hours`).
- `docs/prds/Projects/patina-designer-portal-mvp-additions-spec.md:61,155` — earlier PRD intent: hours per phase as progress bars, effective rate, time-by-designer breakdown for multi-designer studios.
- Memory: `project_phases.estimated_hours` orphaned (D-B5, owed re-home).
