//
//  ProjectsViewModel.swift
//  Patina
//
//  Read-only project list + detail for both client and designer roles.
//

import SwiftUI

@Observable
@MainActor
final class ProjectsListViewModel {
    var projects: [RemoteProject] = []
    var isLoading: Bool = false
    var error: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            self.projects = try await ProjectsAPIClient.shared.listProjects()
        } catch {
            self.error = "Couldn't load projects"
            #if DEBUG
            PatinaLog.ui.error("[Projects] list failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }
}

@Observable
@MainActor
final class ProjectDetailViewModel {
    var project: RemoteProject?
    var phases: [RemoteProjectPhase] = []
    var milestones: [RemotePaymentMilestone] = []
    var ffe: [RemoteFFEItem] = []
    var isLoading: Bool = false
    var error: String?

    /// The proposal this project activated from, if any (Wave 2 / D.1) —
    /// powers the "view proposal" push.
    var linkedProposalId: String?

    /// Whether this project has any client-visible invoices (Wave 2 / D.2) —
    /// powers the payments → invoices affordance.
    var hasInvoices: Bool = false

    func load(projectId: String) async {
        isLoading = true
        error = nil
        async let projectTask = (try? await ProjectsAPIClient.shared.fetchProject(id: projectId))
        async let phasesTask = (try? await ProjectsAPIClient.shared.listPhases(projectId: projectId)) ?? []
        async let milestonesTask = (try? await ProjectsAPIClient.shared.listMilestones(projectId: projectId)) ?? []
        async let ffeTask = (try? await ProjectsAPIClient.shared.listFFEItems(projectId: projectId)) ?? []
        async let proposalIdTask = try? await ProposalsAPIClient.shared.proposalId(forProject: projectId)
        async let invoicesTask = (try? await InvoicesAPIClient.shared.hasInvoices(forProject: projectId)) ?? false

        let (p, ph, mi, ff, prop, hasInv) = await (
            projectTask, phasesTask, milestonesTask, ffeTask, proposalIdTask, invoicesTask
        )
        self.project = p ?? nil
        self.phases = ph
        self.milestones = mi
        self.ffe = ff
        self.linkedProposalId = prop
        self.hasInvoices = hasInv
        self.isLoading = false
        if self.project == nil {
            self.error = "Couldn't load this project"
        }
    }
}
