//  FieldSceneMeshRecorder.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 3
//
//  Accumulates the LiDAR scene mesh (`ARMeshAnchor`s, produced because the shared
//  rig runs `sceneReconstruction = .mesh`) during the scan and serializes the
//  combined world-space geometry to the capture bundle's top-level `mesh.ply`
//  (capture-bundle spec §4, artifact kind `mesh`) EXACTLY ONCE, at `finish()`.
//  A `CaptureMeshSink` fed by `SharedARCaptureRig`.
//
//  WHY once-at-finish, on the calling thread (NOT throttled mid-scan): an
//  `ARMeshAnchor`'s geometry is backed by pooled Metal buffers that ARKit RECYCLES
//  while the session is running, so reading `geometry.vertices.buffer.contents()`
//  mid-scan — even off a background queue with the anchor retained — risks torn PLY
//  data or intermittent crashes. This matches the client reference discipline
//  exactly (`apps/mobile/Patina/.../Walk/Services/SceneMeshExporter.swift`: "reads
//  the geometry's GPU buffers on the calling thread; call it after the scan has
//  ended … rather than per-frame"). `finish()` runs after `SharedARCaptureRig`
//  pauses the ARSession, the only point the buffers are stable — and it runs on the
//  MainActor (the calling context), so no `@unchecked Sendable` anchor snapshot and
//  no background IO for the geometry read. A single serialize also avoids the
//  O(snapshots × mesh) CPU/disk churn a mid-scan re-write would spend on the
//  session's thermal budget.
//
//  Each `ARMeshAnchor.geometry` is anchor-local; vertices are transformed by
//  `anchor.transform` into the shared ARKit world frame before serialization, so
//  the mesh shares the SAME coordinate frame as depth, poses, and the parametric
//  graph (SC-07 "one coordinate frame"). Per-frame work is a dictionary upsert only.

import Foundation
import CaptureKit
import os.log

#if canImport(ARKit)
import ARKit
import simd

@MainActor
final class FieldSceneMeshRecorder: CaptureMeshSink {

    private let meshURL: URL
    private let enabled: Bool

    /// Live anchor set (MainActor-only). Accumulated during the scan; geometry
    /// buffers are only ever read in `finish()`, after the session is paused.
    private var anchors: [UUID: ARMeshAnchor] = [:]

    /// Telemetry: whether the final `mesh.ply` was written, and the (cheap) sum of
    /// anchor vertex counts (no buffer reads).
    private(set) var didWriteMesh = false
    var vertexCount: Int { anchors.values.reduce(0) { $0 + $1.geometry.vertices.count } }

    private let logger = Logger(subsystem: "cloud.patina.field", category: "MeshRecorder")

    /// Best-effort: a failure to prepare the bundle dir disables the mesh stream
    /// (callbacks no-op) — the core scan is never blocked.
    init(bundleDir: URL) {
        self.meshURL = bundleDir.appendingPathComponent("mesh.ply", isDirectory: false)
        self.enabled = FileManager.default.fileExists(atPath: bundleDir.path)
        if !enabled { logger.error("Mesh recording disabled: bundle dir missing.") }
    }

    // MARK: - CaptureMeshSink

    func capture(meshAnchors: [ARMeshAnchor], change: CaptureMeshChange, timestampSeconds: TimeInterval) {
        guard enabled else { return }
        // Accumulation ONLY — no geometry buffer reads and no disk IO per frame.
        // The GPU mesh buffers are read exactly once, in finish(), after pause.
        switch change {
        case .added, .updated:
            for anchor in meshAnchors { anchors[anchor.identifier] = anchor }
        case .removed:
            for anchor in meshAnchors { anchors.removeValue(forKey: anchor.identifier) }
        }
    }

    /// Serialize the accumulated scene mesh to `mesh.ply` EXACTLY ONCE, on the
    /// calling thread (MainActor), AFTER the ARSession has been paused
    /// (`SharedARCaptureRig.stopRecording` pauses before calling this) — the only
    /// point the anchors' GPU buffers are stable. Idempotent.
    func finish() {
        guard enabled, !didWriteMesh else { return }
        didWriteMesh = true
        serialize(Array(anchors.values))
    }

    // MARK: - Serialize → PLY (once, buffers stable)

    private func serialize(_ anchors: [ARMeshAnchor]) {
        guard !anchors.isEmpty else { return }

        var vertexLines = ""
        var faceLines = ""
        var vertexBase = 0
        var totalVertices = 0
        var totalFaces = 0

        for anchor in anchors {
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
            if faces.indexCountPerPrimitive == 3, faces.bytesPerIndex == MemoryLayout<UInt32>.size {
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
        ply += "comment Patina Field scene mesh (world frame, metres); FieldSceneMeshRecorder, end-of-session\n"
        ply += "element vertex \(totalVertices)\n"
        ply += "property float x\nproperty float y\nproperty float z\n"
        ply += "element face \(totalFaces)\n"
        ply += "property list uchar int vertex_indices\n"
        ply += "end_header\n"
        ply += vertexLines
        ply += faceLines

        do {
            try ply.data(using: .utf8)?.write(to: meshURL, options: .atomic)
        } catch {
            logger.error("Mesh PLY write failed: \(error.localizedDescription)")
        }
    }
}
#endif
