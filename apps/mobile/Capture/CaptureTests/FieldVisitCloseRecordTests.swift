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

    @Test func backoffMatchesTheSiteRequestOutboxFormulaExactly() {
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 1) == 5)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 4) == 40)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 99) == 3_600)
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

    @Test func theRequestIsAlwaysACompletedEntry_neverARunningTimer() throws {
        let r = record()
        let request = TimeEntryWriteRequest(
            id: r.timeEntryID,
            projectID: UUID(uuidString: r.projectID)!,
            userID: UUID(uuidString: r.ownerUserID)!,
            startedAt: r.startedAt,
            durationMinutes: r.durationMinutes,
            source: "field_visit",
            activity: "site_visit",
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
