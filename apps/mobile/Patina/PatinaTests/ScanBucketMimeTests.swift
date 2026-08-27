//
//  ScanBucketMimeTests.swift
//  PatinaTests
//
//  Drift guard for the room-scans bucket MIME contract.
//
//  The defect this pins was found on a real device, not in review: a design
//  request failed with "mime type application/x-ndjson is not supported",
//  which stopped the scan before mark_scan_upload_complete and therefore kept
//  it out of the pipeline entirely. These tests fail if any artifact a producer
//  can register would go up with a Content-Type the bucket rejects.
//

import Foundation
import Testing
@testable import Patina

@Suite("Scan bucket MIME transport contract")
struct ScanBucketMimeTests {

    /// THE test. Every kind that has a storage route must produce a
    /// bucket-legal transport type from the semantic type its producer writes.
    /// This is the assertion that would have caught the device failure.
    @Test("every uploadable artifact kind transports as a bucket-legal type")
    func everyUploadableKindIsBucketLegal() {
        // The semantic types Patina's producers actually write, by kind.
        let semanticByKind: [ScanManifest.ArtifactKind: String] = [
            .usdz: "model/vnd.usdz+zip",
            .capturedRoomJson: "application/json",
            .worldMap: "application/octet-stream",
            .mesh: "model/ply",
            .depthArchive: "application/zip",
            .heroThumbnail: "image/heic",
            .bundleArchive: "application/zip",
            .coverageHeatmap: "application/json",
            .depthIndex: "application/x-ndjson",
            .photoThumbnails: "application/x-ndjson",
            .annotations: "application/json",
            .bundleManifest: "application/json",
            .photosManifest: "application/x-ndjson",
            // Dense-frame keyframe lane — the types RoomCaptureBundleAdapter
            // actually registers (`:276`, `:281`, `:293`).
            .keyframesArchive: "application/x-tar",
            .keyframeIndex: "application/x-ndjson",
            .keyframeSummary: "application/json"
        ]

        // Every kind is covered — so a new case cannot slip past this test.
        #expect(
            Set(semanticByKind.keys) == Set(ScanManifest.ArtifactKind.allCases),
            "a new ArtifactKind was added without declaring its semantic MIME here"
        )

        for kind in ScanManifest.ArtifactKind.allCases {
            let semantic = semanticByKind[kind]!
            let transport = ScanBucketMime.transportContentType(for: semantic)
            #expect(
                ScanBucketMime.allowed.contains(transport),
                "\(kind.rawValue) would upload as \(transport), which the bucket rejects"
            )
        }
    }

    /// The exact value from the device failure.
    @Test("the ndjson type that failed on device now transports legally")
    func theNdjsonTypeThatFailedOnDeviceIsRemapped() {
        let transport = ScanBucketMime.transportContentType(for: "application/x-ndjson")
        #expect(transport == "application/octet-stream")
        #expect(!ScanBucketMime.allowed.contains("application/x-ndjson"),
                "if the bucket ever allows ndjson, delete the remap rather than keeping a lie")
    }

    /// Allowed types must pass through untouched — the remap must not flatten
    /// everything to octet-stream, which would lose real type information on
    /// images and models.
    @Test("allowed types pass through unchanged")
    func allowedTypesPassThrough() {
        for allowed in ScanBucketMime.allowed {
            #expect(ScanBucketMime.transportContentType(for: allowed) == allowed)
        }
    }

    /// An unknown future type degrades to a legal one rather than failing a
    /// user's upload.
    @Test("an unknown semantic type falls back to octet-stream")
    func unknownTypeFallsBack() {
        #expect(ScanBucketMime.transportContentType(for: "application/x-invented") == "application/octet-stream")
    }

    /// The semantic type stays in the manifest — the split is only at transport.
    /// If this ever stops holding, the pipeline's parser loses the ability to
    /// tell an NDJSON index from an opaque blob.
    @Test("the manifest keeps the semantic type, not the transport type")
    func manifestKeepsSemanticType() {
        let artifact = ScanManifest.Artifact(
            kind: .photosManifest,
            relativePath: "photos/photos_metadata.ndjson",
            sizeBytes: 42,
            sha256: String(repeating: "a", count: 64),
            mimeType: "application/x-ndjson"
        )
        #expect(artifact.mimeType == "application/x-ndjson")
        #expect(ScanBucketMime.transportContentType(for: artifact.mimeType) == "application/octet-stream")
    }

    /// The tests above prove the MAPPING is right. This one proves the uploader
    /// actually USES it — without which every assertion above is decorative and
    /// the device failure would recur unnoticed.
    ///
    /// Source-level because both upload paths need a live Supabase client and a
    /// network to exercise. Same technique as `InstrumentIsolationTests`, and it
    /// becomes unnecessary the day these paths get a seam that can be faked.
    @Test("both upload paths send the transport type, never the raw semantic one")
    func theUploaderActuallyUsesTheTransportType() throws {
        let uploader = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()          // PatinaTests
            .deletingLastPathComponent()          // Patina (project dir)
            .appendingPathComponent("Patina/Services/Sync/ArtifactUploader.swift")
        let source = try String(contentsOf: uploader, encoding: .utf8)

        // Guard against the file moving out from under this test.
        #expect(source.contains("func uploadArtifactViaBackground"),
                "ArtifactUploader.swift not found at the expected path — fix this test's path")

        let stripped = source.split(separator: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        // The two live call sites must both route through the remap...
        let remapUses = stripped.components(separatedBy: "ScanBucketMime.transportContentType").count - 1
        #expect(remapUses >= 2,
                "expected both the foreground and background upload paths to remap; found \(remapUses)")

        // ...and the raw semantic type must never reach a Content-Type again.
        #expect(!stripped.contains("contentType: artifact.mimeType"),
                "the foreground PUT is sending the semantic type straight to Storage again")
        #expect(!stripped.contains("mimeType: artifact.mimeType"),
                "the background descriptor is sending the semantic type straight to Storage again")
    }
}
