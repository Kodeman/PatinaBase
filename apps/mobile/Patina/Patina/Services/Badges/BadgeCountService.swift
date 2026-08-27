//
//  BadgeCountService.swift
//  Patina
//
//  Studio-rail badge counts (C.1 / R29). Two queries, mirroring the
//  portal's inbox shapes:
//
//   • pending decisions — `client_decisions` rows with `status=pending`,
//     RLS-scoped to this client. Same query shape the decision inbox
//     (`DecisionsListViewModel` → `DecisionsAPIClient.listPending`) and
//     the portal's `use-inbox` hook issue.
//   • unread messages — comms threads whose latest counterpart message
//     postdates the caller's `comms_thread_participants.last_read_at`.
//     The predicate is `ThreadListViewModel.isUnread`, extracted from the
//     inbox row builder so the badge and the list can't drift.
//
//  Refresh policy (R29 ruling): polling floor only this wave — refresh on
//  scenePhase→active, on home appear, and on push receipt. NO realtime
//  subscription; realtime is a Wave 2 question gated on verifying
//  publication membership for `client_decisions` / `comms_messages`.
//

import Foundation

/// App-wide badge counts for the Studio rail. `@Observable` so the rail
/// re-renders when a refresh lands.
@MainActor
@Observable
final class BadgeCountService {

    static let shared = BadgeCountService()

    /// `client_decisions` awaiting this client (status = pending).
    private(set) var pendingDecisionCount: Int = 0

    /// Comms threads with an unread counterpart message.
    private(set) var unreadMessageCount: Int = 0

    /// Proposals still awaiting the client's signature (sent/viewed, not
    /// expired). Wave 2 / D.1 money rail.
    private(set) var proposalsAwaitingSignatureCount: Int = 0

    /// Invoices the client can pay (sent/partially_paid, positive balance).
    /// Wave 2 / D.2 money rail.
    private(set) var payableInvoiceCount: Int = 0

    /// Projects the client has with a design studio (`public.projects`, RLS
    /// `client_id = auth.uid()`). Drives the engagement-tier gate: a project
    /// is the signal that unlocks the full Studio hub (see `EngagementTier`).
    private(set) var projectCount: Int = 0

    /// The rows themselves, retained so `DesignerRelationshipResolver` and the
    /// Record (W2) read what this service already fetched instead of issuing
    /// the same queries again. Each array is the one the matching count was
    /// computed from, so a row list and its count can never disagree.
    private(set) var pendingDecisions: [RemoteClientDecision] = []
    private(set) var pendingProposals: [RemoteProposal] = []
    private(set) var payableInvoices: [RemoteInvoice] = []
    private(set) var threadSummaries: [RemoteCommsThreadSummary] = []
    private(set) var projects: [RemoteProject] = []

    /// The client's active `designer_clients` rows — the attribution roster.
    /// Expected empty until a client SELECT policy on `designer_clients`
    /// exists; see `RosterAPIClient`.
    private(set) var roster: [RosterDesigner] = []

    /// SP-16: THE attention count. One number, computed once, printed by the
    /// Profile/Studio subhead, the Companion (which is the footer on both the
    /// Studio and the Daily Room) and the Daily Room itself.
    ///
    /// It counts ITEMS, not rows — four things needing the client is four,
    /// even where the Studio groups them into three cards.
    var attentionCount: Int {
        pendingDecisionCount + proposalsAwaitingSignatureCount + payableInvoiceCount
    }

    /// That count as the one sentence every surface prints.
    var attentionHint: String? {
        StudioAttentionSummary.attentionHint(count: attentionCount)
    }

    /// Projects that are still live work — the last rung of `studioHint`.
    var activeProjectCount: Int {
        projects.filter { !StudioQueueBuilder.projectIsArchived($0) }.count
    }

    /// THE Studio sentence, and the reason `attentionHint` alone is not it.
    ///
    /// `attentionHint` is nil whenever nothing is *awaiting* the client, so a
    /// surface that printed it alone told a client with three unread threads
    /// and no decisions "Nothing needs your attention right now." directly
    /// above a Conversation block reading "3 unread threads". The count stays
    /// single-sourced; the rest of the chain `StudioAttentionSummary.hint`
    /// always had comes back with it.
    ///
    /// The one rung it cannot carry is unread Studio *updates*
    /// (`notification_log`), which this service does not fetch — consumers
    /// that have a Studio snapshot fall through to `attentionSummary.hint`
    /// for it.
    var studioHint: String? {
        if let attention = attentionHint { return attention }
        if unreadMessageCount == 1 { return "1 new conversation" }
        if unreadMessageCount > 1 { return "\(unreadMessageCount) new conversations" }
        if activeProjectCount == 1 { return "1 project is moving" }
        if activeProjectCount > 1 { return "\(activeProjectCount) projects are moving" }
        return nil
    }

    /// True once a refresh has completed for an authenticated session.
    /// Guests never load — the rail renders invitations, not counts.
    private(set) var hasLoaded: Bool = false

