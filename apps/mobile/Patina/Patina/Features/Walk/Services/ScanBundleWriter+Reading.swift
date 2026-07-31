//
//  ScanBundleWriter+Reading.swift
//  Patina
//
//  Reading an EXISTING bundle off disk, without opening a writer for it.
//
//  Split out of `ScanBundleWriter.swift` when that file reached SwiftLint's
//  500-line gate. The cut is along a real seam rather than at a convenient line
//  number: both members are `static`, neither touches the writer's private
//  `manifest` or its persistence, and the caller is `RoomScanSyncService`
//  asking "what is left to upload?" — a reader of a finished bundle, not a
//  producer of one. Opening a `ScanBundleWriter` to answer that would be
//  actively wrong: `init` WRITES a fresh manifest over whatever is there.
//

import Foundation

extension ScanBundleWriter {

    /// Load a manifest without opening the writer (read-only). Used by the
    /// sync service to decide what's left to upload.
    ///
    /// `.iso8601` matches `writeManifest()`'s encoding strategy. The instrument
    /// layer's own timestamps are Strings and are unaffected by it either way —
    /// see the type note on `ScanManifest`.
    public static func readManifest(at bundleURL: URL) throws -> ScanManifest {
        let manifestURL = bundleURL.appendingPathComponent("manifest.json")
        let data = try Data(contentsOf: manifestURL)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(ScanManifest.self, from: data)
    }

    /// Bytes for an artifact referenced by the manifest.
    public static func readArtifactData(
        _ artifact: ScanManifest.Artifact,
        in bundleURL: URL
    ) throws -> Data {
        let url = bundleURL.appendingPathComponent(artifact.relativePath)
        return try Data(contentsOf: url)
    }
}
