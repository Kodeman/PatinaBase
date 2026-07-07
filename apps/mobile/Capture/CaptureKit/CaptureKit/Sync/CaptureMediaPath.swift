//  CaptureMediaPath.swift
//  CaptureKit
//
//  The `capture-media` bucket's storage RLS (migration 00234) gates every
//  object policy on `auth.uid()::text = (storage.foldername(name))[1]` —
//  Postgres renders `auth.uid()::text` in its canonical LOWERCASE form.
//  Foundation's `UUID.uuidString` renders UPPERCASE, so building the upload
//  path directly from `uuidString` throws "new row violates row-level
//  security policy" on every real upload. (The existing app hit the same bug
//  in its `room-scans` bucket path — see
//  Patina/Patina/Services/Sync/ArtifactUploader.swift.) This is the one place
//  the `<uid>/<clientToken>` folder string is built, so upload paths can never
//  regress into the uppercase form again.

import Foundation

public enum CaptureMediaPath {
    /// `<uid>/<clientToken>`, both segments lowercased to match Postgres's
    /// canonical UUID text rendering that the RLS policy compares against.
    /// Callers append `/<filename>` for the final object key.
    public static func folder(userID: UUID, clientToken: UUID) -> String {
        "\(userID.uuidString.lowercased())/\(clientToken.uuidString.lowercased())"
    }
}