    /// True when the last authenticated refresh came back with nothing at
    /// all — every one of the five fetches failed. Distinguishes "still
    /// waiting" from "we couldn't reach your studio", which the home needs
    /// to decide between a skeleton and a retry (U45).
    private(set) var lastRefreshFailed: Bool = false

    private var pendingRefresh: Task<Void, Never>?

    /// Private on purpose: this service exists because two surfaces read two
    /// different objects and printed two different numbers. A second instance
    /// reproduces that by accident.
    private init() {}

    #if DEBUG
    /// A detached instance for tests, which need to `apply(…)` fixtures
    /// without touching the singleton every other surface reads.
    static func makeForTests() -> BadgeCountService { BadgeCountService() }
    #endif

    /// Fetch both counts. Guests resolve to zero without a network round
    /// trip — the rail hides counts in guest mode anyway. Failures keep
    /// the previous counts (a stale floor beats a flickering zero).
    func refresh() async {
        guard AuthService.shared.isAuthenticated else {
            pendingDecisionCount = 0
            unreadMessageCount = 0
            proposalsAwaitingSignatureCount = 0
            payableInvoiceCount = 0
            projectCount = 0
            pendingDecisions = []
            pendingProposals = []
            payableInvoices = []
            threadSummaries = []
            projects = []
            roster = []
            hasLoaded = false
            lastRefreshFailed = false
            return
        }

        async let decisionsFetch = try? DecisionsAPIClient.shared.listPending()
        async let summariesFetch = try? MessagingAPIClient.shared.listThreadSummaries()
        async let proposalsFetch = try? ProposalsAPIClient.shared.listProposals()
        async let invoicesFetch = try? InvoicesAPIClient.shared.listInvoices()
        async let projectsFetch = try? ProjectsAPIClient.shared.listProjects()
        async let rosterFetch = try? RosterAPIClient.shared.listRoster()
        let (decisions, summaries, proposals, invoices, fetchedProjects) = await (
            decisionsFetch, summariesFetch, proposalsFetch, invoicesFetch, projectsFetch
        )
        let fetchedRoster = await rosterFetch

        apply(
            decisions: decisions, summaries: summaries, proposals: proposals,
            invoices: invoices, projects: fetchedProjects, roster: fetchedRoster
        )
        if decisions != nil || summaries != nil || proposals != nil
            || invoices != nil || fetchedProjects != nil {
            hasLoaded = true
            lastRefreshFailed = false
        } else {
            lastRefreshFailed = true
        }
    }

    /// Fold a set of fetched rows into the counts and the retained rows. A
    /// `nil` argument means that fetch failed and its previous value stands —
    /// a stale floor beats a flickering zero.
    ///
    /// The roster is deliberately not part of the load verdict its caller
    /// computes: under today's `designer_clients` RLS an empty array IS the
    /// successful answer, so counting it would mask a total failure of the
    /// five queries that actually carry the rail.
    /// Each fetch is a distinct queue with its own failure, so the arity is
    /// inherent — bundling them into a struct would only move it.
    func apply( // swiftlint:disable:this function_parameter_count
        decisions: [RemoteClientDecision]?,
        summaries: [RemoteCommsThreadSummary]?,
        proposals: [RemoteProposal]?,
        invoices: [RemoteInvoice]?,
        projects fetchedProjects: [RemoteProject]?,
        roster fetchedRoster: [RosterDesigner]?,
        now: Date = Date()
    ) {
        if let decisions {
            // The Studio counts `!isResolved`, not every row `listPending`
            // returns — a `status='pending'` row carrying `responded_at` is
            // answered. One predicate, so the header cannot outrun the rows.
            pendingDecisions = decisions.filter { !$0.isResolved }
            pendingDecisionCount = pendingDecisions.count
        }
        if let summaries {
            let me = ThreadListViewModel.currentUserId()
            threadSummaries = summaries
            unreadMessageCount = summaries
                .filter { ThreadListViewModel.isUnread($0, me: me) }
                .count
        }
        if let proposals {
            // `isAwaitingSignature`, not `isSignable`: the Studio's rows use
            // it, and `isSignable` reads a Postgres `date` as "no expiry".
            pendingProposals = proposals.filter { $0.isAwaitingSignature(now: now) }
            proposalsAwaitingSignatureCount = pendingProposals.count
        }
        if let invoices {
            payableInvoices = invoices.filter { $0.isPayable }
            payableInvoiceCount = payableInvoices.count
        }
        if let fetchedProjects {
            projects = fetchedProjects
            projectCount = fetchedProjects.count
        }
        if let fetchedRoster {
            roster = fetchedRoster
        }
    }

    /// Debounced refresh for bursty triggers (push receipt can deliver a
    /// banner and a tap back-to-back). Coalesces calls within the window.
    func refreshSoon(after delay: Duration = .seconds(1)) {
        pendingRefresh?.cancel()
        pendingRefresh = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
