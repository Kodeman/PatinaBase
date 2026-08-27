//
//  StudioQueueBuilder.swift
//  Patina
//
//  Converts the app's existing project-domain records into one prioritized,
//  state-first Studio queue. It performs no network work and is testable.
//
// swiftlint:disable file_length

import Foundation

@MainActor
enum StudioQueueBuilder {
    static func build(_ input: StudioQueueInput) -> StudioQueueSnapshot {
        let context = StudioQueueContext(input)
        let rowsBySection: [StudioQueueSectionKind: [StudioQueueRow]] = [
            .awaitingYou: awaitingRows(context),
            .inProgress: inProgressRows(context),
            .conversation: conversationRows(context),
            .moneyAndDocuments: moneyAndDocumentRows(context),
            .archive: archiveRows(context)
        ]

        return StudioQueueSnapshot(
            sections: StudioQueueSectionKind.allCases.map {
                StudioQueueSection(kind: $0, rows: rowsBySection[$0] ?? [])
            },
            attentionSummary: StudioAttentionSummary(
                awaitingCount: context.pendingDecisions.count
                    + context.pendingProposals.count
                    + context.payableInvoices.count,
                unreadConversationCount: context.unreadThreads.count,
                unreadUpdateCount: context.unreadNotifications.count,
                activeProjectCount: context.activeProjects.count
            )
        )
    }

    /// Whether a project has stopped being live work. Internal because
    /// `DesignerRelationshipResolver` asks the same question and the two must
    /// not drift.
    static func projectIsArchived(_ project: RemoteProject) -> Bool {
        guard let status = project.status?.lowercased() else { return false }
        return ["completed", "cancelled", "canceled", "archived", "inactive"].contains(status)
    }

    /// `RemoteInvoiceDesignerRef.displayName` returns the literal string
    /// "your designer" when its embed brought no name. That sentinel is not a
    /// name and must not be printed as one.
    static func named(_ value: String?) -> String? {
        guard let value, !value.isEmpty, value != "your designer" else { return nil }
        return value
    }

    /// The same waiting things, one row each, with their own dates and their
    /// own destinations — what the Record's NEEDS YOU half is built from.
    ///
    /// The Studio hub groups ("Decisions · 2 project choices are ready"); the
    /// Record cannot, because a row on the Record is one thing that happened
    /// on one date. Both shapes read the same three predicates
    /// (`!isResolved`, `isAwaitingSignature(now:)`, `isPayable`), so the card
    /// and the hub can never disagree about what is waiting.
    ///
    /// Ordered by the date each was asked, ascending — the Record's order.
    /// `designerFallback` is used only where the row's own embed brought no
    /// name; nil leaves the row unattributed rather than guessing.
    static func itemizedAwaitingRows( // swiftlint:disable:this function_body_length
        decisions: [RemoteClientDecision],
        proposals: [RemoteProposal],
        invoices: [RemoteInvoice],
        designerFallback: String?,
        now: Date
    ) -> [StudioQueueItemRow] {
        let decisionRows = decisions
            .filter { !$0.isResolved }
            .map { decision in
                StudioQueueItemRow(
                    id: "decision:\(decision.id)",
                    kind: .decision,
                    entityId: decision.id,
                    title: decision.title ?? "A project choice is ready",
                    detail: decision.project?.name,
                    askedAt: parsedDate(decision.created_at),
                    dueAt: parsedDate(decision.due_date),
                    amountCents: nil,
                    designerName: decision.project?.designer?.displayName ?? designerFallback,
                    route: .decisionDetail(decisionId: decision.id)
                )
            }

        let proposalRows = proposals
            .filter { $0.isAwaitingSignature(now: now) }
            .map { proposal in
                StudioQueueItemRow(
                    id: "proposal:\(proposal.id)",
                    kind: .proposal,
                    entityId: proposal.id,
                    title: proposal.title ?? "A proposal is ready to review",
                    detail: proposal.project?.name,
                    askedAt: parsedDate(proposal.sent_at ?? proposal.created_at),
                    dueAt: parsedDate(proposal.valid_until),
                    amountCents: proposal.total_amount,
                    // `list_client_proposals()` returns jsonb and takes no
                    // PostgREST embed, so a proposal has no designer of its
                    // own to read.
                    designerName: designerFallback,
                    route: .proposalDetail(proposalId: proposal.id)
                )
            }

        let invoiceRows = invoices
            .filter(\.isPayable)
            .map { invoice in
                StudioQueueItemRow(
                    id: "invoice:\(invoice.id)",
                    kind: .invoice,
                    entityId: invoice.id,
                    title: invoice.invoice_number ?? "Your invoice",
                    detail: invoice.project?.name,
                    askedAt: parsedDate(invoice.sent_at ?? invoice.issue_date ?? invoice.created_at),
                    dueAt: parsedDate(invoice.due_date),
                    amountCents: invoice.balanceCents,
                    designerName: Self.named(invoice.designer?.displayName)
                        ?? designerFallback,
                    route: .invoiceDetail(invoiceId: invoice.id)
                )
            }

        return (decisionRows + proposalRows + invoiceRows).sorted {
            ($0.askedAt ?? .distantFuture, $0.id) < ($1.askedAt ?? .distantFuture, $1.id)
        }
    }
}

