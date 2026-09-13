//  TimeEntryOutboxRecordTests.swift
//  CaptureTests
//
//  W6's queue: an hour that is not a visit, kept on the phone until a road gives
//  her signal back. The record is a SIBLING of FieldVisitCloseRecord, so these
//  assert the two things that make it one — the client-minted key that survives
//  a replay, and backoff parity — plus the wire shape `log_time` (00608)
//  actually takes.

import Foundation
import Testing
@testable import CaptureKit

@MainActor
struct TimeEntryOutboxRecordTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func record(
        entryID: UUID = UUID(),
        activity: FieldTimeActivity? = .travel,
        billable: Bool = true,
        rateRole: FieldRateRole? = nil,
        durationMinutes: Int = 45
    ) -> TimeEntryOutboxRecord {
        TimeEntryOutboxRecord(
            entryID: entryID,
            projectID: "6f1d1b9c-0000-4000-8000-000000000001",
            ownerUserID: "6f1d1b9c-0000-4000-8000-0000000000a1",
            startedAt: now,
            durationMinutes: durationMinutes,
            activity: activity,
            billable: billable,
            notes: "Maple St → High Point",
            rateRole: rateRole,
            createdAt: now)
    }

    // MARK: the client-minted id

    @Test func theEntryIDNeverRegenerates_soAReplayIsANoOp() {
        let r = record()
        let first = r.entryID
        r.markFailed("offline", now: now)
        r.markFailed("offline again", now: now.addingTimeInterval(10))
        #expect(r.entryID == first)
    }

    /// `log_time` is ON CONFLICT (id) DO NOTHING and reads the row back, so a
    /// drain that runs twice under the same id logs ONE hour. That only holds
    /// while the request keeps carrying the record's own id.
    @Test func aReplayedDrainSendsTheSameIdTwice() throws {
        let r = record()
        let first = try #require(TimeEntryOutboxOrchestrator.request(for: r))
        let second = try #require(TimeEntryOutboxOrchestrator.request(for: r))
        #expect(first.id == r.entryID)
        #expect(second.id == r.entryID)
        #expect(first == second)
    }

    // MARK: backoff parity with the proven queue

    @Test func retryDelayMatchesTheVisitCloseRecordExactly() {
        for attempt in 0...12 {
            #expect(TimeEntryOutboxRecord.retryDelay(attempt: attempt)
                    == FieldVisitCloseRecord.retryDelay(attempt: attempt))
        }
        #expect(TimeEntryOutboxRecord.retryDelay(attempt: 1) == 5)
        #expect(TimeEntryOutboxRecord.retryDelay(attempt: 4) == 40)
        #expect(TimeEntryOutboxRecord.retryDelay(attempt: 99) == 3_600)
    }

    @Test func theRetryCeilingStopsTheHourlyLoop() {
        let r = record()
        for attempt in 1...FieldWriteGate.retryCeiling {
            r.markFailed("boom \(attempt)", now: now)
        }
        #expect(r.state == .unwritable)
        #expect(r.nextAttemptAt == nil)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
    }

    @Test func aBackingOffRecordIsSkippedByTheTimerAndTakenByHerTap() {
        let r = record()
        r.markFailed("no signal", now: now)
        let soon = now.addingTimeInterval(1)

        #expect(r.isDue(at: soon, trigger: .automatic) == false)
        #expect(r.isDue(at: soon, trigger: .userInitiated))
        #expect(TimeEntryOutboxOrchestrator
            .drainable([r], at: soon, trigger: .automatic).isEmpty)
        #expect(TimeEntryOutboxOrchestrator
            .drainable([r], at: soon, trigger: .userInitiated).count == 1)
    }

    @Test func deliveringClosesTheRecordForGood() {
        let r = record()
        r.markFailed("offline", now: now)
        r.markDelivered()

        #expect(r.state == .written)
        #expect(r.lastError == nil)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
    }

    @Test func alreadyWrittenClosesExactlyAsWrittenDoes() {
        let a = record()
        let b = record()
        TimeEntryOutboxOrchestrator.apply(.written, to: a, now: now)
        TimeEntryOutboxOrchestrator.apply(.alreadyWritten, to: b, now: now)
        #expect(a.state == .written)
        #expect(b.state == .written)
    }

    @Test func aDeferredOutcomeReopensWithNoBackoff() {
        let r = record()
        TimeEntryOutboxOrchestrator.apply(.deferred("on a road"), to: r, now: now)
        #expect(r.state == .pending)
        #expect(r.nextAttemptAt == nil)
        #expect(r.isDue(at: now))
    }

    @Test func anUnsatisfiableOutcomeIsUnwritableNotRefused() {
        let r = record()
        TimeEntryOutboxOrchestrator.apply(.unsatisfiable("23514"), to: r, now: now)
        #expect(r.state == .unwritable)
    }

    // MARK: never a running timer (HT-7 / 00177:39-41)

    @Test func aZeroOrNegativeDurationIsFlooredToOneMinute() {
        #expect(record(durationMinutes: 0).durationMinutes == 1)
        #expect(record(durationMinutes: -45).durationMinutes == 1)
    }

    // MARK: the wire shape log_time takes

    @Test func theRequestIsTheLogTimeArgumentList() throws {
        let r = record(activity: .travel, billable: false, rateRole: .vendor)
        let request = try #require(TimeEntryOutboxOrchestrator.request(for: r))

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["p_source"] as? String == "field_manual")
        #expect(json["p_activity"] as? String == "travel")
        #expect(json["p_billable"] as? Bool == false)
        #expect(json["p_rate_role"] as? String == "vendor")
        #expect((json["p_duration_minutes"] as? Int ?? 0) > 0)
        #expect(json["p_notes"] as? String == "Maple St → High Point")
        #expect(json["p_entry_id"] != nil)
        #expect(json["p_project_id"] != nil)

        // `log_time` takes the author from auth.uid(); a client-named user id
        // would be a claim the server has no reason to trust.
        #expect(json["p_user_id"] == nil)
        #expect(json["user_id"] == nil)
        // The server has owned the rate on every branch since W1 (00601).
        #expect(json["p_hourly_rate_cents"] == nil)
        #expect(json["hourly_rate_cents"] == nil)
    }

    /// A record whose project id will not parse can never land — `project_id` is
    /// a uuid. It must be recognised BEFORE a request is built, so the drainer
    /// closes it rather than retrying it hourly for the life of the install.
    @Test func anUnparseableProjectYieldsNoRequest() {
        let r = TimeEntryOutboxRecord(
            entryID: UUID(), projectID: "not-a-uuid",
            ownerUserID: UUID().uuidString, startedAt: now, durationMinutes: 30,
            activity: .admin, billable: false, notes: nil, rateRole: nil)
        #expect(TimeEntryOutboxOrchestrator.request(for: r) == nil)
    }

    @Test func anUnparseableOwnerYieldsNoRequest() {
        let r = TimeEntryOutboxRecord(
            entryID: UUID(), projectID: UUID().uuidString,
            ownerUserID: "anonymous", startedAt: now, durationMinutes: 30,
            activity: .admin, billable: false, notes: nil, rateRole: nil)
        #expect(TimeEntryOutboxOrchestrator.request(for: r) == nil)
    }

    /// "Activity not set" is a real answer (HT-24) and must never become a
    /// silent 'design'. Swift's synthesized Encodable omits a nil Optional
    /// rather than writing null, and PostgREST fills an omitted argument from
    /// the function's own default — `p_activity text DEFAULT NULL` (00608) — so
    /// the absence IS the null. What matters is that no value is invented.
    @Test func anUnsetActivitySendsNoActivityAtAll() throws {
        let request = try #require(
            TimeEntryOutboxOrchestrator.request(for: record(activity: nil)))
        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(json["p_activity"] == nil)
        #expect(json["p_billable"] as? Bool == true)
    }
}
