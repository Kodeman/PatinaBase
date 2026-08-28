# W2 — Steward setup record (The Record)

Written by the W2 setup steward, 2026-08-27, before any lane started.
This file is **authoritative for owned files**. A lane needing a change in another lane's file
writes it into `waves/w2/<lane>-notes.md` as an integration note; the integration steward applies it.

---

## 1. Base

```
$ git -C /Users/kody/Code/patina-merged log --oneline -1 main
e9da02569 chore(daily-return): integrate W1b — planks SP-02…SP-20, migrations 00533–00536, client-portal AASA + piece page

$ git show --no-patch --format='%h parents=%p' main
e9da02569 parents=e5177647a 8bb98ecd9
```

Every W2 branch is cut from **`e9da02569`**.

The W1b walk ran on `6d4a0ba5c`; `main` carries four more iOS files on top of it
(`git diff --stat 6d4a0ba5c..main -- apps/mobile/Patina` → `CompanionSafeArea.swift`,
`CompanionOverlay.swift`, `Features/Money/MoneyScreenChrome.swift`,
`PatinaTests/InvoicesMoneyRailTests.swift`, 4 files / +98 −3) — the SP-19 Companion-yield fix the
walk's re-check verified. Nothing else in the app changed between the walked tree and this base.

## 2. Worktrees

All four created unsandboxed from `main` @ `e9da02569`, each with `Secrets.swift` copied in from the
main checkout (`.gitignore:53` — it is ignored, `git status --porcelain apps/mobile/Patina` is empty
in each). The path prefix `.codex/worktrees/agent-*/` is covered by `.gitignore:76`, verified:

```
$ git check-ignore -v .codex/worktrees/agent-dr-w2-r1
.gitignore:76:.codex/worktrees/agent-*/	.codex/worktrees/agent-dr-w2-r1
```

| Lane | Worktree | Branch | HEAD |
|---|---|---|---|
| R1 · record data | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r1` | `daily-return/w2-r1` | `e9da02569` |
| R2 · record UI | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r2` | `daily-return/w2-r2` | `e9da02569` |
| R3 · hygiene (Q4) | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r3` | `daily-return/w2-r3` | `e9da02569` |
| D · backend | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-d` | `daily-return/w2-d` | `e9da02569` |

**Base build proven** from a fresh worktree (r1), so no lane inherits a broken tree:

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 1
** BUILD FAILED **   (3 SwiftCompile failures, no `error:` line — the generated GitCommit.swift stamp)
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 2, identical command
** BUILD SUCCEEDED **
```

⚠ **Run the first `ios-gate.sh build` in your worktree twice.** The first invocation in a fresh
worktree fails on the `Stamp Git SHA` phase's generated `GitCommit.swift` with no `error:` line.
Re-run rather than diagnose. This reproduced exactly as W1b recorded it.

⚠ **DerivedData is shared.** `ios-gate.sh build` writes to the default
`~/Library/Developer/Xcode/DerivedData/Patina-bwrfezqnrrmyedcotaxusydkljij`, so all four trees
contend for one directory (W1b's `integration.md` §5b hazard). For your `xcodebuild test` runs pass
**`-derivedDataPath .build/dd`** inside your own worktree. A transient `** BUILD FAILED **` with no
`error:` line is contention — re-run.

## 3. Simulators

Cloned from the review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro), all booted.

| Lane | Name | UDID |
|---|---|---|
| R1 | `dr-w2-r1` | `2F0E2EF1-1D2F-484C-A4F0-C327122B6DF6` |
| R2 | `dr-w2-r2` | `0B472471-1E2E-4C04-825A-8668695264C1` |
| R3 | `dr-w2-r3` | `3A0CDA6E-6752-403C-88B8-FB0CC5C897E6` |

The review device `973D1724-…` stays the **walker's**; no lane targets it.

⚠ **Deviation, recorded.** `xcrun simctl clone` refuses a booted source
(`SimError code=405: Unable to clone device in current state: Booted`). Unlike W1b — which worked
around it by creating fresh devices of the same type — this steward **shut the review device down,
cloned three times, and booted it again**. The clones are therefore true clones (same installed apps
and data as the review device at clone time), and the review device is booted and unchanged. Total
downtime of the review device: under a minute, before any walker was active.

Lane gate destination: `-destination 'platform=iOS Simulator,id=<your UDID above>'`.

## 4. Housekeeping — W1b leftovers

Nothing to retire. The W1b lane worktrees, branches and simulators were already removed by the
orchestrator before this setup ran:

```
$ ls -1 /Users/kody/Code/patina-merged/.codex/worktrees/
agent-cifix  agent-dr-w2-d  agent-dr-w2-r1  agent-dr-w2-r2  agent-dr-w2-r3
agent-mediatests  agent-repoint  agent-splatcam        ← no agent-dr-w1b-*

