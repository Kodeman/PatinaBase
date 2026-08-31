//  FieldCompanionPresentation.swift
//  CaptureKit
//
//  Deterministic, service-free presentation contracts for Patina Field's
//  Option B Companion. Feature code supplies copy and typed action IDs; this
//  layer owns normalization, state transitions, and accessibility semantics.

import Foundation

public enum FieldCompanionCanonicalState: String, CaseIterable, Sendable {
    case hidden
    case collapsed
    case progress
    case expanded
}

public enum FieldCompanionHiddenReason: String, Equatable, Sendable {
    case cameraActive
    case modalPresented
    case onboarding
    case featureOwned
    case unavailable
    case explicit
}

public struct FieldCompanionAction: Equatable, Identifiable, Sendable {
    public enum Role: String, Equatable, Sendable {
        case primary
        case secondary
        case destructive
    }

    public let id: String
    public let label: String
    public let role: Role

    public init(id: String, label: String, role: Role = .primary) {
        self.id = id
        self.label = label
        self.role = role
    }
}

/// The visit-spine action ids (spec §14, site 3 of 3): the strip's "Start a
/// visit" / "End visit" affordance, reachable from every non-camera screen.
/// `FieldTodayBand.companionHint` constructs `FieldCompanionAction`s from
/// these, and `RootView.handleCompanionAction` switches on them — one shared
/// source so renaming an id is a compile error at every call site, not a
/// silent mismatch between the string that gets sent and the string that
/// gets matched.
public enum FieldCompanionActionID: String, CaseIterable, Sendable {
    case openVisit = "visit.open"
    case endVisit = "visit.end"
}

public struct FieldCompanionCollapsedPresentation: Equatable, Sendable {
    public let hint: String
    public let action: FieldCompanionAction?

    public init(hint: String, action: FieldCompanionAction? = nil) {
        self.hint = hint
        self.action = action
    }
}

public enum FieldCompanionProgressKind: Equatable, Sendable {
    case determinate(Double)
    case indeterminate

    /// Builds honest aggregate progress when transfer snapshots expose
    /// per-item percentages. An empty collection means the host knows work is
    /// active, but not how far along it is.
    public static func averaging(percentages: [Int]) -> Self {
        guard !percentages.isEmpty else { return .indeterminate }
        let total = percentages.reduce(0) { partial, percentage in
            partial + min(max(percentage, 0), 100)
        }
        return .determinate(Double(total) / Double(percentages.count) / 100)
    }
}

public struct FieldCompanionProgressPresentation: Equatable, Sendable {
    /// Stable identity for milestone announcements while visible copy changes.
    public let activityID: String
    public let kind: FieldCompanionProgressKind
    public let title: String
    public let detail: String?
    public let step: Int?
    public let totalSteps: Int?
    public let action: FieldCompanionAction?

    public init(
        activityID: String? = nil,
        kind: FieldCompanionProgressKind,
        title: String,
        detail: String? = nil,
        step: Int? = nil,
        totalSteps: Int? = nil,
        action: FieldCompanionAction? = nil
    ) {
        self.activityID = activityID ?? title

        switch kind {
        case let .determinate(fraction):
            self.kind = .determinate(min(max(fraction, 0), 1))
        case .indeterminate:
            self.kind = .indeterminate
        }

        self.title = title
        self.detail = detail
        self.action = action

        if let step, let totalSteps, totalSteps > 0 {
            self.step = min(max(step, 1), totalSteps)
            self.totalSteps = totalSteps
        } else {
            self.step = nil
            self.totalSteps = nil
        }
    }

    public var fraction: Double? {
        guard case let .determinate(fraction) = kind else { return nil }
        return fraction
    }

    public var percentComplete: Int? {
        fraction.map { Int(($0 * 100).rounded()) }
    }

    public var stepDescription: String? {
        guard let step, let totalSteps else { return nil }
        return "Step \(step) of \(totalSteps)"
    }

