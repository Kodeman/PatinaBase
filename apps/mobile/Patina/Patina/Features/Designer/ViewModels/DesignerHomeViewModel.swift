//
//  DesignerHomeViewModel.swift
//  Patina
//
//  Hydrates the designer dashboard from real Supabase data: projects,
//  open leads, pending decisions, unread message threads.
//

import SwiftUI

@Observable
@MainActor
final class DesignerHomeViewModel {

    // MARK: - State

    var projects: [RemoteProject] = []
    var leads: [RemoteLead] = []
    var pendingDecisions: [RemoteClientDecision] = []
    var threads: [RemoteCommsThread] = []
    var isLoading: Bool = false
    var error: String?

    // MARK: - Derived

    var activeProjects: [RemoteProject] {
        projects.filter { ($0.status ?? "") == "active" }
    }

    var totalUnread: Int {
        // Without a JOIN on participants.last_read_at and messages, this
        // is a rough proxy: count threads bumped in the last 24h.
        let cutoff = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-86400))
        return threads.filter { ($0.last_message_at ?? "") > cutoff }.count
    }

    // MARK: - Loading

    func load() async {
        isLoading = true
        error = nil
        async let projectsTask = (try? await ProjectsAPIClient.shared.listProjects()) ?? []
        async let leadsTask = (try? await ProjectsAPIClient.shared.listOpenLeads()) ?? []
        async let decisionsTask = (try? await DecisionsAPIClient.shared.listPending()) ?? []
        async let threadsTask = (try? await MessagingAPIClient.shared.listThreads()) ?? []

        let (p, l, d, t) = await (projectsTask, leadsTask, decisionsTask, threadsTask)
        self.projects = p
        self.leads = l
        self.pendingDecisions = d
        self.threads = t
        self.isLoading = false
    }
}
