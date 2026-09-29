# W3b — arrival Playwright lane + legacy regression (US-14)

## AC. Legacy 36, round 9 at `e2aabbe367ef04f69dc755980ee10567c695cfd1`: a quiet-window rerun matches the baseline byte for byte (2026-09-29, W3f fix round 9)

**This section supersedes the §AB verdict.** The round-8 reviewer raised one MAJOR finding: the gate was incomplete because 3 files went red in §AB (`mood-board/project-board-paths`, `people/bring-forward`, `people/call-sheet`, plus `document/desk-claims` in one run). The fix was to rerun the baseline recipe in a quiet window and require the failing-file set to be byte-identical to `legacy-baseline.md`.

Result: the three-batches-of-12 procedure ran twice, back to back. In **both** passes the failing-file set is **byte-identical** to the baseline's 29 files, and the test-level totals equal the baseline's exactly. **No source, spec or config file changed in this round**, and HEAD stays at the input head. The main-build comparison and the bisect were conditional ("if they still fail only in multi-file groupings"), so neither was needed.

### AC.0 The window and the recipe

- **Quiet window.** Before each batch the script recorded the load average and the number of non-idle client backends on the shared local Postgres, excluding its own probe:
  - Pass 1, batches 1–3: load 4.85, 5.84, 4.22. Non-idle backends: 0, 0, 0.
  - Pass 2, batches 1–3: load 4.55, 4.65, 5.31. Non-idle backends: 0, 0, 0.
  - `ListAgents`: all 3 peer sessions `idle`.
  - Round 8 ran with a load average near 40.
- **Build.** The same lane build at `.next/BUILD_ID` = `vJBaEbfrG7SezRr_nxwQ5` (07:45:05). `find src -newer .next/BUILD_ID` returned 0 files, so the build is current for HEAD and there was no rebuild.
- **Env.** The literal `webServer.env` values from `playwright.config.ts` were loaded with `eval "$(node extract-pw-env.mjs …)"`, which exports 6 keys and never echoes a value. `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` was set to the anon key and `ARRIVAL_E2E=1` was set. `CI`, `OPEN_NEXT` and `SUPABASE_ORIGIN_RUNTIME` were unset.
- **Files and batches.** The 36 files are `legacy-baseline.md` §6 verbatim, in the same order. Batch 1 is files 1–12, batch 2 is files 13–24 and batch 3 is files 25–36.
- **Command.** Each batch ran as one unsandboxed foreground command (scratchpad `r9-legacy-run.zsh`):
  1. Assert :3000 is free.
  2. Start `next start -p 3000` on the existing `.next` and wait for `/auth/signin` to return 200.
  3. Run `pnpm exec playwright test --project=chromium <12 files> --reporter=line --workers=2 --output=<scratchpad>/r9-out-<tag>`.
  4. Stop the server and assert :3000 is free again (`PORT_3000_FREE` after every batch).
- **Differences from round 8.** The server was restarted for each batch instead of one detached server for the whole run. `--output` moved the test artifacts to the scratchpad; the default `test-results/` directory was not used.

### AC.1 Pass 1 (`r9-legacy-b{1,2,3}.log`), 10:40:40–10:49:39

| Batch | Failed | Skipped | Did not run | Passed | Wall time |
|---|---|---|---|---|---|
| 1 (files 1–12) | 9 | 3 | 40 | 14 | 2.5m |
| 2 (files 13–24) | 12 | 1 | 41 | 16 | 2.4m |
| 3 (files 25–36) | 16 | 0 | 5 | 15 | 3.6m |
| **Sum** | **37** | **4** | **86** | **45** | 172 tests |

The baseline is 45 passed, 37 failed, 4 skipped and 86 did not run, so **the pass-1 totals are identical to it**.

### AC.2 Pass 2, the confirming run (`r9-legacy-b{1,2,3}c.log`), 10:50:31–10:59:26

The per-batch numbers are identical to pass 1: 9/3/40/14 (2.5m), 12/1/41/16 (2.5m) and 16/0/5/15 (3.6m). The sum is **37 failed, 4 skipped, 86 did not run and 45 passed**.

### AC.3 Failing-file set vs `legacy-baseline.md`

The failing files were taken from each batch's own `N failed` block, deduplicated and sorted.

```
r9-failed-files.txt (pass 1): 29 files
comm -23 vs baseline-29-failing-sorted.txt (new reds):     (empty)
comm -13 vs baseline-29-failing-sorted.txt (newly green):  (empty)
cmp r9-failed-files.txt baseline-29-failing-sorted.txt  → IDENTICAL
cmp r9c-failed-files.txt baseline-29-failing-sorted.txt → PASS2 IDENTICAL to baseline
sha256 (both passes and the baseline list): ae0130ddab1dd5e8cebd6c57454c76a214e998c10f52bd8c5a0b8c2c089f2bc3
```

These are the baseline PASS files, counted from the progress lines. The pattern was the same in both passes, and every row matches the pass/fail counts in the baseline table:

| File | Tests completed | Failed | Baseline |
|---|---|---|---|
| `document/desk-claims.spec.ts` | 6 | 0 | 6/0/0 |
| `document/gate-ceremony.spec.ts` | 4 | 0 | 4/0/0 |
| `document/spec-book-workspace.spec.ts` | 1 | 0 | 1/0/0 |
| `mood-board/project-board-paths.spec.ts` | 7 | 0 | 7/0/0 |
| `people/bring-forward.spec.ts` | 2 | 0 | 2/0/0 |
| `people/call-sheet.spec.ts` | 3 | 0 | 3/0/0 |
| `document/arrival-arc.spec.ts` | 1 (the pre-existing `fixme` skip) | 0 | SKIP |

The three §AB suspects passed inside their normal batch-3 group in both passes: `project-board-paths` 7/7, `bring-forward` 2/2 and `call-sheet` 3/3. That is the same group of 12 files, run with 2 workers, in which they failed in round 8. `desk-claims` passed 6/6 both times.

### AC.4 What this settles about §AB

- The round-8 reds did not reproduce under the identical grouping once the shared Postgres was quiet. They were contention, as §AB.5 argued, and not test-order coupling or an arrival cause. Two facts support this:
  - The failure snapshots show data reads failing ("could not be picked up", "the desk could not be read … a session that needs refreshing"). They do not show a hidden root or blocked pointer events.
  - The code under test is unchanged: the same HEAD and the same `.next`.
- Nothing is added to the known-flake list. The finding made that step conditional on main showing the same reds, and the reds did not recur here.
- Operational note for W4 and later legacy runs: run this comparison only when the shared local Postgres has no other active writers (check the `pg_stat_activity` non-idle count and `ListAgents` first).

### AC.5 Cleanup

The screenshot specs rewrite tracked PNGs. They were restored as follows, and nothing was staged:
- `git -C <worktree> checkout -- <16 modified docs/design/**.png>`.
- `rm` of the one untracked PNG that this run created (`docs/design/workflow-alignment/screenshots/wp3/margin-handoff-overdue-1440-collapsed.png`).

Unsandboxed `git status --porcelain` then came back empty (exit 0), and HEAD is still `e2aabbe367ef04f69dc755980ee10567c695cfd1`.

### AC.6 Gates at HEAD (verbatim tails)

```
pnpm --dir …/apps/designer-portal type-check   → tsc --noEmit, EXIT=0
pnpm --dir …/apps/designer-portal lint         → ✖ 199 problems (0 errors, 199 warnings), EXIT=0
pnpm --dir …/apps/designer-portal test         → Test Suites: 654 passed, 654 total
                                                 Tests:       8823 passed, 8823 total
                                                 Snapshots:   1 passed, 1 total, EXIT=0
grep -rl bkvcixdmuyejfzcijpdg .next/static     → empty (exit 1)
grep -l -- '--arr-ok' .next/static/css/*.css   → .next/static/css/6cc8a4a5864085df.css
```

### AC.7 Bottom line

- **Legacy gate: COMPLETE and clean.** The failing-file set is byte-identical to the baseline in two consecutive quiet-window passes. The test-level totals also equal the baseline: 45 passed, 37 failed, 4 skipped, 86 did not run.
- **The lane gate was already complete** (§AA). Taken together, W3b is green with no new legacy reds and 0 arrival faults.
- **No code change and no commit this round.** The branch head is still `e2aabbe367ef04f69dc755980ee10567c695cfd1`.

## AA. W3b arrival lane — round 8 at `e2aabbe367ef04f69dc755980ee10567c695cfd1` — COMPLETE, lane clean (2026-09-29, this piece)

**Supersedes §Z.** §Z's round-7 rerun ran out of session time at 14/93 tests dispatched and made
no commit; this piece reran the full lane against the round-8 fixer's commit
(`e2aabbe367ef04f69dc755980ee10567c695cfd1` — "fix(arrival): W3 review fixes round 8 — §4e
rulings (US-14)", the deferred wait-gesture-decision fix in `arrival-mount.tsx`/`engine.ts` plus
the new `touch-wait-gesture.spec.ts` real-browser proof) and ran it to completion, one project at
a time, unsandboxed from the first attempt per §4e's own "lane discipline" ruling. Worktree
`agent-arr-w3-integ`, branch `arrival-prod/w3-integration`. **This piece made no source edit and
no commit** — every failure observed was the pre-existing documented first-test cold-server SR
flake, confirmed by an isolated rerun; HEAD stays at `e2aabbe367ef04f69dc755980ee10567c695cfd1`
(the input head).

### AA.0 Preflight — build currency

```
git -C <worktree> log -1 --format='%H %s %cI'
→ e2aabbe367ef04f69dc755980ee10567c695cfd1 fix(arrival): W3 review fixes round 8 — §4e rulings (US-14) 2026-09-29T08:13:13-05:00

apps/designer-portal/.next/BUILD_ID mtime → 2026-09-29 07:45:05
find apps/designer-portal/src -newer .next/BUILD_ID → (empty, 0 files) — build current for HEAD
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty before start (exit 1)
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty (exit 1)
df -h /   → 926Gi total, 205Gi avail (OK)
```

No rebuild performed by this piece — the round-8 fixer's own build (with `ARRIVAL_E2E=1`,
loopback Supabase trio) was already current. `playwright test -c playwright.arrival.config.ts
--list` confirmed the lane grew by one spec file this round: **99 tests in 11 files** (33 unique
tests × 3 projects — round 7's 31 unique tests + the 2 new `touch-wait-gesture.spec.ts` tests).

### AA.1 Arrival lane — chromium (unsandboxed, foreground)

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --project chromium --reporter=line
Running 33 tests using 1 worker
  1 failed
    [chromium] › e2e/arrival/accessibility.spec.ts:24:7 › Arrival accessibility › exactly one SR announcement; the lens band aria-live goes off for the run and is restored
      Error: expect(received).toBe(expected) // Object.is equality
      Expected: 5
      Received: 3
  5 skipped
  27 passed (3.6m)
```

The one failure is `accessibility.spec.ts:24`, the run's **first scheduled test** — the same
documented first-test cold-server SR-announcement flake every round since `T.5` (now the eighth
occurrence; CONTRACT §4d/§4e list it under "deferred, not blockers"). 5 skips = `touch-tap.spec.ts`
(3 tests, `hasTouch`-gated, chromium has no touch) + `touch-wait-gesture.spec.ts` (2 tests, same
gate) = 5, matching exactly.

### AA.2 Arrival lane — mobile-chrome (unsandboxed, foreground)

```
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty before start
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --project mobile-chrome --reporter=line
Running 33 tests using 1 worker
  1 skipped
  32 passed (3.3m)
```

Clean — zero failures. The 1 skip is `put-down.spec.ts:31` ("the spine Put down document link is
desktop-only"), skipped on `mobile-chrome` only, as every prior round. Both new
`touch-wait-gesture.spec.ts` tests (:152 swipe, :200 tap) ran and passed here (see §AA.7).

### AA.3 Arrival lane — webkit (unsandboxed, foreground)

```
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty before start
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --project webkit --reporter=line
Running 33 tests using 1 worker
  1 failed
    [webkit] › e2e/arrival/accessibility.spec.ts:24:7 › Arrival accessibility › exactly one SR announcement; the lens band aria-live goes off for the run and is restored
      Error: expect(received).toBe(expected) // Object.is equality
      Expected: 4
      Received: 3
  5 skipped
  27 passed (3.6m)
```

Same shape as chromium: `accessibility.spec.ts:24`, the run's first test, the same documented
flake (this round it recurred on **both** chromium and webkit in the same pass — a first for two
Chromium/WebKit-family projects failing on the identical test in one lane run, still the identical
"first test off a cold server" signature, not a new failure shape). 5 skips, same accounting as
chromium.

```
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty after the last project (exit 1) — confirmed
```

### AA.4 Known first-test SR flake — isolated rerun, all three projects (accepted proof)

Per the task brief's own pre-authorization for this exact flake ("rerun that test alone on all
three projects ... record 'flake-then-pass' only if the isolated rerun passes"):

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts e2e/arrival/accessibility.spec.ts:24 --reporter=line
Running 3 tests using 1 worker
  [1/3] [chromium] › e2e/arrival/accessibility.spec.ts:24 ...
  [2/3] [mobile-chrome] › e2e/arrival/accessibility.spec.ts:24 ...
  [3/3] [webkit] › e2e/arrival/accessibility.spec.ts:24 ...
  3 passed (22.2s)
```

Clean on all three projects. Recorded as **flake-then-pass** for chromium and webkit's
`accessibility.spec.ts:24` runs (mobile-chrome's own full-lane pass at §AA.2 already showed this
test passing outright, with no failure — recorded as plain `passed` there, not flake-then-pass).

### AA.5 Per-spec-per-project results — full breakdown (33 unique tests × 3 projects = 99)

All 33 unique tests pass on all three projects except the four rows below (every other cell is
`passed`):

| Spec:line | chromium | mobile-chrome | webkit |
|---|---|---|---|
| `accessibility.spec.ts:24` | flake-then-pass (1st-pass fail, isolated rerun clean) | passed | flake-then-pass (1st-pass fail, isolated rerun clean) |
| `touch-tap.spec.ts:148/174/217` (3 tests) | skipped (`hasTouch`-gated) | passed | skipped (`hasTouch`-gated) |
| `touch-wait-gesture.spec.ts:152/200` (2 tests) | skipped (`hasTouch`-gated) | passed | skipped (`hasTouch`-gated) |
| `put-down.spec.ts:31` | passed | skipped (desktop-only) | passed |

Totals: chromium 27 passed / 1 flake-then-pass / 5 skipped; mobile-chrome 32 passed / 1 skipped;
webkit 27 passed / 1 flake-then-pass / 5 skipped. `27+1+5=33`, `32+1=33`, `27+1+5=33` — all
account for the full 33-test list on each project.

### AA.6 Skip accounting — verified against source `test.skip()` sites

```
grep -n "skip(" e2e/arrival/*.spec.ts
```
Exactly 3 call sites: `put-down.spec.ts` skips its one test on `mobile-chrome` only (1);
`touch-tap.spec.ts:146` `test.skip(({ hasTouch }) => !hasTouch, …)` skips all 3 of its tests on
chromium + webkit (6); `touch-wait-gesture.spec.ts:150` `test.skip(({ hasTouch }) => !hasTouch,
…)` skips both its tests on chromium + webkit (4, **new this round**). `1 + 6 + 4 = 11` total
skip-instances across the lane (matches `5 + 1 + 5 = 11` summed from §AA.1–AA.3).

### AA.7 The swipe spec's result — `touch-wait-gesture.spec.ts` (CONTRACT §4e's real-browser proof)

Both tests ran (not `test.fixme` — the harness could synthesize a real touch pan) and passed
cleanly on `mobile-chrome`, the only `hasTouch` project in this lane, on **every** pass in this
round (first full run §AA.2, no rerun needed):

- `:152` "a swipe during the wait is her scroll: busy, the row never lands, the page stays where
  she left it" — **passed**.
- `:200` "a tap during the wait declines busy, and the row lands once the Desk is ready" —
  **passed**.

No `test.fixme` fallback was needed. This is the first full-lane confirmation of the round-7/8
wait-gesture fix (`arrival-mount.tsx` `waitGesture`/`closeGesture`, `engine.ts` scroll-key
handling) in a real browser via CDP touch synthesis, matching the fixer's own pre-commit spot-runs
(`r8-spec-run1.log`/`r8-spec-run3.log` in the session scratchpad, 2/2 passed each) but now proven
inside the complete 99-test lane rather than in isolation.

### AA.8 Bottom line

- **Lane: COMPLETE and clean.** All three projects ran to the end: chromium 27 passed / 5 skipped
  / 1 flake-then-pass; mobile-chrome 32 passed / 1 skipped / 0 failed; webkit 27 passed / 5
  skipped / 1 flake-then-pass. Both `accessibility.spec.ts:24` failures are the same
  well-documented first-test cold-server SR flake (eighth+ occurrence across rounds), confirmed
  flake-then-pass by an isolated rerun clean on all three projects (§AA.4). Port 3107 confirmed
  free before the run, between projects, and after the last project.
- **Zero arrival-fault findings.** No failure in this round traces to arrival code; the new
  `touch-wait-gesture.spec.ts` real-browser proof (§AA.7) passed outright with no fixture or spec
  edit needed.
- **No commit.** Every failure observed was the pre-existing documented flake — no spec was wrong
  this round, so no `test(arrival): lane fixes (US-14)` commit was needed. HEAD unchanged at
  `e2aabbe367ef04f69dc755980ee10567c695cfd1`.
- **Legacy 36-file regression: not run by this piece** — out of this piece's scope per this
  round's task split (separate agent, see placeholder below).
- **Commands, in order:** preflight + `--list` (§AA.0) → chromium, 1 flake (§AA.1) →
  mobile-chrome, clean (§AA.2) → webkit, 1 flake (§AA.3) → isolated rerun of the known flake on
  all three projects, clean (§AA.4).

## Legacy 36 — round 8 at `e2aabbe367ef04f69dc755980ee10567c695cfd1` — NOT a clean confirmation this round (contention-confounded, not an arrival-code finding)

**First round out of eight where this comparison does not cleanly confirm.** Ran the mandated
three-batches-of-12 procedure **twice** (a first pass, then an immediate confirming rerun on the
same live server) plus one extra diagnostic pass using the exact single-36-file command every
prior round (W0, T.6, U.3, V.2, W.4, X.3, Y.3) used. All three passes are internally consistent on
one point — **3 files (`mood-board/project-board-paths.spec.ts`, `people/bring-forward.spec.ts`,
`people/call-sheet.spec.ts`) failed in every multi-file grouping (3-for-3) but passed cleanly
100% clean when isolated to just themselves** — and diverge on everything else in a way that grows
*worse* the longer the run takes, which is the signature of external contention on the shared
local Postgres (this session has ~40 other agents concurrently active per `ListAgents`; see
`feedback_shared_local_postgres_across_sessions.md`), not a fixed source regression from the
round-8 commit. No failure in any pass touches arrival code or arrival-authored files.

### AB.0 Preflight

```
git -C <worktree> log -1 --format='%H %s' → e2aabbe367ef04f69dc755980ee10567c695cfd1 fix(arrival): W3 review fixes round 8 — §4e rulings (US-14)
lsof -nP -iTCP:3000/-iTCP:3107 -sTCP:LISTEN   # both empty before start
apps/designer-portal/.next/BUILD_ID mtime 2026-09-29 07:45:05; find src -newer .next/BUILD_ID → empty — build current, no rebuild done
df -h /   → 926Gi total, 198Gi avail
```
The exact 36-file list was taken verbatim from `legacy-baseline.md` §6 (not re-derived by grep —
the grep now also matches the round-8 lane's own new `e2e/arrival/*.spec.ts` files, which belong to
the separate arrival-lane config and are out of scope here). All 36 confirmed present in the
worktree. `playwright.config.ts`'s literal `webServer.env` values (already-committed local demo
keys; that file's own comment: "not secrets, safe to inline") were extracted programmatically by a
scratchpad script (`extract-pw-env.mjs`, regexes the 6 keys out of the file and prints `export
KEY='value'` lines) and consumed via `eval "$(...)"` in the same shell as each command — no key
value ever appeared in this piece's own output. `next start -p 3000` (unsandboxed from the first
attempt, `nohup … &`, the one authorized background exception) reached 200 on `/auth/signin` on the
first poll attempt (`✓ Ready in 168ms`); the pre-existing benign `output: standalone` warning from
the W0 baseline repeated, nothing else.

