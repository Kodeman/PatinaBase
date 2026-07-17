//  ManifestTests.swift
//  CaptureTests
//
//  Bundle-assembly contracts (Field Capture P1 · item 8): streaming SHA-256
//  correctness and deterministic manifest assembly against a synthetic bundle dir.

import Foundation
import Testing
@testable import CaptureKit

struct ManifestTests {

    private func tempDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func sampleInputs(anchors: [AnchorRecord]) -> FieldManifestAssembler.Inputs {
        FieldManifestAssembler.Inputs(
            scanId: "scan-1", roomName: "Room", createdAt: "2026-07-17T00:00:00Z",
            completedAt: "2026-07-17T00:10:00Z", anchors: anchors,
            scorecard: Scorecard(coveragePct: 90, sharpFrameRatio: 0.8, trackingHealth: .good,
                                 anchorCount: anchors.count, verdict: .green,
                                 surfaceChecklist: [], namedGaps: []),
            device: .init(model: "iPhone", osVersion: "26.5", hasLidar: true, roomPlanVersion: "1.0"),
            capture: .init(highFidelityDepthEnabled: true, autoPhotoInterval: 2.0),
            session: .init(sessionId: "sess-1", appVersion: "1.0", appBuild: "1",
                           startedAt: "2026-07-17T00:00:00Z", endedAt: "2026-07-17T00:10:00Z",
                           captureDurationSeconds: 600, arWorldTrackingConfig: "shared-roomcapture",
                           thermalPeak: "nominal"),
            poseGraphSummary: .init(keyframeCount: 300, nodeCount: 300, edgeCount: 0, loopClosures: 0,
                                    meanTranslationDriftPct: 0.3, blurRejectedCount: 20,
                                    rawBlurFailures: 45, encodeDropped: 1),
            captureEnvironment: .init(sceneDepthFrameCount: 600, coverageHeatmapPresent: false),
            annotations: .init(), photos: [])
    }

    // MARK: - Streaming SHA-256

