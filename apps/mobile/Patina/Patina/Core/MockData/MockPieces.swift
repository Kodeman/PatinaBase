//
//  MockPieces.swift
//  Patina
//
//  Sample furniture pieces for demonstration
//

import Foundation

/// Mock data for demonstrating the full Patina experience
public enum MockPieces {

    /// Sample emerging pieces with full provenance
    /// Images from Unsplash (free to use)
    public static let emergingPieces: [EmergingPiece] = [
        EmergingPiece(
            id: "edo-lounge",
            name: "The Edo Lounge Chair",
            maker: "Thos. Moser",
            provenance: "Hand-shaped in Auburn, Maine from sustainably harvested cherry",
            imageURL: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80",
            priceInCents: 4850_00,
            era: "Contemporary Craft",
            materials: ["Cherry", "Natural oil finish"],
            roomSuggestion: "Your Living Room"
        ),
        EmergingPiece(
            id: "nakashima-table",
            name: "Conoid Coffee Table",
            maker: "George Nakashima Woodworkers",
            provenance: "Crafted in New Hope, Pennsylvania using traditional Japanese joinery",
            imageURL: "https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?w=600&q=80",
            priceInCents: 12500_00,
            era: "Mid-Century Modern",
            materials: ["American black walnut", "East Indian rosewood"],
            roomSuggestion: "Your Living Room"
        ),
        EmergingPiece(
            id: "wishbone-chair",
            name: "CH24 Wishbone Chair",
            maker: "Carl Hansen & Søn",
            provenance: "Made in Gelsted, Denmark since 1950, designed by Hans J. Wegner",
            imageURL: "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600&q=80",
            priceInCents: 895_00,
            era: "Danish Modern",
            materials: ["Oak", "Natural paper cord"],
            roomSuggestion: "Your Dining Room"
        ),
        EmergingPiece(
            id: "arco-lamp",
            name: "Arco Floor Lamp",
            maker: "Flos",
            provenance: "Designed in 1962 by Achille and Pier Giacomo Castiglioni in Milan",
            imageURL: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&q=80",
            priceInCents: 2995_00,
            era: "Italian Modern",
            materials: ["Carrara marble", "Stainless steel"],
            roomSuggestion: "Your Living Room"
        ),
        EmergingPiece(
            id: "maloof-rocker",
            name: "Low-Back Rocker",
            maker: "Sam Maloof Woodworking",
            provenance: "Hand-carved in Alta Loma, California following Sam Maloof's legacy",
            imageURL: "https://images.unsplash.com/photo-1519947486511-46149fa0a254?w=600&q=80",
            priceInCents: 18000_00,
            era: "California Craft",
            materials: ["Claro walnut", "Ebony"],
            roomSuggestion: "Your Study"
        ),
        EmergingPiece(
            id: "beni-ourain-rug",
            name: "Vintage Beni Ourain",
            maker: "Berber Artisans",
            provenance: "Hand-woven in the Atlas Mountains of Morocco, circa 1970",
            imageURL: "https://images.unsplash.com/photo-1600166898405-da9535204843?w=600&q=80",
            priceInCents: 3200_00,
            era: "Vintage",
            materials: ["Undyed wool"],
            roomSuggestion: "Your Bedroom"
        ),
        EmergingPiece(
            id: "credenza-florence",
            name: "Florence Knoll Credenza",
            maker: "Knoll",
            provenance: "Designed in 1961, manufactured in East Greenville, Pennsylvania",
            imageURL: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80",
            priceInCents: 8750_00,
            era: "Mid-Century Modern",
            materials: ["Walnut veneer", "Chrome steel"],
            roomSuggestion: "Your Living Room"
        ),
        EmergingPiece(
            id: "saarinen-table",
            name: "Tulip Dining Table",
            maker: "Knoll",
            provenance: "Designed by Eero Saarinen in 1956 to create 'one thing made of one material'",
            imageURL: "https://images.unsplash.com/photo-1530018607912-eff2daa1bac4?w=600&q=80",
            priceInCents: 4500_00,
            era: "Mid-Century Modern",
            materials: ["Carrara marble", "Cast aluminum"],
            roomSuggestion: "Your Dining Room"
        )
    ]

    /// Get a random piece for emergence
    public static func randomPiece() -> EmergingPiece {
        emergingPieces.randomElement() ?? emergingPieces[0]
    }

    /// Get a piece by ID
    public static func piece(withId id: String) -> EmergingPiece? {
        emergingPieces.first { $0.id == id }
    }

    /// Get pieces for a specific room
    public static func pieces(forRoom room: String) -> [EmergingPiece] {
        emergingPieces.filter { $0.roomSuggestion == room }
    }
}

// MARK: - Mock Rooms

public enum MockRooms {

    public struct Room: Identifiable {
        public let id: String
        public let name: String
        public let hasBeenScanned: Bool

        public init(id: String = UUID().uuidString, name: String, hasBeenScanned: Bool = false) {
            self.id = id
            self.name = name
            self.hasBeenScanned = hasBeenScanned
        }
    }

    public static let rooms: [Room] = [
        Room(name: "Your Living Room", hasBeenScanned: true),
        Room(name: "Your Dining Room", hasBeenScanned: false),
        Room(name: "Your Bedroom", hasBeenScanned: false),
        Room(name: "Your Study", hasBeenScanned: false)
    ]
}
