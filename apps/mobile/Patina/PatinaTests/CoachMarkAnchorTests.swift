//
//  CoachMarkAnchorTests.swift
//  PatinaTests
//
//  A coach mark that covers what it is explaining is worse than no coach mark.
//
//   * `A-50` / `B-10` — the Companion's first-run card is drawn as an
//     `.overlay(alignment: .topLeading)` ON `CompanionHearthView` with
//     `.offset(y: -16)`, so it sits on the panel title, the first action row
//     and part of the close control while telling the reader to look at them.
//     (`B-10`'s other half, the tour popover, already places correctly —
//     `FirstLaunchTourPopoverPlacement` is not touched.)
//   * `B-07` / `C-18` — the inline help bubble is sized by a frame rather
//     than by its text: 86.3 pt of copy in a ~75 pt bubble, clipped at both
//     ends, translucent enough to read the greeting through, and its trigger
//     is an `.onTapGesture`, which VoiceOver cannot activate.
//

import Foundation
import Testing
@testable import Patina

@Suite("Coach marks and tooltips")
struct CoachMarkAnchorTests {

    // MARK: - A-50 / B-10

    @Test("the Companion coach mark is a sibling above the panel, not an overlay on it")
    func theCompanionCoachMarkDoesNotCoverThePanel() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Companion/Views/CompanionOverlay.swift")
        )
        #expect(!code.contains(".offset(y: -16)"),
                "the coach mark is still offset onto the panel (A-50)")
        // It now takes the slot the intro bubble takes — above the Hearth in
        // the same VStack, so the panel it describes stays visible.
        #expect(code.contains("coachmarkBubbleView"),
                "the coach mark is not mounted above the Hearth (A-50, B-10)")
    }

    @Test("the coach mark keeps its own way out")
    func theCoachMarkKeepsItsDismiss() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Companion/Views/CompanionOverlay.swift")
        )
        #expect(code.contains("dismissCoachmark()"))
        #expect(code.contains("\"Got it\""))
    }

    // MARK: - B-07 / C-18

    @Test("the tooltip bubble is sized by its text, not by a frame")
    func theTooltipIsSizedByItsText() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/Views/HelpTooltip.swift")
        )
        // `fixedSize` has to run on the text before any frame narrows it,
        // otherwise the bubble keeps the height the frame proposed and the
        // copy is clipped top and bottom.
        let fixedSize = code.range(of: "fixedSize(horizontal: false, vertical: true)")
        let frame = code.range(of: "frame(maxWidth: maxWidth")
        #expect(fixedSize != nil && frame != nil)
        if let fixedSize, let frame {
            #expect(fixedSize.lowerBound < frame.lowerBound,
                    "the frame still wins over the text's own height (B-07)")
        }
        #expect(code.contains("padding(.vertical, 14)"),
                "the bubble has no vertical breathing room (B-07)")
        #expect(code.contains("PatinaColors.Background.primary"),
                "the bubble is still translucent over live content (C-18)")
    }

    @Test("the tooltip trigger is reachable by VoiceOver")
    func theTooltipTriggerIsReachable() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/Views/HelpTooltip.swift")
        )
        // `.onTapGesture` alone exposes no activate action, which is why the
        // trigger measured unreachable (C-18).
        #expect(code.contains("accessibilityAction"),
                "the trigger still has no activate action (C-18)")
    }

    @Test("a help icon can name its own subject")
    func helpIconsCanNameTheirSubject() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/Views/HelpInfoIcon.swift")
        )
        #expect(code.contains("accessibilityLabel: String"))
    }
}
