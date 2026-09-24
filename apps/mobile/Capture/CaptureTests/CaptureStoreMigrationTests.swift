//  CaptureStoreMigrationTests.swift
//  CaptureTests
//
//  A store the SHIPPED build wrote, opened by this one.
//
//  `Fixtures/Store-0.1-6` is a real SwiftData store, with its media directory,
//  written by Patina Field 0.1 (6) (source b1447ba7d) through the app's own
//  write paths — see that folder's README for exactly what it holds. It is
//  opened through `CaptureMigrationPlan`, as every container is: the store
//  0.1 (6) wrote must be `CaptureSchemaV1` exactly. If this build cannot open
//  it, the ladder moves it into a recovery folder and comes back empty
//  (`CaptureStore.openRung` — "Moved unopenable store at …"), and on a phone
//  what it moves aside is unsynced captures, queued uploads and billable hours.
//
//  Nothing else catches that. Every other test builds its store with the
//  CURRENT types, so a schema change, or a rename that forgets the stored name,
//  passes them all. The test before this one did exactly that: its "previous"
//  schema was assembled from today's classes, so it compared the build with
//  itself.
//
//  The fixture is immutable. Never regenerate it from this tree: its whole
//  value is that the shipped build wrote it.

import Foundation
import SwiftData
import Testing
@testable import CaptureKit

private final class FixtureBundleToken {}

@MainActor
struct CaptureStoreMigrationTests {

    // The two workspaces the seed wrote under (README · "Owners").
    static let ownerA = CaptureOwnerIdentity(
        userID: "0f6a8c52-3d1e-4b7a-9c20-5e8d1f4a7b36",
        workspaceID: "a4c1e9d0-7b2f-4e6a-8d35-19f0c2b7e4d8")!
    static let ownerB = CaptureOwnerIdentity(
        userID: "7d2e4f61-0a9b-4c3d-8e5f-6a1b2c3d4e5f",
        workspaceID: "c9e8d7f6-5a4b-4c3d-9e2f-1a0b9c8d7e6f")!

    struct OpenedFixture {
        let directory: URL
        let storeURL: URL
        let media: URL
        let manifest: StoreFixtureManifest
        let store: CaptureStore
    }

