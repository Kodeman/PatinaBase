//  TarArchive.swift
//  Patina
//
//  PORTED VERBATIM from Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/TarArchive.swift
//
//  Deterministic, streaming uncompressed ustar archiver. The client's dense-frame
//  keyframe lane (Rendered Room v2) archives `keyframes/*.heic` into a single
//  `keyframes.tar` at freeze — the ONE object the scan-pipeline worker untars
//  (`services/scan-pipeline/.../untar.py`) to recover the dense RGB stream the
//  splat trains on. Standard ustar so the server untars with off-the-shelf tools.
//
//  DETERMINISTIC (so archive assembly is testable): entries are written in
//  lexicographic name order with mtime = 0, mode 0644, uid/gid 0 — identical inputs
//  → byte-identical output. STREAMING: each source file is read in 1 MiB chunks and
//  written straight to the destination handle, never loaded whole.
//
//  The member name is `<directory>/<filename>` (see `bundleEntries`): the keyframe
//  index records `heicPath` as `keyframes/<file>` and the worker resolves each tar
//  member by exactly that string, so a flat member name would make the archive
//  contradict its own index and no bundle would be consumable.

import Foundation

enum TarArchive {

    struct Entry: Sendable {
        let name: String   // archive member name (<= 100 bytes)
        let url: URL       // source file
        init(name: String, url: URL) { self.name = name; self.url = url }
    }

    private static let blockSize = 512
    private static let chunkSize = 1 << 20

    /// Entries for a transport archive of `directory`, named the way the bundle's
    /// own indexes name those files: `<directory>/<filename>`.
    static func bundleEntries(directory: String, files: [URL]) -> [Entry] {
        files.map { Entry(name: "\(directory)/\($0.lastPathComponent)", url: $0) }
    }

    /// Write a deterministic ustar of `entries` to `destination`. Skips entries whose
    /// source file is missing. Throws on IO failure. Returns the number of members.
    @discardableResult
    static func write(entries: [Entry], to destination: URL) throws -> Int {
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
