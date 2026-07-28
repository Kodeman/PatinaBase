//  TarArchive.swift
//  CaptureKit
//
//  Deterministic, streaming uncompressed ustar archiver (Field Capture P1 · item 8,
//  Part 3 resilience). The heavy per-file streams — depth `.bin`s (hundreds) and
//  keyframe `.heic`+`.bin`s (hundreds) — are archived per-stream so a 500 MB bundle
//  uploads as a HANDFUL of background tasks instead of ~700, and a background
//  URLSession requires `fromFile:` bodies anyway. Standard ustar so the server (item
//  9) untars with off-the-shelf tools.
//
//  DETERMINISTIC (so archive assembly is testable): entries are written in
//  lexicographic name order with mtime = 0, mode 0644, uid/gid 0 — identical inputs
//  → byte-identical output. STREAMING: each source file is read in 1 MiB chunks and
//  written straight to the destination handle, never loaded whole (the 500 MB case).
//
//  BLESSABLE (logged): uncompressed ustar (the inner artifacts — HEIC, packed depth
//  — are already compact; a second compression layer buys little and complicates
//  resumable range transfer, matching spec B-4's "no whole-bundle compression").

import Foundation

public enum TarArchive {

    public struct Entry: Sendable {
        public let name: String   // archive member name (<= 100 bytes)
        public let url: URL       // source file
        public init(name: String, url: URL) { self.name = name; self.url = url }
    }

    private static let blockSize = 512
    private static let chunkSize = 1 << 20

    /// Entries for a transport archive of `directory`, named the way the bundle's
    /// own indexes name those files: `<directory>/<filename>`.
    ///
    /// A named function rather than a closure at the call site because the
    /// bare-filename version of it shipped. `keyframe_index.ndjson` records
    /// `heicPath` as `keyframes/<file>` and the scan-pipeline worker resolves each
    /// member by exactly that string, so flat members made the archive contradict
    /// its own index and no bundle this app produced was consumable. Naming the
    /// rule gives it somewhere to be tested (R120).
    public static func bundleEntries(directory: String, files: [URL]) -> [Entry] {
        files.map { Entry(name: "\(directory)/\($0.lastPathComponent)", url: $0) }
    }

    /// Write a deterministic ustar of `entries` to `destination`. Skips entries whose
    /// source file is missing. Throws on IO failure. Returns the number of members.
    @discardableResult
    public static func write(entries: [Entry], to destination: URL) throws -> Int {
        let present = entries
            .filter { FileManager.default.fileExists(atPath: $0.url.path) }
            .sorted { $0.name < $1.name }

        FileManager.default.createFile(atPath: destination.path, contents: nil)
        guard let out = try? FileHandle(forWritingTo: destination) else {
            throw CocoaError(.fileWriteUnknown)
        }
        defer { try? out.close() }

        for entry in present {
            let size = (try FileManager.default.attributesOfItem(atPath: entry.url.path)[.size] as? Int) ?? 0
            out.write(header(name: entry.name, size: size))
            guard let input = try? FileHandle(forReadingFrom: entry.url) else { continue }
            while let chunk = try? input.read(upToCount: chunkSize), !chunk.isEmpty {
                out.write(chunk)
            }
            try? input.close()
            let remainder = size % blockSize
            if remainder != 0 { out.write(Data(count: blockSize - remainder)) }
        }
        // Two zero blocks terminate the archive.
        out.write(Data(count: blockSize * 2))
        return present.count
    }

    /// Build a 512-byte ustar header with a correct checksum.
    private static func header(name: String, size: Int) -> Data {
        var block = [UInt8](repeating: 0, count: blockSize)

        func put(_ s: String, at offset: Int, width: Int) {
            for (i, byte) in Array(s.utf8).prefix(width).enumerated() { block[offset + i] = byte }
        }
        // Octal field: `width-1` octal digits + NUL.
        func putOctal(_ value: Int, at offset: Int, width: Int) {
            put(String(format: "%0\(width - 1)o", value), at: offset, width: width - 1)
            block[offset + width - 1] = 0
        }

        put(String(name.prefix(100)), at: 0, width: 100)   // name
        putOctal(0o000644, at: 100, width: 8)              // mode
        putOctal(0, at: 108, width: 8)                     // uid
        putOctal(0, at: 116, width: 8)                     // gid
        putOctal(size, at: 124, width: 12)                 // size
        putOctal(0, at: 136, width: 12)                    // mtime (0 → deterministic)
        block[156] = UInt8(ascii: "0")                     // typeflag = regular file
        put("ustar", at: 257, width: 6)                    // magic "ustar\0"
        put("00", at: 263, width: 2)                       // version

        // checksum: sum with the checksum field (148..<156) treated as spaces.
        for i in 148..<156 { block[i] = UInt8(ascii: " ") }
        let sum = block.reduce(0) { $0 + Int($1) }
        put(String(format: "%06o", sum), at: 148, width: 6)
        block[154] = 0                                     // NUL
        block[155] = UInt8(ascii: " ")                     // space

        return Data(block)
    }
}
