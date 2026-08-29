# W6 · X3 — notes (the singleton enumeration, and two files outside the brief's list)

## 1. The grep, and the ruling on every hit

```
$ grep -rn "static let shared" apps/mobile/Patina/Patina --include="*.swift" | wc -l
      73
```

72 of those are a singleton; the 73rd is
`Features/Walk/Services/RoomCaptureService+Instrument.swift:180`'s
`private static let sharedRoomCaptureConfigLabel`, which is a string. The test pins on
`"static let shared "` — with the trailing space — so the label does not match.

**All 72 are ruled on, and `SessionIsolationTests.theListIsTheWholeList` fails if a 73rd appears**
that is neither a participant nor carries a written reason. That test walks the tree with
`SourcePin.swiftFiles(under: "Patina")` rather than a hard-coded list, so the enumeration cannot
quietly go stale.

### Participants — 11

| Holder | What it was holding for the previous account | Reset declared in |
|---|---|---|
| `BadgeCountService` | `projects`, `roster`, `pendingDecisions`, `pendingProposals`, `payableInvoices`, `threadSummaries` + the five counts + `hasLoaded` / `projectsLoaded` / `lastRefreshFailed` | its own file (state is `private(set)`) |
| `DesignRequestStatusService` | `requests` — and therefore `liveLead`, which is what R3's pre-emption and the thread opener read — plus `sessionDismissedLeadIds` | its own file |
| `OrdersService` | `orders`, `terms` | its own file |
| `StudioHubViewModel` | the whole Studio `snapshot` | its own file |
| `SettingsService` | the two server-backed preference toggles | its own file |
| `ProfileService` | `currentProfile`, `roles` | `clear()` |
| `RoomSelectionStore` | the selected room | `clear()` |
| `NotificationManager` | the Companion notification queue | `clearAll()` |
| `RoomSyncCoordinator` | the 30-second debounce (`lastOwner` / `lastRunAt`) | `forget()` |
| `CompanionService` | `conversationHistory` — the client's own words | `clearHistory()` |
| `PieceActChannel` | `currentAct`, which carries the resolved designer relationship | `publish(nil)` |

### Excluded — 61, by category

- **17 network clients** (`*APIClient`, `SupabaseClient`, `SanityHelpClient`, `DailyRoomAPI`):
  configuration and a session; every row they return is held by a caller, not here.
- **2 id-keyed caches** (`StudioIdentityService`, `ProfileLookupService`): keyed by the id of the
  thing they describe. A designer's display name is the same fact for whoever is signed in.
- **10 disk / owner-keyed stores** (`PersistenceController`, `RecordSnapshotStore`, `LastSeenStore`,
  `RecordOwner`, `ContextMemoryStore`, `ConversationStorageService`, `StyleProfileStore`,
  `FirstLaunchDataStore`, `firstLaunchTourState`, `UserDefaultsBacked`): `LocalStoreReset` runs on
  the same seam for the account-change case, and the two App Group artefacts are refused by
  `RecordOwnerStamp` when they belong to someone else. **One gap named below.**
- **8 scan-pipeline services**: their rows are SwiftData, wiped by `LocalStoreReset`; what is in
  memory is queue mechanics and file bookkeeping.
- **10 analytics**: `PostHogService.reset()` already runs on `.signedOut`; the rest count screens.
- **10 transient flow services**: alive for one flow (QR, biometrics, camera permission, deletion,
  design-services submission, voice, intent, haptics, push-token registration, deep-link handler).
- **4 individually**: `AuthService` is the seam itself; `GuestSessionStore` is already cleared on
  every real session; `LocalStoreClaim` drives the SP-06 claim sheet **across** this boundary and
  must survive it; `FeatureFlags` is a device answer resolved once per launch.

### The one gap this lane found and did not close

