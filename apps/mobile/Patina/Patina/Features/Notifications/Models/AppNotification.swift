//
//  AppNotification.swift
//  Patina
//
//  Model for in-app notifications
//

import SwiftUI

struct AppNotification: Identifiable {
    /// Local UUID for `Identifiable`. Stable per notification.
    let id: UUID
    /// Server-side row id from `notification_log.id`, when this entry came
    /// from the backend. `nil` for preview-only entries.
    let remoteId: String?
    let type: AppNotificationType
    let title: String
    let body: String
    let timestamp: Date
    var isRead: Bool
    /// Entity kind referenced by `notification_log.metadata.entity_type`
    /// (e.g. `"project"`, `"decision"`, `"thread"`, `"room"`, `"product"`).
    /// Drives feed-tap and APNs deep-link routing via `NotificationRouter`.
    let entityType: String?
    /// Entity id referenced by `notification_log.metadata.entity_id`. Format
    /// depends on the entity (UUID for rooms/projects/decisions/threads,
    /// freeform string for products).
    let entityId: String?
    /// SP-08: this row was composed from the Studio queue because
    /// `notification_log` held nothing, not delivered by the backend. It
    /// carries no read state and no time — inventing either would be the
    /// fabricated signal C5 forbids.
    let isStudioFallback: Bool
    /// Where a composed Studio row goes. A delivered row resolves its route
    /// from `entityType`/`entityId` through `NotificationRouter`; a composed
    /// one carries the Studio row's own route, so the bell and the Studio land
    /// a tap in the same place.
    let fallbackRoute: AppRoute?
    /// The entities a composed Studio row speaks for. The Studio's "Awaiting
    /// you" rows are AGGREGATES — one row reading "2 Proposals" — so a
    /// stand-in can cover several entities at once. `merge` retires it only
    /// once every one of them has a delivered row of its own; empty for a
    /// delivered row, which speaks for itself.
    let coveredEntityIds: [String]

    /// The one route a tap follows, whichever kind of row this is.
    var route: AppRoute? {
        fallbackRoute ?? NotificationRouter.route(for: self)
    }

    init(
        id: UUID = UUID(),
        remoteId: String? = nil,
        type: AppNotificationType,
        title: String,
        body: String,
        timestamp: Date,
        isRead: Bool = false,
        entityType: String? = nil,
        entityId: String? = nil,
        isStudioFallback: Bool = false,
        fallbackRoute: AppRoute? = nil,
        coveredEntityIds: [String] = []
    ) {
        self.id = id
        self.remoteId = remoteId
        self.type = type
        self.title = title
        self.body = body
        self.timestamp = timestamp
        self.isRead = isRead
        self.entityType = entityType
        self.entityId = entityId
        self.isStudioFallback = isStudioFallback
        self.fallbackRoute = fallbackRoute
        self.coveredEntityIds = coveredEntityIds
    }

    var icon: String {
        type.icon
    }

    var iconColor: Color {
        type.color
    }

    var timeAgo: String {
        let interval = Date().timeIntervalSince(timestamp)
        if interval < 60 { return "Just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        return "\(Int(interval / 86400))d ago"
    }
}

enum AppNotificationType: Equatable {
    case newRecommendations
    case designerResponse
    case styleUpdate
    case emergenceAlert
    case scanComplete
    /// SP-08: the three client-facing money/decision events 00534 writes.
    /// Without their own buckets they fell through to `.newRecommendations`
    /// and an invoice arrived titled "New pieces for you".
    case proposal
    case invoice
    case decision

    var icon: String {
        switch self {
        case .newRecommendations: return "sparkles"
        case .designerResponse: return "bubble.left.fill"
        case .styleUpdate: return "paintpalette.fill"
        case .emergenceAlert: return "star.fill"
        case .scanComplete: return "checkmark.circle.fill"
        case .proposal: return "doc.text"
        case .invoice: return "creditcard"
        case .decision: return "hand.raised"
        }
    }

    var color: Color {
        switch self {
        case .newRecommendations: return PatinaColors.clay
        case .designerResponse: return PatinaColors.dustyBlue
        case .styleUpdate: return PatinaColors.sage
        case .emergenceAlert: return PatinaColors.goldenHour
        case .scanComplete: return PatinaColors.success
        case .proposal: return PatinaColors.mocha
        case .invoice: return PatinaColors.terracotta
        case .decision: return PatinaColors.clayDeep
        }
    }

    /// The `metadata.entity_type` spelling this bucket corresponds to —
    /// lower-case, matching `NotificationRouter`'s table and 00534's contract.
    var entityType: String? {
        switch self {
        case .proposal: return "proposal"
        case .invoice: return "invoice"
        case .decision: return "decision"
        default: return nil
        }
    }
}

// MARK: - Preview Data

#if DEBUG
extension AppNotification {
    /// SwiftUI preview-only sample. Never read at runtime — production
    /// entries come from `NotificationsAPIClient`.
    static let previewNotifications: [AppNotification] = [
        AppNotification(type: .newRecommendations, title: "New pieces for your living room",
                       body: "3 new items match your warm minimalist style",
                       timestamp: Date().addingTimeInterval(-1800)),
        AppNotification(type: .designerResponse, title: "Sarah responded",
                       body: "Your designer consultation has a new message",
                       timestamp: Date().addingTimeInterval(-7200)),
        AppNotification(type: .styleUpdate, title: "Style profile updated",
                       body: "Your preferences have been refined based on recent activity",
                       timestamp: Date().addingTimeInterval(-86400), isRead: true),
        AppNotification(type: .emergenceAlert, title: "Something's emerging",
                       body: "A piece you've been eyeing just dropped in price",
                       timestamp: Date().addingTimeInterval(-172800), isRead: true),
        AppNotification(type: .scanComplete, title: "Room scan synced",
                       body: "Your bedroom scan has been uploaded and processed",
                       timestamp: Date().addingTimeInterval(-259200), isRead: true),
    ]
}
#endif
