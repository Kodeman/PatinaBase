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

// MARK: - Human-readable Taste Portrait

// swiftlint:disable file_length
/// A plain-language portrait assembled only from answers already persisted in
/// `StylePreferenceModel` (or the real result returned by the style quiz).
/// It does not invent recommendation rationale from empty feed fields.
@MainActor
public struct TastePortrait: Equatable {
    public let title: String
    public let summary: String
    public let materials: [String]
    public let evidence: [String]
    public let confidence: Double

    let materialKeys: [String]
    let keywordKeys: [String]

    public init?(preference: StylePreferenceModel) {
        let rawKeywords = preference.keywords.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let styleName = rawKeywords.first.map(Self.humanize) ?? "Your evolving taste"
        let rawMaterials = preference.materials.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let materialNames = rawMaterials.map(Self.humanize)

        guard !rawKeywords.isEmpty || !rawMaterials.isEmpty || preference.confidence > 0 else {
            return nil
        }

        self.title = styleName
        self.materials = materialNames
        self.materialKeys = rawMaterials.map(Self.normalized)
        self.keywordKeys = rawKeywords.map(Self.normalized)
        self.confidence = preference.confidence
        self.summary = Self.summary(styleName: styleName, materials: materialNames, warmth: preference.warmth)
        self.evidence = Self.preferenceEvidence(
            materials: materialNames,
            keywords: rawKeywords.dropFirst().map(Self.normalized),
            warmth: preference.warmth,
            budgetRange: preference.budgetRange
        )
    }

    /// Fallback used by the result screen before the durable SwiftData row is
    /// available. Every sentence is grounded in fields returned by the real
    /// quiz result (style, material, palette, and budget).
    public init(result: StyleProfileResult) {
        let material = Self.humanize(result.primaryMaterial)
        self.title = result.displayName
        self.materials = material.isEmpty ? [] : [material]
        self.materialKeys = material.isEmpty ? [] : [Self.normalized(material)]
        self.keywordKeys = [Self.normalized(result.primaryStyle)]
        self.confidence = result.confidence
        self.summary = Self.summary(
            styleName: result.displayName,
            materials: materials,
            warmth: result.paletteWarmth.lowercased().contains("warm") ? 0.75 : 0.3
        )

        var evidence: [String] = []
        if !material.isEmpty {
            evidence.append("You chose \(material). Patina will begin with that material signal.")
        }
        if !result.paletteWarmth.isEmpty {
            evidence.append("Your palette answer was \(result.paletteWarmth.lowercased()), which guides the color temperature of the edit.")
        }
        if !result.budgetLabel.isEmpty, result.budgetLabel != "TBD" {
            evidence.append("Your \(result.budgetLabel) range keeps the recommendations grounded in the investment you named.")
        }
        self.evidence = evidence
    }

    /// A recommendation explanation only when a real signal supports it:
    /// matching material tags, matching style tags, or a room-scoped RPC.
    func recommendationRationale(for product: Product, roomName: String?) -> String? {
        let productMaterialTokens = Set(product.materialTags.flatMap(Self.tokens))
        if let materialIndex = materialKeys.firstIndex(where: { key in
            !Set(Self.tokens(key)).isDisjoint(with: productMaterialTokens)
        }) {
            return "\(materials[materialIndex]) matches a material you chose."
        }

        let productStyleTokens = Set(product.styleTags.flatMap(Self.tokens))
        if keywordKeys.contains(where: { key in
            !Set(Self.tokens(key)).isDisjoint(with: productStyleTokens)
        }) {
            return "Its style tags connect to your \(title) portrait."
        }

        if let roomName, !roomName.isEmpty {
            return "Selected from Patina's room-aware edit for \(roomName)."
        }
        return nil
    }