$ git branch --list 'daily-return/*'
(only the four w2-* branches this setup created)

$ xcrun simctl list devices | grep -i 'dr-'
(exit 1 — no dr-w1b-* clones)
```

No `git merge-base --is-ancestor` check was possible or needed: the W1b branches no longer exist.
Their work is on `main` as the merge commit `e9da02569` (§1).

The four unrelated worktrees (`agent-cifix`, `agent-mediatests`, `agent-repoint`, `agent-splatcam`)
belong to other programs — **do not touch them**.

---

## 5. The `project_rooms` question — SETTLED. **Do not write the policy.**

`build-plan.md`'s W2 R2 row says "verify first whether 00066:249-253 already grants clients SELECT on
`project_rooms`; write 00537 only if a real blocker exists", and `build-plan-critique.md` M4 raises
the same doubt. Settled here, against the local database, before the lanes started.

### 5a. What the migrations say

`supabase/migrations/00066_proposal_project_flow_v2.sql:248-253`:

```sql
CREATE POLICY "Clients can view their project rooms"
  ON project_rooms FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.client_id = auth.uid())
  );
```

`00316_studio_shared_workspace_rls.sql:148` adds `project_rooms_studio_rw` (`TO authenticated`,
studio co-members). Those two files plus `00066:243` (`Designers manage their project rooms`) are the
**only** `CREATE POLICY … ON project_rooms` statements in all 491 migrations
(`grep -rn 'ON project_rooms' supabase/migrations/*.sql`). Nothing later drops or narrows the client
policy.

### 5b. What the live local database says

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
 label                            | v
----------------------------------+---
 total project_rooms (superuser)  | 2
 client projects                  | 3
 project_rooms on client projects | 2
```

Policies as they actually exist (`pg_policy`): the two `00066` policies have `polroles = {0}` —
**PUBLIC**, which includes `authenticated`; `project_rooms_studio_rw` is `TO authenticated`.
Table grants: `authenticated` holds `SELECT` (as do `anon`, `postgres`, `service_role`).

### 5c. The proof, as `client@patina.dev`

`client@patina.dev` = `a0000000-0000-0000-0000-000000000005` (`auth.users`).

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select current_user, auth.uid();
select count(*) from public.project_rooms;
```
```
 current_user  |                 uid
---------------+--------------------------------------
 authenticated | a0000000-0000-0000-0000-000000000005

 visible_project_rooms
-----------------------
                     2

                  id                  |    name     |              project_id
--------------------------------------+-------------+--------------------------------------
 b0000000-0000-0000-0000-0000000d2c0a | Dining Room | b0000000-0000-0000-0000-0000000000d1
 b0000000-0000-0000-0000-0000000d2c0b | Living Room | b0000000-0000-0000-0000-0000000000d1
```

**The client sees 2 of 2 — every project room on their own project, and nothing else.**

Negative controls, so the pass is not an artefact of an open table:

| Actor | Visible `project_rooms` |
|---|---|
| `authenticated`, sub = manufacturer `…006` | **0** |
| `anon` | **0** |

### 5d. Ruling for lane D

**Lane D writes no `project_rooms` policy in 00537.** The client-scoped SELECT policy exists, is
reachable by `authenticated` through PUBLIC role membership, is backed by a table grant, and filters
correctly in both directions. Hardening it `TO authenticated` would be a cosmetic re-mint with a
behaviour-identical result; the plan's own instruction is to drop the migration when no blocker
exists, and no blocker exists.

If R2's rail cannot read rooms, the cause is on the client (no fetch path in
`Core/Network/ProjectsAPIClient.swift`) or in the column, **not** in RLS — R2 raises it as an
integration note rather than asking for a policy.

### 5e. Two adjacent facts R2 and D both need

- **`public.rooms` (the "local rooms" half of the rail) is empty in the seed** — 0 rows total, and 0
  visible to the client. Its policies are `Users can manage their rooms` (ALL, `auth.uid() = user_id`)
  and `Designers can view client rooms`. The client's own rooms are SwiftData-local until something
  syncs them. **The walk's "her project rooms" line is carried by `project_rooms` only** unless the
  walker types a room first.
- Column reality on the local DB (`information_schema.columns`), so nobody mints a no-op:

| Column | Exists? | Consequence |
|---|---|---|
| `rooms.budget_cents` | **no** | 00537 mints it |
| `profiles.last_seen_at` | **no** | 00537 mints it |
| `saved_items.price_cents_at_save` | yes (00535) | do not re-add |
| `saved_items.room_id` | yes | do not re-add |
| `products.deleted_at` | yes | the withdrawn-piece row is readable |
| `products.published_at` | yes (00533) | `NEW THIS WEEK`'s filter has its timestamp |
| `projects.current_phase` | yes | the empty-queue Next Move can name the phase |

`saved_items` today carries **no unique index** (`saved_items_pkey`, `idx_saved_items_user`,
`idx_saved_items_room`, `idx_saved_items_product`, `idx_saved_items_created`) — Fable's W1b ruling 4
(de-duplication + two partial unique indexes) is unbuilt and lands in 00537 as planned.

---

## 6. Migrations

```
$ ls -1 supabase/migrations | tail -3
00535_saved_items_price_snapshot.sql
00536_client_side_server_gaps.sql
_pending

$ ls -1 supabase/migrations | tail -5
00531_restore_extension_execute_authenticated.sql
00533_piece_detail_contract.sql
00534_client_attention_notifications.sql
00535_saved_items_price_snapshot.sql
00536_client_side_server_gaps.sql
```

Applied locally (`supabase_migrations.schema_migrations`, newest first): `00536, 00535, 00534,
00533, 00531`. `_pending/00106_drop_client_messages.sql` stays unapplied.

**Tip = 00536.** `00532_field_capture_visit_and_suggestion.sql` is held locally by the sibling Field
Companion program (present only in `.claude/worktrees/field-companion-w3`, on no branch here and not
applied to this database) — it sits **below** our range and cannot collide.

**Lane D's provisional numbers:**

| Number | Content | Source |
|---|---|---|
| **00537** | `rooms.budget_cents`; `profiles.last_seen_at`; `saved_items` de-duplication + two partial unique indexes — `(user_id, product_id) WHERE room_id IS NULL` and `(user_id, product_id, room_id) WHERE room_id IS NOT NULL`, de-dup keeping the earliest row (W1b ruling 4). **No `project_rooms` policy** (§5d) | `build-plan.md` W2 Backend row; `waves/w1b/rulings-fable.md` #4 |
| **00538** | `client_account_anonymize` — rewrite `purge_client_account` to anonymize the client and detach the auth user while retaining every designer-owned record; `supabase/tests/auth/account_purge_test.sql` asserts retention | `waves/w1b/rulings-fable.md` #2 |

Both are **provisional**. Lane D re-runs `ls -1 supabase/migrations | tail -5` immediately before the
integration merge and renumbers on collision; a renumber after a local apply means D runs
`supabase db reset` for the wave. W5's migration moves to **00539** per `rulings-fable.md` #2.

**Lane D owns the local database for this wave.** No other lane runs `supabase db reset` or seeds.
The stack is currently reset and seeded from the W1b integration branch and is at 00536.

---

## 7. OWNED-FILE MAP

Paths are relative to `/Users/kody/Code/patina-merged` unless prefixed `P/`, which means
`apps/mobile/Patina/Patina/`. `T/` means `apps/mobile/Patina/PatinaTests/`.

**R1 and R2 both live in the Home tree. The seam is: R1 owns models, stores, services and network
clients; R2 owns views and view-models. R1 exposes `HouseRecord` + the two stores; R2 consumes them.**
R1 lands first at integration so R2's consumption compiles against a real type.

### R1 — record data

| File | State |
|---|---|
| `P/Features/Home/Models/HouseRecord.swift` | **new** |
| `P/Core/Persistence/RecordSnapshotStore.swift` | **new** |
| `P/Core/Persistence/LastSeenStore.swift` | **new** |
| `P/Services/Badges/BadgeCountService.swift` | exists |
| `P/Features/Profile/ViewModels/StudioQueueBuilder.swift` | exists |
| `P/Core/Network/DecisionsAPIClient.swift` | exists |
| `P/Services/API/ProposalsAPIClient.swift` | exists — ⚠ **corrected path**, see below |
| `P/Core/Network/ProjectsAPIClient.swift` | exists |
| `P/Core/Models/**` | any new row model; existing files there are R1's only where R1 adds the row type |
| `apps/mobile/Patina/Patina/Patina.entitlements` | exists — R1 adds the App Group `group.cloud.patina.app` (M16; today the file holds only `aps-environment`, `associated-domains`, `applesignin`) |
| `T/**` for all of the above, incl. `AttentionCountTests.swift`, `DailyRoomFeedMappingTests.swift` where they cover R1's types | exists |

⚠ **Path correction.** The brief names `Core/Network/ProposalsAPIClient.swift`. **There is no such
file.** The proposals client is `P/Services/API/ProposalsAPIClient.swift` (verified: `Core/Network/`
holds `Decisions`, `EditorialStories`, `Messaging`, `NetworkError`, `Product`, `Projects`, `Rooms`,
`Roster`, `SupabaseClient` only). R1 edits the real path; it creates no new file in `Core/Network`.

### R2 — record UI

| File | State |
|---|---|
| `P/Features/Home/Views/HouseRecordCard.swift` | **new** |
| `P/Features/Home/Views/YourDesignerSeat.swift` | **new** |
| `P/Features/Home/Views/YourHouseRail.swift` | **new** |
| `P/Features/Home/Views/NewThisWeekRail.swift` | **new** |
| `P/Features/Home/Views/DailyRoomView.swift` | exists |
| `P/Features/Home/Views/DailyGreetingHeader.swift` | exists |
| `P/Features/Home/Views/TodayModules.swift` | exists |
| `P/Features/Home/Views/DailyStoryCard.swift` | exists |
| `P/Features/Home/ViewModels/**` (`DailyRoomViewModel.swift`) | exists |
| `P/Features/Home/Models/TodayExperience.swift` | exists |
| `P/Core/Network/EditorialStoriesAPIClient.swift` | exists — the `published_at desc, sort_order desc` reorder only |
| `T/**` for the above | exists |

Plus the W1b carry-over Fable assigned to R2 (§8).

### R3 — hygiene (Q4 orphan retirement)

`AddToRoomSheet.swift` and `AddedToRoomToast.swift` are **LIVE and excluded** — they are not R3's and
must not be deleted.

| File | State |
|---|---|
| `P/Features/Home/Views/DailyRoomStateBlocks.swift` | exists — **also holds `struct HomeStudioBlock` (line 25)**; there is no `HomeStudioBlock.swift` |
| `P/Features/Home/Views/StudioHubSection.swift` | exists |
| `P/Features/Home/Views/MarketplaceLinksSection.swift` | exists |
| `P/Features/Home/Views/WorkWithDesignerCTA.swift` | exists |
| `P/Features/Home/Views/RoomChipRail.swift` | exists |
| `P/Features/Home/Views/RoomContextBar.swift` | exists |
| `P/Features/Home/Views/DailyFeedEmptyModule.swift` | exists |
| `P/Features/Home/Views/DailyProductCard.swift` | exists |
| `P/Features/Home/Views/DailyProductDetailView.swift` | exists |
| `P/Features/Home/Views/ContinueScanCard.swift` | exists |
| `P/Features/DesignServices/DesignRequestStatusCard.swift` | exists — ⚠ **corrected path**, not `Features/Home/Views/` |
| `artifacts/ios-daily-return-2026-08-26/research/11-canon-digest.md` §5 | exists — record the retirement |
| tests referencing the set | **none exist today** — see below |

⚠ **Two path corrections.** `HomeStudioBlock` is a struct inside `DailyRoomStateBlocks.swift`, not a
file (`grep -rn HomeStudioBlock` → `DailyRoomStateBlocks.swift:25,180,188` only).
`DesignRequestStatusCard.swift` is in `Features/DesignServices/`, beside `DesignRequestResumeBanner.swift`.

⚠ **No test file names any of the twelve.** `grep -rn` over `PatinaTests` and `PatinaUITests` for all
twelve symbols returns nothing, and no UI test uses their accessibility identifiers
(`DailyRoomView.DesignRequestStatusCard`, `DailyRoomView.DesignRequestResumeBanner`). R3's "the tests
that reference them" set is **empty at the base**; if a deletion breaks a suite it will be through a
view R3 re-homes, not a named reference. R3 still owns whatever it breaks.

### D — backend

| File | State |
|---|---|
| `supabase/migrations/00537_*.sql` | **new** |
| `supabase/migrations/00538_*.sql` | **new** |
| `supabase/tests/**` (incl. `supabase/tests/auth/account_purge_test.sql`) | exists |
| `packages/supabase/src/database.types.ts` | exists — regenerate with `pnpm db:generate` |
| `supabase/functions/delete-account/**` | exists — only if the handler needs 00538's contract |

Gates: `supabase db reset` + `./scripts/run-sql-tests.sh` (pgTAP), `deno test` where tests exist,
`pnpm db:generate` with an empty diff at the end.

### Unowned in W2 — nobody edits these without an integration note

`P/ContentView.swift`, `P/Design/Components/CompanionSafeArea.swift`, `P/Features/Companion/**`,
`P/Features/Profile/Views/StudioHubView.swift`, `P/Features/Proposals/**`, `P/Features/Invoices/**`,
`P/Features/Decisions/**`, `P/Features/Budget/**`, `P/Core/Network/RoomsAPIClient.swift`,
`P/Core/Network/RosterAPIClient.swift`, `P/Core/State/**` — **except** where §8 assigns a carry-over.

---

## 8. W1b carry-overs — files outside the brief's map, assigned per `waves/w1b/rulings-fable.md`

The brief's owned sets do not cover the two carry-overs the W2 row of `build-plan.md` inherits.
`rulings-fable.md` names the lane for each, so they are assigned here on that ruling — flagged
because they widen the map. **Fable: confirm or reassign.**

**8a · R2 — fold `.moneyScreenTopBand()` into `PatinaScreenChrome` (rulings-fable #1).**
One top-band pattern; `PatinaScreenChrome` owns the status-bar reservation and every pushed screen
reads the one modifier. Files:

- `P/Design/Components/PatinaScreenChrome.swift` (the receiving modifier)
- `P/Features/Money/MoneyScreenChrome.swift:40` (`func moneyScreenTopBand()` — the source)
- nine call sites: `Features/Invoices/Views/InvoiceListView.swift:27`,
  `Features/Invoices/Views/InvoiceDetailView.swift:44`,
  `Features/Projects/Views/ProjectDetailView.swift:54`,
  `Features/Decisions/Views/DecisionDeferSheet.swift:75`,
  `Features/Decisions/Views/DecisionListView.swift:26`,
  `Features/Decisions/Views/DecisionDetailView.swift:54` and `:447`,
  `Features/Proposals/Views/ProposalDetailView.swift:39`

No other W2 lane owns any of these, so the widening creates no collision. `InvoicesMoneyRailTests`
and `ProposalsMoneyRailTests` cover this surface and are R2's to keep green for the duration.

**8b · R3 — the accepted-but-unsigned seal glyph (rulings-fable #6).**
`checkmark.seal.fill` is reserved for a signed proposal; accepted-but-unsigned shows
`checkmark.circle` with the "Accepted" label. One glyph, one site:
`P/Features/Proposals/Views/ProposalDetailView.swift:83`.

⚠ Both 8a and 8b touch `ProposalDetailView.swift` (line 39 vs line 83). **R2 and R3 must not edit it
in the same window.** Assignment: **R2 makes the `:39` chrome edit; R3 makes the `:83` glyph edit and
files it as an integration note if R2's branch has already changed the file.** The integration steward
merges R2 before R3 for this file.

**8c · the walker, not a lane:** re-shoot the proposal detail's `Sign proposal` clearance and
decision / Budget / invoice detail at Dynamic Type XXL, PASS/FAIL (rulings-fable #8).

---

## 9. Cross-lane hazards, named before anyone hits them

1. **`AttentionCountTests.everyConsumerReadsTheOneHint` reads source text by path.**
   `T/AttentionCountTests.swift:205-227` opens `Features/Profile/Views/StudioHubView.swift`,
   `Features/Companion/Views/CompanionOverlay.swift` and **`Features/Home/Views/DailyRoomView.swift`**
   and asserts each contains `BadgeCountService.shared.studioHint` or `badges.studioHint`, and
   contains neither `shared.attentionHint` nor `badges.attentionHint`.
   **R2 recomposes `DailyRoomView.swift` and must keep `badges.studioHint` in it, at that path.**
   Renaming or moving that file fails a test R1 owns. R1 owns the suite; R2 owns the file it reads.
2. **`DailyRoomFeedMappingTests`** covers `DailyRoomViewModel` mapping (R2) over models R1 changes.
   Whoever's change reddens it fixes it; state which in your report.
3. **R3 deletes compositions R2 is rewriting.** Both edit `Features/Home/Views/`. R3's set and R2's
   set are disjoint as listed above, but `DailyRoomView.swift` (R2) is what *mounts* R3's orphans —
   R3 removes the mount points only through an integration note in `waves/w2/r3-notes.md`, never by
   editing `DailyRoomView.swift` directly.
4. **The App Group (R1) is an entitlement + Apple-developer-portal capability.** In the simulator,
   `containerURL(forSecurityApplicationGroupIdentifier:)` may still return nil — `RecordSnapshotStore`
   **must** fall back to the app container and say so in the file. This is a compile-green /
   sim-verified claim; a real shared container is a **device** claim this wave does not make.
5. **Honesty (C5) governs every empty.** A row draws only for a real event with its real date; at
   guest/discovering an empty record draws **nothing** (synthesis §5 graft — this overrides B §2's
   `"Nothing moved since Thursday."` at those two tiers); at engaged/activeProject the truthful
   empties draw (`Nothing needs you right now.` / `Nothing moved since Thursday.`). `new` comes from
   `LastSeenStore`, never from a day count shown to the person. `NEW THIS WEEK` draws at **≥3 rows or
   not at all**, and never pads. The header word stays **"Today"** (C4).

---

## 10. Integration order (for the wave's integration steward)

**D → R1 → R3 → R2.** Schema first; then the models and stores R2 consumes; then the deletions;
then the UI that recomposes over both. `ProposalDetailView.swift` is the one file two lanes touch —
§8's rule applies.

Steward-only gates on `daily-return/integration`: `ios-gate.sh all` and `ios-gate.sh lint-delta`
(lint-delta adds temp worktrees to the shared `.git`; `all` grabs the first iPhone simulator — never
run either from a lane worktree).

## 11. Worktree retirement

The four W2 worktrees, the four `daily-return/w2-*` branches and the three `dr-w2-*` simulator clones
are the steward's to retire at wave end, after `git merge-base --is-ancestor` proves each branch is
on `main`. `scripts/repo-gc.sh` (dry-run by default) sweeps stragglers.
