# W6 — Steward setup + the facts X1 and X2 need

Steward, 2026-08-28. Wave base = **`main` `4b35e0a94`**
(`docs(ios): Daily Return — W6 script parse fix (no backticks inside template literals)`).
W5 is on it: `b5328fcb3 chore(daily-return): integrate W5 — the purchase path behind direct-orders`.

Everything below was run in this session and is quoted from its own output. Nothing was
pushed; no git write touched the main checkout.

---

## 0. Setup — done

### Worktrees

```
git worktree add .codex/worktrees/agent-dr-w6-x1 -b daily-return/w6-x1 main
git worktree add .codex/worktrees/agent-dr-w6-x2 -b daily-return/w6-x2 main
```

```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w6-x1  4b35e0a94 [daily-return/w6-x1]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w6-x2  4b35e0a94 [daily-return/w6-x2]
```

`Patina/App/Configuration/Secrets.swift` (1,121 bytes) copied into both from the main checkout.
`git check-ignore` confirms it is ignored in each tree (`.gitignore:53`), and `git status
--porcelain` is **empty** in both — the copy did not dirty either tree. **Never commit it.**

Both worktrees are named `agent-*`, so `.gitignore`'s `.codex/worktrees/agent-*/` rule covers them.

Per the plan's git constraint: `git worktree add` and `git merge` run **unsandboxed** (the sandbox
denies the `.env*` files a checkout writes). `mkdir .writer.lock.d` at start of writing, `rmdir` at
report. Pathspec commits only. No push from either lane.

### Simulators

The review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, iOS 26.5) was **Booted**;
`simctl clone` refuses a booted source (`SimError 405`, W5 `integration.md` §4). It was shut down,
cloned twice, and all three were re-booted:

