# 10 — Hard technical dependency map

**Scope:** the two iOS apps, deck roadmap phases 0–5 plus the iOS half of opportunity 1.
**Method:** first-hand reading of the repository on 2026-09-23. Every claim below carries a
`file:line`. Where I could not prove something, it says so.

**Standing constraint carried in from Kody:** no feature flags anywhere, both apps pre-release,
prefer the correct end state over the incremental one. That removes the deck's usual escape
hatch (ship behind a flag, converge later) and *increases* the weight of the serialisation
constraints below — there is no flag to let two half-done versions of a target coexist.

---

## 0. The one-line answer

Four things in this program are **physically single-threaded** and everything else can be
parallelised around them:

| # | The bottleneck | Why it cannot be parallel |
|---|---|---|
| S1 | **`Capture.xcodeproj` target structure** | one generated, committed file; `generate_project.rb` `rm -rf`s and rebuilds the whole project |
| S2 | **`supabase-swift` pin convergence** | Capture's `Package.resolved` is *gitignored and deleted on every build*, so the pin is not a file anyone can edit — it is a build-time resolution |
| S3 | **Field's `specimen` → shared-noun rename** (if taken as a symbol rename) | 1,856 occurrences across essentially every Field file |
| S4 | **`PatinaSchema` version bump** | one file, one version identifier, one stage list; two concurrent V2s cannot both be V2 |

Everything else — Phase 0's four Field defects, the client's cache work, the copy-test suite,
APNs entitlement + registration, the extractor's iOS caller — is genuinely parallelisable
**provided** it is sequenced behind whichever of S1–S4 it touches.

---

## 1. Xcode project generation (`apps/mobile/Capture/scripts/generate_project.rb`, 316 lines)

Read in full. This is the single highest-risk coordination object in the program.

### 1.1 What it emits

The script begins by **destroying the project**:

```
apps/mobile/Capture/scripts/generate_project.rb:20   FileUtils.rm_rf(PROJECT_PATH)
apps/mobile/Capture/scripts/generate_project.rb:21   project = Xcodeproj::Project.new(PROJECT_PATH, false, 77)
```

Five targets, all at one deployment constant:

| Target | Type | Line | Bundle id |
|---|---|---|---|
| `CaptureKit` | framework | `:28` | `cloud.patina.field.capturekit` (`:53`) |
| `CaptureKitMocks` | framework | `:29` | `cloud.patina.field.capturekitmocks` (`:53`) |
| `Capture` | application | `:30` | `cloud.patina.field` (`:77`) |
| `CaptureTests` | unit-test bundle | `:161` | `cloud.patina.field.tests` (`:164`) |
| `CaptureUITests` | UI-test bundle | `:173` | `cloud.patina.field.uitests` (`:176`) |

**There is no app-extension target of any kind.** No widget, no Live Activity renderer, no
App Intents extension, no ControlWidget. `CaptureSyncAttributes` exists
(`CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift`) and is driven by
`Capture/Services/LiveActivity/CaptureLiveActivityController.swift`, but **nothing in the repo
renders it** — the comment at `CaptureLiveActivityController.swift:5-7` says "Team F renders the
widget against the same attributes"; Team F's widget target does not exist.

### 1.2 The deployment-target constant

```
generate_project.rb:17   DEPLOYMENT = '18.0'
```

Applied in exactly two places — `project.new_target(..., DEPLOYMENT)` on all five targets
(`:28,:29,:30,:161,:173`) and `s['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT` in `common!`
(`:36`). A floor move is therefore a **one-character-class edit to line 17**. It is trivially
small and maximally disruptive: it changes every target's build settings in the regenerated
pbxproj simultaneously.

For contrast, Patina's floor is already **26.0**, hand-written eight times in the pbxproj
(`apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:494,524,597,655,690,737,767,788`).

### 1.3 Every `INFOPLIST_KEY_*` the script sets (app target only, `:95–:125`)

```
INFOPLIST_KEY_CFBundleDisplayName                    = "Patina Field"           :95
INFOPLIST_KEY_UILaunchScreen_Generation              = YES                      :96
INFOPLIST_KEY_UIApplicationSceneManifest_Generation  = YES                      :97
INFOPLIST_KEY_UISupportedInterfaceOrientations       = …Portrait                :98
INFOPLIST_KEY_UIRequiresFullScreen                   = YES                      :102
INFOPLIST_KEY_NSCameraUsageDescription                                          :104
INFOPLIST_KEY_NSMicrophoneUsageDescription                                      :106
INFOPLIST_KEY_NSSpeechRecognitionUsageDescription                               :113
INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription                                 :116
INFOPLIST_KEY_NSPhotoLibraryUsageDescription                                    :118
INFOPLIST_KEY_NSLocationWhenInUseUsageDescription                               :120
INFOPLIST_KEY_NSMotionUsageDescription                                          :122
INFOPLIST_KEY_NSFaceIDUsageDescription                                          :124
```

Note `NSSupportsLiveActivities` is absent — confirming the brief. The physical
`Capture/Capture/Info.plist` holds exactly two keys (`POSTHOG_API_KEY`, `CFBundleURLTypes`) and
is merged in via `INFOPLIST_FILE = Capture/Info.plist` (`:81`).

**The script itself documents the rule that decides where a new key goes** (`:89-94` and
`Capture/Capture/Info.plist:5-15`): `GENERATE_INFOPLIST_FILE` only auto-emits `INFOPLIST_KEY_*`
for Apple's *known* keys, which is why `POSTHOG_API_KEY` lives in the physical plist instead.
`NSSupportsLiveActivities` **is** an Apple-known key, so it can go either place —
and that choice is a parallelism decision, see §1.6.

### 1.4 The PatinaDesignKit embed phase