/// One waiting thing, flat. Deliberately not a `StudioQueueRow`: that type
/// carries a card's presentation (a system image, a section priority) and no
/// entity id, and the Record needs the entity and its dates.
struct StudioQueueItemRow: Identifiable, Sendable, Equatable {

    enum Kind: String, Sendable {
        case decision, proposal, invoice
    }

    let id: String
    let kind: Kind
    let entityId: String
    let title: String
    let detail: String?
    /// When the designer asked — the Record orders NEEDS YOU by this.
    let askedAt: Date?
    let dueAt: Date?
    /// The invoice's remaining balance, or the proposal's total. Nil for a
    /// decision, which has no one figure.
    let amountCents: Int?
    let designerName: String?
    let route: AppRoute
}

@MainActor
private struct StudioQueueContext {
    let input: StudioQueueInput
    let pendingDecisions: [RemoteClientDecision]
    let pendingProposals: [RemoteProposal]
    let payableInvoices: [RemoteInvoice]
    let activeProjects: [RemoteProject]
    let archivedProjects: [RemoteProject]
    let unreadThreads: [RemoteCommsThreadSummary]
    let unreadNotifications: [RemoteNotification]

    init(_ input: StudioQueueInput) {
        let userId = input.currentUserId ?? ThreadListViewModel.currentUserId()
        self.input = input
        self.pendingDecisions = input.decisions.filter { !$0.isResolved }
        self.pendingProposals = input.proposals.filter {
            $0.isAwaitingSignature(now: input.now)
        }
        self.payableInvoices = input.invoices.filter(\.isPayable)
        self.activeProjects = input.projects.filter {
            !StudioQueueBuilder.projectIsArchived($0)
        }
        self.archivedProjects = input.projects.filter(StudioQueueBuilder.projectIsArchived)
        self.unreadThreads = input.threads.filter {
            ThreadListViewModel.isUnread($0, me: userId?.lowercased())
        }
        self.unreadNotifications = input.notifications.filter(
            StudioQueueBuilder.notificationIsUnread
        )
    }
}

private extension StudioQueueBuilder {
    static func awaitingRows(_ context: StudioQueueContext) -> [StudioQueueRow] {
        [
            payableInvoiceRow(context),
            pendingDecisionRow(context),
            pendingProposalRow(context)
        ]
        .compactMap { $0 }
        .sorted(by: rowComesFirst)
    }

    static func payableInvoiceRow(_ context: StudioQueueContext) -> StudioQueueRow? {
        guard !context.payableInvoices.isEmpty else { return nil }
        let invoices = context.payableInvoices
        let balance = invoices.reduce(0) { $0 + $1.balanceCents }
        let dueDate = invoices.compactMap { parsedDate($0.due_date) }.min()

        return StudioQueueRow(
            id: "awaiting.invoices",
            title: countLabel(invoices.count, singular: "Invoice", plural: "Invoices"),
            detail: "\(PatinaCurrency.format(cents: balance)) remaining",
            meta: dueDate.map { dueLabel($0, now: context.input.now) },
            systemImage: "creditcard",
            route: .invoiceList,
            priority: urgencyPriority(
                date: dueDate,
                now: context.input.now,
                tieBreaker: 0
            ),
            sortDate: dueDate
        )
    }

