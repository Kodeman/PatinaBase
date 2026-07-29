//
//  CameraTrustTests.swift
//  PatinaTests
//

import Foundation
import Testing
@testable import Patina

struct CameraTrustTests {
    @Test
    @MainActor
    func permissionPolicyKeepsManualEntryIndependentOfCameraStatus() {
        #expect(
            CameraPermissionPolicy.destination(
                for: .notDetermined,
                choseManualEntry: true
            ) == .manualRoomEntry
        )
        #expect(
            CameraPermissionPolicy.destination(
                for: .denied,
                choseManualEntry: true
            ) == .manualRoomEntry
        )
        #expect(CameraPermissionPolicy.destination(for: .granted) == .scan)
        #expect(CameraPermissionPolicy.destination(for: .denied) == .deniedExplanation)
        #expect(CameraPermissionPolicy.destination(for: .notDetermined) == .awaitChoice)
    }

    @Test
    @MainActor
    func disclosureNamesCapturedPhotosLocalStorageAndLaterUpload() {
        #expect(CameraTrustCopy.purposeBody.localizedCaseInsensitiveContains("reference photos"))
        #expect(CameraTrustCopy.localStorage.localizedCaseInsensitiveContains("this iPhone"))
        #expect(CameraTrustCopy.sharing.localizedCaseInsensitiveContains("does not upload"))
        #expect(CameraTrustCopy.sharing.localizedCaseInsensitiveContains("designer"))
        #expect(CameraTrustCopy.sharing.localizedCaseInsensitiveContains("uploaded to Patina"))
        #expect(CameraTrustCopy.manualAction == "Enter room details instead")
    }
}
