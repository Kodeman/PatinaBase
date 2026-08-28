//
//  AppCoordinator.swift
//  Patina
//
//  Root coordinator managing app-wide navigation state
//

import SwiftUI
import SwiftData

/// Root coordinator managing the app's navigation state
@MainActor
@Observable
public final class AppCoordinator: Coordinator {
    public typealias Route = AppRoute

    // MARK: - State

    /// Current app phase — derived from `AuthService.session`, onboarding
    /// completion, and `guestModeOptIn`. Use `beginSplashTransition()` or
    /// clear `guestModeOptIn` to nudge transitions; do not set this
    /// directly from outside the recompute path.
    public private(set) var phase: AppPhase = .launching

    /// Navigation path for stack-based navigation
    public var navigationPath = NavigationPath() {
        didSet {
            // Pops can originate outside `goBack()` (interactive edge swipe,
            // system back) by mutating the path through ContentView's
            // binding. Trim the mirror stack and restore the previous
            // screen so context-driven UI (companion nudges) can't outlive
            // its screen (R11).
            guard navigationPath.count < screenStack.count else { return }
            screenStack.removeLast(screenStack.count - navigationPath.count)
            let previous = screenStack.last ?? rootScreen
            if currentScreen != previous {
                currentScreen = previous
                updateContext(for: previous)
            }
        }
    }

    /// Pushed-route history mirroring `navigationPath`. `NavigationPath` is
    /// opaque, so this parallel stack is what lets a pop restore
    /// `currentScreen` + companion context (R11).
    private var screenStack: [AppRoute] = []

    /// The route shown when `navigationPath` is empty — always `.heroFrame`
    /// (the client home surface).
    private var rootScreen: AppRoute = .heroFrame

    /// Whether the companion sheet is expanded
    public var isCompanionExpanded = false

    /// The single modal sheet currently presented over the app, if any.
    /// PT-3-8 / PT-0-5: replaces the five `showing*` booleans and their
    /// manual `Binding(get:set:)` blocks with one `.sheet(item:)` driver.
    /// Set via `navigate(to:)` for the sheet-shaped intents; cleared by
    /// SwiftUI on dismiss (and explicitly on `.auth` / `.launching`
    /// transitions — PT-3-9).
    public var presentedSheet: PresentedSheet?

    // MARK: - Companion Context

    /// Current context for the Companion to understand user's location
    public var companionContext = CompanionContext()

    /// Current screen being viewed (derived from navigation)
    public private(set) var currentScreen: AppRoute = .heroFrame

    // MARK: - Auth-derived state

    /// Earliest moment the splash is allowed to dismiss. Even with an
    /// instantly-restored cached session, the splash plays for at least
    /// `splashMinimumDuration` so the auth-state flicker is hidden.
    /// Reset by `beginSplashTransition()` when, e.g., the user signs out.
    public private(set) var splashMinimumDeadline: Date = Date().addingTimeInterval(1.5)

    /// Minimum time the splash should play. Tuned to mask cached-session
    /// restore on cold launch.
    public static let splashMinimumDuration: TimeInterval = 1.5

    /// Set when the user taps "Continue as Guest" on the auth screen.
    /// Replaces today's implicit "skip auth, still let them onboard"
    /// behavior. Cleared automatically when `AuthService` reports a
    /// signed-in user, so guest+signed-in doesn't get stuck.
    ///
    /// W3 ruling 9: its initial value is the persisted choice
    /// (`GuestSessionStore`), so a guest who declined the wall does not meet
    /// it again on the next launch. It stays a stored property — the phase
    /// observation loop in `observePhaseInputs()` reads it.
    public var guestModeOptIn: Bool = GuestSessionStore.shared.isOptedIn

    /// URL queued during `.launching` (e.g., a magic-link cold launch
    /// arriving before the auth state stream settles). Drained on entry
    /// to `.main` by `recomputePhase()`.
    public var pendingDeepLink: URL?

    /// Route preserved across a forced sign-out (token refresh failure
    /// mid-session). When re-auth succeeds, the phase observer can
    /// restore the user to where they were.
    public var pendingReturnRoute: AppRoute?

    // MARK: - The house-first root (B-1, R2)

    /// Whether this session runs the four-tab root. Read ONCE, here, from the
    /// flag `PatinaApp.init()` resolved a moment earlier, and held for the
    /// life of the coordinator — a PostHog payload arriving later cannot swap
    /// the root under a session that is already running.
    public let isHouseFirstRoot: Bool

