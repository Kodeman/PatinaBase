//
//  PieceCapturePolicy.swift
//  CaptureKit
//
//  Pure routing from the selected camera mode to its first relevant workflow.
//

public enum PieceCaptureNextStep: Equatable, Sendable {
    case quickConfirm
    case tagOCR
    case codeScan
    case measure
}

public enum PieceCapturePolicy {
    public static func nextStep(
        for mode: CameraMode
    ) -> PieceCaptureNextStep {
        switch mode {
        case .photo: return .quickConfirm
        case .tag: return .tagOCR
        case .scan: return .codeScan
        case .measure: return .measure
        // Unreachable from the shutter: `.voice` is off `viewfinderSelectable`.
        // Wave 3 guards captureSingle() with PieceCapturePolicy.producesPhoto(_:)
        // rather than changing this branch.
        case .voice: return .quickConfirm
        }
    }
}

public extension PieceCapturePolicy {
    /// VOICE (C6) is the one mode with no frame: it never reaches the C3 card
    /// and never opens an enrichment sheet.
    static func producesPhoto(_ mode: CameraMode) -> Bool { mode != .voice }
}
