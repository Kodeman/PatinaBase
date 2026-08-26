# Wave 3 — post-review fix set

**Worktree:** `/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3`
**Branch:** `feat/field-companion-w3` · base `0da5424dc` · head `96647d502`
**Date:** 2026-08-26. Nothing pushed. Writer lock held for the whole run.

Source of truth for the work: `docs/design/field-companion/plans/wave-3-merge-readiness-review.md`
§3(a), §5, §6 (F-1, F-2, F-3, F-11, F-15, F-17, F-20, D-1) and §7.

---

## 1. Gate

```
cd apps/mobile/Capture && scripts/capture-gate.sh all
✔ build
✔ tests
✔ lint
✔ fc-r3 sweep (inbox)
✔ fc-r3 sweep (ai)
✔ principle-4 sweep
GATE_EXIT=0
```

`swiftlint lint --quiet --strict` clean. Run in the foreground against an
isolated DerivedData path (`…/scratchpad/DerivedData-fixes`, injected via a PATH
shim so `scripts/capture-gate.sh` itself ran unmodified).

Counts read from the xcresult bundle, not from stdout
(`xcrun xcresulttool get test-results summary`):

| | |
|---|---|
| totalTestCount | **573** |
| passedTests | **573** |
| failedTests | **0** |
| skippedTests | 0 |
| expectedFailures | 0 |
| result | **Passed** |

**Reconciliation: 559 baseline + 14 new = 573.** The 14, by finding:

| Finding | File | Tests |
|---|---|---|
| F-1 | `CaptureTests/VoiceModeTests.swift` | `aTakeIsPinnedAtStartAndALaterVisitChangeCannotMoveIt`, `aTakeStartedOutsideAVisitIsSoloAndStaysSolo` (2) |
| F-15 | `CaptureTests/VisitContextTests.swift` | `aBuildTwoBlobWithoutProjectsInMindStillDecodes`, `aBuildTwoBlobWithNoVisitFieldsAtAllStillDecodes` (2) |
| F-17 | `CaptureTests/VisitContextTests.swift` | `aLibraryCaptureWithNoProjectIsPlacedWhicheverRouteEmitsIt`, `anInboxCaptureWithNoProjectIsUnplacedWhicheverRouteEmitsIt`, `aPlacedCaptureCarriesItsBasisAndRoomLane` (3) |
| R269 | `CaptureTests/VisitContextTests.swift` | `theThreeComputedEndsEachNameThemselves`, `aVisitThatCrossesMidnightEndsByRollover`, `nothingExpiresWhatIsNotAnOpenVisit`, `anExpiredVisitIsReapedExactlyOnce`, `aLiveVisitIsNeverReaped` (5) |
| R269 | `CaptureTests/TodayBandTests.swift` | `everyCloseReasonReachesTheEvent`, `aCaptureFiledFromTheTrayIsPlacedFromTheTray` (2) |

F-20 added no test — it changed four existing assertions in
`VisitRoomMergeTests` to carry the new `tone`. F-11 added none: the assertion
already existed; what changed is that production code now reads what it asserts.

**No new CaptureKit file was added**, so no project regeneration was needed for
the fixes themselves. `Capture.xcodeproj/project.pbxproj` is committed once, with
the build-number bump; regenerating twice produces the same file, and the gate's
own `generate` left it unmodified afterwards. **No `Secrets.swift` /
`Secrets.xcconfig` is staged or tracked** (`git status | grep -i secret` → empty
across the run).

---

## 2. Commits

| # | SHA | Subject |
|---|---|---|
| 1 | `ad6e163ab` | `docs(field): version the Field Companion spec, rulings, plans, and reviews` |
| 2 | `3e1bb427d` | `fix(field): pin the C6 take in CaptureKit, so FC-R11's fix has a guard` |
| 3 | `aeba0fab6` | `fix(field): one predicate for capture.placed/unplaced, whatever the route` |
| 4 | `b84756c8c` | `fix(field): decode a build-2 session blob instead of silently losing it` |
| 5 | `e47b266aa` | `fix(field): make the scan-context control read the toggle constants it is tested against` |
| 6 | `c6bf962a7` | `fix(field): scan setup states an instruction in ink, not in warning` |
| 7 | `b71443f07` | `feat(field): every visit close emits, every placement names its route` |
| 8 | `4e5bcf100` | `chore(field): bump Patina Field build number to 3` |
| 9 | `96647d502` | `docs(field): record the post-review fix set in the wave-3 report` |