| Device | UDID | State |
|---|---|---|
| review (walker's) | `973D1724-90BF-4A0A-B02D-481D561547B3` | Booted |
| **dr-w6-x1** | **`C0F004CB-95D4-4BC5-AAD3-25E6513BD180`** | Booted |
| **dr-w6-x2** | **`05F96C3D-FC4F-4C6B-AC07-503261141C8F`** | Booted |

Each lane runs its tests against **its own** clone:
`xcodebuild test -only-testing:PatinaTests -destination id=<the lane's udid>` — foreground.
`-DeploymentTarget local` on every simulator **launch**. Steward deletes both clones at wave end.

⚠ blitz takes **logical points** (402×874 on this device), not pixels. Screen capture: ONLY
`xcrun simctl io <udid> screenshot` or blitz's screenshot tool. Never `screencapture`.

### Cleanup already accounted for

W5's leftovers were **already retired before this steward ran** — nothing to delete:

- `git worktree list | grep dr-w` → no matches; `ls -d .codex/worktrees/agent-dr-*` → no matches.
- `git branch --list 'daily-return/*'` → empty (all five W5 branches gone).
- `xcrun simctl list devices | grep dr-w` → only the two clones created above. No `dr-w5-*` device
  survives (`dr-w5-{a11y,c1,c2,int}` are gone).

⚠ First `xcrun simctl` call of the session failed inside the sandbox with
`CoreSimulatorService connection became invalid` / `Operation not permitted` on
`~/Library/Logs/CoreSimulator/…`. It is a sandbox artifact, not a broken CoreSimulator: the same
command succeeded immediately with `dangerouslyDisableSandbox: true`. **Every `simctl` call in this
wave needs it.** So do `xcodebuild`, `git worktree`/`git merge`, `osascript`.

### Gates

- Per lane: `apps/mobile/Patina/scripts/ios-gate.sh build` **+** `xcodebuild test
  -only-testing:PatinaTests -destination id=<lane clone>` **+** the suites the lane owns.
- `ios-gate.sh lint-delta` and `ios-gate.sh all` are **steward-only, on the integration branch**
  (lint-delta adds temp worktrees to the shared `.git`; `all` grabs the first iPhone simulator by
  `grep -iE 'iPhone (17|16|Air)' | head -1`, which is whichever clone sorts first).
- First `xcodebuild` in a fresh tree can fail on `Patina/Generated/GitCommit.swift` (the "Stamp Git
  SHA" Run Script phase, `project.pbxproj:332-336`) — **run it twice**. `ios-gate.sh build` writes
  to the **shared** DerivedData; re-run a no-error failure.
- No migration this wave. Tip is **00540** (`00537_house_on_today`, `00538_client_account_anonymize`,
  `00539_saved_item_note_and_presence`, `00540_direct_orders_attribution`). If a lane thinks it
  needs one, it does not — escalate to Fable instead.

---

## 1. The `xcodeproj` Ruby gem — resolves, and round-trips this project

```
$ ruby -e 'require "xcodeproj"; puts Xcodeproj::VERSION'
1.27.0
```
System ruby 2.6.10 at `/usr/bin/ruby`. (This is the gem
`apps/mobile/Capture/scripts/generate_project.rb` uses — **Capture's** project is generated;
**Patina's is not**, and must never be regenerated. It is hand-maintained and checked in.)

It opens Patina's project without loss:

```
opened OK; object_version=77
target: Patina        com.apple.product-type.application
target: PatinaTests   com.apple.product-type.bundle.unit-test
target: PatinaUITests com.apple.product-type.bundle.ui-testing
root children: ["Patina", "PatinaTests", "PatinaUITests", "Products"]
```

**Round-trip proof** (open → `save`, no edits, on a copy): the diff is **20 lines, all cosmetic** —
two empty `exceptions = ();` arrays added to the test synchronized groups, two empty
`packageProductDependencies = ();` removed, and the `XCLocalSwiftPackageReference` comment name
changed from `"../PatinaDesignKit"` to `"PatinaDesignKit"` (`relativePath = ../PatinaDesignKit` is
unchanged). **Nothing was dropped** — the three `PBXFileSystemSynchronizedRootGroup`s and the
`PBXFileSystemSynchronizedBuildFileExceptionSet` all survive.

It also knows everything X1 needs to mint:

```
PBXFileSystemSynchronizedRootGroup: KNOWN
PRODUCT_TYPE_UTI[:app_extension] = com.apple.product-type.app-extension
COPY_FILES_BUILD_PHASE_DESTINATIONS[:plug_ins] = "13"
```

**X1's choice, either is fine, state which in the report:** (a) drive the edit with the gem and
absorb the five cosmetic hunks in the same commit (say so in the commit body), or (b) hand-edit the
pbxproj so the diff is exactly the new target. Whichever — the pbxproj diff must be **read line by
line** before commit; X1 is its **sole writer this wave**.

---

## 2. `Patina.xcodeproj` — the shape a new extension target lands in

- `objectVersion = 77` (Xcode 16+ format).
- The app target **does** use `PBXFileSystemSynchronizedRootGroup`
  (`CBB2D0182F1D20F7007686CD`, `path = Patina`), as do `PatinaTests` and `PatinaUITests`. So a new
  `.swift` file *under `Patina/`* is auto-added to the app target with **no pbxproj edit**.
  **A new target is the opposite case** — it needs real pbxproj objects.
- The app group's one exception set (`CBB2D51B2F26AF69007686CD`) holds
  `membershipExceptions = (App/Configuration/Secrets.example.swift, Info.plist)`.
- Targets: `Patina` (`CBB2D0152F1D20F7007686CD`), `PatinaTests`, `PatinaUITests`. **No extension
  target exists — the widget is the app's first** (F130).
- App build phases, in order: `Stamp Git SHA` → Sources → Frameworks → Resources →
  `Embed Frameworks` → `SwiftLint`.
- Packages: local `XCLocalSwiftPackageReference` `../PatinaDesignKit`; remote `supabase-swift`,
  `posthog-ios`, `SwiftLintPlugins`.
- One shared scheme, `Patina.xcscheme`. `xcodebuild -scheme Patina` builds the app; an appex
  reaches the `.app` through a `PBXTargetDependency` + an **Embed Foundation Extensions** copy
  phase (`dstSubfolderSpec = 13`) on the app target — not through the scheme.

**What X1 must mint, minimum:** a `PBXFileSystemSynchronizedRootGroup` for `PatinaWidget`
(+ an exception set for its `Info.plist`); a `PBXNativeTarget` with productType
`com.apple.product-type.app-extension`; its `XCConfigurationList` + two `XCBuildConfiguration`s;
Sources/Frameworks/Resources build phases; a `PBXContainerItemProxy` + `PBXTargetDependency` from
the app onto it; a `PBXCopyFilesBuildPhase` (`dstSubfolderSpec = 13`, name "Embed Foundation
Extensions", `RemoveHeadersOnCopy`) on the app target; the `.appex` `PBXFileReference` in the
`Products` group; and `PatinaWidget` in the project's `mainGroup` children.

### ⚠ The trap: the widget target cannot share the app's Swift files

Files under `Patina/` have **no `PBXFileReference`** — the synchronized root group is the whole
membership mechanism, and a synchronized group belongs to the target that lists it in
`fileSystemSynchronizedGroups`. Listing `Patina` in the widget's list too would drag **all ~600
files** into the extension, and excluding them would mean ~600 `membershipExceptions`. There is no
"add just this file to a second target" in this project's file layout.

Three ways out, in the order the steward recommends them:

1. **The lane split already assumes this one.** X2 writes a **small widget-facing snapshot** —
   its own tiny `Codable` payload, MOVED rows only — and X1's widget decodes it with a **local
   struct of its own** under `PatinaWidget/`. Nothing is shared at the source level, the duplicated
   surface is ~30 lines of `Codable`, and it makes the honesty rule structural (§5). The contract
   between the two lanes is then **the JSON on disk**, which both sides can pin with a test.
2. Move the shared type into `PatinaDesignKit` (the local SPM package) and have both targets depend
   on it. Correct, but it moves record types into a design package where they do not belong, and it
   is a cross-lane edit. **Not this wave** unless option 1 provably fails.
3. A second synchronized root group over a new `Patina/Shared/…` subdirectory, listed by both
   targets. Nesting a synchronized group inside another synchronized group's path is not something
   this project does anywhere, and Xcode's behaviour there is unproven here. **Do not.**

**X1 and X2 must agree the JSON contract in writing before either writes code** — file name, key
names, and what is and is not in it — into `waves/w6/x1-notes.md` / `x2-notes.md`.

---

## 3. Entitlements, ids, deployment target

`apps/mobile/Patina/Patina/Patina.entitlements` today (verbatim keys):

| Key | Value |
|---|---|
| `aps-environment` | `development` |
| `com.apple.developer.associated-domains` | `applinks:client.patina.cloud` |
| `com.apple.developer.applesignin` | `Default` |
| `com.apple.security.application-groups` | **`group.cloud.patina.app`** (W2) |

Wired as `CODE_SIGN_ENTITLEMENTS = Patina/Patina.entitlements` on **both** app configurations
(`project.pbxproj:129, 177`).

Other build settings, both configurations:

- `IPHONEOS_DEPLOYMENT_TARGET = 26.5`
- `PRODUCT_BUNDLE_IDENTIFIER = cloud.patina.app`
- `DEVELOPMENT_TEAM = VP22LXHT7L`, `CODE_SIGN_STYLE = Automatic`
- `SWIFT_VERSION = 5.0`, `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`
- `SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"`
- `GENERATE_INFOPLIST_FILE = YES` with `INFOPLIST_FILE = Patina/Info.plist`

`Patina/Info.plist` carries the usage strings and `CFBundleURLSchemes = ["patina"]`
(`APIConfiguration.swift:158` — `public static let appURLScheme = "patina"`).

**The widget target needs:** its own `PatinaWidget/PatinaWidget.entitlements` carrying **only**
`com.apple.security.application-groups → group.cloud.patina.app`; `PRODUCT_BUNDLE_IDENTIFIER =
cloud.patina.app.PatinaWidget` (must be prefixed by the app id); the same
`IPHONEOS_DEPLOYMENT_TARGET = 26.5`, `DEVELOPMENT_TEAM`, `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` as the app (a mismatched version is an upload rejection later); its own
`Info.plist` with `NSExtension → NSExtensionPointIdentifier = com.apple.widgetkit-extension`.

**Kody's paperwork, not this wave's:** registering `cloud.patina.app.PatinaWidget` under ASC app
`6762007888`, adding the App Group capability to both App IDs, and refreshing the profiles
(Q8, `asc-signing-setup`). **No agent touches App Store Connect.**

### ⚠ The App Group is a device claim, and the fallback is load-bearing

- `w2/r1-notes.md` §7: on the **ad-hoc gate build**, `codesign -d --entitlements` on the produced
  `.app` returns an **empty dict** — the entitlement is not honoured,
  `containerURL(forSecurityApplicationGroupIdentifier:)` returns nil, and without the fallback the
  snapshot would silently no-op and Today would paint blank on every cold launch.
- `w2/r2-notes.md` §3: on the lane's **own** build on `dr-w2-r2`, the container **was** honoured —
  both artefacts landed in
  `…/data/Containers/Shared/AppGroup/6E95EB57-…/house-record.json` and
  `…/Library/Preferences/group.cloud.patina.app.plist`.
- The difference is signing. `ios-gate.sh build` passes **`CODE_SIGNING_ALLOWED=NO`**, which is
  exactly the build that produced the empty dict. A build that must exercise the shared container
  has to be signed — W5's pattern: `xcodebuild test … -derivedDataPath .build/dd` with **no**
  `CODE_SIGNING_ALLOWED=NO`, then `xcrun simctl install`.

**Consequence X1 and X2 must both honour:** a genuinely shared container between the app process
and the widget process is a **device** claim. Keep `RecordSnapshotStore`'s and `LastSeenStore`'s
fallbacks; keep `usesAppGroupContainer` / `usesAppGroupDefaults` reporting which container is in
use; and when the container is **not** shared, the widget must draw its no-data state
(`Open Patina to see your house.`), never stale or invented content. **This wave claims
compile-green + sim-verified at best. No device claim, ever, in either lane's report.**

---

## 4. Routing today (W3), and the widget's door

### The four external entry points

All funnel into `AppCoordinator.openExternal(_:)`, which on the flag-on root goes through
`TabNavigationModel` and on the flag-off root falls back to `navigate(to:)`
(`AppCoordinator.swift:358-362`).

**a. `PatinaApp.swift`** — `.onOpenURL { DeepLinkHandler.shared.handle($0) }` and
`.onAppear { DeepLinkHandler.shared.configure(coordinator: coordinator) }`.

**b. `App/DeepLinking/DeepLinkHandler.swift`** (singleton):
- `configure(coordinator:)` **replays a queued `pendingRoute`** — a route that arrived before the
  coordinator existed.
- `navigate(to:)` — the APNs path's entry.
- `handle(_ url:) -> Bool`: universal links **first** (`route(forUniversalLink:)`), then a guard
  `url.scheme == APIConfiguration.appURLScheme` — **any other scheme returns `false` and is
  dropped**; then a `.launching`-phase queue into `coordinator.pendingDeepLink`; then a switch on
  **host**: `auth` · `room` · `piece` · `default → handlePathBasedURL`.
- `handleRoomURL` → `.roomProject(roomId:)`; `handlePieceURL` → `.pieceDetail(pieceId:)`.
- `static route(forUniversalLink:)` — `https` + host `PatinaDeepLinks.clientHost`
  (`"client.patina.cloud"`) only: `piece`/`pieces` → `.pieceDetail`; `invoices`/`invoice` →
  `.invoiceDetail`; `proposals`/`proposal` → `.proposalDetail`; `decisions`/`decision` →
  `.decisionDetail`. Plural is the real spelling; singular are aliases.
- `handlePathBasedURL` — `/auth`, `/room/`, `/piece/` only.

**c. `App/DeepLinking/NotificationRouter.swift`** — pure mapping.
`route(forEntityType:entityId:)` switches on a lower-cased entity type: `project`, `proposal`,
`decision`, `invoice`, `design_request`, `lead`, `thread`, `message_thread` → Studio routes;
`room` → `.roomProject`; `product`/`piece` → `.pieceDetail`. W5 added an order arm
(`orderRoute(forEntityType:entityId:)`).

**d. `App/AppDelegate.swift:109-117`** — the APNs tap:
`NotificationRouter.resolve(apnsUserInfo:)` → `DeepLinkHandler.shared.navigate(to:)`.
`UNUserNotificationCenter.current().delegate` is set at `AppDelegate.swift:42`, and
`UNUserNotificationCenterDelegate` is implemented at `:134-170`.

### `TabNavigationModel` + `RouteTabTable` (W3), for the flag-on root

`Features/Navigation/TabNavigationModel.swift` — `@MainActor @Observable`, four
`NavigationPath`s keyed by `PatinaTab` (`today`/`spaces`/`pieces`/`studio`) with a parallel
`[AppRoute]` mirror per tab:

- `navigate(to:)` — **the entry a deep link, a universal link and a push tap take.** It reads
  `RouteTabTable.tab(for: route)`, **selects that tab**, then pushes. A route that IS a tab root
  selects the tab and pops it to root instead of pushing a duplicate door.
- `push(_:)` — the **in-app** tap: pushes onto the tab already on screen. Not the widget's path.
- `visibleRoute`, `isShowingTodayRoot` (`selected == .today && stack(for: .today).isEmpty`).

`Features/Navigation/RouteTabTable.swift` — `tab(for:)` has **no `default:`**, deliberately: a new
`AppRoute` case fails compilation here rather than silently landing on Today.
`rootRoute(for:)`: `.today → .heroFrame` · `.spaces → .yourSpaces` ·
`.pieces → .emergence(pieceId: nil)` · `.studio → .studio`.

### What X1 has to add for the widget's tap

A widget opens the app with `Link`/`widgetURL(_:)` and a URL — nothing else. Today:

- `patina://today` would pass the scheme guard, miss `auth`/`room`/`piece`, fall to
  `handlePathBasedURL`, and **return `false`** — the tap would open the app on whatever was last on
  screen, silently. There is **no Today host and no Today path** in the handler.
- `.heroFrame` is `AppRoute.heroFrame` (`Coordinator.swift:53`) and `RouteTabTable` maps it to
  `.today`; `isTabRoot(.heroFrame)` is true, so `navigate(to: .heroFrame)` selects Today and pops
  it to root — **exactly M6d's "tapping the widget opens M1 plain"**, on the flag-on root. On the
  flag-off root `openExternal` falls through to `navigate(to:)` on the single stack.

So X1 owns: a widget URL vocabulary (steward's suggestion, X1 rules: `patina://today` for the plain
open, and the existing `patina://piece/<id>` shape extended to the record row's own route for M6d's
"the record's top row expanded … one tap away"), the `handle(_:)` host case and/or
`handlePathBasedURL` prefix that parses it, the `route(forWidgetLink:)` pure mapper beside
`route(forUniversalLink:)` so it is unit-testable without a coordinator, and a test that the
`.launching`-phase queue and `configure`'s replay both carry a widget URL through (the replay is
the easiest of the four doors to miss — `w3/steward.md` §4).

⚠ `DeepLinkHandler.handle` checks universal links **before** the scheme guard; a new custom-scheme
host must go in the `switch host` block or the path-prefix list, **after** that guard.

---

## 5. Where the record's state lives — the facts X2 builds on

### `RecordSnapshotStore` — `Patina/Core/Persistence/RecordSnapshotStore.swift`

- `static let fileName = "house-record.json"` — "the one file name the app and (from W6) the
  widget agree on".
- App Group id `group.cloud.patina.app`, injected as an init parameter (default), with the
  fallback chain: group container → injected `fallbackDirectory` → `.applicationSupportDirectory`
  → `NSTemporaryDirectory()`. `let usesAppGroupContainer: Bool` says which happened.
- `save(_ record: HouseRecord)` — `JSONEncoder` with `.iso8601` dates, `.atomic` write, under an
  `NSLock`. `load() -> HouseRecord?` — nil on absent **or undecodable** (a stale shape must not
  stop launch). `hasSnapshot`. `remove()`.
- Callers today: `LocalStoreReset.swift:53` (`remove()` at the auth boundary),
  `DailyRoomViewModel.swift:351` (`load()` for the cold-launch paint), and `RecordRefresh`
  (`save`).

### `LastSeenStore` — `Patina/Core/Persistence/LastSeenStore.swift`

- `static let key = "patina.house.lastSeenAt"`, `static let appGroupIdentifier =
  "group.cloud.patina.app"`. Suite = `UserDefaults(suiteName:)`, **falling back to `.standard`**;
  `let usesAppGroupDefaults: Bool` reports which. Value is a `Double`
  (`timeIntervalSince1970`), not a `Date`.
- Its own header already names W6: "W6's widget will read
  `UserDefaults(suiteName: "group.cloud.patina.app")`, and it has to find the same timestamp the
  app wrote or it will call everything new for ever."

### `RecordOwnerStamp` — `Patina/Features/Home/ViewModels/RecordOwner.swift`

- `static let key = "patina.house.recordOwnerId"`, same App Group suite, same `.standard` fallback.
  Holds the auth user id the snapshot on disk was built for. Its doc comment says outright: "so the
  widget (W6) can make the same judgement the app makes."
- `RecordIdentity.decide(stampedOwner:session:)` → `.paint` / `.withhold` (no session — keep the
  file, paint nothing) / `.discard` (another account's, or unattributed).

### `RecordRefresh.run` — `Patina/Features/Home/ViewModels/RecordRefresh.swift`

The pinned order, asserted by `RecordRefreshOrderTests`:
`discardedForeignRecord?` → `paintedSnapshot` → `built` → `saved` → `attributed` → `stamped`.
**The visit stamp is written last, on purpose** — stamping before the build makes every row's
`isNew` false on the very open that should have shown the ticks. `markSeen` is wired in
`DailyRoomView`, **not** `ContentView` (`w2/r2-notes.md` §3).

**This is where the `WidgetCenter.shared.reloadTimelines(ofKind:)` hook belongs — after `saved`,
and it must not disturb the step sequence those tests pin.** `RecordRefresh` is inside
`Features/Home/ViewModels/`, which is **not** in X2's owned set; X2 owns
`Core/Persistence/RecordSnapshotStore.swift`. Cleanest placement that keeps the ownership line: the
reload fires from **inside `RecordSnapshotStore.save`** (one writer, one reload, every path
covered — including `remove()`, which must reload too, or a signed-out widget keeps painting the
last account's row). If X2 concludes it genuinely needs a line in `RecordRefresh.swift`, that is an
**integration note in `waves/w6/x2-notes.md`** for the steward, not a silent edit.

⚠ `WidgetKit` is not imported anywhere in the app today (`grep -rn "WidgetKit\|WidgetCenter"`
over `Patina/` and `PatinaTests/` → **no matches**). `import WidgetKit` in the app target is new
surface; it must be guarded so the unit tier still builds and runs on a simulator with no widget
installed (`reloadTimelines` is a no-op there, but the import is not free — check the build twice).

### `HouseRecord` — `Patina/Features/Home/Models/HouseRecord.swift` (read-only for both lanes)

```swift
struct HouseRecord: Codable, Equatable, Sendable {
    let needsYou: [HouseRecordRow]     // ordered by date asked, ascending; at most three
    let moved: [HouseRecordRow]        // newest first; at most three
    let window: DateInterval
    let lastSeenAt: Date?
    let hasMoreNeedsYou: Bool
    let hasMoreMoved: Bool
    var isEmpty: Bool { needsYou.isEmpty && moved.isEmpty }
    static let empty = …
}
```

`HouseRecordRow`: `id`, `kind`, `title`, `detail`, `date`, `state`, `isNew`,
`isStandingCondition`, `route`. `Kind` = `decisionAsked`, `proposalSent`, `invoiceDue` (NEEDS YOU)
· `messageReceived`, `orderMoved`, `savedPieceRepriced`, `savedPieceWithdrawn`, `story`,
`matchedDesigner` (MOVED). `route` round-trips through a private `RouteToken` because `AppRoute` is
`Hashable`, not `Codable`; an unmapped route encodes as absent and decodes to nil.

### 🚨 The honesty hazard, named explicitly

**`house-record.json` on disk contains `needsYou` — the count of what is owed.** Q8 and C5 forbid
the widget from carrying that: "Carries what moved, not what is owed"; 2x-panel-u1 §6 and B §4:
"**No count on either.** A running tally of chores on the Lock Screen is the instrument §10 refuses
with a true number in it."

A widget that simply decodes `HouseRecord` is **one line of code away from violating the ruling**.
This is the strongest argument for §2's option 1: **X2's widget-facing payload must not contain
`needsYou`, must not contain any count, and must not contain a badge number.** Make it structurally
impossible, not a review comment. Then pin it with a test that decodes the widget file and asserts
the key is absent.

Also required of the widget payload, from the same rulings:
- **A stale snapshot says when it was refreshed.** The payload carries the timestamp it was built
  at, and the widget's own eyebrow (`SINCE THU`) comes from `window`/`lastSeenAt`, not from "now".
  Q8 permits the widget to "sit one open behind" — B §4 says so explicitly, because a delivered
  alert does not run app code. The widget must be able to *say* that, not hide it.
- **The owner stamp travels with it.** A widget rendering the previous account's row is the same
  leak `RecordOwner.swift` exists to prevent, and the widget process cannot ask who is signed in.
  Either the payload is cleared on sign-out (`LocalStoreReset` + a reload) or it carries the owner
  id and the widget refuses a mismatch. **Steward's call to X2, stated in its task list.**
- Empty variant copy, verbatim from `mock/fragments/b-M6b.html`: **`Nothing moved since Thursday.`**
  (day name from the window). No-data variant, from B §11 M6's screen sheet:
  **`Open Patina to see your house.`**

---

## 6. Mirroring `FeatureFlags` into the App Group (the widget cannot read PostHog)

`Patina/Core/State/FeatureFlags.swift` today:

- `enum Flag: String, CaseIterable`: `houseFirst = "house-first"`, `directOrders =
  "direct-orders"`, **`houseWidget = "house-widget"`** — already minted in W1a, still unread by
  anything.
- `resolveAtLaunch()` is called from `PatinaApp.init()` **after** `PostHogService.initialize()` and
  **before** `AppCoordinator()` (which reads `house-first` into a `let`). It is **synchronous** and
  **idempotent** — the first answer is held for the session.
- Precedence: DEBUG `-PatinaFlags a,b` (authoritative for every flag; named on, unnamed off) →
  `--uitesting` (all off unless the argument names them) → `PostHogFeatureFlagProvider`, which
  reads PostHog's **persisted** payload synchronously (`isFeatureEnabled`) → `false`.
- **Documented cost:** on the very first launch after install there is no payload yet, so every
  flag is off for that session and correct from launch two. W1a's own record says "W3 must not
  depend on a first-launch flag" — the same applies to `house-widget`.
- Values live in a private `[Flag: Bool]` on a `@MainActor final class`. **Nothing is persisted.**

**The widget process cannot use any of this.** It is a separate process with its own bundle; it
never runs `PatinaApp.init()`, has no PostHog SDK, and `UserDefaults.standard` in the extension is
the *extension's* domain, not the app's.

The mechanism that already works in this codebase is the one `LastSeenStore` and `RecordOwnerStamp`
use: **write into `UserDefaults(suiteName: "group.cloud.patina.app")`**, which the widget can read
with the same one-liner. So:

- X2 adds a mirror in `FeatureFlags` — after `resolveAtLaunch()` decides, write the resolved set
  into the App Group suite under one new key (steward's suggestion: `patina.flags.resolved`, a
  `[String: Bool]` or a `[String]` of on-flags; X2 rules on the shape and pins the key as a
  contract the way `LastSeenStore.key` is).
- Same honest fallback as its neighbours: when the suite is unreachable the mirror is app-local and
  a `usesAppGroupDefaults`-style property says so; the widget then reads nothing.
- **`house-widget` off must mean the widget renders nothing real, not a stale row.** The widget
  reads the mirror; absent or false → the no-data state. Because the mirror is only written after a
  launch, a first-ever launch has no mirror — which is the same "off on launch one" cost W1a already
  accepted, and the widget's no-data state is the honest answer to it.
- ⚠ A **release** build ignores `-PatinaFlags` entirely (`#if DEBUG`), so on a walk the mirror only
  shows what the launch argument set in a Debug build. Every local walk uses
  `-PatinaFlags house-widget` (plus `house-first` when the walk needs the tab bar).

---

## 7. The other surface: the opt-in invoice reminder (X2)

Ruling, B §4, verbatim: "**One local notification**, opt-in, from the invoice screen: *'Remind me
the day before.'* The app can schedule none today (F127); this is the only one it should."
Program constraint, restated: **opt-in from the invoice itself, one per invoice, and it says
exactly what it will say.**

Facts:

- The app schedules **no** local notification today. `UNUserNotificationCenter` appears in exactly
  four files: `App/AppDelegate.swift` (delegate + APNs taps), `Services/API/PushTokenService.swift`
  (`requestAuthorizationAndRegister`, `notificationSettings`),
  `Features/Notifications/Views/PushPrimerView.swift` (SP-08's primer, which deliberately does
  **not** touch `UNUserNotificationCenter` itself), and `Features/Purchase/OrderPlacedView.swift`.
- There is **no** `Services/Notifications/` directory. `Patina/Services/` holds `Analytics`, `API`,
  `Auth`, `Badges`, `Companion`, `DesignServices`, `Events`, `Permissions`, `Settings`, `Sharing`,
  `Sync`. `Services/Permissions/` holds only `CameraPermissionService.swift`. **X2 creates the new
  home** — steward's read of the house pattern: `Patina/Services/Notifications/` for the scheduler
  service (beside `Permissions`), with the UI affordance in `Features/Invoices/Views/`.
- Invoice surface: `Features/Invoices/Views/InvoiceDetailView.swift` (305 lines),
  `InvoiceDetailBlocks.swift` (185), `InvoiceListView.swift` (203), `SafariView.swift` (48),
  `Features/Invoices/InvoiceSettleCopy.swift` (51). W1b lane B already put due/expiry dates on
  detail (SP-15) and the money-screen chrome is settled — **the reminder is an addition to the
  detail screen, not a re-layout of it.**
- The authorization ask: `PushTokenService.requestAuthorizationAndRegister()` asks for
  `[.alert, .sound, .badge]` and registers for **remote** notifications. A local reminder needs the
  same alert authorization but **not** remote registration. X2 must not route the reminder through
  the push primer (that primer's sentence is SP-08's four money events, verbatim, and Q7 says
  "asked once"); a reminder the person opted into on the invoice can ask for authorization on its
  own terms — but if it does, its copy says exactly what it will say and nothing else.
- **One per invoice**: identify the request by the invoice id so a second tap replaces rather than
  duplicates, and cancel it when the invoice is paid or the toggle is turned off. There is no
  badge, no repeat, no escalation.

---

## 8. Owned-file map

A lane needing a change in the other's file writes it as an integration note in
`waves/w6/<lane>-notes.md`; **the owner applies it.** Neither lane edits the other's files.

### X1 — the extension target, its views, and the widget's door into the app

| Path | Note |
|---|---|
| `apps/mobile/Patina/PatinaWidget/**` | **New**, beside `Patina/`, `PatinaTests/`, `PatinaUITests/`. `@main` WidgetBundle; the **small Home Screen** widget; the **Lock Screen accessory** (`.accessoryRectangular`); the `TimelineProvider` (+ `TimelineEntry`); views; `Info.plist` (`NSExtensionPointIdentifier = com.apple.widgetkit-extension`); `PatinaWidget.entitlements` (App Group only); the local `Codable` mirror of X2's widget payload |
| `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` | **X1 is its SOLE writer this wave.** The extension target, its configurations, the app's dependency + Embed Foundation Extensions phase, the synchronized root group, the `.appex` product |
| `apps/mobile/Patina/Patina/App/**` | The widget's deep-link entry: `DeepLinkHandler` host/path parsing for the widget URL, its `.launching` queue + `configure` replay, and the hand-off into `TabNavigationModel` via `AppCoordinator.openExternal` |
| `apps/mobile/Patina/Patina/Features/Navigation/**` | Route parsing / mapping for widget URLs (`RouteTabTable`, `TabNavigationModel`, and any new pure mapper); a new `AppRoute` case only if genuinely needed — `tab(for:)` has no `default:`, so one must be placed by hand |
| `apps/mobile/Patina/PatinaTests/**` (its own new suites) | Widget-URL routing tests; the timeline/entry tests; the "no count, no badge, no fabricated new" assertions on the widget's own decode |

### X2 — the app-side producers

| Path | Note |
|---|---|
| `apps/mobile/Patina/Patina/Core/Persistence/RecordSnapshotStore.swift` | The `WidgetCenter` reload hook (on `save` **and** `remove`) + the widget-facing snapshot shape (its own small payload — **no `needsYou`, no counts**, carrying its refreshed-at stamp and the owner judgement) |
| `apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift` | Mirror the resolved flag set into the App Group suite, with the same honest fallback its neighbours use |
| `apps/mobile/Patina/Patina/Features/Invoices/**` | The opt-in "Remind me the day before." affordance on invoice detail |
| `apps/mobile/Patina/Patina/Services/Notifications/**` (**new**) | The local-notification scheduler: schedule / replace / cancel, keyed by invoice id; authorization handled without hijacking SP-08's push primer |
| `apps/mobile/Patina/PatinaTests/**` (its own new suites) | Payload shape (incl. **`needsYou` absent**), reload-on-save/remove, flag mirror round-trip, reminder scheduling/cancel/one-per-invoice |

**Existing suites each lane inherits and must leave green:** X2 owns `HouseRecordStoreTests`,
`RecordRefreshOrderTests`, `RecordIdentityTests`, `LastSeenMirrorTests`, `FeatureFlags`' suite, and
the invoices suites (`InvoicesMoneyRailTests`). X1 owns the routing suites its edits touch
(`NotificationRouter`/`DeepLinkHandler`/`RouteTabTable` tests). Neither renames or deletes an
existing test to make a change fit.

**Shared, and neither lane's to edit:** `Patina/Features/Home/Models/HouseRecord.swift`,
`Features/Home/ViewModels/RecordRefresh.swift`, `Features/Home/ViewModels/RecordOwner.swift`,
`Core/Persistence/LocalStoreReset.swift`, `Patina/Patina.entitlements`
(**if the app's entitlements need a line, it is an integration note to the steward** — the App
Group key is already there, so they should not).

---

## 9. Traps, collected

1. **`simctl` fails inside the sandbox.** Every `simctl` / `xcodebuild` / `git worktree` / `git
   merge` / `osascript` call needs `dangerouslyDisableSandbox: true`. Builds in the foreground.
2. **First `xcodebuild` in a fresh tree** can fail on `GitCommit.swift` (the Stamp Git SHA phase).
   Run it twice. `ios-gate.sh build` writes to the **shared** DerivedData — re-run a no-error
   failure rather than diagnosing it.
3. **`ios-gate.sh build` passes `CODE_SIGNING_ALLOWED=NO`** — App Group entitlements are **not**
   honoured on that product. Any claim about the shared container needs a signed build
   (`xcodebuild test … -derivedDataPath .build/dd`, no `CODE_SIGNING_ALLOWED=NO`) and even then is
   sim-verified, never device-verified.
4. **`ios-gate.sh all` / `lint-delta` are steward-only.** `all` picks the first `iPhone (17|16|Air)`
   simulator by grep order — it will grab a lane's clone. `lint-delta` adds temp worktrees to the
   shared `.git`.
5. **SwiftLint will lint `PatinaWidget/` automatically** — `.swiftlint.yml` has `included: - .`
   from `apps/mobile/Patina`, and excludes only `Pods`, `Packages`, `.build`, `build`,
   `DerivedData`. New extension code enters `lint-delta` on the integration branch. Write it clean:
   `line_length` warning 120 / error 200, `file_length`, `type_body_length`,
   `function_body_length` and **trailing commas in collection literals** are what caught W5
   (`integration.md` §3b).
6. **`RouteTabTable.tab(for:)` has no `default:`** — a new `AppRoute` case is a compile error there
   until X1 places it. That is the design.
7. **`DeepLinkHandler.handle` checks universal links before the custom-scheme guard**, and drops
   any other scheme. A widget URL must be parsed on the right side of that guard.
8. **`configure(coordinator:)` replays a pending route.** The cold-launch widget tap goes through
   it. Test it.
9. **`FeatureFlags` resolves off on the first launch after install** (no persisted PostHog
   payload). The widget's no-data state is the honest answer; do not paper over it.
10. **Release builds ignore `-PatinaFlags`.** Local walks are Debug.
11. **The snapshot file is device-global and outlives a sign-out.** `RecordOwnerStamp` exists for
    exactly that; the widget must not be the hole in it.
12. **Nobody touches App Store Connect, production, or Strata.** The widget's bundle-id
    registration and the App Group capability are Kody's paperwork.
13. **W5 carried a session-isolation finding into W6** (process-lifetime singletons not reset on an
    in-process sign-out/sign-in — `walk.md` §1). **That is not this steward's lane assignment**;
    if Fable wants it in W6 it needs a third lane, because it lives in `Services/Badges/`,
    `Services/DesignServices/` and `Features/Purchase/`, which neither X1 nor X2 owns.

---

## 10. Steward state at hand-off

- `main` untouched; **nothing pushed**; no git write in the main checkout (read-only `git log` /
  `git worktree list` / `git branch --list` only).
- Two worktrees created, on new branches from `4b35e0a94`, `Secrets.swift` in both, both clean.
- Two simulator clones created and booted; the review device shut down for the clone and re-booted.
- W5's worktrees, branches and simulator clones were already retired before this session — nothing
  was found to delete, and nothing was deleted.
- No secret value read, printed or written. Nothing touched Strata, production, or ASC.
