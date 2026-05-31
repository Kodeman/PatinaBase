# Patina iOS — Parallel Delivery Plan (71 stories, agent teams)

## Context

`docs/code-review/patina-ios-sprint-plan.md` translates four review tracks (engineering,
design, a11y, IA) into a **71-story / 14-epic / 6-sprint** plan, sequenced for **2 engineers
over 12 weeks**. The ask: re-cut that scope so **parallel agent teams** can deliver it.

A naive "one team per epic" cut fails, because the binding constraint is **not effort — it's
file contention**. Codebase exploration (2026-05-31) established:

- `.foregroundColor(` alone hits **786 calls across 106 files**, overlapping ~60 files with
  other sweeps. Files like `RoomDetailView` (7 sweep patterns), `WalkView`/`ShareScanSheet`/
  `CameraPermissionView` (6 each) are touched by nearly every codemod.
- **Global codemods cannot run in parallel** with each other or with feature work on the same
  files. They must be a **serialized "train"** on a frozen base.
- **No swift-syntax, no swift-format, no iOS CI** exist. Codemods are `rg`+`sed`+manual with an
  `xcodebuild` build-verify loop. SwiftLint runs warnings-only as a build phase.

So the program is organized around **file territories and a serialization spine**, not epics.

**Decisions made for this plan:** 3–4 concurrent agents · worktree branches fast-merged to
main · **Walk-First** onboarding (PT-4-7) · full 71-story scope as one continuous program
(~7–8 weeks wall-clock vs 12 sequential).

---

## Ground-truth corrections (re-validated 2026-05-31 — the plan text has drifted)

**Every team's first action in its territory is to re-run the `rg` counts below — the source
reports were written 2026-05-30 and several references have moved.**

| Item | Plan said | Reality | Consequence |
|---|---|---|---|
| Source root | `Patina/Patina/` ambiguous | `apps/mobile/Patina/Patina/` (one doubling); **35** feature dirs | all sweep `--glob` roots |
| `RoomScanSyncService` (2564 LOC) | `Features/RoomScan/Shared/Services/` | **`Services/Sync/`** | owned by Sync team, not RoomScan |
| `RoomCaptureService` (1177 LOC) | `Features/RoomScan/Services/` | **`Features/Walk/Services/`** | PT-6-2 lands in Walk team |
| `FirstLaunchTour` | FirstLaunch | **`Features/Help/`** | PT-1-9 env-key + Observation slice live in Help |
| `Design/Accessibility/` | exists | **does not exist** — PT-2-1 creates it | additive scaffold |
| `AppRoute` | 44 cases | **55 cases** (`App/Coordinators/Coordinator.swift:23–91`) | **PT-3-6 is L, not M**; front-load it |
| `Font.custom(` codemod | ~159 calls | **28, all in `PatinaTypography.swift`**. Real target is **`.font(.custom(` = ~159 / 45 files** | **fix the regex** or PT-1-1's acceptance grep falsely reports "done" |
| `.foregroundColor(` args | unknown | **680/786 are `PatinaColors.*`; 36 `Color.*`; 4 false-positives in comments**. `Color: ShapeStyle` | the big sweep is **~100% argument-preserving** mechanical |
| `clayBeige`/`mochaBrown` | rename | already **deprecated aliases** (`PatinaColors.swift:97–101`); 234 refs / 42 files | pure `sed`, then delete 2 alias lines |
| `print(` | 105 | **171 / 55 files** | bigger logging sweep |
| `.screen()` (PostHog) | sprawling regression | **2 files / 3 call sites** | PT-3-5 regression is trivially auditable |
| Conversation/Table/Emergence/Threshold | all "dead, gated" | **Table & Emergence = 0 external refs (delete now, no decision)**; **Conversation = 10 refs and Companion imports its `MessageBubble`/`TypingIndicator`** | only Conversation is truly gated, and it's *coupled* |
| `BackChevronButton.swift` (PT-0-7) | exists | **does not exist** — back-chevron is inline | PT-0-7 edits inline call sites only |
| Shared Xcode scheme | assumed | **none under `xcshareddata/xcschemes/`** | **CLI build gate is impossible until one is committed — the literal first commit** |

