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

    func markFailed(_ message: String, now: Date) {
        state = .failed
        lastError = message
        retryCount += 1
        nextAttemptAt = now.addingTimeInterval(Self.retryDelay(attempt: retryCount))
    }

    /// `written` is done and `refused` is a fact about this designer and this
    /// project (FC-R8), so neither is ever tried again.
    func isDue(at now: Date) -> Bool {
        guard state != .written, state != .refused else { return false }
        guard let nextAttemptAt else { return true }
        return nextAttemptAt <= now
    }
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
        self.durationMinutes = durationMinutes
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
