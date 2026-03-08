//
//  EmergingPiece.swift
//  Patina
//
//  Data model for a piece emerging from recommendations
//

import Foundation

/// A furniture piece that emerges for the user
public struct EmergingPiece: Identifiable, Equatable {

    // MARK: - Properties

    public let id: String
    public let name: String
    public let maker: String
    public let provenance: String
    public let imageURL: String?
    public let priceInCents: Int?
    public let era: String?
    public let materials: [String]
    public let roomSuggestion: String?

    // MARK: - Initialization

    public init(
        id: String = UUID().uuidString,
        name: String,
        maker: String,
        provenance: String,
        imageURL: String? = nil,
        priceInCents: Int? = nil,
        era: String? = nil,
        materials: [String] = [],
        roomSuggestion: String? = nil
    ) {
        self.id = id
        self.name = name
        self.maker = maker
        self.provenance = provenance
        self.imageURL = imageURL
        self.priceInCents = priceInCents
        self.era = era
        self.materials = materials
        self.roomSuggestion = roomSuggestion
    }

    // MARK: - Computed Properties

    /// Formatted price string
    public var formattedPrice: String? {
        guard let cents = priceInCents else { return nil }
        let dollars = Double(cents) / 100.0
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: dollars))
    }

    /// Materials as a formatted string
    public var materialsDescription: String {
        materials.joined(separator: " · ")
    }

    /// Display icon based on category (placeholder for real images)
    public var categoryIcon: String {
        let lowercaseName = name.lowercased()
        if lowercaseName.contains("chair") || lowercaseName.contains("lounge") {
            return "chair.lounge.fill"
        } else if lowercaseName.contains("table") {
            return "table.furniture.fill"
        } else if lowercaseName.contains("sofa") || lowercaseName.contains("couch") {
            return "sofa.fill"
        } else if lowercaseName.contains("lamp") || lowercaseName.contains("light") {
            return "lamp.floor.fill"
        } else if lowercaseName.contains("shelf") || lowercaseName.contains("bookcase") {
            return "books.vertical.fill"
        } else if lowercaseName.contains("rug") || lowercaseName.contains("carpet") {
            return "rectangle.fill"
        } else if lowercaseName.contains("bed") {
            return "bed.double.fill"
        } else if lowercaseName.contains("desk") {
            return "desktopcomputer"
        } else if lowercaseName.contains("cabinet") || lowercaseName.contains("credenza") {
            return "cabinet.fill"
        } else {
            return "square.stack.3d.up.fill"
        }
    }
}
