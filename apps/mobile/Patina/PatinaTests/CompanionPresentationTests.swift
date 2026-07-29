//
//  CompanionPresentationTests.swift
//  PatinaTests
//
//  Canonical state and policy coverage for the Companion Hearth.
//

@testable import Patina
import CoreFoundation
import Testing

@MainActor
struct CompanionPresentationTests {
    @Test
    func restingPresentationIsCollapsedByDefault() {
        let state = CompanionPresentationState.resting

        #expect(state.canonicalState == .collapsed)
        #expect(state.analyticsState == "collapsed")
        #expect(state.accessibilityLabel == "Patina companion")
        #expect(state.accessibilityValue == "Next steps")
        #expect(!state.usesFullSheet)
    }

    @Test
    func progressClampsFractionAndStepToValidBounds() {
        let progress = CompanionProgressPresentation(
            fraction: 1.4,
            title: "Measuring the room",
            detail: "Keep moving",
            step: 8,
            totalSteps: 4
        )

        #expect(progress.fraction == 1)
        #expect(progress.percentComplete == 100)
        #expect(progress.step == 4)
        #expect(progress.totalSteps == 4)
        #expect(progress.stepDescription == "Step 4 of 4")
        #expect(progress.accessibilityValue == "100 percent, Step 4 of 4, Keep moving")
    }

    @Test
    func invalidStepMetadataIsRemovedRatherThanAnnounced() {
        let progress = CompanionProgressPresentation(
            fraction: -0.5,
            title: "Beginning",
            step: 1,
            totalSteps: 0
        )

        #expect(progress.fraction == 0)
        #expect(progress.percentComplete == 0)
        #expect(progress.step == nil)
        #expect(progress.totalSteps == nil)
        #expect(progress.stepDescription == nil)
        #expect(progress.accessibilityValue == "0 percent")
    }

    @Test
    func reducerMovesThroughCanonicalStatesAndBackToRest() {
        let progress = CompanionProgressPresentation(
            fraction: 0.62,
            title: "Measuring the room"
        )
        let expanded = CompanionExpandedPresentation(
            title: "Materials you love",
            detail: "Question 3 of 5"
        )

        let progressing = CompanionPresentationReducer.transition(
            from: .resting,
            on: .reportProgress(progress)
        )
        #expect(progressing.canonicalState == .progress)

        let communicating = CompanionPresentationReducer.transition(
            from: progressing,
            on: .communicate(expanded)
        )
        #expect(communicating.canonicalState == .expanded)

        let resting = CompanionPresentationReducer.transition(
            from: communicating,
            on: .dismiss
        )
        #expect(resting == .collapsed(hint: "Next steps"))
    }

    @Test
    func blankCollapsedHintFallsBackToDefault() {
        let state = CompanionPresentationReducer.transition(
            from: .resting,
            on: .collapse(hint: "   "),
            defaultHint: "What’s next"
        )

        #expect(state == .collapsed(hint: "What’s next"))
    }

    @Test
    func briefCommunicationUsesCardNeverFullSheet() {
        let content = CompanionExpandedPresentation(
            title: "A considered next move",
            communicationLength: .brief
        )
        let state = CompanionPresentationState.expanded(content)

        #expect(content.extent == .card)
        #expect(!state.usesFullSheet)
    }

    @Test
    func longFormCommunicationExplicitlyOptsIntoFullSheet() {
        let content = CompanionExpandedPresentation(
            title: "A longer conversation",
            communicationLength: .longForm
        )
        let state = CompanionPresentationState.expanded(content)

        #expect(content.extent == .fullSheet)
        #expect(state.usesFullSheet)
    }

    @Test
    func companionMotionAndHearthMetricsStayWithinTheProductContract() {
        #expect(CompanionConstants.buttonSize >= 56)
        #expect(CompanionConstants.buttonSize <= 64)
        #expect(CompanionConstants.minimumTouchTarget >= 44)
        #expect(CompanionConstants.springResponse >= 0.42)
        #expect(CompanionConstants.springResponse <= 0.52)
        #expect(CompanionHearthMetrics.reservedHeight >= CompanionConstants.buttonSize)
        #expect(CompanionConstants.contentFollowDelay > 0)
    }
}
