//
//  DesignRequestPromotionDecayTests.swift
//  PatinaTests
//
//  W4: the two 14-day decays come out of `isVisibleForPromotion`. No decay
//  deletes a fact — a matched request stays until it resolves (B §1), and a
//  dismissal at that stage collapses the card for the session only.
//

import Testing
import Foundation
@testable import Patina

struct DesignRequestPromotionDecayTests {

    private let now = Date(timeIntervalSince1970: 1_787_940_000)

    private func request(
        status: String,
        designerId: UUID? = UUID(uuidString: "22222222-2222-2222-2222-222222222222"),
        stageAnchorDaysAgo: Double,
        dismissedStageRaw: String? = nil
    ) -> DesignRequestStatus {
        let anchor = now.addingTimeInterval(-stageAnchorDaysAgo * 86_400)
        return DesignRequestStatus(
            leadId: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            statusRaw: status, designerId: designerId, designerName: "Leah Hartwell",
            projectTypeRaw: nil, budgetRange: nil, timeline: nil,
            requestDescription: nil, scanCount: 0,
            createdAt: anchor, updatedAt: anchor,
            dismissedAt: dismissedStageRaw == nil ? nil : now,
            dismissedStageRaw: dismissedStageRaw,
            introduction: nil, studioName: "Hartwell Studio"
        )
    }

    @Test("a match a year old is still on the record")
    func aMatchDoesNotAgeOut() {
        let matched = request(status: "accepted", stageAnchorDaysAgo: 400)
        #expect(matched.stage == .matched)
        #expect(matched.isVisibleForPromotion(now: now))
    }

    @Test("a receipt dismissal cannot hide a match")
    func aPersistedMatchDismissalNoLongerHides() {
        // Older builds wrote "matched" onto the receipt and the card never
        // came back — a matched stage never advances. Those receipts still
        // exist on devices; they must stop meaning anything.
        let matched = request(
            status: "accepted", stageAnchorDaysAgo: 2, dismissedStageRaw: "matched"
        )
        #expect(matched.isVisibleForPromotion(now: now))
    }

    @Test("a resolved request still ages out, and its dismissal is still permanent")
    func aResolvedRequestKeepsItsWindow() {
        #expect(request(status: "declined", stageAnchorDaysAgo: 3).isVisibleForPromotion(now: now))
        #expect(!request(status: "declined", stageAnchorDaysAgo: 30).isVisibleForPromotion(now: now))
        #expect(
            !request(status: "declined", stageAnchorDaysAgo: 3, dismissedStageRaw: "closed")
                .isVisibleForPromotion(now: now)
        )
        #expect(!request(status: "expired", stageAnchorDaysAgo: 30).isVisibleForPromotion(now: now))
    }

    @Test("an in-progress stage keeps its stage-scoped dismissal")
    func inProgressDismissalIsUnchanged() {
        // Untouched by W4: dismissing "we're finding you a designer" hides it
        // until the stage advances past that dismissal.
        let dismissed = request(
            status: "new", designerId: nil, stageAnchorDaysAgo: 1, dismissedStageRaw: "finding"
        )
        #expect(dismissed.stage == .finding)
        #expect(!dismissed.isVisibleForPromotion(now: now))

        let advanced = request(
            status: "viewed", stageAnchorDaysAgo: 1, dismissedStageRaw: "finding"
        )
        #expect(advanced.stage == .held)
        #expect(advanced.isVisibleForPromotion(now: now))
    }

    @Test("an in-progress stage never ages out either")
    func inProgressDoesNotAgeOut() {
        #expect(request(status: "viewed", stageAnchorDaysAgo: 400).isVisibleForPromotion(now: now))
    }

    @MainActor
    @Test("dismissing a match folds the card for this session, and only this session")
    func aMatchDismissalIsSessionOnly() async {
        // The shared service is the only way in — `dismiss` is the seam under
        // test — so the test hands it back the way it found it at the end.
        let service = DesignRequestStatusService.shared
        let matched = request(status: "accepted", stageAnchorDaysAgo: 5)
        service.dismiss(matched)
        #expect(service.sessionDismissedLeadIds.contains(matched.leadId))
        // Nothing is written, so a status rebuilt from the row and the receipt
        // — which is what the next launch does — has nothing to hide it with.
        #expect(matched.isVisibleForPromotion(now: now))

        guard !AuthService.shared.isAuthenticated else { return }
        // Signing out ends the session, and the collapse ends with it.
        // Otherwise "session" quietly means the process and the card is still
        // hidden after signing back in.
        await service.refresh()
        #expect(service.sessionDismissedLeadIds.isEmpty)
    }
}
