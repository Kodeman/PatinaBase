//  FieldCaptureRasterProfile.swift
//  Capture · Field Capture P2 · R118 — resolve the physical capture profile
//
//  DEBUG only. Answers one question for the raster-fixture exporter: at what
//  resolution does THIS device's Field capture path actually produce keyframes?
//
//  The answer is not a constant and must not be written as one. `FieldKeyframeRecorder`
//  stamps `frame.camera.imageResolution` into the keyframe index and hands
//  `frame.capturedImage` to `FieldRasterEncoder` unscaled, and
//  `SharedARCaptureRig.makeConfiguration()` never assigns
//  `ARConfiguration.videoFormat` — so the resolution is whatever ARKit selects
//  by default for that configuration on that device. It varies by device model
//  and by the frame semantics / scene reconstruction the configuration enables.
//
//  So this resolver builds the EXACT production configuration and reports the
//  format ARKit chose for it, together with the provenance of that reading. It
//  starts no session and captures nothing.
//
//  KNOWN GAP, closed by the operator not by this code: the authoritative number
//  is `frame.camera.imageResolution` on a RUNNING session after RoomPlan has
//  attached to it (`RoomPlanScanSession` calls `captureSession.run(...)` on a
//  `RoomCaptureView` built with the shared session). Apple documents that
//  RoomPlan preserves the AR session's settings, so the pre-run format should
//  be the format the frames arrive at — but this repository has never verified
//  that on device. The R118 operator runbook therefore requires cross-checking
//  the emitted profile against `intrinsics.imageWidth/imageHeight` in a real
//  scan's `keyframes/keyframe_index.ndjson` before the fixture is qualified.

#if DEBUG

import CaptureKit
import Foundation

enum FieldCaptureRasterProfile {

    enum ResolutionError: Error, LocalizedError {
        case arkitUnavailable
        case worldTrackingUnsupported
        case noVideoFormat

        var errorDescription: String? {
            switch self {
            case .arkitUnavailable:
                return "ARKit is not available in this build; run the fixture on a physical Field device."
            case .worldTrackingUnsupported:
                return "ARWorldTrackingConfiguration is unsupported here (Simulator?); run the fixture on a physical Field device."
            case .noVideoFormat:
                return "ARKit reported no video format for the Field capture configuration."
            }
        }
    }

    /// `utsname.machine`, e.g. `iPhone18,3`. Not the marketing name — the
    /// receipt wants the identifier a later reader can look up unambiguously.
    static var deviceModelIdentifier: String {
        var info = utsname()
        guard uname(&info) == 0 else { return "unknown" }
        // The String must be built INSIDE the closure — the byte slice does not
        // outlive the pointer.
        let identifier = withUnsafeBytes(of: info.machine) { raw -> String in
            String(bytes: raw.prefix { $0 != 0 }, encoding: .utf8) ?? ""
        }
        return identifier.isEmpty ? "unknown" : identifier
    }
}

#if canImport(ARKit)

import ARKit
import AVFoundation
import UIKit

extension FieldCaptureRasterProfile {

    /// The capture profile of the production Field rig on this device.
    /// `@MainActor` because `SharedARCaptureRig` is; the DEBUG Settings caller
    /// is already on the main actor.
    @MainActor
    static func resolve() throws -> FieldRasterFixtureExporter.CaptureProfile {
        guard ARWorldTrackingConfiguration.isSupported else {
            throw ResolutionError.worldTrackingUnsupported
        }
        // The same object `SharedARCaptureRig.startRecording` runs — including
        // the mesh / smoothed-depth semantics, which are part of what
        // constrains ARKit's default format choice.
        let configuration = SharedARCaptureRig.makeConfiguration()
        guard !ARWorldTrackingConfiguration.supportedVideoFormats.isEmpty else {
            throw ResolutionError.noVideoFormat
        }
        let format = configuration.videoFormat
        let resolution = format.imageResolution
        let width = Int(resolution.width.rounded())
        let height = Int(resolution.height.rounded())
        guard width > 0, height > 0 else { throw ResolutionError.noVideoFormat }

        return FieldRasterFixtureExporter.CaptureProfile(
            nativeWidth: width,
            nativeHeight: height,
            resolutionSource: resolutionSource(for: configuration),
            deviceModel: deviceModelIdentifier,
            systemVersion: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            videoFormat: describe(format)
        )
    }

    /// Spelled out so a receipt reader can re-derive the number: which API, on
    /// which configuration, with which semantics applied.
    private static func resolutionSource(for configuration: ARWorldTrackingConfiguration) -> String {
        var applied: [String] = []
        if configuration.sceneReconstruction != [] { applied.append("sceneReconstruction=mesh") }
        if configuration.frameSemantics.contains(.smoothedSceneDepth) { applied.append("smoothedSceneDepth") }
        if configuration.frameSemantics.contains(.sceneDepth) { applied.append("sceneDepth") }
        let semantics = applied.isEmpty ? "none" : applied.joined(separator: "+")
        return "ARWorldTrackingConfiguration.videoFormat.imageResolution on "
            + "SharedARCaptureRig.makeConfiguration() [\(semantics)]; videoFormat unassigned, "
            + "so this is ARKit's default format for this device and configuration"
    }

    private static func describe(_ format: ARConfiguration.VideoFormat) -> String {
        let resolution = format.imageResolution
        let device = format.captureDeviceType.rawValue
            .replacingOccurrences(of: "AVCaptureDeviceType", with: "")
        return "\(Int(resolution.width.rounded()))x\(Int(resolution.height.rounded()))"
            + "@\(format.framesPerSecond) \(device)"
    }
}

#else

extension FieldCaptureRasterProfile {
    @MainActor
    static func resolve() throws -> FieldRasterFixtureExporter.CaptureProfile {
        throw ResolutionError.arkitUnavailable
    }
}

#endif

#endif
