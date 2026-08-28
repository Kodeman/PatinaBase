# W4 · lane H2 — task list (what the app remembers)

Written by the H2 implementer before any edit, from `steward.md` §4 (owned files), the brief,
`source/build-plan.md` W4, `source/direction-b.md` §2/§3/§9/§10/§11 (M2, M4), `waves/w2/walk.md` §2,
`waves/w2/r2-notes.md` §4, `waves/w3/rulings-fable.md` #9.

Branch `daily-return/w4-h2`, worktree `.codex/worktrees/agent-dr-w4-h2`, base `1cb71c346`.
Simulator clone `dr-w4-h2` = `D6DACCE3-E865-4AB5-80FF-F7C49F16736F`.

Standing: both roots (flag-on `house-first` and flag-off) must render everything below; honesty
(C5) — a number drawn is a number stored, no decay deletes a fact; canonical names (C4); brand
voice (C6); pathspec commits; no push.

---

## T1 — The saved row carries its save date, its room, and a note

**Why.** B §3: "each row prints its **save date, room and note** (F197, F170)". B §10 refuses a
compare surface by name — the note is the cheapest half of deciding, and nothing more.

**Read first.** `Features/Collections/Views/CollectionsView.swift:262-318` (the All-items rows,
`ProductCard(style: .list)`), `Core/Models/TableItemModel.swift` (`savedAt`, `notes`, `roomId`
already exist), `Core/Persistence/RoomStore.swift` (`room(id:)`), `00055_saved_items.sql:29`
(`notes` column) and `:56` (owner UPDATE policy — no migration needed).

**Do.**
1. `Features/Collections/Views/SavedRowMeta.swift` (new, mine): a pure formatter
   `SavedRowMeta.line(savedAt:roomName:calendar:)` → `"Saved Aug 24 · Living Room"`, or
   `"Saved Aug 24"` with no room. Fixed `en_US_POSIX` locale, same rule as `HouseRecordDates`.
2. `CollectionsView`: each saved row draws the meta line under the card, and the note beneath it
   when one exists; a `Note` / `Add a note` control opens a plain sheet.
3. `Features/Collections/Views/SavedNoteSheet.swift` (new): one `TextEditor`, Cancel, Save. No
   comparison, no rating, no fields the row cannot print.
4. `Features/Collections/Services/SavedItemNoteMirror.swift` (new): local-first — write
   `TableItemModel.notes` and save the context, then best-effort PATCH
   `saved_items?user_id=eq.<me>&product_id=eq.<pid>` `{notes}` through the Supabase SDK. Never
   blocks the sheet; a failure leaves the local note standing.

**Not doing.** No change to `RemoteSavedItem` (H1's `Core/Network/RoomsAPIClient.swift`,
`steward.md` §4a) — the pull-down of a note written on another device is filed in `h2-notes.md`
instead of reached for across the lane line.

**Tests** (`PatinaTests/SavedRowMetaTests.swift`, new): date + room; date alone; the note is
carried on the model and survives a re-read; the sheet's trim turns whitespace into no note.

## T2 — The two 14-day decays come out

**Why.** Brief: "a matched request stays visible until it resolves (the dismissal only collapses
the card for that session)". B §1/§2 and `HouseRecord.swift:255-262` already name this as the
program's decay removal.

**Read first.** `Services/DesignServices/DesignRequestStatusService.swift:342-361`
(`isVisibleForPromotion`), `:97-103` (`isMatched` / `isTerminalOrMatched`), `:475-500` (`dismiss`),
`Core/State/DesignerRelationship.swift:70-75` (the comment that documents the same window).

**Do.**
1. `isVisibleForPromotion`: a **matched** stage is always visible — no window, and no persisted
   dismissal can hide it. Terminal (`closed`/`expired`) keeps the 14-day window and the permanent
   dismissal; other non-terminal stages keep today's "reappears when the stage advances" rule.
2. `dismiss(_:)`: a matched request's dismissal is recorded in memory only
   (`sessionDismissedLeadIds`), never on the SwiftData receipt — it collapses the card for the
   session and is gone at the next launch. Every other stage persists exactly as today.
3. `promotedRequest` filters the session set.
4. `DesignerRelationship.swift`: the comment is re-pointed at the new rule (the resolver already
   reads `liveLead`, so its behaviour does not change).

