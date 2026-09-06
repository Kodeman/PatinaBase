//
//  ProposalsViewModel.swift
//  Patina
//
//  Client-side proposal workflow (Wave 2 / D.1): list proposals, view the
//  full document, and e-sign. Mirrors the client portal's proposals pages —
//  partitioning (awaiting review / signed / archive) matches
//  `partitionProposals`.
//

import SwiftUI

@Observable
@MainActor
final class ProposalListViewModel {
    var proposals: [RemoteProposal] = []
    var isLoading: Bool = false
    var error: String?

    /// Sent/viewed — awaiting the client's review + signature.
    var pending: [RemoteProposal] {
        proposals.filter { $0.status == "sent" || $0.status == "viewed" }
    }

    /// Accepted (signed).
    var accepted: [RemoteProposal] {
        proposals.filter { $0.status == "accepted" }
    }

    /// Declined / expired. ('revised' and 'draft' are intentionally hidden —
    /// mirrors the portal's partitionProposals.)
    var archived: [RemoteProposal] {
        proposals.filter { $0.status == "declined" || $0.status == "expired" }
    }

    var isEmpty: Bool {
        pending.isEmpty && accepted.isEmpty && archived.isEmpty
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            self.proposals = try await ProposalsAPIClient.shared.listProposals()
        } catch {
            self.error = "Couldn’t load proposals"
            #if DEBUG
            PatinaLog.ui.error("[Proposals] list failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }
}

@Observable
@MainActor
final class ProposalDetailViewModel {
    var proposal: RemoteProposal?
    var items: [RemoteProposalItem] = []
    var sections: [RemoteProposalSection] = []
    var phases: [RemoteProposalPhase] = []
    var milestones: [RemoteProposalMilestone] = []
    var exclusions: [RemoteProposalExclusion] = []
    var scopeRooms: [RemoteProposalScopeRoom] = []
    var boards: [RemoteProposalBoard] = []

    var isLoading: Bool = false
    var error: String?

    /// Drives the sign sheet presentation.
    var showSignSheet: Bool = false
    var isSigning: Bool = false
    var signError: String?
    /// Local mirror of a successful sign so the CTA collapses instantly (the
    /// server has already flipped the proposal to 'accepted').
    private(set) var didSign: Bool = false

    /// `P-19`. The seal, full screen, after the act — and only after one that
    /// landed in THIS session. A revisit shows the signed header, never the
    /// ceremony again: a mark that re-settles on every open is a badge
    /// pretending to be paper.
    var showSealMoment: Bool = false

    /// `IOSC-05`. The signature landed and the seal is owed, but the sign
    /// cover is still on screen.
    ///
    /// Two `fullScreenCover`s on one host cannot be swapped in a single state
    /// mutation: UIKit is asked to present the second while the first's
    /// dismissal is in flight and drops it, so the payoff of the whole
    /// ceremony silently never appears. The act therefore only ARMS the seal;
    /// the host fires it from the sign cover's `onDismiss`, one runloop later,
    /// with nothing in flight.
    private(set) var sealPending: Bool = false

    /// The name she typed, for the line beneath the mark. The server's
    /// `signed_by_name` arrives on the next load; this is what the seal has.
    private(set) var signedName: String?

    /// `P-19`. The edition line above the restated terms, from the two fields
    /// `get_client_proposal_bundle` already returns (00407:366). Nil where the
    /// bundle carried neither — the line is absent rather than invented.
    var editionLine: String? {
        ProposalSignActCopy.edition(
            version: proposal?.version, issuedAt: proposal?.sent_at
        )
    }

    /// The studio that now holds her signature. Resolved from the project the
    /// app already holds, matched on the proposal's own `project_id` — the
    /// bundle carries no designer embed, and a studio name is never invented
    /// (`W1R2-M2`'s rule).
    ///
    /// `W2R1-m2`: a person's name is NOT a studio name. `displayName` used to
    /// stand in when `business_name` was empty, so the seal read "Leah
    /// Hartwell has your signature." where the ruling says a studio. Nil is
    /// the honest answer; `whatHappensNext` says "Your studio" over it.
    var signingStudio: String? {
        guard let projectId = proposal?.project_id else { return nil }
        return BadgeCountService.shared.projects
            .first { $0.id == projectId }?
            .designerStudioName
    }

    /// `P-26`. The copy of a signed proposal. Nil while it is unsigned — a
    /// record of a decision nobody has taken yet is not a record.
    ///
    /// `signedName` is what THIS session typed; `signed_by_name` is what the
    /// row carries on a later visit. Neither is invented, and where both are
    /// absent the sheet prints no name.
    func record(now: Date = Date()) -> RecordOfDecision? {
        guard isSigned, let proposal else { return nil }
        return .proposal(
            proposal,
            studio: signingStudio,
            signedName: signedName,
            signedAt: didSign ? now : nil
        )
    }

    /// Signed either server-side or just now.
    var isSigned: Bool {
        didSign || proposal?.isSigned == true
    }

    /// The client can sign while the proposal is live and unsigned.
    var canSign: Bool {
        !isSigned && (proposal?.isSignable == true)
    }

    /// R-05: how long the detail may sit blank before it admits failure.
    ///
    /// The walk measured 65–185 seconds of "One moment…" on a screen that is
    /// also the landing target for a proposal push. The SDK read now carries
    /// a 30 s request budget (C4-16), which is still three times too long for
    /// a screen with nothing on it.
    static let fetchDeadline: TimeInterval = 10

    /// The row this screen was opened from, if the app already holds it.
    ///
    /// `R-05`'s fix line asks the skeleton to render the proposal's title
    /// "from the record row that launched it", and the navigation route
    /// carries only an id (review `RL1B2-15`). `BadgeCountService` is where
    /// Today and Studio already keep those rows, so the detail can name the
    /// proposal a tester opened without waiting on a fetch that may be about
    /// to time out. `nil` on a cold launch from a push, which is the case the
    /// grey skeleton still covers.
    static func knownRecord(for proposalId: String) -> RemoteProposal? {
        BadgeCountService.shared.pendingProposals.first { $0.id == proposalId }
    }

    /// One load at a time. The ten-second cap and the `.refreshable` that
    /// makes the retry reachable are what create the overlap: a pull-to-
    /// refresh returning at t=3 s populates the bundle, then the original
    /// `.task` hits its deadline at t=10 s and its catch clears every array
    /// over the page the reader is looking at (review `RL1B3-05`). Same guard
    /// as `RoomSyncCoordinator.inFlight` and `DailyRoomBatchQueue.isFlushing`.
    private var isInFlight = false

    func load(proposalId: String, deadline: TimeInterval = ProposalDetailViewModel.fetchDeadline) async {
        // Claimed before the first `await`, or two callers in the same tick
        // both pass it.
        guard !isInFlight else { return }
        isInFlight = true
        defer { isInFlight = false }

        isLoading = true
        error = nil
        do {
            let bundle = try await Self.withDeadline(deadline) {
                try await ProposalsAPIClient.shared.fetchProposalBundle(id: proposalId)
            }
            self.proposal = bundle.proposal
            self.items = bundle.proposal.items ?? []
            self.sections = bundle.sections
            self.phases = bundle.phases
            self.milestones = bundle.payment_milestones
            self.exclusions = bundle.exclusions
            self.scopeRooms = bundle.scope_rooms
            self.boards = bundle.boards
        } catch {
            self.proposal = nil
            self.items = []
            self.sections = []
            self.phases = []
            self.milestones = []
            self.exclusions = []
            self.scopeRooms = []
            self.boards = []
            self.error = "Couldn’t load this proposal"
            #if DEBUG
            PatinaLog.ui.error("[Proposals] detail failed: \(error.localizedDescription)")
            #endif
        }
        self.isLoading = false
    }

    /// Run `work`, or give up at `deadline` — whichever comes first.
    ///
    /// A cancelled `URLSession` task throws, which lands in `load`'s existing
    /// catch, so the timeout needs no branch of its own.
    static func withDeadline<T: Sendable>(
        _ deadline: TimeInterval,
        _ work: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await work() }
            group.addTask {
                try await Task.sleep(for: .seconds(deadline))
                throw ProposalLoadTimeout()
            }
            defer { group.cancelAll() }
            guard let first = try await group.next() else { throw ProposalLoadTimeout() }
            return first
        }
    }

