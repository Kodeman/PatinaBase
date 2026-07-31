//
//  ScanBucketMime.swift
//  Patina
//
//  The `room-scans` bucket MIME allow-list, and the TRANSPORT vs SEMANTIC
//  Content-Type split that keeps every upload bucket-legal.
//
//  WHY THIS EXISTS (measured, not theoretical). On 2026-07-30 a real design
//  request from the client app failed on device with:
//
//      Upload failed: artifacts incomplete: photosManifest(failed):
//      mime type application/x-ndjson is not supported
//
//  `ArtifactUploader` passed `artifact.mimeType` straight through as the Storage
//  Content-Type, and `application/x-ndjson` is not in the bucket's allow-list.
//  Supabase Storage rejects the PUT with 400 invalid_mime_type, the artifact goes
//  `.failed`, `allArtifactsDone` stays false, and the scan throws BEFORE
//  `mark_scan_upload_complete` — so `room_scans` never reaches `ready`, the 00370
//  trigger never fires, and the scan never reaches the pipeline at all.
//
//  Patina Field hit this exact defect on its M2 walk (depthIndex, same MIME) and
//  fixed it under spec §11 B-17. This is the same fix, deliberately mirroring
//  `CaptureKit/SiteScan/ScanUploadDescriptor.swift` so both apps agree:
//
//    • TRANSPORT Content-Type — what we send to Storage. MUST be in `allowed`.
//    • SEMANTIC mimeType — what the file IS. Stays in the manifest's
//      `artifacts[].mimeType` for the pipeline's parser.
//
//  The two are decoupled on purpose: the bundle validator never compares
//  `mimeType` against the transport type, so a file can ride as octet-stream and
//  still declare itself NDJSON to the consumer that parses it.
//

import Foundation

enum ScanBucketMime {

    /// The `room-scans` bucket allow-list. Mirrors Field's `ScanBucketMime.allowed`
    /// (`CaptureKit/SiteScan/ScanUploadDescriptor.swift`). If the bucket policy is
    /// ever widened, both copies move together — and `ScanBucketMimeTests` is the
    /// drift guard that fails when an upload type escapes this set.
    static let allowed: Set<String> = [
        "model/vnd.usdz+zip",
        "model/gltf+json",
        "model/gltf-binary",
        "model/ply",
        "application/octet-stream",
        "application/json",
        "application/zip",
        "image/heic",
        "image/jpeg",
        "image/png",
        "image/x-exr"
    ]

    /// The bucket-legal Content-Type to PUT an artifact with, given the semantic
    /// type the manifest declares.
    ///
    /// Anything already in the allow-list passes through unchanged. Anything else
    /// — today `application/x-ndjson`, tomorrow whatever a new producer invents —
    /// falls back to `application/octet-stream`, which is always legal and is what
    /// Field uses for both of its NDJSON indexes and both of its tars.
    ///
    /// The fallback is deliberately a default rather than an explicit per-type map:
    /// a new producer with an unlisted semantic type should upload successfully and
    /// be caught by the drift test, not fail on a real user's scan.
    static func transportContentType(for semanticType: String) -> String {
        allowed.contains(semanticType) ? semanticType : "application/octet-stream"
    }
}
