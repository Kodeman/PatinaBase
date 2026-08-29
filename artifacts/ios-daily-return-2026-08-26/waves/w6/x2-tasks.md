# W6 · X2 — the snapshot/flag bridge and the opt-in reminder

Lane X2, worktree `.codex/worktrees/agent-dr-w6-x2`, branch `daily-return/w6-x2`, base `main`
`4b35e0a94`. Simulator clone **`dr-w6-x2` `05F96C3D-FC4F-4C6B-AC07-503261141C8F`**.

---

## 0. THE CONTRACT — published for X1, before either lane writes code

This is the whole seam between the two lanes (`w6/steward.md` §2, option 1). Nothing is shared at
the source level: X1 writes its **own** local `Codable` mirror of the shapes below under
`PatinaWidget/`, and the JSON on disk is the only thing that has to agree.

### The file

| | |
|---|---|
| **Name** | `widget-snapshot.json` |
| **Directory** | **exactly the directory `house-record.json` lands in** — the App Group container `group.cloud.patina.app`, falling back to the app container when `containerURL(forSecurityApplicationGroupIdentifier:)` returns nil, as `RecordSnapshotStore` already does. The widget resolves it as `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.cloud.patina.app")?.appendingPathComponent("widget-snapshot.json")` |
| **Writer** | `RecordSnapshotStore` only — on `save(_:)`, on `noteHouseLine(_:)`, and removed by `remove()` |
| **Encoding** | `JSONEncoder`, `dateEncodingStrategy = .iso8601`. **No custom `CodingKeys`, no snake_case** — the JSON keys are the Swift property names, verbatim. Swift's synthesised encoder omits a nil optional rather than writing `null`, so `houseLine` and a row's `route` are **absent** when they have no value; decode them as optionals, which is what the shapes below already say |
| **Reader** | the widget's `TimelineProvider`. A missing or undecodable file is the widget's **no-data** state: `Open Patina to see your house.` — never a stale draw, never an invented row |

### The shapes

```swift
struct WidgetSnapshot: Codable {
    let movedRows: [WidgetRow]   // MOVED only. At most three, newest first.
    let houseLine: String?       // the house rail's first room, e.g. "Living Room". nil when none.
    let refreshedAt: Date        // when the app last wrote this file. The widget SAYS this.
    let flagOn: Bool             // the `house-widget` flag as the app last resolved it.
}

struct WidgetRow: Codable {
    let id: String
    let title: String
    let date: Date
    let route: RouteToken?       // { "kind": String, "id": String? } — absent when unmapped
}
```

`RouteToken.kind` uses the same vocabulary `HouseRecord`'s private token already uses, so the two
files never disagree: `decision` · `proposal` · `invoice` · `thread` · `project` · `piece` ·
`designRequests` · `order`. `id` is the raw identifier (for `order`, the already-prefixed
`ClientOrder.id` token). An `AppRoute` with no token encodes as **absent**, and the row still draws
— it just has no destination beyond the plain open.

Example on disk:

```json
{
  "movedRows": [
    { "id": "message:m1", "title": "Leah asked about the rug colour.",
      "date": "2026-08-26T14:02:00Z",
      "route": { "kind": "thread", "id": "8f2c…" } }
  ],
  "houseLine": "Living Room",
  "refreshedAt": "2026-08-28T09:12:04Z",
  "flagOn": true
}
```

### The reload

```swift
WidgetSnapshot.widgetKind == "PatinaHouseWidget"
```

`RecordSnapshotStore` calls `WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshot.widgetKind)`
after every write **and after `remove()`**. **X1 must declare its widget with exactly that `kind:`**
— one widget, both families (Q8: "one small widget, Home + Lock Screen"), so one kind string.

### What is NOT in it, and why that is structural

- **No `needsYou`. No count of any kind. No badge number.** Q8: "carries what moved, not what is
  owed"; `2x-panel-u1` §6 and B §4: "**No count on either.**" `house-record.json` *does* carry
  `needsYou` — a widget that decoded `HouseRecord` would be one line from breaking the ruling, so
  the widget-facing payload simply has no such field to read. Pinned by a test that decodes the
  written file and asserts the key is absent.
- **No `isNew` tick.** "New" is computed against `LastSeenStore` at app-build time; a widget that
  re-derived it against its own clock would fabricate. The widget draws rows, not ticks.
