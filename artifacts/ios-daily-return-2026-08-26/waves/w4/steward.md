# W4 — Steward setup record (The house on Today)

Written by the W4 setup steward, 2026-08-28, before any lane started.

**This file is authoritative for owned files.** A lane needing a change in another lane's file
writes it into `waves/w4/<lane>-notes.md` as an integration note; the integration steward applies it.
No lane edits a path this file does not grant it, and no lane edits a path §4 marks FROZEN.

---

## 1. Base

```
$ git -C /Users/kody/Code/patina-merged log --oneline -1 main
1cb71c346 chore(daily-return): integrate W3 — the four-tab bar behind house-first
```

Every W4 branch is cut from **`1cb71c346`**. W3's fix round is on main; there is no in-flight
W3 branch to wait for (§5 proves the W3 branches and worktrees are gone).

## 2. Worktrees

Created unsandboxed from `main` @ `1cb71c346`, each with `Secrets.swift` copied in from the main
checkout (`.gitignore:53` — ignored; `git status --porcelain apps/mobile/Patina` is empty in all
three). The `.codex/worktrees/agent-*/` prefix is covered by `.gitignore:76`, verified:

```
$ git check-ignore -v .codex/worktrees/agent-dr-w4-h1
.gitignore:76:.codex/worktrees/agent-*/	.codex/worktrees/agent-dr-w4-h1
```

| Lane | Worktree | Branch | HEAD |
|---|---|---|---|
| H1 · rooms with real numbers | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-h1` | `daily-return/w4-h1` | `1cb71c346` |
| H2 · saved rows, decays, timeline, seat, story date | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-h2` | `daily-return/w4-h2` | `1cb71c346` |
| D · backend | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-d` | `daily-return/w4-d` | `1cb71c346` |

**Base build proven** from the fresh h1 worktree, so no lane inherits a broken tree:

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 1
** BUILD FAILED **   (3 failures, no `error:` line — SwiftCompile of the batch that
                      contains the generated Secrets/AppConfiguration stamp group)
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 2, identical command
** BUILD SUCCEEDED **
```

⚠ **Run the first `ios-gate.sh build` in your worktree twice.** Reproduced here exactly as W1b and
W2 recorded it. Re-run rather than diagnose.

### 2a. DerivedData — a correction to the received hazard

W1b/W2 recorded DerivedData as *shared across worktrees*. Measured this wave, it is **not**: Xcode
hashes the `.xcodeproj` path, so every worktree gets its own directory.

```
$ xcodebuild -project <tree>/apps/mobile/Patina/Patina.xcodeproj -scheme Patina -showBuildSettings …
h1   → …/DerivedData/Patina-bhtkollvgevvzdfpydqaotgiaotg/Build/Products
h2   → …/DerivedData/Patina-hexcjlnpuklxazaqlzngoepdwdcx/Build/Products
d    → …/DerivedData/Patina-fzpldmvusssjnrgtjkjjupnjlgxi/Build/Products
main → …/DerivedData/Patina-ajfhwbevupxsqdedmlvdzyifsofs/Build/Products
```

So cross-lane contention is **not** the explanation for a bare `** BUILD FAILED **` in W4. Two
concurrent builds *inside one worktree* still contend — do not run a gate while another gate on the
same tree is running. A `** BUILD FAILED **` with no `error:` line is still worth one re-run before
diagnosis (§2's stamp phase), but if it repeats, it is a real failure: read the log.

## 3. Simulators

Cloned from the review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro). Same procedure
W2's steward used: the review device was **shut down, cloned twice, and booted again** — `xcrun
simctl clone` refuses a booted source (`SimError 405`). Downtime was seconds, before any walker was
active; the clones are true clones (same installed apps and data as the review device at clone time).

| Lane | Name | UDID |
|---|---|---|
| H1 | `dr-w4-h1` | `BA5B70BC-07A5-4F40-94A3-B6A7A307205B` |
| H2 | `dr-w4-h2` | `D6DACCE3-E865-4AB5-80FF-F7C49F16736F` |

```
$ xcrun simctl list devices | grep -iE 'dr-w4|973D1724'
    dr-w4-h1 (BA5B70BC-07A5-4F40-94A3-B6A7A307205B) (Booted)
    dr-w4-h2 (D6DACCE3-E865-4AB5-80FF-F7C49F16736F) (Booted)
    iPhone 17 Pro (973D1724-90BF-4A0A-B02D-481D561547B3) (Booted)
