//  WorkDashboardModel.swift
//  Capture · Option B Work realm
//
//  Work composes existing list seams and local CaptureStore state. Every
//  source loads independently: available attention stays visible when another
//  source fails, and no detail/N+1 fetches are used.

import Foundation
import CaptureKit

enum WorkSectionState<Element> {
    case loading
    case loaded([Element])
    case empty
    case error(String)
}

extension WorkSectionState {
    var hasContent: Bool {
        if case .loaded = self { return true }
        return false
    }

    var items: [Element] {
        if case .loaded(let items) = self { return items }
        return []
    }

    var count: Int? {
        switch self {
        case .loaded(let items): items.count
        case .empty: 0
        case .loading, .error: nil
        }
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    var errorMessage: String? {
        if case .error(let message) = self { return message }
        return nil
    }
}

enum WorkDataSource: String, CaseIterable, Identifiable {
    case projects
    case leads
    case decisions
    case messages
    case receiving

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

struct WorkLoadIssue: Identifiable {
    let source: WorkDataSource
    let message: String
    var id: WorkDataSource { source }
}

@Observable
@MainActor
final class WorkDashboardModel {
    private let projectsService: any ProjectsService
    private let leadsService: any LeadsService
    private let decisionsService: any DecisionsReadService
    private let messagingService: any MessagingService
    private let receivingService: any ReceivingService
    private let siteScanService: any SiteScanService
    private let store: CaptureStore

    var projects: WorkSectionState<FieldProject> = .loading
    var leads: WorkSectionState<FieldLead> = .loading
    var decisions: WorkSectionState<FieldDecision> = .loading
    var threads: WorkSectionState<FieldThread> = .loading
    var arrivingPOs: WorkSectionState<FieldArrivingPO> = .loading
    private(set) var captures: [FieldCaptureActivity] = []
    private(set) var scanUploads: [FieldScanPendingUpload] = []

    init(container: AppContainer) {
        projectsService = container.projects
        leadsService = container.leads
        decisionsService = container.decisions
        messagingService = container.messaging
        receivingService = container.receiving
        siteScanService = container.siteScan
        store = container.store
        refreshLocalCaptures()
    }

    var attention: FieldAttentionSnapshot {
        FieldAttentionBuilder.build(
            projects: projects.items,
            leads: leads.items,
            decisions: decisions.items,
            threads: threads.items,
            arrivingPOs: arrivingPOs.items,
            captures: captures,
            scanUploads: scanUploads
        )
    }

    var hasLoadingSources: Bool {
        projects.isLoading || leads.isLoading || decisions.isLoading
            || threads.isLoading || arrivingPOs.isLoading
    }

    var loadIssues: [WorkLoadIssue] {
        [
            projects.errorMessage.map { WorkLoadIssue(source: .projects, message: $0) },
            leads.errorMessage.map { WorkLoadIssue(source: .leads, message: $0) },
            decisions.errorMessage.map { WorkLoadIssue(source: .decisions, message: $0) },
            threads.errorMessage.map { WorkLoadIssue(source: .messages, message: $0) },
            arrivingPOs.errorMessage.map { WorkLoadIssue(source: .receiving, message: $0) }
        ].compactMap { $0 }
    }

    /// Initial load + pull-to-refresh. These are the five existing list calls,
    /// run concurrently; local capture activity is a single store read.
    func loadAll() async {
        refreshLocalCaptures()
        async let p: Void = loadProjects()
        async let l: Void = loadLeads()
        async let d: Void = loadDecisions()
        async let m: Void = loadThreads()
        async let r: Void = loadReceiving()
        async let s: Void = loadScanUploads()
        _ = await (p, l, d, m, r, s)
    }

    func retry(_ source: WorkDataSource) async {
        switch source {
        case .projects: await loadProjects()
        case .leads: await loadLeads()
        case .decisions: await loadDecisions()
        case .messages: await loadThreads()
        case .receiving: await loadReceiving()
        }
    }

    func loadProjects() async {
        if !projects.hasContent { projects = .loading }
        do {
            let items = try await projectsService.listProjects()
            projects = items.isEmpty ? .empty : .loaded(items)
        } catch {
            projects = .error("Projects couldn’t load")
        }
    }

    func loadLeads() async {
        if !leads.hasContent { leads = .loading }
        do {
            let items = try await leadsService.listOpenLeads()
            leads = items.isEmpty ? .empty : .loaded(items)
        } catch {
            leads = .error("Leads couldn’t load")
        }
    }

    func loadDecisions() async {
        if !decisions.hasContent { decisions = .loading }
        do {
            let items = try await decisionsService.listPending()
            decisions = items.isEmpty ? .empty : .loaded(items)
        } catch {
            decisions = .error("Decisions couldn’t load")
        }
    }

    func loadThreads() async {
        if !threads.hasContent { threads = .loading }
        do {
            let items = try await messagingService.listThreads()
            threads = items.isEmpty ? .empty : .loaded(items)
        } catch {
            threads = .error("Messages couldn’t load")
        }
    }

    func loadReceiving() async {
        if !arrivingPOs.hasContent { arrivingPOs = .loading }
        do {
            let items = try await receivingService.arrivingPOs()
            arrivingPOs = items.isEmpty ? .empty : .loaded(items)
        } catch {
            arrivingPOs = .error("Receiving couldn’t load")
        }
    }

    func loadScanUploads() async {
        scanUploads = await siteScanService.pendingUploads()
    }

    private func refreshLocalCaptures() {
        captures = store.search(SpecimenQuery())
            .filter { $0.transferState.phase != .complete }
            .map {
            FieldCaptureActivity(
                id: $0.id,
                title: $0.title,
                status: $0.status,
                destination: $0.destination,
                transferPhase: $0.transferState.phase,
                updatedAt: $0.updatedAt
            )
        }
    }
}
