# 11 — Integration collision risk: concurrent teams on Patina + Patina Field

Prepared 2026-09-23. Every claim below was verified first-hand against the working tree at
`main` = `2a51ab9f7`. Where I could not verify something from inside the sandbox, I say so.

**Scope:** multiple agent teams working concurrently in separate git worktrees on
`apps/mobile/Patina` (client) and `apps/mobile/Capture` (Patina Field), delivering deck
roadmap phases 0–5. No feature flags anywhere — which removes the usual escape hatch of
merging dead code, and makes *merge correctness* the whole safety story.

---

## 0. The single most important structural fact

**The two apps have opposite project-file physics, and the plan must treat them differently.**

| | Patina (client) | Patina Field (Capture) |
|---|---|---|
| `project.pbxproj` | 974 lines, `objectVersion = 77`, **7 × `PBXFileSystemSynchronizedRootGroup`**, only 14 `PBXBuildFile` | 2,372 lines, every file enumerated |
| Adding a `.swift` file | touches **nothing** | rewrites the pbxproj |
| Authored by | Xcode, by hand, rarely | `scripts/generate_project.rb` (Ruby + `xcodeproj` gem), on **every gate run** |
| Test suite | `PatinaTests` — 260 files, recorded 344 tests / 41 suites | `CaptureTests` — 51 files, run via the **CaptureKit** scheme |
| Gate | `apps/mobile/Patina/scripts/ios-gate.sh` | `apps/mobile/Capture/scripts/capture-gate.sh` |
| Lint config | `Patina/.swiftlint.yml` (`included: .`) | `Capture/.swiftlint.yml` (`included: Capture, CaptureKit, CaptureKitMocks`) |
| Per-lane DerivedData | **yes** — `$PROJECT_DIR/.build/DerivedData` | **no** — default location, no `-derivedDataPath` |
| Simulator selection | **explicit UDID required**, refuses to guess (`IOS_GATE_UDID`) | **by name**, `SIM="${CAPTURE_SIM:-iPhone 17}"` |

**Shared test infrastructure between the two apps: none.** Different projects, schemes, gate
scripts, lint configs, and no shared test target. The *only* shared build input is
`apps/mobile/PatinaDesignKit`. `apps/mobile/Mobile.xcworkspace` references both projects plus
the package, but nothing in either gate script uses the workspace — it is an Xcode
convenience, and it carries a **third, divergent** `Package.resolved`.

Consequence for the plan: **Patina lanes can run wide and parallel. Field lanes cannot.**
Do not serialise the client app out of an abundance of caution — its synced-group project is
genuinely immune to the file-level conflicts that will dominate Field.

---

## Ranked collision risks

Ranked by probability × blast radius. "Blast radius" weights *silent* failures above loud ones:
with no flags, a bad merge ships.

---

### R1 — `Capture.xcodeproj/project.pbxproj`: every gate run rewrites it, and two regenerated copies cannot be merged
**Probability: CERTAIN** (any two Field lanes) · **Blast radius: whole Field app**

**What collides.** `apps/mobile/Capture/Capture.xcodeproj/project.pbxproj` is committed
(`git ls-files` confirms) *and* generated. `generate_project.rb` opens with
`FileUtils.rm_rf(PROJECT_PATH)` — it deletes and rebuilds the entire `.xcodeproj`, including
the two committed shared schemes under `xcshareddata/xcschemes/`.

It is not only regenerated when files change. `capture-gate.sh` calls `generate()`
**unconditionally** inside `build()` and `test_()`, so `capture-gate.sh build`,
`capture-gate.sh test` and `capture-gate.sh all` each rewrite the file. So does
`capture-shots.sh` (line 72) and `archive-testflight.sh`. A Field lane that merely *verifies*
its work dirties the project file.

UUIDs are content-derived (`project.predictabilize_uuids` called twice — the two-pass fixup for
`PBXContainerItemProxy`). That makes regeneration idempotent on an unchanged tree, which is
good, but it means two branches that each add files produce two pbxprojs whose
`PBXBuildFile` / `PBXFileReference` / group-children / Sources-phase blocks are sorted lists of
*hashed identifiers*. Git's three-way merge will produce conflicts inside those blocks that no
human can resolve correctly, and — worse — will sometimes merge cleanly into a file that is
internally inconsistent (a `PBXBuildFile` referencing a `fileRef` the other side's hunk
removed).

**Mitigation — a merge protocol, plus one writer:**

1. Add a repo `.gitattributes` (there is **none** today — I checked `.gitattributes` and
   `apps/mobile/.gitattributes`; neither exists):
   ```
   apps/mobile/Capture/Capture.xcodeproj/project.pbxproj -merge -diff
   ```
   This forces git to always conflict loudly rather than silently producing a corrupt union.
