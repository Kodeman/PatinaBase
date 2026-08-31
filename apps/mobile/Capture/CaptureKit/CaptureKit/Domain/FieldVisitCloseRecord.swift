//  FieldVisitCloseRecord.swift
//  CaptureKit
//
//  She closes a visit standing in a house with one bar of signal, so the close
//  has to outlive the tap. SiteRequestOutboxRecord is the in-repo pattern for
//  exactly this — a @Attribute(.unique) client-minted key, an explicit state,
//  and an exponential backoff — and this mirrors it, backoff included.
//
//  FC-R3, made real: one act writes both rows. The Visits block is the record;
//  the Hours entry is its billing shadow, and this is the durable half of it.

import Foundation
import SwiftData

@Model
public final class FieldVisitCloseRecord {
    @Attribute(.unique) public var visitID: UUID = UUID()
    /// Client-minted and never regenerated — it becomes
    /// `project_time_entries.id`, so a replayed insert collides on the primary
    /// key rather than logging her visit twice.
    public var timeEntryID: UUID = UUID()
    public var projectID: String = ""
    public var ownerUserID: String = ""
    public var startedAt: Date = Date()
    public var endedAt: Date = Date()
    /// ALWAYS > 0, and deliberately not Optional. `project_time_entries` has
    /// CHECK (duration_minutes IS NULL OR duration_minutes > 0) (00177:20) and
    /// uniq_project_time_entries_running_timer is a partial UNIQUE index on
    /// (user_id) WHERE duration_minutes IS NULL (00177:39-41) — a nil from
    /// Field would either take the designer's one desk-timer slot or fail on
    /// that index. The declaration default is here for SwiftData's synthesis
    /// only; every real record takes the composer's floored value.
    public var durationMinutes: Int = 1
    public var stateRaw: String = FieldWriteState.pending.rawValue
    public var lastError: String?
    public var retryCount: Int = 0
    public var nextAttemptAt: Date?

    public init(visitID: UUID, timeEntryID: UUID, projectID: String,
                ownerUserID: String, startedAt: Date, endedAt: Date,
                durationMinutes: Int) {
        self.visitID = visitID
        self.timeEntryID = timeEntryID
        self.projectID = projectID
        self.ownerUserID = ownerUserID
        self.startedAt = startedAt
        self.endedAt = endedAt
        // A zero would fail the CHECK on every attempt for good; the floor is
        // the same one VisitReviewComposer applies.
        self.durationMinutes = max(1, durationMinutes)
        self.stateRaw = FieldWriteState.pending.rawValue
        self.retryCount = 0
    }

    /// Byte-for-byte SiteRequestOutboxRecord.retryDelay(attempt:).
    public static func retryDelay(attempt: Int) -> TimeInterval {
        min(3_600, pow(2, Double(max(0, attempt - 1))) * 5)
    }
}

public extension FieldVisitCloseRecord {
    var state: FieldWriteState {
        get { FieldWriteState(rawValue: stateRaw) ?? .failed }
        set { stateRaw = newValue.rawValue }
    }

    func markDelivered() {
        state = .written
        lastError = nil
        nextAttemptAt = nil
    }

    /// The same ceiling the margin-note, punch-task and degrade lanes carry
    /// (`FieldWriteGate.retryCeiling`, applied in Specimen+Accessors). A
    /// classifier can only recognise the errors it was taught; a plain `.failed`
    /// — a 500, a token problem — otherwise retries hourly for the life of the
    /// install, which is the loop 653904911 added that ceiling to stop.
    func markFailed(_ message: String, now: Date) {
        lastError = message
        retryCount += 1
        if retryCount >= FieldWriteGate.retryCeiling {
            state = .unwritable
            nextAttemptAt = nil
        } else {
            state = .failed
            nextAttemptAt = now.addingTimeInterval(Self.retryDelay(attempt: retryCount))
        }
    }

    /// `written` is done, `refused` is a fact about this designer and this
    /// project (FC-R8), and `unwritable` is a row no retry can satisfy — none of
    /// the three is ever tried again. Leaving `unwritable` out would turn the
    /// ceiling above into a permanent one-hour loop rather than a stop.
    func isDue(at now: Date) -> Bool {
        isDue(at: now, trigger: .automatic)
    }

    /// The backoff belongs to the TIMER, not to her thumb. A `.failed` record
    /// carries a `nextAttemptAt` up to an hour out, so a retry tap routed
    /// through the automatic rule selected nothing at all and the offer sat
    /// there saying "Logging these hours." while doing nothing. A tap ignores
    /// `nextAttemptAt`; it changes neither the delay a failure schedules nor
    /// what the automatic pass will pick up next.
    func isDue(at now: Date, trigger: VisitCloseDrainTrigger) -> Bool {
        guard state != .written, state != .refused, state != .unwritable else { return false }
        guard trigger == .automatic else { return true }
        guard let nextAttemptAt else { return true }
        return nextAttemptAt <= now
    }
}

/// Why a drain pass is running: the relaunch/foreground timer serving the
/// backoff, or the designer tapping the Hours offer and asking for it now.
public enum VisitCloseDrainTrigger: Equatable, Sendable {
    case automatic
    case userInitiated
}