`link_local_package` (`:251–:281`) is the delicate part.

- `:283-285` links the package into **both** `[app, kit]`, embedding **only** in `[app]`.
- `:272` `next unless embed_in.include?(target)` — the guard that keeps CaptureKit from
  double-embedding.
- `:273-274` finds the `'Embed Frameworks'` phase by **name** and `raise`s if absent. The phase
  is created at `:207-208` for the app target only.
- The dyld comment is at **`:267-271`**:

  > `# xcodebuild does NOT auto-embed dynamic package products (verified: the`
  > `# device .app had no Frameworks/ copy and would dyld-crash at launch), so`
  > `# the app target embeds the framework explicitly …`

### 1.5 The UUID fixup

```
generate_project.rb:295   project.predictabilize_uuids
generate_project.rb:296   project.predictabilize_uuids
```

Called **twice**, and `:287-294` explains why: pass 1 assigns content-derived UUIDs but
`PBXContainerItemProxy` hashes partly off its *pre-fixup* `remoteGlobalIDString`; pass 1
rewrites that string, pass 2 re-hashes with the stable value so proxy/dependency objects settle.
The stated purpose is "re-running this script on an unchanged source tree leaves `git status`
clean."

**`Capture.xcodeproj/project.pbxproj` is tracked in git** (`git ls-files` confirms), so every
source-file addition produces a committed pbxproj diff.

### 1.6 What must change for each of the three asks — and what can share a commit

**(a) An app-extension target for widgets / Live Activity.**

Everything below is new code in `generate_project.rb`:

1. `project.new_target(:app_extension, 'CaptureWidget', :ios, DEPLOYMENT)` — note the current
   `common!` sets `SKIP_INSTALL` only inside `framework!` (`:56`), so an extension needs its own
   settings helper.
2. `INFOPLIST_KEY_NSExtension*` / a physical extension `Info.plist`, plus `CODE_SIGN_ENTITLEMENTS`
   pointing at a **new** `CaptureWidget.entitlements` (the app-group must match
   `group.cloud.patina.field`, `Capture/Capture.entitlements:6`).
3. A **new** `Embed Foundation Extensions` copy-files phase on the app target
   (`symbol_dst_subfolder_spec = :plug_ins`) plus `app.add_dependency(widget)`. Patina's
   hand-written project shows the exact shape required:
   `Patina.xcodeproj/project.pbxproj:234` `5B8315A74B4D3E6AD1C34EC7 /* Embed Foundation Extensions */`.
4. `CaptureKit` must be linked into the extension (it owns `CaptureSyncAttributes`) — and
   **must not** be embedded there, because the host app already embeds it (`:207-212`).
5. `PatinaDesignKit`: link into the extension via `link_local_package`, `embed_in: [app]` only.
   See §2.
6. The scheme block (`:301-311`) must add the widget to the app scheme's build targets or it
   will not build under `capture-gate.sh`.
7. `NSSupportsLiveActivities` — **only needed on the app target**, and it is an Apple-known key,
   so it can be added *either* as `s['INFOPLIST_KEY_NSSupportsLiveActivities'] = 'YES'` in the
   generator's app block *or* as a literal key in `Capture/Capture/Info.plist`. **Put it in the
   physical `Info.plist`.** That is the only variant that does not touch `generate_project.rb`
   and therefore the only variant that can run concurrently with (a), (b) or (c).

**(b) An App Intents / `ControlWidget` target membership.**

Two distinct sub-asks that must not be conflated:

- *`AppIntent` types for Siri / Shortcuts / the Action Button* need **no new target at all** —
  they are ordinary Swift files under `Capture/` or `CaptureKit/`, already globbed by
  `swift_files` (`:23-25`, `:140-143`). This is a zero-project-change item.
- *A `ControlWidget`* (iOS 18 — no floor move needed, Field is already at 18.0) is a
  `WidgetKit` widget and **must live in the app-extension bundle from (a)**. It has no target of
  its own. So (b) is a strict *consumer* of (a), not a peer.
- If an intent type must be shared between app and extension it belongs in `CaptureKit`, which
  the extension links per (a.4). There is no third membership mechanism here — the generator
  assigns files to targets by directory (`add_sources`, `:129-138`), so "target membership" is
  **decided by which folder a file is in**. Two teams wanting the same file in two targets must
  agree on a folder, not on a checkbox.

**(c) A deployment-floor change.** One edit, `generate_project.rb:17`. It also invalidates the
comment in `PatinaDesignKit/Package.swift:23-27` (see §2.2).

**Which can share a commit:**

- **(a) and (b) MUST share a commit.** A `ControlWidget` with no extension target does not
  compile into anything; an extension target with no widget in it fails
  `WidgetKit` bundle validation. They are one change.
- **(c) CAN share that commit** and, given "make the big changes now", should: a floor move and
  a target addition both force a full regeneration of the same file, and doing them as two
  commits means paying the whole-project pbxproj rewrite twice.
- **(a)+(b)+(c) CANNOT be split across two worktrees under any circumstances.** Both would
  `rm -rf` and regenerate `Capture.xcodeproj`, and the merge is not a text merge of two
  intentions — it is two complete, independently-hashed renderings of a 5-target vs 6-target
  project. `predictabilize_uuids` makes each rendering *deterministic*, not *mergeable*: every
  `PBXContainerItemProxy`, `PBXTargetDependency`, build-configuration-list and scheme file
  differs between them. This is the trap already recorded as
  `feedback_capture_pbxproj_regen_worktree_trap`.
- **Adding source files is a different, safer class.** Two teams adding `.swift` files under
  different `Capture/Features/*` subtrees produce disjoint `PBXFileReference` /
  `PBXBuildFile` / group-children hunks, because `swift_files` sorts (`:24`) and groups are
  per-source-root (`:140-143`). Those merge. **Target structure does not.**

