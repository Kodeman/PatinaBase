# W2 · lane R2 — fix round

Against `waves/w2/r2-review.md`. Branch `daily-return/w2-r2`, five commits on top of `6b96a87a9`.

Gate, re-run exactly as the brief names it:

```
$ apps/mobile/Patina/scripts/ios-gate.sh build            → ** BUILD SUCCEEDED **
$ xcodebuild test … -only-testing:PatinaTests             → 978 tests in 117 suites passed
                                                             ** TEST SUCCEEDED **
```

Was 942 / 115 at review time; 36 new tests, no suite lost. `AttentionCountTests`,
`CompanionActionMatrixTests`, `DailyRoomFeedMappingTests`, `MoneyAndStudioCopyTests`,
`HouseRecord*` all still green.

---

## BLOCKING

### B-1 · the Record outliving the account — **FIXED**, commit `f21ffecc5`

Both halves the review asked for, because the auth boundary alone cannot cover a snapshot
written before the boundary knew about it.

**The durable half.** `LocalStoreReset.wipeUserScopedData()` now removes all three artefacts:

```swift
RecordSnapshotStore.shared.remove()   // house-record.json in the App Group container
LastSeenStore.shared.clear()          // patina.house.lastSeenAt
RecordOwnerStamp.shared.clear()       // patina.house.recordOwnerId
```

`remove()` and `clear()` are four new lines in R1's two store files. `LocalStoreReset.swift`
is unowned in W2 — **integration note**: R2 edited it, three lines, no other W2 lane touches
the file.

