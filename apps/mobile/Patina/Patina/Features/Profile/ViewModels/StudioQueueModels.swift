//
//  StudioQueueModels.swift
//  Patina
//
//  Shared, state-first models for the Studio hub and Companion attention hint.
//

import Foundation

enum StudioQueueSectionKind: String, CaseIterable, Identifiable {
    case awaitingYou
    case inProgress
    case conversation
    case moneyAndDocuments
    case archive

    var id: String { rawValue }

    /// `W1R2-m2`: what VoiceOver reads on the section badge. The count is
    /// spoken in words (P-24), so the noun after it has to agree with the word
    /// — it read "one categories" on every section holding a single kind of
    /// thing. It lives with the section rather than with the view because the
    /// noun belongs to the section, and because a ruled string is a fact a
    /// test can hold.
    func badgeLabel(count: Int) -> String {
        let word = PatinaCount.inWords(count)
        return self == .awaitingYou
            ? "\(word) \(count == 1 ? "thing" : "things") awaiting you"
            : "\(word) \(count == 1 ? "category" : "categories")"
    }

    var title: String {
        switch self {
        case .awaitingYou: return "Awaiting you"
        case .inProgress: return "In progress"
        case .conversation: return "Conversation"
        case .moneyAndDocuments: return "Money & documents"
        case .archive: return "Archive"
        }
    }

    var systemImage: String {
        switch self {
        case .awaitingYou: return "hand.raised"
        case .inProgress: return "clock.arrow.circlepath"
        case .conversation: return "bubble.left.and.bubble.right"
        case .moneyAndDocuments: return "doc.text"
        case .archive: return "archivebox"
        }
    }

    var emptyMessage: String {
        switch self {
        case .awaitingYou: return "Nothing needs a decision."
        case .inProgress: return "No active projects yet."
        case .conversation: return "No project conversations yet."
        case .moneyAndDocuments: return "No shared records yet."
        case .archive: return "Nothing has been archived."
        }
    }
}

struct StudioQueueRow: Identifiable {
    let id: String
    let title: String
    let detail: String
    let meta: String?
    let systemImage: String
    let route: AppRoute

    /// Lower numbers appear first within a section.
    let priority: Int
    let sortDate: Date?

    var accessibilityLabel: String {
        [title, detail, meta]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: ", ")
    }
}

struct StudioQueueSection: Identifiable {
    let kind: StudioQueueSectionKind
    let rows: [StudioQueueRow]

    var id: String { kind.id }
}

struct StudioAttentionSummary: Equatable {
    let awaitingCount: Int
    let unreadConversationCount: Int
    let unreadUpdateCount: Int
    let activeProjectCount: Int

    static let empty = StudioAttentionSummary(
        awaitingCount: 0,
        unreadConversationCount: 0,
        unreadUpdateCount: 0,
        activeProjectCount: 0
    )

    /// SP-16: the one attention sentence, so the Studio subhead, the Companion
    /// and the Daily Room cannot phrase the same number three ways.
    /// P-24: counted in words, not figures — the doorstep's ruled form.
    static func attentionHint(count: Int) -> String? {
        if count == 1 { return "One thing needs your eye" }
        if count > 1 { return "\(PatinaCount.inWordsCapitalized(count)) things need your eye" }
        return nil
    }

    /// Short enough to sit beneath the collapsed Companion mark.
    var hint: String? {
        if let attention = Self.attentionHint(count: awaitingCount) { return attention }
        if unreadConversationCount == 1 { return "One new conversation" }
        if unreadConversationCount > 1 {
            return "\(PatinaCount.inWordsCapitalized(unreadConversationCount)) new conversations"
        }
        if unreadUpdateCount == 1 { return "One new Studio update" }
        if unreadUpdateCount > 1 {
            return "\(PatinaCount.inWordsCapitalized(unreadUpdateCount)) new Studio updates"
        }
        if activeProjectCount == 1 { return "One project is moving" }
        if activeProjectCount > 1 {
            return "\(PatinaCount.inWordsCapitalized(activeProjectCount)) projects are moving"
        }
        return nil
    }
}

struct StudioQueueSnapshot {
    let sections: [StudioQueueSection]
    let attentionSummary: StudioAttentionSummary

    static let empty = StudioQueueSnapshot(
        sections: StudioQueueSectionKind.allCases.map {
            StudioQueueSection(kind: $0, rows: [])
        },
        attentionSummary: .empty
    )

    func section(_ kind: StudioQueueSectionKind) -> StudioQueueSection {
        sections.first(where: { $0.kind == kind })
            ?? StudioQueueSection(kind: kind, rows: [])
    }

    var hasContent: Bool {
        sections.contains { !$0.rows.isEmpty }
    }
}

struct StudioQueueInput {
    let projects: [RemoteProject]
    let decisions: [RemoteClientDecision]
    let proposals: [RemoteProposal]
    let invoices: [RemoteInvoice]
    let documents: [RemoteProjectDocument]
    let threads: [RemoteCommsThreadSummary]
    let notifications: [RemoteNotification]
    let currentUserId: String?
    let now: Date
    /// W5 / Q6: the client's orders over both rails, already merged by
    /// `ClientOrderBuilder`. Last and defaulted so the nine existing call sites
    /// keep compiling — a Studio built before the orders land simply carries no
    /// Ordered row, which is the same thing as having none.
    var orders: [ClientOrder] = []
}
