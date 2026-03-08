//
//  CompanionContext.swift
//  Patina
//
//  Context information for the Companion to understand where the user is
//  and what they're looking at, enabling context-aware suggestions
//

import Foundation

// MARK: - Companion Context

/// The context the Companion uses to understand the current state
/// and provide relevant suggestions and responses
public struct CompanionContext: Equatable {

    // MARK: - Current Location

    /// The current screen/route the user is on
    public var currentScreen: AppRoute

    // MARK: - Viewing Context

    /// The piece being viewed (if on Emergence or Piece Detail)
    public var viewingPiece: ViewingPieceContext?

    /// The room being viewed or walked
    public var activeRoom: ActiveRoomContext?

    /// Progress through a walk (0.0-1.0)
    public var walkProgress: Float?

    // MARK: - Notifications

    /// Pending notification to show user
    public var pendingNotification: CompanionNotification?

    // MARK: - Conversation

    /// Recent conversation history (kept lightweight)
    public var recentMessages: [CompanionContextMessage]

    // MARK: - Collection Stats

    /// Number of items on the table
    public var tableItemCount: Int

    /// Number of rooms scanned
    public var roomCount: Int

    // MARK: - Initialization

    public init(
        currentScreen: AppRoute = .conversation,
        viewingPiece: ViewingPieceContext? = nil,
        activeRoom: ActiveRoomContext? = nil,
        walkProgress: Float? = nil,
        pendingNotification: CompanionNotification? = nil,
        recentMessages: [CompanionContextMessage] = [],
        tableItemCount: Int = 0,
        roomCount: Int = 0
    ) {
        self.currentScreen = currentScreen
        self.viewingPiece = viewingPiece
        self.activeRoom = activeRoom
        self.walkProgress = walkProgress
        self.pendingNotification = pendingNotification
        self.recentMessages = recentMessages
        self.tableItemCount = tableItemCount
        self.roomCount = roomCount
    }

    // MARK: - Context Summary

    /// Human-readable context for display in the Companion header
    public var contextSummary: String {
        switch currentScreen {
        case .threshold:
            return "Entering Patina"
        case .heroFrame:
            if let room = activeRoom {
                return room.name
            }
            return "Your Space"
        case .conversation:
            return "Getting to know you"
        case .roomList:
            return "Your Rooms: \(roomCount) spaces"
        case .walk, .walkSession:
            if let room = activeRoom, let progress = walkProgress {
                let percent = Int(progress * 100)
                return "Walking: \(room.name) (\(percent)% complete)"
            }
            return "Walking a room"
        case .rescan:
            if let room = activeRoom {
                return "Re-scanning: \(room.name)"
            }
            return "Re-scanning room"
        case .emergence, .roomEmergence:
            if let piece = viewingPiece {
                return "Viewing: \(piece.name) by \(piece.maker)"
            }
            return "Discovering pieces"
        case .pieceDetail:
            if let piece = viewingPiece {
                return "Viewing: \(piece.name) by \(piece.maker)"
            }
            return "Piece details"
        case .table:
            return "Your Table: \(tableItemCount) pieces gathering"
        case .authentication:
            return "Signing in"
        case .settings:
            return "Settings"
        case .walkInvitation:
            return "Welcome to Patina"
        case .cameraPermission:
            return "Camera Permission"
        case .walkComplete:
            return "Walk Complete"
        case .firstEmergence:
            return "Something's emerging..."
        case .roomDetail:
            if let room = activeRoom {
                return "Viewing: \(room.name)"
            }
            return "Room details"
        case .roomSavedItems:
            if let room = activeRoom {
                return "Saved items in \(room.name)"
            }
            return "Saved items"
        case .roomOptions:
            return "Room options"
        case .roomNaming:
            return "Naming your room"
        case .designServicesRequest:
            return "Requesting design help"
        case .qrScanner:
            return "Scanning QR code"
        case .qrApproval:
            return "Approving sign-in"
        }
    }

    /// Icon for the current context
    public var contextIcon: String {
        switch currentScreen {
        case .threshold:
            return "door.left.hand.open"
        case .heroFrame:
            return "photo"
        case .conversation:
            return "bubble.left.and.bubble.right"
        case .roomList:
            return "house"
        case .walk, .walkSession, .rescan:
            return "figure.walk"
        case .emergence, .roomEmergence, .firstEmergence:
            return "sparkles"
        case .pieceDetail:
            return "chair.lounge"
        case .table:
            return "rectangle.stack"
        case .authentication:
            return "person.circle"
        case .settings:
            return "gearshape"
        case .walkInvitation:
            return "hand.wave"
        case .cameraPermission:
            return "camera"
        case .walkComplete:
            return "checkmark.circle"
        case .roomDetail:
            return "square.split.bottomrightquarter"
        case .roomSavedItems:
            return "bookmark.fill"
        case .roomOptions:
            return "ellipsis.circle"
        case .roomNaming:
            return "pencil"
        case .designServicesRequest:
            return "sparkles"
        case .qrScanner:
            return "qrcode.viewfinder"
        case .qrApproval:
            return "checkmark.shield"
        }
    }
}

// MARK: - Viewing Piece Context

/// Lightweight piece context for the Companion
public struct ViewingPieceContext: Equatable {
    public let id: String
    public let name: String
    public let maker: String
    public let imageURL: URL?

    public init(id: String, name: String, maker: String, imageURL: URL? = nil) {
        self.id = id
        self.name = name
        self.maker = maker
        self.imageURL = imageURL
    }
}

// MARK: - Active Room Context

/// Lightweight room context for the Companion
public struct ActiveRoomContext: Equatable {
    public let id: UUID
    public let name: String
    public let hasBeenScanned: Bool
    public let hasEmergence: Bool

    public init(id: UUID, name: String, hasBeenScanned: Bool = false, hasEmergence: Bool = false) {
        self.id = id
        self.name = name
        self.hasBeenScanned = hasBeenScanned
        self.hasEmergence = hasEmergence
    }
}

// MARK: - Companion Notification

/// A notification the Companion wants to share with the user
public struct CompanionNotification: Equatable, Identifiable {
    public let id: UUID
    public let type: NotificationType
    public let message: String
    public let relatedPieceId: String?
    public let relatedRoomId: UUID?
    public let createdAt: Date

    public init(
        id: UUID = UUID(),
        type: NotificationType,
        message: String,
        relatedPieceId: String? = nil,
        relatedRoomId: UUID? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.type = type
        self.message = message
        self.relatedPieceId = relatedPieceId
        self.relatedRoomId = relatedRoomId
        self.createdAt = createdAt
    }
}

// MARK: - Context Message

/// Lightweight message for context (not full Message model)
public struct CompanionContextMessage: Equatable, Identifiable {
    public let id: UUID
    public let content: String
    public let isFromUser: Bool
    public let timestamp: Date

    public init(
        id: UUID = UUID(),
        content: String,
        isFromUser: Bool,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.content = content
        self.isFromUser = isFromUser
        self.timestamp = timestamp
    }
}

// MARK: - Context Provider Protocol

/// Protocol for screens to provide their context to the Companion
public protocol CompanionContextProvider {
    /// Update the companion context based on current screen state
    func updateCompanionContext(_ context: inout CompanionContext)
}
