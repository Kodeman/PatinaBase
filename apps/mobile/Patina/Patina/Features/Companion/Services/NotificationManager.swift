//
//  NotificationManager.swift
//  Patina
//
//  Manages the queue of notifications for the Companion
//  Handles priority, acknowledgment, and delivery timing
//

import Foundation

// MARK: - Notification Manager

/// Manages Companion notifications with priority queuing
@Observable
public final class NotificationManager {

    public static let shared = NotificationManager()

    // MARK: - State

    /// Queue of pending notifications
    private var notificationQueue: [CompanionNotification] = []

    /// Currently displayed notification
    public private(set) var currentNotification: CompanionNotification?

    /// Whether there's a pending notification
    public var hasPendingNotification: Bool {
        currentNotification != nil || !notificationQueue.isEmpty
    }

    // MARK: - Configuration

    /// Priority order for notification types (higher = more important)
    private let priorityOrder: [NotificationType: Int] = [
        .emergence: 4,
        .insight: 3,
        .resonance: 2,
        .reminder: 1
    ]

    private init() {}

    // MARK: - Notification Management

    /// Add a notification to the queue
    public func addNotification(_ notification: CompanionNotification) {
        // Add to queue sorted by priority
        notificationQueue.append(notification)
        sortQueueByPriority()

        // If no current notification, show this one
        if currentNotification == nil {
            showNextNotification()
        }
    }

    /// Create and add a notification
    public func notify(
        type: NotificationType,
        message: String,
        relatedPieceId: String? = nil,
        relatedRoomId: UUID? = nil
    ) {
        let notification = CompanionNotification(
            type: type,
            message: message,
            relatedPieceId: relatedPieceId,
            relatedRoomId: relatedRoomId
        )
        addNotification(notification)
    }

    /// Acknowledge the current notification
    public func acknowledgeCurrentNotification() {
        currentNotification = nil
        showNextNotification()
    }

    /// Dismiss the current notification without acting on it
    public func dismissCurrentNotification() {
        currentNotification = nil
        showNextNotification()
    }

    /// Clear all notifications
    public func clearAll() {
        notificationQueue.removeAll()
        currentNotification = nil
    }

    // MARK: - Queue Management

    private func showNextNotification() {
        guard !notificationQueue.isEmpty else {
            currentNotification = nil
            return
        }

        currentNotification = notificationQueue.removeFirst()
    }

    private func sortQueueByPriority() {
        notificationQueue.sort { n1, n2 in
            let p1 = priorityOrder[n1.type] ?? 0
            let p2 = priorityOrder[n2.type] ?? 0
            return p1 > p2
        }
    }

    // MARK: - Convenience Methods

    /// Notify about a new emergence
    public func notifyEmergence(pieceId: String, pieceName: String, maker: String) {
        let message = "A piece emerged that might speak to your space — \(pieceName) by \(maker). Shall I show you?"
        notify(type: .emergence, message: message, relatedPieceId: pieceId)
    }

    /// Notify about a collection insight
    public func notifyInsight(message: String) {
        notify(type: .insight, message: message)
    }

    /// Notify about resonating pieces
    public func notifyResonance(pieceIds: [String], message: String) {
        notify(type: .resonance, message: message, relatedPieceId: pieceIds.first)
    }

    /// Notify about a reminder
    public func notifyReminder(roomId: UUID, roomName: String) {
        let message = "Ready to continue exploring your \(roomName)?"
        notify(type: .reminder, message: message, relatedRoomId: roomId)
    }
}

// MARK: - Mock Notification Generator

/// For development/testing - generates mock notifications
public enum MockNotifications {

    /// Sample emergence notifications
    public static let emergences: [(pieceId: String, name: String, maker: String)] = [
        ("edo-chair", "Edo Lounge Chair", "Thos. Moser"),
        ("walnut-bowl", "Hand-turned Walnut Bowl", "Vermont Workshop"),
        ("linen-sofa", "Cloud Linen Sofa", "Maiden Home"),
        ("ceramic-lamp", "Ceramic Table Lamp", "Natalie Page")
    ]

    /// Sample insight messages
    public static let insights: [String] = [
        "I notice the chair and bookshelf have been on your table longest. They speak to each other well.",
        "Your collection seems drawn to natural materials — wood and ceramic dominate.",
        "There's a warmth to everything you've gathered. A consistent palette emerging.",
        "Three pieces from makers in the Northeast. Is that intentional?"
    ]

    /// Sample resonance messages
    public static let resonances: [String] = [
        "These two pieces share something — maybe the era, or the maker's approach.",
        "The walnut in these pieces would age together beautifully.",
        "I see a conversation happening between these three."
    ]

    /// Generate a random mock notification
    public static func randomNotification() -> CompanionNotification {
        let types: [NotificationType] = [.emergence, .insight, .resonance, .reminder]
        let type = types.randomElement()!

        switch type {
        case .emergence:
            let piece = emergences.randomElement()!
            return CompanionNotification(
                type: .emergence,
                message: "A piece emerged that might speak to your space — \(piece.name) by \(piece.maker). Shall I show you?",
                relatedPieceId: piece.pieceId
            )
        case .insight:
            return CompanionNotification(
                type: .insight,
                message: insights.randomElement()!
            )
        case .resonance:
            return CompanionNotification(
                type: .resonance,
                message: resonances.randomElement()!
            )
        case .reminder:
            return CompanionNotification(
                type: .reminder,
                message: "Ready to continue where you left off?"
            )
        }
    }
}
