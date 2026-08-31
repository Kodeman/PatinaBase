# Wave 3 — scoped re-review of the post-review fix set

**Range:** `0da5424dc..96647d502` (9 commits) on `feat/field-companion-w3`
**Worktree:** `/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3`
**Prior review:** `docs/design/field-companion/plans/wave-3-merge-readiness-review.md` §5 (R269), §6 (F-1, F-2, F-11, F-15, F-17, F-20, D-1), §7
**Implementer's report:** `.superpowers/sdd/wave-3-plan/post-review-fixes-report.md`
**Rulings the fixes encode:** FC-R20, FC-R21, FC-R22 (`field-companion-rulings.md:786-853`, added on the branch)
**Date:** 2026-08-26. Read-only: nothing committed, nothing pushed. The one temporary
mutation (F-1 proof) was restored and the blob sha re-checked against `HEAD`.

---

## 1. Gate — re-run independently

```
cd apps/mobile/Capture && scripts/capture-gate.sh all
✔ build   ✔ tests   ✔ lint   ✔ fc-r3 sweep (inbox)   ✔ fc-r3 sweep (ai)   ✔ principle-4 sweep
GATE_EXIT=0
```

Run in the foreground against an isolated DerivedData path
(`…/scratchpad/DerivedData-rereview`, injected through a PATH shim so
`scripts/capture-gate.sh` itself ran unmodified). Counts read from the xcresult
bundle, not stdout (`xcrun xcresulttool get test-results summary`):

| | |
|---|---|
| totalTestCount | **573** |
| passedTests | **573** |
| failedTests | **0** |
| skippedTests | 0 |
| expectedFailures | 0 |
| result | **Passed** |

The per-configuration row reads `passedTests: 575` — that is *test runs*, not
tests: the summary's own `statistics` block says "2 tests ran with dynamic
parameters / 4 test runs". The authoritative count is `totalTestCount: 573`,
matching the implementer's claim exactly.

`swiftlint lint --quiet --strict` clean. Both FC-R3 sweep arms and the
Principle-4 sweep green.

**Working tree unchanged by the gate.** `scripts/capture-gate.sh` regenerates
`Capture.xcodeproj/project.pbxproj` on every arm; after the full run
`git diff --quiet` returned clean, so the committed pbxproj is byte-identical to
what the generator produces. Only one untracked file exists in the worktree
(`waves/wave-3/device-pass-kody-script-combined.md`), unrelated to this range.

### Build number

```
xcodebuild -showBuildSettings -project Capture.xcodeproj -scheme Capture
  CURRENT_PROJECT_VERSION = 3
  MARKETING_VERSION = 0.1
```

Confirmed from the *built product*, not only the setting —
`Debug-iphonesimulator/Capture.app/Info.plist`: `CFBundleVersion = 3`,
`CFBundleShortVersionString = 0.1`. `MARKETING_VERSION` is untouched by the
range (the `generate_project.rb` diff changes exactly one line).

Normalising object UUIDs out of `project.pbxproj` and diffing
`0da5424dc` against `96647d502` leaves exactly two semantic lines
(`CURRENT_PROJECT_VERSION = 1;` → `= 3;`, Debug and Release). The remaining
churn is regenerated UUIDs. No setting was added, removed or reordered.

---

## 2. Prescribed findings — one by one

### F-1 · High · the Critical FC-R11 fix ships with no test — **ADDRESSED AS PRESCRIBED**

The review's §7.1 prescription was R263's route: lift the invariant into a
CaptureKit value the model is forced through, and pin that. That is exactly what
landed.

- `CaptureKit/CaptureKit/Domain/FieldVisit.swift:127-146` — `FieldVoiceTake`
  holds `visit` + `noteSetting` as `let`s. The memberwise initialiser is
  **internal** (a `public struct` with no explicit `public init`), so from the
  app target the only two ways to obtain one are `FieldVoiceTake.none` and
  `start(reading:)`, which calls the closure once and keeps the answer.
- `Capture/Features/Capture/C6VoiceScreen.swift:76` — `private var take:
  FieldVoiceTake = .none`; `:117` is the only assignment
  (`FieldVoiceTake.start(reading: { self.liveVisit })`); `:123`, `:207`, `:212`,
  `:215`, `:219` read `take.*` and nothing re-reads `liveVisit` inside
  `commit()`. `noteSetting` (the live chip reader, `:93`) is the only live path
  and is now routed through `FieldVoiceTake.noteSetting(for:)`, so one function
  serves both.
