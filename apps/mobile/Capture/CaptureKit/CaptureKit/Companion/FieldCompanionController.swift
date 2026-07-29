//  FieldCompanionController.swift
//  CaptureKit
//
//  Observable integration seam for feature-owned Companion presentation.

import Observation

@MainActor
@Observable
public final class FieldCompanionController {
    public private(set) var presentation: FieldCompanionPresentationState
    public let defaultHint: String

    public init(
        initialPresentation: FieldCompanionPresentationState = .resting,
        defaultHint: String = "Next steps"
    ) {
        self.presentation = initialPresentation
        self.defaultHint = defaultHint
    }

    public func send(_ event: FieldCompanionPresentationEvent) {
        presentation = FieldCompanionPresentationReducer.transition(
            from: presentation,
            on: event,
            defaultHint: defaultHint
        )
    }
}
