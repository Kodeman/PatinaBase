//  TimeEntryOutboxRecord.swift
//  CaptureKit
//
//  An hour that is not a visit (plan-v2 §7, W6). She logs a drive standing in a
//  gravel driveway with one bar, so the hour has to outlive the tap the same way
//  a visit close does.
//
//  A SIBLING of FieldVisitCloseRecord, not a generalization of it. That record
//  and its drainer carry ~79 tests between them and one job — the Hours entry
//  that shadows a Visits block (FC-R3) — and turning the tested class into a
//  two-queue drainer is the LARGER change, not the smaller (FS-44). What is
//  copied verbatim is what has already been proven: the @Attribute(.unique)
//  client-minted key, the exponential backoff, the retry ceiling, and the three
//  terminal states no pass ever tries again.
//
//  ⚠ `durationMinutes` is NOT Optional here either, and for the same reason.
//  uniq_project_time_entries_running_timer (00177:39-41) is a partial UNIQUE
//  index on (user_id) WHERE duration_minutes IS NULL — the desk's ONE running
//  slot. HT-7 keeps that slot with the desk in v1: Field logs COMPLETED hours
//  and no code path here can express anything else. `log_time` (00608) raises on
//  a NULL or non-positive duration for the same reason, so a nil would fail on
//  every attempt for good.

import Foundation
import SwiftData

extension CaptureSchemaV1 {
    @Model
    public final class TimeEntryOutboxRecord {
        /// Client-minted and never regenerated — it becomes
        /// `project_time_entries.id`, and `log_time` is `ON CONFLICT (id) DO
        /// NOTHING` (00608), so a replayed drain reads back the hour it already
        /// wrote instead of logging her drive twice.
        @Attribute(.unique) public var entryID: UUID = UUID()
        public var projectID: String = ""
        public var ownerUserID: String = ""
        public var startedAt: Date = Date()
        /// ALWAYS > 0, deliberately not Optional. See the header.
        public var durationMinutes: Int = 1
        /// A `project_time_entries.activity` value — 00616 admits design ·
        /// sourcing · client · site_visit · admin · travel, and NULL for
        /// "activity not set" (HT-24).
        public var activityRaw: String?
        /// HT-11: stated, never defaulted. `log_time` RAISES on a NULL billable, so
        /// there is no such thing as a Field row that did not say.
        public var billable: Bool = true
        public var notes: String?
        /// HT-41: the roster role the member picked when she holds more than one.
        /// nil means "the server decides", which is every single-role member.
        public var rateRoleRaw: String?
        /// `project_time_entries.source`. 00595 bought 'field_manual' for exactly
        /// this queue.
        public var source: String = FieldTimeSource.fieldManual
        public var createdAt: Date = Date()
        public var stateRaw: String = FieldWriteState.pending.rawValue
        public var lastError: String?
        public var retryCount: Int = 0
        public var nextAttemptAt: Date?

        public init(entryID: UUID, projectID: String, ownerUserID: String,
                    startedAt: Date, durationMinutes: Int,
                    activity: FieldTimeActivity?, billable: Bool,
                    notes: String?, rateRole: FieldRateRole?,
                    source: String = FieldTimeSource.fieldManual,
                    createdAt: Date = Date()) {
            self.entryID = entryID
            self.projectID = projectID
            self.ownerUserID = ownerUserID
            self.startedAt = startedAt
            // A zero or a negative fails log_time's own guard on every attempt for
            // good; the floor is the same one every other time surface applies.
            self.durationMinutes = max(1, durationMinutes)
            self.activityRaw = activity?.rawValue
            self.billable = billable
            self.notes = notes
            self.rateRoleRaw = rateRole?.rawValue
            self.source = source
            self.createdAt = createdAt
            self.stateRaw = FieldWriteState.pending.rawValue
            self.retryCount = 0
        }

