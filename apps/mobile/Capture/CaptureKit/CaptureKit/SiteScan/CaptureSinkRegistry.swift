//  CaptureSinkRegistry.swift
//  CaptureKit
//
//  The fan-out seam of the Field capture rig (Field Capture P1 · item 3, point 3:
//  "a protocol surface that items 4–6 plug into without touching the session
//  plumbing"). The shared-ARSession rig holds one registry per stream — a frame
//  sink group, a mesh sink group, a room-update sink group — and broadcasts each
//  sample to every registered sink in registration order. Items 4 (keyframe
//  recorder), 5 (coach/QA) and 6 (anchor entry) each register a sink; item 3
//  registers the depth recorder, the scene-mesh recorder, and the (migrated)
//  posed-photo lane. No sink knows about any other, and none touches the ARSession.
//
//  Generic over an arbitrary `Sink` type so the fan-out logic is PURE — it carries
//  no ARKit/RoomPlan types and is unit-tested in CaptureTests with stub sinks. The
//  concrete sink protocols (which DO reference `ARFrame`/`ARMeshAnchor`/
//  `CapturedRoom`) live app-side, in `CaptureRecorderSeams.swift`.
//
//  Ownership: the registry holds STRONG references. Every sink in a capture
//  session is session-scoped and torn down together with the rig at
//  `finish()`/`cancel()`, so there is no retain-cycle hazard and no weak-box
//  bookkeeping — the rig releasing the registries releases the sinks.
//
//  Not thread-safe by design: registration and broadcast both happen on the
//  MainActor (the rig hops every ARSession callback to the MainActor before
//  fanning out, exactly as the existing posed-photo lane does). Kept
//  non-isolated so the pure unit tests can exercise it without an actor hop.

import Foundation

/// An ordered, strongly-held group of sinks with an in-order broadcast. Generic
/// and ARKit-free so the fan-out contract is testable in isolation.
public final class CaptureSinkRegistry<Sink> {

    private var sinks: [Sink] = []

    public init() {}

    /// Number of registered sinks.
    public var count: Int { sinks.count }

    /// Register a sink. Sinks receive broadcasts in registration order.
    public func add(_ sink: Sink) {
        sinks.append(sink)
    }

    /// Remove all sinks (session teardown).
    public func removeAll() {
        sinks.removeAll()
    }

    /// Deliver one sample to every registered sink, in registration order.
    /// The body is invoked synchronously per sink; a sink that needs to defer
    /// work (e.g. a background encode) does so itself.
    public func broadcast(_ body: (Sink) -> Void) {
        for sink in sinks {
            body(sink)
        }
    }
}
