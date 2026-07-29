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

    /// Short enough to sit beneath the collapsed Companion mark.
    var hint: String? {
        if awaitingCount == 1 { return "1 thing needs your eye" }
        if awaitingCount > 1 { return "\(awaitingCount) things need your eye" }
        if unreadConversationCount == 1 { return "1 new conversation" }
        if unreadConversationCount > 1 { return "\(unreadConversationCount) new conversations" }
        if unreadUpdateCount == 1 { return "1 new Studio update" }
        if unreadUpdateCount > 1 { return "\(unreadUpdateCount) new Studio updates" }
        if activeProjectCount == 1 { return "1 project is moving" }
        if activeProjectCount > 1 { return "\(activeProjectCount) projects are moving" }
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
}
