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
import UserNotifications

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

    /// Unread DELIVERED updates in the bell — the number the bell badge draws.
    ///
    /// It lives here, and only here, because it used to live in two places:
    /// Today held its own `NotificationsViewModel` in `@State` and computed the
    /// badge from it, while the feed held a second one, and `markRead` mutated
    /// only the feed's. So a client read every row, popped back, and the bell
    /// still badged three (`C2-07`). A badge that lies is the fastest way to
    /// teach someone to stop looking at it.
    ///
    /// Studio-composed fallback rows never count: they were never delivered,
    /// so they have no arrival and no read state to report (`C5`). They are
    /// already spoken for by `attentionCount`, which is the OTHER half of
    /// VISION's one-number rule — this is the delivered half, on one surface.
    private(set) var unreadNotificationCount: Int = 0

    /// Publish the feed's own rows into the one count every surface reads.
    /// Called by `NotificationsViewModel` on load and after each mark-read, so
    /// the bell can never disagree with the list behind it.
    func applyNotificationRows(_ rows: [AppNotification]) {
        unreadNotificationCount = rows.filter { !$0.isStudioFallback && !$0.isRead }.count
        writeSpringboardBadge(unreadNotificationCount)
    }

    /// R5's home-screen badge, carrying the count above it — P-05 is what makes
    /// that number true. Injectable: the real center needs a grant tests lack.
    var writeSpringboardBadge: (Int) -> Void = { count in
        UNUserNotificationCenter.current().setBadgeCount(count) { error in
            if let error { PatinaLog.ui.error("[Badge] refused: \(error.localizedDescription)") }
        }
    }

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

    /// True once the **projects** fetch itself has answered for this session.
    ///
    /// `hasLoaded` above means "at least one of five queries answered", which
    /// is the right predicate for the rail (a stale floor beats a flickering
    /// zero) and the wrong one for anything that must know whether a client
    /// HAS a designer. W5's R3 turns on exactly that: with `listProjects()`
    /// alone failing, `projects` keeps its previous value — `[]` on a cold
    /// launch — and a client with an active project resolves to `.none`, which
    /// is the one relationship that draws Buy. This flag says only what it
    /// knows: the projects answer arrived.
    private(set) var projectsLoaded: Bool = false

    /// True when the last authenticated refresh came back with nothing at
    /// all — every one of the five fetches failed. Distinguishes "still
    /// waiting" from "we couldn't reach your studio", which the home needs
    /// to decide between a skeleton and a retry (U45).
    private(set) var lastRefreshFailed: Bool = false

    private var pendingRefresh: Task<Void, Never>?

    /// The refresh currently running. A foreground fans two asks at this
    /// service within the same tick — the app root's (`RecordForeground
    /// .onForeground`) and Today's own `scenePhase` hook — and each ask is six
    /// PostgREST reads. The second joins the first instead of doubling them.
    private var inFlightRefresh: Task<Void, Never>?

    /// Stamped on the refresh that is in flight, and bumped by every session
    /// change. A refresh that left for the PREVIOUS account and answers after
    /// the reset must not write its rows back over the cleared service — which
    /// is the whole point of the reset, and the one way joining an in-flight
    /// refresh could reintroduce it.
    private var refreshToken = 0

    /// R-02: what the last successful refresh knew, kept across launches.
    ///
    /// Without it a cold launch on a dead network does not degrade, it
    /// DELETES: the counts start at zero, the pill loses its number and the
    /// bell tells VoiceOver "No unread notifications" — all of it asserted,
    /// none of it fetched.
    private struct PersistedCounts: Codable {
        let pendingDecisionCount: Int
        let unreadMessageCount: Int
        let proposalsAwaitingSignatureCount: Int
        let payableInvoiceCount: Int
        let projectCount: Int
        /// R-02, second half. The counts alone restore the numbers and lose the
        /// SEAT: `DesignerSeat.make` reads these rows, not `projectCount`, so
        /// an offline cold launch drew a house with no designer in it — the
        /// walk's shots 36/37. Decoded as `[]` on a payload written before this
        /// field existed, which is the same floor the counts already have.
        /// Optional so a payload written before this field existed still
        /// decodes — an absent key is `nil`, not a decode failure that would
        /// throw the whole floor away.
        let projects: [RemoteProject]?
        /// `R-02`, the seat's PROJECT. `projects` alone brings the seat back
        /// but not the one it named: `DesignerSeat.activeProject` resolves the
        /// urgent NEEDS YOU row against these three collections — the only
        /// place a row's `project_id` survives — and with them empty it falls
        /// through to `active.first`, so a cold offline Today seated Leah on
        /// the most-recently-updated project instead of the one the Record is
        /// about. Restored for the same reason `projects` is, and under the
        /// same contract: a floor to draw, never a claim that a fetch
        /// answered. Optional for the same forward-compatibility reason.
        let pendingDecisions: [RemoteClientDecision]?
        let pendingProposals: [RemoteProposal]?
        let payableInvoices: [RemoteInvoice]?
        let storedAt: Date
    }

    /// When the restored floor was written — `nil` until one is restored, and
    /// `nil` again the moment the floor is dropped.
    ///
    /// `L07-05` / `W1-B-16`: `PersistedCounts` has always carried `storedAt`;
    /// `restorePersistedCounts()` simply threw it away. The Studio header
    /// prints `studioHint`, which on a cold launch is the floor's number, so an
    /// offline cold launch printed "5 things need your eye" as current above
    /// "We couldn't gather your Studio…" with no staleness line anywhere in the
    /// tree — the warm shape printed it, because the warm shape has an
    /// in-process `lastSuccessAt` to name. This is that timestamp, kept.
    ///
    /// It is deliberately NOT `hasLoaded`: like the counts it restores beside,
    /// it is a record of when something was last true, never a claim that a
    /// fetch answered.
    private(set) var floorStoredAt: Date?

    /// Whether the counts this service is holding draw anything at all.
    ///
    /// `floorStoredAt` says a floor was WRITTEN, and one is written for an
    /// account with nothing in it too — five zeros and four empty arrays. The
    /// Studio's staleness line dates what the screen is SHOWING, so a floor
    /// that draws nothing must not date an empty Studio: before `W1-B-16` that
    /// shape printed no line, and it should not have gained one.
    var drawsAnyCount: Bool {
        pendingDecisionCount > 0 || unreadMessageCount > 0
            || proposalsAwaitingSignatureCount > 0 || payableInvoiceCount > 0
            || projectCount > 0
    }

    private static let persistedCountsKey = "patina.badge_counts.last_successful.v1"

    private let defaults: UserDefaults

    /// Private on purpose: this service exists because two surfaces read two
    /// different objects and printed two different numbers. A second instance
    /// reproduces that by accident.
    private init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        restorePersistedCounts()
    }

    #if DEBUG
    /// A detached instance for tests, which need to `apply(…)` fixtures
    /// without touching the singleton every other surface reads.
    ///
    /// The omitted argument is a **private, empty suite**, never `.standard`:
    /// `init` now calls `restorePersistedCounts()`, so a `.standard` default
    /// would read the running simulator's own
    /// `patina.badge_counts.last_successful.v1` into five of the six counts and
    /// make every suite that omits it clone-dependent (`RL1F-33`). The suites
    /// that need the counts to persist across two instances pass their own.
    static func makeForTests(defaults: UserDefaults? = nil) -> BadgeCountService {
        BadgeCountService(
            defaults: defaults
                ?? UserDefaults(suiteName: "patina.tests.badges.\(UUID().uuidString)")
                ?? .standard
        )
    }
    #endif

    /// Draw the last numbers that answered, with `hasLoaded` and
    /// `projectsLoaded` left **false**: they are a floor to draw, not a claim
    /// that a fetch answered. `unreadNotificationCount` is deliberately not
    /// among them — the bell's count is the feed's own rows, and a restored
    /// number would badge updates this process has never seen.
    private func restorePersistedCounts() {
        guard let data = defaults.data(forKey: Self.persistedCountsKey) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let stored = try? decoder.decode(PersistedCounts.self, from: data) else { return }
        pendingDecisionCount = stored.pendingDecisionCount
        unreadMessageCount = stored.unreadMessageCount
        proposalsAwaitingSignatureCount = stored.proposalsAwaitingSignatureCount
        payableInvoiceCount = stored.payableInvoiceCount
        projectCount = stored.projectCount
        // `projectsLoaded` stays FALSE: these rows are a floor to draw, not a
        // claim that `listProjects()` answered. Everything that gates on a
        // fetch having landed still waits for one.
        projects = stored.projects ?? []
        pendingDecisions = stored.pendingDecisions ?? []
        pendingProposals = stored.pendingProposals ?? []
        payableInvoices = stored.payableInvoices ?? []
        floorStoredAt = stored.storedAt
    }

    private func persistCounts(now: Date = Date()) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let stored = PersistedCounts(
            pendingDecisionCount: pendingDecisionCount,
            unreadMessageCount: unreadMessageCount,
            proposalsAwaitingSignatureCount: proposalsAwaitingSignatureCount,
            payableInvoiceCount: payableInvoiceCount,
            projectCount: projectCount,
            projects: projects,
            pendingDecisions: pendingDecisions,
            pendingProposals: pendingProposals,
            payableInvoices: payableInvoices,
            storedAt: now
        )
        guard let data = try? encoder.encode(stored) else { return }
        defaults.set(data, forKey: Self.persistedCountsKey)
        floorStoredAt = now
    }

    #if DEBUG
    /// The R-02 write, reachable without the six network round trips
    /// `performRefresh(token:)` takes to get to it. Production calls it from
    /// that method's `hasLoaded = true` branch and nowhere else — which
    /// `BadgeCountPersistenceTests` pins in source.
    func persistCountsForTesting() { persistCounts() }
    #endif

    /// Fetch both counts. Guests resolve to zero without a network round
    /// trip — the rail hides counts in guest mode anyway. Failures keep
    /// the previous counts (a stale floor beats a flickering zero).
    func refresh() async {
        if let existing = inFlightRefresh {
            await existing.value
            return
        }
        refreshToken += 1
        let token = refreshToken
        let task = Task { @MainActor [weak self] in
            await self?.performRefresh(token: token)
            guard let self, self.refreshToken == token else { return }
            self.inFlightRefresh = nil
        }
        inFlightRefresh = task
        await task.value
    }

    private func performRefresh(token: Int) async {
        guard AuthService.shared.isAuthenticated else {
            pendingDecisionCount = 0
            unreadMessageCount = 0
            unreadNotificationCount = 0
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
            projectsLoaded = false
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

        // The account changed while these were in the air: these are the
        // previous account's rows and there is nothing here to write them to.
        guard token == refreshToken else { return }

        apply(
            decisions: decisions, summaries: summaries, proposals: proposals,
            invoices: invoices, projects: fetchedProjects, roster: fetchedRoster
        )
        if decisions != nil || summaries != nil || proposals != nil
            || invoices != nil || fetchedProjects != nil {
            hasLoaded = true
            lastRefreshFailed = false
            // R-02: only a refresh that answered leaves a floor behind. A run
            // where every fetch failed must not overwrite the last numbers
            // that were true with the zeros it did not learn.
            persistCounts()
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
            projectsLoaded = true
        }
        if let fetchedRoster {
            roster = fetchedRoster
        }
    }

    /// Drop the previous account's rows and counts, and cancel the refresh
    /// that was going to land on top of them.
    ///
    /// `hasLoaded` and `projectsLoaded` go back to false rather than staying
    /// true over empty arrays: `projectsLoaded` is what W5's R3 reads to tell
    /// "this client has no designer" from "the projects answer has not
    /// arrived", and a cleared service that claims to have loaded would draw
    /// Buy for a client who has one.
    func resetForSessionChange() {
        refreshToken += 1
        pendingRefresh?.cancel()
        pendingRefresh = nil
        // Dropped rather than awaited: the next `refresh()` must start a fetch
        // for the NEW account, not join the one already in the air for the old.
        inFlightRefresh?.cancel()
        inFlightRefresh = nil
        pendingDecisionCount = 0
        unreadMessageCount = 0
        unreadNotificationCount = 0
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
        projectsLoaded = false
        lastRefreshFailed = false
        // R-02: the floor is the PREVIOUS account's, home screen included.
        // Without this, account B's first launch paints account A's numbers.
        defaults.removeObject(forKey: Self.persistedCountsKey)
        floorStoredAt = nil
        writeSpringboardBadge(0)
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