---

## 3. Step 0 — D-1

Copied from the main checkout into the worktree at the same relative paths, 41
files: `field-companion-package.md`, `field-companion-plan.md`,
`field-companion-rulings.md`, `field-companion-presentation.html`, all
`plans/*.md`, `plans/sql/` (5 files), and `research/` (16 `.md` files).

`research/` is **932K** by `du -sh` — under the 5 MB threshold, so it was copied
whole rather than filtered.

`plans/wave-1p-plan.md` was **skipped**: already tracked in the worktree
(`git ls-files`). Everything else under `docs/design/field-companion/` that was
already tracked (the 17 `waves/*` files) was untouched.

One untracked file was already present in the worktree before this task began —
`docs/design/field-companion/waves/wave-3/device-pass-kody-script-combined.md` —
and was left alone: it is not in the brief's list and was not mine to stage.

---

## 4. Step 1 — rulings

Appended a dated **"Post-wave-3 rulings — 2026-08-26"** section to
`field-companion-rulings.md`, above the summary sheet:

- **FC-R20 (R279)** — affirmation is **per session**. C6 keeps its
  session-scoped `affirmed` as built; C3's per-card reset is a stricter surface
  and stays; the audit trail records the session's affirmation. Explicitly rules
  that the two surfaces share the *gate*, not the *lifetime* — a surface may ask
  more often than the session rule, none may ask less.
- **FC-R21 (R269 + F-17)** — one predicate (`Specimen.isUnplaced` after the
  action) for `capture.placed`/`capture.unplaced`; `source: "tray"` on a later
  filing and `source: "capture"` at capture time; `visit.end` on every close with
  `reason` ∈ {explicit, auto, rollover, change}; `duration_min` is wall time.
- **FC-R22 (F-16)** — store auto-reset **kept as built**, per Kody's ruling
  received mid-task. The placeholder the brief asked for was replaced with the
  real ruling and its rationale.

---

## 5. Item by item

### F-1 · the C6 visit-pin now has a guard — commit `3e1bb427d`

R263's route, as §7 item 1 asked. `FieldVoiceTake`
(`CaptureKit/CaptureKit/Domain/FieldVisit.swift`) holds `visit` and
`noteSetting`; `start(reading:)` calls the live-visit provider **exactly once**
and keeps the answer. Its memberwise initialiser is internal, so the app target
cannot assemble one from a fresh read — `start(reading:)` is the only door.
`C6VoiceModel`'s `takeVisit` + `takeNoteSetting` collapse into one `take`, and
`commit()` reads only that.

Taking the visit as a *closure* rather than a value is what makes the invariant
testable: the single read lives inside the type, so a test can change the source
afterwards and prove the take did not move.

**Red first:**

```
CaptureTests/VoiceModeTests.swift:190:20: error: cannot find 'FieldVoiceTake' in scope
CaptureTests/VoiceModeTests.swift:192:38: error: cannot infer contextual base in reference to member 'conversation'
Testing failed:
	Cannot find 'FieldVoiceTake' in scope
	Testing cancelled because the build failed.
** TEST FAILED **
```

**Green** after the implementation: `✔ tests`.

**Mutation proof.** Made the pin read live — stored the closure, computed
`visit`/`noteSetting` from it on every access (`// MUTATION: the pin reads
LIVE.`), keeping everything else compiling:

```
Failing tests:
	VoiceModeTests.aTakeStartedOutsideAVisitIsSoloAndStaysSolo()
	VoiceModeTests.aTakeStartedOutsideAVisitIsSoloAndStaysSolo()
	VoiceModeTests.aTakeIsPinnedAtStartAndALaterVisitChangeCannotMoveIt()
	VoiceModeTests.aTakeIsPinnedAtStartAndALaterVisitChangeCannotMoveIt()
	VoiceModeTests.aTakeIsPinnedAtStartAndALaterVisitChangeCannotMoveIt()
** TEST FAILED **  EXIT=65
```

