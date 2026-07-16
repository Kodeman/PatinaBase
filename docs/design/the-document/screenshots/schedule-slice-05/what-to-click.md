# Slice 05 — Memory · what to click

Flag `schedule-spine` stays **OFF** in production. This is the **fifth** screenshot drop —
per R104 (the continuous-execution ruling), the per-slice review gate stays superseded through
Slice 05: this drop joins Slice 01's, Slice 02's, Slice 03's, and Slice 04's for one
**consolidated review**, not a per-slice go/no-go.

## Drive it locally

```
apps/designer-portal/.env.local → NEXT_PUBLIC_FLAG_OVERRIDES=schedule-spine:true,the-document-pilot:true
pnpm supabase:start && pnpm --filter @patina/designer-portal dev
designer@patina.dev / password123
```

This slice's walk built its own specimen rather than reusing Aspen, because the accept
criteria need a project whose **v1 baseline is a known-fresh cut**: the seed accepted proposal
(`b0000000-0000-0000-0000-000000000001`, "Sample accepted proposal") had 3 chained phases
(Schematic Design → Design Development → Installation & Styling) and 1 anchored proposal
milestone ("Install day," Oct 15) inserted by SQL, then activated directly as the designer
session — `activate_proposal_as_project('b0000000-0000-0000-0000-000000000001', '2026-07-20')`
with `request.jwt.claims` set to the designer's uid. The resulting project
(`5510fcd0-595d-451b-8df3-47064f937f02`) is what every screenshot below shows, at
`/doc/5510fcd0-595d-451b-8df3-47064f937f02`. Two ripple commits were then made on the Rule's
boundary ticks — `+5d` on Schematic Design (reason left as the prefilled sentence, cutting v2)
and `+3d` on Design Development (reason hand-edited to a custom string, cutting v3) — so every
capture below reflects a project with a real v1→v2→v3 history, not a synthetic mock.

## Screenshots