/// The Hours entry the close offers — FC-R3's billing shadow of the Visits row.
///
/// ⚠ `durationMinutes` is NOT Optional, and that is the whole point.
/// `project_time_entries` has CHECK (duration_minutes IS NULL OR
/// duration_minutes > 0) (00177:20), and uniq_project_time_entries_running_timer
/// (00177:39-41) is a partial UNIQUE index on (user_id) WHERE duration_minutes
/// IS NULL — the designer's ONE desk-timer slot. A nil from Field would either
/// take that slot or collide on that index. Field logs completed hours and
/// never starts a timer, so no code path here can express one.
public struct TimeEntryWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let userID: UUID
    public let startedAt: Date
    public let durationMinutes: Int
    /// Always "field_visit" — the source 00545 admits.
    public let source: String
    /// Always "site_visit".
    public let activity: String
    /// The visit's label and rooms, so the Visits block and the Hours entry
    /// read as one event: "Maple St · Living, Dining".
    public let notes: String?

    public init(
        id: UUID,
        projectID: UUID,
        userID: UUID,
        startedAt: Date,
        durationMinutes: Int,
        source: String = "field_visit",
        activity: String = "site_visit",
        notes: String?
    ) {
        self.id = id
        self.projectID = projectID
        self.userID = userID
        self.startedAt = startedAt
        // Floored here as well as on the record. This initialiser is `public`
        // and only its one caller happens to pass an already-floored value; a
        // zero reaching the wire fails CHECK (duration_minutes > 0) on every
        // attempt, and a nil-shaped duration is not expressible at all.
        self.durationMinutes = max(1, durationMinutes)
        self.source = source
        self.activity = activity
        self.notes = notes
    }

    enum CodingKeys: String, CodingKey {
        case id
        case source
        case activity
        case notes
        case projectID = "project_id"
        case userID = "user_id"
        case startedAt = "started_at"
        case durationMinutes = "duration_minutes"
    }
}

public protocol TimeEntryGateway: Sendable {
    /// True when an entry with this client-minted id already landed. Closes the
    /// response-loss gap one round-trip before the primary key does.
    func existingTimeEntry(id: UUID) async throws -> Bool
    func insertTimeEntry(_ request: TimeEntryWriteRequest) async throws
}

/// The close lane's two decisions, held where they can be tested.
///
/// `capture-gate.sh test` runs `-scheme CaptureKit` alone, so anything left in
/// the app-side drainer is proven by a device pass and nothing else. These are
/// pure functions of a record and its captures — the same split
/// `PunchTaskOrchestrator` and `MarginNoteOrchestrator` already make — and the
/// SwiftData fetch and PostgREST call stay app-side.
public enum VisitCloseOrchestrator {
    /// Which of the standing closes this pass may send. Held here rather than
    /// inside the app-side drainer because the trigger is the whole of I-12's
    /// bug: the same filter served both the timer and her tap, and only one of
    /// them may honour the backoff.
    public static func drainable(_ standing: [FieldVisitCloseRecord],
                                 at now: Date,
                                 trigger: VisitCloseDrainTrigger) -> [FieldVisitCloseRecord] {
        standing.filter { $0.isDue(at: now, trigger: trigger) }
    }

    /// The state an outcome lands the close on.
    ///
    /// `.alreadyWritten` closes exactly as `.written` does: the id is
    /// client-minted, so a row standing under it is THIS close arriving twice.
    /// `.deferred` reopens with no backoff — she is on a road, not refused.
    /// `.unsatisfiable` is `.unwritable`, matching `FieldWriteGate.laneState`:
    /// a 23514 or a schema the build is ahead of is not a per-designer refusal,
    /// and calling it one both names the wrong cause and hides the record from
    /// any surface keying on `.unwritable`.
    public static func apply(_ outcome: FieldWriteOutcome,
                             to record: FieldVisitCloseRecord,
                             now: Date) {
        switch outcome {
        case .written, .alreadyWritten:
            record.markDelivered()
        case .deferred(let message):
            record.state = .pending
            record.lastError = message
            record.nextAttemptAt = nil
        case .refused(let message):
            record.state = .refused
            record.lastError = message
            record.nextAttemptAt = nil
        case .unsatisfiable(let message):
            record.state = .unwritable
            record.lastError = message
            record.nextAttemptAt = nil
        case .failed(let message):
            record.markFailed(message, now: now)
        }
    }

    /// FC-R3: the Visits block is the record and the Hours entry is its billing
    /// shadow, so they carry the same name — "Maple St · Living, Dining".
    /// Derived from the visit's own captures, which is where the label and the
    /// rooms actually live once the context has closed.
    public static func notes(for record: FieldVisitCloseRecord,
                             captures: [Specimen]) -> String? {
        let label = captures
            .compactMap { $0.visitLabel?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        let rooms = VisitReviewComposer.summarize(
            rows: captures.map(VisitReviewRow.init(specimen:)),
            startedAt: record.startedAt,
            now: record.endedAt).rooms
        let parts = [label, rooms.isEmpty ? nil : rooms.joined(separator: ", ")]
            .compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
