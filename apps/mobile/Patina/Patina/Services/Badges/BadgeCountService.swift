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

    /// True once a refresh has completed for an authenticated session.
    /// Guests never load — the rail renders invitations, not counts.
    private(set) var hasLoaded: Bool = false

    /// True when the last authenticated refresh came back with nothing at
    /// all — every one of the five fetches failed. Distinguishes "still
    /// waiting" from "we couldn't reach your studio", which the home needs
    /// to decide between a skeleton and a retry (U45).
    private(set) var lastRefreshFailed: Bool = false

    private var pendingRefresh: Task<Void, Never>?

    private init() {}

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
            hasLoaded = false
            lastRefreshFailed = false
            return
        }

        async let decisionsFetch = try? DecisionsAPIClient.shared.listPending()
        async let summariesFetch = try? MessagingAPIClient.shared.listThreadSummaries()
        async let proposalsFetch = try? ProposalsAPIClient.shared.listProposals()
        async let invoicesFetch = try? InvoicesAPIClient.shared.listInvoices()
        async let projectsFetch = try? ProjectsAPIClient.shared.listProjects()
        let (decisions, summaries, proposals, invoices, projects) = await (
            decisionsFetch, summariesFetch, proposalsFetch, invoicesFetch, projectsFetch
        )

        if let decisions {
            pendingDecisionCount = decisions.count
        }
        if let summaries {
            let me = ThreadListViewModel.currentUserId()
            unreadMessageCount = summaries
                .filter { ThreadListViewModel.isUnread($0, me: me) }
                .count
        }
        if let proposals {
            proposalsAwaitingSignatureCount = proposals.filter { $0.isSignable }.count
        }
        if let invoices {
            payableInvoiceCount = invoices.filter { $0.isPayable }.count
        }
        if let projects {
            projectCount = projects.count
        }
        if decisions != nil || summaries != nil || proposals != nil
            || invoices != nil || projects != nil {
            hasLoaded = true
            lastRefreshFailed = false
        } else {
            lastRefreshFailed = true
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
