//
//  DesignRequestStageTests.swift
//  PatinaTests
//
//  Pins the pure `(designer_id, status, introduction)` → `DesignRequestStage`
//  mapping and the promoted-card visibility rules.
//
//  The mapping derives from all three inputs, in a fixed precedence (Arrival
//  Arc, R106): a terminal status (declined/expired) always wins; then a
//  delivered introduction (`match_ceremonies` sent/picked) — picked ⇒ booked,
//  else introduced; then the legacy `(designer_id, status)` derivation.
//  Claiming a request sets `designer_id` without changing `status` (00286), so
//  a status-only mapping would strand every claimed request on "finding".
//

import Testing
import Foundation
@testable import Patina

struct DesignRequestStageTests {

    private let designer = UUID()

    /// A minimal introduction embed for derivation tests. `picked` toggles the
    /// `pickedSlotId` presence (the flag that decides `.booked` vs `.introduced`
    /// inside the sent/picked branch); `state` is decoded/interpreted as-is.
    private func intro(state: String = "sent", picked: Bool = false) -> IntroductionInfo {
        IntroductionInfo(
            ceremonyId: UUID(),
            state: state,
            introText: nil,
            credentialLine: nil,
            portfolioUrl: nil,
            slots: [],
            timezone: nil,
            offeredAt: nil,
            pickedSlotId: picked ? UUID() : nil,
            pickedSlotStartsAt: picked ? Date() : nil,
            threadId: nil,
            createdAt: nil
        )
    }

    // MARK: - Legacy stage mapping (no ceremony)

    @Test
    func pooledEarlyStatusesAreFinding() {
        #expect(DesignRequestStage.from(designerId: nil, status: "new", introduction: nil) == .finding)
        #expect(DesignRequestStage.from(designerId: nil, status: "viewed", introduction: nil) == .finding)
        #expect(DesignRequestStage.from(designerId: nil, status: "contacted", introduction: nil) == .finding)
    }

    @Test
    func claimedButStatusNewIsHeldNotFinding() {
        // The regression this mapping exists to prevent: a designer has claimed
        // (designer_id set) but the status is still "new". Must be .held (the
        // former .reviewing), never .finding.
        #expect(DesignRequestStage.from(designerId: designer, status: "new", introduction: nil) == .held)
        #expect(DesignRequestStage.from(designerId: designer, status: "viewed", introduction: nil) == .held)
    }

    @Test
    func claimedAndContactedIsInTouch() {
        #expect(DesignRequestStage.from(designerId: designer, status: "contacted", introduction: nil) == .inTouch)
    }

    @Test
    func acceptedIsMatchedRegardlessOfDesignerField() {
        #expect(DesignRequestStage.from(designerId: designer, status: "accepted", introduction: nil) == .matched)
        #expect(DesignRequestStage.from(designerId: nil, status: "accepted", introduction: nil) == .matched)
    }

    @Test
    func declinedIsClosedAndExpiredIsExpired() {
        #expect(DesignRequestStage.from(designerId: designer, status: "declined", introduction: nil) == .closed)
        #expect(DesignRequestStage.from(designerId: nil, status: "declined", introduction: nil) == .closed)
        #expect(DesignRequestStage.from(designerId: designer, status: "expired", introduction: nil) == .expired)
    }

    // MARK: - Arrival Arc precedence (the full table)

    @Test
    func arrivalArcDerivationTable() {
        // --- Terminal status always wins, even over a delivered introduction ---
        #expect(DesignRequestStage.from(designerId: nil, status: "declined", introduction: nil) == .closed)
        #expect(DesignRequestStage.from(designerId: designer, status: "expired", introduction: nil) == .expired)
        #expect(DesignRequestStage.from(designerId: designer, status: "declined", introduction: intro(state: "sent")) == .closed)
        // 'declined' beats a picked intro — the explicitly called-out case.
        #expect(DesignRequestStage.from(designerId: designer, status: "declined", introduction: intro(state: "picked", picked: true)) == .closed)
        #expect(DesignRequestStage.from(designerId: designer, status: "expired", introduction: intro(state: "picked", picked: true)) == .expired)

        // --- A delivered (sent) introduction beats every non-terminal status ---
        #expect(DesignRequestStage.from(designerId: designer, status: "new", introduction: intro(state: "sent")) == .introduced)
        #expect(DesignRequestStage.from(designerId: designer, status: "viewed", introduction: intro(state: "sent")) == .introduced)
        #expect(DesignRequestStage.from(designerId: designer, status: "contacted", introduction: intro(state: "sent")) == .introduced)
        #expect(DesignRequestStage.from(designerId: designer, status: "accepted", introduction: intro(state: "sent")) == .introduced)

        // --- A picked introduction ⇒ booked, over every non-terminal status ---
        #expect(DesignRequestStage.from(designerId: designer, status: "new", introduction: intro(state: "picked", picked: true)) == .booked)
        #expect(DesignRequestStage.from(designerId: designer, status: "contacted", introduction: intro(state: "picked", picked: true)) == .booked)
        #expect(DesignRequestStage.from(designerId: designer, status: "accepted", introduction: intro(state: "picked", picked: true)) == .booked)

        // --- pickedSlotId (not the state string) decides introduced vs booked ---
        // "picked" state but no slot id yet → still introduced.
        #expect(DesignRequestStage.from(designerId: designer, status: "new", introduction: intro(state: "picked", picked: false)) == .introduced)
        // "sent" state but a slot id present → booked.
        #expect(DesignRequestStage.from(designerId: designer, status: "new", introduction: intro(state: "sent", picked: true)) == .booked)

        // --- designerId nil edge: pooled but somehow a sent/picked intro ---
        #expect(DesignRequestStage.from(designerId: nil, status: "new", introduction: intro(state: "sent")) == .introduced)
        #expect(DesignRequestStage.from(designerId: nil, status: "new", introduction: intro(state: "picked", picked: true)) == .booked)

        // --- Defensive: a draft embed (RLS shouldn't deliver it) is ignored ---
        #expect(DesignRequestStage.from(designerId: designer, status: "new", introduction: intro(state: "draft")) == .held)
        #expect(DesignRequestStage.from(designerId: nil, status: "new", introduction: intro(state: "draft")) == .finding)

        // --- Legacy: accepted with no ceremony → matched ---
        #expect(DesignRequestStage.from(designerId: designer, status: "accepted", introduction: nil) == .matched)

        // --- Claimed, no intro → held; pooled, no intro → finding ---
        #expect(DesignRequestStage.from(designerId: designer, status: "new", introduction: nil) == .held)
        #expect(DesignRequestStage.from(designerId: nil, status: "new", introduction: nil) == .finding)
        #expect(DesignRequestStage.from(designerId: nil, status: "contacted", introduction: nil) == .finding)
    }

