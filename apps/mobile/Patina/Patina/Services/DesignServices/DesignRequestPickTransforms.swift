//
//  DesignRequestPickTransforms.swift
//  Patina
//
//  Pure value transforms behind the Match Ceremony's optimistic pick (Arrival
//  Arc, R106 §6): stamp a booked pick into an introduction, roll it back, and
//  rebuild a status carrying a replaced introduction. Kept out of
//  `DesignRequestStatusService` (both because they are pure — no actor state,
//  fully unit-testable — and to keep that file from growing further). The
//  service's `applyPick` / `revertPick` map over `requests` using these.
//

import Foundation

nonisolated public extension IntroductionInfo {
    /// A copy stamped as a booked pick — `state` → "picked", the picked slot id
    /// and start filled. Everything else (intro text, offered slots, credential,
    /// thread) is preserved. Drives the optimistic `.introduced` → `.booked`
    /// flip; the server reconcile confirms it. Pure, unit-tested.
    func picking(slotId: UUID, startsAt: Date) -> IntroductionInfo {
        IntroductionInfo(
            ceremonyId: ceremonyId,
            state: "picked",
            introText: introText,
            credentialLine: credentialLine,
            portfolioUrl: portfolioUrl,
            slots: slots,
            timezone: timezone,
            offeredAt: offeredAt,
            pickedSlotId: slotId,
            pickedSlotStartsAt: startsAt,
            threadId: threadId,
            createdAt: createdAt
        )
    }

    /// The inverse of `picking` — restores the delivered-but-unpicked
    /// (`.introduced`) shape. Used to roll back an optimistic pick when the RPC
    /// fails (network / stale). Pure, unit-tested.
    func unpicked() -> IntroductionInfo {
        IntroductionInfo(
            ceremonyId: ceremonyId,
            state: "sent",
            introText: introText,
            credentialLine: credentialLine,
            portfolioUrl: portfolioUrl,
            slots: slots,
            timezone: timezone,
            offeredAt: offeredAt,
            pickedSlotId: nil,
            pickedSlotStartsAt: nil,
            threadId: threadId,
            createdAt: createdAt
        )
    }
}

public extension DesignRequestStatus {
    /// A copy carrying a replaced `introduction` (all other fields, including
    /// the local dismissal + studio state, preserved). `introduction` is a
    /// `let`, so the optimistic pick / revert rebuild the value through this.
    func withIntroduction(_ introduction: IntroductionInfo?) -> DesignRequestStatus {
        DesignRequestStatus(
            leadId: leadId,
            statusRaw: statusRaw,
            designerId: designerId,
            designerName: designerName,
            projectTypeRaw: projectTypeRaw,
            budgetRange: budgetRange,
            timeline: timeline,
            requestDescription: requestDescription,
            scanCount: scanCount,
            createdAt: createdAt,
            updatedAt: updatedAt,
            dismissedAt: dismissedAt,
            dismissedStageRaw: dismissedStageRaw,
            introduction: introduction,
            studioName: studioName
        )
    }
}
