//  CameraModeSeamTests.swift
//  CaptureTests
//
//  CameraMode is CaseIterable. Before this wave, three views rendered
//  `ForEach(CameraMode.allCases)` (ViewfinderControls.swift:191,
//  ViewfinderPlaceholder.swift:38, CameraPrimingScreen.swift:79 — pre-wave state);
//  they now read `ForEach(CameraMode.viewfinderSelectable)` instead. Wave 2 held
//  `.voice` off that array because a fifth VOICE pill whose shutter takes a
//  photo would be a new lie. Wave 3 built C6 and appended `.voice`, and what
//  keeps the shutter honest is `SpecimenCapturePolicy.producesPhoto(_:)`
//  guarding `captureSingle()` / `beginMultiShot()` — not the absent pill.

import Foundation
import Testing
@testable import CaptureKit

struct CameraModeSeamTests {

    @Test func voiceIsACaseSoTheSeamIsEditedOnlyOnce() {
        #expect(CameraMode(rawValue: "voice") == .voice)
        #expect(CameraMode.allCases.contains(.voice))
    }

    @Test func voiceIsOfferedInTheViewfinderNowThatC6Exists() {
        #expect(CameraMode.viewfinderSelectable.contains(.voice) == true)
        // Appended, never reordered: the other four keep their display order,
        // which this assertion has pinned since wave 2.
        #expect(CameraMode.viewfinderSelectable == [.photo, .tag, .measure, .scan, .voice])
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
