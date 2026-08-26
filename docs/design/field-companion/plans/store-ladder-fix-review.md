# Merge-readiness review — `fix/field-store-ladder`

- **Branch** `fix/field-store-ladder` · head `d425ebff1` · base `fffe4908c`
- **Worktree** `/Users/kody/Code/patina-merged/.claude/worktrees/field-store-ladder`
- **Reviewed** 2026-08-25 · read-only (no edits, no git mutations to the branch)
- **Commit** `fix(field): store ladder creates directories, resets incompatible stores, and never falls to memory silently` — single commit, Conventional Commit, correct scope.

## Verdict

**MERGE WITH FIXES.** The diagnosis is right, the rung-2 fix is right, and the
54 defaults are behaviour-neutral against every existing initializer. Three
things must change before merge; four more are follow-ups.

**Blockers (small, all in files this branch already touches):**

| # | Fix | Where |
|---|-----|-------|
| B1 | Rename the store files to `.bak` instead of deleting them, and refuse to reset while protected data is unavailable | `CaptureStore.swift:252` (`removeStoreFiles`), `:213` |
| B2 | Accumulate `didReset` across rungs — a rung-1 deletion followed by a rung-1 failure is currently reported as "no reset happened" | `CaptureStore.swift:139-165` |
| B3 | Rewrite the in-memory warning copy — it currently tells the designer to close the app, which is the one action that destroys the work she still has | `SyncStatusScreen.swift:117-119` |

**Gate evidence (run in this worktree, separate derived data):**

```
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO -derivedDataPath /tmp/claude/dd-store-ladder
→ Test run with 360 tests in 52 suites passed  (exit 0)
→ Suite CaptureStoreLadderTests passed — all 10 tests present and green
```

Note the gate script `apps/mobile/Capture/scripts/capture-gate.sh` re-runs
`ruby scripts/generate_project.rb` first; I invoked `xcodebuild` directly so the
worktree's `project.pbxproj` was not mutated.

---

## 1. Defaults are behaviour-neutral (54 of them)

Counted: 33 in `Specimen.swift`, 10 in `ScanUploadRecord.swift`, 11 in
`SiteRequestOutboxRecord.swift` — 54, matching the claim.

**Construction-time behaviour: unchanged. HIGH confidence.** Every `@Model`
type declares an explicit `init` that assigns each defaulted property, and
`@Model` generates no memberwise init, so no call site can now observe a
default. Verified per initializer:

- `Specimen.init` (`Specimen.swift:148-180`) assigns all 20 defaulted properties.
- `CapturePhoto.init` (`:199-219`), `CaptureMeasurement.init` (`:232-246`),
  `CaptureProjectRef.init` (`:259-272`) assign all of theirs.
- `ScanUploadRecord.init` (`ScanUploadRecord.swift:45-63`) assigns all 10.
- `SiteRequestOutboxRecord.init` (`SiteRequestOutboxRecord.swift:84-98`) assigns all 11.

No Codable/wire behaviour changes: none of the six `@Model` classes is itself
`Codable`; the array/dictionary element types (`ScanArtifactUploadState`,
`VenueStamp`) are untouched. **HIGH confidence.**

**Relationships correctly carry no defaults. HIGH confidence.**
`Specimen.photos` / `Specimen.measurements` (`Specimen.swift:79-82`) are
non-optional `[CapturePhoto]` / `[CaptureMeasurement]` and were deliberately
left alone; `CapturePhoto.specimen` / `CaptureMeasurement.specimen` are already
optional. The guard test iterates `entity.attributes` only, which excludes
relationships — correct, since SwiftData does not require to-many relationship
defaults for lightweight migration.

### F-1 · Migration defaults for enum raw strings diverge from what the inits assign — MEDIUM severity, HIGH confidence

`Specimen.swift:71,126,127,128,195,225,228`, `ScanUploadRecord.swift:37`,
`SiteRequestOutboxRecord.swift:66`.

A default on a `@Model` property is two things at once: the value the compiler
uses when the property is not assigned, *and* the value CoreData writes into
every pre-existing row when that column is added by a lightweight migration.
The chosen values are `""`, which no initializer ever produces:

