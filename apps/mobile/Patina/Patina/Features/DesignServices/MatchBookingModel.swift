//
//  MatchBookingModel.swift
//  Patina
//
//  Orchestrates booking a discovery slot from the Match Ceremony (Arrival Arc,
//  R106 §6). Owned by `DesignRequestStatusView` (which persists across the
//  stage swap), NOT by `MatchIntroductionView` — because the optimistic pick
//  flips the stage to `.booked` and tears the match screen down, then a failed
//  RPC reverts it to `.introduced` and mounts a FRESH match screen. The failure
//  state therefore has to outlive that view, so it lives here.
//
//  The optimistic-UI contract:
//    tap → fire `client_pick` telemetry → `applyPick` (instant `.booked`)
//        → `client_pick` RPC → on success `refreshSoon()` (reconcile).
//  Error branches (R106 §6):
//    already_picked → quiet `refreshSoon()`, keep the booked view (a sibling
//                     device won; the refresh brings the real slot).
//    slot_stale     → `revertPick`, surface the stale state.
//    not_found/other→ `revertPick`, surface an inline retry (slot stays tappable).
//

import Foundation
import Observation

@MainActor
@Observable
final class MatchBookingModel {

    /// A booking failure kind. Scoped to a lead via `failedLeadId`, so the
    /// re-mounted picker only shows an error meant for the request it is
    /// actually rendering.
    enum Failure: Equatable {
        /// The chosen time has passed — offer to message the studio.
        case stale
        /// Network / unknown — offer an inline retry; the slot stays tappable.
        case retry
    }

    private(set) var failure: Failure?
    private(set) var failedLeadId: UUID?

    @ObservationIgnored private var task: Task<Void, Never>?
    private let statusService: DesignRequestStatusService
    private let bookingService: DesignServicesService

    init(
        statusService: DesignRequestStatusService = .shared,
        bookingService: DesignServicesService = .shared
    ) {
        self.statusService = statusService
        self.bookingService = bookingService
    }

    /// The failure for `leadId`, if any.
    func failure(for leadId: UUID) -> Failure? {
        failedLeadId == leadId ? failure : nil
    }

    /// Book `slot` for `request`: telemetry, optimistic flip, RPC, reconcile /
    /// revert. No-op if the request carries no introduction.
    func book(request: DesignRequestStatus, slot: IntroductionSlot) {
        guard let introduction = request.introduction else { return }
        let leadId = request.leadId
        let ceremonyId = introduction.ceremonyId

        failure = nil
        failedLeadId = nil

        MatchCeremonyAnalytics.pick(
            leadId: leadId,
            ceremonyId: ceremonyId,
            slotId: slot.id,
            offeredAt: introduction.offeredAt
        )

        // Optimistic: flip to .booked instantly.
        statusService.applyPick(leadId: leadId, slotId: slot.id, startsAt: slot.startsAt)

        task?.cancel()
        task = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.bookingService.pickIntroductionSlot(ceremonyId: ceremonyId, slotId: slot.id)
                self.statusService.refreshSoon()
            } catch {
                switch PickIntroductionError.map(error) {
                case .alreadyPicked:
                    // A sibling device won — keep the booked view, reconcile quietly.
                    self.statusService.refreshSoon()
                case .slotStale:
                    self.statusService.revertPick(leadId: leadId)
                    self.failedLeadId = leadId
                    self.failure = .stale
                case .notFound, .failed:
                    self.statusService.revertPick(leadId: leadId)
                    self.failedLeadId = leadId
                    self.failure = .retry
                }
            }
        }
    }
}
