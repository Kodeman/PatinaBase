//  FieldScanUploadShadowLegTests.swift
//  CaptureTests
//
//  The shadow leg's contract with the primary upload path: it runs only after
//  the primary succeeded, it cannot throw, and it cannot change what the
//  primary returned. Ported from the client app's
//  `PatinaTests/ScanUploadShadowLegTests.swift` (W3-B), with the kind-mapping
//  suite replaced by a drift guard on `ScanUploadDescriptor.all` — in Field the
//  descriptor table IS the mapping.

import Testing
import Foundation
@testable import CaptureKit

private struct PrimaryFailure: Error {}

// MARK: - Isolation

@Suite(.serialized)
struct FieldShadowLegIsolationTests {

    /// Direction 1: the primary fails. The shadow must never run — a failed
    /// primary means there are no bytes in Storage to be a shadow of, and a
    /// second upload attempt would be a delivery, not a measurement.
    @Test
    func primaryFailureNeverReachesTheShadow() async {
        let shadowRuns = TestCounter()

        do {
            _ = try await FieldScanUploadShadowLeg.afterPrimary(
                primary: { () async throws -> Bool in throw PrimaryFailure() },
                shadow: { _ in
                    shadowRuns.bump()
                    return FieldScanUploadShadowLeg.Outcome(
                        uploaded: true, sha256: "x", matched: true
                    )
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
        let result = await FieldScanUploadShadowLeg.afterPrimary(
            primary: { true },
            shadow: { _ in
                FieldScanUploadShadowLeg.Outcome(uploaded: false, sha256: "abc", matched: nil)
            }
        )

        #expect(result.value == true)
        #expect(result.shadow.uploaded == false)
        #expect(result.shadow.matched == nil)
    }

    /// The primary's FALSE (a terminal background-upload failure) survives a
    /// shadow that never ran — the guard in `SupabaseSiteScanService` still sees
    /// exactly the Bool `uploadViaBackground` produced.
    @Test
    func aFailedPrimaryStillReportsFailure() async throws {
        let result = await FieldScanUploadShadowLeg.afterPrimary(
            primary: { false },
            shadow: { didUpload in
                #expect(didUpload == false)
                return .notAttempted
            }
        )
        #expect(result.value == false)
        #expect(result.shadow.wasAttempted == false)
    }

    /// Toggle off: the call reduces to the primary, and the recorded state is
    /// byte-identical to what the primary path produced before this leg existed.
    @Test
    func notAttemptedWritesNothingToArtifactState() async throws {
        let result = await FieldScanUploadShadowLeg.afterPrimary(
            primary: { true },
            shadow: { _ in .notAttempted }
        )
        #expect(result.shadow.wasAttempted == false)

        var state = ScanArtifactUploadState(
            kind: "usdz",
            relativePath: "scan.usdz",
            mimeType: "model/vnd.usdz+zip",
            status: .uploaded
        )
        let before = state
        state.apply(shadow: result.shadow)
        #expect(state == before)
        #expect(state.shadowUploaded == nil)
    }

    /// A skipped shadow must not erase what an earlier run measured.
    @Test
    func notAttemptedPreservesAnEarlierMeasurement() {
        var state = ScanArtifactUploadState(
            kind: "usdz",
            relativePath: "scan.usdz",
            mimeType: "model/vnd.usdz+zip",
            status: .uploaded,
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
        var state = ScanArtifactUploadState(
            kind: "mesh",
            relativePath: "mesh.ply",
            mimeType: "application/octet-stream",
            status: .uploaded
        )
        state.apply(
            shadow: FieldScanUploadShadowLeg.Outcome(uploaded: true, sha256: "abc", matched: true)
        )
        #expect(state.shadowUploaded == true)
        #expect(state.shadowSha256 == "abc")
        #expect(state.shadowMatched == true)
    }

    /// The three shadow fields are additive: a durable record written by an
    /// earlier build has none of them and must still decode.
    @Test
    func artifactStateDecodesWithoutShadowFields() throws {
        let legacy = Data(
            #"{"kind":"usdz","relativePath":"scan.usdz","mimeType":"model/vnd.usdz+zip","status":"uploaded","attempts":1}"#.utf8
        )
        let state = try JSONDecoder().decode(ScanArtifactUploadState.self, from: legacy)
        #expect(state.kind == "usdz")
        #expect(state.shadowUploaded == nil)
        #expect(state.shadowSha256 == nil)
        #expect(state.shadowMatched == nil)
    }

    /// The planner's decisions — the resume set, completion gating, the retry
    /// budget — must be blind to the shadow fields.
    @Test
    func theResumePlannerIgnoresShadowFields() {
        let shadowed = ScanArtifactUploadState(
            kind: "usdz",
            relativePath: "scan.usdz",
            mimeType: "model/vnd.usdz+zip",
            status: .uploaded,
            shadowUploaded: false,
            shadowSha256: "abc",
            shadowMatched: false
        )
        #expect(ScanUploadPlanner.pending([shadowed]).isEmpty)
        #expect(ScanUploadPlanner.allDone([shadowed]))
        #expect(ScanUploadPlanner.kindsToUpload(all: ["usdz"], existing: [shadowed]).isEmpty)
    }
}

// MARK: - Dormancy

@Suite(.serialized)
struct FieldShadowLegDormancyTests {

    private func store(_ name: String) -> UserDefaults {
        UserDefaults(suiteName: "\(name)-\(UUID().uuidString)")!
    }

    @Test
    func liveIsNilWhenTheToggleIsOff() {
        let leg = FieldScanUploadShadowLeg.live(
            defaults: store("shadow-off"),
            edgeAPIURL: URL(string: "https://edge.example.test")!,
            accessToken: { "token" }
        )
        #expect(leg == nil)
    }

    @Test
    func liveIsNilWithoutAnEdgeAPIURL() {
        let defaults = store("shadow-on")
        defaults.set(true, forKey: FieldScanUploadShadowLeg.toggleKey)
        let leg = FieldScanUploadShadowLeg.live(
            defaults: defaults,
            edgeAPIURL: nil,
            accessToken: { "token" }
        )
        #expect(leg == nil)
    }

    @Test
    func liveIsBuiltWhenBothArePresent() {
        let defaults = store("shadow-both")
        defaults.set(true, forKey: FieldScanUploadShadowLeg.toggleKey)
        let leg = FieldScanUploadShadowLeg.live(
            defaults: defaults,
            edgeAPIURL: URL(string: "https://edge.example.test")!,
            accessToken: { "token" }
        )
        #expect(leg != nil)
    }

    /// The committed default. A fresh store has never seen the key, and
    /// `bool(forKey:)` answers false — dormant without anyone setting anything.
    @Test
    func theToggleDefaultsOff() {
        #expect(store("shadow-fresh").bool(forKey: FieldScanUploadShadowLeg.toggleKey) == false)
    }
}

// MARK: - The descriptor table IS the mapping

struct ShadowLegDescriptorContractTests {

    /// Every artifact Field uploads must have a name in the interface's closed
    /// set. This is the drift guard the port rests on: `ScanUploadDescriptor`'s
    /// `kind` strings and `UPLOAD_ARTIFACT_KINDS` in
    /// `infra/edge-api-worker/src/media-uploads.ts` are one vocabulary, so a
    /// kind added to the bundle without being added to the worker's allow-list
    /// fails here rather than at runtime, where it would file real bytes under a
    /// name the registry rejects.
    @Test
    func everyDescriptorKindIsAnInterfaceKind() {
        for descriptor in ScanUploadDescriptor.all {
            #expect(
                FieldScanUploadShadowLeg.uploadKind(for: descriptor) != nil,
                "descriptor kind '\(descriptor.kind)' is not in UPLOAD_ARTIFACT_KINDS"
            )
        }
    }

    /// The 11 the table ships, named so the count cannot drift silently. The
    /// interface's set is larger (16) — it also serves the client app's kinds.
    @Test
    func theShippedElevenAreCoveredIncludingKeyframesArchive() {
        let kinds = Set(ScanUploadDescriptor.all.map(\.kind))
        #expect(kinds.count == 11)
        #expect(kinds.contains("keyframesArchive"))
        #expect(kinds.isSubset(of: Set(
            MediaUploadIntentClient.ArtifactKind.allCases.map(\.rawValue)
        )))
    }