    struct ProposalLoadTimeout: Error {}

    func beginSigning() {
        guard canSign, !isSigning else { return }
        signError = nil
        showSignSheet = true
    }

    func cancelSigning() {
        showSignSheet = false
    }

    /// Sign with the typed name. On success the proposal is 'accepted'
    /// server-side; we collapse the CTA and dismiss the sheet.
    func sign(proposalId: String, name: String) async {
        guard !isSigning else { return }
        isSigning = true
        signError = nil
        do {
            try await ProposalsAPIClient.shared.signProposal(proposalId: proposalId, signedName: name)
            self.armSeal(name: name)
        } catch {
            // SP-15 / C5: Patina's words, never the server's.
            MoneyFailureCopy.log("sign", error)
            self.signError = MoneyFailureCopy.sign(error).sentence
        }
        isSigning = false
    }

    /// `IOSC-05`. The act landed: record it, dismiss the sign cover, and ARM
    /// the seal. Presenting it is the host's job one runloop later, which is
    /// why this sets `sealPending` and not `showSealMoment`.
    func armSeal(name: String) {
        didSign = true
        signedName = name
        showSignSheet = false
        sealPending = true
    }

    /// `IOSC-05`. The sign cover has finished dismissing; present the seal if
    /// one is owed.
    ///
    /// Idempotent and one-way: a cancelled act arms nothing, so a dismissal
    /// that follows "Not yet" opens no seal, and a second call cannot re-open
    /// a seal already shown and dismissed.
    func signCoverDismissed() {
        guard sealPending else { return }
        sealPending = false
        showSealMoment = true
    }
}