**Tests** (`PatinaTests/DesignRequestPromotionDecayTests.swift`, new): a matched request 400 days
past its stage anchor is still promoted; a matched dismissal hides it now and not after a rebuild
from the receipt; a closed request past 14 days is not promoted; a `finding` dismissal still
survives a relaunch and still reappears when the stage advances.

## T3 — The project timeline

**Why.** F76/F125 — the detail fetches `project_phases` and prints them as a flat list with no
sense of where the project is. B §2's table calls a phase change "not yet" honest *until the
detail gives it a destination*.

**Read first.** `Features/Projects/Views/ProjectDetailView.swift:150-208` (`phasesSection`,
`phaseRow`, `phaseColor`), `ViewModels/ProjectsViewModel.swift:56-60` (`listPhases` already ordered
`sort_order.asc,start_date.asc`), `Core/Network/ProjectsAPIClient.swift:88-98`
(`RemoteProjectPhase`), `Features/Projects/ProjectDetailCopy.swift`, `Core/Models/PhaseDisplay.swift`.

**Do.**
1. `ProjectDetailCopy`: `currentPhaseId(phases:currentPhaseKey:)` — the phase whose `phase_key`
   matches `projects.current_phase`, else the single `in_progress` one, else none. Pure, testable,
   and it never guesses when the server says nothing.
2. `ProjectDetailView.phasesSection` becomes a vertical timeline: a connecting rail between the
   dots (drawn between rows, not past the last one), the current phase marked — filled dot,
   emphasised name, and a `CURRENT` mono label. Dates print only where `start_date`/`end_date`
   exist. No invented phase, no progress percentage, no completion count.

**Tests** (`PatinaTests/ProjectTimelineTests.swift`, new): the current phase is the one
`current_phase` names; falls back to the single `in_progress`; none when neither exists and none
when two rows claim `in_progress`; order is the server's.

## T4 — The seat picks the project the record is about

**Why.** `waves/w2/walk.md` §2: the seat printed `Birch Hollow` while every NEEDS YOU row belonged
to `Aspen Loft Refresh`, because `DesignerSeat.make` takes `projects.first` and the list is ordered
`updated_at.desc`. `r2-notes.md` §4.3: at engaged the seat's line repeats the Next Move verbatim.

**Read first.** `Features/Home/Views/YourDesignerSeat.swift:41-76`,
`Features/Home/Views/DailyRoomView.swift:185-186` and `:245-256` and `:420-446`,
`Features/Home/Models/HouseRecord.swift:21-70` (`HouseRecordRow.route` is the only project handle a
row carries), `Services/Badges/BadgeCountService.swift:56-60` (`pendingDecisions`,
`pendingProposals`, `payableInvoices`, `projects` — all three DTOs carry `project_id`).

**Do.**
1. `DesignerSeat.make(liveLead:projects:record:badges-collections:nextMoveDetail:)` — the project
   is the one carrying the record's **first** NEEDS YOU row (its `route` resolves to a decision /
   proposal / invoice id, and that row carries `project_id`), else today's most-recently-updated
   active project. `HouseRecord.swift` is frozen and is only read.
2. When the seat's line would read exactly what the Next Move already prints, the seat names the
   studio and the stage instead (`Hartwell Studio · Designer matched`, or the stage alone where no
   studio is known). Two facts, not the same sentence twice.
3. `DailyRoomView` passes the record, the three collections and the Next Move's detail.

**Tests** (extend `PatinaTests/DesignerSeatTests.swift`): the NEEDS YOU project wins over the
newer `updated_at`; the fallback still picks the newest active project; an unresolvable row falls
back rather than drawing nothing; the engaged duplicate is replaced by studio · stage; with no
studio the stage stands alone; `projectId` follows the pick, so `Message` opens that project.

## T5 — The story's publish date is on the story

**Why.** W2 carry-over 3 (`build-plan.md` W2 — DONE): the chip needs `DailyStory.publishedAt`.
`DailyStoryCard.swift:19-26` already draws `AUG 25 · 4 MIN`; the value reaches it only through
`DailyRoomViewModel.todayStoryPublishedAt`, a parallel row the view model must keep.

