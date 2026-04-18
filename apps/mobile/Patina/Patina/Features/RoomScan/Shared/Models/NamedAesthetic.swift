//
//  NamedAesthetic.swift
//  Patina
//
//  The 12 named aesthetics the Aesthete Engine can return.
//  Per PRD §4.8 "Named Aesthetics" vocabulary.
//

import Foundation

/// One of the 12 published aesthetic archetypes.
public struct NamedAesthetic: Equatable {
    public let name: String
    public let ideal: ImageAttributes
    public let tags: [String]

    public init(name: String, ideal: ImageAttributes, tags: [String]) {
        self.name = name
        self.ideal = ideal
        self.tags = tags
    }
}

public enum NamedAesthetics {

    /// The 12 named aesthetics with their "ideal point" in (warmth, complexity, formality, era)
    /// space. The LocalAestheteEngine picks the nearest archetype to the user's profile vector.
    public static let all: [NamedAesthetic] = [
        NamedAesthetic(
            name: "Modern Warmth",
            ideal: ImageAttributes(warmth: 0.7, complexity: -0.2, formality: -0.1, era: -0.3),
            tags: ["Natural Materials", "Clean Lines", "Warm Tones", "Lived-In"]
        ),
        NamedAesthetic(
            name: "Heritage Comfort",
            ideal: ImageAttributes(warmth: 0.8, complexity: 0.7, formality: 0.5, era: 0.8),
            tags: ["Layered Textures", "Rich Colors", "Traditional", "Inviting"]
        ),
        NamedAesthetic(
            name: "Curated Minimal",
            ideal: ImageAttributes(warmth: 0.1, complexity: -0.8, formality: 0.2, era: -0.3),
            tags: ["Intentional", "Restrained", "Negative Space", "Quiet"]
        ),
        NamedAesthetic(
            name: "Natural Living",
            ideal: ImageAttributes(warmth: 0.6, complexity: 0.2, formality: -0.4, era: 0.2),
            tags: ["Organic", "Earth Tones", "Casual", "Grounded"]
        ),
        NamedAesthetic(
            name: "Urban Refuge",
            ideal: ImageAttributes(warmth: 0.3, complexity: 0.2, formality: 0.1, era: -0.4),
            tags: ["Industrial", "Cozy", "Functional", "Considered"]
        ),
        NamedAesthetic(
            name: "Collected Character",
            ideal: ImageAttributes(warmth: 0.4, complexity: 0.9, formality: 0.1, era: 0.4),
            tags: ["Mixed Periods", "Personal", "Story-Rich", "Layered"]
        ),
        NamedAesthetic(
            name: "Quiet Luxury",
            ideal: ImageAttributes(warmth: 0.2, complexity: 0, formality: 0.8, era: 0.3),
            tags: ["Premium Materials", "Understated", "Refined", "Considered"]
        ),
        NamedAesthetic(
            name: "Scandinavian Soul",
            ideal: ImageAttributes(warmth: 0.4, complexity: -0.5, formality: -0.2, era: -0.3),
            tags: ["Light Wood", "Functional", "Soft Palette", "Calm"]
        ),
        NamedAesthetic(
            name: "Artisan Modern",
            ideal: ImageAttributes(warmth: 0.5, complexity: 0.3, formality: 0.1, era: 0.1),
            tags: ["Handcrafted", "Modern Forms", "Material Honesty", "Intentional"]
        ),
        NamedAesthetic(
            name: "Lived-In Elegance",
            ideal: ImageAttributes(warmth: 0.6, complexity: 0.3, formality: 0.4, era: 0.4),
            tags: ["Quality Basics", "Soft Textures", "Effortless", "Warm"]
        ),
        NamedAesthetic(
            name: "Bold Composition",
            ideal: ImageAttributes(warmth: 0.2, complexity: 0.7, formality: 0.1, era: -0.1),
            tags: ["Strong Color", "Statement Pieces", "Confident", "Curated"]
        ),
        NamedAesthetic(
            name: "Pastoral Calm",
            ideal: ImageAttributes(warmth: 0.7, complexity: 0.3, formality: -0.3, era: 0.6),
            tags: ["Country References", "Natural Light", "Gentle Textures", "Serene"]
        )
    ]
}
