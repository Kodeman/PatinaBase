//  SupabasePortalAuthApprovalService.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Real PortalAuthApprovalService. Parses the designer portal's sign-in QR
//  (`patina://auth?session=<64-hex>&exp=<unix>&browser=&os=`, minted by
//  designer-portal `POST/GET /api/auth/qr/generate` — see
//  supabase/migrations/00033_qr_auth_sessions.sql), gates approval behind
//  Face ID / Touch ID (falling back to the device passcode), then calls the
//  portal's `POST /api/auth/qr/verify` with the signed-in designer's Supabase
//  JWT. There is no PostgREST/RLS involved in approve/reject — this is a
//  bespoke Next.js JSON endpoint that validates the JWT itself
//  (`supabase.auth.getUser(userJwt)` server-side) and flips the session row,
//  so unlike the other Work services there is no `CodingKeys` ↔ column
//  mapping here — the wire shape below mirrors the route's TS request body
//  1:1 (apps/designer-portal/src/app/api/auth/qr/verify/route.ts).
//
//  Ported (read-only) from the reference
//  apps/mobile/Patina/Patina/Features/QRAuth/Services/QRAuthService.swift +
//  BiometricService.swift — same parse rules, same header shape, same
//  biometric fallback posture — rebuilt on plain Foundation/URLSession
//  because Field has no equivalent of the reference's portal-URL request
//  helper for bespoke (non-PostgREST) JSON endpoints.

import Foundation
import LocalAuthentication
import Supabase
import CaptureKit
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Portal endpoint

/// The designer portal's public base URL. Field's `AppConfiguration` is
/// frozen for this wave (App/Configuration/**), so this lives here as a
/// local constant — it belongs in `AppConfiguration` once a portal seam is
/// needed by more than one flow.
enum QRApprovePortal {
    static let baseURL = URL(string: "https://app.patina.cloud")!
    static let verifyURL = URL(string: "https://app.patina.cloud/api/auth/qr/verify")!
}

// MARK: - Errors

enum FieldPortalAuthError: LocalizedError, Equatable {
    /// Not a URL, or missing the `session`/`exp` query items.
    case malformedPayload
    /// Parsed fine but isn't a `patina://auth` link (e.g. some other QR/barcode).
    case wrongScheme
    /// `exp` has already passed (checked at parse time and again at approve time).
    case expired
    /// No authenticated Field session to vouch for.
    case notSignedIn
    case biometricCancelled
    case biometricFailed(String)
    case biometricUnavailable(String)
    case server(message: String, statusCode: Int?)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .malformedPayload: return "That code isn't a Patina sign-in request."
        case .wrongScheme: return "That code isn't from Patina."
        case .expired: return "This sign-in request has expired. Refresh the code on the web and scan again."
        case .notSignedIn: return "Sign in to Field first, then try again."
        case .biometricCancelled: return "Approval cancelled."
        case .biometricFailed(let reason): return "Face ID didn't confirm it was you: \(reason)"
        case .biometricUnavailable(let reason): return reason
        case .server(let message, _): return message
        case .network(let message): return "Network error: \(message)"
        }
    }
}

// MARK: - Wire DTOs (bespoke Next.js JSON body — property names are literal,
// matching `VerifyRequestBody`/response shape in the route handler, not a
// PostgREST row, so no snake_case `CodingKeys` translation applies here).

private struct VerifyDeviceInfo: Encodable {
    let deviceId: String
    let deviceName: String
    let platform: String
    let osVersion: String
}

private struct VerifyRequestBody: Encodable {
    let sessionToken: String
    let userJwt: String
    let deviceInfo: VerifyDeviceInfo
    let biometricConfirmed: Bool
}

private struct VerifyResponseBody: Decodable {
    let success: Bool
    let message: String?
    let error: String?
}

// MARK: - Service

/// Mirrors `LocalCaptureSyncService`'s shape: a plain `final class` Sendable
/// conformer that stores the shared `SupabaseClient` handle + `SessionProviding`
/// it was handed (no actor isolation needed — `parse` is pure, `approve`/
/// `reject` do their own async work per call with no shared mutable state).
final class SupabasePortalAuthApprovalService: PortalAuthApprovalService {
    private let client: SupabaseClient
    private let session: any SessionProviding
    private let urlSession: URLSession

    init(client: SupabaseClient, session: any SessionProviding, urlSession: URLSession = .shared) {
        self.client = client
        self.session = session
        self.urlSession = urlSession
    }

    // MARK: parse

    /// `patina://auth?session=<64-hex>&exp=<unix>&browser=&os=&loc=` — `loc`
    /// is accepted (the reference client parses it) but the real portal's
    /// `/api/auth/qr/generate` never emits it today; `browser`/`os` always do.
    func parse(qrPayload: String) throws -> FieldPortalAuthRequest {
        guard let url = URL(string: qrPayload) else { throw FieldPortalAuthError.malformedPayload }
        guard url.scheme == "patina" else { throw FieldPortalAuthError.wrongScheme }
        guard url.host == "auth" || url.path == "/auth" else { throw FieldPortalAuthError.malformedPayload }
        guard let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else {
            throw FieldPortalAuthError.malformedPayload
        }
        guard let nonce = items.first(where: { $0.name == "session" })?.value, !nonce.isEmpty,
              nonce.range(of: "^[a-fA-F0-9]{64}$", options: .regularExpression) != nil else {
            throw FieldPortalAuthError.malformedPayload
        }
        guard let expString = items.first(where: { $0.name == "exp" })?.value,
              let expTimestamp = TimeInterval(expString) else {
            throw FieldPortalAuthError.malformedPayload
        }
        let expiresAt = Date(timeIntervalSince1970: expTimestamp)
        if Date() >= expiresAt { throw FieldPortalAuthError.expired }

        let browser = items.first(where: { $0.name == "browser" })?.value
        let os = items.first(where: { $0.name == "os" })?.value
        var labelParts: [String] = []
        if let browser, !browser.isEmpty { labelParts.append(browser) }
        if let os, !os.isEmpty { labelParts.append("on \(os)") }

        return FieldPortalAuthRequest(
            nonce: nonce,
            portalHost: QRApprovePortal.baseURL.host ?? "app.patina.cloud",
            expiresAt: expiresAt,
            browserLabel: labelParts.isEmpty ? nil : labelParts.joined(separator: " ")
        )
    }

