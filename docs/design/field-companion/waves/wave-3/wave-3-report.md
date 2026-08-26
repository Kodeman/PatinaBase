# Wave 3 report — Task 32, the wave gate

Worktree: `feat/field-companion-w3` (`/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3`).
Commit under this task: `3e915c016` — "test(field): close the wave-3 gate — owner
scoping, visit actions, and three gate fixes".

⚠ **Concurrent-writer note:** after this task's commit and lock release, a
second agent (identified in cross-session messages as "general-purpose",
acting as a conductor/checker for this worktree) independently re-ran a
verification pass and overwrote this file with its own report. That report's
SQL section is **wrong**: it ran `scripts/run-sql-tests.sh` from the **main**
checkout's repo root instead of this worktree's, which silently matches zero
files for `-f field_capture_visit` (that test file, and the migration SQL
under `docs/design/field-companion/plans/sql/`, exist only on this branch)
and undercounts the full runner by one file (127 instead of 128). It reported
that as a genuine gap ("not fabricating a pass here — recording the gap").
It is not a gap — see the SQL section below, verified from the correct
checkout, with the discrepancy diagnosed. No git commit conflict resulted
(`git log` confirms a single commit, `3e915c016`, sits on `e225de5f2`); this
is a report-content collision only, not a code or history problem. This file
has been restored to this task's own verified content.

## Step 1 — the two new tests

Appended exactly as the plan gives them:
- `ownerScopingSurvivesTheVisitFields` → `CaptureTests/CaptureLifecycleTests.swift`
- `theVisitActionsAreStableIdentifiers` → `CaptureTests/FieldCompanionPresentationTests.swift`

Both compile against symbols already present from earlier tasks
(`CaptureOwnerIdentity`, `CaptureSessionIdentity`, `CaptureSessionContextPolicy.started`,
`CaptureVisitDraft`, `store.session(visitID:owner:)`, `store.unfiled(owner:)`,
`FieldCompanionAction`) — no scaffolding needed.

## The three source fixes

### A — `suggestionConfidence` reached a view (gate grep C failed)

`V1SessionTrayScreen.accept(_:projectID:)` (`Capture/Features/Session/V1SessionTrayScreen.swift:212-231`)
read `specimen.suggestionConfidence ?? 0` only to build a full `CaptureSuggestion`
to hand to `FieldVisitTelemetry.suggestionAccepted(_:)` — which discards
everything but `.basis`. Confirmed by reading the call site: the number was
never rendered and never emitted, so this was not a Principle-4 violation in
substance, but it *was* the one path in `Capture/` where a view read the
CaptureKit-internal ordering number at all.

Fix: added a second overload,
`FieldVisitTelemetry.suggestionAccepted(basis: FieldSuggestionBasis) -> Event`,
in `CaptureKit/CaptureKit/Analytics/FieldVisitTelemetry.swift`, and changed the
one call site to `analytics.emit(FieldVisitTelemetry.suggestionAccepted(basis: basis))`
— no `CaptureSuggestion` construction, no `suggestionConfidence` read.

Kept the existing `suggestionAccepted(_ suggestion: CaptureSuggestion)` overload:
checked first — `CaptureTests/TodayBandTests.swift` (`waveThreeEmitsExactlyTheSpecifiedEvents`,
`theConfidenceNumberNeverLeavesTheDevice`, from Task 31) calls it directly with a
hand-built `CaptureSuggestion`, so removing it would have broken passing tests
for no reason. (It is otherwise unused elsewhere in `Capture/` now — a public
CaptureKit API with one remaining caller in tests, not a defect, out of this
fix's scope to remove.)

`FieldTraySuggestionOrder.ordered` (`Specimen+Accessors.swift:406-414`) was left
untouched — it reads `suggestionConfidence` to order the tray *inside CaptureKit*,
which is exactly the sanctioned use.

Verified: `grep -rn 'suggestionConfidence' Capture/ --include='*.swift'` now
prints nothing.

### B — the FC-R3 grep was never wired into the gate

`scripts/capture-gate.sh` had zero references to `inbox`/`FieldCopyAudit`/`forbidden`
before this task — the plan's Step-3 grep block existed only as text a human
would have to remember to paste and run by hand. Added a `fcr3_sweep()` function
and a `fcr3` case to the script, wired into `all` alongside `build`/`test_`/`lint`.
It runs the plan's exact grep (`grep -rniE '"[^"]*\binbox\b[^"]*"' Capture/ --include='*.swift'`
filtered by the same identifier/comment exclusions), then checks by **content**
(regex against each expected fragment, not line number) that exactly the three
protected lines survive:

