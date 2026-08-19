//
//  ScanUploadShadowLegTests.swift
//  PatinaTests
//
//  The shadow leg's contract with the primary upload path: it runs only after
//  the primary succeeded, it cannot throw, and it cannot change what the
//  primary returned.
//

import Testing
import Foundation
@testable import Patina

private struct PrimaryFailure: Error {}

@Suite(.serialized)
struct ScanUploadShadowLegIsolationTests {

    /// Direction 1: the primary fails. The shadow must never run — a failed
    /// primary means there are no bytes in Storage to be a shadow of, and a
    /// second upload attempt would be a delivery, not a measurement.
    @Test
    func primaryFailureNeverReachesTheShadow() async {
        let shadowRuns = Counter()

        do {
            _ = try await ScanUploadShadowLeg.afterPrimary(
                primary: { () async throws -> String? in throw PrimaryFailure() },
                shadow: { _ in
                    shadowRuns.bump()
                    return ScanUploadShadowLeg.Outcome(uploaded: true, sha256: "x", matched: true)
                }
            )
            Issue.record("expected the primary's error to propagate")
        } catch {
            #expect(error is PrimaryFailure)
        }

        #expect(shadowRuns.value == 0)
    }

    /// Direction 2: the shadow fails. The primary's value comes back untouched
    /// and nothing throws.
    @Test
    func shadowFailureDoesNotDisturbThePrimary() async throws {
        let result = try await ScanUploadShadowLeg.afterPrimary(
            primary: { "usdz/user/room/scan.usdz" },
            shadow: { _ in ScanUploadShadowLeg.Outcome(uploaded: false, sha256: "abc", matched: nil) }
        )

        #expect(result.value == "usdz/user/room/scan.usdz")
        #expect(result.shadow.uploaded == false)
        #expect(result.shadow.matched == nil)
    }

    /// Toggle off: the call reduces to the primary, and the recorded state is
    /// byte-identical to what the primary path produced before this leg existed.
    @Test
    func notAttemptedWritesNothingToArtifactState() async throws {
        let result = try await ScanUploadShadowLeg.afterPrimary(
            primary: { "key" },
            shadow: { _ in .notAttempted }
        )
        #expect(result.shadow.wasAttempted == false)

        var state = ArtifactUploadState(kind: .usdz, status: .uploaded, remoteUrl: "key")
        let before = state
        state.apply(shadow: result.shadow)
        #expect(state == before)
        #expect(state.shadowUploaded == nil)
    }

    /// A skipped shadow must not erase what an earlier run measured.
    @Test
    func notAttemptedPreservesAnEarlierMeasurement() {
        var state = ArtifactUploadState(
            kind: .usdz,
            status: .uploaded,
            remoteUrl: "key",
            shadowUploaded: true,
            shadowSha256: "abc",
            shadowMatched: true
        )
        state.apply(shadow: .notAttempted)
        #expect(state.shadowUploaded == true)
        #expect(state.shadowMatched == true)
    }

    @Test
    func attemptedOutcomeIsRecorded() {
        var state = ArtifactUploadState(kind: .mesh, status: .uploaded, remoteUrl: "key")
        state.apply(shadow: ScanUploadShadowLeg.Outcome(uploaded: true, sha256: "abc", matched: true))
        #expect(state.shadowUploaded == true)
        #expect(state.shadowSha256 == "abc")
        #expect(state.shadowMatched == true)
    }

    /// The three shadow fields are additive: a package sealed by an earlier
    /// build has none of them and must still decode.
    @Test
    func artifactStateDecodesWithoutShadowFields() throws {
        let legacy = Data(#"{"kind":"usdz","status":"uploaded","attempts":1}"#.utf8)
        let state = try JSONDecoder().decode(ArtifactUploadState.self, from: legacy)
        #expect(state.kind == .usdz)
        #expect(state.shadowUploaded == nil)
        #expect(state.shadowSha256 == nil)
    }
}

@Suite(.serialized)
struct ScanUploadShadowLegDormancyTests {

    @Test
    func liveIsNilWhenTheToggleIsOff() {
        let defaults = UserDefaults(suiteName: "shadow-off-\(UUID().uuidString)")!
        let leg = ScanUploadShadowLeg.live(
            defaults: defaults,
            edgeAPIURL: URL(string: "https://edge.example.test")!
        )
        #expect(leg == nil)
    }

    @Test
    func liveIsNilWithoutAnEdgeAPIURL() {
        let defaults = UserDefaults(suiteName: "shadow-on-\(UUID().uuidString)")!
        defaults.set(true, forKey: ScanUploadShadowLeg.toggleKey)
        #expect(ScanUploadShadowLeg.live(defaults: defaults, edgeAPIURL: nil) == nil)
    }

    @Test
    func liveIsBuiltWhenBothArePresent() {
        let defaults = UserDefaults(suiteName: "shadow-both-\(UUID().uuidString)")!
        defaults.set(true, forKey: ScanUploadShadowLeg.toggleKey)
        let leg = ScanUploadShadowLeg.live(
            defaults: defaults,
            edgeAPIURL: URL(string: "https://edge.example.test")!
        )
        #expect(leg != nil)
    }
}

@Suite(.serialized)
struct ScanUploadShadowLegMappingTests {