| Property | New default | What the init assigns |
|---|---|---|
| `Specimen.categoryRaw` | `""` | `SpecimenCategory.unknown.rawValue` |
| `Specimen.destinationRaw` | `""` | `CaptureDestination.undecided.rawValue` |
| `Specimen.statusRaw` | `""` | `CaptureStatus.draft.rawValue` |
| `Specimen.lifecycleRaw` | `""` | `"captured"` |
| `CapturePhoto.captureModeRaw` | `""` | `CameraMode.photo.rawValue` |
| `CaptureMeasurement.sourceRaw` | `""` | `MeasureSource.manual.rawValue` |
| `ScanUploadRecord.statusRaw` | `""` | `CaptureTransferPhase.queued.rawValue` |
| `SiteRequestOutboxRecord.stateRaw` | `""` | `SiteRequestOutboxState.queued.rawValue` |
| `ScanUploadRecord.scanSchemaVersion` | `0` | `3` |

For the Specimen family this is *currently* harmless: every typed accessor
falls back to exactly the init's value
(`Specimen+Accessors.swift:11,15,19` — `?? .unknown`, `?? .undecided`,
`?? .draft`) and `ScanUploadRecord.transferState` falls back to `?? .queued`
(`ScanUploadRecord.swift:74`).

**`SiteRequestOutboxRecord.stateRaw` is the exception and is a real defect in
waiting.** Its accessor is `SiteRequestOutboxState(rawValue: stateRaw) ?? .failed`
(`SiteRequestOutboxRecord.swift:76`). Any row that ever receives the migration
default reads back as **`.failed`**, not `.queued` — a guest delivery silently
marked dead. Same class of divergence for `scanSchemaVersion = 0`, which would
be sent to `room_scans.scan_schema_version` as an out-of-domain value.

None of these columns is absent from any store on disk today, so nothing is
broken right now. But the whole point of this change is to make the *next*
column addition safe, and it bakes in the wrong values for that case.

**Fix (follow-up, not a blocker):** make each default equal the init's value —
`= SpecimenCategory.unknown.rawValue`, `= CaptureStatus.draft.rawValue`,
`= SiteRequestOutboxState.queued.rawValue`, `= 3`, etc. This costs nothing and
removes the whole class.

### F-2 · `@Attribute(.unique)` properties now carry defaults — LOW severity today, MEDIUM if a new entity lands, HIGH confidence

`Specimen.swift:49,185,224,252`, `ScanUploadRecord.swift:22`,
`SiteRequestOutboxRecord.swift:59`.

Six unique attributes now have defaults, four of them `UUID()` and one `""`.
An inline default is evaluated once when the entity description is built, so
if a unique column were ever *added* to an entity that already has rows, every
row would receive the identical value and the unique constraint would be
violated on migration. That cannot happen for these six (they are the primary
keys of their entities and have always existed), but the guard test
`everyMandatoryAttributeCarriesADefault` now *requires* a default on any future
unique attribute, which is precisely the shape that would break.

**Fix (follow-up):** exempt `@Attribute(.unique)` from the guard, or assert
positively that a unique attribute is only ever introduced with its entity.
Comment the invariant either way.

### F-3 · The header comment overstates and misnames its guard — LOW severity, HIGH confidence

`Specimen.swift:9-13`. "EVERY non-optional stored property here carries an
inline default" is false — `photos` and `measurements` do not (correctly). And
"CaptureStoreSchemaTests enforces this" names a test that does not exist; the
test is `CaptureStoreLadderTests.everyMandatoryAttributeCarriesADefault`
(`CaptureStoreLadderTests.swift:32`). Say "non-optional *attribute*" and name
the real test.

---

## 2. Reset-once safety

**Never fires on a first open. HIGH confidence.** `openRung`
(`CaptureStore.swift:196-227`) only reaches the reset after a throw, and
`removeStoreFiles` returns `false` when nothing existed
(`:252-271`), which short-circuits at `:213`. Covered by
`aFirstOpenNeverClaimsAReset`.

**Never runs in MOCK mode. HIGH confidence.** `resilient` returns at `:123-126`
before any rung when `persistent == false`, and `AppContainer` passes
`persistent: AppConfiguration.runsRealServices`
(`AppContainer.swift:75`).

