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

    // MARK: - GAP4-02: a way out of the fallback

    @Test
    func theHostShowsALeaveControlOnTheFallbackStep() throws {
        let source = try hostSource()
        #expect(source.contains("QuietConversationFlowHost.LeaveButton"))
        #expect(source.contains("step == .fallback || step == .initial"))
        #expect(source.contains(#"Button("Not now") { leaveFlow(landingOn: .heroFrame) }"#))
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
}
