# W6 — Integration

Steward, 2026-08-28. Branch **`daily-return/integration`**, worktree
`.codex/worktrees/agent-dr-w6-integration`, base **`main` `4b35e0a94`**.
Every number below is quoted from a command run in this session. Nothing pushed; no git write
touched the main checkout (read-only `git log` / `worktree list` / `branch --list` only).

---

## 1. What was merged, and what was not

| Lane | Branch | Commits ahead of main | Merged |
|---|---|---|---|
| X3 · session isolation | `daily-return/w6-x3` | **0** | **No — the lane delivered nothing to merge** |
| X2 · producers | `daily-return/w6-x2` | 4 | `cb347c3ea chore(daily-return): integrate w6 lane x2` |
| X1 · the extension | `daily-return/w6-x1` | 3 | `0b309ea94 chore(daily-return): integrate w6 lane x1` |

Merge order was x3 → x2 → x1 as briefed. **Both merges were clean — no conflict, no resolution
required.**

### 🚨 X3 did not land, and this steward did not land it for it

`daily-return/w6-x3` exists but is **empty** (`git log --oneline main..daily-return/w6-x3 | wc -l`
→ `0`; `git diff --stat main daily-return/w6-x3` → no output). The work is real and sitting
**uncommitted** in `.codex/worktrees/agent-dr-w6-x3`:

```
 M Patina/Core/State/DesignerRelationship.swift
 M Patina/Features/Messaging/DesignerThreadOpener.swift
 M Patina/Features/Orders/ViewModels/OrdersService.swift
 M Patina/Features/Profile/ViewModels/StudioHubViewModel.swift
 M Patina/Services/Auth/AuthService.swift
 M Patina/Services/Badges/BadgeCountService.swift
 M Patina/Services/DesignServices/DesignRequestStatusService.swift
 M Patina/Services/Settings/SettingsService.swift
 ?? Patina/Core/State/SessionScope.swift
 ?? PatinaTests/DesignerProjectRuleTests.swift
 ?? PatinaTests/SessionIsolationTests.swift
```

`.writer.lock.d` is **still held** in that worktree (X1's and X2's are released), its clone
`dr-w6-x3` (`63E0BC31-AD63-40CC-A609-1FCA5CA9C631`) is still booted, its last file write was
**18:35** and `x3-notes.md` **18:47** — roughly an hour before this integration, with **no
`xcodebuild` running** (`ps` grep for `xcodebuild|xcactivitylog|agent-dr-w6` → nothing). So the lane
is idle, not mid-gate. There is also **no `x3-review.md`** — the lane never reached review.

The conductor rule is explicit ("the conductor never commits on an implementer's behalf"), so the
lock was not broken and nothing was staged from that tree. **W5's session-isolation carry-over is
therefore NOT in this integration.** Fable's call: resume the lane to commit + review and
re-integrate, or carry it to W7. Its notes (`x3-notes.md`) are worth keeping either way — they
enumerate all 72 `static let shared` holders, rule on each, and name one gap the lane declined to
close (`StyleProfileStore`'s two `UserDefaults.standard` keys are not account-scoped and survive an
account change, because `LocalStoreReset` is shared and neither lane's to edit).

---

## 2. Integration notes applied

**`x2-notes.md` §1 — the house line's call site (marked blocking-owed for the steward). APPLIED.**
`ef6020494 chore(daily-return): the widget's house line gets its call site (W6 integration)` —
one modifier in `Features/Home/Views/DailyRoomView.swift`, which is neither lane's file:

```swift
.onChange(of: viewModel.houseRoomCards.first?.name, initial: true) { _, line in
    RecordSnapshotStore.shared.noteHouseLine(line)
}
```

`initial: true` covers the first paint; X2's fix round made re-firing free (an unchanged line
neither writes the snapshot nor reloads the timeline) and removed the ordering constraint against
`RecordRefresh`. **Verified on the simulator**, and the observed behaviour is worth recording
exactly:

- Launch 1 after install wrote `widget-snapshot.json` (441 B) with **no `houseLine`** — the rail's
  rooms had not arrived when that launch's single `save` ran.
- Launch 2 wrote it with **`"houseLine": "Guest Bedroom"`** (469 B), matching the rail on screen.

