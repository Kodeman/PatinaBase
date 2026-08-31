//  VisitReviewTests.swift
//  CaptureTests
//
//  V4 is a receipt that produces something (§7.9, Flow 7): it writes the
//  Visits row on the project spread and offers ONE completed time entry.
//  Everything it says about the visit is derived here, so it is derived once
//  and tested once.

import Foundation
import Testing
@testable import CaptureKit

struct VisitReviewTests {
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func row(
        _ id: String,
        photo: Bool = false,
        transcript: Bool = false,
        room: String? = nil,
        placed: Bool = true,
        offset: TimeInterval = 0
    ) -> VisitReviewRow {
        VisitReviewRow(
            specimenID: UUID(uuidString: id)!,
            hasPhoto: photo,
            hasTranscript: transcript,
            roomName: room,
            isPlaced: placed,
            createdAt: start.addingTimeInterval(offset))
    }

    @Test func anEmptyVisitSummarisesToNothing() {
        let summary = VisitReviewComposer.summarize(
            rows: [], startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.photoCount == 0)
        #expect(summary.noteCount == 0)
        #expect(summary.unplacedCount == 0)
        #expect(summary.rooms.isEmpty)
    }

    @Test func aPhotoWithAVoiceNoteCountsAsAPhoto_notBoth() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d1111111-1111-4111-8111-111111111111", photo: true, transcript: true)],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.photoCount == 1)
        #expect(summary.noteCount == 0)
    }

    @Test func aVoiceOnlyCaptureIsANote() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d2222222-2222-4222-8222-222222222222", transcript: true)],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.photoCount == 0)
        #expect(summary.noteCount == 1)
    }

    @Test func roomsAreListedOnceEachInTheOrderSheMetThem() {
        let summary = VisitReviewComposer.summarize(
            rows: [
                row("d3333333-3333-4333-8333-333333333331", photo: true, room: "Living", offset: 0),
                row("d3333333-3333-4333-8333-333333333332", photo: true, room: "Dining", offset: 60),
                row("d3333333-3333-4333-8333-333333333333", photo: true, room: "Living", offset: 120),
            ],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.rooms == ["Living", "Dining"])
    }

    @Test func unplacedCapturesAreCountedSoDoneCanSaySo() {
        let summary = VisitReviewComposer.summarize(
            rows: [
                row("d4444444-4444-4444-8444-444444444441", photo: true, placed: false),
                row("d4444444-4444-4444-8444-444444444442", photo: true, placed: false),
                row("d4444444-4444-4444-8444-444444444443", photo: true, placed: true),
            ],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.unplacedCount == 2)
    }

    @Test func elapsedMinutesRoundToAWholeBillableMinute() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d5555555-5555-4555-8555-555555555555", photo: true)],
            startedAt: start, now: start.addingTimeInterval(130 * 60))
        #expect(summary.elapsedMinutes == 130)
    }

    /// `.rounded()` is half-AWAY-from-zero, not half-up-from-a-floor, and both
    /// sides of the half-minute are billable minutes she is charged for. An
    /// exact multiple of 60 proves neither.
    @Test func theHalfMinuteBoundaryRoundsTheWaySwiftRounds() {
        func minutes(after seconds: TimeInterval) -> Int {
            VisitReviewComposer.summarize(
                rows: [row("d8888888-8888-4888-8888-888888888888", photo: true)],
                startedAt: start, now: start.addingTimeInterval(seconds)).elapsedMinutes
        }
        #expect(minutes(after: 89) == 1)    // 1m29s
        #expect(minutes(after: 90) == 2)    // 1m30s — up, not down
        #expect(minutes(after: 149) == 2)   // 2m29s
        #expect(minutes(after: 150) == 3)   // 2m30s
    }

    @Test func aVisitShorterThanAMinuteStillOffersOne_becauseZeroCannotBeLogged() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d6666666-6666-4666-8666-666666666666", photo: true)],
            startedAt: start, now: start.addingTimeInterval(20))
        #expect(summary.elapsedMinutes == 1)
    }

    @Test func aClockThatWentBackwardsNeverProducesANegativeEntry() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d7777777-7777-4777-8777-777777777777", photo: true)],
            startedAt: start, now: start.addingTimeInterval(-600))
        #expect(summary.elapsedMinutes == 1)
    }

    @Test func doneSaysNothingWhenNothingIsWaiting() {
        #expect(VisitReviewComposer.doneCaption(unplacedCount: 0) == nil)
    }

    @Test func doneNamesWhatIsWaitingAndWhereItWaits() {
        #expect(VisitReviewComposer.doneCaption(unplacedCount: 3)
                == "3 captures still unplaced — they'll wait on Today.")
        #expect(VisitReviewComposer.doneCaption(unplacedCount: 1)
                == "1 capture still unplaced — it'll wait on Today.")
    }

    @Test func theTimeOfferReadsAsHoursAndMinutes() {
        #expect(VisitReviewComposer.timeOffer(minutes: 130) == "Log 2h 10m as a site visit")
        #expect(VisitReviewComposer.timeOffer(minutes: 45) == "Log 45m as a site visit")
        #expect(VisitReviewComposer.timeOffer(minutes: 120) == "Log 2h as a site visit")
    }

    /// The offer is public and must never propose an entry the CHECK forbids.
    @Test func theOfferNeverProposesZeroMinutes() {
        #expect(VisitReviewComposer.timeOffer(minutes: 0) == "Log 1m as a site visit")
        #expect(VisitReviewComposer.timeOffer(minutes: -30) == "Log 1m as a site visit")
    }

    // The close record's backoff is pinned once, in FieldVisitCloseRecordTests.
}
