//
//  QRApprovalViewModel.swift
//  Patina
//
//  ViewModel for QR authentication approval screen.
//  Manages expiry countdown and approval flow.
//

import Foundation
import Combine

/// ViewModel for QR approval screen
@Observable
@MainActor
public final class QRApprovalViewModel {

    // MARK: - State

    /// Seconds remaining until session expires
    public private(set) var secondsRemaining: Int = 0

    /// Whether expiry is imminent (< 30 seconds)
    public var isExpiryWarning: Bool {
        secondsRemaining <= 30 && secondsRemaining > 0
    }

    /// Whether the session has expired
    public var isExpired: Bool {
        secondsRemaining <= 0
    }

    /// The biometric type available
    public var biometricType: BiometricService.BiometricType {
        biometricService.biometricType
    }

    /// Current auth state
    public var authState: QRAuthState {
        qrAuthService.state
    }

    /// Whether approval is in progress
    public var isApproving: Bool {
        qrAuthService.isLoading
    }

    /// Error message to display
    public var errorMessage: String? {
        qrAuthService.lastErrorMessage
    }

    /// The current session being approved
    public var session: QRAuthSession? {
        qrAuthService.currentSession
    }

    // MARK: - Dependencies

    private let qrAuthService = QRAuthService.shared
    private let biometricService = BiometricService.shared
    private var countdownTimer: Timer?

    // MARK: - Initialization

    public init() {
        startCountdown()
    }

    /// Clean up timer when view is dismissed
    public func cleanup() {
        countdownTimer?.invalidate()
        countdownTimer = nil
    }

    // MARK: - Countdown

    private func startCountdown() {
        updateSecondsRemaining()

        // Create timer on main run loop
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateSecondsRemaining()
            }
        }
    }

    private func updateSecondsRemaining() {
        guard let session = qrAuthService.currentSession else {
            secondsRemaining = 0
            return
        }

        secondsRemaining = session.secondsRemaining

        // Auto-transition to expired state
        if secondsRemaining <= 0 {
            countdownTimer?.invalidate()
            countdownTimer = nil
        }
    }

    // MARK: - Actions

    /// Approve the session with biometric confirmation
    public func approve() async {
        await qrAuthService.approveSession()
    }

    /// Deny the session
    public func deny() {
        qrAuthService.denySession()
    }

    /// Reset and dismiss
    public func reset() {
        cleanup()
        qrAuthService.reset()
    }

    // MARK: - Formatting

    /// Format seconds as MM:SS
    public func formatTime(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}
