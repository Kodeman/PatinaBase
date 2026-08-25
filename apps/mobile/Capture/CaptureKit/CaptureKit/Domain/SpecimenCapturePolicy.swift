//
//  SpecimenCapturePolicy.swift
//  CaptureKit
//
//  Pure routing from the selected camera mode to its first relevant workflow.
//

public enum SpecimenCaptureNextStep: Equatable, Sendable {
    case quickConfirm
    case tagOCR
    case codeScan
    case measure
}

public enum SpecimenCapturePolicy {
    public static func nextStep(
        for mode: CameraMode
    ) -> SpecimenCaptureNextStep {
        switch mode {
        case .photo: return .quickConfirm
        case .tag: return .tagOCR
        case .scan: return .codeScan
        case .measure: return .measure
        // Unreachable from the shutter: `.voice` is off `viewfinderSelectable`.
        // Wave 3 guards captureSingle() with SpecimenCapturePolicy.producesPhoto(_:)
        // rather than changing this branch.
        case .voice: return .quickConfirm
        }
    }
}
