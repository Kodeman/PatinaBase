//  FieldVisitCloseRecordTests.swift
//  CaptureTests
//
//  She closes a visit standing in a house with one bar. The close record is
//  durable, backs off, and its client-minted timeEntryID never regenerates —
//  the same three properties SiteRequestOutboxRecord ships.

import Foundation
import Testing
@testable import CaptureKit

struct FieldVisitCloseRecordTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func record() -> FieldVisitCloseRecord {
        FieldVisitCloseRecord(
            visitID: UUID(uuidString: "e1111111-1111-4111-8111-111111111111")!,
            timeEntryID: UUID(uuidString: "e2222222-2222-4222-8222-222222222222")!,
            projectID: "e3333333-3333-4333-8333-333333333333",
            ownerUserID: "e4444444-4444-4444-8444-444444444444",
            startedAt: now.addingTimeInterval(-130 * 60),
            endedAt: now,
            durationMinutes: 130)
    }

    @Test func aFreshRecordIsPendingAndDueImmediately() {
        let r = record()
        #expect(r.state == .pending)
        #expect(r.isDue(at: now))
    }

    @Test func aFailureSchedulesTheNextAttemptRatherThanSpinning() {
        let r = record()
        r.markFailed("offline", now: now)

        #expect(r.state == .failed)
        #expect(r.retryCount == 1)
        #expect(r.isDue(at: now) == false)
        #expect(r.isDue(at: now.addingTimeInterval(5)) == true)
    }

    /// The wave's only backoff assertion for this record — VisitReviewTests
    /// carried a second copy of the same formula and it was removed.
    @Test func backoffMatchesTheSiteRequestOutboxFormulaExactly() {
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 1) == 5)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 2) == 10)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 3) == 20)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 4) == 40)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 99) == 3_600)
    }

    // MARK: - The ceiling (653904911's loop, on this lane)

    @Test func aRepeatedlyFailingCloseStopsInsteadOfRetryingForever() {
        let r = record()
        for attempt in 1..<FieldWriteGate.retryCeiling {
            r.markFailed("500", now: now)
            #expect(r.state == .failed)
            #expect(r.retryCount == attempt)
        }

        r.markFailed("500", now: now)

        #expect(r.retryCount == FieldWriteGate.retryCeiling)
        #expect(r.state == .unwritable)
        #expect(r.lastError == "500")
        #expect(r.nextAttemptAt == nil)
    }

    /// Without this the ceiling above would be a permanent one-hour loop rather
    /// than a stop: `isDue` used to exclude only `.written` and `.refused`, and
    /// an `.unwritable` record with no `nextAttemptAt` reads due immediately.
    @Test func anUnwritableCloseIsNeverDueAgain() {
        let r = record()
        for _ in 0..<FieldWriteGate.retryCeiling { r.markFailed("500", now: now) }

        #expect(r.isDue(at: now) == false)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
        #expect(r.isDue(at: now.addingTimeInterval(365 * 86_400)) == false)
    }

    // MARK: - Her tap steps over the backoff; the timer does not

    /// I-12 gave the offer a retry, and the retry was a no-op: it ran the same
    /// `isDue` the timer runs, and a `.failed` record's `nextAttemptAt` is up to
    /// an hour out — so the pass selected NOTHING and the label sat on "Logging
    /// these hours." while the button looked alive.
    @Test func aBackingOffCloseIsSelectedByHerTapAndNotByTheTimer() {
        let r = record()
        r.markFailed("offline", now: now)
        let midBackoff = now.addingTimeInterval(1)
        #expect(r.nextAttemptAt.map { $0 > midBackoff } == true)

        #expect(r.isDue(at: midBackoff) == false)
        #expect(r.isDue(at: midBackoff, trigger: .automatic) == false)
        #expect(r.isDue(at: midBackoff, trigger: .userInitiated))

        // And through the selection the drainer itself walks, not just the
        // predicate underneath it.
        #expect(VisitCloseOrchestrator.drainable([r], at: midBackoff,
                                                 trigger: .automatic).isEmpty)
        #expect(VisitCloseOrchestrator.drainable([r], at: midBackoff,
                                                 trigger: .userInitiated)
                    .map(\.visitID) == [r.visitID])
    }

    /// The backoff itself is untouched: a tap does not shorten the delay the
    /// NEXT automatic pass serves, and does not spend or refund an attempt.
    @Test func aTapDoesNotWeakenTheBackoffTheTimerServes() {
        let r = record()
        r.markFailed("offline", now: now)
        let scheduled = r.nextAttemptAt
        let retries = r.retryCount

        _ = r.isDue(at: now.addingTimeInterval(1), trigger: .userInitiated)

        #expect(r.nextAttemptAt == scheduled)
        #expect(r.retryCount == retries)
        #expect(r.isDue(at: now.addingTimeInterval(1), trigger: .automatic) == false)
        #expect(r.isDue(at: now.addingTimeInterval(5), trigger: .automatic))
    }

    /// A tap is not a resurrection. `written` is done, `refused` is FC-R8's
    /// per-designer fact, and `unwritable` is the retry ceiling's stop — tapping
    /// past any of the three would send a row the server has already answered.
    @Test func noTapRevivesACloseThatIsFinishedForGood() {
        let written = record()
        written.markDelivered()
        let refused = record()
        VisitCloseOrchestrator.apply(.refused("row-level security"), to: refused, now: now)
        let unwritable = record()
        for _ in 0..<FieldWriteGate.retryCeiling { unwritable.markFailed("500", now: now) }

        for r in [written, refused, unwritable] {
            #expect(r.isDue(at: now, trigger: .userInitiated) == false)
        }
        #expect(VisitCloseOrchestrator.drainable([written, refused, unwritable],
                                                 at: now,
                                                 trigger: .userInitiated).isEmpty)
    }

    // MARK: - The floor that protects the desk timer

    @Test func aZeroDurationIsFlooredToOneBillableMinute() {
        let r = FieldVisitCloseRecord(
            visitID: UUID(), timeEntryID: UUID(), projectID: "p", ownerUserID: "u",
            startedAt: now, endedAt: now, durationMinutes: 0)
        #expect(r.durationMinutes == 1)
    }

    /// A negative reaches `project_time_entries` as a CHECK failure on every
    /// attempt, and a nil would take the designer's ONE running-timer slot
    /// (uniq_project_time_entries_running_timer). Neither is expressible.
    @Test func aNegativeDurationIsFlooredToOneBillableMinute() {
        let r = FieldVisitCloseRecord(
            visitID: UUID(), timeEntryID: UUID(), projectID: "p", ownerUserID: "u",
            startedAt: now, endedAt: now, durationMinutes: -45)
        #expect(r.durationMinutes == 1)
    }

    /// `TimeEntryWriteRequest.init` is public and floors for itself — it is not
    /// safe merely because its one caller happens to pass a floored value.
    @Test func theRequestFloorsItsOwnDuration_notJustTheRecord() {
        let request = TimeEntryWriteRequest(
            id: UUID(),
            projectID: UUID(),
            userID: UUID(),
            startedAt: now,
            durationMinutes: 0,
            notes: nil)
        #expect(request.durationMinutes == 1)

        let negative = TimeEntryWriteRequest(
            id: UUID(), projectID: UUID(), userID: UUID(),
            startedAt: now, durationMinutes: -7, notes: nil)
        #expect(negative.durationMinutes == 1)
    }

    @Test func deliveringClosesTheRecordForGood() {
        let r = record()
        r.markFailed("offline", now: now)
        r.markDelivered()

        #expect(r.state == .written)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
        #expect(r.lastError == nil)
    }

    @Test func theTimeEntryIDNeverRegenerates_soAReplayIsANoOp() {
        let r = record()
        let first = r.timeEntryID
        r.markFailed("offline", now: now)
        r.markFailed("offline again", now: now.addingTimeInterval(10))
        #expect(r.timeEntryID == first)
    }

    /// `source` and `activity` are NOT passed: the defaults are what actually
    /// guarantee `field_visit`/`site_visit` on the wire, and a test that supplies
    /// them and then asserts them exercises nothing.
    ///
    /// The bare `JSONEncoder` is deliberate and sufficient HERE. Production
    /// encodes through `PostgrestClient.Configuration.jsonEncoder`, which
    /// differs from this one on exactly one thing — its ISO8601 date strategy —
    /// and `started_at` is the only date-shaped key. Every key asserted below is
    /// a String or an Int, whose encoding no date strategy touches.
    /// `started_at`'s wire form belongs to the PostgREST client and is not
    /// assertable from CaptureTests, which links CaptureKit alone (C1).
    @Test func theRequestIsAlwaysACompletedEntry_neverARunningTimer() throws {
        let r = record()
        let request = TimeEntryWriteRequest(
            id: r.timeEntryID,
            projectID: UUID(uuidString: r.projectID)!,
            userID: UUID(uuidString: r.ownerUserID)!,
            startedAt: r.startedAt,
            durationMinutes: r.durationMinutes,
            notes: "Maple St · Living, Dining")

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["source"] as? String == "field_visit")
        #expect(json["activity"] as? String == "site_visit")
        #expect((json["duration_minutes"] as? Int ?? 0) > 0)
        #expect(json["notes"] as? String == "Maple St · Living, Dining")
        #expect(json["project_id"] as? String == r.projectID.uppercased()
                || json["project_id"] as? String == r.projectID)
    }
}

