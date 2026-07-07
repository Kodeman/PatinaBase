//  PortalAuthApprovalService.swift
//  CaptureKit
//
//  Q1/Q2 seam — approve (or reject) a web portal login by scanning its QR code.
//  PURE Foundation (no SDK): the app's concrete mirrors the reference
//  `Features/QRAuth/` (`QRAuthSession.parse` + the verify request), doing the
//  biometric gate and the network verify; the mock parses a fixture payload and
//  no-ops approve/reject. Wave Q builds the scan + approval screens against this.
//
//  DTO shaping (from QRAuthModels):
//  QR payload format is `patina://auth?session=<64-hex>&exp=<unix>&browser=&os=&loc=`.
//  `nonce` ← the 64-hex session token, `expiresAt` ← the `exp` unix timestamp,
//  `browserLabel` ← BrowserInfo.displayString, `portalHost` ← the requesting host.

import Foundation

/// A parsed portal-login request awaiting the user's approval (Q2).
public struct FieldPortalAuthRequest: Identifiable, Sendable, Codable {
    /// The QR session token (64-char hex) — also the stable identity.
    public let nonce: String
    /// The portal host the login is for (e.g. "app.patina.cloud").
    public let portalHost: String
    public let expiresAt: Date
    /// Human label for the requesting browser/OS/location, when present.
    public let browserLabel: String?

    public var id: String { nonce }

    /// True once `expiresAt` has passed.
    public var isExpired: Bool { Date() >= expiresAt }

    public init(nonce: String, portalHost: String, expiresAt: Date, browserLabel: String? = nil) {
        self.nonce = nonce
        self.portalHost = portalHost
        self.expiresAt = expiresAt
        self.browserLabel = browserLabel
    }
}

public protocol PortalAuthApprovalService: Sendable {
    /// Parse a scanned QR payload into a request (throws on a malformed/expired code).
    func parse(qrPayload: String) throws -> FieldPortalAuthRequest
    /// Approve the login (biometric-gated in the concrete).
    func approve(_ request: FieldPortalAuthRequest) async throws
    /// Reject/deny the login.
    func reject(_ request: FieldPortalAuthRequest) async throws
}