---

## The architecture: 3 stages + a serialized spine

```
WAVE 0  Tooling      1 agent      shared scheme + ios-gate.sh + lint rules
WAVE 1  Setup        3–4 agents   additive scaffolds, tokens, 0-ref deletions   (parallel)
WAVE 2  Sweep Train  1 conductor  serialized global codemods (+1 agent new-files)
WAVE 3  Territories  3–4 agents   disjoint-directory feature/perf/a11y work     (fan-out)
WAVE 4  Stabilize    2–3 agents   burn-down, full-app LiDAR regression, lint→error
```

The **Sweep Train owns the trunk during Wave 2**; territory branches are *cut only after the
Train-Complete barrier (B2)* so they never collide with a freshly-merged codemod.

---

## Execution model (decided)

### Branching / merge
- Each agent works in its **own git worktree on one feature branch**, namespaced
  `wave0/…`, `foundation/<storyid>-*`, `sweep/<storyid>-*`, `territory-<dir>/<storyid>-*`
  (matches the existing `.claude/worktrees/agent-*` setup).
- **No agent commits to `main` directly.** "Waves on main" = continuous integration: every
  branch fast-merges into `main` within hours, gated by the local script. `main` is the trunk.
- **Merge order is fixed and is the load-bearing rule:** Foundation → Sweep Train (serial,
  each codemod merged before the next) → Territories (cut after B2, merged in descending
  contention order: RoomDetail → Walk → RoomScan → Rooms → Companion → Authentication →
  FirstLaunch → rest). The shared design-system lane **merges last each day and yields** to
  territories (territory owners never resolve a conflict caused by the shared lane).
- Territory ownership is **disjoint-directory**. If two territory branches touch the same
  file, that file was mis-partitioned → escalate to re-partition, do **not** hand-merge.
- GC merged sweep/foundation worktrees at each barrier so the LiDAR build host isn't disk-starved.

### Verification gates (no CI → a committed local gate is mandatory, built in Wave 0)
`scripts/ios-gate.sh` with 4 tiers, run on the agent's worktree *before* PR and again by the
merger:
```
ios-gate.sh build       # xcodebuild build, Patina scheme, generic iOS sim
ios-gate.sh unit        # + xcodebuild test -only-testing:PatinaTests   (Swift Testing)
ios-gate.sh ui          # + xcodebuild test -only-testing:PatinaUITests (DesignerSmoke + FirstLaunch)
ios-gate.sh lint-delta  # SwiftLint "no NEW warnings in touched files" (per-file count vs merge-base)
```
**Gate matrix by PR type:**

| PR type | Gate | Device | Artifact |
|---|---|---|---|
| Codemod / new-file | build + unit + lint-delta | sim | diff stat + before/after `rg` counts; **no pixel change** (a codemod that moves pixels is a bug) |
| Feature / UI (territory) | + ui | sim | **screenshot in PR** (DoD) |
| Scan-pipeline (Walk/RoomScan/Sync/RoomCapture/ScanReview) | + **on-device LiDAR smoke (iPhone 17 Pro Max) + MobAI** | **real device** | LiDAR screenshots + MobAI report |
| Route consolidation (PT-3-5/6) | + PostHog `.screen()` before/after table (3 rows) | sim | screen-name diff |
| Decision-gated (PT-4-3) | + PM sign-off comment | per content | approval link |