Exactly the two new tests, five failing expectations, nothing else. Restored
from a byte-for-byte copy taken before the mutation.

### F-2 · the CaptureKit comment — commit `3e1bb427d`

`FieldAffirmationPolicy`'s header said the gate is shared by *"BOTH surfaces that
record"*. It now states C3 and C6 only, names N4 and F2 as FC-R11's other two
surfaces, and says the gap is scheduled rather than enforced — with the reading
rule spelled out: *"blocked on the surfaces that ask", never "every conversation
note is affirmed"*. Comment only, as briefed.

### F-3 · nothing to do

Confirmed. FC-R20 rules affirmation per session, which is exactly what
`C6VoiceScreen.swift:312-314` already does. No `.onChange(of: visitID)` reset was
added. C3's stricter per-card reset (`ViewfinderScreen.swift:110`) stays.

### F-17 · the divergence — commit `aeba0fab6`

The predicate **is** CaptureKit-reachable: `Specimen.isUnplaced` lives at
`CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift:327`. So rather than
change one line in an untestable app file, the *choice* moved into CaptureKit:
`FieldVisitTelemetry.placement(_:basis:)` takes the `Specimen` and applies the
predicate itself. `ViewfinderModel` and `S3DestinationScreen` both call it and
neither can choose again.

**Red first** (compile): `type 'FieldVisitTelemetry' has no member 'placement'` ×3.
**Green** after: the three tests pass, including the case that used to split the
two emitters — a Library capture with no project, where `isUnplaced` is `false`
but `venue.projectId` is `nil`.

### F-15 · the build-2 decode — commit `b84756c8c`

**The review is wrong that this is a one-character fix, and I have the evidence.**
`projectsInMind: [String] = []` was applied first and the test still failed:

```
✘ Test aBuildTwoBlobWithoutProjectsInMindStillDecodes() recorded an issue at
  VisitContextTests.swift:354:6: Caught error: DecodingError.keyNotFound:
  Key 'projectsInMind' not found in keyed decoding container.
```

Swift's synthesized `init(from:)` calls `decode(_:forKey:)` for every
non-Optional stored property **whatever its declaration default**. Only
`decodeIfPresent` makes an added non-Optional property absent-tolerant, so
`CaptureSessionContext.init(from:)` is now hand-written: required identity/time
fields hard-decode, and every property that carries a default in the memberwise
initialiser gets `decodeIfPresent` — which makes the *next* added field tolerant
by rule rather than by memory.

**A self-inflicted regression, caught and fixed before commit.** My first
decoder applied `prefix(maxProjectsInMind)` to mirror the memberwise initialiser.
That broke `VisitDoorTests.anOverCapProjectsInMindArrivesLongAndOpensTruncated`,
whose stated premise is that an over-cap blob decodes **long** (`count == 6`) and
`FieldVisitDoorModel` truncates on open. The truncation was an unrequested
behaviour change; it was removed and the reason recorded in the code.

The test file's header claimed *"Patina Field is not live anywhere, so there is
deliberately NO legacy-decode test here."* TestFlight build 2 retired that
premise on 2026-08-25; the header now says so.

### F-11 · the toggle labels — commit `e47b266aa`

Lifted, as the brief preferred. `SiteScanContextControls`'s pill now calls
`FieldVoiceModeCopy.toggleGlyph(isRecording:)` / `toggleLabel(isRecording:)`
instead of holding its own copy of the same four literals. The constants' own
comment named N4 only; it now names both readers.

**No red-first step, and this is a real caveat.** The assertions already existed
and already passed — the defect was that nothing connected them to the control
they claim to guard, and that control is app-target so no CaptureKit test can
reach it. The fix is in production code; the test is unchanged apart from a
comment recording what it does and does not prove.

### F-20 · the instruction's colour — commit `c6bf962a7`

