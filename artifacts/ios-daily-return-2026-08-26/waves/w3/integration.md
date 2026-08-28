# W3 — integration record

Written by the W3 integration steward, 2026-08-28, from
`.codex/worktrees/agent-dr-w3-integration` on branch `daily-return/integration`.
Everything below is read off the tree or off command output, not recalled.

**Verdict: every gate green. The wave is ready for Fable's ff-merge to `main`.**
Two named deviations from spec ride out of the wave un-fixed, both with an exact
cost and an exact exit — §6.

---

## 0. Setup

| Thing | Value |
|---|---|
| Base | `main` @ `17c6335fd` — `docs(ios): Daily Return — RESUME for the build program, W4 script` |
| Worktree | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-integration` |
| Branch | `daily-return/integration` (**not pushed**) |
| Simulator | **`A71FDDF2-D0F6-442F-9E21-B77604013F02`** — `dr-w3-int`, iPhone 17 Pro / iOS 26.5 |
| Tip | `071254f96` — this document |

```
$ git -C /Users/kody/Code/patina-merged worktree add \
    .codex/worktrees/agent-dr-w3-integration -b daily-return/integration main
Preparing worktree (new branch 'daily-return/integration')
HEAD is now at 17c6335fd docs(ios): Daily Return — RESUME for the build program, W4 script
```

`Secrets.swift` copied in (`-rw-------`, 1.1 k); `git status --porcelain apps/mobile/Patina`
in the worktree is empty — it is gitignored and never became a tracked change.
`.writer.lock.d` created at start.

**The simulator was created, not cloned** — the three lane clones and the review
device are all still booted, and `simctl clone` fails with SimError 405 against a
booted source (the W3 steward hit the same thing). Device type and runtime read
off the review device `973D1724-…`, so the frame is 402 × 874 exactly.

```
$ xcrun simctl create "dr-w3-int" …iPhone-17-Pro …iOS-26-5
A71FDDF2-D0F6-442F-9E21-B77604013F02
```

**The documented first-build failure reproduced and cleared on the second run**, as
the brief says it would:

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 1
** BUILD FAILED **   (3 SwiftCompile failures, no `error:` line — the 'Stamp Git SHA' phase)
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 2, identical command
** BUILD SUCCEEDED **
```

**Migrations:** none. `git diff main...HEAD --name-only -- supabase/` is empty and
`ls supabase/migrations | tail` still heads at `00538_client_account_anonymize.sql`.
W3 was expected to mint none and minted none; `00539` stays free for W5.

---

## 1. Merge order and conflicts — three merges, zero conflicts

N2 and N3 were both cut from N1's tip `b101f5009`, so the second and third merges
carried only their own commits.

| # | Merge | Commit | Result |
|---|---|---|---|
| 1 | `daily-return/w3-n1` | `84355de87` | clean |
| 2 | `daily-return/w3-n2` | `0be213840` | clean — 9 files, +511 −23 |
| 3 | `daily-return/w3-n3` | `301566ccc` | clean — 7 files, +622 −58 |

**The one file two lanes touched auto-merged, and the merge is coherent, not just
conflict-free.** `Features/Navigation/HouseFirstRoot.swift` took N2's `root(for:)`
(the three `TabRoot.swift` wrappers, `studioRoot` shim deleted — `n1-notes.md` §1c's
own ask) and N3's `companionSlot` (the Strata mark restored as a `Button` on
`toggleCompanion()`, which is N1's own patch from `n1-notes.md` §2a step 3). Read
back in full after the merge: both are present, the two dispatchers, the bar, the
mount order, the `mounted` set and the two `onChange` handlers are untouched, and
`stack(for:)` still chains `.navigationDestination` **outside** the wrappers' own
`.environment(\.isTabRoot, true)` — the ordering N2's reviewer flagged as the thing
that keeps a pushed screen's back chevron. Verified on glass in §4.

`git status --porcelain` after each merge: clean.

---

## 2. Integration notes applied — four commits

`waves/w3/*-notes.md` carried six items whose files belong to no W3 lane. Four are
applied here; two are not, and §6 says why with the cost of each.

