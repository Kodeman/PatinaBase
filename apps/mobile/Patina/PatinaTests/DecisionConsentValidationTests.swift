//
//  DecisionConsentValidationTests.swift
//  PatinaTests
//
//  Keeps the client consent sheet aligned with apply_client_decision's
//  electronic-signature contract.
//

import Testing
import Foundation
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

    // MARK: - SP-17 · a decision can be deferred, and shows the colour

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    @Test("deferring names the decision and never resolves it")
    func deferralDraftNamesTheDecision() {
        #expect(DecisionDeferral.notYet.actLabel == "Not yet")
        #expect(DecisionDeferral.neitherOfThese.actLabel == "Neither of these")
        #expect(DecisionDeferral.allCases.count == 2)

        let draft = DecisionDeferral.notYet.draft(decisionTitle: "Rug color - Natural vs Sand")
        #expect(draft.contains("Rug color - Natural vs Sand"))
        #expect(draft.contains("not yet"))

        let neither = DecisionDeferral.neitherOfThese.draft(decisionTitle: nil)
        #expect(neither.contains("this decision"))
        #expect(!neither.isEmpty)

        let blank = DecisionDeferral.notYet.draft(decisionTitle: "")
        #expect(blank.contains("this decision"))
    }

    @Test("an option with nothing to show is not offered as a choice, and says why")
    func contentlessOptionsSayWhyInTheClientsWords() throws {
        let bare = try decode(RemoteDecisionOption.self, """
        { "id": "o-1", "decision_id": "d-1", "title": null, "description": null,
          "image_url": null }
        """)
        #expect(!bare.hasRenderableContent)
        #expect(DecisionOptionCopy.unavailableLine == "Your designer is still adding this option.")
        #expect(DecisionOptionCopy.allUnavailableLine == "Your designer is still adding the options.")
        #expect(!DecisionOptionCopy.unavailableLine.lowercased().contains("portal"))
        #expect(!DecisionOptionCopy.allUnavailableLine.lowercased().contains("portal"))
    }

    @Test("a decision whose every option is blank draws the pending line, not blank cards")
    @MainActor
    func aWhollyBlankDecisionDrawsThePendingLine() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.options = try decode([RemoteDecisionOption].self, """
        [{ "id": "o-1", "decision_id": "d-1" }, { "id": "o-2", "decision_id": "d-1" }]
        """)
        #expect(viewModel.hasNoRenderableOptions)

        viewModel.options = try decode([RemoteDecisionOption].self, """
        [{ "id": "o-3", "decision_id": "d-1", "title": "Natural" },
         { "id": "o-4", "decision_id": "d-1" }]
        """)
        #expect(!viewModel.hasNoRenderableOptions)

        viewModel.options = []
        #expect(!viewModel.hasNoRenderableOptions)
    }

    @Test("a deferral with no project to message fails in Patina's voice and resolves nothing")
    @MainActor
    func deferralWithoutAProjectFailsHonestly() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decode(RemoteClientDecision.self, """
        { "id": "d-1", "title": "Rug color", "status": "pending",
          "created_at": "2026-08-01T00:00:00Z" }
        """)
        viewModel.beginDeferral(.notYet)
        #expect(viewModel.pendingDeferral == .notYet)

        let threadId = await viewModel.sendDeferral(note: "not yet")
        #expect(threadId == nil)
        #expect(viewModel.deferralFailure?.sentence
                == "We couldn't send your choice. Your designer hasn't seen it yet.")
        #expect(viewModel.selectedOptionId == nil)
        #expect(!viewModel.isResolved)
    }
}
