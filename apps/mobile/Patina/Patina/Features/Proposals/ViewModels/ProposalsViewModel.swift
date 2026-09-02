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
            self.error = "Couldn't load proposals"
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

    func load(proposalId: String, deadline: TimeInterval = ProposalDetailViewModel.fetchDeadline) async {
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
            self.error = "Couldn't load this proposal"
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
            self.didSign = true
            self.showSignSheet = false
        } catch {
            // SP-15 / C5: Patina's words, never the server's.
            MoneyFailureCopy.log("sign", error)
            self.signError = MoneyFailureCopy.sign(error).sentence
        }
        isSigning = false
    }
}