> **Rule for the plan:** exactly one team owns `generate_project.rb` for the whole program, and
> it lands (a)+(b)+(c) as one commit on `main` before any other Field team's first commit.
> Every other Field team adds files and re-runs the script; none of them edits it.

---

## 2. PatinaDesignKit

`apps/mobile/PatinaDesignKit/Package.swift`, 47 lines.

### 2.1 What it is

```
Package.swift:31-33   .library(name: "PatinaDesignKit", type: .dynamic, targets: ["PatinaDesignKit"])
Package.swift:26      .iOS("17.6")
Package.swift:43      .swiftLanguageMode(.v5)
Package.swift:39      resources: [.process("Resources/Fonts")]
```

The header states the rule that makes `.dynamic` load-bearing (`Package.swift:11-14`): it lands
in both the Capture app target and the embedded CaptureKit framework, and "a static product
linked to both would duplicate every symbol."

### 2.2 The floor comment is already stale

`Package.swift:23-25` says "the Patina app target's `IPHONEOS_DEPLOYMENT_TARGET` is 17.6
(despite the 'iOS 18+' doc note)". It is **26.0** today
(`Patina.xcodeproj/project.pbxproj:494` et al.). The package floor of 17.6 is therefore lower
than *both* consumers (Capture 18.0, Patina 26.0). Harmless for compilation, actively
misleading for any team deciding whether it may use an iOS 18/26 API inside the design system —
they will believe they cannot. Fix it in the same commit as §1.6(c).

### 2.3 What breaks when a SECOND target consumes the dynamic product

**The answer differs between the two apps, and Patina already has the proof.**

*Patina (hand-written project) — already solved.* `PatinaWidget` is a real
`com.apple.product-type.app-extension` target (`Patina.xcodeproj/project.pbxproj:201-224`).
It **links** PatinaDesignKit (`:218-220` `packageProductDependencies = (42B5169FCD24D837D3755484 /* PatinaDesignKit */)`)
and its build phases are `Sources / Frameworks / Resources` only (`:205-209`) — **no embed
phase**. The app target carries both `DE516B1700000000000000A5 /* Embed Frameworks */` and
`5B8315A74B4D3E6AD1C34EC7 /* Embed Foundation Extensions */` (`:234-235`). That is the correct
shape: the host app embeds the dylib once into `Patina.app/Frameworks/`, the `.appex` inside
`Patina.app/PlugIns/` resolves it at load time via `@rpath`. Three separate product-dependency
objects exist for the three consumers (app `…A2`, widget `42B5…`, tests `…B2`), and only the
app's has a matching `in Embed Frameworks` build file (`:20`, `:66`).

*Capture (generated project) — not solved, and the generator will actively fight it.*
`link_local_package` takes `embed_in:` and raises if the named target has no phase called
exactly `'Embed Frameworks'` (`:273-274`). A new extension target passed in `targets:` but not
in `embed_in:` is handled correctly by `:272`. **The failure mode is the opposite mistake:** a
team that "helpfully" adds the extension to `embed_in:` gets a second signed copy of
`PatinaDesignKit.framework` inside the `.appex`, which is the classic
`ITMS-90206 / dyld: Library not loaded` pairing at install time. The comment at `:267-271`
records that this exact class of bug already cost a device debugging session
("the device `.app` had no `Frameworks/` copy and would dyld-crash at launch").

**Second thing that breaks, and it is the one nobody has hit yet:** the extension needs the
*rpath* to the host app's `Frameworks/`. Patina's app-extension gets it from Xcode's template
defaults baked into the hand-written pbxproj; `generate_project.rb`'s `common!` (`:33-45`) sets
**no `LD_RUNPATH_SEARCH_PATHS` at all** and relies on `xcodeproj`'s target defaults. For an
`:app_extension` target that default is `$(inherited) @executable_path/Frameworks` — which for
an `.appex` points at `…/PlugIns/CaptureWidget.appex/Frameworks`, **not** the host's. The
extension target must explicitly set
`LD_RUNPATH_SEARCH_PATHS = $(inherited) @executable_path/../../Frameworks`.
This is not optional and it is not in the script today. *(Confidence: high on the mechanism,
which is standard WidgetKit-with-dynamic-framework; I did not build it to confirm, because this
machine cannot yet build the target that does not exist.)*

### 2.4 Font resources

`PatinaDesignKit` processes `Resources/Fonts` (`Package.swift:39-41`) and *separately*
`generate_project.rb:183-187` adds `CaptureKit/CaptureKit/Resources/Fonts/*.ttf` to
CaptureKit's resources phase. Two font copies already ship. A widget extension rendering text in
the studio's typeface needs the fonts resolvable from the `.appex` — the PatinaDesignKit bundle
is the path that works (it travels with the dylib); the CaptureKit copy does not reach the
extension unless CaptureKit is embedded there, which §2.3 forbids. Flag this to whoever builds
the widget: **use PatinaDesignKit's type API, never `CaptureType`'s raw font names.**

---

## 3. SwiftData schema (`apps/mobile/Patina/Patina/Core/Persistence/PatinaSchema.swift`, 51 lines)

### 3.1 Current state

```
PatinaSchema.swift:25   static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }
PatinaSchema.swift:46-48  static var schemas: [any VersionedSchema.Type] { [PatinaSchemaV1.self] }
PatinaSchema.swift:50     static var stages: [MigrationStage] { [] }
```

**Yes — the stages really are empty**, and correctly so: there has only ever been one shipped
version, so there is nothing to migrate *between*. An empty `stages` on a one-version plan is
not a bug; it becomes one the moment a V2 exists without a stage appended.