That is X2's documented design working, not a defect: a `nil` line is "no house line", never a
wrong one, and it converges on the next open. It is named here so a reader does not mistake the
first-launch absence for a broken call site.

**`x1-notes.md` §3 (`sinceDate`) — already applied by X2** before hand-off (its §9). The written
file carries `"sinceDate": "2026-08-21T05:00:00Z"`, so M6b's ruled copy (`SINCE THU` /
`Nothing moved since Thursday.`) is reachable rather than the degraded fallback.

**`x2-notes.md` §4 — the widget kind string. Verified by grep, not assumed:**

```
PatinaWidget/HouseWidget.swift:16:        static let kind = "PatinaHouseWidget"
Patina/Core/Persistence/WidgetSnapshot.swift:83: static let widgetKind = "PatinaHouseWidget"
```

Same for the file name — `widget-snapshot.json` on both sides, beside `house-record.json`.

**Not applied, and deliberately so:** `x2-notes.md` §10 ("refreshed on foreground" is not fully
true) and `x3-notes.md` §1's `StyleProfileStore` gap. Both are flagged in their own notes as
**program items** rather than owner-applies lines, both touch files no lane owns, and both would be
a steward-authored behaviour change with no reviewer in the loop. Carried to §6.

---

## 3. Gates — all green

| Gate | Command | Result |
|---|---|---|
| build | `ios-gate.sh build` | `** BUILD SUCCEEDED **` (first run hit the known `GitCommit.swift` / shared-DerivedData failure; passed on the re-run, steward §9 trap 2) |
| unit tier | `xcodebuild test -only-testing:PatinaTests -destination id=89112219-…` | `Test run with **1497 tests in 161 suites** passed` · `** TEST SUCCEEDED **` (W5 left 1413 → **+84**) |
| widget target | same build | `PatinaWidget.appex` produced |
| appex embedded | `ls Patina.app/PlugIns/` | `PatinaWidget.appex` present, carrying `PatinaDesignKit_PatinaDesignKit.bundle` |
| appex identity | `PlistBuddy` on its `Info.plist` | `CFBundleIdentifier = cloud.patina.app.widget` (X1's §2g choice, prefixed by `cloud.patina.app`); `NSExtensionPointIdentifier = com.apple.widgetkit-extension` |
| lint-delta | `ios-gate.sh lint-delta main` | `✓ lint-delta: no new warnings in touched files` |
| signed `.app` | `xcodebuild build -derivedDataPath .build/dd` (**no** `CODE_SIGNING_ALLOWED=NO`) | `** BUILD SUCCEEDED **`; `CodeSign … Patina.app` and `CodeSign … PatinaWidget.appex` both in the log; installed with `simctl install` |
| flag **on** launch | `simctl launch … -PatinaFlags house-widget,house-first -DeploymentTarget local` | launches; W3 tab bar root (`Today · Your Spaces · Browse pieces · Your Studio · Companion`), the Record draws NEEDS YOU ×3 + MOVED ×2 + `See all`, Leah's seat, `YOUR HOUSE` rail |
| flag **off** launch | `simctl launch … -PatinaFlags none -DeploymentTarget local` | launches; W2 root (no bar, floating orb), the Record draws; mirror reads all three flags `false` |

Simulator: **`dr-w6-int` `89112219-9338-48C1-87CA-99540AAA7489`**, cloned from `dr-w6-x2` (shut
down for the clone, both re-booted). Shots: `shots/w6-int-flagon.png`,
`shots/w6-int-flagon-today.png`, `shots/w6-int-flagoff.png` — all via `xcrun simctl io … screenshot`;
no desktop capture was used at any point.

Scope of the merge: `27 files changed, 3602 insertions(+), 48 deletions(-)`, 19 new files.

---

## 4. The honesty rule, checked against the file on disk — not against the code

The signed build's App Group container **did** resolve at run time
(`…/Containers/Shared/AppGroup/B8E4324E-3A0D-4AB9-AFBF-91B812061B0B/`), holding both
`house-record.json` (1.8 KB) and `widget-snapshot.json` — the same result W2's `r2-notes.md` §3
recorded, and again with `codesign -d --entitlements -` printing an empty `[Dict]` on both the
`.app` and the `.appex` (the `r1-notes.md` §7 reading). **The `codesign` read remains a bad
predictor of the run-time container; the fallback stays load-bearing; none of this is a device
claim.**

The written payload, flag on:

```json
{ "refreshedAt": "2026-08-29T00:49:19Z",
  "sinceDate": "2026-08-21T05:00:00Z",
  "flagOn": true,
  "houseLine": "Guest Bedroom",
  "movedRows": [ { "title": "Meadow Linen Sectional arrived.", "date": "2026-08-28T22:54:20Z", … },
                 { "title": "A new story from the workshop.",  "date": "2026-08-27T21:58:22Z", … } ] }
```

- `grep -ioE "needsYou|badge|count|pending|awaiting|isNew"` over the file → **no match.** The two
  NEEDS YOU rows on screen at that moment (the invoice due Sep 2, the proposal by Sep 11) and the
  decision reach the widget in **no form** — not their contents, not their number, not a flag that
  they exist. Q8 / C5 hold structurally, on the artefact, not by review.
- `refreshedAt` is when the **app** wrote the file; the widget prints staleness from it rather than
  from its own clock.
- `flagOn` flips with the launch argument — `true` under `-PatinaFlags house-widget,house-first`,
  `false` under `-PatinaFlags none` — so `house-widget` off means the no-data state, never a stale
  row.
- The App Group defaults carry `patina.flags.resolved` (`{house-first, house-widget, direct-orders}`),
  `patina.house.lastSeenAt` and `patina.house.recordOwnerId` — the widget reads the same stamp the
  app wrote.

Widget doors, as X1 built them: `DeepLinkHandler.widgetTodayHost = "today"`,
`widgetRecordHost = "record"`, and `route(forWidgetLink:in:)` resolving `patina://record/<id>`
against `house-record.json` (one route vocabulary, in one place) with `.heroFrame` as the
never-dead-end fallback.

---

## 5. Claim level

**compile-green + sim-verified.** No device claim is made anywhere in this wave. Specifically NOT
verified: a real widget rendering on a Home Screen or Lock Screen (no widget was added to a
simulator home screen in this integration — the timeline provider is exercised only by
`PatinaTests`), APNs delivery, a signed-with-real-entitlements App Group between the app process and
the widget process on hardware, and the widget's bundle-id registration under ASC (Kody's paperwork:
`cloud.patina.app.widget` under app `6762007888`, plus the App Group capability on both App IDs).

