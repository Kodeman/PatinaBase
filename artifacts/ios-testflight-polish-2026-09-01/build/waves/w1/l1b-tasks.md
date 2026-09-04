# W1 · L1-B — task list

Lane: **L1-B Data, persistence, resilience** · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1b` · branch `first-flight/w1-l1b` ·
base `ba83aa67f`.

Format: superpowers `writing-plans` — failing test → run → implement → run → pathspec commit.

---

## Standing lines

### 1. Simulator

```bash
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4   # ff-w1-l1b
```

Launch line for every relaunch: `-DeploymentTarget local` and **nothing else** (D1a — `house-first`
defaults ON, so no `-PatinaFlags`). HID preflight before trusting any input. Screenshots only via
`xcrun simctl io 1D595108-E73C-47D6-A832-184C082386E4 screenshot`.

### 2. The VISION check

*Name any finding in this table whose fix would add or entrench something VISION §6 refuses — tab /
zone / dashboard UI beyond D1's ruling, shadows, red/green status, badges, engagement optimisation,
the word "AI" — and say why it survives.*

Four candidates, all survive, none adds a refused thing:

| finding | why it looks like a §6 problem | why it survives |
|---|---|---|
| `A-81` | It is *about* badges — four counts of "what needs you". | The fix **removes** a count's ambiguity; it adds no badge. Its remaining half is a note to L1-C asking the NEEDS YOU section to say it is showing 3 of 5 **in words**, not a chip. |
| `R-01` / `R-02` / `L07-05` | A "staleness signal" is one keystroke from a red/green dot. | Ruled by `L07-05`'s own fix line, carried from the L0.7 walk: *the affordance must be a word ("last updated…", "we couldn't reach the studio"), never a dot or a badge.* Every string this lane adds is a sentence in the app's voice. |
| `A-34` / `C-11` | A "% match" is engagement scoring by another name. | The fix makes the number **honest**, and `A-34`'s own fix line offers the qualitative band. `matchLabel` becomes a band ("Strong match" / "Good match" / "Worth a look") — fewer numbers on screen, not more, and no leaderboard, streak or nudge. |
| `C7-01` | A one-time "we had to start your data over" screen is new UI. | It is an honesty screen shown at most once, in the app's own typography, with one dismiss. VISION's refusal is of decoration and manipulation; this is the app admitting a loss it caused. Never `fatalError` in a shipping build is the alternative it replaces. |

Nothing in this lane adds a tab, a zone, a dashboard, a shadow, a red/green state, a new badge, an
engagement mechanic, or the word "AI". `A3-18`'s column list and `C7-13`'s queue cap are invisible.

### 3. The notes I must apply

Every `build/waves/w1/*-notes.md` addressed to L1-B, as numbered tasks:

| # | Source | Task | Where it lands |
|---|---|---|---|
| N1 | `l1-b-notes.md` **Task B-L04-1** (L0.4) — remove the Spaces `?` door | **NOT THIS LANE.** Steward ruling **S-1** moves `Features/Rooms/Views/YourSpacesView.swift` to L1-C and says *"`l1-b-notes.md` Task B-L04-1 moves to L1-C's list unchanged"*. Recorded here so the coverage is auditable; no edit. | — (L1-C) |
| N2 | `l1-b-notes.md` **Task B-L04-2** (L0.4) — `R-10`'s `+` that `URLComponents` will not encode | **Task B-16** | `SanityHelpClient.swift` |
| N3 | `l1-b-notes.md` **Task B-L04-3** (L0.4) — `R-10`'s failed-vs-empty split; `fetchArticles` must throw, and drop both negative cache writes | **Task B-17** | `SanityHelpClient.swift`, `HelpPanelSheet.swift`, `HelpPanelSheetTests.swift` |
| N4 | PROGRAM.md §3 · L1-B integration notes — L1-A's quiz-RPC timeout drop (30 s → ~8 s) on `APIConfiguration.swift`, which is this lane's file | **Task B-02** | `Services/API/APIConfiguration.swift` |
| N5 | PROGRAM.md §3 · L1-B integration notes — the `client_designer_roster` client-side hedge reads as *"no designer yet"*, not an error | **Task B-10** | covered by the load-state pass; `RosterAPIClient` failures already fold into `BadgeCountService.roster` without a verdict |
| N6 | `l1-c-notes.md` — nothing is addressed to L1-B (line 196 only *points at* `l1-b-notes.md`) | no action | — |
| N7 | `l1-a-notes.md` — the A3-07 self-downgrade contract is **L1-A's**; read for context only (it does not touch a file in this glob) | no action | — |
| N8 | `build/waves/w1/l1-e-copy-deck.md` | Read **before the final commit**; apply every row addressed to a file this lane owns and record which. | **applied** — deck §"L1-B applies": `C4-09`, `C5-16` ×4, `C5-09`, `C5-10`; plus `C4-08`'s `RoomsAPIError` half and `C5-11`'s headline period, both routed to L1-B by the deck's own note column. Commit `a7744b9c3`. |
| N9 | `l1-b-notes.md` **From L1-A** | `B-L1A-1` the quiz constant's exact name · `B-L1A-3` `PauseMenuView`'s two labels · `B-L1A-4` no action · **`B-L1A-2` (`.keyboardDoneToolbar()` on five `.numberPad`/`.decimalPad` fields) is OPEN** — the modifier lives in `Patina/Utilities/ViewModifiers/KeyboardDismissal.swift`, which exists only on `first-flight/w1-l1a`; applying it here would not compile. | commit `a7744b9c3`; `C9-08` deferred to the rebase |
| N10 | `l1-b-notes.md` **From L1-D** | `D→B-1` (`C5-14`, eight currency bypasses) **applied**. **`D→B-2` (`C3-01`, 45 `pearl` sites) and `D→B-3` (`C3-15`, 32 inline fonts) are OPEN** — every token they name (`Border.hairline`, `Border.strong`, `OnDark.*`, `voiceLead`, `monoLabel`, `bodySerif`, `h6`, `monoLarge`) exists only on `first-flight/w1-l1d`. D14 merges L1-D **before** L1-B, so both are a rebase-time apply on the integration tip. | commit `a7744b9c3`; the rest deferred |
| N11 | `l1-b-notes.md` **From L1-X** | Nothing owed — `L07-01` is closed in SQL and the client sends no studio identifier. | no action |
| N12 | `l1-b-notes.md` **From L1-C** | Rebase heads-up only (`C9-04`'s four one-line swaps in this lane's files, `YourSpacesView` under S-1, `NewRoomSheet`, `RoomTypePillRow`, `RoomProjectView:254`). | no action |
| N13 | `l1-b-notes.md` **From L1-F** (`L1F→B-1`) | L1-F asked for the watchdog's exact timeout, sentence, fallback phase and floor. **Answered in full** — `l1-f-notes.md` Task F-L1B-1 carries all four, and `Core/State/LaunchWatchdog.swift` on this branch is where the two constants live. | `l1-f-notes.md` |

### 4. The notes I will send

Written to `build/waves/w1/l1b-notes-out.md` **and appended verbatim to each target lane's
`<target>-notes.md`**. Exact final text in that file; summary here:

Final numbering, as shipped in `l1b-notes-out.md` and appended to each target's inbox:

| # | To | Finding | What | landed as |
|---|---|---|---|---|
| O1 | **L1-F** | `C1-19`, `C1-18` | `AppCoordinator.swift`: the `.launching` watchdog (force `.auth` at `LaunchWatchdog.stallDeadline` = 8 s) and the splash floor (1.5 s → `LaunchWatchdog.splashFloor`) | `l1-f-notes.md` Task F-L1B-1 |
| O2 | **L1-F** | `C2-06` | `AppCoordinator.beginSplashTransition()`: clear `navigationPath`, `screenStack`, every tab stack, and `tabs.selected = .today` | Task F-L1B-2 |
| O3 | **L1-C** | `C4-12`, `R-03` | `.refreshable` on `DailyRoomView`, `ProfileView`, `YourSpacesView`, `RecommendationsView`, and the staleness line on Today | `l1-c-notes.md` Task C-L1B-1 |
| O4 | **L1-C** | `C4-12` | `.refreshable` on `DecisionDetailView` | Task C-L1B-2 |
| O5 | **L1-C** | `C4-03` | `YourSpacesView`: the error branch for `RoomSyncCoordinator.shared.lastLoadFailed` | Task C-L1B-3 |
| O6 | **L1-F** | `R-02` | `BadgeCountService`: persist the last successful counts across launches | Task F-L1B-3 |
| O7 | **L1-C** | `R-02`, `A-81` | `DailyGreetingHeader`: the bell must not assert "No unread notifications" over a count nobody fetched | Task C-L1B-4 |
| O8 | **L1-F** | `C4-12` | `.refreshable` on `ThreadDetailView` | Task F-L1B-4 |
| O9 | **L1-A**, **L1-F** | `C7-01`, `A-34`, — | Heads-up only: the one modifier line on the unowned `PatinaApp.swift`, `matchLabel`'s band (no call-site edit), and `SessionScope.participants()` at 13 | both inboxes |

---

## Coverage — all 28 findings in `findings-by-lane.md` §"W1 · L1-B"

Revised after the round-1 adversarial review (`RL1B-01`…`RL1B-21`). The **claim level** column is the
honest one: `sim` = exercised on the clone, `unit` = pinned by a behavioural test, `pin` = source-pin
only, `note` = the remaining half is another lane's file and is scheduled as a numbered task there.

| id | task | test that pins it | claim level |
|---|---|---|---|
| `C7-01` | B-01 | `PersistenceMigrationTests` | unit |
| `C7-02` | B-01 | `PersistenceMigrationTests` | unit |
| `C4-16` | B-02 | `NetworkBudgetTests` | unit — ⚠ **300 s resource cap, not the finding's 120 s**; see the lane report |
| `A3-18` | B-03 | `ProductSelectShapeTests` | unit |
| `C7-17` | B-03 | `ProductDecodingTests` (extended) | unit |
| `A-34` | B-04 | `MatchScoreResolverTests` | unit — the **piece** bands; the **room** average stays numeric this wave, reason in the report + O13 |
| `C-11` | B-04 | `MatchScoreResolverTests` | unit — the green-pill half is O11 (L1-C) |
| `C7-13` | B-05 | `TelemetryQueueBoundsTests` | unit |
| `C7-15` | B-06 | `BackgroundScanUploaderTests` (extended) | pin |
| `C7-05` | B-07 | `FrameCaptureContextTests` | pin |
| `GAP4-02` | B-08 | `ScanFallbackEntryTests` | **sim** (shots 08, 09) |
| `GAP4-03` | B-08 | `ScanFallbackEntryTests` | **sim** (shots 08, 09) |
| `GAP4-25` | B-08 | `ScanFallbackEntryTests` | **pin only — not sim-verified.** The floor-plan step needs a completed LiDAR scan, which no simulator produces. Rescan goes on the R1 device pass beside D-17 |
| `C1-18` | B-09 (+ O1) | `LaunchWatchdogTests` | unit + note **landed** — L1-F applied F-L1B-1 in its round 3; `AppCoordinator.splashMinimumDuration == LaunchWatchdog.splashFloor(isAuthStateReady: false)` |
| `C1-19` | B-09 (+ O1) | `LaunchWatchdogTests` | unit + note **landed** — same |
| `C4-03` | B-10 (+ O5) | `LoadStateHonestyTests` | unit; Spaces' branch is O5 (L1-C) |
| `R-01` | B-10 | `LoadStateHonestyTests` | unit |
| `R-02` | B-10 | — | **note only — no L1-B code change.** The claim is badge counts surviving a cold launch with the backend down; `BadgeCountService` is L1-F's file. Task F-L1B-3 |
| `L07-05` | B-10 (+ O12) | `LoadStateHonestyTests` | unit — `stalenessLine` exists and is tested; **nothing renders it** until L1-C applies O12 |
| `R-05` | B-11 | `LoadStateHonestyTests` | unit |
| `B-03` | B-12 | `RoomLifecycleTests` | unit — round 1 fixed the stale snapshot only; the room came **back** on the next reconcile. Round 2 adds the remote delete + `RoomTombstones` |
| `B-04` | B-12 | `RoomLifecycleTests` | **sim** (shot 13) |
| `B-15` | B-13 | `AccountIsolationTests` (extended) | unit |
| `GAP3-18` | B-13 | `AccountIsolationTests` (extended) | unit |
| `C2-06` | B-13 (+ O2) | `AccountIsolationTests` (extended) | **note only** — `AppCoordinator` is L1-F's; applied there in round 3 |
| `C4-12` | B-14 (+ O3, O4, O7) | `RefreshableSurfacesTests` | unit for this lane's 2 screens; 5 more are notes |
| `R-03` | B-14 (+ O3) | `RefreshableSurfacesTests` | half — Today's staleness line is O3 (L1-C) |
| `A-81` | B-15 (+ O6) | `AttentionCountTests` (extended) | **pinned, not changed.** `hasMoreNeedsYou`, `maxRowsPerEyebrow` and `See all →` were already on the base sha; the three new tests pin behaviour this lane did not build. The remaining half is O7 (L1-C) |

Plus the two notes-driven tasks: `R-10` → B-16, B-17 (`HelpPanelSheetTests`, `SanityHelpClientTests`).

---

## Tasks

### B-01 — `C7-01` + `C7-02`: a container that cannot brick build 2

1. **Failing test.** `PatinaTests/PersistenceMigrationTests.swift`: a `SchemaMigrationPlan` exists and
   names every `VersionedSchema`; `BoardModel.self` is in the container schema **and** in
   `LocalStoreReset`; opening a deliberately corrupt store on disk returns a working container and
   records a recovery notice rather than trapping.
2. **Run** — fails.
3. **Implement.** `Core/Persistence/PatinaSchema.swift` (new): `PatinaSchemaV1: VersionedSchema` with
   the nine models (the eight in the container today **plus `BoardModel`**), and
   `PatinaMigrationPlan: SchemaMigrationPlan`. `PersistenceController`: build from the plan; on catch,
   move the store aside (`…/default.store` → `…/Recovered-<timestamp>/`) and open fresh; on a second
   failure fall back to in-memory. Never `fatalError`. Record
   `LocalStoreRecovery.shared.pending = .init(movedAsideAt:)`.
   `Core/Persistence/LocalStoreRecoveryNotice.swift` (new): the one-time screen and its
   `.localStoreRecoveryNotice()` modifier. `PatinaApp.swift`: one line applying it.
   `LocalStoreReset`: `BoardModel` added to both wipes.
4. **Run** — passes.
5. **Commit** `apps/mobile/Patina/Patina/Core/Persistence/ apps/mobile/Patina/Patina/PatinaApp.swift apps/mobile/Patina/PatinaTests/PersistenceMigrationTests.swift`

### B-02 — `C4-16` (+ note N4): timeouts the app actually owns

1. **Failing test.** `PatinaTests/NetworkBudgetTests.swift`: `SupabaseClientManager.sessionConfiguration`
   carries `timeoutIntervalForRequest == 30` and `timeoutIntervalForResource == 120`; the quiz budget
   is ≤ 10 s and shorter than `requestTimeout`.
2. **Run** — fails. 3. **Implement:** `Core/Network/SupabaseClient.swift` passes
   `GlobalOptions(session:)`; `Services/API/APIConfiguration.swift` gains `quizTimeout = 8`.
   4. **Run.** 5. **Commit** the two sources + the test.

### B-03 — `A3-18` + `C7-17`: the product reads

1. **Failing test.** `PatinaTests/ProductSelectShapeTests.swift` — `productSelect` is a golden string
   naming exactly the columns `RawProductWithVendor` decodes, contains neither `embedding` nor
   `aesthete_vector` nor a bare `*`. Extend `ProductDecodingTests` — one malformed row in a
   saved-pieces payload drops that row and keeps the rest.
2. **Run.** 3. **Implement** in `ProductAPIClient.swift`. 4. **Run.** 5. **Commit.**

### B-04 — `A-34` + `C-11`: one score per piece per session, printed as a band

1. **Failing test.** `PatinaTests/MatchScoreResolverTests.swift` — a piece first seen unscoped at 73
   still reads 73 on a room-scoped read and on the by-id read; the by-id read never invents a score
   from `quality_score`; `Product.matchLabel` bands and never prints a bare percentage.
2. **Run.** 3. **Implement:** `Core/State/MatchScoreResolver.swift` (new, `SessionScoped`),
   `ProductAPIClient` resolves through it, `ProductModel.matchLabel` bands.
   4. **Run.** 5. **Commit.**

### B-05 — `C7-13`: a telemetry queue with a bound

1. **Failing test.** `PatinaTests/TelemetryQueueBoundsTests.swift` — the pending list caps at
   `maxPending`, drops oldest, backs off on repeated failure, and does not rewrite the file on a tick
   that changed nothing.
2. **Run.** 3. **Implement** in `Services/Analytics/DailyRoomBatchQueue.swift`. 4. **Run.** 5. **Commit.**

### B-06 — `C7-15`: one session read per bundle, not one refresh per artifact

1. **Failing test.** extend `PatinaTests/BackgroundScanUploaderTests.swift` — the upload path reads
   `auth.session` and does not call `refreshSession()`.
2. **Run.** 3. **Implement** in `Services/Sync/BackgroundScanUploader.swift`. 4. **Run.** 5. **Commit.**

### B-07 — `C7-05`: one CIContext, encode off the main actor

1. **Failing test.** `PatinaTests/FrameCaptureContextTests.swift` — source pin: no `CIContext()`
   inside the per-frame path; one `nonisolated let` context; the encode is `nonisolated`.
2. **Run.** 3. **Implement** in `Features/Walk/Services/FrameCaptureService.swift`. 4. **Run.** 5. **Commit.**

### B-08 — `GAP4-02` + `GAP4-03` + `GAP4-25`: the fallback flow is not a dead end

1. **Failing test.** `PatinaTests/ScanFallbackEntryTests.swift` — the dimension fields start empty and
   `isValid` is false on arrival; `ScanFallbackEntryView` publishes an exit; `resetForRescan()`
   re-bootstraps; `.initial` renders a loading state.
2. **Run.** 3. **Implement** in `ScanFallbackEntryView.swift` and `QuietConversationFlowHost.swift`.
   4. **Run.** 5. **Commit.**

### B-09 — `C1-18` + `C1-19`: the splash stops being terminal

1. **Failing test.** `PatinaTests/LaunchWatchdogTests.swift` — `LaunchWatchdog.stallDeadline` is in
   5…8 s; `shouldSurfaceStall(elapsed:isReady:)` is false before it and true after when readiness has
   not landed and false at any elapsed once ready; the message is one line and names no vendor.
2. **Run.** 3. **Implement:** `Core/State/LaunchWatchdog.swift` (new) and the stall state +
   1.2 s wordmark fade in `Features/Splash/Views/SplashView.swift`. Send **O1**.
   4. **Run.** 5. **Commit.**

### B-10 — `C4-03` + `R-01` + `R-02` + `L07-05`: loading ≠ empty ≠ failed

1. **Failing test.** `PatinaTests/LoadStateHonestyTests.swift`, table-driven —
   `RoomSyncCoordinator.lastLoadFailed`, `CollectionsViewModel.lastLoadFailed`,
   `StudioHubViewModel` keeps its last-known snapshot when a source fails and says so in words,
   `BadgeCountService`-fed counts survive a failed cold refresh, `OrderDetailView`'s three states.
2. **Run.** 3. **Implement.** 4. **Run.** 5. **Commit.** Send **O5**.

### B-11 — `R-05`: the proposal admits failure in ten seconds

1. **Failing test.** in `LoadStateHonestyTests` — `ProposalDetailViewModel` has a fetch deadline of
   ≤ 10 s and lands on `error` when it expires.
2. **Run.** 3. **Implement:** the deadline in `ProposalsViewModel.swift`, a titled skeleton in
   `ProposalDetailView.swift`. 4. **Run.** 5. **Commit.**

### B-12 — `B-03` + `B-04`: deleting a room

1. **Failing test.** `PatinaTests/RoomLifecycleTests.swift` — a delete bumps the local room revision;
   `ProfileViewModel.roomCount` follows it; the delete lands the user on the rooms list.
2. **Run.** 3. **Implement:** `Core/Persistence/LocalRoomSignal.swift` (new), `RoomStore.delete`,
   `ProfileViewModel`, `RoomSettingsView.deleteRoom()`. 4. **Run.** 5. **Commit.**

### B-13 — `B-15` + `GAP3-18` (+ `C2-06` via O2): nothing of account A after a sign-out

1. **Failing test.** extend `PatinaTests/AccountIsolationTests.swift` — with a store owned by an
   account and nobody signed in, the room reads and the taste portrait read as empty, not as the
   previous account's.
2. **Run.** 3. **Implement:** `Core/Persistence/LocalStoreOwnership.swift` (new), applied in
   `RoomStore`, `ProfileViewModel` and `StyleProfileStore`. 4. **Run.** 5. **Commit.** Send **O2**.

### B-14 — `C4-12` + `R-03`: pull to refresh where this lane owns the screen

1. **Failing test.** `PatinaTests/RefreshableSurfacesTests.swift` — source pin over the surfaces this
   lane owns (`ProposalDetailView`, `ProjectDetailView`) plus the roots and details it does not, as a
   recorded expectation list the notes cover.
2. **Run.** 3. **Implement.** 4. **Run.** 5. **Commit.** Send **O3**, **O4**, **O7**.

### B-15 — `A-81`: one count, and each count labelled

1. **Failing test.** extend `PatinaTests/AttentionCountTests.swift` — the attention count and the
   drawn NEEDS YOU rows come from the same itemised list, and the drawn list can report the total it
   was capped from.
2. **Run.** 3. **Implement** what this lane owns; send **O6** for the card. 4. **Run.** 5. **Commit.**

### B-16 — note N2 / `R-10`: the `+` the URL builder will not encode

Exactly as `l1-b-notes.md` Task B-L04-2 writes it, including the two new assertions in
`HelpPanelSheetTests.swift:172-180`.

### B-17 — note N3 / `R-10`: failed-to-load must not read as nothing-here

Exactly as `l1-b-notes.md` Task B-L04-3 writes it: `HelpArticleFetchError` with `.transport` and
`.http(status:)`, both negative cache writes dropped, the two swallow tests renamed and inverted, one
new test for the 400-vs-empty distinction, and the stale comment at `HelpPanelSheet.swift:214-216`
corrected.

### B-18 — the copy deck

Read `build/waves/w1/l1-e-copy-deck.md`. Apply every row addressed to a file this lane owns and record
which. If it does not exist, say so in the report.

### B-19 — self-check on the clone

Launch against the local stack with `-DeploymentTarget local`, sign in as
`client@patina.dev` / `password123` where needed, screenshot each changed screen before and after into
`shots/w1-l1b/`, one line per shot in `shots/w1-l1b/ledger.md`.

---

## Gate

```bash
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

Plus the whole `PatinaTests` tier and the focused trio
(`PersistenceMigrationTests`, `LoadStateHonestyTests`, `ProductSelectShapeTests`) on this lane's clone.

**Never `pnpm supabase:reset`** — the local DB is ahead of this branch (steward §4). The exit
criterion's stack-stopped half uses `supabase stop` / `supabase start` only.

---
---

# Round 2 — the fix round (2026-09-02)

Against the adversarial review `RL1B-01`…`RL1B-21`. Same branch, same simulator, same gate lines.

## Notes that arrived since round 1, applied here

| # | Source | Task | Where |
|---|---|---|---|
| N14 | `l1-b-notes.md` **L1F→B-2** | drop `#expect(floor < AppCoordinator.splashMinimumDuration)` — L1-F applied F-L1B-1, so it now reads `0.6 < 0.6` | `PatinaTests/LaunchWatchdogTests.swift:96` — **applied**, R-09 |
| N15 | `l1-b-notes.md` **L1F→B-3** | `wipeUserScopedData()` must clear the deep-link FIFO on the A → B seam | `Core/Persistence/LocalStoreReset.swift` — **applied** with the raw key (`PendingLinkQueue` does not exist on this branch); the symbol swap is note **O10**, R-09 |
| N16 | `l1-b-notes.md` **L1F→B-4** | record: `LaunchWatchdog.swift` is byte-identical on `first-flight/w1-l1f` | **unchanged on this branch** — no re-sync needed |
| N17 | `l1-b-notes.md` **B-L1E-4** (L1-E round 2) | `C5-09`'s three remaining `Features/Rooms/**` noun sites | `CrossRoomView.swift:64,81`, `RoomProjectView.swift:212` — **applied**, R-10 |
| N18 | `l1-b-notes.md` **Note B-L1E-5** | `B-20` was applied by L1-C in `RoomProjectView.swift:254` — do not apply twice | **not applied**, deliberately |

## Tasks

| # | Review ids | Task | Test |
|---|---|---|---|
| R-01 | `RL1B-01`, `RL1B-21` | `RoomStore.init` stops building the app's on-disk store to answer "am I the shared store?" — `PersistenceController.loadedSharedContext` + `isSharedContext(_:)`, recorded from `init`, never forcing `.shared` | `PersistenceMigrationTests.aStoreOnItsOwnContextNeverTouchesTheSingleton`, `.anUnregisteredContextIsNotTheSharedStore` |
| R-02 | `RL1B-02` | `B-03`'s other half — `RoomStore.delete` writes a `RoomTombstones` row for a synced room, `RoomSettingsView.deleteRoom()` mirrors the delete, `RoomMerge.plan(server:local:tombstoned:)` refuses to re-insert and names the row for a retry, `reconcile` retries and clears | `RoomLifecycleTests` ×5 |
| R-03 | `RL1B-03` | drop `isIntermittent` from the three cross-lane ledger rows; hand the steward the hard-`#expect` replacement | the rows themselves + note **S1** |
| R-04 | `RL1B-12` | the `resolveUserId()` failure arm sets `lastLoadFailed`; the two non-failure arms must not | `LoadStateHonestyTests.aFailedOwnerLookupIsAlsoAFailure` |
| R-05 | `RL1B-13` | `DailyRoomBatchQueue.flush` gets an `isFlushing` guard — the actor suspends across the POST with the rows still in `pending` | `TelemetryQueueBoundsTests.twoConcurrentFlushesPostEachEventExactlyOnce` |
| R-06 | `RL1B-11` | `SavedItem.make(from:)` copies `resolvedMakerName`, so `C5-16`'s guard stops hiding a maker the app knows | `ProductDecodingTests.savingABrandOnlyPieceKeepsItsMaker`, `.savingAMakerlessPieceStillShowsNoMaker` |
| R-07 | `RL1B-16` | the ownership gate takes `isAuthStateReady` — an unresolved launch is not a guest; `savedItemCount` and `styleProfile` become revision-derived like `rooms` | `AccountIsolationTests.anUnresolvedLaunchIsNotTreatedAsAGuest`, `.theProfileCountsAreDerivedNotSnapshotted` |
| R-08 | `RL1B-17` | the raw upload error is logged where `lastError` is written, not from a function a view body calls | `ScanFallbackEntryTests.theFailureCopyDoesNotLogFromTheViewBody`, `.theTwoFailureSentencesStillClassify` |
| R-09 | `RL1B-19` | `theRefreshRunsTheSameWorkTheTaskDoes` brace-matches the closure instead of splitting on the first `}` | the test itself |
| R-10 | N14, N15, N17 | the three notes above | `LaunchWatchdogTests`, `NounConsistencyTests` (L1-E's) |
| R-11 | `RL1B-04`, `-06`, `-07`, `-18`, `-20` | report-level: the coverage table above now carries a **claim level** per row, and the report says which findings are half-closed and why | — |
| R-12 | `RL1B-05`, `-08`, `-09`, `-14`, `-15` | notes **O10**–**O13**, **S1**–**S3**, written to `l1b-notes-out.md` and appended to each target's inbox | — |

## Declined, with the reason

| # | Task | Why |
|---|---|---|
| `RL1B-10` | band the two room-level `%` figures | `A-34`'s `where` is *Browse pieces* — the room average is a different statistic and carries no W1 finding. The existing band vocabulary does not fit the cell (`PlayfairDisplay-Medium` 20 pt, no `lineLimit`; the observed 40–46 range lands on the three-word `"Worth a look"`, which wraps in a two-cell `HStack` at default type and worse above it) and shortening it is copy — L1-E's deck, not L1-B's to invent. Raised as a W2 deck row in note **O13**. |
| `RL1B-15` | narrow the five test seams | Recorded as deliberate, in the report. All five are `internal`, not `public`, and reachable only through `@testable`; three are the only way to assert the behaviour at all (`DailyRoomBatchQueue`'s four counters, `StudioHubViewModel.apply(_:now:)`, `ScanFallbackEntryView.dimensionsAreValid`). Nothing is added to the app's public surface. |

---
---

# Round 3 — the second fix round (2026-09-03)

Against the adversarial review `RL1B2-01`…`RL1B2-18`. Same branch, same simulator, same gate lines.
Format is unchanged: failing test → run → implement → run → pathspec commit.

## Standing lines, restated

### 1. Simulator

```bash
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4   # ff-w1-l1b
```

Launch line: `-DeploymentTarget local` and nothing else (D1a). HID preflight before trusting input.
Screenshots only via `xcrun simctl io 1D595108-E73C-47D6-A832-184C082386E4 screenshot`.

### 2. The VISION check

*Name any fix in this round whose change would add or entrench something VISION §6 refuses — tab /
zone / dashboard UI beyond D1's ruling, shadows, red/green status, badges, engagement optimisation,
the word "AI" — and say why it survives.*

Three candidates this round, all survive:

| fix | why it looks like a §6 problem | why it survives |
|---|---|---|
| **F-05** (`L1F→B-5`, the Studio's third unread count) | It is *about* a badge count on a tab. | The change **removes** a count — the Studio row stops computing its own and reads the one service every surface reads. Fewer numbers on screen, and the ruling it serves (`C2-07`) is "one count of what needs you". |
| **F-12** (`R-05`, the proposal skeleton's title) | New text on a loading screen. | It is the record row's own title, drawn while the fetch runs, so the reader can see which proposal they opened. No status colour, no progress percentage, no chip — one serif line and one grey line, in the screen's existing chrome. |
| **F-01** (`"Curated Comfort"` → `"Considered Comfort"` etc.) | A lexicon rename touching four display names. | It is L1-E's deck row `C5-20`, ratified in `l1-b-notes.md` E3-L1B-5; nothing is added, one word is replaced by another. |

Nothing in this round adds a tab, a zone, a dashboard, a shadow, a red/green state, a new badge, an
engagement mechanic, or the word "AI".

### 3. The notes I must apply

| # | Source | Task | Where it lands |
|---|---|---|---|
| N19 | `l1-b-notes.md` **E3-L1B-1** — three rows landed with U+0027 | **F-01** | `RoomsAPIClient.swift:430`, `ScanUploadFailureCopy.swift:25,26` |
| N20 | `l1-b-notes.md` **E3-L1B-2** — `"Let's try that again"` ×3 plus the sweep of the same three files | **F-01** | `MoneyFailureCopy.swift`, `ScanReviewView.swift`, `ScanWalkView.swift` |
| N21 | `l1-b-notes.md` **E3-L1B-3** — two glyphs in `LocalStoreRecoveryNotice.swift`; the other seven strings ratified as written | **F-01** | `LocalStoreRecoveryNotice.swift:19` + the `"""` body |
| N22 | `l1-b-notes.md` **E3-L1B-4** — `CollectionsView`'s empty state carries the retired noun in this lane's hunk | **F-01** | `CollectionsView.swift:166` |
| N23 | `l1-b-notes.md` **E3-L1B-5** — four surviving `"Curated"` display names + two straight apostrophes | **F-01** | `StyleResponseModel.swift:23,97,99,107`, `NamedAesthetic.swift:40,82` |
| N24 | `l1-b-notes.md` **E4-L1B-1** — `StyleResponseModel.swift:99` `"Let's Discuss"` | **F-01** | same file |
| N25 | `l1-b-notes.md` **L1F→B-5** — the Studio's third unread count | **F-05** — **cannot be applied on this branch**; `BadgeCountService.unreadNotificationCount` exists only on `first-flight/w1-l1f`, which merges *after* this lane (D14). Scheduled as a merge-4 apply with the exact final text; reply sent as **O15** | `StudioQueueBuilder.swift:33,392` |

### 4. The notes I will send

Written to `l1b-notes-out.md` and appended verbatim to each target's `<target>-notes.md`.

| # | To | Finding | What |
|---|---|---|---|
| **O14** | L1-C | `B-03` | `DailyRoomView.swift`: observe `LocalRoomSignal.revision` so a deleted room leaves the Today rail without a foreground cycle |
| **O15** | L1-F | `RL1F-25` | reply to `L1F→B-5`: the note is right and is scheduled at merge 4; it does not compile on this branch |
| **S5** | steward | `RL1B2-01` | after this lane's merge, seven wrapped `BrandVoiceLintTests` pins go red as unexpected passes — unwrap them |
| **S6** | steward | eight ids | the one ruling this lane cannot make for itself: every cross-lane half whose owner has already merged, plus the five files edited outside every glob |

---

## Tasks

### F-01 — `RL1B2-01` (blocker): L1-E's round-3 and round-4 copy rows

1. **Failing test.** `PatinaTests/CopyDeckRowsTests.swift` (new): the same rule L1-E's
   `BrandVoiceLintTests.lintApostrophes` applies — no `[A-Za-z]'[A-Za-z]` inside any string literal —
   over the nine files the notes name, plus explicit assertions for the four retired `"Curated"`
   display names and `CollectionsView`'s retired noun.
2. **Run** — fails on nine files.
3. **Implement.** Every row of E3-L1B-1…E3-L1B-5 and E4-L1B-1, verbatim.
4. **Run** — passes.
5. **Commit** the nine sources + the test.

### F-02 — `RL1B2-02`: the third ledger row's `isIntermittent`

1. **Failing test.** The row itself: drop `isIntermittent: true` at `AccountIsolationTests.swift:306`.
2. **Run** — the block records a known issue and the suite stays green (the note is genuinely open).
3. **Implement.** Rewrite the `:293` doc comment to the two in `RefreshableSurfacesTests`, and correct
   `l1b-notes-out.md` §S1's "all three" claim and its `:253` line reference.
4. **Run.** 5. **Commit.**

### F-03 — `RL1B2-03`: the C2-06 pin points at a function L1-F did not use

1. **Failing test.** The pin: `clearNavigationForEndedSession(` is the seam L1-F implemented `C2-06`
   in; `beginSplashTransition(` on `first-flight/w1-l1f` is four lines and has no `navigationPath`.
   The pin must tolerate the function's absence (it does not exist on this branch) instead of
   `#require`-ing it.
2. **Run.** 3. **Implement** the repoint + S1's replacement text. 4. **Run.** 5. **Commit.**

### F-04 — `RL1B2-04`: `B-03`'s Today half

1. **Failing test.** `RoomLifecycleTests`: `LocalRoomSignal` has more than one consumer, and
   `DailyRoomView` is one of them — a known issue while O14 is open, red the moment it lands.
2. **Run.** 3. **Implement** — nothing in this lane's files; send **O14** and schedule it in **S6**.
   4. **Run.** 5. **Commit.**

### F-05 — `RL1B2-05`: the Studio's third unread count

Reply **O15** + steward row in **S6**, with the exact final text. See N25 for why the edit itself
cannot land on this branch.

### F-06 — `RL1B2-06` + `RL1B2-08`: the coverage table stops claiming what other lanes owe

Report-level. `A-81`, `L07-05` and the pill half of `A-34`/`C-11` move to **open**, each naming the
note and the merge it lands at.

### F-07 — `RL1B2-07`: `C3-01`, `C3-15`, `C9-08`

Steward rows in **S6** — the ruling, not the edit. Held open in this lane's list.

### F-08 — `RL1B2-09`: a DELETE that removed nothing must not clear the tombstone

1. **Failing test.** `RoomLifecycleTests`: `deleteRoom(id:)` asks for the row back and treats an empty
   body as a failure, so `RoomTombstones.clear` runs only on a delete that deleted something.
2. **Run.** 3. **Implement** in `RoomsAPIClient.swift`. 4. **Run.** 5. **Commit.**

### F-09 — `RL1B2-10`: the guest wipe keeps the tombstones, deliberately

1. **Failing test.** `AccountIsolationTests`: the account wipe clears them, the guest wipe does not.
2. **Run.** 3. **Implement** the comment that records why. 4. **Run.** 5. **Commit.**

### F-10 — `RL1B2-11`: the select test catches the omission direction

1. **Failing test.** `ProductSelectShapeTests`: every stored property `RawProductWithVendor` decodes,
   read out of the declaration itself, is in `productColumns`.
2. **Run.** 3. **Implement** the derivation. 4. **Run.** 5. **Commit.**

### F-11 — `RL1B2-12`: nine surfaces, not five

1. **Failing test.** `LoadStateHonestyTests.everySurfaceCanTellTheThreeStatesApart` grows to the nine
   the charter names, each with the view that draws them.
2. **Run.** 3. **Implement** — nothing; the four added surfaces already draw three states, and the
   test locks that. 4. **Run.** 5. **Commit.**

### F-12 — `RL1B2-15`: the skeleton says which proposal

1. **Failing test.** `LoadStateHonestyTests`: `ProposalDetailViewModel` can name a proposal it has not
   fetched, from the record row that launched it.
2. **Run.** 3. **Implement** in `ProposalsViewModel.swift` + `ProposalDetailView.swift`.
   4. **Run.** 5. **Commit.**

### F-13 — `RL1B2-17`: the delete control's tap target

1. **Failing test.** `RoomLifecycleTests`: the button's label carries a ≥44 pt frame **and** a
   `contentShape`, so the hit area is the row and not the glyph box.
2. **Run.** 3. **Implement.** 4. **Run.** 5. **Commit.**

### F-14 — `RL1B2-18`: the room-type grid at accessibility sizes

1. **Failing test.** `ScanFallbackEntryTests`: the cell label is bounded and scales.
2. **Run.** 3. **Implement.** 4. **Run.** 5. **Commit.** 6. **Sim-verify** at
   `accessibility-extra-large`.

### F-15 — `RL1B2-13`, `-14`, `-16`: the three the report carries

The five unowned files in **S6**; the seven-file conflict list with a resolution rule each in the lane
report; the 300 s resource cap stated as an accepted deviation in this lane's own words.

## Declined, with the reason

| # | Task | Why |
|---|---|---|
| `RL1B2-10` (the suggested edit) | add `RoomTombstones.clearAll()` to the guest wipe | It would be a defect. `wipeGuestWork` deliberately keeps every room carrying a `remoteId` — those are the **account's** rooms, and "start fresh" must never delete them. A tombstone is only ever written for a room that had a `remoteId`, so the ids in that list belong to the same account whose rooms the wipe is preserving. Clearing them would let the next reconcile re-insert a room the person confirmed away. The reviewer's own alternative — "state why the guest path deliberately keeps them" — is taken, in the code and in the report, and **F-09** pins both halves. |

## Round-3 coverage — every review row, closed or open

| review id | severity | task | test that pins it | state |
|---|---|---|---|---|
| `RL1B2-01` | blocker | F-01 | `CopyDeckRowsTests` (new, 4 tests + 9 parameterised files) | **closed** |
| `RL1B2-02` | major | F-02 | `AccountIsolationTests.theSignOutClearsThePreviousAccountsNavigationStack` | **closed** |
| `RL1B2-03` | major | F-03 | same test, repointed at `clearNavigationForEndedSession(` | **closed** |
| `RL1B2-04` | major | F-04 | `RoomLifecycleTests.theTodayRailFollowsALocalDelete` | **note sent** — O14 to L1-C, scheduled in S6 after merge 3 |
| `RL1B2-05` | major | F-05 | `AttentionCountTests.theStudioRowStillOwesTheSharedUnreadCount` | **reply sent** — O15 to L1-F; the symbol lands at merge 4 |
| `RL1B2-06` | major | F-06 | — | **closed as a report row**: `A-81`, `L07-05` and the pill half of `A-34`/`C-11` now read **open** |
| `RL1B2-07` | major | F-07 | — | **partly disputed, partly escalated.** `C3-01`/`C3-15` need no apply task: L1-D applied D→B-2 and D→B-3 in its own branch (`first-flight/w1-l1d`'s `ScanFallbackEntryView.swift` has zero `pearl` and zero `.custom(`), so the remaining work is the merge-3 conflict, and L1-D's three bars catch a lost line. `C9-08` is genuinely open — `grep -c keyboardDoneToolbar` over L1-A's copies of all four files returns 0. S6 carries it |
| `RL1B2-08` | minor | F-06 | `MatchScoreResolverTests` (existing) | **stated** — the "Not scored yet" pill is called out in S6 as the user-visible consequence of O11 |
| `RL1B2-09` | minor | F-08 | `RoomLifecycleTests.aDeleteThatRemovedNothingIsAFailure` | **closed** |
| `RL1B2-10` | minor | F-09 | comment + report | **declined with a written reason** (above) |
| `RL1B2-11` | minor | F-10 | `ProductSelectShapeTests.everyPropertyTheRowDecodesIsRequested` | **closed** |
| `RL1B2-12` | minor | F-11 | `LoadStateHonestyTests` — nine surfaces + `theListDrawsTheErrorBeforeTheEmptyState` ×4 | **closed** |
| `RL1B2-13` | minor | F-15 | — | **escalated** — all five files in S6 |
| `RL1B2-14` | minor | F-15 | — | **closed as a report row** — the seven-file list with a resolution rule each |
| `RL1B2-15` | minor | F-12 | `LoadStateHonestyTests.theSkeletonDrawsThatNameInsteadOfAGreyBar` | **closed** |
| `RL1B2-16` | minor | F-15 | `NetworkBudgetTests` (existing) | **stated** — accepted deviation, in the lane report's own words |
| `RL1B2-17` | minor | F-13 | `RoomLifecycleTests.theDeleteControlIsAWholeRow` | **closed** |
| `RL1B2-18` | minor | F-14 | `ScanFallbackEntryTests.theRoomTypeCellsSurviveAccessibilitySizes` | **closed** |

### Findings whose coverage row changed

| id | round 2 said | now |
|---|---|---|
| `A-81` | "pinned, not changed" | **open** — the remaining half is **O7**, and L1-C has already merged. S6 schedules it |
| `L07-05` | unit — `stalenessLine` exists and is tested | **open** — nothing renders it until **O12** is applied. S6 schedules it |
| `A-34` / `C-11` | unit — the pill half is O11 | **open on the pill half** — and until O11 lands the by-id path draws "Not scored yet" inside the verdict pill |
| `C3-01` / `C3-15` | deferred to the rebase | **closed on L1-D's branch** — the halves are applied there; merge 3 is a conflict resolution, not an owed edit |
| `C9-08` | deferred to the rebase | **open** — nobody has applied `B-L1A-2`; S6 schedules it after merge 5 |
| `B-03` | unit — round 2 added the tombstone | **open on the Today half** — O14 |
| `C2-07` (`RL1F-25`) | not in this lane's table | **open** — L1-F's note, applies at merge 4 |
