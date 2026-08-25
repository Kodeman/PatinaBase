//  CaptureMediaMime.swift
//  CaptureKit
//
//  The one place a capture-media object's Content-Type is decided. It lives
//  beside CaptureMediaPath because the two together are the whole upload wire
//  contract, and because `bucketAllowed` must be kept byte-identical to
//  `allowed_mime_types` on the bucket (migration 00234:22-33) — the drift
//  guard in CaptureMediaMimeTests is what makes that checkable on every gate.
//
//  The switch is LocalCaptureSyncService.mimeType (:656-668) moved verbatim.
//  Note there is deliberately NO "json" case even though the bucket allows
//  application/json: today .json falls to application/octet-stream, nothing
//  uploads a .json to this bucket, and a silent Content-Type change smuggled
//  into a "pure move" is exactly the kind of drift this file exists to stop.

import Foundation

public enum CaptureMediaMime {
    public static func forFilename(_ filename: String) -> String {
        switch (filename as NSString).pathExtension.lowercased() {
        case "heic", "heif": return "image/heic"
        case "jpg", "jpeg":  return "image/jpeg"
        case "png":          return "image/png"
        case "webp":         return "image/webp"
        case "m4a":          return "audio/x-m4a"
        case "mp4":          return "audio/mp4"
        case "aac":          return "audio/aac"
        case "wav":          return "audio/wav"
        default:             return "application/octet-stream"
        }
    }

    /// Mirrors `allowed_mime_types` on the `capture-media` bucket (00234:22-33),
    /// all ten entries, in the bucket's own order. Adding a case above without
    /// adding it here is a Storage 400 in the field.
    public static let bucketAllowed: Set<String> = [
        "image/heic",
        "image/jpeg",
        "image/png",
        "image/webp",
        "audio/mp4",
        "audio/x-m4a",
        "audio/aac",
        "audio/wav",
        "application/json",
        "application/octet-stream"
    ]
}
