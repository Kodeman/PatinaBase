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

    // MARK: - Style

    /// Whether the user has completed the style quiz. Derived fresh from
    /// `StyleProfileStore` where the actions are computed — the quiz writes
    /// UserDefaults, not the coordinator, so nothing pushes this in. Rows that
    /// used to infer "hasn't taken the quiz" from `roomCount` read this instead.
    public var hasStyleProfile: Bool

    /// Privacy-filtered, human-readable context assembled from durable taste,
    /// room, saved-item, and project-attention signals. This is intentionally
    /// prompt-ready rather than a copy of the underlying models: it contains no
    /// room notes, messages, images, scan geometry, or opaque database IDs.
    public var memory: CompanionMemoryContext?

    /// Concise, live work-state signal for the collapsed Companion. This is
    /// derived from currently loaded Studio/badge records and is not persisted,
    /// so it remains available without opting into contextual memory.
    public var attentionSummary: String?

    // MARK: - Design Request

    /// The homeowner's promoted (visible) design request, if any. Session-scoped
    /// and derived fresh from `DesignRequestStatusService.promotedRequest` where
    /// the Companion actions are computed — the provider stays a pure function of
    /// `(route, context, isAuthenticated)`. When present, every "Get design help"
    /// row renders instead as "Your design request".
    public var activeDesignRequest: ActiveDesignRequestContext?

    // MARK: - Engagement Tier

    /// The client's progressive-disclosure tier, resolved at the same enrichment
    /// seam as `activeDesignRequest` — so the action provider stays a pure
    /// function of its inputs. `nil` means no tier was supplied and MUST be read
    /// as not-yet-engaged; a tier-gated door may never open on a guess.
    ///
    /// Deliberately neither `public` nor a parameter of the memberwise
    /// initializer below: `EngagementTier` is internal, and Swift forbids a
    /// public declaration whose signature uses an internal type. Assign it
    /// after construction.
    var engagementTier: EngagementTier?

    // MARK: - Designer relationship

    /// Whether a designer is on this client's job, and which one (SP-13, R3).
    /// Resolved at the same enrichment seam as `activeDesignRequest`. `nil`
    /// means unresolved and MUST be read as no designer — a message row that
    /// opens a thread with nobody is worse than no row.
    ///
    /// Internal + assigned after construction for the same reason as
    /// `engagementTier`: `DesignerRelationship` is internal.
    var designerRelationship: DesignerRelationship?

    // MARK: - The piece's act

    /// The act the piece screen currently offers (W5, B §5). Resolved by that
    /// screen — which is the only place that holds the whole `Product` and can
    /// run the buyability gate — and read here so the Companion's row and the
    /// screen's bar can never offer the same words and do different things.
    /// `nil` means no piece is on screen, or its act has not resolved yet.
    ///
    /// Internal + assigned after construction for the same reason as
    /// `engagementTier` and `designerRelationship`: `PieceAct` is internal.
    var pieceAct: PieceAct?

    // MARK: - Initialization

    public init(
        currentScreen: AppRoute = .heroFrame,
        viewingPiece: ViewingPieceContext? = nil,
        activeRoom: ActiveRoomContext? = nil,
        walkProgress: Float? = nil,
        pendingNotification: CompanionNotification? = nil,
        recentMessages: [CompanionContextMessage] = [],
        tableItemCount: Int = 0,
        roomCount: Int = 0,
        hasStyleProfile: Bool = false,
        memory: CompanionMemoryContext? = nil,
        attentionSummary: String? = nil,
        activeDesignRequest: ActiveDesignRequestContext? = nil
    ) {
        self.currentScreen = currentScreen
        self.viewingPiece = viewingPiece
        self.activeRoom = activeRoom
        self.walkProgress = walkProgress
        self.pendingNotification = pendingNotification
        self.recentMessages = recentMessages
        self.tableItemCount = tableItemCount
        self.roomCount = roomCount
        self.hasStyleProfile = hasStyleProfile
        self.memory = memory
        self.attentionSummary = attentionSummary
        self.activeDesignRequest = activeDesignRequest
    }

    // MARK: - Context Summary

    /// Human-readable context for display in the Companion header
    public var contextSummary: String {
        switch currentScreen {
        case .heroFrame:
            if let room = activeRoom {
                return room.name
            }
            return "Your Space"
        case .scanFlow(let reason):
            switch reason {
            case .rescan:
                if let room = activeRoom {
                    return "Re-scanning: \(room.name)"
                }
                return "Re-scanning room"
            case .fresh, .fromConversation:
                if let room = activeRoom, let progress = walkProgress {
                    let percent = Int(progress * 100)
                    return "Walking: \(room.name) (\(percent)% complete)"
                }
                return "Walking a room"
            }
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
        case .roomSavedItems:
            if let room = activeRoom {
                return "Saved items in \(room.name)"
            }
            return "Saved items"
        case .styleQuiz:
            return "Discovering your style"
        case .styleResult:
            return "Your style profile"
        case .arPlacement:
            return "Placing furniture"
        case .profile:
            return "Your profile"
        case .studio:
            return "Your Studio"
        case .notifications:
            return "Notifications"
        case .designerConsultation:
            return "Working with a designer"
        case .designRequests:
            return "Your design request"
        case .yourSpaces:
            return "Your Spaces: \(roomCount) rooms"
        case .roomProject:
            if let room = activeRoom { return "Room: \(room.name)" }
            return "Room project"
        case .roomSettings:
            return "Room settings"
        case .crossRoom:
            return "All items across your home"
        case .manualRoomEntry:
            return "Entering room details"
        case .projectList:
            return "Projects"
        case .projectDetail:
            return "Project details"
        case .decisionList:
            return "Decisions waiting"
        case .decisionDetail:
            return "Reviewing a decision"
        case .threadList:
            return "Conversations"
        case .threadDetail:
            return "In conversation"
        case .proposalList:
            return "Proposals"
        case .proposalDetail:
            return "Reviewing a proposal"
        case .invoiceList:
            return "Invoices"
        case .invoiceDetail:
            return "Reviewing an invoice"
        case .budget:
            return "Billed to date"
        case .documentList:
            return "Your documents"
        case .orderDetail:
            return "Your order"
        }
    }

    /// Icon for the current context
    public var contextIcon: String {
        switch currentScreen {
        case .heroFrame:
            return "photo"
        case .scanFlow:
            return "figure.walk"
        case .emergence, .roomEmergence:
            return "sparkles"
        case .pieceDetail:
            return "chair.lounge"
        case .table:
            return "rectangle.stack"
        case .roomSavedItems:
            return "bookmark.fill"
        case .styleQuiz:
            return "paintpalette"
        case .styleResult:
            return "star.circle"
        case .arPlacement:
            return "arkit"
        case .profile:
            return "person.circle"
        case .studio:
            return "folder"
        case .notifications:
            return "bell"
        case .designerConsultation:
            return "bubble.left.and.bubble.right"
        case .designRequests:
            return "paperplane"
        case .yourSpaces, .roomProject, .roomSettings, .crossRoom,
             .manualRoomEntry:
            return "house"
        case .projectList, .projectDetail:
            return "folder"
        case .decisionList, .decisionDetail:
            return "checkmark.seal"
        case .threadList, .threadDetail:
            return "bubble.left.and.bubble.right"
        case .proposalList, .proposalDetail:
            return "doc.text"
        case .invoiceList, .invoiceDetail:
            return "creditcard"
        case .budget:
            return "chart.pie"
        case .documentList:
            return "folder"
        case .orderDetail:
            return "shippingbox"
        }
    }
}

