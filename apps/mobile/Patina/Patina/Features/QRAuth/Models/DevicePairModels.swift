//
//  DevicePairModels.swift
//  Patina
//
//  Models for the device-pair sign-in flow. Inverse of QRAuthSession:
//  here a fresh (signed-out) iOS device scans a QR shown on a portal that
//  is already signed in, and exchanges the nonce for a Supabase session.
//

import Foundation

// MARK: - Pair Session

/// Parsed data from a `patina://pair?nonce=<hex>&exp=<unix>` URL.
public struct DevicePairSession: Identifiable, Equatable {
    public let id = UUID()

    /// 64-char hex nonce minted by the portal.
    public let nonce: String

    /// When the nonce expires.
    public let expiresAt: Date

    public var isExpired: Bool {
        Date() >= expiresAt
    }

    public init(nonce: String, expiresAt: Date) {
        self.nonce = nonce
        self.expiresAt = expiresAt
    }

    /// Parse a `patina://pair?nonce=…&exp=…` URL.
    public static func parse(from urlString: String) -> Result<DevicePairSession, QRAuthError> {
        guard let url = URL(string: urlString) else {
            return .failure(.invalidQRFormat)
        }
        guard url.scheme == APIConfiguration.appURLScheme else {
            return .failure(.invalidURLScheme)
        }
        guard url.host == "pair" || url.path == "/pair" else {
            return .failure(.invalidQRFormat)
        }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return .failure(.invalidQRFormat)
        }
        guard let nonce = queryItems.first(where: { $0.name == "nonce" })?.value,
              !nonce.isEmpty else {
            return .failure(.invalidSessionToken)
        }
        let hexPattern = "^[a-fA-F0-9]{64}$"
        guard nonce.range(of: hexPattern, options: .regularExpression) != nil else {
            return .failure(.invalidSessionToken)
        }
        guard let expString = queryItems.first(where: { $0.name == "exp" })?.value,
              let expTimestamp = TimeInterval(expString) else {
            return .failure(.invalidExpiration)
        }
        let expiresAt = Date(timeIntervalSince1970: expTimestamp)
        if Date() >= expiresAt {
            return .failure(.sessionExpired)
        }
        return .success(DevicePairSession(nonce: nonce, expiresAt: expiresAt))
    }

    /// Whether a raw scanned string is shaped like a pair URL (cheap check
    /// without full parsing — used by the scanner to route between the
    /// `patina://auth` (existing) and `patina://pair` (new) flows).
    public static func looksLikePairURL(_ raw: String) -> Bool {
        guard let url = URL(string: raw) else { return false }
        guard url.scheme == APIConfiguration.appURLScheme else { return false }
        return url.host == "pair" || url.path == "/pair"
    }
}

// MARK: - Exchange Request/Response

public struct DevicePairExchangeRequest: Codable {
    public let nonce: String
    public let deviceInfo: DeviceInfo

    public init(nonce: String, deviceInfo: DeviceInfo) {
        self.nonce = nonce
        self.deviceInfo = deviceInfo
    }
}

public struct DevicePairExchangeResponse: Codable {
    public let tokenHash: String
    public let type: String
    public let email: String

    enum CodingKeys: String, CodingKey {
        case tokenHash
        case type
        case email
    }
}
