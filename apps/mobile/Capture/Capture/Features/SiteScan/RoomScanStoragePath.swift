//  RoomScanStoragePath.swift
//  Capture · Wave F (Pro site-scan)
//
//  The ONE place the `room-scans` bucket object key is built, so the upload path
//  can never regress into the wrong segment order or the uppercase-UUID form that
//  trips storage RLS. Mirrors the reference app's convention exactly
//  (Patina/Services/Sync/ArtifactUploader.swift +
//  RoomScanSyncService.uploadUSDZ): `{artifactType}/{userId}/{roomId}/{filename}`.
//
//  Why each rule matters (migration 00077_advanced_room_scan.sql):
//    • INSERT/SELECT RLS gates on `auth.uid()::text = (storage.foldername(name))[2]`
//      → the USER id MUST be the SECOND segment (index 2, Postgres 1-based).
//    • the designer-share SELECT policy gates on
//      `rs.room_id::text = (storage.foldername(name))[3]`
//      → the parent `room_scans.room_id` MUST be the THIRD segment.
//    • Postgres renders `auth.uid()::text` / `id::text` in canonical LOWERCASE;
//      Foundation's `UUID.uuidString` is UPPERCASE, so every segment is lowercased
//      (the same bug `CaptureKit/Sync/CaptureMediaPath.swift` guards for capture-media).
//
//  Unit-test-by-construction — the exact strings this produces (verify by eye
//  against the RLS above; the conductor's integration reset exercises the live policy):
//    object(folder: "usdz",          user: 11111111-1111-1111-1111-111111111111,
//                                     room: 22222222-2222-2222-2222-222222222222,
//                                     filename: "scan.usdz")
//      == "usdz/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/scan.usdz"
//         segments → [1]=usdz  [2]=<userId>  [3]=<roomId>  [4]=scan.usdz   ✓ RLS [2]=user, [3]=room
//    object(folder: "captured_room", user: …AAAA (uppercase in), room: …BBBB, filename: "captured_room.json")
//      lowercases both UUIDs → "captured_room/…aaaa/…bbbb/captured_room.json"

import Foundation

enum RoomScanStoragePath {
    /// `{folder}/{userId}/{roomId}/{filename}`, both UUID segments lowercased to
    /// match the canonical text form Postgres's storage RLS compares against.
    /// `folder` is the artifact-type root (`usdz`, `captured_room`, …).
    static func object(folder: String, userID: UUID, roomID: UUID, filename: String) -> String {
        "\(folder)/\(userID.uuidString.lowercased())/\(roomID.uuidString.lowercased())/\(filename)"
    }

    /// Artifact-type roots for the v1-minimal pipeline (USDZ + CapturedRoom JSON).
    /// Kept as constants so the screen/service and this file never drift.
    enum Folder {
        static let usdz = "usdz"
        static let capturedRoom = "captured_room"
    }

    /// Bundle filenames the concrete session writes and the uploader reads back.
    enum Filename {
        static let usdz = "scan.usdz"
        static let capturedRoom = "captured_room.json"
    }
}
