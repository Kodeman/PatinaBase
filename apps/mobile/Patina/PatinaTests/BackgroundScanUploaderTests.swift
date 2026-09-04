//
//  BackgroundScanUploaderTests.swift
//  PatinaTests
//
//  Pins the pure seams of the >=5 MB background scan-upload integrity path:
//
//    - `verificationOutcome(expected:stored:)` — the decision that decides
//      whether a post-upload sha256 check passes. Only a *present and
//      differing* stored sha may fail; nil/absent is unverifiable → accept.
//      (This is the fix for the prod bug where every >=5 MB artifact
//      deterministically failed with `.shaMismatch` because Storage dropped
//      the raw `x-amz-meta-sha256` header and the nil read was mistaken for a
//      mismatch.)
//    - `encodeMetadataHeader(_:)` — the base64(JSON) `x-metadata` wire format
//      Supabase Storage persists into `user_metadata`. Pinned so a future
//      supabase-swift / Storage drift is caught by the gate, not by users.
//    - `parseStoredSha(from:)` — reads `metadata.sha256` back out of the
//      `/object/info/authenticated` JSON body.
//

import Testing
import Foundation
@testable import Patina

struct BackgroundScanUploaderVerificationTests {

    // MARK: - verificationOutcome (the four cases in the task)

    @Test
    func nilExpectedAccepts() {
        // Nothing to verify (artifact carried no hash) → accept.
        #expect(BackgroundScanUploader.verificationOutcome(expected: nil, stored: "abc") == .accept)
        #expect(BackgroundScanUploader.verificationOutcome(expected: "", stored: "abc") == .accept)
    }

    @Test
    func nilStoredAccepts() {
        // Storage surfaced no sha (unverifiable) → accept, the 200 stands.
        // This is the exact path that used to (wrongly) fail every >=5 MB
        // artifact.
        #expect(BackgroundScanUploader.verificationOutcome(expected: "deadbeef", stored: nil) == .accept)
        #expect(BackgroundScanUploader.verificationOutcome(expected: "deadbeef", stored: "") == .accept)
    }

