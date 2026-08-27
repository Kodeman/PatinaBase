# W1b — Steward record (setup)

Written by the W1b steward, 2026-08-27. **This file is authoritative for owned files.**
Where it differs from `source/build-plan.md`'s W1b table, this file wins (the table names feature
areas; the planks' own `Where` blocks cross them — `build-plan-critique.md` §(c) counted fifteen
collisions in the pre-cut W1). A lane that needs a change in a file it does not own writes an
**integration note** into `waves/w1b/<lane>-notes.md` (file · exact diff or precise instruction ·
why); the owning lane or the steward applies it at integration.

---

## 1. Base

| | |
|---|---|
| Base branch | `main` |
| Base sha | **`5b5c0c054`** — `docs(ios): Daily Return — W1a task list, review, fix log, ledger rows` |
| Wave | W1b (W1a merged; see `build-plan.md` "W1a — DONE 2026-08-27") |

```
$ git -C /Users/kody/Code/patina-merged log --oneline -1 main
5b5c0c054 docs(ios): Daily Return — W1a task list, review, fix log, ledger rows
```

## 2. Worktrees and branches

All four created from `main` @ `5b5c0c054`, unsandboxed, `agent-*` prefixed so `.gitignore` covers
them (patina-parallel-work §3).

| Lane | Worktree | Branch |
|---|---|---|
| A · piece & saved | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-a` | `daily-return/w1b-a` |
| B · money & studio | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-b` | `daily-return/w1b-b` |
| C · identity, reach & notify | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-c` | `daily-return/w1b-c` |
| D · backend | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-d` | `daily-return/w1b-d` |

```
$ git worktree list | grep dr-w1b
.../agent-dr-w1b-a  5b5c0c054 [daily-return/w1b-a]
.../agent-dr-w1b-b  5b5c0c054 [daily-return/w1b-b]
.../agent-dr-w1b-c  5b5c0c054 [daily-return/w1b-c]
.../agent-dr-w1b-d  5b5c0c054 [daily-return/w1b-d]
```

`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` copied into all four from the main
checkout. It is gitignored (`.gitignore:53`) — `git status --porcelain` is **0 lines** in each
worktree. **Never commit it.** Without it `AppConfiguration.postHogAPIKey` is nil and
`FeatureFlags` resolves every flag `false` (`build-plan-critique.md` B8).

## 3. Simulators

⚠ **Deviation from the brief, recorded:** `xcrun simctl clone 973D1724-…` failed on all three —
`SimError code=405: Unable to clone device in current state: Booted`. The review device is Booted
and the brief forbids touching it, so each lane got a **fresh device of the identical type and
runtime** instead (`com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro` ·
`com.apple.CoreSimulator.SimRuntime.iOS-26-5` — read from the review device). Functionally
equivalent as an `xcodebuild` destination; the only loss is the review device's installed apps and
seeded data, which lane unit tiers do not use.

| Lane | Simulator | UDID | State |
|---|---|---|---|
| A | `dr-w1b-a` | `15C4C76A-DCDD-43C1-9119-D0B022F0A653` | Booted |
| B | `dr-w1b-b` | `8A414D4A-8CD2-4867-ADBE-4F00FAEB5E06` | Booted |
| C | `dr-w1b-c` | `18B12089-F4E2-4523-9173-1353A7F74CDF` | Booted |
| D | — (backend lane; no simulator) | — | — |

Untouched, as instructed: `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, the walker's),
`Coach-iPhone-A/B/C`, `Coach-Watch-A/B`. **No `dr-w1a` clone existed** — W1a's steward already
retired it (`xcrun simctl list devices | grep dr-w1` returns only the three new `dr-w1b-*`).

## 4. Gate commands (per lane, foreground, sandbox disabled)

`xcodebuild`, `xcrun simctl`, `git worktree add`, `git merge`, `docker`, `sips` and the `supabase`
CLI all fail inside the command sandbox — run exactly those with `dangerouslyDisableSandbox: true`
(`build-plan-critique.md` m14).

iOS lanes (A, B, C), from the lane's own worktree:

```bash
# compile — generic destination, no simulator contention
<worktree>/apps/mobile/Patina/scripts/ios-gate.sh build

