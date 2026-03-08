//
//  QRAuthService.swift
//  Patina
//
//  Core service for QR code authentication flow.
//  Handles QR parsing, biometric confirmation, and server verification.
//

import Foundation
import UIKit
import Supabase

/// Service managing QR code authentication workflow
@Observable
@MainActor
public final class QRAuthService {
    public static let shared = QRAuthService()

    // MARK: - State

    /// Current state of the QR auth flow
    public private(set) var state: QRAuthState = .idle

    /// Currently parsed QR session (if any)
    public private(set) var currentSession: QRAuthSession?

    /// Loading indicator for network operations
    public private(set) var isLoading = false

    /// Last error message for display
    public private(set) var lastErrorMessage: String?

    // MARK: - Dependencies

    private let biometricService = BiometricService.shared
    private let authService = AuthService.shared

    // MARK: - Configuration

    /// API endpoint for QR verification (hosted on the portal, not Supabase Kong)
    private var verifyEndpoint: URL {
        APIConfiguration.portalURL.appendingPathComponent("api/auth/qr/verify")
    }

    // MARK: - Initialization

    private init() {}

    // MARK: - QR Code Handling

    /// Parse a QR code string and update state
    /// - Parameter qrCode: The raw QR code string scanned
    /// - Returns: Success or failure with error
    @discardableResult
    public func handleScannedCode(_ qrCode: String) -> Result<QRAuthSession, QRAuthError> {
        state = .scanned(rawValue: qrCode)
        lastErrorMessage = nil

        let parseResult = QRAuthSession.parse(from: qrCode)

        switch parseResult {
        case .success(let session):
            currentSession = session
            state = .awaitingBiometric
            HapticManager.shared.notification(.success)
            return .success(session)

        case .failure(let error):
            currentSession = nil
            state = .error(error)
            lastErrorMessage = error.errorDescription
            HapticManager.shared.notification(.error)
            return .failure(error)
        }
    }

    /// Handle a deep link URL (when app is opened via QR)
    /// - Parameter url: The incoming URL
    /// - Returns: Whether the URL was handled
    @discardableResult
    public func handleDeepLink(_ url: URL) -> Bool {
        guard url.scheme == APIConfiguration.appURLScheme,
              url.host == "auth" || url.path == "/auth" else {
            return false
        }

        let result = handleScannedCode(url.absoluteString)
        return result.isSuccess
    }

    // MARK: - Session Actions

    /// Approve the current session with biometric confirmation
    public func approveSession() async {
        guard let session = currentSession else {
            state = .error(.invalidSessionToken)
            return
        }

        // Check if session expired while waiting
        if session.isExpired {
            state = .expired
            lastErrorMessage = QRAuthError.sessionExpired.errorDescription
            return
        }

        // Check if user is authenticated
        guard authService.isAuthenticated else {
            state = .error(.userNotAuthenticated)
            lastErrorMessage = QRAuthError.userNotAuthenticated.errorDescription
            return
        }

        // Perform biometric authentication
        state = .awaitingBiometric
        let biometricResult = await biometricService.authenticate(
            reason: "Confirm sign-in to Patina web"
        )

        switch biometricResult {
        case .success:
            await verifyWithServer(session: session, biometricConfirmed: true)

        case .cancelled:
            // User cancelled - stay in awaitingBiometric state
            state = .awaitingBiometric

        case .failed(let reason):
            state = .error(.biometricFailed(reason: reason))
            lastErrorMessage = "Authentication failed: \(reason)"
            HapticManager.shared.notification(.error)

        case .unavailable(let reason):
            // Try without biometric if unavailable
            state = .error(.biometricUnavailable)
            lastErrorMessage = reason
            HapticManager.shared.notification(.warning)
        }
    }

    /// Deny the current session and reset
    public func denySession() {
        currentSession = nil
        state = .denied
        HapticManager.shared.notification(.warning)

        // Auto-reset after a moment
        Task {
            try? await Task.sleep(for: .seconds(2))
            reset()
        }
    }

    /// Reset the service to idle state
    public func reset() {
        currentSession = nil
        state = .idle
        isLoading = false
        lastErrorMessage = nil
    }

    /// Start scanning mode
    public func startScanning() {
        state = .scanning
        lastErrorMessage = nil
    }

    // MARK: - Server Verification

    /// Verify the session with the server
    private func verifyWithServer(session: QRAuthSession, biometricConfirmed: Bool) async {
        state = .verifying
        isLoading = true

        do {
            // Get current access token
            guard let accessToken = try? await supabase.auth.session.accessToken else {
                throw QRAuthError.userNotAuthenticated
            }

            // Build request
            let request = QRAuthVerifyRequest(
                sessionToken: session.sessionToken,
                userJwt: accessToken,
                deviceInfo: DeviceInfo.current(),
                biometricConfirmed: biometricConfirmed
            )

            // Make API call
            let response = try await performVerification(request: request)

            if response.success {
                state = .approved
                HapticManager.shared.notification(.success)

                // Auto-reset after success
                Task {
                    try? await Task.sleep(for: .seconds(3))
                    reset()
                }
            } else {
                let message = response.error ?? response.message ?? "Server rejected the request"
                state = .error(.serverRejected(message: message))
                lastErrorMessage = message
                HapticManager.shared.notification(.error)
            }
        } catch let error as QRAuthError {
            state = .error(error)
            lastErrorMessage = error.errorDescription
            HapticManager.shared.notification(.error)
        } catch {
            state = .error(.networkError(message: error.localizedDescription))
            lastErrorMessage = error.localizedDescription
            HapticManager.shared.notification(.error)
        }

        isLoading = false
    }

    /// Perform the HTTP request to verify the session
    private func performVerification(request: QRAuthVerifyRequest) async throws -> QRAuthVerifyResponse {
        var urlRequest = URLRequest(url: verifyEndpoint)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(request.userJwt)", forHTTPHeaderField: "Authorization")
        urlRequest.timeoutInterval = APIConfiguration.requestTimeout

        let encoder = JSONEncoder()
        urlRequest.httpBody = try encoder.encode(request)

        let (data, response) = try await URLSession.shared.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw QRAuthError.networkError(message: "Invalid response")
        }

        guard httpResponse.statusCode == 200 else {
            // Try to parse error message from response
            if let errorResponse = try? JSONDecoder().decode(QRAuthVerifyResponse.self, from: data) {
                throw QRAuthError.serverRejected(message: errorResponse.error ?? "Request failed")
            }
            throw QRAuthError.serverRejected(message: "Server returned status \(httpResponse.statusCode)")
        }

        let decoder = JSONDecoder()
        return try decoder.decode(QRAuthVerifyResponse.self, from: data)
    }
}

// MARK: - Result Extension

extension Result {
    var isSuccess: Bool {
        if case .success = self { return true }
        return false
    }
}