    /// The four stacks. Only the house-first root reads them; on the flag-off
    /// root this stays empty and `navigationPath` is still the whole model.
    public let tabs = TabNavigationModel()

    // MARK: - Dependencies

    private let settings = AppSettings.shared

    // MARK: - Initialization

    public convenience init() {
        self.init(houseFirstRoot: FeatureFlags.shared.isOn(.houseFirst))
    }

    init(houseFirstRoot: Bool) {
        self.isHouseFirstRoot = houseFirstRoot

        // Phase is now derived from `AuthService.session`, onboarding
        // completion, and guest opt-in by `recomputePhase()`. We start at
        // `.launching` (the default for the stored property) and let the
        // observer settle us into `.auth` / `.onboarding` / `.main` once
        // the splash deadline elapses and `AuthService` reports state.
        currentScreen = .heroFrame
        companionContext.currentScreen = .heroFrame

        // Start observing AuthService + AppSettings so `phase` derives
        // from auth state, and schedule the splash-deadline tick. PT-3-4:
        // the class is now `@MainActor`, so `init` is main-actor-isolated and
        // these run directly — no `Task { @MainActor in }` hop needed.
        observePhaseInputs()
        // Fire a recompute when the initial splash window closes —
        // the observer only wakes for tracked-property changes, and
        // `Date()` isn't one, so without this tick we'd stay on
        // `.launching` forever when auth state lands during splash.
        scheduleSplashDeadlineRecompute()
    }

    /// Wakes the phase observer when `splashMinimumDeadline` elapses.
    /// Re-issued by `beginSplashTransition()` so subsequent splash
    /// transitions (sign-out) get the same handling.
    private var splashDeadlineTask: Task<Void, Never>?

    private func scheduleSplashDeadlineRecompute() {
        splashDeadlineTask?.cancel()
        let deadline = splashMinimumDeadline
        splashDeadlineTask = Task { @MainActor [weak self] in
            let interval = deadline.timeIntervalSinceNow
            if interval > 0 {
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
            guard !Task.isCancelled else { return }
            self?.recomputePhase()
        }
    }

    // MARK: - Phase Derivation

    /// Self-reposting observation of the inputs that determine `phase`.
    /// `withObservationTracking` is one-shot — after the registered reads
    /// change, we re-register from a Task on MainActor so the next change
    /// fires the same closure. Safe to call once from `init()`.
    ///
    /// The `onChange` block runs *before* the observed value is committed
    /// (Swift Observation semantics), which is why the recompute is
    /// scheduled on a Task — by the time it runs, the new value has
    /// landed on MainActor.
    private func observePhaseInputs() {
        withObservationTracking {
            _ = AuthService.shared.isAuthStateReady
            _ = AuthService.shared.isAuthenticated
            _ = AppSettings.shared.hasCompletedOnboarding
            _ = self.guestModeOptIn
            self.recomputePhase()
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                self?.observePhaseInputs()
            }
        }
    }

    /// Compute the phase from the current inputs. Pure function of
    /// (auth ready, authenticated, guest opt-in, onboarding complete,
    /// splash deadline). Called by the observation loop above and
    /// directly from `beginSplashTransition()` to force `.launching`.
    public func recomputePhase() {
        let newPhase = derivePhase()

        #if DEBUG
        if newPhase != phase {
            PatinaLog.nav.debug("[AppCoordinator] phase \(phase) → \(newPhase) (ready=\(AuthService.shared.isAuthStateReady) authed=\(AuthService.shared.isAuthenticated) guest=\(guestModeOptIn) onboarded=\(settings.hasCompletedOnboarding))")
        }
        #endif

        let oldPhase = phase
        if newPhase != phase {
            // Detect a *forced* sign-out: phase goes directly
            // `.main → .auth` without passing through `.launching`. A
            // voluntary sign-out routes through `beginSplashTransition`
            // which puts us in `.launching` first, so this branch only
            // fires for token-refresh failures and similar interruptions.
            // Save the current screen so re-auth can drop the user back
            // where they were.
            if oldPhase == .main, newPhase == .auth, pendingReturnRoute == nil {
                pendingReturnRoute = currentScreen
            }

            // PT-3-9: tear down any open modal sheet when we leave `.main`
            // for `.auth` / `.launching`. Otherwise an open sheet (e.g. the
            // QR scanner) re-presents itself over the auth / splash screen
            // on the next render, since `.sheet(item:)` keys off a property
            // that survived the phase flip.
            if newPhase == .auth || newPhase == .launching {
                presentedSheet = nil
            }

            withAnimation(.easeInOut(duration: 0.4)) {
                phase = newPhase
            }
        }

        // Clear guest opt-in if a real session shows up — guest+signed-in
        // is meaningless, and we don't want the user stuck in guest mode
        // after signing in from settings.
        if AuthService.shared.isAuthenticated, guestModeOptIn {
            guestModeOptIn = false
        }

        // Drain any deep link queued during `.launching` once we've
        // arrived at `.main`. Magic-link cold launch is the canonical
        // case — the URL arrives before the auth stream emits, so we
        // can't act on it until the session is established.
        if newPhase == .main, let url = pendingDeepLink {
            pendingDeepLink = nil
            DeepLinkHandler.shared.handle(url)
        }

        // Restore the user's pre-sign-out screen after a forced sign-out
        // is resolved by re-auth. Drained on entry to `.main`.
        if newPhase == .main, let route = pendingReturnRoute {
            pendingReturnRoute = nil
            // A restore is an outside entry: the person did not walk here, so
            // it lands on the route's own tab (no-op on the flag-off root).
            openExternal(route)
        }
    }