    @Test
    func mappedKindsMatchTheInterfaceVocabulary() {
        #expect(ScanUploadShadowLeg.uploadKind(for: .usdz) == .usdz)
        #expect(ScanUploadShadowLeg.uploadKind(for: .capturedRoomJson) == .capturedRoomJson)
        #expect(ScanUploadShadowLeg.uploadKind(for: .worldMap) == .worldMap)
        #expect(ScanUploadShadowLeg.uploadKind(for: .mesh) == .mesh)
        #expect(ScanUploadShadowLeg.uploadKind(for: .depthArchive) == .depthArchive)
        #expect(ScanUploadShadowLeg.uploadKind(for: .photosManifest) == .photosManifest)
        #expect(ScanUploadShadowLeg.uploadKind(for: .coverageHeatmap) == .coverageHeatmap)
        #expect(ScanUploadShadowLeg.uploadKind(for: .bundleManifest) == .bundleManifest)
    }

    /// `hero_frame_url` on both sides — the same slot under two names.
    @Test
    func heroThumbnailMapsToHeroFrame() {
        #expect(ScanUploadShadowLeg.uploadKind(for: .heroThumbnail) == .heroFrame)
    }

    /// Deliberately unmapped: the interface has no `bundleArchive`, and the
    /// only slot sharing its column/folder asserts different content.
    @Test
    func bundleArchiveIsUnmapped() {
        #expect(ScanUploadShadowLeg.uploadKind(for: .bundleArchive) == nil)
    }

    /// Device-local kinds never reach an upload, so they never reach the leg.
    @Test
    func deviceLocalKindsAreUnmapped() {
        #expect(ScanUploadShadowLeg.uploadKind(for: .depthIndex) == nil)
        #expect(ScanUploadShadowLeg.uploadKind(for: .photoThumbnails) == nil)
        #expect(ScanUploadShadowLeg.uploadKind(for: .annotations) == nil)
    }

    /// Every kind this app maps must be routable by the primary path too —
    /// a kind with no Storage route is never uploaded, so shadowing it would
    /// measure bytes the primary never sent.
    @Test
    func everyMappedKindIsAlsoRoutedByThePrimaryPath() {
        for kind in ScanManifest.ArtifactKind.allCases
        where ScanUploadShadowLeg.uploadKind(for: kind) != nil {
            let artifact = ScanManifest.Artifact(
                kind: kind,
                relativePath: "x/file.bin",
                sizeBytes: 1,
                sha256: nil,
                mimeType: "application/octet-stream"
            )
            #expect(
                ArtifactUploader.storagePathComponents(for: artifact) != nil,
                "\(kind.rawValue) is shadowed but has no primary storage route"
            )
        }
    }
}

@Suite(.serialized)
struct ScanUploadShadowLegFieldShapingTests {

    @Test
    func filenamesTakeTheLastSafeSegment() {
        #expect(ScanUploadShadowLeg.safeFilename(from: "depth/depth.zip") == "depth.zip")
        #expect(ScanUploadShadowLeg.safeFilename(from: "manifest.json") == "manifest.json")
        #expect(ScanUploadShadowLeg.safeFilename(from: "photos/photos_metadata.ndjson")
            == "photos_metadata.ndjson")
    }

    @Test
    func unsafeFilenamesAreRefused() {
        #expect(ScanUploadShadowLeg.safeFilename(from: "..") == nil)
        #expect(ScanUploadShadowLeg.safeFilename(from: ".hidden") == nil)
        #expect(ScanUploadShadowLeg.safeFilename(from: "a/b/..") == nil)
        #expect(ScanUploadShadowLeg.safeFilename(from: "sp ace.bin") == nil)
        #expect(ScanUploadShadowLeg.safeFilename(from: "") == nil)
        #expect(ScanUploadShadowLeg.safeFilename(from: "café.bin") == nil)
    }

    @Test
    func mimesAreLoweredOrReplaced() {
        #expect(ScanUploadShadowLeg.safeMime("application/JSON") == "application/json")
        #expect(ScanUploadShadowLeg.safeMime("application/x-ndjson") == "application/x-ndjson")
        #expect(ScanUploadShadowLeg.safeMime("model/vnd.usdz+zip") == "model/vnd.usdz+zip")
        #expect(ScanUploadShadowLeg.safeMime("nonsense") == "application/octet-stream")
        #expect(ScanUploadShadowLeg.safeMime("a/b/c") == "application/octet-stream")
    }
}

/// sha256("hello world") — the fixture's real digest.
private let expectedSha =
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"

/// These drive the shared stub queue, so they join `StubbedEdgeUploadTests`
/// rather than forming a suite of their own — see that suite's comment.
extension StubbedEdgeUploadTests {

