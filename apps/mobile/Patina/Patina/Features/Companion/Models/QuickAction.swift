//
//  QuickAction.swift
//  Patina
//
//  Context-aware quick actions for the Companion
//  Different actions appear based on the current screen
//

import Foundation

// MARK: - Quick Action

/// A quick action the user can take from the Companion
public struct QuickAction: Identifiable, Equatable {
    public let id: UUID
    public let title: String
    public let icon: String
    public let intent: NavigationIntent
    public let isPrimary: Bool

    public init(
        id: UUID = UUID(),
        title: String,
        icon: String,
        intent: NavigationIntent,
        isPrimary: Bool = false
    ) {
        self.id = id
        self.title = title
        self.icon = icon
        self.intent = intent
        self.isPrimary = isPrimary
    }
}

// MARK: - Navigation Intent

/// Intent detected from user input or quick action
public enum NavigationIntent: Equatable {
    // Navigation intents
    case walkRoom(roomId: UUID?)
    case showEmergence
    case showTable
    case showRooms
    case goBack
    case startOver
    case showHelp
    case requestDesignServices(roomId: UUID?)
    case viewRecommendations(roomId: UUID?)

    // QR authentication
    case webSignIn

    // Action intents (within current screen)
    case continueWalk
    case saveWalkProgress
    case seeWhatFits
    case explainPiece
    case seeInRoom
    case letDrift
    case whatsNew
    case whatsMissing
    case seeTogether
    case share
    case addToTable
    case similarPieces
    case savePhoto
    case tryAnother
    case exitAR

    // Conversation intents
    case skipAhead
    case startFresh
    case tellMeMore

    // Help intents
    case needHelp
    case narrowDown
    case suggestOptions

    // No action
    case none

    /// Whether this intent triggers navigation
    public var triggersNavigation: Bool {
        switch self {
        case .walkRoom, .showEmergence, .showTable, .showRooms, .goBack, .startOver, .requestDesignServices, .viewRecommendations, .webSignIn:
            return true
        default:
            return false
        }
    }
}

// MARK: - Quick Actions Per Screen

/// Factory for creating context-aware quick actions
public enum QuickActionFactory {

    /// Get quick actions for the current screen
    public static func actions(for screen: AppRoute, context: CompanionContext? = nil) -> [QuickAction] {
        switch screen {
        case .heroFrame:
            return heroFrameActions(context: context)
        case .conversation:
            return conversationActions()
        case .walk:
            return walkActions(isComplete: false, context: context)
        case .walkSession:
            return walkActions(isComplete: context?.walkProgress ?? 0 >= 1.0, context: context)
        case .emergence, .roomEmergence:
            return emergenceActions(context: context)
        case .table:
            return tableActions(context: context)
        case .roomList:
            return roomListActions()
        case .pieceDetail:
            return pieceDetailActions(context: context)
        case .threshold:
            return [] // No actions during threshold
        case .authentication, .settings, .designServicesRequest, .qrScanner, .qrApproval:
            return [] // No actions on modal screens
        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming:
            return [] // First launch screens have their own UI
        case .roomDetail(let roomId):
            return roomDetailActions(roomId: roomId)
        case .roomSavedItems(let roomId):
            return roomSavedItemsActions(roomId: roomId)
        case .roomOptions:
            return [] // Room options is a modal
        case .rescan:
            return walkActions(isComplete: false, context: context)
        }
    }

    private static func roomDetailActions(roomId: UUID? = nil) -> [QuickAction] {
        [
            QuickAction(
                title: "Get design help",
                icon: "sparkles",
                intent: .requestDesignServices(roomId: roomId),
                isPrimary: true
            ),
            QuickAction(
                title: "See recommendations",
                icon: "wand.and.stars",
                intent: .viewRecommendations(roomId: roomId)
            ),
            QuickAction(
                title: "Walk again",
                icon: "figure.walk",
                intent: .walkRoom(roomId: roomId)
            )
        ]
    }

    // MARK: - Screen-Specific Actions