---

## 6. Owed, and to whom

**Fable — ruling needed:**

1. **X3's lane.** Uncommitted, unreviewed, lock held. Resume it (commit → review → re-integrate) or
   carry the session-isolation fix to W7. Until then W5's carry-over is still open on `main`.
2. **`x2-notes.md` §10 — "refreshed on foreground" is only true on Today.** The `WidgetCenter`
   reload rides `RecordSnapshotStore.save`, reached only from `RecordRefresh.run`, whose foreground
   trigger is `DailyRoomView`'s `.onChange(of: scenePhase)`. Foregrounding while deep in Studio,
   Spaces or Pieces refreshes nothing and reloads nothing; the widget then leans on its timeline
   policy and X1's staleness line. Honest, but not the whole of Q8's "refreshed on foreground". The
   fix belongs at the root (`ContentView` / the tab root), which is X1's file set, not the steward's
   to author unreviewed.
3. **`x3-notes.md` §1 — `StyleProfileStore`.** `patina.style_profile_response.v1` and
   `patina.style_profile_completed.v1` live in `UserDefaults.standard`, are not account-scoped, and
   `LocalStoreReset.wipeUserScopedData()` does not clear them — a second account on the same phone
   inherits the first account's taste portrait. Disk, not cache; belongs with `LocalStoreReset`,
   which is shared.
4. **The two flaky suites X1 reported** (`OrderHandoffTests`, `CompanionCoachingModelTests`
   `introGate_freshUser_pollsUntilTourResolves`) were **green** in this integration's full run
   (1497/1497). Recorded as flaky-under-load, not as a regression, matching X1's read.