```
LocalCaptureSyncService:  destination = "inbox"
LocalCaptureSyncService:  guard result.status == "saved" || result.status == "inbox"
S5InboxTerminalScreen:    ["destination": "inbox"]
```

On any mismatch (wrong count or a missing expected fragment) it prints the
actual grep output and an explanation, then exits 1 — the script has
`set -euo pipefail` at the top and the failure branch ends in `exit 1`, so
under `-e` a violation terminates `all` non-zero, not just this subcommand.
Verified both directions by hand: clean tree → `✔ fc-r3 sweep`; a synthetic
`"Parked in your inbox"` string appended to `V1SessionTrayScreen.swift` → the
sweep printed all four lines (the three protected plus the injected one),
explained the rule, and exited 1. The injected line was removed before
continuing (confirmed via `git diff --stat` showing no residual change to
that file).

### C — README's stale "72 built screens"

`CaptureKit/CaptureKit/Support/CaptureScreenID.swift`'s header states the ground
truth: 75 entries total, 74 built (wave 3 built `v0Visit`/`V0.visit` and
`c6Voice`/`C6.voice`), `v4VisitReview` the one id still reserved for wave 4.
Counted the enum cases directly (`grep -c 'case .*= "screen\.'` → 75) to confirm
independently of the header comment.

Corrected all three stale spots in `apps/mobile/Capture/README.md`:
- `:15` — "drives all 72 built screens" → "drives all 74 built screens"
- `:40-41` — "72 built — and three reserved visit-spine ids (75 total)" →
  "74 built — and one reserved visit-spine id, V4.visit-review, held for wave 4
  (75 total)" (also named the two wave-3 additions, V0.visit and C6.voice, in
  the same sentence so the arithmetic is traceable)
- `:120` (script comment) — "all 72 built screens" → "all 74 built screens"

`grep -n '72\b' README.md` now returns nothing.

## iOS gate

Ran from `apps/mobile/Capture`, foreground, `dangerouslyDisableSandbox: true`,
`xcrun simctl shutdown all` first.

- `scripts/capture-gate.sh all` → `✔ build`, `✔ tests`, `✔ lint`, `✔ fc-r3 sweep`
  (the new check, now part of `all`).
- `swiftlint lint --quiet --strict` standalone → exit 0, no output.
- Test target run separately with a saved bundle:
  `xcodebuild test -project Capture.xcodeproj -scheme CaptureKit -sdk iphonesimulator
  -destination "platform=iOS Simulator,name=iPhone 17" CODE_SIGNING_ALLOWED=NO
  -resultBundlePath .build/gate-results/t32.xcresult -quiet`
  → **544 passed, 0 failed, 0 skipped** (`xcrun xcresulttool get test-results summary`).
  Baseline was 542; the two tests from Step 1 account for the +2. Matches
  expectation exactly. Bundle path:
  `apps/mobile/Capture/.build/gate-results/t32.xcresult` (gitignored, not committed).
- One transient failure along the way, not a real defect: the very first
  `xcodebuild test` invocation failed with `Could not resolve package
  dependencies: The file "swiftpm" doesn't exist.` — an SPM resolution race,
  most likely from another agent/process touching the same shared
  `~/Library/Developer/Xcode/DerivedData` concurrently (this worktree is not
  the only consumer of that cache; `ls` showed seven `Capture-*` derived-data
  directories from recent sessions). A bare retry of the identical command
  succeeded. Not a sandbox issue — this ran with `dangerouslyDisableSandbox: true`
  throughout.

### `capture-shots.sh`

Ran the full sweep first with the default settle (1.4s) restricted to the
three wave-3-relevant suffixes (`V0.visit C6.voice F1.context`, all three
already present in `ALL_SCREENS`, added by Tasks 13/23/30 respectively).
`F1.context` rendered correctly on the first pass; `V0.visit` and `C6.voice`
both landed on the simulator Home Screen instead of the app — not a
`MissingScreen` placeholder, but a worse failure to launch at all.