- **No owner id — the payload is cleared on sign-out instead.** Steward §5 left this call to X2.
  **Ruling: cleared, not carried.** `RecordSnapshotStore.remove()` deletes `widget-snapshot.json`
  alongside `house-record.json` and reloads the timeline, and `remove()` is already the single
  choke point at the auth boundary (`LocalStoreReset.swift:53`) and on the foreign-record discard
  (`RecordIdentity.admits` / `RecordRefresh`'s `.discard` arm). One writer, one deletion path, no
  second copy of the account rule in a process that cannot ask who is signed in.
- **No "now".** `refreshedAt` is when the app wrote the file. Q8 permits the widget to sit one open
  behind; it must be able to *say* so, and this is the field it says it with.

### The flag mirror (the widget cannot read PostHog)

| | |
|---|---|
| **Suite** | `UserDefaults(suiteName: "group.cloud.patina.app")` |
| **Key** | `patina.flags.resolved` |
| **Value** | `[String: Bool]`, keyed by `FeatureFlags.Flag.rawValue` — `house-first`, `direct-orders`, `house-widget` |
| **Written** | by `FeatureFlags.resolveAtLaunch()`, immediately after resolution, every launch |

`WidgetSnapshot.flagOn` is that mirror's `house-widget` value, read at write time. The widget may
read either — the snapshot field is the one it needs, the suite key is there for anything else.
**Absent mirror → `false` → the widget's no-data state**, which is the honest answer to `FeatureFlags`'
documented "off on the first launch after install" (W1a; steward §6, trap 9). Nothing papers over it.

---

## 1. Tasks

| # | Task | File |
|---|---|---|
| 1 | Publish this contract (above) before writing code | this file |
| 2 | `WidgetSnapshot` / `WidgetRow` / `RouteToken`, the `widgetKind` constant, and the `HouseRecord` → snapshot projection (MOVED only) | `Patina/Core/Persistence/WidgetSnapshot.swift` (**new**) |
| 3 | `RecordSnapshotStore.save(_:)` also writes `widget-snapshot.json` and reloads; `remove()` deletes both and reloads; `noteHouseLine(_:)` carries the house rail's first room in; the reload is an injected closure so it is testable | `Patina/Core/Persistence/RecordSnapshotStore.swift` |
| 4 | `FeatureFlags` mirrors the resolved set into the App Group suite at `resolveAtLaunch`, with the same honest fallback its neighbours use | `Patina/Core/State/FeatureFlags.swift` |
| 5 | The reminder's pure rules + copy: fire date, identifier, the exact sentence, when the act may be offered | `Patina/Services/Notifications/InvoiceReminder.swift` (**new**) |
| 6 | The scheduler: schedule / replace / cancel keyed by invoice id, over an injectable notification-centre seam; authorization via `PushPrimerView`, presented at most once | `Patina/Services/Notifications/InvoiceReminderService.swift` (**new**) |
| 7 | The affordance on invoice detail: the act, the "Reminder set for …" row, the remove control, and the sentence it will send | `Patina/Features/Invoices/Views/InvoiceReminderRow.swift` (**new**) + one mount in `InvoiceDetailView.swift` |
| 8 | Tests: snapshot shape + `needsYou` absent + fallback + reload-on-save/remove; flag mirror round-trip; reminder idempotency + copy + removal + the offer rule | `PatinaTests/WidgetSnapshotTests.swift`, `PatinaTests/FeatureFlagMirrorTests.swift`, `PatinaTests/InvoiceReminderTests.swift` (**new**) |

## 2. The reminder, ruled

B §4, verbatim: "**One local notification**, opt-in, from the invoice screen: *'Remind me the day
before.'* The app can schedule none today (F127); this is the only one it should."

- **Offered only** when the invoice `isPayable`, carries a `due_date`, that due date is still in the
  future, **and** the reminder moment itself is still in the future. A reminder that would fire in
  the past is not offered rather than scheduled and silently swallowed.
- **The moment:** 09:00 local on the day before the due date.
- **One per invoice, idempotent:** request identifier `patina.invoice.reminder.<invoiceId>`. A second
  tap replaces; it never duplicates.
- **The body, exact:** `Your invoice is due tomorrow — $4,250.00. Nothing else.` No title of our own
  — the system draws `PATINA` above it, which is the Lock Screen shape M6a draws. No urgency word,
  no "Don't forget", no badge, no sound escalation, no repeat.
- **It says what it will say** *before* it is set: the sentence is printed under the act, in quotes.
- **On tap** it carries `{"entity_type": "invoice", "entity_id": "<id>"}`, which the existing
  `PatinaAppDelegate` → `NotificationRouter.route(forEntityType:entityId:)` already maps to
  `.invoiceDetail`. **No routing edit** — X1 owns `App/**` this wave, and none is needed.
- **Authorization:** if not granted, the act presents `PushPrimerView` (SP-08's sentence, verbatim)
  and the system prompt **once**, armed through `PushTokenService.armAuthorizationPromptGate()` so
  Q7's once-per-install ask is honoured. Denied → one quiet line and the act never asks again.

## 3. Gate

- `apps/mobile/Patina/scripts/ios-gate.sh build` (twice if the fresh-tree `GitCommit.swift` stamp
  phase fails first)
- `xcodebuild test … -destination id=05F96C3D-FC4F-4C6B-AC07-503261141C8F -only-testing:PatinaTests`
  — the whole tier green
- No `ios-gate.sh all`, no `lint-delta` (steward-only)
- Sim check on the clone with `-DeploymentTarget local -PatinaFlags house-widget`

## 4. Integration notes for the steward

Filed as they arise in `waves/w6/x2-notes.md`. The one known in advance: **the house line needs one
call site outside X2's owned files** — `RecordSnapshotStore.shared.noteHouseLine(_:)` from the Today
surface (`Features/Home/Views/`), which X2 does not own. The store carries the last known house line
forward across saves so the field is never *wrong*, only absent until that one line lands.