    // MARK: - Stage classification helpers

    @Test
    func terminalAndAttentionClassification() {
        #expect(DesignRequestStage.closed.isTerminal)
        #expect(DesignRequestStage.expired.isTerminal)
        #expect(!DesignRequestStage.matched.isTerminal)
        #expect(!DesignRequestStage.held.isTerminal)
        #expect(!DesignRequestStage.introduced.isTerminal)
        #expect(!DesignRequestStage.booked.isTerminal)

        // The ceremony stages are live and always-promoted — NOT the
        // 14-day-windowed "matched" relationship.
        #expect(DesignRequestStage.matched.isTerminalOrMatched)
        #expect(!DesignRequestStage.introduced.isTerminalOrMatched)
        #expect(!DesignRequestStage.booked.isTerminalOrMatched)
        #expect(!DesignRequestStage.introduced.isMatched)
        #expect(!DesignRequestStage.booked.isMatched)

        #expect(DesignRequestStage.inTouch.needsAttention)
        #expect(DesignRequestStage.introduced.needsAttention)
        #expect(DesignRequestStage.matched.needsAttention)
        #expect(!DesignRequestStage.booked.needsAttention)
        #expect(!DesignRequestStage.held.needsAttention)
        #expect(!DesignRequestStage.finding.needsAttention)
    }

    // MARK: - Copy

    @Test
    func matchedCopyUsesNameWithFallback() {
        #expect(DesignRequestStage.matched.subtitle(designerName: "Ada") == "You're working with Ada.")
        #expect(DesignRequestStage.matched.subtitle(designerName: nil) == "You're working with your designer.")
    }

    @Test
    func arrivalArcCopyUsesStudioNameWithFallback() {
        // Studio name wins over designer name.
        #expect(DesignRequestStage.held.subtitle(studioName: "Middle Studio", designerName: "Ada")
                == "Middle Studio has taken your request in hand — introduction on its way.")
        #expect(DesignRequestStage.held.cardTitle(studioName: "Middle Studio", designerName: "Ada")
                == "Middle Studio has your request in hand")

        // Falls back to designer name, then the generic "Your designer".
        #expect(DesignRequestStage.introduced.cardTitle(designerName: "Ada") == "You're matched — meet Ada")
        #expect(DesignRequestStage.introduced.subtitle()
                == "Your designer sent you an introduction and times for your first call.")

        // Booked headline: day + time when a picked slot is supplied, generic otherwise.
        var comps = DateComponents()
        comps.year = 2026; comps.month = 7; comps.day = 24; comps.hour = 16; comps.minute = 0
        let slot = Calendar.current.date(from: comps)!
        #expect(DesignRequestStage.booked.cardTitle(studioName: "Cole & Co", bookedSlotStartsAt: slot)
                .hasPrefix("Discovery · "))
        #expect(DesignRequestStage.booked.cardTitle(studioName: "Cole & Co") == "Discovery call booked")
        #expect(DesignRequestStage.booked.subtitle(studioName: "Cole & Co")
                == "You're set with Cole & Co. The call is on the calendar.")
    }

    // MARK: - Promotion visibility

    private func makeStatus(
        status: String,
        designerId: UUID?,
        createdAt: Date = Date(),
        updatedAt: Date? = nil,
        introduction: IntroductionInfo? = nil,
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
            dismissedStageRaw: dismissedStageRaw,
            introduction: introduction
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
        // Dismissed while "finding"; a designer has now claimed → held.
        // dismissedStageRaw ("finding") no longer matches the current stage.
        let advanced = makeStatus(status: "viewed", designerId: designer, dismissedStageRaw: "finding")
        #expect(advanced.stage == .held)
        #expect(advanced.isVisibleForPromotion())
    }

    @Test
    func introducedIsAlwaysPromotedUntilDismissedAtThatStage() {
        let introduced = makeStatus(status: "new", designerId: designer, introduction: intro(state: "sent"))
        #expect(introduced.stage == .introduced)
        #expect(introduced.isVisibleForPromotion())   // non-terminal → always-on
        let dismissed = makeStatus(
            status: "new", designerId: designer,
            introduction: intro(state: "sent"), dismissedStageRaw: "introduced"
        )
        #expect(!dismissed.isVisibleForPromotion())
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
