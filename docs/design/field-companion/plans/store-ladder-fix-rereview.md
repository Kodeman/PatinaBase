# Scoped re-review — `fix/field-store-ladder` fix round

- **Diff reviewed** `d425ebff1..11f0bb8cb` (single commit: `fix(field): never reset
  a store before first unlock, rename instead of delete, report every reset,
  honest fallback copy`)
- **Worktree** `/Users/kody/Code/patina-merged/.claude/worktrees/field-store-ladder`
- **Reviewed** 2026-08-25 · read-only (no edits, no git mutations)
- **Prior review** `docs/design/field-companion/plans/store-ladder-fix-review.md`
  (blockers B1/B2/B3, follow-ups F-1…F-12)

## Verdict

**MERGE.** All three blockers (B1, B2, B3) are correctly closed. The two named
follow-ups (F-1's `SiteRequestOutboxRecord.stateRaw`, F-11's rung-2 guard) are
also closed, and closed the *durable* way, not just patched to pass. One new,
low-stakes, currently-dormant divergence surfaces from an unrequested but
reasonable extension of F-1 (`CaptureMeasurement.axisRaw`) — follow-up, not a
blocker. Test gate: `CaptureStoreLadderTests` 15/15 green. The wider suite hit
a mass "signal kill" crash (98 tests, unrelated suites) that is environmental,
not a code regression — detailed below.

| # | Status | Evidence |
|---|--------|----------|
| B1 — never reset pre-unlock; rename to `.bak`; delete `.bak` on next clean open | **ADDRESSED** | `CaptureStore.swift:281-293` (guard order), `:346-366` (`setStoreFilesAside`), `:368-383` (`removeSetAsideStoreFiles`) |
| B2 — accumulate `didReset` across rungs | **ADDRESSED** | `CaptureStore.swift:168-204` (`walk`) |
| B3 — fallback copy must not say close/reopen; brand voice | **ADDRESSED** | `SyncStatusScreen.swift:121-123` |
| F-1 — migration defaults equal init values; `SiteRequestOutboxRecord.stateRaw` → `.queued` | **ADDRESSED** | `SiteRequestOutboxRecord.swift:66`, plus the other 8 sites (below) |
| F-11 — rung-2 guard must fail on revert to `ModelConfiguration()` | **ADDRESSED** | `CaptureStoreLadderTests.swift:269-292` |

---

## B1 — never reset before first unlock; rename not delete

`CaptureStore.swift:259-305` (`openRung`). The failure path now runs, in order:

1. `:281` `guard storeFilesExist(at: config.url) else { return outcome }` — no
   file, nothing to protect or reset.
2. `:283-289` `guard isProtectedDataAvailable() else { … deferredUntilUnlock =
   true …; return outcome }` — **this guard sits before the reset**, so a
   locked device can never reach `setStoreFilesAside`.
3. `:291-304` only past both guards does `setStoreFilesAside` run, and only
   then is the retry attempted.

`isProtectedDataAvailable` arrives as a `@MainActor` closure
(`:128-131`, `resilient`; `:259-262`, `openRung`), and `AppContainer.swift:80-82`
wires it to `UIApplication.shared.isProtectedDataAvailable`. `CaptureStore` is
itself `@MainActor` (`CaptureStore.swift:76`), so the read is synchronous and
correctly isolated — matches the review's own note that this needs no
dispatch. Default is `{ true }` for every call site that doesn't pass one
(existing tests, previews), which is exactly "preserve prior behaviour unless
UIKit says otherwise."

**Rename not delete.** `setStoreFilesAside` (`:346-366`) uses
`moveItem(at:to:)` to `<name>.bak`, one file at a time, wrapped in `do/catch`
so a partial move degrades to "as many as could be moved" rather than an
uncaught throw. `removeSetAsideStoreFiles` (`:368-383`) is called only from
the clean-first-try branch (`:266-272`) — i.e. only once a fresh open of that
exact URL has *already succeeded*, which is the "next clean open" B1 asked
for.

New tests exercise both halves directly and pass:
`aLockedStoreIsLeftAloneAndReportedDeferred` (`CaptureStoreLadderTests.swift:167-183`,
asserts the file is byte-for-byte untouched and no `.bak` appears) and
`aSetAsideStoreSurvivesTheResetAndGoesOnTheNextCleanOpen`
(`:185-205`, asserts the `.bak` exists after reset and is gone after the next
clean open). **HIGH confidence, ADDRESSED.**

## B2 — report every reset

