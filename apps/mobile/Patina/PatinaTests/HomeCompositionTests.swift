//
//  HomeCompositionTests.swift
//  PatinaTests
//
//  Direction B §2 — which blocks the home mounts, per tier, and how much room
//  each one takes. The rule lives in `HomeComposition` precisely so it can be
//  pinned here without rendering a view.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct HomeCompositionTests {

    // MARK: - Fixtures

    private static func row(
        kind: HouseRecordRow.Kind = .story,
        date: Date = Date(timeIntervalSince1970: 1_756_000_000),
        state: HouseRecordRow.State = .none,
        isNew: Bool = false,
        standing: Bool = false
    ) -> HouseRecordRow {
        HouseRecordRow(
            id: "row:\(kind.rawValue)", kind: kind, title: "Something happened.",
            detail: nil, date: date, state: state, isNew: isNew,
            isStandingCondition: standing, route: nil
        )
    }

    private static func record(
        needsYou: [HouseRecordRow] = [],
        moved: [HouseRecordRow] = []
    ) -> HouseRecord {
        HouseRecord(
            needsYou: needsYou, moved: moved,
            window: DateInterval(start: Date(timeIntervalSince1970: 1_755_000_000),
                                 duration: 7 * 24 * 60 * 60),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    // MARK: - The record's tier rule (C5, synthesis §5)

    @Test("a guest with an empty record is shown no record at all")
    func guestEmptyRecordDrawsNothing() {
        let input = HomeCompositionInput(isSignedIn: false, tier: .discovering, hasStory: true)
        #expect(HomeComposition.recordDraws(for: input) == false)
        let blocks = HomeComposition.blocks(for: input)
        #expect(!blocks.contains(.record))
        #expect(blocks.contains(.startWithARoom))
        #expect(blocks.contains(.story))
        #expect(blocks.contains(.signInLine))
        #expect(!blocks.contains(.designerSeat))
    }

    @Test("a discovering client with an empty record is shown no record either")
    func discoveringEmptyRecordDrawsNothing() {
        let input = HomeCompositionInput(isSignedIn: true, tier: .discovering)
        #expect(HomeComposition.recordDraws(for: input) == false)
        #expect(!HomeComposition.blocks(for: input).contains(.record))
        #expect(!HomeComposition.blocks(for: input).contains(.signInLine))
    }

    @Test("one true MOVED row is enough for the record to draw at discovering")
    func discoveringWithOneRowDrawsTheRecord() {
        let input = HomeCompositionInput(
            isSignedIn: true, tier: .discovering,
            record: Self.record(moved: [Self.row(kind: .savedPieceRepriced, standing: true)])
        )
        #expect(HomeComposition.recordDraws(for: input))
        #expect(!HomeComposition.blocks(for: input).contains(.designerSeat))
    }

    @Test("at engaged the truthful empties draw")
    func engagedEmptyRecordStillDraws() {
        let input = HomeCompositionInput(
            isSignedIn: true, tier: .engaged, hasDesigner: true
        )
        #expect(HomeComposition.recordDraws(for: input))
        let blocks = HomeComposition.blocks(for: input)
        #expect(blocks.contains(.record))
        #expect(blocks.contains(.designerSeat))
    }

    @Test("activeProject mounts the record, the seat, the house and the story in order")
    func activeProjectOrder() {
        let input = HomeCompositionInput(
            isSignedIn: true, tier: .activeProject,
            record: Self.record(needsYou: [Self.row(kind: .decisionAsked, state: .overdue)]),
            roomCount: 2, hasStory: true, hasDesigner: true
        )
        #expect(HomeComposition.blocks(for: input) == [
            .header, .record, .designerSeat, .houseRail, .story
        ])
    }

    // MARK: - The supply floor

    @Test("NEW THIS WEEK draws at three rows and not at two")
    func newThisWeekFloor() {
        var input = HomeCompositionInput(isSignedIn: true, tier: .discovering, newThisWeekCount: 2)
        #expect(!HomeComposition.blocks(for: input).contains(.newThisWeek))
        input.newThisWeekCount = 3
        #expect(HomeComposition.blocks(for: input).contains(.newThisWeek))
    }

    // MARK: - Next Move

    @Test("the Next Move keeps the second slot only when nothing needs you")
    func nextMoveIsSecondOnlyWhenNothingIsWaiting() {
        let waiting = HomeCompositionInput(
            isSignedIn: true, tier: .activeProject,
            record: Self.record(needsYou: [Self.row(kind: .invoiceDue)])
        )
        #expect(HomeComposition.nextMoveDraws(for: waiting) == false)
        #expect(!HomeComposition.blocks(for: waiting).contains(.nextMove))

        let quiet = HomeCompositionInput(
            isSignedIn: true, tier: .activeProject,
            record: Self.record(moved: [Self.row()])
        )
        #expect(HomeComposition.nextMoveDraws(for: quiet))
        let blocks = HomeComposition.blocks(for: quiet)
        #expect(blocks[1] == .record)
        #expect(blocks[2] == .nextMove)
    }

    // MARK: - Weight follows content

    @Test("the record takes the hero footprint and the story drops to 96 pt")
    func weightFollowsContent() {
        let full = HomeCompositionInput(
            isSignedIn: true, tier: .activeProject,
            record: Self.record(moved: [Self.row()]), hasStory: true
        )
        #expect(HomeComposition.recordWeight(for: full) == .hero)
        #expect(HomeComposition.storyWeight(for: full) == .row(96))

        let quiet = HomeCompositionInput(isSignedIn: true, tier: .engaged, hasStory: true)
        #expect(HomeComposition.storyWeight(for: quiet) == .hero)
    }
}

// MARK: - The empty-queue Next Move (synthesis §5)

@MainActor
struct EmptyQueueNextMoveTests {

    @Test("with nothing waiting the move names the phase the project is in")
    func theEmptyQueueMoveNamesThePhase() {
        let move = TodayExperience.nextMove(for: TodayPriorityInput(
            activeProjectID: "b1",
            activeProjectName: "Aspen Loft Refresh",
            activeProjectPhase: "installation"
        ))
        #expect(move.kind == .openProject)
        #expect(move.title == "See where Aspen Loft Refresh stands")
        #expect(move.detail == "Now in Installation.")
        #expect(move.targetID == "b1")
    }

    @Test("an unknown phase is not named — the move falls through instead")
    func anUnknownPhaseIsNeverInvented() {
        // `PhaseDisplay.clientLabel(for: nil)` answers "Discovery" for any
        // unknown value, so a project whose phase the app does not know must
        // never reach it.
        let blank = TodayExperience.nextMove(for: TodayPriorityInput(
            activeProjectID: "b1", activeProjectName: "Aspen Loft Refresh",
            activeProjectPhase: "  "
        ))
        #expect(blank.kind != .openProject)

        let missing = TodayExperience.nextMove(for: TodayPriorityInput(
            activeProjectID: "b1", activeProjectName: "Aspen Loft Refresh"
        ))
        #expect(missing.kind != .openProject)
    }

    @Test("something waiting still wins the slot")
    func waitingWorkOutranksThePhaseLine() {
        let move = TodayExperience.nextMove(for: TodayPriorityInput(
            pendingDecisionCount: 1,
            activeProjectID: "b1",
            activeProjectName: "Aspen Loft Refresh",
            activeProjectPhase: "installation"
        ))
        #expect(move.kind == .reviewDecisions)
    }
}
