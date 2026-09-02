# A4 — prior-review reconciliation (Patina iOS, TestFlight-polish audit, 2026-09-01)

READ-ONLY pass. Main tip `d7287c3f8`. App = `apps/mobile/Patina` (bundle `cloud.patina.app`).
Bar applied: a first-round TestFlight tester on a **Release** build against **Strata production**,
with **every PostHog flag OFF on the first launch** (`house-first`, `direct-orders`, `house-widget`),
on an **iPhone 17 Pro (LiDAR present)**.

Sources reconciled:

1. `docs/design/ios-ux-review-2026-07/index.html` — U01–U46, plus its delivery record
   `docs/design/ios-ux-review-2026-07/DELIVERY.md` (written at tip `74f01410`, 2026-07-28).
2. `artifacts/ios-daily-return-2026-08-26/research/31-verified-findings.md` +
   `36-findings-by-theme.md` (F01–F213).
3. `artifacts/ios-daily-return-2026-08-26/source/build-plan.md` — every Backlog / Carry-over / OWED
   row — and `RESUME.md`'s OWED list.
4. `artifacts/ios-daily-return-2026-08-26/waves/*/` walk + review + integration records.

Claim levels used below: **code-verified** (read on main), **prod-verified** (read-only query
against Strata `bkvcixdmuyejfzcijpdg` or a public HTTPS GET), **not verified**. Nothing here is
sim- or device-verified.

---

## 0. The headline

