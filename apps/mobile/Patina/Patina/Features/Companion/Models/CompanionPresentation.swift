//
//  CompanionPresentation.swift
//  Patina
//
//  Canonical presentation contract for the Companion Hearth.
//

import Foundation

/// The three visual states the Companion can occupy in the Hearth.
///
/// This intentionally describes presentation, not product context. Existing
/// context providers can adapt into this small contract without owning visual
/// geometry or animation.
public enum CompanionCanonicalState: String, CaseIterable, Sendable {
    case collapsed
    case progress
    case expanded
}

/// Expanded communication normally stays a compact card. A full sheet is an
/// explicit policy reserved for longer communication, never an ambient state.
public enum CompanionCommunicationLength: String, Sendable {
    case brief
    case longForm
}

public enum CompanionExpansionExtent: String, Sendable {
    case card
    case fullSheet
}

/// Content shown when the Companion widens into a progress capsule.
public struct CompanionProgressPresentation: Equatable, Sendable {
    public let fraction: Double
    public let title: String
    public let detail: String?
    public let step: Int?
    public let totalSteps: Int?
    public let actionLabel: String?

    public init(
        fraction: Double,
        title: String,
        detail: String? = nil,
        step: Int? = nil,
        totalSteps: Int? = nil,
        actionLabel: String? = nil
    ) {
        self.fraction = min(max(fraction, 0), 1)
        self.title = title
        self.detail = detail

        if let step, let totalSteps, totalSteps > 0 {
            self.step = min(max(step, 1), totalSteps)
            self.totalSteps = totalSteps
        } else {
            self.step = nil
            self.totalSteps = nil
        }

        self.actionLabel = actionLabel
    }

    public var percentComplete: Int {
        Int((fraction * 100).rounded())
    }

    public var stepDescription: String? {
        guard let step, let totalSteps else { return nil }
        return "Step \(step) of \(totalSteps)"
    }

    public var accessibilityValue: String {
        var parts = ["\(percentComplete) percent"]
        if let stepDescription {
            parts.append(stepDescription)
        }
        if let detail, !detail.isEmpty {
            parts.append(detail)
        }
        return parts.joined(separator: ", ")
    }
}

/// Content shown when the Companion needs card-sized communication space.
public struct CompanionExpandedPresentation: Equatable, Sendable {
    public let title: String
    public let detail: String?
    public let progress: CompanionProgressPresentation?
    public let communicationLength: CompanionCommunicationLength

    public init(
        title: String,
        detail: String? = nil,
        progress: CompanionProgressPresentation? = nil,
        communicationLength: CompanionCommunicationLength = .brief
    ) {
        self.title = title
        self.detail = detail
        self.progress = progress
        self.communicationLength = communicationLength
    }

    public var extent: CompanionExpansionExtent {
        communicationLength == .longForm ? .fullSheet : .card
    }
}

/// Canonical Companion presentation. The collapsed state is deliberately the
/// default: the Hearth reserves room, but it never paints a persistent bar.
public enum CompanionPresentationState: Equatable, Sendable {
    case collapsed(hint: String)
    case progress(CompanionProgressPresentation)
    case expanded(CompanionExpandedPresentation)

    public static let resting = CompanionPresentationState.collapsed(hint: "Next steps")

    public var canonicalState: CompanionCanonicalState {
        switch self {
        case .collapsed:
            return .collapsed
        case .progress:
            return .progress
        case .expanded:
            return .expanded
        }
    }

    public var usesFullSheet: Bool {
        guard case let .expanded(content) = self else { return false }
        return content.extent == .fullSheet
    }

    public var analyticsState: String {
        canonicalState.rawValue
    }

    public var accessibilityLabel: String {
        switch self {
        case .collapsed:
            return "Patina companion"
        case let .progress(progress):
            return progress.title
        case let .expanded(content):
            return content.title
        }
    }

    public var accessibilityValue: String? {
        switch self {
        case let .collapsed(hint):
            return hint
        case let .progress(progress):
            return progress.accessibilityValue
        case let .expanded(content):
            return content.progress?.accessibilityValue ?? content.detail
        }
    }
}

/// Backward-compatible transition seam for context owners. The reducer keeps
/// visual policy deterministic and directly testable without coupling it to
/// SwiftUI or the app coordinator.
public enum CompanionPresentationEvent: Equatable, Sendable {
    case collapse(hint: String?)
    case reportProgress(CompanionProgressPresentation)
    case communicate(CompanionExpandedPresentation)
    case dismiss
}

public enum CompanionPresentationReducer {
    public static func transition(
        from current: CompanionPresentationState,
        on event: CompanionPresentationEvent,
        defaultHint: String = "Next steps"
    ) -> CompanionPresentationState {
        switch event {
        case let .collapse(hint):
            return .collapsed(hint: normalizedHint(hint, fallback: defaultHint))
        case let .reportProgress(progress):
            return .progress(progress)
        case let .communicate(content):
            return .expanded(content)
        case .dismiss:
            if case .collapsed = current {
                return current
            }
            return .collapsed(hint: normalizedHint(nil, fallback: defaultHint))
        }
    }

    private static func normalizedHint(_ hint: String?, fallback: String) -> String {
        guard let hint else { return fallback }
        let trimmed = hint.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}

/// Short, deterministic copy that carries Option B's real context through the
/// same Companion shell. Live Studio attention does not depend on memory
/// consent; recency-based personalization is considered only after opt-in.
public enum CompanionContextualCopy {
    public static func collapsedHint(
        memory: CompanionMemoryContext?,
        studioAttentionHint: String?
    ) -> String {
        if let studioAttentionHint = normalized(studioAttentionHint) {
            return studioAttentionHint
        }

        guard let memory, memory.isPersonalizationEnabled else {
            return "Next steps"
        }

        if let projectAttention = normalized(memory.projectAttentionSummary) {
            return projectAttention
        }
        if let activeRoomName = normalized(memory.activeRoomName) {
            return "Continue with \(activeRoomName)"
        }
        if let savedItemName = normalized(memory.recentSavedItemName) {
            return "Build from \(savedItemName)"
        }
        return "Next steps"
    }

    public static func expandedDetail(
        memory: CompanionMemoryContext?,
        studioAttentionHint: String?
    ) -> String {
        if let studioAttentionHint = normalized(studioAttentionHint) {
            return "\(studioAttentionHint)."
        }

        guard let memory, memory.isPersonalizationEnabled else {
            return "A considered next move, based on where you are."
        }

        if let activeRoomName = normalized(memory.activeRoomName),
           let material = memory.preferredMaterials.compactMap({ normalized($0) }).first {
            return "Grounded in \(activeRoomName) and your preference for \(material)."
        }
        if let activeRoomName = normalized(memory.activeRoomName) {
            return "Grounded in \(activeRoomName) and the taste you’ve shared."
        }
        if let tasteSummary = normalized(memory.tasteSummary) {
            return tasteSummary
        }
        return "A considered next move, based on the taste you’ve shared."
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
