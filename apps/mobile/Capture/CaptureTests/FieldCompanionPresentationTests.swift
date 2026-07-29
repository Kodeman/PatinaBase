//  FieldCompanionPresentationTests.swift
//  CaptureTests
//
//  Pure contracts for Patina Field's deterministic Option B Companion.

import Testing
@testable import CaptureKit

struct FieldCompanionPresentationTests {

    @Test func determinateProgressClampsAndFormatsAccessibility() {
        let belowRange = FieldCompanionProgressPresentation(
            kind: .determinate(-0.2),
            title: "Preparing scan"
        )
        let aboveRange = FieldCompanionProgressPresentation(
            kind: .determinate(1.4),
            title: "Finishing scan",
            detail: "Saving the room"
        )

        #expect(belowRange.fraction == 0)
        #expect(belowRange.percentComplete == 0)
        #expect(belowRange.accessibilityValue == "0 percent")
        #expect(aboveRange.fraction == 1)
        #expect(aboveRange.percentComplete == 100)
        #expect(aboveRange.accessibilityValue == "100 percent, Saving the room")
    }

    @Test func indeterminateProgressNeverInventsAPercentage() {
        let progress = FieldCompanionProgressPresentation(
            kind: .indeterminate,
            title: "Uploading scan",
            detail: "Keeping this screen open"
        )

        #expect(progress.fraction == nil)
        #expect(progress.percentComplete == nil)
        #expect(progress.accessibilityValue == "In progress, Keeping this screen open")
    }

    @Test func stepMetadataIsClampedOrRemovedAsAPair() {
        let clamped = FieldCompanionProgressPresentation(
            kind: .determinate(0.5),
            title: "Scanning",
            step: 9,
            totalSteps: 4
        )
        let invalid = FieldCompanionProgressPresentation(
            kind: .determinate(0.5),
            title: "Scanning",
            step: 1,
            totalSteps: 0
        )

        #expect(clamped.step == 4)
        #expect(clamped.totalSteps == 4)
        #expect(clamped.stepDescription == "Step 4 of 4")
        #expect(invalid.step == nil)
        #expect(invalid.totalSteps == nil)
    }

    @Test func statePublishesStableCanonicalAndAccessibilityContracts() {
        let collapsed = FieldCompanionPresentationState.collapsed(
            .init(hint: "Review next steps")
        )
        let progress = FieldCompanionPresentationState.progress(
            .init(kind: .determinate(0.25), title: "Scanning room")
        )
        let expanded = FieldCompanionPresentationState.expanded(
            .init(title: "One thing needs attention", detail: "Move closer to the far wall.")
        )

        #expect(collapsed.canonicalState == .collapsed)
        #expect(collapsed.accessibilityLabel == "Patina companion")
        #expect(collapsed.accessibilityValue == "Review next steps")
        #expect(progress.canonicalState == .progress)
        #expect(progress.accessibilityLabel == "Scanning room")
        #expect(progress.accessibilityValue == "25 percent")
        #expect(expanded.canonicalState == .expanded)
        #expect(expanded.accessibilityLabel == "One thing needs attention")
        #expect(expanded.accessibilityValue == "Move closer to the far wall.")
    }

    @Test func reducerNormalizesCollapsedHintAndDismissesToResting() {
        let expanded = FieldCompanionPresentationState.expanded(
            .init(title: "Ready to review")
        )

        let collapsed = FieldCompanionPresentationReducer.transition(
            from: expanded,
            on: .collapse(hint: "   ", action: nil),
            defaultHint: "Next steps"
        )
        let dismissed = FieldCompanionPresentationReducer.transition(
            from: expanded,
            on: .dismiss,
            defaultHint: "Next steps"
        )

        #expect(collapsed == .collapsed(.init(hint: "Next steps")))
        #expect(dismissed == .collapsed(.init(hint: "Next steps")))
    }

    @Test func dismissIsIdempotentForHiddenAndCollapsedStates() {
        let hidden = FieldCompanionPresentationState.hidden(reason: .cameraActive)
        let collapsed = FieldCompanionPresentationState.collapsed(
            .init(hint: "Next steps")
        )

        #expect(FieldCompanionPresentationReducer.transition(from: hidden, on: .dismiss) == hidden)
        #expect(FieldCompanionPresentationReducer.transition(from: collapsed, on: .dismiss) == collapsed)
    }

    @Test func reducerCarriesTypedActionsWithoutClosures() {
        let action = FieldCompanionAction(id: "scan.retry", label: "Retry", role: .primary)
        let message = FieldCompanionExpandedPresentation(
            title: "Upload paused",
            detail: "Your scan is still on this device.",
            primaryAction: action
        )

        let state = FieldCompanionPresentationReducer.transition(
            from: .hidden(reason: .explicit),
            on: .communicate(message)
        )

        #expect(state == .expanded(message))
        #expect(message.actions == [action])
    }

    @Test func progressMilestonesAnnounceOnlyOnForwardThresholdCrossings() {
        let progress = FieldCompanionProgressPresentation(
            kind: .determinate(0.51),
            title: "Scanning room"
        )

        #expect(FieldCompanionProgressAnnouncementPolicy.thresholdCrossed(
            from: 0.24,
            to: progress
        ) == 50)
        #expect(FieldCompanionProgressAnnouncementPolicy.announcement(
            from: 0.49,
            to: progress
        ) == "Scanning room, 50 percent")
        #expect(FieldCompanionProgressAnnouncementPolicy.thresholdCrossed(
            from: 0.51,
            to: progress
        ) == nil)
        #expect(FieldCompanionProgressAnnouncementPolicy.thresholdCrossed(
            from: 0.8,
            to: progress
        ) == nil)
    }

    @Test func progressMilestonesDoNotAnnounceInitialOrIndeterminateState() {
        let determinate = FieldCompanionProgressPresentation(
            kind: .determinate(0.76),
            title: "Scanning room"
        )
        let indeterminate = FieldCompanionProgressPresentation(
            kind: .indeterminate,
            title: "Uploading scan"
        )

        #expect(FieldCompanionProgressAnnouncementPolicy.thresholdCrossed(
            from: nil,
            to: determinate
        ) == nil)
        #expect(FieldCompanionProgressAnnouncementPolicy.thresholdCrossed(
            from: 0.2,
            to: indeterminate
        ) == nil)
    }

    @Test func completionMilestoneUsesCompletionLanguage() {
        let complete = FieldCompanionProgressPresentation(
            kind: .determinate(1),
            title: "Scan"
        )

        #expect(FieldCompanionProgressAnnouncementPolicy.announcement(
            from: 0.9,
            to: complete
        ) == "Scan complete")
    }

    @Test @MainActor func controllerAppliesReducerAndOwnsTheDefaultHint() {
        let controller = FieldCompanionController(
            initialPresentation: .hidden(reason: .cameraActive),
            defaultHint: "Field notes"
        )

        controller.send(.communicate(.init(title: "Ready to review")))
        #expect(controller.presentation.canonicalState == .expanded)

        controller.send(.dismiss)
        #expect(controller.presentation == .collapsed(.init(hint: "Field notes")))
    }
}