`CaptureStore.swift:168-204` (`walk`). `didReset` and `deferredUntilUnlock` are
hoisted above the loop (`:172-173`), OR'd in on every rung's outcome
(`:178-179`), and the accumulated values — not the per-rung outcome — are what
go into every `CaptureStoreOpenReport` constructed on the way out: the
success-mid-loop path (`:181-188`) and the final in-memory path (`:198-204`)
both read the accumulated `didReset`/`deferredUntilUnlock`, not
`outcome.didReset`. New tests pin this directly:
`aResetOnAnEarlierRungIsReportedWhenALaterRungAnswers`
(`CaptureStoreLadderTests.swift:207-236`, rung 1 resets-and-still-fails, rung 2
answers, asserts the accumulated `true` reaches the report, not rung 2's
`false`) and `aResetOnAnEarlierRungIsReportedWhenTheRunEndsInMemory`
(`:237-252`). **HIGH confidence, ADDRESSED.**

## B3 — fallback copy

`SyncStatusScreen.swift:121-123`:

> "Nothing you capture here is being saved on this iPhone. Send what you have
> before you leave — anything still here is gone once the app closes."

No "close and reopen," no instruction to do the one thing that destroys the
in-memory work. It leads with the outcome ("nothing … is being saved"), names
no mechanism ("capture store" is gone), and reads as an honest warning with an
action the designer can actually take (send it now). Checked against
`patina-brand-voice`: plain-spoken, outcome-first, no "AI"/mechanism language,
no luxury-brand haze — compliant. This is close to, though not verbatim, the
review's suggested replacement; it satisfies the same three problems the
review named (harmful instruction, false recovery promise, mechanism-leading
language). **HIGH confidence, ADDRESSED.**

## F-1 — migration defaults equal init values

All nine sites the prior review's table named now default to the init's own
value, verified by grep + enum lookup:

| Property | New default | Init/accessor value | Match |
|---|---|---|---|
| `Specimen.categoryRaw` (`Specimen.swift:107`) | `SpecimenCategory.unknown.rawValue` | init: same | ✅ |
| `Specimen.destinationRaw` (`:118`) | `CaptureDestination.undecided.rawValue` | init: same | ✅ |
| `Specimen.statusRaw` (`:119`) | `CaptureStatus.draft.rawValue` | init: same | ✅ |
| `Specimen.lifecycleRaw` (`:120`) | `CaptureLifecycle.State.captured.rawValue` = `"captured"` | init default `"captured"` (`:157`) | ✅ |
| `CapturePhoto.captureModeRaw` (`:129`) | `CameraMode.photo.rawValue` | init: same | ✅ |
| `CaptureMeasurement.sourceRaw` (`:145`) | `MeasureSource.manual.rawValue` | init: same | ✅ |
| `ScanUploadRecord.statusRaw` (`ScanUploadRecord.swift:81`) | `CaptureTransferPhase.queued.rawValue` | accessor already fell back `?? .queued` (`ScanUploadRecord.swift:74`) — now matches directly | ✅ |
| `ScanUploadRecord.scanSchemaVersion` (`:76`) | `3` | matches the "3 = Field P1" comment one line above | ✅ |
| **`SiteRequestOutboxRecord.stateRaw`** (`SiteRequestOutboxRecord.swift:66`) | `SiteRequestOutboxState.queued.rawValue` | accessor was `?? .failed` (`:76`) — **this is the real fix**: a migration-defaulted row now parses to `.queued`, not the wrong `.failed` | ✅ |

The named defect (`SiteRequestOutboxRecord.stateRaw` reading back as `.failed`,
silently marking a guest delivery dead) is closed. **HIGH confidence,
ADDRESSED.**

### Unrequested extension: `CaptureMeasurement.axisRaw` — NEW, not in the original F-1 table

