# C4 — state matrix: screen × {loading, empty, error, offline, refresh}

Static read of `apps/mobile/Patina/Patina` at main `d7287c3f8`. Paths below are relative to
`/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/`. "none" = no code implements that cell.

Legend for **offline**: what a tester with no network actually sees on that screen. Nothing in this
app has an offline *design* except the scan-sync lane (`ScanSyncQueue.swift:78` is the app's only
`NWPathMonitor`), so almost every row reads as "the generic error path, or an empty state that lies".

---

## Studio / money lane — the best-formed screens in the app

| Screen | loading | empty | error | offline | refresh |
|---|---|---|---|---|---|
| Invoices list `Features/Invoices/Views/InvoiceListView.swift` | `:57` `PatinaLoadingState` (spinner + "One moment…") | `:103` `PatinaEmptyState` "Nothing due" + Studio CTA | `:60` `PatinaErrorState("Couldn't load invoices")` + retry — **only while the list is empty** | generic error card; no offline wording | `:34` `.refreshable` |
| Invoice detail `Features/Invoices/Views/InvoiceDetailView.swift` | `:35` `PatinaLoadingState` | n/a | `:32` `PatinaErrorState` + retry; pay failures via `MoneyFailureCopy` (`:242`) | pay banner appears, but its second act "Message your designer" (`:278`) is a **silent no-op** | `:46` `.refreshable` — but `InvoicesViewModel.refresh` `:104` is `try?`, so a failed pull is silent |
| Proposals list `…/Proposals/Views/ProposalListView.swift` | `:48` | `:98` `PatinaEmptyState` | `:51` + retry (empty-only) | generic | `:28` |
| Proposal detail `…/Proposals/Views/ProposalDetailView.swift` | `:32` | n/a | `:29` `PatinaErrorState` `:176` | generic | **none** |
| Decisions list `…/Decisions/Views/DecisionListView.swift` | `:47` | `:130` | `:50` + retry (empty-only) | generic | `:27` |
| Decision detail `…/Decisions/Views/DecisionDetailView.swift` | `:44` | `:25` "options pending" line (only when options exist but are blank) | `:41` for a failed decision row; **`options == []` from a failed fetch renders nothing at all** (`DecisionsViewModel.swift:166` `try?`) | question with no choices, no retry | **none** |
| Documents list `…/Documents/DocumentListView.swift` | `:62` | `:80` | `:65` + retry (empty-only); open failure → alert `:36` | generic; download failure copy is `DocumentsAPIError` (good) | `:29` |
| Budget `…/Budget/BudgetView.swift` | `:50` | `:75` | `:53` + retry (empty-only) | generic | `:31` |
| Orders list `…/Orders/Views/OrderedListView.swift` | `:50` | `:81` | `:53` `service.lastRefreshFailed && orders.isEmpty` | generic | `:33`; `.task` is `refreshIfNeeded` `:32` so revisits never refetch |
| Order detail `…/Orders/Views/OrderDetailView.swift` | `:39` | `:52` "We couldn't find that order" | `:41` **distinguishes** unreachable from missing — the model row for the app | explicit "Check your connection and try again." | `:76` |
| Studio hub `…/Profile/Views/StudioHubView.swift` | `:23` "Gathering your Studio…" | per-section `kind.emptyMessage` `:239` | `:25` all-7-failed error + `Try again`; `:29` partial-load notice | `wifi.exclamationmark` + "We couldn't gather your Studio." — the only offline-shaped copy outside the scan lane | **none** (host `ProfileView.swift:33` ScrollView has no `.refreshable`) |
| Messaging list `…/Messaging/Views/ThreadListView.swift` | `:71` | `:185` | `:74` + retry (empty-only) | generic | `:51` |
| Thread detail `…/Messaging/Views/ThreadDetailView.swift` | `:33` | **none** — a new thread is a blank page above the composer | `:36` load error **only when `messages.isEmpty`**; a failed **send** (`MessagingViewModel.swift:254`) is invisible in a non-empty thread | composer stays enabled; send fails silently | **none** |
| Notifications `…/Notifications/Views/NotificationFeedView.swift` | `:107` | `:113` + guest invite `:187` | `:205` + retry (empty-only) | generic | `:47` |
| Projects list `…/Projects/Views/ProjectListView.swift` | `:70` | `:206`; `:78` filtered-empty | `:73` + retry (empty-only) | generic | `:53` |
| Project detail `…/Projects/Views/ProjectDetailView.swift` | `:47` | n/a | `:44` **only if the project row itself failed**; phases/milestones/FF&E/proposal/invoice/document reads are all `try?` (`ProjectsViewModel.swift:57-63`) | a full project renders as an empty one | **none** |

