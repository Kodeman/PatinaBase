# W6 · X1 — task list (the widget target, its timeline, the deep links)

Implementer X1, worktree `.codex/worktrees/agent-dr-w6-x1`, branch `daily-return/w6-x1`,
base `main 4b35e0a94`. Written before any code, per the build plan's rule for lane task lists.

Format: failing test → run → implement → run → pathspec commit.

Sources this list answers to: `source/build-plan.md` "Global constraints" + `### W6`;
`source/rulings-2026-08-27.md` Q8; `source/direction-b.md` §4 + §11 M6 (+ `mock/fragments/b-M6a.html`,
`b-M6b.html`, `b-M6.sheet.html`); `research/2x-panel-u1.md` §6; `waves/w2/r1-notes.md` §7 +
`r2-notes.md` §3; `waves/w3/steward.md` §4; `waves/w6/steward.md` (all of it).

---

## Rulings this lane is bound by, restated so a task cannot drift off them

- **Q8**: one small widget, Home Screen **and** Lock Screen. It carries **what moved**, never what
  is owed. Refreshed on app foreground + by timeline policy. It **may sit one open behind**, and it
  must be able to say so.
- **C5 honesty**: no count of what is owed, no badge, no fabricated "new". A stale snapshot says
  when it was refreshed.
- **B §4 / 2x-panel-u1 §6**: *"No count on either."* No Wallet pass. The widget renders only for a
  signed-in account (the app decides that by writing, or not writing, the payload).
- **M6b copy**: empty variant `Nothing moved since Thursday.` (day name from the window).
  **M6 screen sheet**: no-data state `Open Patina to see your house.`
- **M6d**: *"Tapping the widget opens M1 plain."*
- Steward §2: the widget target **cannot share the app's Swift files** (the synchronized root group
  is the whole membership mechanism). X2's widget-facing payload is its own small `Codable`; the
  widget decodes it with its own struct. The contract between the lanes is **the JSON on disk**.
- Steward §5: `house-record.json` contains `needsYou`. The widget must never decode it.

---

## T0 — the contract, in writing, before code (steward §2)

Write `waves/w6/x1-notes.md` §1: file name, key names, what is and is not in the payload, and the
`flagOn` semantics. Poll for `waves/w6/x2-tasks.md` and read X2's worktree read-only to reconcile.
The widget decodes the brief's minimal shape and treats every field beyond it as optional, so the
widget renders correctly against whichever of the two shapes X2 actually writes.

No commit (artifact folder, not the worktree).

## T1 — the shared model + link vocabulary, and its decode test

**Failing test first.** `PatinaTests/WidgetSnapshotContractTests.swift`:
- the minimal payload (`flagOn`, `refreshedAt`, `houseLine`, `movedRows[{title,date}]`) decodes;
- a payload carrying `needsYou`, a count key or a badge key still decodes **and the decoded value
  exposes no such member** — the honesty rule is structural, not a review comment;
- `movedRows` is capped at two by the widget, whatever the file holds;
- an undecodable / absent file yields nil (no-data), never a partial guess;
- `flagOn: false` decodes and is false;
- the link vocabulary round-trips: `PatinaWidgetLinks.today` == `patina://today`,
  `PatinaWidgetLinks.record(id:)` == `patina://record/<id>`, and a row id carrying a colon
  (`order:direct:<uuid>` — `ClientOrder.id` is already a prefixed token) survives the round trip.

