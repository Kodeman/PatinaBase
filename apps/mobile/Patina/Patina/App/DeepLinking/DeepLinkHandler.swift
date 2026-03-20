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

    // MARK: - Initialization

    private init() {}

    // MARK: - Configuration

    /// Configure the handler with the app coordinator
    /// - Parameter coordinator: The app coordinator for navigation
    public func configure(coordinator: AppCoordinator) {
        self.coordinator = coordinator
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

    /// Handle authentication-related URLs (patina://auth?session=xxx&exp=xxx or patina://auth/callback?code=xxx)
    private func handleAuthURL(_ url: URL) -> Bool {
        // Check for magic link callback (has code parameter)
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           components.queryItems?.contains(where: { $0.name == "code" }) == true {
            // This is a magic link callback
            Task {
                do {
                    try await AuthService.shared.handleMagicLinkURL(url)
                    // Dismiss any auth sheet and navigate to main app
                    await MainActor.run {
                        coordinator?.showingAuth = false
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
                // Navigate to auth first
                coordinator?.navigate(to: .authentication)
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
