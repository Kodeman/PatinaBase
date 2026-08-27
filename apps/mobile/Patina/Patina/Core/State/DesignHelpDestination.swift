//
//  DesignHelpDestination.swift
//  Patina
//
//  Where "Get design help" actually goes (SP-07).
//
//  Before this, every entry point opened the compose sheet unconditionally, so
//  a client who had been matched eight days ago could only file a second,
//  indistinguishable request. The client never sees two leads — they see one
//  request that appears not to have happened — while the designer's pool gains
//  a duplicate.
//

import Foundation

enum DesignHelpDestination: Equatable {
    /// Open the request the client already has, at its current stage.
    case existingRequest(leadId: UUID)
    /// Open the compose flow — there is nothing to open instead.
    case newRequest

    /// A client past `.discovering` with a live (non-terminal) promoted
    /// request is sent to that request. A terminal request is not a
    /// relationship, so a new one is the honest answer there.
    static func resolve(
        tier: EngagementTier,
        promotedRequest: DesignRequestStatus?
    ) -> DesignHelpDestination {
        guard tier >= .engaged,
              let promotedRequest,
              !promotedRequest.stage.isTerminal else { return .newRequest }
        return .existingRequest(leadId: promotedRequest.leadId)
    }

    /// The live inputs, read at the call site so the resolution stays pure.
    static var current: DesignHelpDestination {
        resolve(
            tier: EngagementTier.resolve(
                requests: DesignRequestStatusService.shared.requests,
                projectCount: BadgeCountService.shared.projectCount,
                proposalCount: BadgeCountService.shared.proposalsAwaitingSignatureCount,
                invoiceCount: BadgeCountService.shared.payableInvoiceCount,
                decisionCount: BadgeCountService.shared.pendingDecisionCount
            ),
            promotedRequest: DesignRequestStatusService.shared.promotedRequest
        )
    }
}