Not a blanket `warning → inkSoft`: only two of the three expanded reasons are
instructions-with-nothing-to-fix. `FieldScanSetupState.expanded` now carries a
`Tone`. The no-visit-yet arm (`"Choose a project for this scan."`) is
`.instruction` and renders `inkSoft`; the two arms about a project she already
picked — it will 4xx at upload, it has no client rooms — stay `.caution` and stay
`warning`. Four existing tests now pin which is which, so the distinction cannot
be flattened back by a colour edit.

**Red first** (compile): `extra argument 'tone' in call` ×4, `cannot infer
contextual base in reference to member 'caution'` / `'instruction'`.

### R269 / FC-R21 · commit `b71443f07`

**(a) `source` on the placement pair.** `FieldVisitTelemetry.PlacementSource`
(`capture` / `tray`). `V1SessionTrayScreen.accept()` emits through the shared
`placement(_:basis:source:)` **after** `place(…)`, because the predicate is
`isUnplaced` as it stands after the action. `placementEventEmitted` deliberately
does **not** gate it: that flag dedupes the capture-time pair, and a later filing
is a second, deliberate event about the same capture — the transition is what is
counted. Its `basis` comes from `specimen.suggestionBasis`, falling back to
`"manual"` for a capture filed with no suggestion behind it.

**(b) `visit.end` on every close.** Three pieces:

1. `CaptureSessionContextPolicy.expiry(for:now:calendar:)` — CaptureKit, pure,
   names *why* an open visit stopped being live: `.auto` for the 12-hour idle
   rule and for a backwards clock, `.rollover` for the calendar-day rule, `nil`
   for anything that is not an open, unended visit or that is still live. Kept
   in lockstep with `visitState` by construction.
2. `CaptureSessionContextStore.reapExpiredVisit(identity:now:calendar:)` — turns
   a computed expiry into a real close by stamping `endedAt`. **This is what
   makes it exactly once:** the second surface to notice the same expiry gets
   `nil`. It returns the still-*open* context so the caller can read the visit's
   §14 counts from it.
3. `FieldVisitEndEmitter` (app target, `RootView.swift`) — the single place
   `visit.end` is built, so a close cannot be added without a reason.

Wiring: the four tapped End-visit sites → `.explicit`; `V0VisitSheet.start()`
emits `.change` before `startVisit` overwrites an open visit; the reap runs on
`ViewfinderModel.refreshVisit` (the seam the foreground hook already re-reads
through) and on `WorkDashboardScreen`'s `.task`. No double emission on explicit
End: the tapped sites emit and then call `endVisit`, which stamps `endedAt`, so a
later reap finds nothing.

**(c) Spec §14** gains `source` on both placement rows, `reason` on `visit.end`,
a paragraph each for the one-predicate rule and the every-close rule, and a
"Known until wave 3" warning that earlier builds' `visit.start`/`visit.end` did
not pair, so a completion rate computed from data before this is understated.

**Red first** (compile): `cannot find 'FieldVisitEndReason' in scope`, `extra
argument 'reason' in call`, `extra argument 'source' in call`, `cannot call
value of non-function type 'FieldVisitTelemetry.Event'` (the old
`captureUnplaced` was a `static let`). **Green** after: `✔ tests`.

**A swiftlint --strict round.** The first green build failed
`function_parameter_count` twice — `visitEnd` at six non-defaulted parameters and
`FieldVisitEndEmitter.emit` at six. Both are now structurally fixed rather than
suppressed: the five §14 numbers became one CaptureKit value, `FieldVisitCounts`,
which also removed `FieldVisitEndCounts`'s duplicate copy of the same five
fields; and the emitter became a small struct carrying store / analytics /
owner, so `emit` and `reapExpired` take two and one parameters. That restructure
was amended into the same commit rather than trailing it, so no commit in this
range fails the gate.

### Build-number bump — commit `4e5bcf100`