**Kody:** the widget's ASC bundle-id registration and the App Group capability on both App IDs; and
the still-open W3 item — publish the three Sanity tour bodies before `house-first` is enabled for
anyone.

**Pre-existing, unrelated to W6, seen on the flag-off shot:** the floating Companion orb overlaps
the `YOUR HOUSE` rail's first card — the W4 carry-over already logged ("on the flag-off root the
floating orb steals taps from the story card at accessibility sizes"). Not introduced here.

---

## 7. State at hand-off

- Integration worktree `.codex/worktrees/agent-dr-w6-integration` on `daily-return/integration`,
  **10 commits ahead of `main`**, `Secrets.swift` copied in and confirmed ignored
  (`.gitignore:53`), `git status` clean apart from it. `.writer.lock.d` released at this report.
- `dr-w6-int` (`89112219-…`) left **booted with the signed integration build installed and signed
  in** — the W6 walker's device, ready for the acceptance walk.
- **Nothing retired.** `dr-w6-x1` / `dr-w6-x2` / `dr-w6-x3` clones and all three lane worktrees are
  still on disk, deliberately: X3's tree holds uncommitted work that must not be swept, and the
  walk has not run. Retirement is the orchestrator's call once X3 is ruled on.
- Nothing pushed. No migration this wave (tip is still `00540`). Nothing touched Strata,
  production, or App Store Connect. No secret value was read, printed or written.

---

## 9 — Completion: X3 lands, and the wave's gate is green

Steward, 2026-08-28, second pass. Same worktree `.codex/worktrees/agent-dr-w6-integration`, same
branch `daily-return/integration`, same base `main` `4b35e0a94`. `.writer.lock.d` taken at the start
of this pass and released at its end. Every number below is quoted from a command run in this
session. Nothing pushed; no git write touched the main checkout (read-only `git log` /
`worktree list` only). Tip is now **`f48e11d20`**, **17 commits ahead of `main`**. Still no
migration this wave — `ls supabase/migrations | tail` ends at `00540_direct_orders_attribution.sql`.

### 9.1 X3 is in, and the merge was clean

§1's "X3 did not land" is closed. The lane committed, took an adversarial review (`x3-review.md`,
five MAJOR findings, none rebutted outright), ran a fix round (`x3-fix-log.md`) and left five
commits on `daily-return/w6-x3`, tip `e30593d61`:

```
e30593d61 fix(ios): one foreground costs one fetch, and only a foreground someone saw claims the visit
25c0cb6c1 fix(ios): one place moves the session, and the taste portrait goes with the account
3992e65dd feat(ios): the record's foreground rebuild fires from the app root, not only Today
280242677 fix(ios): the ask-your-designer thread picks the project the house is waiting on
196d69f26 fix(ios): one session scope, reset on the auth seam before the new account's first fetch
```

Merged as **`9a8af5d28 chore(daily-return): integrate w6 lane x3`** — `--no-ff`, strategy `ort`,
**clean: no conflict, nothing resolved by hand.** That was checked before the merge rather than
trusted after it — the two changed-file lists share nothing:

```
comm -12 <(git diff --name-only 4b35e0a94 HEAD        | sort) \
         <(git diff --name-only 4b35e0a94 daily-return/w6-x3 | sort)   →  (empty)
```

X1/X2/the steward hold `DailyRoomView.swift`, `RecordSnapshotStore.swift`, `FeatureFlags.swift`,
`WidgetSnapshot.swift`, `PatinaWidget/` and the invoice surfaces; X3 holds
`DailyRoomViewModel.swift`, `RecordRefresh.swift`, `AuthService.swift`, `LocalStoreReset.swift`,
`DesignerRelationship.swift` and the two services. Merge shape: **19 files changed, 1462
insertions(+), 88 deletions(-)**, five of them new — `Core/State/SessionScope.swift`,
`Features/Home/ViewModels/RecordForeground.swift`, and the three test files
(`SessionIsolationTests`, `RecordForegroundTests`, `DesignerProjectRuleTests`).