`lint-delta` definition: `git diff --name-only origin/main...HEAD -- '*.swift'` → set `T`; run
SwiftLint JSON on merge-base∩`T` and HEAD∩`T`; **fail if HEAD warning count > base for any file
in `T`** (per-file, so a new warning can't be laundered by fixing an old one elsewhere).

---

## The Sweep Train (Wave 2 — one Conductor, serial spine)

Each step is `rg` discovery + `sed` deterministic core + manual residue, **build-gated before
the next merges**. Order is chosen so each step shrinks/avoids the next's surface.

| # | Step (PT) | Surface | Approach |
|---|---|---|---|
| A | Delete 0-ref dead code (Table, Emergence) | ~2.7k LOC, 0 refs | `git rm` + remove route case in `Coordinator.swift` + arm in `ContentView.swift`; compiler proves completeness (unhandled enum case won't build) |
| A' | Delete Conversation **iff PT-4-3=delete** | 10 refs | **first** extract `MessageBubble`/`TypingIndicator` into `Features/Companion/Components/`, re-point `CompanionConversationView`, *then* delete. If undecided by Day 6 → **skip leg**, train proceeds |
| B | (done Wave 0) SwiftLint rules as warnings + baseline | `.swiftlint.yml` | precedes C–I so "no new warnings" has a stable baseline |
| C | `clayBeige`/`mochaBrown` → `clay`/`mocha` (PT-1-2) | 234 / 42 | pure `sed`, then delete alias lines `PatinaColors.swift:97–101` last. Before E (104/106 fg files also use clay) |
| D | navbar → `.toolbar(.hidden, for:)` / `.toolbarTitleDisplayMode` (PT-1-7) | 65 / 32 | ~50% sed, ~50% manual (conditional view builders); structural, before token sweep E |
| E | **`.foregroundColor(` → `.foregroundStyle(` (PT-1-6)** | **786 / 106** | one global `sed` (arg-preserving), build **once**, then stage **commits per dense dir** (RoomDetail 126, Walk 122, RoomScan 96, Rooms 92, Companion 80, Auth 79, FirstLaunch 66, tail) for ~80–130-line reviewable diffs. Bisect by dir only if the single build fails |
| F | `.font(.custom("…", size:))` → `PatinaTypography.*` (PT-1-1) | ~159 / 45 | **fixed regex `.font(.custom(`**; 9-literal×size → ~30-token mapping table; ~60% sed, residue flagged to reviewer; adds Dynamic Type → screenshot at largest text size |
| G | `.cornerRadius(x)` → `.clipShape(.rect(cornerRadius: x))` (PT-1-8) | 49 / 18 | sed + manual where nested parens / shape-vs-view |
| H | `DispatchQueue.main.asyncAfter` → `Task`/`.task`+`Task.sleep` (PT-3-3) | 30 / 17 | **manual** (changes cancellation semantics); defer scan-file sites to T1 with LiDAR verify |
| I | `clay`→`Text.interactive` at text/icon sites (PT-2-7) | 168 / 63 | needs PT-0-3 token; decorative bg keeps lighter shade |
| J | a11y label + 44pt hit-target sweep (PT-0-4 + PT-2-1 application) | 167 `Image(systemName:)` / 65, 45 labeled | applies the new `AccessibleHitTarget` modifier; per-icon label is judgment → conductor batches with territory input |
| K | `print(` → `PatinaLog` (PT-6-15 sweep) | 171 / 55 | last (needs `PatinaLog` from Wave 1); `\bprint\(` word-boundary; manual multi-arg |

**Do NOT build a SwiftSyntax rewriter** — the highest-volume step (E) is 100% argument-preserving
with 4 trivial false-positives; `sed` is provably safe and a syntax tool buys nothing for the
manual-judgment steps (H/J). Spend that day on the F mapping table and H per-site review instead.

**B2 (Train-Complete barrier):** all codemods on `main`, gate green, **full-app LiDAR smoke
confirms the scan pipeline survived**. Territory branches are cut here.

---

## Territory partition (Wave 3 — disjoint directory ownership)

6 territory teams + 1 shared lane. With a 3–4 agent budget they **rotate**: T1a+T1b (the
critical path) hold 2 slots for all of Wave 3; the remaining 1–2 slots cycle T6→T2→T3→T4→T5,
with T-DS interleaved and merging last.

| Team | Owns (dirs) | Key stories |
|---|---|---|
| **T1a Capture & Scan UI** *(critical path)* | `Features/Walk/`, `Features/RoomScan/`, `Features/ARPlacement/` | PT-6-2 (split RoomCaptureService), 6-3 (split ScanReviewView), 6-4 (WalkView subviews), 6-7 (UIScreen→sized), 3-1/3-2 Walk slice, 2-6 (scan a11yValue), 4-6 (del WalkView v1), 6-11 routes, 4-9 host |
| **T1b Sync & Upload** *(critical path)* | `Services/Sync/`, `Services/Sharing/`, `Services/DesignServices/`, `Services/Permissions/` | **PT-6-1 (split RoomScanSyncService, XL/3 PRs)**, 3-1/3-2 Sync slice, 3-4 (@MainActor), 5-3 migration |
| **T2 Rooms & Detail** | `Features/Rooms/`, `RoomDetail/` (RoomDetailView 7-pattern, ShareScanSheet, RequestDesignServicesSheet), `Collections/`, `Decisions/`, `Projects/` | 2-5 (RoomItemRow combine), 6-5 slice, 6-8 (RoomBudgetBar), microcopy 6-12/13 |
| **T3 Companion & Conversation** | `Features/Companion/`, `Services/Companion/`, `StyleConversation/`, `Messaging/` (+ Conversation extraction) | 0-2 (bubble labels), 2-3/2-4/2-5 Companion, 6-9/6-10/6-11, 4-8 (skip Movement 2), 5-7 glass, 6-8 |
| **T4 Home, Onboarding & Help** | `Features/Home/`, `Designer/`, `Help/`, `FirstLaunch/`, `StyleQuiz/`, `StyleReveal/`, `Onboarding/`, `Splash/` | **4-7 Walk-First + 4-2** (del FirstLaunchCoordinator), 4-9 resume card, 0-6 (monogram), 3-7 bell *visual*, 4-10 chip *visual*, 5-8 (zoom) |
| **T5 Discovery, Product & Account** | `Recommendations/`, `ProductDetail/`, `Notifications/`, `Profile/`, `Account/`, `Settings/`, `QRAuth/`, `Receiving/` | 0-5 (wire/kill SettingsView), 2-4/2-5/2-8, 5-7 glass (Table/ProductDetail), 6-5 slice |
| **T6 Nav/Flow Core** *(serialized — one owner, never split)* | `App/Coordinators/Coordinator.swift`, `AppCoordinator.swift`, `ContentView.swift`, `App/DeepLinking/`, `Features/Shared/` | internal serial: **3-6 (enum split, L) → 3-5 (scanFlow + PostHog dual-emit) → 4-1/4-3/4-4 route deletions → 3-8 (PresentedSheet) → 3-9 (clear on phase) → 4-10 re-route → 6-16 bus** |
| **T-DS Design System** *(shared, merges last)* | `Design/Components/`, `Tokens/`, `Gestures/`, `Animations/`, `Accessibility/` | 5-1..5-6 **call-site migrations**, 5-9 (dark mode), 5-10 (sensoryFeedback), 5-11 (sheet polish), 6-6 (Canvas RNG), 2-4 gesture actions |

**Why T6 must be a single serialized team:** `Coordinator.swift` (the 55-case enum),
`AppCoordinator.swift` (the `showing*` booleans + `recomputePhase()`), and `ContentView.swift`
(the `destinationView` switch + 5 manual `.sheet` bindings at lines 71–108) are touched by ≥8
stories that all mutate the *same* enum / *same* sheet block. Splitting guarantees 3-way
conflicts. Header-view halves of PT-3-7 (bell) and PT-4-10 (chip) are delegated to T4 as
*visuals* against a coordinator API T6 publishes first — T4 edits Home/Designer files, T6 edits
coordinators, **no shared file**.

**Cross-territory handshakes (micro-PRs, reviewed by the folder owner):**
- **PT-3-1 Observation** (13 services across 6 dirs): T1a/T1b flip the *service classes* first;
  each territory then flips its own *consumers* (`@StateObject`→`@State`) as a sub-task.
- **PT-3-2** (5 `@StateObject=singleton` sites): service-owned by T1b, but `CameraPermissionView`
  lives in FirstLaunch (T4) and `ShareScanSheet`/`RequestDesignServicesSheet` in RoomDetail
  (T2) → one-line micro-PRs reviewed by the folder owner.
- **PT-4-3**: T3 extracts `MessageBubble`/`TypingIndicator` → only then T6 removes folder+route.

---

## Dependency DAG & critical path

```
PT-0-3 token ─▶ PT-2-7 (clay→interactive) ─▶ PT-5-9 (dark mode, also needs PT-1-2)
PT-1-1 (font) ─▶ PT-2-2 (relativeTo backfill)
PT-1-5 (warn rules) ─▶ all codemods ─▶ PT-6-17 (promote to error, needs 0 hits)
SWEEP TRAIN (B2) ─▶ ALL territory work
PT-3-6 (enum) ─▶ PT-3-5 (scanFlow) ;  PT-3-8 ─▶ PT-3-9
PT-3-1 (Observable) ─▶ PT-3-2 (StateObject) ─▶ PT-6-2 (RoomCapture split) ─▶ PT-6-1-adjacent
territory view-delete ─▶ T6 route-case delete (so each compiles)
PT-5-1..5-6 files (Wave 1) ─▶ T-DS call-site migrations
```
**Critical path (the pole): T1.** It carries the foregroundColor fallout in 8 Walk files, 5 of
13 Observation migrations, both the XL (PT-6-1) and L (PT-6-2) splits, **and every LiDAR-gated
story**. That is why T1 is two agents (T1a/T1b) holding locked slots, communicating only through
the on-disk **`ScanManifest` v3 contract** (RoomCaptureService writes via `ScanBundleWriter`;
RoomScanSyncService reads) — so they never edit the same file.

**LiDAR rig (single iPhone 17 Pro Max) scheduling:** device gate applies *only* to scan-pipeline
PRs (~20% of work); everything else is sim-only. Scan agents must pass build/unit/ui on sim
*before* enqueuing device time. Batch one LiDAR+MobAI smoke per scan-territory **per day**
(overnight, unattended via `DesignerSmokeUITests`), not per-PR. T1a and T1b serialize *only* for
device slots; the other 6 territories never wait. The **B2 train-complete LiDAR smoke is the
single most important device run.**

---

## Wave calendar (sized for 3–4 agents, ~7–8 weeks)

- **Wave 0 — Days 1–2 (1 agent, the future Conductor):** commit shared `Patina.xcscheme`; build
  `scripts/ios-gate.sh`; land PT-1-5 lint rules; capture lint baseline. **B0: gate green on main.**
- **Wave 1 — Days 3–5 (3–4 agents, additive only):** A) PT-0-1, 0-3, 1-3 tokens, 1-4, 1-9;
  B) new files AccessibleHitTarget / PatinaLog / companionSafeArea; C) design-system shells
  PT-5-1..5-6 (no migration); D) delete 0-ref Table+Emergence, issue PM packet (PT-4-3).
  **B1: foundation merged, gate green.**