    private static func heroFrameActions(context: CompanionContext?) -> [QuickAction] {
        var actions: [QuickAction] = []

        // If there's an active emergence, show that first
        if let activeRoom = context?.activeRoom, activeRoom.hasEmergence {
            actions.append(QuickAction(
                title: "What's new",
                icon: "sparkles",
                intent: .showEmergence,
                isPrimary: true
            ))
        }

        // Walk a new room
        actions.append(QuickAction(
            title: "Walk a room",
            icon: "figure.walk",
            intent: .walkRoom(roomId: nil),
            isPrimary: actions.isEmpty
        ))

        // Get design help (if user has rooms)
        if let roomCount = context?.roomCount, roomCount > 0 {
            actions.append(QuickAction(
                title: "Get design help",
                icon: "wand.and.stars",
                intent: .requestDesignServices(roomId: context?.activeRoom?.id)
            ))
        }

        // Show table if items exist
        if let tableCount = context?.tableItemCount, tableCount > 0 {
            actions.append(QuickAction(
                title: "My table",
                icon: "rectangle.stack",
                intent: .showTable
            ))
        }

        // See all rooms if multiple exist
        if let roomCount = context?.roomCount, roomCount > 1 {
            actions.append(QuickAction(
                title: "All rooms",
                icon: "square.grid.2x2",
                intent: .showRooms
            ))
        }

        // Sign in to web (when authenticated)
        actions.append(QuickAction(
            title: "Sign in to Web",
            icon: "qrcode.viewfinder",
            intent: .webSignIn
        ))

        return Array(actions.prefix(4)) // Max 4 actions
    }

    private static func roomSavedItemsActions(roomId: UUID) -> [QuickAction] {
        [
            QuickAction(
                title: "See in room",
                icon: "arkit",
                intent: .seeInRoom,
                isPrimary: true
            ),
            QuickAction(
                title: "Share",
                icon: "square.and.arrow.up",
                intent: .share
            ),
            QuickAction(
                title: "Back to room",
                icon: "arrow.left",
                intent: .goBack
            )
        ]
    }

    private static func conversationActions() -> [QuickAction] {
        [
            QuickAction(
                title: "Walk a room",
                icon: "figure.walk",
                intent: .walkRoom(roomId: nil),
                isPrimary: true
            ),
            QuickAction(
                title: "Skip ahead",
                icon: "forward",
                intent: .skipAhead
            ),
            QuickAction(
                title: "Start fresh",
                icon: "arrow.counterclockwise",
                intent: .startFresh
            )
        ]
    }

    private static func walkActions(isComplete: Bool, context: CompanionContext? = nil) -> [QuickAction] {
        if isComplete {
            return [
                QuickAction(
                    title: "See what surfaced",
                    icon: "sparkles",
                    intent: .viewRecommendations(roomId: context?.activeRoom?.id),
                    isPrimary: true
                ),
                QuickAction(
                    title: "Get design help",
                    icon: "wand.and.stars",
                    intent: .requestDesignServices(roomId: context?.activeRoom?.id)
                ),
                QuickAction(
                    title: "Walk another",
                    icon: "figure.walk",
                    intent: .walkRoom(roomId: nil)
                )
            ]
        } else {
            return [
                QuickAction(
                    title: "Continue",
                    icon: "play",
                    intent: .continueWalk,
                    isPrimary: true
                ),
                QuickAction(
                    title: "Save progress",
                    icon: "square.and.arrow.down",
                    intent: .saveWalkProgress
                ),
                QuickAction(
                    title: "Start over",
                    icon: "arrow.counterclockwise",
                    intent: .startOver
                )
            ]
        }
    }

    private static func emergenceActions(context: CompanionContext? = nil) -> [QuickAction] {
        [
            QuickAction(
                title: "Why this?",
                icon: "questionmark.circle",
                intent: .explainPiece
            ),
            QuickAction(
                title: "See in room",
                icon: "arkit",
                intent: .seeInRoom,
                isPrimary: true
            ),
            QuickAction(
                title: "Get design help",
                icon: "sparkles",
                intent: .requestDesignServices(roomId: context?.activeRoom?.id)
            )
        ]
    }

    private static func tableActions(context: CompanionContext? = nil) -> [QuickAction] {
        [
            QuickAction(
                title: "Get design help",
                icon: "sparkles",
                intent: .requestDesignServices(roomId: context?.activeRoom?.id),
                isPrimary: true
            ),
            QuickAction(
                title: "What's missing?",
                icon: "sparkle.magnifyingglass",
                intent: .whatsMissing
            ),
            QuickAction(
                title: "Share",
                icon: "square.and.arrow.up",
                intent: .share
            )
        ]
    }

    private static func roomListActions() -> [QuickAction] {
        [
            QuickAction(
                title: "Walk new room",
                icon: "figure.walk",
                intent: .walkRoom(roomId: nil),
                isPrimary: true
            ),
            QuickAction(
                title: "Latest emergence",
                icon: "sparkles",
                intent: .showEmergence
            ),
            QuickAction(
                title: "My table",
                icon: "rectangle.stack",
                intent: .showTable
            )
        ]
    }

