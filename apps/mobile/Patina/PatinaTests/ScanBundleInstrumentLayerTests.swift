//
//  ScanBundleInstrumentLayerTests.swift
//  PatinaTests
//
//  The client bundle's INSTRUMENT LAYER — the seven top-level manifest keys
//  `validate_capture_bundle.py` §10.2 requires and a client scan did not emit:
//  `bundleSpecVersion`, `session`, `anchors`, `scorecard`, `poseGraphSummary`,
//  `unverified`, `checksumAlgorithm`.
//
//  A real client scan uploaded to production, reached `status=ready`, was
//  claimed by the worker, and died at ingest naming all seven plus
//  "'anchors' must be an array". `SCHEMA_VIOLATION` is a PERMANENT_TOKEN, so
//  the task parked on attempt 1 with no retry.
//
//  ── What these tests are, and are not ────────────────────────────────────────
//  The in-process tests below restate the validator's rules against the sealed
//  Swift manifest, so a producer regression is caught here rather than in
//  production. They are NOT the proof: the proof is
//  `exportSealedBundleForTheRealValidator`, which seals a realistic bundle
//  through the REAL `ScanBundleWriter` and copies it somewhere the actual
//  Python validator can be run against it. There is no iOS CI; that export +
//  `python3 scripts/validate_capture_bundle.py <dir>` is the only thing that
//  can say "exit 0" about the bytes this app writes.
//
//  Numbers in the fixture come from a real device scan (LiDAR iPhone, July
//  2026) rather than being invented: verdict=red, surfaces=11, coveragePct=73,
//  keyframesFired=57, sceneDepth frames=2635, meshAnchors=68.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ScanBundleInstrumentLayerTests {

    // MARK: - A realistic client bundle

    /// The artifact set a real client scan actually produces — every kind
    /// `RoomCaptureBundleAdapter.freezeBundleArtifacts` registers, with
    /// plausible bytes. `heroThumbnail` and `bundleArchive` are deliberately
    /// absent: no producer in the app registers them (verified by grep), and
    /// the worker has no key route for either.
    private func makeRealisticBundle() throws -> ScanBundleWriter {
        let writer = try ScanBundleWriter(
            scanId: UUID(),
            roomLocalId: UUID(),
            roomName: "Living Room",
            capture: .init(highFidelityDepthEnabled: true, autoPhotoInterval: 2.0)
        )

        try writer.writeArtifact(
            kind: .capturedRoomJson,
            data: Data(#"{"walls":[{"identifier":"w1"}],"doors":[],"windows":[],"objects":[]}"#.utf8),
            mimeType: "application/json")
        try writer.writeArtifact(
            kind: .usdz,
            data: Data(repeating: 0x55, count: 4096),
            mimeType: "model/vnd.usdz+zip")
        try writer.writeArtifact(
            kind: .mesh,
            data: Data("ply\nformat ascii 1.0\nelement vertex 0\nend_header\n".utf8),
            mimeType: "model/ply")
        try writer.writeArtifact(
            kind: .worldMap,
            data: Data(repeating: 0x1A, count: 2048),
            mimeType: "application/octet-stream")
        try writer.writeArtifact(
            kind: .coverageHeatmap,
            data: Data(#"{"cellSize":0.25,"cells":[]}"#.utf8),
            mimeType: "application/json")
        try writer.writeArtifact(
            kind: .depthArchive,
            data: Data(repeating: 0x7F, count: 8192),
            mimeType: "application/zip")

        for index in 0..<2 {
            try writer.appendPhoto(
                photo(index: index),
                imageData: Data(repeating: UInt8(0xC0 + index), count: 512))
        }
        try writer.registerPhotosManifest()

        try writer.updateCaptureEnvironment(.init(
            lightEstimate: 812.5,
            thermalState: "fair",
            batteryLevel: 0.63,
            motionQuality: "good",
            opticalFlowMean: nil,
            sceneDepthFrameCount: 2635,
            coverageHeatmapPresent: true))

        return writer
    }

    private func photo(index: Int) -> ScanManifest.PhotoEntry {
        ScanManifest.PhotoEntry(
            relativePath: "photos/auto_\(index).heic",
            kind: index == 0 ? .hero : .auto,
            capturedAt: Date(timeIntervalSince1970: 1_784_000_000 + Double(index) * 2),
            timestampSeconds: Double(index) * 2,
            sizeBytes: 512,
            width: 4032,
            height: 3024,
            isFullResolution: true,
            cameraTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            cameraIntrinsics: .init(fx: 3200, fy: 3200, cx: 2016, cy: 1512, width: 4032, height: 3024),
            eulerAngles: [0, 0, 0])
    }

    // MARK: - The export the real validator reads

    /// Seal a realistic bundle and copy it where `validate_capture_bundle.py`
    /// can be pointed at it. NOT a hermetic assertion — a bridge to the only
    /// authority that matters. The destination is stable and overwritten each
    /// run, and lives in the test host's Caches so it is findable from the Mac:
    ///
    ///     find ~/Library/Developer/CoreSimulator/Devices \
    ///          -type d -name PatinaBundleExport 2>/dev/null
    ///     python3 scripts/validate_capture_bundle.py "$FOUND/sealed-client-bundle"
    @Test func exportSealedBundleForTheRealValidator() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }
        try sealForValidation(writer)

        let caches = try FileManager.default.url(
            for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let dest = caches
            .appendingPathComponent("PatinaBundleExport", isDirectory: true)
            .appendingPathComponent("sealed-client-bundle", isDirectory: true)

        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.createDirectory(
            at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: writer.bundleURL, to: dest)

        // stdout, not os_log — this line exists to be read off a test run.
        print("[BundleExport] \(dest.path)")
        #expect(FileManager.default.fileExists(atPath: dest.appendingPathComponent("manifest.json").path))
    }

    /// Seal the way the app seals: `RoomCaptureBundleAdapter.applyReviewAndSeal`
    /// steps 4 and 5, in that order. Hashing is what makes `checksumAlgorithm`
    /// a true statement, which is why the layer goes in first and the seal
    /// second.
    @discardableResult
    private func sealForValidation(_ writer: ScanBundleWriter) throws -> ScanManifest {
        try writer.applyInstrumentLayer(Self.deviceShapedLayer)
        return try writer.finalize(hashArtifacts: true)
    }

    /// The layer `finalizeInstrumentLane(arSession:)` produces, with the
    /// numbers a real device scan produced. Assembled here rather than driven
    /// through `RoomCaptureService` because that needs a live ARSession; the
    /// SHAPE is what the bundle is judged on, and it is this type.
    private static let deviceShapedLayer = ScanManifest.InstrumentLayer(
        session: .init(
            sessionId: "0F1C8D2E-4A63-4B90-9E71-2D5C8B3A6F04",   // ARSession.identifier
            appVersion: "1.4.0",
            appBuild: "812",
            startedAt: "2026-07-28T19:41:06Z",
            endedAt: "2026-07-28T19:47:52Z",
            captureDurationSeconds: 406,
            arWorldTrackingConfig: "shared-roomcapture",
            thermalPeak: "fair"),
        // Empty, and that is the point — Patina has no anchor-entry UI.
        anchors: [],
        scorecard: .init(
            coveragePct: 73,
            sharpFrameRatio: 0.86,
            trackingHealth: .fair,
            anchorCount: 0,
            verdict: .red,
            surfaceChecklist: (0..<11).map {
                SurfaceStatus(surface: "wall:\($0)", covered: $0 < 8)
            },
            namedGaps: [ScorecardGap(surface: "wall:10", phrase: "the wall behind the sofa")]),
        poseGraphSummary: .init(
            keyframeCount: 57,
            blurRejectedCount: 9,
            rawBlurFailures: 21,
            encodeDropped: 0))

    // MARK: - The seven keys, restated in process

    /// All seven keys the validator's `REQUIRED_TOP_LEVEL_KEYS` names, present
    /// in the manifest that actually reaches disk.
    @Test func sealedBundleCarriesEveryRequiredInstrumentKey() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }
        try sealForValidation(writer)

        let json = try #require(
            try JSONSerialization.jsonObject(with: Data(contentsOf: writer.manifestURL))
                as? [String: Any])

        for key in ["schemaVersion", "bundleSpecVersion", "scanId", "device", "session",
                    "anchors", "scorecard", "poseGraphSummary", "unverified",
                    "checksumAlgorithm", "artifacts"] {
            #expect(json[key] != nil, "sealed manifest is missing required key '\(key)'")
        }
        #expect(json["bundleSpecVersion"] as? Int == 1)
        #expect(json["checksumAlgorithm"] as? String == "sha256")
        // §10.6's literal wording: "'anchors' must be an array".
        #expect(json["anchors"] is [Any], "'anchors' must be an array")
    }

    /// The unflattering truth, emitted. Zero anchors → UNVERIFIED, and the
    /// scorecard's count agrees with the array, which is the pair the
    /// validator's §10.6 cross-check compares.
    @Test func aClientScanIsStampedUnverifiedBecauseItHasNoAnchors() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }
        let sealed = try sealForValidation(writer)

        #expect(sealed.anchors == [])
        #expect(sealed.unverified == true)
        #expect(sealed.unverified == AnchorGate.isUnverified(anchorCount: 0))
        #expect(sealed.scorecard?.anchorCount == 0)
    }

    /// `checksumAlgorithm: "sha256"` has to be a true statement about the file,
    /// not a constant. Every listed artifact carries a real 64-hex digest of
    /// its own bytes — the §10.5 requirement, and the one a self-listed
    /// manifest could never satisfy.
    @Test func everyListedArtifactCarriesARealSha256() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }
        let sealed = try sealForValidation(writer)

        #expect(sealed.checksumAlgorithm == "sha256")
        #expect(!sealed.artifacts.isEmpty)
        for artifact in sealed.artifacts {
            let sha = try #require(artifact.sha256, "artifact '\(artifact.kind.rawValue)' has no sha256")
            // Hoisted: `#expect` expands its argument into a throwing context,
            // and `allSatisfy`'s predicate is `rethrows`.
            let isHex = sha.allSatisfy { $0.isHexDigit }
            #expect(sha.count == 64)
            #expect(isHex)

            let url = writer.bundleURL.appendingPathComponent(artifact.relativePath)
            let bytes = try Data(contentsOf: url)
            #expect(bytes.count == artifact.sizeBytes)
        }
    }

    /// What Patina measures, and only that. The keyframe DECISION lane's four
    /// counters are emitted; the four pose-graph fields this app never computes
    /// are ABSENT from the JSON rather than zeroed — a zero would claim a graph
    /// was built and found empty.
    @Test func poseGraphSummaryStatesOnlyWhatTheDecisionLaneMeasures() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }
        try sealForValidation(writer)

        let json = try #require(
            try JSONSerialization.jsonObject(with: Data(contentsOf: writer.manifestURL))
                as? [String: Any])
        let pose = try #require(json["poseGraphSummary"] as? [String: Any])

        #expect(pose["keyframeCount"] as? Int == 57)
        #expect(pose["blurRejectedCount"] as? Int == 9)
        #expect(pose["rawBlurFailures"] as? Int == 21)
        // Structurally 0: the sequencer's in-flight slot is released in the same
        // turn because there is no encoder behind this lane.
        #expect(pose["encodeDropped"] as? Int == 0)

        for absent in ["nodeCount", "edgeCount", "loopClosures", "meanTranslationDriftPct"] {
            #expect(pose[absent] == nil,
                    "poseGraphSummary invented '\(absent)' — this app builds no pose graph")
        }
    }

    /// `session` reads out with Field's key names and Field's value vocabulary.
    @Test func sessionMatchesTheFieldWireShape() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }
        try sealForValidation(writer)

        let json = try #require(
            try JSONSerialization.jsonObject(with: Data(contentsOf: writer.manifestURL))
                as? [String: Any])
        let session = try #require(json["session"] as? [String: Any])

        #expect(Set(session.keys) == [
            "sessionId", "appVersion", "appBuild", "startedAt", "endedAt",
            "captureDurationSeconds", "arWorldTrackingConfig", "thermalPeak"])
        #expect(session["arWorldTrackingConfig"] as? String == "shared-roomcapture")
        #expect(session["captureDurationSeconds"] as? Int == 406)
    }

    // MARK: - The derivations that make an inconsistent bundle unreachable

    /// `apply(_:)` derives `unverified` and `scorecard.anchorCount` from the
    /// anchors array rather than trusting the caller, so the §10.6 cross-checks
    /// cannot be failed by a producer that computed the count separately.
    /// Fed a scorecard that disagrees, the manifest still comes out consistent.
    @Test func applyDerivesTheAnchorFactsFromTheAnchorsArray() throws {
        var manifest = ScanManifest(
            scanId: UUID(),
            device: .init(model: "iPhone17,2", osVersion: "26.5", hasLidar: true))

        let anchor = AnchorRecord(
            id: AnchorRecord.newClientAnchorID(), index: 0, label: "north wall run",
            spanKind: .span, entryMethod: .typed,
            endpointA: .init(x: 0, y: 0, z: 0), endpointB: .init(x: 4.1, y: 0, z: 0),
            modelSpanMeters: 4.1, measuredValueMm: 4102)

        // A scorecard claiming 3 anchors beside an array holding 1.
        let layer = ScanManifest.InstrumentLayer(
            session: Self.deviceShapedLayer.session,
            anchors: [anchor],
            scorecard: .init(coveragePct: 91, sharpFrameRatio: 0.9, trackingHealth: .good,
                             anchorCount: 3, verdict: .green, surfaceChecklist: [],
                             namedGaps: []),
            poseGraphSummary: Self.deviceShapedLayer.poseGraphSummary)
        manifest.apply(layer)

        #expect(manifest.scorecard?.anchorCount == 1)          // the array won
        #expect(manifest.unverified == true)                   // 1 < 3
        #expect(manifest.anchors?.count == 1)
        // Everything else about the scorecard is carried through untouched.
        #expect(manifest.scorecard?.coveragePct == 91)
        #expect(manifest.scorecard?.verdict == .green)
    }

    /// The layer appears at SEAL and not before. An in-progress bundle is
    /// byte-for-byte what it always was, which is what keeps
    /// `ScanManifestSupersetTests.currentShapeManifestReEncodesByteIdentically`
    /// meaningful and what stops `checksumAlgorithm` claiming hashes that do
    /// not exist yet.
    @Test func anUnsealedBundleStillCarriesNoInstrumentLayer() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }

        let text = try #require(String(data: Data(contentsOf: writer.manifestURL), encoding: .utf8))
        for key in ["bundleSpecVersion", "unverified", "checksumAlgorithm",
                    "session", "anchors", "scorecard", "poseGraphSummary"] {
            #expect(!text.contains("\"\(key)\""), "instrument key '\(key)' appeared before seal")
        }
    }
}