    public var accessibilityValue: String {
        var parts: [String]
        if let percentComplete {
            parts = ["\(percentComplete) percent"]
        } else {
            parts = ["In progress"]
        }

        if let stepDescription {
            parts.append(stepDescription)
        }
        if let detail, !detail.isEmpty {
            parts.append(detail)
        }
        return parts.joined(separator: ", ")
    }
}

public struct FieldCompanionExpandedPresentation: Equatable, Sendable {
    public let title: String
    public let detail: String?
    public let primaryAction: FieldCompanionAction?
    public let secondaryAction: FieldCompanionAction?

    public init(
        title: String,
        detail: String? = nil,
        primaryAction: FieldCompanionAction? = nil,
        secondaryAction: FieldCompanionAction? = nil
    ) {
        self.title = title
        self.detail = detail
        self.primaryAction = primaryAction
        self.secondaryAction = secondaryAction
    }

    public var actions: [FieldCompanionAction] {
        [primaryAction, secondaryAction].compactMap { $0 }
    }
}

public enum FieldCompanionPresentationState: Equatable, Sendable {
    case hidden(reason: FieldCompanionHiddenReason)
    case collapsed(FieldCompanionCollapsedPresentation)
    case progress(FieldCompanionProgressPresentation)
    case expanded(FieldCompanionExpandedPresentation)

    public static let resting = FieldCompanionPresentationState.collapsed(
        .init(hint: "Next steps")
    )

    public var canonicalState: FieldCompanionCanonicalState {
        switch self {
        case .hidden:
            return .hidden
        case .collapsed:
            return .collapsed
        case .progress:
            return .progress
        case .expanded:
            return .expanded
        }
    }

    public var accessibilityLabel: String? {
        switch self {
        case .hidden:
            return nil
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
        case .hidden:
            return nil
        case let .collapsed(content):
            return content.hint
        case let .progress(progress):
            return progress.accessibilityValue
        case let .expanded(content):
            return content.detail
        }
    }
}

public enum FieldCompanionPresentationEvent: Equatable, Sendable {
    case hide(reason: FieldCompanionHiddenReason)
    case collapse(hint: String?, action: FieldCompanionAction?)
    case reportProgress(FieldCompanionProgressPresentation)
    case communicate(FieldCompanionExpandedPresentation)
    case dismiss
}

public enum FieldCompanionPresentationReducer {
    public static func transition(
        from current: FieldCompanionPresentationState,
        on event: FieldCompanionPresentationEvent,
        defaultHint: String = "Next steps"
    ) -> FieldCompanionPresentationState {
        switch event {
        case let .hide(reason):
            return .hidden(reason: reason)
        case let .collapse(hint, action):
            return .collapsed(
                .init(hint: normalizedHint(hint, fallback: defaultHint), action: action)
            )
        case let .reportProgress(progress):
            return .progress(progress)
        case let .communicate(content):
            return .expanded(content)
        case .dismiss:
            switch current {
            case .hidden, .collapsed:
                return current
            case .progress, .expanded:
                return .collapsed(.init(hint: normalizedHint(nil, fallback: defaultHint)))
            }
        }
    }

    private static func normalizedHint(_ hint: String?, fallback: String) -> String {
        guard let hint else { return fallback }
        let trimmed = hint.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}

public enum FieldCompanionProgressAnnouncementPolicy {
    public static let thresholds = [25, 50, 75, 100]

    public static func thresholdCrossed(
        from previousFraction: Double?,
        to progress: FieldCompanionProgressPresentation
    ) -> Int? {
        guard let previousFraction,
              let currentFraction = progress.fraction,
              currentFraction > previousFraction else {
            return nil
        }

        return thresholds.last { threshold in
            let fraction = Double(threshold) / 100
            return previousFraction < fraction && currentFraction >= fraction
        }
    }

    public static func announcement(
        from previousFraction: Double?,
        to progress: FieldCompanionProgressPresentation
    ) -> String? {
        guard let threshold = thresholdCrossed(from: previousFraction, to: progress) else {
            return nil
        }
        return threshold == 100
            ? "\(progress.title) complete"
            : "\(progress.title), \(threshold) percent"
    }
}
