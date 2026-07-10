//  PortalLogin.swift
//  CaptureKit
//
//  The web→app QR sign-in handoff. A signed-in designer portal shows a QR /
//  deep link `field://login?v=1&th=<token_hash>`, where `token_hash` is a GoTrue
//  magic-link *hashed* token for the designer's email. Patina Field scans it (or
//  the iOS Camera app deep-links it) and exchanges the hash for a session via
//  `verifyOTP(tokenHash:type:.magiclink)`.
//
//  This file is the SDK-free, SwiftUI-free half: parsing the payload (with the
//  version + token rules) and the pure state machine that decides what to do
//  given the current session. Both unit-test in the CaptureKit-only bundle. The
//  exchange + UI live app-side (behind `WorkspaceAuthorizing`, in the deep-link
//  controller and O2's scanner sheet).

import Foundation

/// A parsed `field://login?v=1&th=<token_hash>` payload — the only thing the app
/// needs from the QR / deep link to run the exchange.
public struct PortalLoginToken: Equatable, Sendable {
    /// The GoTrue magic-link **hashed** token (`th`) handed to
    /// `verifyOTP(tokenHash:)`. Opaque — it carries no recoverable identity, so
    /// the app can't know *which* account it targets until the exchange runs.
    public let tokenHash: String

    public init(tokenHash: String) { self.tokenHash = tokenHash }

    /// The custom scheme the portal encodes (== `AppConfiguration.urlScheme`).
    public static let scheme = "field"
    /// The deep-link host that carries a portal login.
    public static let host = "login"
    /// The only payload version this build understands. The `v` param lets the
    /// portal evolve the contract without silently mis-driving an old app.
    public static let supportedVersion = 1

    public enum ParseError: Error, Equatable, LocalizedError {
        /// Wrong scheme/host — not a portal-login link at all (e.g. a random QR).
        case notALoginLink
        /// No `v` query item.
        case missingVersion
        /// `v` present but not the supported version (carries the raw value).
        case unsupportedVersion(String)
        /// No `th` (or empty) — nothing to exchange.
        case missingToken

        public var errorDescription: String? {
            switch self {
            case .notALoginLink:            return "That code isn’t a Patina sign-in link."
            case .missingVersion:           return "That sign-in link is missing its version."
            case .unsupportedVersion:       return "That sign-in link needs a newer version of Patina Field."
            case .missingToken:             return "That sign-in link is missing its token."
            }
        }
    }

    /// Parse a full `field://login?v=1&th=…` URL. Rejects a wrong scheme/host, a
    /// missing or non-matching version, and a missing/empty token.
    public static func parse(url: URL) throws -> PortalLoginToken {
        guard url.scheme == scheme, url.host == host else { throw ParseError.notALoginLink }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value
        }
        guard let rawVersion = value("v"), !rawVersion.isEmpty else { throw ParseError.missingVersion }
        guard Int(rawVersion) == supportedVersion else { throw ParseError.unsupportedVersion(rawVersion) }
        guard let token = value("th"), !token.isEmpty else { throw ParseError.missingToken }
        return PortalLoginToken(tokenHash: token)
    }

    /// Parse a raw scanned string. QR payloads arrive as strings; this is the
    /// convenience the scanner surfaces call.
    public static func parse(payload: String) throws -> PortalLoginToken {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed) else { throw ParseError.notALoginLink }
        return try parse(url: url)
    }

    /// The canonical wire form — the exact string the portal encodes into the QR.
    /// Kept here so both halves of the contract share one definition.
    public func urlString() -> String {
        "\(Self.scheme)://\(Self.host)?v=\(Self.supportedVersion)&th=\(tokenHash)"
    }
}

// MARK: - Sign-in state machine

/// Who (if anyone) is signed in when a portal-login token arrives.
public enum PortalLoginState: Equatable, Sendable {
    /// No session — the token can be exchanged straight away.
    case signedOut
    /// A session exists; `userID` identifies the current account.
    case signedIn(userID: String, email: String?)
}

/// What the app should do with an incoming token, given the current session and
/// (when known) the account the token resolves to.
public enum PortalLoginResolution: Equatable, Sendable {
    /// Nobody is signed in → run the exchange with no prompt.
    case signIn
    /// The token targets the already-signed-in account → a friendly no-op.
    case alreadySignedIn(email: String?)
    /// A *different* (or as-yet-unknown) account is signed in → confirm before
    /// replacing their live session. `currentEmail` names who's signed in now.
    case confirmSwitch(currentEmail: String?)
}

public enum PortalLogin {
    /// Decide what to do with an incoming portal-login token.
    ///
    /// `target` is the account the token resolves to, *when known*. Pre-exchange
    /// it is `nil` — the hashed token carries no recoverable identity, so a
    /// signed-in device must confirm before switching (it can't prove the code
    /// is its own). Post-exchange (or if the portal ever adds an identity hint)
    /// a matching `target` collapses to the `alreadySignedIn` no-op.
    public static func resolve(state: PortalLoginState, target: String? = nil) -> PortalLoginResolution {
        switch state {
        case .signedOut:
            return .signIn
        case let .signedIn(userID, email):
            if let target, target == userID { return .alreadySignedIn(email: email) }
            return .confirmSwitch(currentEmail: email)
        }
    }
}