**`116ba49b1` · `fix(ios): the bar's four words survive accessibility XXL`**
— `n2-notes.md` §3 and `n3-notes.md` §2a, the same defect seen by two lanes:
at `accessibility-extra-extra-large` the row rendered `TodaySpac…PiecesStudio`,
`Spaces` truncated mid-word and every label touching its neighbour
(`shots/w3-n2-09`, `shots/w3-n3-11`). `PatinaTabBar.swift` is N1's file and both
lanes were right not to edit it; W3's acceptance line asks for dark + XXL, so it
lands with the steward. The drawn word is capped at `DynamicTypeSize.accessibility2`
and given a 4 pt gutter; `minimumScaleFactor` 0.75 → 0.7. **VoiceOver still speaks
`tab.canonicalName` in full** (the cap is on the `Text`, not the button), and nothing
else in the app is capped. Fixed on glass: `shots/w3-int-05-flagon-bar-dark-xxl.png`
reads `Today  Spaces  Pieces  Studio` with gutters and no ellipsis. The same commit
spells out the `#Preview`'s trailing closure beside `onSelect:`, which was the file's
one new SwiftLint warning.

**`8fde85564` · `fix(ios): the Spaces tab root keeps its canonical name at zero rooms`**
— `n2-notes.md` §2, on `Features/Rooms/**`, in no lane's set. `YourSpacesView` draws
its `Your Spaces` header only on the populated branch. Pushed, that cost nothing —
the reader had just used a back chevron. As the **Spaces tab root at zero rooms** it
means the canonical name (C4) is nowhere on glass (`shots/w3-n2-05`). The header is
hoisted over the empty branch **behind N2's `isTabRoot` environment seam**, so the
pushed screen and the entire flag-off root are unchanged; the empty state's own
`syncStatusPill` top padding drops 72 → 8 only at a tab root, so the header does not
float over a 72 pt hole. Verified: `shots/w3-int-02-flagon-spaces-empty-root.png`.
The header drawn is the populated branch's verbatim, help icons and `+` included —
that composition is pre-existing and not this commit's.

**`d0879b10a` · `fix(ios): the tour's auto-start gate reads the Today stack on the
house-first root`** — `n1-notes.md` §3c, made concrete by `n3-notes.md` §3b's live
observation. `DailyRoomView.swift` passed `canAutoStart: coordinator.navigationPath.isEmpty`;
that path is the flag-off root's single stack and is inert and permanently empty on
the house-first root, so the gate read `true` at any Today depth and N3 watched the
tour auto-start while the post-onboarding push had put `.emergence` on the **Pieces**
stack. Replaced with the tab-aware twin both notes quote:

```swift
canAutoStart: coordinator.isHouseFirstRoot
    ? coordinator.tabs.stack(for: .today).isEmpty
    : coordinator.navigationPath.isEmpty
```

Flag off, the read is unchanged.

**`b3866abfc` · `chore(ios): the integrated tree passes lint-delta`** — see §3c.

### Notes verified already satisfied in the merged tree — no action

- **`n1-notes.md` §1a/§1c (the `studioRoot` shim, the tab-root wrappers)** — N2 took
  them; §1 above.
- **`n1-notes.md` §2a (the dead Companion mark, the dock over the bar)** — N3 took
  both halves in the ordering N1 specified (observer first, then hide), and the dock
  is gone from every flag-on frame in §4.
- **`n1-notes.md` §2b (the Hearth yield)** — `CompanionOverlay` now passes
  `houseFirst: coordinator.isHouseFirstRoot` to `yieldsToPinnedFooter`; `InvoicesMoneyRailTests`
  moved with it and is green.
- **`n2-notes.md` §4 / `n3-notes.md` §6 (`handleIntent`, the ≤6 rows, the coaching
  ladder)** — unchanged and pinned. The panel in `shots/w3-int-04-flagon-companion-from-bar.png`
  opens from the bar slot with the `.new` coaching card and six rows.

---

## 3. Gates — all foreground, all from the integration worktree

### 3a. Build

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **
```
Run on the final tree (`39543c9c0`). Warnings are the repo's standing Swift 6
actor-isolation notes in `RoomScanSyncService+AdvancedBundle.swift`; no `error:`.

### 3b. The whole `PatinaTests` tier, on this steward's own device

```
$ xcodebuild test -project Patina.xcodeproj -scheme Patina -configuration Debug \
    -destination "platform=iOS Simulator,id=A71FDDF2-D0F6-442F-9E21-B77604013F02" \
    -only-testing:PatinaTests CODE_SIGNING_ALLOWED=NO
