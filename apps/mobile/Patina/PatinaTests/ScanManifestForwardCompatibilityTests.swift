//
//  ScanManifestForwardCompatibilityTests.swift
//  PatinaTests
//
//  Pins the leniency `ScanManifest.init(from:)` grants the instrument layer,
//  and the strictness it withholds from everything else.
//
//  The defect these exist for: `ScanRecoveryService` used to delete a scan
//  bundle and its SwiftData row whenever `manifest.json` threw. A single
//  unrecognized enum value — a `Verdict` case from a newer build, a spec
//  revision, a Field manifest written by a version we predate — was therefore
//  one launch away from being permanent, silent user data loss. Half the fix is
//  in `ScanRecoveryService` (it no longer deletes); this half is the decoder
//  refusing to throw in the first place, so a forward-compatible manifest reads
//  as a scan with one diagnostic missing rather than as a broken document.
//
//  Fixtures are the same real ones `ScanManifestSupersetTests` uses — in
//  particular `field_manifest_instrument_layer.json`, which
//  `scripts/validate_capture_bundle.py` exits 0 on. Mutating a known-good
//  document one key at a time is what makes each case here evidence about that
//  key rather than about a hand-rolled JSON blob.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ScanManifestForwardCompatibilityTests {

    // MARK: - Fixture plumbing

    private func fixtureObject(_ name: String) throws -> [String: Any] {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let data = try Data(contentsOf: dir.appendingPathComponent("Fixtures/\(name).json"))
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// Decode a JSON object through the production read path — the same
    /// `ScanBundleWriter.readManifest(at:)` the app runs.
    private func decode(_ object: [String: Any]) throws -> ScanManifest {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try data.write(to: dir.appendingPathComponent("manifest.json"))
        return try ScanBundleWriter.readManifest(at: dir)
    }

    /// Replace one key inside the fixture's `scorecard` object.
    private func fieldManifest(scorecardKey key: String, setTo value: Any) throws -> [String: Any] {
        var object = try fixtureObject("field_manifest_instrument_layer")
        var scorecard = try #require(object["scorecard"] as? [String: Any])
        #expect(scorecard[key] != nil, "fixture no longer carries scorecard.\(key)")
        scorecard[key] = value
        object["scorecard"] = scorecard
        return object
    }

    // MARK: - 1. Unknown enum values in optional instrument fields

    /// THE regression test. `verdict` is a closed `String` enum
    /// (`green|amber|red`); a newer build emitting a fourth case must cost us
    /// the scorecard, not the scan.
    @Test
    func unknownVerdictDegradesTheScorecardAndNotTheManifest() throws {
        let manifest = try decode(try fieldManifest(scorecardKey: "verdict", setTo: "chartreuse"))

        // The one key we could not read is nil, and named.
        #expect(manifest.scorecard == nil)
        #expect(manifest.unreadableInstrumentKeys == ["scorecard"])

        // Everything the client actually runs on is intact.
        #expect(manifest.scanId == UUID(uuidString: "9f14b2c8-6d3e-4a91-b0f5-2c7e8d1a4b60"))
        #expect(manifest.roomName == "Primary Bedroom")
        #expect(manifest.schemaVersion == 3)
        #expect(manifest.annotations.roomNotes == "Radiator under the north window.")

        // …as are the other six instrument keys — the degrade is per-key, not
        // per-layer. A whole-layer `try?` would have taken these with it.
        #expect(manifest.bundleSpecVersion == 1)
        #expect(manifest.unverified == false)
        #expect(manifest.checksumAlgorithm == "sha256")
        #expect(manifest.session?.appBuild == "218")
        #expect(manifest.anchors?.count == 3)
        #expect(manifest.poseGraphSummary?.keyframeCount == 312)
    }

    /// The second enum on the same type, so the tolerance is a property of the
    /// decode path rather than of one lucky field.
    @Test
    func unknownTrackingHealthDegradesTheScorecardAndNotTheManifest() throws {
        let manifest = try decode(try fieldManifest(scorecardKey: "trackingHealth", setTo: "excellent"))

        #expect(manifest.scorecard == nil)
        #expect(manifest.unreadableInstrumentKeys == ["scorecard"])
        #expect(manifest.roomName == "Primary Bedroom")
        #expect(manifest.anchors?.count == 3)
    }

    /// `anchors` is an ARRAY of a type with two closed enums. One bad element
    /// costs the array; the rest of the manifest reads.
    @Test
    func unknownSpanKindInAnAnchorDegradesOnlyTheAnchorsArray() throws {
        var object = try fixtureObject("field_manifest_instrument_layer")
        var anchors = try #require(object["anchors"] as? [[String: Any]])
        anchors[1]["spanKind"] = "diagonal"
        object["anchors"] = anchors

        let manifest = try decode(object)

        #expect(manifest.anchors == nil)
        #expect(manifest.unreadableInstrumentKeys == ["anchors"])
        #expect(manifest.scorecard?.verdict == .green)   // untouched
        #expect(manifest.scanId == UUID(uuidString: "9f14b2c8-6d3e-4a91-b0f5-2c7e8d1a4b60"))
    }

    /// Not only enums: an instrument SCALAR whose type moved (a spec revision
    /// turning a number into an object, say) is the same class of problem and
    /// gets the same answer.
    @Test
    func instrumentScalarOfTheWrongTypeDegradesOnlyThatKey() throws {
        var object = try fixtureObject("field_manifest_instrument_layer")
        object["bundleSpecVersion"] = ["major": 2, "minor": 0]

        let manifest = try decode(object)

        #expect(manifest.bundleSpecVersion == nil)
        #expect(manifest.unreadableInstrumentKeys == ["bundleSpecVersion"])
        #expect(manifest.checksumAlgorithm == "sha256")
        #expect(manifest.scorecard?.verdict == .green)
    }

    /// Several at once: every unreadable key is reported, in `CodingKeys`
    /// order, and each is independently nil.
    @Test
    func multipleUnreadableInstrumentKeysAreAllNamed() throws {
        var object = try fieldManifest(scorecardKey: "verdict", setTo: "chartreuse")
        object["unverified"] = "no"
        var pose = try #require(object["poseGraphSummary"] as? [String: Any])
        pose["keyframeCount"] = "many"
        object["poseGraphSummary"] = pose

        let manifest = try decode(object)

        #expect(manifest.unreadableInstrumentKeys == ["unverified", "scorecard", "poseGraphSummary"])
        #expect(manifest.unverified == nil)
        #expect(manifest.scorecard == nil)
        #expect(manifest.poseGraphSummary == nil)
        #expect(manifest.session?.appBuild == "218")
    }

    // MARK: - 2. A clean manifest reports nothing

    /// `unreadableInstrumentKeys` is empty on well-formed input — both the
    /// client shape (no instrument layer at all) and the Field shape (all seven
    /// keys present and good). Absence is not a degrade.
    @Test
    func wellFormedManifestsReportNoUnreadableKeys() throws {
        let client = try decode(try fixtureObject("scan_manifest_v3_current_shape"))
        #expect(client.unreadableInstrumentKeys.isEmpty)
        #expect(client.scorecard == nil)   // absent, and that is not a failure

        let field = try decode(try fixtureObject("field_manifest_instrument_layer"))
        #expect(field.unreadableInstrumentKeys.isEmpty)
        #expect(field.scorecard?.verdict == .green)
    }

    /// `unreadableInstrumentKeys` is decode output, never wire: it must not
    /// appear in the encoded manifest, or it would leak a client-internal
    /// diagnostic into a document `validate_capture_bundle.py` checks.
    @Test
    func unreadableInstrumentKeysIsNeverEncoded() throws {
        var manifest = try decode(try fieldManifest(scorecardKey: "verdict", setTo: "chartreuse"))
        #expect(!manifest.unreadableInstrumentKeys.isEmpty)
        manifest.unreadableInstrumentKeys = ["forced", "values"]

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let json = try #require(String(bytes: try encoder.encode(manifest), encoding: .utf8))

        #expect(!json.contains("unreadableInstrumentKeys"))
        #expect(!json.contains("forced"))
    }

    // MARK: - 3. Where leniency deliberately stops

    /// The inherited v3 layer is NOT lenient, and must not become so. These
    /// fields are load-bearing — `scanId` is the `@Attribute(.unique)` key
    /// `RoomScanPackage` is matched on — so a malformed one has to surface as a
    /// failure the recovery pass can quarantine, never as a plausible default
    /// silently substituted for the user's real value.
    @Test
    func aMalformedInheritedFieldStillThrows() throws {
        var object = try fixtureObject("field_manifest_instrument_layer")
        object["scanId"] = "not-a-uuid"

        #expect(throws: DecodingError.self) { try self.decode(object) }
    }

    /// Same, for a missing required inherited key.
    @Test
    func aMissingInheritedFieldStillThrows() throws {
        var object = try fixtureObject("field_manifest_instrument_layer")
        #expect(object.removeValue(forKey: "device") != nil, "fixture no longer carries device")

        #expect(throws: DecodingError.self) { try self.decode(object) }
    }
}
