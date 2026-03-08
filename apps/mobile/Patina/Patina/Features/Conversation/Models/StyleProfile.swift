//
//  StyleProfile.swift
//  Patina
//
//  User style profile extracted from conversations
//

import Foundation

/// User's extracted style profile from conversation
public struct StyleProfile: Codable, Equatable {
    /// Overall warmth preference (cool to warm)
    public var warmth: WarmthLevel

    /// Formality level (casual to formal)
    public var formality: FormalityLevel

    /// Preferred materials
    public var materials: [MaterialType]

    /// Design era preferences
    public var eraPreferences: [DesignEra]

    /// Color palette preferences
    public var colorPalette: ColorPalette

    /// Pattern preferences
    public var patternPreference: PatternPreference

    /// Scale preference (small/delicate to large/bold)
    public var scalePreference: ScalePreference

    /// Keywords extracted from conversation
    public var styleKeywords: [String]

    /// Confidence score (0-1) for this profile
    public var confidence: Double

    /// Last updated timestamp
    public var lastUpdated: Date

    public init(
        warmth: WarmthLevel = .neutral,
        formality: FormalityLevel = .casual,
        materials: [MaterialType] = [],
        eraPreferences: [DesignEra] = [],
        colorPalette: ColorPalette = ColorPalette(),
        patternPreference: PatternPreference = .minimal,
        scalePreference: ScalePreference = .medium,
        styleKeywords: [String] = [],
        confidence: Double = 0,
        lastUpdated: Date = Date()
    ) {
        self.warmth = warmth
        self.formality = formality
        self.materials = materials
        self.eraPreferences = eraPreferences
        self.colorPalette = colorPalette
        self.patternPreference = patternPreference
        self.scalePreference = scalePreference
        self.styleKeywords = styleKeywords
        self.confidence = confidence
        self.lastUpdated = lastUpdated
    }
}

// MARK: - Warmth Level

public enum WarmthLevel: String, Codable, CaseIterable {
    case cool = "cool"
    case slightlyCool = "slightly_cool"
    case neutral = "neutral"
    case slightlyWarm = "slightly_warm"
    case warm = "warm"

    public var displayName: String {
        switch self {
        case .cool: return "Cool"
        case .slightlyCool: return "Slightly Cool"
        case .neutral: return "Neutral"
        case .slightlyWarm: return "Slightly Warm"
        case .warm: return "Warm"
        }
    }

    public var numericValue: Double {
        switch self {
        case .cool: return 0
        case .slightlyCool: return 0.25
        case .neutral: return 0.5
        case .slightlyWarm: return 0.75
        case .warm: return 1.0
        }
    }
}

// MARK: - Formality Level

public enum FormalityLevel: String, Codable, CaseIterable {
    case veryCasual = "very_casual"
    case casual = "casual"
    case balanced = "balanced"
    case formal = "formal"
    case veryFormal = "very_formal"

    public var displayName: String {
        switch self {
        case .veryCasual: return "Very Casual"
        case .casual: return "Casual"
        case .balanced: return "Balanced"
        case .formal: return "Formal"
        case .veryFormal: return "Very Formal"
        }
    }
}

// MARK: - Design Era

public enum DesignEra: String, Codable, CaseIterable {
    case antique = "antique"           // Pre-1900
    case artDeco = "art_deco"          // 1920s-1930s
    case midCentury = "mid_century"    // 1940s-1960s
    case vintage = "vintage"           // 1970s-1990s
    case contemporary = "contemporary" // 2000s-present
    case futuristic = "futuristic"     // Forward-looking
    case timeless = "timeless"         // Era-agnostic

    public var displayName: String {
        switch self {
        case .antique: return "Antique"
        case .artDeco: return "Art Deco"
        case .midCentury: return "Mid-Century Modern"
        case .vintage: return "Vintage"
        case .contemporary: return "Contemporary"
        case .futuristic: return "Futuristic"
        case .timeless: return "Timeless"
        }
    }