    /// `filename` goes to the interface unshaped, so the table must already
    /// satisfy the worker's `FILENAME_PATTERN`
    /// (`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`).
    @Test
    func everyDescriptorFilenameSatisfiesTheInterfacePattern() {
        let pattern = try? NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        for descriptor in ScanUploadDescriptor.all {
            let range = NSRange(descriptor.filename.startIndex..., in: descriptor.filename)
            #expect(
                pattern?.firstMatch(in: descriptor.filename, range: range) != nil,
                "filename '\(descriptor.filename)' fails FILENAME_PATTERN"
            )
        }
    }

    /// `contentType` goes to the interface unshaped as `declaredMime`, so the
    /// table must already satisfy the worker's `MIME_PATTERN` — lowercase
    /// `type/subtype`. (`UploadStateTests` separately pins the same strings to
    /// the room-scans bucket allow-list; both constraints hold at once.)
    @Test
    func everyDescriptorContentTypeSatisfiesTheInterfacePattern() {
        let pattern = try? NSRegularExpression(
            pattern: "^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$"
        )
        for descriptor in ScanUploadDescriptor.all {
            let mime = descriptor.contentType
            let range = NSRange(mime.startIndex..., in: mime)
            #expect(
                pattern?.firstMatch(in: mime, range: range) != nil,
                "contentType '\(mime)' fails MIME_PATTERN"
            )
        }
    }
}