```

The review device `973D1724-…` stays the **walker's**. D gets no clone (no iOS surface).

⚠ **Always pass `-destination 'platform=iOS Simulator,id=<your UDID>'` to `xcodebuild test`.**
`ios-gate.sh`'s own `sim_destination()` (`scripts/ios-gate.sh:39-47`) picks the **first** available
`iPhone (17|16|Air)` by `grep … | head -1` — with three iPhone 17 Pros booted it will land on
whichever the list yields, quite possibly the walker's review device. `ios-gate.sh unit` and
`ios-gate.sh all` therefore stay **steward-only**, as does `lint-delta` (it adds temp worktrees to
the shared `.git`). Lanes run `ios-gate.sh build` plus an explicit
`xcodebuild test -only-testing:PatinaTests -destination 'platform=iOS Simulator,id=<UDID>'`.
`-DeploymentTarget local` on every simulator **launch**.

## 4. OWNED-FILE MAP

Paths are relative to `apps/mobile/Patina/` for iOS rows and to the repo root for D's.
Everything not listed here is **unowned**: no lane touches it without an integration note.

### H1 — the house: rooms with real numbers

| Own | Notes |
|---|---|
| `Patina/Features/Rooms/**` | 16 files today, incl. `Views/RoomProjectView.swift`, `Views/RoomSettingsView.swift`, `Views/YourSpacesView.swift`, `Components/RoomBudgetBar.swift`, `BudgetAssessment.swift`. M4's room screen lives here. |
| `Patina/Features/Home/Views/YourHouseRail.swift` | Already reads `budget_cents`/`committed_cents` off `RemoteProjectRoom` (`:79-80`); W4 gives it real local numbers too. |
| `Patina/Features/Home/Views/RoomHeroCard.swift` | The full-width room card of M2 block 3 — H1's, not H2's. |
| `Patina/Features/Home/Views/AddToRoomSheet.swift`, `AddedToRoomToast.swift` | The room-write path. |
| `Patina/Core/Persistence/RoomStore.swift` | |
| `Patina/Core/Network/RoomsAPIClient.swift` | See §4a — H2 has a predicted need in this file. |
| `Patina/Core/Models/RoomModel.swift`, `RoomSummary.swift` | ⚠ `RoomModel` is `@Model`; a new field **must carry a default** or older stores fall back to in-memory (`feedback_ios_device_automation_traps_2026_08_25`). `budgetCents` does not exist today — H1 adds it. |
| Suites: `RoomHeroCardTests`, `YourHouseRailTests`, `RoomCreationCoordinatorTests`, `FallbackRoomDraftTests` | plus any new H1 suite |

**`Features/Home/Views/StartWithARoom*.swift` does not exist.** The guest two-act block is inside
`YourHouseRail.swift` (only file matching `"Start with a room"`), which H1 owns — no new file is
required by the map.

### H2 — what the app remembers: saved rows, decays, timeline, seat, story date

| Own | Notes |
|---|---|
| `Patina/Features/Collections/**` | `CollectionsViewModel.swift`, `CollectionsView.swift`, `LocalStoreClaimSheet.swift` — the Saved surface that prints save date · room · note. |
| `Patina/Core/Models/TableItemModel.swift` | Already carries `savedAt`, `notes`, `roomId`, `priceInCents`. Same `@Model` default rule as above for anything new. |
| `Patina/Features/DesignServices/**` | 14 files — the request/match surfaces. |
| `Patina/Services/DesignServices/DesignRequestStatusService.swift` | **Decay 1**: `isVisibleForPromotion(now:window: = 14 * 86_400)` at `:353` (see also `:97-100`, `:342-351`, `:418`). |
| `Patina/Core/State/DesignerRelationship.swift` | **Decay 2**, added to the map: `:73` documents the same 14-day window as the reason W1a switched the resolver to `liveLead`. The brief's "two 14-day windows" cannot be closed without this file. |
| `Patina/Features/Projects/**` | 6 files. The phases timeline already renders (`ProjectDetailView.swift:152-202`, `phasesSection`) — W4's work is the surfacing/ordering the plan names, not a from-scratch build. `Core/Models/PhaseDisplay.swift` is H2's too (phase vocabulary; keep in sync with `packages/types/src/phase-config.ts`). |
| `Patina/Features/Home/Views/YourDesignerSeat.swift` | The W2 walk carry-over: pick the project carrying the most urgent NEEDS YOU item, else the most recently updated active project. The current pick is `projects.first { … }` at `:45`. |
| `Patina/Features/Home/Views/DailyRoomView.swift` | **Granted to H2, not frozen** — the second half of the same carry-over is `DailyRoomView.swift:444` (`badges.projects.first { !StudioQueueBuilder.projectIsArchived($0) }`), the value fed to the seat. H1 files an integration note for anything it needs in this file. |
| `Patina/Features/Home/Views/DailyStoryCard.swift`, `DailyStoryDetailView.swift`, `HomeStoryRetryRow.swift` | The publish-date chip (`Aug 25 · 4 min` in `mock/fragments/b-M2.html`). |
| `Patina/Core/Models/DailyStory.swift` | `publishedAt` does not exist on the model today (`:11-25`) — H2 adds it. |
| `Patina/Core/Network/EditorialStoriesAPIClient.swift` | decode `published_at`; the `published_at desc, sort_order desc` order is already ruled (B §2). |
| `Patina/Services/Auth/**` | `AuthService.swift`, `ProfileService.swift`, `AppleSignInNonce.swift` — the `profiles.last_seen_at` mirror call. The column exists (00537); nothing writes it yet. |
| Suites: `DesignerSeatTests`, `HouseRecordDesignerTests`, `StoryOrderTests`, `SavedItemMirrorTests`, `DesignRequestCoordinatorLiveStatusTests`, `DesignerRelationshipTests`, `DesignRequestStageTests`, `ProjectsAPIClientTests`, `RoomlessDesignRequestTests` | plus any new H2 suite |

### D — backend

| Own | Notes |
|---|---|
| `supabase/migrations/00539_*.sql` | **Provisional and conditional** — see §6. |
| `supabase/tests/**` | pgTAP |
| `packages/supabase/src/database.types.ts` | regen if and only if D changes schema |
| `supabase/seed/**` | notably `products.sql`, `decisions.sql`, `invoices.sql`, `designer-clients.sql` |
| Sole owner of the local database | `supabase db reset` + seeds for the whole wave. No other lane resets. |

### FROZEN in W4 — nobody edits without an integration note

`Patina/Features/Home/Models/HouseRecord.swift` and `TodayExperience.swift`,
`Patina/Features/Home/Views/{HouseRecordCard,NewThisWeekRail,DailyGreetingHeader,TodayModules}.swift`,
`Patina/Features/Home/ViewModels/{DailyRoomViewModel,RecordRefresh,RecordOwner}.swift`,
`Patina/Core/Persistence/{RecordSnapshotStore,LastSeenStore}.swift`,
`Patina/Services/Badges/BadgeCountService.swift`,
`Patina/Features/Companion/**`, `Design/Components/CompanionSafeArea.swift`,
`ContentView.swift` and the W3 tab-bar root (`Patina/App/**`, `RouteTabTable`, `PatinaTabBar`),
`Patina/Features/Profile/**`, `Patina/Features/{Proposals,Invoices,Budget,Decisions}/**`,
`Patina.entitlements`, `Patina.xcodeproj/project.pbxproj` (**new files: tell the steward — a
pbxproj edit from two lanes at once is the wave's worst merge**),
and every suite not granted above (`HouseRecord*Tests`, `RouteTabTableTests`, `HouseFirstRootTests`,
`FirstLaunchTourTests`, `Companion*Tests`, the money and Scan suites).

### 4a. One predicted cross-lane need, named now rather than discovered late

`RemoteSavedItem` (`Core/Network/RoomsAPIClient.swift:49-59`) decodes `id, room_id, user_id,
product_id, name, image_url, price_in_cents, source, created_at`. It does **not** decode `notes`
or `price_cents_at_save`, both of which exist on the table (`00055:29`, `00535:21`). H2's saved-row
"date · room · note" cannot be drawn from the server leg without them, and the file is H1's.

Recommended to Fable (a ruling, not a steward decision): put "add `notes` and `price_cents_at_save`
to `RemoteSavedItem`" in **H1's** brief as a first commit, so H2 is not blocked behind an
integration note. Otherwise H2 files `waves/w4/h2-notes.md` and the steward applies it at merge.

## 5. Housekeeping — W3 leftovers

All already retired before this setup ran; nothing for this steward to delete.

```
$ ls -1 /Users/kody/Code/patina-merged/.codex/worktrees/
agent-cifix  agent-dr-w4-d  agent-dr-w4-h1  agent-dr-w4-h2
agent-mediatests  agent-repoint  agent-splatcam        ← no agent-dr-w3-*

$ git branch --list 'daily-return/*'
(empty before this setup; only the three w4-* branches after it)

$ xcrun simctl list devices | grep -i 'dr-'
(only the two dr-w4-* clones this setup created — no dr-w3-n1|n2|n3, no dr-w3-int)
```

W3's work is on `main` as `1cb71c346`. The four unrelated worktrees (`agent-cifix`,
`agent-mediatests`, `agent-repoint`, `agent-splatcam`) and the `.claude/worktrees/*` trees belong to
other programs — **do not touch them**.

## 6. Migration numbering — tip 00538, D provisional 00539, probably unminted

```
$ ls supabase/migrations | tail -3
00537_house_on_today.sql
00538_client_account_anonymize.sql
_pending                        ← _pending/00106_drop_client_messages.sql, unapplied, stays so
```

**Tip = 00538.** `00539` is free on every branch and every ref:

```
$ git log --all --oneline --diff-filter=A --name-only -- 'supabase/migrations/0053*' 'supabase/migrations/0054*'
… highest added anywhere: supabase/migrations/00538_client_account_anonymize.sql
```

`00532` is the sibling Field Companion program's (`00532_field_capture_visit_and_suggestion.sql`,
on a branch, not on main). The program reserves **00533–00540**.

**D's number is `00539`, and it is conditional.** The build plan's W4 row says *"No new migration
(00537 carried the columns)"*, and that is confirmed against the tree, not assumed:

- `rooms.budget_cents` — **00537 §1**, exists.
- `profiles.last_seen_at` — **00537 §2**, exists, and *nothing writes it yet* (that write is H2's).
- `saved_items` de-duplication + two partial unique indexes — **00537 §3**, exists.
- saved-row date · room · note — `saved_items.created_at`, `room_id`, `notes` all exist since
  **00055:22-30**; `price_cents_at_save` since **00535:21**. No column is missing. The gap is
  client-side decode (§4a).
- `project_rooms` client SELECT — already granted at **00066:249-253**; W2's steward proved it
  live against the local database and 00537's header records the proof.

So D should mint `00539` **only if the wave proves a real server gap**, and must say in its report
whether it minted or not. If D does not mint, **W5's backend keeps `00539`** as the build plan
reserves; if D does, W5 shifts to `00540` and the plan's W5 row needs the one-word edit.
Re-check `ls supabase/migrations | tail` immediately before merge either way; a renumber after a
local apply means D re-runs `supabase db reset` for the wave.

## 7. Standing constraints the lanes inherit (not restated by each brief)

- **Both roots.** The tab bar is behind `house-first`; everything W4 builds must render on the
  flag-on root **and** the flag-off W2 root. Walk both.
- **Honesty (C5).** A number drawn is a number stored. `$3,590 saved · your range $5K+` prints the
  quiz's own band label, never a derived figure. A fit line prints numbers, never a promise. **No
  decay deletes a fact** — a matched request stays until it resolves; the two 14-day windows come
  out, they are not shortened. Brand voice (C6), canonical names (C4).
- **Room budget is labelled, never a spend figure**: `$2,400 in saved pieces · budget $9,000`
  (B §3). Where a project owns the room the stat reads `committed_cents` and is labelled as such
  (B M4). No budget → the ghost act, never a `—`.
- Migrations: `REVOKE EXECUTE … FROM PUBLIC, anon` on every new function (and from `authenticated`
  for SECURITY DEFINER service functions, GRANT `service_role` only); RLS `TO authenticated`; never
  `supabase migration new`.
- Git: `mkdir .writer.lock.d` at start, `rmdir` at report; pathspec commits only, never `git add -A`;
  no push from lanes; `git worktree add`/`git merge`/`simctl`/`xcodebuild`/`supabase` run unsandboxed.
  Never run git in the main checkout except read-only.

## 8. Open items W4 inherits (context for the lane briefs — not tasks this file assigns)

From `waves/w2/` (build plan "W2 — DONE" + `r2-notes.md` §4):
1. The designer seat picks `projects.first` by `updated_at`; it must pick the project carrying the
   most urgent NEEDS YOU item — **H2**, §4.
2. `Leah added two pieces to the proposal.` has no producer (a proposal-revision event) — not
   assigned; W4 or later.
3. The story card's publish-date chip needs `DailyStory.publishedAt` — **H2**, §4.
4. Kody's, not a lane's: `designer_clients.client_name/email` retention on closure; `· due Sep 1`
   vs `· Sep 1` (one word).

From `waves/w3/integration.md` §6–§7 and `walk.md`:
5. **`RouteTabTable.rootRoute(for: .studio) == .profile`** — W3's steward wrote both the
   canon-digest paragraph and the five-file work order, and said explicitly *"W4 reads that funnel —
   this wants a ruling before W4, not after."* **Fable must rule before H2 touches the timeline
   analytics.** The route table is FROZEN to lanes either way.
6. **The three Sanity tour bodies are still unpublished** (`waves/w3/n3-sanity-copy.md`); Sanity wins
   over the fallback, so the flag-on root still introduces itself as "Daily Room". Owed by Kody
   **before `house-first` is enabled for anyone** — a walker on the flag-on root will see it.
7. `MoneyScreenChrome.bottomClearance` and the two Studio doors on the flag-on root ride out of W3
   with their exits recorded (`integration.md` §6a/§6b). Money screens are FROZEN in W4.
8. Flag-off tour reads `Step 1 of 2` while declaring three (`n3-fix-log.md`) — Fable can rule it in
   one commit; no lane owns it.
9. The guest session does not survive a relaunch (SP-06 territory) — a walk hazard, not a W4 task.
10. `profiles.help_state` is cross-device authoritative: reinstalling does not reset the tour. The
    clearing SQL is in `waves/w3/n3-sanity-copy.md` and the W4 walker will need it.

Pre-existing and still open, relevant to a W4 walk: the Companion orb overlaps card text at XXL was
W2's one FAIL and W3 moved the Companion into the bar's trailing slot on the **flag-on** root only —
the flag-off root keeps the overlap. Expect it; it is not W4's to fix.

## 9. Leave state at handoff

Three worktrees clean at `1cb71c346` with `Secrets.swift` in place; two clones and the review device
booted; no branch pushed; no commit made by this steward; `.writer.lock.d` not taken (setup only).