`StyleProfileStore` keeps the taste portrait in `UserDefaults.standard` under
`patina.style_profile_response.v1` / `patina.style_profile_completed.v1`, and **neither key is
account-scoped**. `LocalStoreReset.wipeUserScopedData()` deletes the SwiftData
`StylePreferenceModel` rows on an account change but not these two keys, so a second account on the
same phone inherits the first account's `hasCompletedProfile` and its saved response. It is disk,
not an in-memory cache, so it belongs with `LocalStoreReset` — which is **shared, and neither
lane's to edit** (`steward.md` §8). Filed for Fable rather than fixed here.

## 2. Two files edited that the brief's owned list does not name

`steward.md` trap 13 says this work "lives in `Services/Badges/`, `Services/DesignServices/` and
`Features/Purchase/`, which neither X1 nor X2 owns", and §8's two owned-file tables confirm it: X1
holds `PatinaWidget/**`, `project.pbxproj`, `App/**`, `Features/Navigation/**`; X2 holds
`Core/Persistence/RecordSnapshotStore.swift`, `Core/State/FeatureFlags.swift`,
`Features/Invoices/**`, `Services/Notifications/**`. **No file this lane wrote is in either table.**

Two of them are still outside the brief's own list, because their state is `private(set)` and only
the declaring file can write it:

- `Features/Profile/ViewModels/StudioHubViewModel.swift` — `resetForSessionChange()`, 6 lines.
  Deliberately not `resetForGuest()`, which leaves `hasLoaded` **true**: correct for a guest with
  nothing to load, wrong here, where it would stop `loadIfNeeded()` ever asking for the new
  account's rows.
- `Services/Settings/SettingsService.swift` — `resetForSessionChange()`, 5 lines. Both toggles are
  `user_settings` / notification-preference rows keyed on `user_id`; leaving them standing shows one
  person's choice to the next, and a write from the new account's Settings screen would save a value
  it never chose.

Nine other participants needed no edit to their own file at all — the conformance is an extension
in `SessionScope.swift` over a clearing method they already had.

## 3. Where the reset sits, and why there

`AuthService.startAuthStateListener`, immediately after `self.session = session` and **before**
`Self.settleLocalStore(for:)` — which kicks `RoomSyncCoordinator.reconcileSharedStore()` — and
before the profile-hydration block. Both of those are "the new account's first fetch"; a reset after
either would clear rows that had just been re-fetched, or leave the debounce claiming this account's
rooms were already mirrored. `SessionIsolationTests.theResetPrecedesTheFirstFetch` pins the ordering
at the source.