`Patina.xcodeproj` needed no edit and the merge did not touch it: the project carries seven
`PBXFileSystemSynchronizedRootGroup`s, so the two new app files and three new test files joined
their targets by where they live. (The widget target's files still cannot be shared with the app —
steward.md §2's trap is unchanged.)

### 9.2 Two of §6's owed items are closed by X3's own work

- **§6.2 — "refreshed on foreground" was only true on Today. CLOSED.** `RecordForeground.swift` is
  new and `PatinaApp.swift`'s `scenePhase → .active` now calls `RecordForeground.onForeground()`,
  so a foreground from anywhere rebuilds the record — and since the `WidgetCenter` reload rides
  `RecordSnapshotStore.save`, the widget's timeline reloads with it. Today still asks for its own
  rebuild; the two coalesce onto the first, and the services (`BadgeCountService`,
  `DesignRequestStatusService`) now join an ask already in flight rather than doubling it. The
  honesty hazard the move introduced — the root's pass paints nothing, so it must not claim a visit —
  is answered by `RecordRefresh.run(stampVisit:)`, passed `false` from the root
  (`RecordForeground.swift:71-72`); a joiner that paints a record built by a pass which did not
  stamp is the one that owes the stamp.
- **§6.3 — `StyleProfileStore`. CLOSED.** `LocalStoreReset.wipeUserScopedData()` now calls
  `StyleProfileStore.shared.reset()`, so `patina.style_profile_response.v1` and
  `patina.style_profile_completed.v1` no longer survive an account change. Deliberately placed at
  `LocalStoreReset` rather than on the `SessionScope` seam: the seam also fires on `nil → A` at
  every cold launch, where a wipe would destroy the account's own portrait rather than the previous
  account's. Named but **not** closed by that change: `wipeGuestWork` (the SP-06 "start fresh" arm)
  still does not clear the two keys — a different boundary, no finding covers it, and it is carried
  below.

### 9.3 lint-delta went red, and the steward took the three warnings off

`ios-gate.sh lint-delta main` — the one gate no lane may run for itself — was **red on its first
run after the merge**, doing exactly the job it exists for:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Services/Auth/AuthService.swift: 3 → 4
    Patina/Services/DesignServices/DesignRequestStatusService.swift: 1 → 2
    PatinaTests/SessionIsolationTests.swift: 0 → 2
```

The baselines were verified rather than assumed — the merge-base copies were pulled with
`git archive 4b35e0a94` into a temp tree and linted with the same `.swiftlint.yml` — so the four new
warnings are named exactly, and so is what caused each:

| File | New warning | Cause |
|---|---|---|
| `AuthService.swift` | `cyclomatic_complexity` — `startAuthStateListener()` at 11 > 10 | X3's `if accountChanged, incomingUserId != nil { SessionScope.refresh() }` |
| `DesignRequestStatusService.swift` | `type_body_length` — class body 318 > 300 | X3's in-flight join + `resetForSessionChange()` |
| `SessionIsolationTests.swift` | `identifier_name` ×2 | `let a` / `let b` in `theSeamOnlyFiresOnARealChange` |

Fixed here as **`f48e11d20 chore(daily-return): X3's three new lint warnings come off on
integration`**, behaviour-neutral in all three, and written down rather than quietly absorbed
because a steward-authored edit inside a lane's files has no reviewer in the loop:

1. `AuthService`: the auth-ready fan-out (`if !isAuthStateReady` + the continuation loop) moved into
   a private `markAuthStateReady()`. Two decision points leave the listener. The listener's
   statement order is untouched — `applySession` still precedes `settleLocalStore`, the hydration
   and `SessionScope.refresh()` — which is the whole of what `theResetPrecedesTheFirstFetch` pins,
   and `theSessionMovesInOnePlace` still counts exactly one `self.session =`.
2. `DesignRequestStatusService`: `performRefresh(token:)` moved verbatim into a `private` extension
   on the same type in the same file (Swift's `private` reaches it; nothing became more visible).
   `refresh()`, the in-flight join and the `token == refreshToken` guard are unchanged, and
   `theSecondAskJoinsTheFirst` finds the declaration and the guard where it looks for them.
3. `SessionIsolationTests`: `a`/`b` → `accountA`/`accountB`.

Pre-existing warnings were left alone — `AuthService` keeps its `file_length`, `modifier_order` and
`type_body_length`, `DesignRequestStatusService` its `file_length`. All four are on `main` already;
lint-delta is a delta, not a cleanup order.

### 9.4 Gates — all green

| Gate | Command | Result |
|---|---|---|
| build | worktree's `scripts/ios-gate.sh build` | `** BUILD SUCCEEDED **` — **first run, no `GitCommit.swift` retry needed**, both before and after the lint fixes |
| unit tier | `xcodebuild test -only-testing:PatinaTests -destination id=89112219-… -derivedDataPath .build/dd` | `✔ Test run with **1523 tests in 164 suites** passed` · `** TEST SUCCEEDED **` (before the lint fixes: the same 1523/164) |
| floor | §3 = 1497 · W5 = 1413 | **+26** on this pass, +110 on the wave |
| widget target | same build | `PatinaWidget.appex` produced |
| appex embedded | `ls Patina.app/PlugIns/` on the signed product | `PatinaWidget.appex` and nothing else |
| appex identity | `codesign -dv` / `PlistBuddy` | `cloud.patina.app.widget`, `NSExtensionPointIdentifier = com.apple.widgetkit-extension` |
| lint-delta | `ios-gate.sh lint-delta main` | red first (§9.3), then `✓ lint-delta: no new warnings in touched files` |
| signed `.app` | `xcodebuild build -derivedDataPath .build/ddapp` (**no** `CODE_SIGNING_ALLOWED=NO`) | `CodeSign … Patina.app` + `CodeSign … PatinaWidget.appex`; `Signature=adhoc`, `Identifier=cloud.patina.app`; installed with `simctl install` |
| flag **on** | `simctl launch … -PatinaFlags house-widget,house-first -DeploymentTarget local` | W3 tab-bar root (`Today · Spaces · Pieces · Studio · ≡`); the Record draws NEEDS YOU ×3 + MOVED ×2 + `See all`, Leah's seat, `YOUR HOUSE` rail |
| flag **off** | `simctl launch … -PatinaFlags none -DeploymentTarget local` | W2 root — no bar, floating orb, `Studio 5` pill; the Record draws |

Simulator: **`dr-w6-int` `89112219-9338-48C1-87CA-99540AAA7489`**. Signed `.app` at
`.build/ddapp/Build/Products/Debug-iphonesimulator/Patina.app` — a plain `build`, not the test
action's product, so the installed bundle carries only `PatinaWidget.appex` in `PlugIns/` and no
`PatinaTests.xctest`. Shots: `shots/w6-int2-flagon.png`, `shots/w6-int2-flagon-studio.png`,
`shots/w6-int2-flagoff.png` — all `xcrun simctl io … screenshot`; no desktop capture at any point.

**The re-install cost the device its session, and it was restored the way X3's fix round restored
its own.** `simctl uninstall` before the clean install emptied the app container, so the first
flag-on launch landed on the auth wall. A GoTrue session for the seeded `client@patina.dev`
(`a0000000-…-0005`) was minted against the **local** stack's password grant and handed to the app's
own `patina://auth/callback#access_token=…&refresh_token=…` deep link via `simctl openurl`; the push
primer was dismissed with one blitz tap (explicit `udid`). No secret value was printed, and nothing
touched Strata.

### 9.5 What the file on disk says, flag on and flag off

The App Group container resolved at run time again
(`…/Containers/Shared/AppGroup/5B93EDFF-7092-4E5A-87BC-A2C45CF26E9A/`), holding `house-record.json`
and `widget-snapshot.json`. §4's honesty check re-run on the artefact, not on the code:

- `grep -ioE "needsYou|badge|count|pending|awaiting|isNew|invoice|proposal|due|owe"` over
  `widget-snapshot.json` → **no match**, with three NEEDS YOU rows and the `Studio 5` pill on screen
  at that moment. Q8 / C5 still hold structurally.
- `flagOn` tracks the launch argument: `true` under `-PatinaFlags house-widget,house-first`,
  **`false`** under `-PatinaFlags none`. The App Group defaults mirror agrees —
  `patina.flags.resolved` read `{house-first: true, house-widget: true, direct-orders: false}` and
  then all three `false`.
- `patina.house.recordOwnerId` = `A0000000-0000-0000-0000-000000000005`, the account actually signed
  in — `RecordOwnerStamp` is doing its job across the re-install.
- §2's documented first-launch behaviour reproduced exactly: the launch after install wrote 441 B
  with **no `houseLine`**, a later launch wrote 470 B with `"houseLine": "Guest Bedroom"`, matching
  the rail on screen. A `nil` line is "no house line", never a wrong one.

**§6.2's fix, seen rather than reasoned about.** With the app on **Studio** (not Today),
backgrounding to Safari and returning rewrote both `house-record.json` and `widget-snapshot.json`
(`22:20:58` → `22:22:42`). X3's own honest limit stands and is repeated here: under the flag-on
`TabView` root Today's hook may still be mounted behind Studio, so this is *consistent with* the
root-level trigger rather than an isolation proof of it — the isolation is the SourcePin and the
coalescing test.

### 9.6 Claim level

**compile-green + sim-verified**, and for the session-isolation seam specifically **compile-green +
unit-verified**: X3's account-switch leg (`x3-notes.md` §7) was blocked when simulator input
delivery died, and this integration did not re-attempt it. No device claim is made anywhere in this
wave. Still NOT verified: a real widget on a Home or Lock Screen (no widget was added to a
simulator home screen; the timeline provider is exercised only by `PatinaTests`), APNs delivery, a
real-entitlement App Group between the two processes on hardware, the widget's ASC bundle-id
registration, and an in-process A→B account switch.

### 9.7 Owed, and to whom — updated

**Closed since §6:** items 1 (X3's lane), 2 (§6.2 foreground refresh) and 3 (§6.3
`StyleProfileStore`). Item 4 stands as recorded — `OrderHandoffTests` and
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` were green again here
(1523/1523), so flaky-under-load, not a regression.

**Fable — still open:**

1. **The account-switch walk was never driven.** The seam that W5's carry-over exists for is
   unit-verified only. It wants a walk on a device where input delivery is healthy, or an explicit
   ruling that unit coverage is enough for this wave.
2. **`wipeGuestWork` does not clear the two style-profile keys** (X3's fix log, "not changed, and
   named rather than fixed"). Different boundary from §6.3's; SP-06's "start fresh" arm still leaves
   a taste portrait behind on the phone.
3. **The MINORs X3's fix round left** — MN-2, MN-3, MN-5, MN-6, MN-7, MN-9 (the seat/thread
   divergence, which the review sends to Fable for ratification), MN-11, MN-12. None is a
   correctness defect; MN-9 is the only one that is a product ruling rather than a note.
4. **Retirement is still nobody's yet.** Three lane worktrees and the clones `dr-w6-x1`
   (`C0F004CB-…`), `dr-w6-x2` (`05F96C3D-…`), `dr-w6-x3` (`63E0BC31-…`) are on disk and booted;
   `.writer.lock.d` is still held in `agent-dr-w6-x3`'s tree. X3's work is committed now, so nothing
   in that tree is at risk from a sweep — but the walk has not run, so the call stays the
   orchestrator's.

**Kody:** unchanged — the widget's ASC bundle-id registration (`cloud.patina.app.widget` under app
`6762007888`) and the App Group capability on both App IDs; and the W3 item, publishing the three
Sanity tour bodies before `house-first` is enabled for anyone.

**Pre-existing, seen again on the flag-off shot:** the floating Companion orb overlaps the
`YOUR HOUSE` rail's first card. The W4 carry-over, not introduced here.

### 9.8 State at hand-off

- `daily-return/integration` at **`f48e11d20`**, 17 commits ahead of `main`. `git status` clean
  apart from the ignored `Secrets.swift` (`.gitignore:53`). Nothing pushed.
- `dr-w6-int` (`89112219-…`) left **booted, signed in as `client@patina.dev`, with the signed
  integration build installed** and the flag-off (W2) root on screen — the walker's device, ready
  for the acceptance walk. Note for the walker: this is a fresh container, so the app's local state
  is what one deep-link sign-in and three launches put there.
- `.writer.lock.d` released at this report. No migration touched; nothing touched Strata,
  production, or App Store Connect; no secret value was printed or committed.