    private func derivePhase() -> AppPhase {
        let splashStillPlaying = Date() < splashMinimumDeadline
        if !AuthService.shared.isAuthStateReady || splashStillPlaying {
            return .launching
        }
        let signedIn = AuthService.shared.isAuthenticated
        if !signedIn && !guestModeOptIn {
            return .auth
        }
        if !AppSettings.shared.hasCompletedOnboarding {
            return .onboarding
        }
        return .main
    }

    /// Force a splash transition — used by sign-out to land back at
    /// `.auth` via a brief splash instead of leaving the home view
    /// visible while the session tears down.
    public func beginSplashTransition(duration: TimeInterval = splashMinimumDuration) {
        splashMinimumDeadline = Date().addingTimeInterval(duration)
        scheduleSplashDeadlineRecompute()
        recomputePhase()
    }

    /// Check if user has existing rooms (placeholder - would query SwiftData)
    private func hasExistingRooms() -> Bool {
        // In a full implementation, this would query SwiftData for RoomModel count
        return settings.roomCount > 0
    }

    // MARK: - Navigation

    public func navigate(to route: AppRoute) {
        // SP-07: "Get design help" must never file a second lead for a client
        // who already has a live one. Both ways in are guarded — this route,
        // and `presentDesignServices` for the sheet-based entry points.
        if case .designerConsultation = route {
            switch DesignHelpDestination.current {
            case .existingRequest(let leadId):
                navigate(to: .designRequests(focusLeadId: leadId.uuidString))
                return
            case .requestList:
                navigate(to: .designRequests(focusLeadId: nil))
                return
            case .newRequest:
                break
            }
        }

        // Update current screen tracking
        currentScreen = route

        // Track screen view in PostHog (constant screen name for the scan
        // flow; `reason` rides along as an event property — PT-3-5).
        trackScreen(for: route)

        // House-first root: an in-app tap pushes onto the tab already on
        // screen, so Back returns the person where they were and a room's own
        // "browse pieces for this room" never strands the room behind a tab
        // switch. Only `openExternal(_:)` — a link, a push, a restore — reads
        // the route→tab table. A route that IS a tab's root still switches:
        // the bar already carries that door, so a second copy is never pushed.
        if isHouseFirstRoot {
            tabs.push(route)
            updateContext(for: route)
            return
        }

        switch route {
        case .heroFrame:
            rootScreen = route
            screenStack = []
            navigationPath = NavigationPath()
            updateContext(for: route)

        case .yourSpaces, .roomProject, .roomSettings,
             .crossRoom, .manualRoomEntry, .roomSavedItems,
             .table, .scanFlow, .emergence, .roomEmergence, .pieceDetail,
             .styleQuiz, .styleResult,
             .arPlacement,
             .profile, .studio, .notifications, .designerConsultation, .designRequests,
             .projectList, .projectDetail,
             .decisionList, .decisionDetail,
             .threadList, .threadDetail,
             .proposalList, .proposalDetail,
             .invoiceList, .invoiceDetail,
             .budget, .documentList, .orderDetail:
            push(route)
            updateContext(for: route)
        }
    }