** TEST SUCCEEDED **

$ xcrun xcresulttool get test-results summary --path …/Test-Patina-2026.08.28_00-51-05--0500.xcresult
passed 1074  failed 0  skipped 0  result Passed  device dr-w3-int
```

1074 / 1074. The same tier ran green on the merged-but-unfixed tree first
(1074 / 0, `Test-Patina-2026.08.28_00-21-21--0500.xcresult`) and again after the four
integration commits, so nothing in §2 moved a test.

Every suite `build-plan-critique.md` M18 lists as at-risk is inside this tier and
inside that green: `FirstLaunchTourTests` (N3's rewrite plus the four new flag-off
pins), `InvoicesMoneyRailTests` (N3's yield edit), `CompanionActionMatrixTests`,
`EngagementTierTests`, `AccountIsolationTests`, `BudgetAggregationTests`,
`ProposalsMoneyRailTests`, `DailyRoomFeedMappingTests`, `ProductDecodingTests`,
`PushTokenServiceTests`, `NotificationsAPIClientContractTests`,
`AuthSheetPresentationTests`. The W3-new suites are `HouseFirstRootTests`,
`RouteTabTableTests`, `TabNavigationModelTests`, `TabRootTitleTests`,
`PiecesTabTests`, `BrowseGridContractTests`, `CompanionBarSlotTests`.

### 3c. `lint-delta` against `main`

First run on the merged tree:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Features/Navigation/PatinaTabBar.swift: 0 → 1
    PatinaTests/HouseFirstRootTests.swift: 0 → 2
```

Three warnings, all trivial: `multiple_closures_with_trailing_closure` in the tab
bar's `#Preview`, and two `identifier_name` violations for `a`/`b` in
`HouseFirstRootTests`' dispatcher-equality loop. The preview went into `116ba49b1`;
the two names became `legacyBody` / `houseFirstBody` in `b3866abfc`, assertion and
subject unchanged. Final run on `39543c9c0`:

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
✓ lint-delta: no new warnings in touched files
```

`ios-gate.sh all` was **not** run as a unit: it grabs the first iPhone simulator it
finds, which is the walker's review device. Its three tiers ran individually above,
on this steward's own device.

### 3d. A signed build, installed

The gate's `build` tier passes `CODE_SIGNING_ALLOWED=NO`, and a build made that way
must never be installed for a walk. So the walk build is a separate, signed one:

```
$ xcodebuild build -project Patina.xcodeproj -scheme Patina -configuration Debug \
    -destination "platform=iOS Simulator,id=A71FDDF2-…"          # no CODE_SIGNING_ALLOWED=NO
