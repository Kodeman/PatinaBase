//
//  ArtifactRoutingTests.swift
//  PatinaTests
//
//  Pins the invariant that `ArtifactUploader`'s two mapping functions cannot
//  disagree: a kind either uploads AND records its object key in a
//  `room_scans` column, or it does neither.
//
//  They used to be two independent switches, and their comments contradicted
//  each other about `.depthIndex` / `.photoThumbnails` / `.annotations`:
//  `scanColumn(for:)` said a nil there "causes uploadArtifact(...) to skip the
//  per-column PATCH but still upload the file to storage", while
//  `storagePathComponents(for:)` said those were "v3 sidecars we intentionally
//  do not upload separately".
//
//  Only the second could be true. `uploadArtifact(...)` opens with
//  `guard let (folderPrefix, filename) = Self.storagePathComponents(...)
//  else { return nil }` — a nil there returns before a byte is sent, and the
//  orchestrator in `RoomScanSyncService+AdvancedBundle` marks the artifact
//  `.skipped`. `scanColumn(for:)` is read only inside the `if let url =
//  remoteUrl` branch, i.e. only after an upload already succeeded, so it can
//  neither cause nor suppress one.
//
//  Both now derive from one private `routing(for:)` table. These tests pin the
//  coupling from the outside so a future split re-breaks a test, not prod.
//
//  A third fact has since joined that table, for the same reason: whether a
//  kind may appear in `manifest.artifacts[]`. THE INVARIANT it protects is
//  server-side — *every entry in `artifacts[]` must resolve to an object the
//  worker can fetch*. `scripts/validate_capture_bundle.py` §10.5 (vendored into
//  the scan worker's ingest stage) fetches every listed artifact and names
//  `MISSING_FILE` for each absent one, which turns fatal on the second attempt;
//  a listed artifact with no `sha256` is worse still — `SCHEMA_VIOLATION`,
//  a permanent token, parked on attempt 1.
//
//  Three kinds used to be registered and never uploaded (`.depthIndex`,
//  `.photoThumbnails`), or listed with a hash they could not have
//  (`.bundleManifest`). All three now fail `isManifestListed`, and the tests
//  below pin that no kind can be listed without a route.
//

import Testing
import Foundation
@testable import Patina

struct ArtifactRoutingTests {

    /// The three kinds held back from Storage. Every other kind uploads.
    private static let localOnlySidecars: Set<ScanManifest.ArtifactKind> = [
        .depthIndex, .photoThumbnails, .annotations
    ]

    private func artifact(_ kind: ScanManifest.ArtifactKind) -> ScanManifest.Artifact {
        ScanManifest.Artifact(
            kind: kind,
            relativePath: "photos/some_file.bin",
            sizeBytes: 1,
            mimeType: "application/octet-stream"
        )
    }

