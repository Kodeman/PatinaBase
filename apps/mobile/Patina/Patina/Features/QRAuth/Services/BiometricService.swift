//
//  BiometricService.swift
//  Patina
//
//  Wrapper service for LocalAuthentication framework.
//  Provides Face ID / Touch ID authentication for QR session approval.
//

import Foundation
import LocalAuthentication

/// Service for biometric authentication (Face ID / Touch ID)
@MainActor
public final class BiometricService {
    public static let shared = BiometricService()

    // MARK: - Types

    /// The type of biometric authentication available
    public enum BiometricType {
        case none
        case touchID
        case faceID
        case opticID // Vision Pro

        /// Human-readable name
        public var displayName: String {
            switch self {
            case .none: return "Passcode"
            case .touchID: return "Touch ID"
            case .faceID: return "Face ID"
            case .opticID: return "Optic ID"
            }
        }

        /// SF Symbol icon name
        public var iconName: String {
            switch self {
            case .none: return "lock.fill"
            case .touchID: return "touchid"
            case .faceID: return "faceid"
            case .opticID: return "opticid"
            }
        }

        /// Short action verb
        public var actionVerb: String {
            switch self {
            case .none: return "Enter passcode"
            case .touchID: return "Touch to confirm"
            case .faceID: return "Look to confirm"
            case .opticID: return "Look to confirm"
            }
        }
    }

    /// Result of biometric authentication
    public enum AuthResult: Equatable {
        case success
        case cancelled
        case failed(reason: String)
        case unavailable(reason: String)
    }

    // MARK: - State

    /// Whether biometric authentication is available
    public private(set) var isAvailable: Bool = false

    /// The type of biometric available on this device
    public private(set) var biometricType: BiometricType = .none

    /// Human-readable reason for unavailability
    public private(set) var unavailabilityReason: String?

    // MARK: - Private

    private let context = LAContext()

    // MARK: - Initialization

    private init() {
        checkAvailability()
    }

    // MARK: - Public Methods

    /// Check and update biometric availability
    public func checkAvailability() {
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)

        isAvailable = available
        biometricType = mapBiometricType(context.biometryType)

        if !available {
            unavailabilityReason = mapUnavailabilityReason(error)
        } else {
            unavailabilityReason = nil
        }
    }

    /// Authenticate using biometrics
    /// - Parameter reason: The reason shown to the user
    /// - Returns: Authentication result
    public func authenticate(reason: String) async -> AuthResult {
        // Use a fresh context for each authentication
        let authContext = LAContext()
        authContext.localizedCancelTitle = "Cancel"
        authContext.localizedFallbackTitle = "Use Passcode"

        var error: NSError?
        guard authContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            // Try fallback to passcode if biometrics unavailable
            return await authenticateWithPasscode(context: authContext, reason: reason)
        }

        do {
            let success = try await authContext.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )

            if success {
                return .success
            } else {
                return .failed(reason: "Authentication was not successful")
            }
        } catch let authError as LAError {
            return mapAuthError(authError)
        } catch {
            return .failed(reason: error.localizedDescription)
        }
    }

    /// Authenticate using passcode fallback (when biometrics fail or unavailable)
    public func authenticateWithPasscode(context authContext: LAContext? = nil, reason: String) async -> AuthResult {
        let ctx = authContext ?? LAContext()

        var error: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            return .unavailable(reason: "Device authentication is not available")
        }

        do {
            let success = try await ctx.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: reason
            )

            if success {
                return .success
            } else {
                return .failed(reason: "Authentication was not successful")
            }
        } catch let authError as LAError {
            return mapAuthError(authError)
        } catch {
            return .failed(reason: error.localizedDescription)
        }
    }

    // MARK: - Private Helpers

    private func mapBiometricType(_ type: LABiometryType) -> BiometricType {
        switch type {
        case .none:
            return .none
        case .touchID:
            return .touchID
        case .faceID:
            return .faceID
        case .opticID:
            return .opticID
        @unknown default:
            return .none
        }
    }

    private func mapUnavailabilityReason(_ error: NSError?) -> String {
        guard let error = error as? LAError else {
            return "Biometric authentication is not available"
        }

        switch error.code {
        case .biometryNotAvailable:
            return "Face ID/Touch ID is not available on this device"
        case .biometryNotEnrolled:
            return "Face ID/Touch ID is not set up. Go to Settings to set it up."
        case .biometryLockout:
            return "Face ID/Touch ID is locked. Use your passcode to unlock."
        default:
            return "Biometric authentication is not available"
        }
    }

    private func mapAuthError(_ error: LAError) -> AuthResult {
        switch error.code {
        case .userCancel, .appCancel, .systemCancel:
            return .cancelled
        case .userFallback:
            // User tapped "Use Passcode" - handled by evaluatePolicy internally
            return .cancelled
        case .biometryNotAvailable:
            return .unavailable(reason: "Face ID/Touch ID is not available")
        case .biometryNotEnrolled:
            return .unavailable(reason: "Face ID/Touch ID is not set up")
        case .biometryLockout:
            return .unavailable(reason: "Face ID/Touch ID is locked due to too many failed attempts")
        case .authenticationFailed:
            return .failed(reason: "Authentication did not succeed")
        case .passcodeNotSet:
            return .unavailable(reason: "A passcode is not set on this device")
        default:
            return .failed(reason: error.localizedDescription)
        }
    }
}
