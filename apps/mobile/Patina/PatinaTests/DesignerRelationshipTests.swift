//
//  DesignerRelationshipTests.swift
//  PatinaTests
//
//  Pins the predicate W5 gates the Buy button on (R3 pre-emption) and credits
//  attribution with. Every case, and the roster tie rule.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct DesignerRelationshipTests {

    private func lead(
        status: String,
        designerId: UUID?,
        studio: String? = nil,
        anchoredDaysAgo: Int = 0,
        dismissedAtStage: String? = nil
    ) -> DesignRequestStatus {
        let anchor = Date().addingTimeInterval(-Double(anchoredDaysAgo) * 86_400)
        return DesignRequestStatus(
            leadId: UUID(),
            statusRaw: status,
            designerId: designerId,
            designerName: nil,
            projectTypeRaw: nil,
            budgetRange: nil,
            timeline: nil,
            requestDescription: nil,
            scanCount: 0,
            createdAt: anchor,
            updatedAt: anchor,
            dismissedAt: dismissedAtStage == nil ? nil : Date(),
            dismissedStageRaw: dismissedAtStage,
            studioName: studio
        )
    }

    private func project(
        id: UUID,
        designerId: UUID?,
        status: String? = "active",
        name: String = "Round Rock office"
    ) -> RemoteProject {
        RemoteProject(
            id: id.uuidString,
            name: name,
            status: status,
            client_id: UUID().uuidString,
            designer_id: designerId?.uuidString,
            studio_id: nil,
            total_amount_cents: nil,
            budget_cents: nil,
            design_fee_cents: nil,
            current_phase: nil,
            start_date: nil,
            target_end_date: nil,
            client_visibility_tier: nil,
            updated_at: nil
        )
    }

    private func day(_ offset: Int, hour: Int = 12) -> Date {
        let base = Date(timeIntervalSince1970: 1_756_000_000)  // fixed anchor
        return Calendar.current.date(
            byAdding: .hour, value: offset * 24 + hour, to: base
        )!
    }

    // MARK: - Cases

    @Test("no request, no project, no roster resolves to none")
    func noSignalsIsNone() {
        let relationship = DesignerRelationshipResolver.resolve(
            lead: nil, projects: [], roster: []
        )
        #expect(relationship == .none)
        #expect(!relationship.isLive)
        #expect(relationship.designerId == nil)
    }

    @Test("an active project with a designer wins")
    func activeProjectWins() {
        let projectId = UUID()
        let designerId = UUID()
        let relationship = DesignerRelationshipResolver.resolve(
            lead: lead(status: "accepted", designerId: UUID()),
            projects: [project(id: projectId, designerId: designerId)],
            roster: [RosterDesigner(designerId: UUID(), addedAt: day(0))]
        )
        #expect(relationship == .project(projectId: projectId, designerId: designerId, studioName: nil))
        #expect(relationship.isLive)
        #expect(relationship.designerId == designerId)
    }

    @Test("an archived project is not a relationship")
    func archivedProjectIsIgnored() {
        let relationship = DesignerRelationshipResolver.resolve(
            lead: nil,
            projects: [project(id: UUID(), designerId: UUID(), status: "archived")],
            roster: []
        )
        #expect(relationship == .none)
    }

    @Test("a project with no designer is not a relationship")
    func designerlessProjectIsIgnored() {
        let relationship = DesignerRelationshipResolver.resolve(
            lead: nil,
            projects: [project(id: UUID(), designerId: nil)],
            roster: []
        )
        #expect(relationship == .none)
    }

    @Test("a claimed or accepted lead is a live relationship")
    func claimedLeadIsLive() {
        let designerId = UUID()
        for status in ["accepted", "contacted", "new", "viewed"] {
            let promoted = lead(status: status, designerId: designerId, studio: "Hartwell Studio")
            let relationship = DesignerRelationshipResolver.resolve(
                lead: promoted, projects: [], roster: []
            )
            #expect(
                relationship == .lead(
                    leadId: promoted.leadId, designerId: designerId, studioName: "Hartwell Studio"
                ),
                "status \(status) did not resolve to a lead relationship"
            )
            #expect(relationship.isLive)
        }
    }

    /// M3. `promotedRequest` filters on `isVisibleForPromotion`, which is
    /// false past a 14-day window on a matched request and false once the
    /// client dismisses the card. Reading it here made the longest-lived
    /// relationships resolve `.none` — and R3's pre-emption fails open, so in
    /// W5 Buy would have drawn for a client who has had a designer for a year.
    @Test("a relationship outlives the card that displays it")
    func aRelationshipOutlivesItsCard() {
        let designerId = UUID()

        let longMatched = lead(status: "accepted", designerId: designerId, anchoredDaysAgo: 30)
        #expect(longMatched.stage == .matched)
        #expect(
            !longMatched.isVisibleForPromotion(),
            "fixture must be past the promotion window, or it proves nothing"
        )
        let stillLive = DesignerRelationshipResolver.resolve(
            lead: longMatched, projects: [], roster: []
        )
        #expect(stillLive.isLive)
        #expect(stillLive.designerId == designerId)

        let dismissed = lead(
            status: "accepted", designerId: designerId, dismissedAtStage: "matched"
        )
        #expect(!dismissed.isVisibleForPromotion())
        #expect(
            DesignerRelationshipResolver.resolve(
                lead: dismissed, projects: [], roster: []
            ).isLive
        )
    }

    @Test("a pooled lead with no designer yet is not a relationship")
    func pooledLeadIsNotARelationship() {
        #expect(
            DesignerRelationshipResolver.resolve(
                lead: lead(status: "new", designerId: nil),
                projects: [], roster: []
            ) == .none
        )
    }

    @Test("a terminal lead is not a relationship")
    func terminalLeadIsNotARelationship() {
        for status in ["declined", "expired"] {
            #expect(
                DesignerRelationshipResolver.resolve(
                    lead: lead(status: status, designerId: UUID()),
                    projects: [], roster: []
                ) == .none,
                "status \(status) resolved to a relationship"
            )
        }
    }

    @Test("a roster row is a relationship for attribution but is not live")
    func rosterIsAttributionOnly() {
        let designerId = UUID()
        let relationship = DesignerRelationshipResolver.resolve(
            lead: nil,
            projects: [],
            roster: [RosterDesigner(designerId: designerId, addedAt: day(0))]
        )
        #expect(relationship == .roster(designerId: designerId))
        #expect(!relationship.isLive, "a roster row alone must not pre-empt Buy (R3)")
        #expect(relationship.designerId == designerId)
    }

    // MARK: - Roster tie rule

    @Test("the most recent roster row wins")
    func mostRecentRosterRowWins() {
        let older = RosterDesigner(designerId: UUID(), addedAt: day(0))
        let newer = RosterDesigner(designerId: UUID(), addedAt: day(3))
        #expect(
            DesignerRelationshipResolver.resolve(
                lead: nil, projects: [], roster: [older, newer]
            ) == .roster(designerId: newer.designerId)
        )
        #expect(
            DesignerRelationshipResolver.resolve(
                lead: nil, projects: [], roster: [newer, older]
            ) == .roster(designerId: newer.designerId)
        )
    }

    @Test("two roster rows added the same day resolve to none")
    func sameDayRosterTieIsNone() {
        let first = RosterDesigner(designerId: UUID(), addedAt: day(0, hour: 9))
        let second = RosterDesigner(designerId: UUID(), addedAt: day(0, hour: 17))
        #expect(
            DesignerRelationshipResolver.resolve(
                lead: nil, projects: [], roster: [first, second]
            ) == .none
        )
    }

    @Test("a same-day tie behind a live lead does not suppress the lead")
    func sameDayTieDoesNotSuppressALead() {
        let designerId = UUID()
        let promoted = lead(status: "accepted", designerId: designerId)
        #expect(
            DesignerRelationshipResolver.resolve(
                lead: promoted,
                projects: [],
                roster: [
                    RosterDesigner(designerId: UUID(), addedAt: day(0, hour: 9)),
                    RosterDesigner(designerId: UUID(), addedAt: day(0, hour: 17))
                ]
            ) == .lead(leadId: promoted.leadId, designerId: designerId, studioName: nil)
        )
    }
}
