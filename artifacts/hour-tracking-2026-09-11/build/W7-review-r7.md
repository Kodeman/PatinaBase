# W7 — verification, round 7 (of the round-6 fix)

**clean = true** — W7-R6-01 is discharged: the class change matches the fix brief's own shape exactly, is pinned by a passing jest test, and reasons correctly from the grid CSS and the `Select` control's real wrapper. All gates this task names are green.

Branch `hour-tracking/portal` @ `0196b7987` (one commit ahead of `337564357`, matching `W7-fix-r6.md`). Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal` clean — `git status --porcelain` shows no tracked-file changes (the only noise is this sandbox's read-deny on eight `.env.example`/`.env.*` files, unrelated to the worktree's own state).

---

## W7-R6-01 — class change confirmed in source

`account-studio-page.tsx:1148-1234` (Account → Studio → Agreement defaults, rate-card row) now reads exactly as `W7-fix-r6.md` describes:

```
row     className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
Select  wrapperClassName="col-span-2 sm:col-span-1"
button  className="justify-self-end text-[12px] …"   (Remove)
```

This is byte-for-byte the shape both the fix report and `W7-R6-01`'s own suggested fix in `W7-review-r6.md:108` called for, and mirrors the composer's W7-R5-01 fix. Verified two supporting facts by reading the code directly (not by trusting the report's prose):

- **Tailwind will generate the arbitrary-value classes.** `tailwind.config.ts`'s `content` glob includes `./src/components/**/*.{js,ts,jsx,tsx,mdx}`, which covers this file — `grid-cols-[120px_minmax(0,1fr)]` and its `sm:` variant are JIT-scanned from the class string directly, no safelist needed.
- **`wrapperClassName` lands on the wrapping `<span>`.** `src/components/ui/controls/select.tsx:24` — `<span className={cn('relative inline-flex w-full items-center', wrapperClassName)}>` — confirming `col-span-2 sm:col-span-1` is applied to the grid item that actually needs it, exactly as the jest test below assumes.

**CSS reasoning, independent of the fix report's own Playwright numbers:** at <640px (Tailwind's default `sm`), the row is a 2-column grid (`120px minmax(0,1fr)`); the `Select`'s wrapper spans both columns (`col-span-2`), so it occupies the entire first grid row — no 120px ceiling on the picker. The rate `<input>` and `Remove` button, next in DOM order, auto-flow onto row 2 into the two columns (120px, then the remainder), with `justify-self-end` pulling `Remove` to the right — matching "the rate input and Remove share the second line" in the fix report. At `sm:` and above the row reverts to the original three-column one-line shape (`minmax(0,1fr) 120px auto`), unchanged. This is consistent with the fix report's measured 289px (390) / 320.5px (1440) picker columns without needing to independently reproduce them.

---

## Spec confirmed

`agreement-defaults-card.test.tsx:443-463` — *"stacks the picker onto its own line below sm and spans it across both columns (W7-R6-01)"*:
- resolves the `Select` via `getByLabelText("Default role 1")`, walks to its wrapping `<span>` (`select.parentElement`) and that span's parent (the grid row `<div>`)
- asserts the wrapper span's className contains `col-span-2` and `sm:col-span-1`
- asserts the row div's className contains `grid-cols-[120px_minmax(0,1fr)]` and `sm:grid-cols-[minmax(0,1fr)_120px_auto]`
- asserts the row div's className is **not** the pre-fix single-row string (`"grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-2"`) — a real regression guard, not a tautology

This is a faithful, non-trivial pin: it walks the actual DOM produced by `AccountStudioPage` (not a shallow render or a hand-built fixture), asserts against the real `Select` control's real wrapper element, and would fail on a silent revert to the pre-fix shape.

---

## Gates — run in this context, in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, no output, exit 0 |
| `pnpm --filter @patina/designer-portal test -- agreement-defaults-card account-studio-page` | **PASS** — `Test Suites: 2 passed, 2 total`, `Tests: 36 passed, 36 total`, 1.843s (matches the fix report's 19 + 17 = 36) |
| `pnpm --filter @patina/designer-portal lint` | **0 errors, 201 warnings** — identical count to every prior round (r2–r6); tail of output confirms `✖ 201 problems (0 errors, 201 warnings)` |

```
PASS src/components/document/account/__tests__/agreement-defaults-card.test.tsx
PASS src/components/document/account/__tests__/account-studio-page.test.tsx

Test Suites: 2 passed, 2 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        1.843 s
```

```
✖ 201 problems (0 errors, 201 warnings)
  0 errors and 186 warnings potentially fixable with the `--fix` option.
```

---

## What I did NOT verify

- **No live dev-server measurement on port 3100 this round.** Port 3100 was confirmed free (`lsof -ti:3100` empty) before I began. I did not start `next dev --webpack -p 3100` because reaching the real Account → Studio sheet requires an authenticated session, and the fix round's own probe route + middleware exception were deliberately reverted before commit (confirmed: `git status --porcelain` on the worktree shows no stray probe files or middleware diff). Reproducing that setup — a temporary unauthenticated route plus a middleware matcher exception — to re-measure a fix already pinned by a passing DOM-structural jest test and confirmed correct by direct grid-CSS reasoning was not, in my judgment, worth the risk of leaving stray changes in a shared worktree for a number that can't move: the class strings are fixed text, Tailwind's JIT compiles them deterministically from the content glob, and the `Select` wrapper placement is confirmed from the control's own source. I did not independently reproduce the fix report's own 289px/320.5px pixel figures.
- **No fresh `supabase db reset` / SQL tests** — correctly not run: nothing under `supabase/` changed in this commit (`00618`/`00619`/`config.toml` untouched, confirmed by the diff stat: only the two designer-portal files changed).
- **No full designer-portal test suite run** — only the two affected specs were run, per the task's ask to run "the affected specs," not a full sweep. (Round 6's full-suite run was 581/7440 green; nothing in this commit's diff touches anything outside `account-studio-page.tsx` and its own test file, so a full-suite regression is unlikely but not directly re-confirmed here.)
- **No re-check of the other open findings** (W7-R6-05, W7-R5-02/-03/-04, W7-R6-02/-03/-04/-06/-07, or the round-4 carries) — out of scope for this task, which was to verify the round-6 fix only.
- **Root font-size discrepancy the fix report itself flagged** (16px assumption in the review's standalone harness vs. the app's actual 18px root) was not adjudicated here; it does not change the source/spec conclusion above since the fix's own class strings are viewport-independent (percentage/fr-based, not px-locked to a `rem` assumption).