`scripts/generate_project.rb` is the single source (it sets
`CURRENT_PROJECT_VERSION` in two places: the app target at line ~84 and the two
frameworks at line ~57). Only the **app target** was bumped to `3` —
`CFBundleVersion` for the frameworks is not what ASC reads for the build, and
leaving them at 1 is not a rejection condition. `MARKETING_VERSION` stays `0.1`.

Confirmed with `xcodebuild -project Capture.xcodeproj -scheme Capture
-showBuildSettings`:

```
    CURRENT_PROJECT_VERSION = 3
    MARKETING_VERSION = 0.1
    PRODUCT_NAME = Capture
```

The pbxproj diff is 48/48 lines: the `xcodeproj` gem derives object UUIDs from a
content hash, so a changed build setting reshuffles them. Regenerating a second
time produced an identical file, and the gate's own `generate` step left it
unmodified.

---

## 6. Things I found wrong, or worth Kody's attention

1. **The review's F-15 fix does not work.** `projectsInMind: [String] = []` is
   named in §6 and §7 as a "one-character" / "one-declaration-default" fix. It
   leaves the decode throwing, proved above. Anyone who lands only that
   character will believe F-15 is closed when it is not. This is the single most
   consequential error I found in the review.

2. **A residual race on the auto-end reap, not closed here.**
   `CaptureSessionContextPolicy.resolve` (called by
   `CaptureSessionContextStore.current`, which every draft creation hits)
   *replaces* an expired visit's context with a fresh one. If a `current()` call
   lands before any surface reaps, that close is overwritten and no `visit.end`
   fires — the pre-existing behaviour, unchanged. In practice the foreground hook
   (`ViewfinderScreen`'s `scenePhase == .active` → `refreshVisit`) and W1's
   `.task` both reap before anything creates a draft, so the common overnight
   path is covered. Closing it completely would mean either reaping inside
   `current()` (CaptureKit has no analytics seam) or persisting a pending-end
   slot the app drains. Both are larger than this fix set; I did not invent
   either at the end of a wave. **Worth a ruling before the dashboard is built.**

3. **`visit.end` count coverage stays app-target.** The reap and the reason are
   pinned in CaptureTests; *which app surfaces call them* is not, because
   `FieldVisitEndEmitter`, the four tapped sites and `V0VisitSheet.start()` are
   all app-target with no test host. Same structural limit the review identified
   for F-1 — the CaptureKit half is pinned, the wiring is not.

4. **F-11 has no red-first step** (documented above). If the brief's intent was a
   test that fails before the lift, that is not reachable: the control is
   app-target.

5. **The `-quiet` gate hides swift-testing issue text.** `capture-gate.sh test`
   reports only `Failing tests:` and the test names — the `recorded an issue at
   …: Caught error: …` line that actually diagnoses a failure is stripped. I had
   to re-run `-only-testing:` without `-quiet` to see the `keyNotFound` above.
   Worth considering dropping `-quiet` from the `test_` arm, or teeing the full
   log.

6. **One test run took 614 s** because `IDETestOperationsObserverDebug` timed out
   collecting simulator diagnostics after a failing run (`Failure collecting
   diagnostics from simulator: Timed out after 600.0 seconds`). It is a
   post-failure diagnostic path, not the tests, but it makes a red run ten
   minutes long. Worth knowing before budgeting a TDD loop on this gate.

7. **`VisitContextTests.swift`'s header premise was stale** and is now corrected
   (item F-15 above). There may be other artefacts written under "Field is not
   live anywhere" that build 2 retired — `wave-3-worker-contract.md:86-88` is the
   one the review already flagged as F-16, now ruled by FC-R22, but I did not
   sweep for others.

8. **Not done, because not asked:** F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-12,
   F-13, F-14, F-18, F-19, F-21, M-1 through M-5. F-18/F-19/F-21 are the three
   the review says belong in the TestFlight release note rather than a fix list.

---

## 7. Housekeeping

- Writer lock `.superpowers/sdd/wave-3-plan/writer.lock.d` taken with `mkdir`
  at the start and `rmdir`'d after the last commit.
- No `git stash`, no `git add -A`, no push, no write to the main checkout —
  step 0 read from it with `cp` only.
- Every build and test ran in the foreground of a tool call.
