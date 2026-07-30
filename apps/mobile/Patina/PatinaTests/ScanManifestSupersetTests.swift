//
//  ScanManifestSupersetTests.swift
//  PatinaTests
//
//  Proves — by construction, not assertion — that the client v3 `ScanManifest`
//  is the superset Field's `FieldScanManifest` already documents itself against
//  ("a strict SUPERSET of the client v3 ScanManifest … the instrument layer
//  (session, anchors, scorecard, poseGraphSummary, unverified,
//  checksumAlgorithm, bundleSpecVersion) is new").
//
//  Two fixtures, both real rather than invented:
//
//  · `Fixtures/scan_manifest_v3_current_shape.json` — a client v3 manifest in
//    exactly the bytes `ScanBundleWriter.writeManifest()` emits (JSONEncoder,
//    outputFormatting `[.prettyPrinted, .sortedKeys]`, dateEncodingStrategy
//    `.iso8601` — ScanBundleWriter.swift:400-402). No instrument keys. The
//    byte-identity test below cannot pass unless the fixture IS the encoder's
//    output, which is what makes it evidence: adding the instrument layer did
//    not move a single byte of an existing scan.
//
//  · `Fixtures/field_manifest_instrument_layer.json` — a Field instrument
//    bundle's manifest, in Field's encoding (`[.sortedKeys]`, compact —
//    FieldManifestAssembler.write). It was built inside a real bundle
//    directory with real files, and `scripts/validate_capture_bundle.py`
//    (the authoritative spec §10 checker) exits 0 on it. Flipping `unverified`
//    or making `rawBlurFailures` a string makes that validator fail, so the
//    fixture genuinely exercises the instrument checks rather than sitting
//    next to them.
//
//  Decoding goes through the PRODUCTION read path — `ScanBundleWriter
//  .readManifest(at:)` — not a decoder assembled here, so the proof is about
//  the code the app actually runs.
//
//  Fixtures are loaded relative to `#filePath` (there is no iOS CI; the tests
//  run on this machine), matching DesignRequestIntroductionDecodeTests.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ScanManifestSupersetTests {

    private enum FixtureError: Error { case notUTF8 }

    // MARK: - Fixture plumbing

    private func fixtureData(_ name: String) throws -> Data {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        return try Data(contentsOf: dir.appendingPathComponent("Fixtures/\(name).json"))
    }

    private func utf8(_ data: Data) throws -> String {
        guard let text = String(bytes: data, encoding: .utf8) else { throw FixtureError.notUTF8 }
        return text
    }

    private func fixtureText(_ name: String) throws -> String {
        try utf8(try fixtureData(name))
    }

    /// Drop `data` into a throwaway bundle dir as `manifest.json` and read it
    /// back through the production path.
    private func decodeThroughReadManifest(_ data: Data) throws -> ScanManifest {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try data.write(to: dir.appendingPathComponent("manifest.json"))
        return try ScanBundleWriter.readManifest(at: dir)
    }

    /// The encoder `ScanBundleWriter.writeManifest()` uses, verbatim. That
    /// method is private, so the settings are mirrored here; the byte-identity
    /// test is what keeps the mirror honest.
    private var writerEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    // MARK: - 1. The existing wire is untouched

    /// The load-bearing one. A current-shape manifest — no instrument fields —
    /// decodes through the production reader and re-encodes to the identical
    /// bytes. The server and `validate_capture_bundle.py` consume these bytes.
    @Test
    func currentShapeManifestReEncodesByteIdentically() throws {
        let original = try fixtureData("scan_manifest_v3_current_shape")
        let manifest = try decodeThroughReadManifest(original)
        let reEncoded = try writerEncoder.encode(manifest)

        // Hoisted: `#expect`'s comment is a non-throwing autoclosure.
        let expectedText = try utf8(original)
        let actualText = try utf8(reEncoded)
        #expect(reEncoded == original,
                """
                Re-encoded bytes differ from the fixture. Expected:
                \(expectedText)
                Actual:
                \(actualText)
                """)
    }

    /// The same manifest, read: every instrument key is absent, so every
    /// instrument property is nil. A scan written before this change is
    /// indistinguishable from one written after.
    @Test
    func currentShapeManifestCarriesNoInstrumentLayer() throws {
        let manifest = try decodeThroughReadManifest(fixtureData("scan_manifest_v3_current_shape"))

        #expect(manifest.schemaVersion == 3)
        #expect(manifest.bundleSpecVersion == nil)
        #expect(manifest.unverified == nil)
        #expect(manifest.checksumAlgorithm == nil)
        #expect(manifest.session == nil)
        #expect(manifest.anchors == nil)
        #expect(manifest.scorecard == nil)
        #expect(manifest.poseGraphSummary == nil)

        // …and the inherited v3 layer still reads as the typed shapes the rest
        // of the app depends on.
        #expect(manifest.scanId == UUID(uuidString: "9F14B2C8-6D3E-4A91-B0F5-2C7E8D1A4B60"))
        #expect(manifest.roomName == "Living Room")
        #expect(manifest.artifacts.count == 3)
        #expect(manifest.photos.count == 1)
        #expect(manifest.annotations.userProvidedRoomName == "Living Room")
    }

    /// A manifest built the way a producer builds one — the plain initializer,
    /// no instrument arguments — must not emit any of the seven new keys.
    /// This is what protects the sibling `.bundleManifest` producer: nil
    /// Optionals are omitted by the synthesized `encode(to:)`, so nothing new
    /// reaches disk until a later wave populates them.
    @Test
    func freshlyBuiltManifestOmitsEveryInstrumentKey() throws {
        let manifest = ScanManifest(
            scanId: UUID(),
            device: .init(model: "iPhone17,2", osVersion: "26.5", hasLidar: true))
        let json = try utf8(try writerEncoder.encode(manifest))

        for key in ["bundleSpecVersion", "unverified", "checksumAlgorithm",
                    "session", "anchors", "scorecard", "poseGraphSummary"] {
            #expect(!json.contains("\"\(key)\""), "instrument key '\(key)' leaked into a client manifest")
        }
    }

    // MARK: - 2. A Field manifest reads through, instrument layer and all

    /// The instrument scalars and §3.2 session.
    @Test
    func fieldProducedManifestDecodesSessionAndScalars() throws {
        let manifest = try decodeThroughReadManifest(fixtureData("field_manifest_instrument_layer"))

        #expect(manifest.schemaVersion == 3)          // same on-disk format version
        #expect(manifest.bundleSpecVersion == 1)      // …the Field marker is this
        #expect(manifest.unverified == false)
        #expect(manifest.checksumAlgorithm == "sha256")

        let session = try #require(manifest.session)
        #expect(session.sessionId == "6b0c4e2a-51f7-4d8b-9a13-0e5f7c2d8a44")
        #expect(session.appVersion == "1.4.0")
        #expect(session.appBuild == "218")
        #expect(session.startedAt == "2026-07-28T14:02:11Z")
        #expect(session.endedAt == "2026-07-28T14:13:47Z")
        #expect(session.captureDurationSeconds == 696)
        #expect(session.arWorldTrackingConfig == "shared-roomcapture")
        #expect(session.thermalPeak == "fair")
    }

    /// §3.3 anchors — the typed ground truth that lifts a scan out of UNVERIFIED.
    @Test
    func fieldProducedManifestDecodesAnchors() throws {
        let manifest = try decodeThroughReadManifest(fixtureData("field_manifest_instrument_layer"))
        let anchors = try #require(manifest.anchors)

        #expect(anchors.count == 3)
        let first = try #require(anchors.first)
        #expect(first.id == "3f2a9c10-0000-4000-8000-000000000000")   // lowercase preserved
        #expect(first.index == 0)
        #expect(first.label == "north wall run")
        #expect(first.spanKind == .span)
        #expect(first.entryMethod == .typed)
        #expect(first.endpointA == AnchorRecord.Point3(x: 0, y: 0, z: 0))
        #expect(first.endpointB == AnchorRecord.Point3(x: 4.118, y: 0, z: 0))
        #expect(first.modelSpanMeters == 4.118)
        #expect(first.measuredValueMm == 4115)
        #expect(anchors[1].spanKind == .height)
    }

    /// §3.4 scorecard and §3.5 poseGraphSummary, including both of Field's
    /// logged spec-deltas (`namedGaps`, and the two extra pose counters).
    @Test
    func fieldProducedManifestDecodesScorecardAndPoseGraph() throws {
        let manifest = try decodeThroughReadManifest(fixtureData("field_manifest_instrument_layer"))

        let scorecard = try #require(manifest.scorecard)
        #expect(scorecard.coveragePct == 92)
        #expect(scorecard.sharpFrameRatio == 0.81)
        #expect(scorecard.trackingHealth == .good)
        #expect(scorecard.anchorCount == 3)
        #expect(scorecard.verdict == .green)
        #expect(scorecard.surfaceChecklist.count == 3)
        #expect(scorecard.surfaceChecklist.last?.surface == "ceiling")
        #expect(scorecard.surfaceChecklist.last?.covered == false)
        let gaps = try #require(scorecard.namedGaps)
        #expect(gaps == [ScorecardGap(
            surface: "ceiling", phrase: "walk back and pan up at the ceiling")])

        let pose = try #require(manifest.poseGraphSummary)
        #expect(pose.keyframeCount == 312)
        #expect(pose.nodeCount == 312)
        #expect(pose.edgeCount == 1180)
        #expect(pose.loopClosures == 4)
        #expect(pose.meanTranslationDriftPct == 0.34)
        #expect(pose.blurRejectedCount == 27)
        #expect(pose.rawBlurFailures == 51)
        #expect(pose.encodeDropped == 2)
    }

    /// The inherited v3 layer reads out of a Field manifest too: Field's
    /// ISO8601 `createdAt` string lands in the client's `Date`, and its
    /// lowercase UUID string in the client's `UUID`.
    @Test
    func fieldProducedManifestDecodesTheInheritedV3Layer() throws {
        let manifest = try decodeThroughReadManifest(fixtureData("field_manifest_instrument_layer"))

        #expect(manifest.scanId == UUID(uuidString: "9f14b2c8-6d3e-4a91-b0f5-2c7e8d1a4b60"))
        #expect(manifest.createdAt == ISO8601DateFormatter().date(from: "2026-07-28T14:02:11Z"))
        #expect(manifest.roomName == "Primary Bedroom")
        #expect(manifest.device.hasLidar)
        #expect(manifest.captureEnvironment.sceneDepthFrameCount == 618)
        #expect(manifest.annotations.roomNotes == "Radiator under the north window.")
    }

    /// The instrument layer survives a full pass through the client type: it is
    /// held, not merely glimpsed on the way past.
    @Test
    func fieldInstrumentLayerSurvivesAReEncode() throws {
        let once = try decodeThroughReadManifest(fixtureData("field_manifest_instrument_layer"))
        let twice = try decodeThroughReadManifest(try writerEncoder.encode(once))

        #expect(twice.bundleSpecVersion == once.bundleSpecVersion)
        #expect(twice.unverified == once.unverified)
        #expect(twice.checksumAlgorithm == once.checksumAlgorithm)
        #expect(twice.session == once.session)
        #expect(twice.anchors == once.anchors)
        #expect(twice.scorecard == once.scorecard)
        #expect(twice.poseGraphSummary == once.poseGraphSummary)
        #expect(twice == once)
    }

    /// Stronger than the value round-trip above: re-encoding a Field manifest
    /// reproduces the instrument layer's JSON *keys and values*, not merely
    /// Swift values that compare equal. A collapsed model that quietly dropped
    /// a key, or invented one, would compare fine on the Swift side and still
    /// move the bytes; this compares the decoded JSON objects.
    ///
    /// Scoped to the seven instrument keys on purpose — the inherited v3 layer
    /// legitimately re-shapes (`createdAt` goes through `Date`, `capture`/
    /// `device` have client-side fields Field omits), and those divergences are
    /// documented on `ScanManifest` and pinned by the tests above.
    @Test
    func fieldInstrumentLayerReEncodesWithIdenticalJsonKeysAndValues() throws {
        let original = try fixtureData("field_manifest_instrument_layer")
        let reEncoded = try writerEncoder.encode(try decodeThroughReadManifest(original))

        let before = try #require(try JSONSerialization.jsonObject(with: original) as? [String: Any])
        let after = try #require(try JSONSerialization.jsonObject(with: reEncoded) as? [String: Any])

        for key in ["bundleSpecVersion", "unverified", "checksumAlgorithm",
                    "session", "anchors", "scorecard", "poseGraphSummary"] {
            let lhs = try #require(before[key], "fixture lost its '\(key)'")
            let rhs = try #require(after[key], "re-encode dropped '\(key)'")
            // Wrapped so `NSDictionary`'s deep `isEqual:` does the comparison
            // for scalars, arrays and nested objects alike.
            #expect(NSDictionary(dictionary: ["v": lhs]) == NSDictionary(dictionary: ["v": rhs]),
                    "instrument key '\(key)' changed shape across a re-encode")
        }
    }

    /// `scorecard.namedGaps` is OPTIONAL on the wire — spec §3.4 ("It is
    /// optional; the validator checks the object shape only when present") and
    /// `validate_capture_bundle.py` §10.8, which guards its shape behind
    /// `if named_gaps is not None`. Both a manifest omitting the key and one
    /// carrying `"namedGaps":[]` exit 0 against that validator, so they are two
    /// distinct legal documents and the Swift type has to tell them apart.
    ///
    /// This is why `Scorecard.namedGaps` is `[ScorecardGap]?` here while Field's
    /// is non-Optional: Field's is write-only, ours also reads foreign
    /// manifests. A non-Optional would throw `keyNotFound` on the input below,
    /// and a `?? []` recovery would re-encode it as `"namedGaps":[]` —
    /// inventing a key the producer left out.
    @Test
    func aScorecardWithoutNamedGapsDecodesAndTheKeyIsNotInvented() throws {
        var object = try #require(
            try JSONSerialization.jsonObject(with: fixtureData("field_manifest_instrument_layer"))
                as? [String: Any])
        var scorecard = try #require(object["scorecard"] as? [String: Any])
        #expect(scorecard.removeValue(forKey: "namedGaps") != nil,
                "fixture no longer carries scorecard.namedGaps")
        object["scorecard"] = scorecard

        let stripped = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        let manifest = try decodeThroughReadManifest(stripped)

        let decoded = try #require(manifest.scorecard)
        #expect(decoded.namedGaps == nil)          // absent, not empty
        #expect(decoded.coveragePct == 92)         // the rest of §3.4 still read
        #expect(decoded.verdict == .green)

        let json = try utf8(try writerEncoder.encode(manifest))
        #expect(!json.contains("\"namedGaps\""), "re-encode invented a namedGaps key")
    }

    /// The other half of the same contract: an EMPTY array is carried as an
    /// empty array, never collapsed to absent. Field's producer always writes
    /// the key, so collapsing `[]` to nil would drop it off Patina's re-encode
    /// of every gap-free Field scan.
    @Test
    func anEmptyNamedGapsArrayStaysAnEmptyArray() throws {
        var object = try #require(
            try JSONSerialization.jsonObject(with: fixtureData("field_manifest_instrument_layer"))
                as? [String: Any])
        var scorecard = try #require(object["scorecard"] as? [String: Any])
        scorecard["namedGaps"] = [Any]()
        object["scorecard"] = scorecard

        let emptied = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        let manifest = try decodeThroughReadManifest(emptied)

        #expect(manifest.scorecard?.namedGaps == [])   // present and empty
        let json = try utf8(try writerEncoder.encode(manifest))
        #expect(json.contains("\"namedGaps\" : ["), "re-encode dropped an empty namedGaps key")
    }

    /// The two invariants `validate_capture_bundle.py` §10.6 enforces across
    /// the instrument layer, restated against the decoded Swift values — so a
    /// future producer that populates these fields can be checked in-process
    /// before it ever writes a bundle.
    @Test
    func decodedInstrumentLayerSatisfiesTheValidatorsAnchorRules() throws {
        let manifest = try decodeThroughReadManifest(fixtureData("field_manifest_instrument_layer"))
        let anchors = try #require(manifest.anchors)

        #expect(manifest.unverified == (anchors.count < 3))
        #expect(manifest.scorecard?.anchorCount == anchors.count)
        for anchor in anchors {
            #expect(anchor.measuredValueMm > 0)
            #expect(anchor.entryMethod == .typed)
        }
    }

    // MARK: - 3. Where the superset deliberately stops

    /// Field's artifact vocabulary is wider than the client's `ArtifactKind`.
    /// Closing that gap is a coupled change — the enum is switched
    /// exhaustively and without a `default` in ScanBundleWriter and
    /// ArtifactUploader, each needing a storage-folder / room_scans-column
    /// decision per kind — so it is NOT part of this additive wave. Pinned
    /// here so the next wave finds it as a failing expectation rather than as
    /// a decode crash in the field.
    @Test
    func fieldOnlyArtifactKindDoesNotDecodeYet() throws {
        let text = try fixtureText("field_manifest_instrument_layer")
        let withFieldKind = text.replacingOccurrences(of: "\"kind\":\"mesh\"",
                                                      with: "\"kind\":\"anchors\"")
        #expect(withFieldKind != text, "fixture no longer contains the mesh artifact kind")

        #expect(throws: DecodingError.self) {
            try self.decodeThroughReadManifest(Data(withFieldKind.utf8))
        }
    }

    /// The other stop: `photos[]` shares its KEY with Field but not its element
    /// shape. Field writes `FieldPhotoEntry` (`filename`, `fileSizeBytes`, no
    /// `id`, no `kind`); the client writes `PhotoEntry` (`relativePath`,
    /// `sizeBytes`, `id`, `kind`). The fixture's `photos` is empty, which is
    /// why it decodes; a populated Field `photos[]` does not. Reconciling the
    /// two element shapes is its own decision, not an additive field.
    @Test
    func fieldPhotoEntryShapeIsNotTheClientPhotoEntry() throws {
        let text = try fixtureText("field_manifest_instrument_layer")
        #expect(text.contains("\"photos\":[]"), "fixture's photos[] is expected to be empty")

        let fieldPhoto = """
        {"filename":"auto_001.50.jpg","thumbnailFilename":"thumb_auto_001.50.jpg",\
        "cameraTransform":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],\
        "cameraIntrinsics":{"fx":1594.5,"fy":1594.5,"cx":2016,"cy":1512,"width":4032,"height":3024},\
        "eulerAngles":[0,0,0],"lightEstimateLumens":742.5,"timestampSeconds":1.5,\
        "capturedAt":"2026-07-28T14:03:05Z","width":4032,"height":3024,"fileSizeBytes":1842013}
        """
        let withFieldPhoto = text.replacingOccurrences(of: "\"photos\":[]",
                                                       with: "\"photos\":[\(fieldPhoto)]")

        #expect(throws: DecodingError.self) {
            try self.decodeThroughReadManifest(Data(withFieldPhoto.utf8))
        }
    }
}