2. **Resolution is regeneration, never hand-editing.** The integrator resolves with
   `git checkout --ours <pbxproj>` (the side does not matter — the content is derived), then
   `ruby apps/mobile/Capture/scripts/generate_project.rb`, then `git add`. Regeneration must
   run in a checkout that has `Secrets.swift` (see R2).
3. **Feature lanes do not commit pbxproj churn.** A lane that did not add/remove/rename a
   Swift file runs `git checkout -- apps/mobile/Capture/Capture.xcodeproj/` before committing.
   A lane that *did* puts the pbxproj and the new source files in the same commit and nothing else.
4. **One writer for the whole program on `scripts/generate_project.rb` itself** — the Field
   Foundations owner. It encodes target structure, the build number, all `INFOPLIST_KEY_*`
   strings, the SPM version floors and the embed phases; four different phases want to edit it.

---

### R2 — Regenerating in a fresh worktree silently drops the gitignored `Secrets.swift`
**Probability: HIGH** (every new Field worktree) · **Blast radius: main build red**

This is the known prior trap (`feedback_capture_pbxproj_regen_worktree_trap`, hit 2026-07-28
during R118 WP-2) and it is now **worse than the note describes**, because `capture-gate.sh`
regenerates automatically — the trap no longer needs anyone to type the generator's name.

**Verified today:** the committed pbxproj references `Secrets.swift` on exactly **4 lines**
(94, 559, 1059, 1451 — a `PBXBuildFile`, a `PBXFileReference` with
`path = App/Configuration/Secrets.swift`, a group child, and a Sources-phase entry). The file
exists at `apps/mobile/Capture/Capture/App/Configuration/Secrets.swift` and is gitignored by
`apps/mobile/Capture/.gitignore:2`. The generator's glob excludes only `Secrets.example.swift`;
it can only see what is on disk. A second gitignored file, `Secrets.xcconfig`
(`.gitignore:6`), is `#include`d by the committed `BuildSettings.xcconfig` and carries
`POSTHOG_API_KEY`.

A fresh worktree has neither. Regeneration there drops all four lines. A lane that builds will
fail loudly (`AppConfiguration` reads `Secrets.supabaseAnonKey`). A lane that runs only
`capture-gate.sh lint`, `fcr3` or `p4` — none of which regenerate — is safe. **The dangerous
middle case is a lane that runs the generator directly per the `patina-ios-verification`
skill's instruction, does not build, and commits a pbxproj that looks like a legitimate
project-file change.**

**Mitigation:**
- A mandatory bootstrap step in every Field worktree, before any gate run:
  `cp Capture/App/Configuration/Secrets.example.swift Capture/App/Configuration/Secrets.swift`
  and `cp Secrets.xcconfig.example Secrets.xcconfig`. (The skill documents this at
  `patina-ios-verification/SKILL.md:31` — it needs to be a scripted precondition, not a prose
  reminder, for a program this size.)
- A pre-commit assertion in the Field lane checklist:
  `[ "$(grep -c 'Secrets.swift' Capture.xcodeproj/project.pbxproj)" = 4 ]`.
- Best fix, and cheap under "make the big changes now": **add a
  `apps/mobile/Capture/scripts/bootstrap-worktree.sh`** that copies both secrets templates and
  then regenerates, and have `capture-gate.sh` call it. Owner: Field Foundations.

---

### R3 — The terminology rename is a stop-the-world codemod *and* a SwiftData store break
**Probability: CERTAIN if run concurrently** · **Blast radius: both apps + portal + installed TestFlight builds**

Phase 1 asks for "canonical entity names across both apps and the portal". Measured today:

- `specimen`, case-insensitive, in Field Swift: **1,559 references across 97 files**
- `Piece` in client Swift: **320 references across 87 files**
- portal + packages TypeScript: **150 files** matching `piece`, **21** matching `specimen`
- `supabase/migrations`: 1 file matching `specimen`

That is a diff touching essentially every file every other Field lane is editing. Any
concurrent Phase 0 / 3 / 5 branch will conflict with it in dozens of files.

**And it is not just a rename.** `CaptureKit/CaptureKit/Domain/Specimen.swift:48` declares
`@Model public final class Specimen`, and the file header states the contract:

> `FROZEN SCHEMA: this and its children define CaptureStore.schema. Adding nullable fields is
> safe; any other change is a versioned, foundation-owner-only migration (VersionedSchema /
> SchemaMigrationPlan).`

`CaptureStore.swift:80` lists eight models in `CaptureStore.schema`, and there is **no
`VersionedSchema` in Field at all** — only the client has one (`PatinaSchemaV1` in
`Patina/Patina/Core/Persistence/PatinaSchema.swift:24`). Renaming the `@Model` class renames
the SwiftData entity. Devices already carrying TestFlight build 5/6 will fail
`ModelContainer` open with `NSCocoaErrorDomain 134110` — the exact failure the file header
warns about. `CaptureTests/CaptureStoreMigrationTests.swift` and `CaptureStoreLadderTests.swift`
exist to catch this and will go red.