Nine models, `:28-38`: `TableItemModel`, `RoomModel`, `SavedItem`, `StylePreferenceModel`,
`SyncQueueItem`, `RoomScanPackage`, `DesignRequestDraft`, `SubmittedDesignRequest`, `BoardModel`.
The brief is right: **no local model for decisions, proposals, documents, invoices, threads or
orders.** Phase 4 ("hold the direction") is therefore a *schema-adding* change, not a
field-adding one.

### 3.2 What adding local models actually requires

`PersistenceController` consumes the plan in three places —
`PersistenceController.swift:46` (`Schema(versionedSchema: PatinaSchemaV1.self)`), `:77` and
`:92` (both `migrationPlan: PatinaMigrationPlan.self`), and `:124` for previews. The recovery
ladder at `:71-105` (open → archive-and-retry → in-memory, never `fatalError`, documented at
`:66-70` as C7-01) means a botched migration degrades to a wiped local store rather than a crash
loop. That is a real safety net, and it is also the reason a sloppy V2 can *silently* delete a
tester's local data instead of failing loudly.

Minimum correct change to add `SharedDirection` + `NextDecision` models:

1. New `enum PatinaSchemaV2: VersionedSchema`, `versionIdentifier` `Schema.Version(2, 0, 0)`,
   `models` = V1's nine **plus** the new ones.
2. `PatinaMigrationPlan.schemas` → `[PatinaSchemaV1.self, PatinaSchemaV2.self]`.
3. `PatinaMigrationPlan.stages` → `[.lightweight(fromVersion: PatinaSchemaV1.self, toVersion: PatinaSchemaV2.self)]`.
   Pure model *addition* is inferrable, so lightweight is correct; a rename or a
   required-property addition is not and needs `.custom`.
4. `PersistenceController.swift:46` and `:124` must move from `PatinaSchemaV1.self` to
   `PatinaSchemaV2.self`. **These two lines are the ones people forget** — the plan gets the new
   version, the container keeps opening the old one, and every V2-only property reads nil
   forever with no error.

### 3.3 The constraint nobody has costed: the store is not in the App Group

`ModelConfiguration` is built with `schema / isStoredInMemoryOnly / allowsSave` and **no
`groupContainer:`** (`PersistenceController.swift:47-51`). The store lives in the app's own
container. `Patina.entitlements:17-19` and `PatinaWidget/PatinaWidget.entitlements` both declare
`group.cloud.patina.app`, and the widget reads a **separate, file-based** payload
(`PatinaWidgetShared/HouseWidgetPayload.swift:217,230` — `usesAppGroupContainer`).

Consequence for Phase 4/5: **a widget or Live Activity cannot read the cached direction from
SwiftData as things stand.** Two routes, and they are not equivalent:

- *Extend `HouseWidgetPayload`* — additive, no store move, no migration. Cheap. Recommended.
- *Move the store into the App Group* — changes `configuration.url`, which means the existing
  store is at the old path and the new container opens empty. SwiftData will not migrate across
  a URL move; `LocalStoreRecovery.archiveStore(at:)` (`:86`) will not even see the old file.
  Under "make the big changes now", this is defensible *because* there are no App Store users —
  but it must be a deliberate, announced, TestFlight-data-loss decision, not a side effect of a
  widget ticket.

### 3.4 Serialisation

`PatinaSchema.swift` is one file with one version number. Two teams cannot both introduce V2.
The schema bump must be **one commit, one owner**, landed before any team writes a model.

---

## 4. Terminology — the real size of the `piece` / `specimen` split

This is the finding that most changes the shape of the plan. **The user-facing surface and the
identifier surface differ by two orders of magnitude, and the deck's "canonical entity names
across both apps and the portal" (Phase 1) reads as though they are one job.**

### 4.1 Counts (Swift sources, `.build/` excluded)

| Measure | Field (`Capture`) | Client (`Patina`) |
|---|---|---|
| Total `specimen`/`Specimen` occurrences | **1,856** across 97 files | — |
| Total `piece`/`Piece` occurrences | — | **853** across 127 files |
| Quoted strings containing the noun | 19 (incl. route keys / analytics) | 219 |
| **Genuinely user-visible strings** | **7** | ~219 (already canonical) |

### 4.2 The seven Field strings a designer can actually read

```
Capture/Capture/Features/Capture/ViewfinderControls.swift:251   "Tap to capture, hold for a multi-shot specimen"   (accessibilityHint)
Capture/Capture/Features/Recognition/Tag/TagOCRSheet.swift:101  "Add to specimen"
Capture/Capture/Features/Recognition/Tag/TagOCRSheet.swift:154  "Add to specimen"
Capture/Capture/Features/Resilience/ResilienceScreens.swift:86  "Pull existing shots into a specimen"
Capture/Capture/Features/Root/RootView.swift:221                "Review this specimen"          (companion hint)
Capture/Capture/Features/Specimen/SpecimenSheetScreen.swift:38  "Specimen"                       (sheet title)
Capture/Capture/Features/Specimen/SpecimenSheetScreen.swift:364 "That specimen is no longer here."
```

Excluded as internal and correctly so: `RouteRegistry.swift:72` / `CaptureNavigation.swift:87`
registry keys, `LocalCaptureSyncService.swift:32` (a log line), `analytics.event(…)` payload
keys, `"capture.routingSpecimenId"` UserDefaults keys, `#Preview` names.

### 4.3 The judgement this forces

**Renaming the seven strings is a half-day, conflict-free, parallel-safe change.**
**Renaming 1,856 identifiers touches ~97 of Field's 272 app files plus CaptureKit and every test
fixture, and would collide with every other Field team simultaneously.**

The brief says prefer the correct end state. I would still separate these: land the seven
user-facing strings in Phase 1 (cheap, visible, what the studio experiences), and schedule the
symbol rename as its own exclusive window with no other Field work in flight — *if it is taken
at all*. It is a pure-internal refactor with no user-visible effect, competing for the same
worktree as (S1) the project-generator change.