    static func pendingDecisionRow(_ context: StudioQueueContext) -> StudioQueueRow? {
        guard !context.pendingDecisions.isEmpty else { return nil }
        let decisions = context.pendingDecisions
        let dueDate = decisions.compactMap { parsedDate($0.due_date) }.min()
        let detail = decisions.count == 1
            ? (decisions[0].title ?? "A project decision is ready")
            : "\(decisions.count) project choices are ready"

        return StudioQueueRow(
            id: "awaiting.decisions",
            title: countLabel(decisions.count, singular: "Decision", plural: "Decisions"),
            detail: detail,
            meta: dueDate.map { dueLabel($0, now: context.input.now) },
            systemImage: "checkmark.circle",
            route: .decisionList,
            priority: urgencyPriority(
                date: dueDate,
                now: context.input.now,
                tieBreaker: 1
            ),
            sortDate: dueDate
        )
    }

    static func pendingProposalRow(_ context: StudioQueueContext) -> StudioQueueRow? {
        guard !context.pendingProposals.isEmpty else { return nil }
        let proposals = context.pendingProposals
        let expiry = proposals.compactMap { parsedDate($0.valid_until) }.min()
        let detail = proposals.count == 1
            ? (proposals[0].title ?? "A proposal is ready to review")
            : "\(proposals.count) proposals are ready to review"

        return StudioQueueRow(
            id: "awaiting.proposals",
            title: countLabel(proposals.count, singular: "Proposal", plural: "Proposals"),
            detail: detail,
            meta: expiry.map { "Review by \(DateDisplay.short($0))" },
            systemImage: "signature",
            route: .proposalList,
            priority: urgencyPriority(
                date: expiry,
                now: context.input.now,
                tieBreaker: 2
            ),
            sortDate: expiry
        )
    }
}

private extension StudioQueueBuilder {
    static func inProgressRows(_ context: StudioQueueContext) -> [StudioQueueRow] {
        guard let row = activeProjectRow(context) else { return [] }
        return [row]
    }

    static func activeProjectRow(_ context: StudioQueueContext) -> StudioQueueRow? {
        let projects = context.activeProjects
        guard !projects.isEmpty else { return nil }
        let mostRecent = projects.max {
            (parsedDate($0.updated_at) ?? .distantPast)
                < (parsedDate($1.updated_at) ?? .distantPast)
        }
        let detail = projects.count == 1
            ? (mostRecent?.name ?? "Your project")
            : "\(mostRecent?.name ?? "Your projects") and \(projects.count - 1) more"

        return StudioQueueRow(
            id: "progress.projects",
            title: countLabel(
                projects.count,
                singular: "Active project",
                plural: "Active projects"
            ),
            detail: detail,
            meta: mostRecent?.current_phase.map(PhaseDisplay.clientLabel(for:)),
            systemImage: "folder",
            route: .projectList,
            priority: 0,
            sortDate: mostRecent.flatMap { parsedDate($0.updated_at) }
        )
    }

    static func conversationRows(_ context: StudioQueueContext) -> [StudioQueueRow] {
        [
            conversationThreadRow(context),
            notificationRow(context)
        ]
        .compactMap { $0 }
        .sorted(by: rowComesFirst)
    }

    /// SP-13: emitted even at zero threads. Returning nil there left the
    /// Studio's Conversation block as the one block drawn without a route —
    /// a dead end that read as "messaging does not exist".
    static func conversationThreadRow(_ context: StudioQueueContext) -> StudioQueueRow? {
        let threads = context.input.threads
        let unreadCount = context.unreadThreads.count
        // Not "Start one with your designer": the Studio hub is reachable at
        // `.engaged`, which includes a client whose request is still pooled
        // with nobody claimed. `ThreadListView`'s CTA is gated on `isLive`
        // and offers them "Track your request" instead, so this line has to
        // be true for both.
        let detail = threads.isEmpty
            ? "No messages yet"
            : (unreadCount == 0
               ? "All caught up"
               : countLabel(unreadCount, singular: "1 unread thread",
                            plural: "\(unreadCount) unread threads"))

        return StudioQueueRow(
            id: "conversation.threads",
            title: threads.isEmpty
                ? "Conversation"
                : countLabel(threads.count, singular: "Conversation", plural: "Conversations"),
            detail: detail,
            meta: nil,
            systemImage: "bubble.left.and.bubble.right",
            route: .threadList,
            priority: unreadCount == 0 ? 10 : 0,
            sortDate: threads.compactMap {
                parsedDate($0.last_message_at ?? $0.latestMessage?.created_at)
            }.max()
        )
    }

