# The Daily Return — Build Program Plan v2 (2026-08-27, after the P0 critique)

> **For agentic workers:** each wave runs as one Workflow; each lane's implementer writes its own
> bite-sized task list (superpowers writing-plans format: failing test → run → implement → run →
> pathspec commit) into `artifacts/ios-daily-return-2026-08-26/waves/<wave>/<lane>-tasks.md` BEFORE
> coding, and its reviewer checks the tasks against this plan and the spec sections cited.
> v1 → v2 changes are listed in "Critique dispositions" at the end; v1's text is quoted where it mattered in `build-plan-critique.md`.

**Goal:** Ship the ruled program of change for the Patina iOS client app — the repair planks, the
Record home, the tab bar behind `house-first`, the house on Today, the purchase path with designer
pre-emption and attribution, and the first widget — so a homeowner has an honest reason to open the
app every day and, when no designer is on the job, can buy a piece through it.

**Architecture:** SwiftUI client (`apps/mobile/Patina`; the Option B root stays compiled for one
release on the off branch of `house-first`), Supabase migrations + edge functions for every backend
delta (no new NestJS service), direct orders settling onto the existing fulfillment rail, push via
the existing `apns-send`. Everything additive; the one non-additive step (00533's DROP/CREATE of a
frozen RPC) is named as such.

**Tech stack:** Swift 6 / SwiftUI / Swift Testing / SwiftData · Supabase (Postgres, PostgREST,
GoTrue, Deno edge functions, pg_cron) · Stripe hosted Checkout in `SFSafariViewController` ·
PostHog flags · WidgetKit (W6) · client-portal (Next.js) for the AASA file and the public piece route.

**Spec:** `source/direction-b.md` (§2 home per tier, §4 return surfaces, §5 purchase path, §9
waves/deltas/risks/rollback, §11 mock manifest), `source/direction-a.md` §5 (pre-emption + roster
attribution, grafted per R3), `source/shared-planks.md` (SP-01…SP-20), `source/synthesis.md` §5
(grafts), `source/rulings-2026-08-27.md`, `source/build-plan-critique.md` (facts verified against
the repo — read it; it corrects the direction docs in places). Findings:
`research/31-verified-findings.json`; mechanism corrections: `research/33-verify-code-truth.json`.
Evidence: `research/01-shot-ledger.md`, `research/05-rewalk.md`. Mocks: `mock/fragments/b-M*.html`,
`s-M*.html`, `a-M5*.html` with screen sheets.

## Global constraints (every task inherits these)

- Supabase Auth only; PostgREST via the existing clients in `Core/Network`; new server logic = edge
  functions + migrations; migrations hand-numbered `NNNNN_slug.sql`; `REVOKE EXECUTE … FROM PUBLIC,
  anon` on every new function and, for SECURITY DEFINER service functions, from `authenticated` too
  (GRANT to `service_role` only); RLS `TO authenticated`; never `supabase migration new`.
- Migration numbers are **provisional**; this program reserves **00533–00540** (a sibling program
  holds `00532` locally; `_pending/00106` is unapplied and stays so). Re-check `ls
  supabase/migrations | tail` immediately before each merge; renumber on collision; a renumber after
  local apply means the backend lane runs `supabase db reset` for the wave.
- Canonical names (C4) except B-7's tab labels; brand voice (C6); honesty (C5): no fabricated
  "new", no streaks, no countdowns, no invented figures, and **no vendor/system error text ever
  rendered to a homeowner** (the Pay failure printed Stripe's "Invalid API Key provided: sk_test_…" —
  `research/05-rewalk.md`); physical goods never through IAP (C15).
- Flags: **`FeatureFlags`** (W1a) resolves each flag once at launch — DEBUG launch-arg override
  (`-PatinaFlags house-first,direct-orders,house-widget`) → PostHog value after `onFeatureFlags`
  (bounded wait) → `false` — and holds it for the session. The Record (W2) is **unflagged** (R1
  "now"; rollback = delete one mount). `house-first` gates W3 (tab bar + Companion slot) only;
  `direct-orders` gates W5's Buy; `house-widget` gates W6. Kody creates the PostHog flags (project
  326191) targeting client auth-user UUIDs; every local walk uses the launch-arg override.
