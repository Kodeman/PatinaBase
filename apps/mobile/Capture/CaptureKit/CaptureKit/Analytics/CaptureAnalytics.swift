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
}

public extension CaptureAnalytics {
    func screen(_ name: String) { screen(name, [:]) }
    func event(_ name: String) { event(name, [:]) }
    /// Additive (Phase 1b): existing conformers (the mock) keep compiling.
    func identify(_ userID: String) {}
    /// Additive (Phase 3): existing conformers (the mock) keep compiling.
    func identify(_ userID: String, properties: [String: String]) {}
}
