//
//  EngagementTierTests.swift
//  PatinaTests
//
//  Pins the pure engagement-tier resolver that drives the Daily Room's
//  progressive disclosure: marketplace-first (`.discovering`) → designer
//  engaged (`.engaged`) → full project platform (`.activeProject`).
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct EngagementTierTests {

    /// Build a status whose derived `stage` follows from `(status, designerId)`
    /// — see `DesignRequestStage.from`. Only those two fields matter here.
    private func request(status: String, designerId: UUID? = nil) -> DesignRequestStatus {
        DesignRequestStatus(
            leadId: UUID(),
            statusRaw: status,
            designerId: designerId,
            designerName: nil,
            projectTypeRaw: nil,
            budgetRange: nil,
            timeline: nil,
            requestDescription: nil,
            scanCount: 0,
            createdAt: Date(),
            updatedAt: nil,
            dismissedAt: nil,
            dismissedStageRaw: nil
        )
    }

    // MARK: - Ordering

    @Test
    func tiersAreOrdered() {
        #expect(EngagementTier.discovering < EngagementTier.engaged)
        #expect(EngagementTier.engaged < EngagementTier.activeProject)
        #expect(EngagementTier.activeProject >= EngagementTier.engaged)
    }

    // MARK: - Discovering

    @Test
    func noRequestsNoCountsIsDiscovering() {
        let tier = EngagementTier.resolve(
            requests: [], projectCount: 0, proposalCount: 0, invoiceCount: 0, decisionCount: 0
        )
        #expect(tier == .discovering)
    }

    @Test
    func onlyTerminalRequestsAreDiscovering() {
        // Declined (closed) + expired — both terminal, nothing to reveal.
        let tier = EngagementTier.resolve(
            requests: [request(status: "declined"), request(status: "expired")],
            projectCount: 0, proposalCount: 0, invoiceCount: 0, decisionCount: 0
        )
        #expect(tier == .discovering)
    }

    // MARK: - Engaged

    @Test
    func pooledRequestIsEngaged() {
        // status "new", no designer → stage .finding (non-terminal).
        let tier = EngagementTier.resolve(
            requests: [request(status: "new")],
            projectCount: 0, proposalCount: 0, invoiceCount: 0, decisionCount: 0
        )
        #expect(tier == .engaged)
    }

    @Test
    func matchedButNoProjectIsEngaged() {
        // status "accepted" → stage .matched (non-terminal), still no project.
        let tier = EngagementTier.resolve(
            requests: [request(status: "accepted", designerId: UUID())],
            projectCount: 0, proposalCount: 0, invoiceCount: 0, decisionCount: 0
        )
        #expect(tier == .engaged)
    }

    @Test
    func terminalPlusActiveRequestIsEngaged() {
        // A prior declined request must not mask a live one.
        let tier = EngagementTier.resolve(
            requests: [request(status: "declined"), request(status: "contacted", designerId: UUID())],
            projectCount: 0, proposalCount: 0, invoiceCount: 0, decisionCount: 0
        )
        #expect(tier == .engaged)
    }

    // MARK: - Active project

    @Test
    func aProjectIsActiveProject() {
        let tier = EngagementTier.resolve(
            requests: [], projectCount: 1, proposalCount: 0, invoiceCount: 0, decisionCount: 0
        )
        #expect(tier == .activeProject)
    }

    @Test
    func moneyRailArtifactsImplyActiveProject() {
        // Even if the project-count query came back empty, a proposal / invoice
        // / decision implies a project exists.
        #expect(EngagementTier.resolve(
            requests: [], projectCount: 0, proposalCount: 1, invoiceCount: 0, decisionCount: 0
        ) == .activeProject)
        #expect(EngagementTier.resolve(
            requests: [], projectCount: 0, proposalCount: 0, invoiceCount: 1, decisionCount: 0
        ) == .activeProject)
        #expect(EngagementTier.resolve(
            requests: [], projectCount: 0, proposalCount: 0, invoiceCount: 0, decisionCount: 1
        ) == .activeProject)
    }

    @Test
    func projectWinsOverActiveRequest() {
        // Active project takes precedence over an in-flight request.
        let tier = EngagementTier.resolve(
            requests: [request(status: "accepted", designerId: UUID())],
            projectCount: 2, proposalCount: 0, invoiceCount: 0, decisionCount: 0
        )
        #expect(tier == .activeProject)
    }

    // MARK: - Tri-state (U45)
    //
    // The home ASSERTS things from the tier — `.discovering` pitches "Ready to
    // bring in a designer?". These pin that an unanswered question is never
    // answered with that pitch.

    private func state(
        isAuthenticated: Bool = true,
        badgesLoaded: Bool = false,
        requestsLoaded: Bool = false,
        requests: [DesignRequestStatus] = [],
        projectCount: Int = 0,
        proposalCount: Int = 0,
        invoiceCount: Int = 0,
        decisionCount: Int = 0
    ) -> EngagementTierState {
        EngagementTier.resolveState(
            isAuthenticated: isAuthenticated,
            badgesLoaded: badgesLoaded,
            requestsLoaded: requestsLoaded,
            requests: requests,
            projectCount: projectCount,
            proposalCount: proposalCount,
            invoiceCount: invoiceCount,
            decisionCount: decisionCount
        )
    }

    @Test
    func guestIsKnownDiscoveringImmediately() {
        // A guest has nothing to fetch — no skeleton, no waiting.
        #expect(state(isAuthenticated: false) == .known(.discovering))
    }

    @Test
    func signedInUnloadedIsUnknown() {
        #expect(state() == .unknown)
    }

    @Test
    func signedInLoadedZeroesIsKnownDiscovering() {
        #expect(
            state(badgesLoaded: true, requestsLoaded: true) == .known(.discovering)
        )
    }

    @Test
    func partialLoadPromotesNeverDemotes() {
        // Requests landed and carry a live one: promote on that evidence
        // alone, even though the badge counts are still out.
        #expect(
            state(
                requestsLoaded: true,
                requests: [request(status: "new")]
            ) == .known(.engaged)
        )
        // Badges landed empty while the requests are still out: absence of
        // evidence is NOT evidence of absence — stay unknown.
        #expect(state(badgesLoaded: true) == .unknown)
    }

    @Test
    func partialCountPromotesToActiveProject() {
        #expect(state(badgesLoaded: true, projectCount: 1) == .known(.activeProject))
    }

    @Test
    func failureNeverResolvesToDiscovering() {
        // A failed refresh leaves both services unloaded with zeroed counts —
        // exactly the shape a brand-new client has. The signed-in client with
        // a real studio must not be pitched the marketplace-first CTA.
        #expect(state() != .known(.discovering))
        #expect(state(badgesLoaded: true) != .known(.discovering))
        #expect(state(requestsLoaded: true) != .known(.discovering))
    }
}
