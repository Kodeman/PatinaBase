//  RoomScanStoragePath.swift
//  CaptureKit
//
//  The ONE place the `room-scans` bucket object key is built, so the upload path
//  can never regress into the wrong segment order or the uppercase-UUID form that
//  trips storage RLS. Mirrors the reference app's convention exactly
//  (Patina/Services/Sync/ArtifactUploader.swift +
//  RoomScanSyncService.uploadUSDZ):
//  `{artifactType}/{userId}/{roomId}/{filename}`.
//
//  Lives in CaptureKit (public) so the app-target site-scan code AND the
//  CaptureTests logic-test bundle (which links CaptureKit only) both reach it —
//  the same wire-contract-in-CaptureKit pattern as `FieldCapturePayload`.
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
//  The `photos/` folder (Room View PHOTOS, I76) rides the SAME key shape, so it
//  needs ZERO policy work: seg[2] = uid ⇒ the 00077 owner INSERT gate passes;
//  seg[3] = roomId ⇒ the 00287 designer-read SELECT policy passes. A posed photo
//  object is `photos/{uid}/{roomId}/{filename}` exactly like usdz/captured_room.
//
//  Unit-test-by-construction — the exact strings this produces (verify by eye
//  against the RLS above; the conductor's integration reset exercises the live policy):
//    object(folder: "usdz",          user: 11111111-1111-1111-1111-111111111111,
//                                     room: 22222222-2222-2222-2222-222222222222,
//                                     filename: "scan.usdz")
//      == "usdz/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/scan.usdz"
//         segments → [1]=usdz  [2]=<userId>  [3]=<roomId>  [4]=scan.usdz
//         ✓ RLS [2]=user, [3]=room
//    object(folder: "photos", user: …AAAA (uppercase in), room: …BBBB, filename: "auto_001.50.jpg")
//      lowercases both UUIDs → "photos/…aaaa/…bbbb/auto_001.50.jpg"

import Foundation

public enum RoomScanStoragePath {
    /// `{folder}/{userId}/{roomId}/{filename}`, with both UUID segments
    /// lowercased to match the canonical text form Postgres compares against.
    /// `folder` is the artifact-type root (`usdz`, `captured_room`, `photos`, …).
    public static func object(
        folder: String,
        userID: UUID,
        roomID: UUID,
        filename: String
    ) -> String {
        "\(folder)/\(userID.uuidString.lowercased())/"
            + "\(roomID.uuidString.lowercased())/\(filename)"
    }

    /// What goes in a `room_scans` artifact URL column for an object at
    /// `path` — the **plain bucket key**, unchanged.
    ///
    /// `room-scans` is a PRIVATE bucket (`public = false`, migration 00031,
    /// never flipped), so the `…/storage/v1/object/public/room-scans/<key>`
    /// URL this code used to store returns `400 Bucket not found` for anyone
    /// who fetches it. Nobody ever did — every consumer in the repo strips the
    /// value straight back to a bucket key and re-signs or reads it with
    /// credentials (`confirm-scan-bundle`, `parse-room-scan`'s
    /// `objectKeyFromUrl`, the worker's `keys.object_key_from_url`, the
    /// portals' `publicUrlToPath`), and all four already accept a bare key
    /// unchanged. So the URL shape was never carrying information; it was
    /// carrying a lie about the bucket.
    ///
    /// Rejected alternatives:
    ///   • `/object/authenticated/room-scans/<key>` — no precedent anywhere in
    ///     this repo, and it bakes the project host into a data column, so a
    ///     project move or a restore into another ref leaves rows pointing at
    ///     the wrong origin. Every consumer would strip it back to the key
    ///     regardless.
    ///   • a signed URL — expires. A column is durable storage; a signature is
    ///     a moment. The house pattern is sign-at-READ-time (see
    ///     `use-room-scans.ts`), which is only possible if the column holds a
    ///     key.
    ///
    /// This matches what the private buckets that came later already do:
    /// `capture-media` (00234) stores `path`, `site-requests` (00374) stores
    /// `object_path`, and 00242 names it "the capture-media pattern".
    public static func storedReference(forObjectPath path: String) -> String { path }

    /// Artifact-type roots. `usdz` + `captured_room` are the v1-minimal scan
    /// artifacts; `photos` is the posed-photo lane (I76). Kept as constants so
    /// the screen/service, uploader, and this file never drift.
    public enum Folder {
        public static let usdz = "usdz"
        public static let capturedRoom = "captured_room"
        public static let photos = "photos"
    }

    /// Bundle filenames the concrete session writes and the uploader reads back.
    /// `photosMetadata` is the posed-photo sidecar (a `[FieldPhotoEntry]` JSON
    /// array) written alongside the `photos/` directory.
    public enum Filename {
        public static let usdz = "scan.usdz"
        public static let capturedRoom = "captured_room.json"
        public static let photosMetadata = "photos_metadata.json"
    }
}
