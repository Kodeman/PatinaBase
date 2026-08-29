# W6 · X1 — notes (the contract with X2, and the decisions this lane took)

---

## 1. The JSON contract — X1 ⇄ X2 (steward §2: agreed in writing before either lane writes code)

X2 published its half in `waves/w6/x2-tasks.md` §0 and landed the producer
(`daily-return/w6-x2` `79e42ab58`). **This lane reads what X2 actually writes.** Reconciled:

**File:** `widget-snapshot.json`, in the App Group container `group.cloud.patina.app`, beside
`house-record.json` — a **second, separate file**, because the record carries `needsYou` and Q8
forbids the widget from carrying what is owed (steward §5's honesty hazard). Two files make the
rule structural.
*(X1's opening proposal named `house-widget.json`; X2's name is the one on disk, so X1 changed.)*

**Encoding:** `JSONEncoder`/`JSONDecoder` with `.iso8601` dates, `.atomic` write — verified in
X2's `RecordSnapshotStore.encoder()`.

**Shape X2 writes, and what X1 does with each key:**

| Key | Type | X2 writes | X1 reads |
|---|---|---|---|
| `flagOn` | Bool | yes | Required in spirit; decoded `decodeIfPresent ?? false`. False → the widget draws its placeholder, never a row. Flags fail closed. |
| `refreshedAt` | Date | yes | The only required key. Older than 6 h → the widget prints `Refreshed <relative>`. Q8 lets it sit one open behind; C5 makes it say so. |
| `movedRows` | Array | yes (MOVED only, ≤3) | Drawn, capped at **2** by the widget itself, so a longer file cannot widen the surface. |
| `movedRows[].id` | String | yes (`HouseRecordRow.id`) | The whole payload of `patina://record/<id>`. |
| `movedRows[].title` | String | yes | The row's sentence, as the record worded it. |
| `movedRows[].date` | Date | yes | Printed as `Aug 28`. Never substituted. |
| `movedRows[].route` | `{kind,id}` | yes | **Ignored by X1, on purpose** — see §2c. |
| `houseLine` | String? | yes (currently always nil — nothing calls `noteHouseLine`) | Drawn as the small widget's footer when present, and outranked by the staleness note. |
| `sinceDate` | Date? | **not written** | Optional in X1's decoder. Present → eyebrow `SINCE THU` and M6b's `Nothing moved since Thursday.`; absent → eyebrow `WHAT MOVED` and `Nothing moved.` See §3. |
| `version` | Int? | not written | Optional; an unknown value is ignored rather than refusing to draw. |

**Absent from the payload, by ruling** — and X1's decoder has no member for any of them, so a file
that carried one would simply be ignored: `needsYou` in any spelling; **any count** (`count`,
`badge`, `pending`, `awaiting`, a total of anything); any "new" flag the widget would tick.

**Lifecycle (X2's side, verified in its tree):** written on every `RecordSnapshotStore.save`,
deleted on `remove()` (the auth boundary and the foreign-record discard both go through it), each
followed by `WidgetCenter.shared.reloadTimelines(ofKind: "PatinaHouseWidget")`. **The kind string
is `PatinaHouseWidget`** — `HouseWidget.kind` on X1's side, `WidgetSnapshot.widgetKind` on X2's;
both are pinned by tests. There is no owner id in the payload because the file is cleared on
sign-out instead; a widget process cannot ask who is signed in, so nothing is left for it to judge.

**Type names do not collide at integration.** X2's producer type is `WidgetSnapshot` in the app
target; X1's decoder is `HouseWidgetPayload` / `HouseWidgetPayloadRow` / `HouseWidgetPayloadStore`
in `PatinaWidgetShared/`. Both are compiled into `PatinaTests`, so identical names would have
shadowed each other there. Renamed on X1's side for exactly that reason.

---

## 2. Decisions this lane took, and why

### 2a. The widget links PatinaDesignKit — it does not vendor tokens

`PatinaFonts.registerAll()` exists in the design package *for this case*: its header says it
registers the vendored TTFs programmatically because extensions "can't share a host app's
`UIAppFonts`", reading from the SwiftPM resource bundle, which travels inside the framework.
Vendoring would duplicate nine TTFs and the colour table into a second target and let them drift.
So `PatinaWidget` takes the `PatinaDesignKit` package product, links it, and does **not** embed it —
the dylib is already in `Patina.app/Frameworks`, and the extension reaches it through
`LD_RUNPATH_SEARCH_PATHS = @executable_path/../../Frameworks`. Proven: the built `.appex` contains
`PatinaDesignKit_PatinaDesignKit.bundle`.

### 2b. `PatinaWidgetShared/` — one folder, two targets

Steward §2's trap: files under `Patina/` have no `PBXFileReference`; the synchronized root group is
the whole membership mechanism, so the widget cannot borrow one app file without borrowing ~600.
The same mechanism used *forwards* solves the test problem: `PatinaWidgetShared/` is its own
synchronized root group, listed by **`PatinaWidget`** and by **`PatinaTests`**. One file
(`HouseWidgetPayload.swift`, pure Foundation) is therefore compiled into both, and `PatinaTests`
tests the widget's real decoder, its real copy and its real link vocabulary rather than a copy of
them. The extension has no test bundle — this is the brief's "else in PatinaTests over the shared
model" arm.

### 2c. `patina://record/<rowId>` resolves against the record, not against the payload's route token

X2's payload carries a `route` token per row. X1 does not read it. The widget carries the row's
**id** and `DeepLinkHandler.route(forWidgetLink:in:)` finds that row in `house-record.json` — the
file the app itself wrote — and returns `row.route`. One route vocabulary, in one place
(`HouseRecord`'s private `RouteToken`), instead of a second copy inside an extension that could
drift from it. The two files are written and deleted together by `save`/`remove`, so they are never
out of step.

Unknown id, a row with no route, or no snapshot at all → `.heroFrame`, which `RouteTabTable` maps
to Today. A widget tap can never dead-end and never land somewhere the widget did not name.

### 2d. Which surface links where

- **Home Screen `.systemSmall` → `patina://today`.** M6d, verbatim: *"Tapping the widget opens M1
  plain."* `systemSmall` has one tap target anyway (`Link` is not honoured there).
- **Lock Screen `.accessoryRectangular` → `patina://record/<id>` of the single row it draws**,
  falling back to `patina://today`. That line *is* the row, and landing on the thing named is the
  useful act; M6d rules the Home Screen widget, not this one.
- **Lock Screen `.accessoryCircular` → `patina://today`.** It draws the Strata mark and no content,
  so it can only mean "open Patina".

### 2e. The Lock Screen line is a MOVED row, not the mock's decision

`mock/fragments/b-M6a.html` draws `Rug colour — asked Aug 22` on the Lock Screen widget — a NEEDS
YOU row. **Q8 supersedes the mock**: "Carries what moved, not what is owed." The rectangular
accessory draws the top **MOVED** row. Recorded so the difference reads as a decision, not an error.

### 2f. The gallery preview draws the no-data state, not a sample row

`placeholder(in:)` and `getSnapshot(in:)` under `context.isPreview` both return an empty entry, so
the widget gallery shows the Strata mark and `Open Patina to see your house.` rather than a
fabricated row. It costs the gallery some legibility; C5 buys it. Named here because it is the kind
of thing a reviewer would otherwise read as a bug.

### 2g. Bundle id

The brief names `cloud.patina.app.widget`; `waves/w6/steward.md` §3 names
`cloud.patina.app.PatinaWidget`. Both satisfy Apple's prefix rule. This lane took the **brief's**
`cloud.patina.app.widget`, and the built `.appex` carries it. Registering it under ASC app
`6762007888` and adding the App Group capability to both App IDs is Kody's paperwork; no agent
touched App Store Connect.

### 2h. Actor isolation

The app target sets `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. The widget target deliberately
does not: `TimelineProvider`'s requirements are nonisolated, and defaulting the extension to
`MainActor` would fight the protocol for no gain.

---

## 3. Integration notes

### For X2 — one field, optional, and the ruled copy turns on

`sinceDate` (a `Date`, ISO8601) = the MOVED window's start: `HouseRecord.window.start`. X1 already
decodes it; nothing else changes.

With it, the widget's eyebrow reads **`SINCE THU`** and its empty variant reads **`Nothing moved
since Thursday.`** — M6b's copy, verbatim, which is what the ruling names. Without it the widget
degrades honestly (eyebrow `WHAT MOVED`, empty line `Nothing moved.`) but the ruled sentence never
appears.

X1 deliberately did **not** derive the window itself. `HouseRecordBuilder.defaultWindowStart` is
`min(startOfDay(now) − 7 d, lastSeenAt)` with a six-hour suppression that keeps the previous
anchor; re-deriving that in the extension against a different clock is exactly the drift the lane
split exists to prevent. The app knows the answer; it should send it.

*(Second, smaller: `houseLine` is written but currently always nil, because nothing calls
`noteHouseLine` — X2 records this in its own ledger section. The widget handles nil correctly; the
footer simply does not draw.)*

### For the steward

- `project.pbxproj` was edited by this lane only, with the `xcodeproj` gem (1.27.0) driven by a
  throwaway Ruby script (steward §1 option **a**). The script is **not** committed; the resulting
  pbxproj is, and its diff was read line by line. It absorbs the five cosmetic round-trip hunks the
  steward predicted, and the gem's stray hard-coded `Foundation.framework` (pointing at an
  `iPhoneOS18.0.sdk` path that does not exist here) plus its new `Frameworks`/`iOS` groups were
  removed rather than committed.
- No migration. No new `AppRoute` case, so `RouteTabTable.tab(for:)` needed no hand-placement and
  `RouteTabTableTests`' exhaustiveness count is unchanged.
- `PatinaWidget/` and `PatinaWidgetShared/` enter SwiftLint's scope automatically
  (`.swiftlint.yml` `included: - .`). `swiftlint lint` over the new paths reports **zero**
  violations in them; `lint-delta` is still the steward's to run.
- Two suites failed once in a full-tier run and passed in isolation immediately after, and pass in
  the final full run: `OrderHandoffTests` (4 issues) and `CompanionCoachingModelTests`
  (`introGate_freshUser_pollsUntilTourResolves`). Both are polling/timeout tests in other lanes'
  files; this lane touched neither. Flagged as flaky-under-load, not as a regression.
- The lane's simulator clone `dr-w6-x1` has one changed state worth knowing before it is deleted:
  the first (and only) successful long press entered jiggle mode and the following tap on `Edit`
  appears to have removed a Home Screen page (`Page 2 of 3` → `Page 2 of 2`). Nothing else was
  altered; the hand-seeded `widget-snapshot.json` used for the routing walk was deleted afterwards.