## Home / discovery / rooms

| Screen | loading | empty | error | offline | refresh |
|---|---|---|---|---|---|
| Today `Features/Home/Views/DailyRoomView.swift` | **none** — no skeleton, no spinner; blocks pop in as six `.task`s land (`:101-135`) | `HomeComposition` block rules `Models/TodayExperience.swift:273` | story-only: `HomeStoryRetryRow` `:441`. Everything else silent | tier resolves `.unknown → .discovering` (`:213`) → an activeProject client sees "Start with a room" (`YourHouseRail.swift:317`); `BadgeCountService.lastRefreshFailed:129` is never read | **none** — foreground `scenePhase` only (`:170`) |
| Today · story slot `:420-450` | `:444` `ProgressView("Loading today's story…")` — **unreachable**, `.story` is only composed when `hasStory` (`TodayExperience.swift:291`) | n/a | `:441` retry row (good) | retry row | `:441` |
| Today · room feed | `DailyRoomViewModel.isFeedLoading:87` — **no consumer** | — | `feedError:92` "We couldn't load picks for this room." — **no consumer** | invisible | — |
| Spaces `…/Rooms/Views/YourSpacesView.swift` | **none** (`@Query` paints instantly; the server reconcile `:106` is invisible) | `:180` "No rooms yet / Scan Your First Room" | **none** — `RoomSyncCoordinator.swift:190-197` swallows the list failure | the empty state stands: a client with rooms on the server is told they have none | **none**; `syncStatusPill:239` "Will retry when online" is the app's only true offline affordance |
| Pieces / Recommendations `…/Recommendations/Views/RecommendationsView.swift` | `:250` "Finding pieces for you…" | `:257` "Nothing here yet" + style-quiz CTA (does not name the active filter) | `:253` + `viewModel.retry()` | generic | **none** |
| Saved / Collections `…/Collections/Views/CollectionsView.swift` | **none** | `:148` "No saved items yet"; `:282` empty boards; `:372` empty board tile | **none** — `CollectionsViewModel.swift:87` `(try? …) ?? []` per room | "No saved items yet" on an account that has saves | `:124` — but `refresh` `:201` is all `try?`, so it can't report anything |
| Piece detail `…/ProductDetail/Views/ProductDetailView.swift` | `:115` `PatinaLoadingState("Loading this piece…")` | n/a | `:117` `PatinaErrorState` + retry + its own back chevron `:665` (good) | generic; `terms` fetch `:140` swallowed to `.unknown` | **none** |
| AR placement `…/ARPlacement/Views/ARPlacementView.swift` | `:194` bare `ProgressView` | n/a | `:112` toast **prints `error.localizedDescription`** | "Save failed: The operation couldn't be completed. (Patina.RoomsAPIError error 2.)" | **none** |
| Room detail `…/Rooms/Views/RoomProjectView.swift` | none | none | none | local-only screen | **none** |

## Design services / purchase / auth / help