/// The close lane's two decisions, which lived in the app-side drainer and were
/// therefore proven by nothing but a device pass (C1: the gate's test step runs
/// `-scheme CaptureKit` alone).
struct VisitCloseOrchestratorTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func record() -> FieldVisitCloseRecord {
        FieldVisitCloseRecord(
            visitID: UUID(uuidString: "f1111111-1111-4111-8111-111111111111")!,
            timeEntryID: UUID(uuidString: "f2222222-2222-4222-8222-222222222222")!,
            projectID: "f3333333-3333-4333-8333-333333333333",
            ownerUserID: "f4444444-4444-4444-8444-444444444444",
            startedAt: now.addingTimeInterval(-130 * 60),
            endedAt: now,
            durationMinutes: 130)
    }

    // MARK: - Outcome → state, every case

    @Test func aWrittenOutcomeClosesTheRecord() {
        let r = record()
        VisitCloseOrchestrator.apply(.written, to: r, now: now)

        #expect(r.state == .written)
        #expect(r.lastError == nil)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
    }

    /// The id is client-minted, so a row already standing under it is THIS
    /// close arriving twice. Anything but terminal re-attempts a row the server
    /// already has, on every drain, forever.
    @Test func anAlreadyWrittenOutcomeIsTerminalExactlyLikeWritten() {
        let r = record()
        VisitCloseOrchestrator.apply(.alreadyWritten, to: r, now: now)

        #expect(r.state == .written)
        #expect(r.lastError == nil)
        #expect(r.nextAttemptAt == nil)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
    }

    @Test func aDeferredOutcomeRetriesStraightAwayRatherThanServingABackoff() {
        let r = record()
        VisitCloseOrchestrator.apply(.deferred("offline"), to: r, now: now)

        #expect(r.state == .pending)
        #expect(r.lastError == "offline")
        #expect(r.nextAttemptAt == nil)
        #expect(r.isDue(at: now))
        #expect(r.retryCount == 0)
    }

    @Test func aRefusedOutcomeIsTerminal_becauseFCR8RulesItPerDesigner() {
        let r = record()
        VisitCloseOrchestrator.apply(.refused("row-level security"), to: r, now: now)

        #expect(r.state == .refused)
        #expect(r.lastError == "row-level security")
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
    }

    /// A 23514 or a schema this build is ahead of is NOT a fact about this
    /// designer. Recording it as `.refused` named the wrong cause and hid the
    /// record from anything keying on `.unwritable` — and this is the mapping
    /// `FieldWriteGate.laneState` already makes for the sibling lanes.
    @Test func anUnsatisfiableOutcomeIsUnwritable_notARefusal() {
        let r = record()
        VisitCloseOrchestrator.apply(.unsatisfiable("23514"), to: r, now: now)

        #expect(r.state == .unwritable)
        #expect(r.state == FieldWriteGate.laneState(for: .unsatisfiable("23514")))
        #expect(r.lastError == "23514")
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
    }

    // MARK: - Cancellation is not a failure

    /// A cancelled attempt used to be classified `.failed`, which SPENDS an
    /// attempt: five interrupted launches — the app backgrounded while the
    /// reconcile task was mid-flight — walked a perfectly writable close to the
    /// retry ceiling and closed it `.unwritable` forever.
    @Test func aCancelledAttemptDefersInsteadOfSpendingARetry() throws {
        let cancelled: [Error] = [CancellationError(), URLError(.cancelled)]

        for error in cancelled {
            let r = record()
            let outcome = try #require(FieldWriteClassifier.cancellationOutcome(for: error))
            VisitCloseOrchestrator.apply(outcome, to: r, now: now)

            #expect(r.state == .pending)
            #expect(r.retryCount == 0)
            #expect(r.nextAttemptAt == nil)
            #expect(r.isDue(at: now))
        }

        // The whole point, stated as the failure it prevents: interruption after
        // interruption leaves the record retryable rather than terminal.
        let r = record()
        for _ in 0...FieldWriteGate.retryCeiling {
            let outcome = try #require(
                FieldWriteClassifier.cancellationOutcome(for: CancellationError()))
            VisitCloseOrchestrator.apply(outcome, to: r, now: now)
        }
        #expect(r.state == .pending)
        #expect(r.retryCount == 0)
        #expect(r.isDue(at: now))
    }

    /// The falsifier: without the cancellation branch the drainer's own
    /// classifier reaches `.failed` for both of these, which is the bug.
    @Test func theCodeAndMessageClassifierAloneWouldSpendAnAttemptOnACancellation() {
        #expect(FieldWriteClassifier.outcome(
            code: nil, message: URLError(.cancelled).localizedDescription)
            == .failed(URLError(.cancelled).localizedDescription))
        #expect(FieldWriteClassifier.outcome(
            code: nil, message: CancellationError().localizedDescription)
            == .failed(CancellationError().localizedDescription))
    }

    /// Nil for everything else, or an ordinary timeout would stop backing off.
    @Test func onlyCancellationTakesTheCancellationBranch() {
        #expect(FieldWriteClassifier.cancellationOutcome(for: URLError(.timedOut)) == nil)
        #expect(FieldWriteClassifier.cancellationOutcome(
            for: URLError(.notConnectedToInternet)) == nil)
    }

    @Test func aFailedOutcomeBacksOffAndEventuallyStops() {
        let r = record()
        VisitCloseOrchestrator.apply(.failed("500"), to: r, now: now)

        #expect(r.state == .failed)
        #expect(r.retryCount == 1)
        #expect(r.isDue(at: now) == false)
        #expect(r.isDue(at: now.addingTimeInterval(5)))

        for _ in 1..<FieldWriteGate.retryCeiling {
            VisitCloseOrchestrator.apply(.failed("500"), to: r, now: now)
        }
        #expect(r.state == .unwritable)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
    }

    // MARK: - The name the Hours entry carries (FC-R3)

    private func capture(label: String?, room: String?, offset: TimeInterval) -> Specimen {
        let specimen = Specimen()
        specimen.visitLabel = label
        specimen.createdAt = now.addingTimeInterval(offset - 130 * 60)
        if let room { specimen.venue = VenueStamp(room: room) }
        return specimen
    }

    @Test func theEntryCarriesTheVisitsOwnNameAndItsRooms() {
        let notes = VisitCloseOrchestrator.notes(for: record(), captures: [
            capture(label: "Maple St", room: "Living", offset: 0),
            capture(label: "Maple St", room: "Dining", offset: 60),
        ])
        #expect(notes == "Maple St · Living, Dining")
    }

    @Test func eachRoomIsNamedOnceInTheOrderSheMetThem() {
        let notes = VisitCloseOrchestrator.notes(for: record(), captures: [
            capture(label: "Maple St", room: "Living", offset: 0),
            capture(label: "Maple St", room: "Dining", offset: 60),
            capture(label: "Maple St", room: "Living", offset: 120),
        ])
        #expect(notes == "Maple St · Living, Dining")
    }

    @Test func aVisitWithNoLabelIsNamedByItsRoomsAlone() {
        let notes = VisitCloseOrchestrator.notes(for: record(), captures: [
            capture(label: nil, room: "Kitchen", offset: 0),
        ])
        #expect(notes == "Kitchen")
    }

    @Test func aVisitWithNoRoomsIsNamedByItsLabelAlone() {
        let notes = VisitCloseOrchestrator.notes(for: record(), captures: [
            capture(label: "Maple St", room: nil, offset: 0),
        ])
        #expect(notes == "Maple St")
    }

    /// nil, not "": `project_time_entries.notes` is nullable and an empty string
    /// is a different value from NULL.
    @Test func aVisitWithNothingToSayCarriesNoNotesAtAll() {
        #expect(VisitCloseOrchestrator.notes(for: record(), captures: []) == nil)
        #expect(VisitCloseOrchestrator.notes(
            for: record(),
            captures: [capture(label: "   ", room: nil, offset: 0)]) == nil)
    }
}