Note also the second half of the collision named in the brief: **"Studio" means the design firm
and the homeowner's own tab.** That one *is* user-facing on both sides and is not measurable by
grep alone — it needs a copy decision before a code change.

### 4.4 Copy tests — the asymmetry is real

**Patina has one; Field does not have its equivalent.**

- `apps/mobile/Patina/PatinaTests/NounConsistencyTests.swift` is exactly what the deck says:
  one `@Test` per copy-deck row (header `RL1E2-05`), each reading a pinned source file via
  `SourcePin.read` hoisted out of its `withKnownIssue` wrapper (`RL1E2-15`), asserting both the
  absence of the old noun and the presence of the new one — e.g. `:38-40`
  (`"View Product Detail"` → `"See the piece"`), `:57-59` (`"All pieces"`), `:73-75`
  (`allItemsTab`). It also pins that the *analytics* name must NOT move while the display name
  does (`:59` `#expect(AppRoute.crossRoom.analyticsScreenName == "All Items")`) — a rule the
  Field rename will need too.
- Field's nearest equivalents are **narrower and differently aimed**:
  `CaptureTests/FieldVerbCopyTests.swift` pins ~6 dispatch-promise sentences
  (`PunchCourtCopy.intent/filed`) because "a line promising a send that the database declines is
  a lie the designer cannot detect" (`:5-8`). That is a *truthfulness* test, not a *lexicon*
  test.
- Field's lexicon enforcement is **not a test at all** — it is a shell grep in the gate:
  `scripts/capture-gate.sh:52` `SWEEP_ROOTS=(Capture/ CaptureKit/)`, `:104-117` `fcr3_sweep`
  sweeping `inbox` and `ai` against an allow-list of wire-contract sites, plus `:121-147`
  `principle4_sweep` forbidding `suggestionConfidence` in the app target. The header at `:40-42`
  is candid: "The Swift test guards the *helper*, not the copy, so this sweep is the only thing
  standing between a reintroduced string and a green gate."

So Phase 1's "a copy-test suite for Field" means: port the `NounConsistencyTests` *shape*
(one test per row, `SourcePin`-style reads, absence + presence) into `CaptureTests`, and decide
whether `fcr3_sweep`'s grep survives alongside it or is folded in. `SourcePin` lives in
`PatinaTests` and is not available to `CaptureTests` — it will need re-implementing or lifting.

---

## 5. Package pins

### 5.1 Where they are

| File | tracked? | `supabase-swift` | `posthog-ios` |
|---|---|---|---|
| `apps/mobile/Mobile.xcworkspace/xcshareddata/swiftpm/Package.resolved` | **yes** | **2.51.0** (`:19`) | 3.64.6 (`:10`) |
| `apps/mobile/Patina/Patina.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` | **yes** | **2.40.0** (`:28`) | 3.48.0 (`:19`) |
| `apps/mobile/Capture/Capture.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` | **NO — gitignored** | **2.55.1** (`:19`) | 3.70.1 (`:10`) |

Declared requirements (both `upToNextMajorVersion`, so any 2.x satisfies):

```
generate_project.rb:236-238    supabase-swift  minimumVersion 2.40.0   → Capture app target
generate_project.rb:239-241    posthog-ios     minimumVersion 3.48.0
Patina.xcodeproj/project.pbxproj:907-910   supabase-swift  minimumVersion 2.5.1
Patina.xcodeproj/project.pbxproj:899-902   posthog-ios     minimumVersion 3.48.0
```

### 5.2 The fact that changes the plan

`git check-ignore` proves it:

```
apps/mobile/Capture/.gitignore:18:  Capture.xcodeproj/project.xcworkspace/
```

**Capture's `Package.resolved` is gitignored.** And `generate_project.rb:20` `rm -rf`s the entire
`Capture.xcodeproj` on every run — which `capture-gate.sh:11,14,21` calls before *every* build
and *every* test. So Field's dependency pin is **deleted and re-resolved on every single gate
run**, against an open-ended `upToNextMajor` requirement.

Consequences, all of them load-bearing for a multi-team program:

1. **Field has no reproducible build today.** Two machines running `capture-gate.sh build` a
   week apart can compile against different `supabase-swift` minors. The 2.55.1 in the working
   tree is simply "whatever the latest 2.x was the last time someone built here."
2. **"Converge the three pins" (deck Phase 1) is not three file edits.** Patina's and the
   workspace's are real files and can be edited. Capture's cannot be pinned by editing anything
   — it has to be pinned by **changing the requirement in `generate_project.rb`** from
   `upToNextMajorVersion` to `exactVersion` (or a tight range) at `:222`, *or* by un-ignoring
   `project.xcworkspace/xcshareddata/swiftpm/` and teaching the generator not to destroy it.
   The first is cleaner and is one more reason S1 (one owner for the generator) holds.
3. **`Mobile.xcworkspace` is a third resolution universe.** Opening the workspace
   (`contents.xcworkspacedata` lists `Capture.xcodeproj`, `Patina.xcodeproj`, `PatinaDesignKit`)
   resolves once for both projects at 2.51.0 — so *the same source tree compiles against a
   different SDK version depending on whether a developer opened the workspace or the project.*
   That is a genuine "works on my machine" generator, and it is live right now.

### 5.3 What breaks if they diverge while two teams work

Concretely, not hypothetically:

- A Field team writing against 2.55 API and a client team on 2.40 both pass their own gates and
  both break the other's on merge, with a compile error in a file neither of them touched.
- `xcodebuild` resolution happens at build time with no lockfile to conflict on, so **git will
  never show a conflict** — the divergence is invisible to review and appears only as a red
  build on someone else's machine.