- Tests: `CaptureTests/VoiceModeTests.swift:184-217` — two tests, mutating the
  closure's captured source *after* `start(reading:)` and asserting the take did
  not move.

**Mutation proof — reproduced independently.** I replaced `FieldVoiceTake`'s
stored `visit` with a stored closure and a computed `visit` that re-reads it
(the exact "reads live" defect the test claims to catch), then ran
`-only-testing:CaptureTests/VoiceModeTests`:

```
MUTANT_EXIT=65
{'totalTestCount': 20, 'passedTests': 18, 'failedTests': 2, 'result': 'Failed'}
failures: ['aTakeIsPinnedAtStartAndALaterVisitChangeCannotMoveIt()',
           'aTakeStartedOutsideAVisitIsSoloAndStaysSolo()']
```

Exactly the two new tests go red, nothing else in the suite. Restored from a
pre-mutation copy; `git diff --quiet` clean and
`git hash-object …/FieldVisit.swift` == `git rev-parse HEAD:…/FieldVisit.swift`
(`78406da7b3d226a46b920eddad1cbe6acb73dbc2`).

(An aside on `-only-testing` for anyone repeating this: swift-testing function
identifiers need the trailing `()`. Naming them without it silently runs **zero**
tests and exits 0 — I hit that first and it looked like a surviving mutant.)

Residual, named in §3 below (N-9): the type prevents *assembling* an unpinned
take, not *re-minting* one — `start(reading:)` is public, so a future edit to
`commit()` could call it again. The model's single call site remains app-target
and untested. This is strictly better than what the review found and is the
honest limit of the approach.

### F-2 · Medium · FC-R11's affirmation reaches 2 of 4 recording surfaces — **ADDRESSED AS PRESCRIBED**