    private static func summary(styleName: String, materials: [String], warmth: Double) -> String {
        if !materials.isEmpty {
            return "\(styleName), grounded in \(naturalList(materials.prefix(2).map { $0 }))."
        }
        switch warmth {
        case ..<0.4:
            return "\(styleName), with a cooler, clearer palette."
        case 0.62...:
            return "\(styleName), with a warmer, softer palette."
        default:
            return "\(styleName), with a balanced palette."
        }
    }

    private static func preferenceEvidence(
        materials: [String],
        keywords: [String],
        warmth: Double,
        budgetRange: String?
    ) -> [String] {
        var evidence: [String] = []

        if !materials.isEmpty {
            evidence.append(
                "You chose \(naturalList(materials.prefix(3).map { $0 })). Patina will begin with those material signals."
            )
        }

        if let lifestyle = lifestyleRationale(from: keywords) {
            evidence.append(lifestyle)
        }

        if warmth >= 0.62 {
            evidence.append("Your answers lean warm, so the edit will favor softened neutrals and warmer finishes.")
        } else if warmth < 0.4 {
            evidence.append("Your answers lean cool, so the edit will favor clearer neutrals and cooler finishes.")
        }

        if let budget = formattedBudget(budgetRange) {
            evidence.append("Your \(budget) room range keeps the edit grounded in the investment you named.")
        }

        return evidence
    }

    private static func lifestyleRationale(from keywords: [String]) -> String? {
        let values = Set(keywords)
        if !values.isDisjoint(with: ["sanctuary", "personal_retreat", "retreat", "rest"]) {
            return "Your sanctuary and rest answers point toward quiet, restorative pieces."
        }
        if !values.isDisjoint(with: ["entertaining", "gathering", "family", "family_central"]) {
            return "Your gathering answers favor pieces that make everyday connection easier."
        }
        if values.contains("work_from_home") {
            return "Your work-from-home answer gives comfort, focus, and practical scale extra weight."
        }
        if !values.isDisjoint(with: ["invest_quality", "making_it_mine"]) {
            return "You said this space should feel more your own, so character and longevity carry more weight."
        }
        return nil
    }

    private static func formattedBudget(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let parts = raw.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2, parts[0] > 0, parts[1] > 0 else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        guard let low = formatter.string(from: NSNumber(value: parts[0])),
              let high = formatter.string(from: NSNumber(value: parts[1])) else {
            return nil
        }
        return "\(low)–\(high)"
    }

    private static func naturalList(_ values: [String]) -> String {
        switch values.count {
        case 0: return ""
        case 1: return values[0]
        case 2: return "\(values[0]) and \(values[1])"
        default:
            guard let last = values.last else { return "" }
            return values.dropLast().joined(separator: ", ") + ", and " + last
        }
    }

    static func humanize(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .split(separator: " ")
            .map { word in
                let lower = word.lowercased()
                if lower == "midcentury" { return "Mid-Century" }
                return lower.prefix(1).uppercased() + String(lower.dropFirst())
            }
            .joined(separator: " ")
    }

    private static func normalized(_ raw: String) -> String {
        raw.lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")
    }

    private static func tokens(_ raw: String) -> [String] {
        normalized(raw)
            .split(separator: "_")
            .map(String.init)
            .filter { !$0.isEmpty && !["soft", "smooth", "aged", "brushed", "weathered"].contains($0) }
    }
}

public enum TasteAdjustment: String, CaseIterable, Identifiable, Sendable {
    case warmer
    case cooler
    case moreRelaxed = "more_relaxed"
    case moreTailored = "more_tailored"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .warmer: return "A little warmer"
        case .cooler: return "A little cooler"
        case .moreRelaxed: return "More relaxed"
        case .moreTailored: return "More tailored"
        }
    }

    public var analyticsDimension: String {
        switch self {
        case .warmer, .cooler: return "warmth"
        case .moreRelaxed, .moreTailored: return "formality"
        }
    }

    public var analyticsDirection: String {
        switch self {
        case .warmer, .moreTailored: return "increase"
        case .cooler, .moreRelaxed: return "decrease"
        }
    }
}