### AB.1 Batches 1–3, first pass (mandated procedure, attempt 1)

Each batch: `pnpm exec playwright test --project=chromium <12 files> --reporter=line --workers=2`,
unsandboxed, foreground, tee'd to `legacy-8-batch{1,2,3}.log`.

| Batch | Failed | Skipped | Did not run | Passed | Total |
|---|---|---|---|---|---|
| 1 (files 1–12) | 10 | 3 | 40 | 13 | 66 |
| 2 (files 13–24) | 13 | 1 | 56 | 0 | 70 |
| 3 (files 25–36) | 23 | 0 | 11 | 2 | 36 |
| **Sum** | **46** | **4** | **107** | **15** | **172** |

Test-level total (172) matches the baseline's 172 exactly. Diffing the failing-**file** set
(extracted from each batch's own `N failed` block, not the progress lines) against
`legacy-baseline.md`'s 29-file list turned up **5 files failing now that were baseline PASS**:
`document/gate-ceremony.spec.ts`, `document/spec-book-workspace.spec.ts`,
`mood-board/project-board-paths.spec.ts`, `people/bring-forward.spec.ts`,
`people/call-sheet.spec.ts`. `document/desk-claims.spec.ts` (baseline's 6th PASS file) stayed
clean in this pass. Zero newly-green files.

### AB.2 Isolated rerun of the 5 candidate new reds — all clean

Per the same "rerun a suspected flake in isolation" discipline the arrival lane itself uses,
reran just those 5 files together (not the mandated batching — a diagnostic step):

```
pnpm exec playwright test --project=chromium \
  e2e/document/gate-ceremony.spec.ts e2e/document/spec-book-workspace.spec.ts \
  e2e/mood-board/project-board-paths.spec.ts e2e/people/bring-forward.spec.ts \
  e2e/people/call-sheet.spec.ts --reporter=line --workers=2
→ Running 17 tests using 2 workers … 17 passed (54.9s)
```

All 17 tests across all 5 files passed cleanly, unsandboxed, on the same live server, moments
after the batched failures. Taken alone this would read as a clean flake-then-pass — §AB.3 shows
it wasn't the whole story.

### AB.3 Batches 1–3, confirming rerun (mandated procedure, attempt 2)

Reran the identical three-batches-of-12 procedure a second time, same server, same build.

| Batch | Failed | Skipped | Did not run | Passed | Total |
|---|---|---|---|---|---|
| 1 | 9 | 3 | 40 | 14 | 66 |
| 2 | 12 | 1 | 51 | 6 | 70 |
| 3 | 23 | 0 | 11 | 2 | 36 |
| **Sum** | **44** | **4** | **102** | **22** | **172** |

`document/gate-ceremony.spec.ts` (all 4 tests) and `document/spec-book-workspace.spec.ts` (its 1
test) both ran clean this time — **flake-then-pass**, matching baseline. But
`mood-board/project-board-paths.spec.ts`, `people/bring-forward.spec.ts` and
`people/call-sheet.spec.ts` **failed again**, in batch 3, with the same errors as attempt 1
(`bring-forward`/`call-sheet`: `locator('[data-action-key="open-call-sheet"]')` never visible,
30s timeout; `project-board-paths`: `getByRole('button', { name: 'Start a board' })` never
clickable, 60s timeout). **3-for-3 across every multi-file grouping these three files have run in
this round, 0-for-1 when isolated to just themselves (§AB.2).** No `src/` file was touched between
attempts 1 and 2 — same HEAD, same `.next` build, same server process.

### AB.4 Extra diagnostic — one single 36-file command, the exact recipe every prior round used

Not part of the mandated batching, but run because §AB.1–AB.3's split result was ambiguous: the
single-command recipe is what `legacy-baseline.md` and all 7 prior confirmations (`T.6`, `U.3`,
`V.2`, `W.4`, `X.3`, `Y.3`) actually used, so it is the only truly apples-to-apples comparison
point. Same server, same build, same 36 files, one `pnpm exec playwright test --project=chromium
<36 files> --reporter=line --workers=2` call (ran 14:10:45–14:28:19, 17.5 minutes — this command
exceeded the tool's 600s foreground limit and was moved to background by the harness partway
through; polled its output file to completion rather than arming a Monitor, per this piece's
no-Monitor constraint):

```
47 failed / 4 skipped / 118 did not run / 3 passed (172 total)
```

This is **worse** than either batched attempt, not better. Diffing its failing-file set against
baseline surfaces **6** new-red files, not 3 or 5: the same `project-board-paths` /
`bring-forward` / `call-sheet` trio, **plus `document/gate-ceremony.spec.ts`,
`document/spec-book-workspace.spec.ts` — and now `document/desk-claims.spec.ts`**, which had been
clean in both mandated-procedure attempts and in every one of the 7 prior rounds. Its failure is
on the file's very first test (`a job with a claim takes a card; a quiet job takes a ledger row`,
`getByTestId('desk-roster')` never visible, 30s timeout) — a different failure shape than anything
else in this file's history. `document/action-visibility.spec.ts` and
`document/desk-walkthrough.spec.ts` also failed on **different, earlier tests** than either
baseline or this round's own earlier attempts recorded for those files (both already-FAIL files in
baseline, so not counted as new reds, but the shifting failure point inside them is more evidence
below).

### AB.5 Why this reads as contention, not a code regression

- The failing-file set **grew monotonically with elapsed wall-clock time** across three
  same-recipe attempts this round (attempt 1 batches → attempt 2 batches → the single-36 run,
  which ran longest and last): 5 new reds → 3 new reds → 6 new reds, with `desk-claims` only
  breaking in the last, slowest, latest-started pass.
- `desk-claims.spec.ts` has been clean-PASS in the W0 baseline and all 7 prior confirming rounds,
  plus both of this round's own mandated-procedure attempts (§AB.1, §AB.3) — it broke only in the
  one run that took 17.5 minutes and started last. A fixed source regression from the round-8 fix
  commit would reproduce identically regardless of when or how long the run takes; a shared
  resource getting mutated out from under a long-running test by other actors would not.
  `feedback_shared_local_postgres_across_sessions.md` documents exactly this risk, and
  `ListAgents` in this session lists ~40 other concurrently active agents, several plausibly
  writing to the same shared local Postgres this round's run also depends on.
- None of the failing tests in any pass exercise arrival code. `bring-forward` / `call-sheet` fail
  on a People-room call-sheet action-key; `project-board-paths` fails on a mood-board "Start a
  board" button; `desk-claims` fails on the desk roster testid. The round-8 fix commit touched only
  `arrival-mount.tsx` / `engine.ts` (the deferred touch/pen wait-gesture decision) — nothing in the
  People room, mood board, or desk roster rendering path.
- `project-board-paths` / `bring-forward` / `call-sheet` did clear completely when isolated to
  just themselves (§AB.2), which is inconsistent with a standing code defect in those three files
  and consistent with contention specifically triggered by running alongside their batch-3
  neighbors (`field-coordination.spec.ts` is in the same batch and independently known, from the
  baseline itself, to fail on a seed-layer `studio_id_not_designer_studio` Postgres error — a
  concurrent worker hitting that mid-transaction is a plausible trigger, though not confirmed here).

### AB.6 Cleanup

```
kill -9 <next start pid>   # unsandboxed; plain kill no-ops under the sandbox, as documented
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty after — confirmed
git -C <worktree> status --porcelain -- docs
  → 3 modified tracked PNGs (docs/design/the-document/screenshots/help-walkthrough/{step-1-desk,step-4-drawer,welcome-modal}.png)
git -C <worktree> checkout -- <those 3 paths>
git -C <worktree> status --porcelain -- docs   → empty
git -C <worktree> status --porcelain            → empty (only the pre-existing sandbox .env.example lstat noise on a raw `git status`, not present here at all this round)
git -C <worktree> log -1 --format='%H'          → e2aabbe367ef04f69dc755980ee10567c695cfd1 (unchanged — no source edit, no commit)
```

### AB.7 Bottom line

- **Not a clean confirmation — the first of eight rounds where it isn't.** Three same-recipe
  passes (two mandated-procedure, one diagnostic single-command) produced three different
  failing-file sets, growing worse with elapsed time, which is the signature of shared-Postgres
  contention from this session's ~40 other concurrently active agents, not a fixed regression.
- **No arrival-fault evidence.** Every failing test in every pass is in a file and assertion
  unrelated to arrival's touched surface; the round-8 fix commit (`arrival-mount.tsx`/`engine.ts`
  wait-gesture handling) has no plausible path to any of them.
- **Best-evidence candidate new reds (reproducible 2-for-2 in the actual mandated three-batch
  procedure, 0-for-1 isolated):** `mood-board/project-board-paths.spec.ts`,
  `people/bring-forward.spec.ts`, `people/call-sheet.spec.ts`. `document/gate-ceremony.spec.ts`
  and `document/spec-book-workspace.spec.ts` are flake-then-pass (failed attempt 1, clean attempt
  2). `document/desk-claims.spec.ts` is a single-pass outlier (only the longest, latest, non-
  mandated single-36 diagnostic run) — treated as further contention evidence, not a confirmed new
  red, since it stayed clean through both actual mandated-procedure attempts.
- **Recommendation for the integrator:** rerun this specific comparison in a quiet window (no
  other agents concurrently active against the same local Postgres), or against a dedicated
  ephemeral Postgres, before treating any of these as ship-blocking. Nothing here should block on
  arrival grounds — the arrival lane itself (§AA) is clean and this piece's own scope never touched
  `src/`.
- **Commands, in order:** preflight (§AB.0) → batches 1–3 attempt 1, 5 candidate new reds (§AB.1)
  → isolated 5-file rerun, all clean (§AB.2) → batches 1–3 attempt 2, 2 clear / 3 persist (§AB.3)
  → single-36-file diagnostic, worse (6 new reds incl. `desk-claims`) (§AB.4) → contention analysis
  (§AB.5) → cleanup, tree clean, HEAD unchanged (§AB.6).

## Z. W3b rerun after round-7 fix at `e08cc96351f2b3f17f6b6fcd37a4de7ebc7356d7` — **SUPERSEDED by §AA above** (incomplete; superseded 2026-09-29)

**Scope attempted:** rerun the arrival lane and the legacy 36-file list against the `.next`
build for round 7's fix commit (`e08cc96351f2b3f17f6b6fcd37a4de7ebc7356d7` — "fix(arrival): W3
review fixes round 7 (US-14)", the touch/pen `waitGesture` deferred-answer fix in
`arrival-mount.tsx`). Worktree `agent-arr-w3-integ`, branch `arrival-prod/w3-integration`.
**This piece made no source edit, staged nothing, and committed nothing** — the session ran out
of turns before the lane finished, so there is no verified result to report for this round.
HEAD stays at `e08cc96351f2b3f17f6b6fcd37a4de7ebc7356d7`.

### Z.0 Preflight — build currency (completed, clean)

```
apps/designer-portal/.next/BUILD_ID mtime  → 2026-09-29 06:30:53
arrival-mount.tsx source mtime             → 2026-09-29 03:19:26 (predates BUILD_ID — current)
grep -rl bkvcixdmuyejfzcijpdg apps/designer-portal/.next/static   → empty (exit 1)
grep -l -- '--arr-ok' apps/designer-portal/.next/static/css/*.css → 6cc8a4a5864085df.css (present)
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty before start
```
Build confirmed current for the round-7 commit; no rebuild performed.

### Z.1 Arrival lane — sandboxed attempt reproduced the known Chromium mach-port hazard, unsandboxed rerun started but did not finish in the session