- Gates. iOS per lane: `ios-gate.sh build` + `xcodebuild test -only-testing:PatinaTests
  -destination id=<the lane's cloned simulator>` (foreground) + the full suite list the lane owns;
  `ios-gate.sh lint-delta` and `ios-gate.sh all` run **only by the steward on the integration
  branch** (lint-delta adds temp worktrees to the shared `.git`; `all` grabs the first iPhone
  simulator). SQL: `supabase db reset` (backend lane only) + `supabase/tests` pgTAP; edge functions:
  `deno test` where tests exist; client-portal: `pnpm turbo type-check --filter=@patina/client-portal`
  (+ its route tests). Claim levels per patina-ios-verification: compile-green / sim-verified /
  device-verified — universal links, App Groups on device, APNs delivery, Apple Pay, LiDAR/AR are
  device claims; this program produces none.
- `-DeploymentTarget local` on every simulator launch. Simulators: the review device
  `973D1724-90BF-4A0A-B02D-481D561547B3` belongs to the wave's walker; each lane gets a clone
  (`xcrun simctl clone <udid> "dr-<wave>-<lane>"`, deleted by the steward at wave end).
- Git: writer worktrees `.codex/worktrees/agent-dr-<wave>-<lane>` on `daily-return/<wave>-<lane>`
  from the wave base; **`git worktree add` and `git merge` run unsandboxed** (the sandbox denies the
  `.env*` files a checkout writes); copy `Patina/App/Configuration/Secrets.swift` in (never commit
  it); `mkdir .writer.lock.d` at start, `rmdir` at report; pathspec commits only; no push from
  subagents; integration branch `daily-return/integration`; the orchestrator ff-merges to `main`.
- Conductor rules (Field Companion, verbatim): never end a turn while a child runs; every gate in
  the foreground; address children by agentId; one writer per worktree enforced by the lock — a
  replacement only after the lock owner is proven dead; the conductor never commits on an
  implementer's behalf; snapshot task lists + reports into `waves/<wave>/`; retire worktrees at wave
  end (`scripts/repo-gc.sh` sweeps stragglers).
- Reviews are separate contexts; reviewer briefs say "report every finding with confidence +
  severity" — never a severity filter. Each lane owns the existing test suites in its file set and
  leaves them green.

## Team model (per wave)

| Role | Model | Owns |
|---|---|---|
| Steward | Opus | worktrees + bootstrap + Secrets.swift, simulator clones, migration-number check, integration branch, merge order, conflict resolution, `ios-gate.sh all` + lint-delta on integration, worktree retirement |
| Lane implementer | Opus (xhigh for W3 routing, W5 webhook) | its task list, code + tests, its gate, pathspec commits, report |
| Lane reviewer | Sonnet (Opus for money/routing/backend) | adversarial review of the lane branch vs plan + spec; fix rounds return to the same implementer |
| Backend lane | Opus | ALL of the wave's migrations, edge functions, seeds, SQL/deno tests, `supabase db reset`, and the client-portal pieces that serve the app (AASA, piece route) |
| Walker | Sonnet | the review simulator, the wave's acceptance script, shots `shots/w<n>-*.png`, ledger, `waves/<wave>/walk.md` |
| Orchestrator (Fable) | — | reviews reports, ff-merge to main, push, memory, next wave |

## Waves

### W0 — Foundation — DONE 2026-08-27
Stack restarted from main (edge functions boot, magic-link code renders, INV-2026-0142 intact);
re-walk `research/05-rewalk.md` (the Companion works — client-side heuristics over a near-empty
`companion-context`; Budget renders; the Pay failure is silent below the fold and leaks Stripe's raw
error; local `STRIPE_SECRET_KEY` is a placeholder so Checkout never opens locally); hotfix SP-01
merged as `0b7f2291d` (sim-verified; the error-branch Back control is compile-green only); deck
republished with the rulings; this plan critiqued.