**Implement.** `PatinaWidgetShared/WidgetSnapshot.swift` — pure Foundation, no WidgetKit:
`WidgetSnapshot`, `WidgetSnapshotRow`, `WidgetSnapshotStore` (App Group reader with the same
fallback chain `RecordSnapshotStore` uses), `PatinaWidgetLinks`. Compiled into **both**
`PatinaWidget` and `PatinaTests` via a second `PBXFileSystemSynchronizedRootGroup` over that one
folder — the mechanism this project already uses, and the only one that does not drag ~600 files
into the extension (steward §2's trap).

Gate: `xcodebuild test -only-testing:PatinaTests`.
Commit: `feat(ios): the widget-facing snapshot contract and link vocabulary`.

## T2 — the deep-link doors, and where they land

**Failing test first.** `PatinaTests/WidgetLinkRoutingTests.swift`:
- `route(forWidgetLink:)` maps `patina://today` → `.heroFrame`;
- `patina://record/<rowId>` resolves against the snapshot the app itself wrote → that row's
  `route`; an unknown id, a row with no route, or no snapshot → `.heroFrame` (Today plain, never a
  dead end and never a fabricated destination);
- a foreign scheme and an unknown host return nil (the handler must keep dropping them);
- `handle(_:)` parses the widget hosts **after** the custom-scheme guard (steward §9 trap 7) —
  pinned by source order, the way `PortalLinkRoutingTests` pins the universal-link check;
- **tab landing, exhaustive**: for every `AppRoute` case `RouteTabTable.tab(for:)` names, a record
  row carrying that route, reached through `patina://record/<id>` on a real
  `AppCoordinator(houseFirstRoot: true)`, selects that tab; on `houseFirstRoot: false` the same
  route lands on the single stack;
- the `.launching` queue carries a widget URL through (`coordinator.pendingDeepLink` is set, and
  the drain routes it), and `configure(coordinator:)` replays a stashed route — the two doors
  `w3/steward.md` §4 calls the easiest to miss.

**Implement.** `DeepLinkHandler`: `static func route(forWidgetLink:in:)` beside
`route(forUniversalLink:)` (pure — no coordinator, so the table is testable), plus `today` and
`record` arms in the host switch. No new `AppRoute` case is needed: `.heroFrame` already exists and
`RouteTabTable` already maps it to `.today`, so `tab(for:)` stays exhaustive with nothing to place.

Gate: `xcodebuild test -only-testing:PatinaTests`.
Commit: `feat(ios): route the widget's doors — patina://today and patina://record/<id>`.

## T3 — the extension target in `Patina.xcodeproj`

No test can precede a target's existence; the gate is the build plus the `.appex` embed proof.

**Implement.** A throwaway Ruby script (`xcodeproj` 1.27.0, system ruby) mints:
`PatinaWidget` `PBXNativeTarget` (`com.apple.product-type.app-extension`), its
`XCConfigurationList` + Debug/Release `XCBuildConfiguration`s, Sources/Frameworks/Resources phases,
its `PBXFileSystemSynchronizedRootGroup` (+ an exception set for `Info.plist`, mirroring the app's),
the `PatinaWidgetShared` group listed by both `PatinaWidget` and `PatinaTests`, the `.appex`
`PBXFileReference` in Products, a `PBXContainerItemProxy` + `PBXTargetDependency` from the app, and
an **Embed Foundation Extensions** `PBXCopyFilesBuildPhase` (`dstSubfolderSpec = 13`,
`RemoveHeadersOnCopy`) on the app target. Settings: `PRODUCT_BUNDLE_IDENTIFIER` per the brief,
`IPHONEOS_DEPLOYMENT_TARGET = 26.5`, `DEVELOPMENT_TEAM = VP22LXHT7L`, `MARKETING_VERSION = 1.0`,
`CURRENT_PROJECT_VERSION = 1`, `SWIFT_VERSION = 5.0`, `SUPPORTED_PLATFORMS`, `INFOPLIST_FILE`,
`CODE_SIGN_ENTITLEMENTS`, `LD_RUNPATH_SEARCH_PATHS` including `@executable_path/../../Frameworks`.
`PatinaWidget/Info.plist` (`NSExtensionPointIdentifier = com.apple.widgetkit-extension`) and
`PatinaWidget/PatinaWidget.entitlements` (App Group **only**).

The pbxproj diff is read line by line before commit; X1 is its sole writer this wave.

Gate: `ios-gate.sh build` (twice if `GitCommit.swift` bites) + `ls Patina.app/PlugIns`.
Commit: `feat(ios): PatinaWidget — the app's first extension target`.

## T4 — the widget itself: bundle, timeline, three families

**Failing test first** (what can be tested off-device, in `PatinaTests`, over the shared model):
- the entitlements file carries the App Group and **nothing else**;
- `Info.plist` names the WidgetKit extension point;
- staleness: `refreshedAt` older than 6 h produces a "Refreshed …" line, younger produces none;
- the empty line is `Nothing moved since Thursday.` when the window's start is a Thursday, and
  degrades to a line that names no day when the app sent no window;
- `flagOn == false` produces the placeholder state, never rows.

**Implement.** `PatinaWidget/`: `PatinaWidgetBundle.swift` (`@main`), `HouseWidget.swift` (one
`Widget`, one kind, families `.systemSmall` + `.accessoryRectangular` + `.accessoryCircular` —
Q8's "one small widget, Home + Lock Screen"), `HouseWidgetProvider.swift` (`TimelineProvider`:
placeholder / snapshot / timeline, policy `.after(now + 30 min)`), `HouseWidgetViews.swift`.
Links **PatinaDesignKit** so the widget draws in Playfair/Inter/DM Mono and the real tokens —
`PatinaFonts.registerAll()` exists precisely because a extension cannot share the host's
`UIAppFonts`.

Gate: `ios-gate.sh build` + `xcodebuild test -only-testing:PatinaTests`.
Commit: `feat(ios): the house widget — what moved, on the Home and Lock Screens`.

## T5 — the gates, whole tier

- `apps/mobile/Patina/scripts/ios-gate.sh build` (foreground, unsandboxed; twice if needed).
- `xcodebuild test … -destination id=C0F004CB-95D4-4BC5-AAD3-25E6513BD180 -only-testing:PatinaTests`
  — whole tier green, not just the new suites.
- `xcodebuild build` for the simulator destination + `ls …/Patina.app/PlugIns` proving
  `PatinaWidget.appex` is embedded.
- No `ios-gate.sh all`, no `lint-delta` (steward-only).

## T6 — the sim check on the lane's clone

`dr-w6-x1` `C0F004CB-95D4-4BC5-AAD3-25E6513BD180`, `-DeploymentTarget local -PatinaFlags house-widget`.
Add the widget from the Home Screen gallery; capture it **with data** (`client@patina.dev`) and
**with the flag off** (placeholder); tap it and prove the app opens on Today.
Shots `shots/w6-x1-NN-*.png` via `xcrun simctl io … screenshot` only; ledger rows under `## w6-x1`.

If X2's writer has not landed, the payload is hand-seeded into the simulator's App Group container
and the report says so — the widget's rendering is then proven against the contract, not against
X2's producer, and the difference is stated rather than blurred.

## T7 — finish

`waves/w6/x1-notes.md` completed (contract, decisions, integration notes for X2 and the steward),
`rmdir .writer.lock.d`, `git status --porcelain -uno` empty, report.
