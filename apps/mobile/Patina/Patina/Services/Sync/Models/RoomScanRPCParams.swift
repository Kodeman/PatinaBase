//
//  RoomScanRPCParams.swift
//  Patina
//
//  Parameter structs for the Supabase RPCs + edge-function bodies used by
//  the room-scan sync pipeline. Extracted from RoomScanSyncService.swift
//  (PT-6-1) without behavior change.
//
//  Each is `nonisolated` + `Sendable` so it can be passed through
//  `rpc(_:params:)` from a TaskGroup closure without tripping the
//  project-wide default `-default-isolation=MainActor` setting. They were
//  previously `private` inside the service; they are now module-internal so
//  the extracted uploader/queue collaborators can construct them.
//

import Foundation

/// Parameters for the `merge_scan_artifact_sha256(p_scan_id, p_kind, p_sha)`
/// Supabase RPC introduced in migration 00082. The three keys map 1:1 to
/// the function's argument names.
nonisolated struct ArtifactShaMergeParams: Encodable, Sendable {
    let p_scan_id: String
    let p_kind: String
    let p_sha: String
}

/// Parameters for the `mark_scan_upload_complete(p_scan_id)` RPC.
nonisolated struct MarkUploadCompleteParams: Encodable, Sendable {
    let p_scan_id: String
}

/// Reusable single-arg RPC parameter struct.
nonisolated struct ScanIdOnlyParams: Encodable, Sendable {
    let p_scan_id: String
}

/// Body for the `confirm-scan-bundle` edge function (Wave 5.1). The function
/// ingests the scan id and runs server-side validation of the uploaded
/// bundle (hash matching, row presence, etc.).
nonisolated struct ConfirmScanBundleRequest: Encodable, Sendable {
    let scan_id: String
}
