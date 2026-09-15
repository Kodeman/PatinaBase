//  CaptureStoreMigrationTests.swift
//  CaptureTests
//
//  FS-45, and not optional. W6 adds a model (`TimeEntryOutboxRecord`) and a
//  mandatory column (`FieldVisitCloseRecord.billable`) to a store that is
//  already on phones. If either makes the container open throw, the ladder sets
//  the store aside and comes back empty (`CaptureStore.swift` — "Set aside
//  incompatible store at …; retrying"), and what it sets aside here is QUEUED,
//  UNSYNCED, BILLABLE HOURS.
//
//  A green `capture-gate.sh` does not cover that: the app builds and every unit
//  test passes against a store the test itself just created under the new
//  schema. The only thing that catches it is opening a store written by the
//  PREVIOUS schema with the CURRENT one and asserting nothing was reset.

import Foundation
import SwiftData
import Testing
@testable import CaptureKit

@MainActor
struct CaptureStoreMigrationTests {

    private static func scratchDirectory() -> URL {
        URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("capture-store-w6-\(UUID().uuidString)",
                                    isDirectory: true)
    }

    /// The seven models `CaptureStore.schema` held before W6 — the shape on
    /// every phone that has the shipped build.
    private static let previousSchema = Schema([
        Specimen.self, CapturePhoto.self, CaptureMeasurement.self, CaptureProjectRef.self,
        ScanUploadRecord.self,
        SiteRequestOutboxRecord.self,
        FieldVisitCloseRecord.self
    ])

    /// The assertion FS-45 asks for, in the words the report uses.
    @Test func aPreviousSchemaStoreOpensWithoutBeingSetAside() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("previous.store")

        // A phone that closed a visit offline and has not drained it yet: the
        // exact row a reset would destroy.
        let previous = try ModelContainer(for: Self.previousSchema,
                                          configurations: [ModelConfiguration(url: url)])
        previous.mainContext.insert(FieldVisitCloseRecord(
            visitID: UUID(), timeEntryID: UUID(),
            projectID: UUID().uuidString, ownerUserID: UUID().uuidString,
            startedAt: Date(), endedAt: Date(), durationMinutes: 95))
        try previous.mainContext.save()

        // Reopen through the REAL ladder, so the flag under test is the one the
        // composition root reads and reports.
        let store = CaptureStore.walk([
            CaptureStore.DiskRung(name: "test",
                                  persistence: .applicationSupport,
                                  configuration: ModelConfiguration(url: url))
        ]) { rung in
            CaptureStore.openRung(rung.configuration, named: rung.name)
        }

        #expect(store.openReport.didResetIncompatibleStore == false, """
            W6's schema change forced a store reset. On a real phone that \
            silently destroys queued, unsynced billable hours.
            """)
        #expect(store.openReport.persistence == .applicationSupport)
        #expect(store.openReport.failures.isEmpty)
        #expect(store.visitCloseOutbox().count == 1,
                "the standing close written by the previous schema did not survive")
        // The added column arrives with its declaration default rather than as
        // a missing mandatory value — the 134110 failure mode the ladder's
        // `everyMandatoryAttributeCarriesADefault` guards generally.
        #expect(store.visitCloseOutbox().first?.billable == true)
    }

    /// The new queue is genuinely in the schema and genuinely persists. A model
    /// dropped from `CaptureStore.schema` does not fail a build — it makes every
    /// queued hour invisible, which reads as "it synced".
    @Test func theHoursQueueIsInTheSchemaAndSurvivesAReopen() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("hours.store")
        let owner = UUID()

        let first = try ModelContainer(for: CaptureStore.schema,
                                       configurations: [ModelConfiguration(url: url)])
        first.mainContext.insert(TimeEntryOutboxRecord(
            entryID: UUID(), projectID: UUID().uuidString,
            ownerUserID: owner.uuidString, startedAt: Date(), durationMinutes: 45,
            activity: .travel, billable: true, notes: "Maple St → High Point",
            rateRole: nil))
        try first.mainContext.save()

        let reopened = CaptureStore.walk([
            CaptureStore.DiskRung(name: "test",
                                  persistence: .applicationSupport,
                                  configuration: ModelConfiguration(url: url))
        ]) { rung in
            CaptureStore.openRung(rung.configuration, named: rung.name)
        }

        #expect(reopened.openReport.didResetIncompatibleStore == false)
        let standing = reopened.timeEntryOutbox()
        #expect(standing.count == 1)
        #expect(standing.first?.activity == .travel)
        #expect(standing.first?.durationMinutes == 45)
    }

    @Test func theSchemaCarriesBothOutboxes() {
        let names = Set(CaptureStore.schema.entities.map(\.name))
        #expect(names.contains("FieldVisitCloseRecord"))
        #expect(names.contains("TimeEntryOutboxRecord"))
    }
}