The review's §7 "not blocking" prescription was: *"Fix the CaptureKit comment
that overstates coverage; schedule the gap."* `FieldVisit.swift:95-105` now
carries an explicit **COVERAGE IS C3 AND C6 ONLY** block naming N4
(`VoiceNoteSheet`) and F2 (`SiteScanContextCapture`'s recorder) as a scheduled
gap and instructing the reader never to read `recordingIsBlocked` as "every
conversation note is affirmed". The substantive gap is untouched, as scoped.

### F-11 · Medium · the toggle test guarded the constants against themselves — **ADDRESSED; deviation (no red-first) is correct**

`Capture/Features/SiteScan/SiteScanContextCapture.swift:301-302` now reads
`FieldVoiceModeCopy.toggleGlyph(isRecording:)` / `toggleLabel(isRecording:)`
instead of its own `"Stop"`/`"Note"`/`"mic.fill"`/`"stop.circle.fill"` literals.

**I verified the lift actually connects the test to the shipped control** rather
than taking the implementer's word: grepping both targets, the four literals now
have exactly **one** definition site
(`CaptureKit/…/FieldVoiceModeState.swift:68-71`) and **three** reader sites —
`VoiceNoteSheet.swift:204, 213, 245` (N4, which already read them) and
`SiteScanContextCapture.swift:301-302` (F2, new). No surviving copy of the
literals exists in `Capture/` or `CaptureKit/`. The test's name
(`theToggleLabelsMatchTheShippedScanContextControl`) is now true of production.

The missing red-first is unavoidable and correctly reasoned: the control is a
SwiftUI view in the app target, `CaptureTests` has no app host, and the
assertion being lifted *to* is the one that already existed. The connection is
made structurally (single definition, no duplicate literals), which is the
strongest available substitute, and the doc comment at
`VoiceModeTests.swift:164-168` records precisely that the guard "is only worth
anything because `SiteScanContextControls` now READS them". Deviation accepted.

### F-15 · Low · `projectsInMind` decode throws against a build-2 blob — **DEVIATED, and the deviation is right**

The review prescribed a one-character fix (`projectsInMind: [String] = []`). The
implementer refused it and hand-wrote `init(from:)`
(`CaptureSessionContext.swift:99-134`). **The refusal is correct.** Swift's
synthesized `Decodable` conformance emits `decode(_:forKey:)` for every
non-Optional stored property regardless of any declaration default — the default
only reaches the *memberwise initialiser*. `= []` would still have thrown
`keyNotFound`, both read sites `try?` it away, and the review's fix would have
shipped believing the problem was closed. `decodeIfPresent` is the only thing
that makes an added non-Optional property absent-tolerant.

Correctness checks I ran on the hand-written decoder:

- **All 11 stored properties are assigned** (`visitID`, `identity`, `startedAt`,
  `lastActivityAt`, `routing`, `kind`, `kit`, `label`, `scanRoomID`,
  `projectsInMind`, `endedAt`). The compiler enforces this; the build is green.
- **Required vs tolerant split matches the memberwise defaults.** The four
  properties with no memberwise default (`identity`, `startedAt`,
  `lastActivityAt`; `visitID` defaults to a fresh UUID but has always been
  written) stay `decode`; everything with a memberwise default gets
  `decodeIfPresent` with the same fallback. `routing` falls back to
  `CaptureRoutingMemory.empty`, identical to its memberwise default
  (`CaptureSessionContext.swift:74`). No behaviour widens except tolerance.
- **It does NOT truncate over-cap arrays.** `projectsInMind` is decoded with
  `decodeIfPresent(…) ?? []` and no `prefix(maxProjectsInMind)`, deliberately
  unlike the memberwise initialiser (which caps at `:93`). That preserves the
  pre-existing contract pinned by
  `VisitDoorTests.anOverCapProjectsInMindArrivesLongAndOpensTruncated:418-438`,
  which asserts `decoded.projectsInMind.count == 6` (the premise) and that
  `FieldVisitDoorModel` truncates on open. That test is green in the 573.
- No custom `encode(to:)` was added, so encoding stays synthesized and
  round-trips against the same keys.

Two tests pin it (`VisitContextTests.swift:454-506`): one removing only
`projectsInMind`, one removing the whole wave-3 field set
(`kind`, `kit`, `label`, `scanRoomID`, `endedAt`) as well. Both build the
build-2 shape by round-tripping through `JSONSerialization` and deleting keys,
which is the honest way to fake an older blob.

The file header comment was also corrected — it previously asserted "Patina
Field is not live anywhere, so there is deliberately NO legacy-decode test
here", which TestFlight build 2 retired.

### F-17 · High · two predicates for `capture.placed`/`capture.unplaced` — **ADDRESSED, beyond the prescription**

The review's §7.3 asked only for the divergence half (make S3 read
`specimen.isUnplaced`). FC-R21 part 1 ruled the whole thing, and the fix set
implements the ruling: `FieldVisitTelemetry.placement(_:basis:source:)`
(`FieldVisitTelemetry.swift:105-123`) is the one predicate, and both original
emitters now call it and choose nothing —
`ViewfinderModel.swift:421` and `S3DestinationScreen.swift:194`. Grepping both
targets, `capturePlaced`/`captureUnplaced` have **no** direct call site outside
the factory and the tests. Three tests pin the split case
(`VisitContextTests.swift:517-554`), including the exact Library-with-no-project
capture that used to answer the two questions differently.

### F-20 · Medium · an instruction rendered in a warning's colour — **ADDRESSED; deviation is right**

The review asked for a one-token change (`warning` → `inkSoft` on the
no-visit-yet arm). The implementer instead added
`FieldScanSetupState.Tone { instruction, caution }`
(`FieldVisitRoomMerge.swift:91-103`) and switched on it at
`SiteScanSetupScreen.swift:162-167`. That is more than one token, and it is the
better shape: a one-token change at the view would have had nothing pinning
*which* of the three expanded reasons is an instruction, whereas the tone is now
part of the policy's return value and four assertions in `VisitRoomMergeTests`
carry it. The two genuine cautions (unownable project, no client rooms) keep
`CaptureColor.warning`; only the universal "Choose a project for this scan."
drops to `inkSoft`. Correct.

### D-1 · Note · the spec, rulings and plan were untracked — **ADDRESSED, with an operational caveat**

