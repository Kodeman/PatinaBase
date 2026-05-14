//
//  DeepLinkHandler.swift
//  Patina
//
//  Handles incoming deep links (patina://) and universal links.
//  Routes URLs to appropriate services.
//

import Foundation

/// Handler for incoming deep links
@MainActor
public final class DeepLinkHandler {
    public static let shared = DeepLinkHandler()

    // MARK: - Dependencies

    private var coordinator: AppCoordinator?
    private let qrAuthService = QRAuthService.shared

    /// Route deferred until the coordinator is configured. The APNs
    /// delegate fires on cold launch before SwiftUI has stood up the
    /// coordinator — we stash the route here and replay it during
    /// `configure(coordinator:)`.
    private var pendingRoute: AppRoute?

    // MARK: - Initialization

    private init() {}

    // MARK: - Configuration

    /// Configure the handler with the app coordinator
    /// - Parameter coordinator: The app coordinator for navigation
    public func configure(coordinator: AppCoordinator) {
        self.coordinator = coordinator
        if let pending = pendingRoute {
            pendingRoute = nil
            coordinator.navigate(to: pending)
        }
    }

    /// Push an `AppRoute` through the coordinator, or stash it until
    /// `configure(coordinator:)` is called if the app is mid-launch.
    /// Used by `PatinaAppDelegate` to deliver APNs taps.
    public func navigate(to route: AppRoute) {
        if let coordinator {
            coordinator.navigate(to: route)
        } else {
            pendingRoute = route
        }
    }

    // MARK: - URL Handling

    /// Handle an incoming URL
    /// - Parameter url: The URL to handle
    /// - Returns: Whether the URL was handled
    @discardableResult
    public func handle(_ url: URL) -> Bool {
        // Check scheme
        guard url.scheme == APIConfiguration.appURLScheme else {
            return false
        }

        // Queue URLs that arrive during `.launching` (e.g. a magic-link
        // cold launch tap) — auth state hasn't settled yet, so routing
        // them now would either no-op or land the user in the wrong
        // phase. `AppCoordinator.recomputePhase()` drains
        // `pendingDeepLink` once we reach `.main`.
        if let coordinator, coordinator.phase == .launching {
            coordinator.pendingDeepLink = url
            return true
        }

        // Route based on host/path
        let host = url.host ?? ""

        switch host {
        case "auth":
            return handleAuthURL(url)

        case "room":
            return handleRoomURL(url)

        case "piece":
            return handlePieceURL(url)

        default:
            // Try path-based routing for universal links
            return handlePathBasedURL(url)
        }
    }

    // MARK: - Auth URLs

    /// Handle authentication-related URLs (patina://auth?session=xxx&exp=xxx
    /// or patina://auth/callback?code=xxx for PKCE / #access_token=... for
    /// implicit-flow magic links).
    private func handleAuthURL(_ url: URL) -> Bool {
        // A magic-link callback can arrive with either:
        //   • PKCE flow: `?code=…` in the query string
        //   • Implicit flow: `#access_token=…&refresh_token=…` in the fragment
        // GoTrue's `/verify` redirect uses the implicit form, so the
        // previous query-only gate silently dropped magic-link logins
        // when the tokens were in the fragment.
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let hasCodeQuery = components?.queryItems?.contains(where: { $0.name == "code" }) == true
        let fragment = url.fragment ?? ""
        let hasFragmentTokens = fragment.contains("access_token") || fragment.contains("refresh_token")
        let isCallbackPath = url.path.hasPrefix("/callback") || (url.host == "auth" && url.path == "/callback")

        if hasCodeQuery || hasFragmentTokens || isCallbackPath {
            Task {
                do {
                    try await AuthService.shared.handleMagicLinkURL(url)
                    // The session was set inside handleMagicLinkURL, so
                    // the phase observer will move us out of `.auth` on
                    // its own. We only mark onboarding complete here
                    // because a magic-link sign-in implies the user
                    // already went through whatever onboarding the web
                    // surface required — we don't want to drop them
                    // back into the carousel + quiz.
                    await MainActor.run {
                        AppSettings.shared.hasCompletedOnboarding = true
                    }
                } catch {
                    print("Magic link auth failed: \(error)")
                }
            }
            return true
        }

        // For QR auth deep links, handle asynchronously to wait for auth state
        // (app may be cold-launched via deep link before auth state is ready)
        Task {
            // Wait for auth state to be determined
            await AuthService.shared.waitForAuthReady()

            // If still not authenticated after auth state is ready, try getting session
            if !AuthService.shared.isAuthenticated {
                _ = await AuthService.shared.getSession()
            }

            guard AuthService.shared.isAuthenticated else {
                // QR approval requires a real session — a guest can't
                // sign anyone else in. Clear guest mode so the phase
                // observer routes the user back to the AuthScreenView.
                coordinator?.guestModeOptIn = false
                return
            }

            // Let QRAuthService handle the URL
            let handled = qrAuthService.handleDeepLink(url)

            if handled {
                // Show approval sheet
                coordinator?.showingQRScanner = true
            }
        }

        return true
    }

    // MARK: - Room URLs

    /// Handle room-related URLs (patina://room/uuid)
    private func handleRoomURL(_ url: URL) -> Bool {
        // Extract room ID from path
        guard let roomIdString = url.pathComponents.dropFirst().first,
              let roomId = UUID(uuidString: roomIdString) else {
            return false
        }

        coordinator?.navigate(to: .roomDetail(roomId: roomId))
        return true
    }

    // MARK: - Piece URLs

    /// Handle piece-related URLs (patina://piece/id)
    private func handlePieceURL(_ url: URL) -> Bool {
        guard let pieceId = url.pathComponents.dropFirst().first else {
            return false
        }

        coordinator?.navigate(to: .pieceDetail(pieceId: pieceId))
        return true
    }

    // MARK: - Path-Based URLs

    /// Handle URLs routed by path (for universal links)
    private func handlePathBasedURL(_ url: URL) -> Bool {
        let path = url.path

        if path.hasPrefix("/auth") {
            return handleAuthURL(url)
        }

        if path.hasPrefix("/room/") {
            return handleRoomURL(url)
        }

        if path.hasPrefix("/piece/") {
            return handlePieceURL(url)
        }

        return false
    }
}
