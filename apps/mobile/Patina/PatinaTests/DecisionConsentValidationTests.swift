//
//  DecisionConsentValidationTests.swift
//  PatinaTests
//
//  Keeps the client consent sheet aligned with apply_client_decision's
//  electronic-signature contract.
//

import Testing
@testable import Patina

struct DecisionConsentValidationTests {

    @Test
    func clickThroughDoesNotRequireSignatureText() {
        #expect(DecisionConsentValidation.canConfirm(
            requiresSignature: false,
            signature: ""
        ))
    }

    @Test
    func electronicSignatureRejectsFewerThanTwoTrimmedCharacters() {
        #expect(!DecisionConsentValidation.canConfirm(
            requiresSignature: true,
            signature: ""
        ))
        #expect(!DecisionConsentValidation.canConfirm(
            requiresSignature: true,
            signature: "   \n"
        ))
        #expect(!DecisionConsentValidation.canConfirm(
            requiresSignature: true,
            signature: " A \n"
        ))
    }

    @Test
    func electronicSignatureAcceptsAndNormalizesTwoOrMoreCharacters() {
        #expect(DecisionConsentValidation.canConfirm(
            requiresSignature: true,
            signature: " Al \n"
        ))
        #expect(DecisionConsentValidation.normalizedSignature(" Al \n") == "Al")
    }
}