**The guard half.** New `Features/Home/ViewModels/RecordOwner.swift` (R2's own tree):
`RecordOwnerStamp` writes the account id the snapshot was built for into the same App Group
suite the visit stamp uses, and `RecordIdentity.decide(stampedOwner:session:)` returns

| stamp | session | decision |
|---|---|---|
| `"a"` | `"a"` | `.paint` |
| `"a"` | `"b"` | `.discard` — the record, the visit and the stamp all removed |
| `nil` | `"a"` | `.discard` — an unattributed snapshot cannot be shown to be anyone's |
| `"a"` | `nil` / `""` | `.withhold` — nothing painted, nothing deleted |

`.withhold` exists because a session still being restored is not a different account; deleting
on a transiently-nil id would cost the person the head start their own record was for.

Both consumers now go through it: `DailyRoomViewModel.paintRecordSnapshot()` (guards on
`AuthService.shared.currentUserId`, not on `isAuthenticated` alone) and `RecordRefresh.run`,
which took a `sessionUserId:` parameter and now runs

```
discardedForeignRecord? → paintedSnapshot? → built → saved → attributed → stamped
```

`.discardedForeignRecord` is appended only where something was actually thrown away
(`snapshots.hasSnapshot || lastSeen.lastSeenAt != nil`), so a genuine first run does not read
as a leak that was caught. `.attributed` lands **before** `.stamped`: a crash between the two
costs one open's ticks, where an unattributed snapshot would simply be discarded next launch.

Pinned by `RecordIdentityTests` (9) and three new `RecordRefreshOrderTests` — including one
that asserts B's build receives `previous == nil` **and** `lastSeenAt == nil`, so A's visit
cannot decide what is "new" for B.

Walked: shot `w2-r2-11-account-switch-cold-launch-no-leak.png`. `james.okafor@example.com`
signed out, `client@patina.dev` signed in, app terminated, cold launch, screenshot at the
first Today paint. No `Leah Hartwell picked up your request.`, no `YOU WERE LAST HERE`
header — the header is absent because the visit went with the account, which is the correct
answer, not a missing one.

---

## MAJOR

### MJ-A · a studio halved — **FIXED**, commit `08743dd04`

The form now follows *which field resolved*, never the string.
`RemoteDesignerRef.personName` returns `display_name ?? full_name` and stops — `business_name`
is deliberately not in it. `StudioQueueBuilder.naming(_:fallback:fallbackIsPerson:)` carries
`(name, isPerson)` onto the new `StudioQueueItemRow.designerIsPerson`, and
`HouseRecordBuilder.resolveDesigner` returns the pair rather than a bare string so the
fallback chain (lead → project embed → decision embed → invoice embed) is judged the same way.

**One departure from the review's suggested fix.** The review proposed gating the *titled*
form on personhood, which would have sent a studio to
`"Hartwell Studio asked you to choose."` and dropped the question. A studio now keeps the
question and its whole name:

> **Hartwell Studio asked about Rug color — Natural vs Sand.**

MJ-5's ruling is that the row names the question; nothing in it says only people ask.
Fable's word if that is wrong — it is one ternary.

Four new tests in `HouseRecordDecisionCopyTests`, including the two-word studio name the old
suite never exercised and one that runs a `business_name`-only embed through
`itemizedAwaitingRows` end to end.

### MJ-B · M2's discovering house block — **BUILT**, commit `f815e4a60`, with one line rebutted

New `Features/Home/Views/RoomHeroCard.swift`. At `tier < .engaged` with exactly one room the
person made, the house is that room drawn whole — `YOUR HOUSE` / provenance eyebrow /
name / `18 × 14 ft · 252 sq ft` / `3 saved pieces` / the dated state line
`You added the Brass Arc Floor Lamp on Tuesday` / `+ Add a room`. Past a week the state line
names the day (`on Aug 4`), because "on Tuesday" three weeks later is a different Tuesday.
M2 block 5's `Saved` door lands with it (`SavedSummaryRow`, `3 saved · Brass Arc Floor Lamp,
Tuesday`, → `.table`), signed-in only per M2's tier note. From engaged upward, and at two or
more rooms, the rail is unchanged.

**Rebutted: the room's budget.** B §3 says "budget from `RoomModel.budgetCents`".
**There is no such field.** `grep -n budgetCents Patina/Core/Models/RoomModel.swift` → no
match; the model carries `width/length/height`, `items`, scan and image fields, and no money
at all. `project_rooms.budget_cents` is the *designer's* figure on a *project* room, and
lending it to a room the person typed would be inventing a number for them. So the budget
line is not drawn. Adding one is a SwiftData schema change to `Core/Models/RoomModel.swift`
— unowned in W2, and `@Model` field additions need defaults or older stores fall to
in-memory. **Fable: W3, or a ruling that the discovering room has no budget.**

Walked: `w2-r2-15-discovering-room-hero-light.png` / `-17-…-dark.png`. The card prints
`Living Room` / `14 × 18 ft · 252 sq ft` and nothing else, because the walk's room has no
saved pieces — which is the honesty rule working, not a gap. (The dimensions read
`14 × 18` where `18` was typed first: the manual-entry form's first field is length, not
width. Pre-existing, in a screen this lane does not own.)

Twelve new tests in `RoomHeroCardTests`, including the composition rules for both new blocks
and M2's block order.

### MJ-C · 36 pt controls — **FIXED**, commit `8d89e7d4e`

`YourDesignerSeat.messageButton` and `DailyGreetingHeader.studioControl` are `minHeight: 44`.
Pinned in `DesignerSeatTests` and `HomeHeaderTests`. Confirmed live: `scan_ui` on the running
app returns `DailyRoomView.StudioButton` at `{61, 44}`.

---

## MINORS TAKEN

| # | What | Where |
|---|---|---|
| 2 | `TopBandFoldTests` walks every `.swift` under `Patina/` (new `SourcePin.swiftFiles(under:)`) instead of a hard-coded twelve | `f8560c6b5` |
| 3 | `today_record_shown` carries `days_since_last_seen`; absent, not zero, where there is no visit | `f8560c6b5` |
| 4 | `HouseRecordDates` formatters take `en_US_POSIX` and the calendar's time zone | `f8560c6b5` |
| 5 | Past 30 days the header names the month (`You were last here on May 13`) | `f8560c6b5` |
| 6 | One `See all →` footer under both halves, with a rule above it, as M1 draws it | `f8560c6b5` |
| 7 | A failed `refreshProjectRooms` keeps only rooms whose project this account still has | `f21ffecc5` |
| 9 | `Add a room` offers both acts wherever it appears — `Scan it` was unreachable after the first room | `f815e4a60` |
| 10 | `fetchProducts(ids:)` chunks at 100 ids per read | `f21ffecc5` |
| 11 | `itemizedAwaitingRows`' doc comment re-homed onto the function | `08743dd04` |
| 12 | `theRecordIsUnflagged` pins the *mount*, not the file's whole text | `f815e4a60` |
| 13 | The story card prints its publish date beside the read time (`AUG 25 · 3 MIN READ`) | `f815e4a60` |

Minor 7 is narrower than the review's "set `[]`": emptying on a flaky read turns `YOUR HOUSE`
into `Start with a room` for a client whose designer is mid-project, which is a worse lie than
a stale room. Filtering to the current project ids closes the leak without that.

## MINORS NOT TAKEN

- **#1 · the top band now applies to 26 screens.** Three shots asked for before merge. Not
  taken here: it is a walk request against screens this lane did not change, and W1b ruling 1
  is what widened it. **Fable: assign to the walker.**
- **#8 · a guest is shown a `Studio` control.** The brief's DELIVER item 3 says the header
  carries the labelled Studio control with the attention count, with no tier caveat, and the
  guest's count is correctly absent. Left as built; the review itself calls it arguably
  intentional. **Fable's ruling.**
- **#14 · the ratio of source pins to behavioural tests.** Named for the record, no change
  requested. The fix round's own new tests are behavioural apart from four pins.
- **#15 · "You're matched with Leah Hartwell" three times at engaged.** Same ruling as
  `r2-notes` §4.3, wider. Not a code change without the ruling.

## Files touched outside R2's owned set, this round

| File | Change | Why |
|---|---|---|
| `Core/Persistence/LocalStoreReset.swift` | three lines in `wipeUserScopedData()` | B-1's durable half; unowned in W2, no other lane touches it |
| `Core/Persistence/RecordSnapshotStore.swift` (R1) | `remove()`, `hasSnapshot` | nothing could delete the snapshot |
| `Core/Persistence/LastSeenStore.swift` (R1) | `clear()` | nothing could forget the visit |
| `Core/Network/DecisionsAPIClient.swift` (R1) | `RemoteDesignerRef.personName` | MJ-A needs to know which field resolved |
| `Features/Profile/ViewModels/StudioQueueBuilder.swift` (R1) | `naming(…)`, `StudioQueueItemRow.designerIsPerson` | same |
| `Features/Home/Models/HouseRecord.swift` (R1) | `resolveDesigner`, `title(for:)` | same; R2 already owned this edit last round |

R1's lane is closed, so none of these can collide.

## Shots

Under `shots/`, ledger rows appended to `research/01-shot-ledger.md` § `w2-r2 · fix round`.
Simulator left booted, light, Dynamic Type medium, signed in as `client@patina.dev`.