`SessionScope.refresh()` runs after the event switch, and asks **only** `BadgeCountService` and
`DesignRequestStatusService` for the new account's rows. Those two are the ones with no load gate —
`DesignerThreadOpener` reads them straight out of a view body with nothing to trigger a fetch first.
`OrdersService` and `StudioHubViewModel` are deliberately **not** re-fetched here: their `hasLoaded`
gates were just cleared, so their own `refreshIfNeeded()` / `loadIfNeeded()` fetch on the next
appear, and firing seven Studio reads at every cold launch to save that is a Today-path cost this
wave was not asked to spend (the shape W5's MI-5 was flagged for).

## 4. The project rule — one difference from the seat, stated

`DesignerRelationshipResolver.activeProject(in:record:decisions:proposals:invoices:)` calls
`DesignerSeat.urgentProjectId(…)` rather than copying it: two spellings of "which project is the
house waiting on" is exactly how the seat and the thread came apart.

It applies that pick **inside** the designer-bearing active set, where the seat applies it over all
active projects. The seat may end up naming no project and speaking for the lead instead; this
resolver may not, because `.none` is the relationship that **draws Buy**. A client whose urgent
project has no `designer_id` yet must still resolve `.project` on one that does, or R3's pre-emption
silently comes off for them. Pinned by
`DesignerProjectRuleTests.theUrgentProjectWithoutADesignerDoesNotUnsetTheRelationship`. Where the
urgent project does carry a designer — the walk's case, and every real one — the two agree exactly,
which `theSeatAndTheThreadAgree` asserts against both functions in one test.

`DesignerThreadOpener` reads the record from `RecordSnapshotStore.shared.load()` on each ask, gated
by `RecordIdentity.decide(...) == .paint` so a foreign snapshot is never read. Deliberately
**`decide`, not `admits`**: `admits` deletes the snapshot on a mismatch, and that is `RecordRefresh`'s
decision to make, not a thread opener's. Deliberately **not cached**: a cache here would be one more
thing that survives an account change, which is the bug this lane exists to close.

Two other `resolve(…)` call sites — `DecisionsViewModel.messageRoute` and `CompanionOverlay`'s
context — were left alone and compile unchanged on the defaulted parameters. Neither can diverge:
the first reads only `designerId` (its project comes from the decision itself), the second only
`isLive` (`CompanionAreaBuilders.swift:31` is the sole consumer).

---

# W6 · X3 (resumed) — what the second agent kept, rewrote and added

The first X3 agent died on a server error with the lane **uncommitted and never built**: 8 modified
files, 3 new ones, a held lock, and no `xcodebuild` run of any kind (`integration.md` §1). This
section is the resumed agent's, on the same worktree and branch.

## 5. The prior work, file by file — kept or rewritten

**Kept as written (read in full, then built and tested for the first time):**

| File | Verdict |
|---|---|
| `Core/State/SessionScope.swift` | kept — the protocol, the 11 participants, the two conformance styles, `refresh()`'s two-service choice |
| `Services/Auth/AuthService.swift` | kept — `settledUserId` + `isAccountChange` + the reset above `settleLocalStore`, `refresh()` after the event switch |
| `Services/Badges/BadgeCountService.swift`, `Services/DesignServices/DesignRequestStatusService.swift`, `Features/Orders/ViewModels/OrdersService.swift`, `Features/Profile/ViewModels/StudioHubViewModel.swift`, `Services/Settings/SettingsService.swift` | kept — the five in-file resets |
| `Core/State/DesignerRelationship.swift` | kept — `activeProject(in:record:…)` calling `DesignerSeat.urgentProjectId` rather than copying it |
| `Features/Messaging/DesignerThreadOpener.swift` | kept — `admittedRecord()` via `RecordIdentity.decide`, read per ask |
| `PatinaTests/SessionIsolationTests.swift`, `PatinaTests/DesignerProjectRuleTests.swift` | kept — 20 tests, all green on their first ever run |

**Rewritten: nothing.** The prior work compiled unchanged and its suites passed on the first run.
The only edit to a file it had touched is the one the new work forced (below).

## 6. Added: the foreground trigger moves to the app root (`integration.md` §6.2)

`RecordSnapshotStore.save` is what reloads the widget's timeline (X2), and the only thing that
reached it was `DailyRoomView`'s own `.onChange(of: scenePhase)` — so a foreground from Studio,
Spaces or Pieces rebuilt nothing.

- **New `Features/Home/ViewModels/RecordForeground.swift`** — one entry point for a rebuild.
  `onForeground()` (badges → requests → story → rebuild) is called from `PatinaApp`'s existing
  `scenePhase` `.active` branch; `run(context:story:paint:)` is what `DailyRoomViewModel
  .refreshRecord()` now calls. The build closure, the saved-items fetch and the withdrawn-inclusive
  product read moved here from the view model, so there is **one** spelling of what a rebuild is.
- **Overlapping asks coalesce.** Foregrounding *onto* Today means the root asks and Today asks. A
  second rebuild would build against the visit stamp the first had just written and take every
  row's `isNew` tick off on the open that should have shown them — so `coalesce` runs the first ask
  and hands its record to the joiner, whose `paint` is then called with it.
- **SP-18's story pick moved with it** (`RecordForeground.todaysStoryRow()`), because the root has
  no story row of its own to hand over and a rebuild without one would silently drop the record's
  MOVED story row. `refreshTodaysStory()` now reads the same function, so the card and the row
  cannot name two different stories.
- **`RecordIdentityTests.thePaintPathIsScoped` was updated, not weakened**: it pinned
  `sessionUserId: AuthService.shared.currentUserId` inside `DailyRoomViewModel`, and that line moved
  to `RecordForeground`. The test now reads both files and still asserts both facts.
- New `PatinaTests/RecordForegroundTests.swift`: the coalescing behaviour (two concurrent asks → one
  rebuild), that a later ask is not suppressed, and SourcePins that the root's `.active` branch
  calls `RecordForeground.onForeground(` and that Today's rebuild goes through the same entry point
  (and that no second `RecordRefresh.run` call site remains in the view model).

## 7. What the simulator proved, and what it could not

Device **`dr-w6-x3r` `7AB6C26E-3D2A-4323-AA71-49FA34B0C52E`** (created for this lane, iPhone 17 Pro /
iOS 26.5), signed `.app` from the `xcodebuild test` products (never `CODE_SIGNING_ALLOWED=NO`),
`-DeploymentTarget local`. Every frame `xcrun simctl io … screenshot`; no desktop capture.

**Proved:**

1. **The project rule, end to end.** Signed in as `client@patina.dev`, `Ask Leah to source this` →
   `Sent` / `Leah has the piece and the price.`, and the thread it opened is
   `32fdec87-…` on **`b0000000-…-d1` `Aspen Loft Refresh`** — the project the seat names and every
   NEEDS YOU row belongs to. W5's walk, on the same seed, landed on `Birch Hollow`
   (`3b5ab10b-…`, still in the table, still on `…-d3`). Both threads are visible in
   `w6-x3-04-client-threads.png`. **Weaker than it looks, and said so:** this seed's
   `Aspen Loft Refresh` now also carries the most recent `updated_at`, so `.first` would reach the
   same row today. The discriminating cases (urgent ≠ most-recent, urgent archived, urgent without a
   designer) are unit tests, not sim evidence.
2. **The foreground rebuild fires away from Today.** On the Studio → `Aspen Loft Refresh` screen,
   `house-record.json` was last written `20:38:18`; backgrounding (Safari) and returning rewrote it
   at `20:44:58`. Honest limit: on the flag-off root Studio is a *push over* Today, so Today's own
   hook is still mounted underneath — this is consistent with the root hook but does not isolate it.
   The isolation is the SourcePin + the coalescing test.
3. **Both roots render** — flag-on `Today · Spaces · Pieces · Studio · ≡` (`w6-x3-01-client-today.png`),
   flag-off the W2 root with the floating orb and the `Studio 5` pill (`w6-x3-03-flagoff-root.png`).
   The Record draws on both.

**BLOCKED — the account-switch leg.** Signing out of `client@patina.dev` and into
`james.okafor@example.com` inside one process could not be driven: **simulator input delivery died
mid-walk.** blitz `device_action` taps stopped registering (the app stayed at 0% CPU, screenshots
kept updating, so the app was idle, not hung); the program's `shots/_tap.sh` worked for a while and
then `System Events` began answering `Connection is invalid. (-609)` to every click; a device
`shutdown`/`boot` did not clear it. Per the global constraint ("if gestures stop delivering, stop and
report — do not improvise with desktop tooling") the walk stopped there.

Two things are worth recording for whoever retries:

- **`shots/_tap.sh` targets `window 1`, and with six booted simulators window 1 drifts.** It was the
  walker's review device at 20:49. When `_geom.sh` returns nothing the script still clicks — at raw
  screen coordinates. It did that twice here (`screen(63,159)` and `screen(768,1243)`) before the
  fault was caught; a name-resolving variant was used after that. **The script should refuse to
  click when it cannot resolve its window, and should resolve by device name.**
- The last attempt reached iOS's `Open in "Patina"?` confirmation for a `patina://auth/callback`
  URL (a real GoTrue session for James, minted through the local password grant and handed to the
  app's own deep-link path — the in-process A→B case). The alert needs one tap, and that tap is what
  could not be delivered (`w6-x3-05-blocked-open-alert.png`).

So the session-isolation *seam* is compile-green + unit-verified (20 tests, including the ordering
pin and the participant-coverage pin), **not** sim-verified. That is the honest claim level.