### W1a — Prerequisites (one lane, sequential; base = main `0b7f2291d`)
One Opus implementer in `agent-dr-w1a-prereq`, one Opus reviewer, then ff-merge to main.
1. **Gate hygiene:** `PatinaTests/ScanBucketMimeTests.swift` maps the three keyframe kinds
   (`keyframesArchive`, `keyframeIndex`, `keyframeSummary`, `ScanManifest.swift:454-456`) so the
   force-unwrap at `:50` stops crashing the whole unit tier; `ios-gate.sh all` must be green on the
   branch (this is the only lane allowed to run `all`, on its clone, because no other lane is active).
2. **`FeatureFlags`** (`Core/State/FeatureFlags.swift`, new): `enum Flag: String { houseFirst =
   "house-first", directOrders = "direct-orders", houseWidget = "house-widget" }`;
   `FeatureFlags.shared.isOn(_ flag: Flag) -> Bool`; resolved once by `resolveAtLaunch()` called
   from `PatinaApp` before the root is chosen: DEBUG launch argument `-PatinaFlags a,b` → PostHog
   (`PostHogService` after `onFeatureFlags`, waited at most 1.5 s) → false; `--uitesting` keeps
   flags off unless the launch arg names them. Tests: override wins; PostHog fallback; timeout
   → false; value held after resolution even if PostHog changes.
