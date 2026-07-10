//  PortalLoginTests.swift
//  CaptureTests
//
//  The SDK-free half of the web→app QR sign-in handoff: `PortalLoginToken`
//  parsing (scheme/host/version/token rules) and the pure `PortalLogin` state
//  machine (signed-out / same-account / different-account). Both live in
//  CaptureKit so they exercise in the CaptureKit-only test bundle; the exchange
//  itself is app-side behind `WorkspaceAuthorizing`.

import Foundation
import Testing
@testable import CaptureKit

struct PortalLoginTokenParseTests {

    private func expectParseError(_ payload: String,
                                  _ expected: PortalLoginToken.ParseError) {
        do {
            _ = try PortalLoginToken.parse(payload: payload)
            Issue.record("expected \(expected) but parse succeeded for \(payload)")
        } catch let error as PortalLoginToken.ParseError {
            #expect(error == expected)
        } catch {
            Issue.record("unexpected error \(error) for \(payload)")
        }
    }

    // MARK: Happy path

    @Test func parsesVersionedTokenFromURL() throws {
        let url = URL(string: "field://login?v=1&th=abc123hashedtoken")!
        let token = try PortalLoginToken.parse(url: url)
        #expect(token.tokenHash == "abc123hashedtoken")
    }

    @Test func parsesFromRawScannedString() throws {
        let token = try PortalLoginToken.parse(payload: "field://login?v=1&th=deadbeef")
        #expect(token.tokenHash == "deadbeef")
    }

    @Test func trimsWhitespaceAroundScannedString() throws {
        let token = try PortalLoginToken.parse(payload: "  field://login?v=1&th=tok  \n")
        #expect(token.tokenHash == "tok")
    }

    @Test func toleratesReorderedQueryItems() throws {
        let token = try PortalLoginToken.parse(payload: "field://login?th=tok&v=1")
        #expect(token.tokenHash == "tok")
    }

    @Test func urlStringRoundTrips() throws {
        let original = PortalLoginToken(tokenHash: "roundtrip-hash")
        let reparsed = try PortalLoginToken.parse(payload: original.urlString())
        #expect(reparsed == original)
    }

    // MARK: Version rules

    @Test func rejectsFutureVersion() {
        expectParseError("field://login?v=2&th=tok", .unsupportedVersion("2"))
    }

    @Test func rejectsNonNumericVersion() {
        expectParseError("field://login?v=beta&th=tok", .unsupportedVersion("beta"))
    }

    @Test func rejectsMissingVersion() {
        expectParseError("field://login?th=tok", .missingVersion)
    }

    @Test func rejectsEmptyVersion() {
        expectParseError("field://login?v=&th=tok", .missingVersion)
    }

    // MARK: Token rules

    @Test func rejectsMissingToken() {
        expectParseError("field://login?v=1", .missingToken)
    }

    @Test func rejectsEmptyToken() {
        expectParseError("field://login?v=1&th=", .missingToken)
    }

    // MARK: Not-a-login-link

    @Test func rejectsWrongHost() {
        expectParseError("field://capture?v=1&th=tok", .notALoginLink)
    }

    @Test func rejectsWrongScheme() {
        expectParseError("https://login?v=1&th=tok", .notALoginLink)
    }

    @Test func rejectsGarbage() {
        expectParseError("not a url at all", .notALoginLink)
    }
}

struct PortalLoginResolutionTests {

    @Test func signedOutAlwaysSignsIn() {
        #expect(PortalLogin.resolve(state: .signedOut) == .signIn)
        // A target is irrelevant when nobody is signed in.
        #expect(PortalLogin.resolve(state: .signedOut, target: "anyone") == .signIn)
    }

    @Test func sameAccountIsANoOp() {
        let state = PortalLoginState.signedIn(userID: "user-a", email: "a@studio.co")
        #expect(PortalLogin.resolve(state: state, target: "user-a") == .alreadySignedIn(email: "a@studio.co"))
    }

    @Test func differentAccountConfirmsSwitch() {
        let state = PortalLoginState.signedIn(userID: "user-a", email: "a@studio.co")
        #expect(PortalLogin.resolve(state: state, target: "user-b") == .confirmSwitch(currentEmail: "a@studio.co"))
    }

    @Test func unknownTargetConfirmsSwitch() {
        // Production pre-exchange: the opaque hash gives no target, so a live
        // session must confirm before it can be replaced.
        let state = PortalLoginState.signedIn(userID: "user-a", email: "a@studio.co")
        #expect(PortalLogin.resolve(state: state, target: nil) == .confirmSwitch(currentEmail: "a@studio.co"))
    }

    @Test func confirmSwitchCarriesNilEmailWhenUnknown() {
        let state = PortalLoginState.signedIn(userID: "user-a", email: nil)
        #expect(PortalLogin.resolve(state: state, target: "user-b") == .confirmSwitch(currentEmail: nil))
    }
}
