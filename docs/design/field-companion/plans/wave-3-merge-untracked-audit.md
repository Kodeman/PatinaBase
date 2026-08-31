# Wave 3 merge — untracked-file audit (`docs/design/field-companion/`)

Read-only comparison: main checkout `/Users/kody/Code/patina-merged` (branch `main`) vs
`feat/field-companion-w3`. No git writes were performed; classifications below come from
`git show <branch>:<path>` diffed against the untracked working-tree file, plus
`git ls-tree` / `git log` lookups.

## Method

1. `git status --short --untracked-files=all -- docs/design/field-companion/` → 59 untracked paths.
2. For each path, `git ls-tree -r --name-only feat/field-companion-w3 -- <path>` to check if the
   branch tracks it.
3. For the 42 paths the branch tracks, dumped `git show feat/field-companion-w3:<path>` to a temp
   file and compared against the untracked working-tree copy with `cmp` + `diff -u`.
4. For the 17 paths the branch does not track, recorded size + mtime only (BRANCH-MISSING).

## Summary counts

- Untracked paths under `docs/design/field-companion/`: **59**
- Tracked on `feat/field-companion-w3` at the same path: **42**
  - IDENTICAL: **39**
  - BRANCH-SUPERSET (branch has every line of main's copy, plus more): **2**
    (`field-companion-rulings.md`, `plans/wave-4-plan.md`)
  - MAIN-HAS-EXTRA / mixed divergence: **1** (`field-companion-package.md` — see note)
  - BINARY: **0**
- Not tracked on `feat/field-companion-w3` (BRANCH-MISSING): **16** — all under
  `waves/wave-1/` (3 markdown device-pass docs + 13 PNG screenshots under
  `waves/wave-1/device-pass-shots/`, one path — `w2-5-f1-context.png` — appears once, so 16 total
  files across the two categories below).

## Full table

| path | tracked-on-branch | classification | note |
|---|---|---|---|
| docs/design/field-companion/field-companion-package.md | Y | MAIN-HAS-EXTRA / mixed (BOTH-DIFFER +3/-24) | Not a pure superset either direction. Branch (2080 lines, commit 2026-08-26 14:19:01) has 24 lines main lacks — an expanded FC-R21 predicate writeup for `capture.placed`/`capture.unplaced`/`visit.end` plus a "Known until wave 3" callout. Main's untracked copy (2056 lines, mtime 2026-08-25 08:16:14) has 3 lines the branch lacks — older/compact table rows it superseded. Branch is newer and strictly more detailed; main's copy is a stale pre-expansion snapshot. First 5 (of 3 total) main-only lines: see "MAIN-only lines" below. |
| docs/design/field-companion/field-companion-plan.md | Y | IDENTICAL | |
| docs/design/field-companion/field-companion-presentation.html | Y | IDENTICAL | |
| docs/design/field-companion/field-companion-rulings.md | Y | BRANCH-SUPERSET | diff shows only branch-side additions; branch commit 2026-08-26 14:19:32, main mtime 2026-08-24 21:06:26 (branch newer). |
| docs/design/field-companion/plans/sql/005NN_field_capture_visit_and_suggestion.sql | Y | IDENTICAL | |
| docs/design/field-companion/plans/sql/005NN_margin_notes_field_capture.sql | Y | IDENTICAL | |
| docs/design/field-companion/plans/sql/005NN_project_task_field_capture_ref.sql | Y | IDENTICAL | |
| docs/design/field-companion/plans/sql/005NN_time_entry_field_visit_source.sql | Y | IDENTICAL | |
| docs/design/field-companion/plans/sql/field_capture_visit_test.sql | Y | IDENTICAL | |
| docs/design/field-companion/plans/store-ladder-fix-rereview.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/store-ladder-fix-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-05-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-1-merge-rereview-2.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-1-merge-rereview.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-1-merge-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-1p-merge-rereview.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-1p-merge-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-2-merge-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-2-plan-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-2-plan.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-3-fix-rereview.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-3-merge-readiness-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-3-plan-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-3-plan.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-4-plan-review.md | Y | IDENTICAL | |
| docs/design/field-companion/plans/wave-4-plan.md | Y | BRANCH-SUPERSET | diff shows only branch-side additions; branch commit 2026-08-26 14:19:32, main mtime 2026-08-25 08:17:21 (branch newer). |
| docs/design/field-companion/research/01-field-app-map.md | Y | IDENTICAL | |
| docs/design/field-companion/research/02-backend-contract.md | Y | IDENTICAL | |
| docs/design/field-companion/research/03-portal-project-flow.md | Y | IDENTICAL | |
| docs/design/field-companion/research/04-intent-and-rulings.md | Y | IDENTICAL | |
| docs/design/field-companion/research/05-patina-substrate.md | Y | IDENTICAL | |
| docs/design/field-companion/research/06-external-research.md | Y | IDENTICAL | |
| docs/design/field-companion/research/07-delivery-infra.md | Y | IDENTICAL | |
| docs/design/field-companion/research/10-gap-analysis.md | Y | IDENTICAL | |
| docs/design/field-companion/research/11-tech-architecture.md | Y | IDENTICAL | |
| docs/design/field-companion/research/20-direction-A.md | Y | IDENTICAL | |
| docs/design/field-companion/research/20-direction-B.md | Y | IDENTICAL | |
| docs/design/field-companion/research/20-direction-C.md | Y | IDENTICAL | |
| docs/design/field-companion/research/30-judge-designer-workflow.md | Y | IDENTICAL | |
| docs/design/field-companion/research/30-judge-engineering.md | Y | IDENTICAL | |
| docs/design/field-companion/research/40-review-product-ux.md | Y | IDENTICAL | |
| docs/design/field-companion/research/40-review-repo-correctness.md | Y | IDENTICAL | |
| docs/design/field-companion/waves/wave-1/device-pass-kody-script-13pro.md | N | BRANCH-MISSING | 13,427 bytes, mtime 2026-08-25 15:32:36 |
| docs/design/field-companion/waves/wave-1/device-pass-kody-script.md | N | BRANCH-MISSING | 13,992 bytes, mtime 2026-08-25 16:52:58 |
| docs/design/field-companion/waves/wave-1/device-pass-results.md | N | BRANCH-MISSING | 63,954 bytes, mtime 2026-08-25 16:52:23 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/C3-card-guess-table.png | N | BRANCH-MISSING | 4,623,317 bytes, mtime 2026-08-25 12:11:46 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/S3-destination.png | N | BRANCH-MISSING | 2,143,633 bytes, mtime 2026-08-25 12:19:31 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/W2-5-F1-context.png | N | BRANCH-MISSING | 5,840,193 bytes, mtime 2026-08-25 12:10:08 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/s5-N4-voice-flag-fallback.png | N | BRANCH-MISSING | 356,717 bytes, mtime 2026-08-25 16:28:27 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/s5-U1-no-inmemory-warning.png | N | BRANCH-MISSING | 199,962 bytes, mtime 2026-08-25 15:48:52 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/s5-signed-out-onboarding.png | N | BRANCH-MISSING | 128,716 bytes, mtime 2026-08-25 15:50:26 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/s6-N4-recorder-live-transcript.png | N | BRANCH-MISSING | 320,424 bytes, mtime 2026-08-25 16:52:23 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/step23-placed-card.png | N | BRANCH-MISSING | 4,609,341 bytes, mtime 2026-08-25 12:13:20 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/step27-inherited-placement.png | N | BRANCH-MISSING | 4,404,288 bytes, mtime 2026-08-25 12:14:02 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/step28-tray-no-done.png | N | BRANCH-MISSING | 175,255 bytes, mtime 2026-08-25 12:18:30 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/step29-tray-place2.png | N | BRANCH-MISSING | 255,013 bytes, mtime 2026-08-25 12:17:39 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/step30-offline-banner.png | N | BRANCH-MISSING | 4,453,416 bytes, mtime 2026-08-25 12:25:06 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/step31-outbox-1.png | N | BRANCH-MISSING | 6,082,056 bytes, mtime 2026-08-25 12:26:02 |
| docs/design/field-companion/waves/wave-1/device-pass-shots/w3-today-home-signed-in-build3.png | N | BRANCH-MISSING | 300,720 bytes, mtime 2026-08-26 14:18:50 |

### `field-companion-package.md` — MAIN-only lines (all 3, fewer than the requested 5 exist)

```
| `capture.placed` | `basis` (visit/manual/suggested), `has_room` | the program's headline metric |
| `capture.unplaced` | — | the roving hole's size |
| `visit.end` | `duration_min`, `captures`, `notes`, `scans`, `unplaced` | wave 3 |
```

These are the pre-expansion (compact) versions of table rows that the branch rewrote and expanded
(adding a `source` column, a `reason` column, and ~24 lines of new prose explaining the
placed/unplaced predicate and `visit.end` reason codes). Branch commit for this path:
2026-08-26 14:19:01 -0500; main's untracked mtime: 2026-08-25 08:16:14 — **branch is newer**, so
main's copy is a stale snapshot predating the branch's own edit.

## Step 3 — paths that would actually trigger "untracked working tree files would be overwritten by merge"

Per `git`'s untracked-overwrite safety check (checkout/merge-time, comparing worktree content
against the incoming blob, not just path collision): a path collision alone does **not** trigger
the abort if content is byte-identical — git silently adopts the identical untracked file into the
merge result. Of the 42 paths the branch tracks at the same location as an untracked main file, 39
are byte-identical (no abort) and 3 have divergent content, so **only these 3 would actually block
`git merge feat/field-companion-w3` from main with an untracked-overwrite error**:

1. `docs/design/field-companion/field-companion-package.md`
2. `docs/design/field-companion/field-companion-rulings.md`
3. `docs/design/field-companion/plans/wave-4-plan.md`

(If a stricter, purely path-collision-based reading is wanted — i.e. "any path the branch adds
that already exists untracked in main, regardless of content" — that is the full 42-path list in
the "Full table" above, i.e. every row marked `tracked-on-branch = Y`.)

The 16 BRANCH-MISSING paths (`waves/wave-1/...`) are not tracked by the branch at all, so they
cannot collide and are not part of any overwrite risk.
