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
    /// We do not yet know whether the client has a request. Open the request
    /// list, which refreshes on appear and renders the consultation landing
    /// when there is genuinely nothing there — so the tap is never lost and
    /// never files a duplicate.
    case requestList
    /// Open the compose flow — there is nothing to open instead.
    case newRequest

    /// A client with an open (non-terminal) request is sent to it. A terminal
    /// request is not a relationship, so a new one is the honest answer there.
    ///
    /// The tier arrives as `EngagementTierState`, not `EngagementTier`,
    /// because `resolve` on an unloaded service sees `requests == []` and
    /// answers `.discovering` — indistinguishable from a client who really has
    /// none. On a cold launch that is a tap on "Get design help" filing the
    /// second lead this guard exists to prevent, so "we do not know yet" has
    /// to be its own answer.
    static func resolve(
        state: EngagementTierState,
        openRequest: DesignRequestStatus?
    ) -> DesignHelpDestination {
        switch state {
        case .unknown:
            return .requestList
        case .known(let tier):
            guard tier >= .engaged, let openRequest else { return .newRequest }
            return .existingRequest(leadId: openRequest.leadId)
        }
    }

    /// The live inputs, read at the call site so the resolution stays pure.
    static var current: DesignHelpDestination {
        resolve(
            state: EngagementTier.currentState,
            openRequest: DesignRequestStatusService.shared.openRequest
        )
    }
}
