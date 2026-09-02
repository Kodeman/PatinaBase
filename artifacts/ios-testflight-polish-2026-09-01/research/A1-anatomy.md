# A1 — Screen inventory of the Patina client app (TestFlight-polish audit)

Repo state: `main @ d7287c3f8`, 2026-09-01. Evidence level: **code-read** throughout (no simulator,
no device). All paths relative to `apps/mobile/Patina/Patina/` unless stated.

Baseline: `artifacts/ios-daily-return-2026-08-26/research/10-code-anatomy.md` + `15-task-paths.md`,
written at `3cd84ecb3`. **196 commits have touched `apps/mobile/Patina` since**, so that document is
stale in three structural ways this one corrects:

1. **There are now two roots.** `ContentView.mainContent` branches on `AppCoordinator.isHouseFirstRoot`
   (read once in the coordinator's `init`, from the `house-first` flag). Flag OFF → the W2 root:
   one `NavigationStack` + the floating Companion orb. Flag ON → `HouseFirstRoot`: four
   `NavigationStack`s under `PatinaTabBar` (Today / Spaces / Pieces / Studio) with the Companion in a
   fifth, non-tab slot. **A first-round TestFlight tester gets the flags-off root on first launch.**
2. **`AppRoute` grew four cases** since the baseline: `.studio`, `.orderList`, `.orderDetail`
   (`App/Coordinators/Coordinator.swift:78,101,107`), and the purchase rail behind them.
   The whole `Features/Purchase/`, `Features/Orders/`, `Features/Money/` trees are new.
3. **Most of the baseline's orphan list is gone.** `HomeStudioBlock`, `StudioHubSection`,
   `MarketplaceLinksSection`, `WorkWithDesignerCTA`, `RoomChipRail`, `RoomContextBar`,
   `DailyProductCard`, `DailyProductDetailView`, `DailyFeedEmptyModule`, `ContinueScanCard`,
   `DesignRequestStatusCard`, `HomeFilteredFeedEmpty` — those files no longer exist.
   `AddToRoomSheet` now has two live call sites. `TableItemModel.roomId` is now written
   (`Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:70`,
   `Services/Sync/RoomScanSyncService.swift:404`), so room-scoped Saved is no longer always empty.
   Two orphans survive (`AddedToRoomToast`, `DesignRequestResumeBanner`).

**Root selection recap.** `ContentView.swift:149` → `HouseFirstRoot()` or `legacyMainContent`.
Both roots carry a **verbatim duplicate** of the same five-way destination dispatcher
(`ContentView.swift:228-425` vs `HouseFirstRoot.swift:172-355`). Route→tab mapping for external
entries (deep link / push / restore) is `Features/Navigation/RouteTabTable.swift:24-79`; an *in-app*
`navigate(to:)` pushes onto whichever tab is on screen (`AppCoordinator.swift:319-323`,
`TabNavigationModel.push`).

Legend — **Roots**: `both` = renders on either root · `flags-off` = only the W2 root ·
`house-first` = only behind the `house-first` flag · `n/a` = outside the app process (widget).
**Audience**: who can actually get there.

---

## 1 · Phase roots (before `.main`)

| # | Screen | View + file | Reached by | Roots | Audience | Area |
|---|---|---|---|---|---|---|
| 1 | Splash | `SplashView` · `Features/Splash/Views/SplashView.swift` | `phase == .launching`; min 1.5 s floor (`AppCoordinator.swift:77-81`) | both | everyone | first-run |
| 2 | Welcome / auth wall | `AuthScreenView` · `Features/Authentication/Views/AuthScreenView.swift` | `phase == .auth` (`ContentView.swift:36`) — the true first screen of a fresh install | both | signed-out | auth |
| 3 | Email one-time code | `AuthenticationView(initialMode: .magicLink)` · `Features/Authentication/Views/AuthenticationView.swift` | sheet — "Continue with email" (`ContentView.swift:64`) | both | signed-out | auth |
| 4 | Password sign-in | `AuthenticationView(initialMode: .signIn)` · same file | sheet — "Have a password? Sign in" (`ContentView.swift:68`) | both | signed-out | auth |
| 5 | Onboarding carousel | `OnboardingFlowView` · `Features/Onboarding/Views/OnboardingFlowView.swift` | `phase == .onboarding`, step `.carousel` (`OnboardingFlowHost.swift:81`) | both | everyone | onboarding |
| 6 | Camera primer (walk-first) | `CameraPermissionView` · `Features/FirstLaunch/Views/CameraPermissionView.swift` | onboarding step `.walkPermission`, **only behind PostHog flag `onboarding_walk_first`** (`OnboardingFlowHost.swift:63,87`) | both | everyone | onboarding |
| 7 | Camera privacy sheet | inline sheet in `CameraPermissionView.swift:50` | sheet from #6 | both | everyone | onboarding |
| 8 | Onboarding style quiz | `StyleQuizView(onComplete:)` · `Features/StyleQuiz/Views/StyleQuizView.swift` | onboarding step `.styleQuiz` (default path) | both | everyone | onboarding |
| 9 | Onboarding style result | `StyleResultView(onViewRecommendations:)` · `Features/StyleQuiz/Views/StyleResultView.swift` | onboarding step `.styleResult`; its CTA completes onboarding and lands on Browse pieces | both | everyone | onboarding |

## 2 · `.main` roots

| # | Screen | View + file | Reached by | Roots | Audience | Area |
|---|---|---|---|---|---|---|
| 10 | Today | `DailyRoomView` · `Features/Home/Views/DailyRoomView.swift` | root of the single stack (flags-off, `ContentView.swift:218`) **and** the Today tab root (`HouseFirstRoot.swift:111`) | both | everyone | today-home |
| 11 | Tab bar (chrome) | `PatinaTabBar` · `Features/Navigation/PatinaTabBar.swift` | `safeAreaInset` on `HouseFirstRoot`; 4 words + Strata mark, no icons | house-first | everyone | visual-system |
| 12 | Spaces tab root | `SpacesTabRoot` → `YourSpacesView` · `Features/Navigation/TabRoot.swift:55` | bar tap | house-first | everyone | rooms-scan |
| 13 | Pieces tab root | `PiecesTabRoot` → `RecommendationsView` · `TabRoot.swift:64` | bar tap; as a tab root it additionally draws `SavedDoorRow` | house-first | everyone | browse-saved |
| 14 | Studio tab root ("Your Studio") | `StudioTabRoot` → `ProfileView` · `TabRoot.swift:78`; route `.studio` | bar tap | house-first | everyone | studio-designer |

## 3 · Pushed destinations (`AppRoute`, both dispatchers)

| # | Screen (route) | View + file | Reached by | Roots | Audience | Area |
|---|---|---|---|---|---|---|
| 15 | Your Spaces (`.yourSpaces`) | `YourSpacesView` · `Features/Rooms/Views/YourSpacesView.swift` | Spaces tab (house-first); **flags-off: Companion row only**, plus `RoomProjectView` not-found "Your rooms" (`RoomProjectView.swift:161`) | both | everyone | rooms-scan |
| 16 | Room (`.roomProject`) | `RoomProjectView` · `Features/Rooms/Views/RoomProjectView.swift` | Today `RoomHeroCard`/`YourHouseRail` (`DailyRoomView.swift:305,397`), Profile room rail (`ProfileView.swift:273`), Your Spaces cards, `patina://room/<uuid>`, push `entity_type=room`, manual-room accept (`QuietConversationFlowHost.swift:385`) | both | everyone | rooms-scan |
| 17 | Room Settings (`.roomSettings`) | `RoomSettingsView` · `Features/Rooms/Views/RoomSettingsView.swift` | ⚙ on the room hero | both | everyone | rooms-scan |
| 18 | All Items (`.crossRoom`) | `CrossRoomView` · `Features/Rooms/Views/CrossRoomView.swift` | Whole-Home bar on Your Spaces (`YourSpacesView.swift`), Companion | both | everyone | browse-saved |
| 19 | Room details form (`.manualRoomEntry`) | `ManualRoomEntryView` · `Features/Rooms/Views/ManualRoomEntryView.swift` | Today `StartWithARoomBlock` / house-rail "add" (`DailyRoomView.swift:409`), `NewRoomSheet`, `AddToRoomSheet` "new room" (Piece + Browse), onboarding manual path, Companion | both | everyone | rooms-scan |
| 20 | Saved — one room (`.roomSavedItems`) | `CollectionsView(roomId:)` · `Features/Collections/Views/CollectionsView.swift` | **Companion only** — `CompanionAreaBuilders.swift:164` is the sole call site | both | everyone | browse-saved |
| 21 | Browse pieces (`.emergence(nil)`) | `RecommendationsView` · `Features/Recommendations/Views/RecommendationsView.swift` | Pieces tab (house-first); `StyleResultView`, `RoomProjectView`, `CrossRoomView`, `CollectionsView` empty states, Companion. **No Today door on either root.** | both | everyone | browse-saved |
| 22 | Browse pieces — one room (`.roomEmergence`) | `RecommendationsView(roomId:)` | `RoomProjectView`, Today next move, Companion | both | everyone | browse-saved |
| 23 | Saved (`.table`) | `CollectionsView` | Today `SavedSummaryRow` **only when signed-in AND savedPieceCount > 0** (`TodayExperience.swift:293`), `SavedDoorRow` **only when `isTabRoot`** (`RecommendationsView.swift:115`), Companion `collectionsRow` (unconditional) | both | everyone (guest: Companion only) | browse-saved |
| 24 | Piece (`.pieceDetail`) | `ProductDetailView` · `Features/ProductDetail/Views/ProductDetailView.swift` | Browse grid, Saved rows, room item rows, Today `NewThisWeekRail`, `patina://piece/<id>`, `https://client.patina.cloud/piece(s)/<id>`, push `product`/`piece` | both | everyone | product |
| 25 | Quiet Conversation host (`.scanFlow`) | `QuietConversationFlowHost` · `Features/RoomScan/Views/QuietConversationFlowHost.swift` | Today "Scan it", room "Rescan", `NewRoomSheet`, walk-first onboarding, Companion | both | everyone | rooms-scan |
| 26 | Style quiz (`.styleQuiz`) | `StyleQuizView` (no `onComplete`) | Profile "Retake Style Quiz" (`ProfileView.swift:155`), Browse empty CTA, Today next move, Companion | both | everyone | onboarding |
| 27 | Your Style (`.styleResult`) | `StyleResultView(showsChrome: true)` | pushed by `StyleQuizView.swift:115` when the quiz was entered as a route (not onboarding) | both | everyone | onboarding |
| 28 | AR Placement (`.arPlacement`) | `ARPlacementView` · `Features/ARPlacement/Views/ARPlacementView.swift` | Piece bottom bar **only when `product.hasARModel`** (`ProductDetailView.swift:586`) — never true; room item `.viewAR`; Companion "Try in your room" | both | everyone | product |
| 29 | Profile (`.profile`) | `ProfileView` · `Features/Profile/Views/ProfileView.swift` | Today header Studio pill (**drawn only when `!isHouseFirstRoot`** — `DailyRoomView.swift:262`), `HouseRecordCard` "see all" (`DailyRoomView.swift:274`), Companion tail | both | everyone | studio-designer |
| 30 | Your Studio (`.studio`) | `ProfileView` (same composition) | Studio tab only. **No `navigate(to: .studio)` call site exists** | house-first | everyone | studio-designer |
| 31 | Notifications (`.notifications`) | `NotificationFeedView` · `Features/Notifications/Views/NotificationFeedView.swift` | Today bell (`DailyRoomView.swift:257`), APNs fallback (`AppDelegate`), Studio queue row (`StudioQueueBuilder.swift:407`) | both | everyone (guest sees a sign-in CTA) | notifications |
| 32 | Work with a designer (`.designerConsultation`) | `DesignerConsultationView` · `Features/DesignServices/DesignerConsultationView.swift` | empty-state CTAs on 8 Studio surfaces (Invoices, Projects, Decisions, Documents, Threads, Proposals, Budget, Notifications). **`navigate(to:)` rewrites this route to `.designRequests` for anyone who already has a request** (`AppCoordinator.swift:293-304`) | both | signed-in, no existing request | studio-designer |
| 33 | Design Request (`.designRequests`) | `DesignRequestStatusView` · `Features/DesignServices/DesignRequestStatusView.swift` | Today next move / record row, request-flow `onTrack` (`ContentView.swift:119`), push `design_request`/`lead`, Companion | both | signed-in | studio-designer |
| 34 | Match introduction | `MatchIntroductionView` · `Features/DesignServices/MatchIntroductionView.swift` | inside #33 when the request stage is introduced | both | signed-in | studio-designer |
| 35 | Designer portfolio | `SafariView` · `Features/Invoices/Views/SafariView.swift` | `fullScreenCover` from #34 (`MatchIntroductionView.swift:83`) | both | signed-in | studio-designer |
| 36 | Add-to-Calendar (EventKit) | `EKEventEditViewController` via `AddToCalendarButton` · `Features/DesignServices/AddToCalendarButton.swift:48` | inside `MatchBookedHero` on #33 (booked stage) | both | signed-in | studio-designer |
| 37 | Projects (`.projectList`) | `ProjectListView` · `Features/Projects/Views/ProjectListView.swift` | Studio hub rows (`StudioQueueBuilder.swift:340,603`), Companion | both | activeProject | studio-designer |
| 38 | Project (`.projectDetail`) | `ProjectDetailView` · `Features/Projects/Views/ProjectDetailView.swift` | list; push `project`; Today house rail for a project room (`DailyRoomView.swift:401`) | both | activeProject | studio-designer |
| 39 | Decisions (`.decisionList`) | `DecisionListView` · `Features/Decisions/Views/DecisionListView.swift` | Today next move, Studio hub, Companion | both | activeProject | studio-designer |
| 40 | Decision (`.decisionDetail`) | `DecisionDetailView` · `Features/Decisions/Views/DecisionDetailView.swift` | list, Studio "Awaiting you", push `decision`, `https://client.patina.cloud/decisions/<id>` | both | activeProject | studio-designer |
| 41 | Decision consent + e-sign | `DecisionConsentSheet` (private, `DecisionDetailView.swift:368`) | sheet on "Choose this" | both | activeProject | studio-designer |
| 42 | Defer a decision | `DecisionDeferSheet` · `Features/Decisions/Views/DecisionDeferSheet.swift` | sheet from #40 | both | activeProject | studio-designer |
| 43 | Messages (`.threadList`) | `ThreadListView` · `Features/Messaging/Views/ThreadListView.swift` | Today next move, Studio hub, order screens, `MatchIntroductionView`, `DesignRequestStatusView`, Companion | both | signed-in | messaging |
| 44 | Conversation (`.threadDetail`) | `ThreadDetailView` · `Features/Messaging/Views/ThreadDetailView.swift` | list; Today designer seat "Message" (`DailyRoomView.swift:381`); push `thread`/`message_thread`; decision-defer send | both | signed-in | messaging |
| 45 | Proposals (`.proposalList`) | `ProposalListView` · `Features/Proposals/Views/ProposalListView.swift` | Studio hub (3 rows), Companion | both | activeProject | money |
| 46 | Proposal (`.proposalDetail`) | `ProposalDetailView` · `Features/Proposals/Views/ProposalDetailView.swift` | list, Studio "Awaiting you", push `proposal`, `https://client.patina.cloud/proposals/<id>` | both | activeProject | money |
| 47 | Sign proposal | `ProposalSignSheet` · `Features/Proposals/Views/ProposalSignSheet.swift` | sheet from #46 | both | activeProject | money |
| 48 | Invoices (`.invoiceList`) | `InvoiceListView` · `Features/Invoices/Views/InvoiceListView.swift` | Studio hub (3 rows), `ProjectDetailLinks`, Companion | both | activeProject | money |
| 49 | Invoice (`.invoiceDetail`) | `InvoiceDetailView` · `Features/Invoices/Views/InvoiceDetailView.swift` | list, Studio, Budget row, push `invoice`, `https://client.patina.cloud/invoices/<id>` | both | activeProject | money |
| 50 | Invoice reminder primer | `InvoiceReminderPrimerView` · `Features/Invoices/Views/InvoiceReminderPrimerView.swift` | sheet from `InvoiceReminderRow` on #49 | both | activeProject | notifications |
| 51 | Stripe Checkout (invoice) | `SafariView` | `fullScreenCover` on #49 (`InvoiceDetailView.swift:48`) | both | activeProject | money |
| 52 | Budget (`.budget`) | `BudgetView` · `Features/Budget/BudgetView.swift` | Studio "Money & documents" row (`StudioQueueBuilder.swift:573`), Companion | both | activeProject | money |
| 53 | Documents (`.documentList`) | `DocumentListView` · `Features/Documents/DocumentListView.swift` | `ProjectDetailLinks`, Studio hub, Companion | both | activeProject | money |
| 54 | Document preview | `DocumentQuickLook` · `Features/Documents/DocumentQuickLook.swift` | `fullScreenCover` on #53 | both | activeProject | money |
| 55 | Ordered (`.orderList`) | `OrderedListView` · `Features/Orders/Views/OrderedListView.swift` | Studio row (`StudioQueueBuilder.swift:470`), Companion `ordersRow` | both | signed-in with orders | money |
| 56 | Order (`.orderDetail`) | `OrderDetailView` · `Features/Orders/Views/OrderDetailView.swift` | list; push `fulfillment_order`/`order`/`direct_order` (`NotificationRouter.swift:94-105`); `OrderPlacedView` "See order" | both | signed-in | money |

## 4 · App-level sheets (`AppCoordinator.PresentedSheet`, `AppCoordinator.swift:720-749`)

| # | Screen | View + file | Reached by | Roots | Audience | Area |
|---|---|---|---|---|---|---|
| 57 | Settings | `SettingsView` · `Features/Settings/Views/SettingsView.swift` | Profile "Settings" (`ProfileView.swift:161`), Studio-hub guest state (`StudioHubView.swift:132`), Companion | both | everyone | settings-account |
| 58 | Account | `AccountView` · `Features/Account/AccountView.swift` | `NavigationLink` inside #57 (`SettingsView.swift:62`); carries Sign Out + **Delete account** | both | everyone | settings-account |
| 59 | Sign in on the web (QR) | `QRScannerView` · `Features/QRAuth/Views/QRScannerView.swift` | Settings row, Account row, Companion, `patina://auth` QR (`DeepLinkHandler.swift:176`) | both | signed-in | auth |
| 60 | QR approval | `QRApprovalView` · `Features/QRAuth/Views/QRApprovalView.swift` | sheet inside #59 | both | signed-in | auth |
| 61 | Sign-in sheet | `AuthSheet` · `Features/Authentication/Views/AuthSheet.swift` | Notification-feed guest CTA (`NotificationFeedView.swift:195`), Companion `signInRow` | both | guest | auth |
| 62 | Design-request flow | `DesignRequestFlowView` · `Features/DesignServices/DesignRequestFlowView.swift` | Profile, Room ×2, Room Settings, scan-saved confirmation, `DesignerConsultationView`, `DesignRequestStatusView`, Today, Companion — all funnelled through `coordinator.presentDesignServices` | both | everyone (guest composes; auth wall at send) | studio-designer |
| 63 | Scan picker (step) | `ScanPickerView` · `Features/DesignServices/ScanPickerView.swift` | step inside #62 | both | everyone | studio-designer |
| 64 | Sign-in wall (request flow) | `AuthSheet` | sheet inside #62 (`DesignRequestFlowView.swift:92`) | both | guest | auth |
| 65 | Add a room | `NewRoomSheet` · `Features/Rooms/Views/NewRoomSheet.swift` | Your Spaces ×2 (`YourSpacesView.swift:164,213`); `.medium` detent | both | everyone | rooms-scan |
| 66 | Move / copy item | `MoveOrCopyItemSheet` · `Features/Rooms/Views/MoveOrCopyItemSheet.swift` | room item menu (`RoomProjectView.swift:342`), `CrossRoomView.swift:173` | both | everyone | rooms-scan |

## 5 · Screen-local sheets, covers and overlays

| # | Screen | View + file | Reached by | Roots | Audience | Area |
|---|---|---|---|---|---|---|
| 67 | Push permission primer | `PushPrimerView` · `Features/Notifications/Views/PushPrimerView.swift` | sheet on Today when `PushPrimerTrigger.shouldPresent` and the once-per-install gate arms (`DailyRoomView.swift:192,197-201`) | both | signed-in | notifications |
| 68 | Story detail | `DailyStoryDetailView` · `Features/Home/Views/DailyStoryDetailView.swift` | full-bleed morph overlay on Today (`DailyRoomView.swift:85`) | both | everyone | today-home |
| 69 | Help panel | `HelpPanelSheet` · `Features/Help/Views/HelpPanelSheet.swift` | `?` on Today (`DailyRoomView.swift:188`), Profile (`:182`), Your Spaces (`:114`), QR scanner (`:102`), Piece (`ProductDetailView.swift:164`), Companion panel (`CompanionOverlay.swift:571`) | both | everyone | help-tour |
| 70 | Help tooltips | `HelpTooltip` popovers · `Features/Help/Views/HelpTooltip.swift` | inline `?` on Profile ×3, Piece, QR approval ×2 | both | everyone | help-tour |
| 71 | First-launch tour | `FirstLaunchTour` popovers · `Features/Help/FirstLaunchTour.swift` | auto-starts on the first Home with an empty stack. **Two hosts**: `DailyRoomView.swift:70` (flags-off) and `HouseFirstRoot.swift:45` (house-first, so step 3 can point at the bar). Anchors in use: `.homeGreeting`, `.todayRecord` (`DailyRoomView.swift:284`), `.profileMonogram` (bar `.studio` item) | both | everyone | help-tour |
| 72 | Companion panel | `CompanionOverlay` · `Features/Companion/Views/CompanionOverlay.swift` | mounted unconditionally in `.main` on both roots; opened by the orb (flags-off) or the bar's Strata mark (`HouseFirstRoot.swift:143`) | both | everyone | companion |
| 73 | Companion intro bubble | `CompanionIntroBubble` · `Features/Companion/Views/CompanionIntroBubble.swift` | after the first-launch tour resolves; capped at 2 showings | both | everyone | companion |
| 74 | Keep your saves? | `LocalStoreClaimSheet` · `Features/Collections/Views/LocalStoreClaimSheet.swift` | raised by `LocalStoreClaim` at the guest→account seam; hosted on `CompanionOverlay.swift:558-565` | both | guest signing in | browse-saved |
| 75 | Add to room | `AddToRoomSheet` · `Features/Home/Views/AddToRoomSheet.swift` | Piece primary act (`ProductDetailView.swift:172`), Browse card menu (`RecommendationsView.swift:166`) | both | everyone | product |
| 76 | Ask your designer | `AskDesignerSheet` · `Features/Purchase/AskDesignerSheet.swift` | Piece act when a live designer exists (`PieceActResolver`) | both | engaged / activeProject | product |
| 77 | Ask about this piece | `AskAboutPieceSheet` · `Features/Purchase/AskAboutPieceSheet.swift` | Piece act when not buyable / `direct-orders` off | both | signed-in | product |
| 78 | Order sheet | `OrderSheet` · `Features/Purchase/OrderSheet.swift` | Piece act when the `direct-orders` flag is on **and** `BuyabilityGate` passes | both | signed-in | money |
| 79 | Stripe Checkout (direct order) | `SafariView` | `fullScreenCover` in `OrderSheet.swift:74` | both | signed-in | money |
| 80 | Order placed | `OrderPlacedView` · `Features/Purchase/OrderPlacedView.swift` | replaces #78 on success; CTAs "See order" → `.orderDetail`, "Back to Today" | both | signed-in | money |
| 81 | Sign-in wall (piece act) | `AuthSheet(title:)` | Piece act wall (`ProductDetailView.swift:250`) — the title names the act that raised it | both | guest | auth |
| 82 | Note on a saved piece | `SavedNoteSheet` · `Features/Collections/Views/SavedNoteSheet.swift` | Saved row (`CollectionsView.swift:189`) | both | everyone | browse-saved |
| 83 | Item actions | `ItemActionMenu` · `Features/Rooms/Views/ItemActionMenu.swift` | room item tap (`RoomProjectView.swift:127`); `.medium` detent | both | everyone | rooms-scan |
| 84 | Room budget | `RoomBudgetSheet` · `Features/Rooms/Views/RoomBudgetSheet.swift` | room Budget cell (`RoomProjectView.swift:132`) | both | everyone | rooms-scan |

## 6 · Inside the Quiet Conversation (`QuietConversationFlowHost.InternalFlowStep`)

The host forks on `RoomCaptureService.isSupported` at `bootstrap()` (`:145-153`).
**LiDAR present → `.threshold`. No LiDAR (every Simulator, and non-Pro iPhones) → `.fallback`.**
The two paths do not converge until `.conversation`.

| # | Screen | View + file | Reached by | Roots | Audience | Area |
|---|---|---|---|---|---|---|
| 85 | Threshold | `ScanThresholdView` · `Features/RoomScan/Views/ScanThresholdView.swift` | step `.threshold` — **LiDAR only** | both | LiDAR devices | rooms-scan |
| 86 | Walk (live capture) | `ScanWalkView` · `Features/RoomScan/Views/ScanWalkView.swift` | inside #85 — LiDAR only | both | LiDAR devices | rooms-scan |
| 87 | Pause menu | `PauseMenuView` · `Features/RoomScan/Shared/Components/PauseMenuView.swift` | overlay in #86 (`ScanWalkView.swift:110`) | both | LiDAR devices | rooms-scan |
| 88 | Review | `ScanReviewView` · `Features/RoomScan/Views/ScanReviewView.swift` | `fullScreenCover` after the walk (`QuietConversationFlowHost.swift:109`) — LiDAR only | both | LiDAR devices | rooms-scan |
| 89 | Choose a hero photo | `HeroPickerSheet` · `Features/RoomScan/Views/HeroPickerSheet.swift` | sheet in #88 | both | LiDAR devices | rooms-scan |
| 90 | Reorder photos | `PhotoReorderSheet` · `Features/RoomScan/Views/PhotoReorderSheet.swift` | sheet in #88 | both | LiDAR devices | rooms-scan |
| 91 | Caption editor | `CaptionEditorSheet` · `Features/RoomScan/Views/CaptionEditorSheet.swift` | sheet in #88 | both | LiDAR devices | rooms-scan |
| 92 | Saved to your rooms | `ScanSavedConfirmationView` · `Features/RoomScan/Views/ScanSavedConfirmationView.swift` | step `.savedConfirmation` — LiDAR only | both | LiDAR devices | rooms-scan |
| 93 | Soft landing | `SoftLandingView` · `Features/RoomScan/Views/SoftLandingView.swift` | step `.softLanding` — LiDAR only | both | LiDAR devices | rooms-scan |
| 94 | **Room details (no-LiDAR fallback)** | `ScanFallbackEntryView` · `Features/RoomScan/Views/ScanFallbackEntryView.swift` | step `.fallback` — the **only** scan screen a Simulator or non-LiDAR iPhone ever reaches | both | non-LiDAR devices | rooms-scan |
| 95 | Style conversation (5 questions) | `StyleConversationContainerView` + `VisualResonanceView` / `LifestyleRealityView` / `MaterialConnectionView` / `InvestmentPerspectiveView` / `PriorityView` · `Features/StyleConversation/Views/` | step `.conversation`; **skipped** for a returning user with a saved profile unless "Update my style" (`QuietConversationFlowHost.swift:264`) | both | everyone | onboarding |
| 96 | Contemplative pause | `ContemplativePauseView` · `Features/StyleConversation/Views/ContemplativePauseView.swift` | inside #95 | both | everyone | onboarding |
| 97 | Reveal | `RevealView` · `Features/StyleReveal/Views/RevealView.swift` | step `.reveal` | both | everyone | onboarding |
| 98 | Floor plan | `ScanFloorPlanPreviewView` · `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift` | step `.floorPlan`; Accept persists the manual room and lands on `.roomProject` (`QuietConversationFlowHost.swift:375-386`) | both | everyone | rooms-scan |

## 7 · Widget (`apps/mobile/Patina/PatinaWidget`, bundle `cloud.patina.app.widget`)

| # | Screen | View + file | Reached by | Roots | Audience | Area |
|---|---|---|---|---|---|---|
| 99 | House widget — small | `SmallHomeView` · `PatinaWidget/HouseWidgetViews.swift:55` | Home Screen widget gallery ("Patina" / "What moved on your house."); taps open `patina://today` or `patina://record/<rowId>` | n/a | signed-in, `house-widget` snapshot written | widget-deeplinks |
| 100 | House widget — rectangular accessory | `RectangularAccessoryView` · `HouseWidgetViews.swift:140` | Lock Screen | n/a | signed-in | widget-deeplinks |
| 101 | House widget — circular accessory | `CircularAccessoryView` · `HouseWidgetViews.swift:178` | Lock Screen | n/a | signed-in | widget-deeplinks |

---

## External entry surface (for the walkers)

- **Custom scheme** `patina://` — `auth`, `room/<uuid>`, `piece/<id>`, plus widget hosts `today` and
  `record/<rowId>` (`App/DeepLinking/DeepLinkHandler.swift:88-98,244-278`).
- **Universal links** — `https://client.patina.cloud/{piece(s)|invoice(s)|proposal(s)|decision(s)}/<id>`
  (`DeepLinkHandler.swift:216-240`). The entitlement is `applinks:client.patina.cloud`; AASA is live.
- **Push** — `NotificationRouter.swift:60-105`: `project`, `proposal`, `decision`, `invoice`,
  `design_request`/`lead`, `thread`/`message_thread`, `room`, `product`/`piece`,
  `fulfillment_order`/`order`, `direct_order`. Unknown → the notification feed.
- On the house-first root these all go through `RouteTabTable`, so a push lands on the route's *own*
  tab; an in-app tap does not.

---

## Ledger — structural findings (A1)

Severity/confidence per the brief's schema. These are structural only; UX judgement belongs to the
other lanes.

### A1-01 · `.roomSavedItems` has no screen door — Companion-only
- area: browse-saved · severity: minor · testerVisible: true · confidence 0.95 · effort S
- where: `Features/Companion/Services/CompanionAreaBuilders.swift:164` (sole call site);
  destination `ContentView.swift:272` / `HouseFirstRoot.swift:213`
- evidence: whole-tree grep for `.roomSavedItems(roomId:` outside the two dispatchers and
  `CompanionContext`/`RouteTabTable` returns exactly one construction site, inside the Companion's
  room-area rows. No button on `RoomProjectView`, `YourSpacesView` or `CollectionsView` reaches it.
- why: a room's own saved list — now that `TableItemModel.roomId` is actually written — is a real
  screen that only appears if the tester happens to open the orb inside a room.
- fix: add the row to `RoomProjectView`'s items header ("N saved in this room →").

### A1-02 · On the flags-off root (the TestFlight default) Your Spaces has no home door
- area: rooms-scan · severity: major · testerVisible: true · confidence 0.9 · effort S
- where: `Features/Home/Views/DailyRoomView.swift:247-370` (no `.yourSpaces` mount);
  doors are `CompanionAreaBuilders` (`spacesOrScanRow`) and `RoomProjectView.swift:161` (not-found)
- evidence: grep `navigate(to: .yourSpaces)` → `AppCoordinator.swift:595` (inside the **dead**
  `handleIntent`, see A1-07) and `RoomProjectView.swift:161`. Today mounts `RoomHeroCard` /
  `YourHouseRail`, which open individual rooms, never the gallery. The Spaces tab that carries this
  door only exists behind `house-first`, which is OFF on a first TestFlight launch.
- why: "all my rooms" and, one level below it, "All Items" (`.crossRoom`) are behind the orb for
  every round-1 tester.
- fix: give `YourHouseRail` a "See all spaces" tail, or ship round 1 with `house-first` on.

### A1-03 · "Browse pieces" has no Today door on either root
- area: browse-saved · severity: major · testerVisible: true · confidence 0.9 · effort S
- where: `DailyRoomView.swift:247-370`; `.emergence(pieceId: nil)` doors are `StyleResultView`,
  `RoomProjectView`, `CrossRoomView`, `CollectionsView` empty states, and the Companion
- evidence: `HomeComposition.blocks` (`Features/Home/Models/TodayExperience.swift:273-297`) emits
  `header, record, nextMove, designerSeat, roomHero|houseRail|startWithARoom, newThisWeek,
  savedSummary, story, signInLine` — no marketplace door. `NewThisWeekRail` taps go straight to
  `.pieceDetail`, never to the catalogue, and the rail needs ≥3 genuinely new rows to draw at all
  (`newThisWeekFloor = 3`).
- why: the app's shopping surface is one orb tap away on the root a tester actually gets.
- fix: a "Browse pieces" tail on `NewThisWeekRail`, or a `MarketplaceLinksSection` equivalent.

### A1-04 · A guest can save pieces but has no door to Saved except the Companion
- area: browse-saved · severity: major · testerVisible: true · confidence 0.9 · effort S
- where: `Features/Home/Models/TodayExperience.swift:293` (`if input.isSignedIn, input.savedPieceCount > 0`);
  `Features/Recommendations/Views/RecommendationsView.swift:115` (`if isTabRoot`)
- evidence: the Today `savedSummary` block is gated on `isSignedIn`; `SavedDoorRow` on Browse draws
  only when `Environment(\.isTabRoot)` is true, which is only the house-first Pieces tab
  (`Features/Navigation/TabRoot.swift:64`). The code itself still asserts the old state of the world:
  `CompanionActionRows.swift:262` — *"the Companion's `Saved` row is the only route to the Saved
  screen anywhere in the app"*.
- why: "Look around first" is the app's own invitation; the guest's ♥ taps then go somewhere with no
  visible door.
- fix: drop `isSignedIn` from the `savedSummary` gate, or draw `SavedDoorRow` unconditionally.

### A1-05 · `.emergence(pieceId:)` non-nil arm is dead code duplicated in both roots
- area: other · severity: minor · testerVisible: false · confidence 0.95 · effort S
- where: `ContentView.swift:291-297`, `HouseFirstRoot.swift:228-234`
- evidence: grep for `.emergence(` across the app finds only `pieceId: nil` constructions plus the
  two dispatchers and `ContextMemoryStore.swift:215`. The `if let pieceId` branch mounts a second
  `ProductDetailView` that nothing can reach; `.pieceDetail` is the live route.
- fix: collapse `.emergence` to a no-payload case, or delete the branch.

### A1-06 · `.arPlacement` is reachable but structurally cannot succeed
- area: product · severity: major · testerVisible: true · confidence 0.95 · effort M
- where: `Core/Network/ProductAPIClient.swift:265` (`usdzURL: nil`), `Core/Models/ProductModel.swift:198`
  (`hasARModel = usdzURL != nil`), `Features/ARPlacement/Views/ARPlacementView.swift:200`
- evidence: the single-product decode hard-codes `usdzURL: nil`, and `get_recommendations`
  (`supabase/migrations/00246_aesthete_quiz_bridge.sql`) returns `NULL::text AS usdz_url`, so
  `hasARModel` is false on every path. `ProductDetailView.swift:586` therefore never draws the AR
  button; the Companion's "Try in your room" (`CompanionActionRows.swift:97`) and the room item's
  `.viewAR` (`RoomProjectView`) still route there and land on the string
  **"3D model not available for this product"**.
- why: two live doors lead to a screen whose only content is a refusal.
- fix: hide the two doors until `usdz_url` is populated, or land them on the piece with an honest line.

### A1-07 · A whole navigation-intent layer has no call sites
- area: other · severity: minor · testerVisible: false · confidence 0.95 · effort S
- where: `App/Coordinators/AppCoordinator.swift:578` (`handleIntent`), `:663`
  (`handleIntentWithResponse`), `:679` (`startRoomScanFlow`), `:691` (`resetToThreshold`),
  `Features/Companion/Services/IntentDetector.swift`
- evidence: `handleIntent` is called only by `handleIntentWithResponse`, which nothing calls;
  `IntentDetector` is referenced only from that dead pair; `startRoomScanFlow` has no caller.
- why: it makes route-door greps lie — e.g. `.yourSpaces` and `.table` look like they have coordinator
  doors (A1-02, A1-04) when they do not.
- fix: delete, or wire the Companion chat rail that was meant to drive it.

### A1-08 · Two orphan views still compile with no mount
- area: other · severity: polish · testerVisible: false · confidence 0.95 · effort S
- where: `Features/Home/Views/AddedToRoomToast.swift:8`, `Features/DesignServices/DesignRequestResumeBanner.swift`
- evidence: whole-tree grep (app target, excluding each view's own `#Preview`) finds no call site.
  `DesignRequestResumeBanner` even carries `accessibilityIdentifier("DailyRoomView.DesignRequestResumeBanner")`
  for a screen that does not mount it, and no test references either.
- why: the "added to {room}" confirmation the tour language implies still has no UI.

### A1-09 · `AppCoordinator.hasExistingRooms()` is a self-described placeholder
- area: other · severity: polish · testerVisible: false · confidence 0.95 · effort S
- where: `App/Coordinators/AppCoordinator.swift:282-286`
- evidence: `/// Check if user has existing rooms (placeholder - would query SwiftData)` returning
  `settings.roomCount > 0`. No caller, but it is the kind of stub a later reader will trust.

### A1-10 · The full destination dispatcher is duplicated verbatim across the two roots
- area: other · severity: minor · testerVisible: false · confidence 1.0 · effort M
- where: `ContentView.swift:228-425` vs `Features/Navigation/HouseFirstRoot.swift:172-355`
- evidence: `HouseFirstRoot.swift:163-168` says so in a comment ("A verbatim second copy of
  `ContentView`'s dispatcher… This copy dies with the flag-off root, one release from now").
- why: for the length of this audit-and-fix program every navigation-shaped fix has to be applied
  twice, and only one of the two roots is what a round-1 tester sees.

### A1-11 · Three routes, two screens: `.profile`/`.studio` and `.table`/`.roomSavedItems`
- area: other · severity: minor · testerVisible: false · confidence 1.0 · effort S
- where: `ContentView.swift:343-351`, `:272,309`
- evidence: `.profile` and `.studio` both mount `ProfileView` (documented intentional — two PostHog
  names, one composition, `Coordinator.swift:78-88`); `.table` and `.roomSavedItems` both mount
  `CollectionsView` with a different filter.
- why: screen-name analytics and Companion context fork where the pixels do not — worth knowing
  before anyone reads a funnel.

### A1-12 · `.studio` is unreachable on the flags-off root
- area: studio-designer · severity: minor · testerVisible: true · confidence 0.9 · effort S
- where: `Features/Navigation/RouteTabTable.swift:89-103`; no `navigate(to: .studio)` exists
- evidence: the only producer of `.studio` is `RouteTabTable.rootRoute(for: .studio)`, consumed by
  `TabNavigationModel`; `AppCoordinator.selectTab` early-returns unless `isHouseFirstRoot`.
- why: the canonical name "Your Studio" — the one on the bar and in `PatinaTab.canonicalName` — is
  never spoken to a round-1 tester, who sees "Profile" instead.

### A1-13 · Notifications lands on a different tab depending on how it was opened
- area: notifications · severity: minor · testerVisible: true · confidence 0.85 · effort S
- where: `RouteTabTable.swift:55-77` (`.notifications` → `.studio`) vs `AppCoordinator.swift:319-323`
  (in-app pushes onto the current tab)
- evidence: the Today bell (`DailyRoomView.swift:257`) calls `navigate(to: .notifications)`, which on
  the house-first root pushes onto Today; an APNs tap or a Studio-queue row puts the same screen on
  Studio. Back therefore goes to two different places.
- why: only matters once `house-first` is on, but it is the flag Kody may flip for round 2.

### A1-14 · `DesignerConsultationView` shows a hard-coded "Matched Designer" card
- area: studio-designer · severity: major · testerVisible: true · confidence 0.95 · effort S
- where: `Features/DesignServices/DesignerConsultationView.swift:55-75`
- evidence: a gradient circle plus the literal strings `"Matched Designer"` /
  `"Based on your style profile"` / `"We'll pair you with a designer who understands your aesthetic"`.
  Nothing resolves a real designer. This screen is the landing target of the `"Get design help"` /
  `"Work with a designer"` empty-state CTA on eight Studio surfaces.
- why: it reads as a populated card for a designer who does not exist.

### A1-15 · The whole LiDAR scan-review craft is unreachable on a Simulator and on non-LiDAR iPhones
- area: rooms-scan · severity: major · testerVisible: true · confidence 0.95 · effort M
- where: `Features/RoomScan/Views/QuietConversationFlowHost.swift:145-153` (`bootstrap`), `:187-193`
  (`.fallback` → `.conversation`)
- evidence: with `RoomCaptureService.isSupported == false` the host goes `.fallback` →
  `.conversation` → `.reveal` → `.floorPlan`. `ScanThresholdView`, `ScanWalkView`, `PauseMenuView`,
  `ScanReviewView`, `HeroPickerSheet`, `PhotoReorderSheet`, `CaptionEditorSheet`,
  `ScanSavedConfirmationView` and `SoftLandingView` — nine screens — are never entered.
- why: two things at once. (a) A non-LiDAR tester's whole "add a room" experience is one typed form.
  (b) **Nothing in a Simulator walk can cover those nine screens**, so this audit's other lanes must
  treat them as code-read only.

### A1-16 · A load-bearing comment is now false
- area: copy · severity: polish · testerVisible: false · confidence 1.0 · effort S
- where: `Features/Companion/Services/CompanionActionRows.swift:258-264`
- evidence: *"SP-12: the Companion's `Saved` row is the only route to the Saved screen anywhere in
  the app."* `SavedSummaryRow` (Today) and `SavedDoorRow` (Pieces tab) both exist now.

### A1-17 · `navigate(to: .designerConsultation)` silently becomes a different destination
- area: studio-designer · severity: minor · testerVisible: true · confidence 0.9 · effort S
- where: `App/Coordinators/AppCoordinator.swift:293-304`
- evidence: the route is intercepted at the top of `navigate(to:)` and rewritten to
  `.designRequests(focusLeadId:)` whenever `DesignHelpDestination.current` is not `.newRequest`.
- why: eight empty states are labelled "Get design help" / "Work with a designer"; for a client who
  already filed a request they open the request-status screen instead. Correct behaviour (SP-07),
  wrong label — worth a copy pass, and worth knowing before a walker calls it a routing bug.

---

## What is GOOD (calibration)

- **Both dispatchers are exhaustive over `AppRoute` with no `default:`** (`ContentView.swift:229`,
  `HouseFirstRoot.swift:173`), so a new route cannot silently render blank on one root.
- **One sheet driver.** Every app-level modal goes through `AppCoordinator.presentedSheet`
  (`ContentView.swift:85`), replacing five booleans; the same pattern is repeated locally with
  `Presented` enums on Piece, Room and the Companion, so no screen can present two sheets at once.
- **`presentDesignServices` is the single door into the request flow** and it de-dupes a second lead
  (`AppCoordinator.swift:408-416`).
- **The root is read once** (`AppCoordinator.isHouseFirstRoot` is a `let` resolved in `init`), so a
  late PostHog payload cannot swap the root under a running session.
- **`RouteTabTable.tab(for:)` has no `default:`** — a new route must be assigned a tab or the build
  fails.
- **Room-scoped Saved is now real**: `TableItemModel.roomId` is written on save
  (`ProductDetailViewModel.swift:70`) and on sync (`RoomScanSyncService.swift:404`), closing one of
  the baseline's structural dead ends.
- **The manual-room path now persists** (`QuietConversationFlowHost.swift:375-410`, U40) and lands
  the user inside the room they just described.
- **Universal links are wired and match the live AASA** — `piece(s)`, `invoice(s)`, `proposal(s)`,
  `decision(s)`, with singular aliases (`DeepLinkHandler.swift:216-240`).

## What I could NOT verify (and why)

- **Nothing here is sim- or device-verified.** This lane is code-read only, by assignment.
- **Which screens a real tester's data actually reaches.** Tier-gated screens (37-56) depend on
  `BadgeCountService` counts from production; `tester@patina.cloud` may resolve to `.discovering`,
  in which case most of §3 never draws.
- **Whether the `house-first` payload is targeted at any tester in PostHog.** I did not query
  PostHog; per the brief, flags are OFF on a first Release launch either way.
- **Widget rendering.** The widget target compiles and declares three families; whether
  `RecordSnapshotStore` has a snapshot on a fresh install is a runtime question for another lane.
- **Whether `DecisionConsentSheet` / `ProposalSignSheet` / `OrderSheet` ever draw in production** —
  they need an `activeProject` client with a pending decision / unsigned proposal / buyable piece.
- **Alerts and confirmation dialogs** are not enumerated here (they are not screens); the
  destructive ones on Settings and Account are noted inline.
