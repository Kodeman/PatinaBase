//
//  ARPlacementFailureCopyTests.swift
//  PatinaTests
//
//  C4-08: the AR "Save View" toast printed a Swift enum's default
//  description — module name and all — because `RoomsAPIError` is a plain
//  `Error` and the view model interpolated `.localizedDescription` straight
//  into the failure state. One fixed sentence now; the raw error is logged,
//  never shown.
//

import Testing
@testable import Patina

@MainActor
struct ARPlacementFailureCopyTests {

    @Test("the save-failure message is fixed and names nothing about the error type")
    func saveFailureMessageIsFixed() {
        let message = ARPlacementViewModel.saveFailureMessage
        #expect(!message.isEmpty)
        #expect(!message.contains("RoomsAPIError"))
        #expect(!message.contains("Patina."))
        #expect(!message.contains("couldn't be completed"))
    }

    @Test("the toast renders the failure message with no additional prefix")
    func toastHasNoRedundantPrefix() throws {
        let source = try SourcePin.read("Patina/Features/ARPlacement/Views/ARPlacementView.swift")
        #expect(source.contains("toastPill(text: msg, tint: PatinaColors.clay)"))
        #expect(!source.contains("\"Save failed: \\(msg)\""))
    }
}