- **Wave 2 — Days 6–~16 (1 Conductor + 1 agent):** Sweep Train steps A'–K back-to-back; parallel
  agent does PT-2-2 prep + PostHog screen-name baseline fixture + design-system internals.
  **B2: codemods on main + full-app LiDAR smoke. Territory branches cut here.**
- **Wave 3 — Days ~17–~50 (3–4 agents):** T1a+T1b locked for the wave; rotating slot(s) run
  T6 nav sub-train (~2wk) → T2 → T3 → T4 (Walk-First) → T5; T-DS interleaved, merges last.
  **B3: rolling per-territory DoD (merged, lint-delta clean, screenshot; LiDAR+MobAI for scan).**
- **Wave 4 — Days ~51–~56 (2–3 agents):** deferred call-site migrations, cross-territory a11y
  audit, full-app LiDAR+MobAI regression, PostHog verification, PT-6-17 (lint→error), PT-6-16.

---

## Product decisions

| Decision | Status | Fallback / handling |
|---|---|---|
| **PT-4-7 onboarding** | **Walk-First (decided)** | T4 builds camera→walk→reveal→quiz behind a PostHog flag; reuses existing 3-coachmark `FirstLaunchTour`; delete Walk-First-vs-quiz ambiguity in docs |
| **PT-4-5 Table** | **Deleted in Wave 1** (0 refs) | product-intent only; resurrect from git if wanted — no work proceeds on Table either way |
| **PT-4-4 Emergence** | **Deleted in Wave 1** (0 refs) | none needed |
| **PT-4-3 Conversation** | **PM packet, due Day 6** | 10 refs + Companion coupling. If undecided by Train start → **skip the delete leg**, train runs over it, delete later as a clean one-story follow-up (zero schedule cost) |

