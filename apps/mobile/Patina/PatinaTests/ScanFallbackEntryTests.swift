//
//  ScanFallbackEntryTests.swift
//  PatinaTests
//
//  The three ⇧D12 blockers on the non-LiDAR path — the path What to Test
//  item 6 sends a round-one client down in week one.
//
//  GAP4-02: `describe_screen` on the mounted fallback entry returned 24
//  nodes and not one dismiss control; two interactive-pop attempts left the
//  screen unmoved.
//  GAP4-03: the dimension fields rendered 18 and 14 as if typed, with the
//  clay "valid" stroke, and Continue was enabled on arrival — so the fastest
//  path wrote a room measuring 18 × 14 ft that nobody entered.
//  GAP4-25: Rescan on the floor plan produced an empty cream screen whose
//  accessibility tree was a single node; nothing but a force-quit recovered.
//

import Foundation
import Testing
@testable import Patina

struct ScanFallbackEntryTests {

    private func entrySource() throws -> String {
        try SourcePin.read("Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift")
    }

    private func hostSource() throws -> String {
        try SourcePin.read("Patina/Features/RoomScan/Views/QuietConversationFlowHost.swift")
    }

    private func manualEntrySource() throws -> String {
        try SourcePin.read("Patina/Features/Rooms/Views/ManualRoomEntryView.swift")
    }

    // MARK: - GAP4-03: no developer defaults in a person's room

    @Test
    func theDimensionFieldsStartEmpty() throws {
        let source = try entrySource()
        #expect(source.contains(#"@State private var length: String = """#))
        #expect(source.contains(#"@State private var width: String = """#))
        #expect(source.contains(#"length: String = "18""#) == false)
        #expect(source.contains(#"width: String = "14""#) == false)
    }

    /// `isValid` is what gates the CTA, and an empty field must not pass it.
    @Test
    func continueIsDisabledUntilBothDimensionsAreEntered() {
        #expect(ScanFallbackEntryView.dimensionsAreValid(length: "", width: "") == false)
        #expect(ScanFallbackEntryView.dimensionsAreValid(length: "18", width: "") == false)
        #expect(ScanFallbackEntryView.dimensionsAreValid(length: "", width: "14") == false)
        #expect(ScanFallbackEntryView.dimensionsAreValid(length: "0", width: "14") == false)
        #expect(ScanFallbackEntryView.dimensionsAreValid(length: "abc", width: "14") == false)
        #expect(ScanFallbackEntryView.dimensionsAreValid(length: "18", width: "14"))
    }

    /// The field carries a placeholder, so an empty box still says what it
    /// wants — `TextField("", …)` is a blank box with a floating caption.
    @Test
    func theFieldsCarryAPlaceholder() throws {
        let source = try entrySource()
        #expect(source.contains(#"TextField(title, text: text)"#))
        #expect(source.contains(#"TextField("", text: text)"#) == false)
    }

    // MARK: - GAP4-03, the second door: manual entry

    /// `ScanFallbackEntryView` is one of two ways into a hand-entered room.
    /// The other is Your Spaces → "Add a room" → "Enter manually", which is
    /// the same sheet and carried the same two literals — 18 and 14, written
    /// through `createManualRoom(…, measuredWithUnitControl: true)`, i.e. as
    /// measured fact (review `RL1B3-01`).
    @Test
    func theManualEntryFieldsStartEmpty() throws {
        let source = try manualEntrySource()
        #expect(source.contains(#"@State private var lengthFeet: String = """#))
        #expect(source.contains(#"@State private var widthFeet: String = """#))
        #expect(source.contains(#"lengthFeet: String = "18""#) == false)
        #expect(source.contains(#"widthFeet: String = "14""#) == false)
    }

    @Test
    func manualSaveIsDisabledUntilBothDimensionsAreEntered() {
        #expect(ManualRoomEntryView.dimensionsAreValid(length: "", width: "") == false)
        #expect(ManualRoomEntryView.dimensionsAreValid(length: "18", width: "") == false)
        #expect(ManualRoomEntryView.dimensionsAreValid(length: "", width: "14") == false)
        #expect(ManualRoomEntryView.dimensionsAreValid(length: "0", width: "14") == false)
        #expect(ManualRoomEntryView.dimensionsAreValid(length: "abc", width: "14") == false)
        #expect(ManualRoomEntryView.dimensionsAreValid(length: "18", width: "14"))
    }

    /// The gate has to be wired to the control, not merely available.
    @Test
    func theManualSaveButtonIsWiredToThatGate() throws {
        let source = try manualEntrySource()
        #expect(source.contains(".disabled(!isValid)"))
        #expect(source.contains("Self.dimensionsAreValid(length: lengthFeet, width: widthFeet)"))
    }

