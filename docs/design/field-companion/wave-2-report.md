# Field Companion · Wave 2 report — "Nothing the app says about a capture is a lie"

**Branch:** `feat/field-companion-w2` · **push owed — awaiting orchestrator** · **merge-base with main:** `6d91eb1b6875a31e8a516c256d7c3901a396f430` · **branch head:** `f41150e37f4e9bff0dc80c025e9b13ce5060cb27`

**Gates:** build ✔ · tests ✔ (350 tests in 51 suites) · lint ✔ · `GATE EXIT=0` · separate `swiftlint lint --quiet --strict` → `lint exit=0`

**Device pass: attempted once, blocked. No criterion is device-verified.** Details in
`waves/wave-2/device-pass.md` and in the Device pass section below.

`git push` fails from the agent shell on this machine's sandbox proxy. That is a shell limitation,
not a state of the work: the branch is complete and the orchestrator pushes it. Nothing is blocked.

---

## Gates

Run on the finished branch at `f41150e37`, in the wave worktree, against a per-worktree
DerivedData path (other live worktrees also build Capture).

```
── generate_project.rb ──
── build (Capture) ──
✔ build
── test (CaptureKit) ──
✔ tests
── swiftlint --quiet --strict ──
✔ lint
GATE EXIT=0
```

Then, separately, per constraint C2 — a green `all` never proves lint ran, because
`capture-gate.sh lint` no-ops and still exits 0 when swiftlint is absent:

```
/opt/homebrew/bin/swiftlint
0.63.2
lint exit=0
```

**swiftlint actually executed.** The binary resolved at `/opt/homebrew/bin/swiftlint`, version
`0.63.2` printed, and `--quiet --strict` returned exit 0 with no output — which under `--strict`
means zero warnings as well as zero errors. `.swiftlint.yml`'s `included:` is `Capture`,
`CaptureKit`, `CaptureKitMocks`; `CaptureTests` is not linted, so none of this wave's new test
files could have tripped it either way.

**One reading trap worth recording for whoever runs this next.** `xcodebuild test` prints
`Executed 0 tests, with 0 failures` and then `** TEST SUCCEEDED **`. That line is the *XCTest*
counter, and it is not evidence of anything here: all 30 files in `CaptureTests/` are Swift
Testing (`import Testing`, 30 of 30; `import XCTest`, 0 of 30), which reports through a different
channel. The real count is on the Swift Testing summary line:

```
✔ Test run with 350 tests in 51 suites passed after 1.254 seconds.
** TEST SUCCEEDED **
```

Anyone grepping the gate log for `Executed [0-9]+ test` will conclude the suite is empty. It is
not. Grep `Test run with` instead.

**Sandbox note.** The first gate run failed inside the agent sandbox with `Operation not
permitted` against CoreSimulator and the DerivedData log store — `simdiskimaged crashed or is not
responding`, `permissionDenied` on package resolution. That is the sandbox, not the code; the
unsandboxed re-run is the result above. Every task in this wave hit the same thing.

---

## Task 0 — pre-flight against merged Wave 1

All four Wave-1 seam names were already present on merged `main`. Task 1's fallback path — adding
them here — was not needed and was not taken.

| Wave-1 name | Found as | Notes |
|---|---|---|
| `CaptureAnalytics.isFeatureEnabled` | already on main | Protocol requirement at `:18`; the fail-closed `{ false }` default at `:30`. Both present, so FC-R11's fail-closed seam holds without a Wave-2 edit. |
| `CaptureMediaMime.forFilename` / `.bucketAllowed` | already on main | Both present. |
| `VoiceRecordingPolicy.*` | already on main | All five members present. |
| `CaptureRoutingMemory.stamped(onto:)` | already on main | Present. |
| recorder flag call sites | two, both live | `VoiceNoteSheet.swift:70` and `SiteScanContextCapture.swift:45`. **The plan was wrong about the second one:** it said the call sits inside `toggleVoice()`; the literal call is in the `voiceCaptureEnabled` computed property. Same file, different member. |
| `SpeechVoiceNoteService.swift:7` | already true — **no edit** | Wave 1 had already replaced this header. Task 4 correctly made no change; the file is not in this wave's diff. |
| `OfflineQueueBanner` rendered on C1 | **yes** | `ViewfinderScreen.swift:43`. This decided Task 4 Step 3's wording — the banner is on the primary surface, so the primary wording shipped, not the fallback. |
| `wave-3-plan.md`'s `allCases` claim | **already withdrawn — nothing owed** | Wave 3's own Ruling 6 (`wave-3-plan.md:31`) had retracted it before this wave ran. The selector reads `CameraMode.viewfinderSelectable`, a literal. No Wave-3 plan edit is owed on this point. |

