# W2 iOS lane — adversarial review, round 3

Reviewer context: separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-ios`, branch
`studio-invoices/w2-ios`, range `3a54d874…HEAD` (6 commits, 8 files).

## Gates run by the reviewer (own simulator `si-ios-r3`, UDID `6104BC68-7F98-4B70-8A7B-825AA6AE7D3C`, deleted after)

- `ios-gate.sh build` → `** BUILD SUCCEEDED **` (first attempt, no cold-build noise).
- `ios-gate.sh unit` → `Test run with 2472 tests in 271 suites failed after 12.613 seconds with 3 issues (including 2 known issues)`;
  sole failing test `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves()` — the brief's named load flake.
  Isolated rerun of that test → `** TEST SUCCEEDED **`.
- `-only-testing:PatinaTests/BudgetAggregationTests -only-testing:PatinaTests/InvoicesMoneyRailTests` →
  `Test run with 38 tests in 2 suites passed after 0.007 seconds` / `** TEST SUCCEEDED **`;
  all five studio-invoice cases named and passed.

The round-2 count nit (`ios-r2-8`, "2472 vs 2471") is **resolved**: this tree runs 2472, matching the notes.

## Brief items

| # | Item | State |
|---|------|-------|
| 1 | `title` on `RemoteInvoice` + `listSelect` (detail select extends it) | delivered (`InvoicesAPIClient.swift:91-94, 189, 194-195`) |
| 2 | Detail-view fallback to the title | delivered (`InvoiceDetailView.swift:119`), with `ios-r3-2` caveat |
| 3 | "From the studio" Budget section | **not delivered** — reverted at `6176ea4b2`; ruling S11 supersedes the brief. Needs an orchestrator sign-off line (`ios-r3-10`) |
| 4 | Tests in both suites | delivered; 5 new cases, all green |

## Prior-round findings, verified

- `ios-r2-1` **FIXED** — `BudgetViewModel.swift:231` now calls `BudgetMath.projectScopedRollup`, pinned by `headlineExcludesStudioInvoicesLikeSectionsDo()` (passes). Headline == Σ sections confirmed: every non-nil `project_id` reaches `orderedIds` and always yields a section, so the two sets are identical.
- `ios-r2-2` still open as a bookkeeping item → re-filed as `ios-r3-10`.
- `ios-r2-3` **NOT fixed** → `ios-r3-1`.
- `ios-r2-4` **NOT fixed** → `ios-r3-2`.
- `ios-r2-5` **NOT fixed** → `ios-r3-6`.
- `ios-r2-6` **NOT fixed** → `ios-r3-7`.
- `ios-r2-7` **NOT recorded** in `ios-notes.md` → `ios-r3-5`.
- `ios-r2-8` resolved (see gates).

## New this round

- `ios-r3-3` — the Budget empty state states a falsehood to a studio-invoice-only homeowner ("Nothing billed yet … receive an invoice and the record builds itself here"). A consequence of S11 as adopted, not a lane error; it wants an orchestrator ruling, not a lane fix.
- `ios-r3-4` — `YourDesignerSeat.urgentProjectId` returns nil for a studio invoice, so `activeProject` falls back to `active.first`: with two designers the home seat can name the wrong one and "Message" opens the wrong thread — the exact failure that function's own doc comment says it exists to prevent. Pre-existing shape, widened by this program.
- `ios-r3-8` — the "renders the title" test is a `SourcePin` string match, not a behavior assertion.
- `ios-r3-9` — `ios-notes.md` still leads with the reverted "From the studio" section as delivered.

## Verdict

**ship** — no blocker, no major. Money rules respected (integer cents throughout, no status writes, no rollup logic touched — `projectScopedRollup` is a display-only filter over the existing `rollup`). No VISION refusal in any string this lane added or changed. Scope clean: 5 code/test files plus lane docs, no `.claude/`, no `.env`, no migration, no stack command.