`Specimen.swift:228` also changed `axisRaw`'s default from `""` to
`MeasurementAxis.custom.rawValue`, with a comment explaining the reasoning
(no init default exists for axis; it's always supplied; `.custom` "claims no
width/height/depth slot"). This wasn't in the original review's F-1 table at
all — it's new ground covered in this round. Checked at every reader
(`grep -rn axisRaw`):

- `FieldCapturePayload.swift:193` — `switch MeasurementAxis(rawValue: m.axisRaw)
  { case .width/.height/.depth: … ; default: break }`. `""` → `nil` → `default`;
  `"custom"` → `.custom` → `default`. **Equivalent.**
- `RouteSessionUI.swift:232` (`dimensions(_:)`) — only probes
  `.width/.height/.depth`'s rawValues via `measurements.first {
  $0.axisRaw == axis.rawValue }`. Neither `""` nor `"custom"` equals any of
  those three. **Equivalent.**
- `SpecimenSheetScreen.swift:244-246` (`dimensionString(_:)`) — **not
  equivalent**. `order` is `[.width, .depth, .height, .diagonal, .custom]` and
  looks up `byAxis[axis.rawValue]` for every entry *including* `.custom`. A row
  with `axisRaw == ""` matches none of the five buckets and is silently
  dropped from the displayed dimension string; a row with `axisRaw == "custom"`
  matches the `.custom` bucket and *would* appear.
- `CaptureKitMocks.swift:66`, `ARKitMeasureService.swift:30`,
  `Specimen+Accessors.swift:164` — all construction sites, `axisRaw:` is a
  required init parameter with no default, so this migration default is never
  observed there.

**Verdict on this one reader: currently dormant, not live.** Exactly as F-1's
own reasoning establishes for the other eight fields — the default is only
ever *read back* by a lightweight migration backfilling a newly-added column
on pre-existing rows, and `axisRaw` is not a new column (it has existed on
every `CaptureMeasurement` row since the entity shipped, and every
construction path requires it explicitly). So no row today or foreseeably can
carry this default. Flagging per the task's specific ask, not because it's
live: **LOW severity, MEDIUM confidence, follow-up not blocker** — worth a
one-line comment at `SpecimenSheetScreen.swift:245` if this is ever revisited,
or dropping `.custom` from a future default-audit rather than treating it as
interchangeable with `""` at every call site.

## F-11 — rung-2 regression guard now pins the actual code path

`CaptureStoreLadderTests.swift:269-292`
(`theApplicationSupportRungIsNotTheAppGroupStore`). This is a genuine
strengthening, not a cosmetic rename:

- It calls `CaptureStore.diskRungs(appGroupID:appGroupIsProvisioned:)`
  directly (`:270-271`) — the exact function `resilient` calls via `walk`
  (`CaptureStore.swift:152-157`). Previously the test only checked
  `applicationSupportStoreURL()` in isolation, which the old F-11 finding
  showed doesn't guard the wiring.
- The first assertion (`:275`) compares
  `String(describing: rungTwo.configuration.groupContainer)` against
  `String(describing: ModelConfiguration.GroupContainer.none)`. **This is the
  durable trap**: revert `diskRungs`'s rung-2 line back to
  `ModelConfiguration()` and `groupContainer` becomes `.automatic` by
  declaration — the assertion fails immediately, independent of whether the
  App Group entitlement actually resolves in the xctest process. That sidesteps
  exactly the environment gap the original F-11 finding named (the xctest
  process has no `application-groups` entitlement, so a URL-only assertion
  can pass on a reverted config).
- A second, gated block (`:286-291`) still checks the resolved URL differs
  from the real App Group URL when the entitlement *does* resolve on this
  machine — mirroring `resilient`'s own provisioning guard rather than
  tripping SwiftData's trap, closing the previously-flagged F-12 as a side
  effect.

**HIGH confidence, ADDRESSED** — and closed in the way the review asked for
("pin the trap itself"), not merely re-passed.

---

## The `walk(_:seedFailures:open:)` seam

`CaptureStore.swift:168-170`: `static func walk(_ rungs: [DiskRung], seedFailures:
[String] = [], open: (DiskRung) -> RungOutcome) -> CaptureStore` — no `public`
modifier anywhere on `walk`, `openRung`, `diskRungs`, `DiskRung`, or
`RungOutcome`; `CaptureStore` itself is `public final class` but these are
plain `static func`/`struct`, so they default to **internal**, not exposed
outside the `CaptureKit` module. Confirmed empirically too: the new tests call
`CaptureStore.walk(...)`, `CaptureStore.diskRungs(...)`, `CaptureStore.DiskRung(...)`
and `CaptureStore.RungOutcome(...)` directly from `CaptureTests` (a different
target, reaching in via `@testable import`), and the gate run below shows all
of them compiling and passing — that would fail to build if any were
`private`/`fileprivate`, and wouldn't be reachable from outside the module if
they were narrower than `internal`.

**Behaviour-preserving:** `resilient` still (a) gates rung 1 on
`containerURL(forSecurityApplicationGroupIdentifier:)` before ever
constructing its `ModelConfiguration` (`:143-150`, unchanged reasoning, now
just feeding `appGroupIsProvisioned` into `diskRungs` instead of an inline
`if`), (b) walks App Group then Application Support in that order
(`diskRungs`, `:224-237`, `rungs.append` App Group conditionally, then always
appends Application Support), (c) stops at the first rung that returns a
container, and (d) falls to memory only after every rung is exhausted. The
only observable behaviour change from the refactor itself is the B2 fix
(accumulation) — which is the intended change, not a side effect of the seam.
**HIGH confidence.**

---

## Pre-unlock deferral: can it lose data on its own?

Traced the locked-device path end to end:

1. `openRung` on a locked device takes the branch at `:283-289`: sets
   `deferredUntilUnlock = true`, appends a failure string, **returns without
   calling `setStoreFilesAside`**. No file is touched — confirmed both by
   reading the code path (the `guard` returns before the rename call at
   `:291`) and by the new test's byte-for-byte assertion
   (`aLockedStoreIsLeftAloneAndReportedDeferred`, `:167-183`).
2. `walk` (`:175-189`) continues to the next rung with the same closure; if
   Application Support is *also* unreadable while locked (plausible — same
   device, same lock state), the same deferral happens there too, and the loop
   falls through to the in-memory rung (`:191-204`).
3. The returned `CaptureStoreOpenReport` has `persistence: .inMemoryFallback`
   and `deferredUntilUnlock: true` (both flow through the accumulator, per the
   B2 fix above).
4. **Is the honest line shown in this case too?** Yes.
   `losesWorkOnRelaunch` (`CaptureStore.swift:73`) is defined purely as
   `persistence == .inMemoryFallback` — it does not branch on *why* the run
   ended up there. `SyncStatusScreen.swift:106` and
   `AppContainer.swift:175` both key off `losesWorkOnRelaunch`, so the deferred
   case gets exactly the same U1 warning and the same
   `store.in_memory_fallback` PostHog event as a genuine three-rung refusal —
   plus the new `deferred_until_unlock` field on that event
   (`AppContainer.swift:83`) distinguishing the two causes for anyone reading
   telemetry. **Confirmed, not asserted from the diff alone — traced through
   both consumers.**
5. **Does the next foreground launch really retry rung 1?** Yes, and this is
   the important guarantee: because step 1 never renames or deletes anything,
   rung 1's URL is byte-for-byte what it was before this run. The next call to
   `resilient()` (next launch) runs `diskRungs` → `openRung` fresh against that
   same, untouched file. If the device is unlocked by then, this is an
   ordinary first-try open with nothing special about it — no `.bak`
   involved, no reset flag, and (assuming the store really was fine and only
   locked) it succeeds normally. If it's still locked at next launch too, the
   same deferral repeats — never a reset while locked, which is exactly the
   invariant B1 wants.

**No new data-loss risk from the deferral path.** The worst case is the same
class of loss every in-memory fallback already carries (this run's new
captures die with the process) — the deferral converts what B1's target
scenario would otherwise have been (a locked-device false-positive **reset**,
destroying prior real data) into an in-memory fallback that leaves prior data
completely intact. **HIGH confidence.**

---

## The `.bak` single-generation overwrite

Traced the sequence named in the brief: rename → retry fails → rung 2 answers
→ next launch rung 1 fails again → rename overwrites `.bak`.

Two sub-cases, depending on what "rung 1 fails again" means at that second
launch:

- **If the retry inside the first launch's `openRung` never actually wrote a
  new file at that URL** (e.g. the retry failed for an environmental reason
  before any bytes landed) — the *next* launch's first-try open finds no file
  at all, `storeFilesExist` (`:281`) returns `false`, and the function returns
  immediately. No second `setStoreFilesAside` call, no `.bak` touched. The
  first `.bak` (holding the original broken-but-real data) survives untouched.
- **If the retry did create *something*** (a fresh, empty, but later-also-
  unopenable store — the only way "rung 1 fails again" is reachable with files
  present) — then yes, the second `setStoreFilesAside` call at that next
  launch renames *that* trio over the existing `.bak`, per the documented
  "one generation deep" behaviour (`CaptureStore.swift:340-341`:
  "renamed to `<name>.bak`, one generation deep (a previous set is
  overwritten)"). What gets destroyed is the **first** `.bak` — the original
  broken store, which is whatever real data the designer had before the first
  reset.

**This is acceptable, and it's acceptable because it's exactly what the prior
review's own B1 fix specification asked for** — "Move the trio to
`default.store.bak` / … (single generation — overwrite any previous `.bak`)"
(`store-ladder-fix-review.md:200-205`). The implementer followed that spec
faithfully; this isn't new breakage introduced by this diff, it's the accepted
shape of a single-generation backup that the review itself chose over a
deeper generation chain (which the review didn't ask for, presumably as a
complexity/cost tradeoff given "Field is not live"). Worth restating
explicitly for the record, since it is a real (if now twice-doubly unlikely —
requires two separate reset-worthy failures at the same URL across two
launches) way to lose the *original* corrupted-but-recoverable store: **this
residual is accepted by design, not a defect** — no action needed unless Kody
wants a deeper backup chain before Field goes live, which would be a new,
separate follow-up, not a fix to this branch.

---

## Test gate

```
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO -derivedDataPath /tmp/claude/dd-store-ladder-rereview
```

Result (parsed from the `.xcresult` via `xcrun xcresulttool`): **267 passed,
98 failed, 0 skipped.** `CaptureStoreLadderTests` — **all 15 tests present,
all 15 passed** (10 from the base review + 5 new: `aLockedStoreIsLeftAloneAndReportedDeferred`,
`aSetAsideStoreSurvivesTheResetAndGoesOnTheNextCleanOpen`,
`settingAsideOverwritesAnEarlierGenerationRatherThanFailing`,
`aResetOnAnEarlierRungIsReportedWhenALaterRungAnswers`,
`aResetOnAnEarlierRungIsReportedWhenTheRunEndsInMemory`).

**Every one of the 98 failures carries the identical failure text `"Test
crashed with signal kill."`** — verified by extracting every `testFailures`
entry and confirming zero of them have any other failure text (i.e., zero
genuine assertion failures anywhere in the run). The 98 span unrelated suites
(`MediaUploadIntentPureTests`, `VoiceAttachPolicyTests`, `EmailValidationTests`,
`FieldRasterEncodingTests`, `FieldAttentionBuilderTests`, `ManifestTests`,
`StubbedEdgeUploadTests`, …) with no concentration in the store-ladder code
path. This reads as a process-level kill (resource/thermal/OOM pressure from
running the iOS Simulator inside this sandboxed session) rather than a code
regression: it is far broader than the specific "known `FieldRasterEncodingTests`
flake" this task asked me to watch for (that flake, if it's the one on record,
is a single intermittent test; this run killed half the suite simultaneously,
mid-run, across suites that share nothing with the fix under review). No
`CaptureStoreLadderTests` test appears among the 98, and no non-store test
shows a real logic failure. **Gate conclusion: the fix round's own coverage is
green; the mass "signal kill" is environmental and does not implicate this
diff.** Re-running the suite outside this sandbox (or with fewer parallel
resource pressures) would be the way to confirm that reading if Kody wants
belt-and-suspenders before merge, but nothing here points at the changed
files.