**Verdict: GO.** All four names present, baseline gate green, no fallback taken.

---

## What landed

Six commits across five tasks, plus the merge. No commit touches an iOS file outside the wave's
declared seams.

| Task | Commits | Outcome |
|---|---|---|
| 0 — pre-flight | *(no commit; the plan specifies none)* | GO |
| 1 — frozen seams + `FieldPlaceholderScreen` deletion | `13cf6a28f`, `1ac708735` | Spec ✅, Quality **Approved**, clean after one fix round |
| 2 — the real smart guess + S3 held at Inbox | `4a4da60a7`, `a54316f6a` | Spec ✅, Quality **PASS with findings**; all six fix-round findings addressed, two residuals parked (below) |
| 3 — delete `LowLightTorchOverlay` | `9021a4364` | Spec ✅, Quality **Approved, 0 findings** |
| 4 — stale headers | `86e369f10`, `5c757d3f2`, `621b521d3` | Spec ✅, 11 of 11 targets; clean after two fix rounds |
| 5 — sweep re-baseline | `fcc2c8365` | Spec ✅, Quality ✅, **0 findings** |
| merge of main's 00531 hotfix | `f41150e37` | Clean. No iOS file touched. |

The sweep is 72 built screens. `V0.visit`, `C6.voice` and `V4.visit-review` stay out deliberately:
their ids exist because the enum is a frozen seam edited once, but the screens are waves 3–4, and
a PNG of C1 filed under another screen's name is worse than a gap.

---

## Acceptance

| Criterion (plan §2, reworded 2026-08-24 to the provenance-only reading) | Evidence | Claim level |
|---|---|---|
| No capture ships a guess it did not compute | The two invented literals are gone from `applySmartGuess`; `HeuristicSmartGuessService` records only what the reader returned. Unit-covered by `SmartGuessTests`. Device steps 1 and 2 **not run**. | **compile-green + unit-verified**, not device-verified |
| `hasUnconfirmedGuess` is false for a photo the reader could not place, and for a capture with no guess at all — no confidence floor ships in wave 2 | `UnconfirmedGuessTests` passes in the 350. `SmartGuessConfidence` is deleted; `Specimen+Accessors.swift` untouched. Device step 2 **not run**. | **unit-verified**, not device-verified |
| A screenshot sweep includes the non-Pro context screen | `F1.context.png`, **581,327 bytes**, in a 72-screen sweep. Read independently by two readers. | **sim-verified** |
| Every frozen seam — including `FieldPlaceholderScreen`'s deletion and every `AppContainer.swift` header line — changed exactly once, in one commit, owner named | Task 1's `13cf6a28f`, owner in the commit body. The pbxproj diff is in the commit (C4). | **verified in the diff** |

**What that adds up to.** The wave's headline claim — nothing the app says about a capture is a
lie — is proved by *subtraction* at the unit level: the invented strings are deleted, and an
unplaceable label now writes nothing. That much is real and tested. The *addition* half — that
the reader, on a real camera, actually returns four different categories for four different
objects — is not proved at any level this wave. It is the whole point of device step 1, and device
step 1 did not run.

---

## Device pass

**Attempted once, 2026-08-25. Blocked at the build's destination check. No criterion is
device-verified.** Full record: `waves/wave-2/device-pass.md`.

Both LiDAR phones — Kody's Phone (iPhone 17 Pro Max, `00008150-00016C8A21DA401C`) and iPhone
(iPhone 13 Pro, `00008110-001630212231801E`) — are paired over **wifi only** with no WDA
installed. The signed Debug build (team `VP22LXHT7L`, never a `CODE_SIGNING_ALLOWED=NO` gate
product) resolved its packages and then failed:

