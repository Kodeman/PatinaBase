# W4 — fix-round review (role V, adversarial, read-only)

Reviewer, 2026-08-28. Separate context; no code written, no gate re-run, no simulator. Read
`waves/w4/{walk,integration,fix-tasks,h1-notes,h2-notes}.md`, `source/shared-planks.md` §SP-06 /
§SP-11 / §SP-14, and every one of the twelve commits
`b1ff6e458..99fea462e` on `daily-return/integration`
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-integration`), plus the surrounding
code each one lands in.

**Verdict: NOT a clean pass.** Eleven of the twelve commits do what they say. Two findings are
blocking: walk item 1's *named surface* — Today's house rail — still does not draw a newly mirrored
room within the session that mirrors it, and the new hydrate takes every room RLS will hand it
rather than the account's own. Three further findings are major. The DB half (00539 §2) is the
strongest work in the round and I found nothing wrong with it.

Every finding carries **severity** and **confidence**. Confidence is about the claim, not the fix.

---

## 1. What I verified as true

Recorded so the blocking items are read against a fair picture of the round.

- **Scope is clean.** `git diff --stat b1ff6e458 99fea462e` touches 42 files, every one inside the
  three walk failures, `integration.md` §6's ruled items, or the two unplanned finds. No unrelated
  change, no drive-by refactor, no file outside the fix's own subject. Twelve Conventional Commits,
  each pathspec-scoped to its own subject; branch is local only (`git branch --contains 99fea462e`
  → `daily-return/integration` alone); `main` untouched; tree clean; no `.writer.lock.d`.
- **The merge rules are right, and they are values.** `RoomMerge.plan` puts server-only ids in
  `insert`, a mirror whose `updatedAt` beats the server's `updated_at` in `keepLocal`, the reverse in
  `takeServer`, and every `remoteId == nil` room in `untouched` — SP-06 holds: a guest's room is
  neither adopted, uploaded, nor deleted. A mirror the server no longer has appears in **no** bucket,
  so a local room the server lacks is never deleted. `apply` re-reads `store.allRooms()` each pass and
  keys inserts on the lowercased `remoteId`, so it is idempotent and cannot duplicate by `remoteId`;
  `RoomSyncTests` proves both against a real in-memory `ModelContainer` rather than a mock.
  `RoomStore`'s local mutators all bump `updatedAt` (RoomModel.swift:325–473, RoomStore.swift:223–300),
  so "local newer" is a fact and not a hope.
- **Nothing blocks the UI.** Every call site is `.task` / a detached `Task`; a `listRooms` failure
  logs in DEBUG and returns, leaving the local store — the authority (SP-14) — untouched.
- **The account-isolation ordering is correct.** `AuthService.reconcileLocalStoreOwner` (wipe, then
  `LocalStoreClaim.askIfNeeded`) runs *synchronously* before the reconcile `Task` is spawned, so the
  claim sheet's `hasGuestWork` snapshot is taken before any mirrored row lands and a different account
  signing in wipes before it hydrates. (One consequence of this ordering is finding **B-5**.)
- **Add to Room writes all three places.** `TableItemModel.roomId`, the room's own `SavedItem`, and
  `saved_items.room_id` — plus a PATCH (`updateItemRoom`) for a row already mirrored roomless.
  `CollectionsViewModel.items(_:inRoom:)` is the tested filter the room-scoped Saved now reads, and
  `ProductDetailRoomSaveTests` drives `addToRoom` against a real container rather than asserting over
  a payload only.
- **The fit line's gate is honest.** `RoomFitLine.room(preferredLocalId:preferredRemoteId:in:)` —
  the room in context wins; an unmeasured room in context substitutes no other room (the case that
  would quote the Guest Bedroom's wall at somebody reading the Living Room); otherwise the most
  recently updated measured room. Six new cases including a `SourcePin` on the mount.
- **The `source` find is real and correctly fixed.** `saved_items.source` has carried
  `CHECK (source IN ('emergence','search','companion','extension'))` since
  `supabase/migrations/00055_saved_items.sql:32`; no later migration alters it (grepped). Both iOS
  paths sent `"ios"`. This is the round's most valuable catch — it explains an empty `saved_items` on
  every walk of the wave — and the test holds the payload against the column's own vocabulary rather
  than against a literal.
- **00539 §2 is sound.** I diffed the re-issued `purge_client_account` against 00538's body: exactly
  two changes — `public.profile_presence:user_id` added to `v_owned`, `last_seen_at = NULL` removed.
  Nothing else moved. Policies are `TO authenticated` and owner-keyed; the designer clause is two
  plain `EXISTS` over `leads`/`projects` already narrowed by `designer_id = auth.uid()`, so it cannot
  widen a read even if those tables' own RLS changed. The carry-across `INSERT … ON CONFLICT … GREATEST`
  runs before the `DROP COLUMN`. `profile_presence_test.sql` exercises owner read/insert/update, both
  designer-of-record paths, the unaccepted lead, an unrelated homeowner, and the designer's refused
  write — with real `SET LOCAL ROLE authenticated` + JWT claims, not a superuser shortcut.
  `grep -rn last_seen_at apps packages services supabase` leaves no live reader of the dropped column;
  `database.types.ts` and `00-legacy-grants.sql` are regenerated consistently.
- **The 00539 renumber question is settled correctly** — extended in place (unmerged, W5 holds 00540)
  and the file renamed so a security-shaped change is not hiding behind a note-shaped name.
- **The steward-boot correction is the right correction.** `seed/leads_room_scans.sql:15-26` does mint
  homeowner ids with `gen_random_uuid()`; §6(b) now carries the query and an explicit "do not quote
  this account's UUID". It sits uncommitted in the main checkout, as the brief requires.

---

## 2. Blocking

### B-1 · Walk item 1 is not closed on the surface the walk named
**Severity: blocking · Confidence: high (code-read; the round's own evidence does not contradict it —
it addresses a different screen).**

Walk item 1 is *"House rail shows the seeded typed room beside the two project rooms"*, and it failed
on Today. The fix's proof for item 1 is `w4-fix-01` — **Your Spaces**, and `w4-fix-02/03`, a room
surviving sign-out/sign-in. Your Spaces is `@Query(sort: \RoomModel.createdAt)`
(`YourSpacesView.swift:18`) and therefore live: an insert on the main context repaints it for free.

Today's rail is not. `HouseRoomCard.cards(projectRooms:localRooms:)` is fed from
`DailyRoomViewModel.roomModels`, and `roomModels` is a **snapshot** assigned inside
`DailyRoomViewModel.load()` (`:180`) from `RoomStore(context:).allRooms()`. `load()` runs in
`DailyRoomView`'s *first* `.task` (`:96-99`), synchronously, and thereafter only from
`.onChange(of: scenePhase == .active)` (`:147`). The new reconcile is a *later*, asynchronous `.task`
(`:120-125`), and the `.onChange(of: isAuthenticated)` chain (`:136-145`) calls
`reconcile → badges.refresh → refreshProjectRooms → refreshRecord` — **none of which re-reads
`roomModels`.** So the rooms the reconcile has just mirrored are in SwiftData and absent from the rail
until the app is backgrounded and foregrounded, or Today is torn down and rebuilt.

The debounce makes it stickier, not looser: the auth listener's `reconcileSharedStore()` stamps
`lastRunAt`, so Today's own `.task` reconcile then returns early as not-due — there is no second pass
to race into a repaint.

This is precisely the returning-client story the round exists for: fresh install, sign in, D's seeded
`Guest Bedroom` is fetched and inserted, and Today's house rail still shows only the two
`project_rooms`. It self-heals on the next foreground, and on every later cold launch the store
already holds the rows — which is likely why it did not surface: a walk that signs out and back in
inside a live session, then looks at **Spaces**, sees a pass.

**Fix:** call `viewModel.load()` (or a narrower room-reload) after `reconcile` returns, in both the
`.task` and the `isAuthenticated` `onChange`; or move the rail's local rooms onto an `@Query` the way
Spaces has them. Then re-walk **item 1 as written** — the rail, on Today, in the session that signs
in — and put that shot in the ledger beside `w4-fix-01`.

### B-2 · The hydrate takes every room RLS will hand it, not the account's own
**Severity: blocking · Confidence: high on the code path; medium on how often a designer signs into
the client app.**

`RoomsAPIClient.listRooms()` (`:226-234`) is `GET /rest/v1/rooms?select=*&order=created_at.desc` —
**no `user_id=eq.…` filter.** Until this round it had zero call sites, so its breadth cost nothing.
`RoomSyncCoordinator.apply` now treats every row it returns as a room of the signed-in account:
`insertMirrored` writes it into the device-global store, and from there it is counted by
`YourSpacesView`'s totals, `HouseRoomCard`, `coordinator.updateRoomCount`, the Companion's context,
and Profile.

`public.rooms` carries two SELECT policies (`00019_roomplan_features.sql:50-60`): the owner's, **and**
`"Designers can view client rooms"` — every room of every client on her `designer_clients` roster. The
Patina client app has no designer gate (`grep isDesigner Services/Auth Features/Authentication` finds
only the decoded field), so a designer who signs in here hydrates her whole client book's rooms as her
own house. That is the same class of boundary this round just spent a migration closing for
`last_seen_at`, and it is one line: the coordinator already holds the answer —
`try? await api.resolveUserId()` — and never passes it to the query.

**Fix:** `URLQueryItem(name: "user_id", value: "eq.\(userId)")` on `listRooms`, threaded from the
owner the coordinator already resolves. Belt and braces beside RLS, not instead of it.

---

## 3. Major

### M-1 · Un-saving a piece added to a room leaves the room holding it
**Severity: major · Confidence: high.**

`addToRoom` writes two models: a `TableItemModel` (the Saved table) **and** a `SavedItem` on the room
(`store.addItem`). `toggleSave`'s un-save branch (`ProductDetailViewModel.swift:145-149`) deletes only
the `TableItemModel` rows and calls `mirrorUnsave`. The room's `SavedItem` is never removed.

Every count in the app reads that orphan: `RoomGalleryCard.statCells` (`:113`),
`RoomProjectView.statRow` "Saved pieces" (`:441`), `YourSpacesView`'s totals (`:275`, `:278`),
`YourHouseRail`'s `N saved pieces` (`:70`), `RoomHeroCard` (`:72`), `DailyRoomView`'s
`updateTableItemCount` (`:543`). And `RoomModel.totalInvestmentCents` — which is now the numerator of
the budget bar M-shaped fix af8ecb6b6 just made honest.

So: Add to Room, change your mind, tap `Saved ✓`. The Saved table is empty, `saved_items` is empty,
and the room still says one saved piece and still counts its price against the budget. That is the
exact C5 failure the rest of this round is closing. The button's label is coherent (`Saved ✓` → the
second tap is an un-save), so this is not a mislabel; it is a missed delete.

Pre-existing in shape — `addToAttachedRoom`'s old *local fallback* also wrote a `SavedItem` — but that
path only ran when the remote call failed. This commit makes it the primary path, so a rare leak
becomes the ordinary one.

**Fix:** `toggleSave`'s un-save branch should delete the matching `SavedItem` from every room too (the
inverse of what `addToRoom` wrote), with a test that the room's count returns to zero.

### M-2 · A second `.sheet(isPresented:)` on the piece screen's root may have silenced the help panel
**Severity: major · Confidence: medium (needs one tap on device to settle).**

`ProductDetailView`'s body now carries `.helpPanel(isPresented: $isHelpPanelPresented, …)` (`:55`) —
which is itself `sheet(isPresented:)` (`Features/Help/Views/HelpPanelSheet.swift:299`) — and then, a
few modifiers later, `.sheet(isPresented: $isChoosingRoom)` (`:74`). Two sheet presentations on one
view.

`h1-notes.md` §3.1 recorded exactly this family of defect in this wave, in this codebase, on this OS:
*"a second `.sheet` on a descendant of a view that already has one does not present here"* — and H1
fixed `RoomProjectView` by collapsing both into one `.sheet(item:)`. The shape here is not identical
(both are on the same chain, not parent/descendant), and `w4-fix-05` proves the **new** sheet
presents. What nobody checked is the **older** one: whether the `?` in the piece screen's top bar
still opens the help panel now that a second sheet sits below it in the chain.

**Fix (or clear):** either tap the `?` on the piece screen on a signed build and record the shot, or
pre-emptively collapse both into a single `.sheet(item:)` behind a `ProductDetailView.Presented` enum
— the pattern H1 already established in this wave.

### M-3 · "Start fresh" deletes the rooms the reconcile has just fetched for the signing-in account
**Severity: major · Confidence: medium-high.**

`LocalStoreClaim.askIfNeeded` (sync, on the auth event) puts the claim sheet up; the reconcile `Task`
spawned on the same event then runs and inserts the account's server rooms into the same store while
the sheet is still open. If the person answers **"Start fresh"**, `LocalStoreClaim.startFresh()` calls
`LocalStoreReset.wipeUserScopedData()`, which does `context.delete(model: RoomModel.self)` — *all* of
them, including the rows that just arrived and are not the guest's work at all.

Recovery is then blocked by the round's own debounce: same owner, `lastRunAt` just stamped, so
`isDue` is false for 30 s, and the next reconcile needs a screen to appear after that window. The
account lands on a house that is empty of its own real rooms.

Before this round the store held only the guest's rooms at that moment, so "Start fresh" meant exactly
what it says. It is a regression of this commit, narrow but on SP-06's own path.

**Fix:** the cheapest correct version is to hold the reconcile until the claim is answered (or run it
from `keep()`/`startFresh()` instead of from the listener), and to reset `lastOwner`/`lastRunAt` when
the store is wiped so the next appearance refetches immediately.

---

## 4. Minor

| # | Finding | Severity | Confidence |
|---|---|---|---|
| m-1 | **Double fetch.** `reconcile`'s `guard !inFlight` is evaluated *before* `waitForAuthReady()` and `resolveUserId()`, so two `.task`s can both pass it and both call `listRooms()`. No duplicate rows result — `apply` re-reads the store — but two requests go out where one was intended. Move the `inFlight` set above the awaits, or key it on the owner. | minor | high |
| m-2 | **A full room fetch inside `body`.** `fitLine(for:)` (`ProductDetailView.swift:99-106`) builds a `RoomStore` and calls `allRooms()` on every body evaluation of a scrolling screen. Hoist it into `@State` seeded from the same `.task` that already seeds `roomOptions`. | minor | high |
| m-3 | **A piece already saved roomless can never be given a room from the piece screen.** `isSaved` short-circuits to `toggleSave`, so `addToRoom` — and with it the `updateItemRoom` PATCH branch — is unreachable on the one device that made the save. It is only reachable from a *second* device. Walk item 4's "a Saved row shows … room" therefore holds for a fresh save and not for the rows a reader already has. | minor | high |
| m-4 | **A mirrored room never draws a fit line.** `insertMirrored` leaves `measuredWithUnitControl = false`, so D's seeded `Guest Bedroom` — real dimensions, 15 × 12 ft — is silent for `RoomFitLine`, as is any room typed on another phone. Consistent with the gate's stated rationale (F40), but it means the round's two headline fixes do not meet: the room the hydrate brings back is the one the fit line will not measure. Worth a word from Fable rather than a silent default. | minor | high |
| m-5 | **`applyRemote` overwrites dimensions but not the measured flag.** A room typed here (flag true) whose server row wins takes the server's `width`/`length` and keeps `measuredWithUnitControl = true`. Harmless while the server's numbers only ever came from the same typed entry; it stops being harmless the day anything else writes `rooms.length_meters`. | minor | medium |
| m-6 | **`keepLocal` is computed and never acted on.** Correct for a read-only mirror — nothing here should push — but a locally-newer room then diverges silently and forever, and no note in the code or in `fix-tasks.md` names that as owed. One sentence in `RoomSyncCoordinator`'s banner. | minor | high |
| m-7 | **No client-side cap against 00539 §1's new `saved_items_notes_length_check` (≤ 2000).** `SavedNoteSheet` / `SavedItemNoteMirror` carry no length limit (grepped). A longer note is a 400 the app only logs — the identical silent-mirror-failure class this round just discovered for `source`, in the same wave's own migration. | minor | high |
| m-8 | **`listRooms` alone skips `ensureOK`.** Every other `RoomsAPIClient` call validates the status; this one decodes straight into `[RemoteRoom]`, so a 401/500 arrives as a decode error and the log line names the wrong cause. Pre-existing, but this round gave the method its first caller. | minor | high |
| m-9 | **`profile_presence_test.sql` does not test a designer's refused INSERT** — only her refused UPDATE. The `WITH CHECK (user_id = auth.uid())` makes it true by construction; the test file otherwise covers every path and this is the one gap. | minor | high |
| m-10 | **Clock skew.** `mirror.updatedAt > serverStamp` compares a device clock against a Postgres clock. A device running behind loses a genuinely newer local edit. Acceptable for now; worth a comment naming the assumption. | minor | medium |
| m-11 | **Neither new piece-screen surface was walked on the flag-off root.** The report's "both roots render" rests on Today, on the same build. Add to Room, the room picker and the fit line all live on `pieceDetail`, which draws on both roots with different bottom clearance (`bottomBar`'s own comment says so). One flag-off shot of the piece screen would close it. | minor | high |
| m-12 | **Housekeeping.** `RESUME.md`, `research/01-shot-ledger.md`, `research/02-steward-boot.md`, `source/direction-b.md` and two `source/workflows/*.js` are modified-uncommitted in the main checkout, and `shots/w4-fix-01…09` are untracked there. Correct per the brief (git in main is read-only for agents) — naming it so the orchestrator carries all of it, not only §6(b). | minor | high |

---

## 5. Checklist, answered

| Asked | Answer |
|---|---|
| server-only rows created | **yes** — `plan.insert` → `insertMirrored`, tested |
| local-newer edits kept | **yes** — `keepLocal`, no write; local mutators bump `updatedAt` |
| guest-unclaimed rooms never merged into an account | **yes** — `remoteId == nil` → `untouched`, tested; but see **M-3** for what happens to the *account's* rooms on "Start fresh" |
| idempotent | **yes** — `reconcilingTwiceLeavesOneRoom`, and `apply` re-reads the store each pass |
| no duplicate by `remoteId` | **yes** — lowercased key, first mirror wins, case-insensitive test |
| never blocks the UI | **yes** — `.task` / detached `Task`, failure logs and returns |
| never deletes a local room the server lacks | **yes** — such a mirror lands in no bucket. *Not* directly tested; worth one case |
| Add to Room sets `room_id` locally **and** in the mirror | **yes** — local row, room's `SavedItem`, `createItem` payload, and a PATCH for an already-mirrored roomless row |
| the room-scoped Saved reads it | **yes** — `CollectionsViewModel.items(_:inRoom:)`, tested; `w4-fix-09` |
| the fit line's gate | **yes** — context room wins, unmeasured context substitutes nothing, else most-recently-measured. See **m-4** |
| no unrelated change | **yes** — 42 files, all in scope |
| tests real | **yes** — real in-memory `ModelContainer`s and real `SET LOCAL ROLE` SQL, not mocks. `SourcePin` is used for mounts and deletions only, which is the honest use of it |
| both roots render | **partially** — asserted for Today; the two new piece-screen surfaces were walked flag-on only (**m-11**) |
| pathspec Conventional Commits | **yes** — twelve, each scoped to its subject, not pushed |

---

## 6. What I would ask for before this round is accepted

1. **B-1** — refresh the rail after the reconcile, and re-walk walk item 1 *on the rail*.
2. **B-2** — filter `listRooms()` by the owner the coordinator already resolves.
3. **M-1** — un-save must clear the room's `SavedItem`, with a test on the count.
4. **M-2** — one tap on the `?` on the piece screen, or the single-`sheet(item:)` collapse.
5. **M-3** — a ruling on the claim-sheet ordering, and a debounce reset on wipe.

Everything else is a note for Fable, not a gate.