**Never runs against a real user store in tests. HIGH confidence.** Every test
that reaches `openRung`/`removeStoreFiles` builds a URL under
`NSTemporaryDirectory()` (`CaptureStoreLadderTests.swift:26-30`). The only test
that touches an App Group path computes a URL and never opens or deletes
(`:145-152`).

**The error really is opaque. CONFIRMED from the test run.** The log shows
CoreData raising `NSCocoaErrorDomain Code=259` while the value SwiftData
*throws* is `SwiftData.SwiftDataError error 1` with nothing attached. The
branch's claim at `CaptureStore.swift:187-195` is accurate: there is nothing to
branch on in the thrown error.

### F-4 · BLOCKER B1 — "any open failure of an existing file → delete" can fire on a background relaunch, and deletes unrecoverably — HIGH severity, MEDIUM-HIGH confidence

`CaptureStore.swift:213`, `:252-271`.

The app installs a background `URLSession` with
`sessionSendsLaunchEvents = true` and `isDiscretionary = false`
(`FieldBackgroundScanUploader.swift:100-102`), and `CaptureApp` builds
`AppContainer()` — and therefore runs the whole ladder — as a stored property of
the `App` struct (`CaptureApp.swift:16`). So iOS can relaunch Field in the
background, with no UI on screen, and run the ladder. If that relaunch lands
after a reboot but before the first unlock, the store's default protection class
(`NSFileProtectionCompleteUntilFirstUserAuthentication`) makes the file
unreadable, `ModelContainer` throws the same opaque error as a schema mismatch,
and the branch deletes the designer's captures. She sees nothing: no UI is
running, and the honest line lives on a screen she cannot reach.

That is not what Kody's ruling licenses. "Field is not live, a fresh install may
reset the store" licenses *resetting a store the app genuinely cannot use*. It
does not license deleting a perfectly good store because the OS relaunched the
app at an inconvenient moment.

A schema-hash gate is the theoretically correct answer
(`NSPersistentStoreCoordinator.metadataForPersistentStore(type:at:)` →
compare `NSStoreModelVersionHashes` against the current model), but it is a lot
of machinery for a not-live app. **The minimal safe shape is two changes to
`removeStoreFiles`:**