`ad6e163ab` adds 41 files / 42,051 insertions, `--name-status` **all `A`** — no
modifications, renames or deletions. No `.env`, secret, key, provisioning
profile, image, PDF or archive in the list; grepping every added file for
`eyJ…`, `sbp_`, `sk_live_` and service-role assignments returns nothing. The
three authorities the wave was judged against are among them.

Caveat, recorded as N-11 below: the **main checkout still carries untracked
copies of 40 of these 41 files**, so `git merge` will abort on untracked-file
overwrite. Two differ from the branch versions — and in both cases the branch
version is a strict superset (it adds FC-R20/21/22 and the §14 rows), so
deleting the untracked copies in main before merging loses nothing.

### §5 R269 — see §3 below (`visit.end` path enumeration)

### §7 items needing no code

- **F-3 / R279** — closed by **FC-R20** (consent is per session; C6 keeps its
  session-scoped `affirmed`, C3's stricter per-card reset stays). The ruling
  explicitly acknowledges and declines the review's §5 argument. Verified: no
  `.onChange(of: visitID)` reset was added, and `C6VoiceScreen.swift:312-314` is
  unchanged in this range. Correct — the review's §5 view was a recommendation,
  and the ruling overrules it with a reason.
- **F-16** — closed by **FC-R22** (keep the store auto-reset as built,
  re-confirmed *after* build 2 reached pilots). The ruling is dated 2026-08-26
  and names the retired authorization it replaces. This was exactly what the
  review asked for ("needs re-confirming, not re-coding").

---

## 3. R269 — every path that clears or replaces the visit

Enumerated from the code, not from the report. `emit` = `FieldVisitEndEmitter`
(`RootView.swift:487-514`); `reap` = `CaptureSessionContextStore.reapExpiredVisit`
(`CaptureSessionContext.swift:318-334`).

| # | Path | Site(s) | `visit.end` | Reason | Verdict |
|---|---|---|---|---|---|
| 1 | Explicit End — V0's door | `V0VisitSheet.swift:360` then `endVisit` | exactly 1 | `explicit` | ✅ correct |
| 2 | Explicit End — V1's tray | `V1SessionTrayScreen.swift:402` then `endVisit` | exactly 1 | `explicit` | ✅ correct |
| 3 | Explicit End — Companion strip | `RootView.swift:260` then `endVisit` | exactly 1 | `explicit` | ✅ correct |
| 4 | Explicit End — W1 stale prompt | `WorkDashboardScreen.swift:69` then `endVisit` | exactly 1 | `explicit` | ✅ correct (narrow mislabel window — N-12) |
| 5 | **Change** (start over an open visit) | `V0VisitSheet.swift:341`, counts read *before* `startVisit` overwrites | exactly 1 | `change` | ✅ correct — this was one of R269's two named gaps |
| 6 | 12-hour idle / backwards clock | `reap` via `ViewfinderModel.refreshVisit:83-86` or `WorkDashboardScreen.task:117` | exactly 1, **if a reaper runs first** | `auto` | ✅ in the common path; ⚠ N-1 |
| 7 | Calendar rollover | same two reapers | exactly 1, **if a reaper runs first** | `rollover` | ✅ in the common path; ⚠ N-1 |
| 8 | Second reader of the same expiry | `reap` re-entry, `endVisit` after a reap | **0** (correct) | — | ✅ `endedAt` is the interlock; pinned by `anExpiredVisitIsReapedExactlyOnce` |
| 9 | A stranger's identity | `reap` guards `open.identity == identity` | 0 | — | ✅ pinned by `aLiveVisitIsNeverReaped` |
| 10 | **`resolve` replaces an EXPIRED visit before any reap** | `CaptureSessionContext.swift:164-172` via `current()` | **0** | lost | ⚠ **N-1** — reachable, one-line fix |
| 11 | **`resolve` replaces a still-LIVE visit at the 4-hour routing window** | `CaptureSessionContext.swift:146-156` via `current()` | **0** | not even computable (`expiry` returns nil — the visit was live) | ⚠ **N-2** — a fourth silent close nobody has modelled |

`CaptureSessionContextPolicy.expiry` (`CaptureVisitPolicy.swift:106-117`) is in
genuine lockstep with `visitState` (`:74-94`): every arm that returns `.none`
there for an open-visit input has a matching reason here, in the same order,
with the same windows. The backwards-clock arm folding into `auto` rather than
minting a fourth name is argued and correct. `duration_min` is wall time from
`startedAt` to the reap moment, matching FC-R21's sentence and the four tapped
sites' arithmetic.

Rows 1–9 are right. Rows 10 and 11 are the residual.

### On the implementer's reported residual (row 10)

The report says: *"In practice the foreground hook (`ViewfinderScreen`'s
`scenePhase == .active` → `refreshVisit`) and W1's `.task` both reap before
anything creates a draft, so the common overnight path is covered."*