Diagnosed by rerunning each in isolation with `CAPTURE_SHOT_SETTLE=3.5`: both
then rendered correctly. Root cause: these were the **first** app launches
after a fresh build install on a freshly booted simulator in the three-in-a-row
run, and cold-start (first app launch after install) took longer than the
default 1.4s settle window; by the time the loop reached the third screen
(`F1.context`) the process was already warm. This is a harness-timing
artifact of running three suffixes back-to-back immediately after a fresh
build, not a defect in the screens or the routing. Flagging as a separate,
out-of-scope finding: the default 1.4s settle in `capture-shots.sh` has no
launch-success check, so a slow cold launch silently produces a home-screen
photo instead of failing loudly — worth a follow-up, not fixed here since
`capture-shots.sh` is not one of this task's six files.

Confirmed real, at `CAPTURE_SHOT_SETTLE=3.5`:
- **`screen.V0.visit`** — real "Where are you today?" visit-start sheet:
  Site visit / Sourcing toggle, project search + list (Ashford Residence,
  Cedarbrook Lake House, Whitfield Loft), kit picker (Walk-through / Trade
  walk / Install day), "Start visit" CTA.
- **`screen.C6.voice`** — real camera-mode screen with VOICE selected in the
  mode rail and the copy "Voice notes aren't ready yet. Pick another mode to
  keep capturing." This is the feature-flag-gated state — consistent with the
  standing note that `field-companion-voice` evaluates null on device builds
  (see below); the simulator here is showing the flag-off/not-ready path, a
  real intentional gated state, not a broken screen.
- **`screen.F1.context`** — real "Photos & notes for this room" screen with
  Photo button and Done CTA.

None is a `MissingScreen` placeholder. No expectation dropped — all three
suffixes the plan named were reachable and produced real content once given
enough settle time for a cold app launch.

## SQL

> **Evidence of record: `wave-3-conductor-check.md`.** The conductor re-ran both suites
> first-hand from the WORKTREE under the DB lock and confirmed these numbers independently
> (00532 applied locally: migration row + 7 columns + projection trigger; filtered 1/1;
> full 128 total / 106 green / 22 expected-fail / 0 unexpected-fail, exit 0). The superuser
> caveat below is part of that record.


⚠ **The runner connects as `postgres` (superuser). Both results below prove
trigger/RPC LOGIC with RLS bypassed — neither proves anything about
row-level security.** Do not read a green SQL run as "RLS verified."

Both runs from the **worktree's** repo root
(`/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3`) —
running from the main checkout first (and, per the concurrent-writer note
above, apparently also by the other agent that overwrote this file) produces
a false "0 test files matched" / undercounted full-runner total, because
`supabase/tests/field/field_capture_visit_test.sql` and the
`docs/design/field-companion/plans/sql/*.sql` files exist only on this
worktree's branch, not on `main`. Both checkouts point at the same local
Postgres instance (`127.0.0.1:54322`); only the test-file discovery path
differs by checkout, so the fix is "run from the worktree," not "the SQL is
missing."

Lock discipline followed: `mkdir /tmp/patina-local-supabase-db.lock.d` before
either run, `rmdir` after both.

