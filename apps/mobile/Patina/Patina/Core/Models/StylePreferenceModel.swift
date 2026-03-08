//
//  StylePreferenceModel.swift
//  Patina
//
//  SwiftData model for user's style preferences
//

import SwiftData
import Foundation

/// Persisted style preferences extracted from conversations
@Model
public final class StylePreferenceModel {

    // MARK: - Properties

    /// Unique identifier
    @Attribute(.unique) public var id: UUID

    /// Overall warmth preference (0.0 = cool, 1.0 = warm)
    public var warmth: Double

    /// Formality level (0.0 = casual, 1.0 = formal)
    public var formality: Double

    /// Preferred materials (stored as JSON array)
    public var materialsJSON: String

    /// Era preferences (stored as JSON array)
    public var erasJSON: String

    /// Primary colors (stored as JSON array)
    public var primaryColorsJSON: String

    /// Accent colors (stored as JSON array)
    public var accentColorsJSON: String

    /// Pattern preference (0.0 = none, 1.0 = bold)
    public var patternPreference: Double

    /// Scale preference (0.0 = petite, 1.0 = statement)
    public var scalePreference: Double

    /// Style keywords extracted from conversation
    public var keywordsJSON: String

    /// Confidence score (0.0 to 1.0)
    public var confidence: Double

    /// Budget range identifier
    public var budgetRange: String?

    /// When the profile was created
    public var createdAt: Date

    /// Last updated timestamp
    public var updatedAt: Date

    // MARK: - Initialization

    public init(
        id: UUID = UUID(),
        warmth: Double = 0.5,
        formality: Double = 0.5,
        materials: [String] = [],
        eras: [String] = [],
        primaryColors: [String] = [],
        accentColors: [String] = [],
        patternPreference: Double = 0.3,
        scalePreference: Double = 0.5,
        keywords: [String] = [],
        confidence: Double = 0,
        budgetRange: String? = nil
    ) {
        self.id = id
        self.warmth = warmth
        self.formality = formality
        self.materialsJSON = Self.encodeArray(materials)
        self.erasJSON = Self.encodeArray(eras)
        self.primaryColorsJSON = Self.encodeArray(primaryColors)
        self.accentColorsJSON = Self.encodeArray(accentColors)
        self.patternPreference = patternPreference
        self.scalePreference = scalePreference
        self.keywordsJSON = Self.encodeArray(keywords)
        self.confidence = confidence
        self.budgetRange = budgetRange
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    // MARK: - JSON Helpers

    private static func encodeArray(_ array: [String]) -> String {
        (try? JSONEncoder().encode(array)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }

    private static func decodeArray(_ json: String) -> [String] {
        guard let data = json.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }

    // MARK: - Computed Properties

    /// Decoded materials array
    public var materials: [String] {
        get { Self.decodeArray(materialsJSON) }
        set { materialsJSON = Self.encodeArray(newValue) }
    }

    /// Decoded eras array
    public var eras: [String] {
        get { Self.decodeArray(erasJSON) }
        set { erasJSON = Self.encodeArray(newValue) }
    }

    /// Decoded primary colors array
    public var primaryColors: [String] {
        get { Self.decodeArray(primaryColorsJSON) }
        set { primaryColorsJSON = Self.encodeArray(newValue) }
    }

    /// Decoded accent colors array
    public var accentColors: [String] {
        get { Self.decodeArray(accentColorsJSON) }
        set { accentColorsJSON = Self.encodeArray(newValue) }
    }

    /// Decoded keywords array
    public var keywords: [String] {
        get { Self.decodeArray(keywordsJSON) }
        set { keywordsJSON = Self.encodeArray(newValue) }
    }

    /// Whether the profile has enough data for recommendations
    public var isComplete: Bool {
        confidence >= 0.5 && !materials.isEmpty && !eras.isEmpty
    }

    // MARK: - Methods

    /// Merge with extracted style data
    public func merge(
        warmth: Double?,
        formality: Double?,
        materials: [String]?,
        eras: [String]?,
        keywords: [String]?
    ) {
        if let w = warmth {
            self.warmth = (self.warmth + w) / 2.0
        }
        if let f = formality {
            self.formality = (self.formality + f) / 2.0
        }
        if let m = materials {
            self.materials = Array(Set(self.materials + m))
        }
        if let e = eras {
            self.eras = Array(Set(self.eras + e))
        }
        if let k = keywords {
            self.keywords = Array(Set(self.keywords + k))
        }

        // Increase confidence with each merge
        confidence = min(confidence + 0.1, 1.0)
        updatedAt = Date()
    }
}