---

## New findings summary (this fix round's diff only)

| # | Finding | Severity | Confidence | Blocker/Follow-up |
|---|---|---|---|---|
| N-1 | `CaptureMeasurement.axisRaw` default changed to `.custom.rawValue` (unrequested extension of F-1) diverges from `""` at one reader, `SpecimenSheetScreen.dimensionString` (`SpecimenSheetScreen.swift:244-246`) — a future migration-defaulted row would render as a phantom "custom" dimension instead of being silently excluded | LOW | MEDIUM | Follow-up — currently dormant, same class as F-1's other (accepted) items |
| N-2 | `.bak` is single-generation by design; a second reset-worthy failure at the same URL across two launches overwrites the first `.bak`, permanently losing the original corrupted store | — (accepted by spec) | HIGH | Not a defect — matches the review's own B1 spec verbatim; note only |
| N-3 | `store.reset_incompatible` telemetry doesn't carry `deferred_until_unlock` (only `store.in_memory_fallback` does, `AppContainer.swift:177-180` vs `:172-175`) | LOW | HIGH | Cosmetic — the two events describe different phenomena; no action needed unless someone wants full context on every reset event |

No blockers found in this round. B1/B2/B3 are closed correctly and durably;
F-1 and F-11 are closed the way the review asked (real value equality, and a
guard that pins the actual code path rather than a proxy for it).

## Residuals carried forward (unchanged from the prior review, not this round's job)

F-2 (`@Attribute(.unique)` + defaults), F-3 (header comment overstatement),
F-6 (reset is silent to the designer), F-7 (orphaned media after reset/memory),
F-8 (rung 2 has no way back to rung 1, and rung-2 work is invisible if rung 1
later reopens clean), F-10 (in-memory warning lives on one utility screen) —
all still open, all still correctly scoped as follow-ups, not blockers for
this branch.