    /// The app entered from outside: a deep link, a universal link, an APNs
    /// tap, or the restore after a forced sign-out was resolved by re-auth.
    ///
    /// This is the one entry that reads `RouteTabTable` — it lands on the
    /// route's OWN tab and pushes there, because the person did not come from
    /// wherever the app happened to be sitting. On the flag-off root there is
    /// one stack, so it is exactly `navigate(to:)`.
    public func openExternal(_ route: AppRoute) {
        guard isHouseFirstRoot else {
            navigate(to: route)
            return
        }

        // Same SP-07 guard as `navigate(to:)`: a link must not file a second
        // lead for a client who already has a live one.
        if case .designerConsultation = route {
            switch DesignHelpDestination.current {
            case .existingRequest(let leadId):
                openExternal(.designRequests(focusLeadId: leadId.uuidString))
                return
            case .requestList:
                openExternal(.designRequests(focusLeadId: nil))
                return
            case .newRequest:
                break
            }
        }

        currentScreen = route
        trackScreen(for: route)
        tabs.navigate(to: route)
        updateContext(for: route)
    }

    /// A tap on the bar. Re-tapping the selected tab pops it to root.
    /// `currentScreen` follows through `syncCurrentScreen(to:)`, driven by the
    /// root's `onChange`, so tab taps and stack pops take one path.
    public func selectTab(_ tab: PatinaTab) {
        guard isHouseFirstRoot else { return }
        tabs.select(tab)
    }

    /// Re-derives `currentScreen` from whichever tab stack is on screen. This
    /// is the multi-stack twin of the `navigationPath.didSet` trim: a pop
    /// SwiftUI performs itself — an edge swipe, a system back button, a tab
    /// switch — must restore the revealed screen's companion context, or a
    /// nudge outlives the screen that earned it (R11).
    public func syncCurrentScreen(to route: AppRoute) {
        guard isHouseFirstRoot, currentScreen != route else { return }
        currentScreen = route
        trackScreen(for: route)
        updateContext(for: route)
    }

    /// The one way to open the design-request compose sheet (SP-07). A client
    /// with a live request is sent to that request instead of a second
    /// compose step.
    public func presentDesignServices(roomId: UUID?, preselectedScanIds: [UUID] = []) {
        switch DesignHelpDestination.current {
        case .existingRequest(let leadId):
            navigate(to: .designRequests(focusLeadId: leadId.uuidString))
        case .requestList:
            navigate(to: .designRequests(focusLeadId: nil))
        case .newRequest:
            presentedSheet = .designServices(roomId: roomId, preselectedScanIds: preselectedScanIds)
        }
    }

    /// Append a pushed route to both the navigation path and its mirror
    /// stack. Mirror first, so the `navigationPath.didSet` count comparison
    /// doesn't misread a push as a pop.
    private func push(_ route: AppRoute) {
        screenStack.append(route)
        navigationPath.append(route)
    }

    /// PostHog screen-view properties for a route. For `.scanFlow` this
    /// attaches the entry `reason` so the single "Quiet Conversation"
    /// screen name can be segmented in dashboards (PT-3-5).
    private func screenProperties(for route: AppRoute) -> [String: Any]? {
        switch route {
        case .scanFlow(let reason):
            return ["reason": reason.rawValue]
        default:
            return nil
        }
    }

    /// Update `currentScreen` and companion context WITHOUT touching the
    /// navigation path. Use this from `.onAppear` when the view is already
    /// the navigation root (so we don't dirty `navigationPath` and trigger
    /// a re-render that corrupts SwiftUI's gesture recognizer tree under
    /// iOS 26's NavigationStack + ScrollView). Routes that imply a push
    /// must still go through `navigate(to:)`.
    public func setCurrentScreen(_ route: AppRoute) {
        currentScreen = route
        // Keep the pop-restore fallback in sync with whichever home surface
        // is actually showing — root views call this from `.onAppear`.
        if navigationPath.isEmpty { rootScreen = route }
        trackScreen(for: route)
        updateContext(for: route)
    }

    /// Emit the PostHog screen-view event(s) for a route.
    ///
    /// PT-3-5: the canonical screen name for `.scanFlow` is the constant
    /// "Quiet Conversation" with `reason` as a property — this fixes the
    /// three-screen-name funnel corruption ("Walk" / "Walking" /
    /// "Re-scan Room").
    ///
    /// Transition safety: while the `ios_screen_name_v2` flag is OFF we ALSO
    /// emit the legacy per-reason screen name so existing funnel dashboards
    /// keep receiving data until they've been rebuilt against the new name.
    /// Once the flag is flipped ON for a project, only the new name is sent.
    /// Remove this dual-emit a wave after dashboards are migrated.
    private func trackScreen(for route: AppRoute) {
        PostHogService.shared.screen(route.analyticsScreenName, properties: screenProperties(for: route))

        if case .scanFlow = route,
           !PostHogService.shared.isFeatureEnabled("ios_screen_name_v2"),
           let legacyName = route.legacyScreenName {
            PostHogService.shared.screen(legacyName, properties: screenProperties(for: route))
        }
    }

