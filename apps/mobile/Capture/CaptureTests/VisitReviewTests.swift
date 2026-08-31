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

    // MARK: - Whether the offer can still be tapped

    /// `.disabled(closeState != nil)` killed the button the instant ANY record
    /// existed. A close that has not landed yet — pending, or serving a backoff
    /// because she has no signal, which is the normal case in a house — then
    /// had no way back: the hours were owed and the only control that could ask
    /// for them again was dead for the life of the screen.
    @Test func aCloseStillOwedASendKeepsTheOfferLive() {
        #expect(VisitReviewComposer.timeOfferEnabled(closeState: nil))
        #expect(VisitReviewComposer.timeOfferEnabled(closeState: .pending))
        #expect(VisitReviewComposer.timeOfferEnabled(closeState: .failed))
    }

    /// And the states nothing a second tap can change. `.writing` is in flight;
    /// the other three are exactly the states `isDue` refuses to hand back to
    /// the drainer, so an enabled button there would promise a retry that no
    /// code path performs.
    @Test func aFinishedOrInFlightCloseLeavesTheOfferDead() {
        #expect(!VisitReviewComposer.timeOfferEnabled(closeState: .writing))
        #expect(!VisitReviewComposer.timeOfferEnabled(closeState: .written))
        #expect(!VisitReviewComposer.timeOfferEnabled(closeState: .refused))
        #expect(!VisitReviewComposer.timeOfferEnabled(closeState: .unwritable))
    }

    /// The button and the record agree about what is retryable — stated against
    /// `isDue` rather than restated as a second list that can drift from it.
    @Test func theOfferIsLiveForExactlyTheStatesTheDrainerWillTryAgain() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        for state in [FieldWriteState.pending, .writing, .written, .refused,
                      .unwritable, .failed] {
            let record = FieldVisitCloseRecord(
                visitID: UUID(), timeEntryID: UUID(), projectID: "p",
                ownerUserID: "u", startedAt: now, endedAt: now, durationMinutes: 30)
            record.state = state
            // `.writing` is the one divergence, and it is deliberate: the
            // drainer owns an in-flight record, so the button must not.
            let retryable = record.isDue(at: now) && state != .writing
            #expect(VisitReviewComposer.timeOfferEnabled(closeState: state) == retryable,
                    "\(state) disagrees with the record's own isDue")
        }
    }

    // The close record's backoff is pinned once, in FieldVisitCloseRecordTests.

    // MARK: - The offer cannot mint a close nothing will ever drain

    private let owner = "6b1f0a3c-0000-4000-8000-000000000001"

    /// The gate used to ask only whether her user id parsed as a uuid. The
    /// DRAINER resolves a whole `CaptureOwnerIdentity` before it fetches, so a
    /// missing workspace left the offer visible, minted a durable close, and
    /// then handed the drainer `.unavailable` — a record nothing would ever
    /// select, under a button reading "Logging these hours." for good.
    @Test func aMissingWorkspaceHidesTheOfferRatherThanMintingAnUndrainableClose() {
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: true, userID: owner, workspaceID: nil) == nil)
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: true, userID: owner, workspaceID: "   ") == nil)
        // The falsifier: the user id in all three calls is the same good uuid,
        // so it is the workspace — the drainer's half of the identity — that
        // decides, and with one present the offer stands.
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: true, userID: owner, workspaceID: "workspace-a")
            == UUID(uuidString: owner))
    }

    /// `project_time_entries.user_id` is a NOT NULL uuid, so the older half of
    /// the gate stands: "anonymous" — what `CaptureSessionIdentity` substitutes
    /// — could only ever mint a record that fails.
    @Test func aUserIDThatIsNotAUUIDStillHidesTheOffer() {
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: true, userID: "anonymous",
            workspaceID: "workspace-a") == nil)
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: true, userID: nil, workspaceID: "workspace-a") == nil)
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: true, userID: "", workspaceID: "workspace-a") == nil)
    }

    /// Mock mode reads the store unscoped (`.globalFixtures`), so a close minted
    /// there IS drainable and the workspace is not the drainer's business. The
    /// uuid is still required — the row's shape does not change with the mode.
    @Test func mockModeNeedsNoWorkspaceBecauseItsDrainIsUnscoped() {
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: false, userID: owner, workspaceID: nil)
            == UUID(uuidString: owner))
        #expect(VisitReviewComposer.closeOwnerUserID(
            runsRealServices: false, userID: "anonymous", workspaceID: nil) == nil)
    }
}