    @Test func sha256StreamingMatchesInMemoryAndKnownVector() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }

        let blob = Data((0..<5000).map { UInt8($0 % 251) })
        let file = dir.appendingPathComponent("blob.bin")
        try blob.write(to: file)
        #expect(BundleChecksum.sha256(ofFile: file) == BundleChecksum.sha256(of: blob))

        let empty = dir.appendingPathComponent("empty")
        try Data().write(to: empty)
        #expect(BundleChecksum.sha256(ofFile: empty)
                == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    }

    // MARK: - Manifest assembly

    @Test func assemblesManifestWithChecksumsAndUnverified() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }

        let usdz = Data("USDZ-BYTES".utf8)
        try usdz.write(to: dir.appendingPathComponent("scan.usdz"))
        try Data("{}".utf8).write(to: dir.appendingPathComponent("captured_room.json"))
        try Data("ply".utf8).write(to: dir.appendingPathComponent("mesh.ply"))

        let manifest = try FieldManifestAssembler.assemble(bundleDir: dir, inputs: sampleInputs(anchors: []))

        #expect(manifest.schemaVersion == 3)
        #expect(manifest.bundleSpecVersion == 1)
        #expect(manifest.checksumAlgorithm == "sha256")
        #expect(manifest.unverified == true)          // 0 anchors < 3

        let kinds = Set(manifest.artifacts.map(\.kind))
        #expect(kinds.isSuperset(of: ["usdz", "capturedRoomJson", "mesh"]))
        let usdzArtifact = try #require(manifest.artifacts.first { $0.kind == "usdz" })
        #expect(usdzArtifact.relativePath == "scan.usdz")
        #expect(usdzArtifact.sizeBytes == usdz.count)
        #expect(usdzArtifact.sha256 == BundleChecksum.sha256(of: usdz))
        #expect(FileManager.default.fileExists(atPath: dir.appendingPathComponent("manifest.json").path))
    }

    @Test func verifiedWhenThreeAnchors() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        try Data("u".utf8).write(to: dir.appendingPathComponent("scan.usdz"))
        try Data("{}".utf8).write(to: dir.appendingPathComponent("captured_room.json"))

        let anchor = AnchorRecord(id: "a", index: 0, label: "l", spanKind: .span, entryMethod: .typed,
                                  endpointA: .init(x: 0, y: 0, z: 0), endpointB: .init(x: 1, y: 0, z: 0),
                                  modelSpanMeters: 1, measuredValueMm: 1000)
        let manifest = try FieldManifestAssembler.assemble(
            bundleDir: dir, inputs: sampleInputs(anchors: [anchor, anchor, anchor]))
        #expect(manifest.unverified == false)         // 3 anchors → verified
    }

    @Test func manifestEncodingIsDeterministic() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        try Data("u".utf8).write(to: dir.appendingPathComponent("scan.usdz"))
        try Data("{}".utf8).write(to: dir.appendingPathComponent("captured_room.json"))

        let inputs = sampleInputs(anchors: [])
        _ = try FieldManifestAssembler.assemble(bundleDir: dir, inputs: inputs)
        let first = try Data(contentsOf: dir.appendingPathComponent("manifest.json"))
        _ = try FieldManifestAssembler.assemble(bundleDir: dir, inputs: inputs)
        let second = try Data(contentsOf: dir.appendingPathComponent("manifest.json"))
        #expect(first == second)      // sorted keys + stable artifact order → byte-identical
    }

    // MARK: - Tar archive (transport of the heavy streams)

    @Test func tarIsDeterministicAndStructured() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let a = dir.appendingPathComponent("a.bin"); try Data("AAA".utf8).write(to: a)
        let b = dir.appendingPathComponent("b.bin"); try Data("BBBB".utf8).write(to: b)
        // Deliberately reversed input order — the writer sorts by name.
        let entries = [TarArchive.Entry(name: "b.bin", url: b), TarArchive.Entry(name: "a.bin", url: a)]

        let out1 = dir.appendingPathComponent("1.tar")
        let out2 = dir.appendingPathComponent("2.tar")
        let count = try TarArchive.write(entries: entries, to: out1)
        _ = try TarArchive.write(entries: entries, to: out2)

        #expect(count == 2)
        let bytes = try Data(contentsOf: out1)
        #expect(bytes == (try Data(contentsOf: out2)))          // deterministic (sorted + mtime 0)
        #expect(bytes.count == 512 * 6)                          // 2×(header+block) + 2 zero blocks
        #expect(String(bytes: bytes.prefix(5), encoding: .utf8) == "a.bin")   // sorted: a before b
    }

    @Test func tarSkipsMissingSources() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let a = dir.appendingPathComponent("a.bin"); try Data("x".utf8).write(to: a)
        let entries = [TarArchive.Entry(name: "a.bin", url: a),
                       TarArchive.Entry(name: "gone.bin", url: dir.appendingPathComponent("gone.bin"))]
        let out = dir.appendingPathComponent("o.tar")
        #expect(try TarArchive.write(entries: entries, to: out) == 1)   // missing skipped
    }

    /// The off-the-shelf-untar contract (item 8 · M2): item 9's server untars with
    /// standard tools, so a TarArchive-written file must extract cleanly by member name
    /// with byte-identical contents. The gate runs on the iOS Simulator, where
    /// `Foundation.Process`/`/usr/bin/tar` are unavailable — so this uses an INDEPENDENT
    /// offset-based ustar reader (parsing the 512-byte header fields directly, not the
    /// writer's helpers). System-`tar` compatibility of the same bytes is verified
    /// out-of-band on a macOS host (see the ship report).
    @Test func tarRoundTripsThroughIndependentUstarReader() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let payloadA = Data((0..<600).map { UInt8($0 % 251) })   // > 512 → exercises multi-block + padding
        let payloadB = Data("hello ustar".utf8)
        let a = dir.appendingPathComponent("depth_0001.bin"); try payloadA.write(to: a)
        let b = dir.appendingPathComponent("depth_0002.bin"); try payloadB.write(to: b)
        let out = dir.appendingPathComponent("depth.tar")
        _ = try TarArchive.write(entries: [TarArchive.Entry(name: "depth_0002.bin", url: b),
                                           TarArchive.Entry(name: "depth_0001.bin", url: a)], to: out)

        let members = extractUstar(try Data(contentsOf: out))
        #expect(members.map(\.name) == ["depth_0001.bin", "depth_0002.bin"])       // sorted member names
        #expect(members.first { $0.name == "depth_0001.bin" }?.content == payloadA)  // byte-identical
        #expect(members.first { $0.name == "depth_0002.bin" }?.content == payloadB)
    }

    /// Minimal independent ustar reader: walks 512-byte blocks, reading the name field
    /// [0,100) and the octal size field [124,136), then the content padded to 512.
    private func extractUstar(_ data: Data) -> [(name: String, content: Data)] {
        var members: [(String, Data)] = []
        var offset = 0
        let block = 512
        while offset + block <= data.count {
            let header = data.subdata(in: offset..<offset + block)
            if header.allSatisfy({ $0 == 0 }) { break }                       // end-of-archive zero block
            let name = String(bytes: header.subdata(in: 0..<100).prefix { $0 != 0 }, encoding: .utf8) ?? ""
            let sizeField = header.subdata(in: 124..<136).prefix { $0 != 0 && $0 != 0x20 }
            let size = Int(String(bytes: sizeField, encoding: .utf8) ?? "0", radix: 8) ?? 0
            offset += block
            let content = size > 0 ? data.subdata(in: offset..<offset + size) : Data()
            members.append((name, content))
            offset += ((size + block - 1) / block) * block                   // advance past padded content
        }
        return members
    }
}