- The workspace-vs-project split means a red build may not reproduce for the person asked to fix
  it, depending on which file they opened.

**This must be fixed in Phase 1 before any team writes Supabase-touching Swift**, and the fix
lands in `generate_project.rb`, i.e. inside S1's exclusive window.

---

## 6. The six unreachable Field screens

### 6.1 The gate

```
CaptureDeepLink.swift:251-257
    private static var verificationHarnessAllowed: Bool {
        #if DEBUG
        return true
        #else
        return !AppConfiguration.runsRealServices
        #endif
    }
```

and

```
AppConfiguration.swift:101-108
    public static var runsRealServices: Bool {
        if useMocks || isUITest { return false }
        #if targetEnvironment(simulator)
        return ProcessInfo.processInfo.arguments.contains("-CaptureForceReal")
        #else
        return true
        #endif
    }
```

On a **physical device in Release** (TestFlight): not DEBUG, not mocks, not simulator →
`runsRealServices == true` → `verificationHarnessAllowed == false`. Both entry points are
guarded: `handle(...)` at `:46` and `drive(screen:...)` at `:64`.

### 6.2 Proof that these six have no other door

Exhaustive grep over `Capture/` + `CaptureKit/` for the only navigation verbs
(`coordinator.navigate(to:)` / `coordinator.present(...)`):

| Screen | Only call site | Verdict |
|---|---|---|
| T1 Settings | `CaptureDeepLink.swift:119` | harness-only |
| T2 Account | `CaptureDeepLink.swift:120` | harness-only |
| Sign-out | inside `AccountScreen.swift:238-243,262-265` | unreachable **transitively** via T2 |
| Workspace switch | inside `AccountScreen.swift:147-157` | unreachable **transitively** via T2 |
| Q1 QR scan | `CaptureDeepLink.swift:238` | harness-only |
| Q2 QR approver | `QRScanScreen.swift:81` | reachable *from Q1*, so unreachable transitively |
| R3/E3 photo-import fallback | `CaptureDeepLink.swift:107` | harness-only |

All of these screens are **registered** and fully built —
`SystemSurfaceScreens.swift:40-56` registers `.settings` and `.account`;
`QRApproveScreens.swift:26-28` registers `.qrApprove`;
`ResilienceScreens.swift:297` registers `.photoImport`. The views exist, are styled, and have
tests. Nothing but a navigation edge is missing.

Corroborating detail: `RootView.swift:224` already writes a companion hint for
`case .settings, .account: return "Field settings"` — the app is *prepared* for a state it
cannot enter.

### 6.3 The minimal correct fix

Add real entry points. It is an additive UI change, not a change to the harness gate:

1. **T1/T2** — one durable affordance. The natural home given the existing structure is the
   Work realm's root (`W1`) or the companion surface; `RootView.swift:216-229` already names
   both routes, so the coordinator call is `coordinator.navigate(to: .settings)` /
   `.account` from a new control. **One file, plus whichever screen hosts the control.**
2. **Q1** — the QR sign-in scanner needs an entry from the account/settings surface (it is a
   web→app handoff). Q2 then follows automatically via the existing `QRScanScreen.swift:81`.
3. **R3/E3 photo-import** — `ResilienceScreens.swift:86` already has the copy
   ("Pull existing shots into a specimen"); it needs a `coordinator.present(.photoImport)` from
   the camera-denied state and from the share-sheet path.

**Do not** "fix" this by loosening `verificationHarnessAllowed`. That would ship the whole
79-screen verification harness — including `field://screen/<id>` accepting arbitrary ids and
`WorkFixtures` mock data (`CaptureDeepLink.swift:8-9` imports `CaptureKitMocks`) — to TestFlight
testers. The gate is correct; the missing edges are the bug.

### 6.4 File-ownership collisions with the rest of the program

- `CaptureDeepLink.swift` — **does not need to be touched at all** by the correct fix. Good.
- `AccountScreen.swift` / `SettingsScreen.swift` — touched only by this item.
- `RootView.swift` — **contested.** It holds companion placement (`:201-229`) and realm
  switching (`:231+`). Phase 3 (notifications) will want a tap-to-route path through here, and
  Phase 5 (Live Activity) reads `CaptureSyncAttributes` from `ViewfinderModel.swift`. Sequence
  Phase 0's `RootView` edit first and let 3/5 rebase.
- `ResilienceScreens.swift` — touched only by this item.
- **No overlap with `generate_project.rb`.** Phase 0 can therefore run *concurrently with* S1,
  in a different worktree, as long as neither commits a regenerated pbxproj containing the
  other's new files. Simplest discipline: Phase 0 adds no new files, only edits existing ones.

### 6.5 The three other Phase 0 defects, confirmed

- **`hardwareEntry` is dead.** `ReadyScreen.swift:18` `var hardwareEntry: HardwareEntry = .actionButton`;
  `:23` `var onSetHardwareEntry: () -> Void = {}`. Grep for `hardwareEntry` across the whole app
  returns **only** `ReadyScreen.swift:18,72,82,87,90` and `:119` (a `#Preview`).
  `OnboardingFlowView.swift:102` is `ReadyScreen(analytics: analytics, onStart: onComplete)` —
  neither parameter is passed. Every device, Pro or not, is told to map an Action Button, and
  the "Set it up" button calls an empty closure.
- **`accept()` promotes an unchanged guess to "typed by the designer".**
  `SmartGuessSheet.swift:297-299`:
  `private func promotedSource(_ value: String, _ original: String) -> ProvenanceSource { value == original ? .manual : .edited }`
  — the ternary is inverted relative to its meaning. Accepting an untouched suggestion records
  `.manual`. Called three times at `:265,:268,:271`.
