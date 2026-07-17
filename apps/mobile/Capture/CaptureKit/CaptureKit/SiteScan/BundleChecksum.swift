//  BundleChecksum.swift
//  CaptureKit
//
//  Streaming SHA-256 for bundle artifacts (Field Capture P1 · item 8). Chunked file
//  read — never loads a whole (up-to-600 MB) artifact into memory — used by the
//  manifest assembler (per-artifact `sha256`) and the resumable uploader (the
//  `x-metadata` integrity header). Lowercase 64-hex, matching `room_scans.artifacts_sha256`
//  and the validator's reference implementation (spec §7).

import Foundation
import CryptoKit

public enum BundleChecksum {

    /// Lowercase 64-hex SHA-256 of a file, read in `chunkSize` chunks. nil if the
    /// file can't be opened.
    public static func sha256(ofFile url: URL, chunkSize: Int = 1 << 20) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            let chunk = (try? handle.read(upToCount: chunkSize)) ?? nil
            guard let chunk, !chunk.isEmpty else { break }
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// SHA-256 of an in-memory blob (small artifacts / tests).
    public static func sha256(of data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