**That is too optimistic, and I can name the path it misses.**
`ViewfinderModel.start()` calls `currentSessionContext()` — which is
`sessionContext.current(…)`, i.e. the destructive `resolve` — at **line 156**,
*before* `refreshVisit()` (the reaper) at **line 157**. `.onChange(of:
scenePhase)` does not fire for the initial value, so on a **cold launch straight
into C1** the foreground hook never runs and `start()` wins the race with
itself. Two ways in:

- `field://capture` deep-linked launch —
  `FieldLaunchPolicy.destination(…)` returns `.viewfinderUnplaced` for
  `deepLinkedToCapture`, whose realm is `.camera`, so W1's `.task` never
  appears.
- `FieldLaunchPolicy.todayIsHome = false` — the documented "one-character
  reversal" of FC-R1. Flip it and **every** launch takes this path.

In both, an overnight-expired visit is replaced by a fresh kindless context
before any reaper sees it, and the close is unrecoverable — `expiry` on a
kindless context returns nil forever after.

**Assessment: not merge-blocking, but the fix is one line and I would take it.**
Swapping `ViewfinderModel.swift:156` and `:157` closes it for C1 (the reap
emits, then `current()` legitimately mints a fresh kindless context). The
general shape — reaping inside `current()`, which has no analytics seam — is
correctly deferred, and no dashboard exists yet, so the *data* cost today is
zero. Wave 4 with the one-line ordering fix taken now is the right split.

### The one nobody has found yet (row 11)

`resolve`'s **4-hour** `inactivityWindow` guard (`:149`) fires before the
visit-aware branch at `:164`. A visit idle longer than 4 hours but still live by
the visit rules (< 12 h idle, same calendar day) is therefore replaced with a
fresh kindless context — visit id, kind, label **and** routing all dropped — by
the next `current()` call, with no `visit.end`, and `expiry()` cannot even name
a reason because the visit was *live* at the moment it was destroyed.

The reachable instance is W1's own stale prompt: `onResume`
(`WorkDashboardScreen.swift:50`) calls `CaptureSessionContextStore.shared
.remember(…)`, which calls `current()`. So for a visit idle 4–12 h on the same
day — start at 08:00, last capture 09:00, back at 14:00 — the prompt says
"Still at Maple St?" and tapping **Resume silently ends the visit**.

This is pre-existing (`resolve` is untouched by this range) and was missed by
the merge-readiness review too. It matters now because FC-R21 part 3 states
"`visit.end` is emitted on EVERY close" and `expiry`'s own doc comment claims
lockstep "by construction" — both are false while row 11 exists. Wave-4 item,
named; not a reason to hold the merge.

---

## 4. New findings introduced or exposed by the fix set

