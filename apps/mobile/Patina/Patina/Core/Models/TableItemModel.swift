//
//  TableItemModel.swift
//  Patina
//
//  SwiftData model for items saved to the user's table
//

import SwiftData
import Foundation

/// A furniture piece saved to the user's table
@Model
public final class TableItemModel {

    // MARK: - Properties

    /// Unique identifier
    @Attribute(.unique) public var id: UUID

    /// Display name of the piece
    public var name: String

    /// Reference to the product in the catalog
    public var productId: String?

    /// URL to the product image
    public var imageURL: String?

    /// When the item was saved
    public var savedAt: Date

    /// Position on the table (X coordinate)
    public var positionX: Float

    /// Position on the table (Y coordinate)
    public var positionY: Float

    /// Rotation angle in radians
    public var rotation: Float

    /// User's notes about this piece
    public var notes: String?

    /// Brand/manufacturer name
    public var brandName: String?

    /// Price in cents
    public var priceInCents: Int?

    /// Associated room (if any)
    public var roomId: UUID?

    /// Last interaction timestamp
    public var lastInteractedAt: Date?

    /// Number of times viewed
    public var viewCount: Int

    // MARK: - Initialization

    public init(
        id: UUID = UUID(),
        name: String,
        productId: String? = nil,
        imageURL: String? = nil,
        savedAt: Date = Date(),
        positionX: Float = 0,
        positionY: Float = 0,
        rotation: Float = 0,
        notes: String? = nil,
        brandName: String? = nil,
        priceInCents: Int? = nil,
        roomId: UUID? = nil
    ) {
        self.id = id
        self.name = name
        self.productId = productId
        self.imageURL = imageURL
        self.savedAt = savedAt
        self.positionX = positionX
        self.positionY = positionY
        self.rotation = rotation
        self.notes = notes
        self.brandName = brandName
        self.priceInCents = priceInCents
        self.roomId = roomId
        self.lastInteractedAt = savedAt
        self.viewCount = 0
    }

    // MARK: - Computed Properties

    /// Days since the item was saved
    public var daysSinceSaved: Int {
        Calendar.current.dateComponents([.day], from: savedAt, to: Date()).day ?? 0
    }

    /// Patina level based on age (0.0 to 1.0)
    /// Items develop more patina the longer they've been on the table
    public var patinaLevel: Double {
        // Full patina after 30 days
        min(Double(daysSinceSaved) / 30.0, 1.0)
    }

    /// Formatted price string
    public var formattedPrice: String? {
        guard let cents = priceInCents else { return nil }
        let dollars = Double(cents) / 100.0
        return String(format: "$%.0f", dollars)
    }

    /// Age description for display
    public var ageDescription: String {
        switch daysSinceSaved {
        case 0:
            return "Added today"
        case 1:
            return "Yesterday"
        case 2...6:
            return "\(daysSinceSaved) days ago"
        case 7...13:
            return "Last week"
        case 14...29:
            return "2 weeks ago"
        case 30...59:
            return "Last month"
        default:
            return "Over a month"
        }
    }

    /// Position as CGPoint
    public var position: CGPoint {
        get { CGPoint(x: CGFloat(positionX), y: CGFloat(positionY)) }
        set {
            positionX = Float(newValue.x)
            positionY = Float(newValue.y)
        }
    }

    // MARK: - Methods

    /// Record an interaction with this item
    public func recordInteraction() {
        lastInteractedAt = Date()
        viewCount += 1
    }

    /// Update position on the table
    public func updatePosition(x: Float, y: Float) {
        positionX = x
        positionY = y
        lastInteractedAt = Date()
    }
}

// MARK: - Comparable

extension TableItemModel: Comparable {
    public static func < (lhs: TableItemModel, rhs: TableItemModel) -> Bool {
        lhs.savedAt < rhs.savedAt
    }
}
