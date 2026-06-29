//  CaptureCoordinator.swift
//  Capture
//
//  Concrete navigation state. Drives the NavigationStack + sheet presentation in
//  RootView. Feature teams call coordinator.present(.ocr(id)) etc. via the
//  CaptureCoordinating seam.

import SwiftUI
import CaptureKit

@Observable
@MainActor
public final class CaptureCoordinator: CaptureCoordinating {
    public var phase: CapturePhase
    public var path: [CaptureRoute] = []
    public var sheet: CaptureSheet?

    public init(phase: CapturePhase = .ready) {
        self.phase = phase
    }

    public func navigate(to route: CaptureRoute) { path.append(route) }
    public func present(_ sheet: CaptureSheet) { self.sheet = sheet }
    public func dismissSheet() { sheet = nil }
    public func goBack() { if !path.isEmpty { path.removeLast() } }
    public func popToRoot() { path.removeAll() }
}