| Screen | loading | empty | error | offline | refresh |
|---|---|---|---|---|---|
| Design request status `…/DesignServices/DesignRequestStatusView.swift` | **none** — `DesignerConsultationView()` (the *no-request* landing) is what renders while `:65` `.task` is in flight | `:62` consultation landing | **none**; `DesignRequestStatusService.swift:887-890` falls back to `hydrateFromLocal()` silently | a client with an open request can be shown the "start a request" landing | **none** |
| Design request flow `…/DesignServices/DesignRequestFlowView+Steps.swift` | `:188`, `:215` spinners; `ScanUploadProgressView:166` | n/a | `:170` prints `DesignServicesError.errorDescription` → `.networkError(error.localizedDescription)` (`DesignServicesService.swift:219`); `ScanUploadProgressView.swift:57-63` prints `package.lastError` (raw) | `:112` **offlineCard** "You're offline" + `:153` button flips to "Save request" — the best offline design in the app | manual retry buttons `:203-211` |
| Order sheet `…/Purchase/OrderSheet.swift` | `:290` `isWorking` | n/a | `OrderFailureCopy` — app-authored, never interpolated (good) | generic | n/a |
| Ask sheets `…/Purchase/AskAboutPieceSheet.swift`, `AskDesignerSheet.swift` | `:116` / `:145` | n/a | `:104` / `:133` app-authored sentence | generic | n/a |
| Auth (welcome) `ContentView.swift:37-60` → `AuthScreenView.swift:65` | n/a | n/a | **prints `AuthService.errorMessage`, i.e. `error.localizedDescription`** | "The Internet connection appears to be offline." in a red banner | n/a |
| Auth (email/OTP) `…/Authentication/Views/AuthenticationView.swift` | `:255,:359,:463,:509` spinners | n/a | `:162` same raw string | same | n/a |
| QR approval `…/QRAuth/Views/QRApprovalView.swift` | `:245` | n/a | `errorOverlay` prints `viewModel.errorMessage` → `QRAuthService.swift:234` raw | "Network error: <system string>" | n/a |
| Help panel `…/Help/Views/HelpPanelSheet.swift` | `:146` | `:160` `ContentUnavailableView` (system-styled, unlike every other empty state) | `:150` + retry | generic | none (10 s timeout, `SanityHelpClient.swift:70`) |
| Settings `…/Settings/Views/SettingsView.swift` | **none** — toggles render defaults then jump | n/a | **none** — `SettingsService.load():75,91` and both upserts (`:139,:159`) swallow every failure | a toggle flipped offline looks saved and is not | n/a |
| Splash / root `App/Coordinators/AppCoordinator.swift:258-266` | 1.5 s minimum + `isAuthStateReady` | n/a | none | `emitLocalSessionAsInitialSession: true` (`SupabaseClient.swift:59`) means the local session emits without the network — no infinite splash | n/a |

---

## Cross-cutting facts

- **Loading vocabulary:** one spinner component (`Design/Components/PatinaLoadingState.swift:14`). Zero `redacted`/skeleton/shimmer placeholders anywhere in `Features/**`.
- **Error vocabulary:** `Design/Components/PatinaErrorState.swift:14` (icon + message + "Let's try that again"). Used on 14 screens.
- **Empty vocabulary:** `PatinaDesignKit/.../PatinaEmptyState.swift:12` on 12 screens; hand-rolled on Spaces and Saved; `ContentUnavailableView` on Help only.
- **`.refreshable` coverage:** 12 screens have it (Budget, Collections, Decisions list, Documents, Invoice list + detail, Threads list, Notifications, Order detail + list, Projects list, Proposals list). **Every tab root lacks it** (Today, Spaces, Pieces, Studio), as do thread detail and the proposal/decision/project details.
- **Error-while-stale:** every list gates its error branch on `<collection>.isEmpty`, so a failed refresh over existing rows is invisible on all nine list screens.
- **Offline detection:** `Services/Sync/ScanSyncQueue.swift:78` is the app's only `NWPathMonitor`; `RoomScanSyncService.isNetworkAvailable:42` is its only export and defaults to `true` before the first path callback. Two consumers: `DesignRequestFlowView+Steps.swift:112` and `YourSpacesView.swift:240`.
- **Timeouts:** raw-`URLSession` clients set `APIConfiguration.requestTimeout` = 30 s (`APIConfiguration.swift:147`) on every request. The supabase-swift client is built with no `session` override (`SupabaseClient.swift:54-63`), so Invoices/Proposals/DirectOrders/ProfileLookup/Documents-storage inherit `URLSession.shared` — 60 s request, 7-day resource.
- **Alerts:** 11 total, 9 of them destructive confirmations. Only `DocumentListView.swift:36` uses an alert for an error. No alert fatigue.
