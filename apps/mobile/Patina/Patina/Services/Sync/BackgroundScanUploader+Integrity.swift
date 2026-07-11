//
//  BackgroundScanUploader+Integrity.swift
//  Patina
//
//  Pure, side-effect-free helpers for the >=5 MB background scan-upload
//  integrity path: the custom-metadata wire format, the object-info sha
//  parser, and the verification decision. Split out of the uploader so each
//  is trivially unit-testable (see `BackgroundScanUploaderTests`) and the
//  uploader file stays within length limits. All `nonisolated static` so they
//  are callable off the main actor from tests.
//

import Foundation

extension BackgroundScanUploader {

    // MARK: - Metadata wire format

    /// Encode custom object metadata into the base64(JSON) form Supabase
    /// Storage persists into `user_metadata` via the `x-metadata` request
    /// header. Keys are sorted so the encoding is deterministic (pinned by a
    /// unit test — guards against JSON/base64 drift if the SDK changes).
    ///
    /// This is the raw-body equivalent of the multipart `metadata` field
    /// supabase-swift sends for `FileOptions(metadata:)`; both round-trip to
    /// the same `user_metadata` object server-side (verified locally against
    /// Storage: an `x-amz-meta-*` request header lands `user_metadata = {}`,
    /// while this header and the multipart field both land `{"sha256":…}`).
    nonisolated static func encodeMetadataHeader(_ metadata: [String: String]) -> String? {
        guard !metadata.isEmpty else { return nil }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let json = try? encoder.encode(metadata) else { return nil }
        return json.base64EncodedString()
    }

    // MARK: - Verification decision

    /// Outcome of the post-upload sha256 integrity check.
    enum VerificationOutcome: Equatable {
        /// Bytes are trusted — either verified equal, or unverifiable so we
        /// defer to the 2xx we already got.
        case accept
        /// Storage returned a sha that differs from ours — real corruption.
        case fail
    }

    /// Pure decision for the integrity check. Robust to Storage changing its
    /// metadata behaviour: only a *present and differing* stored sha fails.
    ///
    ///   - `expected == nil`  → nothing to verify → accept
    ///   - `stored   == nil`  → unverifiable (Storage surfaced no sha) → accept
    ///   - equal              → verified → accept
    ///   - present & differ   → corruption → fail (retry)
    nonisolated static func verificationOutcome(expected: String?, stored: String?) -> VerificationOutcome {
        guard let expected, !expected.isEmpty else { return .accept }
        guard let stored, !stored.isEmpty else { return .accept }
        return stored == expected ? .accept : .fail
    }

    /// Parse the stored sha256 out of the `/object/info/authenticated` JSON
    /// body. Storage surfaces custom object metadata under the top-level
    /// `metadata` key (verified locally); `user_metadata` is accepted as a
    /// fallback in case a deployment surfaces it under that name instead.
    nonisolated static func parseStoredSha(from body: Data) -> String? {
        guard
            let root = try? JSONSerialization.jsonObject(with: body),
            let obj = root as? [String: Any]
        else { return nil }
        for key in ["metadata", "user_metadata"] {
            if let bag = obj[key] as? [String: Any],
               let sha = bag["sha256"] as? String,
               !sha.isEmpty {
                return sha
            }
        }
        return nil
    }
}