```
xcodebuild: error: Timed out waiting for all destinations matching the provided
destination specifier to become available

	Available destinations for the "Capture" scheme:
		{ platform:iOS, arch:arm64, id:00008150-00016C8A21DA401C, name:Kody's Phone,
		  error:The developer disk image could not be mounted on this device. }
```

That is Wave 1's blocker word for word. Nothing was installed and no app was launched.

| # | Criterion | Result |
|---|---|---|
| 1 | Four real objects → four different categories, each badged as a read | **not run** — no device install; no simulator substitute exists, there is no real frame to read |
| 2 | Wall defect → no category recorded, S3 recommends Inbox | **not run** — no device install; `S3DestinationScreen` is app-target SwiftUI, unreachable under C1. The subtraction half is unit-covered, which is a weaker claim, not the same one |
| 3 | C1 mode row shows four pills, no VOICE, cycle never lands on a fifth | **not run** — partial **simulator** evidence only: `C1.viewfinder.png` (2,923,883 bytes) renders the mode row. A still is not the swipe cycle |
| 4 | Live Activity starts, updates and ends with the widened `ContentState` | **not run** — no device install; ActivityKit proves nothing useful in the Simulator |
| 5 | Reference-capture cover renders on a no-LiDAR path, and `screen.F1.context` reaches PostHog | **not run** — partial **simulator** evidence for the render half (`F1.context.png`). The PostHog ingest half has **no evidence at any level** |

Ladder position (`patina-ios-verification`: compile-green < sim-verified < device-verified):
**compile-green everywhere, sim-verified for two renders, device-verified nowhere.**

**To unblock.** A person has to connect one phone over **USB**, unlock it, and accept the trust
prompt so the developer disk image mounts. The five criteria then run unchanged. This is the
second wave running that the pass has been owed — it wants to be a named line item with Kody, not
a gate-time hope.

---

## Owed / carried forward

### 1. The keyword table's first-match-wins shadowing

Found by review; **deliberately not fixed this wave.** `SmartGuessKeywords.category(forVisionLabel:)`
scans an ordered table with substring `contains`, so the first entry that matches wins:

- `"table lamp"` → `.table`, not `.lighting`
- `"desk lamp"` → `.table`, not `.lighting`
- `"tapestry"` → `.plumbing`

This is pre-existing — but Wave 2 is what makes it fire. Before this wave the path was
unreachable; now it runs on every capture. It is contained by **FC-R12**: nothing auto-applies,
she confirms every read, so a wrong read costs a tap, not a wrong record. The new test
`everyKeywordInTheTableResolvesToItsOwnCategory` pins the current ordering, so the shadowing
cannot silently spread further without a red test.

Worth noting the shape of the fix when someone takes it: reordering the table trades one shadow
for another. The real fix is longest-match-wins, or an explicit priority column.

### 2. `Specimen.recordSmartGuess(_:)` extraction

`SmartGuessTests`' `record(_:onto:)` helper duplicates `ViewfinderModel.applySmartGuess`'s
recording loop line for line, because C1 forces the test out of the app target. The two were
verified identical today and mutation-checked. The hazard is durable, though: if a later wave
edits the production loop and not the mirror, **the test still passes while the shipped path
breaks** — the worst failure mode a test can have.

Remedy: extract the loop into a `Specimen` extension in CaptureKit that both sides call, so there
is one loop and the test tests it.

### 3. F-5 residual — the media read is still on the main actor

A plain `Task {}` spawned from `@MainActor ViewfinderModel` inherits that isolation through its
synchronous prefix. So `Data(contentsOf:)` is deferred off the shutter path — which is what the
fix round asked for — but it is **not** off the main thread. A large file still stalls the UI,
just a beat later.

Needs a `nonisolated async` read. Wave 3, adjacent to the C3 / inline-mic work.

### 4. Spec §5.5 is stale on the `ContentState` call sites

§5.5 names `LocalCaptureSyncController` and `CaptureLiveActivityController`. Neither is where the
work is. The three real construction sites are all in
`Capture/Services/Sync/LocalCaptureSyncService.swift` — the **app target**, not CaptureKit — at
`:184`, `:717`, `:825`. `CaptureLiveActivityController` only ever receives an already-built
`ContentState` (`:35`, `:55`, `:63`). The plan's own line numbers (`:623` / `:743`) were stale too.