**Mitigation — serialise, and pair the rename with a schema plan:**
- Run the rename as a **dedicated exclusive wave with no other iOS branch open**, and run it
  **first**, before any Phase 0/3/4/5 lane opens, so every later branch is authored in the new
  vocabulary. (The alternative — running it last — means every lane writes doomed code for
  weeks. Under "get it right before release", first is correct.)
- The same writer owns the `VersionedSchema` / `SchemaMigrationPlan` introduction for Field, or
  an explicit `@Model` entity-name preservation, in the same commit as the rename. Do not let
  the rename land without one.
- After it merges, every other lane rebases before continuing. No lane branches from a
  pre-rename base.

---

### R4 — `CaptureScreenID` is a 79-case enum with an exhaustive switch and a five-file lockstep
**Probability: HIGH** · **Blast radius: compile failure, or silent mis-registration**

`CaptureKit/CaptureKit/Support/CaptureScreenID.swift` has **79 cases** today (it was 71 during
the field-companion wave). **61 Swift files reference it.** Adding one screen requires a
lockstep edit across:

1. `CaptureKit/CaptureKit/Support/CaptureScreenID.swift` — the case
2. `Capture/App/DeepLinking/CaptureDeepLink.swift` — `route(for:)` is an **exhaustive switch
   with no `default`** (verified during the field-companion wave-2 review, `plans/wave-2-plan-review.md:217`)
3. `CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift` (114 lines)
4. `CaptureKit/CaptureKit/Navigation/RouteRegistry.swift` (105 lines) — `CaptureSheet.registryKey`, also exhaustive, no `default`
5. `scripts/capture-shots.sh` — the `ALL_SCREENS` array (line 24 onward)

Phase 0 (reaching Settings / Account / sign-out / workspace switch / QR approver /
photo-import fallback in Release — six unreachable screens), Phase 3 (notification
destinations) and Phase 5 (Live Activity / widget entry points) all add or re-route screens.

The failure modes: a merge that takes one side's enum and the other side's switch **does not
compile** (loud, fine); a textual merge that takes both appends **compiles** and silently
registers the wrong route key or omits a `capture-shots.sh` entry (quiet, ships).

**Mitigation:** a single **navigation registrar** per wave. Other lanes submit screen ids as a
one-line patch request; the registrar lands all of a wave's ids in one integration commit
covering all five files. Nobody else edits those five files.

---

### R5 — `check-ios-tokens.sh` is a global ratchet with three magic numbers in one file
**Probability: HIGH** · **Blast radius: false-red on an innocent branch**

`scripts/check-ios-tokens.sh` counts violations across the **entire**
`apps/mobile/Patina/Patina/Features/` tree and fails if any category exceeds a hard-coded
baseline: `BASELINE_SYSTEM_FONT=137`, `BASELINE_CUSTOM_NO_RELATIVE=8`,
`BASELINE_LEGACY_COLOR=143`.

