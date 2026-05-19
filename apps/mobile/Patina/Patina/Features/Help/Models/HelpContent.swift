//
//  HelpContent.swift
//  Patina
//
//  Swift mirror of the web `HelpContent` discriminated union from
//  `packages/help-system/src/contentTypes.ts`. Each case corresponds 1:1
//  to a Sanity `helpContent` document with the matching `contentType`
//  string (spec §7.2).
//
//  Decoding strategy
//  -----------------
//  Sanity returns a single `helpContent` document with shape:
//
//      {
//        "_type": "helpContent",
//        "surfaceKey": "...",
//        "persona": "designer",
//        "contentType": "tooltip",
//        "tooltipContent":     { "eyebrow": "...", "body": "..." },
//        "emptyStateContent":  { "heading": "...", "description": "...", ... },
//        "helpArticleContent": { "title": "...", "oneSentenceAnswer": "...", ... }
//      }
//
//  We use the top-level `contentType` field as the discriminator, then decode
//  the nested payload object whose key corresponds to that variant. Per the
//  Sanity schema, tooltip / fieldHelper / learnMore / coachmark all share the
//  same `tooltipContent` payload object; we re-route them to dedicated Swift
//  cases so call sites can pattern-match cleanly. `sectionIntroContent` is an
//  iOS-only variant (no web/Sanity equivalent yet) — its decoding path is a
//  best-effort fallback to the `tooltipContent` block when sourced from CMS.
//

import Foundation

// MARK: - Discriminator

/// The set of help-content variants the iOS module knows how to render.
/// Raw values match the Sanity `contentType` enum (spec §7.2.1).
public enum HelpContentType: String, Codable, CaseIterable, Sendable {
    case tooltip = "tooltip"
    case fieldHelper = "fieldHelper"
    case emptyState = "emptyState"
    case sectionIntro = "sectionIntro"
    case helpArticle = "helpArticle"
}

// MARK: - Payloads

public struct TooltipContent: Codable, Equatable, Sendable {
    public let body: String
    public let eyebrow: String?

    public init(body: String, eyebrow: String? = nil) {
        self.body = body
        self.eyebrow = eyebrow
    }
}

public struct FieldHelperContent: Codable, Equatable, Sendable {
    public let body: String
    public let eyebrow: String?

    public init(body: String, eyebrow: String? = nil) {
        self.body = body
        self.eyebrow = eyebrow
    }
}

public struct EmptyStateContent: Codable, Equatable, Sendable {
    public let heading: String
    public let description: String
    public let iconName: String?
    public let ctaLabel: String?
    public let ctaHref: String?

    public init(
        heading: String,
        description: String,
        iconName: String? = nil,
        ctaLabel: String? = nil,
        ctaHref: String? = nil
    ) {
        self.heading = heading
        self.description = description
        self.iconName = iconName
        self.ctaLabel = ctaLabel
        self.ctaHref = ctaHref
    }
}

public struct SectionIntroContent: Codable, Equatable, Sendable {
    public let body: String
    public let eyebrow: String?

    public init(body: String, eyebrow: String? = nil) {
        self.body = body
        self.eyebrow = eyebrow
    }
}

public struct HelpArticleContent: Codable, Equatable, Sendable {
    public let title: String
    /// Body is portable-text blocks from Sanity. We hold them as opaque JSON
    /// (`[String: JSONValue]` per block) so G2's renderer can decide how to
    /// transform them into SwiftUI. Treat the contents as untrusted CMS data.
    public let body: [PortableTextBlock]
    public let relatedArticles: [String]?
    public let eyebrow: String?
    public let oneSentenceAnswer: String?
    public let videoUrl: String?

    public init(
        title: String,
        body: [PortableTextBlock],
        relatedArticles: [String]? = nil,
        eyebrow: String? = nil,
        oneSentenceAnswer: String? = nil,
        videoUrl: String? = nil
    ) {
        self.title = title
        self.body = body
        self.relatedArticles = relatedArticles
        self.eyebrow = eyebrow
        self.oneSentenceAnswer = oneSentenceAnswer
        self.videoUrl = videoUrl
    }
}

// MARK: - Discriminated Union

/// All help-content variants the iOS module supports.
///
/// `Codable` conformance decodes a Sanity `helpContent` document by reading
/// the top-level `contentType` discriminator and then the nested payload
/// object (`tooltipContent`, `emptyStateContent`, etc.) corresponding to
/// that variant.
public enum HelpContent: Equatable, Sendable {
    case tooltip(TooltipContent)
    case fieldHelper(FieldHelperContent)
    case emptyState(EmptyStateContent)
    case sectionIntro(SectionIntroContent)
    case helpArticle(HelpArticleContent)