    static func notificationRow(_ context: StudioQueueContext) -> StudioQueueRow? {
        let notifications = context.input.notifications
        guard !notifications.isEmpty else { return nil }
        let unreadCount = context.unreadNotifications.count
        let detail = unreadCount == 0
            ? "All updates read"
            : countLabel(
                unreadCount,
                singular: "1 unread update",
                plural: "\(unreadCount) unread updates"
            )

        return StudioQueueRow(
            id: "conversation.updates",
            title: "Studio updates",
            detail: detail,
            meta: nil,
            systemImage: "bell",
            route: .notifications,
            priority: unreadCount == 0 ? 11 : 1,
            sortDate: notifications.compactMap { parsedDate($0.created_at) }.max()
        )
    }
}

private extension StudioQueueBuilder {
    static func moneyAndDocumentRows(_ context: StudioQueueContext) -> [StudioQueueRow] {
        [
            proposalRecordRow(context.input.proposals),
            invoiceRecordRow(context.input.invoices),
            documentRecordRow(context.input.documents),
            budgetRecordRow(context.input.projects)
        ]
        .compactMap { $0 }
        .sorted(by: rowComesFirst)
    }

    static func proposalRecordRow(_ proposals: [RemoteProposal]) -> StudioQueueRow? {
        guard !proposals.isEmpty else { return nil }
        let accepted = proposals.filter { $0.status == "accepted" }.count

        return StudioQueueRow(
            id: "records.proposals",
            title: "Proposals",
            detail: countLabel(
                proposals.count,
                singular: "1 shared proposal",
                plural: "\(proposals.count) shared proposals"
            ),
            meta: accepted > 0
                ? countLabel(accepted, singular: "1 accepted", plural: "\(accepted) accepted")
                : nil,
            systemImage: "doc.badge.ellipsis",
            route: .proposalList,
            priority: 0,
            sortDate: proposals.compactMap {
                parsedDate($0.updated_at ?? $0.created_at)
            }.max()
        )
    }

    static func invoiceRecordRow(_ invoices: [RemoteInvoice]) -> StudioQueueRow? {
        guard !invoices.isEmpty else { return nil }
        let paid = invoices.filter(\.isPaid).count

        return StudioQueueRow(
            id: "records.invoices",
            title: "Invoices",
            detail: countLabel(
                invoices.count,
                singular: "1 shared invoice",
                plural: "\(invoices.count) shared invoices"
            ),
            meta: paid > 0
                ? countLabel(paid, singular: "1 paid", plural: "\(paid) paid")
                : nil,
            systemImage: "creditcard",
            route: .invoiceList,
            priority: 1,
            sortDate: invoices.compactMap { parsedDate($0.created_at) }.max()
        )
    }

    static func documentRecordRow(
        _ documents: [RemoteProjectDocument]
    ) -> StudioQueueRow? {
        guard !documents.isEmpty else { return nil }
        let projectCount = Set(documents.map(\.resolvedProjectId)).count

        return StudioQueueRow(
            id: "records.documents",
            title: "Documents",
            detail: countLabel(
                documents.count,
                singular: "1 shared file",
                plural: "\(documents.count) shared files"
            ),
            meta: projectCount > 0
                ? countLabel(
                    projectCount,
                    singular: "1 project",
                    plural: "\(projectCount) projects"
                )
                : nil,
            systemImage: "doc.text",
            route: .documentList,
            priority: 2,
            sortDate: documents.compactMap { parsedDate($0.created_at) }.max()
        )
    }