Every one of U01–U46 was delivered in July, and the July fixes that still have an owner on main are
**still in place**. What has changed since is not the Swift: it is (a) **the August rewrite**
(The Daily Return, W2's R3 "retire the July home rail") removing the components three of the July
fixes lived in, and (b) **the server and content halves of the August program never reaching
production**.

Concretely: **`00533`–`00540` are not applied on Strata** (prod-verified), the **`delete-account`
edge function is not deployed** (prod-verified), the **Sanity tour bodies were never republished**
(prod-verified), and the **PostHog flags were never targeted** (Kody's own OWED). The result is that
a first-round tester meets a marketplace with zero pieces, a save that fails every time, a Delete
Account button that cannot work, and a first-launch tour that describes a screen the app retired
five weeks ago.

---

## 1. July review — U01–U46

| id | title (July) | status on main | evidence |
|---|---|---|---|
| U01 | Identity is a placeholder ("Kody", monogram K, member-since = today) | **fixed** | `Patina/Features/Profile/ViewModels/ProfileViewModel.swift:15-48` — `UserIdentity.displayName` reads ProfileService → auth metadata → email local part; guests "Guest", unknown "You". code-verified |
| U02 | Every card claims 80% match | **fixed** | no hardcoded `matchScore: 80` remains; `Product.matchScore` decodes from the RPC (`Core/Models/ProductModel.swift:83`). code-verified |
| U03 | Filter chips return silent blanks | **fixed** | `RecommendationsViewModel.category(forFilter:)` sends `p_category` server-side; `filteredProducts { products }` no longer double-filters (`Features/Recommendations/ViewModels/RecommendationsViewModel.swift:64,79-82`). code-verified |
| U04 | Fake "Suggested Next" ("A rug would ground the arrangement") | **fixed** | string absent from the tree. code-verified |
| U05 | Dead controls presented as live | **partly re-opened → see A4-09** | "Refine your style →" / "See all →" / Terms-footer non-links gone. But `Features/Rooms/Views/ItemActionMenu.swift:30` still offers **View in AR**, and on prod no piece can ever have a model (`products` has no `usdz_url` column; `get_recommendations` projects `NULL::text AS usdz_url`) — so it always lands on "3D model not available for this product". prod-verified + code-verified |
| U06 | Companion room rows drop the roomId | **fixed** | `ContentView.swift:272,299-302` honours `roomId` for `.roomSavedItems` / `.roomEmergence`. code-verified |
| U07 | "Browse Picks for This Room" root-resets to Home | **fixed** | `Features/Rooms/Views/RoomProjectView.swift:254-263` routes to `.roomEmergence(roomId:)` when the room has a remote id. code-verified |
| U08 | Twelve labels for one flow | **fixed** | canonical "Get design help" throughout `CompanionAreaBuilders`/`CompanionActionRows`. code-verified |
| U09 | Five names for Saved | **fixed** | "Browse pieces" / "Saved" canonical (`PatinaTab.swift:41`, `RecommendationsView.swift:62,191`). code-verified |
| U10 | Two names for the QR feature | **fixed** | "Connected Portals" absent; `SettingsView.swift:74` follows AccountView's "Sign in to Web". code-verified |
| U11 | Engineering vocabulary ("THE AESTHETE ENGINE", USDZ/Mesh pills) | **fixed** | strings absent. code-verified |
| U12 | Whole-card `.onTapGesture` with no chrome | **fixed** | zero `.onTapGesture` left under `Features/Home` and `Features/Shared`. code-verified |
| U13 | Opening a room hides behind metadata text | **superseded** | `RoomContextBar` was deleted by W2's R3 hygiene; the house rail / room hero replaced it. code-verified |
| U14 | Swipe-only skip, hidden save/share | **fixed** | explicit "Not for me" menu row (`RecommendationsView.swift:488`). code-verified |
| U15 | No visible way to end a scan | **fixed** | persistent Finish control (`Features/RoomScan/Views/ScanWalkView.swift:42-44,112`). code-verified |
| U16 | CrossRoom tap ≠ detail | **fixed** | `CrossRoomView.swift:130` → `.pieceDetail`. code-verified |
| U17 | Dead `.swipeActions` inside a ScrollView | **fixed** | remaining `.swipeActions` are inside real `List`s (`ScanPickerView.swift:99`, `NotificationFeedView.swift:85`). code-verified |
| U18 | Back-button chrome varies | **fixed** | `PatinaScreenChrome` / `.patinaScreen(` used on 32 sites. code-verified |
| U19 | Studio invisible and unexplained at `.discovering` | **fixed (re-homed)** | the locked-state line survives the R3 retirement as `Features/Profile/Views/StudioHubView.swift:122` "Your Studio begins with a project." code-verified |
| U20 | Companion gating contradicts home gating | **fixed** | `CompanionAreaBuilders.swift:18-21` — the Studio door is tier-gated, unresolved tier reads `.discovering`. code-verified |
| U21 | Guest "Sign in to…" ejects to the auth root | **fixed** | `AuthSheet` presented over context (`ContentView.swift:112`, `ProductDetailView.swift:253`). code-verified |
| U22 | Eight terminal Studio empty states | **fixed** | `StudioHubView.swift:239-246` renders `section.kind.emptyMessage` per section. code-verified |
| U23 | No home path to Your Spaces | **fixed** | `.houseRail` / `.roomHero` / `.startWithARoom` blocks (`Features/Home/Models/TodayExperience.swift:285-289`). code-verified |
| U24 | Saved/Browse tier-gated away from the home | **RE-OPENED → A4-07** | W2's R3 deleted `MarketplaceLinksSection` and `WorkWithDesignerCTA`. `HomeComposition.blocks` (`TodayExperience.swift:273-297`) has **no Browse block at all**, and `.savedSummary` requires `savedPieceCount > 0`. On the flag-off root the marketplace is reachable only through the unlabeled Companion orb. code-verified |
| U25 | Tab-bar evidence carry | **superseded** | W3 built the tab bar behind `house-first`. |
| U26 | Scan-review save failure invisible | **fixed** | `ScanReviewView.swift:46,164-167,229` — a distinct `saveError` inline banner over the loaded state. code-verified |
| U27 | Room rename silently discarded | **fixed** | `RoomSettingsView.swift:29,77-79` — debounced save + unconditional flush on `.onDisappear`. code-verified |
| U28 | "Save without notes" drops the curation | **fixed** | `ScanReviewView.swift:670,681-696` — hero + reorder preserved; only the notes text is skipped. code-verified |
| U29 | Errors set but never rendered | **fixed for the July sites; a NEW instance exists → A4-06** | `RecommendationsView.swift:253-255` renders `viewModel.error` in `PatinaErrorState` with retry. But `BadgeCountService.lastRefreshFailed` (`Services/Badges/BadgeCountService.swift:129,219`) is set and read by **no view**. code-verified |
| U30 | Bare spinners, two retry labels | **fixed** | `PatinaLoadingState` on 22 sites; `PatinaErrorState.retryLabel = "Let's try that again"` is the single retry component. code-verified |
| U31 | Empty states that dead-end | **fixed** | e.g. `RoomProjectView.swift:145` "Room not found (U31)"; `CollectionsView` / `CrossRoomView` carry "Browse pieces" CTAs. code-verified |
| U32 | First-launch tour teaches a UI that doesn't exist | **RE-OPENED via content → A4-01** | the Swift fallback is correct (`Features/Help/FirstLaunchTour.swift:274-300`), but Sanity **wins** (`FirstLaunchTour.swift:880-905`: `loaded?.body ?? step.fallback?.body`) and Sanity `production` still serves the July bodies. prod-verified |
| U33 | Onboarding page 3 promises a camera ask | **fixed** | the camera ask is a real `.cameraPermission` state in `FirstLaunchCoordinator.swift:101-113`. code-verified |
| U34 | Unlabeled abstract navigation glyph | **fixed** | standing "Next steps" caption until `.learned` (`Features/Companion/Views/CompanionOverlay.swift:610-613`). code-verified |
| U35 | Dark camera for 5 s before any cue | **fixed** | `ScanThresholdView.swift:118` "Begin walking to start — or tap here." from second zero. code-verified |
| U36 | Two identical muted texts after a scan | **fixed** | hierarchy restored in `ScanSavedConfirmationView.swift:86`. code-verified |
| U37 | Reveal secondary CTA duplicates the primary | **fixed** | "or explore your style profile" absent from the tree. code-verified |
| **U38** | Quiz result CTA lands on Home | **fixed** | `Features/StyleQuiz/Views/StyleResultView.swift:47-52` → `.emergence(pieceId: nil)`; the onboarding callback (`OnboardingFlowHost.swift:110-113`) routes to the same place. code-verified. ⚠ the destination is empty on prod — see A4-02 |
| **U39** | Marketplace can blank itself silently | **fixed in code; the symptom is live on prod for a different reason → A4-02** | tolerant per-row decode (`Core/Network/ProductAPIClient.swift:96-111` `FailableDecodable`), category normalized not thrown (`ProductModel.swift:96-99`), error rendered with retry (`RecommendationsView.swift:253-255`, `RecommendationsViewModel.retry()`). code-verified |
| **U40** | Non-LiDAR room funnel discards the user's work | **fixed** | `Features/RoomScan/Views/QuietConversationFlowHost.swift:378-421` — `acceptFallbackFloorPlan()` → `persistFallbackRoom()` → `RoomCreationCoordinator.createManualRoom`, lands on `.roomProject(roomId:)`, idempotent through `session.localRoomId`. code-verified. Not on the first-round tester's path anyway (iPhone 17 Pro has LiDAR) |
| U41 | Companion nudge touch-through / z-order | **fixed (code); not re-walked** | `CompanionIntroBubble.swift:54-57` "The card consumes its own touches (U41)"; `.contentShape` on every Companion surface. code-verified only — the original was a live-capture finding |
| U42 | Stale Companion context after the quiz | **fixed** | context recomputed from live state on open (`CompanionOverlay.swift:246`). code-verified |
| U43 | "47% Style Confidence" | **fixed** | string absent; the result reads "A starting point — refine it any time." code-verified |
| U44 | Home footer links illegible at the safe-area edge | **superseded by A4-07** | the links no longer exist at all on the flag-off root. code-verified |
| U45 | Backend failure silently demotes the home | **PARTLY RE-OPENED → A4-06** | the tri-state resolver survives (`Core/State/EngagementTier.swift:51-101`, `.unknown` when a load is outstanding) — but `DailyRoomView.swift:208-214` maps `.unknown` straight back to `.discovering`, and the one signal that distinguishes "waiting" from "we couldn't reach your studio" (`BadgeCountService.lastRefreshFailed`) has no reader. code-verified |
| U46 | Review step drops Budget and Vision | **fixed** | `Features/DesignServices/DesignRequestFlowView+Steps.swift:98-106` — both rendered, Vision verbatim. code-verified |

**July tally:** 38 fixed · 3 superseded (U13, U25, U44) · 5 re-opened or regressed
(U05→A4-09, U24→A4-07, U29→A4-06, U32→A4-01, U45→A4-06).

---

## 2. The Daily Return (Aug 2026) — Backlog / Carry-over / OWED rows

Every scripted wave (W0–W6) is on main; F01–F213 were addressed through the SP-01…SP-20 planks and
the R1/R2/R3 waves. What the plan itself recorded as *not done* is below.

| source row | status | evidence |
|---|---|---|
| **W3 OWED (Kody)** — publish the three Sanity tour bodies before `house-first` is enabled | **STILL OPEN, and worse than recorded** | Sanity `kv3qrinl/production` still serves the July copy for all three coachmarks (prod-verified, §3). The plan assumed this only mattered with the flag on; it does not — R4 put the rewritten tour on **both** roots, so the stale Sanity copy reaches the flag-off root too |
| W3 backlog — M9's `Rugs` chip and the other N2-named gaps | open | not re-verified; chip list is `["All","Seating","Tables","Lighting","Storage"]` (`RecommendationsViewModel.swift:49`) — no Rugs |
| W4 → W5 A11Y — Companion action sheet does not scroll at accessibility text sizes | **closed by W5's A11Y lane** | `waves/w5/a11y-tasks.md` §B delivery; `CompanionHearthMetrics.reservation(accessibilityText:)` (`Design/Components/CompanionSafeArea.swift:149-150`) |
| W4 → W5 A11Y — the floating orb steals taps at accessibility sizes on the flag-off root | **partly closed; a default-size instance remains → A4-11** | `CompanionHearthMetrics.yieldsToAccessibilityText` is honoured (`CompanionOverlay.swift:183`). But W6's own flag-off shot still showed the orb over the `YOUR HOUSE` rail's first card (`waves/w6/integration.md:203-205`), and `companionSafeArea()` (`CompanionSafeArea.swift:197`) has **no production call site** — only the root-stack `.companionHearthReservation` (`ContentView.swift:185`), which moves a scroll view's resting position and cannot lift a horizontally-scrolling rail out from under a floating dock |
| W4 backlog — a claimed guest room never syncs up (coordinator is pull-only) | open, honest ("Saved on this phone" pill) | not re-verified |
| W4 backlog — typed room names occasionally truncated under automation typing | open (harness artefact; never reproduced by hand) | — |
| W4 backlog — `panelShielded`'s retiring task has no fuse | open | `waves/w4/fix3-log.md` |
| W5 unmet — real `sk_test` locally; Stripe Tax / shipping registration | **OPEN, Kody** → A4-14 | plus `get_direct_order_terms` does not exist on Strata (prod-verified) — so `tax_shipping_enabled` is unreadable in prod even if the flag were on |
| W5 → W6 session-isolation carry-over | **closed in W6 (X3), unit-verified only** | `waves/w6/integration.md:269` §9.2; §9.7 item 1 — the account-switch **walk was never driven** → A4-15 |
| W6 §9.7 item 2 — `wipeGuestWork` does not clear the two style-profile keys | **STILL OPEN** → A4-10 | `Core/Persistence/LocalStoreReset.swift:83-105` — `wipeGuestWork` never calls `StyleProfileStore.shared.reset()`, which `wipeUserScopedData` (line 52) does |
| W6 §9.7 item 3 — MN-2/3/5/6/7/9/11/12 minors | open, none a correctness defect | `waves/w6/x3-review.md` |
| W6 not verified — a widget actually rendered on a Home/Lock Screen | not verified (device claim) — and with `house-widget` off it would render the placeholder forever → A4-08 | `PatinaWidgetShared/HouseWidgetPayload.swift:128-134` |
| **RESUME OWED** — PostHog flags `house-first` / `direct-orders` / `house-widget` targeting | **STILL OPEN, Kody** → A4-12 | brief's own standing fact: flags are OFF on a TestFlight first launch |
| **RESUME OWED** — client-portal deploy for the AASA + `/piece/<id>` page | **CLOSED** | `https://client.patina.cloud/.well-known/apple-app-site-association` → 200 and `/piece/<uuid>` → 200 (prod-verified) |
| **RESUME OWED** — App ID associated-domains + App Group + widget bundle id | **open, Kody**, not verified here → A4-13 | `waves/w6/integration.md:396-410` |
| **RESUME OWED** — TestFlight archive + device pass | open, Kody | — |
| **RESUME OWED** — rulings: `designer_clients` retention on closure; erasure default; "· due Sep 1" wording; Stripe Tax | open, Kody (product rulings, not code) | `waves/w1b/rulings-fable.md`, `waves/w2/` |
| "Later (not this program)" — household second seat (Q9/F54), maker pages, Live Activity on delivery, designer-portal FF&E join, a Companion backend that answers with real state | open **by design** | `source/build-plan.md` §Later |

---

## 3. The server + content half of the August program is not on production

All prod-verified against `bkvcixdmuyejfzcijpdg` (read-only).

```
supabase_migrations.schema_migrations ≥ 00530:
  00530, 00531, 00532, 00541 … 00554        ← 00533–00540 ABSENT
```

Consequences a first-round tester meets:

| missing artefact | migration | what breaks in the app |
|---|---|---|
| `saved_items.price_cents_at_save` | 00535 | **every** remote save 400s — `CreateSavedItemPayload` (`Core/Network/RoomsAPIClient.swift:129-148`) always encodes the column; `RoomsAPIClient.createItem` throws through `ensureOK`. → A4-03 |
| `purge_client_account` (+ the `delete-account` edge function, absent from the deployed function list) | 00538 | Delete Account cannot work. Apple 5.1.1(v). → A4-04 |
| `notify_client_attention` | 00534 | no in-app/push row is ever written for a proposal, invoice or decision — the bell stays "Nothing yet" while the Studio shows work. This was F08/F38/F85's server half |
| `get_recommendations` widened contract (`brand`, `dimensions`, `lead_time_weeks`, `finish`, `photo_verified_at`, `source_url`, `shipping_flat_cents`, `published_at`, `patina_managed`, `deleted_at`) | 00533 | prod still runs the 00246 14-column version (`pg_get_functiondef` confirms). Every SP-10 spec row on a piece is honestly absent; `withholdingUnresolvedMakers` (`ProductAPIClient.swift:85-94`) must fall back to the vendor name, and a piece whose vendor is null is silently **withheld** from the feed |
| `rooms.budget_cents`, `profiles.last_seen_at` | 00537 | W4's room budgets and W2's last-seen mirror are inert |
| `get_direct_order_terms`, direct-order attribution | 00540 | the purchase path cannot read its terms (moot only because `direct-orders` is off) |

**And the catalogue itself is empty to the app** (prod-verified):

```
select count(*) from public.get_recommendations(null,null,20,0);   →  0 rows
select count(*) from public.get_aesthete_matches(
  p_session_key := 'ae460000-0000-4000-8000-00000000e057', p_limit := 50);  →  0
public.products: 15 rows (8 'published', 5 'draft', 2 'in_review'); 4 with vendor_id; 4 with brand
public.product_style_spectrum: 1 row;  v_aesthete_catalog_input: 1 row
```

The matcher has one eligible catalogue row and returns none, so the browse grid renders
"0 pieces chosen for your space" over a blank grid — with no error, because there is no error.
→ A4-02.

**Sanity `kv3qrinl/production`, `helpContent` where `surfaceKey match "ios-app/first-launch-tour*"`**
(prod-verified, `_updatedAt` 2026-07-28):

| surfaceKey | published `coachmarkContent` | what the app's own fallback says | what the anchor actually is |
|---|---|---|---|
| `…/step-1-home` | "Welcome to Patina" / **"This is your Daily Room — picks and stories chosen for your space."** | "Welcome to Patina" / "This is Today — what moved in your house, and what is waiting on you." | the greeting header on Today. "Daily Room" is a name B-7(c) retired |
| `…/step-2-saved` | "Save what you love" / **"Add pieces to a room with + Add — they follow you everywhere."** | "What needs you" / "Anything waiting on you lands here, dated. Tap a line to go straight to it." | the **HouseRecord card** — there is no "+ Add" on it |
| `…/step-3-profile` | "Your profile" / **"Rooms, saved pieces, and settings live here."** | "Your Studio" / "Your studio — projects, proposals, invoices and files" | the Studio pill / Studio tab |

Sanity wins: `FirstLaunchTour.swift:880-885` — `loaded?.heading ?? step.fallback?.heading`. → A4-01.

---

## 4. What is GOOD (calibration)

- The five release-gating July items (U38, U39, U40, U45, U01) are genuinely, legibly fixed in the
  Swift, each with the finding id in the comment and a test suite behind it
  (`FallbackRoomDraftTests`, `RoomCreationCoordinatorTests`, `ProductDecodingTests`,
  `EngagementTierTests`). The tolerant-decode and tri-state-tier fixes are the right shapes, not
  patches.
- The shared primitives held: `PatinaLoadingState` (22 sites), `PatinaErrorState` with one retry
  label, `PatinaScreenChrome` (32 sites). U18/U30's "one component everywhere" survived a whole
  second program's rewrite, which is unusual.
- The August rewrite is unusually honest about its own limits in code comments — `flagOn` fails
  closed on the widget, `HomeComposition.recordDraws` refuses to print an empty record to someone
  with no house, `persistFallbackRoom` is idempotent by design.
- `AASA` + `/piece/<id>` are live on `client.patina.cloud` — one of Kody's OWED items is already
  closed and nobody had recorded it.

## 5. Not verified, and why

- **Every U-item marked "fixed" is code-verified only.** Nothing in this lane was run on a
  simulator or a device. U41 (touch-through) and U32 (tour step mounting) were originally
  *live-capture* findings; reading the fix is weaker evidence than the finding that produced it.
- **A4-11 (orb over the house rail)** is inferred from a missing call site plus W6's own flag-off
  screenshot note. It needs one screenshot on the review simulator to confirm or drop.
- **A4-13 (App ID capabilities, widget bundle-id registration)** needs App Store Connect; the
  scoped `asc-*` skills and `~/.blitz/asc-credentials.json` were not used (read-only audit, and the
  claim is Kody's to make).
- **F01–F213 were not re-verified individually.** The build plan is the authority that the SP-planks
  landed (1523 tests on main); this lane checked only the rows the plan itself recorded as
  unfinished, plus the July items the August rewrite could have broken.
- **Whether the missing migrations are deliberate.** `00533`–`00540` may be parked on purpose
  (memory records "plain `db push` still drags pending 00533–00540"). The *effect* is prod-verified;
  the *intent* is Kody's to state.

---

## 6. Findings (still open) — full ledger

### A4-01 — U32: production still serves the retired tour copy on all three steps
- area first-run · **major** · testerVisible · confidence 0.95 · effort S
- where: Sanity `kv3qrinl/production` (three `helpContent` docs, `_updatedAt` 2026-07-28) +
  `apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:880-905`
- evidence: step 1 published body is *"This is your Daily Room — picks and stories chosen for your
  space."*; step 2 is *"Add pieces to a room with + Add — they follow you everywhere."* anchored on
  the HouseRecord card, which has no "+ Add"; step 3 says *"Your profile"* over the Studio pill.
  `resolvedBody = loaded?.body ?? step.fallback?.body` — the CMS wins, so the correct in-app
  fallbacks never render.
- why: this is the tester's first thirty seconds, and every sentence of it is false. It is U32
  exactly, re-created through content after the Swift was fixed.
- fix: publish `waves/w3/n3-sanity-copy.md`'s three bodies to the three surface keys. No code change.

### A4-02 — U38/U39 lineage: the marketplace is empty on production
- area product · **blocker** · testerVisible · confidence 0.95 · effort M
- where: Strata `public.get_recommendations` / `public.get_aesthete_matches` / `product_style_spectrum`
- evidence: `select count(*) from get_recommendations(null,null,20,0)` → **0**;
  `get_aesthete_matches(neutral profile, limit 50)` → **0**; `products` holds 15 rows (8 `published`)
  but `product_style_spectrum` and `v_aesthete_catalog_input` hold **1** row each. The quiz's
  "View Recommendations" (U38's fix) and every Companion "recommendations" row land here.
- why: the marketplace is the product's front door and it renders "0 pieces chosen for your space"
  over a blank grid. The July fix removed the *lie*; the tester still meets the *blank*.
- fix: run the aesthete catalogue pass over the 8 published products (or seed spectrum rows) so the
  matcher returns them; separately consider a "we're still curating" state rather than a zero count.

### A4-03 — every remote save fails on production (`saved_items.price_cents_at_save` missing)
- area money/product · **blocker** · testerVisible · confidence 0.9 · effort S
- where: `apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift:129-148,357-368`; Strata
  `public.saved_items`
- evidence: prod `saved_items` columns are
  `brand_name,created_at,id,image_url,name,notes,price_in_cents,product_id,room_id,source,updated_at,user_id`
  — **no `price_cents_at_save`** (00535 unapplied). `CreateSavedItemPayload` encodes it
  unconditionally, so PostgREST answers PGRST204/400 and `ensureOK` throws on every save.
- why: SP-14's whole point was that a save survives a reinstall and reaches a second device. It
  reaches neither, and the tester is told so (`SavedItemMirror.deferredNotice`) on every single save.
- fix: apply 00535 (with 00533–00540), or make the field conditional. Prefer the migration.

### A4-04 — Delete Account cannot work on production
- area settings-account / prod-readiness · **blocker** · testerVisible · confidence 0.9 · effort S
- where: `supabase/functions/delete-account/index.ts:85`; Strata function list; `pg_proc`
- evidence: `delete-account` is **absent** from Strata's deployed edge functions, and
  `public.purge_client_account` (00538) does not exist. The app's Delete Account row therefore hits
  a 404 function calling a missing RPC.
- why: a dead destructive control in Settings, and Apple guideline 5.1.1(v) requires in-app account
  deletion for any app that creates accounts — this is a review blocker, not only a polish item.
- fix: apply 00538 and `supabase functions deploy delete-account`.

### A4-05 — the Daily Return server half (00533–00540) is not on Strata
- area prod-readiness · **major** · testerVisible · confidence 0.95 · effort M
- where: `supabase_migrations.schema_migrations` on `bkvcixdmuyejfzcijpdg`
- evidence: applied set jumps `00532 → 00541`. Missing: `notify_client_attention` (00534 — the bell
  stays "Nothing yet" for every proposal/invoice/decision), the widened `get_recommendations`
  (00533 — no size, lead time, finish, brand or provenance on any piece; `withholdingUnresolvedMakers`
  falls back to vendor name and silently withholds vendorless pieces), `rooms.budget_cents` +
  `profiles.last_seen_at` (00537), `get_direct_order_terms` (00540).
- why: A4-03 and A4-04 are instances of this; the rest degrades the piece page and the bell to
  honest-but-empty. One deploy closes all of them.
- fix: selective apply of 00533–00540 against Strata (note: a plain `db push` is the recorded trap).

### A4-06 — U45/U29 regression: a total Studio-fetch failure silently paints the discovering home
- area today-home / performance-resilience · **major** · testerVisible · confidence 0.85 · effort S
- where: `Features/Home/Views/DailyRoomView.swift:207-214`;
  `Services/Badges/BadgeCountService.swift:125-129,214-220`
- evidence: `EngagementTier.currentState` correctly answers `.unknown` while the two services are in
  flight, and `DailyRoomView.tier` then returns `.discovering`. `BadgeCountService.lastRefreshFailed`
  — whose own doc comment says it "distinguishes 'still waiting' from 'we couldn't reach your
  studio', **which the home needs**" — is written at line 219 and **read by no view anywhere in the
  app** (grep: only `OrdersService`'s same-named property has readers).
- why: this is U45's shape after the rewrite. On a flaky first launch a client with a real project
  sees a house with no record, no designer seat and "Bring your first room into Patina", with
  nothing saying the app couldn't reach the server.
- fix: render `lastRefreshFailed` on Today (the app already has `PatinaErrorState` with retry), or
  hold the previous snapshot and say so.

### A4-07 — U24/U44: the flag-off Today root has no door to Browse pieces or to design help
- area wayfinding / today-home · **major** · testerVisible · confidence 0.9 · effort M
- where: `Features/Home/Models/TodayExperience.swift:196-211,273-297`;
  `Features/Home/Views/DailyRoomView.swift:265-362`
- evidence: `HomeBlock` has no browse case and no designer-CTA case; `blocks(for:)` emits
  header / record / nextMove / designerSeat(engaged+) / roomHero|houseRail|startWithARoom /
  newThisWeek / savedSummary(`savedPieceCount > 0`) / story / signInLine. W2's R3 deleted
  `MarketplaceLinksSection` and `WorkWithDesignerCTA`. The `Pieces` tab that replaced them is behind
  `house-first`, which is OFF for this tester. The remaining door is
  `CompanionAreaBuilders.homeItems` (`:64` `recommendationsRow`) — inside the unlabeled orb.
- why: U24's ruling was "permanent rows or affordances at **every** tier". On the root a first-round
  tester actually gets, the marketplace and the design-request flow — the product's two conversion
  surfaces — have no home affordance at all. W6's own walker hit this
  (`waves/w6/walk.md:147`: *"the flag-off root has no piece browse from Today"*).
- fix: either turn `house-first` on for testers (A4-12), or restore a Browse/Saved and a "Get design
  help" affordance to the flag-off composition.

### A4-08 — the widget says "Open Patina to see your house." forever
- area widget-deeplinks · **major** · testerVisible · confidence 0.85 · effort S
- where: `apps/mobile/PatinaWidgetShared/HouseWidgetPayload.swift:116,128-134,231-234`;
  `Patina/Core/Persistence/RecordSnapshotStore.swift:66,113-121`
- evidence: `drawableRows` returns `[]` and `isPlaceholder` is `true` whenever `flagOn == false`;
  `flagOn` is written from `FeatureFlagMirror.isOn(.houseWidget)`, which is `false` on a TestFlight
  first launch and stays false until Kody targets the tester in PostHog. The widget extension is
  embedded in the app (`PatinaWidget.appex`), so it appears in the widget gallery regardless.
- why: a tester who adds the widget is told to open Patina; opening Patina changes nothing, forever.
  That is the U05 lesson — a control that cannot be trusted — on the Home Screen.
- fix: hide the widget from the gallery when the flag is off, or ship `house-widget` on.

### A4-09 — U05: "View in AR" is a permanent dead end
- area product · **minor** · testerVisible · confidence 0.85 · effort S
- where: `Features/Rooms/Views/ItemActionMenu.swift:30`;
  `Features/ARPlacement/ViewModels/ARPlacementViewModel.swift:119-121`;
  `Features/ARPlacement/Views/ARPlacementView.swift:198` (`noModelMessage`)
- evidence: prod `products` has no `usdz_url` column at all, and `get_recommendations` projects
  `NULL::text AS usdz_url` — so `hasUSDZModel` is false for every piece and the AR screen always
  renders "3D model not available for this product". W2's R3 already removed the Companion's
  `tryInRoomRow` for exactly this reason and left the menu row standing.
- why: U05's rule — wire it or remove it. A tester who follows the promise gets a camera view and an
  apology.
- fix: hide the row until `usdzURL != nil`, matching what R3 did to the Companion row.

### A4-10 — "Start fresh" leaves the guest's taste portrait behind
- area onboarding / settings-account · **minor** · testerVisible · confidence 0.9 · effort S
- where: `Patina/Core/Persistence/LocalStoreReset.swift:83-105` vs `:52`
- evidence: `wipeUserScopedData` calls `StyleProfileStore.shared.reset()` (line 52);
  `wipeGuestWork` — the SP-06 claim sheet's "Start fresh" arm — never does. The keys
  `patina.style_profile_response.v1` / `…_completed.v1` live in `UserDefaults.standard` and carry no
  account. Recorded as still open in `waves/w6/integration.md` §9.7 item 2.
- why: a tester who takes the quiz as a guest, signs in, and deliberately chooses "start fresh" keeps
  the portrait they asked to discard — and the Companion reads it as their taste.
- fix: call `StyleProfileStore.shared.reset()` from `wipeGuestWork` too.

### A4-11 — the Companion orb sits over the house rail's first card on the flag-off root
- area visual-system / accessibility · **minor** · testerVisible · confidence 0.55 · effort M
- where: `Design/Components/CompanionSafeArea.swift:197` (`companionSafeArea()`);
  `ContentView.swift:185`; `waves/w6/integration.md:203-205`
- evidence: `companionSafeArea()` has **no production call site** — only its own preview at `:216`.
  The root applies `.companionHearthReservation`, which moves a scroll view's resting position; a
  horizontally-scrolling `YOUR HOUSE` rail card can still pass under the floating dock. W6's own
  flag-off screenshot note records the overlap ("pre-existing, not introduced here"), carried from
  W4 and only partly answered by W5's accessibility-size fix.
- why: the first room card is the one thing on a new tester's Today, and the orb is over it.
- fix: needs one screenshot to confirm before deciding; then either extend the yield policy to the
  rail or inset the rail itself.

### A4-12 — OWED (Kody): PostHog flags were never targeted
- area testflight-config · **major** · testerVisible · confidence 0.9 · effort S
- where: `RESUME.md` OWED list; `Patina/Core/State/FeatureFlags.swift:60,98,195`
- evidence: `house-first`, `direct-orders` and `house-widget` resolve to false on a Release first
  launch (PostHog cache empty), and to false thereafter unless a tester is targeted. Everything W3
  (tab bar), W5 (purchase) and W6 (widget) built is therefore invisible or inert — and A4-07 and
  A4-08 are direct consequences.
- why: a first-round tester is judging a product whose last three waves are switched off.
- fix: Kody's call — target the testers in PostHog, or ship the flags on for 1.0.

### A4-13 — OWED (Kody): App ID capabilities and the widget bundle-id registration
- area testflight-config · **major** · not tester-visible until it fails · confidence 0.6 · effort S
- where: `waves/w6/integration.md` §9.7; `Patina/Patina.entitlements`
- evidence: the entitlements declare `applinks:client.patina.cloud`, App Group
  `group.cloud.patina.app` and `aps-environment`; W6 recorded the ASC registration of
  `cloud.patina.app.widget` (under app `6762007888`) and the App Group capability on **both** App IDs
  as still owed. Not verified in this lane (App Store Connect access deliberately unused).
- why: an archive that misses these fails upload or ships a widget that cannot read the App Group.
- fix: verify in ASC before the archive. AASA itself is live (verified, 200) — that half is done.

### A4-14 — OWED (Kody): Stripe key + Tax/shipping ruling, and `get_direct_order_terms` is missing
- area money · **minor** (while `direct-orders` is off) · confidence 0.85 · effort M
- where: `source/build-plan.md` W5 "Unmet by design until Kody acts"; Strata `pg_proc`
- evidence: `public.get_direct_order_terms` does not exist on Strata (00540 unapplied), so
  `tax_shipping_enabled` cannot be read; W5's walk already proved `Continue to payment` is disabled
  with the honest copy "Delivery and tax are not included yet…". With `direct-orders` off the whole
  path is unreachable, so no tester meets it in round one.
- fix: Kody's Stripe Tax/shipping ruling, a real key, then 00540 — in that order.

### A4-15 — the account-switch seam is unit-verified only
- area tests-gates · **minor** · not tester-visible · confidence 0.8 · effort M
- where: `waves/w6/integration.md` §9.7 item 1
- evidence: W5's walk found `DesignerThreadOpener` resolving a second account against the first
  account's project (the server refused it; no leak, but the send failed). W6's X3 lane built the
  `SessionScope` reset and enumerated 72 `static let shared` holders — and the walk that would prove
  it was never driven, because input delivery on that clone was dead.
- why: sign-out/sign-in inside one process is a normal tester act and the seam has never been walked.
- fix: one scripted account-switch walk on a healthy simulator.