**Do.** `Core/Models/DailyStory.swift`: `publishedAt: Date?`, decoded in
`init(from remote:isUnread:)` via `ISO8601DateParsing.dateOrDay`. `DailyStoryCard` falls back to
`story.publishedAt` when the caller passes none — never an invented date.

**Tests** (`PatinaTests/StoryPublishDateTests.swift`, new): a timestamptz decodes; a bare
`yyyy-MM-dd` decodes; a missing/blank one is nil and the label is the read time alone.

## T6 — `profiles.last_seen_at` mirror

**Why.** B §3's last row: the local stamp plus a server mirror, "the second device needs it before
the widget does". 00537 §2 added the column and nothing writes it.

**Read first.** `Core/Persistence/LastSeenStore.swift` (frozen), `Features/Home/ViewModels/
RecordRefresh.swift:99` (frozen — where `markSeen` is stamped; `HomeCompositionTests:227` pins
that), `Services/Auth/ProfileService.swift`, `00013_profiles_table.sql:62` (owner UPDATE policy).

**Do.** `ProfileService.mirrorLastSeenIfNeeded()` — one PATCH on the caller's own `profiles` row,
fired from `DailyRoomView` after the record refresh that stamps the visit (both the launch `.task`
and the `scenePhase == .active` branch, so both roots are covered). Guarded by a watermark so a
re-render is not a write; guests and a nil stamp write nothing; every failure is swallowed.

**Tests** (`PatinaTests/LastSeenMirrorTests.swift`, new): a first stamp is due; the same stamp
twice is not; a later stamp is; nil is never due; the watermark key is the pinned one.

## T7 — A guest stays a guest across relaunches (W3 ruling 9)

**Why.** `waves/w3/rulings-fable.md` #9: "A guest who chose 'Look around first' stays a guest
across relaunches until they sign in or clear the app; SP-06's ownership rule is unchanged."

**Read first.** `App/Coordinators/AppCoordinator.swift:87` (`guestModeOptIn`, stored, `= false`),
`:230-231` (cleared when a session appears), `:259` (`derivePhase`), `ContentView.swift:55` (the
setter), `Features/Authentication/Views/AuthScreenView.swift:95-120` ("Look around first"),
`Services/Auth/AuthService.swift:79-150` (the auth-state listener).

**Do.**
1. `Services/Auth/GuestSessionStore.swift` (new): `patina.guest.optedIn` in `UserDefaults`,
   `isOptedIn` / `optIn()` / `clear()`.
2. `AuthScreenView`: the "Look around first" button records the opt-in before calling
   `onBrowseAsGuest` — the choice is the reader's, so it is stored where the reader makes it.
3. `AuthService`: the listener clears the store whenever a session with a user arrives and on
   `.signedOut` — signing in ends the guest session, and signing out restores the gate. A
   `.initialSession` with no session clears nothing, which is what makes the restore work.
4. `AppCoordinator.swift:87` — **one line, in a frozen file**: the property's initial value becomes
   `GuestSessionStore.shared.isOptedIn`. It stays a stored `@Observable` property, so the phase
   observation loop is unchanged. Filed in `h2-notes.md` as a file touched outside the owned set.

**Not doing.** SP-06's local-store ownership rule (`AuthService.shouldWipeLocalStore`) is not
touched.

**Tests** (`PatinaTests/GuestSessionTests.swift`, new): opt-in survives a fresh store; clear
returns the gate; a fresh install is not a guest; the key is the pinned one.

---

## Gate

Foreground, unsandboxed, `-derivedDataPath .build/dd`:

1. `apps/mobile/Patina/scripts/ios-gate.sh build` (twice if the first is a bare `** BUILD FAILED **`).
2. `xcodebuild test -project … -scheme Patina -configuration Debug -destination
   'platform=iOS Simulator,id=D6DACCE3-E865-4AB5-80FF-F7C49F16736F' -derivedDataPath
   /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-h2/.build/dd -only-testing:PatinaTests`
   — the whole tier green, not only the new suites.
3. SIM CHECK on `dr-w4-h2` with `-DeploymentTarget local`, with and without `-PatinaFlags
   house-first`; shots `shots/w4-h2-NN-*.png`; ledger rows under `## w4-h2`.

No `ios-gate.sh all`, no `lint-delta` (steward-only).
