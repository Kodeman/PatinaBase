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
        // `RL1E3-08`: `NSError.localizedDescription` renders "The operation
        // couldn’t be completed." with U+2019 on current iOS, so a needle
        // carrying the straight glyph could never match its own subject.
        #expect(!message.contains("be completed"))
    }

    /// `RL1E3-06`: `ARPlacementManager.errorMessage` is set at `:133` and read
    /// by no view in the target, so this is a landmine rather than a live
    /// defect — one `Text(manager.errorMessage ?? "")` away from being `C4-08`
    /// again, in the file `C4-08` is filed about.
    @Test("the AR load failure speaks in the app’s voice, not the SDK’s")
    func loadFailureMessageIsInTheAppVoice() throws {
        let source = try SourcePin.read("Patina/Features/ARPlacement/Services/ARPlacementManager.swift")
        #expect(!source.contains("\"Couldn't load 3D model\""))
        #expect(source.contains("\"We couldn’t load this piece. Try again.\""))
    }

    @Test("the toast renders the failure message with no additional prefix")
    func toastHasNoRedundantPrefix() throws {
        let source = try SourcePin.read("Patina/Features/ARPlacement/Views/ARPlacementView.swift")
        #expect(source.contains("toastPill(text: msg, tint: PatinaColors.clay)"))
        #expect(!source.contains("\"Save failed: \\(msg)\""))
    }
}