    private func artifact() -> ScanManifest.Artifact {
        ScanManifest.Artifact(
            kind: .usdz,
            relativePath: "usdz/scan.usdz",
            sizeBytes: 11,
            sha256: "stale-value-from-the-manifest",
            mimeType: "model/vnd.usdz+zip"
        )
    }

    private func fixture() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("shadow-run-\(UUID().uuidString).bin")
        try Data("hello world".utf8).write(to: url)
        return url
    }

    private func leg(session: URLSession, maxBytes: Int = 64 * 1024 * 1024) -> ScanUploadShadowLeg {
        ScanUploadShadowLeg(
            client: MediaUploadIntentClient(
                baseURL: URL(string: "https://edge.example.test")!,
                session: session,
                accessToken: { "token-1" }
            ),
            maxBytes: maxBytes
        )
    }

    private func shadowStubSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: config)
    }

    @Test
    func aConfirmedShadowRecordsAMatch() async throws {
        let file = try fixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(
                status: 201,
                json: """
                {"uploadId":"9c3f5a1d-0000-4000-8000-0000000000aa",
                 "putUrl":"https://r2.example.test/o?sig=1",
                 "requiredHeaders":{"content-length":"11","x-amz-checksum-sha256":"b64"}}
                """
            ),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(
                status: 200,
                json: """
                {"uploadId":"9c3f5a1d-0000-4000-8000-0000000000aa","lifecycle":"stored",
                 "sha256":"\(expectedSha)","etag":"abc","sizeBytes":11}
                """
            )
        ])

        let outcome = await leg(session: shadowStubSession()).run(
            artifact: artifact(),
            fileURL: file,
            scanId: UUID()
        )

        #expect(outcome.uploaded == true)
        #expect(outcome.matched == true)
        // Measured off disk, NOT the stale value the manifest carries.
        #expect(outcome.sha256 == expectedSha)
    }

    /// A digest disagreement is recorded, not thrown.
    @Test
    func aDifferingConfirmedDigestRecordsNoMatch() async throws {
        let file = try fixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(
                status: 201,
                json: """
                {"uploadId":"9c3f5a1d-0000-4000-8000-0000000000aa",
                 "putUrl":"https://r2.example.test/o?sig=1",
                 "requiredHeaders":{"content-length":"11"}}
                """
            ),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(
                status: 200,
                json: """
                {"uploadId":"9c3f5a1d-0000-4000-8000-0000000000aa","lifecycle":"stored",
                 "sha256":"0000000000000000000000000000000000000000000000000000000000000000",
                 "sizeBytes":11}
                """
            )
        ])

        let outcome = await leg(session: shadowStubSession()).run(
            artifact: artifact(),
            fileURL: file,
            scanId: UUID()
        )

        #expect(outcome.uploaded == true)
        #expect(outcome.matched == false)
    }

    /// Every transport and protocol failure is swallowed into an outcome. This
    /// is the property the primary path depends on.
    @Test
    func everyFailureBecomesAnOutcomeAndNeverThrows() async throws {
        let file = try fixture()
        for status in [400, 401, 404, 409, 500] {
            UploadStubRegistry.shared.reset([
                StubbedResponse(status: status, json: #"{"error":"nope"}"#),
                StubbedResponse(status: status, json: #"{"error":"nope"}"#)
            ])
            let outcome = await leg(session: shadowStubSession()).run(
                artifact: artifact(),
                fileURL: file,
                scanId: UUID()
            )
            #expect(outcome.uploaded == false, "status \(status)")
            #expect(outcome.sha256 == expectedSha)
            #expect(outcome.matched == nil)
        }
    }

    @Test
    func anArtifactOverTheSizeCapIsNotAttempted() async throws {
        let file = try fixture()
        UploadStubRegistry.shared.reset([])

        let outcome = await leg(session: shadowStubSession(), maxBytes: 4).run(
            artifact: artifact(),
            fileURL: file,
            scanId: UUID()
        )

        #expect(outcome == .notAttempted)
        #expect(UploadStubRegistry.shared.requests.isEmpty)
    }

    @Test
    func anUnmappedKindIsNotAttempted() async throws {
        let file = try fixture()
        UploadStubRegistry.shared.reset([])

        let bundle = ScanManifest.Artifact(
            kind: .bundleArchive,
            relativePath: "bundle/bundle.zip",
            sizeBytes: 11,
            sha256: nil,
            mimeType: "application/zip"
        )
        let outcome = await leg(session: shadowStubSession()).run(
            artifact: bundle,
            fileURL: file,
            scanId: UUID()
        )

        #expect(outcome == .notAttempted)
        #expect(UploadStubRegistry.shared.requests.isEmpty)
    }

    @Test
    func aMissingFileIsNotAttempted() async {
        UploadStubRegistry.shared.reset([])
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent("absent-\(UUID().uuidString).bin")

        let outcome = await leg(session: shadowStubSession()).run(
            artifact: artifact(),
            fileURL: missing,
            scanId: UUID()
        )

        #expect(outcome == .notAttempted)
        #expect(UploadStubRegistry.shared.requests.isEmpty)
    }
}
