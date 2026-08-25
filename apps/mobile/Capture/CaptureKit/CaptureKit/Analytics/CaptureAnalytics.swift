//  CaptureAnalytics.swift
//  CaptureKit
//
//  Telemetry seam. Concrete PostHogCaptureAnalytics is app-side (copied PostHogService).

import Foundation

public protocol CaptureAnalytics: Sendable {
    func screen(_ name: String, _ properties: [String: String])
    func event(_ name: String, _ properties: [String: String])
    /// Associate subsequent events with a stable user id (no-op by default).
    func identify(_ userID: String)
    /// Associate subsequent events with a stable user id + person properties
    /// (no-op by default).
    func identify(_ userID: String, properties: [String: String])
    /// Remote feature flag. FAIL-CLOSED by default (see the extension) so a
    /// seam that cannot reach PostHog never lights a gated surface.
    func isFeatureEnabled(_ key: String) -> Bool
}

public extension CaptureAnalytics {
    func screen(_ name: String) { screen(name, [:]) }
    func event(_ name: String) { event(name, [:]) }
    /// Additive (Phase 1b): existing conformers (the mock) keep compiling.
    func identify(_ userID: String) {}
    /// Additive (Phase 3): existing conformers (the mock) keep compiling.
    func identify(_ userID: String, properties: [String: String]) {}
    /// Additive (Field Companion W1): existing conformers keep compiling, and
    /// anything that cannot answer answers `false`.
    func isFeatureEnabled(_ key: String) -> Bool { false }
}
