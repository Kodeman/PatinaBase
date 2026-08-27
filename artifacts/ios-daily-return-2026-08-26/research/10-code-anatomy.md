# 10 — Code anatomy of the Patina client app (G1)

Repo state: `main @ 3cd84ecb3`, 2026-08-26. All paths repo-relative. Every `file:line` was read, not inferred.
Evidence level: **code-read** throughout (no simulator, no screenshots — other lanes own those).

**The one thing the panel must know before reading anything else.** The home screen was rewritten
twice in the last two commits touching it (`126e59a11 feat(ios): connect Option B experience`,
`6dbc6f964 feat(ios): deliver contextual Today experience`). `DailyRoomView` is now a **three-module
"Today" surface** — greeting header, one Next Move card, one editorial story, one Active Room card
(`apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:104-145`). Every block the brief
named — `StudioHubSection`, `MarketplaceLinksSection`, `WorkWithDesignerCTA`, `RoomChipRail`,
`RoomContextBar`, `DailyProductCard`, `DailyFeedEmptyModule`, `ContinueScanCard`,
`DesignRequestStatusCard`, `HomeStudioBlock` — **still compiles, still has previews, and is mounted
by nothing**. The tier system still resolves; nothing on the home reads it. The consequences ripple
through A1, A2, A3, A5, A10, A13 and every task path in `15-task-paths.md`.

---

## A1 — Screen + route inventory

### AppRoute cases (`apps/mobile/Patina/Patina/App/Coordinators/Coordinator.swift:52-103`)

Destination wiring: `apps/mobile/Patina/Patina/ContentView.swift:209-382`.
"Reached how" = the *live* paths today, after the Option B home rewrite.

| Route (`Coordinator.swift` line) | View file | Reached how (live) | Orphan risk |
|---|---|---|---|
| `.heroFrame` :53 | `Features/Home/Views/DailyRoomView.swift:11` (root, `ContentView.swift:199`) | app root; Companion "Home" row (`Features/Companion/Services/CompanionActionRows.swift:32`) | — |
| `.yourSpaces` :54 | `Features/Rooms/Views/YourSpacesView.swift:13` | Companion only (`CompanionActionRows.swift:146`); `RoomProjectView` not-found state (`Features/Rooms/Views/RoomProjectView.swift:108`); Next Move fallback when a room id fails to parse (`DailyRoomView.swift:235`) | **No home door** |
| `.roomProject(roomId:)` :55 | `Features/Rooms/Views/RoomProjectView.swift:12` | home Active Room card (`DailyRoomView.swift:126-137`); Profile room cards (`Features/Profile/Views/ProfileView.swift:273`); `patina://room/<uuid>` (`App/DeepLinking/DeepLinkHandler.swift:175`); push `entity_type=room` (`App/DeepLinking/NotificationRouter.swift:82`) | — |
| `.roomSettings(roomId:)` :56 | `Features/Rooms/Views/RoomSettingsView.swift` | ⚙ button in room hero (`RoomProjectView.swift:176`) | — |
| `.crossRoom` :57 | `Features/Rooms/Views/CrossRoomView.swift` | Whole-Home bar in Your Spaces (`YourSpacesView.swift:53`); Companion rows (`CompanionAreaBuilders.swift` "See by room"/"All saved items") | 3 acts deep |
| `.manualRoomEntry` :58 | `Features/Rooms/Views/ManualRoomEntryView.swift` | Companion only (`CompanionAreaBuilders.swift:128`) | **No screen door** |
| `.roomSavedItems(roomId:)` :59 | `Features/Collections/Views/CollectionsView.swift:11` (roomId set) | Companion only (`CompanionAreaBuilders.swift:138`) | **No screen door** |
| `.emergence(pieceId:)` :60 | `Features/Recommendations/Views/RecommendationsView.swift:11` (nil id) / `ProductDetailView` (non-nil) | Companion "Your recommendations"; Saved empty states (`CollectionsView.swift:237,264`); `RoomProjectView.swift:321`; StyleResult companion row | **No home door to "Browse pieces"** |
| `.roomEmergence(roomId:)` :61 | `RecommendationsView(roomId:)` (`ContentView.swift:287`) | home Next Move `.exploreActiveRoom` (`DailyRoomView.swift:242`); `RoomProjectView.swift:319`; Companion | — |
| `.table` :62 | `Features/Collections/Views/CollectionsView.swift:11` ("Saved") | Companion `collectionsRow` — **only when `context.tableItemCount != 0`** (`CompanionActionRows.swift:219`) | **No home door; Companion row hidden at 0** |
| `.pieceDetail(pieceId:)` :63 | `Features/ProductDetail/Views/ProductDetailView.swift:11` | Browse grid card (`RecommendationsView.swift:154`); Saved rows (`CollectionsView.swift:209,291`); room item row (`RoomProjectView.swift:286`); `patina://piece/<id>`; push `entity_type=product` | — |
| `.scanFlow(reason:)` :67 | `Features/RoomScan/Views/QuietConversationFlowHost.swift` | home Next Move `.scanFirstRoom`/`.resumeScan` (`DailyRoomView.swift:225,286`); Companion scan rows | — |
| `.styleQuiz` :70 | `Features/StyleQuiz/Views/StyleQuizView.swift` | home Next Move `.discoverStyle` (`DailyRoomView.swift:227`); Profile "Retake Style Quiz" (`ProfileView.swift:150`); onboarding; Companion | — |
| `.styleResult(result:)` :71 | `Features/StyleQuiz/Views/StyleResultView.swift` | end of quiz | — |
| `.arPlacement(productId:roomRemoteId:)` :74 | `Features/ARPlacement/Views/ARPlacementView.swift` | ProductDetail bottom bar **only if `product.hasARModel`** (`ProductDetailView.swift:346`) — see A5, this is never true; Companion "Try in your room"; room item `.viewAR` (`RoomProjectView.swift:350`) | **Effectively push-only via Companion** |
| `.profile` :77 | `Features/Profile/Views/ProfileView.swift:11` | home monogram avatar (`DailyRoomView.swift:111`); Companion tail | — |
| `.notifications` :78 | `Features/Notifications/Views/NotificationFeedView.swift:10` | home bell (`DailyRoomView.swift:112`); APNs fallback (`App/AppDelegate.swift:110`) | — |
| `.designerConsultation` :79 | `Features/DesignServices/DesignerConsultationView.swift:13` | studio empty-state CTAs (`NotificationFeedView.swift:137`, `ProjectListView.swift:218`, +5 siblings); `HomeStudioBlock` (dormant) | **No live home door** |
| `.designRequests(focusLeadId:)` :82 | `Features/DesignServices/DesignRequestStatusView.swift:1` | home Next Move `.trackDesignRequest` (`DailyRoomView.swift:218`); request-flow success "Track your request" (`ContentView.swift:119`); push `design_request`/`lead` | — |
| `.projectList` :85 | `Features/Projects/Views/ProjectListView.swift` | Profile → StudioHub rows (`Features/Profile/Views/StudioHubView.swift:327`); Companion `studioRow`/`projectsRow` | **2+ acts, no home door** |
| `.projectDetail(projectId:)` :86 | `Features/Projects/Views/ProjectDetailView.swift:1` | project list; push `entity_type=project` | — |
| `.decisionList` :87 | `Features/Decisions/Views/DecisionListView.swift` | home Next Move `.reviewDecisions` (`DailyRoomView.swift:220`) **only when a decision is pending**; StudioHub; Companion | — |
| `.decisionDetail(decisionId:)` :88 | `Features/Decisions/Views/DecisionDetailView.swift` | list; push `decision` | — |
| `.threadList` :89 | `Features/Messaging/Views/ThreadListView.swift` | home Next Move `.readMessages` (`DailyRoomView.swift:222`) only when unread > 0; StudioHub; Companion | — |
| `.threadDetail(threadId:)` :90 | `Features/Messaging/Views/ThreadDetailView.swift` | thread list; push `thread`/`message_thread` | — |
| `.proposalList` :93 | `Features/Proposals/Views/ProposalListView.swift` | StudioHub "Awaiting you" row (`StudioQueueBuilder.swift:142`); Companion | **No home door** |
| `.proposalDetail(proposalId:)` :94 | `Features/Proposals/Views/ProposalDetailView.swift` | list; push `proposal` (`NotificationRouter.swift:68` — no sender emits it yet) | — |
| `.invoiceList` :97 | `Features/Invoices/Views/InvoiceListView.swift` | StudioHub "Awaiting you" (`StudioQueueBuilder.swift:94`); Companion | **No home door** |
| `.invoiceDetail(invoiceId:)` :98 | `Features/Invoices/Views/InvoiceDetailView.swift` | list; push `invoice` (`NotificationRouter.swift:74` — no sender yet) | — |
| `.budget` :101 | `Features/Budget/BudgetView.swift` | Companion `budgetRow` only (`CompanionActionRows.swift:66`) | **Companion-only** |
| `.documentList` :102 | `Features/Documents/DocumentListView.swift` | `ProjectDetailView.swift:429`; Companion | — |

### Presented sheets (`AppCoordinator.PresentedSheet`, `AppCoordinator.swift:587-616`; bodies `ContentView.swift:103-133`)

