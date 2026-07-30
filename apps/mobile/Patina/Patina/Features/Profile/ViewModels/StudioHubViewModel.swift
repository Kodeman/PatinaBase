//
//  StudioHubViewModel.swift
//  Patina
//
//  Loads the existing project-domain sources concurrently, then publishes one
//  Studio snapshot. Partial failures preserve every source that did load.
//

import Foundation
import Observation

@MainActor
@Observable
final class StudioHubViewModel {
    static let shared = StudioHubViewModel()

    private(set) var snapshot: StudioQueueSnapshot = .empty
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var failedSources: [String] = []

    var attentionSummary: StudioAttentionSummary {
        snapshot.attentionSummary
    }

    var loadMessage: String? {
        guard !failedSources.isEmpty else { return nil }
        if failedSources.count == Self.sourceCount {
            return "We couldn’t gather your Studio. Check your connection and try again."
        }
        return "Some Studio details couldn’t be refreshed. What loaded is still shown."
    }

    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        await load()
    }

    func load() async {
        guard !isLoading else { return }
        guard AuthService.shared.isAuthenticated else {
            resetForGuest()
            return
        }

        isLoading = true
        failedSources = []

        async let projects = Self.fetchProjects()
        async let decisions = Self.fetchDecisions()
        async let proposals = Self.fetchProposals()
        async let invoices = Self.fetchInvoices()
        async let documents = Self.fetchDocuments()
        async let threads = Self.fetchThreads()
        async let notifications = Self.fetchNotifications()

        let loaded = await (
            projects,
            decisions,
            proposals,
            invoices,
            documents,
            threads,
            notifications
        )
        let result = StudioLoadResult(
            projects: loaded.0,
            decisions: loaded.1,
            proposals: loaded.2,
            invoices: loaded.3,
            documents: loaded.4,
            threads: loaded.5,
            notifications: loaded.6
        )
        apply(result)
    }

    private func apply(_ result: StudioLoadResult) {
        failedSources = result.failures
        snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: result.projects ?? [],
                decisions: result.decisions ?? [],
                proposals: result.proposals ?? [],
                invoices: result.invoices ?? [],
                documents: result.documents ?? [],
                threads: result.threads ?? [],
                notifications: result.notifications ?? [],
                currentUserId: nil,
                now: Date()
            )
        )
        hasLoaded = true
        isLoading = false

        #if DEBUG
        if !failedSources.isEmpty {
            PatinaLog.ui.error(
                "[Studio] partial load failed: \(failedSources.joined(separator: ", "))"
            )
        }
        #endif
    }

    private func resetForGuest() {
        snapshot = .empty
        failedSources = []
        hasLoaded = true
        isLoading = false
    }

    private static let sourceCount = 7

    nonisolated private static func fetchProjects() async -> [RemoteProject]? {
        try? await ProjectsAPIClient.shared.listProjects()
    }

    nonisolated private static func fetchDecisions() async -> [RemoteClientDecision]? {
        try? await DecisionsAPIClient.shared.listPending()
    }

    nonisolated private static func fetchProposals() async -> [RemoteProposal]? {
        try? await ProposalsAPIClient.shared.listProposals()
    }

    nonisolated private static func fetchInvoices() async -> [RemoteInvoice]? {
        try? await InvoicesAPIClient.shared.listInvoices()
    }

    nonisolated private static func fetchDocuments() async -> [RemoteProjectDocument]? {
        try? await DocumentsAPIClient.shared.listDocuments()
    }

    nonisolated private static func fetchThreads() async -> [RemoteCommsThreadSummary]? {
        try? await MessagingAPIClient.shared.listThreadSummaries()
    }

    nonisolated private static func fetchNotifications() async -> [RemoteNotification]? {
        try? await NotificationsAPIClient.shared.list()
    }
}

private struct StudioLoadResult {
    let projects: [RemoteProject]?
    let decisions: [RemoteClientDecision]?
    let proposals: [RemoteProposal]?
    let invoices: [RemoteInvoice]?
    let documents: [RemoteProjectDocument]?
    let threads: [RemoteCommsThreadSummary]?
    let notifications: [RemoteNotification]?

    var failures: [String] {
        [
            ("projects", projects == nil),
            ("decisions", decisions == nil),
            ("proposals", proposals == nil),
            ("invoices", invoices == nil),
            ("documents", documents == nil),
            ("conversations", threads == nil),
            ("updates", notifications == nil)
        ]
        .compactMap { name, failed in failed ? name : nil }
    }
}
