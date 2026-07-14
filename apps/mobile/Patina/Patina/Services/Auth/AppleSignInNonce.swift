//
//  AppleSignInNonce.swift
//  Patina
//
//  Nonce generation for Sign in with Apple. Apple's `signInWithIdToken` flow
//  is only secure when the request carries a SHA256-hashed nonce and the raw
//  nonce is handed to GoTrue to verify against the id_token's `nonce` claim —
//  without it, a replayed id_token can't be detected. The button sets
//  `request.nonce = sha256(raw)` and the auth service passes the raw nonce to
//  `signInWithIdToken(nonce:)`.
//
//  `nonisolated` opts this pure helper out of the module's main-actor-by-default
//  isolation so it's callable from the Apple request closure and property
//  initializers without isolation friction.
//

import Foundation
import CryptoKit

nonisolated enum AppleSignInNonce {

    /// A cryptographically-random, URL-safe nonce string (unhashed). This is
    /// the value handed to `signInWithIdToken(nonce:)`.
    static func random(length: Int = 32) -> String {
        let charset: [Character] =
            Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        guard status == errSecSuccess else {
            // Vanishingly unlikely; fall back to concatenated UUIDs so we
            // never ship an empty/short nonce.
            return (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
        }
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    /// Lowercase-hex SHA256 of the nonce — the value set on the
    /// `ASAuthorizationAppleIDRequest.nonce`.
    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
