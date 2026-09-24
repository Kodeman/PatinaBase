//  CaptureStoreMigrationTests.swift
//  CaptureTests
//
//  A store the SHIPPED build wrote, opened by this one.
//
//  `Fixtures/Store-0.1-6` is a real SwiftData store, with its media directory,
//  written by Patina Field 0.1 (6) (source b1447ba7d) through the app's own
//  write paths — see that folder's README for exactly what it holds. It is
//  opened through `CaptureMigrationPlan`, as every container is: the store
//  0.1 (6) wrote must be `CaptureSchemaV1` exactly, and it opens through the
//  V1→V2 stage that renames Specimen to Piece. If this build cannot open
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
        #expect(report.carryAwaitingRestore == false)
        // The reset path moves the SQLite trio into a recovery folder; none may exist.
        #expect(report.preservedStores.isEmpty, "\(report.preservedStores)")
        #expect(!FileManager.default.fileExists(
            atPath: CaptureStore.recoveryDirectory(beside: fixture.storeURL).path))
        #expect(FileManager.default.fileExists(atPath: fixture.storeURL.path))
        // The V1→V2 carry finished: its rows are in the store, its file is gone.
        #expect(!FileManager.default.fileExists(
            atPath: PieceMigrationCarry.carryURL(beside: fixture.storeURL).path))
    }

    /// The container schema is the newest version the plan carries, and the
    /// fixture, which is V1, has a stage to reach it.
    @Test func theStoreSchemaIsTheNewestVersionInThePlan() throws {
        let schemas = CaptureMigrationPlan.schemas.map(ObjectIdentifier.init)
        #expect(schemas == [ObjectIdentifier(CaptureSchemaV1.self), ObjectIdentifier(CaptureSchemaV2.self)])
        #expect(CaptureMigrationPlan.stages.count == 1)
        #expect(CaptureSchemaV1.versionIdentifier == Schema.Version(1, 0, 0))
        #expect(CaptureSchemaV2.versionIdentifier == Schema.Version(2, 0, 0))
        #expect(Set(CaptureStore.schema.entities.map(\.name))
            == Set(StoreFixtureProjection.entityNames.map(StoreFixtureProjection.storedEntityName)))
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

    /// The fixture leaves 26 of Specimen's attributes nil in every row, so it
    /// cannot see a V1→V2 carry that drops one of them. This V1 row sets every
    /// attribute to something other than its default, and each one must read
    /// back from the Piece it became, compared with the Specimen itself — not
    /// with the carry's Row, which a swapped assignment in `Row.init` would
    /// leave agreeing with the Piece.
    @Test func aV1RowWithEveryAttributeSetBecomesAPieceIntact() throws {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("capture-store-v1-full-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("v1.store")
        let at = Date(timeIntervalSinceReferenceDate: 780_000_000.25)
        let photoID = UUID()
        let measurementID = UUID()

        let written: StoreFixtureProjection.Row
        do {
            let v1 = try ModelContainer(for: Schema(versionedSchema: CaptureSchemaV1.self),
                                        configurations: [ModelConfiguration(url: url)])
            let s = CaptureSchemaV1.Specimen(
                createdAt: at, captureSessionID: UUID(), owner: Self.ownerA,
                categoryRaw: "seating", destinationRaw: "inbox", statusRaw: "failed",
                lifecycleRaw: "rejected")
            s.title = "Lina Lounge Chair"; s.maker = "Holloway & Co."; s.sku = "LQ-3S"
            s.colorway = "Bone"; s.materialNote = "Oak / bouclé"; s.finish = "Oiled"
            s.priceTradeCents = 312_000; s.priceRetailCents = 450_000; s.currencyCode = "GBP"
            s.sourceURL = "https://example.com/lina"; s.note = "left arm scuffed"
            s.materials = ["oak"]; s.colors = ["bone"]; s.styleTags = ["mid-century"]
            s.voiceTranscript = "a chair"; s.voicePartialTranscript = "a ch"
            s.voiceAudioFilename = "a.m4a"; s.voiceAudioSegmentsRaw = ["a.m4a", "b.m4a"]
            s.voiceAudioRemotePathsRaw = ["r/a.m4a"]; s.voiceTranscriptSourceRaw = "speech"
            s.captureKindRaw = "note"; s.voiceDurationSeconds = 12.5
            s.scannedCodes = ["0123456789012"]; s.catalogMatchRemoteId = "cat-1"
            s.provenanceRaw = ["maker": "ocr", "title": "manual"]
            s.guessConfidenceRaw = ["material": 0.4]
            s.venue = VenueStamp(projectId: "p-1", projectName: "Maple St", projectRoomId: "r-1",
                                 room: "Den", shelf: "B2", latitude: 51.5, longitude: -0.1,
                                 accuracyMeters: 8, placemarkName: "Showroom", placeId: "pl-1",
                                 capturedAt: at, timezoneIdentifier: "Europe/London")
            s.remoteId = "fc-1"; s.committedProductId = "prod-1"; s.lastSyncError = "timeout"
            s.retryCount = 3; s.uploadProgress = 40
            s.placementProjectId = "p-1"; s.placementRoomId = "r-1"; s.placementSlotId = "slot-1"
            s.placementCategory = "seating"; s.placementStateRaw = "failed"
            s.placementFFEItemId = "ffe-1"; s.placementSpecId = "spec-1"
            s.placementLastError = "conflict"; s.placementRetryCount = 2
            s.marginNoteId = "mn-1"; s.marginNoteBodyRaw = "check the arm"
            s.marginNoteStateRaw = "refused"; s.marginNoteLastError = "403"; s.marginNoteRetryCount = 1
            s.punchTaskId = "pt-1"; s.punchTaskPartyId = "party-1"; s.punchTaskOwnerRaw = "gc"
            s.punchTaskStateRaw = "writing"; s.punchTaskLastError = "offline"; s.punchTaskRetryCount = 4
            s.degradeNoteId = "dn-1"; s.degradeNoteBodyRaw = "no room"; s.degradeNoteStateRaw = "pending"
            s.degradeNoteLastError = "none"; s.degradeNoteRetryCount = 5
            s.fieldWriteAttentionRaw = "attention"
            s.visitKindRaw = "site"; s.visitKitRaw = "measure"; s.visitLabel = "Walkthrough"
            s.visitStartedAt = at; s.visitEndedAt = at.addingTimeInterval(3600)
            s.noteSettingRaw = "always"
            s.suggestedProjectID = "p-2"; s.suggestedProjectRoomID = "r-2"
            s.suggestionBasisRaw = "venue"; s.suggestionConfidence = 0.7
            s.suggestionReasonRaw = "same showroom"
            s.placementReplayPending = true; s.placementEventEmitted = true
            let photo = CaptureSchemaV1.CapturePhoto(id: photoID, filename: "p.heic", width: 4,
                                                     height: 3, isPrimary: true, order: 1)
            let measurement = CaptureSchemaV1.CaptureMeasurement(id: measurementID, axisRaw: "width",
                                                                 millimeters: 812)
            v1.mainContext.insert(s)
            photo.specimen = s
            measurement.specimen = s
            s.updatedAt = at.addingTimeInterval(60)
            try v1.mainContext.save()
            written = StoreFixtureProjection.specimen(s)
        }

        let migrated = try CaptureStore.makeContainer(configuration: ModelConfiguration(url: url))
        let piece = try #require(try migrated.mainContext.fetch(FetchDescriptor<Piece>()).first)
        let read = StoreFixtureProjection.piece(piece)
        let untouched = StoreFixtureProjection.piece(Piece())
        var differences: [String] = []
        for attribute in Set(written.keys).symmetricDifference(read.keys).sorted() {
            differences.append("\(attribute): projected for only one of Specimen and Piece")
        }
        for (attribute, value) in read.sorted(by: { $0.key < $1.key }) {
            guard let wrote = written[attribute] else { continue }
            if !StoreFixtureProjection.sameValue(wrote, value) {
                differences.append("\(attribute): wrote \(wrote), read \(value)")
            }
            if attribute != "id", attribute != "clientToken",
               StoreFixtureProjection.sameValue(value, untouched[attribute] ?? "") {
                differences.append("\(attribute): still its default, so this proves nothing")
            }
        }
        #expect(differences.isEmpty, "\(differences.joined(separator: "\n"))")
        #expect(read.count > 80)
        #expect(piece.ownerUserID == Self.ownerA.userID)
        #expect(piece.ownerWorkspaceID == Self.ownerA.workspaceID)
        #expect(piece.photos.map(\.id) == [photoID])
        #expect(piece.photos.first?.piece?.id == piece.id)
        #expect(piece.measurements.map(\.id) == [measurementID])
        #expect(piece.measurements.first?.piece?.id == piece.id)
        #expect(!FileManager.default.fileExists(atPath: PieceMigrationCarry.carryURL(beside: url).path))
    }

    // MARK: - Numbers JSON has no spelling for

    /// SQ-210 F2. JSON has no infinity or NaN, and the carry once threw on
    /// one inside willMigrate. Both plan opens failed, the ladder set the
    /// whole store aside, and the app opened empty, unsynced hours and all.
    /// V1 rows holding them cross the stage like any other, with every number
    /// exactly as the V1 store holds it, and nothing else in the store moves.
    ///
    /// Only the scalar Doubles can hold one on disk: SwiftData JSON-encodes a
    /// `[String: Double]` attribute itself, with a `try!`, so a non-finite
    /// `guessConfidenceRaw` value crashes the save that would have written
    /// it. The carry's own encoding is checked for every number it holds,
    /// NaN included, at the end.
    @Test func nonFiniteNumbersCrossTheStageAndNothingIsSetAside() throws {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("capture-store-v1-nonfinite-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("default.store")
        let entryID = UUID()
        do {
            let v1 = try ModelContainer(for: Schema(versionedSchema: CaptureSchemaV1.self),
                                        configurations: [ModelConfiguration(url: url)])
            for value in [Double.infinity, -Double.infinity, Double.nan] {
                let s = CaptureSchemaV1.Specimen()
                s.voiceDurationSeconds = value
                s.suggestionConfidence = value
                v1.mainContext.insert(s)
            }
            v1.mainContext.insert(TimeEntryOutboxRecord(
                entryID: entryID, projectID: UUID().uuidString,
                ownerUserID: UUID().uuidString, startedAt: Date(), durationMinutes: 45,
                activity: .travel, billable: true, notes: "not yet sent", rateRole: nil))
            try v1.mainContext.save()
        }
        // What the V1 store holds, read back as the stage reads it: from disk,
        // not from the objects that wrote it.
        let held: [UUID: [Double?]]
        do {
            let v1 = try ModelContainer(for: Schema(versionedSchema: CaptureSchemaV1.self),
                                        configurations: [ModelConfiguration(url: url)])
            let specimens = try v1.mainContext.fetch(FetchDescriptor<CaptureSchemaV1.Specimen>())
            held = Dictionary(uniqueKeysWithValues: specimens.map {
                ($0.id, [$0.voiceDurationSeconds, $0.suggestionConfidence])
            })
        }
        let heldValues = held.values.flatMap { $0 }.compactMap { $0 }
        #expect(heldValues.contains(.infinity) && heldValues.contains(-.infinity),
                "the V1 store kept no infinity: \(held)")

        let rung = CaptureStore.DiskRung(name: "test", persistence: .applicationSupport,
                                         configuration: ModelConfiguration(url: url))
        let store = CaptureStore.walk([rung]) { rung in
            CaptureStore.openRung(rung.configuration, named: rung.name)
        }

        #expect(store.openReport.didResetIncompatibleStore == false, "\(store.openReport.failures)")
        #expect(store.openReport.preservedStores.isEmpty)
        #expect(store.openReport.carryAwaitingRestore == false)
        let pieces = try store.context.fetch(FetchDescriptor<Piece>())
        #expect(Set(pieces.map(\.id)) == Set(held.keys))
        for piece in pieces {
            let read = [piece.voiceDurationSeconds, piece.suggestionConfidence]
            let wrote = try #require(held[piece.id])
            #expect(Self.same(wrote, read), "V1 held \(wrote), the piece reads \(read)")
        }
        #expect(store.timeEntryOutbox().map(\.entryID) == [entryID])
        #expect(!FileManager.default.fileExists(atPath: PieceMigrationCarry.carryURL(beside: url).path))

        // Every kind of number a Row carries — Double, Double in a dictionary
        // and in the venue, and Date, which encodes as one — through the
        // carry file's own encoding and back.
        var row = PieceMigrationCarry.Row(CaptureSchemaV1.Specimen())
        row.createdAt = Date(timeIntervalSinceReferenceDate: -.infinity)
        row.voiceDurationSeconds = .nan
        row.suggestionConfidence = -.infinity
        row.guessConfidenceRaw = ["nan": .nan, "inf": .infinity, "-inf": -.infinity]
        row.venue = VenueStamp(latitude: .nan, longitude: .infinity, accuracyMeters: -.infinity,
                               capturedAt: Date(timeIntervalSinceReferenceDate: .infinity))
        let numbers = { (row: PieceMigrationCarry.Row) -> [Double?] in
            [row.createdAt.timeIntervalSinceReferenceDate, row.voiceDurationSeconds,
             row.suggestionConfidence, row.guessConfidenceRaw["nan"], row.guessConfidenceRaw["inf"],
             row.guessConfidenceRaw["-inf"], row.venue?.latitude, row.venue?.longitude,
             row.venue?.accuracyMeters, row.venue?.capturedAt.timeIntervalSinceReferenceDate]
        }
        let data = try PieceMigrationCarry.encoder().encode(PieceMigrationCarry(rows: [row]))
        let back = try #require(try PieceMigrationCarry.decoder()
            .decode(PieceMigrationCarry.self, from: data).rows.first)
        #expect(Self.same(numbers(back), numbers(row)), "wrote \(numbers(row)), read \(numbers(back))")
    }

    /// Equal numbers, NaN equal to NaN, and nil only to nil.
    private static func same(_ lhs: [Double?], _ rhs: [Double?]) -> Bool {
        lhs.count == rhs.count && zip(lhs, rhs).allSatisfy { lhs, rhs in
            lhs == rhs || (lhs?.isNaN == true && rhs?.isNaN == true)
        }
    }

    // MARK: - A restore that saved is spent

    /// SQ-210 F1. The restore saves its pieces, then deletes the carry file.
    /// When that delete throws, which is not a crash, the session goes on with
    /// the file still there. A piece the designer deletes afterwards must not
    /// come back on the next launch, with its V1 values and none of the photos
    /// its delete cascaded away. The piece she kept must come back exactly
    /// once, still holding its photo.
    @Test func aSavedRestoreNeverAppliesAgainWhenItsFileCouldNotBeRemoved() throws {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("capture-store-v1-spent-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("default.store")
        let carry = PieceMigrationCarry.carryURL(beside: url)
        let kept = UUID()
        let deleted = UUID()
        do {
            let v1 = try ModelContainer(for: Schema(versionedSchema: CaptureSchemaV1.self),
                                        configurations: [ModelConfiguration(url: url)])
            for (id, title) in [(kept, "kept"), (deleted, "deleted after restore")] {
                let s = CaptureSchemaV1.Specimen(id: id)
                s.title = title
                v1.mainContext.insert(s)
                let photo = CaptureSchemaV1.CapturePhoto(id: UUID(), filename: "\(title).heic",
                                                         width: 4, height: 3, isPrimary: true, order: 0)
                v1.mainContext.insert(photo)
                photo.specimen = s
            }
            try v1.mainContext.save()
        }
        do {
            // makeContainer's open without its restore, which runs next with a
            // delete that throws.
            let container = try ModelContainer(for: CaptureStore.schema,
                                               migrationPlan: CaptureMigrationPlan.self,
                                               configurations: [ModelConfiguration(url: url)])
            let awaiting = PieceMigrationCarry.restorePending(
                into: container, storeURL: url,
                removeItem: { _ in throw CocoaError(.fileWriteNoPermission) })
            #expect(awaiting == false, "the pieces were saved; only the file stayed")
            #expect(FileManager.default.fileExists(atPath: carry.path))
            let pieces = try container.mainContext.fetch(FetchDescriptor<Piece>())
            #expect(Set(pieces.map(\.id)) == [kept, deleted])
            let doomed = try #require(pieces.first { $0.id == deleted })
            #expect(doomed.photos.count == 1)
            container.mainContext.delete(doomed)
            try container.mainContext.save()
        }

        let reopened = try CaptureStore.makeContainer(configuration: ModelConfiguration(url: url))
        let pieces = try reopened.mainContext.fetch(FetchDescriptor<Piece>())
        #expect(pieces.map(\.id) == [kept], "the deleted piece came back, or the kept one doubled")
        #expect(pieces.first?.photos.map(\.filename) == ["kept.heic"])
        #expect(!FileManager.default.fileExists(atPath: carry.path))
    }

    // MARK: - Relationships and the media they name

    @Test func photosMeasurementsAndMediaStillBelongToTheirCaptures() throws {
        let fixture = try Self.openFixture()
        defer { try? FileManager.default.removeItem(at: fixture.directory) }
        let written = fixture.manifest.rows
        let pieces = try fixture.store.context.fetch(FetchDescriptor<Piece>())
        #expect(pieces.count == written["Specimen"]?.count)

        var referenced: Set<String> = []
        for piece in pieces {
            for photo in piece.photos {
                #expect(photo.piece?.id == piece.id)
                referenced.insert(photo.filename)
            }
            for measurement in piece.measurements {
                #expect(measurement.piece?.id == piece.id)
            }
            if let audio = piece.voiceAudioFilename { referenced.insert(audio) }
            referenced.formUnion(piece.voiceAudioSegmentsRaw ?? [])
        }
        for record in fixture.store.siteRequestOutbox() {
            // Absolute paths under the seeding simulator's container, exactly as
            // a phone stores them; the file itself is named by its last component.
            referenced.insert(URL(fileURLWithPath: record.payloadPath).lastPathComponent)
            referenced.formUnion(record.mediaPaths.map { URL(fileURLWithPath: $0).lastPathComponent })
        }
        #expect(pieces.flatMap(\.photos).count == written["CapturePhoto"]?.count)
        #expect(pieces.flatMap(\.measurements).count == written["CaptureMeasurement"]?.count)

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
        let pieces = try context.fetch(FetchDescriptor<Piece>())

        let ownedByA = pieces.filter {
            Self.ownerA.matches(userID: $0.ownerUserID, workspaceID: $0.ownerWorkspaceID)
        }
        let ownedByB = pieces.filter {
            Self.ownerB.matches(userID: $0.ownerUserID, workspaceID: $0.ownerWorkspaceID)
        }
        let unowned = pieces.filter { $0.ownerUserID == nil && $0.ownerWorkspaceID == nil }
        #expect(!ownedByA.isEmpty && !ownedByB.isEmpty && !unowned.isEmpty)
        #expect(ownedByA.count + ownedByB.count + unowned.count == pieces.count)
        // A legacy unowned row stays quarantined: no owner's lookup claims it.
        for row in unowned {
            #expect(fixture.store.piece(id: row.id, owner: Self.ownerA) == nil)
        }

        // The keys a replay dedupes on: one per row, never re-minted.
        #expect(Set(pieces.map(\.clientToken)).count == pieces.count)
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

        let pieces = try context.fetch(FetchDescriptor<Piece>())
        #expect(Set(pieces.map(\.statusRaw))
            == ["draft", "ready", "queued", "uploading", "failed", "committed"])
        #expect(Set(pieces.map(\.lifecycleRaw))
            .isSuperset(of: ["captured", "queued", "uploading", "awaitingConfirmation",
                             "failed", "rejected"]))
        #expect(Set(pieces.compactMap(\.placementStateRaw))
            == ["pending", "placing", "failed", "placed"])
        #expect(pieces.contains { $0.placementReplayPending == true })
        #expect(Set(pieces.compactMap(\.marginNoteStateRaw)) == writeStates)
        #expect(Set(pieces.compactMap(\.punchTaskStateRaw)) == writeStates)
        #expect(Set(pieces.compactMap(\.degradeNoteStateRaw)) == writeStates)
        #expect(pieces.contains { !$0.photos.isEmpty && !$0.measurements.isEmpty })
        #expect(pieces.contains { ($0.voiceAudioSegmentsRaw ?? []).count > 1 })

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