    public func goBack() {
        if isHouseFirstRoot {
            // The root's `onChange` on `tabs.visibleRoute` restores
            // `currentScreen` + companion context for the revealed screen.
            tabs.pop()
            return
        }
        if !navigationPath.isEmpty {
            // `navigationPath.didSet` trims the mirror stack and restores
            // `currentScreen` + companion context to the revealed screen.
            navigationPath.removeLast()
        }
    }

    // MARK: - Context Management

    /// Update companion context when navigating to a new screen
    private func updateContext(for route: AppRoute) {
        companionContext.currentScreen = route

        // Clear context that's no longer relevant
        switch route {
        case .heroFrame, .roomSavedItems:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .scanFlow:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .emergence, .roomEmergence, .pieceDetail:
            companionContext.walkProgress = nil
        case .table:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .styleQuiz, .styleResult:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .arPlacement:
            companionContext.walkProgress = nil
        case .profile, .studio, .notifications, .designerConsultation, .designRequests:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil

        // Room System routes
        case .yourSpaces, .roomProject, .roomSettings, .crossRoom,
             .manualRoomEntry:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil

        // MVP v1 expanded routes — clear viewing context.
        case .projectList, .projectDetail,
             .decisionList, .decisionDetail,
             .threadList, .threadDetail,
             .proposalList, .proposalDetail,
             .invoiceList, .invoiceDetail,
             .budget, .documentList, .orderDetail:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        }
    }

    /// Update the viewing piece context
    public func updateViewingPiece(_ piece: ViewingPieceContext?) {
        companionContext.viewingPiece = piece
    }

    /// Update the active room context
    public func updateActiveRoom(_ room: ActiveRoomContext?) {
        companionContext.activeRoom = room
    }

    /// Update walk progress
    public func updateWalkProgress(_ progress: Float?) {
        companionContext.walkProgress = progress
    }

    /// Update table item count
    public func updateTableItemCount(_ count: Int) {
        companionContext.tableItemCount = count
    }

    /// Update room count
    public func updateRoomCount(_ count: Int) {
        companionContext.roomCount = count
        settings.roomCount = count
    }

    /// Set a pending notification for the Companion
    public func setCompanionNotification(_ notification: CompanionNotification?) {
        companionContext.pendingNotification = notification
    }

    /// Clear the pending notification
    public func clearCompanionNotification() {
        companionContext.pendingNotification = nil
    }

    // MARK: - Intent Handling

    /// Handle a navigation intent from the Companion
    /// Returns true if the intent triggered navigation
    @discardableResult
    public func handleIntent(_ intent: NavigationIntent) -> Bool {
        switch intent {
        case .walkRoom(let roomId):
            // Both branches enter the Quiet Conversation flow; a known
            // roomId means we're re-walking an existing room.
            navigate(to: .scanFlow(reason: roomId == nil ? .fresh : .rescan))
            return true

        case .showEmergence:
            navigate(to: .emergence(pieceId: nil))
            return true

        case .showTable:
            navigate(to: .table)
            return true

        case .showRooms:
            navigate(to: .yourSpaces)
            return true

        case .goBack:
            goBack()
            return true

        case .startOver:
            resetToThreshold()
            return true

        case .showHelp:
            // Show help overlay (could be a sheet)
            return false

        case .requestDesignServices(let roomId):
            presentDesignServices(roomId: roomId)
            return true

        case .viewRecommendations(let roomId):
            if let roomId = roomId {
                navigate(to: .roomEmergence(roomId: roomId))
            } else {
                navigate(to: .emergence(pieceId: nil))
            }
            return true

        case .webSignIn:
            presentedSheet = .qr
            return true

        case .showSettings:
            presentedSheet = .settings
            return true

        // Screen-specific intents (don't navigate, just return)
        case .continueWalk, .saveWalkProgress, .seeWhatFits:
            return false

        case .explainPiece, .seeInRoom, .letDrift:
            return false

        case .whatsNew:
            navigate(to: .emergence(pieceId: nil))
            return true

        case .whatsMissing, .seeTogether, .share:
            return false

        case .addToTable, .similarPieces:
            return false

        case .savePhoto, .tryAnother, .exitAR:
            return false

        case .skipAhead, .startFresh, .tellMeMore:
            return false

        // Help intents (handled by CompanionViewModel)
        case .needHelp, .narrowDown, .suggestOptions:
            return false

        case .none:
            return false
        }
    }

