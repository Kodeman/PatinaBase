//
//  DesignRequestStageTests.swift
//  PatinaTests
//
//  Pins the pure `(designer_id, status)` → `DesignRequestStage` mapping and
//  the promoted-card visibility rules. The mapping MUST derive from both
//  fields jointly — claiming a request sets `designer_id` without changing
//  `status` (00286), so a status-only mapping would strand every claimed
//  request on "finding" forever.
//

import Testing
import Foundation
@testable import Patina

struct DesignRequestStageTests {

    private let designer = UUID()

    // MARK: - Stage mapping (all six stages)

    @Test
    func pooledEarlyStatusesAreFinding() {
        #expect(DesignRequestStage.from(designerId: nil, status: "new") == .finding)
        #expect(DesignRequestStage.from(designerId: nil, status: "viewed") == .finding)
        #expect(DesignRequestStage.from(designerId: nil, status: "contacted") == .finding)
    }

    @Test
    func claimedButStatusNewIsReviewingNotFinding() {
        // The regression this whole mapping exists to prevent: a designer has
        // claimed (designer_id set) but the status is still "new". Must be
        // .reviewing, never .finding.
        #expect(DesignRequestStage.from(designerId: designer, status: "new") == .reviewing)
        #expect(DesignRequestStage.from(designerId: designer, status: "viewed") == .reviewing)
    }

    @Test
    func claimedAndContactedIsInTouch() {
        #expect(DesignRequestStage.from(designerId: designer, status: "contacted") == .inTouch)
    }

    @Test
    func acceptedIsMatchedRegardlessOfDesignerField() {
        #expect(DesignRequestStage.from(designerId: designer, status: "accepted") == .matched)
        #expect(DesignRequestStage.from(designerId: nil, status: "accepted") == .matched)
    }

    @Test
    func declinedIsClosedAndExpiredIsExpired() {
        #expect(DesignRequestStage.from(designerId: designer, status: "declined") == .closed)
        #expect(DesignRequestStage.from(designerId: nil, status: "declined") == .closed)
        #expect(DesignRequestStage.from(designerId: designer, status: "expired") == .expired)
    }

    // MARK: - Stage classification helpers

    @Test
    func terminalAndAttentionClassification() {
        #expect(DesignRequestStage.closed.isTerminal)
        #expect(DesignRequestStage.expired.isTerminal)
        #expect(!DesignRequestStage.matched.isTerminal)
        #expect(DesignRequestStage.matched.isTerminalOrMatched)
        #expect(DesignRequestStage.inTouch.needsAttention)
        #expect(DesignRequestStage.matched.needsAttention)
        #expect(!DesignRequestStage.finding.needsAttention)
        #expect(!DesignRequestStage.reviewing.needsAttention)
    }

    // MARK: - Copy

    @Test
    func matchedCopyUsesNameWithFallback() {
        #expect(DesignRequestStage.matched.subtitle(designerName: "Ada") == "You're working with Ada.")
        #expect(DesignRequestStage.matched.subtitle(designerName: nil) == "You're working with your designer.")
    }

    // MARK: - Promotion visibility

    private func makeStatus(
        status: String,
        designerId: UUID?,
        createdAt: Date = Date(),
        updatedAt: Date? = nil,
        dismissedStageRaw: String? = nil
    ) -> DesignRequestStatus {
        DesignRequestStatus(
            leadId: UUID(),
            statusRaw: status,
            designerId: designerId,
            designerName: nil,
            projectTypeRaw: "full_room",
            budgetRange: nil,
            timeline: nil,
            requestDescription: nil,
            scanCount: 1,
            createdAt: createdAt,
            updatedAt: updatedAt,
            dismissedAt: dismissedStageRaw == nil ? nil : Date(),
            dismissedStageRaw: dismissedStageRaw
        )
    }

    @Test
    func nonTerminalUndismissedIsVisible() {
        let finding = makeStatus(status: "new", designerId: nil)
        #expect(finding.isVisibleForPromotion())
    }

    @Test
    func dismissedAtCurrentStageIsHidden() {
        let finding = makeStatus(status: "new", designerId: nil, dismissedStageRaw: "finding")
        #expect(!finding.isVisibleForPromotion())
    }

    @Test
    func reappearsWhenStageAdvancesPastDismissal() {
        // Dismissed while "finding"; a designer has now claimed → reviewing.
        // dismissedStageRaw ("finding") no longer matches the current stage.
        let advanced = makeStatus(status: "viewed", designerId: designer, dismissedStageRaw: "finding")
        #expect(advanced.stage == .reviewing)
        #expect(advanced.isVisibleForPromotion())
    }

    @Test
    func matchedWithinWindowIsVisibleButPermanentlyDismissible() {
        let recent = makeStatus(status: "accepted", designerId: designer)
        #expect(recent.isVisibleForPromotion())

        let dismissed = makeStatus(status: "accepted", designerId: designer, dismissedStageRaw: "matched")
        #expect(!dismissed.isVisibleForPromotion())
    }

    @Test
    func terminalOutsideWindowIsHidden() {
        let old = Date().addingTimeInterval(-20 * 86_400)
        let stale = makeStatus(status: "expired", designerId: nil, createdAt: old, updatedAt: old)
        #expect(!stale.isVisibleForPromotion())

        let fresh = makeStatus(status: "declined", designerId: designer)
        #expect(fresh.isVisibleForPromotion())
    }
}