/// What the drainer is allowed to pick up. The fetch it walked was unscoped —
/// every `FieldVisitCloseRecord` on the device — so after an account switch the
/// previous designer's close was sent under the new designer's JWT, against the
/// user id the RECORD carries rather than the one signed in.
struct VisitCloseOutboxScopeTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func close(owner: String, endedAt: Date) -> FieldVisitCloseRecord {
        FieldVisitCloseRecord(
            visitID: UUID(), timeEntryID: UUID(),
            projectID: "a1111111-1111-4111-8111-111111111111",
            ownerUserID: owner,
            startedAt: endedAt.addingTimeInterval(-30 * 60),
            endedAt: endedAt,
            durationMinutes: 30)
    }

    @Test @MainActor func aForeignOwnersCloseIsNeverHandedToTheDrainer() throws {
        let store = try CaptureStore.inMemory()
        let owner = try #require(CaptureOwnerIdentity(
            userID: "user-a", workspaceID: "workspace-a"))

        // Upper-cased on purpose: the record stores whatever `uuidString` gave
        // it, and `CaptureOwnerIdentity` normalises. A case-sensitive compare
        // would quarantine her own close.
        let mine = close(owner: "USER-A", endedAt: now)
        let theirs = close(owner: "user-b", endedAt: now.addingTimeInterval(60))
        store.context.insert(mine)
        store.context.insert(theirs)
        try store.save()

        #expect(store.visitCloseOutbox().count == 2)
        #expect(store.visitCloseOutbox(owner: owner).map(\.visitID) == [mine.visitID])
    }

    @Test @MainActor func theQueueIsWorkedOldestFirst() throws {
        let store = try CaptureStore.inMemory()
        let second = close(owner: "user-a", endedAt: now.addingTimeInterval(60))
        let first = close(owner: "user-a", endedAt: now)
        store.context.insert(second)
        store.context.insert(first)
        try store.save()

        #expect(store.visitCloseOutbox().map(\.visitID) == [first.visitID, second.visitID])
    }
}