Two problems for concurrent work. First, the baselines live on three adjacent lines that
several lanes will want to edit (Phase 0's "two dark-mode contrast fills" is exactly a
category-C change; Phase 4's client UI additions are category A/B). Second, the counts are
**global, not per-branch**: Team A adding one `.font(.system(size:` turns the gate red on
Team B's branch after merge, and the message points at A's files.

It is also **not wired into `ios-gate.sh` or CI** — I grepped both. It is a manual gate, so
nobody may notice until integration.

**Mitigation:** **one writer — the integrator — on `scripts/check-ios-tokens.sh`.** Lanes never
edit it. Baselines are re-derived once, at wave end, by the integrator. If the program wants
it enforced, wire it into `ios-gate.sh all` in Phase 1 (Foundations) so it fails early rather
than at merge.

---

### R6 — `capture-gate.sh`'s FC-R3 and Principle-4 sweeps use exact-count expectations, and the gate file itself is contended
**Probability: HIGH** (Phase 3 especially) · **Blast radius: every Field lane red at once**

`sweep_word` fails unless the surviving matches are **exactly** the expected set — it checks
both `count -ne ${#expected[@]}` and that every expected pattern is present. Today:

- `sweep_word inbox` expects **exactly 6** protected lines (`LocalCaptureSyncService` ×2,
  `S5InboxTerminalScreen`, `CaptureNavigation`, `RouteRegistry`, `FieldCopyAudit`)
- `sweep_word ai` expects **exactly 1** (the `forbiddenWords` declaration)
- `principle4_sweep` fails on **any** `suggestionConfidence` reference under `Capture/`

The filter only forgives `CaptureScreenID`, `registryKey`, `accessibilityIdentifier`,
`analytics.event`, `analytics.screen` and `// ` comments. Sweep roots are `Capture/` **and**
`CaptureKit/`.

Phase 3 is notification copy — the wave most likely to write a quoted string containing
"inbox". Phase 5's narrow tag experiment lives in the recognition sheets, in the app target,
which is precisely where `principle4_sweep` forbids touching `suggestionConfidence`.

And the file a lane must edit to register a legitimate new protected line is
`capture-gate.sh` — the script **every** Field lane executes. Two lanes editing their own
expected entries conflict in the same heredoc.

**Mitigation:**
- **One writer on `apps/mobile/Capture/scripts/capture-gate.sh`** for the whole program.
- Phase 1's deliverable "a copy-test suite for Field" should **replace the count-exact sweep
  with a per-file allowlist** before Phase 3 opens, or Phase 3 will fight the gate. Make that
  an explicit Phase-1 acceptance item, not an implied one.
- Related false-green, worth fixing in the same edit: `lint()` prints
  `"… swiftlint not installed; skipping"` and **passes**. There is no pinned or vendored
  swiftlint. A CI runner without it silently passes lint — already noted in
  `docs/design/field-companion/research/07-delivery-infra.md:19`.

---

### R7 — Simulator contention: Capture picks a device by **name**; Patina already refuses to guess
**Probability: CERTAIN with ≥2 concurrent Field lanes running `test`** · **Blast radius: cross-lane test pollution**

`capture-gate.sh:7` — `SIM="${CAPTURE_SIM:-iPhone 17}"`, destination
`platform=iOS Simulator,name=${SIM}`. Every concurrent Field lane targets the same simulator
device. Concurrent `xcodebuild test` against one device produces install/launch races and can
run one lane's bundle against another lane's installed app.

`ios-gate.sh` already solved exactly this for the client and documents why: its
`sim_destination()` **exits 2** if `IOS_GATE_UDID` is unset, with the comment that a
`simctl list … | head -1` approach "with six lane clones named `ff-w1-*` plus the protected
review device `973D1724-…` present will happily run one lane's tests on another lane's clone.
That is the program's Hard Rule 1, broken by the gate that enforces it."

Capture never received the same treatment.

**Mitigation:**
- One simulator clone per Field lane; each worktree exports `CAPTURE_SIM` to its own clone's
  name.
- Better, and cheap: patch `capture-gate.sh` in Phase 1 to accept `CAPTURE_SIM_UDID` and
  **refuse to guess**, mirroring `ios-gate.sh`. Single writer (same owner as R6).
- **Unverified:** I could not enumerate the current simulator inventory — `xcrun simctl` is
  blocked in this sandbox (`CoreSimulatorService connection became invalid`, errno 1 on the
  xcrun cache file). Whether the `ff-w1-*` clones and the protected review device still exist
  needs checking outside the sandbox before lanes are assigned.

---

### R8 — Build-process contention: orphaned `xcodebuild`, the shared DerivedData lock, and 28 GB of lane artifacts
**Probability: HIGH** · **Blast radius: false reds, 600s stalls, disk exhaustion**

This is documented failure, not speculation. `docs/design/ios-ux-review-2026-07/integration-log.md:22`
records, verbatim:

- `error: unable to attach DB … database is locked` — caused by an orphaned `xcodebuild test`
  grandchild holding the DerivedData lock after `pkill -f "ios-gate.sh unit"` matched only the
  parent wrapper.
- Outer `xcodebuild` stalling **600s+** in post-test `simctl diagnose` log collection while the
  test run itself had already printed "335 tests in 40 suites passed".
- A stray `Patina` app process surviving a run and consuming CPU, causing a five-times-repeated
  false failure in `FirstLaunchTourTests` (line 24).

Recorded timings: `PatinaTests` = **344 tests / 41 suites in 18.6s** once built; the same tier
took 600s+ when the diagnose child hung. `capture-gate.sh test` runs only the **CaptureKit**
scheme (logic tests, no app host). `CaptureUITests` (1 file) runs through the Capture scheme
and is **not** in `capture-gate.sh all`.

Disk, measured today: `apps/mobile/Patina/.build` = **3.5 GB**, `apps/mobile/Capture/.build` =
**1.1 GB**, both *inside the source tree*. `.git` is **2.5 GB**. Six iOS lanes ≈ **28 GB** of
DerivedData on top of an already-heavy repo. `ios-gate.sh` puts DerivedData per-worktree by
design; `capture-gate.sh` passes no `-derivedDataPath`, so Field lanes land in the default
tree (keyed by project-path hash, so separate per worktree in practice, but sharing the module
cache and the CoreSimulator device set).

**Mitigation:**
- **Cap concurrency: at most 2 Field + 2 Patina lanes compiling at any moment.** This is the
  single cheapest guard.
- Every lane kills stray `xcodebuild`, `simctl diagnose` and app processes before *and* after a
  gate run — and by pattern that catches grandchildren, not just the wrapper.
- Give `capture-gate.sh` an explicit per-worktree `-derivedDataPath` in Phase 1.
- Run `scripts/repo-gc.sh` (dry-run first) before the program opens lanes.

---

### R9 — `ios-gate.sh lint-delta` creates and destroys a git worktree on every run
**Probability: MEDIUM** · **Blast radius: spurious lint failures, stale worktree accumulation**

`cmd_lint_delta` runs `git -C "$REPO_ROOT" worktree add --detach -q "$wt" "$merge_base"`, lints
the base, then `worktree remove --force`. Three problems under concurrency:

1. Several lanes running `ios-gate.sh all` concurrently contend on the shared
   `$GIT_COMMON_DIR/worktrees` metadata. A killed gate leaves a stale entry — part of how the
   26 worktrees currently on disk accumulated.
2. `BASE` defaults to `main`. A lane branched from an integration branch measures the wrong
   baseline and reports warnings it did not introduce.
3. On failure the script prints `"⚠ lint-delta: could not create base worktree; treating base
   warnings as 0 (strict)"` and continues — so lock contention degrades into a **spurious
   lint failure**, not a skip.

**Mitigation:** lanes always pass an explicit base (`ios-gate.sh all <integration-branch>`);
treat `lint-delta` as the one tier that touches git state and **do not run it in two lanes
simultaneously**; the integrator runs `git worktree prune` between waves.

---

### R10 — PatinaDesignKit: one package, five link sites, two apps, a dynamic product and a hand-written embed phase
**Probability: MEDIUM** (rises to CERTAIN at Phase 5) · **Blast radius: both apps, silently**

23 Swift files. Consumed by **both** apps. Verified link sites:

- **Patina**: the `Patina` app target (links **and** embeds — `Embed Frameworks`,
  `CodeSignOnCopy, RemoveHeadersOnCopy`), `PatinaWidget` (links, does **not** embed — resolves
  from the host), and `PatinaTests` (links). Three `packageProductDependencies`.
- **Field**: the `Capture` app target **and** the `CaptureKit` framework, wired by
  `generate_project.rb`'s `link_local_package(project, [app, kit], …, embed_in: [app])`.

**Blast radius of adding a component:** low and additive. A new file under
`Sources/PatinaDesignKit/Components/` is picked up by SwiftPM with **no project edit in either
app**. But both apps rebuild, so whoever adds it must run **both** gates.

**Blast radius of changing a token:** high and *silent*. `PatinaColors`, `PatinaTypography`,
`PatinaSpacing`, `PatinaShadows`, `PatinaGradients` are read by the Patina app, PatinaWidget,
PatinaTests, the Capture app target and the CaptureKit framework. A value change is a visual
change in both apps with **no compiler signal**, and it can move `check-ios-tokens.sh`
category-C counts (R5). A rename or removal breaks both apps at compile time — including
`PatinaWidget` (built by the Patina scheme) and `CaptureKit` (built by the *CaptureKit* scheme
that `capture-gate.sh test` uses, so a Field lane discovers it in the test tier, not the build
tier).

**The floor comment is wrong, and the red team was right about it.** `Package.swift` pins
`.iOS("17.6")` with the comment *"the Patina app target's IPHONEOS_DEPLOYMENT_TARGET is 17.6
(despite the 'iOS 18+' doc note)"*. Measured today: Patina's pbxproj sets
`IPHONEOS_DEPLOYMENT_TARGET = 26.0` in **all 8** configuration blocks; Capture's generator pins
`DEPLOYMENT = '18.0'`. The package floor rests on a stale reading. Any floor-move team edits
one file that lands in both apps.

**The embed trap re-fires at Phase 5.** The product is `.dynamic` on purpose, and
`xcodebuild` does **not** auto-embed dynamic package products — the generator's own comment
records that the device `.app` had no `Frameworks/` copy and dyld-crashed at launch. A **Field
widget extension** would be a third consumer. `link_local_package` currently
`raise`s `"no Embed Frameworks phase on #{target.name}"` for any target in `embed_in` lacking
one, so the generator will need surgery, and the correct answer (mirroring what Patina already
does for `PatinaWidget`) is *link but do not embed* in the extension.

**Mitigation:**
- **Exactly one writer for the whole program on
  `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/` and on
  `apps/mobile/PatinaDesignKit/Package.swift`.**
- Component *additions* stay open to any lane, but the commit must carry green `ios-gate.sh all`
  **and** `capture-gate.sh all`.
- Any change under `Tokens/` is a program-level change: both gates green in the same commit,
  reviewed against both apps.

---

### R11 — Three divergent `supabase-swift` pins, and Field's resolution is not versioned at all
**Probability: CERTAIN — it is already true** · **Blast radius: irreproducible Field builds**

Measured:

| `Package.resolved` | supabase-swift | tracked? |
|---|---|---|
| `Mobile.xcworkspace/xcshareddata/swiftpm/` | **2.51.0** | yes |
| `Patina/Patina.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/` | **2.40.0** | yes |
| `Capture/Capture.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/` | **2.55.1** | **NO — gitignored** |

`apps/mobile/Capture/.gitignore` ignores `Capture.xcodeproj/project.xcworkspace/` on the
grounds that "the implicit workspace + SPM resolution (Package.resolved) are build artifacts,
not source". Combined with `generate_project.rb` requesting
`upToNextMajorVersion` from `2.40.0` **and** `rm -rf`-ing the whole `.xcodeproj` (which deletes
the resolution cache) on every gate run, **Field re-resolves supabase-swift from scratch on
every gate run and can land on a different version in every lane, with no diff to show for it.**

**Mitigation:** Phase 1 converges the pins *and* changes Field's requirement to
`exactVersion`. Decide explicitly whether Field's `project.xcworkspace/Package.resolved` should
be un-ignored — under "get it right before release", it should. One writer:
`generate_project.rb` + all three resolved files (same owner as R1).

---

### R12 — Field's TestFlight build number lives inside `generate_project.rb`
**Probability: MEDIUM** · **Blast radius: a rejected ASC upload, or two lanes claiming build 7**

`generate_project.rb` sets `s['CURRENT_PROJECT_VERSION'] = '6'` with its own warning: *"TestFlight
build 5 is already in App Store Connect, and ASC rejects a re-used build number — so this MUST
be bumped before every upload, and a device pass cannot tell two builds apart while it is
not."* Patina's equivalent sits in `Patina.xcodeproj`.

Two lanes that both archive will both bump to 7 and conflict in the single file R1 already
declares single-writer.

**Mitigation:** **only the integrator archives.** The build number is bumped in the integration
commit, never on a feature branch. Applies to both apps.

---

### R13 — `Capture/Info.plist` and `Capture.entitlements` are tiny hand-maintained files that three phases all need
**Probability: MEDIUM-HIGH** · **Blast radius: a silent runtime no-op**

Verified contents today. `Capture/Info.plist` has exactly **two** keys (`POSTHOG_API_KEY`
resolving `$(POSTHOG_API_KEY)` from `BuildSettings.xcconfig`, and `CFBundleURLTypes` for the
`field://` scheme). `Capture.entitlements` has exactly **three** (app-groups
`group.cloud.patina.field`, `applesignin`, `associated-domains applinks:client.patina.cloud`) —
**no `aps-environment`**, confirming the deck's "Field has no notification capability at all".

- Phase 3 (APNs) adds `aps-environment` to entitlements and background modes to Info.plist.
- Phase 5 adds `NSSupportsLiveActivities` (and probably `…FrequentUpdates`) to Info.plist, and
  the widget extension needs the app group.

Both are small XML files: concurrent edits conflict, and a bad merge is a **silent runtime
no-op** — exactly the defect class the deck already found. `NSSupportsLiveActivities` being
absent is why `CaptureLiveActivityController.start()` returns at its guard on line 38 with no
error and nothing requested.

**Mitigation:** **serialise Phase 3 before Phase 5 on these two files**, one writer each. Add
an assertion test over the expected key set (a plist read in `CaptureTests`, not a grep) so an
absent key fails a gate instead of failing silently on a device — the whole point of the
Phase-0 "stop the lies" framing.

---

### R14 — The CI runner-image move is a one-line change in a file the whole repo shares
**Probability: CERTAIN at Phase 5** · **Blast radius: every PR in the monorepo**

`.github/workflows/policy-quality.yml` defines two jobs, `ios-patina` (line ~95) and
`ios-capture` (line ~104), both `runs-on: macos-15`, both named "(advisory)", each running its
app's gate script. Phase 5 needs Xcode 27, which needs a newer image.

Two compounding facts: the jobs are **advisory**, and `capture-gate.sh lint` silently passes
when swiftlint is absent from the runner (R6). **A green `policy-quality` run does not prove
the iOS gates enforced anything.** Local verification remains the real gate, as the root
`CLAUDE.md` already says.

**Mitigation:** the workflow file is program-level. **One writer, one commit, at the top of
Phase 5.** No Field or Patina lane edits `.github/workflows/`.

---

### R15 — Patina's project file is *not* generated but *is* mostly immune — do not over-serialise the client
**Probability: LOW** · **Blast radius: low**

Stated here so the plan does not waste serialisation on the client app. Patina's pbxproj uses
`PBXFileSystemSynchronizedRootGroup` (7 of them, `objectVersion = 77`, only 974 lines and 14
`PBXBuildFile`). Adding, removing or renaming Swift files under the synced roots touches
**nothing**. Conflicts arise only from *target structure* changes: a new target, a new build
phase, a new package dependency, a deployment-target change, or an edit to one of the two
`PBXFileSystemSynchronizedBuildFileExceptionSet` blocks.

Phase 4 (cache the shared direction — new SwiftData models in `PatinaSchema`, new views) needs
**none** of those. Phase 4 lanes can run freely and in parallel.

**Mitigation:** Patina lanes need a lock only for a target-structure change. One writer on
`apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` for those, nothing more.

---

### R16 — `Patina/Patina/Generated/GitCommit.swift` is rewritten by a Run Script phase on every Debug build
**Probability: LOW** · **Blast radius: cosmetic**

The `Stamp Git SHA` build phase writes `$(SRCROOT)/Patina/Generated/GitCommit.swift` on every
build, stamping a `+` suffix when `git diff` is dirty. The file is gitignored
(`.gitignore:57`) and lives inside a synced root group, so it neither dirties `git status` nor
drops out of the target — the Capture trap (R2) has no analogue here. Noted only because a
build *mutates the source tree*, so no two lanes produce byte-identical builds, and a lane
running `git` operations while another builds the same worktree can see a transient file. No
mitigation needed beyond awareness.

---

### R17 — 26 worktrees and 26 agent branches already exist; none is iOS, but they are in the way
**Probability: MEDIUM (operational)** · **Blast radius: a swept live lane, or disk**

`git worktree list` returns **26** entries: 21 sidequest `worktree-agent-*` (6 of them already
in `worktree-quarantine/`), plus 7 under `.codex/worktrees/` — `agent-client-material`,
five `agent-inv-*` invoice lanes, and `agent-people-build` on
`build/people-room-crm-2026-09-11`, which memory records as blocked on 17 pre-existing docs
screenshot PNGs and awaiting Kody's call on a `--force` removal. `build/studio-hook-2026-09-22`
is live locally and on origin.

**None of them touches iOS** — no branch or worktree in the list names iOS, mobile, Capture or
Patina work. So there is no direct content conflict with this program. The risk is purely
operational: `git worktree add` name collisions, `repo-gc.sh` sweeping a live iOS lane it does
not recognise, and disk pressure on top of R8's 28 GB.

**Mitigation:** run `scripts/repo-gc.sh` (dry-run first) and clear the quarantine before the
program opens lanes; give iOS lanes a distinct prefix — `ios27/<phase>-<slug>` — so a sweep can
tell them apart from `worktree-agent-*`.

---

### R18 — The Field toolchain is user-global and unpinned
**Probability: LOW-MEDIUM** · **Blast radius: one lane cannot build, or a false-green lint**

`generate_project.rb:11` unshifts `~/.gem/ruby/*/gems/*/lib` and runs under system
`/usr/bin/ruby` (2.6). Verified present: `xcodeproj 1.27.0` at
`/Users/kody/.gem/ruby/2.6.0/gems/xcodeproj-1.27.0` — a **single user-global install with no
`Gemfile` or `Gemfile.lock` anywhere under `apps/mobile/`**. Every lane and the CI job depend
on it resolving. `swiftlint` is `/opt/homebrew/bin/swiftlint`, unpinned. `xcbeautify` is **not
installed** (both gates degrade to raw `xcodebuild` output — functional, just noisy).

**Mitigation:** a Phase-1 foundations item — pin `xcodeproj` in a
`apps/mobile/Capture/Gemfile` + `Gemfile.lock`, and make `capture-gate.sh lint` **fail** rather
than skip when swiftlint is absent.

---

## Files that must have exactly ONE writer for the duration of the program

Each row: the file, why, and who should own it.

| File | Why | Suggested single owner |
|---|---|---|
| `apps/mobile/Capture/scripts/generate_project.rb` | Target structure, build number (R12), `INFOPLIST_KEY_*` strings, SPM floors (R11), embed phases (R10). Four phases want to edit it. | **Field Foundations** |
| `apps/mobile/Capture/Capture.xcodeproj/project.pbxproj` | Generated; unmergeable (R1). Only ever written by regeneration, only in the integration worktree. | **Integrator** (regeneration only) |
| `apps/mobile/Capture/scripts/capture-gate.sh` | Exact-count sweeps + simulator selection + the swiftlint false-green (R6, R7). Every Field lane runs it. | **Field Foundations** |
| `apps/mobile/Capture/Capture/Info.plist` | Two keys today; Phases 3 and 5 both add to it; bad merge = silent no-op (R13). | **Phase 3 owner, then handed to Phase 5** (serialised) |
| `apps/mobile/Capture/Capture/Capture.entitlements` | Three keys today; APNs + app-group additions (R13). | **Phase 3 owner, then Phase 5** (serialised) |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen.swift` | `@Model`, FROZEN SCHEMA, no `VersionedSchema` (R3). | **Rename/schema wave owner** |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift` | `CaptureStore.schema` — the eight-model registry (R3). | **Rename/schema wave owner** |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Support/CaptureScreenID.swift` | 79 cases, 61 referencing files, feeds two exhaustive switches (R4). | **Navigation registrar** |
| `apps/mobile/Capture/Capture/App/DeepLinking/CaptureDeepLink.swift` | `route(for:)` exhaustive, no `default` (R4). | **Navigation registrar** |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/RouteRegistry.swift` | `registryKey` exhaustive, no `default` (R4). | **Navigation registrar** |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift` | Route enum, lockstep with the above (R4). | **Navigation registrar** |
| `apps/mobile/Capture/scripts/capture-shots.sh` | `ALL_SCREENS` must match `CaptureScreenID` one-for-one (R4). | **Navigation registrar** |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Support/FieldCopyAudit.swift` | `forbiddenWords` is both the rule and a sweep-protected line (R6). | **Field Foundations** |
| `apps/mobile/PatinaDesignKit/Package.swift` | Floor, product type, both apps (R10). Floor comment currently wrong. | **Design-system owner** |
| `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/**` | Silent visual change in both apps; moves R5's baselines (R10). | **Design-system owner** |
| `scripts/check-ios-tokens.sh` | Three global baselines on adjacent lines (R5). | **Integrator**, at wave end only |
| `.github/workflows/policy-quality.yml` | Runner image; affects every PR in the monorepo (R14). | **Integrator**, one commit at Phase 5 |
| `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` | Only for target-structure changes; file adds are free (R15). | **Integrator**, structure changes only |
| All three `Package.resolved` + Field's SPM requirement | Three divergent pins, one untracked (R11). | **Field Foundations**, one commit |
| `.gitattributes` (to be created) | The R1 merge protocol lives here. | **Integrator**, once, before lanes open |

---

## Sequencing consequences for the plan

1. **The rename (Phase 1) must be an exclusive wave, and it should go first.** It touches
   1,559 + 320 + ~170 references and carries a SwiftData store break. Nothing else Field-side
   may be open while it runs (R3). Every later lane branches from post-rename.
2. **Phase 1 must also deliver the gate fixes before Phases 3 and 5 open**: per-lane simulator
   for Capture (R7), per-lane DerivedData for Capture (R8), the copy-sweep allowlist replacing
   the exact-count sweep (R6), the supabase-swift convergence (R11), the worktree bootstrap
   script (R2), and the `Gemfile.lock` (R18). These are the difference between concurrency
   working and concurrency producing false reds all program.
3. **Phase 3 before Phase 5** on `Info.plist` and `Capture.entitlements` (R13) — not because of
   dependency, but because those two files cannot take concurrent writers safely.
4. **Phase 0 and Phase 4 can run concurrently with anything after the rename.** Phase 0 is
   Field-local screen/copy fixes (though its screen-reachability work goes through the
   navigation registrar, R4). Phase 4 is Patina-only SwiftData + views, where the synced-group
   project makes file-level conflicts impossible (R15).
5. **Cap simultaneous compiling lanes at 2 Field + 2 Patina** (R8). This is the guard with the
   best cost-to-benefit ratio in the whole list.
6. **Only the integrator archives to TestFlight** (R12), and only the integrator resolves a
   pbxproj conflict, always by regeneration (R1).

---

## What I could not verify, and why

- **Simulator inventory.** `xcrun simctl` is blocked in this sandbox
  (`CoreSimulatorService connection became invalid`). Whether the `ff-w1-*` lane clones and
  the protected review device `973D1724-90BF-4A0A-B02D-481D561547B3` still exist must be
  checked outside the sandbox before lanes are assigned.
- **Live gate timings.** I did not run `ios-gate.sh` or `capture-gate.sh` — doing so would have
  regenerated the Capture pbxproj in the main checkout and consumed a shared simulator. The
  timings quoted (344 tests / 41 suites / 18.6s, and the 600s+ diagnose stalls) come from
  `docs/design/ios-ux-review-2026-07/integration-log.md`, which records them from real runs.
- **Whether `policy-quality.yml`'s iOS jobs are truly non-blocking.** They are labelled
  "(advisory)" and gated on a `plan` job's outputs; I read the job definitions but did not
  trace the `plan` job's path filters or any branch-protection required-check list.