- **The guess service is called blind.** `SmartGuessSheet.swift:209`
  `let guess = await smartGuess.guess(image: image, ocr: [], codes: [])` — empty OCR and code
  arrays, despite `TagOCRSheet` and the barcode sheet existing and writing to the same specimen.

All three live in **two files** (`ReadyScreen.swift`/`OnboardingFlowView.swift`, and
`SmartGuessSheet.swift`) that nothing else in the program touches. Fully parallel.

---

## 7. CI

### 7.1 The workflows

**`.github/workflows/policy-quality.yml`** — `on: pull_request` and `push: branches: [main]`
(`:3-6`). Four jobs: `policy` (ubuntu), `plan` (ubuntu), `affected-quality` (ubuntu, advisory),
and the two iOS gates:

```
policy-quality.yml:91-98     ios-patina:  name "Patina iOS gate (advisory)"
                       :95     runs-on: macos-15
                       :98     run: apps/mobile/Patina/scripts/ios-gate.sh all

policy-quality.yml:100-107   ios-capture: name "Capture iOS gate (advisory)"
                      :104     runs-on: macos-15
                      :107     run: apps/mobile/Capture/scripts/capture-gate.sh all
```

Triggering is purely path-based (`scripts/hooks/core.mjs:365-370`):
`iosPatina` = any changed path under `apps/mobile/Patina/`, `iosCapture` = under
`apps/mobile/Capture/`. **Note the gap: `apps/mobile/PatinaDesignKit/` matches neither.**
A design-system change that breaks both apps triggers **no iOS gate at all**. That is a live
hole and it will be hit by this program, which touches PatinaDesignKit for the widget.

**`.github/workflows/ai-quality-gate.yml`** — `on: pull_request` to `main` (`:3-5`). One
`ubuntu-latest` job (`:17`) running policy validation (`:43-49`) and `pnpm verify:affected`
(`:51-55`), plus a `quality-gate` job asserting success (`:57-63`). **No macOS runner, no iOS
step anywhere.** It is not an iOS gate.

### 7.2 The exact gate commands

`apps/mobile/Capture/scripts/capture-gate.sh`:

```
:7    SIM="${CAPTURE_SIM:-iPhone 17}";  DEST="platform=iOS Simulator,name=${SIM}"
:11   generate() { ruby scripts/generate_project.rb >/dev/null; }
:14   xcodebuild build -project Capture.xcodeproj -scheme Capture  -sdk iphonesimulator -destination "$DEST" CODE_SIGNING_ALLOWED=NO -quiet
:22   xcodebuild test  -project Capture.xcodeproj -scheme CaptureKit -sdk iphonesimulator -destination "$DEST" CODE_SIGNING_ALLOWED=NO -quiet
:29   swiftlint lint --quiet --strict
:156  all)  build; test_; lint; fcr3_sweep; principle4_sweep
```

`apps/mobile/Patina/scripts/ios-gate.sh` (tiers documented `:8-17`):

```
:199  all)  cmd_build && cmd_test PatinaTests && cmd_lint_delta "${1:-main}"   (tiers documented :8-17)
:66-72  build:  xcodebuild build -project Patina.xcodeproj -scheme Patina -configuration Debug
                -destination 'generic/platform=iOS Simulator' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO
:75-80  test:   xcodebuild test  … -destination "$(sim_destination)" -only-testing:<target>
:57-64  sim_destination REFUSES to guess: IOS_GATE_UDID must be set, never 'booted'
:11-13  release / archive tiers exist and are deliberately OUTSIDE `all`
```

Two things follow immediately for the plan:

- **`capture-gate.sh all` runs `generate_project.rb` three times** (`build`, `test_`, and again
  inside any re-run). Each run `rm -rf`s and re-resolves packages — see §5.2. On CI this means
  the macOS runner resolves `supabase-swift` fresh from GitHub on every PR.
- **`ios-gate.sh` refuses to run tests without `IOS_GATE_UDID`** (`:61-63`, exit 2). The CI job
  at `policy-quality.yml:98` runs `all`, which includes `unit` — so either the runner has the
  variable set somewhere I did not find, or the Patina unit tier fails on CI by design and the
  job's "(advisory)" label is doing the work. **Worth a five-minute check before the plan leans
  on CI for anything.** *(Confidence: medium — I read both files and found no `IOS_GATE_UDID`
  export in the workflow.)*

### 7.3 What must change for an iOS 27 toolchain

Verified on this machine:

```
$ xcodebuild -version        →  Xcode 26.6, Build version 17F113
$ ls …/iPhoneOS.platform/…/SDKs/  →  iPhoneOS.sdk, iPhoneOS26.5.sdk -> iPhoneOS.sdk
$ swift --version            →  Apple Swift version 6.3.3 (swiftlang-6.3.3.1.3)
```

**Only the iOS 26.5 SDK is installed.** `Attachment`, `OCRTool`, `BarcodeReaderTool` cannot
compile here today — not "probably not", cannot.

The chain, in order, no step skippable:

1. **Xcode 27 on this machine.** Nothing iOS-27-flavoured is even *writable* before this;
   there is no way to know whether code compiles.
2. **`runs-on: macos-15` → a runner image carrying Xcode 27** at
   `policy-quality.yml:95` and `:104`. GitHub's `macos-15` image does not ship Xcode 27. This is
   a two-line edit whose availability is outside our control — it gates itself on GitHub
   publishing the image, which is exactly the "toolchain gate nobody costed" the deck names.
3. **An explicit `xcode-select` / `DEVELOPER_DIR` step** in both iOS jobs. Neither job sets one
   today; both inherit the image default. On a runner with several Xcodes that is a coin flip.