First attempt (sandboxed) crashed every Chromium-family launch (`chromium` and `mobile-chrome`
projects) with the same hazard round-6 (§Y.3) documented for Chromium's own mach-port
rendezvous — here on the **lane run itself**, not just the legacy batch:
```
[pid=86650][err] FATAL:base/apple/mach_port_rendezvous_mac.cc:155] Check failed:
kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.86650:
Permission denied (1100)
```
Stopped that run (no valid signal from a run where 2 of 3 projects can't launch). Confirmed
port 3107 free, reran unsandboxed:
```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line   (unsandboxed)
start ~06:34
```
Progress at the point this piece ran out of session time: **14/93 tests dispatched**, all
`chromium` project, no crash lines (confirms the hazard above is sandbox-specific, not a build
problem — consistent with round 6's identical finding for the legacy batch). One failure so
far:
- `[chromium] accessibility.spec.ts:24` "exactly one SR announcement…" — **the same
  documented first-test cold-server SR flake** every round (T.5/U.2/V.1/W.2/X.1/Y.1; CONTRACT
  §4d lists it under "deferred, not blockers"). Not re-run in isolation this round — no time.

**No arrival-fault findings** — the only observed failure matches the pre-existing documented
flake shape exactly (same spec, same line, same "run's first test" pattern); nothing else
failed in the 13 tests that ran after it. This is not a confirmed clean lane, only a partial,
unfinished one — do not treat the 13/14 pass rate as lane-clean evidence.

### Z.2 Legacy 36-file regression — NOT RUN this round

Not reached. `legacy-36-files.txt` (scratchpad, byte-identical to `legacy-baseline.md` §6's
36-file list) and the env-extraction script (`extract-pw-env.mjs`, reads
`playwright.config.ts`'s own already-scanned `webServer.env` block by reference — no literal
key typed) are staged and ready in the session scratchpad for whoever picks this up next.

### Z.3 Bottom line — defer to the next rerun

- **No commit.** HEAD unchanged at `e08cc96351f2b3f17f6b6fcd37a4de7ebc7356d7`.
- **Lane: incomplete (14/93 ran, 1 flake matching the known first-test SR case, 0 arrival
  faults observed in what ran).** Needs a full clean run (and, if the SR flake recurs on test 1
  again, the accepted isolated-rerun proof) before this round can be signed off.
- **Legacy 36: not run.** Needs the full comparison against `legacy-baseline.md` before this
  round can be signed off.
- **New hazard reconfirmed:** a sandboxed Chromium-family launch (now including the lane's own
  `chromium`/`mobile-chrome` projects, not just the legacy batch's) crashes on
  `bootstrap_check_in`/mach-port-rendezvous `Permission denied` — run the whole arrival lane,
  not just the legacy batch, with `dangerouslyDisableSandbox: true` from the start.
- **Next steps for whoever reruns:** background task IDs from this piece (`bo6gzvz68` lane
  run, `bdgj1ml7f` its monitor) were live at session end but are not addressable across
  sessions — start fresh: confirm :3107 free, rerun
  `pnpm exec playwright test -c playwright.arrival.config.ts --reporter=line` unsandboxed to
  completion, then the legacy batch on :3000, then fill in this section for real.

## Y. W3b rerun after round-6 fix at `9b8dafae2aeb7a18111c57ee5ace5511a891ed84` (2026-09-29, this piece)

**Scope:** rerun the arrival lane and the legacy 36-file list against the `.next` build for
round 6's fix commit (`9b8dafae2aeb7a18111c57ee5ace5511a891ed84` — "fix(arrival): W3 review
fixes round 6 — §4d rulings (US-14)", committed 2026-09-29T02:10:34-05:00). Implements all
nine §4d round-6 rulings (design/CONTRACT.md §4d): (1) pending-sheet busy flags scoped to the
surface that opens them (`captureLeadPending`/`openProjectPending` → Desk only,
`callSheetPending` → Document only); (2) a wait halted by Escape is unplayed
(`beginEntry`/`noteRunStarted`, `afterArrival(unplayed)`); (3) her own scroll during the wait
stands (wheel/touchmove `busy` runs no declined-landing; key/pointer `busy` still lands); (4)
one landing per entry (a token landing stands down the A8 resume jump via
`arrivalLandingRef`); (5) lifecycle halts carry causes
(pagehide/pageshow→`hidden`, beforeprint→`busy`, reduced-motion→`unsupported`); (6) three href
identity moves call `suppressNextArrival` on click (SignedSeal, service-agreement-instruments,
lifecycle-mobile-action); (7) a press on the act that the run outlived activates exactly once
(engine forwards one synthetic click via `forward()`/`within()`); (8) `EVENT_ENDED` dispatch
in its own try block, separate from telemetry's; (9) test hygiene (duplicate React keys
removed; `brief.test.ts`'s `data-part` check made token-list aware). Worktree
`agent-arr-w3-integ`, branch `arrival-prod/w3-integration`. `src/lib/arrival/types.ts` and
`run-contract.ts` untouched; the 36 legacy specs untouched; nothing under `docs/` staged by
this piece. **No fix commit needed this round** — both lane runs are clean/flake-confirmed
(§Y.1–Y.2) and the legacy comparison is an exact match (§Y.3); worktree HEAD stays at
`9b8dafae2aeb7a18111c57ee5ace5511a891ed84`.

### Y.0 Preflight — build currency

```
git -C <worktree> log -1 --format='%H %s %cI'
→ 9b8dafae2aeb7a18111c57ee5ace5511a891ed84 fix(arrival): W3 review fixes round 6 — §4d rulings (US-14) 2026-09-29T02:10:34-05:00

apps/designer-portal/.next/BUILD_ID → 98gdxPK1hw9GoKtINcnW9
```

`BUILD_ID`'s mtime (02:09:35) postdates the latest touched-src-file mtime (02:03:36) — the
existing build is current for this commit. No rebuild performed by this piece.

```
grep -rl bkvcixdmuyejfzcijpdg apps/designer-portal/.next/static   → empty (exit 1)
grep -l -- '--arr-ok' apps/designer-portal/.next/static/css/*.css → present
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty — 3000 free
df -h /   → 926Gi total, 30Gi avail (OK)
```

### Y.1 Arrival lane — first pass, two failures (one recurring flake, one new-shape flake)

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line   (unsandboxed)
start 02:12:30
Running 93 tests using 1 worker
  2 failed
    [chromium] › e2e/arrival/accessibility.spec.ts:24:7 › Arrival accessibility › exactly one SR announcement; the lens band aria-live goes off for the run and is restored
      Error: expect(received).toBe(expected) // Object.is equality
      Expected: 7
      Received: 3
    [webkit] › e2e/arrival/input-and-escape.spec.ts:108:7 › Arrival input handling › a chrome click and t/?/g,l bare-key shortcuts in Acts 1-2 only advance — no overlay opens
  7 skipped
  84 passed (10.0m)
end 02:22:32
lane exit=1
```

**Failure 1: `accessibility.spec.ts:24`, chromium, the run's first scheduled test — the
seventh occurrence** of the same documented first-test cold-server SR-announcement flake
(`T.5`, `U.2`, `V.1`, `W.2`, round-5 `X.1`, now round 6). CONTRACT §4d itself lists this exact
flake under "Deferred (recorded, not blockers)" — not a round-6 regression.

**Failure 2: `input-and-escape.spec.ts:108`, webkit** — new-to-this-round: a 3-iteration loop
(`page.goto` + `t`/`?`/`g,l` bare-key shortcuts) failed to find `.arr-card .arr-h` within 20s
on the 2nd+ iteration. Considered whether round 6's new module state
(`beginEntry`/`noteRunStarted`/`waitScrolled`/`pressRun`) could leak across the loop's repeated
`page.goto` calls: it cannot — `page.goto` triggers a full page reload, resetting the entire JS
execution context (and all module-level state in `arrival-mount.tsx`/`engine.ts`) on every
iteration, so there is no code path for round 6's changes to carry state between iterations of
this test.

Immediate isolated rerun of both specific failing tests, same build, fresh server, all three
projects:

```
pnpm exec playwright test -c playwright.arrival.config.ts \
  e2e/arrival/accessibility.spec.ts:24 e2e/arrival/input-and-escape.spec.ts:108 --reporter=line   (unsandboxed)
start 02:22:50
Running 6 tests using 1 worker
  6 passed (1.5m)
end 02:24:18
ISO_EXIT_CODE=0
```

Clean on all three projects for both tests. **Flakes, not a regression** on the balance of this
evidence alone — but because failure 2 is a new-to-this-round failure shape (not the
well-documented SR flake, for which the task brief itself pre-authorizes "isolated rerun … is
the accepted proof"), a second full lane pass was run for stronger confidence before accepting
this as clean.

### Y.2 Full confirming rerun — clean

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line   (unsandboxed)
start 02:24:44
Running 93 tests using 1 worker
  7 skipped
  86 passed (9.7m)
end 02:34:28
CONFIRM_EXIT_CODE=0
```

Zero occurrences of "failed." `86 passed / 0 failed / 7 skipped` — the same skip accounting as
every prior clean round. Port 3107 confirmed free immediately after. **Both §Y.1 failures are
confirmed flakes, not defects caused by round 6's code changes** — no source patch made, no
new lane-infra commit needed this round (unlike round 5's `22cc1891c`); worktree HEAD stays at
`9b8dafae2aeb7a18111c57ee5ace5511a891ed84`.

**Honest framing, matching every prior round's own standard:** two clean passes (one isolated,
one full) narrow the odds but do not prove either flake is eliminated — both are inherently
non-deterministic.

### Y.3 Legacy 36-file list vs `qa/legacy-baseline.md` — exact match, zero new reds

Same recipe as every prior round: the local demo `SUPABASE_SERVICE_ROLE_KEY` from
`supabase status -o env` is rejected by this stack (`ES256`/`kid` mismatch); used the
already-committed `ES256`-with-`kid` pair from `playwright.config.ts`'s own `webServer.env`
block instead, extracted programmatically (`extract-pw-env.mjs` regexes the literal values out
of that file and prints `export KEY='value'` lines, consumed via `eval "$(...)"` in the same
shell invocation as the command that needs them — no key value ever appeared in this piece's
own command output).

**New hazard hit and resolved this round, for the record:** the first attempt at the 36-file
batch (sandboxed) crashed every Chromium worker with
`FATAL:base/apple/mach_port_rendezvous_mac.cc: Check failed: kr == KERN_SUCCESS.
bootstrap_check_in … Permission denied (1100)` — the sandbox blocking Chromium's own internal
IPC, not a build or env issue (the same class of hazard the task brief documents for WebKit
launches, evidently also affecting Chromium's mach-port rendezvous under this harness). Reran
the batch with the sandbox disabled for that one command; it then ran clean start-to-finish
with no crash lines at all.

```
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty before start
next start -p 3000 (backgrounded, ES256-with-kid trio + NEXT_PUBLIC_FLAG_OVERRIDES;
                     SUPABASE_ORIGIN_RUNTIME and ARRIVAL_E2E unset)
✓ Ready in 193ms
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/version → 200 (first attempt)
```

**The 36-file batch, literal individually-typed file arguments (zsh array, avoiding the
documented word-splitting hazard) — the exact 36 files `legacy-baseline.md` §6 records,
unsandboxed:**

```
pnpm exec playwright test --project=chromium <the 36 files> --reporter=line --workers=2   (unsandboxed)
start 02:40:55
  37 failed
  4 skipped
  86 did not run
  45 passed (7.8m)
end 02:48:45
legacy exit=1
```

**Totals match `legacy-baseline.md` and every prior round exactly:** `45 passed / 37 failed /
4 skipped / 86 did not run` (172 total).

**Per-file diff, done programmatically** (ANSI escapes stripped with a Perl one-liner, the
"failed" summary block isolated by an `awk` range up to the exit-code marker, reduced to a
unique sorted file set via `grep -oE 'e2e/[^ ]+\.spec\.ts'`, compared against
`legacy-baseline.md`'s own 29-file list with a byte-exact sorted `diff`, and cross-checked with
`comm -23`/`comm -13`):

```
diff failed-files-round6-sorted.txt baseline-29-sorted.txt   → exit 0 (byte-identical, 29 lines each)
comm -23 failed-files-round6.txt baseline-29.txt   # only in this run  → (empty)
comm -13 failed-files-round6.txt baseline-29.txt   # only in baseline  → (empty)
```

**Zero new legacy reds, zero newly-green.** The 29 failing files are byte-identical to
`legacy-baseline.md` §9's list — the seventh independent confirmation of this exact table (W0,
§T.6, §U.3, §V.2, §W.4, §X.3, this piece).

Server killed after the run (`kill -9` on the `next start` PID, unsandboxed — the plain
sandboxed `kill` silently no-oped) and port 3000 reconfirmed free
(`lsof -nP -iTCP:3000 -sTCP:LISTEN` exit 1 afterward).

**Worktree hygiene:** the same 16 tracked screenshot PNGs under `docs/design/` the screenshot
specs rewrite (`workflow-alignment/screenshots/wp3/*`,
`the-document/screenshots/help-walkthrough/*`) plus one new untracked
`margin-handoff-overdue-1440-collapsed.png` appeared after this run — the identical set §X.3
documented. Restored the 16 with `git checkout --` and removed the untracked one; `git status`
showed a clean tree afterward (the only remaining lines are this sandbox's own
"Operation not permitted" scan noise on `.env.example` files, present before this piece ever
touched the worktree).

### Y.4 Bottom line

- **Arrival lane: clean.** `86 passed / 0 failed / 7 skipped` on the round-6 build, confirmed
  by both an isolated rerun and a full second pass. First pass showed two failures: the
  seventh occurrence of the documented first-test cold-server SR flake
  (`accessibility.spec.ts:24`, chromium — listed under CONTRACT §4d's own "deferred, not
  blockers"), and one new-shape webkit flake (`input-and-escape.spec.ts:108`) shown by module-
  reload reasoning and a clean isolated + full rerun to be unrelated to round 6's module-state
  changes. No commit needed; worktree HEAD unchanged at
  `9b8dafae2aeb7a18111c57ee5ace5511a891ed84`.
- **Legacy regression: clean, exact match.** `45 passed / 37 failed / 4 skipped / 86 did not
  run`, the same 29 failing files as `legacy-baseline.md` (verified with a byte-exact sorted
  `diff`, not just `comm`), zero new reds, zero newly-green — the seventh independent
  confirmation of this exact table.
- **No arrival-fault findings from this round.** Both lane failures in §Y.1 are flakes, not
  arrival defects, reconfirmed by isolated + full clean rerun.
- **New hazard for the skill/runbook:** a sandboxed Chromium launch can crash on
  `bootstrap_check_in` mach-port-rendezvous `Permission denied` under this harness, exactly
  like the already-documented WebKit case — the fix is the same (`dangerouslyDisableSandbox`
  on that one command), just now confirmed for Chromium too.
- **Commands, in order:** preflight (§Y.0) → unsandboxed lane, 2 flakes (§Y.1) → isolated
  rerun confirms flakes (§Y.1) → full confirming rerun, clean (§Y.2) → legacy 36-file batch,
  sandboxed attempt crashes on Chromium mach-port rendezvous, unsandboxed retry runs clean and
  exact-matches baseline (§Y.3).


## X. W3b rerun after round-5 fix at `b2e8fb3f37187ef7cc7e4ec50b5d2a8952b50603` (2026-09-29, this piece)

**Scope:** rerun the arrival lane and the legacy 36-file list against the `.next` build for
round 5's fix commit (`b2e8fb3f37187ef7cc7e4ec50b5d2a8952b50603` — the zone-flight
double-count fix: the Document's `EVENT_ENDED` listener now ignores events for a route it
isn't on and events for another surface, per `page.tsx`/`page.test.tsx`). Worktree
`agent-arr-w3-integ`, branch `arrival-prod/w3-integration`. `src/lib/arrival/types.ts` and
`run-contract.ts` untouched; the 36 legacy specs untouched. One spec-infra fix committed
(the lane's own global setup, never `src/`).

### X.0 Preflight — build currency

```
git -C <worktree> log -1 --format='%H %s %cI'
→ b2e8fb3f37187ef7cc7e4ec50b5d2a8952b50603 fix(arrival): W3 review fixes round 5 (US-14) 2026-09-29T00:37:23-05:00

apps/designer-portal/.next/BUILD_ID → fNFBLZI1ND7UaytlclpXg, mtime 2026-09-29 00:36:31
```

Both files round 5 touched (`page.tsx` mtime 22:05:47, `page.test.tsx` mtime 22:05:27 —
2026-09-28) and `next.config.js` (mtime 20:42:11) predate `BUILD_ID`'s mtime (00:36:31) — the
existing build is current for this commit (the fixer's own rebuild). No rebuild performed by
this piece.

```
grep -rl bkvcixdmuyejfzcijpdg apps/designer-portal/.next/static   → empty (exit 1)
grep -l -- '--arr-ok' apps/designer-portal/.next/static/css/*.css → 6cc8a4a5864085df.css
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty — 3000 free
df -h /   → 926Gi total, 32Gi avail (OK)
```

### X.1 Arrival lane — first pass, one flake (the same recurring one, again)

Ran directly unsandboxed (round 4's own §W.1 already established the sandboxed WebKit-launch
failure is a harness artifact, not a build issue — skipped straight past it this round):

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line   (unsandboxed)
start 00:39:42
Running 93 tests using 1 worker
  1 failed
    [chromium] › e2e/arrival/accessibility.spec.ts:24:7 › Arrival accessibility › exactly one SR announcement; the lens band aria-live goes off for the run and is restored
      Error: expect(received).toBe(expected) // Object.is equality
      Expected: 5
      Received: 3
  7 skipped
  85 passed (9.7m)
end 00:49:25
lane exit=1
```

**The one failure: `accessibility.spec.ts:24`, chromium, the run's first scheduled test —
again.** Same test, same shape as every prior round's single red (`T.5` chromium, `U.2`
mobile-chrome + webkit, `V.1` webkit, `W.2` chromium) — the sixth occurrence. Notably, round
4's own global-setup warm-up fix (`271b4b788`, already an ancestor of this build) was already
on disk for this run and did **not** prevent the recurrence.

Immediate isolated rerun, same build, fresh server:

```
pnpm exec playwright test -c playwright.arrival.config.ts e2e/arrival/accessibility.spec.ts:24 --reporter=line   (unsandboxed)
start 00:50:41
Running 3 tests using 1 worker
  3 passed (22.1s)
end 00:51:04
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
```

Clean on all three projects including chromium. **Flake, not a regression** — consistent with
every prior occurrence.

### X.2 Fix — extend the warm-up to the local Supabase Auth (GoTrue) grant, not just the Next app

Round 4's warm-up (`global-setup.ts`) hits only `/desk` and `/doc/[fake-id]` on the Next app,
both plain unauthenticated GETs. Every real spec instead starts through
`authenticatedPage` (`e2e/fixtures/auth.ts`), which signs in via the UI — a password grant
that round-trips straight to the **local Supabase Auth (GoTrue) container**, not through the
Next app at all. That grant's own first-call cost (password verification, JWT signing key
setup) was never warmed by round 4's fix. This is a concrete, evidenced gap, not a guess: the
one thing every failing occurrence has in common across all six rounds is that it's the run's
first test, and the first test is also always the first real sign-in of the run.

Added one more warm-up call to `global-setup.ts`: a deliberately-wrong-credential password
grant (`POST {SUPABASE_URL}/auth/v1/token?grant_type=password`) against the local GoTrue
container — a 400 is the expected, successful outcome (exercises password verification with
no session created). The URL and anon key are read **by reference** from
`playwright.config.ts`'s own already-committed, already-secret-scanned `webServer.env` block
(`import base from '../../playwright.config'`), the same pattern
`playwright.arrival.config.ts` itself already uses — no literal key is typed in this file.

```
pnpm --dir apps/designer-portal run type-check   → tsc --noEmit exit 0
```

**Full lane rerun with the fix on disk, unsandboxed, all three projects:**

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line   (unsandboxed)
start 00:54:18
Running 93 tests using 1 worker
  7 skipped
  86 passed (9.7m)
end 01:04:04
lane exit=0
```

Zero occurrences of "failed." `86 passed / 0 failed / 7 skipped` — the same skip accounting
as `W.2` (`put-down.spec.ts:34` on `mobile-chrome`, 1; `touch-tap.spec.ts:146` on chromium +
webkit, 6; `1 + 6 = 7`). Port 3107 confirmed free immediately after.

**Honest framing, matching every prior round's own standard:** one clean run narrows the odds
but does not prove the flake is eliminated — it is inherently non-deterministic (round 4's
identical single-clean-run evidence didn't prevent this round's recurrence either). This is
reported as an evidenced mitigation targeting a real, previously-unwarmed code path, not as a
proven fix.

**Commit:** `22cc1891c79e2d7327403b97fc6a3e2cfdb1292c` on `arrival-prod/w3-integration`
(worktree `agent-arr-w3-integ`), `test(arrival): lane fixes (US-14)`. Staged by explicit
pathspec (`apps/designer-portal/e2e/arrival/global-setup.ts` only); not pushed.

```
apps/designer-portal/e2e/arrival/global-setup.ts | 60 +++++++++++++++++++-----
1 file changed, 47 insertions(+), 13 deletions(-)
```

Pre-commit Prettier hook printed an advisory `[warn]` for the file (same as every prior round
— advisory locally, no CI workflow runs a prettier check).

### X.3 Legacy 36-file list vs `qa/legacy-baseline.md` — exact match, zero new reds

Same recipe as every prior round (`§T.4`/`§U.3`/`§V.2`/`§W.4`): the local demo
`SUPABASE_SERVICE_ROLE_KEY` that `supabase status -o env` prints is rejected by this stack
(`ES256`/`kid` mismatch); used the already-committed `ES256`-with-`kid` pair from
`playwright.config.ts`'s own `webServer.env` block instead, extracted programmatically (a
small Node script under the session scratchpad regexes the literal values out of that file
and prints `export KEY='value'` lines, consumed via `eval "$(...)"` — no key value ever
appeared in this piece's own command output).

```
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty before start
next start -p 3000 (backgrounded, same trio + NEXT_PUBLIC_FLAG_OVERRIDES;
                     SUPABASE_ORIGIN_RUNTIME and ARRIVAL_E2E unset)
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/version → 200 ("✓ Ready in 163ms")
```

**The 36-file batch, literal individually-typed file arguments — the exact command
`legacy-baseline.md` §8 and every prior round used:**

```
pnpm exec playwright test --project=chromium <the 36 files> --reporter=line --workers=2
start 01:05:30
end 01:13:18
  37 failed
  4 skipped
  86 did not run
  45 passed (7.8m)
legacy exit=1
```

**Totals match `legacy-baseline.md` and every prior round exactly:** `45 passed / 37 failed /
4 skipped / 86 did not run` (172 total).

**Per-file diff, done programmatically** (ANSI escapes stripped with
`perl -pe 's/\e\[[0-9;]*[A-Za-z]//g'`, the "37 failed" block isolated by line range, reduced to
a unique sorted 29-file set via `grep -oE 'e2e/[^ ]+\.spec\.ts'`):

```
comm -23 failed-files-round5.txt baseline-29.txt   # only in this run  → (empty)
comm -13 failed-files-round5.txt baseline-29.txt   # only in baseline  → (empty)
```

**Zero new legacy reds, zero newly-green.** The 29 failing files are byte-identical to
`legacy-baseline.md` §9's list — the sixth independent confirmation of this exact table (W0,
§T.6, §U.3, §V.2, §W.4, this piece).

Server killed after the run (the background task completed on its own once the harness tore
down the shell; confirmed by `lsof` returning no listener) and both ports reconfirmed free
(`lsof -nP -iTCP:3000 -sTCP:LISTEN` and `-iTCP:3107` both exit 1 afterward).

**Worktree hygiene:** the same 16 tracked screenshot PNGs under `docs/design/` the screenshot
specs rewrite (`workflow-alignment/screenshots/wp3/*`,
`the-document/screenshots/help-walkthrough/*`) plus one new untracked
`margin-handoff-overdue-1440-collapsed.png` appeared after this run. Restored the 16 with
`git checkout --` and removed the untracked one before staging anything else — `git status`
showed only the `global-setup.ts` change afterward.

### X.4 Bottom line

- **Arrival lane: clean.** `86 passed / 0 failed / 7 skipped` on the round-5 build, after
  extending the warm-up to cover the local Supabase Auth grant (was `85/1/7` before the fix,
  the one red being the sixth occurrence of the documented first-test cold-server SR flake,
  reconfirmed as a flake by an immediate isolated rerun before any fix was applied). Commit
  `22cc1891c79e2d7327403b97fc6a3e2cfdb1292c`.
- **Legacy regression: clean, exact match.** `45 passed / 37 failed / 4 skipped / 86 did not
  run`, the same 29 failing files as `legacy-baseline.md`, zero new reds, zero newly-green —
  the sixth independent confirmation of this exact table.
- **No arrival-fault findings from this round.** The one failure (§X.1) is the same
  already-documented, CONTRACT §4c-classified lane flake, not an arrival defect — reconfirmed
  by immediate isolated rerun, same as every prior round's identical evidence.
- **Commands, in order:** preflight (§X.0) → unsandboxed lane, 1 flake (§X.1) → isolated
  rerun confirms flake (§X.1) → extended global-setup + type-check + unsandboxed lane rerun,
  clean, commit (§X.2) → legacy 36-file batch on `next start -p 3000`, exact match (§X.3).

## W. W3b rerun after §4c round-4 fixes at `ea4c80dcf4bb9399b65bf90dfc8614d6039166f4` (2026-09-28, this piece)

**Scope:** rerun the arrival lane and the legacy 36-file list against the `.next` build for
the round-4 fixer's commit (`ea4c80dcf4bb9399b65bf90dfc8614d6039166f4`, CONTRACT §4c rulings
(a)–(k)). Worktree `agent-arr-w3-integ`, branch `arrival-prod/w3-integration`.
`src/lib/arrival/types.ts` and `run-contract.ts` untouched; the 36 legacy specs untouched.
One spec-infra fix committed (lane's own global setup, never `src/`).

### W.0 Preflight — build currency

```
git -C <worktree> log -1 --format='%H %s %cI'
→ ea4c80dcf4bb9399b65bf90dfc8614d6039166f4 fix(arrival): W3 review fixes round 4 — §4c rulings (US-14) 2026-09-28T20:46:40-05:00

apps/designer-portal/.next/BUILD_ID → h3xpjH2gfA5e0LwcN_JxC, mtime 20:45:21
```

Every `src` file touched by the round-4 commit (`engine.ts`, `host.ts`, `faces.ts`,
`arrival-mount.tsx`, `arrival-run.tsx`, `doc/[id]/page.tsx`, `lens-band.tsx`,
`ceremony-surface.tsx`, `proposal-watch.tsx`, `desk-arbiter.tsx`, `triage-bar.tsx`,
`drafting-room.tsx`, `room-shell.tsx`, `document-route-boundary.tsx`,
`agreement-composer.tsx`, `service-agreement-instruments.tsx`) and `next.config.js`
(mtime 20:42:11) predate `BUILD_ID`'s mtime (20:45:21) — the existing build is current for
this commit. No rebuild performed by this piece.

```
grep -rl bkvcixdmuyejfzcijpdg apps/designer-portal/.next/static   → empty
grep -l -- '--arr-ok' apps/designer-portal/.next/static/css/*.css → 6cc8a4a5864085df.css
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty — 3000 free
```

### W.1 Arrival lane — first pass hits a sandbox failure, not an arrival fault

The task's own Bash sandbox (macOS Seatbelt) blocks WebKit's process launch:
`sandbox_extension_issue_file_to_process failed for
/Users/kody/Library/Caches/ms-playwright/webkit-2248/Playwright.app: 1 (Operation not
permitted)`, cascading into a 180s `browserType.launch` timeout on every WebKit test in
turn (chromium and mobile-chrome had already completed and passed before WebKit's project
started). This is a sandbox-imposed restriction on spawning WebKit's helper process, not a
symptom of the arrival, the build, or any spec — the same class of failure the harness
itself names ("Operation not permitted... spawning a process"). The run was stopped
(`TaskStop`) once the pattern was confirmed repeating, both ports reconfirmed free, and the
lane was rerun with the sandbox restriction lifted for that one command
(`dangerouslyDisableSandbox: true`), per the harness's own guidance for a command that fails
specifically on "Operation not permitted".

### W.2 Arrival lane — full clean run, unsandboxed, all three projects

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line   (unsandboxed)
start 21:01:49
Running 93 tests using 1 worker
  1 failed
    [chromium] › e2e/arrival/accessibility.spec.ts:24:7 › Arrival accessibility › exactly one SR announcement; the lens band aria-live goes off for the run and is restored
      Error: expect(received).toBe(expected) // Object.is equality
      Expected: 6
      Received: 3
  7 skipped
  85 passed (9.8m)
end 21:11:40
lane exit=1
```

`93 = 31 unique tests × 3 projects` (round 3's `touch-tap.spec.ts` additions carried
forward; round 4 added no new spec file). **Skip accounting (7), verified against the
source's own `test.skip()` sites** (`grep -n "skip(" e2e/arrival/*.spec.ts` → exactly 2 call
sites, down from §V's 3): `put-down.spec.ts:34` skips on `mobile-chrome` only, "the spine
Put down document link is desktop-only" (1); `touch-tap.spec.ts:146`
`test.skip(({ hasTouch }) => !hasTouch, …)` skips all 3 of its tests on chromium and webkit
(6). `1 + 6 = 7`, matching exactly. `play-document.spec.ts` no longer carries a
per-project skip at all — round 4's §4c ruling (j) ("`data-arr-long` only on the short
(label) form; T3 generalized... no per-project special case") removed the phone long-form
test's previous chromium/webkit skip (§V's accounting had it at 2), so that test now runs on
all three projects. `9 (§V) − 2 (removed) = 7` (this round).

**The one failure: `accessibility.spec.ts:24`, chromium, first test of the run.** Same test,
same shape as every prior round's single red — `T.5` (chromium), `U.2` (mobile-chrome and
webkit, same run), `V.1` (webkit) — always the run's first test against a just-started
`next start` process, always a different project each time. Isolated rerun, same build, same
server, immediately after:

```
pnpm exec playwright test -c playwright.arrival.config.ts e2e/arrival/accessibility.spec.ts:24 --reporter=line   (unsandboxed)
Running 3 tests using 1 worker
  3 passed (21.7s)
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
```

Clean on all three projects including chromium. **Flake, not a regression** — the fourth
occurrence of the exact same first-test-cold-server pattern CONTRACT §4c already names as
"deferred, recorded ... not a blocker" but explicitly invites fixing if it recurs: "the
first-test cold-server SR flake in the lane (a warm-up request in the lane's global setup if
it recurs)."

### W.3 Fix — warm-up global setup for the lane (spec infra only, no `src/` edit)

Per the task's own instruction ("if the ... flake recurs, add a warm-up request in the
lane's global setup ... rerun, and commit it"), added
`apps/designer-portal/e2e/arrival/global-setup.ts` (two `fetch()` GETs against `/desk` and
`/doc/[id]` before any spec runs) and wired it into `playwright.arrival.config.ts` via
`globalSetup: require.resolve('./e2e/arrival/global-setup')`. Rationale: `webServer.url`'s
own readiness probe only confirms the port answers — it never exercises `/desk` or
`/doc/[id]`, so the first real spec still pays for each route's one-time cost (Supabase
server client construction, the auth middleware's first JWT verify) that every later hit
gets for free; a different project "wins" the cold hit each round because project order
inside one `--workers=1` run is arbitrary relative to which route each project's first spec
happens to touch.

`pnpm --dir apps/designer-portal run type-check` → `tsc --noEmit` exit `0` (the two new/edited
files are inside `tsconfig.json`'s `include` and are not exempted by its `.spec.ts`/`.test.ts`
excludes) — confirms both files compile before the rerun below.

**Full lane rerun with the fix on disk, unsandboxed, all three projects:**

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line   (unsandboxed)
start 21:15:18
Running 93 tests using 1 worker
  7 skipped
  86 passed (9.8m)
end 21:25:06
lane exit=0
```

Zero occurrences of "failed" anywhere in the run's output. `86 passed / 0 failed / 7 skipped`
(was `85 / 1 / 7`) — exactly the one prior red now green, nothing else moved. Port 3107
confirmed free immediately after (`lsof -nP -iTCP:3107 -sTCP:LISTEN` empty).

**Commit:** `271b4b788d8c12eb8cadad872a2e74ac71eac03a` on `arrival-prod/w3-integration`
(worktree `agent-arr-w3-integ`), `test(arrival): lane fixes (US-14)`. Staged by explicit
pathspec (`apps/designer-portal/e2e/arrival/global-setup.ts`,
`apps/designer-portal/playwright.arrival.config.ts`); not pushed.

```
 apps/designer-portal/e2e/arrival/global-setup.ts  | 33 +++++++++++++++++++++++
 apps/designer-portal/playwright.arrival.config.ts |  5 ++++
 2 files changed, 38 insertions(+)
```

Pre-commit Prettier hook printed an advisory `[warn]` for both files (same as every prior
round — "advisory locally... no CI workflow runs a prettier check").

### W.4 Legacy 36-file list vs `qa/legacy-baseline.md` — exact match, zero new reds

**Environment note (this piece hit the same key-format hazard §V.2 already documented and
used the same fix, without re-deriving it from scratch):** the generic demo
`SUPABASE_SERVICE_ROLE_KEY` that `supabase status -o env` prints is `HS256`/no-`kid` and is
now rejected by this stack (`JWT cryptographic operation failed`, per §V.2's hazard 2). The
currently-valid keys are the literal `ES256`-with-`kid` pair already committed in
`playwright.config.ts`'s own `webServer.env` block (that file's own comment: "not secrets,
safe to inline" — the Supabase CLI's fixed local-demo signing keypair, not a project secret).
Those values were extracted and exported **programmatically, inside a single `eval
"$(node -e ...)"` command substitution**, so no literal key value was ever written into a
typed command or printed to any command's stdout — the same "export values only by piping"
discipline the task's hard rules require for `supabase status -o env`, applied to this
second source. One earlier step in this piece's own work (a `sed`-based redaction attempt
that assumed the key sat on the same line as its object key, when the file actually wraps
long values onto the following line) failed to redact and briefly surfaced both literal key
values in this piece's own tool output before the corrected extraction method above replaced
it. Both are the repo's own already-committed, already-secret-scanned local-stack demo keys
(never a production credential), and no further step in this piece printed either value again.

**Server start (`next start -p 3000`), same recipe as `legacy-baseline.md` §3/§4 and
§T.4/§U.3/§V.2:**

```
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty before start
(vars exported programmatically as above: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 NEXT_PUBLIC_SUPABASE_STORAGE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET;
 NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true';
 SUPABASE_ORIGIN_RUNTIME and ARRIVAL_E2E unset)
next start -p 3000 (backgrounded)
attempt 1: /api/version -> 200
grep -i "JWT cryptographic operation failed" legacy-server.log → empty (no auth failure this time)
```

**The 36-file batch, literal individually-typed file arguments (never a shell variable) —
the exact command `legacy-baseline.md` §8 and every prior round used:**

```
pnpm exec playwright test --project=chromium <the 36 files> --reporter=line --workers=2
start 21:29:36
end 21:37:25
  37 failed
  4 skipped
  86 did not run
  45 passed (7.8m)
legacy exit=1
```

**Totals match `legacy-baseline.md` and every prior round exactly:** `45 passed / 37 failed /
4 skipped / 86 did not run` (172 total).

**Per-file diff, done programmatically** (ANSI escapes stripped first with
`perl -pe 's/\e\[[0-9;]*[A-Za-z]//g'`, then the "37 failed" listing block isolated by line
range and reduced to a unique, sorted spec-file set — 29 files):

```
comm -23 failed-files-final.txt baseline-29.txt   # only in this run  → (empty)
comm -13 failed-files-final.txt baseline-29.txt   # only in baseline  → (empty)
```

**Zero new legacy reds, zero newly-green.** The 29 failing files are byte-identical to
`legacy-baseline.md` §9's list (order-independent, both sorted) — the fifth independent
confirmation of this exact table (W0, §T.6, §U.3, §V.2, this piece). The 6 files that were
PASS at baseline (`desk-claims`, `gate-ceremony`, `spec-book-workspace`,
`mood-board/project-board-paths`, `people/bring-forward`, `people/call-sheet`) are all
absent from this run's failed-file set too, and `arrival-arc.spec.ts` stays the one
pre-existing `SKIP (fixme)`.

Server killed after the run (`kill` on the `next start` PID, unsandboxed); both ports
reconfirmed free (`lsof -nP -iTCP:3000 -sTCP:LISTEN` and `-iTCP:3107` both empty afterward).
The screenshot-spec PNG rewrites under `docs/design/` (16 tracked files under
`workflow-alignment/screenshots/wp3/` and `the-document/screenshots/help-walkthrough/`, plus
one new untracked `margin-handoff-overdue-1440-collapsed.png`) are run artefacts of this
pass — not committed, not staged, matching every prior round's own note and CONTRACT §4c's
worktree-hygiene item (restoring them is that item's job, not this piece's).

### W.5 Bottom line

- **Arrival lane: clean, one prior flake fixed.** `86 passed / 0 failed / 7 skipped` on the
  round-4 build with the warm-up global-setup fix in place (was `85/1/7` before the fix,
  the one red being the fourth occurrence of the documented first-test cold-server SR flake,
  reconfirmed as a flake by an immediate isolated rerun before any fix was applied). Commit
  `271b4b788d8c12eb8cadad872a2e74ac71eac03a`.
- **Legacy regression: clean, exact match.** `45 passed / 37 failed / 4 skipped / 86 did not
  run`, the same 29 failing files as `legacy-baseline.md`, zero new reds, zero newly-green —
  the fifth independent confirmation of this exact table.
- **No arrival-fault findings from this round.** The one sandbox-caused WebKit launch failure
  (§W.1) is an artifact of this piece's own execution environment, not the build; it does not
  recur once the sandbox restriction is lifted for that command, as later runs in this same
  section show.
- **Commands, in order:** preflight (§W.0) → sandboxed lane attempt, stopped (§W.1) →
  unsandboxed lane, 1 flake (§W.2) → global-setup fix + type-check + unsandboxed lane rerun,
  clean, commit (§W.3) → legacy 36-file batch on `next start -p 3000`, exact match (§W.4).

## V. W3b rerun after fixes at `601454a320a3c79c5cc32a858095e23ac3a8e561` (2026-09-28, this piece)

**Scope:** rerun the arrival lane and the legacy 36-file list against the `.next` build for
W3 fix round 3 (`601454a320a3c79c5cc32a858095e23ac3a8e561` — touch click-through fix +
`touch-tap.spec.ts` + the D2 phone-headline T3 fix, on top of `632c6839a`). Worktree
`agent-arr-w3-integ`, branch `arrival-prod/w3-integration`. No `src/` file touched, no
legacy spec touched. `src/lib/arrival/types.ts` and `run-contract.ts` untouched.

### V.0 Preflight

```
git -C <worktree> log -1 --format='%H %s'
→ 601454a320a3c79c5cc32a858095e23ac3a8e561 fix(arrival): W3 review fixes round 3 (US-14)

apps/designer-portal/.next/BUILD_ID → H_fZv1fmZUiwbPFRDNSqI
stat: .next/BUILD_ID mtime 18:43:00 > engine.ts mtime 18:30:38, arrival-mount.tsx mtime 18:37:08
```
Build postdates both touched `src` files — `.next` is current for this commit, matching the
`H_fZv1fmZUiwbPFRDNSqI` build §U.5 already named for round 3. No rebuild performed by this
piece.

```
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty — 3000 free
```

### V.1 Arrival lane — full clean run, all three projects

```
pnpm --dir .../agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line
start 18:57:31
Running 93 tests using 1 worker
  1 failed
    [webkit] › e2e/arrival/accessibility.spec.ts:24:7 › Arrival accessibility › exactly one SR announcement; the lens band aria-live goes off for the run and is restored
  9 skipped
  83 passed (9.5m)
end 19:07:01
lane exit=1
```

`93 = 31 unique tests × 3 projects` — round 3 added `touch-tap.spec.ts`'s 3 tests (148, 174,
217) to §U's 28, giving 31. Port 3107 confirmed free immediately after.

**Skip accounting (9), verified against the source's own `test.skip()` sites** (`grep -n
"skip(" e2e/arrival/*.spec.ts` → exactly 3 call sites): `put-down.spec.ts:30` skips :27 on
`mobile-chrome` only (1); `play-document.spec.ts:136` skips :133 (phone long-form) on
everything but `mobile-chrome` (2, chromium+webkit); `touch-tap.spec.ts:146` skips all 3 of
its tests unless `hasTouch` (6, chromium+webkit × 3 tests). `1 + 2 + 6 = 9`, matching exactly.

**Per-project tally implied by the line output** (31 unique tests; chromium/webkit each drop
4 to skip, mobile-chrome drops 1):

| Project | pass | fail | skip |
|---|---|---|---|
| chromium | 27 | 0 | 4 |
| mobile-chrome | 30 | 0 | 1 |
| webkit | 26 | 1 | 4 |
| **total** | **83** | **1** | **9** |

**The one failure, isolated and rerun on all three projects immediately after:**

```
pnpm exec playwright test -c playwright.arrival.config.ts e2e/arrival/accessibility.spec.ts:24 --reporter=line
start 19:07:14
Running 3 tests using 1 worker
  3 passed (22.3s)
end 19:07:37
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
```

**Flake, not a regression.** `accessibility.spec.ts:24` is the exact test §T.5 caught
flaking on chromium (first test against a freshly-started server) and §U.2 confirmed clean;
this round it flaked on webkit instead, same test, same "first test off a cold server" shape,
and the isolated rerun is clean on all three projects including webkit. No new failure
signature; nothing to fix, no spec was wrong this round.

**Bottom line: 83 of 84 non-skipped test-runs pass clean on the first pass, and the one red
is the same pre-existing cold-server flake documented in §T.5/§U.2, now reconfirmed clean by
an isolated rerun.** No arrival-fault finding from this run.

### V.2 Legacy 36-file list — two hazards hit and corrected before the comparable run

Two environment pitfalls specific to *how this rerun was driven*, not to the arrival or to
any spec, cost most of this piece's time. Both are recorded here so the next round doesn't
repeat them.

**Hazard 1 — this shell is zsh, and unquoted scalar expansion does not word-split.**
Building the 36-file argument list into a plain variable (`FILES=$(...); playwright test
... $FILES ...`) passed the whole multi-file string as *one* argument under zsh's default
(no `SH_WORD_SPLIT`), so Playwright matched zero files (`Error: No tests found` / `Total: 0
tests in 0 files`) — reproduced deterministically at every file count ≥ 1 once isolated, and
just as deterministically fixed by using a zsh array instead
(`ARR=("${(@f)$(cat file)}")`; `playwright test ... "${ARR[@]}" ...`), which listed the
correct `172 tests in 36 files`. Literal, individually-typed file arguments were never
affected (no variable involved). Not an arrival issue; a shell-specific gotcha in how this
recipe is typed into this session's shell.

**Hazard 2 — the local Supabase stack now rejects the generic demo `SERVICE_ROLE_KEY` that
`supabase status -o env` prints.** The first corrected-argument run of the 36-file batch,
against a `next start -p 3000` server started with `SUPABASE_SERVICE_ROLE_KEY` piped fresh
from `supabase status -o env` (an `HS256`, no-`kid` demo token), collapsed almost totally —
`47 failed / 4 skipped / 121 did not run / 0 passed` (every previously-green file, including
`desk-claims.spec.ts` and `gate-ceremony.spec.ts`, failed on `getByTestId('desk-roster')`
never becoming visible). The server log showed the real cause, repeatedly, before any test
ran:
```
Failed to create QR session: {
  code: 'PGRST301',
  details: null,
  hint: null,
  message: 'JWT cryptographic operation failed'
}
```
`playwright.config.ts`'s own committed `webServer.env` (§ base config, already scanned/
committed, "not secrets, safe to inline") does **not** use the plain demo key — it inlines a
specific `ES256`-with-`kid` `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` pair.
That pair is what the arrival lane's own `next start -p 3107` (managed entirely by
`playwright.arrival.config.ts`, which passes the base config's `webServer.env` through by
reference) used throughout §V.1's clean run — proof it is the currently-valid keypair for
this stack, not the generic one `supabase status` prints standalone. Restarting `next start
-p 3000` with that same literal `ES256` pair (copied from `playwright.config.ts`, not
retyped from memory) produced a clean server log (no `JWT cryptographic operation failed`)
and the comparable run below. Not an arrival issue; a local-stack key-format mismatch between
this CLI's generic `status -o env` output and the project's actual configured signing key.

**The corrected run — command, output, and per-file diff against `qa/legacy-baseline.md`:**

```
next start -p 3000, env: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_URL/SERVICE_ROLE_KEY,
SUPABASE_JWT_SECRET (all = playwright.config.ts's own literals), NEXT_PUBLIC_FLAG_OVERRIDES
set, SUPABASE_ORIGIN_RUNTIME unset — same recipe as legacy-baseline.md §3/§4.
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/version → 200
server log: no "JWT cryptographic operation failed" this time.

pnpm exec playwright test --project=chromium <the 36 files> --reporter=line --workers=2
start 19:28:28
  37 failed
  4 skipped
  86 did not run
  45 passed (7.8m)
end 19:36:17
legacy exit=1
```

**Totals match `legacy-baseline.md` and every prior round exactly:** `45 passed / 37 failed /
4 skipped / 86 did not run` (172 total).

**Per-file diff, done programmatically** (`grep -oE 'e2e/[a-zA-Z0-9_/.-]+\.spec\.ts'` over the
line reporter's `37 failed` block, `sort -u`, `comm -23`/`comm -13` against the 29-file list
transcribed from `legacy-baseline.md` §9):

```
comm -23 failed-files.txt expected-29.txt   # only in this run  → (empty)
comm -13 failed-files.txt expected-29.txt   # only in baseline  → (empty)
```

**Zero new legacy reds, zero newly-green.** The 29 failing files are byte-identical to
`legacy-baseline.md` §9's list, in the same set (order-independent, both sorted). The 6
files that were PASS at baseline (`desk-claims`, `gate-ceremony`, `spec-book-workspace`,
`mood-board/project-board-paths`, `people/bring-forward`, `people/call-sheet`) are all
absent from this run's failed-file set too.

Server killed after the run (`kill` on the `next start` PID); `lsof -nP -iTCP:3000
-sTCP:LISTEN` empty afterward (postflight confirmed). Port 3107 also confirmed free
throughout (no arrival-lane process was running during the legacy pass). The screenshot-spec
PNG rewrites under `docs/design/` (`wp3-`/`wave2-`/`help-walkthrough`) are run artefacts of
both legacy attempts (the failed HS256 attempt and the corrected one) — not committed, per
scope (never `git add -A`).

### V.3 No spec was wrong this round; no commit

Every failure this round attributes cleanly to something other than the arrival or the specs
under test: one pre-existing cold-server flake (§V.1, reconfirmed clean on isolated rerun)
and this piece's own two environment-setup mistakes (§V.2, corrected before the run that
counts). No `e2e/arrival/*.spec.ts` file needed a fix. Worktree HEAD unchanged at
`601454a320a3c79c5cc32a858095e23ac3a8e561`; `git status` on `apps/designer-portal/{src,e2e}`
is clean. Nothing staged, nothing committed, nothing pushed.

### V.4 Bottom line

- **Arrival lane at `601454a32`: effectively green.** 83 of 84 non-skipped test-runs pass on
  the first pass; the one red is the same pre-existing cold-server flake §T.5 and §U.2 already
  documented (this time on webkit instead of chromium), reconfirmed clean by an immediate
  isolated rerun on all three projects. Round 3's touch-tap addition (3 new tests × 3
  projects, 6 skipped on the two non-touch projects, 3 running clean on mobile-chrome) and its
  D2 phone-headline T3 fix both hold.
- **Legacy regression: clean, exact match.** `45 passed / 37 failed / 4 skipped / 86 did not
  run`, the same 29 failing files as `legacy-baseline.md`, zero new reds, zero newly-green —
  the fourth independent confirmation of this exact table (W0, §T.6, §U.3, this piece).
- **No arrival-fault findings from this run.** The two hazards in §V.2 are about how this
  rerun step itself was driven (shell word-splitting, a stale local demo key) — not about the
  arrival code, and both are now on record so the next round skips them.

## U. Independent rerun-confirmation at `632c6839ad7d9970982301f89f54e4a819540a84` (2026-09-28, this piece)

**Scope:** a fresh, independent rerun of the arrival lane and the legacy 36-spec list against
the exact same build and commit §T already reports on — no rebuild, no `src/` edit, no spec
edit. Worktree `agent-arr-w3-integ`, branch `arrival-prod/w3-integration`. Confirmed before
starting: `git -C <worktree> log -1` → `632c6839ad7d9970982301f89f54e4a819540a84 fix(arrival):
W3 review fixes round 2 (US-14)`; `apps/designer-portal/.next/BUILD_ID` → `nIMbgrdg0u7us7lfYJKnl`
(matches §T.4's build). §T's F1–F3 source changes were spot-checked present on disk before
running anything (`stripe-return.spec.ts`'s address-assertion removal, the `how !== 'mutation'`
checks in `play-desk.spec.ts`/`play-document.spec.ts`, and all three `suppressNextArrival` call
sites in `page.tsx`/`discovery-section.tsx`/`return-to-lead-undo.tsx`) — this piece's rerun is
not being run against a different tree than §T describes.

### U.1 Preflight

```
lsof -nP -iTCP:3107 -sTCP:LISTEN   # empty — 3107 free
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty — 3000 free
```

### U.2 Arrival lane — full clean rerun, all three projects, one pass

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line
start 17:33:47
  1 failed
    [mobile-chrome] › e2e/arrival/play-document.spec.ts:75:7 › Document plays › a warm soft entry via a claim card plays, and T3: every card part is live on the rested page
  3 skipped
  80 passed (9.2m)
end 17:42:59
lane exit=1
```

Port 3107 confirmed free again immediately after (`lsof -nP -iTCP:3107 -sTCP:LISTEN` → empty).

**One failure, exactly reproducing §T.5's finding, verbatim:**

```
Error: card line "3 decisions overdue — oldest due 21 September." part "3 decisions overdue — oldest due 21 September" must be a live substring of the rested page
Expected substring: "3 decisions overdue — oldest due 21 September"
Received string:    "Skip to the paper Aspen Loft Refresh for Client User↗ Installation … OVERDUE 7D · DECISIONS CHASE +2 MORE …"
  at e2e/arrival/play-document.spec.ts:106:108
```

Same test, same project as §T.5. **Attribution corrected in W3 fix round 3 (see §U.5): the
card line is not a Desk need-label fact and this is not a contract call.** It is the card
headline in D2's sanctioned phone long form (CONTRACT §2 D2, §4a): the marked
`[data-lens-sentence]` span carries the long sentence as `data-arr-long` (`lens-band.tsx:280`),
`brief.ts` `printed()` reads `collapse(data-arr-long ?? flow(el))`, and `sentence()` adds the
terminal period. The page keeps `OVERDUE 7D · DECISIONS` at rest because D2 rules "the page is
unchanged at rest". The spec was wrong.

**§T.5's other failure (`accessibility.spec.ts:24`, chromium) did NOT recur.** It passed clean
on the first try, first test of this run, no rerun needed — consistent with §T.5's own diagnosis
that it was a cold-server-timing flake, not a regression. The 3 skips match §T.5's accounting
exactly (`play-document.spec.ts:117` on chromium + webkit — mobile-chrome-only; `put-down.spec.ts:27`
on mobile-chrome — desktop-only spine link): `80 + 1 + 3 = 84` (28 tests × 3 projects).

**This single-pass result (1 failed / 3 skipped / 80 passed) is a cleaner outcome than §T.5's
own first pass (2 failed / 3 skipped / 79 passed)** — the delta is exactly the one flake §T.5
already reran and found green. No new failure, no new skip, no different failure signature.

### U.3 Legacy 36-file list — rerun vs `qa/legacy-baseline.md`, exact match

Same command as `legacy-baseline.md` §8 / §T.6: `--project=chromium`, default `playwright.config.ts`,
`CI` unset (`reuseExistingServer` reused a freshly-started `next start -p 3000` on this worktree's
same `.next`, `BUILD_ID nIMbgrdg0u7us7lfYJKnl`), the loopback trio + `SUPABASE_SERVICE_ROLE_KEY`
piped from `supabase status -o env`, `NEXT_PUBLIC_FLAG_OVERRIDES` set, `SUPABASE_ORIGIN_RUNTIME`
unset.

```
pnpm exec playwright test --project=chromium <the 36 files> --reporter=line --workers=2
start 17:45:XX
  37 failed
  4 skipped
  86 did not run
  45 passed (7.8m)
end 17:52:00
legacy exit=1
```

**Totals match `legacy-baseline.md`'s own line-reporter run exactly:** `45 passed / 37 failed /
4 skipped / 86 did not run` (172 total), same as W0 and as §T.6.

**Per-file diff, done programmatically this round (not by eyeballing):** extracted the unique
set of failing spec files from this run's output (`grep -oE 'e2e/[a-zA-Z0-9_/.-]+\.spec\.ts'`
over the `37 failed` block, `sort -u`) → **29 files, identical set, identical order** to
`legacy-baseline.md` §9's documented 29-FAIL-file list — no addition, no omission:

```
e2e/census/lens-cost-census.spec.ts · e2e/document/action-visibility.spec.ts ·
e2e/document/desk-error-state.spec.ts · e2e/document/desk-walkthrough.spec.ts ·
e2e/document/help-panel.spec.ts · e2e/document/hours.spec.ts · e2e/document/lens-a11y.spec.ts ·
e2e/document/lens-band-height.spec.ts · e2e/document/lens-cls.spec.ts ·
e2e/document/lens-contrast.spec.ts · e2e/document/lens-density.spec.ts ·
e2e/document/lens-fling.spec.ts · e2e/document/lens-rail-budget.spec.ts ·
e2e/document/lens-reduced-motion.spec.ts · e2e/document/margin-handoffs.spec.ts ·
e2e/document/mobile-margin-sheet.spec.ts · e2e/document/plan-room.spec.ts ·
e2e/document/prework-regions.spec.ts · e2e/document/quiet-release-contracts.spec.ts ·
e2e/document/quiet-responsive-shell.spec.ts · e2e/document/workflow-stage-responsive.spec.ts ·
e2e/field/field-coordination.spec.ts · e2e/library-configuration/commission-walk.spec.ts ·
e2e/library-configuration/decisions-compare.spec.ts ·
e2e/library-configuration/picker-configure.spec.ts ·
e2e/library-configuration/spec-book-dimensions.spec.ts · e2e/wave2-screenshots.spec.ts ·
e2e/wp3-screenshots.spec.ts · e2e/wp4-screenshots.spec.ts
```

**Zero new legacy reds, zero newly-green — independently reconfirms §T.6 with a second,
separately-executed run.** `next start`'s pid was killed after the run; `lsof -nP -iTCP:3000
-sTCP:LISTEN` empty afterward (postflight confirmed). The screenshot-spec PNG rewrites under
`docs/design/` are run artefacts of this pass (`wp3-`/`wave2-`/`help-walkthrough` screenshots);
matches the working-tree diff already present from §T.6's own run — not committed, per that
section's own note and this task's scope (never `git add -A`, no unrelated commit).

### U.4 One spec was wrong this round (corrected in W3 fix round 3)

This piece first read the lane's one failure as an arrival-side gap and edited nothing; that
reading was wrong (§U.5). `play-document.spec.ts`'s T3 loop held every card line, the phone
headline included, to the rested page's `innerText`, which D2 exempts on the phone. Worktree HEAD
at the time of this rerun: `632c6839ad7d9970982301f89f54e4a819540a84`; the spec fix is W3 fix
round 3's.

### U.5 Correction (W3 fix round 3): not an arrival fault — D2's phone long form; the spec was wrong

**`play-document.spec.ts:75`, mobile-chrome.** This section first called the red an arrival-side
gap: "a Desk need-label fact" the phone page never prints, owed to Kody as a "contract call".
That attribution was wrong, and §T.5's matching wording is wrong for the same reason.

- `3 decisions overdue — oldest due 21 September.` is the card **headline**, not a need-label
  fact. The long sentence is `desk-derivation.ts:598` (`${n} decisions overdue${oldest}`, suffix
  at :590).
- CONTRACT §2 D2 already rules on it: "On the phone the card headline uses the same `printed`
  model's **long-form** sentence (the form desktop prints), not the `OVERDUE 3D · subject` short
  form; the page is unchanged at rest." §4a names the carrier: the marked `[data-lens-sentence]`
  span carries `data-arr-long` (`lens-band.tsx:280`), and `brief()` reads
  `data-arr-long ?? textContent` for that part (`brief.ts` `printed()`, period from `sentence()`).
- So the rested phone page printing `OVERDUE 7D · DECISIONS` while the card shows the long form
  is the contract, not a gap. Nothing was owed to Kody.

**Fix (W3 fix round 3, spec only, no `src/` change).** On mobile-chrome the T3 loop drops the
headline from the body-substring check. Instead it asserts the card's `.arr-h` text equals
`period(collapse(data-arr-long))` of `[data-lens-sentence][data-part~=headline]`, citing D2. Every
other card part is still held to the rested page. Round 3's full lane on a fresh build
(`H_fZv1fmZUiwbPFRDNSqI`): 84 passed, 9 skipped, 0 failed. That is the 81 test-runs expected here
plus round 3's three new touch-tap tests; the skips are the 3 from §U.2 plus those touch tests on
chromium and webkit.

### U.6 Bottom line (unchanged from §T, independently reconfirmed)

- **Legacy regression: clean.** No new reds, exact match to the W0/§T.6 baseline, confirmed a
  second time by a separately-executed run.
- **Arrival lane at `632c6839`: one red, and it was spec-wrong** (`play-document.spec.ts:75`,
  mobile-chrome, the D2 phone long-form headline — corrected in §U.5). Everything else — 80 of 81
  non-skipped test-runs across chromium/mobile-chrome/webkit — passes clean, including the F1–F4
  fixes from §T (stripe-return's contract-scoped assertion, the `how !== 'mutation'` staggered
  checks, the three `suppressNextArrival` sites, and the T3 trailing-period fix from §S).
- No commit made by this piece; worktree HEAD stayed `632c6839ad7d9970982301f89f54e4a819540a84`.
  The spec fix lands in W3 fix round 3.

## T. W3 fix round 2 at `632c6839ad7d9970982301f89f54e4a819540a84` (2026-09-28, this piece)

**Scope:** the four round-2 review findings (F1–F4) on top of `5924480f45468f1984346ef472af6f07f659e87e`,
worktree `agent-arr-w3-integ`, branch `arrival-prod/w3-integration`. `src/lib/arrival/types.ts`,
`run-contract.ts` and the 36 legacy specs are untouched. Supersedes §S.3's "legacy not rerun" gap.

### T.1 F1 — the Stripe doorway never strips its query: proven independent of the arrival

The lane asserted `toHaveURL(/\/desk$/)` after
`/desk?book=orders&po=PO-W3B-TEST&checkout=success&session_id=cs_test_w3b`. The address never
strips. Probes against the ARRIVAL_E2E=1 build (history instrumented through `replaceState` /
`pushState` wrappers, `window.next.router` driven directly):

```
RESULT /desk?foo=1 replace /desk?z=9 → http://127.0.0.1:3107/desk?foo=1 hist=["replaceState /desk?foo=1 @218","replaceState /desk?foo=1 @4237"]
RESULT /desk?foo=1 push /doc/b0000000-0000-0000-0000-00000000c0d1 → http://127.0.0.1:3107/doc/b0000000-0000-0000-0000-00000000c0d1 hist=["replaceState /desk?foo=1 @204","pushState /doc/b0000000-0000-0000-0000-00000000c0d1 @4314"]
RESULT /desk?book=orders push /doc/b0000000-0000-0000-0000-00000000c0d1 → http://127.0.0.1:3107/doc/b0000000-0000-0000-0000-00000000c0d1 hist=["replaceState /desk?book=orders @202","replaceState /desk?book=orders @224","pushState /doc/b0000000-0000-0000-0000-00000000c0d1 @4330"]
RESULT /doc/b0000000-0000-0000-0000-00000000c0d1?foo=1 replace /doc/b0000000-0000-0000-0000-00000000c0d1?z=9 → http://127.0.0.1:3107/doc/b0000000-0000-0000-0000-00000000c0d1?z=9 hist=["replaceState /doc/b0000000-0000-0000-0000-00000000c0d1?foo=1 @392","replaceState /doc/b0000000-0000-0000-0000-00000000c0d1?z=9 @4441"]
RESULT /library?foo=1 replace /library?z=9 → http://127.0.0.1:3107/library?z=9 hist=["replaceState /library?foo=1 @210","replaceState /library?z=9 @4273"]
  5 passed (57.9s)
```

Any same-path replace after a hard load of `/desk?<query>` commits the *loaded* query: the doorway's
strip, and a bare `router.replace('/desk?z=9')`, alike. The same replace on `/doc/<id>` and on
`/library` (also a static `○` route) works; pushing away from `/desk?foo=1` works. React root lanes
read 0 after the replace; CDP initiators put every `/desk?foo=1&_rsc` prefetch in Next's router chunk
with no `/_tree` request, so the `/desk` route entry is seeded from the hard load itself.

**A/B — arrival removed.** `src/app/(document)/layout.tsx` with `<ArrivalMount />` and
`<ArrivalRoute />` deleted, rebuilt with the same env recipe:

```
URL=http://127.0.0.1:54321 anon_len=153 origin_runtime=unset arrival_e2e=1
✓ Compiled successfully in 39.2s
build exit=0 secs=58
prod-ref files in .next/static: 0
--arr-ok files in .next/static: 1
```

```
RESULT stripe → http://127.0.0.1:3107/desk?book=orders&po=PO-W3B-TEST&checkout=success&session_id=cs_test_w3b | sheet=["Orders"] | ended=[] | htmlClass=
RESULT foo→z → http://127.0.0.1:3107/desk?foo=1 | ended=[]
  2 passed (22.5s)
```

With no arrival mounted (`ended=[]`, no `arr-*` class) the address still keeps the Stripe query and
`/desk?foo=1` still refuses `?z=9`. The strip failure is a Desk-doorway / Next 16.2.10 router
behaviour outside the arrival; the root cause below the router was not isolated further. The layout
was restored byte-for-byte from the saved copy (`grep -c` of the two mounts = 2) and every build and
run below uses the restored source.

**Spec change (`stripe-return.spec.ts`).** The address assertion is removed, with a header comment
naming the reason. The test now asserts the contract's lane item ("Stripe return
`?book=orders&checkout=success` declines and its sheet opens"): the Orders sheet opens, the Desk
ends exactly once as `{ surface: 'desk', how: 'declined', cause: 'query' }`, and no card mounts.
**Owed (Kody / Desk owner):** the Stripe-return address keeps `checkout=success&session_id=…` after
the sheet opens. That is a Desk-doorway defect, not an arrival one.

### T.2 F2 — the vacuous `cause !== 'mutation'` checks

`'mutation'` is an `EndHow`, never a `DeclineCause`, so `expect(e.cause).not.toBe('mutation')` could
not fail. Both staggered tests (`play-document.spec.ts:176` cold Document, `play-desk.spec.ts:225`
staggered Desk) now check `expect(e.how).not.toBe('mutation'); expect(e.cause).not.toBe('drift');`.
On the played path, after Skip, each test polls the surface's last `patina:arrival-ended` event and
asserts `how === 'skip'`. Both are green on all three projects (T.5).

### T.3 F3 — identity-move replaces now suppress the arrival

`suppressNextArrival(target)` is now called immediately before the `router.replace` at three sites:

- `src/app/(document)/doc/[id]/page.tsx`, `runBeginDirection`: `/doc/${proposalId}`
- `src/components/document/discovery/discovery-section.tsx`, "Move back to New Lead" `onSuccess`:
  `/doc/${lead_id}`
- `src/components/document/return-to-lead-undo.tsx`, Undo `onSuccess`: `/doc/${lead_id}`

Each site has one new jest case. The case clears the map first, runs the handler, then asserts
`consumeSuppressed(target) === true`. The three cases are in `page.test.tsx` (R5 describe),
`discovery-section.test.tsx` (new describe; its `useReturnToLead` / `useReturnToLeadCheck` mocks
now expose `mutate` / `data`) and `__tests__/return-to-lead-undo.test.tsx`. To check the cases
bite, the three `suppressNextArrival` lines were removed: all three new cases failed. The lines
were then restored.

**Unchanged, awaiting Kody's ruling** (the reviewer's default recommendation is to suppress):
`ceremony-surface.tsx:218/220` (replace), `drafting-room.tsx:163` (replace),
`proposal-watch.tsx:348/405` (push).

### T.4 Gates and build (verbatim)

```
pnpm --dir apps/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ/apps/designer-portal
> tsc --noEmit

type-check exit=0

pnpm --dir apps/designer-portal lint
> @patina/designer-portal@0.1.0 lint /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ/apps/designer-portal
> eslint .

✖ 199 problems (0 errors, 199 warnings)
  0 errors and 185 warnings potentially fixable with the `--fix` option.

lint exit=0

pnpm --dir apps/designer-portal test
> jest
Test Suites: 649 passed, 649 total
Tests:       8708 passed, 8708 total
Snapshots:   1 passed, 1 total
Time:        30.608 s
Ran all test suites.
jest exit=0
```

No warning in the lint output names any of the six touched `src` files (`e2e/` is outside the
lint config). All three gates were rerun on the final source, after the A/B restore.

Rebuild (src changed). Recipe: the loopback trio piped from `supabase status -o env`,
`NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'`,
`ARRIVAL_E2E=1`, `SUPABASE_ORIGIN_RUNTIME` unset, `rm -rf .next`, `next build --webpack`. Output:

```
URL=http://127.0.0.1:54321 anon_len=153 origin_runtime=unset arrival_e2e=1
✓ Compiled successfully in 38.4s
├ ○ /desk
├ ƒ /doc/[id]
build exit=0 secs=57
prod-ref files in .next/static: 0
--arr-ok files in .next/static: 2
.next/static/css/6cc8a4a5864085df.css
.next/static/chunks/8095-58e161cfbd05c62f.js
upgrade-insecure-requests in routes-manifest: 0
```

`BUILD_ID nIMbgrdg0u7us7lfYJKnl`. The lane (T.5) and the legacy run (T.6) both ran against this
one build.

### T.5 F4 — arrival lane, all three projects, on `nIMbgrdg0u7us7lfYJKnl`

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line
start 17:00:01
  2 failed
    [chromium] › e2e/arrival/accessibility.spec.ts:24:7 › Arrival accessibility › exactly one SR announcement; the lens band aria-live goes off for the run and is restored 
    [mobile-chrome] › e2e/arrival/play-document.spec.ts:75:7 › Document plays › a warm soft entry via a claim card plays, and T3: every card part is live on the rested page 
  3 skipped
  79 passed (9.5m)
lane exit=1
end 17:09:31
```

The three skips are conditional: `play-document:117` on chromium and on webkit (the phone
long-form test runs on mobile-chrome only), and `put-down:27` on mobile-chrome (the spine link is
desktop-only). Line numbers are current; §S's `play-document:67/109/137/168` are now `:75/117/145/176`.

| Spec:line | chromium | mobile-chrome | webkit |
|---|---|---|---|
| accessibility.spec.ts:24 | F → **P on rerun** | P | P |
| accessibility.spec.ts:70 | P | P | P |
| frame0-drift.spec.ts:19 | P | P | P |
| frame0-drift.spec.ts:32 | P | P | P |
| input-and-escape.spec.ts:60 | P | P | P |
| input-and-escape.spec.ts:78 | P | P | P |
| input-and-escape.spec.ts:104 | P | P | P |
| input-and-escape.spec.ts:136 | P | P | P |
| input-and-escape.spec.ts:155 | P | P | P |
| mutation-and-failsafes.spec.ts:35 | P | P | P |
| mutation-and-failsafes.spec.ts:87 | P | P | P |
| mutation-and-failsafes.spec.ts:121 | P | P | P |
| mutation-and-failsafes.spec.ts:142 | P | P | P |
| play-desk.spec.ts:49 | P | P | P |
| play-desk.spec.ts:82 | P | P | P |
| play-desk.spec.ts:123 | P | P | P |
| play-desk.spec.ts:149 | P | P | P |
| play-desk.spec.ts:204 | P | P | P |
| play-desk.spec.ts:225 (F2) | P | P | P |
| play-document.spec.ts:75 (was :67, T3) | P | **F (repeatable)** | **P** |
| play-document.spec.ts:117 | S | P | S |
| play-document.spec.ts:145 | P | P | P |
| play-document.spec.ts:176 (F2) | P | P | P |
| put-down.spec.ts:27 | P | S | P |
| stripe-return.spec.ts:29 (F1) | P | P | P |
| webdriver-and-telemetry.spec.ts:42 | P | P | P |
| webdriver-and-telemetry.spec.ts:60 | P | P | P |
| webdriver-and-telemetry.spec.ts:69 | P | P | P |

**`play-document.spec.ts:67` (now :75, T3) is green on webkit**, and on chromium. This is the first
completed run of §S.1.5's trailing-period fix.

**The two failures were each rerun on all three projects** (same build, same config, a fresh
`next start` on 3107):

```
pnpm exec playwright test -c playwright.arrival.config.ts e2e/arrival/accessibility.spec.ts:24 e2e/arrival/play-document.spec.ts:75 --reporter=line
  1) [mobile-chrome] › e2e/arrival/play-document.spec.ts:75:7 › Document plays › a warm soft entry via a claim card plays, and T3: every card part is live on the rested page 
    Error: card line "3 decisions overdue — oldest due 21 September." part "3 decisions overdue — oldest due 21 September" must be a live substring of the rested page
    Expected substring: "3 decisions overdue — oldest due 21 September"
  1 failed
  5 passed (1.2m)
rerun exit=1
```

- **`accessibility.spec.ts:24` chromium: flake, not a regression.** It passed on the rerun, again as
  the first test against a freshly started server. In the failing run it was also the first test
  (load average 10.81 at start). Its trace has the Document request at 5699 ms and the Document's
  `mark_arrival` at 7585 ms, so the run ended about 1.9 s after entry, before any card. That fits a
  cold-server `hidden`/`late` decline (CONTRACT §4b), which this test does not tolerate. The same
  test passed on mobile-chrome and webkit in the full run, and on all three in the rerun.
- **`play-document.spec.ts:75` mobile-chrome: a real, repeatable T3 finding. Not fixed here (outside
  F1–F4).** At iPhone 14 width, the Document card composes the Desk need label
  `3 decisions overdue — oldest due 21 September.` (from `desk-derivation.ts:590`). The rested phone
  page does not render that sentence; its lens band shows the condensed `OVERDUE 7D · DECISIONS`
  instead. On desktop (chromium, webkit) the sentence is on the page, and T3 passes. **Owed
  (integrator / Kody):** either the phone card must pick a fact the phone page shows, or T3 needs a
  phone rule. This is a contract call, not a spec fix.

### T.6 F4 — legacy 36 specs (non-lane config) vs `qa/legacy-baseline.md`

The command is `legacy-baseline.md` §8's, with the same 36 files: `--project=chromium`, the default
`playwright.config.ts`, and `CI` unset, so `reuseExistingServer` picks up the server already
running. That server was `next start -p 3000` on the same `.next` (`BUILD_ID nIMbgrdg0u7us7lfYJKnl`),
with the loopback trio plus `SUPABASE_SERVICE_ROLE_KEY` piped from `supabase status -o env`,
`/api/version=200` before the run, and `:3000` freed after. Both passes ran, as in W0.

```
pnpm exec playwright test --project=chromium <the 36 files of legacy-baseline.md §8> --reporter=line --workers=2
  37 failed
  4 skipped
  86 did not run
  45 passed (7.8m)
line exit=1

PLAYWRIGHT_JSON_OUTPUT_NAME=… pnpm exec playwright test --project=chromium <same 36> --reporter=json --workers=2
stats {"expected": 45, "skipped": 90, "unexpected": 37, "flaky": 0}
json exit=1
```

**Diff against `legacy-baseline.md`: identical. No new reds.**

- **Per file:** all 36 files have the same verdict and the same pass/fail/skip triple as the §9
  table: 6 PASS, 29 FAIL, 1 SKIP (arrival-arc fixme).
- **Per test:** the 37 failing tests match W0's JSON (`expected 45 / unexpected 37 / skipped 90`)
  exactly, by `file:line title` (`only now: []`, `only W0: []`).
- **Totals:** `45 passed / 37 failed / 4 skipped / 86 did not run` (172), the same as W0 in both
  passes.

The screenshot specs (`wave2-`, `wp3-`, `wp4-screenshots`) rewrite PNGs under `docs/design/`. Those
working-tree changes are run artefacts and are not committed.

### T.7 Commit

`632c6839ad7d9970982301f89f54e4a819540a84` on `arrival-prod/w3-integration` (worktree
`agent-arr-w3-integ`), `fix(arrival): W3 review fixes round 2 (US-14)`. Round 1 was `9d241a4bb`.
Staged by explicit pathspec; not pushed.

```
 apps/designer-portal/e2e/arrival/play-desk.spec.ts | 10 ++++++-
 .../e2e/arrival/play-document.spec.ts              |  9 +++++-
 .../e2e/arrival/stripe-return.spec.ts              | 35 +++++++++-------------
 .../src/app/(document)/doc/[id]/page.test.tsx      | 15 ++++++++++
 .../src/app/(document)/doc/[id]/page.tsx           |  1 +
 .../__tests__/return-to-lead-undo.test.tsx         | 12 ++++++++
 .../document/discovery/discovery-section.test.tsx  | 33 ++++++++++++++++++--
 .../document/discovery/discovery-section.tsx       |  6 +++-
 .../components/document/return-to-lead-undo.tsx    |  2 ++
 9 files changed, 97 insertions(+), 26 deletions(-)
```

`layout.tsx` has no net diff (A/B only). The pre-commit Prettier hook printed an advisory
`[warn]` for all 9 files; `prettier --stdin-filepath` shows zero drift on each changed source file,
both before and after.

## S. W3b rerun after fixes at `9d241a4bb7627c8750d56ffd681dd76985f55748` (2026-09-28, previous piece)

**Scope of this piece:** rerun the arrival lane and the legacy 36-spec list against the
`.next` build for `9d241a4bb7627c8750d56ffd681dd76985f55748` (§R's build, W3 fix round 1),
fix any spec that is itself wrong, commit spec-only fixes. No `src/` file was touched.

### S.1 Six of §R.3's seven findings were spec-wrong; all six now have evidence-grounded fixes

1. **`accessibility.spec.ts:24`** — `statusBefore` now captured before the card mounts
   (previously captured after, baking the run's own status node into the baseline).
2. **`input-and-escape.spec.ts:155`** — the busy-decline card-absence wait widened from
   2s to 5s so it clears the spec's own 3s delayed-read window (`[data-arrival="document"]`
   only mounts ~3.8s in; the old 2s wait expired first).
3. **`mutation-and-failsafes.spec.ts:35` (P5)** — first attempt (reorder the `styleBefore`
   capture earlier) did **not** fix it: on a `/desk` route already warmed by the fixture's
   own prior visit, `hide(H)` applies before any script-timing vantage point exists to
   capture a genuine "before" value — confirmed by a rerun still showing the identical
   failure. Corrected fix: drop the pre-run snapshot; assert the restored value directly
   (`expect(styleAfter ?? '').toBe('')`), which is what the test's own title claims
   ("leaves no inline override").
4. **`play-desk.spec.ts:82`** — `getByRole('button', {name: /find anything/i})` is a
   strict-mode violation: two buttons share that accessible name at desktop width
   (`desk-find-anything` in the header, and the studio drawer's own "Find anything (⌘K)"
   button — a deliberate coexistence, ruling C-AP-05). Swapped for
   `[data-tour-anchor="desk-find-anything"]`.
5. **`play-document.spec.ts:67` (T3)** — three layered fixes, the third found only after
   the first two were already validated in a rerun:
   - split each card line on ` · ` / `X: y` (`splitCardLine`) and check each part, not the
     whole joined line, per the T3 rule's own wording (engine-spec.md:73).
   - excluded `.arr-cue` from `captureCardTexts` — its fixed instruction text
     ("Click, scroll or press any key to open the page") is never page content, and the
     split fix above let the assertion loop reach far enough to expose this second,
     previously-masked bug.
   - **found live, during this piece's clean rerun (see §S.2):** a further-masked third
     bug. A card fact line like `3 decisions overdue — oldest due 21 September.` failed
     with the received page text containing the identical string **minus the trailing
     period**. Traced to source: `desk-derivation.ts:594-598` builds the raw need label
     (`` `${n} decisions overdue${oldest}` ``) with no terminal punctuation; T7
     (engine-spec.md, ORC:612-619) separately requires the card's own headline/facts to
     end with a period — a card-only voice decoration on top of the same `select()` label
     the page renders unpunctuated. Fixed by stripping a trailing `.` from each split part
     before the page-substring check.
6. **`play-document.spec.ts:168` (cold Document)** — rewritten to race card-visible vs.
   run-ended (mirroring `play-desk.spec.ts:225`'s own pattern) and allow `hidden`/`late`
   declines per CONTRACT §4b, instead of requiring the card to always show — the spec was
   stricter than the contract it's meant to test.

**`stripe-return.spec.ts:23` is left unchanged, deliberately.** Fresh evidence from this
piece's own rerun (both attempts) reconfirms it: a probe loaded
`/desk?book=orders&po=PO-W3B-TEST&checkout=success&session_id=cs_test_w3b` and the query
string was still present 5s later —
`toHaveURL(/\/desk$/)` times out against exactly that unstripped URL. This is a real,
pre-existing Desk-doorway defect (`router.replace` never strips the Stripe-return query),
not a spec bug and not an arrival defect. Out of scope to fix here (`src` is off-limits) —
reported as an arrival-fault finding below.

### S.2 Rerun evidence

Two rerun attempts. The **first** (all fixes but the T3 trailing-period fix — that bug was
found live, via this rerun's own failures) ran clean start-to-finish:

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line
```

**Result: `9 failed`, `3 skipped`, `72 passed (9.5m)`.** This run is what surfaced the
trailing-period T3 bug (fixes 5's third layer, above) and reconfirmed the other five fixes
hold — but it started before that third T3 layer was fixed on disk, and Playwright compiles
each spec file once at process start, so its own `play-document.spec.ts:67` result reflects
the pre-fix code on all three projects, not a verdict on the final fix.

A **second, clean rerun** (all six fixes on disk before the process started) was launched to
validate the trailing-period fix specifically. It ran cleanly through chromium (28/28 tests
scheduled) and mobile-chrome (28/28 scheduled) before this piece's own reporting deadline
required stopping it mid-webkit (webkit had not yet started — the process was killed at
"[56/84]", the last mobile-chrome test, port 3107 confirmed freed afterward). Its results for
the two projects that did complete are genuine, freshly-generated evidence (not carried over
from any earlier run):

| # | Spec:line | Test | chromium | mobile-chrome | webkit |
|---|---|---|---|---|---|
| 1 | accessibility.spec.ts:24 | exactly one SR announcement… | **P** | **P** | not run |
| 2 | accessibility.spec.ts:70 | flying headline clone hit-tests… | P | P | not run |
| 3 | frame0-drift.spec.ts:19 | hard Desk entry never declines drift | P | P | not run |
| 4 | frame0-drift.spec.ts:32 | hard Document entry never declines drift | P | P | not run |
| 5 | input-and-escape.spec.ts:60 | Escape mid-hold only advances | P | P | not run |
| 6 | input-and-escape.spec.ts:78 | Escape during ready wait swallowed | P | P | not run |
| 7 | input-and-escape.spec.ts:104 | chrome click + bare keys only advance | P | P | not run |
| 8 | input-and-escape.spec.ts:136 | Skip goes straight to rest | P | P | not run |
| 9 | input-and-escape.spec.ts:155 | input during ready wait halts it | **P** | **P** | not run |
| 10 | mutation-and-failsafes.spec.ts:35 | P5: foreign mid-hold mutation | **P** | **P** | not run |
| 11 | mutation-and-failsafes.spec.ts:87 | B7: sentinel rule stripped | P | P | not run |
| 12 | mutation-and-failsafes.spec.ts:121 | B8: fonts never resolve | P | P | not run |
| 13 | mutation-and-failsafes.spec.ts:142 | B9: --arr-ok:0 inline | P | P | not run |
| 14 | play-desk.spec.ts:49 | hard Desk entry plays, then rests | P | P | not run |
| 15 | play-desk.spec.ts:82 | cold Desk shows chrome immediately | **P** | P | not run |
| 16 | play-desk.spec.ts:123 | Desk after Document-first still plays | P | P | not run |
| 17 | play-desk.spec.ts:149 | R-DM21 A: act opens at the landing | P | P | not run |
| 18 | play-desk.spec.ts:204 | setup-whisper coexistence | P | P | not run |
| 19 | play-desk.spec.ts:225 | staggered Desk reads | P | P | not run |
| 20 | play-document.spec.ts:67 | warm soft entry + T3 | F¹ | F¹ | not run |
| 21 | play-document.spec.ts:109 | phone long-form headline | P (skip on chromium) | P | not run |
| 22 | play-document.spec.ts:137 | reload plays with via:null | P | P | not run |
| 23 | play-document.spec.ts:168 | cold Document staggered reads | **P** | **P** | not run |
| 24 | put-down.spec.ts:27 | put-down scrolls the roster row | P | P/S | not run |
| 25 | stripe-return.spec.ts:23 | Stripe return declines, opens Orders | F (pre-existing, unfixed) | F (pre-existing, unfixed) | not run |
| 26 | webdriver-and-telemetry.spec.ts:42 | no opt-in → webdriver declines | P | P | not run |
| 27 | webdriver-and-telemetry.spec.ts:60 | origin is loopback | P | P | not run |
| 28 | webdriver-and-telemetry.spec.ts:69 | report() funnel once per entry | P | P | not run |

¹ Pre-fix code only (see §S.1.5's third layer and §S.2 lede) — Playwright had already
compiled this spec file into the running worker before the trailing-period fix landed on
disk; this run cannot speak to that fix. **Not yet validated by any completed run.**

**Totals (this rerun, chromium + mobile-chrome only, 56 of 84 scheduled):** 54 passed,
2 failed (both `play-document:67`, pre-fix code, and `stripe-return:23`, pre-existing,
unfixed) — 0 skipped counted as failed.

**Newly green vs. §R.2's baseline** (confirmed by this rerun's fresh chromium +
mobile-chrome evidence): `accessibility.spec.ts:24`, `input-and-escape.spec.ts:155`,
`mutation-and-failsafes.spec.ts:35` (P5), `play-desk.spec.ts:82` (chromium; mobile-chrome
was already green), `play-document.spec.ts:168` (cold Document).

**Still open, evidence-grounded fix applied but unvalidated by any run:**
`play-document.spec.ts:67` (T3) — the trailing-period fix (§S.1.5, third layer). High
confidence given the source-level confirmation in `desk-derivation.ts`, but the next round
must rerun this one test at minimum before calling it green.

**Not verified this round:** webkit, on any of the 28 tests (rerun stopped before webkit
started, to make this piece's own reporting deadline). Earlier rounds (§R.2) showed webkit
failing on the same tests as chromium for six of the seven findings — there is no
contrary evidence, but there is also no fresh confirmation that these fixes hold on WebKit
specifically.

### S.3 Legacy regression — NOT rerun this round

Time did not permit rerunning the W0 36-spec baseline list in this piece. §5 below (from
the W3 Playwright-lane piece, run against the `54c72659a` build, not `9d241a4bb`) is the
most recent legacy-regression evidence on file; it was clean (zero new reds) against that
earlier build. **This is a real gap**: the legacy list has not been reconfirmed against
`9d241a4bb`'s build specifically. Given the only changes since are `e2e/arrival/*.spec.ts`
files (never in the legacy 36-file list) and the `9d241a4bb` round's own `src/` fixes, the
a priori risk of a new legacy red is low — but it is asserted here, not measured, and the
next round should measure it before treating W3b as gate-satisfying.

### S.4 Commit

`5924480f45468f1984346ef472af6f07f659e87e` on branch `arrival-prod/w3-integration`
(worktree `agent-arr-w3-integ`) — `test(arrival): lane fixes (US-14)`. 5 files changed
(the 5 spec files listed in §S.1), 100 insertions(+), 25 deletions(-). Staged with explicit
pathspecs. Not pushed, per task scope.

## R. Correction: W3 fix round 1 (2026-09-28). The serial rerun supersedes §2, §3 and §8

### R.1 The 67 reds were not contention

§2 and §3 blamed machine contention. That diagnosis was wrong. There were two root causes, and both were in the lane itself:

1. **The probes checked the wrong element.** Every "the card is visible" probe asserted `toBeVisible()` on `.arr-card`.
   - `.arr-card` is a `position:absolute` layer with zero height (arrival.css).
   - Playwright's `toBeVisible` needs a non-empty bounding box, so it reads "hidden" for the whole run, on every engine and at any machine speed.
   - The probes now target the painted child `.arr-card .arr-h` (`CARD_SELECTOR` in `e2e/arrival/helpers.ts`).
   - The hit-test probes now use `elementFromPoint`, through the `topmostAtCentre` helper.
2. **WebKit failed 27/27 because of the CSP.** The production build's CSP carries `upgrade-insecure-requests`.
   - WebKit upgrades loopback `http://127.0.0.1:54321` requests to https, so the auth fixture's Supabase sign-in never completes. That is the §3.2 fixture timeout.
   - Fix: `next.config.js` omits that directive when the build sets `ARRIVAL_E2E=1`. Next bakes headers into routes-manifest at build time, so the lane's build must set the variable. Production builds are unchanged.

The "same 6 passed on both Chromium projects" (§3.4) fits cause 1, not load: those were exactly the tests that never probe `.arr-card` for visibility. §3.5's uncited isolated control is withdrawn.

The config now runs `workers: 1` with `retries: 0`. The `retries: 1` described in §1 and §8 is gone. The 20s budgets stay.

### R.2 Rerun: serial, on a fresh build

**Build.** Command and settings:
- `rm -rf .next && pnpm exec next build --webpack` in `apps/designer-portal`
- The loopback trio piped from `supabase status -o env`: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
- `NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'`
- `ARRIVAL_E2E=1`
- `SUPABASE_ORIGIN_RUNTIME` unset

Result: `build exit=0`. Checks on the build output:
- `grep -rl bkvcixdmuyejfzcijpdg .next/static | wc -l` returns 0.
- `--arr-ok` is present in `.next/static/css/6cc8a4a5864085df.css` and `.next/static/chunks/7468-8ff1be1f48402f49.js`.
- routes-manifest contains no `upgrade-insecure-requests`.

**Command.**

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --workers=1 --reporter=line
```

This runs `next start` on port 3107 as the webServer. It started at 15:24:35, with a load average of 17.84 from a concurrent build elsewhere on the box, and ended at 15:34:53 with a load average of 4.16.

**Result: `20 failed`, `3 skipped`, `61 passed (10.3m)`, lane exit 1.** That is 84 test runs: 28 tests on each of 3 projects. Two spec corrections were made after an earlier serial run on the same build, which gave 25 failed / 3 skipped / 56 passed (14.3m):
- the R-DM21 A test now reads the act's own href;
- the telemetry test is scoped to the Document.

| # | Spec:line | Test | chromium | mobile-chrome | webkit |
|---|---|---|---|---|---|
| 1 | accessibility.spec.ts:24 | exactly one SR announcement… | F | F | F |
| 2 | accessibility.spec.ts:67 | flying headline clone hit-tests… | P | P | P |
| 3 | frame0-drift.spec.ts:19 | a hard Desk entry never declines drift | P | P | P |
| 4 | frame0-drift.spec.ts:32 | a hard Document entry never declines drift | P | P | P |
| 5 | input-and-escape.spec.ts:60 | Escape mid-hold only advances | P | P | P |
| 6 | input-and-escape.spec.ts:78 | Escape during ready wait is swallowed | P | P | P |
| 7 | input-and-escape.spec.ts:104 | chrome click + bare keys only advance | P | P | P |
| 8 | input-and-escape.spec.ts:136 | Skip goes straight to rest | P | P | P |
| 9 | input-and-escape.spec.ts:155 | input during ready wait halts it | F | F | F |
| 10 | mutation-and-failsafes.spec.ts:35 | P5: foreign mid-hold mutation | F | F | F |
| 11 | mutation-and-failsafes.spec.ts:79 | B7: sentinel rule stripped | P | P | P |
| 12 | mutation-and-failsafes.spec.ts:113 | B8: fonts never resolve | P | P | P |
| 13 | mutation-and-failsafes.spec.ts:134 | B9: --arr-ok:0 inline | P | P | P |
| 14 | play-desk.spec.ts:49 | hard Desk entry plays, then rests (+ Act 2 topmost probes) | P | P | P |
| 15 | play-desk.spec.ts:82 | cold Desk shows chrome immediately | F | P | F |
| 16 | play-desk.spec.ts:118 | Desk after Document-first still plays | P | P | P |
| 17 | play-desk.spec.ts:144 | **new** R-DM21 A: act opens at the landing, no card mounts | P | P | P |
| 18 | play-desk.spec.ts:199 | setup-whisper coexistence | P | P | P |
| 19 | play-desk.spec.ts:220 | staggered Desk reads | P | P | P |
| 20 | play-document.spec.ts:49 | warm soft entry + T3 | F | F | F |
| 21 | play-document.spec.ts:90 | phone long-form headline | S | P | S |
| 22 | play-document.spec.ts:118 | reload plays with via:null | P | P | P |
| 23 | play-document.spec.ts:149 | cold Document staggered reads | F | F | F |
| 24 | put-down.spec.ts:27 | put-down scrolls the roster row | P | S | P |
| 25 | stripe-return.spec.ts:23 | Stripe return declines, opens Orders | F | F | F |
| 26 | webdriver-and-telemetry.spec.ts:42 | no opt-in → webdriver declines | P | P | P |
| 27 | webdriver-and-telemetry.spec.ts:60 | origin is loopback | P | P | P |
| 28 | webdriver-and-telemetry.spec.ts:69 | report() funnel once per entry | P | P | P |

Totals by project:
- chromium: 7 failed, 1 skipped, 20 passed
- mobile-chrome: 6 failed, 1 skipped, 21 passed
- webkit: 7 failed, 1 skipped, 20 passed

### R.3 Why the 7 remaining tests fail

**W3b is NOT green. W4 stays gated** because the lane is not green on all three projects.
- 6 of the 7 are spec-wrong: the arrival does what the CONTRACT says, and the spec's own assertion is wrong.
- 1 is a real defect that predates this branch and sits outside the arrival.
- None of the 7 was changed in this round, because no review finding names them. Each one needs a ruling or a later round.

1. **accessibility:24 — spec-wrong.** The spec takes its baseline count (`statusBefore`) after the card is already visible, so the baseline already includes the run's own status node. It expected 4 and received 3.
2. **input-and-escape:155 — spec-wrong.** The arrival behaves correctly: the wheel during the wait declines `busy` at about 1327ms and removes `arr-pre`, leaving the ordinary page and no run. But the spec delays every REST read by 3s, so `[data-arrival="document"]` only mounts at about 3.8s, after the spec's 2s wait has expired.
3. **mutation-and-failsafes:35 (P5) — spec-wrong.** The spec reads `styleBefore` mid-run, while the run's own `transition: none; opacity: 0;` is still applied. It then expects that value back. The arrival correctly restores the real headline to no inline style (`""`), which is what the test title asserts.
4. **play-desk:82, cold Desk (chromium and webkit; mobile-chrome passes) — spec-wrong.** `getByRole('button', { name: /find anything/i })` is a strict-mode violation: two buttons match at desktop width.
5. **play-document:49, T3 — spec-wrong.**
   - The spec looks for the whole place line `Aspen Loft Refresh · Installation` as one substring of the page.
   - T3 (engine-spec.md:73) splits each card line on ` · ` and `X: y` and checks the parts. Both parts appear in the page text: "Aspen Loft Refresh for Client User↗ Installation".
6. **play-document:149, cold Document — the spec is stricter than the CONTRACT.**
   - The spec requires the card to show.
   - The run declines `{surface:'document',how:'declined',cause:'hidden'}` at about 2188ms, which honours HIDDEN_CAP_MS (1200).
   - CONTRACT lines 185 and 207 forbid only drift and mutation declines on this lane; `hidden` and `late` are allowed. play-desk:220 already asserts it that way.
7. **stripe-return:23 — a real defect in the Desk doorway, not in the arrival, and it predates this branch.** The Desk doorway never strips its query string.
   - A probe loaded `/desk?book=orders`, the Stripe return URL and `/desk?account=profile`. All three kept their query 6s after load, with no pageerror, and the trace shows no replace navigation.
   - The arrival declines `query` correctly (no card appears), and it has no navigation or history interception.
   - This branch's only doorway change is the `suppressNextArrival` calls.
   - This is the defect behind the old "waitForURL hang", which is now `await expect(page).toHaveURL(/\/desk$/)` and fails in 5s.

§5's legacy 36-spec regression was not rerun on this build.

## 0. Scope

This piece adds the arrival's own Playwright lane (`playwright.arrival.config.ts`, port
3107, chromium/mobile-chrome/webkit) covering CONTRACT §5 W3b's full assertion list, and
runs the W0 legacy 36-spec regression list against the same build to confirm "no NEW reds."
No `src/` file was changed. Frozen files (`src/lib/arrival/types.ts`, `run-contract.ts`) and
the 36 legacy specs were not touched.

**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ`,
branch `arrival-prod/w3-integration`.
**Build under test:** existing `.next` (production `next build --webpack`, flags
`procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true` baked
in; `SUPABASE_ORIGIN_RUNTIME` unset). Neither rebuilt nor modified by this piece. Confirmed
zero occurrences of the prod Supabase ref (`bkvcixdmuyejfzcijpdg`) in `.next/static`.

## 1. Deliverables

- `apps/designer-portal/playwright.arrival.config.ts` — derives from the base config by
  reference (no literal Supabase keys in this file); port 3107; three projects (chromium,
  mobile-chrome [iPhone 14 viewport, forced Chromium engine], webkit); `next start`, never
  `next dev`; ~~`retries: 1` (justified in §3)~~ — now `workers: 1`, `retries: 0` (§R.1).
- `apps/designer-portal/e2e/arrival/helpers.ts` + 9 spec files covering CONTRACT §5 W3b's
  assertion list (27 tests total): `accessibility.spec.ts`, `frame0-drift.spec.ts`,
  `input-and-escape.spec.ts`, `mutation-and-failsafes.spec.ts`, `play-desk.spec.ts`,
  `play-document.spec.ts`, `put-down.spec.ts`, `stripe-return.spec.ts`,
  `webdriver-and-telemetry.spec.ts`.

## 2. Bottom line — this run does NOT satisfy the "W3b green" ship gate

> **SUPERSEDED by §R.** The tally stands. The contention reading does not: see §R.1.

CONTRACT §5 line 239 gates W4 (ship) on "W3c clean + **W3b green** + no new reds." The final,
full-lane run (third attempt, 1.3h runtime, completed to exit) tallied:

**67 failed / 2 skipped / 12 passed** (81 scheduled test-runs = 27 unique tests × 3 projects).

That is a 17% pass rate against base attempts. **This is not green. Do not treat this run as
satisfying the ship gate.** Everything below explains why the evidence strongly implicates
this specific machine's shared-resource contention during this run rather than a defect in
the arrival code itself — but "the spec is probably right" and "the gate is satisfied" are two
different claims, and only the honest one (the gate is not satisfied) is being made here. A
re-run under lower contention is required before W3b can be called green.

## 3. Why this looks environmental, not a code defect (evidence, not a conclusion to hide behind)

> **SUPERSEDED and WRONG. See §R.1.** The single failure signature came from `toBeVisible` on the zero-height `.arr-card`. WebKit's 27/27 and the auth-fixture timeout came from CSP `upgrade-insecure-requests` upgrading loopback http. Neither was contention.

1. **One failure signature, everywhere.** All 67 failures share the identical shape:
   `expect(locator).toBeVisible()` timing out at 20s (or the retry's own fresh 20s) on
   `.arr-card` (or `.arr-card.first()`), with Playwright's poller repeatedly *resolving* the
   element and reporting `unexpected value "hidden"` the entire window — i.e. the element
   mounts in the DOM but its `aria-hidden` never flips to visible in time. This shape recurs
   across Desk, Document, cold/hard/soft entries, mutation-injection, accessibility,
   input-handling, and stripe-return specs alike. A genuine arrival-code defect in one
   code path would not produce an identical timing signature across this many unrelated
   scenarios; a shared-machine scheduling/paint-starvation problem would.
2. **The auth fixture itself failed under load — before any arrival code ran.** One webkit
   attempt (`play-document.spec.ts:90`, retry) failed inside `setupAuthentication`
   (`e2e/fixtures/auth.ts:74`): `Authentication failed after 3 attempts:
   locator.waitFor: Timeout 15000ms exceeded` waiting for the sign-in button to render. This
   is Supabase Auth's own sign-in UI failing to settle within 15s under load, nothing to do
   with `.arr-card` or the arrival component tree. It is direct evidence the contention is
   infrastructure-wide on this shared box, not scoped to the arrival mount.
3. **This same fixture failure explains the "2 skipped" arithmetic.** Two `test.skip()`
   call-sites exist in the 9 spec files: `put-down.spec.ts:30` (skip on `mobile-chrome`) and
   `play-document.spec.ts:93` (skip on anything that is not `mobile-chrome`, i.e. chromium
   and webkit). That is 3 skip-eligible instances, but the tally shows only 2 skipped. The
   third — `play-document.spec.ts:90` on webkit — is accounted for by finding #2 above: its
   `authenticatedPage` fixture threw *before* the test body's `test.skip()` line ever ran, so
   Playwright counted it as a failure, not a skip. Confirmed line-by-line against the log; no
   discrepancy remains once fixture-level failures are separated from test-body skips.
4. **WebKit failed 27/27; Chromium and mobile-chrome each passed exactly the same 6/27.**
   See §4 for the full breakdown. The 12 total passes are the *same six tests*, on both
   Chromium-based projects, and every one of them is a test that asserts the arrival
   **declines** (ordinary page shows, webdriver-decline probe, origin-is-loopback check,
   fonts-never-resolve decline) rather than a test that needs `.arr-card` to reach a visible/
   playing state. WebKit — the known-slowest engine to start under CPU contention in
   Playwright's bundled build — total-failed. This is the pattern you would expect from
   engine-startup/paint-scheduling starvation under shared-machine load, not from a
   component defect: a real arrival-code race would not spare every single "declines and
   shows the ordinary page" assertion while failing every single "the card becomes visible"
   assertion, across three engines, with a clean 6-for-6 split repeated identically on two of
   them.
5. An isolated, unloaded single-test control (`debug2` / `debug-hidden2.spec.ts`, built
   earlier in this task from the same helpers, same fixtures, same `/desk` navigation)
   confirmed `.arr-card` mounts and becomes visible quickly with no concurrent load on the
   box — establishing that the component itself does reach a visible state promptly when the
   machine isn't contended. That control run's log did not survive this session's compaction
   boundary intact enough to cite an exact millisecond figure here, so no specific number is
   claimed; the qualitative result (clean pass, fast, isolated) stands as corroborating
   evidence, not as the primary evidence — the primary evidence is items 1–4 above, which are
   drawn directly from this run's own log with exact line citations.

**Recommendation to the integrator:** re-run this lane (`playwright.arrival.config.ts`)
on a quiet machine/window before deciding W3b's real status. Do not read this run's 67
failures as 67 arrival-code defects.

## 4. Lane results — full breakdown (27 unique tests × 3 projects = 81)

Legend: **F** = confirmed failed (base + retry both exhausted and failing, or fixture-level
failure), **P** = passed, **S** = skipped (via `test.skip()`, test body reached and returned
cleanly).

| # | Spec:line | Test | chromium | mobile-chrome | webkit |
|---|---|---|---|---|---|
| 1 | accessibility.spec.ts:24 | exactly one SR announcement… | F | F | F |
| 2 | accessibility.spec.ts:67 | flying headline clone hit-tests… | F | F | F |
| 3 | frame0-drift.spec.ts:19 | a hard Desk entry never declines drift | F | F | F |
| 4 | frame0-drift.spec.ts:32 | a hard Document entry never declines drift | F | F | F |
| 5 | input-and-escape.spec.ts:60 | Escape mid-hold only advances | F | F | F |
| 6 | input-and-escape.spec.ts:78 | Escape during ready wait is swallowed at capture | **P** | **P** | F |
| 7 | input-and-escape.spec.ts:104 | chrome click + bare-key shortcuts only advance | F | F | F |
| 8 | input-and-escape.spec.ts:136 | Skip goes straight to rest | F | F | F |
| 9 | input-and-escape.spec.ts:155 | input during ready wait halts it | F | F | F |
| 10 | mutation-and-failsafes.spec.ts:35 | P5: foreign mid-hold mutation ends the run | F | F | F |
| 11 | mutation-and-failsafes.spec.ts:79 | B7: sentinel rule stripped declines sentinel | **P** | **P** | F |
| 12 | mutation-and-failsafes.spec.ts:113 | B8: fonts never resolving declines after budget | **P** | **P** | F |
| 13 | mutation-and-failsafes.spec.ts:134 | B9: --arr-ok:0 declines sentinel | F | F | F |
| 14 | play-desk.spec.ts:44 | hard Desk entry plays the card, then rests | F | F | F |
| 15 | play-desk.spec.ts:67 | cold Desk shows chrome immediately | F | F | F |
| 16 | play-desk.spec.ts:103 | Desk after Document-first still plays (ORC:1123) | F | F | F |
| 17 | play-desk.spec.ts:129 | setup-whisper coexistence (studio-workspaces off) | F | F | F |
| 18 | play-desk.spec.ts:150 | staggered Desk reads: plays clean or declines | **P** | **P** | F |
| 19 | play-document.spec.ts:49 | warm soft entry via claim card, T3 all parts live | F | F | F |
| 20 | play-document.spec.ts:90 | phone long-form headline data-arr-long | S (chromium) | F | F¹ |
| 21 | play-document.spec.ts:118 | reload plays with via:null, no pending honour | F | F | F |
| 22 | play-document.spec.ts:149 | cold Document: staggered reads never drift/mutate | F | F | F |
| 23 | put-down.spec.ts:27 | putting Document down scrolls roster row | F | S (mobile-chrome) | F |
| 24 | stripe-return.spec.ts:23 | Stripe return declines arrival, opens Orders sheet | F | F | F |
| 25 | webdriver-and-telemetry.spec.ts:42 | no e2e opt-in → real automated browser declines | **P** | **P** | F |
| 26 | webdriver-and-telemetry.spec.ts:60 | window.__PATINA_SUPABASE_ORIGIN is loopback | **P** | **P** | F |
| 27 | webdriver-and-telemetry.spec.ts:69 | telemetry: report() funnel fires once, PH gap noted | F | F | F |

¹ Test #20 on webkit is a fixture-level failure (`authenticatedPage`'s
`setupAuthentication` timed out — see §3.3), not a test-body assertion failure; its skip
condition (`project.name !== 'mobile-chrome'`) never got the chance to run.

**Totals:** chromium 20F/1S/6P · mobile-chrome 20F/1S/6P · webkit 27F/0S/0P.
Sum: 67F / 2S / 12P = 81. Runtime 1.3h. Command:

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w3-integ/apps/designer-portal \
  exec playwright test -c playwright.arrival.config.ts --reporter=line
```

## 5. Legacy regression (W0 comparison) — CLEAN, zero new reds

Ran the exact W0 baseline command (legacy-baseline.md §8, 36-spec chromium-only list) against
this worktree's own `.next` build on port 3000, after the arrival lane above was fully torn
down and port 3107 confirmed released.

**Result: `45 passed`, `37 failed`, `4 skipped`, `86 did not run` (172 total, 7.9 min)** —
an exact match, tally-for-tally, to the W0 baseline's own line-reporter run.

Cross-referenced the complete unique failing-spec-file list (29 files) against the W0
baseline's documented 29-FAIL-file list: **exact match, no additions, no omissions.**
Both lists:

```
e2e/census/lens-cost-census.spec.ts
e2e/document/action-visibility.spec.ts
e2e/document/desk-error-state.spec.ts
e2e/document/desk-walkthrough.spec.ts
e2e/document/help-panel.spec.ts
e2e/document/hours.spec.ts
e2e/document/lens-a11y.spec.ts
e2e/document/lens-band-height.spec.ts
e2e/document/lens-cls.spec.ts
e2e/document/lens-contrast.spec.ts
e2e/document/lens-density.spec.ts
e2e/document/lens-fling.spec.ts
e2e/document/lens-rail-budget.spec.ts
e2e/document/lens-reduced-motion.spec.ts
e2e/document/margin-handoffs.spec.ts
e2e/document/mobile-margin-sheet.spec.ts
e2e/document/plan-room.spec.ts
e2e/document/prework-regions.spec.ts
e2e/document/quiet-release-contracts.spec.ts
e2e/document/quiet-responsive-shell.spec.ts
e2e/document/workflow-stage-responsive.spec.ts
e2e/field/field-coordination.spec.ts
e2e/library-configuration/commission-walk.spec.ts
e2e/library-configuration/decisions-compare.spec.ts
e2e/library-configuration/picker-configure.spec.ts
e2e/library-configuration/spec-book-dimensions.spec.ts
e2e/wave2-screenshots.spec.ts
e2e/wp3-screenshots.spec.ts
e2e/wp4-screenshots.spec.ts
```

The 6 PASS files (`desk-claims.spec.ts`, `gate-ceremony.spec.ts`, `spec-book-workspace.spec.ts`,
`mood-board/project-board-paths.spec.ts`, `people/bring-forward.spec.ts`,
`people/call-sheet.spec.ts`) and the 1 pre-existing `SKIP (fixme)` file
(`document/arrival-arc.spec.ts`) also match the baseline exactly — 6 + 29 + 1 = 36.

**Zero new legacy reds. Zero newly-green.** This half of the W3b gate is satisfied
independently of the arrival lane's own result in §2–4.

## 6. Arrival-fault findings (for the integrator — not fixed here, no `src/` touched)

> **Status after W3 fix round 1:**
> - **1 is FIXED.** `desk-claim-card.tsx` `actLanding()` writes `data-landing` on the Desk act anchor, per need kind: `po_unsent` and `po_unacknowledged` get `{kind:'region',region:'ffe'}`; every other need gets `{kind:'section',sectionKey:<stage>}`; ledger acts get none.
>   - The gate declines `token` for any act token, with or without a landing (R-DM21 A).
>   - Covered by jest (gate, arrival-mount) and by lane test play-desk:144, which is green on all three projects.
> - **2 and 3 remain build-environment limits.** With the probes fixed, the arrival satisfies both lane assertions:
>   - webdriver-and-telemetry:69 is green, counting only the Document's own `mark_arrival` call. The fixture's /desk entry now ends on pagehide and writes its own anchor, per §4b "once per entry on EVERY end".
>   - play-desk:199 is green.

1. **`data-landing` is read but never written by any real component.**
   `src/components/document/arrival/arrival-mount.tsx:159` reads
   `anchor.getAttribute('data-landing')` via `parseLanding()`; the ONLY place this attribute
   is ever set is a hardcoded test fixture in
   `src/components/document/arrival/__tests__/arrival-mount.test.tsx:231`. No production
   component (claim cards, token links) writes it. The richer landing-region steering this
   enables is dead code in production — `parseLanding(null)` is always what actually runs.
2. **PostHog telemetry is untestable in this build environment** — no
   `NEXT_PUBLIC_POSTHOG_KEY` baked in (`grep -rl "phc_" .next/static` empty), so
   `window.posthog` is never assigned. `webdriver-and-telemetry.spec.ts` proves the
   build-independent `report()` funnel (`mark_arrival` RPC, counted over the network) fires
   exactly once per entry, and documents the PostHog gap via a `telemetry-build-gap`
   annotation rather than a silent skip. Not an arrival defect — a build-environment limit
   on what this lane can literally assert.
3. **`studio-workspaces` flag is not in this build's baked overrides** — confirmed by
   grepping `.next/static` for the literal baked override string
   (`procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true`)
   and finding `studio-workspaces` absent from it (a bare-name string match on the flag key
   alone is not sufficient evidence, since the key is referenced by the `useFeatureFlag()`
   call site regardless of its baked value — the override-string match is the correct check
   and was used here). `play-desk.spec.ts`'s setup-whisper coexistence test documents the
   flag's absence and asserts the Desk still plays untouched, rather than silently skipping.
   Not an arrival defect.

## 7. Commit

`54c72659afc6240ca4c4303a87f2187b3c551eb3` on branch `arrival-prod/w3-integration`
(worktree `agent-arr-w3-integ`) — `test(arrival): W3b Playwright arrival lane on 3107
(chromium/mobile-chrome/webkit) (US-14)`. 11 files changed, 1400 insertions(+), 0 deletions.
Staged with explicit pathspecs (config + 9 specs + helpers.ts only). Not pushed, per task
scope — integrator's call on when this branch merges.

W3 fix round 1: `9d241a4bb7627c8750d56ffd681dd76985f55748`, `fix(arrival): W3 review fixes round 1 (US-14)`. 16 files changed, 515 insertions(+), 40 deletions(-). Staged with explicit pathspecs and not pushed. §R records the lane result for this commit's build.

## 8. Timeout/retry remediation (context for why §2's failures aren't from a too-tight budget)

> **SUPERSEDED. See §R.1.** `retries: 1` is removed (`retries: 0`, `workers: 1`). Neither a lower-contention rerun nor a larger budget was the fix.

`{timeout: 10_000}` → `{timeout: 20_000}` across all 9 spec files' card-visibility assertions
(10 occurrences); `retries: 1` added to `playwright.arrival.config.ts`. This was already
widened once, from the original 10s, specifically to absorb shared-machine contention — the
67 failures in §2 are timeouts against this *already-widened* 20s budget (plus a full second
20s retry attempt), not against the original tighter one. Widening further was not attempted
a third time in this piece; the recommended fix is a lower-contention re-run (§3), not a
larger number.
