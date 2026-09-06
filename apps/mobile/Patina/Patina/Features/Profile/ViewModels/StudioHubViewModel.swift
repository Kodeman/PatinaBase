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

    /// When every source last answered. `nil` until one refresh has come back
    /// clean.
    private(set) var lastSuccessAt: Date?

    /// The rows each source last returned successfully.
    ///
    /// R-01: `apply()` rebuilt the snapshot from `result.x ?? []`, so a source
    /// that FAILED was written back as zero — and the sections say "Awaiting
    /// you 0 / Nothing needs a decision.", "Money & documents 0 / No shared
    /// records yet." under a header reading "5 things need your eye". A
    /// failure has to leave what we last knew standing, or the screen asserts
    /// the client has nothing on the strength of a request that never landed.
    private var held = HeldSources()

    private struct HeldSources {
        var projects: [RemoteProject] = []
        var decisions: [RemoteClientDecision] = []
        var approvals: [RemoteProjectApprovalReview] = []
        var proposals: [RemoteProposal] = []
        var invoices: [RemoteInvoice] = []
        var documents: [RemoteProjectDocument] = []
        var threads: [RemoteCommsThreadSummary] = []
        var notifications: [RemoteNotification] = []

        var isEmpty: Bool {
            projects.isEmpty && decisions.isEmpty && approvals.isEmpty && proposals.isEmpty
                && invoices.isEmpty && documents.isEmpty && threads.isEmpty
                && notifications.isEmpty
        }
    }

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

    /// L07-05: what the hub is showing is not what the studio holds.
    ///
    /// A sentence, deliberately — the walk's own constraint, carried from
    /// VISION §6: the staleness affordance is a word, never a dot and never a
    /// badge. `nil` whenever the last refresh answered, so a healthy screen
    /// says nothing extra.
    var stalenessLine: String? {
        guard !failedSources.isEmpty, hasSomethingToBeStale else { return nil }
        guard let retainedAt = lastSuccessAt ?? restoredFloorAt() else {
            return "We couldn’t reach your studio just now."
        }
        return "Last updated \(Self.stalenessFormatter.localizedString(for: retainedAt, relativeTo: Date()))."
    }

    /// Whether the screen is printing anything a failed refresh could have
    /// made stale.
    ///
    /// `W1-B-16`: `held` is this process's rows, so on a COLD launch it is
    /// empty and the guard above returned nil — while the header, which reads
    /// `BadgeCountService.studioHint`, was printing the restored floor's
    /// number as current. The floor is the other thing that can be stale, and
    /// it is the one the cold shape actually draws.
    private var hasSomethingToBeStale: Bool {
        !held.isEmpty || restoredFloorAt() != nil
    }

    /// When the persisted count floor the screen is DRAWING was last true,
    /// read through a seam so a test can drive the cold shape without a
    /// network or a shared singleton.
    ///
    /// `drawsAnyCount` is the second half: a floor is written for an account
    /// with nothing in it too, and dating an empty Studio — "Last updated 2
    /// minutes ago." over a screen with nothing on it — is a staleness claim
    /// about nothing, where before `W1-B-16` there was no line at all.
    @ObservationIgnored
    var restoredFloorAt: () -> Date? = {
        let badges = BadgeCountService.shared
        return badges.drawsAnyCount ? badges.floorStoredAt : nil
    }

    private static let stalenessFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter
    }()

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
        async let approvals = Self.fetchProjectApprovals()
        async let proposals = Self.fetchProposals()
        async let invoices = Self.fetchInvoices()
        async let documents = Self.fetchDocuments()
        async let threads = Self.fetchThreads()
        async let notifications = Self.fetchNotifications()
        // Not a `StudioLoadResult` source: its failure is its own (an order
        // read that fails costs the Ordered row and nothing else), and the
        // service is the one holder every order surface reads.
        await OrdersService.shared.refresh()

        let loaded = await (
            projects,
            decisions,
            proposals,
            invoices,
            documents,
            threads,
            notifications
        )
        let fetchedApprovals = await approvals
        let result = StudioLoadResult(
            projects: loaded.0,
            decisions: loaded.1,
            approvals: fetchedApprovals,
            proposals: loaded.2,
            invoices: loaded.3,
            documents: loaded.4,
            threads: loaded.5,
            notifications: loaded.6
        )
        apply(result)
    }

    /// Internal so `LoadStateHonestyTests` can drive a partial failure
    /// without a network.
    func apply(_ result: StudioLoadResult, now: Date = Date()) {
        failedSources = result.failures

        // R-01: `?? []` was `?? zero`. A source that failed now falls back to
        // the rows it last returned, so a failed fetch degrades the screen
        // instead of emptying it.
        held.projects = result.projects ?? held.projects
        held.approvals = result.approvals ?? held.approvals
        // `W2R2-M1`: `listPending` is a PostgREST read on `client_decisions`,
        // and 00467 hides every Stage-2 row from the homeowner behind it — so
        // the hub counted only her legacy rows while Today (through
        // `BadgeCountService.mergedDecisions`) and "Awaiting your call"
        // (through `DecisionsListViewModel`) counted both. Three surfaces, one
        // merge: the hub reads the projection through the same function, and
        // its number is Today's set.
        held.decisions = BadgeCountService.mergedDecisions(
            pending: result.decisions,
            approvals: result.approvals,
            previous: held.decisions,
            projects: held.projects
        ) ?? held.decisions
        held.proposals = result.proposals ?? held.proposals
        held.invoices = result.invoices ?? held.invoices
        held.documents = result.documents ?? held.documents
        held.threads = result.threads ?? held.threads
        held.notifications = result.notifications ?? held.notifications

        if failedSources.isEmpty { lastSuccessAt = now }

        snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: held.projects,
                decisions: held.decisions,
                proposals: held.proposals,
                invoices: held.invoices,
                documents: held.documents,
                threads: held.threads,
                notifications: held.notifications,
                currentUserId: nil,
                now: now,
                // Single-sourced: `OrdersService` holds what the Ordered
                // screen and the record's MOVED rows read, so the Studio row
                // cannot report a different number from the screen it opens.
                orders: OrdersService.shared.orders
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

    /// Drop the previous account's Studio.
    ///
    /// Deliberately NOT `resetForGuest()`, which leaves `hasLoaded` true — that
    /// is the right answer for a guest, who has nothing to load, and the wrong
    /// one here: it would keep `loadIfNeeded()` from ever asking for the new
    /// account's rows, and the hub would sit empty until something forced a
    /// full `load()`.
    func resetForSessionChange() {
        snapshot = .empty
        failedSources = []
        isLoading = false
        hasLoaded = false
        held = HeldSources()
        lastSuccessAt = nil
    }

    private func resetForGuest() {
        snapshot = .empty
        failedSources = []
        hasLoaded = true
        isLoading = false
        held = HeldSources()
        lastSuccessAt = nil
    }

    private static let sourceCount = 7

    nonisolated private static func fetchProjects() async -> [RemoteProject]? {
        try? await ProjectsAPIClient.shared.listProjects()
    }

    nonisolated private static func fetchDecisions() async -> [RemoteClientDecision]? {
        try? await DecisionsAPIClient.shared.listPending()
    }

    nonisolated private static func fetchProjectApprovals() async -> [RemoteProjectApprovalReview]? {
        try? await DecisionsAPIClient.shared.fetchProjectApprovalReviews()
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

struct StudioLoadResult {
    let projects: [RemoteProject]?
    let decisions: [RemoteClientDecision]?
    /// The Stage-2 projection, merged into `decisions` before the queue is
    /// built. Deliberately absent from `failures`: it is the second half of the
    /// one decision feed, not a source of its own, and `mergedDecisions` gives
    /// a failed half the same degrade every other source gets — the rows it
    /// last returned.
    let approvals: [RemoteProjectApprovalReview]?
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
