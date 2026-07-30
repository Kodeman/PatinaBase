//
//  CaptureSinkRegistry.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/CaptureSinkRegistry.swift
//
//  The fan-out seam of the capture path. The type that owns the session holds one
//  registry per stream — a frame-sink group, a mesh-sink group, a room-update
//  sink group — and broadcasts each sample to every registered sink in
//  registration order. Recorders register a sink; no sink knows about any other,
//  and none touches the ARSession or the RoomCaptureSession.
//
//  Generic over an arbitrary `Sink` type so the fan-out logic is PURE — it
//  carries no ARKit/RoomPlan types and is unit-testable with stub sinks. The
//  concrete sink protocols (which DO reference `ARFrame` / `ARMeshAnchor` /
//  `CapturedRoom`) live app-side, in `Services/CaptureRecorderSeams.swift`.
//
//  Ownership: the registry holds STRONG references. Every sink in a capture
//  session is session-scoped and released together when the owner drops the
//  registries, so there is no retain-cycle hazard and no weak-box bookkeeping.
//
//  Not thread-safe by design: registration and broadcast both happen in ONE
//  isolation domain (the owner hops every ARSession callback to the MainActor
//  before fanning out, exactly as Patina's existing posed-photo lane does).
//
//  ISOLATION — `nonisolated`, and deliberately NOT `Sendable`: it carries
//  mutable state and no lock, so it is caller-confined. Without the explicit
//  `nonisolated`, Patina's project-level SWIFT_DEFAULT_ACTOR_ISOLATION =
//  MainActor would bind it to the main actor and the pure unit tests could not
//  exercise it without a hop. See the note in `KeyframeGate.swift`.
//

import Foundation

/// An ordered, strongly-held group of sinks with an in-order broadcast. Generic
/// and framework-free so the fan-out contract is testable in isolation.
nonisolated public final class CaptureSinkRegistry<Sink> {

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