| # | Severity | Confidence | Finding | Location |
|---|---|---|---|---|
| N-1 | Medium | High | Cold launch into C1 destroys an expired visit before the reap: `currentSessionContext()` (→ `resolve`) runs at `:156`, `refreshVisit()` (the reaper) at `:157`. `.onChange(of: scenePhase)` does not fire on the initial value, so the foreground hook does not cover a cold launch; reachable via `field://capture` and via `todayIsHome = false`. No `visit.end`, reason unrecoverable. Fix = swap two lines. | `Capture/Features/Capture/ViewfinderModel.swift:156-157`; `CaptureKit/…/FieldLaunchPolicy.swift:44-47` |
| N-2 | Medium | High | A **fourth** silent close nobody models: `resolve`'s 4-hour `inactivityWindow` replaces a *still-live* visit, so W1's stale-prompt **Resume** silently ends any visit idle 4–12 h on the same day. `expiry()` returns nil (the visit was live), so no reap can ever name it. Pre-existing; falsifies FC-R21 part 3's "EVERY close" and `expiry`'s "lockstep by construction". | `CaptureKit/…/CaptureSessionContext.swift:146-156`; `Capture/Features/Work/WorkDashboardScreen.swift:50` |
| N-3 | Medium | High | §14 vs code: `capture.placed`'s `basis` is documented as `(visit/manual/suggested)`, but production emits `FieldSuggestionBasis.rawValue` — `visit ǀ scan ǀ proximity ǀ venue ǀ calendar ǀ transcript` — or `"manual"`. `"suggested"` is emitted by **no** call site. The fix set edited that exact §14 row (to add `source`) and left the wrong value list. The new tray test compounds it by passing the literal `basis: "suggested"`. | `field-companion-package.md:1756`; `V1SessionTrayScreen.swift:228`; `S3DestinationScreen.swift:76-84`; `CaptureTests/TodayBandTests.swift:501` |
| N-4 | Low | High | Negative `duration_min`. `expiry` returns `.auto` for a backwards clock (`now < lastActivityAt`), and `FieldVisitEndCounts.compute` computes `now.timeIntervalSince(context.startedAt)` with no floor — `captures` has `max(0, …)`, `duration` does not. FC-R21 says wall time; a backwards clock ships a negative integer. One-line `max(0, …)`. | `RootView.swift:562`; `CaptureVisitPolicy.swift:113` |
| N-5 | Low | Medium | The tray's second placement event is ungated by design (correct per FC-R21 part 2), but nothing asserts the action *succeeded*: `placement(…)` is emitted after `place(…)` whatever the outcome, so a filing that leaves the capture unplaced emits a **second** `capture.unplaced` for the same capture and double-counts the denominator. In practice the suggestion always carries a project id. | `V1SessionTrayScreen.swift:213-229` |
| N-6 | Low | High | Late filing outside the tray still emits nothing: a capture born unplaced and later routed through S1/S3 hits `placementEventEmitted == true` and emits neither event. FC-R21 part 2 names only the tray, so this is *within* the ruling — but the "roving hole" metric still under-counts every non-tray late placement. Belongs in the R269 follow-up. | `S3DestinationScreen.swift:188-196` |
| N-7 | Note | High | `FieldVisitEndEmitter` — "the ONE place `visit.end` is emitted" — lives in `RootView.swift`, app-target, so *which* reason each surface passes and *whether* every close site calls it has no test. The reason vocabulary and the reap are pinned in CaptureKit; the wiring is not. F-1 got the R263 lift; this did not. | `Capture/Features/Root/RootView.swift:481-514` |
| N-8 | Note | High | `capturePlaced(basis:hasRoom:source:)` and `captureUnplaced(source:)` remain `public`, so a future emitter can still bypass the one predicate. FC-R21 part 1 is a convention, not a constraint, and no gate sweep guards it (unlike Principle 4's grep). Making them non-public would make the ruling structural. | `CaptureKit/…/FieldVisitTelemetry.swift:93-103` |
| N-9 | Note | Medium | `FieldVoiceTake.start(reading:)` is public, so the type prevents *assembling* an unpinned take but not *re-minting* one inside `commit()`. The model's single call site is the real invariant and remains app-target and untested. Also: `FieldVoiceTake: Equatable` is unused — nothing compares two takes. | `CaptureKit/…/FieldVisit.swift:127-141`; `C6VoiceScreen.swift:117` |
| N-10 | Note | High | `reapExpiredVisit` posts `visitDidChange`; `ViewfinderModel` observes it and calls `refreshVisit()`, which reaps again. The recursion terminates on the second pass (`endedAt` stamped → nil), but the reaper is now on a notification path it also fires, and a future reaper that does not stamp would loop. | `CaptureSessionContext.swift:332`; `ViewfinderModel.swift:142-150, 83-86` |
| N-11 | Low | High | **Operational, merge-time.** The main checkout carries untracked copies of 40 of the 41 files `ad6e163ab` adds; `git merge` aborts on untracked-file overwrite. Two differ (`field-companion-package.md`, `field-companion-rulings.md`) — the branch versions are strict supersets (they add §14's `source`/`reason` rows, the known-gap note and FC-R20/21/22), so deleting the untracked copies in main first loses nothing. Verify before, not during, the merge. | `docs/design/field-companion/` in the main checkout |
| N-12 | Note | Medium | W1's End-visit button reads `model.visitState.context`, a value cached at the last `refreshVisit()`. If the visit auto-expires between that refresh and the tap, the close is reported `explicit` rather than `auto`. Exactly one event still fires; only the reason is mislabelled, in a narrow window. | `WorkDashboardScreen.swift:68-71` |
| N-13 | Note | High | W1 reaps only in `.task` (appear), not on foreground — `ViewfinderScreen` has a `scenePhase` hook, `WorkDashboardScreen` does not. A phone left on W1 overnight does not reap until the screen re-appears. Nothing is lost (the counts come from the stored context), but "the first surface to see a visit that expired overnight" is later than the comment claims. | `WorkDashboardScreen.swift:112-119` |

**Count by severity:** Critical **0** · High **0** · Medium **3** · Low **3** · Note **7** — 13 new findings.

### Comment / spec drift specifically checked

- `FieldVisit.swift:95-105` — the FC-R11 over-claim is fixed (F-2). ✅
- `FieldVoiceModeState.swift:62-66` — the "N4 AND F2 both read these" claim is
  now true; verified by grep, three reader sites, one definition. ✅
- `CaptureSessionContext.swift:65-66` — `projectsInMind`'s doc now points at
  `init(from:)`. ✅
- `VisitContextTests.swift:1-7` — the "Field is not live anywhere" header is
  retired. ✅
- `generate_project.rb:84-86` — the bump carries a comment explaining why it
  must move before every upload. ✅
- `field-companion-package.md` §14 — `source` and `reason` are documented, the
  one-predicate rule is stated, and the review's requested three-line "known
  gap" note is there as a ⚠ block warning that pre-wave-3 data does not pair.
  ✅ — except the `basis` value list (N-3).
- `expiry`'s "kept in lockstep with `visitState` by construction" — true of
  `visitState`, false of `resolve` (N-2). ⚠
- `FieldVisitEndEmitter`'s "the ONE place `visit.end` is emitted, so no close can
  be added without a reason and no close can fire twice" — true of every close
  that goes through the store's `endVisit`/`startVisit`, false of the two
  `resolve` paths (N-1, N-2). ⚠

### No regressions found

`FieldVisitEndCounts` changed from a struct to a namespace enum returning the
new CaptureKit `FieldVisitCounts`; all four tapped sites and the two new ones
compile through the shared `compute`, and the five counts still travel together.
No behaviour change to the counts themselves. The `Tone` addition to
`FieldScanSetupState` is exhaustively switched at its one view site. Nothing in
`packages/` or any portal reads these events, so the §14 property additions are
additive and need no coordinated deploy.

---

## 5. Verdict

**READY.**

**One-line reason:** all seven prescribed findings are addressed — five in code
(F-1 by the R263 lift, mutation-proved by me; F-11, F-15, F-17, F-20) and two by
ruling (F-3 under FC-R20, F-16 under FC-R22) — R269 is implemented in all three
parts of FC-R21 with the spec note the review asked for, the gate reproduces
exactly (573/573/0, lint clean, all three sweep arms), `CFBundleVersion` is 3
with `MARKETING_VERSION` untouched, and the three deviations from the review's
prescriptions (F-15's hand-written decoder, F-20's `Tone`, F-11's missing
red-first) are each better-reasoned than what was prescribed. Nothing new is
above Medium.

**Take before the TestFlight upload (both one-liners, neither merge-gating):**

1. **N-1** — swap `ViewfinderModel.swift:156` and `:157` so the reap runs before
   `current()`. Closes the deep-link and `todayIsHome = false` holes in FC-R21
   part 3.
2. **N-3** — correct §14's `capture.placed` `basis` value list to the values
   production actually emits.

**Merge mechanics:** delete the untracked `docs/design/field-companion/` copies
in the main checkout before merging (N-11), or the merge aborts.

**Wave 4, named rather than fixed:** N-2 (the 4-hour `resolve` window silently
ending live visits, and W1's Resume with it) is the largest thing standing
between FC-R21 part 3 and being literally true, and it is a functional bug as
well as a telemetry one. N-6 (non-tray late filing), N-7 (the emitter's wiring
is untested) and N-8 (the one predicate is a convention, not a constraint)
belong in the same ruling.
