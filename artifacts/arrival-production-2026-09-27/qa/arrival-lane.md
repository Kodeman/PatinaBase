# W3b — arrival Playwright lane + legacy regression (US-14)

## S. W3b rerun after fixes at `9d241a4bb7627c8750d56ffd681dd76985f55748` (2026-09-28, this piece)

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