        /// Byte-for-byte `FieldVisitCloseRecord.retryDelay(attempt:)`, which is
        /// itself byte-for-byte `SiteRequestOutboxRecord`'s. Three queues, one
        /// backoff — a fourth shape would be a fourth thing to reason about on a
        /// road with no signal.
        public static func retryDelay(attempt: Int) -> TimeInterval {
            min(3_600, pow(2, Double(max(0, attempt - 1))) * 5)
        }
    }
}

public extension TimeEntryOutboxRecord {
    var state: FieldWriteState {
        get { FieldWriteState(rawValue: stateRaw) ?? .failed }
        set { stateRaw = newValue.rawValue }
    }

    var activity: FieldTimeActivity? {
        activityRaw.flatMap(FieldTimeActivity.init(rawValue:))
    }

    var rateRole: FieldRateRole? {
        rateRoleRaw.flatMap(FieldRateRole.init(rawValue:))
    }

    func markDelivered() {
        state = .written
        lastError = nil
        nextAttemptAt = nil
    }

    /// The same ceiling every sibling write lane carries
    /// (`FieldWriteGate.retryCeiling`). Without it a plain `.failed` — a 500, a
    /// token problem — retries hourly for the life of the install.
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

    func isDue(at now: Date) -> Bool {
        isDue(at: now, trigger: .automatic)
    }

    /// The backoff belongs to the TIMER, not to her thumb — the same rule I-12
    /// bought for the visit close. A `.failed` record carries a `nextAttemptAt`
    /// up to an hour out, so a retry tap routed through the automatic rule would
    /// select nothing at all.
    func isDue(at now: Date, trigger: VisitCloseDrainTrigger) -> Bool {
        guard state != .written, state != .refused, state != .unwritable else { return false }
        guard trigger == .automatic else { return true }
        guard let nextAttemptAt else { return true }
        return nextAttemptAt <= now
    }
}

/// The `project_time_entries.source` values Patina Field is allowed to write.
/// 00595 bought both; nothing else on this phone may name a third.
public enum FieldTimeSource {
    /// The visit close's Hours entry (FC-R3) — 00545.
    public static let fieldVisit = "field_visit"
    /// An hour that is not a visit: a drive, a call from the truck, a sourcing
    /// run, admin time. LogTimeSheet's only source.
    public static let fieldManual = "field_manual"
}

/// The log lane's decisions, held where they can be tested.
///
/// `capture-gate.sh test` runs `-scheme CaptureKit` alone, so anything left in
/// the app-side drainer is proven by a device pass and nothing else — the same
/// split `VisitCloseOrchestrator` and `PunchTaskOrchestrator` already make.
public enum TimeEntryOutboxOrchestrator {
    public static func drainable(_ standing: [TimeEntryOutboxRecord],
                                 at now: Date,
                                 trigger: VisitCloseDrainTrigger) -> [TimeEntryOutboxRecord] {
        standing.filter { $0.isDue(at: now, trigger: trigger) }
    }

    /// The state an outcome lands the record on. Identical in shape to
    /// `VisitCloseOrchestrator.apply` and identical in reasoning:
    /// `.alreadyWritten` closes exactly as `.written` does, because the id is
    /// client-minted and a row standing under it is THIS hour arriving twice.
    public static func apply(_ outcome: FieldWriteOutcome,
                             to record: TimeEntryOutboxRecord,
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

    /// The wire form of one standing record, or nil when the record can never
    /// land. `project_time_entries.project_id` is a uuid and `log_time` takes
    /// the author from `auth.uid()`, so an unparseable project id is a row no
    /// retry can satisfy — the drainer closes it `.unwritable` rather than
    /// retrying it hourly forever.
    public static func request(for record: TimeEntryOutboxRecord) -> TimeEntryWriteRequest? {
        guard let projectID = UUID(uuidString: record.projectID),
              let userID = UUID(uuidString: record.ownerUserID) else { return nil }
        return TimeEntryWriteRequest(
            id: record.entryID,
            projectID: projectID,
            userID: userID,
            startedAt: record.startedAt,
            durationMinutes: record.durationMinutes,
            source: record.source,
            activity: record.activityRaw,
            billable: record.billable,
            rateRole: record.rateRoleRaw,
            notes: record.notes)
    }
}