// MARK: - Context Memory

/// Ephemeral, privacy-filtered memory supplied to Companion prompt builders.
/// The persisted recency store keeps only activity kinds, identifiers, and
/// timestamps; visible names below are rehydrated from the user's live models.
public struct CompanionMemoryContext: Equatable, Sendable {
    public let isPersonalizationEnabled: Bool
    public let activeRoomName: String?
    public let tasteSummary: String?
    public let preferredMaterials: [String]
    public let recentSavedItemName: String?
    public let projectAttentionSummary: String?
    public let latestActivity: ContextActivityKind?
    public let generatedAt: Date

    public init(
        isPersonalizationEnabled: Bool,
        activeRoomName: String? = nil,
        tasteSummary: String? = nil,
        preferredMaterials: [String] = [],
        recentSavedItemName: String? = nil,
        projectAttentionSummary: String? = nil,
        latestActivity: ContextActivityKind? = nil,
        generatedAt: Date = Date()
    ) {
        self.isPersonalizationEnabled = isPersonalizationEnabled
        self.activeRoomName = activeRoomName
        self.tasteSummary = tasteSummary
        self.preferredMaterials = preferredMaterials
        self.recentSavedItemName = recentSavedItemName
        self.projectAttentionSummary = projectAttentionSummary
        self.latestActivity = latestActivity
        self.generatedAt = generatedAt
    }

    /// Plain, bounded summary suitable for a Companion prompt. It never
    /// includes identifiers or free-form user-authored text.
    public var promptSummary: String? {
        guard isPersonalizationEnabled else { return nil }
        var parts: [String] = []
        if let tasteSummary, !tasteSummary.isEmpty {
            parts.append("Taste: \(tasteSummary)")
        }
        if let activeRoomName, !activeRoomName.isEmpty {
            parts.append("Active room: \(activeRoomName)")
        }
        if !preferredMaterials.isEmpty {
            parts.append("Preferred materials: \(preferredMaterials.prefix(3).joined(separator: ", "))")
        }
        if let recentSavedItemName, !recentSavedItemName.isEmpty {
            parts.append("Recently saved: \(recentSavedItemName)")
        }
        if let projectAttentionSummary, !projectAttentionSummary.isEmpty {
            parts.append("Project attention: \(projectAttentionSummary)")
        }
        return parts.isEmpty ? nil : parts.joined(separator: ". ") + "."
    }
}

// MARK: - Viewing Piece Context

/// Lightweight piece context for the Companion
public struct ViewingPieceContext: Equatable {
    public let id: String
    public let name: String
    public let maker: String
    public let imageURL: URL?
    /// Mirrors `Product.hasARModel` (`usdz_url != nil`). Defaults to false so a
    /// caller that has not established an AR asset cannot produce an AR offer.
    public let hasARModel: Bool

    public init(id: String, name: String, maker: String, imageURL: URL? = nil, hasARModel: Bool = false) {
        self.id = id
        self.name = name
        self.maker = maker
        self.imageURL = imageURL
        self.hasARModel = hasARModel
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

// MARK: - Active Design Request Context

/// Lightweight promoted-design-request context for the Companion. Carries just
/// what the action rows need: the lead id to route into `.designRequests` and a
/// short human-readable stage label (e.g. "In review") for the row hint.
public struct ActiveDesignRequestContext: Equatable {
    public let leadId: String
    public let statusLabel: String

    public init(leadId: String, statusLabel: String) {
        self.leadId = leadId
        self.statusLabel = statusLabel
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