    /// Handle intent with optional confirmation response
    public func handleIntentWithResponse(_ intent: NavigationIntent) -> (navigated: Bool, response: String?) {
        let navigated = handleIntent(intent)

        if navigated {
            let response = IntentDetector.shared.confirmationResponse(for: intent)
            return (true, response.isEmpty ? nil : response)
        }

        return (false, nil)
    }

    // MARK: - Quiet Conversation Flow

    /// Kick off the new Room Scan & Style Discovery flow ("The Quiet Conversation").
    /// Picks the LiDAR or manual-entry path, then drives the linear sequence.
    /// Per `docs/specs/IOS Scann/quiet-conversation-prd.md`.
    public func startRoomScanFlow() {
        // The flow host (`QuietConversationFlowHost`) detects LiDAR support
        // itself and forks to the threshold (LiDAR) or fallback-entry
        // (manual) path. A fresh scan is the canonical entry.
        navigate(to: .scanFlow(reason: .fresh))
    }

    // MARK: - Phase Transitions

    /// Reset onboarding flags and clear navigation. The phase observer
    /// will recompute and land the user in `.onboarding` (or `.auth` if
    /// they're signed out) on the next tick.
    public func resetToThreshold() {
        settings.hasSeenThreshold = false
        settings.hasCompletedOnboarding = false
        navigationPath = NavigationPath()
        if isHouseFirstRoot {
            for tab in PatinaTab.allCases { tabs.popToRoot(tab) }
            tabs.selected = .today
        }
    }

    // MARK: - Companion

    /// Toggle companion sheet
    public func toggleCompanion() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            isCompanionExpanded.toggle()
        }
        HapticManager.shared.companionPulse()
    }
}

// MARK: - Presented Sheet

extension AppCoordinator {
    /// The set of app-level modal sheets. PT-3-8 / PT-0-5: replaces five
    /// `showing*` booleans with a single `Identifiable` enum driving one
    /// `.sheet(item:)` in `ContentView`. Associated values carry the data
    /// the sheet needs so we no longer keep parallel `*RoomId` / `*ItemId`
    /// properties on the coordinator.
    public enum PresentedSheet: Identifiable, Hashable {
        /// App settings (notifications, haptics, cellular upload). PT-0-5:
        /// mounts `SettingsView`; `AccountView` is reachable from within it.
        case settings
        /// QR code scanner for web sign-in.
        case qr
        /// In-context sign-in prompt (`AuthSheet`) — a modal nudge to
        /// authenticate without ejecting the user to the auth phase root.
        case auth
        /// "Request design help" flow, optionally scoped to a room and/or
        /// preselecting specific held/synced scans (`RoomScanPackage.scanId`).
        case designServices(roomId: UUID?, preselectedScanIds: [UUID])
        /// "Add a room" bottom sheet (Room System).
        case newRoom
        /// Move / copy a saved item between rooms (Room System).
        case moveItem(itemId: UUID)

        public var id: String {
            switch self {
            case .settings: return "settings"
            case .qr: return "qr"
            case .auth: return "auth"
            case .designServices(let roomId, let scanIds):
                let scans = scanIds.map { $0.uuidString }.joined(separator: ",")
                return "designServices-\(roomId?.uuidString ?? "none")-\(scans)"
            case .newRoom: return "newRoom"
            case .moveItem(let itemId): return "moveItem-\(itemId.uuidString)"
            }
        }
    }
}

// MARK: - Environment Key

extension AppCoordinator {
    /// The default the environment falls back to when no coordinator was
    /// injected. In DEBUG (previews, tests) we spin up a throwaway instance so
    /// isolated views still render. In release this is a programmer error —
    /// reading the coordinator without injection used to silently create a
    /// second coordinator (its own splash task, phase observer, nav path), so
    /// we trap instead.
    static var environmentDefault: AppCoordinator {
        #if DEBUG
        return AppCoordinator()
        #else
        fatalError("AppCoordinator was read from the environment without being injected")
        #endif
    }
}

extension EnvironmentValues {
    @Entry public var appCoordinator: AppCoordinator = .environmentDefault
}
