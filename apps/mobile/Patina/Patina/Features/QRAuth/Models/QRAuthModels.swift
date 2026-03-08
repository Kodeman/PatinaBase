//
//  QRAuthModels.swift
//  Patina
//
//  Data types, state, and errors for QR code authentication flow.
//  Enables the iOS app to authenticate web sessions via QR scanning.
//

import Foundation
import UIKit

// MARK: - QR Session Data

/// Parsed data from a QR code authentication URL
public struct QRAuthSession: Identifiable, Equatable {
    public let id = UUID()

    /// The session token from the QR code (64-char hex)
    public let sessionToken: String

    /// When this QR session expires
    public let expiresAt: Date

    /// Optional browser/device info extracted from URL
    public let browserInfo: BrowserInfo?

    /// Whether the session has expired
    public var isExpired: Bool {
        Date() >= expiresAt
    }

    /// Seconds remaining until expiry
    public var secondsRemaining: Int {
        max(0, Int(expiresAt.timeIntervalSinceNow))
    }

    public init(sessionToken: String, expiresAt: Date, browserInfo: BrowserInfo? = nil) {
        self.sessionToken = sessionToken
        self.expiresAt = expiresAt
        self.browserInfo = browserInfo
    }
}

/// Information about the browser/device requesting authentication
public struct BrowserInfo: Equatable, Codable {
    public let browser: String?
    public let os: String?
    public let location: String?

    public init(browser: String? = nil, os: String? = nil, location: String? = nil) {
        self.browser = browser
        self.os = os
        self.location = location
    }

    /// Display string for the browser info
    public var displayString: String {
        var parts: [String] = []
        if let browser = browser { parts.append(browser) }
        if let os = os { parts.append("on \(os)") }
        return parts.isEmpty ? "Unknown browser" : parts.joined(separator: " ")
    }
}

// MARK: - Device Info

/// Information about the authenticating device (iOS app)
public struct DeviceInfo: Codable, Equatable {
    public let deviceId: String
    public let deviceName: String
    public let platform: String
    public let osVersion: String
    public let appVersion: String

    public init(
        deviceId: String,
        deviceName: String,
        platform: String = "iOS",
        osVersion: String,
        appVersion: String
    ) {
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.platform = platform
        self.osVersion = osVersion
        self.appVersion = appVersion
    }

    /// Create DeviceInfo from current device
    public static func current() -> DeviceInfo {
        let device = UIDevice.current
        let deviceId = device.identifierForVendor?.uuidString ?? UUID().uuidString

        return DeviceInfo(
            deviceId: deviceId,
            deviceName: device.name,
            platform: "iOS",
            osVersion: device.systemVersion,
            appVersion: AppConfiguration.appVersion
        )
    }
}

// MARK: - API Request/Response

/// Request body for QR authentication verification
public struct QRAuthVerifyRequest: Codable {
    public let sessionToken: String
    public let userJwt: String
    public let deviceInfo: DeviceInfo
    public let biometricConfirmed: Bool

    public init(
        sessionToken: String,
        userJwt: String,
        deviceInfo: DeviceInfo,
        biometricConfirmed: Bool
    ) {
        self.sessionToken = sessionToken
        self.userJwt = userJwt
        self.deviceInfo = deviceInfo
        self.biometricConfirmed = biometricConfirmed
    }
}

/// Response from QR authentication verification
public struct QRAuthVerifyResponse: Codable {
    public let success: Bool
    public let message: String?
    public let error: String?

    public init(success: Bool, message: String? = nil, error: String? = nil) {
        self.success = success
        self.message = message
        self.error = error
    }
}

// MARK: - State

/// State machine for QR authentication flow
public enum QRAuthState: Equatable {
    /// No active QR session
    case idle

    /// Camera is active, scanning for QR codes
    case scanning

    /// QR code has been scanned, parsing data
    case scanned(rawValue: String)

    /// Verifying session with server
    case verifying

    /// Waiting for biometric confirmation
    case awaitingBiometric

    /// Session approved successfully
    case approved

    /// Session denied by user
    case denied

    /// QR session has expired
    case expired

    /// An error occurred
    case error(QRAuthError)

    /// Whether the state allows scanning
    public var canScan: Bool {
        switch self {
        case .idle, .scanning, .error, .expired:
            return true
        default:
            return false
        }
    }

    /// Whether the state shows the approval UI
    public var showsApproval: Bool {
        switch self {
        case .awaitingBiometric, .verifying:
            return true
        default:
            return false
        }
    }
}

// MARK: - Errors

/// Errors that can occur during QR authentication
public enum QRAuthError: LocalizedError, Equatable {
    /// QR code format is invalid
    case invalidQRFormat