| Sheet | View | Reached from |
|---|---|---|
| `.settings` | `Features/Settings/Views/SettingsView.swift:11` | Profile "Settings" row (`ProfileView.swift:156`); Companion account menu; StudioHub guest state (`StudioHubView.swift:125`) |
| `.qr` | `Features/QRAuth/Views/QRScannerView.swift` | Settings "Sign in on the web" (`SettingsView.swift:60`); Companion "Connect to portal"; `patina://auth` QR deep link (`DeepLinkHandler.swift:158`) |
| `.auth` | `Features/Authentication/Views/AuthSheet.swift:15` | Notification-feed guest invite (`NotificationFeedView.swift:151`); Companion `signInRow` |
| `.designServices(roomId:preselectedScanIds:)` | `Features/DesignServices/DesignRequestFlowView.swift:18` | Profile "Get design help" (`ProfileView.swift:154`); `RoomProjectView.swift:66,137`; `RoomSettingsView.swift:174`; scan-saved confirmation (`ScanSavedConfirmationView.swift:80`); home Next Move `.resumeDesignRequest` (`DailyRoomView.swift:214`); Companion |
| `.newRoom` | `Features/Rooms/Views/NewRoomSheet.swift` | Your Spaces / rooms surfaces |
| `.moveItem(itemId:)` | `Features/Rooms/Views/MoveOrCopyItemSheet.swift` | room item action menu (`RoomProjectView.swift:357`) |

### Overlays

| Overlay | File | Trigger |
|---|---|---|
| Companion (living orb + expanded panel) | `Features/Companion/Views/CompanionOverlay.swift:1` — mounted unconditionally in `.main` (`ContentView.swift:178`) | always present |
| Companion intro bubble | `Features/Companion/Views/CompanionIntroBubble.swift:20` | after the first-launch tour resolves (`Features/Companion/Models/CompanionCoachingModel.swift`, `introGate()`) |
| First-launch tour | `Features/Help/FirstLaunchTour.swift` — wraps the whole home (`DailyRoomView.swift:34`) | first visible Home with an empty nav path |
| Story detail (full-bleed morph) | `Features/Home/Views/DailyStoryDetailView.swift` (`DailyRoomView.swift:50-60`) | tapping the story card |
| Help panel sheet | `Features/Help/Views/HelpPanelSheet.swift` | `?` glyphs |
| Added-to-room toast | `Features/Home/Views/AddedToRoomToast.swift:8` | **nothing mounts it** |

### Orphans — code that compiles and is mounted by nothing

Verified by whole-tree grep (excluding `PatinaTests`/`PatinaUITests`); each has a `#Preview` and no
production call site:

| Orphan | Defined | Last live mount |
|---|---|---|
| `HomeStudioBlock` (the whole tier-gated Studio + Marketplace bottom of home) | `Features/Home/Views/DailyRoomStateBlocks.swift:25` | pre-`126e59a11` |
| `StudioHubSection` (11 Studio rows + locked rows) | `Features/Home/Views/StudioHubSection.swift:28` | via `HomeStudioBlock:38` |
| `MarketplaceLinksSection` ("Browse pieces" / "Saved" home doors) | `Features/Home/Views/MarketplaceLinksSection.swift:16` | via `HomeStudioBlock:43` |
| `WorkWithDesignerCTA` ("Get design help" on home) | `Features/Home/Views/WorkWithDesignerCTA.swift:19` | via `HomeStudioBlock:64` |
| `RoomChipRail` | `Features/Home/Views/RoomChipRail.swift:8` | — |
| `RoomContextBar` | `Features/Home/Views/RoomContextBar.swift:8` | — |
| `DailyProductCard` (the feed card with `+ Add`) | `Features/Home/Views/DailyProductCard.swift:8` | — |
| `DailyProductDetailView` (matched-geometry piece detail) | `Features/Home/Views/DailyProductDetailView.swift:10` | — |
| `DailyFeedEmptyModule` | `Features/Home/Views/DailyFeedEmptyModule.swift:16` | — |
| `ContinueScanCard` | `Features/Home/Views/ContinueScanCard.swift:13` | — |
| `DesignRequestStatusCard` | `Features/DesignServices/DesignRequestStatusCard.swift:19` | — |
| `AddToRoomSheet` / `AddedToRoomToast` | `Features/Home/Views/AddToRoomSheet.swift:8`, `AddedToRoomToast.swift:8` | — |
| `HomeFilteredFeedEmpty` | `Features/Home/Views/DailyRoomStateBlocks.swift:122` | — |
| `CollectionsViewModel.addToBoard(_:productId:)` | `Features/Collections/ViewModels/CollectionsViewModel.swift:101` | **never called** → a board can be created but can never gain an item |

`HomeStoryRetryRow` (`DailyRoomStateBlocks.swift:153`) is the only survivor from that file
(`DailyRoomView.swift:167`).

---

## A2 — Home composition, top to bottom, by tier

`DailyRoomView.content` (`Features/Home/Views/DailyRoomView.swift:104-145`) mounts **four things, in
this order, at every tier including guest**. There is no tier branch left in the view.

| # | Block | File:line | Data source | Refresh policy | What changes day to day |
|---|---|---|---|---|---|
| 1 | `DailyGreetingHeader` — date line, "Today", `?`, bell + unread badge, monogram | `Features/Home/Views/DailyGreetingHeader.swift:8`, mounted `DailyRoomView.swift:107-114` | `viewModel.greetingDate` = `DateFormatter "EEEE · MMM d"` (`Features/Home/ViewModels/DailyRoomViewModel.swift:85-89`); unread count from `NotificationsViewModel.notifications` (`notification_log`) | `.task` on appear + `scenePhase == .active` (`DailyRoomView.swift:69,88-97`) | **The date string.** That is the entire time-awareness of the header. The word is literally `"Today"` (`DailyGreetingHeader.swift:40`) — no `TimeOfDay`, no "Good morning". The bell badge changes when `notification_log` gains rows. |
| 2 | `TodayNextMoveCard` — mono label `"Next Move"`, title, detail, arrow | `Features/Home/Views/TodayModules.swift:10`, mounted `DailyRoomView.swift:116-120`; content from `TodayExperience.nextMove` (`Features/Home/Models/TodayExperience.swift:48-160`) | 8 inputs: pending design draft (SwiftData `DesignRequestDraft`), resumable scan (`ScanRecoveryService`), promoted design request (`leads`), pending decisions + unread messages (`BadgeCountService`), style profile (local `StylePreferenceModel`), active room (local `RoomModel`) | `.task` ×4 on appear + full re-run on foreground (`DailyRoomView.swift:64-97`) | Changes **only when one of those state machines advances**. For a discovering user with one room, one saved piece and a style profile it is permanently `"Return to {Room}"` / `"{n} pieces are gathering there."` (`TodayExperience.swift:153-159`). No randomness, no rotation, no recency. |
| 3 | `DailyStoryCard` (or retry row, or `ProgressView("Loading today's story…")`) | `Features/Home/Views/DailyStoryCard.swift`, mounted `DailyRoomView.swift:148-177` | `editorial_stories` via `EditorialStoriesAPIClient.fetchTodaysStory()` — `order=sort_order.desc,published_at.desc&limit=1` (`Core/Network/EditorialStoriesAPIClient.swift:72-90`) | refetched on every `load()` (appear + foreground) — `DailyRoomViewModel.swift:137-138,192-211` | **Only when an admin publishes a new row with a higher `sort_order`/`published_at`.** It is *not* a per-day rotation: the same top row returns forever. There is no `published_at <= now()` client filter and no "one per day" logic. ⚠ `isUnread` is hard-coded `true` (`EditorialStoriesAPIClient.swift:119,130`), so the clay unread dot (`DailyStoryCard.swift:80-87`) is on permanently — a fabricated "new" signal (C5). |
| 4 | `TodayActiveRoomCard` — hero image, "Active Room", room name, `sq ft · orientation · N pieces saved`, `Latest save: …`, "ROOM SCAN" chip | `Features/Home/Views/TodayModules.swift:104-211`, mounted `DailyRoomView.swift:125-140` | local SwiftData `RoomModel` + `SavedItem` via `RoomStore` (`Core/Persistence/RoomStore.swift:24`); active room chosen by `ContextMemoryStore.activeRoom(from:currentSelectionID:)` (`DailyRoomViewModel.swift:172-182`) | `load()` on appear + foreground | Changes when the user adds a piece to that room or rescans. `Latest save:` is the only genuinely "since yesterday" line on the screen, and only the user can move it. Absent entirely when `roomModels` is empty. |
| — | 120 pt spacer for the Companion hearth | `DailyRoomView.swift:142` | — | — | — |

**Per tier, what actually differs:**

| Tier | What the home shows | What it does not |
|---|---|---|
| guest (`AuthService.isAuthenticated == false`) | Same 4 blocks. `BadgeCountService.refresh()` short-circuits to zeros (`Services/Badges/BadgeCountService.swift:70-79`); `DesignRequestStatusService.refresh()` clears (`Services/DesignServices/DesignRequestStatusService.swift:417-421`). Next Move falls to the room ladder → `"Bring your first room into Patina"`. Story loads (RLS allows anon). | no sign-in prompt anywhere on the home; no Studio; no "Browse pieces" |
| discovering | identical to guest except the counts are real zeros | no designer CTA — `WorkWithDesignerCTA` is orphaned; **`"Get design help"` does not appear on the home at all** |
| engaged | Next Move becomes `"See your design request"` + the stage line (`TodayExperience.swift:80-91`) | no Messages door, no designer identity, no Studio |
| activeProject | Next Move becomes `"Review a project decision"` or `"Pick up the conversation"` **only while a count is > 0**; otherwise it falls back to `"Return to {Room}"` | **no Projects / Proposals / Invoices / Budget / Documents / Decisions row anywhere on the home.** Those live two acts deep, behind the monogram → Profile → `StudioHubView` (`Features/Profile/Views/ProfileView.swift:123`). |