| File | What it shows |
|---|---|
| `baseline-ghosts-on.png` | Full page, "Baseline" toggle ON: three dashed clay ticks on the Rule labeled "V1 · AUG 10," "V1 · SEP 7," "V1 · SEP 21" — the v1 snapshot's positions for all three phases, rendered alongside the current (post-commit) solid schedule. |
| `baseline-toggle.png` | The "Baseline · ON" toggle itself, cropped tight — the quiet DM-mono control in the meta row beneath the Rule. |
| `revision-ledger.png` | The expanded "Revisions · 3" disclosure at the spine's foot: `v3 · Pushed for fabric delay - vendor confirmed · you · Jul 15`, `v2 · Schematic Design +5d. 2 phases follow. · you · Jul 15`, `v1 · Baseline v1 — cut at signature · you · Jul 15` — newest-first, no edit or delete control anywhere. |
| `reason-edit.png` | A third (test-only, reverted) ripple session on Installation & Styling: the confirm strip open with `+2d` previewed, and the reason field — prefilled, then hand-edited — showing the tail of "...time confirmed with vendor" (the field's own scroll position mid-edit). This session was Esc-reverted, not committed, so it left no v4. |
| `post-commit-ledger.png` | Scrolled to the Rule + Schedule section: the post-commit phase dates (Schematic Design Jul 20–Aug 15, Design Development Aug 15–Sep 15, Installation & Styling Sep 15–Sep 29) alongside the v1 baseline ghosts, "Baseline · ON," proving the two commits' cumulative effect against the frozen baseline in one frame. |
| `v1-snapshot-psql.txt` | Full psql transcript of the v1-at-signature check: the designer-actor activation, the `schedule_revisions` v1 row (actor, reason), the pretty-printed `phase_snapshots` array, the live `project_phases`/`schedule_milestones` rows it must mirror, and the field-for-field `snapshot_matches = t` comparison. |
| `gate-off.png` | `schedule-spine:false` — the old "THE SCHEDULE" `PhaseTimeline` band renders in the Rule/Spine's place; no Baseline toggle, no Revisions ledger, no clay ghosts anywhere on the page. |
| `mobile-390.png` | The same project at 390px, gate on, baseline toggle on (mid-page, above the fold cut off by the pre-existing local-dev error toast — not a regression, see note below). |

(The floating "Error / An unexpected error occurred" toast visible in most captures is the
same pre-existing local-dev artifact called out in the Slice 04 drop — present identically
regardless of any schedule interaction, not a Slice 05 regression. Not chased further.)

## What the walk found

**All five §6 accept-criteria checks passed**, each with direct DB or driver evidence.

**v1 at signature.** Activated the freshly-built 3-phase/1-milestone proposal directly as the
designer session. `schedule_revisions` holds exactly one row: `actor` = the designer,
`reason` = `"Baseline v1 — cut at signature"`, and the stored `phase_snapshots` array matches a
snapshot freshly rebuilt from the live `project_phases`/`schedule_milestones` rows
field-for-field (`snapshot_matches = t`, psql — see `v1-snapshot-psql.txt`).

**v2/v3 from ripple commits.** A `+5d` Rule-drag-equivalent edit (typed into the spine's own
duration field) committed with the prefilled sentence untouched cut v2 with `reason` =
`"Schematic Design +5d. 2 phases follow."` exactly. A second edit, `+3d`, committed with the
reason field hand-edited to `"Pushed for fabric delay - vendor confirmed"` cut v3 with that
exact custom string. Both confirmed by direct `schedule_revisions` SELECT. The telemetry path
was traced to source, not just watched (no local PostHog key this session):
`schedule-confirm-strip.tsx`'s commit `onSuccess` reads `useCommitScheduleEdit`'s now-numeric
return as `newRevisionV` and passes it straight into `scheduleRevisionCut({ v: newRevisionV,
trigger: 'edit' })` — the fired `v` is provably the RPC's own return.

**Clay ghosts match the snapshot exactly.** Toggling "Baseline" on renders the three dashed
ticks described above; hand-computing one baseline date from the psql v1 snapshot
(Schematic Design's `target_end_date` = `2026-08-10`) matches the rendered ghost label
("V1 · AUG 10") exactly. Toggling off clears every ghost. The toggle (and its layer) vanish
entirely — not just go inert — once a ripple session opens (verified live, mid-session) and
again once the Rule pins on scroll (verified live, scrolled past the fold — the pinned
reduced-height rule shows only solid committed ticks, no dashed marks, no toggle in the sticky
header at all).

**Ledger.** The expanded ledger renders newest-first (`v3`/`v2`/`v1`) with the exact reasons
above, `"you"` for every row, and a date per row; no edit or delete affordance exists anywhere
in the rendered ledger. As `authenticated` in psql: a targeted `UPDATE` and `DELETE` against
the designer's own visible v1 row both affect **0 rows**; a forged direct `INSERT` is refused
(`new row violates row-level security policy for table "schedule_revisions"`). Post-attempt
state is unchanged — still exactly v1/v2/v3.

**Regressions.** An Esc-revert mid-session (a `+2d` test edit on Design Development, aborted)
left `duration_days` byte-identical (still 31) and cut no v4 — psql-confirmed before and after.
A scratch phase ("Scratch Phase QA") added directly via the ghost-add line, then deleted
directly via its inline confirm, both opened no strip at any point and cut no revision
(`schedule_revisions` stayed at `v=3` across both). Gate-off (`schedule-spine:false`, dev
server restarted to flip the env-inlined override) is byte-identical to pre-Slice-01 — the old
`PhaseTimeline` band renders in the Rule/Spine's place, no toggle, no ledger, unaffected by
every mutation this walk made.

**One tooling mistake, self-caught and self-corrected, not a product defect.** The first
attempt at the `reason-edit.png` capture used an over-broad Playwright locator
(`div:has(commitBtn) >> input >> first`) that matched the document's own title-editing input
before the strip's reason field, and briefly overwrote the project's `name` column with the
typed test string. Caught immediately from the resulting screenshot (the title bar showed the
schedule-reason text, not "Sample accepted proposal"), fixed via a direct SQL `UPDATE
projects SET name = 'Sample accepted proposal'`, and the script was corrected to target the
reason field precisely via its `aria-label="Revision reason"` before retaking the screenshot.
No `schedule_revisions` row was affected by this mistake at any point — the ripple session
itself was still open (uncommitted) when the mistyped title write happened, so the only
casualty was the unrelated `projects.name` column, fixed in place.

## Escalations for the consolidated review

Dashed-vs-solid clay ghosts (the prototype's `.bl-tick` is solid; this slice went dashed via
ghost-layer reuse per the orchestrator's direction — a ruling on which reads as "history" vs.
"preview" is owed) · toggle placement in the meta row beneath the Rule ("near the rule head"
satisfied loosely) · the ledger's collapsed-by-default disclosure (prototype shows rows
inline — confirm collapsed-default is wanted) · who-rendering for a non-"you" actor (uid head,
8 chars, no profile join) · a baseline entry whose current-side phase was deleted since v1
ghosts both boundaries (decided-but-unshown per the S5-2 pin; never exercised live this walk)
· the `'signature'`-trigger telemetry stays unwired server-side (v1 is cut inside the client's
signing RPC, no designer-portal call site exists) · pinned mode hiding the baseline layer
(confirmed this walk, consistent with the ripple-session hide, never explicitly design-ruled
as the right behavior vs. e.g. a reduced ghost mark in the pinned header). Carried from prior
slices, still open: the studio-comember gap on the schedule RPCs (00323–00326 all guard on
`designer_id = auth.uid()` / the designer-or-client pair directly, never a studio
co-membership check) · the thread-lane compose gap (I59 — thread-lane phases still expose no
compose actions of their own) · touch treatment for the Rule's drag surfaces (flagged since
I60 — pointer-only mechanics, still untested on touch).

## O8 status

**Still open — Slice 05 shipped studio-side only, per the package's own rule.** The ledger and
the baseline ghosts render exclusively inside the gated, studio-only spine; no client-facing
surface exposes either. O8's own leaning (client sees only revisions touching client-facing
dates, full ledger studio-side) remains unruled — nothing in this slice resolves it, by design.

## The ask

Deferred to the consolidated review, per R104. Nothing here blocks anything downstream. No
confirmed product defects this walk — the one deviation (the mistyped locator writing to
`projects.name`) was a driver-script mistake against a throwaway QA project, self-caught,
self-corrected, and left no trace in `schedule_revisions` or any other durable evidence.