    /// QR code doesn't contain the expected URL scheme
    case invalidURLScheme

    /// Session token is missing or malformed
    case invalidSessionToken

    /// Expiration timestamp is missing or invalid
    case invalidExpiration

    /// The QR session has expired
    case sessionExpired

    /// User is not authenticated in the app
    case userNotAuthenticated

    /// Biometric authentication failed
    case biometricFailed(reason: String)

    /// Biometric authentication not available
    case biometricUnavailable

    /// Network request failed
    case networkError(message: String)

    /// Server rejected the verification
    case serverRejected(message: String)

    /// Camera access denied
    case cameraAccessDenied

    /// Unknown error
    case unknown(message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidQRFormat:
            return "This QR code isn't valid for Patina authentication."
        case .invalidURLScheme:
            return "This QR code isn't from Patina."
        case .invalidSessionToken:
            return "The session token is invalid."
        case .invalidExpiration:
            return "The QR code has an invalid expiration."
        case .sessionExpired:
            return "This QR code has expired. Please refresh and try again."
        case .userNotAuthenticated:
            return "Please sign in to the Patina app first."
        case .biometricFailed(let reason):
            return "Authentication failed: \(reason)"
        case .biometricUnavailable:
            return "Face ID or Touch ID is not available on this device."
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverRejected(let message):
            return "Server error: \(message)"
        case .cameraAccessDenied:
            return "Camera access is required to scan QR codes."
        case .unknown(let message):
            return "An error occurred: \(message)"
        }
    }

    public var recoverySuggestion: String? {
        switch self {
        case .sessionExpired:
            return "Open the Patina website and generate a new QR code."
        case .userNotAuthenticated:
            return "Sign in to your Patina account, then try scanning again."
        case .biometricFailed:
            return "Try again or use your device passcode."
        case .biometricUnavailable:
            return "Enable Face ID or Touch ID in your device settings."
        case .networkError:
            return "Check your internet connection and try again."
        case .cameraAccessDenied:
            return "Go to Settings > Patina and enable Camera access."
        default:
            return nil
        }
    }

    /// SF Symbol name for this error
    public var iconName: String {
        switch self {
        case .sessionExpired:
            return "clock.badge.exclamationmark"
        case .userNotAuthenticated:
            return "person.crop.circle.badge.exclamationmark"
        case .biometricFailed, .biometricUnavailable:
            return "faceid"
        case .networkError:
            return "wifi.exclamationmark"
        case .cameraAccessDenied:
            return "camera.fill"
        default:
            return "exclamationmark.triangle"
        }
    }
}

// MARK: - QR Code Parsing

extension QRAuthSession {
    /// Parse a QR code URL string into a QRAuthSession
    /// Expected format: patina://auth?session=<64-char-hex>&exp=<unix-timestamp>
    public static func parse(from urlString: String) -> Result<QRAuthSession, QRAuthError> {
        // Parse URL
        guard let url = URL(string: urlString) else {
            return .failure(.invalidQRFormat)
        }

        // Validate scheme
        guard url.scheme == APIConfiguration.appURLScheme else {
            return .failure(.invalidURLScheme)
        }

        // Validate host/path is "auth"
        guard url.host == "auth" || url.path == "/auth" else {
            return .failure(.invalidQRFormat)
        }

        // Parse query parameters
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return .failure(.invalidQRFormat)
        }

        // Extract session token
        guard let sessionToken = queryItems.first(where: { $0.name == "session" })?.value,
              !sessionToken.isEmpty else {
            return .failure(.invalidSessionToken)
        }

        // Validate session token format (64 hex characters)
        let hexPattern = "^[a-fA-F0-9]{64}$"
        guard sessionToken.range(of: hexPattern, options: .regularExpression) != nil else {
            return .failure(.invalidSessionToken)
        }

        // Extract and parse expiration
        guard let expString = queryItems.first(where: { $0.name == "exp" })?.value,
              let expTimestamp = TimeInterval(expString) else {
            return .failure(.invalidExpiration)
        }

        let expiresAt = Date(timeIntervalSince1970: expTimestamp)

        // Check if already expired
        if Date() >= expiresAt {
            return .failure(.sessionExpired)
        }

        // Parse optional browser info
        var browserInfo: BrowserInfo?
        if let browser = queryItems.first(where: { $0.name == "browser" })?.value,
           let os = queryItems.first(where: { $0.name == "os" })?.value {
            browserInfo = BrowserInfo(
                browser: browser,
                os: os,
                location: queryItems.first(where: { $0.name == "loc" })?.value
            )
        }

        return .success(QRAuthSession(
            sessionToken: sessionToken,
            expiresAt: expiresAt,
            browserInfo: browserInfo
        ))
    }
}
