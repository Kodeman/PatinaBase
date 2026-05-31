//
//  ARPlacementManager.swift
//  Patina
//
//  Manages RealityKit entity placement, shadows, rotation, and floor detection
//

import Foundation
import RealityKit
import ARKit
import Combine
import Observation

@MainActor
@Observable
final class ARPlacementManager {

    // MARK: - State

    var isPlaced = false
    var isLoading = false
    var errorMessage: String?

    // MARK: - Entities

    @ObservationIgnored private var cancellables = Set<AnyCancellable>()
    @ObservationIgnored private var placedEntity: ModelEntity?
    @ObservationIgnored private var anchor: AnchorEntity?
    @ObservationIgnored private weak var arView: ARView?

    // MARK: - Setup

    func configure(arView: ARView) {
        self.arView = arView

        // Configure AR session for floor + wall detection.
        // Vertical planes enable magnetic snap-to-wall placement; light
        // estimation drives RealityKit's image-based lighting so placed
        // furniture blends into the room's actual lighting conditions.
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }
        config.environmentTexturing = .automatic
        config.isLightEstimationEnabled = true
        arView.session.run(config)
    }

    // MARK: - Room Mesh

    /// Download a room-scan mesh (USDZ/GLTF) from `room_scans.model_url`
    /// and add it to the scene as an unlit reference anchor so the user
    /// sees their actual space around the placed product. Best-effort —
    /// silently no-ops on failure so the AR session still runs.
    func loadRoomMesh(from url: URL) {
        guard let arView else { return }
        Task { @MainActor in
            do {
                let (localURL, _) = try await URLSession.shared.download(from: url)
                // Append the original extension so RealityKit picks the right loader.
                let ext = url.pathExtension.isEmpty ? "usdz" : url.pathExtension
                let typed = localURL.deletingPathExtension().appendingPathExtension(ext)
                try? FileManager.default.moveItem(at: localURL, to: typed)

                guard #available(iOS 18.0, *) else { return }
                let meshEntity = try await ModelEntity(contentsOf: typed)
                meshEntity.components.set(OpacityComponent(opacity: 0.35))
                let meshAnchor = AnchorEntity(world: .zero)
                meshAnchor.addChild(meshEntity)
                arView.scene.addAnchor(meshAnchor)
            } catch {
                #if DEBUG
                PatinaLog.scan.error("[ARPlacementManager] failed to load room mesh: \(error)")
                #endif
            }
        }
    }

    // MARK: - Place Product

    func placeProduct(usdzURL: URL) async {
        guard let arView else { return }
        isLoading = true
        errorMessage = nil

        do {
            let entity = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<ModelEntity, Error>) in
                ModelEntity.loadModelAsync(contentsOf: usdzURL).sink(
                    receiveCompletion: { result in
                        if case .failure(let error) = result {
                            continuation.resume(throwing: error)
                        }
                    },
                    receiveValue: { entity in
                        continuation.resume(returning: entity)
                    }
                ).store(in: &self.cancellables)
            }
            entity.generateCollisionShapes(recursive: true)

            // Scale to reasonable size if needed
            let bounds = entity.visualBounds(relativeTo: nil)
            let maxDimension = max(bounds.extents.x, max(bounds.extents.y, bounds.extents.z))
            if maxDimension > 3.0 {
                let scale = 2.0 / maxDimension
                entity.scale = [scale, scale, scale]
            }

            // Create floor anchor
            let anchor = AnchorEntity(.plane(.horizontal, classification: .floor, minimumBounds: [0.3, 0.3]))
            anchor.addChild(entity)

            // Add shadow plane
            let shadowMesh = MeshResource.generatePlane(width: 1.5, depth: 1.5)
            var shadowMaterial = UnlitMaterial()
            shadowMaterial.color = .init(tint: .black.withAlphaComponent(0.08))
            let shadowEntity = ModelEntity(mesh: shadowMesh, materials: [shadowMaterial])
            shadowEntity.position.y = 0.001 // Just above floor
            anchor.addChild(shadowEntity)

            arView.scene.addAnchor(anchor)

            self.placedEntity = entity
            self.anchor = anchor
            self.isPlaced = true
            self.isLoading = false

            HapticManager.shared.notification(.success)
        } catch {
            self.errorMessage = "Couldn't load 3D model"
            self.isLoading = false
        }
    }

    // MARK: - Rotation

    func rotate(by angle: Float) {
        guard let entity = placedEntity else { return }
        let rotation = simd_quatf(angle: angle, axis: [0, 1, 0])
        entity.orientation = entity.orientation * rotation
    }

    // MARK: - Magnetic snap-to-wall

    /// Snap distance threshold in meters. If the placed entity's nearest
    /// vertical plane is within this range, pull it to the wall.
    private static let wallSnapThreshold: Float = 0.30

    /// Find the nearest vertical-plane anchor to the currently placed entity
    /// and align the entity's back face to that wall. Best-effort — silently
    /// no-ops if no wall is detected within `wallSnapThreshold`.
    func snapToNearestWall() {
        guard let arView, let entity = placedEntity, let anchor else { return }
        let entityWorld = anchor.transform.translation + entity.position(relativeTo: anchor)

        var bestDistance: Float = .greatestFiniteMagnitude
        var bestPlane: ARPlaneAnchor?

        for arAnchor in arView.session.currentFrame?.anchors ?? [] {
            guard let plane = arAnchor as? ARPlaneAnchor,
                  plane.alignment == .vertical else { continue }
            let planeWorld = simd_make_float3(plane.transform.columns.3)
            let normal = simd_normalize(simd_make_float3(plane.transform.columns.1))
            let perpDistance = abs(simd_dot(entityWorld - planeWorld, normal))
            if perpDistance < bestDistance {
                bestDistance = perpDistance
                bestPlane = plane
            }
        }

        guard let plane = bestPlane, bestDistance < Self.wallSnapThreshold else { return }
        let planeWorld = simd_make_float3(plane.transform.columns.3)
        let normal = simd_normalize(simd_make_float3(plane.transform.columns.1))
        let snapped = entityWorld - normal * (simd_dot(entityWorld - planeWorld, normal))
        let local = snapped - anchor.transform.translation
        entity.position = local
        HapticManager.shared.impact(.light)
    }

    // MARK: - Cleanup

    func removeProduct() {
        if let anchor {
            arView?.scene.removeAnchor(anchor)
        }
        placedEntity = nil
        anchor = nil
        isPlaced = false
    }

    // MARK: - Screenshot

    func captureScreenshot() -> UIImage? {
        arView?.snapshot(saveToHDR: false) { image in
            if let image {
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            }
        }
        return nil
    }
}