// MARK: - Thermal peak

@MainActor
struct ThermalPeakRecorderTests {

    /// A peak is a high-water mark, not the last reading. The whole reason the
    /// recorder exists is that a phone which ran hot and cooled before the user
    /// stopped scanning must not report `nominal`.
    @Test func thePeakIsTheHighestStateSeenAndNeverFallsBack() {
        let recorder = ThermalPeakRecorder(initial: .nominal)
        recorder.note(.fair)
        recorder.note(.serious)
        recorder.note(.nominal)

        #expect(recorder.peak == .serious)
        #expect(recorder.peakLabel == "serious")
    }

    /// Seeded with the state at scan start, so a session that begins hot and
    /// never transitions still tells the truth.
    @Test func theInitialStateIsAlreadyThePeak() {
        #expect(ThermalPeakRecorder(initial: .critical).peakLabel == "critical")
    }

    /// Field's four labels, verbatim — these are wire values.
    @Test func labelsAreFieldsVocabulary() {
        #expect(ThermalPeakRecorder.label(for: .nominal) == "nominal")
        #expect(ThermalPeakRecorder.label(for: .fair) == "fair")
        #expect(ThermalPeakRecorder.label(for: .serious) == "serious")
        #expect(ThermalPeakRecorder.label(for: .critical) == "critical")
    }
}
