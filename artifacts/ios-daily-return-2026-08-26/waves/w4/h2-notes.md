# W4 · lane H2 — integration notes (what the app remembers)

Written by the H2 implementer. Everything below is either a change **outside** the brief's owned-file
map, a deviation from its literal text, or a fact the integration steward or Fable needs.

**Branch** `daily-return/w4-h2`, worktree `.codex/worktrees/agent-dr-w4-h2`, base `1cb71c346`.
7 commits, `e4b4ca056` → `293a1f5ec`. Not pushed.

---

## 1. Files touched outside H2's owned set — each named, with why

| File | Change | Why it had to happen here |
|---|---|---|
| `Patina/App/Coordinators/AppCoordinator.swift` (**FROZEN**, `steward.md` §4) | **One line**: `public var guestModeOptIn: Bool = GuestSessionStore.shared.isOptedIn` (was `= false`), plus the doc comment above it | W3 ruling 9 is assigned to H2, and the brief grants only `Services/Auth/**` and `Features/Authentication/**` for it. The choice can be *recorded* there and *cleared* there, but the restore has to be the coordinator's initial value — nothing else decides the launch phase (`derivePhase()`, `:259`). It stays a **stored** `@Observable` property, so `observePhaseInputs()`'s `withObservationTracking` read is unchanged, and the three existing writers (`ContentView.swift:55`, `AppCoordinator:231`, `DeepLinkHandler:161`) work untouched. **If the steward would rather this line came from someone else, it is a one-line revert plus a one-line re-apply.** |
| `PatinaTests/EngagementTierTests.swift` (not in H2's granted suite list) | `designHelpOpensARequestOlderThanThePromotionWindow` → `designHelpOpensARequestTheCardIsNotShowing`; the fixture helper gains `dismissedAtStage:` | The test's premise was `!longMatched.isVisibleForPromotion()` on a 30-day-old match — which W4 deliberately makes false. Its *guarantee* (the Design-help guard reads `openRequest`, never the display value) is preserved by re-pointing it at a dismissal at an in-progress stage, where the card is still hidden. Leaving it would have left the tier red. |

| `Patina/Features/Authentication/Views/AuthScreenView.swift` (**not in the map** — §4 grants H2 `Services/Auth/**` only) | Three lines: the `Look around first` button records the choice via `GuestSessionStore.shared.optIn()` before calling `onBrowseAsGuest` | W3 ruling 9 has to be recorded where the reader makes the choice. The brief's wording ("`Services/Auth/**` and `Features/Authentication/**` are yours for this item") is the brief's, not the steward's — this file was under-reported in the first pass and is named here on the reviewer's finding M8. No other W4 lane owns it; a three-line revert. |
| `Patina/Core/Network/ProjectsAPIClient.swift` (**not in the map**, though `ProjectsAPIClientTests` is H2's) | `RemoteProjectPhase.phase_key` `String` → `String?`; `end_date` → `target_end_date` | **Deliverable (3) could not render at all without it.** `phase_key` is nullable and null on most seeded rows; declared non-optional, one null failed the decode of the whole array, so `listPhases` threw and every project reported "Your designer is still putting the phases together" while its rows sat on the wire. And there is no `end_date` column — it is `target_end_date` — so the second date decoded nil on every row. Both verified against the live database and the live app. All call sites are H2's. No other W4 lane owns the file; a two-line revert. |

Everything else is inside the map. `HouseRecord.swift`, `TodayExperience.swift`, `RecordRefresh.swift`,
`LastSeenStore.swift`, `DailyRoomViewModel.swift` and `StudioQueueBuilder.swift` were **read only**.

**Four files outside the map, then, not two** — `AppCoordinator.swift` (frozen),
`EngagementTierTests.swift`, `AuthScreenView.swift`, `ProjectsAPIClient.swift`. All four want the
steward's ratification; each is named above with its revert.

## 2. Deviations from the brief's literal text

1. **"the two 14-day decays removed" is one file, not two.** `Core/State/DesignerRelationship.swift`
   (`steward.md` §4, "Decay 2") only *documents* the window at `:70-75` — W1a already switched the
   resolver to `liveLead`, so no decay lives in it. The behavioural change is entirely in
   `DesignRequestStatusService.isVisibleForPromotion`, which carried both halves: the 14-day window
   **and** the permanent dismissal at a stage that never advances. Both are out. The comment is
   re-pointed at the new rule.
2. **A terminal request keeps its 14-day window.** The brief and C5 say a *matched* request stays
   until it resolves; `closed`/`expired` **is** resolved, and a resolved request ageing off the card
   after two weeks deletes no fact. Flagged rather than silently widened.
3. **`isTerminalOrMatched` is retired**, not left in place. Its only job was to name the set the
   window covered, and its doc comment would have been false. Three assertions in
   `DesignRequestStageTests` (H2's suite) move to `isMatched`.
4. **The de-duplication compares against the Next Move's `detail`, not its title.** At engaged the
   Next Move's *title* is "See your design request"; the sentence the seat was repeating is the
   `detail` (`TodayExperience.swift:89-97`, the promoted request's `cardTitle`). The seat's
   substitute is `<studio> · <stage>` — `Hartwell Studio · Designer matched` — or the stage alone
   where no studio is known.
5. **`liveProject` follows the same pick as the seat** (`DailyRoomView.swift`). `steward.md` §4 calls
   this "the second half of the same carry-over"; without it "See where Birch Hollow stands" would
   sit above a record full of Aspen Loft Refresh rows — the seat's W2 defect in the Next Move's
   clothes.
6. **The publish-date chip was already drawn**, from `DailyRoomViewModel.todayStoryPublishedAt` over
   the retained raw row. H2 added what W2's carry-over actually asked for — `DailyStory.publishedAt`
   — and made the card fall back to it, so the date travels with the story instead of with a
   parallel row a frozen view model has to keep.

## 3. The predicted cross-lane need (`steward.md` §4a) — **not** taken

`RemoteSavedItem` still does not decode `notes` or `price_cents_at_save`; `RoomsAPIClient.swift` is
H1's and H2 did not touch it. The note is **local-first on `TableItemModel.notes`** and mirrored up
by `Features/Collections/Services/SavedItemNoteMirror.swift` (H2's own file, the Supabase SDK, the
same pattern `ProfileService` already uses). What this costs: a note written on device A does not
appear on device B, because the reconcile in `CollectionsViewModel` cannot read `notes` back.

**For Fable / the steward:** adding `notes` to `RemoteSavedItem` and carrying it into the reconcile's
`TableItemModel(...)` is a two-line change in H1's file. Worth doing at integration; it is not a
blocker for anything in this wave.

## 3a. FIX ROUND — §4 and §5 below are superseded; see `h2-fix-log.md`

The harness condition in §5 was **not** a keychain trap. `ios-gate.sh build` passes
`CODE_SIGNING_ALLOWED=NO` (`scripts/ios-gate.sh:54`), so the installed `.app` carried **no
entitlements at all** and the Supabase SDK's keychain session store never persisted — the recorded
`feedback_ios_sim_walk_harness` rule ("never install `CODE_SIGNING_ALLOWED=NO` builds for walks"),
hit in full. A plain `xcodebuild build … -derivedDataPath .build/dd` produces an app whose session
survives sign-in, relaunch and reinstall. Everything §4 called unverifiable is now shot:
`w4-h2-10`…`w4-h2-13`, plus `profiles.last_seen_at` written by the app itself.

**Still open for Fable or another lane** (carried forward, and new):

1. **The `profiles` SELECT policy** (reviewer M6). `00013_profiles_table.sql:57-58` is
   `FOR SELECT USING (true)`, and this lane is the **first writer** of `last_seen_at` (00537 added
   the column and nothing filled it). From the first foreground, any authenticated reader of
   `profiles` can see when a given homeowner last opened the app. B §3 asks for the mirror and
   00537 designed the column, so this is not a code defect — but nobody has ruled on the surface.
   If the answer is "the client and their own designer", it wants a narrowed SELECT in **D's**
   lane before this reaches anyone.
2. **The saved-items reconcile has a second gate nobody has named.** It returns early unless the
   **local** SwiftData store already holds rooms carrying a `remoteId`
   (`CollectionsViewModel:64`). On the walk, signed in, Profile read `Rooms: 0` while Today drew
   two server rooms — so no `saved_items` pull could happen at all, and the date-and-room line
   (B1/M1, both fixed and unit-proven) has no live shot. Pre-existing, and the room-sync path is
   H1's ground.
3. **`RemoteSavedItem` still does not decode `notes`** (`steward.md` §4a). Unchanged from §3
   above: a note written on device A does not appear on device B. Two lines in H1's file.
4. The flag-off first-launch tour still reads `Step 1 of 2` while declaring three, and Sanity still
   serves "Daily Room" (W3 rulings 4 and 5, both OWED elsewhere). Not H2's.
5. **The M5 ruling is a ruling.** `currentPhaseId` now declines to mark a `current_phase` whose own
   row says `completed`. Reasoning in the fix log; a two-line revert if Fable prefers stated
   precedence in copy.

## 4. Open, for Fable — *as filed in the first pass; superseded by §3a*

1. **The W4 walker cannot verify the two mirrors on a simulator whose session went anon.** See §5 —
   this is a harness condition, and it is the reason `w4-h2-05`…`w4-h2-08` show a client with no
   projects and no NEEDS YOU rows.
2. **The seat's Record-driven pick has no sim evidence**, for the same reason: with `/rest/v1/projects`
   returning `[]`, there is no project to seat and no NEEDS YOU row to follow. It is unit-proven
   (`DesignerSeatTests`, six new cases) and compile-green. **The walker should re-check it on a
   simulator with a live session** — `client@patina.dev` has three projects and six pending decisions
   in the local DB, so the case is there to see.
3. **Same for the project timeline** — `ProjectDetailView` cannot load a project on an anon session.
   Unit-proven (`ProjectTimelineTests`) and compile-green; owed a walk.
4. `saved_items` is **empty** in the local database (`select count(*) → 0`), so no seeded save
   carries a room. Every saved row H2 could reach was made from Browse, which writes no `room_id`
   (nullable since 00055:23) — the shots therefore show `Saved Aug 28` with no room. The room half of
   the line is unit-proven, not shot. If D or the walker wants it on screen, a save made **from a
   room** is the path.
5. The flag-off first-launch tour still reads `Step 1 of 2` while declaring three, and Sanity still
   serves "Daily Room" (W3 rulings 4 and 5, both OWED elsewhere). Visible in `w4-h2-02`; not H2's.

## 5. The harness condition, stated plainly

On the `dr-w4-h2` clone the app's PostgREST traffic goes out **unauthenticated** after a password
sign-in, even though the UI is signed in and `AuthService` reports a session. Proven, not inferred:

```
# the app's own request, from the Kong access log
"GET /rest/v1/projects?select=*,designer:profiles!…&order=updated_at.desc" 200 2   ← "[]"
"PATCH /rest/v1/profiles?id=eq.A0000000-…-005"                             200 2

# the same reads, with a real client JWT
$ curl …/rest/v1/projects?select=id,name -H "Authorization: Bearer $JWT"
[{"Birch Hollow"},{"Marrow & Vale Residence"},{"Aspen Loft Refresh"}]
$ curl … -H "apikey: $ANON"            → []

# the exact PATCH the mirror emits, with that JWT
PATCH status 204 → profiles.last_seen_at = "2026-08-28T11:18:55+00:00"   (reset to NULL afterwards)
```

So the mirror's URL, payload, column and RLS path are all correct, and the PATCH is emitted at the
right moment (observed on the wire on every foreground). It updates **zero rows** for exactly the
reason `/projects` returns `[]`: the session's requests carry no user JWT, and RLS filters the row
out — PostgREST answers 200 either way, which is why nothing throws.

A `xcrun simctl keychain <udid> reset` + reinstall + password sign-in (the ledger's own recipe) did
not clear it. This matches the recorded `securityd -34018` / keychain trap
(`feedback_ios_device_automation_traps_2026_08_25`, `research/02-steward-boot.md`): the SDK's
`auth.session` read fails, and the clients that depend on it go anon. It affects the pre-existing
`ProjectsAPIClient`/`DecisionsAPIClient` reads identically, so it is **not** something this lane
introduced — but it does mean **no server-side claim in this lane is sim-verified**.

## 6. What H2 did NOT touch

`HouseRecord.swift`, `TodayExperience.swift`, `HouseRecordCard.swift`, `NewThisWeekRail.swift`,
`DailyGreetingHeader.swift`, `TodayModules.swift`, `DailyRoomViewModel.swift`, `RecordRefresh.swift`,
`RecordOwner.swift`, `RecordSnapshotStore.swift`, `LastSeenStore.swift`, `BadgeCountService.swift`,
`Features/Companion/**`, `ContentView.swift`, `RouteTabTable`, `PatinaTabBar`, `Features/Profile/**`,
`Features/{Proposals,Invoices,Budget,Decisions}/**`, `Patina.entitlements`, `project.pbxproj`
(no edit needed — `PBXFileSystemSynchronizedRootGroup` picks up the four new `Patina/` files and the
six new suites), `Core/Network/RoomsAPIClient.swift`, `Core/Models/RoomModel.swift`, any migration,
any seed. No `ios-gate.sh all`, no `lint-delta`.
