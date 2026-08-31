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