4. **`CAPTURE_SIM` (`capture-gate.sh:7`, default `"iPhone 17"`) must name a simulator the new
   image actually has.** A device-name destination silently fails on an image whose runtime set
   changed. Prefer `platform=iOS Simulator,OS=…,name=…` or a UDID, matching the discipline
   `ios-gate.sh:52-64` already enforces for Patina.
5. **Only then** a deployment-floor decision (§1.6c). Note the ordering the deck gets right:
   Xcode 27 is required to *compile* iOS 27 symbols; raising `IPHONEOS_DEPLOYMENT_TARGET` is a
   separate, later decision about which devices may install the result, and it is gated on the
   house census Kody still owes.

Also: `.swiftlint.yml` exists for both apps and `capture-gate.sh:29` runs `--strict`. A Swift
toolchain bump routinely surfaces new SwiftLint findings; budget for a `--strict` red that is
nobody's feature.

---

## 8. The true serialisation constraints

Stated as rules a plan can be checked against.

**S1 — One owner for `Capture.xcodeproj` target structure, for the whole program.**
Adding the widget/Live-Activity extension target, adding `ControlWidget` membership, moving the
deployment floor, and pinning the `supabase-swift` requirement are **all edits to
`generate_project.rb`**, and all of them regenerate the same committed pbxproj from scratch
(`:20`). Two worktrees doing this produce unmergeable renderings, not conflicting hunks. These
four land as **one commit, first**, before any other Field team's first commit.
*Corollary:* (a) the extension target and (b) `ControlWidget` membership **cannot** be separate
commits — a control widget with no extension bundle compiles into nothing. (c) the floor move
**can and should** join them.

**S2 — Pin convergence precedes all Supabase-touching Swift, on both apps.**
Three `Package.resolved` files disagree (2.40 / 2.51 / 2.55) and the Field one is gitignored and
destroyed on every build (`Capture/.gitignore:18`, `generate_project.rb:20`). Until the
requirement at `generate_project.rb:222` is made exact, Field has no reproducible dependency
graph, and **git will never surface the divergence as a conflict** — it appears as a red build
on a machine that did not make the change. This is inside S1's window, so it lands in the same
commit.

**S3 — The `specimen` symbol rename, if taken, gets an exclusive Field window.**
1,856 occurrences across 97 files. But **only 7 strings are user-visible** (§4.2). Split the
job: the 7 strings are parallel-safe and belong in Phase 1; the symbol refactor is a separate
exclusive window with no other Field work in flight, and it competes directly with S1 for the
same tree. My recommendation is to take the 7 now and schedule the 1,849 deliberately, or not
at all.

**S4 — One `PatinaSchema` V2, one owner.**
`PatinaSchema.swift` has one `versionIdentifier` (`:25`) and one `stages` list (`:50`, genuinely
empty and correctly so). Any team adding a local model must go through the single V2 bump, which
also must update `PersistenceController.swift:46` and `:124`. Two concurrent V2s is not a merge
conflict, it is a corrupted migration plan. **Additional gate:** if the widget must read the
cached direction, decide *first* whether the store moves into the App Group — it does not live
there today (`PersistenceController.swift:47-51`) and moving it abandons every tester's local
data (§3.3).

**S5 — Xcode 27 before any iOS-27 symbol, and a runner image before CI can confirm it.**
Xcode 26.6 / iOS 26.5 SDK only, verified. `macos-15` at `policy-quality.yml:95,104`. Phase 5's
`SpeechTranscriber` and the tag experiment sit behind a dependency we do not control. Phase 5's
*other* half — `NSSupportsLiveActivities`, a device check, and the widget extension — is **iOS
18 work and needs none of this.** Do not let the iOS-27 half hold the iOS-18 half hostage.

### What is genuinely parallel

- **Phase 0's four Field defects.** `ReadyScreen.swift` + `OnboardingFlowView.swift:102`,
  `SmartGuessSheet.swift:209,297-299`, and the six navigation edges (§6.3). Disjoint files,
  no new files, no generator edit. Runs alongside S1 in its own worktree.
- **APNs for Field.** `Capture/Capture/Capture.entitlements` is a **static committed file**
  (`generate_project.rb:150` only adds a file *reference*), so adding `aps-environment` touches
  neither the generator nor the pbxproj. Patina already carries it
  (`Patina/Patina.entitlements:5-6`), so the client side is a registration/token job only.
- **`NSSupportsLiveActivities`.** Put it in the physical `Capture/Capture/Info.plist`, not in
  the generator. It is an Apple-known key so either works — and only the plist keeps it out of
  S1's exclusive window.
- **`AppIntent` types.** Plain Swift files under an existing source root; the generator globs
  them automatically (`:23-25`, `:140-143`). Zero project change.
- **The Field copy-test suite.** New files under `CaptureTests/`, modelled on
  `PatinaTests/NounConsistencyTests.swift`. Note `SourcePin` is Patina-only and needs lifting.
- **Phase 4's client cache**, once S4's V2 has landed.
- **The extractor's iOS caller.** `supabase/functions/project-ffe-document-extract` still has
  **zero callers** — the only repo reference is its registration at `supabase/config.toml:628`.
  The portal route is upstream and non-iOS; Field's camera-to-extractor leg depends on the
  portal's contract existing, not on any iOS serialisation constraint above.

### Two unresolved items the plan should carry as open questions

1. **`IOS_GATE_UDID` on CI.** `ios-gate.sh:57-64` hard-exits without it and `policy-quality.yml:98`
   runs `all` (which includes `unit`). I found no export. Either the Patina CI gate never runs
   tests, or I missed the source. Confirm before treating CI as coverage.
2. **`apps/mobile/PatinaDesignKit/` triggers no iOS gate.** `scripts/hooks/core.mjs:365-370`
   matches only `apps/mobile/Patina/` and `apps/mobile/Capture/`. This program will change the
   design system; a one-line addition to the classifier should land in Phase 1.
