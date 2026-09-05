//
//  HoldToActTests.swift
//  PatinaTests
//
//  `P-18` / `R1`. The act is held and signed: a scored press-and-hold on the
//  three surfaces that record a legal act, and a typed legal name that travels
//  with the outcome.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct HoldToActTests {

    // MARK: - The hold itself

    @Test("the press is nine hundred milliseconds, and one constant says so")
    func theHoldIsOneConstant() throws {
        #expect(PatinaHold.duration == 0.9)
        // The affordance is on the control, so every act keeps its own word.
        #expect(PatinaHold.affordance == "PRESS AND HOLD")
        let source = try SourcePin.readCode(
            "Patina/Features/Shared/Views/HoldToActButton.swift"
        )
        #expect(source.contains("duration: PatinaHold.duration"))
        // The number appears once, as the constant — never typed at a site.
        #expect(source.components(separatedBy: "0.9").count - 1 == 1)
    }

    /// The gesture completes only while the finger is still down, and a
    /// release before the end fires the cancel and nothing else. Both live in
    /// `HoldableModifier`; this holds the shape of them, because a hold that
    /// completes on release is a tap wearing a costume.
    @Test("a released press cancels and never completes")
    func aReleasedPressCancelsAndNeverCompletes() throws {
        let source = try SourcePin.readCode("Patina/Design/Gestures/HoldGesture.swift")
        let cancel = try #require(source.range(of: "private func cancelHold()"))
        let cancelBody = String(source[cancel.lowerBound...].prefix(360))
        #expect(cancelBody.contains("holdTask?.cancel()"))
        #expect(cancelBody.contains("progress > 0 && progress < 1"))
        #expect(cancelBody.contains("onCancel()"))
        #expect(!cancelBody.contains("onComplete()"), "a release completed the act")

        let start = try #require(source.range(of: "private func startHold()"))
        let startBody = String(source[start.lowerBound...].prefix(700))
        #expect(startBody.contains("guard !Task.isCancelled else { return }"))
        #expect(startBody.contains("if isHolding {"))
        #expect(
            startBody.contains("HapticManager.shared.notification(.success)"),
            "the completion haptic is the confirmation for anyone who cannot see the ink"
        )
    }

    /// The accessible path is the whole path under VoiceOver: a sustained drag
    /// is not performable, so the `Activate` action and the tap alternative
    /// stand in for it. Losing either loses the act entirely.
    @Test("the VoiceOver Activate fallback survives")
    func theVoiceOverFallbackSurvives() throws {
        let source = try SourcePin.readCode("Patina/Design/Gestures/HoldGesture.swift")
        #expect(source.contains(".accessibilityAction(named: Text(\"Activate\"))"))
        #expect(source.contains("VoiceOverTapModifier"))
        #expect(source.contains("accessibleComplete()"))
    }

    /// Reduced motion removes the INK, never the deliberation. A reader who
    /// asked for less movement did not ask to sign faster.
    @Test("reduced motion keeps the delay and drops the ink")
    func reducedMotionKeepsTheDelay() throws {
        let gesture = try SourcePin.readCode("Patina/Design/Gestures/HoldGesture.swift")
        #expect(gesture.contains("accessibilityReduceMotion"))
        #expect(gesture.contains("reduceMotion ? 1.0 : (isHolding ? 0.97 : 1.0)"))
        #expect(gesture.contains("reduceMotion ? nil : .easeInOut(duration: 0.15)"))
        // The duration is never branched on the motion setting.
        #expect(!gesture.contains("reduceMotion ? 0"))

        let button = try SourcePin.readCode(
            "Patina/Features/Shared/Views/HoldToActButton.swift"
        )
        #expect(button.contains("reduceMotion ? 0 : progress"))
        let start = try #require(button.range(of: ".holdable("))
        let body = String(button[start.lowerBound...].prefix(300))
        #expect(!body.contains("reduceMotion"), "the hold itself was shortened")
    }

    /// The three acts that commit her, and only those three.
    @Test("the review confirmation and the outcome submit are both held")
    func bothApprovalActsAreHeld() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        #expect(source.components(separatedBy: "HoldToActButton(").count - 1 == 2)
        #expect(source.contains("ProjectApprovalCopy.reviewAction"))
        #expect(source.contains("ProjectApprovalCopy.submitAction"))
    }

    // MARK: - The typed legal name

    /// Two characters is the server's own floor
    /// (`_respond_project_approval_checked`, 00464:557-561): the act is never
    /// offered where the RPC would refuse it.
    @Test("the act is offered only over a name the server will accept")
    func theSignatureFloorIsTheServersOwn() throws {
        #expect(ProjectApprovalCopy.signatureFloor == 2)
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        #expect(!viewModel.canSignApproval, "an empty rule offered the act")
        viewModel.typedSignature = "M"
        #expect(!viewModel.canSignApproval)
        viewModel.typedSignature = "   M   "
        #expect(!viewModel.canSignApproval, "whitespace stood in for a name")
        viewModel.typedSignature = "Margaret Whitfield"
        #expect(viewModel.canSignApproval)
    }

    @Test("an unsigned outcome never reaches the RPC")
    func anUnsignedOutcomeIsNotSubmitted() async throws {
        var calls = 0
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.respondToApproval = { _, _, _, _, _ in calls += 1 }
        viewModel.chooseOutcome(.approved)

        await viewModel.submitApprovalResponse()

        #expect(calls == 0)
        #expect(viewModel.hasAnsweredApproval == false)
    }

    /// The name is trimmed before it is sent — `client_signature` is what a
    /// Record of Decision prints, and it may not carry the keyboard's spaces.
    @Test("the signature reaches the RPC trimmed")
    func theSignatureIsTrimmed() async throws {
        var sent: String?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.respondToApproval = { _, _, signature, _, _ in sent = signature }
        viewModel.typedSignature = "  Margaret Whitfield\n"
        viewModel.chooseOutcome(.approved)

        await viewModel.submitApprovalResponse()

        #expect(sent == "Margaret Whitfield")
    }

    /// `P-18` / `00569`. The two payload keys are the receipt's own
    /// (`00464:630-636`), and the consent method rides with the signature or
    /// neither goes — a signature with no method is a `check_violation`.
    @Test("the response payload carries the signature and its consent method")
    func theResponsePayloadCarriesTheSignature() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func respondToProjectApproval("))
        let body = String(source[start.lowerBound...].prefix(1200))
        #expect(body.contains("clientSignature"))
        #expect(body.contains("clientConsentMethod"))
        #expect(body.contains("ProjectApprovalConsent.electronicSignature"))
        #expect(body.contains("\"p_expected_updated_at\": expectedUpdatedAt"))
        #expect(ProjectApprovalConsent.electronicSignature == "electronic_signature")
    }

    /// The wrapper had to be opened for any of the above to reach the server:
    /// before 00569 it refused every payload key but `outcome`/`optionId` and
    /// passed `NULL, NULL` to a checked function that has taken the pair since
    /// 00464. The migration adds no rule of its own.
    @Test("the migration opens exactly the two keys and adds no rule")
    func theMigrationOpensExactlyTwoKeys() throws {
        let sql = try SourcePin.read(
            "../../../supabase/migrations/00569_stage2_outcome_signature_payload.sql"
        )
        #expect(sql.contains("'outcome', 'optionId', 'clientConsentMethod', 'clientSignature'"))
        #expect(sql.contains("v_consent_method, v_signature"))
        #expect(sql.contains("GRANT EXECUTE ON FUNCTION public.respond_project_approval("))
        // The validation stays in one place. A copy here is how two copies
        // come to disagree.
        #expect(!sql.contains("electronic_signature'"), "the wrapper re-validates the method")
        #expect(!sql.contains("char_length"), "the wrapper re-validates the signature length")
    }

    /// The review leg keeps `portal_clickthrough` (R1): a press-and-hold IS a
    /// click-through, so no migration follows the review confirmation.
    @Test("the review confirmation still sends portal_clickthrough")
    func theReviewLegKeepsItsMethod() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func confirmProjectApprovalReview("))
        let body = String(source[start.lowerBound...].prefix(700))
        #expect(body.contains("\"reviewMethod\": \"portal_clickthrough\""))
        #expect(!body.contains("clientSignature"))
    }

    // MARK: - The ruled line

    @Test("the name sits on a rule with the date beside it, above the outcomes")
    func theRuledLineIsDrawnAboveTheOutcomes() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        #expect(source.contains("private var signatureLine: some View"))
        #expect(source.contains("ProjectApprovalCopy.signatureLabel"))
        #expect(source.contains("DateDisplay.long(Date())"))
        #expect(source.contains("ProjectApprovalCopy.signatureNotice"))
        // Above, not below: the line is the first thing the outcome leg draws.
        let leg = try #require(source.range(of: "if review.canRespond, !viewModel.hasAnsweredApproval {"))
        let body = String(source[leg.lowerBound...].prefix(220))
        #expect(body.contains("signatureLine"))
    }

    /// The notice under the rule is the portals' `SIGNATURE_NOTICE`, verbatim,
    /// so one sentence stands under one rule on both surfaces.
    @Test("the notice under the rule is the portals' own")
    func theNoticeIsThePortalsOwn() {
        #expect(
            ProjectApprovalCopy.signatureNotice
                == "Your typed name acts as your electronic signature."
        )
    }
}
