# P0 — Critique of the build plan (2026-08-27)

Adversarial read of `source/build-plan.md` against `direction-b.md` §2/§4/§5/§9/§11, `direction-a.md`
§5, `shared-planks.md` (all twenty planks, files/size/risk), `synthesis.md` §5, `rulings-2026-08-27.md`,
`instruments.md` §6 + §6b, `research/33-verify-code-truth.json`, and the repository at
`/Users/kody/Code/patina-merged` (main).

Every claim below that says "verified" was checked against the repo in this session; the command or
file:line is quoted. Findings are **Blocking** (the wave cannot start or will fail at integration),
**Major** (real cost or a wrong deliverable), **Minor** (accuracy, hygiene). Nothing is filtered.

Count: **10 blocking · 21 major · 15 minor.**

---

## (a) Spec coverage

### Planks SP-01…SP-20

| Plank | Carried by | Verdict |
|---|---|---|
| SP-01 | W0 H0 | ✅ (missing the ruling's "confirm the constraint name against Strata first" step — see m11) |
| SP-02 | W1 P1 | ✅ |
| SP-03 | W1 P5 | ⚠ **partial** — AASA host wrong (B2), the client-facing piece route is unbuilt and unassigned (B3), `DeepLinkHandler` not named (m4) |
| SP-04 | W1 P2 | ⚠ **partial** — the signature confirmation email (the plank's third repair) is dropped; P2's backend column reads "none" (M11). `Services/API/ProposalsAPIClient.swift` absent from the file set (m2) |
| SP-05 | W1 P2 | ✅ |
| SP-06 | W1 P3 | ⚠ file set omits `Services/Auth/AuthService.swift` (the plank's primary file), `Features/Companion/Views/CompanionOverlay.swift`, `Core/Persistence/LocalStoreReset.swift` |
| SP-07 | W1 P4 | ✅ |
| SP-08 | W1 P5 (durable half) + W2 R2 (primer) | ⚠ **partial** — the plank's *cheap* half (bell empty state falls back to the Studio queue; tier-branched empty CTA) is in no lane (M12); permission ask removed a wave before the primer lands (M19) |
| SP-09 | W1 P4 | ✅ |
| SP-10 | W1 P1 + 00533 | ⚠ **partial** — 00533's column list omits `source_url` (plank requires it) and `photo_verified_at` (W5 depends on it, B4); "withhold a product with no resolvable maker" unstated; the catalog data pass has no owner |
| SP-11 | W1 P3 | ⚠ collides with ruling Q4's deletion of `AddToRoomSheet` (M1); the room-scoping edits live in P1's tree (B9) |
| SP-12 | W1 P3 | ⚠ `CompanionAreaBuilders.swift` (both home branches, the plank's second file) not named |
| SP-13 | W1 P4 + 00535 | ❌ **00535 is wrong** — the RPCs already exist; the plank's backend delta is "None" (B1) |
| SP-14 | W1 P3 + 00536 | ⚠ the plank's actual files (`ProductDetailViewModel`, `RecommendationsViewModel`, `ContentView:292`, `Core/Models/SavedItem.swift`) sit in P1's tree / are misfiled (B9, m3). Tour half correctly deferred to W3 |
| SP-15 | W1 P2 | ⚠ depends on P4's thread-create, unmerged in the same wave (B10) |
| SP-16 | W1 P2 | ✅ (`StudioQueueModels.swift` not named — minor) |
| SP-17 | W1 P2 | ⚠ "Not yet"/"Neither" route through a thread P4 has not merged (B10); the image/swatch content contract has no owner (M20) |
| SP-18 | W1 P1 | ⚠ file set omits `Features/Rooms/Views/RoomProjectView.swift` (P3's tree), `Features/Home/ViewModels/DailyRoomViewModel.swift`, `Features/Home/Views/DailyStoryCard.swift` (unassigned) |
| SP-19 | W1 P4 | ⚠ file set omits `ContentView.swift`, `ProposalDetailView`, `InvoiceDetailView`, `BudgetView` (P2), `SpatialMetadataRow` (P3), `ScanFloorPlanPreviewView`, `PatinaColors.swift` — and the plank's central *decision* (bottom bar above the Hearth vs. orb yields) is never ruled (h4) |
| SP-20 | W1 P4 | ❌ Delete Account is planned "over the existing endpoint"; there is no such endpoint (B5) |

### Direction B §9, W1–W5

| B wave | Item | Plan | Verdict |
|---|---|---|---|
| B-W1 | Record card, two eyebrows, empties, `See all` | W2 R1/R2 | ✅ |
| B-W1 | `RecordSnapshotStore` painted on launch | W2 R1 | ⚠ specified as an **App Group** container; the entitlement is only added in W6 (M16) |
| B-W1 | `LastSeenStore`, greeting from `TimeOfDay` | W2 R1/R2 | ✅ (`TimeOfDay` verified to exist at `Features/Threshold/Models/TimeOfDay.swift`) |
| B-W1 | `BadgeCountService` retains rows; `StudioQueueBuilder` per-item | W2 R1 | ✅ |
| B-W1 | `designer:profiles!…` embeds ×3 | W2 R1 | ⚠ wrong path for the Proposals client (m2) |
| B-W1 | Labelled `Studio` control with count | W2 R2 | ✅ |
| B-W1 | Push call sites + decision trigger, `notification_log_id` | W1 P5 / 00534 | ⚠ one-row design drops the bell row on push failure (B6); grant posture under-specified (M5) |
| B-W1 | `PushPrimerView` | W2 R2 | ✅ (correctly uses SP-08's three-event sentence per Q7, not B §4's four-event one — resolved, worth a note in the plan) |
| B-W2 | Tab bar, Companion in the bar, Pieces tab, Saved as its own door, tour rewrite | W3 N1/N2/N3 | ✅ |
| B-W3 | House on Today, room budget, saved-row date/room/note, decays removed, project timeline | W4 | ✅ |
| B-W3 | Designer seat | W2 R2 | ✅ |
| B-W3 | `project_rooms` read policy | W2 / 00537 | ⚠ a client SELECT policy already exists (M4) |
| B-W4 | Buyability gate, order sheet, Path A/B, settle→intake, Ordered over both rails, designer settle notice, three columns, earnings index, client SELECT on 3 BOH tables, metadata widening | W5 | ✅ in shape; `photo_verified_at` missing (B4), `app_settings` does not exist (M3), total-vs-copy contradiction (M14), R3 predicate unnamed (M15) |
| B-W5 | Widget, deep links, opt-in due reminder | W6 | ⚠ `thread` dropped from the deep-link list (m7); App Group timing (M16); associated-domains capability is provisioning work (M17) |
| B §2 | `NEW THIS WEEK` rail (`published_at` ≤ 7d, **≥3 supply floor, never pad**) and the guest `Start with a room` two-act block | folded into W2 R2 "home composition per tier per B §2" | ⚠ no files, no data path, no floor rule stated (M21) |
| B §2 | Discovering record rows: saved piece **withdrawn** (`products.deleted_at`) / **repriced** vs `saved_items.price_cents_at_save` | not assigned | ❌ **GAP** — 00536 adds the column but no lane builds the query or the row (M22). `products.deleted_at` verified to exist (00435:563) |
| B §2 | Story query reordered `published_at desc, sort_order desc` | SP-18 (P1) covers the dot + non-repeat; the reorder is not stated | ⚠ minor gap |

### Rulings

| Ruling | Carried by | Verdict |
|---|---|---|
| R1 the Record now | W2 | ✅ — but placed behind `house-first`, which R1 does not require and B §9 explicitly does not do (B7) |
| R2 the tab bar | W3 | ✅ |
| R3 pre-emption | W5 | ✅ in prose; the predicate has no named implementation (M15) |
| Q4 retire the July rail | W2 R3 | ⚠ contradicts SP-11 on `AddToRoomSheet`; "zero call sites" is false for ≥8 of the 13 (M1) |
| Q5 attribution columns | W5 / 00538 | ✅ (fallback-rate + tie rules missing — M13) |
| Q6 fulfillment rail | W5 | ✅ |
| Q7 permission copy | W2 R2 | ✅ copy; ⚠ "Settings is the fallback" path unassigned (m12); ask removed a wave early (M19) |
| Q8 widget | W6 | ✅ |
| Q9 household | "Later" | ✅ |
| Q10 hotfix first | W0 H0 | ✅ minus the Strata constraint check (m11) |
| Q11 Stripe test-mode | W5 | ✅ |
| Q12 restart + re-walk | W0 S0 | ✅ |

### Grafts (`synthesis.md` §5)

| Graft | Plan | Verdict |
|---|---|---|
| Draw nothing when nothing moved (guest/discovering) | — | ❌ GAP — the plan inherits B's `"Nothing moved since Thursday."` at every tier with no ruling (M13a) |
| Empty-queue Next Move names the phase from `current_phase` | — | ❌ GAP (M13b) |
| Card weight follows content; six-hour suppression on re-opens | — | ❌ GAP (M13c) |
| `products.photo_verified_at` in the gate | W5 references it | ❌ no migration creates it (B4) |
| Credit the roster designer at `products.commission_rate`, else `fulfillment_config` 0.16; tie ⇒ uncredited | "roster-designer attribution at create" | ⚠ rate chain and tie rule missing (M13d) |
| Real session total; fold flat shipping into `amount_cents`; never a numberless Safari hand-off | W5 | ⚠ `products.shipping_flat_cents` exists nowhere and no migration adds it (M13e); copy contradiction (M14) |
| State-driven "Message Leah" (only when nothing is waiting) | — | ❌ GAP (M13f) |
| No painted "Confirmed" — "We'll email you when it ships." | W5 | ✅ |
| Label the monogram `Studio` with its count | W2 R2 | ✅ |
| Config responsibility paragraph + one reachable human | W5 | ⚠ reads from a nonexistent table (M3) |
| `BadgeCountService` retains rows; `StudioQueueBuilder` per-item | W2 R1 | ✅ |
| Widen `payment_intent_data.metadata`; `notification_log_id` on every push | W5 / W1 | ✅ |

---

## (b) Contradictions with canon or rulings

**B7 · BLOCKING — one flag gates two independently-ruled changes.** The plan puts the Record (W2)
and the tab bar (W3) behind the same `house-first`. R1 ruled the Record in *now*; R2 ruled the tab
bar in as the expensive, previously-refused item that "rides its own flag". Direction B §9 keeps its
W1 record **unflagged** ("W1 is one mount ... removable by deleting one mount") and scopes
`house-first` to W2–W3. As written, rolling back the tab bar — the single most likely rollback in the
program — also removes the Record, and the W3 acceptance criterion "flag off restores the W2 root"
is unsatisfiable because flag-off restores the *pre-W2* root.
*Fix:* mount the Record unflagged (B's own design), or introduce `house-record` and reserve
`house-first` for the root swap. Say which root the flag-off branch draws at each wave.

**M1 · MAJOR — Q4 deletes what SP-11 mounts.** Ruling Q4's orphan list includes `AddToRoomSheet`;
SP-11 (W1 P3) exists to *mount* `AddToRoomSheet`. The plan hedges "(or its replacement)" and then
lists the same file in W2 R3's deletion set. Verified: `Patina/Features/Home/Views/AddToRoomSheet.swift`
is already referenced by `Features/ProductDetail/ViewModels/ProductDetailViewModel.swift`.
*Fix:* strike `AddToRoomSheet` from the Q4 list in writing (a ruling amendment Fable should surface to
Kody), and state that SP-11 keeps it.

**M1b · MAJOR — "zero call sites" is false for most of the Q4 list.** Verified references (grep over
`apps/mobile/Patina`): `DailyProductCard` ← `DailyRoomViewModel.swift`, `ProductCard.swift`,
`DailyProductDetailView.swift`; `StudioHubSection` ← `DailyRoomStateBlocks.swift`,
`MarketplaceLinksSection.swift`; `ContinueScanCard` ← `DesignRequestResumeBanner.swift`;
`AddToRoomSheet` ← `ProductDetailViewModel.swift`. R3 is therefore not a delete-only hygiene pass: it
edits live files owned by other lanes' recent work.
*Fix:* R3's first task is to enumerate the real referencing files per orphan and get the steward to
sequence it after W1's merges; drop "after proving zero call sites" as the entry condition.

**M7 · MAJOR — backend ownership contradicts itself.** The team model says the Backend lane (1 per
wave) owns "the wave's migrations + edge functions + SQL/deno tests, `supabase db reset`", and the
global constraints say "one owner of `supabase db reset` per wave (the backend lane)". W1 then puts
00533 in P1, 00534 in P5, 00535 in P4, 00536 in P3 and names no backend lane at all.
*Fix:* either W1 gets a real backend lane that owns all four migrations (and the feature lanes code
against them), or the constraint is rewritten to "the steward serialises `db reset`".

**M19 · MAJOR — the permission ask is removed a wave before its replacement lands.** W1 P5 deletes
`promptForAuthorizationAfterFirstSubmission`; W2 R2 adds `PushPrimerView`. Between those merges the
app has *no* path to authorization while 00534 has begun calling `apns-send`. Q7 says the ask moves,
not that it disappears for a wave.
*Fix:* ship the primer in W1 P5 (it is iOS-only work, as B §9 itself notes), or hold 00534's apns
call behind a config flag until W2.

**M14 · MAJOR — the order sheet's copy contradicts its own money delta.** W5 ships `automatic_tax` +
`shipping_options` "behind a server setting that defaults OFF", but keeps B §5's step-5 line
("Delivery and tax are added at payment. You'll see the full total before you pay."). With the
setting off, neither is added — the line is false, which is exactly the C5 failure the program exists
to repair. B §5's own text gates this: "true only once the delta above ships; until then Path A does
not ship."
*Fix:* state the two copy variants and which setting state draws which, or hold Path A behind the
setting as B does.

---

## (c) Lane file-set overlaps that will collide at integration

The plan claims "five lanes with disjoint file sets" and names three shared touches
(`DailyRoomView.swift`, `CompanionActionRows.swift`, `ProductDetailView.swift`). Cross-referencing
each plank's verified file list against the lane table gives at least fifteen collisions.

**B9 · BLOCKING — the W1 lane file sets are not disjoint.**

| File | Claimed owner | Also edited by | Why |
|---|---|---|---|
| `Features/ProductDetail/ViewModels/ProductDetailViewModel.swift` | P1 (`Features/ProductDetail/**`) | **P3** | SP-14: seed `isSaved`, idempotent `toggleSave`, mirror to `saved_items` (`:18,:44-78,:104-125`) |
| `Features/ProductDetail/Views/ProductDetailView.swift` | P1 | **P4**, **P5** | SP-13 message act (`:86-138`); SP-03 share subject/message (`:117-121`) |
| `Features/Recommendations/ViewModels/RecommendationsViewModel.swift` | P1 (implied) | **P3** | SP-14 heart/save (`:138-196`, `:230-238`); SP-11 room scoping (`:99-110`) |
| `Features/Recommendations/Views/RecommendationsView.swift` | P1 | **P3** | SP-11 card menu → "Add to room" (`:304-335`) |
| `Features/Rooms/Views/RoomProjectView.swift` | P3 (`Features/Rooms/**`) | **P1** | SP-18 stat row `0 IN AR` / `— MATCH` (`:235-243`) |
| `Features/Profile/ViewModels/StudioQueueBuilder.swift` | P2 | **P4**, **W2 R1** | SP-13 `conversationThreadRow` nil (`:186-219`); SP-07 "Awaiting you" seed (`:12-36`) |
| `Features/Decisions/Views/DecisionDetailView.swift` | P2 (`Features/Decisions/**`) | **P4** | SP-13 message-from-decision (`:206-232`) |
| `Features/Proposals/Views/ProposalDetailView.swift` | P2 | **P4** | SP-19 Hearth collision on `Sign proposal` (`:32-38`, `:137-151`) |
| `Features/Invoices/Views/InvoiceDetailView.swift` | P2 | **P4** | SP-19 status-bar inset (`:38-41`) |
| `Features/Budget/BudgetView.swift` | P2 | **P4** | SP-19 inset (`:26-31`) |
| `ContentView.swift` | unassigned | **P3**, **P4** | SP-14 route drops room context (`:292-294`); SP-19 Hearth mount (`:166`) |
| `Features/Rooms/Components/SpatialMetadataRow.swift` | P3 | **P4** | SP-19 targets (`:46-50`) |
| `Features/Companion/Views/CompanionOverlay.swift` | unassigned | **P3** | SP-06 unfiltered `fetchCount` (`:190-195`) |
| `Services/Auth/AuthService.swift` | unassigned | **P3** | SP-06 `reconcileLocalStoreOwner` (`:169-197`) |
| `Features/Companion/Services/CompanionAreaBuilders.swift` | unassigned | **P3** (and P4's message rows) | SP-12 both home branches (`:28-49`) |
| `apps/mobile/PatinaDesignKit/.../Tokens/PatinaColors.swift` | unassigned | **P4** | SP-19 dynamic tokens (`:154-166`) — P1 also owns `PatinaAsyncImage` in the same package |
| `Features/Home/ViewModels/DailyRoomViewModel.swift`, `Features/Home/Views/DailyStoryCard.swift` | unassigned | **P1** | SP-18 story pick + hard-coded dot (`:196-201`, `:80-87`) |
| `Services/API/APIConfiguration.swift` | unassigned | **P4** | SP-20 delete endpoint (`:182`) |

*Fix:* re-cut the lanes by **file**, not by feature area, using each plank's verified `Where` block;
publish a one-file-one-owner table in the plan; move SP-19's cross-cutting chrome work and SP-13's
placement work into a sixth "chrome + placement" lane that lands **after** P1/P2/P3 (or before them,
as a W1a).

**Good news, verified:** `Patina.xcodeproj/project.pbxproj` is `objectVersion = 77` with three
`PBXFileSystemSynchronizedRootGroup` entries and only five `PBXFileReference`s — **new .swift files
do not touch the pbxproj**, so W2's five new files will not conflict. The pbxproj *is* touched by
W6's widget target and by any entitlement change (M16/M17); say so.

---

## (d) Sequencing errors

**B10 · BLOCKING — intra-wave dependencies on unmerged lanes.** Inside W1, with five lanes running
concurrently off the same base:
- SP-17 (P2) — "Not yet" / "Neither of these" *"open the project thread from SP-13"* — SP-13 is P4.
- SP-15 (P2) — the pay-failure error state offers *"Message your designer"* — SP-13 again.
- SP-08 (P5) — the bell's empty CTA branches by tier (`"Message your designer"` at engaged) — needs
  SP-07's tier fix (P4) *and* SP-13's thread.
- SP-08 (P5) — the bell falls back to "the same queue the Studio already computes" — needs P2's
  unified count and per-item rows.
- SP-14 (P3) — mirrors saves to `saved_items` — must not fight SP-06's claim step (same lane, fine)
  but does depend on P1's widened `ProductModel` decode for price-at-save.

*Fix:* a **W1a** mini-wave merged first, containing exactly SP-07 (one line + the sheet branch),
SP-13's `MessagingAPIClient.create` + the two existing RPC calls, and the count unification; then
W1b's four lanes build against merged interfaces.

**M23 · MAJOR — W5 depends on a W1 migration that does not carry the column.** The W5 client bullet
says the gate reads "`products.photo_verified_at` from SP-10's migration"; 00533's column list in the
same document does not include it (see B4). A wave-5 lane cannot mint it late without a new number
(the reservation is exhausted — M10).

**M24 · MAJOR — W2's snapshot store depends on a W6 entitlement.** See M16.

**M25 · MAJOR — W4's migration number is undecided by design.** "same migration file if W2's has not
merged, else `00539`" makes the number a function of merge timing across waves; `00539` is outside
the reserved range and unowned. Renumbering an *already-applied* local migration forces a
`supabase db reset` for every lane holding that stack.

---

## (e) Missing interfaces

**B8 · BLOCKING — no flag gate exists, and no way to turn one on locally.** Verified:
`Services/Analytics/PostHogService.swift:149` is the only flag API; it returns `false` whenever
`isEnabled` is false, and `isEnabled` is set false when `AppConfiguration.postHogAPIKey` is empty —
`Secrets.example.swift:31` ships `postHogAPIKey = nil`, and `Secrets.swift` is gitignored
(`.gitignore:53`), so each lane's copied Secrets decides whether flags exist at all. PostHog flags
also load **asynchronously** after `setup()`, so "evaluated once at launch and held" will read `false`
on a cold launch unless the code waits on `onFeatureFlags`. `--uitesting` disables flags outright
(`PatinaApp.swift:25-27`), so no UI test can exercise a flag-on path. And Kody targets "client
auth-user UUIDs" in PostHog project 326191 while every walk runs local seeded accounts with different
UUIDs.
*Fix, before W2 starts:* one `FeatureFlags` type with `houseFirst / directOrders / houseWidget`,
resolved once at launch in this order — `ProcessInfo` launch argument override (`-HouseFirst 1`,
debug builds only) → PostHog (after `onFeatureFlags`, with a bounded wait) → `false`. Name the type,
its file, and its owner in the plan; every flag-gated lane and every walk script depends on it.

**M15 · MAJOR — the R3 pre-emption predicate is unnamed.** "A live designer relationship (accepted
lead or active project)" gates the Buy button, Path B, and Path C's routing. Post-SP-07 the inputs are
`DesignRequestStatusService.promotedRequest` and the projects list, but no function, module or owner
is stated, and P4 (which fixes the lead filter) is a different wave from W5 (which consumes it).
*Fix:* name it (e.g. `DesignerRelationship.isLive`), state its inputs, and have P4 ship it in W1.

**M26 · MAJOR — 00534's row contract is unstated.** The client reads `notification_log` through
`Core/Network/NotificationsAPIClient.swift` (`RemoteNotification`: `type`, `channel`, `status`,
`metadata`) with `visibleStatusFilter = in.(queued,sending,delivered,unconfirmed,opened,clicked)`,
and routes via `App/DeepLinking/NotificationRouter.swift:61-88`, which switches on a **lowercased
`entityType`** with values `project | proposal | decision | invoice | design_request | lead | thread |
message_thread | room | product | piece`. The plan never says which `type` strings 00534 writes, which
`channel`, or that `metadata` must carry `entity_type` + `entity_id` in those exact spellings.
*Fix:* put the row shape in the plan; it is the seam between P5's SQL and P5's Swift and it is the
whole of SP-08's "durable" half.

**M27 · MAJOR — 00533's return-column names are not the RPC's names.** Verified `00246:199-212`:
the frozen `RETURNS TABLE` uses `material_tags TEXT[]` (not `materials`), `maker_name/maker_location/
maker_story`, `price_cents`, `id TEXT`. The plan asks for `materials` and `brand` without saying
whether they are new columns or renames, and `ProductModel` decoding depends on the exact names.
*Fix:* write the full new `RETURNS TABLE` in the plan (or in 00533's task list) before P1 codes.

**h-level interfaces also missing:** the `HouseRecord` row model's public shape (W2 R1 owns it; W2 R2,
W4 and W6's widget all read it); the `RecordSnapshotStore` codable payload (the widget target decodes
it in W6); the route→tab mapping type for W3 N1 (`AppRoute` lives in `App/Coordinators/Coordinator.swift`,
76 cases, 105 `navigate(to:)` sites — both verified).

---

## (f) Wrong or unverifiable facts

**B1 · BLOCKING — `rpc_start_direct_thread` already exists, with a different parameter.** Verified
`supabase/migrations/00103_comms_rpcs.sql:51` — `CREATE OR REPLACE FUNCTION
public.rpc_start_direct_thread(counterpart UUID)`, `GRANT EXECUTE ... TO authenticated` at `:105`;
and `rpc_start_project_thread(p_project_id UUID)` at `:113`, granted at `:173`. It is live in prod
code paths (`00331_ceremony_complete.sql:284`). The plan's 00535 —
"`rpc_start_direct_thread(p_project_id)` idempotent" — is (i) a duplicate of work SP-13 explicitly
prices at **"Backend delta. None."**, and (ii) not applicable as written: `CREATE OR REPLACE` on the
same `(UUID)` signature with a renamed parameter fails with *"cannot change name of input parameter"*.
*Fix:* delete 00535. P4's SP-13 work is client-side only: add `create` to `MessagingAPIClient`
(calling `rpc_start_project_thread` for a project, `rpc_start_direct_thread(counterpart)` for a matched
client with no project), emit the Studio row at zero threads, and add the empty-state CTA.

**B2 · BLOCKING — the AASA path is wrong and the file already exists elsewhere.** Verified: there is
no `apps/designer-portal/public/.well-known/`; the association file is a Next route handler at
`apps/client-portal/src/app/.well-known/apple-app-site-association/route.ts` (with a test beside it),
currently serving one appID — `VP22LXHT7L.cloud.patina.field`, paths `/field/sr_*`. The client app's
identity is `PRODUCT_BUNDLE_IDENTIFIER = cloud.patina.app`, `DEVELOPMENT_TEAM = VP22LXHT7L`
(`Patina.xcodeproj/project.pbxproj:530,413`). A dot-prefixed directory under `public/` is also not a
reliable asset path on OpenNext/Workers.
*Fix:* extend the existing client-portal route with a second `details` entry for
`VP22LXHT7L.cloud.patina.app` and the piece path pattern, update
`.well-known/apple-app-site-association/__tests__/route.test.ts`, deploy **client-portal** via
`infra/deploy-portal.sh`, and set `com.apple.developer.associated-domains` to that host.

**B3 · BLOCKING — the "homeowner-facing URL" has no route behind it.** Verified: no product/piece/
library route exists anywhere under `apps/client-portal/src/app`. SP-03's first move ("point the share
at a client-facing piece route whose Open Graph title is the piece and its maker") is therefore
unbuildable as an iOS-only change, and the plan assigns no portal work beyond the AASA file.
*Fix:* add the portal route (page + OG metadata + public read) to P5's scope or to a portal lane, and
name the exact URL shape that `PatinaPortalLinks` will emit and `DeepLinkHandler` will parse.

**B4 · BLOCKING — `products.photo_verified_at` does not exist and nothing creates it.** Verified:
zero hits for `photo_verified_at` across `supabase/migrations/`. It is an A-graft (direction-a §5,
"three are new in wave 2"), not something SP-10 ever proposed. 00533's stated columns
(`dimensions, lead_time_weeks, brand, description, published_at, materials, finish, patina_managed`)
do not include it — nor `source_url`, which SP-10 requires.
*Fix:* add `photo_verified_at TIMESTAMPTZ` (and `shipping_flat_cents INTEGER` if the graft's freight
fold is kept — also absent, M13e) to 00533 with the projection, or restate the gate without them.

**B5 · BLOCKING — there is no account-deletion endpoint.** Verified: `delete_user_account` appears
nowhere in `supabase/migrations/` or `supabase/functions/`; only the unused enum case
`APIConfiguration.swift:182` (`case deleteAccount`) and its URL at `:220`. The plan's P4 row says
"Delete Account UI over the existing endpoint". Building a button over a missing RPC ships a dead
control (C5) and does not satisfy App Store 5.1.1(v) — which SP-20 flags as release-gating.
*Fix:* give W1 a new edge function (revoke the auth user, clear/anonymise client rows, clear the local
store per SP-06) with its own migration/config entry — or cut Delete Account from W1 and record it as
the release gate it is.

**M2 · MAJOR — the designer-portal gate command does not run.** Verified:
`npx turbo type-check --filter=designer-portal --dry=json` → `x No package found with name
'designer-portal' in workspace`. The package is `@patina/designer-portal`.
*Fix:* `pnpm turbo type-check --filter=@patina/designer-portal`. (Moot for SP-03 once B2 moves the
work to client-portal — which is `@patina/client-portal`.)

**M3 · MAJOR — `app_settings` does not exist.** Verified: the only settings table in the schema is
`public.fulfillment_config` (`00351_fulfillment_events_config.sql:77`), which already carries
`commission_rate_default = {"rate":0.16}` at `:104`. The W5 line "the responsibility paragraph +
contact read from `app_settings`" names a table that has never existed.
*Fix:* name `fulfillment_config` (add two keys) or declare the new table in 00538.

**M4 · MAJOR — 00537's `project_rooms` policy may already exist.** Verified
`00066_proposal_project_flow_v2.sql:249-253` — `CREATE POLICY "Clients can view their project rooms"
ON project_rooms FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND
p.client_id = auth.uid()))`, plus a studio policy at `00316:148`. If the rail cannot read
`budget_cents`, the cause is elsewhere (grants, the iOS client having no fetch, or the policy lacking
`TO authenticated`).
*Fix:* W2's backend task starts by proving the failure against a local reset, then either hardens the
existing policy `TO authenticated` or drops the migration.

**M6 · MAJOR — the frozen-contract blast radius is under-counted.** Verified callers of
`get_recommendations` outside iOS: `apps/client-portal/src/app/api/feed/[roomId]/route.ts`,
`packages/supabase/src/database.types.ts`, `supabase/tests/aesthete/shim_contract_test.sql`,
`supabase/seed/00-legacy-grants.sql`. The plan mentions only the two GRANTs (correctly — `00246:307-308`
grants `authenticated` **and** `anon`) and a `supabase/tests` case.
*Fix:* list the four; require the pgTAP contract test to be updated in the same commit, types
regenerated, and both portals' type-checks run.

**M20 · MAJOR — two mechanism corrections from `33-verify-code-truth.json` are not reflected.**
(i) F45: `SettingsView.swift:50-58` **is** a real `NavigationLink { AccountView() }` — the defect is a
push that does not happen; the correction says "wire it up is the wrong fix" and SP-20 says the cause
"needs a bisect, not a redesign". The plan's P4 row ("fix the inert Account row") reads as a wiring
task and budgets nothing for a bisect. (ii) F44: `DecisionDetailView.optionCard` already renders
`resolvedImageURL`; the missing colour is *seed/authoring* content. SP-17's "require an image or a
swatch per option before it can render as choosable" is therefore a content contract with a
designer-portal dependency and a fallback ("your designer is still adding the options") — no wave owns
the designer-side prompt.

**m1 · MINOR — line ref off by one.** `.toolbar(.hidden, for: .navigationBar)` is
`ProductDetailView.swift:46`, not `:47`. (The embed at `ProductAPIClient.swift:99` is correct,
verified verbatim.)

**m2 · MINOR — API-client paths.** W2 R1 names `Core/Network/{Decisions,Proposals,Projects}APIClient.swift`.
Verified: `Core/Network/` contains Decisions, EditorialStories, Messaging, NetworkError, Notifications,
Product, Projects, Rooms, SupabaseClient. **Proposals and Invoices live in `Services/API/`.**
(The plan did correctly fix direction-b's `Core/Services/BadgeCountService.swift` → `Services/Badges/`.)

**m3 · MINOR — `TableItemModel` and `SavedItem` are in `Core/Models/`,** not `Core/Persistence/`
(P3's row says "Core/Persistence/** (RoomStore, TableItemModel)"). `RoomStore.swift` is in
`Core/Persistence/` ✅.

**m4 · MINOR — `PatinaPortalLinks` is at `Features/Shared/PatinaPortalLinks.swift`,** not `Core/…`;
and the URL-host switch to extend is `App/DeepLinking/DeepLinkHandler.swift:75-92` (plus
`NotificationRouter`), not `AppCoordinator` alone.

**m5 · MINOR — verified counts, worth keeping:** `navigate(to:` = **105** sites; `AppRoute` = 76 cases
in `App/Coordinators/Coordinator.swift`; `CompanionHearthMetrics.reservedHeight` = 64 + 36 + 20 = **120**.

**m6 · MINOR — flag-key convention.** Existing iOS flags are snake_case (`ios_screen_name_v2`,
`onboarding_walk_first`); the plan's `house-first` / `direct-orders` / `house-widget` follow the web
convention. Fine either way — but PostHog keys must match exactly, so state the literal strings once.

**m8 · MINOR — `saved_items.room_id` already exists** (`00055_saved_items.sql:23`, nullable). 00536's
"if absent" hedge reads as uncertainty about a settled fact.

**m9 · MINOR — `notification_log.type` has no CHECK** (`00041:37`, plain `TEXT`), so new type strings
are safe; the table has **no `deep_link` column** — deep-link data must go in `metadata`.

**m10 · MINOR — `mock/deck-parts/14b-answers.html` already exists.** W0 D0 should say "rewrite from
the rulings and re-QA", not "create".

**m11 · MINOR — H0 drops half of ruling Q10.** Q10 says "confirm the constraint name against Strata
first"; the H0 bullet does not. A read-only `information_schema` check on Strata is cheap and the
plank calls it out as the one thing that could swap one error for another.

**m12 · MINOR — Q7's "Settings is the fallback"** (`SettingsView.swift:68-80`, the notifications
toggle) is unassigned.

**m13 · MINOR — worktree naming.** `.codex/worktrees/agent-dr-<wave>-<lane>` is correct for
`.gitignore`'s `agent-*` rule (patina-parallel-work §3) — worth stating so nobody renames it to
`dr-<wave>`.

**m14 · MINOR — sandbox mechanics are absent.** Every lane runs `xcodebuild`, `xcrun simctl` and the
`supabase` CLI, all of which fail under the command sandbox. The global constraints never say to run
them with the sandbox disabled; each lane will rediscover this.

**m15 · MINOR — B §2's cadence ruling is not surfaced.** B asks Kody to name the owner of
`editorial_stories` and the catalogue publishing pass; W2's story demotion and any `NEW THIS WEEK`
floor depend on it. The plan carries neither the question nor a default.

**m7 · MINOR — W6's deep-link list drops `thread`** (B §4: invoice, proposal, decision, thread, order).

---

## (g) Risks the plan understates

**B6 · BLOCKING — the bell row vanishes when the push fails.** Verified: `apns-send/index.ts:217-238`
stamps the passed `notification_log_id` row to `status:'delivered'` on ≥1 success and
`status:'failed'` otherwise (it returns early at `:156` with `skipped:'no_tokens'`, so the
no-token case is safe). `NotificationsAPIClient.visibleStatusFilter` is
`in.(queued,sending,delivered,unconfirmed,opened,clicked)` — **`failed` is excluded**. The plan's
00534 inserts *one* client-facing row and hands its id to `apns-send`, so a failed push (sandbox
token, revoked permission, expired token) silently deletes the in-app row — reproducing F08, the
finding SP-08 exists to close, in a new way.
*Fix:* two rows — `channel='in_app'` (never passed to apns-send) and `channel='push'` (passed) — or
insert the push row separately inside `notify_client_attention`.

**M5 · MAJOR — the grant posture on a SECURITY DEFINER writer is under-specified.** The global
constraint is "`REVOKE EXECUTE … FROM anon` on every new function". `notify_client_attention` inserts
into `notification_log` (whose INSERT policy is service-role-only, `00041:88`) **for an arbitrary
`user_id`**. Granted to `authenticated`, any signed-in client could forge notifications for another
user.
*Fix:* `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;`
— the trigger on `client_decisions` reaches it as the definer, and the edge functions call it with the
service-role key. Also note `apns-send` is service-role-only by design (its own header says so), so
"call sites added to proposal-send / invoice-send / invoice-reminders" must go through
`public.invoke_edge_function` or an explicit service-role fetch — the plan mixes both idioms.

**M8 · MAJOR — five lanes will fight over one simulator.** `ios-gate.sh`'s `sim_destination()` picks
the *first* available `iPhone (17|16|Air)` UDID, and `all` = build + `xcodebuild test -only-testing:PatinaTests`.
Five concurrent lanes select the same device; concurrent `xcodebuild test` runs on one simulator
flake or fail outright — while the same document declares the walker the wave's single simulator owner.
*Fix:* lanes run `ios-gate.sh build` + `lint-delta` continuously and queue the `unit` tier through the
steward, or each lane gets its own cloned simulator and a `-destination` override (the script would
need a flag it does not have today).

**M9 · MAJOR — `lint-delta` creates a git worktree on every run.** `cmd_lint_delta` runs
`git worktree add --detach` in the shared `.git` (script ~`:108`) and removes it in a trap. With five
lanes gating concurrently, expect registry contention and stray `$TMPDIR/base` worktrees; the script
falls back to "treat base warnings as 0 (strict)" when the add fails, which turns a race into a
spurious gate failure. `scripts/repo-gc.sh` may also sweep them mid-run.
*Fix:* note the behaviour, serialise gates, and tell lanes that a "could not create base worktree"
warning means re-run, not fix-your-code.

**M10 · MAJOR — the migration reservation is exhausted before the program is.** 00533–00538 = six
numbers; W1 uses four, W2 one, W5 one. Nothing is reserved for W4 (which the plan itself says may need
`00539`), for SP-20's deletion function (B5), or for W6. Verified current tip: `00531_restore_extension_
execute_authenticated.sql` (plus an unapplied `_pending/00106_drop_client_messages.sql`).
*Fix:* reserve 00533–00541 and assign each number in the wave table.

**M16 · MAJOR — App Group timing.** `Patina/Patina.entitlements` today carries only `aps-environment`
and `com.apple.developer.applesignin` (verified). An App Group is an entitlement + pbxproj +
Apple-developer-portal capability change, and W2's `RecordSnapshotStore` is specified as an App Group
container while W6 owns the entitlement. Without the group, `containerURL(forSecurityApplicationGroupIdentifier:)`
returns nil and the snapshot silently no-ops.
*Fix:* either add the App Group in W2 (and route it through Kody's paperwork with the widget bundle
id) or spec W2's store in the app container with a documented W6 migration.

**M17 · MAJOR — associated-domains is provisioning work, not a file.** Enabling
`com.apple.developer.associated-domains` on `cloud.patina.app` requires the App ID capability and a
refreshed profile before any signed build; iOS also caches AASA, so the "link opens the app" half of
SP-03 is a **device** claim on a program with no device pass and no installable TestFlight build.
*Fix:* add the App-ID capability to Kody's list beside the widget bundle id, and mark SP-03 as
"compile-green + share-sheet-verified in W1; link-opens-app device-gated".

**M18 · MAJOR — existing test suites will break and no lane owns them.** Verified suites at risk:
`PushTokenServiceTests` (P5 removes the ask), `NotificationsAPIClientContractTests` (P5),
`ProductDecodingTests` (P1 widens the model), `EngagementTierTests` (P4/SP-07),
`CompanionActionMatrixTests` (P3/SP-12), `AccountIsolationTests` (P3/SP-06), `BudgetAggregationTests`
(P2/SP-16), `InvoicesMoneyRailTests` + `ProposalsMoneyRailTests` (P2), `DailyRoomFeedMappingTests`
(P1/W2), `FirstLaunchTourTests` (W3), `AuthSheetPresentationTests` (P4/SP-09).
*Fix:* name the suites per lane row; "tests written first" is otherwise ambiguous about the 68 that
already exist.

**M21 · MAJOR — `NEW THIS WEEK` and the guest home are unspecified.** B §2 gives guest and discovering
a `New this week` rail with a **≥3 supply floor that never pads**, a `published_at` ≤ 7 days filter, a
`Start with a room` two-act block ("Type the dimensions" / "Scan it", light act first), and one quiet
sign-in line. W2 R2's row folds all of this into "home composition per tier per B §2" with no files and
no data path. The floor is a honesty rule (C5) and needs the RPC's new `published_at` (00533) plus a
client-side count check.
*Fix:* give W2 R2 explicit sub-items and files, or defer the guest/discovering composition to W4 in
writing.

**M22 · MAJOR — the discovering record's own rows are unbuilt.** B §2's discovering record is *"a
saved piece withdrawn (`products.deleted_at` since the last visit)"* and *"a saved piece's price
changed against `saved_items.price_cents_at_save` — stating both numbers, never a countdown or a
was/now strike"*. 00536 adds the column; no lane composes the rows, and there is no read path
(`get_recommendations` returns neither `deleted_at` nor a per-saved-item price).
*Fix:* either assign the query + rows to W2 R1 (with the honesty rule written into the task), or cut
the discovering record to the story row and say so — otherwise the W2 walk's "Walt/Maya see the record
with true rows" acceptance line cannot pass.

**Understated elsewhere, briefly:**
- *Rollback.* "Every migration is additive-only" is true except 00533, which is a **DROP + CREATE** of
  a frozen contract with four external callers — the one irreversible step in W1, and the plan's
  rollback section does not name it.
- *`supabase db reset` contention.* Four W1 migrations in four worktrees means four local stacks or one
  shared stack replayed by whoever merges last; the plan assigns the reset to a lane that does not exist
  in W1 (M7).
- *Walks.* Every wave's acceptance walk from W2 onward requires a flag that cannot currently be turned
  on locally (B8); the W5 walk additionally requires Stripe test keys Kody has not confirmed (Q11) and
  a Checkout hand-off that has **never been observed working** (C27 — every local edge function 503'd),
  which is exactly what W0's S0 is meant to re-prove. If S0 fails, W5's acceptance criterion is
  unreachable and the plan has no branch for that.

---

## (h) What an implementer would need that the plan does not give

1. **A one-file-one-owner table** for W1 (see (c)) — the lane rows are feature areas, and the planks'
   own `Where` blocks cross them fifteen ways.
2. **The `FeatureFlags` type and its local override** (B8) — nothing flag-gated can be built or walked
   without it.
3. **The 00533 `RETURNS TABLE` in full**, with the exact column names and their `ProductModel` decode
   keys (M27), plus the four non-iOS callers to re-verify (M6).
4. **The 00534 row contract** — `type` strings, `channel`, and the `metadata.entity_type` /
   `entity_id` spellings `NotificationRouter` already switches on (M26).
5. **The `HouseRecord` public model and the `RecordSnapshotStore` payload** — read by W2 R2, W4 and
   W6's widget across three waves.
6. **A ruling on SP-19's Hearth** — "pin the primary act above the Hearth" *or* "the orb yields on
   screens that own a primary act". The plank offers both; the plan picks neither, and the choice
   changes `ContentView`, `CompanionSafeArea` and every money screen.
7. **The R3 relationship predicate** (M15).
8. **Which existing test suites each lane owns** (M18).
9. **The sandbox note** — `xcodebuild`, `xcrun simctl`, `supabase` must run with the command sandbox
   disabled (m14).
10. **The gate command that actually works** — `--filter=@patina/designer-portal` (M2), and the fact
    that `ios-gate.sh all` needs an exclusive simulator (M8).
11. **A named fallback if W0 S0 fails** — the Checkout hand-off has never been seen working locally;
    W5's acceptance depends on it.
12. **The Kody list, consolidated:** PostHog flag creation (project 326191, literal keys); App ID
    capabilities — Associated Domains **and** App Group **and** the widget bundle id under ASC
    6762007888; Stripe key/tax rulings; the responsibility-paragraph copy; the editorial/catalogue
    cadence owner; the `client_visibility_tier` line-price policy (SP-04's open ruling, correctly
    noted but not tracked anywhere); and the Q4 amendment that spares `AddToRoomSheet` (M1).

---

## Recommended amendments before W1 opens

1. Delete 00535; move SP-13 to client-only (B1).
2. Move SP-03's AASA to `apps/client-portal/.well-known/...` and add the missing piece route (B2, B3).
3. Add `photo_verified_at` (+ `source_url`, and `shipping_flat_cents` if the freight graft stands) to
   00533 (B4, M13e).
4. Decide Delete Account: new edge function in W1, or cut and track as the release gate (B5).
5. Split the notification row in two (B6).
6. Split the flag: `house-record` vs `house-first` (B7).
7. Ship the `FeatureFlags` gate with the launch-argument override as W2's first task (B8).
8. Re-cut W1 by file, and insert a W1a for SP-07 + SP-13 + the count unification (B9, B10).
9. Give W1 a backend lane and reserve 00533–00541 (M7, M10).
10. Carry or explicitly cut each unassigned graft and each unassigned B §2 block (M13, M21, M22).