    /// An empty box still has to say what it wants.
    @Test
    func theManualDimensionFieldsCarryAPlaceholder() throws {
        let source = try manualEntrySource()
        #expect(source.contains("TextField(label, text: value)"))
    }

    // MARK: - GAP4-02: a way out of the fallback

    /// Round 3 gated the control on two of eight steps. On the shipped
    /// four-tab root the tab bar is the escape from the other six, but D1
    /// keeps the flags-off root as the kill switch and there it is not — so
    /// the style, reveal, soft-landing, floor-plan and threshold steps were
    /// the dead end GAP4-02 describes (review `RL1B3-10`).
    ///
    /// Written as an exclusion list on purpose: a step added later gets the
    /// way out by default, which is the failure this finding is.
    @Test
    func theHostShowsALeaveControlOnEveryStepThatHasNoOtherWayOut() throws {
        let source = try hostSource()
        #expect(source.contains("QuietConversationFlowHost.LeaveButton"))
        #expect(source.contains(#"Button("Not now") { leaveFlow(landingOn: .heroFrame) }"#))
        // The old two-step allow-list is gone.
        #expect(source.contains("step == .fallback || step == .initial") == false)
        // `.savedConfirmation` is the one step with its own exit, and it is
        // named as the exception rather than the rest being enumerated.
        #expect(source.contains("step != .savedConfirmation"))

        // Every case in the step enum, so the exclusion cannot silently grow.
        let steps = try #require(
            source.components(separatedBy: "enum InternalFlowStep: Equatable {").last?
                .components(separatedBy: "\n    }").first
        )
        for step in [
            "initial", "threshold", "fallback", "savedConfirmation",
            "softLanding", "conversation", "reveal", "floorPlan"
        ] {
            #expect(steps.contains("case \(step)"))
        }
    }

    // MARK: - GAP4-25: Rescan re-enters the flow

    @Test
    func rescanBootstrapsInsteadOfStrandingTheFlow() throws {
        let source = try hostSource()
        let reset = try #require(
            source.components(separatedBy: "private func resetForRescan() {").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(reset.contains("step = .initial"))
        #expect(reset.contains("bootstrap()"))
    }

    /// `.initial` has to look like something while `bootstrap()` decides.
    @Test
    func theInitialStepDrawsARealWaitingState() throws {
        let source = try hostSource()
        #expect(source.contains("QuietConversationFlowHost.Initial"))
        #expect(source.contains(#"Text("Getting ready…")"#))
    }

    // MARK: - C4-09: the copy function a view body calls is pure

    /// It logged the raw error, and `ScanUploadProgressView` calls it from
    /// inside its body — so a failed upload logged its storage/Postgres text
    /// once per layout pass instead of once per failure. The log belongs
    /// where `lastError` is written (review RL1B-17).
    @Test
    func theFailureCopyDoesNotLogFromTheViewBody() throws {
        let copy = try SourcePin.read(
            "Patina/Features/RoomScan/Shared/Components/ScanUploadFailureCopy.swift"
        )
        let body = try #require(copy.components(separatedBy: "enum ScanUploadFailureCopy {").last)
        #expect(body.contains("PatinaLog") == false)

        let model = try SourcePin.read("Patina/Core/Models/RoomScanPackage.swift")
        let markFailed = try #require(
            model.components(separatedBy: "public func markFailed(").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(markFailed.contains("PatinaLog.sync.error"))
    }

    /// The classification itself is unchanged by the move.
    @Test
    func theTwoFailureSentencesStillClassify() {
        #expect(
            ScanUploadFailureCopy.message(forRawError: "The Internet connection appears to be offline.")
                == ScanUploadFailureCopy.connection
        )
        #expect(
            ScanUploadFailureCopy.message(forRawError: "duplicate key value violates unique constraint")
                == ScanUploadFailureCopy.unfinished
        )
    }

    /// At `accessibility-extra-large` the three-across room-type grid is
    /// narrower than its own words and the cells read "Bedroo m" (review
    /// `RL1B2-18`, shot 24). Same defect class as `C6-18` on
    /// `RoomTypePillRow`, in a second grid this lane owns.
    @Test
    func theRoomTypeCellsSurviveAccessibilitySizes() throws {
        let view = try SourcePin.read("Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift")
        let grid = try #require(
            view.components(separatedBy: "private var roomTypeGrid: some View {").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(grid.contains(".lineLimit(1)"))
        #expect(grid.contains(".minimumScaleFactor("))
    }
}
