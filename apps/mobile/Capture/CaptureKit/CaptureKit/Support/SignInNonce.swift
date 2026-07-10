//  SignInNonce.swift
//  CaptureKit
//
//  Replay-protection nonce for Sign in with Apple. The raw value is handed to
//  Supabase's `signInWithIdToken(nonce:)`; its SHA-256 hash is set on the
//  ASAuthorization request (`request.nonce`). Apple embeds the hash as the
//  `nonce` claim in the ID token, and GoTrue re-hashes the raw value we send and
//  compares — so a stolen token can't be replayed without the matching raw nonce.
//  Pure Foundation + CryptoKit (no Supabase), so it unit-tests in CaptureTests.

import Foundation
import CryptoKit

/// A single-use Sign in with Apple nonce: the `raw` value (sent to GoTrue) and
/// its `hashed` SHA-256 hex (set on the ASAuthorization request).
public struct SignInNonce: Equatable, Sendable {
    /// The raw nonce — passed to `signInWithIdToken(credentials:.init(nonce:))`.
    public let raw: String
    /// SHA-256 hex of `raw` — assigned to `ASAuthorizationOpenIDRequest.nonce`.
    public let hashed: String

    /// Wraps an existing raw value, computing its hash. Prefer ``make(length:)``.
    public init(raw: String) {
        self.raw = raw
        self.hashed = Self.sha256Hex(raw)
    }

    /// A fresh cryptographically-random nonce (`length` characters from a
    /// 64-symbol URL-safe alphabet; 256 % 64 == 0, so the byte→symbol map is
    /// unbiased).
    public static func make(length: Int = 32) -> SignInNonce {
        SignInNonce(raw: randomString(length: length))
    }

    /// Lowercase SHA-256 hex digest of `input`.
    public static func sha256Hex(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    static func randomString(length: Int) -> String {
        precondition(length > 0)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            bytes = (0..<length).map { _ in UInt8.random(in: 0...255) }
        }
        return String(bytes.map { charset[Int($0) % charset.count] })
    }
}
