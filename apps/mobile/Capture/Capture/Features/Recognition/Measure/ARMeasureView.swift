//  ARMeasureView.swift
//  Capture
//
//  N3 — the real AR endpoint-distance reader (RealityKit ARView + ARKit raycast).
//  RealityKit/ARKit do NOT build for the iphonesimulator SDK, so the WHOLE file
//  is compiled out there (`#if !targetEnvironment(simulator)`); the N3 sheet only
//  references ARMeasureView inside its own matching guard and otherwise renders
//  the manual ("Type instead") path.

#if !targetEnvironment(simulator)
import SwiftUI
import UIKit
import RealityKit
import ARKit
import simd

struct ARMeasureView: UIViewRepresentable {
    /// Distance between the two placed endpoints, in millimetres.
    var onDistance: (Double) -> Void

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        view.session.run(config)

        let tap = UITapGestureRecognizer(target: context.coordinator,
                                         action: #selector(Coordinator.handleTap(_:)))
        view.addGestureRecognizer(tap)
        context.coordinator.view = view
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onDistance: onDistance) }

    final class Coordinator: NSObject {
        weak var view: ARView?
        let onDistance: (Double) -> Void
        private var points: [SIMD3<Float>] = []
        private var anchors: [AnchorEntity] = []

        init(onDistance: @escaping (Double) -> Void) { self.onDistance = onDistance }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let view else { return }
            let location = gesture.location(in: view)
            let results = view.raycast(from: location, allowing: .estimatedPlane, alignment: .any)
            guard let result = results.first else { return }

            let position = SIMD3<Float>(result.worldTransform.columns.3.x,
                                        result.worldTransform.columns.3.y,
                                        result.worldTransform.columns.3.z)

            if points.count == 2 { clear() }
            points.append(position)
            placeMarker(at: result.worldTransform)

            if points.count == 2 {
                let meters = simd_distance(points[0], points[1])
                onDistance(Double(meters) * 1000.0)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }

        private func placeMarker(at transform: simd_float4x4) {
            guard let view else { return }
            let anchor = AnchorEntity(world: transform)
            let sphere = ModelEntity(mesh: .generateSphere(radius: 0.006),
                                     materials: [SimpleMaterial(color: .orange, isMetallic: false)])
            anchor.addChild(sphere)
            view.scene.addAnchor(anchor)
            anchors.append(anchor)
        }

        private func clear() {
            for anchor in anchors { view?.scene.removeAnchor(anchor) }
            anchors.removeAll()
            points.removeAll()
        }
    }
}
#endif