    private static func pieceDetailActions(context: CompanionContext? = nil) -> [QuickAction] {
        [
            QuickAction(
                title: "See in room",
                icon: "arkit",
                intent: .seeInRoom,
                isPrimary: true
            ),
            QuickAction(
                title: "Get design help",
                icon: "sparkles",
                intent: .requestDesignServices(roomId: context?.activeRoom?.id)
            ),
            QuickAction(
                title: "Add to table",
                icon: "plus.rectangle.on.rectangle",
                intent: .addToTable
            )
        ]
    }

    // MARK: - AR Placement Actions (for future use)

    public static func arPlacementActions() -> [QuickAction] {
        [
            QuickAction(
                title: "Save photo",
                icon: "camera",
                intent: .savePhoto,
                isPrimary: true
            ),
            QuickAction(
                title: "Try another",
                icon: "arrow.triangle.2.circlepath",
                intent: .tryAnother
            ),
            QuickAction(
                title: "Exit AR",
                icon: "xmark.circle",
                intent: .exitAR
            )
        ]
    }
}

// MARK: - Stuck Detection Actions

extension QuickActionFactory {

    /// Quick action shown when user appears stuck
    public static var needHelpAction: QuickAction {
        QuickAction(
            title: "Need help?",
            icon: "questionmark.circle",
            intent: .needHelp,
            isPrimary: true
        )
    }

    /// Get quick actions when user appears stuck
    /// - Parameter reason: The detected reason for being stuck
    public static func stuckActions(for reason: SessionMetricsService.StuckReason) -> [QuickAction] {
        switch reason {
        case .none:
            return []

        case .longDwellNoInteraction:
            return [
                QuickAction(
                    title: "Need help?",
                    icon: "questionmark.circle",
                    intent: .needHelp,
                    isPrimary: true
                ),
                QuickAction(
                    title: "Show popular",
                    icon: "star",
                    intent: .suggestOptions
                )
            ]

        case .indecisiveScrolling:
            return [
                QuickAction(
                    title: "Help narrow down",
                    icon: "slider.horizontal.3",
                    intent: .narrowDown,
                    isPrimary: true
                ),
                QuickAction(
                    title: "What are you looking for?",
                    icon: "magnifyingglass",
                    intent: .needHelp
                )
            ]

        case .both:
            return [
                QuickAction(
                    title: "Let me help",
                    icon: "sparkles",
                    intent: .needHelp,
                    isPrimary: true
                ),
                QuickAction(
                    title: "Suggest options",
                    icon: "lightbulb",
                    intent: .suggestOptions
                ),
                QuickAction(
                    title: "Start fresh",
                    icon: "arrow.counterclockwise",
                    intent: .startFresh
                )
            ]
        }
    }
}

// MARK: - Notification Quick Actions

extension QuickActionFactory {

    /// Get quick actions when showing a notification
    public static func notificationActions(for type: NotificationType) -> [QuickAction] {
        switch type {
        case .emergence:
            return [
                QuickAction(
                    title: "Show me",
                    icon: "sparkles",
                    intent: .showEmergence,
                    isPrimary: true
                ),
                QuickAction(
                    title: "Later",
                    icon: "clock",
                    intent: .none
                ),
                QuickAction(
                    title: "Tell me more first",
                    icon: "text.bubble",
                    intent: .tellMeMore
                )
            ]
        case .insight:
            return [
                QuickAction(
                    title: "Tell me",
                    icon: "lightbulb",
                    intent: .tellMeMore,
                    isPrimary: true
                ),
                QuickAction(
                    title: "Show my table",
                    icon: "rectangle.stack",
                    intent: .showTable
                )
            ]
        case .resonance:
            return [
                QuickAction(
                    title: "See them together",
                    icon: "square.grid.2x2",
                    intent: .seeTogether,
                    isPrimary: true
                ),
                QuickAction(
                    title: "Later",
                    icon: "clock",
                    intent: .none
                )
            ]
        case .reminder:
            return [
                QuickAction(
                    title: "Continue",
                    icon: "play",
                    intent: .continueWalk,
                    isPrimary: true
                ),
                QuickAction(
                    title: "Start fresh",
                    icon: "arrow.counterclockwise",
                    intent: .startOver
                )
            ]
        }
    }
}