    static func fixtureSource() throws -> URL {
        let fixtures = try #require(
            Bundle(for: FixtureBundleToken.self).url(forResource: "Fixtures", withExtension: nil),
            "Fixtures/ is not in the test bundle — generate_project.rb bundles it as a folder reference")
        return fixtures.appendingPathComponent("Store-0.1-6", isDirectory: true)
    }

    /// Copies the fixture into a scratch directory — the bundle copy is never
    /// opened, so no run can migrate it in place — and opens the copy exactly
    /// as launch does: `CaptureStore.walk` over the Application Support rung
    /// that `diskRungs` builds, through `openRung` and `CaptureMigrationPlan`.
    /// Only the rung's URL moves, into the scratch directory.
    static func openFixture() throws -> OpenedFixture {
        let source = try fixtureSource()
        let manifest = try JSONDecoder().decode(
            StoreFixtureManifest.self,
            from: Data(contentsOf: source.appendingPathComponent("manifest.json")))
        let manager = FileManager.default
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("capture-store-0.1-6-\(UUID().uuidString)", isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        let storeSource = source.appendingPathComponent("store", isDirectory: true)
        for name in try manager.contentsOfDirectory(atPath: storeSource.path) {
            try manager.copyItem(at: storeSource.appendingPathComponent(name),
                                 to: directory.appendingPathComponent(name))
        }
        let media = directory.appendingPathComponent("CaptureMedia", isDirectory: true)
        try manager.copyItem(at: source.appendingPathComponent("CaptureMedia", isDirectory: true),
                             to: media)
        let storeURL = directory.appendingPathComponent(manifest.storeFilename)

        let launchRung = try #require(CaptureStore.diskRungs(
            appGroupID: CaptureStore.appGroupID, appGroupIsProvisioned: false).last)
        let rung = CaptureStore.DiskRung(name: launchRung.name,
                                         persistence: launchRung.persistence,
                                         configuration: ModelConfiguration(url: storeURL))
        let store = CaptureStore.walk([rung]) { rung in
            CaptureStore.openRung(rung.configuration, named: rung.name)
        }
        return OpenedFixture(directory: directory, storeURL: storeURL, media: media,
                             manifest: manifest, store: store)
    }

    // MARK: - The store opens, and nothing reset it

    @Test func theShippedStoreOpensWithoutBeingSetAside() throws {
        let fixture = try Self.openFixture()
        defer { try? FileManager.default.removeItem(at: fixture.directory) }
        let report = fixture.store.openReport

        #expect(report.didResetIncompatibleStore == false, """
            The current schema could not open the store Patina Field 0.1 (6) wrote, \
            and the ladder set it aside. On a phone that silently discards unsynced \
            captures, queued uploads and billable hours.
            """)
        #expect(report.persistence == .applicationSupport)
        #expect(report.deferredUntilUnlock == false)
        #expect(report.failures.isEmpty, "\(report.failures)")
        // The reset path moves the SQLite trio into a recovery folder; none may exist.
        #expect(report.preservedStores.isEmpty, "\(report.preservedStores)")
        #expect(!FileManager.default.fileExists(
            atPath: CaptureStore.recoveryDirectory(beside: fixture.storeURL).path))
        #expect(FileManager.default.fileExists(atPath: fixture.storeURL.path))
    }

    /// The container schema is the newest version the plan carries, so the
    /// fixture above really was opened as V1.
    @Test func theStoreSchemaIsTheNewestVersionInThePlan() throws {
        let newest = try #require(CaptureMigrationPlan.schemas.last)
        #expect(ObjectIdentifier(newest) == ObjectIdentifier(CaptureSchemaV1.self))
        #expect(CaptureSchemaV1.versionIdentifier == Schema.Version(1, 0, 0))
        #expect(Set(CaptureStore.schema.entities.map(\.name))
            == Set(StoreFixtureProjection.entityNames))
    }

    // MARK: - Every row, every attribute

    /// Every row the shipped build wrote is still there, with every stored
    /// attribute — owner stamps, idempotency keys, outbox states, retry counts,
    /// errors, timestamps, relationships and media names — as that build read
    /// it back when it wrote the manifest.
    @Test func everyRowTheShippedBuildWroteIsIntact() throws {
        let fixture = try Self.openFixture()
        defer { try? FileManager.default.removeItem(at: fixture.directory) }
        let now = try StoreFixtureProjection.snapshot(fixture.store.context)
        let then = fixture.manifest.rows

        #expect(Set(then.keys) == Set(StoreFixtureProjection.entityNames))
        var differences: [String] = []
        for entity in StoreFixtureProjection.entityNames {
            let written = then[entity] ?? [:]
            let read = now[entity] ?? [:]
            #expect(!written.isEmpty, "the fixture holds no \(entity) rows")
            for key in Set(written.keys).subtracting(read.keys).sorted() {
                differences.append("\(entity) \(key) (\(fixture.manifest.labels[key] ?? "?")) is gone")
            }
            for key in Set(read.keys).subtracting(written.keys).sorted() {
                differences.append("\(entity) \(key) appeared from nowhere")
            }
            for (key, row) in written.sorted(by: { $0.key < $1.key }) {
                guard let current = read[key] else { continue }
                for (attribute, value) in row.sorted(by: { $0.key < $1.key }) {
                    let currentValue = current[attribute] ?? "<no such attribute>"
                    if !StoreFixtureProjection.sameValue(value, currentValue) {
                        differences.append(
                            "\(entity) \(key) .\(attribute): wrote \(value), read \(currentValue)")
                    }
                }
            }
        }
        #expect(differences.isEmpty, """
            \(differences.count) difference(s) between what 0.1 (6) wrote and what \
            this build reads:
            \(differences.prefix(40).joined(separator: "\n"))
            """)
    }

    // MARK: - Relationships and the media they name

    @Test func photosMeasurementsAndMediaStillBelongToTheirCaptures() throws {
        let fixture = try Self.openFixture()
        defer { try? FileManager.default.removeItem(at: fixture.directory) }
        let written = fixture.manifest.rows
        let specimens = try fixture.store.context.fetch(FetchDescriptor<Specimen>())
        #expect(specimens.count == written["Specimen"]?.count)

        var referenced: Set<String> = []
        for specimen in specimens {
            for photo in specimen.photos {
                #expect(photo.specimen?.id == specimen.id)
                referenced.insert(photo.filename)
            }
            for measurement in specimen.measurements {
                #expect(measurement.specimen?.id == specimen.id)
            }
            if let audio = specimen.voiceAudioFilename { referenced.insert(audio) }
            referenced.formUnion(specimen.voiceAudioSegmentsRaw ?? [])
        }
        for record in fixture.store.siteRequestOutbox() {
            // Absolute paths under the seeding simulator's container, exactly as
            // a phone stores them; the file itself is named by its last component.
            referenced.insert(URL(fileURLWithPath: record.payloadPath).lastPathComponent)
            referenced.formUnion(record.mediaPaths.map { URL(fileURLWithPath: $0).lastPathComponent })
        }
        #expect(specimens.flatMap(\.photos).count == written["CapturePhoto"]?.count)
        #expect(specimens.flatMap(\.measurements).count == written["CaptureMeasurement"]?.count)

        // Every media file the shipped build wrote is on disk, byte for byte,
        // and every one of them is named by a row that survived.
        let onDisk = Set(try FileManager.default.contentsOfDirectory(atPath: fixture.media.path))
        #expect(onDisk == Set(fixture.manifest.media.keys))
        #expect(referenced == Set(fixture.manifest.media.keys), """
            referenced but missing: \(referenced.subtracting(fixture.manifest.media.keys).sorted()); \
            on disk but unreferenced: \(Set(fixture.manifest.media.keys).subtracting(referenced).sorted())
            """)
        for (name, digest) in fixture.manifest.media {
            let data = try Data(contentsOf: fixture.media.appendingPathComponent(name))
            #expect(!data.isEmpty, "\(name) is empty")
            #expect(StoreFixtureProjection.sha256(data) == digest, "\(name) changed")
        }
        // A site delivery's checksum is over its payload file: both survived.
        for record in fixture.store.siteRequestOutbox() {
            let payload = try Data(contentsOf: fixture.media.appendingPathComponent(
                URL(fileURLWithPath: record.payloadPath).lastPathComponent))
            #expect(SiteRequestChecksum.sha256(payload) == record.checksumSHA256)
        }
    }

    // MARK: - Owner stamps and idempotency keys

    @Test func ownerStampsAndIdempotencyKeysSurvive() throws {
        let fixture = try Self.openFixture()
        defer { try? FileManager.default.removeItem(at: fixture.directory) }
        let context = fixture.store.context
        let specimens = try context.fetch(FetchDescriptor<Specimen>())

        let ownedByA = specimens.filter {
            Self.ownerA.matches(userID: $0.ownerUserID, workspaceID: $0.ownerWorkspaceID)
        }
        let ownedByB = specimens.filter {
            Self.ownerB.matches(userID: $0.ownerUserID, workspaceID: $0.ownerWorkspaceID)
        }
        let unowned = specimens.filter { $0.ownerUserID == nil && $0.ownerWorkspaceID == nil }
        #expect(!ownedByA.isEmpty && !ownedByB.isEmpty && !unowned.isEmpty)
        #expect(ownedByA.count + ownedByB.count + unowned.count == specimens.count)
        // A legacy unowned row stays quarantined: no owner's lookup claims it.
        for row in unowned {
            #expect(fixture.store.specimen(id: row.id, owner: Self.ownerA) == nil)
        }

        // The keys a replay dedupes on: one per row, never re-minted.
        #expect(Set(specimens.map(\.clientToken)).count == specimens.count)
        let closes = try context.fetch(FetchDescriptor<FieldVisitCloseRecord>())
        #expect(Set(closes.map(\.timeEntryID)).count == closes.count)
        let deliveries = try context.fetch(FetchDescriptor<SiteRequestOutboxRecord>())
        #expect(Set(deliveries.map(\.clientDeliveryID)).count == deliveries.count)
        let entries = try context.fetch(FetchDescriptor<TimeEntryOutboxRecord>())
        #expect(Set(entries.map(\.entryID)).count == entries.count)
        let scans = try context.fetch(FetchDescriptor<ScanUploadRecord>())
        #expect(scans.allSatisfy { Self.ownerA.matches(userID: $0.ownerUserID,
                                                       workspaceID: $0.ownerWorkspaceID) })
        let projects = try context.fetch(FetchDescriptor<CaptureProjectRef>())
        #expect(projects.contains { $0.belongs(to: Self.ownerA) })
        #expect(projects.contains { $0.belongs(to: Self.ownerB) })
    }

    // MARK: - The outboxes would still drain the same work

    /// Each of the shipped build's own outbox queries, asked again of the same
    /// store by this build, returns the same rows: nothing unsynced dropped out
    /// of a drain, and nothing settled came back into one.
    @Test func theOutboxesStillHoldEveryUnsyncedItem() throws {
        let fixture = try Self.openFixture()
        defer { try? FileManager.default.removeItem(at: fixture.directory) }
        let store = fixture.store
        let userInitiated = VisitCloseDrainTrigger.userInitiated
        let now: [String: [String]] = [
            "outbox()": store.outbox().map(\.id.uuidString).sorted(),
            "outbox(owner: A)": store.outbox(owner: Self.ownerA).map(\.id.uuidString).sorted(),
            "outbox(owner: B)": store.outbox(owner: Self.ownerB).map(\.id.uuidString).sorted(),
            "visitCloseOutbox(owner: A)":
                store.visitCloseOutbox(owner: Self.ownerA).map(\.visitID.uuidString).sorted(),
            "visitCloseDrainable(owner: A, userInitiated)":
                VisitCloseOrchestrator.drainable(store.visitCloseOutbox(owner: Self.ownerA),
                                                 at: Date(), trigger: userInitiated)
                    .map(\.visitID.uuidString).sorted(),
            "timeEntryOutbox(owner: A)":
                store.timeEntryOutbox(owner: Self.ownerA).map(\.entryID.uuidString).sorted(),
            "timeEntryDrainable(owner: A, userInitiated)":
                TimeEntryOutboxOrchestrator.drainable(store.timeEntryOutbox(owner: Self.ownerA),
                                                      at: Date(), trigger: userInitiated)
                    .map(\.entryID.uuidString).sorted(),
            "siteRequestOutbox()": store.siteRequestOutbox().map(\.clientDeliveryID.uuidString).sorted(),
            "scanUploadRecords(owner: A)":
                store.scanUploadRecords(owner: Self.ownerA).map(\.bundlePath).sorted(),
            "scanUploadRecords(owner: A, includeComplete: true)":
                store.scanUploadRecords(owner: Self.ownerA, includeComplete: true)
                    .map(\.bundlePath).sorted(),
            "scanBundlePathsProtectedFromSweep()": store.scanBundlePathsProtectedFromSweep().sorted()
        ]
        #expect(Set(now.keys) == Set(fixture.manifest.queries.keys))
        for (query, then) in fixture.manifest.queries.sorted(by: { $0.key < $1.key }) {
            #expect(now[query] == then, "\(query) no longer returns what 0.1 (6) returned")
            #expect(!then.isEmpty, "\(query) was empty in the fixture, so it proves nothing")
        }
    }

    // MARK: - The fixture is wide enough to mean something

    /// What the fixture must contain for the tests above to cover the shipped
    /// build: every outbox state its write paths can leave on disk. Read from
    /// the stored raw strings, which are the values a phone holds.
    @Test func theFixtureHoldsEveryOutboxStateTheShippedBuildWrites() throws {
        let fixture = try Self.openFixture()
        defer { try? FileManager.default.removeItem(at: fixture.directory) }
        let context = fixture.store.context
        let writeStates: Set<String> = ["pending", "writing", "failed", "refused", "unwritable", "written"]

        let specimens = try context.fetch(FetchDescriptor<Specimen>())
        #expect(Set(specimens.map(\.statusRaw))
            == ["draft", "ready", "queued", "uploading", "failed", "committed"])
        #expect(Set(specimens.map(\.lifecycleRaw))
            .isSuperset(of: ["captured", "queued", "uploading", "awaitingConfirmation",
                             "failed", "rejected"]))
        #expect(Set(specimens.compactMap(\.placementStateRaw))
            == ["pending", "placing", "failed", "placed"])
        #expect(specimens.contains { $0.placementReplayPending == true })
        #expect(Set(specimens.compactMap(\.marginNoteStateRaw)) == writeStates)
        #expect(Set(specimens.compactMap(\.punchTaskStateRaw)) == writeStates)
        #expect(Set(specimens.compactMap(\.degradeNoteStateRaw)) == writeStates)
        #expect(specimens.contains { !$0.photos.isEmpty && !$0.measurements.isEmpty })
        #expect(specimens.contains { ($0.voiceAudioSegmentsRaw ?? []).count > 1 })

        let scans = try context.fetch(FetchDescriptor<ScanUploadRecord>())
        #expect(Set(scans.map(\.statusRaw)) == ["queued", "uploading", "awaitingConfirmation",
                                                "retryableFailure", "rejected", "complete"])
        #expect(Set(scans.flatMap(\.artifacts).map(\.status.rawValue))
            == ["pending", "uploading", "uploaded", "failed", "skipped"])

        let deliveries = try context.fetch(FetchDescriptor<SiteRequestOutboxRecord>())
        #expect(Set(deliveries.map(\.stateRaw))
            == ["queued", "uploading", "awaiting_receipt", "delivered", "failed", "terminal"])

        let closes = try context.fetch(FetchDescriptor<FieldVisitCloseRecord>())
        #expect(Set(closes.map(\.stateRaw)) == writeStates)
        #expect(Set(closes.map(\.billable)) == [true, false])
        let entries = try context.fetch(FetchDescriptor<TimeEntryOutboxRecord>())
        #expect(Set(entries.map(\.stateRaw)) == writeStates)
    }

    // MARK: - The W6 hours queue

    /// The new queue is genuinely in the schema and genuinely persists. A model
    /// dropped from `CaptureStore.schema` does not fail a build — it makes every
    /// queued hour invisible, which reads as "it synced".
    @Test func theHoursQueueIsInTheSchemaAndSurvivesAReopen() throws {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("capture-store-w6-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("hours.store")
        let owner = UUID()

        let first = try CaptureStore.makeContainer(configuration: ModelConfiguration(url: url))
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