    @Test
    func matchAccepts() {
        #expect(
            BackgroundScanUploader.verificationOutcome(expected: "deadbeef", stored: "deadbeef") == .accept
        )
    }

    @Test
    func presentAndDifferingFails() {
        #expect(
            BackgroundScanUploader.verificationOutcome(expected: "deadbeef", stored: "cafef00d") == .fail
        )
    }

    // MARK: - encodeMetadataHeader wire format (base64 JSON round-trip)

    @Test
    func metadataHeaderRoundTrips() throws {
        let input = ["sha256": "deadbeef", "scanId": "S-1", "artifactKind": "worldMap"]
        let header = try #require(BackgroundScanUploader.encodeMetadataHeader(input))

        // Must be valid base64 whose payload is the JSON object we put in.
        let decoded = try #require(Data(base64Encoded: header))
        let parsed = try JSONSerialization.jsonObject(with: decoded) as? [String: String]
        let obj = try #require(parsed)
        #expect(obj == input)
    }

    @Test
    func metadataHeaderPinnedEncoding() throws {
        // Pin the EXACT bytes for a fixed single-key input so JSON/base64 drift
        // (key ordering, whitespace, base64 variant) trips the gate.
        let header = try #require(BackgroundScanUploader.encodeMetadataHeader(["sha256": "deadbeef"]))
        let decoded = try #require(Data(base64Encoded: header))
        let jsonString = try #require(String(data: decoded, encoding: .utf8))
        #expect(jsonString == #"{"sha256":"deadbeef"}"#)
        // base64("{\"sha256\":\"deadbeef\"}")
        #expect(header == "eyJzaGEyNTYiOiJkZWFkYmVlZiJ9")
    }

    @Test
    func metadataHeaderSortsKeysDeterministically() throws {
        // .sortedKeys → lexicographic: artifactKind < scanId < sha256.
        let header = try #require(
            BackgroundScanUploader.encodeMetadataHeader(
                ["sha256": "H", "scanId": "S", "artifactKind": "K"]
            )
        )
        let decoded = try #require(Data(base64Encoded: header))
        let jsonString = try #require(String(data: decoded, encoding: .utf8))
        #expect(jsonString == #"{"artifactKind":"K","scanId":"S","sha256":"H"}"#)
    }

    @Test
    func emptyMetadataProducesNoHeader() {
        #expect(BackgroundScanUploader.encodeMetadataHeader([:]) == nil)
    }

    // MARK: - parseStoredSha (reads it back out of the info-endpoint body)

    @Test
    func parsesShaFromMetadataKey() throws {
        // Real shape returned by /object/info/authenticated (captured locally).
        let body = Data(#"""
        {"id":"383cc651","name":"worldMap/u/r/world_map.arworldmap","bucket_id":"room-scans",
         "size":17772544,"content_type":"application/octet-stream",
         "metadata":{"sha256":"61a22995cac5"},"created_at":"2026-07-11T20:33:58.373Z"}
        """#.utf8)
        #expect(BackgroundScanUploader.parseStoredSha(from: body) == "61a22995cac5")
    }

    @Test
    func parsesShaFromUserMetadataFallback() throws {
        let body = Data(#"{"user_metadata":{"sha256":"abc123"}}"#.utf8)
        #expect(BackgroundScanUploader.parseStoredSha(from: body) == "abc123")
    }

    @Test
    func returnsNilForEmptyMetadata() {
        // The exact prod-bug signature: object present, metadata dropped.
        let body = Data(#"{"name":"x","metadata":{}}"#.utf8)
        #expect(BackgroundScanUploader.parseStoredSha(from: body) == nil)
    }

    @Test
    func returnsNilForMissingMetadata() {
        #expect(BackgroundScanUploader.parseStoredSha(from: Data(#"{"name":"x"}"#.utf8)) == nil)
    }

    @Test
    func returnsNilForMalformedBody() {
        #expect(BackgroundScanUploader.parseStoredSha(from: Data("not json".utf8)) == nil)
    }

    // MARK: - end-to-end seam: encode → (server) → parse round-trips

    @Test
    func encodeThenParseRoundTripsThroughInfoShape() throws {
        // Mirror the full loop: what we put in the x-metadata header is what
        // /object/info surfaces under `metadata`, and parseStoredSha recovers
        // the same sha the verification decision then accepts.
        let sha = "61a22995cac5655835e455caea30edab4e6f80d92b45f75ee04a4163c847a61b"
        let header = try #require(BackgroundScanUploader.encodeMetadataHeader(["sha256": sha]))
        let decoded = try #require(Data(base64Encoded: header))
        let metadataJSON = try #require(String(data: decoded, encoding: .utf8))
        let infoBody = Data(#"{"name":"x","metadata":\#(metadataJSON)}"#.utf8)
        let stored = BackgroundScanUploader.parseStoredSha(from: infoBody)
        #expect(stored == sha)
        #expect(BackgroundScanUploader.verificationOutcome(expected: sha, stored: stored) == .accept)
    }

    // MARK: - C7-15: one session read per artifact, not one forced refresh

    /// A bundle is a manifest + a USDZ + a world map + meshes + depth +
    /// photos, and `upload(_:)` ran a forced `refreshSession()` before each
    /// one. GoTrue rotates the refresh token on every call and rate-limits
    /// `/token`; with parallel bundles that is a credible 429 or a rotation
    /// race that signs the person out mid-scan. `auth.session` refreshes only
    /// when the session has actually expired.
    @Test
    func theUploadPathReadsTheSessionRatherThanForcingARefresh() throws {
        let source = try SourcePin.read("Patina/Services/Sync/BackgroundScanUploader.swift")
        let uploadBody = try #require(
            source.components(separatedBy: "public func upload(_ descriptor: UploadDescriptor)").last?
                .components(separatedBy: "// MARK: - Request construction").first
        )
        let code = uploadBody
            .split(separator: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        #expect(code.contains("auth.session"))
        #expect(code.contains("refreshSession()") == false)
    }

    /// A real 401 is still the one place a forced refresh belongs.
    @Test
    func aFourOhOneStillForcesOneRefresh() throws {
        let source = try SourcePin.read("Patina/Services/Sync/BackgroundScanUploader.swift")
        let retry = try #require(
            source.components(separatedBy: "private func refreshSessionAndRetry(").last
        )
        #expect(retry.contains("auth.refreshSession()"))
    }
}