- `scripts/run-sql-tests.sh -f field_capture_visit` → **1/1 PASS**
  (`supabase/tests/field/field_capture_visit_test.sql`, 1s). This file and the
  migration it exercises (`00532_field_capture_visit_and_suggestion`, applied
  directly to the local DB per Tasks 9/10, present at `supabase/migrations/00532_field_capture_visit_and_suggestion.sql` on this branch (corrected: an earlier draft of this section said it was not yet moved).
- `scripts/run-sql-tests.sh` (full runner) → **128 total, 106 green, 22
  expected-fail, 0 unexpected-fail, effective-green 128/128, exit 0.** Matches
  the plan's expectation exactly: the 22 documented known failures
  (`supabase/tests/KNOWN_FAILURES.md`) and nothing else red.

## The three greps (verbatim)

**FC-R3 sweep** (`grep -rniE '"[^"]*\binbox\b[^"]*"' Capture/ --include='*.swift' | grep -v 'CaptureScreenID\|registryKey\|accessibilityIdentifier\|analytics.event\|analytics.screen\|// '`):

```
Capture/Features/Route/S5InboxTerminalScreen.swift:86:                ["destination": "inbox"])
Capture/Services/Sync/LocalCaptureSyncService.swift:361:            destination = "inbox"
Capture/Services/Sync/LocalCaptureSyncService.swift:698:        guard result.status == "saved" || result.status == "inbox" else {
```

Exactly the three protected lines, nothing else. Same result via the new
`scripts/capture-gate.sh fcr3` check (`✔ fc-r3 sweep`).

**`CaptureType.caption`** (`grep -rn 'CaptureType.caption' Capture/ CaptureKit/ --include='*.swift'`):

```
(no output)
```

**`suggestionConfidence` under `Capture/`** (`grep -rn 'suggestionConfidence' Capture/ --include='*.swift'`):

```
(no output — after fix A; printed one line, V1SessionTrayScreen.swift:222, before it)
```

## Acceptance checklist from plan §3 — NOT established here

⚠ **None of the four criteria below is claimed met by this task.** This was a
simulator/CI gate pass, not a device pass. Three of the four are airplane-mode,
real-address claims that only Task 33 (the real eight-minute walk) can prove,
and Task 33 has not run.

1. **Three taps and ≤8s at the door, in airplane mode.** NOT established. The
   gate proves the `V0.visit` sheet renders and its component pieces (kind
   toggle, kit picker, Start visit CTA) exist and compile; it says nothing
   about tap count, timing, or airplane-mode behavior on a real device with a
   real network transition.
2. **Two taps and a hold per capture, with project and room attached.** NOT
   established. Owner-scoped visit inheritance is unit-tested
   (`ownerScopingSurvivesTheVisitFields`, this task) and the visit/suggestion
   SQL projection is tested against a live local Postgres
   (`field_capture_visit_test.sql`), but neither exercises the actual capture
   gesture, tap count, or hold timing on device.
3. **A no-visit capture born with a suggestion, appearing in the unplaced
   tray.** NOT established from the simulator. `FieldTraySuggestionOrder.ordered`
   and the suggestion-acceptance telemetry path are unit-tested; the tray's
   actual on-device appearance and the suggestion engine's real-world
   proximity behavior are not.
4. **Invariant V on every capture surface.** NOT established. The gate proves
   the code compiles, the unit/SQL suites are green, and no forbidden "inbox"
   copy or confidence leak survives static analysis — none of that is a
   screen-by-screen device audit of Invariant V.

For each: the gap between "simulator/CI evidence exists" and "the criterion is
met" is real and is Task 33's job to close, not this task's.

## The voice-flag caveat

The feature flag `field-companion-voice` has been evaluating **null on every
device build** (standing note from the wave's memory, corroborated in this
run by `C6.voice`'s simulator screenshot showing the flag-off/not-ready copy:
"Voice notes aren't ready yet. Pick another mode to keep capturing."). C6 has
therefore never recorded a voice note on hardware. **The device pass (Task 33)
must record the flag's evaluated value per device before making any voice
assertion** — a pass that never observes the flag resolving true cannot
demonstrate the voice-note path either way. The simulator screenshot here is a
UI-state proof (the gated copy renders correctly), not a flag-evaluation proof.

## Findings against the plan

- The plan's Step 2/3 SQL commands (`cd /Users/kody/Code/patina-merged && ...`)
  read as if they should run from the **main** checkout's repo root. They do
  not: `supabase/tests/field/field_capture_visit_test.sql` and
  `docs/design/field-companion/plans/sql/*` exist only on this worktree's
  branch. Run from the main checkout, `-f field_capture_visit` silently
  matches zero files and reports a trivially "green" 0/0 summary, and the
  full runner undercounts by one file — a false pass/false gap that would
  have been reported as real without checking the count. This is exactly the
  mistake the concurrent second agent made in its overwritten version of this
  report (see the note at the top). Running from the worktree's own root
  (which the top-level task brief's "Worktree — work only here" framing
  already implies) is correct and is what this report's numbers reflect.
- `capture-shots.sh`'s default `CAPTURE_SHOT_SETTLE=1.4` is too short for the
  first one or two app launches immediately after a fresh install on a
  freshly booted simulator; screens later in a multi-suffix sweep are fine
  because the process is already warm by then. Worth raising as a harness
  hardening item (not fixed here — out of this task's scope), since a
  three-screen sweep run cold, exactly as instructed, produced two false
  "unreachable" results that were not real regressions.
