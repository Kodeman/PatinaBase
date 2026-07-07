//  WorkDashboardModel.swift
//  Capture · Wave W (Work dashboard)
//
//  W1 state. Work has no service of its own — it composes the four frozen
//  read services (projects, leads, decisions, messaging) from AppContainer
//  into one per-section-loaded model. Each section tracks its own state so a
//  failure in one (e.g. the network drops mid-fetch) never blocks or blanks
//  the others, and a retry only re-runs that one section.

import Foundation
import CaptureKit

/// Independent load state for one dashboard section. `.loaded` is only
/// reached with a non-empty collection — a successful-but-empty fetch is
/// `.empty` so the screen can render a designed empty state instead of an
/// empty list under a header.
enum WorkSectionState<Element> {
    case loading
    case loaded([Element])
    case empty
    case error(String)
}

extension WorkSectionState {
    /// True once this section has real content on screen — used to decide
    /// whether a (re)load should show the skeleton again (no, it would flash
    /// on a pull-to-refresh) or fetch quietly behind the existing rows.
    var hasContent: Bool {
        if case .loaded = self { return true }
        return false
    }
}

@Observable
@MainActor
final class WorkDashboardModel {
    private let projectsService: any ProjectsService
    private let leadsService: any LeadsService
    private let decisionsService: any DecisionsReadService
    private let messagingService: any MessagingService

    var projects: WorkSectionState<FieldProject> = .loading
    var leads: WorkSectionState<FieldLead> = .loading
    var decisions: WorkSectionState<FieldDecision> = .loading
    var threads: WorkSectionState<FieldThread> = .loading

    init(container: AppContainer) {
        self.projectsService = container.projects
        self.leadsService = container.leads
        self.decisionsService = container.decisions
        self.messagingService = container.messaging
    }

    /// Initial load + pull-to-refresh: all four sections concurrently, each
    /// keeping its own success/failure independent of the others.
    func loadAll() async {
        async let p = loadProjects()
        async let l = loadLeads()
        async let d = loadDecisions()
        async let m = loadThreads()
        _ = await (p, l, d, m)
    }

    func loadProjects() async {
        if !projects.hasContent { projects = .loading }
        do {
            let items = try await projectsService.listProjects()
            projects = items.isEmpty ? .empty : .loaded(items)
        } catch {
            projects = .error("Couldn't load projects")
        }
    }

    func loadLeads() async {
        if !leads.hasContent { leads = .loading }
        do {
            let items = try await leadsService.listOpenLeads()
            leads = items.isEmpty ? .empty : .loaded(items)
        } catch {
            leads = .error("Couldn't load leads")
        }
    }

    func loadDecisions() async {
        if !decisions.hasContent { decisions = .loading }
        do {
            let items = try await decisionsService.listPending()
            decisions = items.isEmpty ? .empty : .loaded(items)
        } catch {
            decisions = .error("Couldn't load decisions")
        }
    }

    func loadThreads() async {
        if !threads.hasContent { threads = .loading }
        do {
            let items = try await messagingService.listThreads()
            threads = items.isEmpty ? .empty : .loaded(items)
        } catch {
            threads = .error("Couldn't load messages")
        }
    }
}