    /// The discriminator string for this variant, matching the Sanity
    /// `contentType` enum.
    public var contentType: HelpContentType {
        switch self {
        case .tooltip: return .tooltip
        case .fieldHelper: return .fieldHelper
        case .emptyState: return .emptyState
        case .sectionIntro: return .sectionIntro
        case .helpArticle: return .helpArticle
        }
    }
}

// MARK: - Codable

extension HelpContent: Codable {
    private enum CodingKeys: String, CodingKey {
        case contentType
        case tooltipContent
        case fieldHelperContent
        case emptyStateContent
        case sectionIntroContent
        case helpArticleContent
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(HelpContentType.self, forKey: .contentType)

        switch type {
        case .tooltip:
            // Sanity emits the tooltip payload under `tooltipContent`.
            let payload = try container.decode(TooltipContent.self, forKey: .tooltipContent)
            self = .tooltip(payload)

        case .fieldHelper:
            let payload: FieldHelperContent
            if let direct = try container.decodeIfPresent(FieldHelperContent.self, forKey: .fieldHelperContent) {
                payload = direct
            } else {
                // Sanity emits `tooltipContent` for fieldHelper docs too.
                let shared = try container.decode(TooltipContent.self, forKey: .tooltipContent)
                payload = FieldHelperContent(body: shared.body, eyebrow: shared.eyebrow)
            }
            self = .fieldHelper(payload)

        case .emptyState:
            let payload = try container.decode(EmptyStateContent.self, forKey: .emptyStateContent)
            self = .emptyState(payload)

        case .sectionIntro:
            let payload: SectionIntroContent
            if let direct = try container.decodeIfPresent(SectionIntroContent.self, forKey: .sectionIntroContent) {
                payload = direct
            } else {
                let shared = try container.decode(TooltipContent.self, forKey: .tooltipContent)
                payload = SectionIntroContent(body: shared.body, eyebrow: shared.eyebrow)
            }
            self = .sectionIntro(payload)

        case .helpArticle:
            let payload = try container.decode(HelpArticleContent.self, forKey: .helpArticleContent)
            self = .helpArticle(payload)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contentType, forKey: .contentType)

        switch self {
        case .tooltip(let payload):
            try container.encode(payload, forKey: .tooltipContent)
        case .fieldHelper(let payload):
            try container.encode(payload, forKey: .fieldHelperContent)
        case .emptyState(let payload):
            try container.encode(payload, forKey: .emptyStateContent)
        case .sectionIntro(let payload):
            try container.encode(payload, forKey: .sectionIntroContent)
        case .helpArticle(let payload):
            try container.encode(payload, forKey: .helpArticleContent)
        }
    }
}

// MARK: - PortableTextBlock

/// Lightweight representation of a Sanity portable-text block.
///
/// We do not attempt to model the full portable-text grammar here; the SwiftUI
/// renderer in Sprint 2 will walk the raw JSON. `_type`, `style`, and `children`
/// are the only fields that all blocks share, so they are surfaced explicitly;
/// everything else is preserved in `raw` so nothing is lost in the round-trip.
public struct PortableTextBlock: Codable, Equatable, Sendable {
    public let type: String
    public let style: String?
    public let children: [PortableTextSpan]?
    /// Full untyped payload, preserved so callers can read custom marks,
    /// annotations, list metadata, etc., without us having to model them
    /// upfront. Includes the typed fields above too, so we can encode
    /// straight from `raw`.
    public let raw: [String: JSONValue]

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode([String: JSONValue].self)
        self.raw = raw

        if case .string(let value) = raw["_type"] ?? .null {
            self.type = value
        } else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath,
                      debugDescription: "Portable-text block missing string `_type`")
            )
        }

        if case .string(let value) = raw["style"] ?? .null {
            self.style = value
        } else {
            self.style = nil
        }

        if case .array(let elements) = raw["children"] ?? .null {
            let data = try JSONEncoder().encode(elements)
            self.children = try JSONDecoder().decode([PortableTextSpan].self, from: data)
        } else {
            self.children = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(raw)
    }
}

/// A single span inside a portable-text block (typically a styled text run).
public struct PortableTextSpan: Codable, Equatable, Sendable {
    public let type: String
    public let text: String
    public let marks: [String]?

    private enum CodingKeys: String, CodingKey {
        case type = "_type"
        case text
        case marks
    }

    public init(type: String = "span", text: String, marks: [String]? = nil) {
        self.type = type
        self.text = text
        self.marks = marks
    }
}

// MARK: - JSONValue

/// Type-erased JSON value used to preserve untyped Sanity payloads
/// (portable-text marks, annotations, etc.) through encode/decode cycles.
public enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported JSON value"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}
