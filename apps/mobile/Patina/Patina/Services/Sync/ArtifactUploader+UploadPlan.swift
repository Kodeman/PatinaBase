//
//  ArtifactUploader+UploadPlan.swift
//  Patina
//
//  What the uploader must PUT for one sealed bundle — which is NOT the same
//  set as what the manifest lists.
//
//  `manifest.artifacts[]` is a promise to the server: the scan worker fetches
//  every entry and parks the scan on any it cannot find (`MISSING_FILE`,
//  fatal on the 2nd attempt) or that carries no 64-hex `sha256`
//  (`SCHEMA_VIOLATION` — permanent, parked on attempt 1). So the list may name
//  only what will be in Storage.
//
//  The reverse does not hold, and manifest.json is the sole reason: it must be
//  uploaded (`room_scans.bundle_manifest_url` is how the worker finds the
//  bundle at all) but cannot be listed, because a list cannot contain itself
//  and no value written into a file can equal that file's own hash. Patina
//  Field draws the same line — `FieldManifestAssembler.candidates` omits
//  manifest.json while `ScanUploadDescriptor.all` uploads it.
//
//  Hence: the PLAN, not the list, drives the upload loop.
//

import Foundation
import CryptoKit

extension ArtifactUploader {

    /// Everything that must be PUT to Storage for this bundle: every artifact
    /// the manifest lists, plus `manifest.json` itself.
    ///
    /// The plan is a strict SUPERSET of `manifest.artifacts` — that asymmetry
    /// is the whole design. The list may only name what will be there
    /// (`isManifestListed`), while the upload may carry more than the list
    /// names; the manifest is exactly the one thing in the second set and not
    /// the first. Driving the upload loop from this rather than from
    /// `manifest.artifacts` is what keeps `room_scans.bundle_manifest_url`
    /// getting patched now that the self-entry is gone: the loop's generic
    /// `scanColumn(for:)` PATCH sees `.bundleManifest` exactly as before.
    ///
    /// The manifest entry's `sha256` is REAL here, and could never have been
    /// real inside the file: measured at upload time, when manifest.json is
    /// final. It is what `uploadArtifact` stamps onto the Storage object's
    /// metadata and merges into `room_scans.artifacts_sha256`. The worker's
    /// `reconcile_artifacts_sha256` only compares kinds the manifest lists, so
    /// the extra ledger row is inert there.
    ///
    /// Entries the manifest lists but that cannot be uploaded are dropped
    /// rather than carried: a bundle SEALED BY AN EARLIER BUILD still lists
    /// `.depthIndex`, `.photoThumbnails` and a hash-less `.bundleManifest` on
    /// disk, and those would otherwise seed dead upload states and a duplicate
    /// `.bundleManifest`. Dropping them changes nothing about what reaches
    /// Storage — they never did — it just keeps the plan a set of real objects.
    /// (It does NOT repair such a bundle: its manifest.json bytes still name
    /// them, so ingest still fails until the bundle is re-sealed.)
    ///
    /// Falls back to the listable subset if manifest.json is unreadable — a
    /// bundle with no manifest on disk is already failing elsewhere, and a
    /// fabricated entry would be worse than an absent one.
    nonisolated static func uploadPlan(
        for manifest: ScanManifest,
        in bundleURL: URL
    ) -> [ScanManifest.Artifact] {
        let listed = manifest.artifacts.filter { isManifestListed($0.kind) }
        guard let manifestArtifact = manifestArtifact(in: bundleURL) else {
            return listed
        }
        return listed + [manifestArtifact]
    }

    /// Describe `manifest.json` as it is on disk right now: true size, true
    /// sha256. Nil when the file is missing or unreadable.
    nonisolated static func manifestArtifact(in bundleURL: URL) -> ScanManifest.Artifact? {
        let url = bundleURL.appendingPathComponent("manifest.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        let digest = SHA256.hash(data: data)
        return ScanManifest.Artifact(
            kind: .bundleManifest,
            relativePath: "manifest.json",
            sizeBytes: data.count,
            sha256: digest.map { String(format: "%02x", $0) }.joined(),
            mimeType: "application/json"
        )
    }
}
