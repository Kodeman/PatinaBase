# W6 · X2 — integration notes

For the steward. Lane X2 owns none of the files below; each is a one-line change the owner applies.

---

## 1. The house line needs one call site (`Features/Home/Views/`) — X2 does not own it

`WidgetSnapshot.houseLine` is specified as "the house rail's first room". The rail's cards are built
in the view (`HouseRoomCard.cards(projectRooms:localRooms:)`, `YourHouseRail.swift`), which is not in
X2's owned set, and `RecordSnapshotStore.save` is reached only from `RecordRefresh`, which knows the
record and not the rail.

So the store has the entry point and nothing calls it yet. **One line, in `DailyRoomView` where the
cards are already in hand:**

```swift
RecordSnapshotStore.shared.noteHouseLine(cards.first?.name)
```

Until it lands, `houseLine` is simply **absent** from `widget-snapshot.json` — verified on the
simulator twice (ledger `w6-x2` and `w6-x2 · fix round`). It is never *wrong*: `save` carries the
last known line forward rather than blanking it, and a `nil` line is X1's "no house line" state, not
an empty string.

⚠ **Two things changed under this line in the fix round (review F6), both in the caller's favour:**

- The signature lost its `now:` argument — it is `noteHouseLine(_:)`. The refreshed-at stamp belongs
  to the record, not to the note.
- It is now safe to call **early and often**, with no ordering constraint against `RecordRefresh`.
  With no record on disk it writes nothing (a snapshot minted there would carry no rows and no
  window, which X1 draws as `Nothing moved since …` — an assertion about a window the app never
  computed) and instead **holds** the line; the next `save` carries it in. A `.task` / `.onChange` on
  the rail's cards is therefore correct as written, and re-firing is free — an unchanged line neither
  writes nor reloads.

The reviewer recorded this as **blocking-owed** rather than a later wave, so it belongs on the
steward's integration list before the wave can claim M6.

## 2. `RecordRefresh.swift` was NOT touched — the reload lives in the store

Steward §5 asked X2 to say where the `WidgetCenter` hook went rather than edit
`Features/Home/ViewModels/RecordRefresh.swift` silently. It went **inside
`RecordSnapshotStore.save` and `.remove`**, exactly as §5 recommended: one writer, one reload, every
path covered — including `remove()`, which `LocalStoreReset.swift:53` and `RecordIdentity.admits`
both call, so a signed-out widget cannot keep painting the last account's row.

`RecordRefresh`'s step sequence is untouched and `RecordRefreshOrderTests` is green in the 1,455-test
run. **No lane needs a line in `RecordRefresh.swift`.**

## 3. `import WidgetKit` is new surface in the app target

`grep -rn "WidgetKit\|WidgetCenter"` over `Patina/` returned nothing before this lane. It is now
imported by `Core/Persistence/RecordSnapshotStore.swift` only. The build is green twice and the unit
tier runs on a simulator with no widget installed — `reloadTimelines` is a no-op there. The reload is
an **injected closure** (`reloadWidgets:`), so the tests count reloads instead of delivering them and
nothing in the suite touches WidgetKit.

## 4. `X1` must declare its widget with `kind: "PatinaHouseWidget"`

Published as `WidgetSnapshot.widgetKind` (`x2-tasks.md` §0). The app names that kind on every reload.
A different string in `PatinaWidget/` means the app writes the file and the widget is never asked to
redraw — it would refresh only on its own timeline policy, silently losing "refreshed on foreground"
(Q8). Worth one grep at integration.

## 5. ~~The reminder reuses `PushPrimerView`~~ — SUPERSEDED by the fix round (review F4)

**This note is now historical.** The first cut followed the lane brief (`x2-tasks.md` §2), which
overrode steward §7 and routed the reminder through SP-08's `PushPrimerView`. The X2 review marked it
blocking: that screen promises "a decision, a proposal, or an invoice", its button calls
`requestAuthorizationAndRegister()` (remote registration, unsaid on screen), and presenting it burns
Q7's one ask before the money moment it was ruled for.

