//  FieldSceneMeshRecorder.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 3
//
//  Streams the LiDAR scene mesh (`ARMeshAnchor`s, produced because the shared rig
//  runs `sceneReconstruction = .mesh`) to the capture bundle's top-level `mesh.ply`
//  (capture-bundle spec §4, artifact kind `mesh`). A `CaptureMeshSink` fed by
//  `SharedARCaptureRig`.
//
//  Streaming, not once-at-end: the accumulated world-space mesh is rewritten on a
//  throttle (`CaptureCadence.meshSnapshot`, ~10 s) as crash-resilience checkpoints,
//  and an authoritative final write is forced at `finish()`. Overwrite (not append)
//  keeps `mesh.ply` bounded — its size tracks the room, not the session length.
//
//  Budget + frame-pump discipline (item 3, point 6): the mesh sink callbacks do
//  cheap bookkeeping on the MainActor (dictionary upsert + a count); the whole PLY
//  serialize + write hops to a background queue and writes atomically, so the AR
//  frame pump is never blocked and a reader never sees a half-written mesh.
//
//  Each `ARMeshAnchor.geometry` is anchor-local; vertices are transformed by
//  `anchor.transform` into the shared ARKit world frame before serialization, so
//  the mesh shares the SAME coordinate frame as depth, poses, and the parametric
//  graph (SC-07 "one coordinate frame").

import Foundation
import CaptureKit
import os.log

#if canImport(ARKit)
import ARKit
import simd

@MainActor
final class FieldSceneMeshRecorder: CaptureMeshSink {

    private let meshURL: URL
    private let timebase: CaptureTimebase
    private let cadence: CaptureCadence
    private let enabled: Bool

    /// Live anchor set (MainActor-only).
    private var anchors: [UUID: ARMeshAnchor] = [:]
    private var lastSnapshotAt: TimeInterval?

    /// Telemetry (MainActor-only). `vertexCount` is the cheap sum of anchor
    /// vertex counts (no buffer reads); `snapshotsWritten` counts dispatched
    /// PLY writes (snapshots + final).
    private(set) var snapshotsWritten = 0
    var vertexCount: Int { anchors.values.reduce(0) { $0 + $1.geometry.vertices.count } }

    private let ioQueue = DispatchQueue(label: "cloud.patina.field.mesh.io", qos: .utility)
    private let logger = Logger(subsystem: "cloud.patina.field", category: "MeshRecorder")

    /// Best-effort: a failure to prepare the bundle dir disables the mesh stream
    /// (callbacks no-op) — the core scan is never blocked.
    init(bundleDir: URL, timebase: CaptureTimebase, cadence: CaptureCadence = .meshSnapshot) {
        self.timebase = timebase
        self.cadence = cadence
        self.meshURL = bundleDir.appendingPathComponent("mesh.ply", isDirectory: false)
        self.enabled = FileManager.default.fileExists(atPath: bundleDir.path)
        if !enabled { logger.error("Mesh recording disabled: bundle dir missing.") }
    }

    // MARK: - CaptureMeshSink

    func capture(meshAnchors: [ARMeshAnchor], change: CaptureMeshChange, timestampSeconds: TimeInterval) {
        guard enabled else { return }
        switch change {
        case .added, .updated:
            for anchor in meshAnchors { anchors[anchor.identifier] = anchor }
        case .removed:
            for anchor in meshAnchors { anchors.removeValue(forKey: anchor.identifier) }
        }
        // Throttled crash-resilience snapshot on the shared clock.
        if cadence.shouldSample(now: timestampSeconds, last: lastSnapshotAt) {
            lastSnapshotAt = timestampSeconds
            writeSnapshot()
        }
    }

    /// Force the authoritative final mesh write and drain pending writes.
    func finish() {
        guard enabled else { return }
        writeSnapshot()
        ioQueue.sync {}
    }

    // MARK: - Snapshot → PLY (background)

    private func writeSnapshot() {
        // Snapshot the current anchors (retained) so the bg queue can read their
        // Metal buffers safely; PLY serialize + atomic write happen off-actor.
        let snapshot = MeshSnapshot(anchors: Array(anchors.values), url: meshURL)
        guard !snapshot.anchors.isEmpty else { return }
        snapshotsWritten += 1
        ioQueue.async { [weak self] in self?.serialize(snapshot) }
    }

    private struct MeshSnapshot: @unchecked Sendable {
        let anchors: [ARMeshAnchor]
        let url: URL
    }

    private nonisolated func serialize(_ snap: MeshSnapshot) {
        var vertexLines = ""
        var faceLines = ""
        var vertexBase = 0
        var totalVertices = 0
        var totalFaces = 0

        for anchor in snap.anchors {
            let geometry = anchor.geometry
            let verts = geometry.vertices
            let faces = geometry.faces
            let transform = anchor.transform

            // Vertices → world space. ARKit vertex format is packed float3
            // (stride 12); read three Float32 explicitly to avoid SIMD alignment
            // assumptions.
            let vptr = verts.buffer.contents()
            for i in 0..<verts.count {
                let base = vptr.advanced(by: verts.offset + i * verts.stride)
                let lx = base.assumingMemoryBound(to: Float.self).pointee
                let ly = base.advanced(by: 4).assumingMemoryBound(to: Float.self).pointee
                let lz = base.advanced(by: 8).assumingMemoryBound(to: Float.self).pointee
                let world = transform * SIMD4<Float>(lx, ly, lz, 1)
                vertexLines += "\(world.x) \(world.y) \(world.z)\n"
            }

            // Faces → triangle index lists, offset into the concatenated vertex
            // array. Guard on the expected 3-index/4-byte layout.
            let iperf = faces.indexCountPerPrimitive
            if iperf == 3, faces.bytesPerIndex == MemoryLayout<UInt32>.size {
                let iptr = faces.buffer.contents()
                for f in 0..<faces.count {
                    let a = iptr.advanced(by: (f * 3 + 0) * 4).assumingMemoryBound(to: UInt32.self).pointee
                    let b = iptr.advanced(by: (f * 3 + 1) * 4).assumingMemoryBound(to: UInt32.self).pointee
                    let c = iptr.advanced(by: (f * 3 + 2) * 4).assumingMemoryBound(to: UInt32.self).pointee
                    faceLines += "3 \(vertexBase + Int(a)) \(vertexBase + Int(b)) \(vertexBase + Int(c))\n"
                    totalFaces += 1
                }
            }

            vertexBase += verts.count
            totalVertices += verts.count
        }

        guard totalVertices > 0 else { return }
        var ply = "ply\nformat ascii 1.0\n"
        ply += "comment Patina Field scene mesh (world frame, metres); snapshot streamed by FieldSceneMeshRecorder\n"
        ply += "element vertex \(totalVertices)\n"
        ply += "property float x\nproperty float y\nproperty float z\n"
        ply += "element face \(totalFaces)\n"
        ply += "property list uchar int vertex_indices\n"
        ply += "end_header\n"
        ply += vertexLines
        ply += faceLines

        do {
            try ply.data(using: .utf8)?.write(to: snap.url, options: .atomic)
        } catch {
            logger.error("Mesh PLY write failed: \(error.localizedDescription)")
        }
    }
}
#endif
