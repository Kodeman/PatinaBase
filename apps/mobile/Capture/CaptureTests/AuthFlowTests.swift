//  AuthFlowTests.swift
//  CaptureTests
//
//  Pure logic behind O2's two sign-in flows: the Sign in with Apple replay nonce
//  (SignInNonce) and the email one-time-code validators + state machine
//  (EmailAddress / EmailCode / EmailOTPMachine). All SDK-free, so they exercise in
//  the CaptureKit-only test bundle.

import Foundation
import Testing
@testable import CaptureKit

struct SignInNonceTests {

    /// Known SHA-256 vector — locks the hashing to the real digest GoTrue re-computes.
    @Test func sha256HexMatchesKnownVector() {
        #expect(SignInNonce.sha256Hex("abc")
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func makeProducesRequestedLengthAndDigestPair() {
        let nonce = SignInNonce.make(length: 32)
        #expect(nonce.raw.count == 32)
        #expect(nonce.hashed.count == 64)                    // 32-byte digest as hex
        #expect(nonce.hashed == SignInNonce.sha256Hex(nonce.raw))
    }

    @Test func makeProducesDistinctNonces() {
        #expect(SignInNonce.make().raw != SignInNonce.make().raw)
    }

    @Test func initHashesTheRawValue() {
        let nonce = SignInNonce(raw: "abc")
        #expect(nonce.raw == "abc")
        #expect(nonce.hashed == SignInNonce.sha256Hex("abc"))
    }
}

struct EmailValidationTests {

    @Test func acceptsWellFormedAddressesIgnoringCaseAndPadding() {
        #expect(EmailAddress.isValid("dana@studio.co"))
        #expect(EmailAddress.isValid("  Dana@Studio.CO "))   // normalized internally
    }

    @Test func rejectsMalformedAddresses() {
        #expect(!EmailAddress.isValid("dana"))
        #expect(!EmailAddress.isValid("dana@studio"))
        #expect(!EmailAddress.isValid(""))
    }

    @Test func normalizeTrimsAndLowercases() {
        #expect(EmailAddress.normalize("  Foo@Bar.com ") == "foo@bar.com")
    }

    @Test func sanitizeKeepsSixDigitsMax() {
        #expect(EmailCode.sanitize("12a34b567") == "123456")
        #expect(EmailCode.sanitize("12") == "12")
        #expect(EmailCode.sanitize("abc") == "")
    }

    @Test func isCompleteOnlyForSixDigits() {
        #expect(EmailCode.isComplete("123456"))
        #expect(!EmailCode.isComplete("12345"))
        #expect(!EmailCode.isComplete("1234567"))
    }
}

struct EmailOTPMachineTests {

    @Test func startsOnEmailStepWithSendGated() {
        let machine = EmailOTPMachine()
        #expect(machine.step == .email)
        #expect(machine.status == .idle)
        #expect(!machine.canSend)                            // empty email
    }

    @Test func validEmailEnablesSend() {
        var machine = EmailOTPMachine()
        machine.setEmail("dana@studio.co")
        #expect(machine.canSend)
    }

    @Test func sendingBlocksReentryThenAdvancesToCode() {
        var machine = EmailOTPMachine()
        machine.setEmail("dana@studio.co")
        machine.beginSend()
        #expect(machine.status == .working)
        #expect(!machine.canSend)                            // in flight
        machine.codeSent()
        #expect(machine.step == .code)
        #expect(machine.status == .idle)
        #expect(machine.code.isEmpty)
    }

    @Test func codeMustBeSixDigitsToVerify() {
        var machine = advancedToCodeStep()
        machine.setCode("12ab34")
        #expect(machine.code == "1234")                      // sanitized
        #expect(!machine.canVerify)
        machine.setCode("123456")
        #expect(machine.canVerify)
    }

    @Test func failOnCodeStepClearsDigitsAndSurfacesMessage() {
        var machine = advancedToCodeStep()
        machine.setCode("123456")
        machine.beginVerify()
        machine.fail("That code didn’t match.")
        #expect(machine.errorMessage == "That code didn’t match.")
        #expect(machine.code.isEmpty)                        // retype cleanly
    }

    @Test func editingClearsAPriorFailure() {
        var machine = advancedToCodeStep()
        machine.fail("boom")
        machine.setCode("1")
        #expect(machine.errorMessage == nil)
    }

    @Test func backToEmailResetsTheCodeStep() {
        var machine = advancedToCodeStep()
        machine.setCode("123456")
        machine.backToEmail()
        #expect(machine.step == .email)
        #expect(machine.status == .idle)
        #expect(machine.code.isEmpty)
    }

    // MARK: helper

    private func advancedToCodeStep() -> EmailOTPMachine {
        var machine = EmailOTPMachine()
        machine.setEmail("dana@studio.co")
        machine.beginSend()
        machine.codeSent()
        return machine
    }
}