1. **Refuse to reset when protected data is unavailable.** Guard at `:213`:
   ```swift
   guard UIApplication.shared.isProtectedDataAvailable else {
       outcome.failures.append("\(rung): store locked (pre-first-unlock); not resetting")
       return outcome
   }
   ```
   (`isProtectedDataAvailable` is `@MainActor`; `openRung` already inherits
   `CaptureStore`'s `@MainActor` isolation, so this is a plain read.)
2. **Rename, do not delete.** Move the trio to `default.store.bak` /
   `-wal.bak` / `-shm.bak` (single generation — overwrite any previous `.bak`),
   and delete the `.bak` set on the next clean open. Cost: one `moveItem` per
   file and a few lines in the success path. Benefit: a store deleted by
   mistake is recoverable from the container, and `store.reset_incompatible`
   stops being an irreversible event.

Everything else about the reset shape is sound: it fires exactly once
(`:213-226`), it takes the whole SQLite trio, and it reports honestly when the
retry also fails.

### F-5 · BLOCKER B2 — a rung-1 reset that does not save rung 1 is never reported — MEDIUM severity, HIGH confidence

`CaptureStore.swift:139-165`.

```
if <group provisioned> {
    let outcome = openRung(rung1)
    failures += outcome.failures
    if let container = outcome.container { return … didResetIncompatibleStore: outcome.didReset … }
}                                    // ← rung 1's didReset is dropped here
let outcome = openRung(rung2)
… didResetIncompatibleStore: outcome.didReset …   // rung 2's, which is false
```

If rung 1 deletes the App Group store and the retry *still* fails, the App
Group store is gone but the report that reaches `AppContainer.reportStoreOpen`
says `didResetIncompatibleStore == false`, so `store.reset_incompatible` never
fires. The evidence survives only as prose inside `failures`
("App Group after reset: …"). Under "degrade honestly", the one path that
actually destroyed data is the one that goes unreported.

**Fix:** hoist a `var didReset = false` next to `failures` at `:128`, OR it with
each rung's outcome, and pass the accumulated value into all three reports
(`:145`, `:163`, and add it at `:175`). Three lines.

### F-6 · The reset is loud to PostHog and silent to the designer — MEDIUM severity, HIGH confidence

`AppContainer.swift:150-170`, `SyncStatusScreen.swift:104-112`.

`store.in_memory_fallback` gets a UI line; `store.reset_incompatible` gets none.
But the reset is the *more* consequential of the two: in-memory loses this
run's work, the reset loses everything from every previous run. A designer whose
29-July store was wiped on launch sees an empty library and no explanation.

**Fix (follow-up, and cheap once B1 lands):** carry
`didResetIncompatibleStore` onto the same U1 line — "Some earlier work on this
device could not be reopened and was set aside." With the `.bak` from B1 this
is even truthful about recovery.

### F-7 · A reset or an in-memory run strands media forever — MEDIUM severity, HIGH confidence

`CaptureStore.swift:662-670` (`mediaDirectory`), `:766-800`
(`sweepMediaRetention` / `receiptedMediaFiles`).

Media lives in the App Group container, independent of the store. The retention
sweep can only delete a file whose owning `Specimen` row carries a remote
receipt. After a reset (rows gone, files remain) or an in-memory run (files
written, rows never persisted), those bytes have no owning row, so the sweep can
*never* touch them — they sit against the 512 MB soft cap permanently.

**Fix (follow-up):** when `didResetIncompatibleStore` is true, or on the first
clean open after an in-memory run, sweep `CaptureMedia` for files with no
matching row. Not this branch's job, but this branch is what makes it reachable.

---

## 3. Rung 2 path

**The diagnosis is correct and the fix is correct. HIGH confidence.**
`ModelConfiguration()` defaults `groupContainer: .automatic`, which resolves
into the App Group when the entitlement is present — so the old rung 2 reopened
the file rung 1 had just failed on. `applicationSupportStoreURL()`
(`CaptureStore.swift:230-234`) uses
`.applicationSupportDirectory/.userDomainMask[0]/default.store`, which on iOS is
`<app container>/Library/Application Support/default.store` — the app's own
container, never the group. `ModelConfiguration(url:)` sets no group container.
The parent directory is created first (`:199`, `:236-247`), which matters because
`Library/Application Support` does not exist by default on iOS and CoreData does
not create intermediate directories.

**No permanent data split via extensions.** The Capture project has exactly four
targets — two frameworks, one unit-test bundle, one application
(`project.pbxproj`, `productType` entries). There is no Share or Widget
extension today, so the "shared with the Share/Widget extensions" language at
`CaptureStore.swift:6` and `:112` is aspirational. Nothing else in the app opens
a container directly (`CaptureStore.inMemory()` is preview-only, 12 call sites,
all `#Preview` blocks).

**Rung 2 has no collision with the site-scan bundles.** `SiteScanBundleHome`
keys bundles as `SiteScans/…` relative to Application Support; `default.store`
is a sibling.

### F-8 · The app can live on rung 2 forever, and rung-2 work becomes invisible on the next launch — MEDIUM severity, HIGH confidence

`CaptureStore.swift:121-176`.

There is no migration back to rung 1 and no memory of which rung was used. The
sequence that bites: rung 1 fails twice (its store is now deleted), rung 2
opens, the designer captures a day's work into Application Support. Next
launch, rung 1 opens cleanly — it is a fresh empty store now — and her day's
work sits in a file nothing will ever read again. She is not told; the report
says `.appGroup`, which is not a degradation.

**Fix (follow-up, choose one):**
- *Simplest:* persist the chosen rung in `UserDefaults`. On a launch where the
  stored rung is `applicationSupport` and rung 1 now opens, do not silently
  prefer rung 1 — either stay on rung 2, or report `.applicationSupport` with a
  U1 line saying earlier work is in a separate place.
- *Better long-term:* since there are no extensions yet, consider whether the
  App Group is buying anything at all. If it is not, rung 1 could simply become
  the Application Support store and the whole class disappears.

Given the not-live ruling this is a legitimate follow-up, not a blocker — but it
should be written down before Field goes live.

---

## 4. Loud fallback

**Event names fit the house convention. HIGH confidence.** The codebase uses
`namespace.snake_case_action` (`account.sign_in.failed`, `scan.upload_rejected_finish_later`,
`siteScan.anchor.add`); `store.reset_incompatible` and `store.in_memory_fallback`
(`AppContainer.swift:157,165`) match.

**Flag-independent. HIGH confidence.** `SyncStatusScreen.swift:106` reads
`store.openReport.losesWorkOnRelaunch` directly — no `featureFlags` reference.
Correct, and the comment at `:101-103` says why.

**Placement is right. MEDIUM confidence.** The outbox-depth strip is the one
place a designer looks to ask "is my work safe", so the line belongs next to
the depth. But it is the *only* place it appears, and U1 is a utility screen
she may never open during a showroom visit — see F-10.

**No PII leaks into telemetry. HIGH confidence.** `failures` entries are
`"\(rung): \(error.localizedDescription)"`; the test run confirms SwiftData's
`localizedDescription` is the generic "The operation couldn't be completed.
(SwiftData.SwiftDataError error 1.)" with no path. Container paths go to
`os.Logger` only (`:203`, `:215`), never to `analytics.event`.

### F-9 · BLOCKER B3 — the warning copy tells the designer to do the one thing that destroys her work — HIGH severity, HIGH confidence

`SyncStatusScreen.swift:115-119`:

> "This device could not open its capture store, so nothing here is saved.
> Close and reopen Patina Field before you rely on it."

Three problems:

1. **The instruction is actively harmful.** On an in-memory fallback, the
   captures from this run exist only in process memory. "Close and reopen" is
   the single action that deletes them. She should be told the opposite: keep
   the app open and get the work off the device.
2. **It promises a recovery that will not work.** By the time rung 3 is
   reached, both on-disk rungs have already been reset and retried. A relaunch
   re-runs the same ladder against the same conditions and lands in memory
   again. The doc comment at `:113-114` says "There is no recovery she can
   perform, so this promises none" — but the copy promises one.
3. **Brand voice.** "capture store" leads with mechanism; the voice is
   plain-spoken and outcome-first ("Technology is the silent enabler"). No "AI"
   language present — that rule is satisfied.

**Suggested replacement** (no mechanism, no false promise, no harmful
instruction):

> "Nothing you capture on this iPhone is being kept right now. Keep Patina
> Field open and send what you have — anything still here will be gone once the
> app closes."

Whatever the final wording, the `accessibilityIdentifier`
`u1.sync.in-memory-warning` (`:110`) is fine and follows the `<screen>.<element>`
pattern.

### F-10 · The capture path still proceeds silently while in memory — MEDIUM severity, HIGH confidence

`SyncStatusScreen.swift:106` is the only consumer of `openReport` in the whole
app (verified by grep: `AppContainer.swift:150` and `SyncStatusScreen.swift:106`,
nothing else). A designer who captures a showroom and never opens U1 is told
her work is saved at every step — S4 terminal, "Saved to Patina Field"
(`ResilienceScreens.swift:29`), the V3 "Saved" button state
(`V3SpecimenDetailScreen.swift:204`).

**Fix (follow-up):** a persistent app-level banner in `RootView` while
`losesWorkOnRelaunch` is true. This is the honest reading of "degrade honestly,
never silently" — a warning on one utility screen is closer to "quietly" than
to "never silently".

---

## 5. Tests

Ten tests, all present, all green. Non-vacuity, one by one:

| Test | Non-vacuous? | Note |
|---|---|---|
| `everyMandatoryAttributeCarriesADefault` `:32` | **Yes** | The real guard. Reverting any of the 54 defaults fails it. |
| `opensAStoreWrittenBeforeAnEntityExisted` `:59` | Yes for its own rule, **but not for the shipped bug** | It exercises *entity* addition. A new entity has no source rows, so no mandatory-attribute validation runs — this test passes with every default reverted. Coverage gap, not a defect; the file's own comment at `:48-58` is honest about it. |
| `aRungCreatesItsParentDirectoryBeforeOpening` `:78` | **Yes** | Remove `createParentDirectory` and `outcome.container` is nil (CoreData does not create intermediates), failing `:88`. |
| `resetsAnUnopenableStoreOnceAndComesBackEmpty` `:96` | **Yes** | Drives the real 259/`SwiftDataError 1` path — visible in the test log. |
| `aFirstOpenNeverClaimsAReset` `:111` | **Yes** | Guards the `removedAnything` short-circuit. |
| `removingStoreFilesTakesTheWholeSqliteTrio` `:121` | **Yes** | |
| `removingStoreFilesReportsFalseWhenThereWasNothingToRemove` `:136` | **Yes** | |
| `applicationSupportRungIsNotTheAppGroupStore` `:143` | **No — see F-11** | |
| `onlyTheFallbackRungClaimsLostWork` `:152` | Yes, but trivial | Restates `losesWorkOnRelaunch`'s one-line body. |
| `aMockModeStoreIsInMemoryByDesignAndNotAFailure` `:164` | **Yes** | Guards mock mode never reporting a failure. |

**No test touches the developer's real App Group store. HIGH confidence.** The
only App Group reference computes a URL (`:145-146`) and never opens or deletes.

**The test-order caveat is sound. HIGH confidence.** The comment at `:48-58`
is correct: SwiftData resolves entities by name process-wide and nesting does
not qualify the name, so a two-version `@Model` pair in one build would pass or
fail on test order. Guarding the property-level case reflectively over
`CaptureStore.schema.entities` instead of with a fixture is the right call, and
the out-of-band verification note is the honest way to record what a unit test
cannot express.

### F-11 · The rung-2 regression guard does not actually guard rung 2 — MEDIUM severity, HIGH confidence

`CaptureStoreLadderTests.swift:143-151`. The test asserts that
`applicationSupportStoreURL()` differs from the App Group store URL. But nothing
asserts that `resilient` *uses* `applicationSupportStoreURL()`. Revert
`CaptureStore.swift:155` to `ModelConfiguration()` — reintroducing the exact
shipped bug — and this test still passes.

**Fix (follow-up):** pin the trap itself, which is the durable assertion:

```swift
@Test func theDefaultConfigurationResolvesIntoTheAppGroup() {
    // This is WHY rung 2 must be addressed by explicit URL.
    #expect(ModelConfiguration().url
            == ModelConfiguration(groupContainer: .identifier(CaptureStore.appGroupID)).url)
}
```

That fails loudly if Apple ever changes the default — which is the one thing
that would make the current rung-2 comment wrong.

### F-12 · `applicationSupportRungIsNotTheAppGroupStore` reads a group-container URL without the guard `resilient` insists on — LOW-MEDIUM severity, LOW-MEDIUM confidence

`CaptureStoreLadderTests.swift:145-146` constructs
`ModelConfiguration(groupContainer: .identifier(…)).url` directly.
`CaptureStore.swift:130-135` states that SwiftData *traps* (`assertionFailure`,
uncatchable) when the group is not provisioned, and gates on
`containerURL(forSecurityApplicationGroupIdentifier:) != nil` first. The test
does not gate. It passes on this machine's simulator, where the entitlement
resolves, but on a host without it this would take the whole 360-test run down
rather than failing one test. Mirror the same `containerURL != nil` guard, or
skip the test when it is nil.

---

## 6. Interplay with Wave 3 (`feat/field-companion-w3`)

Merge-base `695addb5f`. Dry-run three-way merge (`git merge-tree`, read-only):

**`Specimen.swift` merges CLEANLY.** Wave 3's insertions land after
`placementRetryCount` and after `CaptureProjectRef.ownerWorkspaceID`; this
branch's edits are far enough away that git resolves them without a marker.
**HIGH confidence** — verified, not predicted.

**Wave 3 needs no defaults and the guard will still pass.** Every new stored
property on `feat/field-companion-w3` is optional: 11 on `Specimen`
(`visitKindRaw` … `placementReplayPending`), 7 on `CaptureProjectRef`
(`specRoomsData` … `filedCaptureCount`). No new `@Model` type
(`FieldVisit.swift` adds plain `Codable` structs `CaptureCachedRoom` /
`CaptureCoordinate`, stored as `Data?`). So Wave 3 is already
lightweight-migration-safe, and `everyMandatoryAttributeCarriesADefault` **will**
catch any non-optional addition Wave 3 or its successors make. **HIGH confidence.**

**Conflicts, all mechanical:**

| File | Hunks | Resolution |
|---|---|---|
| `Capture.xcodeproj/project.pbxproj` | 20 | Both branches ran `generate_project.rb`, which mints fresh random UUIDs. Do **not** hand-merge — take either side and re-run `ruby apps/mobile/Capture/scripts/generate_project.rb`. |
| `xcschemes/Capture.xcscheme`, `CaptureKit.xcscheme` | 1 each | Same cause: the `CaptureTests` `BlueprintIdentifier`. Regenerate, then commit whatever the generator emits. |
| `App/Composition/AppContainer.swift` | 1 | Trivial: both append one statement at the end of `init()`. Keep both — `projectCache = CaptureProjectCache(...)` then `Self.reportStoreOpen(...)`. |

**Recommended order:** merge this branch to `main` first (it is the smaller,
foundational one), then rebase Wave 3 onto it. Wave 3 authors should re-run the
project generator as the *first* step of the rebase, not as a fixup afterwards.

---

## 7. Hygiene

All clean. **HIGH confidence.**

- **pbxproj regenerated correctly.** Comparing the `PBXFileReference` path lists
  across `fffe4908c` and `d425ebff1`: 272 → 273 entries, and the diff is
  exactly one line — `+ CaptureStoreLadderTests.swift`. All 30 pre-existing test
  files appear twice in the raw diff purely because the generator re-mints UUIDs;
  no file was dropped.
- **`Secrets.swift` survived the regen.** Still referenced (`CA21EE30…
  /* Secrets.swift in Sources */`), same count as the base. The known
  fresh-worktree regen trap (`feedback_capture_pbxproj_regen_worktree_trap`) did
  not bite here.
- **Scheme edits are required, not stray.** Both `.xcscheme` diffs are the
  single `BlueprintIdentifier` line for the regenerated `CaptureTests` target.
- **No stray files.** 10 files touched, all accounted for. Nothing under
  `artifacts/`, `docs/`, or `.build/`.
- **Conventional Commit**, correct type and scope, subject describes the change
  honestly.
- **No new `try!`, no new force-unwraps** on the ladder path;
  `preconditionFailure` at `CaptureStore.swift:277` is carried over from the
  base, not introduced.

---

## On-device verification after merge

The gate proves the schema invariant and the ladder mechanics. It cannot prove
the thing that actually broke, because it cannot produce a real 29-July store or
a real App Group. These are the passes Kody's iPhone owes:

1. **The regression itself.** Install the pre-fix build (or a build whose
   `ScanUploadRecord` lacks `retryCount`), capture 2–3 specimens, then install
   the merged build over it. Expected: the app opens on rung 1, the old rows are
   still there, `retryCount` reads `0`. Watch for
   `[store] Store opened on App Group at …` in the device log
   (`log stream --predicate 'subsystem == "cloud.patina.field"'`, and per the
   device-log-capture note, search for `Patina.debug.dylib` with `.info` level).
   A `Reset incompatible store` line here means the defaults did **not** do
   their job and something else is wrong.

2. **The reset path, deliberately.** With B1's `.bak` rename in place: corrupt
   the App Group store on-device (or install over a genuinely incompatible
   build), launch, and confirm — (a) the app comes up empty rather than in
   memory, (b) `default.store.bak` exists in the group container, (c)
   `store.reset_incompatible` appears in PostHog with a non-empty `failures`
   string, (d) after B2, that event fires even when rung 1's retry also fails.

3. **The in-memory line, seen by a human.** Force rung 3 (a debug switch, or a
   build with the App Group entitlement stripped *and* Application Support made
   unwritable), open U1 Sync, and read the warning as a designer would. Confirm
   the revised B3 copy does not tell her to close the app, and that
   `u1.sync.in-memory-warning` is reachable via accessibility.

4. **Background-relaunch safety (the F-4 case).** Start a site-scan upload,
   background the app, reboot the phone, and let the background session relaunch
   Field **before unlocking**. Expected after B1: the log shows
   `store locked (pre-first-unlock); not resetting`, and after unlocking, the
   store is intact. This is the pass that proves the blocker fix actually
   closes the hole.

5. **Rung 2 is a different file.** One-off: with the app on rung 2, confirm
   `Library/Application Support/default.store` exists in the app container and
   that the App Group store is a distinct file. Then relaunch and note whether
   the app returns to rung 1 — this is F-8, and the observation should be
   recorded even if the fix is deferred.

6. **Media orphans (F-7).** After the reset drill in (2), check the
   `CaptureMedia` directory size in the group container. If the bytes from the
   deleted rows are still there, F-7 is confirmed on-device and should be
   docketed before Field goes live.