**Static, verbatim, forever:** the word `"Today"`, the `"Next Move"` mono label, the Active Room
chrome, the Companion orb. The only things that can differ between two consecutive mornings are the
date string, the story row (if an editor published), the Next Move (if a state machine advanced),
and the unread bell badge.

---

## A3 — EngagementTier resolution

`apps/mobile/Patina/Patina/Core/State/EngagementTier.swift`.

- Cases: `.discovering = 0`, `.engaged = 1`, `.activeProject = 2`, `Comparable` (`:34-45`).
- Inputs, all read live from two `@Observable` singletons (`:51-62`): `AuthService.isAuthenticated`,
  `BadgeCountService.hasLoaded` + `.projectCount` + `.proposalsAwaitingSignatureCount` +
  `.payableInvoiceCount` + `.pendingDecisionCount`, `DesignRequestStatusService.hasLoaded` +
  `.requests`.
- Pure resolver (`:111-125`): any of projects/proposals/invoices/decisions > 0 → `.activeProject`;
  else any non-terminal `DesignRequestStage` → `.engaged`; else `.discovering`.
- Tri-state (`:80-102`): guests are `.known(.discovering)` without a fetch. While either service is
  still loading, evidence is **promote-only** — a partial load resolves to a tier only if it clears
  `.discovering`, otherwise `.unknown`. `EngagementTierState.unknown` is documented as "not a tier"
  (`:128-136`) and was meant to render a skeleton, never the discovering pitch.
- **Where it is read today:** `Features/Companion/Services/CompanionAreaBuilders.swift:23-25`
  (`showsStudioRow` — gates the Companion's "Your studio" row at `>= .engaged`, defaulting an unset
  context to `.discovering`) and the dormant `HomeStudioBlock`
  (`Features/Home/Views/DailyRoomStateBlocks.swift:32-59`). **`DailyRoomView` never reads it.** The
  entire skeleton/retry design in `DailyRoomStateBlocks.swift:45-58` (including the copy
  `"We couldn't reach your studio."`) is unreachable.

---

## A4 — The Companion

Files: `Features/Companion/**`, `Services/Companion/**`.

**Coaching phases** (`Features/Companion/Models/CompanionCoachingModel.swift:56-73`, machine
documented `:14-32`): `.new` (never expanded the panel) → `.learning` (expanded once) → `.learned`
(3 Companion navigations **or** 14 days since entering `.main`, from any phase). Monotonic; never
regresses. Mark attention maps 1:1: `.full` / `.ambient` / `.calm` (`:78-88`). Intro is capped at 2
showings ever (`introShownCap`, `:~/introShownCap`), gated behind the first-launch tour resolving
(`introGate()`, grace 2 s, poll 500 ms, timeout 120 s — `:88-101`). Persistence: raw UserDefaults
under `patina.companion.coaching.*`; the legacy `patina.companion.coachmarkSeen` migrates an existing
user straight to `.learning` with a spent intro budget.

**Intro copy, verbatim** (`Features/Companion/Views/CompanionIntroBubble.swift:69-76`):
> "I'm your Companion."
> "Tap me any time, anywhere in Patina — I'll show you the way to what's next."
Panel coachmark copy (`Features/Companion/Views/CompanionOverlay.swift:582,590`):
> "These are your next steps. They change with every room you're in — tap one and I'll take you there."
> button "Got it"

**What it can do:** navigate (each row carries an `AppRoute`) or fire one of four
`SpecialAction`s — `openQRScanner`, `openSettings`, `openAuth`, `openDesignServices(roomId:)`
(`Features/Companion/Services/CompanionContextProvider.swift` = `CompanionActionProvider`, item type
at `:23-77`). A text/chat rail exists in the service layer — `CompanionAPIClient.sendMessage` →
edge function `companion-message`, `fetchQuickActions` → `companion-context`, `fetchHistory` →
`companion-history` (`Services/Companion/CompanionAPIClient.swift:52-125`) — with its own analytics
(`companion_message_sent`, `companion_response_received`, `companion_api_error`).
**What it cannot do:** buy, save, or mutate anything. Every row is a door.

**Row budget:** ≤ 6 rows, ≤ 1 suggested, asserted in DEBUG (`CompanionActionProvider.actions`,
`CompanionContextProvider.swift:97-111`). Dispatch is an exhaustive switch over `AppRoute` with no
`default` (`:118-146`), so a new route cannot silently get an empty menu.

**Action matrix (screen-specific rows; the universal tail — HOME on every non-home screen, then
PROFILE or SIGN IN — is appended by `appendTail`, `:155-169`):**

| Route | Panel title (`:176-262`) | Rows (`CompanionAreaBuilders.swift`) |
|---|---|---|
| `.heroFrame`, 0 rooms | "Where to begin?" | *Add your first space* (suggested) · *Style quiz* / *Retake the quiz* · *Your recommendations* · [*Saved* if room items > 0] · [*Your studio* if tier ≥ engaged] (`:27-37`) |
| `.heroFrame`, ≥1 room | "Where to next?" | *Your recommendations* (suggested) · *Your spaces* · *Add another space* · [*Saved*] · [*Your design request*] else [*Your studio*] (`:38-49`) |
| `.pieceDetail` | "Save this one?" | *Save* · *Try in your room* · *Get design help* (`:65-70`) |
| `.emergence` / `.roomEmergence` | "Want a recommendation?" | *Save to collection* · [*Try in your room* if a piece is in context] · *Get design help* (`:59-64`) |
| `.table` (Saved) | "Ready to bring it together?" | *Get design help* (suggested) · *Find more pieces* · *See by room* / *Scan a room* (`:88-98`) |
| `.roomProject` | "What's next for this room?" | *See recommendations* (suggested) · *Saved in this room* · *Get design help* · *Rescan room* (`:134-142`) |
| `.designRequests` | "While you wait…" | *Message your designer* (suggested) · *Your recommendations* · *Your spaces* (`:287-292`) |
| `.projectList` | "What's on your plate?" | *Decisions waiting* (suggested) · *Messages* · *Proposals* · *Budget* (`:225-230`) |
| money rail (`.proposalList/.invoiceList/.budget/…`) | "Reviewing proposals?" / "Settling up?" / "The whole picture" | designer-message row + budget/invoices/proposals cross-links (`:302-340`) |
| `.scanFlow`, `.styleQuiz` | "Keep scanning?" / "Pause the quiz?" | **[] — tail only**, deliberately (`:164-188`) |
| `.profile` | "What would you like to do?" | *Connect to portal* (signed-in) · *Settings* · spaces/scan · *Retake the style quiz* (`:344-365`) |

**Nudge pills** (the tappable label above the resting mark, `CompanionContextProvider.swift:268-288`):
`.heroFrame` → **nil** (deliberately suppressed); `.emergence` → "Try in your room →" only when a
piece is in context; `.table` → "Find more pieces →"; `.roomProject` → "See recommendations →";
`.styleResult` → "View recommendations →". Everywhere else, nil.

---

## A5 — Marketplace data flow

### The call
`ProductAPIClient.fetchRecommendations(roomId:category:limit:offset:)` POSTs
`/rest/v1/rpc/get_recommendations` with `p_limit`, `p_offset`, optional `p_room_id`, `p_category`
(`Core/Network/ProductAPIClient.swift:40-69`). Decoding is per-row failable so one bad row cannot
blank the grid (`:76-86`). Single-product fetch is a **different** path: a direct PostgREST select
`products?id=eq.<id>&select=*,vendors(name,made_in,brand_story)` (`:99`), mapped by
`RawProductWithVendor.toProduct()` (`:182-202`).

### The server contract
`supabase/migrations/00246_aesthete_quiz_bridge.sql:193-214` — `RETURNS TABLE (id, name, price_cents,
match_score, maker_name, maker_location, maker_story, image_url, usdz_url, style_tags, material_tags,
badges, category, tier)`. The body (`:272-300`) resolves the caller's `client_style_profiles` (or
bridges legacy `user_style_signals`, or a shared neutral profile for anon), calls
`get_aesthete_matches`, and maps `score * 100 → int`. So the style quiz **does** feed the feed —
server-side, not via any client parameter.

### Fields actually decoded (`Core/Models/ProductModel.swift:12-66`)

