//  ARKitMeasureService.swift
//  Capture
//
//  N3 — AR measure. ARKit/RealityKit do NOT compile for the iphonesimulator SDK,
//  so every ARKit reference is wrapped in `#if !targetEnvironment(simulator)`.
//  On the simulator `isARSupported` is false and the N3 sheet renders its manual
//  ("Type instead") path. `manual(...)` is always available and units-agnostic
//  (millimetres), so the field never disappears (R-fallback).

import Foundation
import CaptureKit

#if !targetEnvironment(simulator)
import ARKit
#endif

public struct ARKitMeasureService: MeasureService {
    public init() {}

    public var isARSupported: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return ARWorldTrackingConfiguration.isSupported
        #endif
    }

    public func manual(axis: MeasurementAxis, millimeters: Double) -> CaptureMeasurement {
        CaptureMeasurement(
            axisRaw: axis.rawValue,
            millimeters: millimeters,
            sourceRaw: MeasureSource.manual.rawValue
        )
    }
}

// MARK: - Unit helpers (shared by the N3 sheet)

public enum MeasureUnit {
    public static let mmPerInch = 25.4

    public static func inches(fromMillimeters mm: Double) -> Double { mm / mmPerInch }
    public static func millimeters(fromInches inches: Double) -> Double { inches * mmPerInch }

    /// "31½ in" style label for the card.
    public static func inchLabel(millimeters mm: Double) -> String {
        let inches = inches(fromMillimeters: mm)
        let whole = Int(inches.rounded(.down))
        let frac = inches - Double(whole)
        let eighths = Int((frac * 8).rounded())
        let glyphs = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"]
        if eighths == 0 { return "\(whole) in" }
        if eighths == 8 { return "\(whole + 1) in" }
        return "\(whole)\(glyphs[eighths]) in"
    }
}
