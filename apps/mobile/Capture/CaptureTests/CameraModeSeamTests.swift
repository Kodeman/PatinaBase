//  CameraModeSeamTests.swift
//  CaptureTests
//
//  CameraMode is CaseIterable and three views render `ForEach(CameraMode.allCases)`
//  (ViewfinderControls.swift:191, ViewfinderPlaceholder.swift:38,
//  CameraPrimingScreen.swift:79). Adding `.voice` to allCases would therefore put
//  a fifth VOICE pill in the C1 selector whose shutter takes a photo — which is
//  precisely the class of lie this wave exists to remove. The case lands now
//  because the enum is a frozen seam edited once; the pill waits for C6 (wave 3).

import Foundation
import Testing
@testable import CaptureKit

struct CameraModeSeamTests {

    @Test func voiceIsACaseSoTheSeamIsEditedOnlyOnce() {
        #expect(CameraMode(rawValue: "voice") == .voice)
        #expect(CameraMode.allCases.contains(.voice))
    }

    @Test func voiceIsNotOfferedInTheViewfinderUntilC6Exists() {
        #expect(CameraMode.viewfinderSelectable.contains(.voice) == false)
        #expect(CameraMode.viewfinderSelectable == [.photo, .tag, .measure, .scan])
    }

    @Test func everyModeStillHasANextStep() {
        #expect(SpecimenCapturePolicy.nextStep(for: .photo) == .quickConfirm)
        #expect(SpecimenCapturePolicy.nextStep(for: .tag) == .tagOCR)
        #expect(SpecimenCapturePolicy.nextStep(for: .scan) == .codeScan)
        #expect(SpecimenCapturePolicy.nextStep(for: .measure) == .measure)
        // Unreachable from the shutter: `.voice` is off `viewfinderSelectable`,
        // and wave 3 guards `captureSingle()` with
        // `SpecimenCapturePolicy.producesPhoto(_:)` rather than changing this
        // branch — this assertion still holds after wave 3.
        #expect(SpecimenCapturePolicy.nextStep(for: .voice) == .quickConfirm)
    }

    @Test func theVisitDoorIsASheetWithAStableRegistryKey() {
        #expect(CaptureSheet.visit.id == "visit")
        #expect(CaptureSheet.visit.registryKey == "visit")
    }
}
