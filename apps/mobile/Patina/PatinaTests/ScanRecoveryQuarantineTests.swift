//
//  ScanRecoveryQuarantineTests.swift
//  PatinaTests
//
//  Pins what the launch-time recovery pass may and may not delete.
//
//  The rule under test: THIS PASS MAY ONLY DELETE BYTES IT HAS PROVEN ARE NOT
//  THE USER'S. It runs unattended before anyone can object, so "the manifest
//  won't decode" — a failure of our reader against their bytes — must not be
//  treated as "there is nothing here". Only two things are: a row whose
//  directory is absent, and a directory holding zero bytes.
//
//  Before the fix, one `catch` handled decode failure by deleting the bundle
//  AND the row; and the decoder it used was a bare `JSONDecoder()` while
//  `ScanBundleWriter` writes `.iso8601` dates, so that branch was taken on
//  EVERY real manifest. `aManifestWrittenByTheWriterProducesACandidate` below
//  is the direct pin on that second half — it fails against the old decoder.
//
//  These tests touch the real Application Support directory (that is what
//  `RoomScanPackage.absoluteBundleURL` resolves against, and going through it
//  is the point — a fake path would not exercise the classification). Every
//  bundle is created under a unique `Scans/recovery-test-{uuid}` and removed in
//  `defer`.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct ScanRecoveryQuarantineTests {

    // MARK: - Harness

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([RoomScanPackage.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    /// A bundle directory under Application Support plus the matching row.
    /// `cleanup` removes the directory; callers `defer` it.
    /// Named to avoid shadowing `Foundation.Bundle`.
    private struct ScanBundleFixture {
        let package: RoomScanPackage
        let url: URL
        let cleanup: () -> Void
    }

    private func makeBundle(
        in context: ModelContext,
        status: RoomScanPackageStatus = .pending,
        createDirectory: Bool = true
    ) throws -> ScanBundleFixture {
        // `create: true` so a fresh simulator container has the directory the
        // (create: false) `absoluteBundleURL` lookup will need.
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true)

        let relative = "Scans/recovery-test-\(UUID().uuidString)"
        let url = base.appendingPathComponent(relative, isDirectory: true)
        if createDirectory {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }

        let package = RoomScanPackage(
            scanId: UUID(), roomLocalId: UUID(), bundlePath: relative, status: status)
        context.insert(package)
        try context.save()

        return ScanBundleFixture(package: package, url: url) { try? FileManager.default.removeItem(at: url) }
    }

    /// Five posed-photo files — `countPhotos` reads the disk, so this is what
    /// puts a bundle over `minimumViablePhotoCount`.
    private func writePhotos(_ count: Int, in bundleURL: URL) throws {
        let photos = bundleURL.appendingPathComponent("photos", isDirectory: true)
        try FileManager.default.createDirectory(at: photos, withIntermediateDirectories: true)
        for index in 0..<count {
            try Data("jpeg-bytes-\(index)".utf8)
                .write(to: photos.appendingPathComponent("auto_\(index).heic"))
        }
    }

    /// A manifest for `scanId`, encoded EXACTLY as `ScanBundleWriter` encodes
    /// one (`[.prettyPrinted, .sortedKeys]`, `dateEncodingStrategy = .iso8601`).
    /// `mutate` gets the JSON object so a test can bend one key.
    private func writeManifest(
        scanId: UUID,
        in bundleURL: URL,
        completedAt: Date? = nil,
        scorecard: Scorecard? = nil,
        mutate: ([String: Any]) -> [String: Any] = { $0 }
    ) throws {
        let manifest = ScanManifest(
            scanId: scanId,
            roomName: "Living Room",
            completedAt: completedAt,
            device: .init(model: "iPhone17,2", osVersion: "26.5", hasLidar: true),
            scorecard: scorecard)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let encoded = try encoder.encode(manifest)

        let object = try #require(try JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let data = try JSONSerialization.data(withJSONObject: mutate(object), options: [.sortedKeys])
        try data.write(to: bundleURL.appendingPathComponent("manifest.json"))
    }

    private func scorecard(verdict: Scorecard.Verdict = .green) -> Scorecard {
        Scorecard(
            coveragePct: 92, sharpFrameRatio: 0.81, trackingHealth: .good,
            anchorCount: 3, verdict: verdict,
            surfaceChecklist: [SurfaceStatus(surface: "wall:north", covered: true)],
            namedGaps: [])
    }

    private func rowSurvives(_ package: RoomScanPackage, in context: ModelContext) throws -> Bool {
        let id = package.scanId
        return try context.fetch(FetchDescriptor<RoomScanPackage>()).contains { $0.scanId == id }
    }

    // MARK: - 1. The defect: an unreadable manifest must not cost the scan

    /// The headline case. A manifest carrying an enum value this build does not
    /// know — exactly what a newer `Verdict` case, or a Field manifest from a
    /// future spec, looks like — must leave the scan fully usable. Not merely
    /// undeleted: still a RECOVERY CANDIDATE, because the unknown value is in an
    /// optional instrument key and costs only that key.
    @Test
    func unknownEnumValueInAnOptionalInstrumentFieldKeepsTheScanRecoverable() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try writePhotos(5, in: bundle.url)
        try writeManifest(scanId: bundle.package.scanId, in: bundle.url, scorecard: scorecard()) { object in
            var object = object
            var card = object["scorecard"] as? [String: Any] ?? [:]
            card["verdict"] = "chartreuse"      // a case no build here knows
            object["scorecard"] = card
            return object
        }

        let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(candidates.contains { $0.id == bundle.package.scanId })
        #expect(try rowSurvives(bundle.package, in: ctx))
        #expect(bundle.package.status == .pending)              // not quarantined either
        #expect(FileManager.default.fileExists(atPath: bundle.url.path))
        #expect(candidates.first { $0.id == bundle.package.scanId }?.photosCount == 5)
    }

    /// A truncated manifest — the classic interrupted write — cannot be
    /// degraded past, so the bundle is quarantined. The bytes stay, the row
    /// stays, and it is not offered for recovery (we cannot describe it).
    @Test
    func truncatedManifestQuarantinesAndKeepsEveryByte() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try writePhotos(5, in: bundle.url)
        try writeManifest(scanId: bundle.package.scanId, in: bundle.url)

        // Chop the manifest in half, as a killed process would.
        let manifestURL = bundle.url.appendingPathComponent("manifest.json")
        let whole = try Data(contentsOf: manifestURL)
        try whole.prefix(whole.count / 2).write(to: manifestURL)

        let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(!candidates.contains { $0.id == bundle.package.scanId })
        #expect(try rowSurvives(bundle.package, in: ctx))
        #expect(bundle.package.status == .quarantined)
        #expect(bundle.package.lastError != nil)

        // The user's five photos are still on the phone.
        let photos = bundle.url.appendingPathComponent("photos", isDirectory: true)
        #expect(try FileManager.default.contentsOfDirectory(atPath: photos.path).count == 5)
    }

    /// A bundle with real capture bytes but no `manifest.json` at all is the
    /// same class of problem — we cannot read it, which is not the same as it
    /// being empty. Previously this deleted bundle + row.
    @Test
    func bundleWithBytesButNoManifestIsQuarantinedNotDeleted() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try writePhotos(7, in: bundle.url)

        _ = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(try rowSurvives(bundle.package, in: ctx))
        #expect(bundle.package.status == .quarantined)
        let photos = bundle.url.appendingPathComponent("photos", isDirectory: true)
        #expect(try FileManager.default.contentsOfDirectory(atPath: photos.path).count == 7)
    }

    /// A quarantined row is not looked at again: the failure is logged once,
    /// not on every launch, and a second pass cannot reach a different answer
    /// because neither the bytes nor the reader have changed.
    @Test
    func aQuarantinedBundleIsNotReExaminedOnTheNextLaunch() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try writePhotos(5, in: bundle.url)
        try Data("{".utf8).write(to: bundle.url.appendingPathComponent("manifest.json"))

        _ = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)
        #expect(bundle.package.status == .quarantined)

        bundle.package.lastError = "sentinel"    // would be overwritten by a re-run
        _ = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(bundle.package.lastError == "sentinel")
        #expect(try rowSurvives(bundle.package, in: ctx))
        #expect(FileManager.default.fileExists(atPath: bundle.url.path))
    }

    // MARK: - 2. Real cleanup is preserved

    /// A row pointing at a directory that is not on disk. Nothing to lose —
    /// this deletion stays.
    @Test
    func orphanedRowWithNoBundleDirectoryIsCleanedUp() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx, createDirectory: false)
        defer { bundle.cleanup() }

        #expect(!FileManager.default.fileExists(atPath: bundle.url.path))

        _ = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(!(try rowSurvives(bundle.package, in: ctx)))
    }

    /// A directory that exists and holds zero bytes — including one holding
    /// only empty files and empty subdirectories, which is the same emptiness.
    /// Bundle and row both go.
    @Test
    func zeroByteBundleDirectoryIsCleanedUp() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try FileManager.default.createDirectory(
            at: bundle.url.appendingPathComponent("photos", isDirectory: true),
            withIntermediateDirectories: true)
        try Data().write(to: bundle.url.appendingPathComponent("photos/empty.heic"))

        _ = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(!(try rowSurvives(bundle.package, in: ctx)))
        #expect(!FileManager.default.fileExists(atPath: bundle.url.path))
    }

    /// The one deletion of real bytes that survives the rewrite, and it is
    /// reached only after a CLEAN decode: a bundle the user barely started.
    @Test
    func decodedBundleBelowThePhotoThresholdIsStillDiscarded() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try writePhotos(2, in: bundle.url)
        try writeManifest(scanId: bundle.package.scanId, in: bundle.url)

        let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(!candidates.contains { $0.id == bundle.package.scanId })
        #expect(!(try rowSurvives(bundle.package, in: ctx)))
        #expect(!FileManager.default.fileExists(atPath: bundle.url.path))
    }

    // MARK: - 3. The happy path, which was itself broken

    /// Pins the decoder-strategy half of the defect. `ScanBundleWriter` encodes
    /// dates `.iso8601`; the recovery pass used a bare `JSONDecoder()`, whose
    /// `.deferredToDate` expects a number — so `createdAt` threw on every real
    /// manifest and every bundle here went down the delete path. Reading through
    /// `ScanBundleWriter.readManifest` is what fixes it, and this test fails
    /// against the old private decoder.
    @Test
    func aManifestWrittenByTheWriterProducesACandidate() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try writePhotos(6, in: bundle.url)
        try writeManifest(scanId: bundle.package.scanId, in: bundle.url)

        let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        let candidate = try #require(candidates.first { $0.id == bundle.package.scanId })
        #expect(candidate.photosCount == 6)
        #expect(try rowSurvives(bundle.package, in: ctx))
        #expect(FileManager.default.fileExists(atPath: bundle.url.path))
    }

    /// A finalized-but-unsynced bundle stays put for `RoomScanSyncService`, and
    /// is not offered for recovery.
    @Test
    func finalizedBundleIsLeftForTheSyncService() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx, status: .failed)
        defer { bundle.cleanup() }

        try writePhotos(6, in: bundle.url)
        try writeManifest(scanId: bundle.package.scanId, in: bundle.url, completedAt: Date())

        let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(!candidates.contains { $0.id == bundle.package.scanId })
        #expect(try rowSurvives(bundle.package, in: ctx))
        #expect(bundle.package.status == .failed)
        #expect(FileManager.default.fileExists(atPath: bundle.url.path))
    }

    // MARK: - 4. Quarantine is inert everywhere else

    /// The status is the exclusion mechanism, so check the fetch descriptors
    /// that other subsystems key on rather than trusting the enum's docs: a
    /// quarantined bundle is never re-uploaded, never offered in the picker,
    /// and never evicted.
    @Test
    func aQuarantinedRowIsExcludedFromEveryOtherPipeline() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        bundle.package.markQuarantined("unreadable")
        try ctx.save()

        let id = bundle.package.scanId
        #expect(!(try ctx.fetch(RoomScanPackage.needsProcessing).contains { $0.scanId == id }))
        #expect(!(try ctx.fetch(RoomScanPackage.heldOrSyncedItems).contains { $0.scanId == id }))
        #expect(!(try ctx.fetch(RoomScanPackage.syncedItems).contains { $0.scanId == id }))
        #expect(ScanPickerSource.pickable(from: [bundle.package]).isEmpty)
        #expect(RoomScanPackageStatus(rawValue: "quarantined") == .quarantined)
    }

    /// The user's own explicit delete still deletes. Non-destructive recovery
    /// is about what the app does unattended, not about making scans
    /// undeletable.
    @Test
    func discardStillRemovesAQuarantinedBundleAndRow() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let bundle = try makeBundle(in: ctx)
        defer { bundle.cleanup() }

        try writePhotos(5, in: bundle.url)
        try Data("{".utf8).write(to: bundle.url.appendingPathComponent("manifest.json"))
        _ = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)
        #expect(bundle.package.status == .quarantined)

        await ScanRecoveryService.shared.discard(bundle.package.scanId, in: ctx)

        #expect(!(try rowSurvives(bundle.package, in: ctx)))
        #expect(!FileManager.default.fileExists(atPath: bundle.url.path))
    }
}