    /// THE invariant. A column holds the object key of an uploaded object, so
    /// a column without an upload is a permanently-NULL column and an upload
    /// without a column is an orphan object nothing can find.
    @Test func everyKindEitherUploadsAndHasAColumnOrDoesNeither() {
        for kind in ScanManifest.ArtifactKind.allCases {
            let column = ArtifactUploader.scanColumn(for: kind)
            let storage = ArtifactUploader.storagePathComponents(for: artifact(kind))
            #expect(
                (column == nil) == (storage == nil),
                "\(kind.rawValue): column=\(column ?? "nil") storage=\(storage?.folder ?? "nil")"
            )
        }
    }

    @Test func exactlyTheThreeSidecarsAreHeldBackFromStorage() {
        for kind in ScanManifest.ArtifactKind.allCases {
            let uploads = ArtifactUploader.storagePathComponents(for: artifact(kind)) != nil
            #expect(uploads == !Self.localOnlySidecars.contains(kind), "\(kind.rawValue)")
        }
    }

    /// THE bundle-validity invariant, at the kind level: a kind may be listed
    /// in `manifest.artifacts[]` only if its bytes reach Storage under a key the
    /// worker can derive. Anything else is a promise the bundle cannot keep, and
    /// the server parks the scan for it.
    @Test func nothingIsListableWithoutAStorageRoute() {
        for kind in ScanManifest.ArtifactKind.allCases
        where ArtifactUploader.isManifestListed(kind) {
            #expect(ArtifactUploader.storagePathComponents(for: artifact(kind)) != nil,
                    "\(kind.rawValue) may be listed but is never uploaded")
            #expect(ArtifactUploader.scanColumn(for: kind) != nil, "\(kind.rawValue)")
        }
    }

    /// The exact roster, named. `.bundleManifest` is the asymmetric one — it
    /// uploads (it must: `bundle_manifest_url` is how the worker finds the
    /// bundle at all) but is never listed, because manifest.json IS the list and
    /// no value written into a file can equal that file's own hash. Patina Field
    /// resolves it identically: `FieldManifestAssembler.candidates` has no
    /// manifest.json entry while `ScanUploadDescriptor.all` uploads one.
    @Test func exactlyTheDeviceLocalKindsAndTheManifestAreUnlistable() {
        let unlistable = Set(
            ScanManifest.ArtifactKind.allCases.filter { !ArtifactUploader.isManifestListed($0) }
        )
        #expect(unlistable == Self.localOnlySidecars.union([.bundleManifest]))

        // …and the manifest is the only unlistable kind that still uploads.
        for kind in unlistable {
            let uploads = ArtifactUploader.storagePathComponents(for: artifact(kind)) != nil
            #expect(uploads == (kind == .bundleManifest), "\(kind.rawValue)")
        }
    }

    /// The kinds this branch adds producers for must actually route somewhere,
    /// or the producer writes a file that never leaves the bundle.
    @Test func bundleAndPhotosManifestsRouteToTheirDocumentedColumns() {
        #expect(ArtifactUploader.scanColumn(for: .bundleManifest) == "bundle_manifest_url")
        #expect(ArtifactUploader.scanColumn(for: .photosManifest) == "photos_manifest_url")

        let manifestArtifact = ScanManifest.Artifact(
            kind: .bundleManifest,
            relativePath: "manifest.json",
            sizeBytes: 1,
            mimeType: "application/json"
        )
        #expect(ArtifactUploader.storagePathComponents(for: manifestArtifact)?.folder == "manifests")
        #expect(ArtifactUploader.storagePathComponents(for: manifestArtifact)?.filename == "manifest.json")

        let photosArtifact = ScanManifest.Artifact(
            kind: .photosManifest,
            relativePath: "photos/photos_metadata.ndjson",
            sizeBytes: 1,
            mimeType: "application/x-ndjson"
        )
        let photosRoute = ArtifactUploader.storagePathComponents(for: photosArtifact)
        #expect(photosRoute?.folder == "photos_manifest")
        // Nested relative paths flatten to their last segment — the key is
        // `<folder>/<userId>/<roomId>/<filename>`, and the 00031/00077 Storage
        // policies check segment [2] is the caller's uid. A "photos/…" filename
        // would shift every segment and break RLS.
        #expect(photosRoute?.filename == "photos_metadata.ndjson")
    }

    /// Nested relative paths must never leak a "/" into the filename for any
    /// kind — that would shift `foldername(name)[2]` off the user id.
    @Test func storageFilenameIsAlwaysASingleSegment() {
        for kind in ScanManifest.ArtifactKind.allCases {
            let nested = ScanManifest.Artifact(
                kind: kind,
                relativePath: "depth/nested/file.bin",
                sizeBytes: 1,
                mimeType: "application/octet-stream"
            )
            guard let route = ArtifactUploader.storagePathComponents(for: nested) else { continue }
            #expect(!route.filename.contains("/"), "\(kind.rawValue)")
            #expect(!route.folder.contains("/"), "\(kind.rawValue)")
        }
    }
}