private extension StoreFixtureProjection {
    /// A V1 Specimen under the same keys `piece(_:)` projects a Piece, read
    /// straight from the Specimen's own properties, so the V1→V2 carry is
    /// checked end to end and never against itself.
    static func specimen(_ row: CaptureSchemaV1.Specimen) -> Row {
        [
            "id": value(row.id),
            "clientToken": value(row.clientToken),
            "createdAt": value(row.createdAt),
            "updatedAt": value(row.updatedAt),
            "ownerUserID": value(row.ownerUserID),
            "ownerWorkspaceID": value(row.ownerWorkspaceID),
            "title": value(row.title),
            "maker": value(row.maker),
            "sku": value(row.sku),
            "colorway": value(row.colorway),
            "materialNote": value(row.materialNote),
            "finish": value(row.finish),
            "priceTradeCents": value(row.priceTradeCents),
            "priceRetailCents": value(row.priceRetailCents),
            "currencyCode": value(row.currencyCode),
            "sourceURL": value(row.sourceURL),
            "note": value(row.note),
            "categoryRaw": value(row.categoryRaw),
            "materials": value(row.materials),
            "colors": value(row.colors),
            "styleTags": value(row.styleTags),
            "photos": value(row.photos.map(\.id.uuidString).sorted()),
            "measurements": value(row.measurements.map(\.id.uuidString).sorted()),
            "voiceTranscript": value(row.voiceTranscript),
            "voicePartialTranscript": value(row.voicePartialTranscript),
            "voiceAudioFilename": value(row.voiceAudioFilename),
            "voiceAudioSegmentsRaw": value(row.voiceAudioSegmentsRaw),
            "voiceAudioRemotePathsRaw": value(row.voiceAudioRemotePathsRaw),
            "voiceTranscriptSourceRaw": value(row.voiceTranscriptSourceRaw),
            "captureKindRaw": value(row.captureKindRaw),
            "voiceDurationSeconds": value(row.voiceDurationSeconds),
            "scannedCodes": value(row.scannedCodes),
            "catalogMatchRemoteId": value(row.catalogMatchRemoteId),
            "provenanceRaw": value(row.provenanceRaw),
            "guessConfidenceRaw": value(row.guessConfidenceRaw),
            "venue": value(row.venue),
            "captureSessionID": value(row.captureSessionID),
            "destinationRaw": value(row.destinationRaw),
            "statusRaw": value(row.statusRaw),
            "lifecycleRaw": value(row.lifecycleRaw),
            "remoteId": value(row.remoteId),
            "committedProductId": value(row.committedProductId),
            "lastSyncError": value(row.lastSyncError),
            "retryCount": value(row.retryCount),
            "uploadProgress": value(row.uploadProgress),
            "placementProjectId": value(row.placementProjectId),
            "placementRoomId": value(row.placementRoomId),
            "placementSlotId": value(row.placementSlotId),
            "placementCategory": value(row.placementCategory),
            "placementStateRaw": value(row.placementStateRaw),
            "placementFFEItemId": value(row.placementFFEItemId),
            "placementSpecId": value(row.placementSpecId),
            "placementLastError": value(row.placementLastError),
            "placementRetryCount": value(row.placementRetryCount),
            "marginNoteId": value(row.marginNoteId),
            "marginNoteBodyRaw": value(row.marginNoteBodyRaw),
            "marginNoteStateRaw": value(row.marginNoteStateRaw),
            "marginNoteLastError": value(row.marginNoteLastError),
            "marginNoteRetryCount": value(row.marginNoteRetryCount),
            "punchTaskId": value(row.punchTaskId),
            "punchTaskPartyId": value(row.punchTaskPartyId),
            "punchTaskOwnerRaw": value(row.punchTaskOwnerRaw),
            "punchTaskStateRaw": value(row.punchTaskStateRaw),
            "punchTaskLastError": value(row.punchTaskLastError),
            "punchTaskRetryCount": value(row.punchTaskRetryCount),
            "degradeNoteId": value(row.degradeNoteId),
            "degradeNoteBodyRaw": value(row.degradeNoteBodyRaw),
            "degradeNoteStateRaw": value(row.degradeNoteStateRaw),
            "degradeNoteLastError": value(row.degradeNoteLastError),
            "degradeNoteRetryCount": value(row.degradeNoteRetryCount),
            "fieldWriteAttentionRaw": value(row.fieldWriteAttentionRaw),
            "visitKindRaw": value(row.visitKindRaw),
            "visitKitRaw": value(row.visitKitRaw),
            "visitLabel": value(row.visitLabel),
            "visitStartedAt": value(row.visitStartedAt),
            "visitEndedAt": value(row.visitEndedAt),
            "noteSettingRaw": value(row.noteSettingRaw),
            "suggestedProjectID": value(row.suggestedProjectID),
            "suggestedProjectRoomID": value(row.suggestedProjectRoomID),
            "suggestionBasisRaw": value(row.suggestionBasisRaw),
            "suggestionConfidence": value(row.suggestionConfidence),
            "suggestionReasonRaw": value(row.suggestionReasonRaw),
            "placementReplayPending": value(row.placementReplayPending),
            "placementEventEmitted": value(row.placementEventEmitted)
        ]
    }
}