    static func budgetRecordRow(_ projects: [RemoteProject]) -> StudioQueueRow? {
        guard !projects.isEmpty else { return nil }
        return StudioQueueRow(
            id: "records.budget",
            title: "Budget",
            // SP-16: the row names what the screen computes.
            detail: "What's been billed, and what's been paid",
            meta: nil,
            systemImage: "chart.pie",
            route: .budget,
            priority: 3,
            sortDate: nil
        )
    }
}

private extension StudioQueueBuilder {
    static func archiveRows(_ context: StudioQueueContext) -> [StudioQueueRow] {
        [
            archivedProjectRow(context.archivedProjects),
            archivedProposalRow(context.input.proposals),
            voidedInvoiceRow(context.input.invoices)
        ]
        .compactMap { $0 }
        .sorted(by: rowComesFirst)
    }

    static func archivedProjectRow(_ projects: [RemoteProject]) -> StudioQueueRow? {
        guard !projects.isEmpty else { return nil }
        return StudioQueueRow(
            id: "archive.projects",
            title: countLabel(projects.count, singular: "Project", plural: "Projects"),
            detail: countLabel(
                projects.count,
                singular: "1 completed or archived project",
                plural: "\(projects.count) completed or archived projects"
            ),
            meta: nil,
            systemImage: "folder",
            route: .projectList,
            priority: 0,
            sortDate: projects.compactMap { parsedDate($0.updated_at) }.max()
        )
    }

    static func archivedProposalRow(
        _ proposals: [RemoteProposal]
    ) -> StudioQueueRow? {
        let archived = proposals.filter {
            $0.status == "declined" || $0.status == "expired"
        }
        guard !archived.isEmpty else { return nil }

        return StudioQueueRow(
            id: "archive.proposals",
            title: "Past proposals",
            detail: countLabel(
                archived.count,
                singular: "1 declined or expired proposal",
                plural: "\(archived.count) declined or expired proposals"
            ),
            meta: nil,
            systemImage: "doc.badge.ellipsis",
            route: .proposalList,
            priority: 1,
            sortDate: archived.compactMap {
                parsedDate($0.updated_at ?? $0.created_at)
            }.max()
        )
    }

    static func voidedInvoiceRow(_ invoices: [RemoteInvoice]) -> StudioQueueRow? {
        let voided = invoices.filter(\.isVoid)
        guard !voided.isEmpty else { return nil }

        return StudioQueueRow(
            id: "archive.invoices",
            title: "Voided invoices",
            detail: countLabel(
                voided.count,
                singular: "1 voided invoice",
                plural: "\(voided.count) voided invoices"
            ),
            meta: nil,
            systemImage: "creditcard",
            route: .invoiceList,
            priority: 2,
            sortDate: voided.compactMap { parsedDate($0.created_at) }.max()
        )
    }
}

private extension StudioQueueBuilder {

    static func notificationIsUnread(_ notification: RemoteNotification) -> Bool {
        notification.opened_at == nil
            && notification.status != "opened"
            && notification.status != "clicked"
    }

    static func rowComesFirst(_ lhs: StudioQueueRow, _ rhs: StudioQueueRow) -> Bool {
        if lhs.priority != rhs.priority { return lhs.priority < rhs.priority }
        return (lhs.sortDate ?? .distantFuture) < (rhs.sortDate ?? .distantFuture)
    }

    static func urgencyPriority(
        date: Date?,
        now: Date,
        tieBreaker: Int
    ) -> Int {
        guard let date else { return 30 + tieBreaker }
        let calendar = Calendar.current
        let due = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: now)
        if due < today { return tieBreaker }
        if due == today { return 10 + tieBreaker }
        return 20 + tieBreaker
    }

    /// SP-15: the Studio row and the money detail print the same line, from
    /// the same place, so they cannot drift.
    static func dueLabel(_ date: Date, now: Date) -> String {
        DateDisplay.due(date, now: now).text
    }

    static func parsedDate(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        return ISO8601DateParsing.dateOrDay(from: raw)
    }

    static func countLabel(
        _ count: Int,
        singular: String,
        plural: String
    ) -> String {
        count == 1 ? singular : plural
    }
}