** BUILD SUCCEEDED **
$ codesign -dv …/Debug-iphonesimulator/Patina.app
Identifier=cloud.patina.app
Signature=adhoc                                   # "Sign to Run Locally"
$ xcrun simctl install A71FDDF2-… …/Patina.app
INSTALLED
```

---

## 4. Both roots render — the fourth gate, on glass

Every frame below is from the **final** tree's signed build. `-DeploymentTarget local`
on every launch.

### Flag on — `xcrun simctl launch … -PatinaFlags house-first -DeploymentTarget local`

| Shot | What it proves |
|---|---|
| `w3-int-07-final-flagon.png` | Today under the bar: `Today · Spaces · Pieces · Studio` and the Strata mark in the trailing slot. **No floating dock, no `NEXT STEPS` caption** — B-2's point, on glass |
| `w3-int-01-flagon-today-guest.png` | the accessibility tree for the whole bar, read with `describe_screen`: five `AXTabButton`s labelled **`Today` · `Your Spaces` · `Browse pieces` · `Your Studio` · `Companion`** — M1 §6 and B-7 (a) verbatim, the canonical name in full where the bar prints the short word |
| `w3-int-02-flagon-spaces-empty-root.png` | Spaces tab root at zero rooms: `Your Spaces` on glass, **no back chevron** |
| `w3-int-03-flagon-studio-root.png` | Studio tab root, one tap from anywhere, titled `Your Studio` |
| `w3-int-04-flagon-companion-from-bar.png` | the bar slot opens the panel — the `.new` coaching card and six rows, over a dimmed screen |
| `w3-int-05-flagon-bar-dark-xxl.png` | dark + `accessibility-extra-extra-large`: four words, gutters, no truncation |

The launch shot `w3-int-01-flagon-launch.png` is the auth wall — kept because it is
the honest first frame after a fresh install, and because the guest session does not
survive a relaunch (§7).

### Flag off — `xcrun simctl launch … -DeploymentTarget local`

`w3-int-08-final-flagoff.png` and `w3-int-06-flagoff-today-guest.png`: the W2 root,
whole. The floating Companion dock with its `NEXT STEPS` caption, the labelled
`Studio` control in the header, `NEXT MOVE`, `YOUR HOUSE` / `Start with a room`, the
dated story card, the sign-in line. Held beside `w3-int-07-final-flagon.png` — same
device, same session, same minute — **the two frames are identical above the story
card; the only difference is the bottom edge**: dock + caption on one, the 83 pt bar
on the other.

**On "byte-for-byte", precisely.** The structural proof is that `ContentView`'s
existing body was not edited, only renamed and wrapped:

```
$ git diff main...HEAD -- apps/mobile/Patina/Patina/ContentView.swift
+    @ViewBuilder
     private var mainContent: some View {
+        if coordinator.isHouseFirstRoot {
+            HouseFirstRoot()
+        } else {
+            legacyMainContent
+        }
+    }
+
+    private var legacyMainContent: some View {
         ZStack {
```

+19 lines, 0 removed. The single `NavigationStack`, `companionHearthReservation`,
`CompanionOverlay()` and `DailyRoomView()` all sit inside `legacyMainContent`
untouched, which is `steward.md` §7·G's instruction followed literally. Every other
flag-reachable change is gated: `CompanionHearthMetrics`' two policies take a
defaulted `houseFirst: Bool = false` so existing callers keep their W1b answer;
`EnvironmentValues.isTabRoot` defaults `false` everywhere but the three wrappers;
`FirstLaunchTourModel.preHouseFirstSteps` restores the W2 step list verbatim for the
flag-off root; and all three of this steward's view edits branch on
`isHouseFirstRoot` or `isTabRoot`.

**What was not done: a pixel diff against a `main` build on the same simulator.**
`steward.md` §7·G calls that the cheapest proof and it is; it costs a second signed
build plus a re-walk of the guest onboarding, and it was traded for the two frames
above and the diff. Named here rather than implied.

**The one unflagged behaviour change in the wave**, so it is not read as a
byte-for-byte violation discovered later: `1a309d2cf` (N2) removed
`RecommendationsViewModel.filteredProducts`' **second, client-side** category filter,
which ran on both roots. The server already filters on `p_category`
(`00244:1016`, exact string match) while the client re-derived its enum through
`ProductCategory(normalizing:)`, which folds unnamed vocabulary onto `.decor` — so the
second pass could only subtract rows the RPC deliberately returned. N2 proved it
live (`match_events` row 72, `context->>'category' = 'lighting'`, one result against
the same session's ten unfiltered) and its reviewer passed it clean. It is a fix, it
is unflagged, and the browse grid is a pushed screen, not the root.

---

## 5. Claim level

**Sim-verified.** Everything above is Simulator, as the whole wave is. Nothing here
is device-verified and this wave produces no device claim: no universal link, no
App Group, no APNs, no Apple Pay, no LiDAR. `shots/w3-n1-08b` records that a
universal link opened Safari because no AASA is served — SP-03's portal work, not
W3's.

---

## 6. Two deviations that ride out of the wave — each with its exit

### 6a. Two Studio doors on the flag-on root (`n1-notes.md` §3d) — NOT fixed, and why

`DailyGreetingHeader.studioControl` still draws the labelled `Studio` pill on the
house-first root, beside the Studio **tab** (`shots/w3-int-07-final-flagon.png`, and
the `DailyRoomView.StudioButton` element is in the flag-on accessibility tree). M1's
sheet draws that header as date over greeting and a belled dot — **no monogram** —
and B-1 makes the header control the fallback *"if the flag never flips"*. So the pill
is a spec deviation.

N1 wrote the two-line gate for it. **It was not applied, because applying it alone
breaks B-8.** N3 anchors the rewritten tour's step 3 on `.profileMonogram`, which is
mounted on exactly that control on **both** roots — the popover cannot reach the tab
bar today, because `FirstLaunchTour` builds its model in `@State` inside
`DailyRoomView` and publishes it to its own subtree, while the bar is a *sibling*
mounted by `HouseFirstRoot` (`n3-notes.md` §2b). Gate the control off on the flag-on
root and step 3's anchor never mounts, the tour silently drops to two steps, and
B-8's step-3 sentence — the ratified copy the wave exists to deliver — never renders.
`FirstLaunchTourTests` would stay green throughout, because it pins the fallbacks.

Trading a visible duplicate door for a dead ratified step is the wrong direction at
integration, so the wave ships the duplicate and names it. **Two exits, both Fable's
to pick:**

1. *Hoist the tour above the four stacks* (`HouseFirstRoot.swift`) and tag the bar's
   `.studio` arm with `.firstLaunchTourAnchor(.profileMonogram)` (raw value unchanged
   — it keys the Sanity document, `steward.md` §7·F). Then N1's gate applies and both
   halves are right. This is a restructure, not a modifier: the hoist puts a second
   `FirstLaunchTour` model above the one `DailyRoomView` still owns on the flag-off
   root. It belongs to a lane with `Features/Navigation/**` and `Features/Help/**`
   together — W4's, if W4 has one.
2. *Accept the header pill for one release* as B-1's fallback control, drawn on both
   roots, and say so in the canon digest. Costs nothing and is honest; it just is not
   what M1 draws.

### 6b. `MoneyScreenChrome.bottomClearance` (`n1-notes.md` §3a) — NOT fixed, and why

On the flag-on root every money screen carries ~148 pt of dead space *plus* the bar
(`shots/w3-n1-07-money-footer-under-bar.png`), because `bottomClearance` is sized to
the dock the bar replaces. N1's review (MJ-5) ruled that naming it is not owning it.

The signature change N1 proposes — `static let` → `static func bottomClearance(houseFirst:)`
— **ripples to twelve files**: nine view files call `.padding(.bottom, MoneyScreenMetrics.bottomClearance)`
(`InvoiceDetailView`, `InvoiceListView`, `ProposalDetailView`, `ProposalListView`,
`DecisionDetailView`, `DecisionListView`, `ProjectDetailView`, `BudgetView`, and
`MoneyScreenChrome` itself), each owned by no W3 lane, and three test files pin it —
`MoneyAndStudioCopyTests:250` pins the **literal source text**
`"MoneyScreenMetrics.bottomClearance"` in those views, so any modifier-shaped fix
reddens another lane's suite. Rewriting twelve files and a pinned assertion at
integration time, to close dead space rather than a clip, is the scope-widening W2's
steward declined for the same class of item. **Carried forward with an owner needed.**
`CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` already exists for it.

The sibling item, `ProductDetailView`'s `Add to Room` capsule under the bar
(`n1-notes.md` §3b, `shots/w3-n1-13`), is left with it — N1 itself said the file's
owner should take that call with the screen in front of them, and the same
`pinnedFooterClearance` seam serves both. One commit, one owner, two files.

---

## 7. Open for Fable — beyond §6

1. **B-8 is half-shipped, and the unshipped half is content ops.**
   `FirstLaunchTourPopoverCard.resolvedBody` is `loaded?.body ?? step.fallback?.body`
   — Sanity wins, and the three documents still carry the retired sentences.
   Reproduced this walk on the flag-on root: the step-1 popover read
   *"Welcome to Patina / This is your Daily Room — picks and stories chosen for your
   space."* The three edits, keys unchanged, are in `waves/w3/n3-sanity-copy.md`.
   **Without them the house-first root introduces itself with the name B-7 (c)
   retires.**
2. **`RouteTabTable.rootRoute(for: .studio) == .profile`** (`n1-notes.md` §4a). Every
   Studio visit on the flag-on root reports the PostHog screen `Profile` and hands
   the Companion Profile's context rows, and `ProfileView` is unreachable on that
   root. N1 wrote both the canon-digest paragraph (if `.profile` stands) and the
   five-file work order (if `.studio` is minted).
   `HouseFirstRootTests.theStudioTabReportsProfileUntilAStudioRouteIsMinted` reddens
   the moment the honest route lands. **W4 reads that funnel** — this wants a ruling
   before W4, not after.
3. **`roomEmergence` is filed under Spaces, not the brief's literal Pieces**
   (`n1-notes.md` §4b). Close to inert — neither `roomEmergence` nor `roomSavedItems`
   is reachable through the table's only reader — and the behaviour the steward
   wanted is structural instead and pinned.
4. **N3's tour-branching argument is preserved with its exact revert**
   (`n3-fix-log.md`). N3 rewrote the tour unconditionally; the review made it branch
   on `house-first` per B-8's Rollback clause; the flag-off list therefore keeps
   `.addToRoom`, which mounts in no production view, so the flag-off tour runs two
   steps while declaring three. That is W2's pre-existing defect kept deliberately,
   observed live as `Step 1 of 2`. Fable can rule N3's way in one commit.
5. **M9's gaps, named by N2 and not built** (`n2-notes.md` §5b/§5c): no `Rugs` chip
   (it needs a `ProductCategory` case *and* a matching `products.category` vocabulary,
   or the chip returns an empty grid while staying selected); the three analytics
   events `browse_category_selected` / `saved_opened` / `saved_note_edited` are
   unbuilt; M9b's per-row note has no surface.
6. **The guest session does not survive a relaunch.** Seen twice this walk —
   `simctl launch` returns to the auth wall and the onboarding has to be re-walked.
   N2 logged it first. SP-06 territory, not investigated here.
7. **`profiles.help_state` is cross-device authoritative**, so reinstalling does not
   reset the tour. The SQL to clear it is in `waves/w3/n3-sanity-copy.md`, and the
   next walker will need it.

---

## 8. Housekeeping

- **The W3 wave record was not on any branch.** `git ls-files waves/w3/` on the
  integration branch carried N1's three files and nothing else: N2 and N3 wrote their
  task lists, notes, reviews, fix logs — and every `shots/w3-n2-*`, `shots/w3-n3-*`
  frame — into the **main checkout's working tree**. Carried over verbatim in
  `39543c9c0`, the same shape as W2's `59b389293`. The main checkout was only read.
- Lane worktrees `agent-dr-w3-n1|n2|n3` retired; simulators `dr-w3-n1|n2|n3` deleted.
  This steward's worktree and `dr-w3-int` stay until Fable's ff-merge.
- The review device `973D1724-…` was never touched.
- `.writer.lock.d` removed at report.

---

## 9. The branch, end to end

`main` `17c6335fd` → `daily-return/integration` `071254f96`, 22 commits, no push.

```
071254f96 docs(ios): W3 integration record — three clean merges, four applied notes, every gate green
39543c9c0 docs(ios): the W3 wave record — N2 and N3's lists, notes, reviews, fix logs and shots
b0f6ea0f9 docs(ios): W3 integration shots — both roots on glass
b3866abfc chore(ios): the integrated tree passes lint-delta
d0879b10a fix(ios): the tour's auto-start gate reads the Today stack on the house-first root
8fde85564 fix(ios): the Spaces tab root keeps its canonical name at zero rooms
116ba49b1 fix(ios): the bar's four words survive accessibility XXL
301566ccc chore(daily-return): integrate w3 lane n3
0be213840 chore(daily-return): integrate w3 lane n2
84355de87 chore(daily-return): integrate w3 lane n1
  ├─ n3: 8f1501229 5cccbff8a 0c3fb6f6f
  ├─ n2: f74f52ff4 6b6d7845a 1a309d2cf 5ca9b938b
  └─ n1: b101f5009 c8d5d286b 2debf67e2 4a92058b5 eb5571ecb
```

App-source delta vs `main`: 29 files, +2963 −65 (18 under `Patina/`, 11 under
`PatinaTests/`). No `supabase/` change. No `.env`, no `Secrets.swift`, no `git add -A` —
every commit is a pathspec.