**Root cause worth recording, because it will bite again:** `ContentState` is built through type
inference — `.init(queued:…)` — so `grep -rn "ContentState"` misses every construction site. Any
future task that greps for a type name to find its constructors will come up empty and conclude
there are none.

### 5. Spec §17.4's screen count is off by one

§17.4 says `CaptureScreenID.swift`'s header goes to 74 entries. The correct figure is **75**. The
`f1Context` orphan fix is itself a new case, and §17.4 does not count it separately.

Independently re-derived: 33 original + 19 Work-flow + 20 Site Request + 3 reserved = **75**, of
which **72** are built and swept. Fix at the next spec pass, not here.

### 6. `wave-4-plan.md:192` greps a path that does not exist

It greps `CaptureKit/CaptureKit/Navigation/CaptureScreenID.swift`. The file is at
`CaptureKit/CaptureKit/Support/CaptureScreenID.swift`. A different wave's plan file, so out of
this plan's scope — flagged here because this is where the file's real location is authoritative.

### 7. Wave 3's consumption list is short four names

`wave-3-plan.md` should add, to its own Wave-2-consumption list:

- `CameraMode.viewfinderSelectable` — a **literal** `[.photo, .tag, .measure, .scan]`, not a
  filter. Wave 3 appends `.voice` to it; it does not change a predicate.
- `CaptureScreenID.sweepSuffix`
- `CaptureFeatureFlags`
- `CaptureCoordinator.siteScanContextRequested`

Flagged here, fixed by Wave 3's own pre-flight — not by this plan.

### 8. `-CaptureScreen voice` is now ambiguous

`screen.C6.voice` joins `screen.N4.voice`. Behaviour is unchanged today: it still resolves to
`.n4Voice` by declaration order, and the sweep always passes full suffixes, so nothing is broken.
But Wave 3 will want `C6.voice`, and at that point the short form has to go or be disambiguated.

### 9. Wave 3–4 surfaces deliberately left unbuilt

The `.voice` mode pill, `CaptureSheet.visit`'s registry entry, and the V0 / C6 / V4 sweep entries.
Their seams exist — the enum is edited once — but the screens belong to waves 3 and 4.

### 10. The ESCALATE-class copy pass on the SiteScan surfaces

Spec §17.4's nine-file pass across the SiteScan coach, anchor and context screens. This is a
session with Kody, not an engineering step, and the spec says so.

### 11. Not this wave's, by ruling

- **Flow 6 fix 2 — the Library provenance chip** (`products.capture_source`, read by the portal).
  Plan §1.4 assigns it to Wave 1P package 4-12; §2 states wave 2 has no portal work.
- **§17.3's remaining seven "Inbox" strings.** The word "Inbox" is Wave 3's to remove. Wave 2 kept
  every existing string exactly as it is.
- **`README.md:1`'s "camera-first" opening.** FC-R1 ruled Today is home, and §7.1 / §5.3 put that
  in wave 3. Rewriting the README's premise before the app matches it would be a new false claim —
  which is the one thing this wave is about not doing.

---

## Deferred minors and parked findings

Everything smaller than the above, with its ruling, is in
`waves/wave-2/progress.md` — including Task 2's two parked residuals and each fix round's
disposition.

All 31-plus conductor rulings, each with its cost-if-wrong, are in `waves/wave-2/rulings-index.md`.

---

## Handoff

- **Branch:** `feat/field-companion-w2`, head `f41150e37f4e9bff0dc80c025e9b13ce5060cb27`
- **merge-base with main:** `6d91eb1b6875a31e8a516c256d7c3901a396f430` — main is an ancestor of the
  branch, so the merge is a fast-forward or a trivial one
- **Push is owed to the orchestrator.** `git push` fails from the agent shell on the sandbox proxy.
- **The worktree stays live** until the merge lands, per the 2026-08-24 ruling, in case a rebase is
  needed.
- **The device pass is owed and is the honest gap in this wave.** Everything else is green.