// MARK: - The leg against the stubbed transport
//
// These join `StubbedEdgeUploadTests` by extension: one global stub queue
// cannot serve two suites running in parallel, and that suite is the
// `.serialized` one.

extension StubbedEdgeUploadTests {

    private func leg(maxBytes: Int = FieldScanUploadShadowLeg.maxShadowBytes)
        -> FieldScanUploadShadowLeg {
        FieldScanUploadShadowLeg(
            client: makeIntentClient(session: stubbedUploadSession()),
            maxBytes: maxBytes
        )
    }

    private var usdzDescriptor: ScanUploadDescriptor {
        ScanUploadDescriptor.all.first { $0.kind == "usdz" }!
    }

    @Test
    func aConfirmedShadowRecordsAMatch() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: fixture.sha))
        ])

        let outcome = await leg().run(
            descriptor: usdzDescriptor,
            fileURL: fixture.url,
            scanId: stubScanId
        )

        #expect(outcome.uploaded == true)
        #expect(outcome.sha256 == fixture.sha)
        #expect(outcome.matched == true)
    }

    /// The whole point of the leg: a confirmed digest that disagrees with what
    /// the device measured is recorded as a non-match, not as a failure.
    @Test
    func aDifferingConfirmedDigestRecordsNoMatch() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: String(repeating: "0", count: 64)))
        ])

        let outcome = await leg().run(
            descriptor: usdzDescriptor,
            fileURL: fixture.url,
            scanId: stubScanId
        )

        #expect(outcome.uploaded == true)
        #expect(outcome.matched == false)
        #expect(outcome.sha256 == fixture.sha)
    }

    /// Every failure becomes an observation. `run` is called from inside the
    /// primary path's success branch, where a throw would be indistinguishable
    /// from a primary failure.
    @Test
    func everyFailureBecomesAnOutcomeAndNeverThrows() async throws {
        let fixture = try makeUploadFixture()
        for status in [400, 401, 404, 409, 500] {
            UploadStubRegistry.shared.reset([
                StubbedResponse(status: status, json: "{}"),
                StubbedResponse(status: status, json: "{}")
            ])
            let outcome = await leg().run(
                descriptor: usdzDescriptor,
                fileURL: fixture.url,
                scanId: stubScanId
            )
            #expect(outcome.uploaded == false)
            #expect(outcome.matched == nil)
            #expect(outcome.sha256 == fixture.sha)
        }
    }

    @Test
    func anArtifactOverTheSizeCapIsNotAttempted() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([])

        let outcome = await leg(maxBytes: 1).run(
            descriptor: usdzDescriptor,
            fileURL: fixture.url,
            scanId: stubScanId
        )

        #expect(outcome.wasAttempted == false)
        #expect(UploadStubRegistry.shared.requests.isEmpty)
    }

    @Test
    func anUnmappedKindIsNotAttempted() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([])

        let unknown = ScanUploadDescriptor(
            relativePath: "future.bin",
            kind: "somethingTheWorkerHasNoNameFor",
            folder: "future",
            filename: "future.bin",
            contentType: "application/octet-stream",
            column: nil
        )
        let outcome = await leg().run(
            descriptor: unknown,
            fileURL: fixture.url,
            scanId: stubScanId
        )

        #expect(outcome.wasAttempted == false)
        #expect(UploadStubRegistry.shared.requests.isEmpty)
    }

    @Test
    func aMissingFileIsNotAttempted() async {
        UploadStubRegistry.shared.reset([])

        let outcome = await leg().run(
            descriptor: usdzDescriptor,
            fileURL: FileManager.default.temporaryDirectory
                .appendingPathComponent("absent-\(UUID().uuidString).bin"),
            scanId: stubScanId
        )

        #expect(outcome.wasAttempted == false)
        #expect(UploadStubRegistry.shared.requests.isEmpty)
    }
}