3. **SP-07:** `DesignRequestStatusService.fetchLeadRows()` drops `client_request_id=not.is.null`
   (scope stays the client's own leads via `client_id`/RLS); the built matched branch
   (`TodayExperience.swift:80-91`, "You're matched with …") becomes reachable; at engaged /
   activeProject "Get design help" opens the existing request status (or the thread, once 4 lands)
   instead of filing a second lead. Tests: `EngagementTierTests` gain a portal-created-lead case;
   a duplicate-lead guard test.
4. **`DesignerRelationship`** (`Core/State/DesignerRelationship.swift`, new): `enum
   DesignerRelationship { case none; case roster(designerId: UUID); case lead(leadId: UUID,
   designerId: UUID, studioName: String?); case project(projectId: UUID, designerId: UUID,
   studioName: String?) }`; `var isLive: Bool` (lead accepted/claimed or active project);
   `DesignerRelationshipResolver.resolve(promotedRequest:projects:roster:)`; roster read from
   `designer_clients` (00014:72-90) via a new read in `ProjectsAPIClient` or a small
   `RosterAPIClient`. W5 consumes `isLive` for pre-emption and `designerId` for attribution. Tests
   for each case and the "most recent roster row wins; same-day tie → none" rule (synthesis graft).
5. **SP-13 client half:** `MessagingAPIClient.createThread(projectId:)` over the existing
   `rpc_start_project_thread(p_project_id)` (00103:113) and `createDirectThread(counterpart:)` over
   `rpc_start_direct_thread` (00103:51); a "Message your designer" affordance on `ProjectDetailView`,
   a chevron + compose path on the Studio hub's Conversation block, and a Companion row on the Daily
   Room when `DesignerRelationship.isLive`. Tests: the RPC names are pinned; the affordance is
   hidden when no designer exists.
6. **One attention count (SP-16 half):** `BadgeCountService.attentionCount` is the single source
   consumed by the Profile/Studio subhead + footer, the Daily Room footer and the Companion; the
   three surfaces stop disagreeing. `BadgeCountService` also **retains the rows it fetches**
   (`pendingDecisions`, `payableInvoices`, `pendingProposals`, `threadSummaries`, `projects`) for W2.
   Tests: count equality across consumers; rows retained.
Acceptance: `ios-gate.sh all` green; James (engaged, `james.okafor@example.com`) sees the matched
branch on Today and no duplicate lead is filed from "Get design help"; `-PatinaFlags house-first`
flips `FeatureFlags.shared.isOn(.houseFirst)` in a debug launch; one count everywhere.

### W1b — Repair planks (SP-02…SP-20 remainder; base = main after W1a)
Four lanes with **owned file sets** (the steward assigns; a lane needing a change in another lane's
file writes it as an integration note in `waves/w1b/<lane>-notes.md`, and the owner applies it).

| Lane | Planks | Owned files (primary) |
|---|---|---|
| A · piece & saved | SP-10 client half (decode `dimensions`, `lead_time_weeks`, `brand`, `description`, `published_at`, `finish`, `patina_managed`, `photo_verified_at`, `source_url`, `shipping_flat_cents` from 00533; spec rows on the piece: size · lead time · maker · story — absent honestly when null), SP-18 (story dot from a stored read id; AR affordances off; Profile's unexplained match % gets the rationale the app computes or comes down), SP-02 (grid one card size — fix `PatinaAsyncImage` `.aspectRatio(.fill)` without `.clipped()` or whatever the measured cause is; chips scroll at XXL; **the matched-geometry transition inheriting the off-canvas card offset — `research/01-shot-ledger.md` H0 verification — is in scope**), SP-11 (put a piece in a room; room browse scoped to the room), SP-12 (Saved door at zero count; opens on the tab with pieces; boards hold pieces via `addToBoard` or the Boards tab goes), SP-14 (`isSaved` seeded; `saved_items` mirror on the standard path; no duplicate rows), SP-06 (account-scoped local store; claim on first sign-in only — the documented intent in `AuthService.swift:169-197` is kept, the leak to later accounts is not) | `Core/Network/ProductAPIClient.swift`, `Core/Models/ProductModel.swift`, `Core/Models/TableItemModel.swift`, `Core/Persistence/**`, `Features/ProductDetail/**`, `Features/Recommendations/**`, `Features/Shared/Views/ProductCard.swift`, `Features/Collections/**`, `Features/Rooms/**`, `Features/Home/Views/AddToRoomSheet.swift` (live — used by `ProductDetailViewModel`), `Features/Home/Views/DailyStoryCard.swift`, `Core/Network/EditorialStoriesAPIClient.swift`, `Features/Profile/Views/ProfileView.swift`, `PatinaDesignKit/.../PatinaAsyncImage.swift`; suites `ProductDecodingTests`, `DailyRoomFeedMappingTests`, `AccountIsolationTests`, `CompanionActionMatrixTests` (Saved row) |
| B · money & studio | SP-04 (accepted ≠ "Signed"; the sign sheet restates total, line count, terms, date; the signature confirmation email — verify `supabase/functions/proposal-sign-confirmation` and wire it if `sign_proposal` does not), SP-05 (drop designer-facing copy + the `CLIENT VIEW` stat), SP-15 (due/expiry dates on detail; **every failure rendered in Patina's voice, never vendor text**, above the fold and never under the Companion dock; the Pay failure gets a visible state), SP-16 remainder (the "budget" screen named for what it is), SP-17 (a decision can be deferred — "Not yet" with a note into the thread; option images render when present — the swatch is a content contract, note it and stop), SP-19's money-screen half (status-bar inset on scrolled lists; nothing drawn under the Hearth on Proposal/Invoice/Decision detail) | `Features/Proposals/**`, `Features/Invoices/**`, `Features/Budget/**`, `Features/Decisions/**`, `Features/Projects/Views/ProjectDetailView.swift`, `Features/Profile/ViewModels/StudioQueueBuilder.swift`, `Features/Profile/Views/StudioHubView.swift`; suites `BudgetAggregationTests`, `InvoicesMoneyRailTests`, `ProposalsMoneyRailTests` |
| C · identity, reach & notify | SP-09 (the design-request soft wall gets Cancel/back), SP-19 remainder (44 pt targets; the ft/m toggle becomes a segmented control that shows its state and **does not persist silently**; the Hearth stops painting over scrolled content — `CompanionSafeArea` fix, not padding), SP-20 (Sign Out reachable — bisect why `SettingsView.swift:50-58`'s NavigationLink never pushes; Delete Account UI over the new `delete-account` edge function from lane D), SP-08 client half (bell rows from the 00534 contract below; empty state falls back to the Studio queue; tier-branched empty CTA; **`PushPrimerView` with SP-08's sentence, presented before the first money push — the current post-design-request ask is moved into it, not deleted**), SP-03 client half (`PatinaPortalLinks.piece(id)` → `https://client.patina.cloud/piece/<id>`; share copy names Patina; associated-domains entitlement `applinks:client.patina.cloud`; `AppCoordinator` routes `/piece/<id>`, `/invoice/<id>`, `/proposal/<id>`, `/decision/<id>`), companion-context duplicate-request fix (4× at launch — `research/05-rewalk.md`) | `Features/DesignServices/**`, `Features/Authentication/**`, `Features/Messaging/**`, `Features/RoomScan/Views/ScanFallbackEntryView.swift`, `Features/Settings/**`, `Features/Account/**`, `Design/Components/CompanionSafeArea.swift`, `Design/Components/PatinaScreenChrome.swift`, `Features/Companion/**`, `ContentView.swift`, `Features/Notifications/**`, `Services/API/PushTokenService.swift`, `Core/…/PatinaPortalLinks.swift`, `App/**`, `Patina/Patina.entitlements`; suites `PushTokenServiceTests`, `NotificationsAPIClientContractTests`, `AuthSheetPresentationTests`, `FirstLaunchTourTests` (untouched copy) |
| D · backend | **00533** `get_recommendations` DROP + CREATE (frozen contract — keep every existing output name: `material_tags`, `maker_name/maker_location/maker_story`, `price_cents`, `id TEXT`…; ADD `dimensions`, `lead_time_weeks`, `brand`, `description`, `published_at`, `finish`, `patina_managed`, `photo_verified_at`, `source_url`, `shipping_flat_cents`; `ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_verified_at timestamptz, shipping_flat_cents integer`; re-apply both GRANTs (00246:307-308); update the four other callers — `apps/client-portal/src/app/api/feed/[roomId]/route.ts`, `packages/supabase/src/database.types.ts` (regen), `supabase/tests/aesthete/shim_contract_test.sql`, `supabase/seed/00-legacy-grants.sql`); **00534** `notify_client_attention(p_user_id, p_entity_type, p_entity_id, p_title, p_body, p_metadata)` SECURITY DEFINER, GRANT `service_role` only, REVOKE PUBLIC/anon/authenticated — writes **two** `notification_log` rows (channel `in_app`, status `delivered`; channel `push`, status `queued`) and calls `apns-send` via `invoke_edge_function` with the push row's id; row contract: `entity_type ∈ {proposal, invoice, decision}` (lower-case, matches `NotificationRouter.swift:61-88`), `metadata {entity_id, project_id, amount_cents?, due_date?}`; an `AFTER INSERT` trigger on `client_decisions` in the 00289 shape; call sites in `proposal-send`, `invoice-send`, `invoice-reminders` (first stage only) using the service-role client; **00535** `saved_items.price_cents_at_save integer`, `saved_items.room_id uuid` if absent; **`delete-account` edge function** (verify_jwt, deletes the caller: auth user via admin API after cascading app rows; Apple 5.1.1(v)); **client-portal**: add the `cloud.patina.app` details entry (Team `VP22LXHT7L`, paths `/piece/*`, `/invoice/*`, `/proposal/*`, `/decision/*`) to `apps/client-portal/src/app/.well-known/apple-app-site-association/route.ts` + its test; a public `apps/client-portal/src/app/piece/[id]/page.tsx` with OG metadata (name, maker, price, image) that deep-links into the app — served by the anon-readable products RLS; tests: pgTAP for 00533's shape and 00534's two-row behaviour, deno tests for `delete-account` and the call sites, client-portal route tests; seeds: `supabase/seed/products.sql` gains `dimensions`/`lead_time_weeks` on ≥6 rows so W5's gate has pieces to pass | `supabase/migrations/00533_*.sql`, `00534_*.sql`, `00535_*.sql`, `supabase/functions/{notify-helpers?,proposal-send,invoice-send,invoice-reminders,delete-account}/**`, `supabase/tests/**`, `supabase/seed/**`, `packages/supabase/src/database.types.ts`, `apps/client-portal/src/app/.well-known/**`, `apps/client-portal/src/app/piece/**`, `apps/client-portal/src/app/api/feed/**` |

Integration (steward): merge D first (schema), then A, B, C; renumber against the tip; `supabase
db reset` + pgTAP; `ios-gate.sh all` + lint-delta on `daily-return/integration`; regen
`database.types.ts` if D did not.
Acceptance walk (walker, review simulator, `-PatinaFlags` none): open three pieces from the grid
(no off-screen top bar; size/lead time/maker render or are absent honestly); save from Browse →
Saved shows it under All items with date; put it in a room; defer a decision; proposals list reads
"Accepted"; the sign sheet restates the total; invoice detail carries "Due Sep 1"; Pay failure (local
placeholder key) renders a Patina-voice failure above the fold; the request wall has Cancel;
Settings → Account opens; Sign Out works; Delete Account is present; share a piece → the sheet names
Patina and the URL is `client.patina.cloud/piece/…`; the unit toggle is a segmented control; the
bell lists the open invoice and the two decisions after `select notify_client_attention(...)` runs
locally; the primer appears once before the first push.
Owed after W1b (not this program): deploy client-portal for the AASA + piece route (Kody's "ship");
App ID associated-domains capability + profile (device claim).

### W2 — The Record (R1 "now", Q4, B §9 W1 + B-3/B-4 UI; unflagged; base = main after W1b)
| Lane | Work | Files / backend |
|---|---|---|
| R1 record data | `HouseRecord` (NEEDS YOU / MOVED, rolling 7 days, `new` tick via `LastSeenStore`, ≤3 per eyebrow, `See all`), `RecordSnapshotStore` (App Group `group.cloud.patina.app` — **the entitlement is added in this wave**; falls back to the app container when the group URL is nil), `LastSeenStore` (`patina.house.lastSeenAt`, written on `.active`), per-item `StudioQueueBuilder` rows with dates, `designer:profiles!…` embeds on decisions/proposals/projects clients with the `displayName` "your designer" fallback, **discovering rows**: a saved piece withdrawn (`products.deleted_at`, 00435:563) and a saved piece repriced (`saved_items.price_cents_at_save` vs `products.price`) composed client-side over the saved list; empty-queue Next Move names `current_phase` (`ProjectsAPIClient.swift:25`); six-hour suppression on re-open; card weight follows content | `Features/Home/Models/HouseRecord.swift`, `Core/Persistence/{RecordSnapshotStore,LastSeenStore}.swift`, `Services/Badges/BadgeCountService.swift`, `StudioQueueBuilder.swift`, `Core/Network/{Decisions,Proposals,Projects}APIClient.swift`, `Patina.entitlements` |
| R2 record UI | `HouseRecordCard`; the `Your designer` seat (name · studio · one line · Message via W1a's thread); `Your house` rail (project rooms + local rooms + Add a room — **verify first whether 00066:249-253 already grants clients SELECT on `project_rooms`; write 00537 only if a real blocker exists**); `NEW THIS WEEK` rail (`published_at` ≤ 7 d, **≥3 rows or it does not draw**); guest `Start with a room` two-act block; story demoted when nothing published, ordered `published_at desc, sort_order desc`; `TimeOfDay` greeting; labelled `Studio` control with the W1a count; **at guest/discovering the record draws nothing when empty (synthesis graft), at engaged/activeProject the truthful empties draw**; `PushPrimerView` timing unchanged from W1b; dark + XXL | `Features/Home/Views/{HouseRecordCard,YourDesignerSeat,YourHouseRail,NewThisWeekRail}.swift`, `DailyRoomView.swift`, `DailyGreetingHeader.swift` |
| R3 hygiene (Q4) | Retire the July home rail: for each view in the Q4 list prove the call graph (`AddToRoomSheet` is LIVE and stays; `DailyProductCard` ← `DailyRoomViewModel`/`ProductCard`/`DailyProductDetailView`, `StudioHubSection` ← `DailyRoomStateBlocks`/`MarketplaceLinksSection`, `ContinueScanCard` ← `DesignRequestResumeBanner` are referenced — delete the *composition* (`DailyRoomStateBlocks`, `HomeStudioBlock`, `MarketplaceLinksSection`, `WorkWithDesignerCTA`, `RoomChipRail`, `RoomContextBar`, `DailyFeedEmptyModule`) and re-home any still-used piece); record the retirement in `research/11-canon-digest.md` §5 | the orphan set; tests referencing them |
| Backend | **00537** `rooms.budget_cents`, `profiles.last_seen_at` (+ the `project_rooms` policy only if R2 proves it missing) — authored here so W4 has no late mint | `supabase/migrations/00537_*.sql` |
Acceptance: Ruth's Today shows NEEDS YOU (decision overdue Aug 22 · proposal by Sep 8 · invoice due
Sep 1) and MOVED with dates; Leah's seat with Message; her project rooms; the story below; the
two-weeks header after a last-seen manipulation; James sees "Leah Hartwell picked up your request";
Walt/Maya see true rows or nothing; Studio control shows the count; dark + XXL.

### W3 — Navigation (R2; B-1/B-2/B-7/B-8; behind `house-first`; base = main after W2)
- N1 root + routing (Opus xhigh): `PatinaTabBar` (Today · Spaces · Pieces · Studio + Companion
  trailing slot; VoiceOver labels = canonical names; 83 pt), four `NavigationStack`s under one root,
  a route→tab table for every `AppRoute` case, the 105 `navigate(to:)` sites routed through it,
  deep-link + push tab entry, `CompanionSafeArea` inset retired on the flag-on root, both roots
  compiled, the root chosen once from `FeatureFlags`.
- N2 Pieces + Saved: Pieces tab = Browse pieces with server-side `p_category`; `Saved` row at the
  top of Pieces opening the canonical Saved screen; Spaces = Your Spaces; Studio = StudioHubView.
- N3 Companion + tour: collapsed Companion in the bar's trailing slot expanding to a sheet; coaching
  phases and `handleIntent` unchanged; NEXT STEPS decay re-checked; tour rewritten (B-8) with
  `FirstLaunchTourTests` updated.
Acceptance: T1–T14 re-walked with the bar (`-PatinaFlags house-first`); Studio one tap at every
tier; dark + XXL; flag off restores the W2 root byte-for-byte.

### W4 — The house on Today (B §9 W3 remainder; base = main after W3)
Rooms with real numbers (`rooms.budget_cents` local-first + mirror; `committed_cents` where a
project owns the room), saved-row date/room/note, the two 14-day decays removed, project timeline
from the phases the detail already fetches, `profiles.last_seen_at` mirror. No new migration (00537
carried the columns).

### W5 — Purchase (B §5 + R3/Q5/Q6/Q11; `direct-orders`; base = main after W4)
- Backend (Opus): **00538** — `direct_orders.designer_id/project_id/commission_rate` (snapshot in
  `create_direct_order`; immutable after `paid` by trigger), `designer_earnings` partial unique index
  on `order_id`, client-scoped SELECT on `fulfillment_orders`/`fulfillment_order_items`/
  `fulfillment_shipments` (`client_profile_id = auth.uid()`), `fulfillment_config` keys
  `direct_orders.responsibility_paragraph`, `direct_orders.contact`, `direct_orders.tax_shipping_enabled`
  (default false); `stripe-webhook` settle branch: widen `payment_intent_data.metadata` (lines, client,
  designer, ship_to, totals), enqueue `fulfillment_intake`, credit earnings (commission fallback
  chain: `products.commission_rate` → `fulfillment_config` 0.16; same-day roster tie → uncredited),
  post the settle system message into the project thread; `create-checkout-session` direct-order
  branch: fold `shipping_flat_cents` into `amount_cents`, add `automatic_tax` + `shipping_options`
  only when `tax_shipping_enabled`; deno tests. Local: Kody supplies a real `sk_test_` key for the
  local functions env before the W5 walk (the placeholder blocks Checkout).
- Client (Opus): buyability gate (price · seller of record · `dimensions` · `lead_time_weeks` ·
  `brand` · `photo_verified_at`); acts by `DesignerRelationship.isLive`: **live → "Ask Leah to
  source this" (Path B thread message: piece, price, room) and no Buy**; not live → Buy (flag) →
  order sheet (the session's real total; size/lead time; fit line only for rooms measured after the
  segmented control; sold-by; the responsibility paragraph + contact; **the tax/delivery line reads
  "Delivery and tax are added at payment" only when `tax_shipping_enabled`, else "Delivery and tax
  are not included yet" and Path A stays off**) → `create_direct_order` → `create-checkout-session
  {direct_order_id}` → `SFSafariViewController` + poll-on-dismiss → Order placed ("We'll email you
  when it ships." — no painted tracker); Path C "Ask about this piece"; Studio → Ordered over both
  rails; roster attribution at create.
- Acceptance: test-mode end-to-end on the simulator with a Stripe test card; Leah's thread carries
  the settle message; ops sees the fulfillment row; a client with a live designer never sees Buy.

### W6 — Widget + deep links (Q8, B §9 W5; `house-widget`; base = main after W5)
`PatinaWidget` target (small + Lock Screen accessory), timeline from `RecordSnapshotStore` (what
moved, never what is owed), foreground refresh; opt-in due-date local reminder on the invoice.
ASC bundle id + App Group provisioning on device = Kody.

### Later (not this program)
Household second seat (Q9); maker pages; Live Activity on delivery; designer-portal FF&E join (B
W7); client-portal deploy for AASA + piece route (Kody's "ship"); TestFlight archive + device pass
(Apple Pay, push round trip, universal links, App Group); Stripe live keys; a Companion backend that
answers with the client's real state (`companion-context` returns one generic action today).

## Verification ladder per wave
1. Lane: task list reviewed → tests first → build + owned suites green on the lane's clone →
   pathspec commits → lane review → fix rounds until zero blocking.
2. Integration: steward merges lanes into `daily-return/integration` (renumber against the tip),
   `ios-gate.sh all` + lint-delta, `supabase db reset` + pgTAP, deno + client-portal checks.
3. Walk: walker installs the integration build (signed, never `CODE_SIGNING_ALLOWED=NO`), runs
   the acceptance script, shots + ledger + `waves/<wave>/walk.md`.
4. Orchestrator review → ff-merge to main → push → memory → next wave.

## Critique dispositions (P0, `source/build-plan-critique.md`)
B1 taken (00535 dropped; SP-13 client-side over 00103's RPCs; the freed number now carries the
saved_items columns). B2/B3 taken (AASA = client-portal route; a public piece route is lane D's).
B4 taken (columns added to 00533). B5 taken (`delete-account` edge function in lane D). B6 taken
(two rows). B7 taken (Record unflagged; `house-first` = W3 only). B8 taken (`FeatureFlags` in W1a).
B9/B10 taken (W1a prerequisites; W1b lanes re-cut by owned files). M1/M1b taken (AddToRoomSheet
stays; R3 proves call graphs). M2 taken (`@patina/client-portal`). M3 taken (`fulfillment_config`).
M4 taken (verify before 00537). M5 taken (grant posture). M6 taken (four callers). M7 taken (one
backend lane). M8/M9 taken (clones; `all`/lint-delta steward-only). M10/M25 taken (00533–00540;
W2 authors 00537). M11 taken (verify `proposal-sign-confirmation`). M12 taken (lane C). M13 taken
(grafts placed: W2 R1/R2, W5). M14 taken (copy branches on the setting). M15 taken
(`DesignerRelationship`, W1a). M16 taken (entitlement in W2, fallback container). M17 taken (device
claim named). M18 taken (suites owned per lane). M19 taken (primer moves into W1b lane C). M20 taken
(bisect; content contract). M21/M22 taken (W2 R1/R2 explicit). M23 taken. M26/M27 taken (row and
column contracts stated). Understated risks taken (00533 named non-additive; W5 walk gated on a
real test key).
