//
//  AppCoordinator.swift
//  Patina
//
//  Root coordinator managing app-wide navigation state
//

import SwiftUI
import SwiftData

/// Root coordinator managing the app's navigation state
@Observable
public final class AppCoordinator: Coordinator {
    public typealias Route = AppRoute

    // MARK: - State

    /// Current app phase
    public private(set) var phase: AppPhase = .launching

    /// Current authentication state
    public private(set) var authState: AuthState = .unknown

    /// Navigation path for stack-based navigation
    public var navigationPath = NavigationPath()

    /// Whether the companion sheet is expanded
    public var isCompanionExpanded = false

    /// Whether auth sheet is presented
    public var showingAuth = false

    /// Whether settings sheet is presented
    public var showingSettings = false

    /// Whether design services request sheet is presented
    public var showingDesignServices = false

    /// Room ID for design services request
    public var designServicesRoomId: UUID?

    /// Whether QR scanner sheet is presented
    public var showingQRScanner = false

    // MARK: - Companion Context

    /// Current context for the Companion to understand user's location
    public var companionContext = CompanionContext()

    /// Current screen being viewed (derived from navigation)
    public private(set) var currentScreen: AppRoute = .threshold

    // MARK: - First Launch

    /// Coordinator for first-time user onboarding
    public private(set) var firstLaunchCoordinator: FirstLaunchCoordinator?

    /// Whether the app is in first-launch mode
    public var isFirstLaunch: Bool {
        firstLaunchCoordinator != nil && !(firstLaunchCoordinator?.isComplete ?? true)
    }

    // MARK: - Dependencies

    private let settings = AppSettings.shared

    // MARK: - Initialization

    public init() {
        // Always start at Hero Page - it handles both empty and populated states
        // The Hero Page shows:
        // - Empty state (new users): Engaging welcome with "Start Walk" CTA
        // - Populated state (returning users): Room carousel
        phase = .main
        currentScreen = .heroFrame
        companionContext.currentScreen = .heroFrame

        // Only create first launch coordinator if user hasn't completed onboarding
        // and wants to go through the guided first-walk experience
        if !settings.hasCompletedOnboarding {
            firstLaunchCoordinator = FirstLaunchCoordinator()
        } else {
            firstLaunchCoordinator = nil
        }
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
            phase = .threshold
            navigationPath = NavigationPath()
            updateContext(for: route)

        case .heroFrame:
            phase = .main
            navigationPath = NavigationPath()
            updateContext(for: route)

        case .roomList:
            phase = .main
            navigationPath.append(route)
            updateContext(for: route)

        case .roomDetail(let roomId):
            phase = .main
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
            showingAuth = true

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

        // First Launch routes are handled by FirstLaunchContainerView
        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            updateContext(for: route)
        }
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
        case .authentication, .settings, .designServicesRequest, .qrScanner, .qrApproval:
            break

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

    // MARK: - Phase Transitions

    /// Complete the threshold and enter main experience (legacy - for non-first-launch)
    public func completeThreshold() {
        settings.hasSeenThreshold = true
        withAnimation(.easeInOut(duration: 0.8)) {
            phase = .main
        }
        HapticManager.shared.thresholdCrossed()
    }

    /// Complete the first-launch flow and transition to main app
    public func completeFirstLaunch(roomId: UUID? = nil) {
        guard let coordinator = firstLaunchCoordinator else {
            completeThreshold()
            return
        }

        settings.hasCompletedOnboarding = true
        settings.hasSeenThreshold = true

        // Increment room count if walk was completed
        if coordinator.capturedRoomData != nil {
            settings.roomCount += 1
        }

        withAnimation(.easeInOut(duration: 0.8)) {
            phase = .main

            // Go to Hero Frame home screen
            currentScreen = .heroFrame
            companionContext.currentScreen = .heroFrame
            navigationPath = NavigationPath()
        }

        // Clear the first launch coordinator now that it's complete
        firstLaunchCoordinator = nil

        HapticManager.shared.thresholdCrossed()
    }

    /// Reset to threshold (for debugging or re-onboarding)
    public func resetToThreshold() {
        settings.hasSeenThreshold = false
        settings.hasCompletedOnboarding = false
        phase = .threshold
        navigationPath = NavigationPath()
        firstLaunchCoordinator = FirstLaunchCoordinator()
    }

    // MARK: - Authentication

    /// Update authentication state
    public func setAuthState(_ state: AuthState) {
        authState = state
        if case .unauthenticated = state {
            // Could show auth prompt or handle appropriately
        }
    }

    /// Sign out and reset state
    public func signOut() {
        authState = .unauthenticated
        // Additional cleanup as needed
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

private struct AppCoordinatorKey: EnvironmentKey {
    static let defaultValue: AppCoordinator = AppCoordinator()
}

extension EnvironmentValues {
    public var appCoordinator: AppCoordinator {
        get { self[AppCoordinatorKey.self] }
        set { self[AppCoordinatorKey.self] = newValue }
    }
}
