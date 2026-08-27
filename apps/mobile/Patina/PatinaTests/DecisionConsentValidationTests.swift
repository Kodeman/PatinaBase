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

    /// B-6: `client_decisions.project_id` is nullable (00062:71), and the
    /// deferral used to gate on the project alone — so on a project-less
    /// decision both acts drew, the sheet opened, took the note, and then
    /// failed every time. A decision with a project routes to the project
    /// thread; one without routes to the direct thread with the designer;
    /// one with neither does not offer the acts at all.
    @Test("a decision with a project routes its note to the project thread")
    @MainActor
    func deferralWithAProjectRoutesToTheProjectThread() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decode(RemoteClientDecision.self, """
        { "id": "d-1", "title": "Rug color", "status": "pending",
          "project_id": "pr-1", "created_at": "2026-08-01T00:00:00Z" }
        """)
        #expect(viewModel.messageRoute == .project("pr-1"))
        #expect(viewModel.canDefer)
    }

    @Test("a decision with nowhere to send a note does not offer the acts")
    @MainActor
    func deferralWithNoRouteIsNotOffered() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decode(RemoteClientDecision.self, """
        { "id": "d-1", "title": "Rug color", "status": "pending",
          "created_at": "2026-08-01T00:00:00Z" }
        """)
        // No project, and no designer relationship in this fixture's world.
        #expect(viewModel.messageRoute == nil)
        #expect(!viewModel.canDefer)

        // The sheet cannot even be opened, so no note is ever taken from a
        // client the app cannot deliver it for.
        viewModel.beginDeferral(.notYet)
        #expect(viewModel.pendingDeferral == nil)

        let threadId = await viewModel.sendDeferral(note: "not yet")
        #expect(threadId == nil)
        #expect(viewModel.selectedOptionId == nil)
        #expect(!viewModel.isResolved)
    }

    /// SP-17: a deferral is a message, not a choice. Reporting it with the
    /// choice-submit sentence told a client who tapped "Not yet" that her
    /// choice had not gone through.
    @Test("a failed deferral is not reported as a failed choice")
    @MainActor
    func deferralFailureIsNotCalledAChoice() {
        #expect(MoneyFailureCopy.deferral.sentence
                == "We couldn't send that note. Your designer hasn't seen it yet.")
        #expect(!MoneyFailureCopy.deferral.sentence.contains("choice"))
        #expect(MoneyFailureCopy.decision.sentence
                == "We couldn't send your choice. Your designer hasn't seen it yet.")
    }

    /// m-2: the decision failure banner offered zero-or-one act where the
    /// invoice path offered two. Retry re-opens the consent step on the option
    /// the failed submit was carrying.
    @Test("a failed choice can be retried on the option it was carrying")
    @MainActor
    func failedSelectionCanBeRetried() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decode(RemoteClientDecision.self, """
        { "id": "d-1", "title": "Rug color", "status": "pending",
          "project_id": "pr-1", "created_at": "2026-08-01T00:00:00Z" }
        """)
        // The state `confirmSelection`'s catch branch leaves behind: the
        // failure drawn, the consent sheet closed, the option remembered.
        viewModel.submitFailure = MoneyFailureCopy.decision
        viewModel.lastAttemptedOptionId = "o-1"
        #expect(viewModel.pendingOptionId == nil)

        viewModel.retrySelection()
        #expect(viewModel.pendingOptionId == "o-1")
        #expect(viewModel.submitFailure == nil)
        #expect(MoneyFailureCopy.decision.retryLabel == "Let's try that again")

        // A retry after the decision resolved would re-open a consent step on
        // a settled decision.
        viewModel.cancelSelection()
        viewModel.selectedOptionId = "o-1"
        viewModel.retrySelection()
        #expect(viewModel.pendingOptionId == nil)
    }
}