**As shipped now, the steward's reading:** the reminder has its own primer
(`Features/Invoices/Views/InvoiceReminderPrimerView.swift`) carrying `InvoiceReminder.promise` — the
exact sentence the notification will send — and asks for `[.alert]` only through the scheduler seam.
It registers for nothing remote, and it neither reads nor arms Q7's gate, so **SP-08's primer still
gets its once-per-install ask at the money moment**, whichever comes first. `PushTokenService` is no
longer referenced by this feature at all.

Verified on the clone: a fresh install saw SP-08's primer from the money-moment trigger, `Not now`
armed Q7's gate, and the invoice act *still* presented the reminder's own primer (ledger
`w6-x2 · fix round`, shots 01 and 04).

## 6. No routing edit was needed, and none was made

`App/**` belongs to X1 this wave. The reminder's `userInfo` is
`{"entity_type": "invoice", "entity_id": "<id>"}`, which `PatinaAppDelegate`'s existing
`UNUserNotificationCenterDelegate` → `NotificationRouter.route(forEntityType:entityId:)` already maps
to `.invoiceDetail`. Pinned by `theTapRoutesToTheInvoice` in `InvoiceReminderTests`, which resolves
the scheduled request's own `userInfo` through the real router.

## 7. The App Group container was honoured on this lane's build

`codesign -d --entitlements -` on the produced `.app` printed an **empty dict** (the ad-hoc case
`w2/r1-notes.md` §7 recorded), yet `containerURL(forSecurityApplicationGroupIdentifier:)` **did**
resolve at run time and both files landed in
`…/Containers/Shared/AppGroup/11192F24-…/` — matching `w2/r2-notes.md` §3. So the two W2 findings are
both real and the `codesign` read is not a reliable predictor of the run-time container. **Neither
fact is a device claim**, and the fallback stays load-bearing; `usesAppGroupContainer` /
`usesAppGroupDefaults` still report which container is in use.

## 8. `WidgetRow.route` is written and nobody reads it — reserved, for the canon digest

X2 writes `route: {kind, id}` on every row (its own §0 contract). X1 deliberately does not decode it,
resolving `patina://record/<rowId>` against `house-record.json` so the route vocabulary lives in one
place. Harmless — `JSONDecoder` ignores unknown keys — but it is the only field in the payload where
a route vocabulary could silently drift, and the two lanes' notes disagree about whether it is part
of the contract. **Kept** rather than dropped (X1 built against the published §0), and recorded here
as a **reserved, producer-only field** so a future reader does not mistake silence for agreement.
Review F14.

## 9. The payload gained `sinceDate` — an amendment to the published §0 contract

Review F2. `WidgetSnapshot` now carries `sinceDate: Date?` = `record.window.start`, because X1's
`eyebrow` and `emptyLine` derive M6b's ruled day names from it and X2 was not sending it. §0's field
list should be read as gaining that one optional `Date`; X1 already decodes it as optional
forward-compat, so nothing on X1's side changes. Pinned by the key-set assertion in
`WidgetSnapshotTests.needsYouNeverReachesTheWidget`.

## 10. "Refreshed on foreground" is not fully true, and the fix is not X2's

Review F13. The reload rides `RecordSnapshotStore.save`, reached only from `RecordRefresh.run`, whose
foreground trigger is `DailyRoomView`'s `.onChange(of: scenePhase)`. Foregrounding while deep in
Studio, Spaces or Pieces refreshes nothing and reloads nothing; the widget then leans on its 30-minute
policy and X1's staleness line — honest, but not Q8's "refreshed on foreground". Both files are
outside X2's owned set (steward §8 lists `RecordRefresh.swift` as shared and neither lane's), so this
is a **program** item for the steward, not an X2 one.