| Trust field | In `products` table | Returned by RPC | Decoded by app | Shown on piece detail |
|---|---|---|---|---|
| name | ✔ | ✔ | ✔ | ✔ `ProductDetailView.swift:150` |
| price | `price_retail` (cents) | `price_cents` | `priceCents` | ✔ `fullFormattedPrice`, `:169` |
| trade price | `price_trade` | ✘ | ✘ | ✘ |
| description | `description` | ✘ | ✘ | ✘ |
| **dimensions** | **`dimensions JSONB {width,height,depth,unit}`** (`00001_initial_schema.sql:35`) | **✘** | **✘** | **✘ — nowhere in the app** |
| materials | `materials TEXT[]` | `material_tags` | ✔ | ✔ as a `·`-joined subtitle, `:157` |
| maker / provenance | `vendors.name/made_in/brand_story` | ✔ | `makerName`/`makerLocation`/`makerStory` | ✔ maker tag `:144`, maker-story card `:309-336` |
| badges | `products.tags` | `badges` | ✔ | ✔ "Provenance" chips with emoji labels 🌿✋📍♻️ (`:434-446`) |
| **lead time** | no column exists | ✘ | ✘ | ✘ |
| **stock / availability** | no column exists | ✘ | ✘ | ✘ |
| **shipping / returns / who is responsible** | no column | ✘ | ✘ | ✘ |
| `source_url` (the maker's own page) | ✔ | ✘ | ✘ | ✘ |
| match score | `quality_score` → engine score | `match_score` | `matchScore` | ✔ `"{n}% match"` pill `:177` |
| tier | derived (`quality_score >= 80` → `designer_selection`) | ✔ | `ProductTier` | pill only on the orphaned `DailyProductCard` |
| **usdz / AR model** | no column | **`NULL::text AS usdz_url`** (`00246:281`) | `usdzURL` → always nil | **AR button never renders** |

⚠ `RawProductWithVendor.toProduct()` also hard-codes `usdzURL: nil` (`ProductAPIClient.swift:192`)
and re-derives tier from `quality_score` (`:200`). So `product.hasARModel`
(`ProductModel.swift:110-112`) is **false on every code path in the app**. Consequences: the AR
button in the piece-detail bottom bar (`ProductDetailView.swift:346-367`) is never drawn; a
`SavedItem` is always stored `hasAR: false`; the Companion's "Try in your room" row and the room
item's `.viewAR` action land on `ARPlacementView`'s copy **"3D model not available for this
product"** (`Features/ARPlacement/Views/ARPlacementView.swift:200`).

`ProductCategory(normalizing:)` folds the DB vocabulary — `chair`/`sofa` → `.seating`,
`table` → `.tables`, everything unknown → `.decor` (`ProductModel.swift:147-156`).

### Browse pieces (`RecommendationsView`, `Features/Recommendations/Views/RecommendationsView.swift`)
- Header `"Browse pieces"` (`:40`) + subtitle `"{n} pieces curated for your space"` / `"…for this
  room"` (`ViewModels/RecommendationsViewModel.swift:53-59`).
- Filter chips, hard-coded, client-side only: `["All","Seating","Tables","Lighting","Storage"]`
  (`RecommendationsViewModel.swift:44`) — they filter the already-fetched 20 rows
  (`:48-51`); `p_category` is never sent. `Textiles` and `Decor` exist in the enum but have no chip.
- 2-column `LazyVGrid`, 160 pt image, match badge, ♥, ⋯ (`:134-234`).
- Card acts: tap → `.pieceDetail`; ♥ toggle save/unsave; ⋯ / long-press → **Save/Unsave · Share ·
  Not for me · View details** (`:304-335`); swipe right = save toggle, swipe left = skip
  (`:274-291`); VoiceOver actions mirror both (`:180-185`).
- Empty state: `"Nothing here yet"` / `"Save pieces you love or take the style quiz to tune what
  shows up."` / CTA `"Take the style quiz"` (`:124-132`). Error: `PatinaErrorState` + retry
  (`:120-123`). Loading: `"Finding pieces for you…"` (`:118`).
- Save writes a local `TableItemModel` **and** mirrors to `saved_items` only when a `roomRemoteId`
  is in scope; on remote failure the save is reverted with `"Couldn't save — check your connection
  and try again."` (`RecommendationsViewModel.swift:138-196,231`).

### Piece detail (`ProductDetailView`)
Layout top→bottom: 340 pt hero (`PatinaAsyncImage` or category gradient) with a floating bar of
**back · `?` · Share · ♥** (`:78-138`); maker tag; H2 name; materials subtitle; price + match pill;
["Place in your room" + spatial pills — only when a room context was attached]; "Provenance" badge
chips; maker-story card; bottom Liquid-Glass action bar.

**Every act:**
| Act | Behaviour |
|---|---|
| back | `dismiss()` (`:91`) |
| `?` | help panel, surface `ios-app/product-detail` (`:51-54`) |
| **Share** | `ShareLink` to `https://app.patina.cloud/library/<productId>` (`Features/Shared/PatinaPortalLinks.swift:16-22`), subject = product name, message = `"{name} by {maker} on Patina"` (`:117-121`) |
| ♥ | `viewModel.toggleSave` → inserts a local `TableItemModel`; **no remote mirror, no room** (`ViewModels/ProductDetailViewModel.swift:104-125`) |
| AR | only if `hasARModel` → **never** (see above) |
| primary button | label `"Add to Room"` → `"Saved ✓"` (`:377`). If `roomContextRemoteId != nil` it POSTs `saved_items`; otherwise it is the same local-only `toggleSave` (`:370-375`) |
| ⋯ menu | **does not exist on the detail screen** (only on the browse card) |
| "Get design help" | **not present** — verified by grep; the CTA exists on 11 other surfaces but not here |

⚠ The standard entry `.pieceDetail(pieceId:)` passes **only** `productId`
(`ContentView.swift:292-294`); `roomLocalId`/`roomRemoteId` are nil. So on the real path the primary
button is always the local-only save, "Place in your room" never renders, and `isSaved` is never
seeded from storage — a piece saved yesterday shows `"Add to Room"` again and a second
`TableItemModel` row is inserted.

### Purchase / order / cart / price-inquiry affordance
**None.** No cart, no checkout, no "Buy", no "Request a quote", no vendor link, no
`source_url`. The Stripe rail exists only for designer invoices
(`Services/API/InvoicesAPIClient.swift`). What the piece-detail screen offers instead, verbatim:

> `Add to Room` — and once tapped — `Saved ✓`

with `Share` and `♥` in the top bar. That is the terminus of every browse path.

---

## A6 — Saved / Collections

`Features/Collections/Views/CollectionsView.swift`, `ViewModels/CollectionsViewModel.swift`.

- Header `"Saved"` + `+` (new board). Tabs `["Boards", "All items"]`, default **Boards**
  (`CollectionsViewModel.swift:18-22`).
- **All items** reads local `TableItemModel` rows sorted by `savedAt` desc (`:31-33`), then
  reconciles with remote: for each local room with a `remoteId`, `GET saved_items?room_id=eq.…` and
  insert anything missing, deduped by `productId` (`:46-82`). Pull-to-refresh awaits the
  reconciliation (`:118-127`).
- **Room-scoped Saved** (`.roomSavedItems(roomId:)`) filters `All items` by `TableItemModel.roomId`
  (`CollectionsView.swift:30-33`) — but nothing in the app ever *sets* `TableItemModel.roomId`
  (grep: the field is declared at `Core/Models/TableItemModel.swift:51` and written by no call
  site). Room-scoped Saved is therefore always empty.
- **Boards** are local-only `BoardModel` rows (SwiftData, `Core/Models/BoardModel.swift:13-21`,
  `itemIds` = a JSON string). They are created from the `+` alert (`CollectionsView.swift:124-130`).
  `addToBoard` is never called (A1) → **every board is permanently empty**; the tile reads
  `"This board is empty"` with a `"Browse pieces"` link (`:227-245`). Boards have **no remote
  mirror**, so they do not survive a reinstall or reach a second device.
- Empty All-items copy: `"No saved items yet"` / `"Browse recommendations and save pieces you love"`
  + `"Browse pieces"` (`:254-273`).
- **Cross-device:** a save follows the user only through `saved_items`, which requires a *synced
  room* at save time — i.e. only saves made from a room-scoped browse or from `addToAttachedRoom`.
  Saves made from unscoped "Browse pieces" or from the piece-detail ♥ are local-only.
- **Guest → sign-in:** nothing migrates. `LocalStoreReset` (`Core/Persistence/LocalStoreReset.swift`)
  wipes local models on account switch; there is no "claim your guest saves" step anywhere.

---

## A7 — Rooms

- **Local truth** is SwiftData `RoomModel` + `SavedItem` behind `RoomStore`
  (`Core/Persistence/RoomStore.swift:24-255`: `allRooms`, `createRoom` :66, `saveScan` :110,
  `markRoomSynced` :154 (`room.remoteId = remoteRoomId.uuidString`), `markRoomSyncFailed` :171,
  `addItem` :204, `moveItem` :218, `copyItem` :228, `removeItem` :246).
- **Remote** is `public.rooms` / `room_scans` / `saved_items` via plain PostgREST
  (`Core/Network/RoomsAPIClient.swift:206-318`).
- **Sync honesty:** `YourSpacesView` renders a pill **`"Saved on this phone"`** under any room whose
  write-through never landed (`Features/Rooms/Views/YourSpacesView.swift:74-76`), plus a quiet
  in-flight sync pill (`:40`). A local-only room gets no recommendations — `RecommendationsView`
  resolves `roomId` → `RoomModel.remoteId` and falls back to the unscoped marketplace when nil
  (`RecommendationsView.swift:106-111`).
- **Scan entry gate:** `QuietConversationFlowHost` reads `RoomCaptureService.isSupported`
  (`Features/RoomScan/Views/QuietConversationFlowHost.swift:151`) which is `RoomCaptureSession.isSupported`
  (`Features/Walk/Services/RoomCaptureService.swift:241-242`). No LiDAR → the manual path
  (`ScanFallbackEntryView`), which persists a real room (U40, `QuietConversationFlowHost.swift:372-373`).
- **Manual entry** (`Features/Rooms/Views/ManualRoomEntryView.swift`): name (`"e.g. Living Room"`),
  ceiling height picker (Standard 8 ft / 9 ft / 10 ft / Vaulted), window count, orientation
  (North/South/East/West-facing), `"Save Room"` — header `"Room details"` / `"Help us understand your
  space"` (`:32-113`). Reachable **only from the Companion** (A1).
- **RoomProjectView** (`Features/Rooms/Views/RoomProjectView.swift`): 240 pt gradient hero + ⚙; H2
  room name; meta line `sq ft · orientation · N windows · Scanned MMM d` (`:219-228`); stat row
  **Items · Match · In AR** (`:237-245` — "In AR" is `room.arReadyCount`, always 0 per A5); budget
  bar when out of range; "Your Items" list; budget nudge; CTA `"Get design help with this room"`
  (`:65`). Empty variant: `"A blank canvas"` / `"We've already found pieces that would fit this
  space. Browse your Daily Room to start building this room."` / `"Browse Picks for This Room"`
  (`:302-328`). Not-found variant: `"This room isn't on this phone"` / `"It may have been removed."`
  / `"Your rooms"` (`:98-122`).
- Budget range is **hard-coded** $2K–$5K (`RoomProjectView.swift:20-21`) — the quiz's budget answer
  is never threaded in.
- **YourSpacesView**: `"Your Spaces"` header, Whole-Home aggregate bar, one `RoomGalleryCard` per
  room, first-room empty state.

---

## A8 — Style quiz / conversation / StylePreferenceStore

- Five questions, four render kinds — `imageGrid`, `iconList`, `materialCards`, `budgetTiers`
  (`Features/StyleQuiz/Models/QuizModels.swift:23-26,60`).
- On submit: POST `/rest/v1/rpc/process_style_quiz` with `{visual_resonance, lifestyle, material,
  investment, catalyst}` + `timings` (`Core/Network/ProductAPIClient.swift:138-157`;
  `StyleQuizViewModel.submitQuiz` :160-179), and a local `computeLocalResult()` fallback (`:202`).
- Persisted locally as a `StylePreferenceModel` via `StylePreferenceStore.upsert`
  (`Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:286-289`;
  `Core/Persistence/StylePreferenceStore.swift:88`). Fields: keywords, warmth, formality, materials,
  eras, primary/accent colors, pattern + scale preference, confidence, `budgetRange`
  (`Core/Models/StylePreferenceModel.swift:18-57`). The style *conversation* writes the same store
  (`Features/StyleConversation/ViewModels/StyleConversationViewModel.swift:193-194`).
- **Where the profile is used afterwards:**
  1. Server-side, invisibly: `get_recommendations` bridges `user_style_signals` →
     `client_style_profiles` and scores against it
     (`supabase/migrations/00246_aesthete_quiz_bridge.sql:226-250`).
  2. Home: `hasStyleProfile` flips the Next Move away from `"Shape your taste portrait"`
     (`DailyRoomViewModel.swift:140-142`, `TodayExperience.swift:131-139`).
  3. Browse: a one-line rationale under each card via `TastePortrait.recommendationRationale`
     (`Features/Recommendations/Views/RecommendationsView.swift:251-272`,
     `Features/Conversation/Models/StyleProfile.swift:360`).
  4. Companion: `hasStyleProfile` swaps the quiz row's copy and the recommendations hint
     (`CompanionActionRows.swift:96-126`).
  5. Profile: the `styleBadge` capsule (`ProfileView.swift:89-105`).
  6. Settings: `"Reset taste portrait"` destructive alert (`SettingsView.swift:143-152`).
- **Not** used on the piece detail, the room, or the story.

---

## A9 — Design request flow

- Sheet: `Features/DesignServices/DesignRequestFlowView.swift:18`. Steps
  `pickScans → details → review → sending → success` (`:60-65`). Guests compose freely; auth is
  required only to upload (`:5-11`), enforced by presenting `AuthSheet` (`showGuest: false`,
  `Features/Authentication/Views/AuthSheet.swift:41`).
- Submit: sequential scan upload with `intent: .userRequested`, then the atomic
  `submit_design_request` RPC (`DesignRequestFlowView.swift:8-9`). Nothing uploads until "Send".
- Draft resume: `DesignRequestDraft` (SwiftData) is surfaced at launch
  (`PatinaApp.swift:126-131`) and becomes the home's Next Move `"Finish your design request"` /
  `"Your draft is saved and ready to review."` (`TodayExperience.swift:59-67`). In-flow copy:
  `"You have a design request in progress. Pick up where you left off, or start over."`
  (`DesignRequestFlowView.swift:99`).
- Receipt: `Core/Models/SubmittedDesignRequest.swift` (local) reconciled against `public.leads`.
- **Stage mapping** (`Services/DesignServices/DesignRequestStatusService.swift:71-84`) — derived
  from `(designer_id, status, match_ceremonies embed)` **jointly**: declined→`.closed`,
  expired→`.expired`; ceremony `sent`/`picked` → `.booked` if a slot was picked else `.introduced`;
  `accepted`→`.matched`; `contacted`→ `.inTouch` (or `.finding` with no designer); default →
  `.held` (or `.finding`).
- Badge titles (`:118-129`) / subtitles (`:139-157`) / card titles (`:162-190`), verbatim:

| Stage | Badge | Card title | Subtitle |
|---|---|---|---|
| finding | "Finding your designer" | "Your design request is on its way" | "We're matching your request with a designer." |
| held | "In hand" | "{studio} has your request in hand" | "{studio} has taken your request in hand — introduction on its way." |
| inTouch | "In touch" | "Your designer reached out" | "{designer} has reached out — check your messages." |
| introduced | "You're matched" | "You're matched — meet {studio}" | "{studio} sent you an introduction and times for your first call." |
| booked | "Discovery booked" | "Discovery · Tue, Jul 22 at 2:00 PM" | "You're set with {studio}. The call is on the calendar." |
| matched | "Designer matched" | "You're matched with {designer}" | "You're working with {designer}." |
| closed | "Not matched" | "Your request wasn't matched" | "This one didn't work out. Send a new request anytime." |
| expired | "Expired" | "Your request expired" | "This request expired. Send a new request anytime." |

- Promotion rule (`:352-360`): a request dismissed at its current stage is hidden; a non-terminal
  request is always shown (so it reappears when the stage advances); terminal/matched shows for 14
  days from `stageAnchor`. `promotedRequest` = newest visible (`:398-404`).
- **Status card:** `DesignRequestStatusCard` is orphaned (A1). The promoted request surfaces today
  only as the home's **Next Move** — `"See your design request"` with the stage's `cardTitle` as the
  detail line (`TodayExperience.swift:80-91`).
- **What the client sees of the designer after a match** — `MatchIntroductionView`
  (`Features/DesignServices/MatchIntroductionView.swift`): `"You're matched."` (:93), a
  `"Portfolio"` link (:126), offered call slots with `"Tap to book"` (:239),
  `"None of these work? Propose another time →"` (:281), `"Pick a time"` (:294), and, when the slots
  lapse, `"These times have passed — message {studio} for fresh ones."` (:297). Failure copy:
  `"That didn't go through. Tap a time to try again."` (:269). Introduction payload
  (`DesignRequestStatusService.swift`, `IntroductionInfo`): `introText`, `credentialLine`,
  `portfolioUrl`, `slots`.
- **StudioIdentityLine** (`Features/Projects/Views/StudioIdentityLine.swift:18-41`): a 20 pt logo (or
  a 2-initial monogram fallback) + studio name, resolved per project by `StudioIdentityService`.
  Renders **nothing** while resolving or when there's no brand — so a solo designer with a personal
  name is invisible. It is mounted only on `ProjectDetailView`.
- The designer's **name/avatar never appears on the home** at any tier.

---

## A10 — The Studio rail

Live door: monogram → **Profile** → `StudioHubView` (`Features/Profile/Views/ProfileView.swift:123`).
It is state-first, not object-first: five sections built by `StudioQueueBuilder`
(`Features/Profile/ViewModels/StudioQueueBuilder.swift:13-36`) —
**Awaiting you · In progress · Conversation · Money & documents · Archive**
(`ViewModels/StudioQueueModels.swift:11-45`), empty copy `"Nothing needs a decision."`,
`"No active projects yet."`, `"No project conversations yet."`, `"No shared records yet."`,
`"Nothing has been archived."`.
Header: `"STUDIO"` / `"The work around your home, in one place."` / attention hint or
`"Nothing needs your attention right now."` (`StudioHubView.swift:44-67`).
Guest state: `"Your Studio begins with a project."` / `"Sign in to see conversations, decisions,
proposals, invoices, and shared files."` / `"Open settings"` (`:113-138`).
Loading `"Gathering your Studio…"`; total failure `"We couldn't gather your Studio."` + `"Try again"`
(`:70-111`); partial failure banner + `"Refresh"` (`:140-167`). Row taps emit
`studio_queue_item_activated` (`:318-328`).

| Surface | List shows | Detail shows | Client act (mechanism) |
|---|---|---|---|
| Projects | active vs archived, name, `PhaseDisplay.clientLabel` (`StudioQueueBuilder.swift:178`) | `"Currently: {phase}"`, studio identity line, section cards for Proposal / Invoices / Documents (`ProjectDetailView.swift:64,348,388,429`); missing sections read `"Set up {…} in the portal →"` (:143) | read-only |
| Proposals | count + `"{n} proposals are ready to review"`, `"Review by {date}"` | scope, boards grid | **Sign** — `ProposalSignSheet` types a full legal name (min 2 chars) → `sign_proposal` RPC (`Services/API/ProposalsAPIClient.swift:385-403`). Copy: `"Ready to move forward? Sign to confirm the scope and kick off your project."` / `"Sign proposal"` (`ProposalDetailView.swift:142-145`); sheet copy `"Type your full name to e-sign. Signing confirms the scope and kicks off your project."` (`ProposalSignSheet.swift:40`). ⚠ the RPC does **not** send the confirmation email (`ProposalsAPIClient.swift:403`) |
| Invoices | count + `"{$} remaining"` + due label | line items, balance | **Pay** — `create-checkout-session` edge fn → hosted Stripe Checkout in `SFSafariViewController` via `.fullScreenCover` (`InvoiceDetailView.swift:45-52`); on dismiss, poll the invoice row every **3 s up to 60 s** for `stripeSettled` (`InvoicesViewModel.swift:81-161`). Copy `"Pay securely by card or bank transfer."` (:218); voided copy `"This invoice was voided — nothing is owed on it. Reach out to your designer with any questions."` (:199) |
| Budget | `"Your budget"` (`BudgetView.swift:37`) | cross-project spend | read-only |
| Documents | `"Shared with you"` (`DocumentListView.swift:52`) | QuickLook | open only |
| Decisions | count + `"{n} project choices are ready"` | options, `"Recommended"`, `"Your choice"` | **Decide** — pick + e-sign: `"Add my signature"` / `"Type your full name to e-sign this approval."` / `"Approving sends your decision to your designer and unblocks any work waiting on it."` (`DecisionDetailView.swift:280-309`); after: `"You've responded to this decision"` (:104). Missing payload: `"Details unavailable — view in portal"` (:140) |
| Messaging | thread list with unread predicate | bubbles | **Reply** — composer `TextField("Type a message…")` (`ThreadDetailView.swift:266`) → `MessagingAPIClient.sendMessage` (`MessagingViewModel.swift:238-245`) |
| Notifications | `notification_log` feed | — | mark read / mark all read / tap-to-route |

**Badge poll floor** (`Services/Badges/BadgeCountService.swift:17-20,69-115`): five parallel fetches
(decisions, thread summaries, proposals, invoices, projects), refreshed on `scenePhase → .active`,
on home appear, and on push receipt/tap; `refreshSoon(after: .seconds(1))` debounces bursts
(`:119-126`). **No realtime subscription** — explicitly deferred (R29). `DesignRequestStatusService`
mirrors the same policy (`:416-445`).

**Locked-row copy** (dormant `StudioHubSection`, `Features/Home/Views/StudioHubSection.swift:360-388`):
title, then `"Opens with your first project"`, a `lock.fill` glyph, 0.45 opacity, inert, hint
`"Locked until your first project begins."`. Since `HomeStudioBlock` is orphaned, **no user can see
this today.**

---

## A11 — Notifications

- **In-app feed source:** `public.notification_log` (migration 00041) via `NotificationsAPIClient`
  (`Core/Network/NotificationsAPIClient.swift:18-59`), filtered to visible statuses
  `in.(queued,sending,delivered,unconfirmed,opened,clicked)` (`:33`) and to the in_app/push channels.
  Routing data lives in `metadata.entity_type` / `metadata.entity_id` — there are no top-level
  columns (`App/DeepLinking/NotificationRouter.swift:10-19`).
- **Feed UI** `Features/Notifications/Views/NotificationFeedView.swift`: header `"Notifications"` +
  `"Mark all read"`; rows are real Buttons with swipe `"Mark read"`; empty `"Nothing yet"` /
  `"Updates from your designer will land here."` + `"Get design help"` or `"Track your request"`;
  guest `"…Sign in to stay in the loop."` + `"Sign in"` (`:24-157`). Pull-to-refresh at `:45`.
- **NotificationRouter cases** (`NotificationRouter.swift:60-88`): `project`, `proposal`†,
  `decision`, `invoice`†, `design_request`/`lead`, `thread`/`message_thread`, `room`,
  `product`/`piece`. († forward-compatible — the code says no edge function emits these yet.)
  Unknown → nil → the app opens the feed (`AppDelegate.swift:110`).
- **Push registration:** `PushTokenService` (`Services/API/PushTokenService.swift`). Authorization is
  requested **exactly once per install, from the first successful design-request submission**
  (`promptForAuthorizationAfterFirstSubmission`, `:87-108`), gated by
  `patina.push.hasPromptedAfterFirstSubmission`. Never at cold launch (`:57-62`). The token is
  hex-encoded and upserted to `public.device_push_tokens` (`user_id, token, platform, environment`,
  owner-only RLS) with a per-token `aps-environment` derived from the embedded provisioning profile
  (`:130-222`). Foreground re-register for already-authorized users on every `scenePhase → .active`
  (`PatinaApp.swift:156-158`). Sign-out deletes the row while the JWT is still live (`:172-185`).
- **Permission prompt copy:** the system prompt only — there is **no pre-permission screen and no
  in-app rationale copy anywhere.** The only related control is the Settings toggle
  `"Notifications"` (`SettingsView.swift:73`), which writes a profile preference
  (`Services/Settings/SettingsService.swift:136-154`), not the OS grant.
- **Deep-link handling:** cold-launch payloads from `launchOptions[.remoteNotification]`
  (`AppDelegate.swift:44-47`), taps (`:141-155`), foreground presentation
  `[.banner, .list, .sound, .badge]` (`:161-174`); both refresh badges + request status. Opened rows
  are marked via `NotificationsAPIClient.markOpened` (`:120-130`).
- ⚠ C14 stands: `aps-environment` in the committed entitlements is `development`
  (`apps/mobile/Patina/Patina/Patina.entitlements:5-6`), and the APNs **send** side is a backend
  stub — polling is the live mechanism.

---

## A12 — Auth

- Supabase only (`Services/Auth/AuthService.swift`). Phase machine
  `launching → auth → onboarding → main`, derived, never set imperatively
  (`App/Coordinators/AppCoordinator.swift:233-246`): not ready **or** splash still playing (min
  1.5 s, `:77-81`) → `.launching`; not signed in and no guest opt-in → `.auth`; onboarding
  incomplete → `.onboarding`; else `.main`.
- **A fresh install therefore lands on a full-screen auth wall first** — `AuthScreenView`
  (`ContentView.swift:36-70`). Copy: wordmark `"PATINA"`, strata mark, `"Welcome home"`, `"Start with
  a piece you love"`; buttons **Sign in with Apple** (`PatinaSignInWithAppleButton`,
  entitlement `com.apple.developer.applesignin` present), `"Continue with Google"`, `"Continue with
  email"`; divider `"or"`; guest `"Look around first"` →; footer `"Have a password? Sign in"` and
  `"By continuing, you agree to our" Terms of Service and Privacy Policy` — both link to
  `https://patina.cloud/terms` (`Features/Authentication/Views/AuthScreenView.swift:38-170`).
- Email is a **one-time code**, not a password (`AuthenticationView(initialMode: .magicLink)`,
  `ContentView.swift:64-66`); magic-link callbacks accept both PKCE `?code=` and implicit
  `#access_token=` (`DeepLinkHandler.swift:100-132`) and mark onboarding complete on arrival (`:125`).
- **Guest** = `coordinator.guestModeOptIn = true` (`ContentView.swift:55`), auto-cleared the moment a
  real session appears (`AppCoordinator.swift:212-214`). A guest can: browse, save locally, take the
  quiz, scan/enter a room, compose a design request. A guest cannot: upload a scan, submit a request,
  see the Studio, receive notifications.
- **Acts that trigger the soft-wall `AuthSheet`** (over context, never ejecting — C9): the
  design-request upload step; the Companion `signInRow`; the notification feed's guest CTA
  (`NotificationFeedView.swift:151`). `AuthSheet` hides the guest affordance (`showGuest: false`) and
  dismisses itself on `isAuthenticated` (`AuthSheet.swift:40,50-52`).
- **Session persistence:** Supabase's own keychain-backed store; restore is masked by the 1.5 s
  splash floor. A forced sign-out (token-refresh failure) preserves `pendingReturnRoute` and replays
  it on re-auth (`AppCoordinator.swift:191-193,227-230`).

---

## A13 — First launch, verbatim

1. **Splash** — `Features/Splash/Views/SplashView.swift:25`, the single word `"PATINA"`, min 1.5 s.
2. **Auth wall** (A12) — this is the true first screen for a fresh install.
3. **Onboarding carousel** (`Features/Onboarding/Views/OnboardingFlowView.swift:27-60`), 3 pages,
   `"Skip"` top-right on pages 1–2:
   - "Every room tells a story" / "Let's discover yours. Walk your space, uncover your style, and find pieces that grow more beautiful with time." / **Start Your Journey**
   - "See it in your space" / "A guided scan records the room's shape and a few reference photos on this iPhone. Or enter the room details yourself." / **Continue**
   - quiz-first (shipped default): "Find your style first" / "Five quick questions, then we'll show you pieces that fit. Your camera comes later — only when you choose to scan a room." / **Let's begin**
   - walk-first (flag `onboarding_walk_first`, `Features/FirstLaunch/Views/OnboardingFlowHost.swift:63`): "Choose how to add your room" / `CameraTrustCopy.onboardingSummary` / **See your choices**
4. **Style quiz** → `StyleResultView` → `.main`.
5. **First-launch tour** (`Features/Help/FirstLaunchTour.swift`), key `ios-first-launch-tour`, auto-starts
   on the first visible Home with an empty nav path (`DailyRoomView.swift:34`). Declared steps
   (`:227-252`):
   - 1 · anchor `.homeGreeting` — **"Welcome to Patina"** / "This is your Daily Room — picks and stories chosen for your space."
   - 2 · anchor `.addToRoom` — **"Save what you love"** / "Add pieces to a room with + Add — they follow you everywhere."
   - 3 · anchor `.profileMonogram` — **"Your profile"** / "Rooms, saved pieces, and settings live here."
   ⚠ `.firstLaunchTourAnchor(.addToRoom)` exists in **no view** (grep: only `.homeGreeting` at
   `DailyGreetingHeader.swift:57` and `.profileMonogram` at `:99`) — it lived on the now-orphaned
   `DailyProductCard`. The model's availability tracker drops the step after a 1.5 s grace
   (`FirstLaunchTour.swift:190-195`), so **the shipped tour is two steps**, and its middle promise —
   the app's whole save loop — is never spoken. Analytics still emit `help.tour.*` with a shrunken
   denominator (`:50-53,161-167`).
6. **Companion intro** — sequenced *after* the tour resolves (A4).

---

## A14 — Analytics (PostHog)

`Services/Analytics/PostHogService.swift`; screen views from `AppCoordinator.trackScreen`
(`AppCoordinator.swift:344-352`) using `AppRoute.analyticsScreenName`
(`Coordinator.swift:166-177`), with a dual-emit legacy name for `.scanFlow` while
`ios_screen_name_v2` is off.

**Direct `capture(...)` names found in the app tree** (grep over `Features/`, `Services/`, `App/`):
`app_open`, `app_background`, `login`, `first_session_scan_started`, `onboarding_started`,
`onboarding_scan_entered`, `onboarding_manual_room_selected`, `camera_permission`,
`today_next_move_tapped` (prop `action_id`), `today_editorial_story_tapped` (prop `story_id`),
`today_active_room_tapped` (props `has_scan`, `saved_item_count`), `studio_hub_row_tapped`,
`studio_queue_item_activated` (props `section`, `destination`), `marketplace_row_tapped` (prop
`row`), `design_request_submitted`, `client_pick`, `client_held_state_shown`, `scan_held_locally`,
`context_memory_setting_changed`, `context_memory_forgotten`, `taste_portrait_reset`,
`taste_portrait_tuned`.

**Instrumented elsewhere** (`Services/Analytics/*`, `Features/FirstLaunch/Models/OnboardingFunnel`,
`MatchCeremonyAnalytics`, `ScanAnalytics`): the `companion_*` family (~24 events incl.
`companion_fab_tapped`, `companion_panel_opened`, `companion_quick_action_tapped`,
`companion_nudge_tapped`, `companion_intro_shown/dismissed`, `companion_coaching_phase_changed`,
`companion_session_summary`, `companion_user_stuck`), the product family (`product_detail_opened`,
`product_saved`, `product_shared`, `product_added_to_room`, `product_add_initiated/cancelled`,
`product_dwell`, `product_swiped_left/right`, `product_insight_viewed`, `product_material_viewed`,
`product_pairing_tapped`), the feed family (`feed_loaded`, `feed_refreshed`, `feed_filter_applied`,
`feed_exhausted`, `feed_scroll_depth`), the story family (`story_viewed`, `story_tapped`,
`story_scroll_depth`, `story_scrolled_past`, `story_product_viewed`, `story_product_added`), the room
channel family (`room_channel_viewed/switched/dwell`), scan (`scan_started/paused/resumed/completed/
abandoned`, `scan_progress_milestone`, `scan_edge_*`, `room_scan_started/completed/abandoned`),
reveal (`reveal_displayed`, `reveal_profile_explored`, `reveal_cta_tapped`), help (`article_opened`,
`help.tour.*`), and session (`app_launched`, `session_started`, `session_summary` props
`screens_visited`, `interaction_count`, `duration_seconds`).

**Which of these could measure daily return, as built:**
- `app_open` / `app_background` + `session_started` — the raw DAU/return curve. **This is the only
  honest return metric today.**
- `today_next_move_tapped` (`action_id`) — whether the one home CTA is the reason people came back,
  and which state machine drove it.
- `today_editorial_story_tapped` (`story_id`) — whether the story is a return reason and whether the
  *same* story keeps getting tapped (which would prove it is not rotating).
- `today_active_room_tapped` (`saved_item_count`) — return-to-my-room behaviour.
- `product_saved` → later `app_open` — investment → return.
- `studio_queue_item_activated` (`section`) — post-purchase/project return, but two acts deep so it
  under-counts intent.
- **Missing for return:** no push-received / push-opened event, no notification-permission
  outcome event, no "new since last visit" event, no widget/Live-Activity surface to measure, no
  event on the story's unread dot (which is always on anyway).

---

## A15 — iOS return surfaces present or absent

`apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` declares exactly **three** targets
(`:177,200,223`): the app (`com.apple.product-type.application`, bundle `cloud.patina.app`, `:530`),
a unit-test bundle, a UI-test bundle. **No app-extension target of any kind.**

| Surface | Present? | Evidence |
|---|---|---|
| Home Screen widget | **✘** | no widget extension target; zero `WidgetKit` imports app-wide |
| Lock Screen widget | **✘** | same |
| Live Activities | **✘** | no `ActivityKit`; no `NSSupportsLiveActivities` in `Patina/Info.plist` |
| App Intents / Shortcuts / Spotlight | **✘** | zero `AppIntent`, `INIntent`, `CSSearchable`, `NSUserActivity` matches in the whole app tree |
| Wallet passes | **✘** | no `PKPass` |
| Background refresh | **✘ (partial)** | no `BGTaskScheduler`/`BGAppRefresh`; the only background work is a URLSession background config for scan uploads (`App/AppDelegate.swift:85-97`, `Services/Sync/BackgroundScanUploader.swift`). `Patina/Info.plist` declares **no** `UIBackgroundModes`. |
| Local notifications | **✘** | no `UNNotificationRequest` / trigger anywhere — the app can never schedule its own reminder |
| Remote push | ✔ receive-side only | `Patina.entitlements:5-6` `aps-environment = development`; send side is a backend stub (C14) |
| Universal links | **✘** | no `com.apple.developer.associated-domains` entitlement; `Info.plist` declares only the custom scheme `patina` (`:15-27`) |
| Sign in with Apple | ✔ | `Patina.entitlements:7-10` |

Info.plist also carries only usage strings + the URL type; category is
`public.app-category.shopping` (`project.pbxproj:513`), portrait-only, status bar hidden
(`:522-523`).

**Net: the app has exactly one off-app return surface (push), and its send side does not exist yet.**

---

## A16 — Deep links / universal links

`App/DeepLinking/DeepLinkHandler.swift` (`PatinaApp.swift:91-97` wires `.onOpenURL`).

- Scheme: `patina://` only — `guard url.scheme == APIConfiguration.appURLScheme` (`:62`). No
  associated domains, so `https://` links open Safari, not the app (A15).
- URLs arriving during `.launching` are queued on `coordinator.pendingDeepLink` and drained on entry
  to `.main` (`:71-74`, `AppCoordinator.swift:220-223`).
- Hosts (`:79-92`): `auth` → magic-link/PKCE session, or QR approval (requires a real session; a
  guest is bounced back to the auth screen, `:145-151`); `room` → `.roomProject(roomId:)` (`:168-177`);
  `piece` → `.pieceDetail(pieceId:)` (`:182-189`). Path-based fallback for `/auth`, `/room/`,
  `/piece/` (`:194-210`). Everything else returns `false`.
- **Not deep-linkable:** invoices, proposals, decisions, threads, projects, budget, documents,
  Saved, Browse — even though `NotificationRouter` can route to most of them from a push payload
  (A11). So an emailed or texted link can only ever open a room or a piece.

---

## A17 — Sharing, and the second person

Three `ShareLink` sites, all sharing the same URL shape:

| Site | URL | Subject / message |
|---|---|---|
| Piece detail top bar | `https://app.patina.cloud/library/<productId>` (`Features/Shared/PatinaPortalLinks.swift:16-22`) | subject = name; message = `"{name} by {maker} on Patina"` (`ProductDetailView.swift:117-121`) |
| Browse card ⋯ / long-press | same | same (`RecommendationsView.swift:318-324`) |
| Saved row (`ProductCard`, `.list`) | same, passed as `shareURL` (`CollectionsView.swift:285`) | subject = name (`Features/Shared/Views/ProductCard.swift:192`) |

Scan sharing exists separately for the designer hand-off (`Services/Sharing/ScanSharingService.swift`).

**There is no way to share a room, a board, or the Saved list.** And there is **no invite,
household, partner, co-viewer, or second-seat concept anywhere in the app** — grep finds no
"invite", no household model, no shared-account path. `app.patina.cloud/library/<id>` is the
designer-portal Library route; whether a recipient without an account sees anything is outside this
lane, but the app offers the link unconditionally.

---

## A18 — Dead ends and dormant code that bear on return / purchase

Ranked by consequence.

1. **The purchase dead end** — no cart, no checkout, no quote, no vendor link on any product
   surface (A5). Terminal copy: `Add to Room` → `Saved ✓`.
2. **AR is structurally unreachable** — `usdz_url` is `NULL::text` in the RPC
   (`00246_aesthete_quiz_bridge.sql:281`) and `nil` in the direct fetch
   (`ProductAPIClient.swift:192`), so `hasARModel` is always false; the detail's AR button never
   draws, and the Companion route lands on **"3D model not available for this product"**
   (`ARPlacementView.swift:200`). "In AR" on the room stat row is therefore always `0`
   (`RoomProjectView.swift:241`).
3. **The whole Studio home rail is orphaned** — `HomeStudioBlock` / `StudioHubSection` /
   `MarketplaceLinksSection` / `WorkWithDesignerCTA` (A1). An `activeProject` client's money rail is
   two acts behind a monogram.
4. **Boards can never hold anything** — `addToBoard` has no call site
   (`CollectionsViewModel.swift:101`).
5. **Room-scoped Saved is always empty** — `TableItemModel.roomId` is never written
   (`TableItemModel.swift:51`).
6. **Piece-detail saves are local-only and un-seeded** — `toggleSave` inserts a `TableItemModel`
   with no remote mirror (`ProductDetailViewModel.swift:104-125`) and `isSaved` starts `false` on
   every visit, so re-saving duplicates rows.
7. **The tour's middle step is dead** — anchor `.addToRoom` mounts nowhere (A13).
8. **Story unread dot is hard-coded true** — `isUnread: true` default
   (`EditorialStoriesAPIClient.swift:119,130`), a fabricated freshness signal.
9. **Push-only routes** — `proposal` and `invoice` `entity_type`s are handled
   (`NotificationRouter.swift:66-74`) but the code states no edge function emits them yet; and no
   `patina://` link reaches them either (A16).
10. **`sign_proposal` does not send the confirmation email** — carry-forward TODO in
    `Services/API/ProposalsAPIClient.swift:403`, on the money path.
11. **`AppCoordinator.hasExistingRooms()`** is a documented placeholder reading a UserDefaults count
    (`AppCoordinator.swift:257-261`) — unused, but it is the kind of stub a reader will trust.
12. **`AddedToRoomToast` / `AddToRoomSheet`** exist with no presenter — the "added to {room}" moment
    the tour promises has no UI today.
13. Room budget band is hard-coded $2K–$5K (`RoomProjectView.swift:20-21`) while the quiz collects a
    real `budgetRange` (`StylePreferenceModel.swift:51`).

---

## A19 — Profile / Account / Settings, rows verbatim

**Profile** (`Features/Profile/Views/ProfileView.swift`) — reached from the home monogram:
`?` help · avatar monogram · display name · `"Member since {date}"` · style capsule `✦ {styleBadge}`
· stats **Rooms | Saved | Match** (`:187-221`) · `StudioHubView` (A10) · `"YOUR ROOMS"` card rail ·
`"YOUR PROFILE"` group:
- `Retake Style Quiz` → `.styleQuiz` (`:150`)
- `Get design help` → `.designServices` sheet (`:153`)
- `Settings` → `.settings` sheet (`:156`)

**Settings** (`Features/Settings/Views/SettingsView.swift`), header `"Settings"`:
- **Account** — `Account` (pushes `AccountView`) · `Sign in on the web` (opens the QR sheet)
- **Preferences** — `Notifications` (toggle) · `Haptic Feedback` (toggle) · `Upload scans on
  cellular` (toggle) · `Appearance` (menu: System / Light / Dark)
- **Privacy & Memory** — `Use activity for context` (toggle; sub-copy "Off until you choose it. When
  on, Patina remembers only activity type, an identifier, and time for up to 90 days.") ·
  `Forget recent context` (alert: "Forget recent context?" / "Patina will forget recent room,
  product, project, and style activity. Your rooms, scans, saved pieces, projects, and taste
  portrait stay intact.") · `Reset taste portrait` (alert: "Reset taste portrait?" / "This removes
  your local taste portrait and its tuning. Rooms, scans, saved pieces, and projects are not
  changed.")
- **Support** — `Help Center` (`patina.cloud/help`) · `Contact Us` (`mailto:hello@patina.cloud`) ·
  `Terms & Privacy` (`patina.cloud/terms`)

**Account** (`Features/Account/AccountView.swift`), title `"Account"`: avatar glyph, email,
account info, actions, footer; sign-out alert `"Sign Out"` / `"Are you sure you want to sign out?"`
(`:52-70`). Sign-out closes the sheet, plays the splash, and drops to `.auth`.

---

## A20 — "Today" logic: every date/time-aware branch

| Branch | File:line | Granularity | Would a returning user see a difference? |
|---|---|---|---|
| `greetingDate` = `"EEEE · MMM d"`, uppercased | `DailyRoomViewModel.swift:85-89` → `DailyRoomView.swift:108` | **per calendar day** | Yes — the date line. It is the only guaranteed daily change on the home. |
| Literal `"Today"` heading | `DailyGreetingHeader.swift:40` | constant | No |
| `TimeOfDay.current` (dawn/morning/day/afternoon/evening/night, 5/7/11/14/18/21 boundaries) | `PatinaDesignKit/.../Tokens/TimeOfDay.swift:211-222` | per part-of-day | **Only in three places, none of them the home:** the camera-permission primer's gradient (`Features/FirstLaunch/Views/CameraPermissionView.swift:68`) and two Companion greeting generators (`Features/Companion/Services/CompanionVoice.swift:34-74`, `Services/Companion/CompanionService.swift:156,329-346`) — the latter reached only inside the Companion conversation rail. **The Daily Room never reads it.** |
| Companion returning-vs-first greeting | `CompanionVoice.swift:34-74`; `lastTimeOfDay` key `Utilities/PropertyWrappers/UserDefaultsBacked.swift:57` | per part-of-day + returning flag | Only inside the Companion; e.g. evening returning = "Evening. Something surfaced while you were away." |
| `TodayExperience.nextMove` priority ladder | `Features/Home/Models/TodayExperience.swift:48-160` | event-driven, not time-driven | Yes, but only when a draft/scan/request/decision/message/room/style state changes. No decay, no recency, no "since your last visit". |
| Editorial story query | `EditorialStoriesAPIClient.swift:72-79` | whatever the admin publishes | Only on a new/reordered publish. Not a daily rotation. |
| Story unread dot | `EditorialStoriesAPIClient.swift:119` (`isUnread: true`) | constant `true` | Always "new" — dishonest |
| Bell unread badge | `DailyRoomView.swift:113`, `Features/Notifications/ViewModels/NotificationsViewModel.swift` | per `notification_log` row | Yes, when the backend writes a row |
| `AppNotification.timeAgo` ("Just now / Nm / Nh / Nd ago") | `Features/Notifications/Models/AppNotification.swift:60-66` | continuous | Yes, inside the feed |
| `DesignRequestStatus.relativeSubmitted` ("3d ago") | `DesignRequestStatusService.swift:363-370` | continuous | Inside the request detail |
| 14-day promotion window for terminal/matched requests | `DesignRequestStatusService.swift:352-360` | daily boundary | Yes — a matched card silently disappears on day 15 |
| Companion coaching auto-graduation at 14 days | `CompanionCoachingModel.swift:~daysToLearned` | daily boundary | The orb calms down |
| `dueLabel` / `Review by {date}` in the Studio queue | `StudioQueueBuilder.swift:92,140` + `Features/Shared/DateDisplay.swift` | per day | Yes, two acts deep |
| Room `metaLine` "Scanned MMM d" and Profile "Scanned MMM d" | `RoomProjectView.swift:225`, `ProfileView.swift:301` | per day | Static after the scan |
| `TodayRoomArtwork` "ROOM SCAN" chip | `TodayModules.swift:187-197` | boolean | No |
| Splash minimum 1.5 s | `AppCoordinator.swift:77-81` | per launch | No |

**Nothing on the home is keyed to "since your last visit."** There is no last-seen timestamp for the
feed, the story, the room, or the saved list; `ContextMemoryStore` records only a coarse activity
kind + opaque id + timestamp and is **off by default** (`SettingsView.swift:169-172`). Two weeks away
and one hour away produce the same first screen apart from the date string.

---

### Cross-cutting note for the authors

The app contains, in working code, a marketplace-first home with a tier-gated Studio rail, a room
chip rail, a product feed with `+ Add`, a designer CTA, and a marketplace links block — the exact
composition C2/C3 ratified. It is all one commit away from being mounted again
(`Features/Home/Views/DailyRoomStateBlocks.swift:25`). Whatever Direction A and B propose for the
home, the honest baseline is: **today the home is four modules that change when the user changes
them, plus a date.**
