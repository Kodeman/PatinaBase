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

    func load(proposalId: String) async {
        isLoading = true
        error = nil
        async let proposalTask = try? await ProposalsAPIClient.shared.fetchProposal(id: proposalId)
        async let itemsTask = (try? await ProposalsAPIClient.shared.fetchItems(proposalId: proposalId)) ?? []
        async let sectionsTask = (try? await ProposalsAPIClient.shared.fetchSections(proposalId: proposalId)) ?? []
        async let phasesTask = (try? await ProposalsAPIClient.shared.fetchPhases(proposalId: proposalId)) ?? []
        async let milestonesTask = (try? await ProposalsAPIClient.shared.fetchMilestones(proposalId: proposalId)) ?? []
        async let exclusionsTask = (try? await ProposalsAPIClient.shared.fetchExclusions(proposalId: proposalId)) ?? []
        async let scopeRoomsTask = (try? await ProposalsAPIClient.shared.fetchScopeRooms(proposalId: proposalId)) ?? []
        async let boardsTask = (try? await ProposalsAPIClient.shared.fetchBoards(proposalId: proposalId)) ?? []

        let loaded = await (
            proposalTask, itemsTask, sectionsTask, phasesTask,
            milestonesTask, exclusionsTask, scopeRoomsTask, boardsTask
        )
        self.proposal = loaded.0
        self.items = loaded.1
        self.sections = loaded.2
        self.phases = loaded.3
        self.milestones = loaded.4
        self.exclusions = loaded.5
        self.scopeRooms = loaded.6
        self.boards = loaded.7
        self.isLoading = false
        if self.proposal == nil {
            self.error = "Couldn't load this proposal"
        }
    }

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
            self.signError = (error as? LocalizedError)?.errorDescription
                ?? "Couldn't sign the proposal. Please try again."
            #if DEBUG
            PatinaLog.ui.error("[Proposals] sign failed: \(error.localizedDescription)")
            #endif
        }
        isSigning = false
    }
}
