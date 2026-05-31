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
    /// completion, and `guestModeOptIn`. Use `presentAuthentication()` or
    /// `beginSplashTransition()` to nudge transitions; do not set this
    /// directly from outside the recompute path.
    public private(set) var phase: AppPhase = .launching

    /// Navigation path for stack-based navigation
    public var navigationPath = NavigationPath()

    /// Whether the companion sheet is expanded
    public var isCompanionExpanded = false

    /// Whether settings sheet is presented
    public var showingSettings = false

    /// Whether design services request sheet is presented
    public var showingDesignServices = false

    /// Room ID for design services request
    public var designServicesRoomId: UUID?

    /// Whether QR scanner sheet is presented
    public var showingQRScanner = false

    /// Whether the New Room bottom sheet is presented (Room System)
    public var showingNewRoom = false

    /// Whether the Move/Copy item sheet is presented (Room System)
    public var showingMoveItem = false

    /// ID of the SavedItem currently being moved/copied
    public var movingItemId: UUID?

    // MARK: - Companion Context

    /// Current context for the Companion to understand user's location
    public var companionContext = CompanionContext()

    /// Current screen being viewed (derived from navigation)
    public private(set) var currentScreen: AppRoute = .threshold

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
    public var guestModeOptIn: Bool = false

    /// URL queued during `.launching` (e.g., a magic-link cold launch
    /// arriving before the auth state stream settles). Drained on entry
    /// to `.main` by `recomputePhase()`.
    public var pendingDeepLink: URL?

    /// Route preserved across a forced sign-out (token refresh failure
    /// mid-session). When re-auth succeeds, the phase observer can
    /// restore the user to where they were.
    public var pendingReturnRoute: AppRoute?

    // MARK: - Dependencies

    private let settings = AppSettings.shared

    // MARK: - Initialization

    public init() {
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
            navigate(to: route)
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

    /// Move a guest user to the AuthScreenView so they can sign in for
    /// real. Clearing `guestModeOptIn` causes the phase deriver to
    /// return `.auth` on its next tick because the user has no session.
    /// No-op for already-authenticated users — they'd need to sign out
    /// first.
    public func presentAuthentication() {
        guard !AuthService.shared.isAuthenticated else { return }
        guestModeOptIn = false
    }

    /// Check if user has existing rooms (placeholder - would query SwiftData)
    private func hasExistingRooms() -> Bool {
        // In a full implementation, this would query SwiftData for RoomModel count
        return settings.roomCount > 0
    }

    // MARK: - Navigation

    public func navigate(to route: AppRoute) {
        // Update current screen tracking
        currentScreen = route

        // Track screen view in PostHog
        PostHogService.shared.screen(route.displayName)

        switch route {
        case .threshold:
            // `AppRoute.threshold` is a vestigial route — the threshold
            // phase no longer exists. Treat it as "go to home" so any
            // straggling navigate(to: .threshold) callers don't crash.
            navigationPath = NavigationPath()
            updateContext(for: route)

        case .heroFrame:
            navigationPath = NavigationPath()
            updateContext(for: route)

        case .roomList, .yourSpaces:
            navigationPath.append(route)
            updateContext(for: route)

        case .roomProject(let roomId):
            navigationPath.append(AppRoute.roomProject(roomId: roomId))
            updateContext(for: route)

        case .roomSettings(let roomId):
            navigationPath.append(AppRoute.roomSettings(roomId: roomId))
            updateContext(for: route)

        case .crossRoom:
            navigationPath.append(route)
            updateContext(for: route)

        case .newRoom:
            // Presented as sheet via AppCoordinator.showingNewRoom
            showingNewRoom = true

        case .manualRoomEntry:
            navigationPath.append(route)
            updateContext(for: route)

        case .moveItem(let itemId):
            movingItemId = itemId
            showingMoveItem = true

        case .roomDetail(let roomId):
            navigationPath.append(AppRoute.roomDetail(roomId: roomId))
            updateContext(for: route)

        case .roomSavedItems(let roomId):
            navigationPath.append(AppRoute.roomSavedItems(roomId: roomId))
            updateContext(for: route)

        case .roomOptions:
            // Show as sheet
            updateContext(for: route)

        case .conversation, .walk, .walkSession, .table:
            navigationPath.append(route)
            updateContext(for: route)

        case .rescan(let roomId):
            navigationPath.append(AppRoute.rescan(roomId: roomId))
            updateContext(for: route)

        case .emergence(let pieceId):
            navigationPath.append(AppRoute.emergence(pieceId: pieceId))
            updateContext(for: route)

        case .roomEmergence(let roomId):
            navigationPath.append(AppRoute.roomEmergence(roomId: roomId))
            updateContext(for: route)

        case .pieceDetail(let pieceId):
            navigationPath.append(AppRoute.pieceDetail(pieceId: pieceId))
            updateContext(for: route)

        case .authentication:
            // The `.auth` phase is now the authentication surface. Routes
            // that intended "navigate to sign-in" should call
            // `presentAuthentication()` instead. Kept here as a no-op
            // so deep links and older companion intents still compile.
            break

        case .settings:
            showingSettings = true

        case .designServicesRequest(let roomId):
            designServicesRoomId = roomId
            showingDesignServices = true

        case .qrScanner:
            showingQRScanner = true

        case .qrApproval:
            // Approval is shown as part of QR scanner flow, not separately
            break

        case .styleQuiz, .styleResult:
            navigationPath.append(route)
            updateContext(for: route)

        case .arPlacement, .preScanChecklist, .floorPlanPreview,
             .profile, .notifications, .designerConsultation:
            navigationPath.append(route)
            updateContext(for: route)

        case .scanThreshold, .scanWalk, .scanReview, .scanSoftLanding,
             .scanConversation, .scanReveal, .scanFloorPlan,
             .scanFallbackEntry:
            navigationPath.append(route)
            updateContext(for: route)

        // First Launch routes are handled by FirstLaunchContainerView
        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            updateContext(for: route)

        // MVP v1 expanded routes
        case .designerHome:
            navigationPath = NavigationPath()
            updateContext(for: route)
        case .projectList, .projectDetail,
             .decisionList, .decisionDetail,
             .threadList, .threadDetail,
             .receiveDelivery:
            navigationPath.append(route)
            updateContext(for: route)
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
        PostHogService.shared.screen(route.displayName)
        updateContext(for: route)
    }

    public func goBack() {
        if !navigationPath.isEmpty {
            navigationPath.removeLast()
            // Update context to previous screen
            // In a full implementation, we'd track the navigation stack
        }
    }

    // MARK: - Context Management

    /// Update companion context when navigating to a new screen
    private func updateContext(for route: AppRoute) {
        companionContext.currentScreen = route

        // Clear context that's no longer relevant
        switch route {
        case .threshold, .heroFrame, .roomList, .conversation:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .roomDetail, .roomSavedItems, .roomOptions:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .walk, .walkSession, .rescan:
            companionContext.viewingPiece = nil
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
        case .preScanChecklist, .floorPlanPreview:
            companionContext.viewingPiece = nil
        case .profile, .notifications, .designerConsultation:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .authentication, .settings, .designServicesRequest, .qrScanner, .qrApproval:
            break

        case .scanThreshold, .scanWalk, .scanReview, .scanSoftLanding,
             .scanConversation, .scanReveal, .scanFloorPlan,
             .scanFallbackEntry:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil

        // Room System routes
        case .yourSpaces, .roomProject, .roomSettings, .crossRoom,
             .newRoom, .manualRoomEntry, .moveItem:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil

        // First Launch routes
        case .walkInvitation, .cameraPermission:
            companionContext.viewingPiece = nil
            companionContext.walkProgress = nil
        case .walkComplete:
            companionContext.viewingPiece = nil
        case .firstEmergence:
            companionContext.walkProgress = nil
        case .roomNaming:
            companionContext.walkProgress = nil

        // MVP v1 expanded routes — clear viewing context.
        case .designerHome,
             .projectList, .projectDetail,
             .decisionList, .decisionDetail,
             .threadList, .threadDetail,
             .receiveDelivery:
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
            if let roomId = roomId {
                // Navigate to specific room walk
                navigate(to: .walkSession)
            } else {
                // Start new walk
                navigate(to: .walk)
            }
            return true

        case .showEmergence:
            navigate(to: .emergence(pieceId: nil))
            return true

        case .showTable:
            navigate(to: .table)
            return true

        case .showRooms:
            navigate(to: .roomList)
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
            navigate(to: .designServicesRequest(roomId: roomId))
            return true

        case .viewRecommendations(let roomId):
            if let roomId = roomId {
                navigate(to: .roomEmergence(roomId: roomId))
            } else {
                navigate(to: .emergence(pieceId: nil))
            }
            return true

        case .webSignIn:
            showingQRScanner = true
            return true

        case .showSettings:
            navigate(to: .settings)
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
        #if canImport(RoomPlan)
        let hasLidar = RoomCaptureService.isSupported
        #else
        let hasLidar = false
        #endif

        if hasLidar {
            navigate(to: .scanThreshold)
        } else {
            navigate(to: .scanFallbackEntry)
        }
    }

    // MARK: - Phase Transitions

    /// Reset onboarding flags and clear navigation. The phase observer
    /// will recompute and land the user in `.onboarding` (or `.auth` if
    /// they're signed out) on the next tick.
    public func resetToThreshold() {
        settings.hasSeenThreshold = false
        settings.hasCompletedOnboarding = false
        navigationPath = NavigationPath()
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
