//
//  AppNotification.swift
//  Patina
//
//  Model for in-app notifications
//

import SwiftUI

struct AppNotification: Identifiable {
    let id = UUID()
    let type: AppNotificationType
    let title: String
    let body: String
    let timestamp: Date
    var isRead: Bool = false

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

enum AppNotificationType {
    case newRecommendations
    case designerResponse
    case styleUpdate
    case emergenceAlert
    case scanComplete

    var icon: String {
        switch self {
        case .newRecommendations: return "sparkles"
        case .designerResponse: return "bubble.left.fill"
        case .styleUpdate: return "paintpalette.fill"
        case .emergenceAlert: return "star.fill"
        case .scanComplete: return "checkmark.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .newRecommendations: return PatinaColors.clay
        case .designerResponse: return PatinaColors.dustyBlue
        case .styleUpdate: return PatinaColors.sage
        case .emergenceAlert: return PatinaColors.goldenHour
        case .scanComplete: return PatinaColors.success
        }
    }
}

// MARK: - Mock Data

extension AppNotification {
    static let mockNotifications: [AppNotification] = [
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