    public var yearRange: String {
        switch self {
        case .antique: return "Pre-1900"
        case .artDeco: return "1920s-1930s"
        case .midCentury: return "1940s-1960s"
        case .vintage: return "1970s-1990s"
        case .contemporary: return "2000s-Present"
        case .futuristic: return "Forward-looking"
        case .timeless: return "Era-agnostic"
        }
    }
}

// MARK: - Color Palette

public struct ColorPalette: Codable, Equatable {
    /// Primary colors user gravitates toward
    public var primaryColors: [String]

    /// Accent colors for pops of interest
    public var accentColors: [String]

    /// Colors to avoid
    public var avoidColors: [String]

    /// Neutral preference (cool grays vs warm beiges)
    public var neutralTone: NeutralTone

    public init(
        primaryColors: [String] = [],
        accentColors: [String] = [],
        avoidColors: [String] = [],
        neutralTone: NeutralTone = .warm
    ) {
        self.primaryColors = primaryColors
        self.accentColors = accentColors
        self.avoidColors = avoidColors
        self.neutralTone = neutralTone
    }
}

// MARK: - Neutral Tone

public enum NeutralTone: String, Codable {
    case cool = "cool"    // Grays, silvers, cool whites
    case warm = "warm"    // Beiges, creams, warm whites
    case mixed = "mixed"  // Combination of both
}

// MARK: - Pattern Preference

public enum PatternPreference: String, Codable, CaseIterable {
    case none = "none"              // Solid colors only
    case minimal = "minimal"        // Subtle textures
    case moderate = "moderate"      // Some patterns
    case bold = "bold"              // Statement patterns
    case eclectic = "eclectic"      // Mix of patterns

    public var displayName: String {
        switch self {
        case .none: return "Solid Colors"
        case .minimal: return "Minimal/Textured"
        case .moderate: return "Moderate Patterns"
        case .bold: return "Bold Patterns"
        case .eclectic: return "Eclectic Mix"
        }
    }
}

// MARK: - Scale Preference

public enum ScalePreference: String, Codable, CaseIterable {
    case petite = "petite"      // Small, delicate pieces
    case small = "small"        // Compact, space-conscious
    case medium = "medium"      // Standard proportions
    case large = "large"        // Generous, comfortable
    case statement = "statement" // Oversized, bold

    public var displayName: String {
        switch self {
        case .petite: return "Petite & Delicate"
        case .small: return "Compact"
        case .medium: return "Medium"
        case .large: return "Generous"
        case .statement: return "Statement Pieces"
        }
    }
}

// MARK: - Style Profile Extensions

extension StyleProfile {
    /// Generate a natural language description of the style
    public var description: String {
        var parts: [String] = []

        // Warmth and formality
        let warmthDesc = warmth == .neutral ? "" : "\(warmth.displayName.lowercased()), "
        let formalityDesc = formality.displayName.lowercased()
        parts.append("\(warmthDesc)\(formalityDesc) aesthetic")

        // Materials
        if !materials.isEmpty {
            let materialNames = materials.prefix(3).map { $0.displayName.lowercased() }
            parts.append("favoring \(materialNames.joined(separator: ", "))")
        }

        // Era
        if let primaryEra = eraPreferences.first {
            parts.append("with \(primaryEra.displayName.lowercased()) influences")
        }

        return parts.joined(separator: " ")
    }

    /// Check if profile has enough data for recommendations
    public var isComplete: Bool {
        confidence >= 0.5 && !materials.isEmpty && !eraPreferences.isEmpty
    }

    /// Merge with another profile, taking higher confidence values
    public func merged(with other: StyleProfile) -> StyleProfile {
        var merged = self

        // Take the more confident warmth/formality
        if other.confidence > self.confidence {
            merged.warmth = other.warmth
            merged.formality = other.formality
        }

        // Combine materials (unique)
        merged.materials = Array(Set(materials + other.materials))

        // Combine era preferences (unique)
        merged.eraPreferences = Array(Set(eraPreferences + other.eraPreferences))

        // Combine keywords
        merged.styleKeywords = Array(Set(styleKeywords + other.styleKeywords))

        // Average confidence
        merged.confidence = (confidence + other.confidence) / 2

        merged.lastUpdated = Date()

        return merged
    }
}
