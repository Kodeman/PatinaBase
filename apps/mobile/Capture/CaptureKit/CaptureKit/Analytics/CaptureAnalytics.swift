//  CaptureAnalytics.swift
//  CaptureKit
//
//  Telemetry seam. Concrete PostHogCaptureAnalytics is app-side (copied PostHogService).

import Foundation

public protocol CaptureAnalytics: Sendable {
    func screen(_ name: String, _ properties: [String: String])
    func event(_ name: String, _ properties: [String: String])
}

public extension CaptureAnalytics {
    func screen(_ name: String) { screen(name, [:]) }
    func event(_ name: String) { event(name, [:]) }
}
