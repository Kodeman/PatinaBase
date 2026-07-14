//
//  AppleSignInNonceTests.swift
//  PatinaTests
//
//  Pins the Sign-in-with-Apple nonce helper. The SHA256 value is what goes on
//  the authorization request and is verified by GoTrue against the id_token —
//  a wrong hash silently breaks Apple sign-in, so the vector is worth pinning.
//

import Testing
import Foundation
@testable import Patina

struct AppleSignInNonceTests {

    @Test
    func sha256MatchesKnownVector() {
        // Standard SHA256("abc") test vector.
        #expect(
            AppleSignInNonce.sha256("abc")
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
    }

    @Test
    func randomHasRequestedLengthAndCharset() {
        let allowed = Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        let nonce = AppleSignInNonce.random(length: 32)
        #expect(nonce.count == 32)
        #expect(nonce.allSatisfy { allowed.contains($0) })
    }

    @Test
    func randomIsNotConstant() {
        // Two draws should differ (collision probability is negligible).
        #expect(AppleSignInNonce.random() != AppleSignInNonce.random())
    }
}