# unit tier — MUST pin the lane's own simulator
xcodebuild test \
  -project <worktree>/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination "platform=iOS Simulator,id=<the lane's UDID above>" \
  -only-testing:PatinaTests CODE_SIGNING_ALLOWED=NO
```

**Do not run `ios-gate.sh unit`, `ui`, or `all` in a lane.** `sim_destination()`
(`scripts/ios-gate.sh:39-47`) greps `iPhone (17|16|Air)` and takes the **first** UDID — it will
select the walker's review device or a Coach device, never `dr-w1b-*`. `lint-delta` additionally
does `git worktree add --detach` in the shared `.git` (`:72-77`) and races other lanes. Both are
**steward-only, on the integration branch** (`build-plan.md` global constraints; critique M8/M9).

Same hazard applies to the steward: at integration run `ios-gate.sh build` + `ios-gate.sh lint-delta`
+ the explicit-destination `xcodebuild test` above, not `ios-gate.sh all`, unless the contending
devices are shut down first.

`CODE_SIGNING_ALLOWED=NO` is for the unit tier only — the walker's build must be signed
(`feedback_ios_sim_walk_harness`: never install a `CODE_SIGNING_ALLOWED=NO` build for a walk).

Backend lane D: `supabase db reset` (D is the wave's **sole** owner of the local stack, reset and
seeds), `supabase/tests` pgTAP, `deno test` where tests exist,
`pnpm turbo type-check --filter=@patina/client-portal` (the package name is `@patina/client-portal`,
not `client-portal` — critique M2).

## 5. Migration numbers

Current tip on `main` @ `5b5c0c054`:

```
$ ls supabase/migrations | tail -3
00530_field_capture_notes_and_routing.sql
00531_restore_extension_execute_authenticated.sql
_pending
```

`00532` is held **locally** by the sibling Field Companion program and is not on `main`;
`_pending/00106_drop_client_messages.sql` is unapplied and stays so.

Lane D mints, **provisionally**:

| Number | Contents | Source |
|---|---|---|
| `00533` | `get_recommendations` DROP + CREATE (frozen contract; adds `dimensions`, `lead_time_weeks`, `brand`, `description`, `published_at`, `finish`, `patina_managed`, `photo_verified_at`, `source_url`, `shipping_flat_cents`) + `ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_verified_at, shipping_flat_cents` + re-apply both GRANTs (`00246:307-308`) | build-plan W1b lane D |
| `00534` | `notify_client_attention(...)` SECURITY DEFINER (service_role only), two `notification_log` rows, `AFTER INSERT` trigger on `client_decisions` | build-plan W1b lane D |
| `00535` | `saved_items.price_cents_at_save integer`, `saved_items.room_id uuid` if absent (it exists — `00055_saved_items.sql:23`, critique m8) | build-plan W1b lane D |
| `00536` | **W1a escalation**: client SELECT on `designer_clients` (roster attribution is unreachable without it) + a counterpart predicate in `rpc_start_direct_thread` | build-plan "W1a — DONE 2026-08-27", last sentence |

⚠ The orchestrator's setup brief named three numbers (00533–00535); the plan's W1a-DONE section
escalates a fourth (**00536**) to this lane. Recorded here as provisional and **flagged for Fable's
confirmation** before lane D commits it. The program's reservation is `00533–00540`.

**Re-check `ls supabase/migrations | tail` immediately before each merge** and renumber on collision
(patina-parallel-work §6; renumbering an already-applied local migration forces D to
`supabase db reset`). 00533 is the program's one **non-additive** step — a DROP/CREATE of a frozen
RPC with four non-iOS callers (`apps/client-portal/src/app/api/feed/[roomId]/route.ts`,
`packages/supabase/src/database.types.ts`, `supabase/tests/aesthete/shim_contract_test.sql`,
`supabase/seed/00-legacy-grants.sql` — critique M6). All four are D's.

## 6. OWNED-FILE MAP — one file, one owner

Paths under `apps/mobile/Patina/Patina/` unless stated. `**` = the whole subtree including new
files, **minus** any carve-out named in §6.5.

### 6.1 Lane A · piece & saved
Planks: SP-02, SP-06, SP-10 (client half), SP-11, SP-12, SP-14, SP-18.

- `Core/Network/ProductAPIClient.swift`
- `Core/Network/EditorialStoriesAPIClient.swift`
- `Core/Models/ProductModel.swift`, `Core/Models/TableItemModel.swift`, `Core/Models/SavedItem.swift`
- `Core/Persistence/**` (incl. `RoomStore.swift`, `LocalStoreReset.swift`)
- `Features/ProductDetail/**` (incl. `ProductDetailView.swift`, `ProductDetailViewModel.swift`)
- `Features/Recommendations/**`
- `Features/Collections/**`
- `Features/Rooms/**` — **except** `Features/Rooms/Components/SpatialMetadataRow.swift` (→ C)
- `Features/Home/Views/AddToRoomSheet.swift`, `AddedToRoomToast.swift`, `DailyStoryCard.swift`, `DailyStoryDetailView.swift`, `TodayModules.swift`
- `Features/Home/ViewModels/DailyRoomViewModel.swift` (SP-18 story pick, `:196-201`)
- `Features/Profile/Views/ProfileView.swift` (SP-18 match %)
- `Features/Shared/Views/ProductCard.swift`, `Features/Shared/CurrencyFormatting.swift` (SP-14 one formatter)
- `Services/Auth/AuthService.swift` (SP-06 `reconcileLocalStoreOwner` / `shouldWipeLocalStore`, `:169-197`)
- `Features/Companion/Services/CompanionActionRows.swift`, `Features/Companion/Services/CompanionAreaBuilders.swift`, `Features/Companion/Views/CompanionOverlay.swift` — **carve-out from C**, see §6.5
- `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift`

Suites A owns and leaves green: `ProductDecodingTests`, `ProductVendorEmbedTests`,
`DailyRoomFeedMappingTests`, `AccountIsolationTests`, `CompanionActionMatrixTests` (Saved row),
`ContextualExperienceTests`.

### 6.2 Lane B · money & studio
Planks: SP-04, SP-05, SP-15, SP-16 (remainder), SP-17, SP-19 (money-screen half only).

- `Features/Proposals/**`
- `Features/Invoices/**`
- `Features/Budget/**`
- `Features/Decisions/**`
- `Features/Projects/**` (incl. `Views/ProjectDetailView.swift` — SP-05)
- `Features/Profile/ViewModels/StudioQueueBuilder.swift`, `Features/Profile/ViewModels/StudioQueueModels.swift`
- `Features/Profile/Views/StudioHubView.swift`
- `Services/API/ProposalsAPIClient.swift`, `Services/API/InvoicesAPIClient.swift`
- `Core/Network/DecisionsAPIClient.swift`
- `Services/Badges/BadgeCountService.swift`
- `Features/Shared/DateDisplay.swift` (SP-15 due/expiry carry)

Suites B owns and leaves green: `BudgetAggregationTests`, `InvoicesMoneyRailTests`,
`ProposalsMoneyRailTests`, `StudioHubTests`, `AttentionCountTests`,
`DecisionConsentValidationTests`.

B's SP-19 half is **content-inside-the-money-screens only**: status-bar inset on scrolled lists and
nothing drawn under the Hearth on Proposal/Invoice/Decision detail. The shared chrome primitives
(`CompanionSafeArea`, `PatinaScreenChrome`, `ContentView`, `PatinaColors`) are **C's** — B writes an
integration note if it needs one changed.

### 6.3 Lane C · identity, reach & notify
Planks: SP-03 (client half), SP-08 (client half), SP-09, SP-19 (remainder), SP-20, plus the
`companion-context` duplicate-request fix (4× at launch, `research/05-rewalk.md`).

- `Features/DesignServices/**`
- `Features/Authentication/**`
- `Features/Messaging/**`
- `Features/Settings/**`, `Features/Account/**`
- `Features/Notifications/**`
- `Features/Companion/**` — **except** the three files carved out to A in §6.1/§6.5
- `Features/Home/Views/DailyRoomView.swift` (SP-08 primer trigger + Companion row hooks)
- `Features/Home/Views/DailyGreetingHeader.swift`
- `Features/Help/FirstLaunchTour.swift` (SP-14's tour half is deferred to W3 — **expected untouched**; `FirstLaunchTourTests` must stay green)
- `Features/RoomScan/Views/ScanFallbackEntryView.swift` (SP-19 ft/m segmented control, 44 pt targets)
- `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift` (SP-19 hard-coded cream-on-black)
- `Features/Rooms/Components/SpatialMetadataRow.swift` (SP-19 targets, `:46-50` — carve-out from A)
- `Features/Shared/PatinaPortalLinks.swift` — the real path; the plan's `Core/…/PatinaPortalLinks.swift` is wrong (critique m4)
- `Design/Components/CompanionSafeArea.swift`, `Design/Components/PatinaScreenChrome.swift`
- `ContentView.swift`
- `App/**` (incl. `App/DeepLinking/DeepLinkHandler.swift`, `App/DeepLinking/NotificationRouter.swift`, `App/Coordinators/Coordinator.swift`, `PatinaApp.swift`) — **never** `App/Configuration/Secrets.swift`
- `Core/Network/NotificationsAPIClient.swift` (SP-08 row contract vs 00534)
- `Services/API/PushTokenService.swift`, `Services/API/APIConfiguration.swift` (SP-20 delete endpoint, `:182`)
- `apps/mobile/Patina/Patina/Patina.entitlements` (`applinks:client.patina.cloud`)
- `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` — **sole writer, entitlement-related edits only.** New `.swift` files do NOT touch it (`objectVersion = 77`, three `PBXFileSystemSynchronizedRootGroup`s — verified in critique §(c)); an entitlement change does.
- `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift` (SP-19 dynamic tokens, `:154-166`)

Suites C owns and leaves green: `PushTokenServiceTests`, `NotificationsAPIClientContractTests`,
`AuthSheetPresentationTests`, `FirstLaunchTourTests`, `MessagingThreadCreationTests`,
`ArtifactRoutingTests`, `RouteAnalyticsParityTests`, `SurfaceKeysParityTests`.

### 6.4 Lane D · backend
Migrations 00533–00536, edge functions, seeds, SQL/deno tests, and the client-portal pieces that
serve the app. **Sole owner of `supabase db reset` and the local stack for this wave.**

- `supabase/migrations/00533_*.sql`, `00534_*.sql`, `00535_*.sql`, `00536_*.sql`
- `supabase/functions/proposal-send/**`, `invoice-send/**`, `invoice-reminders/**`, `delete-account/**`, `proposal-sign-confirmation/**`, and any new `notify-helpers` shared module
- `supabase/config.toml` (the `[functions.delete-account]` entry)
- `supabase/tests/**`
- `supabase/seed/**` (incl. `products.sql` gaining `dimensions`/`lead_time_weeks` on ≥6 rows, and `00-legacy-grants.sql`)
- `packages/supabase/src/database.types.ts`
- `apps/client-portal/src/app/.well-known/**` (AASA route + its `__tests__`)
- `apps/client-portal/src/app/piece/**` (new public piece route + OG metadata)
- `apps/client-portal/src/app/api/feed/**`

D never touches `apps/mobile/**`.

### 6.5 Steward refinements to the orchestrator's example resolutions

The setup brief's examples are honoured except where a whole plank would otherwise cross a lane
boundary. Both refinements are named here so Fable can override:

1. **`Features/Companion/**` → C, with three files carved out to A**:
   `Services/CompanionActionRows.swift` (SP-12's `nil` return, `:217-222`),
   `Services/CompanionAreaBuilders.swift` (SP-12's both home branches, `:28-49`),
   `Views/CompanionOverlay.swift` (SP-06's unfiltered `fetchCount`, `:190-195`).
   *Why:* SP-12 and SP-06 are lane A planks and A owns `CompanionActionMatrixTests`, which asserts
   exactly those three files' behaviour. Leaving them with C would make A's gate depend on an
   unmerged lane. C's W1b Companion work is `CompanionContextProvider` / `CompanionViewModel`
   (the duplicate-request fix) and does not touch them.
2. **`Features/Rooms/**` → A, with `Components/SpatialMetadataRow.swift` carved out to C.**
   *Why:* that file's only W1b change is SP-19's 44 pt hit area, which is C's chrome plank.

Honoured as given: `DailyRoomView.swift` → C · `ProductAPIClient.swift` → A ·
`BadgeCountService.swift` → B · `database.types.ts` → D · `ContentView.swift` → C ·
`DailyStoryCard.swift` + `EditorialStoriesAPIClient.swift` → A · `Features/Companion/**` → C
(subject to refinement 1).

### 6.6 Known cross-lane touches → integration notes, not edits

| The change | Lives in | Lane that needs it |
|---|---|---|
| SP-03 share subject/message, `ProductDetailView.swift:117-121` | A | **C** |
| SP-04's signature-confirmation email, if `sign_proposal` does not send it | D (`supabase/functions/proposal-sign-confirmation/**`) | **B** |
| SP-08 bell empty state falling back to the Studio queue (`StudioQueueBuilder`) | B | **C** |
| SP-15 pay-failure "Message your designer" act (W1a's `MessagingAPIClient` is merged; the money screens are B's) | B | — (B owns both sides) |
| Anything B needs in `CompanionSafeArea` / `PatinaScreenChrome` / `ContentView` / `PatinaColors` | C | **B** |
| SP-10's decode keys (00533's exact `RETURNS TABLE` names) | D | **A** — A must read D's 00533 before coding `ProductModel` |
| 00534's row contract (`type`, `channel`, `metadata.entity_type`/`entity_id` spellings) | D | **C** — the seam between D's SQL and C's `NotificationsAPIClient` |

Write each as `waves/w1b/<lane>-notes.md` → "integration note: `<file>` · `<exact diff or precise
instruction>` · `<why>`".

## 7. Integration

Merge order into `daily-return/integration` (from `main` @ `5b5c0c054`): **D → A → B → C**
(schema first, then the lane that decodes it, then money, then chrome — chrome last because C's
`ContentView` / `CompanionSafeArea` edits are the most likely to conflict textually).

Steward at integration: re-check the migration tip and renumber on collision · `supabase db reset` +
pgTAP · `ios-gate.sh build` + `ios-gate.sh lint-delta` + the explicit-destination `xcodebuild test`
(§4) · `deno test` · `pnpm turbo type-check --filter=@patina/client-portal` · regen
`database.types.ts` if D did not · retire the four worktrees and the three simulators at wave end
(`scripts/repo-gc.sh` sweeps stragglers).

## 8. Standing rules for every lane

- `mkdir .writer.lock.d` in the worktree at start, `rmdir` at report. One writer per worktree.
- **Never** `git add -A` / `git add .` — pathspec commits only. **Never push.** **Never** run git in
  the main checkout except read-only `log`/`show`. Never touch production.
- Conventional Commits; the commit's file list must match its message (`git show --stat` before
  calling it done).
- Every build/test in the **foreground**.
- Honesty (C5): no fabricated "new", no streaks, no countdowns, no invented figures, and **no
  vendor/system error text ever rendered to a homeowner**. Brand voice (C6). Canonical names (C4).
- Claim levels (patina-ios-verification): compile-green / sim-verified / device-verified. W1b
  produces **no** device claims — universal links opening the app, App Groups, APNs delivery and
  Apple Pay are all device-gated and out of this wave.
