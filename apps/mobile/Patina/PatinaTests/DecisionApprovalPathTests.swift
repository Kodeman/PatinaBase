//
//  DecisionApprovalPathTests.swift
//  PatinaTests
//
//  `W1-B-03`. Walk B, on the fixture's overdue decision:
//
//    "Design Development sign-off — drawing set B"
//    badge Approval · Overdue Aug 30
//    "Drawing set B needs your sign-off before Procurement can release the
//     long-lead casegoods"
//
//  rendered only "Not yet", "Neither of these" and "Discuss this with your
//  designer" at both text sizes (shots 56, 80, 20, 21). The sibling Product
//  decision draws two option cards with "Choose this" (58), because the screen
//  drew its primary action from the option list and this row has none.
//
//  The surface half closed on the W1 tip: the screen said so honestly. The
//  product gap stayed open, and it was a backend gap — `apply_client_decision`
//  takes `p_selected_option_id` and raises `insufficient_privilege` unless
//  `coordination_kind = 'selection'`, so no argument list resolved an
//  option-less sign-off. Migration 00564 is the act; this is the client half.
//
//  The server side is pinned where it lives:
//  `supabase/tests/rls/00564_client_signoff_approval.test.sql`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct DecisionApprovalPathTests {

    // MARK: - The wire shape

    /// Decoded rather than constructed, so this also pins that the three
    /// columns arrive under the names the select asks for.
    private func decision(
        status: String = "pending",
        kind: String? = "signoff",
        court: String? = "client",
        contract: String? = nil
    ) throws -> RemoteClientDecision {
        var row: [String: Any] = [
            "id": "b0000000-0000-0000-0000-00000005c301",
            "title": "Design Development sign-off — drawing set B",
            "status": status,
            "decision_type": "approval",
            "created_at": "2026-08-25T00:00:00Z"
        ]
        if let kind { row["coordination_kind"] = kind }
        if let court { row["court"] = court }
        if let contract { row["approval_contract"] = contract }
        let data = try JSONSerialization.data(withJSONObject: row)
        return try JSONDecoder().decode(RemoteClientDecision.self, from: data)
    }

    @Test("the fixture's Approval row is a sign-off the client may give")
    func theFixtureRowIsAClientSignoff() throws {
        #expect(try decision().isClientSignoff)
    }

    /// Each of the three legs the RPC checks, refused on the client side too,
    /// so the screen never draws an act the server will answer with a 403.
    @Test("a selection row is not a sign-off")
    func aSelectionRowIsNotASignoff() throws {
        #expect(try decision(kind: "selection").isClientSignoff == false)
    }

    @Test("a designer-court row is not the client's to approve")
    func aDesignerCourtRowIsNotTheClients() throws {
        #expect(try decision(court: "designer").isClientSignoff == false)
    }

    @Test("a Stage-2 artifact decision keeps its own path")
    func anArtifactDecisionIsRefused() throws {
        #expect(
            try decision(contract: "project_artifact_v1").isClientSignoff == false
        )
    }

    /// A row read by a select that predates the three columns decodes them as
    /// nil, which reads as "not a sign-off" and leaves the screen exactly as it
    /// was — never as an act that cannot succeed.
    @Test("a row with none of the three columns is not a sign-off")
    func aLegacyRowIsNotASignoff() throws {
        #expect(
            try decision(kind: nil, court: nil, contract: nil).isClientSignoff == false
        )
    }

    // MARK: - The screen's decision about which act to draw

    @Test("the act is offered on a pending sign-off with no options")
    func theActIsOfferedOnAPendingSignoff() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        #expect(viewModel.awaitsClientSignoff)
        #expect(
            viewModel.hasNoOptionsAtAll == false,
            "the honest dead-end line is printed over the act that now exists"
        )
    }

    /// A sign-off a designer has since given options to is answered by
    /// choosing one — `approve_client_signoff` refuses it, so the screen must
    /// not offer it.
    @Test("a sign-off that has grown options is chosen, not approved")
    func aSignoffWithOptionsIsChosen() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.options = [try option()]
        #expect(viewModel.awaitsClientSignoff == false)
    }

    @Test("a resolved sign-off offers the act no second time")
    func aResolvedSignoffOffersNothing() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision(status: "responded")
        #expect(viewModel.isResolved)
        #expect(viewModel.awaitsClientSignoff == false)
    }

    /// …and once the sign-off lands in this session, before any refetch.
    @Test("the sign-off closes the act for this session")
    func theSignoffClosesTheAct() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        #expect(viewModel.awaitsClientSignoff)

        viewModel.beginSignoff()
        #expect(viewModel.isApprovingSignoff, "Approve did not open the consent step")

        viewModel.cancelSignoff()
        #expect(viewModel.isApprovingSignoff == false)
    }

    /// A decision with no options that is NOT a sign-off is still waiting on
    /// its designer, and still says so — the W1 tip's line is not lost.
    @Test("a non-sign-off with no options still says it is waiting")
    func aPlainOptionlessDecisionStillSaysSo() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision(kind: "selection")
        #expect(viewModel.hasNoOptionsAtAll)
        #expect(viewModel.awaitsClientSignoff == false)
    }

    // MARK: - The statuses the act does not exist for

    /// `client_decisions.status` is `draft | pending | responded | expired`
    /// (00062), and `approve_client_signoff` takes `pending` alone — every
    /// other status is a `check_violation` (23514). `!isResolved` reads
    /// `responded`, so an EXPIRED sign-off passed it and drew "Give your
    /// sign-off" over an act the server refuses.
    @Test("an expired sign-off is not offered an act the server refuses",
          arguments: ["expired", "draft"])
    func aNonPendingSignoffOffersNoAct(status: String) throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision(status: status)
        #expect(viewModel.awaitsClientSignoff == false,
                "\(status) drew the sign-off CTA (RPC answers 23514)")
        // …and the retry act cannot re-open the consent step on it either.
        viewModel.retrySelection()
        #expect(viewModel.isApprovingSignoff == false)
    }

    @Test("the shape and the act are separate questions")
    func theShapeSurvivesTheStatus() throws {
        let expired = try decision(status: "expired")
        #expect(expired.isClientSignoff, "an expired row is still a sign-off")
        #expect(expired.isApprovableClientSignoff == false)
        #expect(try decision().isApprovableClientSignoff)
    }

    // MARK: - The act, both ways it can end

    /// `confirmSignoff`'s success branch: the seal, this session, before any
    /// refetch — and the consent step closed behind it.
    @Test("a sign-off that lands closes the act and shows as resolved")
    func aSignoffThatLandsResolves() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        var sent: (String, DecisionsAPIClient.ConsentMethod, String?)?
        viewModel.approveSignoff = { id, consent, signature in
            sent = (id, consent, signature)
        }

        viewModel.beginSignoff()
        await viewModel.confirmSignoff(
            decisionId: "b0000000-0000-0000-0000-00000005c301",
            consent: .electronicSignature,
            signature: "Client User"
        )

        let call = try #require(sent, "the act never reached the RPC")
        #expect(call.0 == "b0000000-0000-0000-0000-00000005c301")
        #expect(call.1 == .electronicSignature)
        #expect(call.2 == "Client User")
        #expect(viewModel.isResolved)
        #expect(viewModel.isApprovingSignoff == false)
        #expect(viewModel.isSubmitting == false)
        #expect(viewModel.submitFailure == nil)
        #expect(viewModel.awaitsClientSignoff == false, "the act is offered twice")
    }

    /// …and the failure branch: the sentence a client can act on, the consent
    /// step closed rather than left hanging, and the decision still open.
    @Test("a sign-off that fails says so and leaves the decision open")
    func aSignoffThatFailsSaysSo() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.approveSignoff = { _, _, _ in throw Boom() }

        viewModel.beginSignoff()
        await viewModel.confirmSignoff(
            decisionId: "b0000000-0000-0000-0000-00000005c301",
            consent: .clickThrough
        )

        #expect(viewModel.submitFailure == MoneyFailureCopy.decision)
        #expect(viewModel.isApprovingSignoff == false)
        #expect(viewModel.isSubmitting == false)
        #expect(viewModel.isResolved == false)
        #expect(viewModel.awaitsClientSignoff, "the client cannot try again")
    }

    /// SP-15's retry, on the branch a sign-off added: there is no option to
    /// remember, so the retry re-opens the consent step on the sign-off
    /// itself. Without it "Let's try that again" did nothing at all.
    @Test("the retry re-opens the consent step on a sign-off")
    func theRetryReopensTheSignoff() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.approveSignoff = { _, _, _ in throw Boom() }

        viewModel.beginSignoff()
        await viewModel.confirmSignoff(
            decisionId: "b0000000-0000-0000-0000-00000005c301",
            consent: .clickThrough
        )
        #expect(viewModel.isApprovingSignoff == false)

        viewModel.retrySelection()
        #expect(viewModel.isApprovingSignoff, "the retry act is dead on a sign-off")
        #expect(viewModel.submitFailure == nil, "the banner outlived its own retry")
    }

    /// The option path's retry is untouched by that branch: it still re-opens
    /// the consent step on the choice the client actually made.
    @Test("the option path's retry still remembers the option")
    func theOptionRetryIsUnchanged() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision(kind: "selection")
        viewModel.lastAttemptedOptionId = "00000000-0000-0000-0000-0000000000aa"
        viewModel.submitFailure = MoneyFailureCopy.decision

        viewModel.retrySelection()
        #expect(viewModel.pendingOptionId == "00000000-0000-0000-0000-0000000000aa")
        #expect(viewModel.isApprovingSignoff == false)
    }

    private func option() throws -> RemoteDecisionOption {
        let row: [String: Any] = [
            "id": "00000000-0000-0000-0000-0000000000aa",
            "decision_id": "b0000000-0000-0000-0000-00000005c301",
            "title": "Approved as drawn"
        ]
        return try JSONDecoder().decode(
            RemoteDecisionOption.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }

    // MARK: - The wiring

    @Test("the select asks for the three columns the act is decided on")
    func theSelectCarriesTheColumns() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Network/DecisionsAPIClient.swift")
        )
        #expect(code.contains("coordination_kind,court,approval_contract,"))
    }

    @Test("the client calls 00564's RPC with exactly its three arguments")
    func theClientCallsTheRPC() throws {
        let source = try SourcePin.read("Patina/Core/Network/DecisionsAPIClient.swift")
        let start = try #require(source.range(of: "public func approveSignoff("))
        let body = String(source[start.lowerBound...].prefix(1200))
        #expect(body.contains("/rest/v1/rpc/approve_client_signoff"))
        #expect(body.contains("\"p_decision_id\": decisionId"))
        #expect(body.contains("\"p_client_consent_method\": consent.rawValue"))
        #expect(body.contains("\"p_client_signature\": signature ?? NSNull()"))
        // No option id: the whole point is that this act has none.
        #expect(!body.contains("p_selected_option_id"))
    }

    /// The consent step is the one the option path uses — the same contractual
    /// moment, not a second sheet with its own rules.
    @Test("the sign-off goes through the existing consent sheet")
    func theSignoffUsesTheExistingConsentSheet() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        #expect(code.contains("decisionDetail.signoff"))
        #expect(code.contains("viewModel.beginSignoff()"))
        #expect(code.contains("await viewModel.confirmSignoff("))
        // One sheet type on this screen, used twice.
        #expect(code.components(separatedBy: "private struct DecisionConsentSheet").count - 1 == 1)
        #expect(code.components(separatedBy: "DecisionConsentSheet(").count - 1 == 2,
                "the consent sheet is presented for a choice and for a sign-off, and nowhere else")
        // And it is still reached through the one binding, so a swipe-dismiss
        // clears whichever act was pending.
        #expect(code.contains("viewModel.pendingOptionId != nil || viewModel.isApprovingSignoff"))
    }

    /// The migration is in the tree, numbered after the head W1 left, and its
    /// grants are `apply_client_decision`'s.
    @Test("00564 is the act, granted the way its neighbour is")
    func theMigrationIsPresentAndGranted() throws {
        // `MessagingThreadCreationTests`' walk: the alternative is duplicating
        // the migration into a fixture, which is the drift this pin exists to
        // catch.
        let migration = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // Patina
            .deletingLastPathComponent()   // mobile
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root
            .appendingPathComponent("supabase/migrations/00564_client_signoff_approval.sql")
        let sql = try String(contentsOf: migration, encoding: .utf8)
        #expect(sql.contains("CREATE OR REPLACE FUNCTION public.approve_client_signoff("))
        #expect(sql.contains("GRANT EXECUTE ON FUNCTION public.approve_client_signoff(uuid, text, text)\n  TO authenticated;"))
        #expect(sql.contains("FROM PUBLIC, anon, service_role;"))
        // The three legs the client mirrors.
        #expect(sql.contains("v_decision.coordination_kind IS DISTINCT FROM 'signoff'"))
        #expect(sql.contains("v_decision.court IS DISTINCT FROM 'client'"))
        #expect(sql.contains("v_decision.approval_contract IS NOT NULL"))
        // The reason the row exists at all.
        #expect(sql.contains("UPDATE public.project_ffe_items"))
        #expect(sql.contains("_enqueue_decision_notification("))
    }
}