---

## Risks

1. **T1 (Walk+Sync) is the bottleneck even split 2 ways** — both big splits + 5 Observation
   migrations + all device-gated stories. Keep T1a/T1b on locked slots; serialize only their
   device time. Do not starve them to start a brand-leverage territory early.
2. **PT-1-1 regex trap** — running the literal acceptance grep `Font\.custom\(` reports 28 (token
   file) and falsely declares "done" while 127 inline `.font(.custom(` calls lack `relativeTo:`.
   Codemod *and* acceptance check must target `.font(.custom(`.
3. **PT-4-3 is coupled, not a clean delete** — extract `MessageBubble`/`TypingIndicator` into
   Companion before removing the folder; point PT-2-3/2-5 a11y work at the post-extraction location.
4. **PT-3-6 is under-scoped (M→L)** — 55 cases + every switch arm in AppCoordinator + ContentView's
   `destinationView`. Front-load it as T6's first story.
5. **PT-3-5 analytics regression** — only 3 `.screen()` sites; add a Swift-Testing parity assertion
   against a committed route→screen-name fixture; dual-emit old+new names behind an
   `ios_screen_name_v2` PostHog flag for one wave so funnels rebuild before old names stop.
6. **Don't block the train on a product gate** — the spine is the critical path for the whole fan-out.