    // MARK: approve

    func approve(_ request: FieldPortalAuthRequest) async throws {
        guard !request.isExpired else { throw FieldPortalAuthError.expired }
        guard await session.isAuthenticated else { throw FieldPortalAuthError.notSignedIn }

        try await gateWithBiometrics(reason: "Confirm sign-in to Patina web")

        let accessToken: String
        do {
            accessToken = try await client.auth.session.accessToken
        } catch {
            throw FieldPortalAuthError.notSignedIn
        }

        try await verify(request: request, userJwt: accessToken)
    }

    // MARK: reject

    /// The `qr_auth_sessions` status enum has a `denied` value, but
    /// designer-portal exposes no `/api/auth/qr/deny` (or equivalent) route —
    /// only generate/status/verify exist under `api/auth/qr/`. The reference
    /// app's `QRAuthService.denySession()` is likewise local-only: it resets
    /// client state and never calls the network. We mirror that exactly: the
    /// portal's 5-minute session TTL (`QR_SESSION_TTL_MS`) self-expires the
    /// row server-side, and `/api/auth/qr/status` keeps reporting "pending"
    /// to the browser in the meantime. Nothing to await here today; kept
    /// `async throws` to match the protocol and stay a drop-in once a real
    /// deny endpoint exists.
    func reject(_ request: FieldPortalAuthRequest) async throws {}

    // MARK: - Biometrics

    private func gateWithBiometrics(reason: String) async throws {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        context.localizedFallbackTitle = "Use Passcode"

        var biometricError: NSError?
        let policy: LAPolicy
        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometricError) {
            policy = .deviceOwnerAuthenticationWithBiometrics
        } else {
            policy = .deviceOwnerAuthentication // falls back to the device passcode
        }

        var policyError: NSError?
        guard context.canEvaluatePolicy(policy, error: &policyError) else {
            throw FieldPortalAuthError.biometricUnavailable(
                policyError?.localizedDescription ?? "Device authentication isn't set up on this device."
            )
        }

        do {
            let confirmed = try await context.evaluatePolicy(policy, localizedReason: reason)
            guard confirmed else {
                throw FieldPortalAuthError.biometricFailed("Authentication was not successful")
            }
        } catch let error as FieldPortalAuthError {
            throw error
        } catch let error as LAError {
            switch error.code {
            case .userCancel, .appCancel, .systemCancel, .userFallback:
                throw FieldPortalAuthError.biometricCancelled
            default:
                throw FieldPortalAuthError.biometricFailed(error.localizedDescription)
            }
        }
    }

    // MARK: - Network

    private func verify(request: FieldPortalAuthRequest, userJwt: String) async throws {
        var urlRequest = URLRequest(url: QRApprovePortal.verifyURL)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(userJwt)", forHTTPHeaderField: "Authorization")
        urlRequest.timeoutInterval = 30

        let body = VerifyRequestBody(
            sessionToken: request.nonce,
            userJwt: userJwt,
            deviceInfo: currentDeviceInfo(),
            biometricConfirmed: true
        )
        urlRequest.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: urlRequest)
        } catch {
            throw FieldPortalAuthError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw FieldPortalAuthError.network("Invalid response from the portal.")
        }

        let decoded = try? JSONDecoder().decode(VerifyResponseBody.self, from: data)
        guard http.statusCode == 200, decoded?.success == true else {
            if http.statusCode == 410 { throw FieldPortalAuthError.expired }
            let message = decoded?.error ?? decoded?.message ?? Self.fallbackMessage(for: http.statusCode)
            throw FieldPortalAuthError.server(message: message, statusCode: http.statusCode)
        }
    }

    private static func fallbackMessage(for status: Int) -> String {
        switch status {
        case 401: return "Your Field session needs a refresh. Sign in again and retry."
        case 403: return "Biometric confirmation is required to approve this sign-in."
        case 404: return "This sign-in request was already used, or the portal doesn't recognise it."
        case 410: return "This sign-in request has expired."
        default: return "The portal couldn't confirm this sign-in (status \(status))."
        }
    }

    /// Best-effort device metadata for the portal's audit trail
    /// (`qr_auth_sessions.device_info`, JSONB — not validated server-side).
    private func currentDeviceInfo() -> VerifyDeviceInfo {
        #if canImport(UIKit)
        let device = UIDevice.current
        return VerifyDeviceInfo(
            deviceId: device.identifierForVendor?.uuidString ?? "unknown",
            deviceName: device.name,
            platform: "iOS",
            osVersion: device.systemVersion
        )
        #else
        return VerifyDeviceInfo(deviceId: "unknown", deviceName: "unknown", platform: "iOS", osVersion: "unknown")
        #endif
    }
}
