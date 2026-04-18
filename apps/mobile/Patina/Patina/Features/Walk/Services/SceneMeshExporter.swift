//
//  SceneMeshExporter.swift
//  Patina
//
//  Walks the ARMeshAnchors from the active ARSession and serializes their
//  combined geometry to a PLY file. RoomPlan enables scene reconstruction
//  under the hood, so these anchors are available as a side effect of a
//  normal RoomCaptureSession run on a LiDAR device.
//
//  PLY format written here:
//
//    ply
//    format ascii 1.0
//    element vertex N
//    property float x
//    property float y
//    property float z
//    property float nx
//    property float ny
//    property float nz
//    element face M
//    property list uchar int vertex_indices
//    property uchar classification
//    end_header
//    ...
//
//  Classification maps directly to ARMeshClassification.rawValue.
//

import Foundation
import ARKit
import simd
import os.log

public enum SceneMeshExportError: Error, LocalizedError {
    case noMeshAnchors
    case writeFailed(Error)

    public var errorDescription: String? {
        switch self {
        case .noMeshAnchors: return "No ARMeshAnchors present in the session"
        case .writeFailed(let e): return "Scene mesh write failed: \(e.localizedDescription)"
        }
    }
}

public enum SceneMeshExporter {

    private static let logger = Logger(subsystem: "com.patina.app", category: "SceneMesh")

    /// Serialize the mesh anchors attached to the given frame into PLY bytes.
    ///
    /// This reads the geometry's GPU buffers on the calling thread; call it
    /// after the scan has ended (in `didEndWith`) rather than per-frame.
    public static func exportPLYData(from anchors: [ARMeshAnchor]) throws -> Data {
        guard !anchors.isEmpty else {
            throw SceneMeshExportError.noMeshAnchors
        }

        var header = "ply\nformat ascii 1.0\n"
        var vertexLines: [String] = []
        var faceLines: [String] = []

        var vertexOffset = 0

        for anchor in anchors {
            let geometry = anchor.geometry
            let transform = anchor.transform

            let vertexCount = geometry.vertices.count
            let faceCount = geometry.faces.count
            let classificationReader = geometry.faceClassifier()

            let vertexBuffer = geometry.vertices.buffer.contents()
            let vertexStride = geometry.vertices.stride
            let vertexOffsetBytes = geometry.vertices.offset

            let normalBuffer = geometry.normals.buffer.contents()
            let normalStride = geometry.normals.stride
            let normalOffsetBytes = geometry.normals.offset

            let faceBuffer = geometry.faces.buffer.contents()
            let indexBytes = geometry.faces.bytesPerIndex

            let rotation = simd_float3x3(
                SIMD3<Float>(transform.columns.0.x, transform.columns.0.y, transform.columns.0.z),
                SIMD3<Float>(transform.columns.1.x, transform.columns.1.y, transform.columns.1.z),
                SIMD3<Float>(transform.columns.2.x, transform.columns.2.y, transform.columns.2.z)
            )
            let translation = SIMD3<Float>(
                transform.columns.3.x,
                transform.columns.3.y,
                transform.columns.3.z
            )

            for v in 0..<vertexCount {
                let vPtr = vertexBuffer.advanced(by: v * vertexStride + vertexOffsetBytes)
                let vx = vPtr.load(fromByteOffset: 0, as: Float.self)
                let vy = vPtr.load(fromByteOffset: 4, as: Float.self)
                let vz = vPtr.load(fromByteOffset: 8, as: Float.self)
                let vertexLocal = SIMD3<Float>(vx, vy, vz)
                let vertexWorld = rotation * vertexLocal + translation

                let nPtr = normalBuffer.advanced(by: v * normalStride + normalOffsetBytes)
                let nx = nPtr.load(fromByteOffset: 0, as: Float.self)
                let ny = nPtr.load(fromByteOffset: 4, as: Float.self)
                let nz = nPtr.load(fromByteOffset: 8, as: Float.self)
                let normalWorld = simd_normalize(rotation * SIMD3<Float>(nx, ny, nz))

                vertexLines.append(String(
                    format: "%.5f %.5f %.5f %.5f %.5f %.5f",
                    vertexWorld.x, vertexWorld.y, vertexWorld.z,
                    normalWorld.x, normalWorld.y, normalWorld.z
                ))
            }

            for f in 0..<faceCount {
                let idxPtrBase = faceBuffer.advanced(by: f * geometry.faces.indexCountPerPrimitive * indexBytes)
                var indices: [Int] = []
                for i in 0..<geometry.faces.indexCountPerPrimitive {
                    let idxPtr = idxPtrBase.advanced(by: i * indexBytes)
                    let raw: Int
                    switch indexBytes {
                    case 2: raw = Int(idxPtr.load(as: UInt16.self))
                    case 4: raw = Int(idxPtr.load(as: UInt32.self))
                    default: raw = 0
                    }
                    indices.append(raw + vertexOffset)
                }
                let cls = classificationReader?.classificationOf(faceWithIndex: f) ?? .none
                let listLine = ([String(indices.count)] + indices.map(String.init)).joined(separator: " ")
                faceLines.append("\(listLine) \(cls.rawValue)")
            }

            vertexOffset += vertexCount
        }

        header += "element vertex \(vertexLines.count)\n"
        header += "property float x\nproperty float y\nproperty float z\n"
        header += "property float nx\nproperty float ny\nproperty float nz\n"
        header += "element face \(faceLines.count)\n"
        header += "property list uchar int vertex_indices\n"
        header += "property uchar classification\n"
        header += "end_header\n"

        let body = vertexLines.joined(separator: "\n") + "\n" + faceLines.joined(separator: "\n") + "\n"
        let ply = header + body
        guard let data = ply.data(using: .utf8) else {
            throw SceneMeshExportError.writeFailed(NSError(domain: "SceneMeshExporter", code: -1))
        }
        return data
    }

    @discardableResult
    @MainActor
    public static func exportToBundle(
        anchors: [ARMeshAnchor],
        bundle: ScanBundleWriter
    ) -> ScanManifest.Artifact? {
        guard !anchors.isEmpty else {
            logger.info("No mesh anchors to export")
            return nil
        }
        do {
            let data = try exportPLYData(from: anchors)
            return try bundle.writeArtifact(
                kind: .mesh,
                data: data,
                mimeType: "model/ply"
            )
        } catch {
            logger.warning("Scene mesh export skipped: \(error.localizedDescription)")
            return nil
        }
    }
}

// MARK: - ARMeshGeometry classification helper

private extension ARMeshGeometry {
    /// Build a reader that pulls per-face classification bytes out of this
    /// geometry's classification `ARGeometrySource`. Pattern mirrors Apple's
    /// "Visualizing and Interacting with a Reconstructed Scene" sample.
    func faceClassifier() -> ARMeshFaceClassificationReader? {
        guard let source = self.classification else { return nil }
        return ARMeshFaceClassificationReader(source: source)
    }
}

private struct ARMeshFaceClassificationReader {
    let source: ARGeometrySource

    func classificationOf(faceWithIndex index: Int) -> ARMeshClassification {
        // ARMeshGeometry.classification uses .uchar format — one UInt8 per
        // face, keyed by `source.stride` bytes apart starting at `offset`.
        let pointer = source.buffer.contents()
            .advanced(by: index * source.stride + source.offset)
        let raw = pointer.load(as: UInt8.self)
        return ARMeshClassification(rawValue: Int(raw)) ?? .none
    }
}