---

## Verification (end-to-end)

- **Per PR:** `scripts/ios-gate.sh build|unit|ui|lint-delta` (built Wave 0) must pass before merge.
- **Sweep Train:** after each codemod, `xcodebuild ... -scheme Patina build` + `PatinaTests` +
  `lint-delta`; attach before/after `rg` counts; **B2 full-app LiDAR smoke** on the iPhone 17 Pro Max.
- **Territory PRs:** `ui` tier (`DesignerSmokeUITests` + `FirstLaunchUITests`) + screenshot;
  scan-pipeline PRs add **on-device LiDAR + MobAI** (`controlling-mobile-devices` /
  `running-smoke-tests` skills).
- **Program end (Wave 4):** full-app LiDAR + MobAI regression across capture→review→sync→reveal;
  PostHog screen-name funnel check; PT-6-17 flips the codemod lint rules from warning → error
  (only possible once `rg` shows 0 hits), locking the gains in CI-as-build-phase.

**Critical files** (the contention epicenters every team must coordinate around):
`apps/mobile/Patina/Patina/App/Coordinators/Coordinator.swift` (AppRoute, 55 cases) ·
`…/App/Coordinators/AppCoordinator.swift` (sheet booleans + `recomputePhase`) ·
`…/ContentView.swift` (destinationView + 5 sheet bindings) ·
`…/Services/Sync/RoomScanSyncService.swift` (2564 LOC, PT-6-1) ·
`…/Features/Walk/Services/RoomCaptureService.swift` (1177 LOC, PT-6-2) ·
`…/Design/Tokens/PatinaColors.swift` (tokens + aliases) ·
`apps/mobile/Patina/.swiftlint.yml` · `…/Patina.xcodeproj/xcshareddata/xcschemes/Patina.xcscheme` (create first).
