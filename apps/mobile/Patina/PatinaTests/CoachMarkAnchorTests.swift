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

import CoreGraphics
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
        let frame = code.range(of: "frame(width: maxWidth")
        #expect(fixedSize != nil && frame != nil)
        if let fixedSize, let frame {
            #expect(fixedSize.lowerBound < frame.lowerBound,
                    "the frame still wins over the text's own height (B-07)")
        }
        // …and the width has to be FIXED, not a maximum. A popover measures its
        // content with a nil proposal; `maxWidth:` passes that nil straight
        // through, so `Text` answered with its single-line ideal height and the
        // bubble was built to it — which is why the walk still found the copy
        // clipped top and bottom on Today AND on Spaces after the reorder.
        #expect(!code.contains("frame(maxWidth: maxWidth"),
                "the bubble's width is still only a maximum (B-07)")
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

    // MARK: - B-10's dim half

    /// The card places correctly and the target stays visible — and the walk
    /// still found step 1 drawn over two live record rows with no dim and no
    /// cut-out, which is the other half of the prescribed fix. A reader told to
    /// look at one thing, with three things under the card all looking equally
    /// live, has been given a coach mark that explains nothing.
    @Test("the tour dims what it is not naming, and punches out what it is")
    @MainActor
    func theTourScrimHighlightsItsSubject() {
        let model = FirstLaunchTourModel()
        // Nothing is showing, so nothing is dimmed.
        #expect(model.highlightRect == nil)

        model.startTour(triggerSource: "test")
        // Still nothing: the anchor has not reported a frame yet, and a scrim
        // with no cut-out would dim the subject along with everything else.
        #expect(model.highlightRect == nil)

        let subject = CGRect(x: 20, y: 118, width: 205, height: 59)
        model.reportAnchorFrame(.homeGreeting, rect: subject)
        #expect(model.highlightRect == subject)

        // Another anchor's frame is not the current step's subject.
        model.reportAnchorFrame(.profileMonogram, rect: CGRect(x: 0, y: 700, width: 40, height: 40))
        #expect(model.highlightRect == subject)

        // And a suspended tour dims nothing at all — the same rule the card
        // follows when its surface leaves.
        model.setSubjectOnScreen(false)
        #expect(model.highlightRect == nil)
    }

    @Test("the scrim is drawn, is a cut-out, and never eats a tap")
    func theScrimIsACutOutAndNotAControl() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        #expect(code.contains("FirstLaunchTourScrim"),
                "the tour still draws its card over undimmed live content (B-10)")
        #expect(code.contains(".blendMode(.destinationOut)"),
                "the scrim dims the subject along with everything else (B-10)")
        #expect(code.contains(".compositingGroup()"),
                "a destination-out blend with no compositing group punches the whole window")
        #expect(code.contains(".allowsHitTesting(false)"),
                "the scrim would change what an outside tap does")
    }

    // MARK: - B-10's tab half (RL1C-16)

    @Test("a suspended tour shows no card")
    @MainActor
    func aSuspendedTourShowsNoCard() {
        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "test")
        #expect(model.isActive)
        #expect(model.isShowingPopover(forAnchor: .homeGreeting))

        // Switching to Spaces left step 1 ("This is your Daily Room…") sitting
        // squarely on the Whole Home card it does not describe: `.homeGreeting`
        // lives in `DailyRoomView`, which stays mounted at opacity 0 behind the
        // Spaces stack, so the popover anchored to a hidden frame
        // (shots/w1-review-l1c/17-popover.png).
        model.setSubjectOnScreen(false)
        #expect(!model.isShowingPopover(forAnchor: .homeGreeting),
                "the tour still draws over the tab it is not describing (B-10)")

        // Suspension is not abandonment: the tour is still running and comes
        // back when its subject does. `skip()` would persist `abandoned` and
        // the tester would never see it again.
        #expect(model.isActive)
        model.setSubjectOnScreen(true)
        #expect(model.isShowingPopover(forAnchor: .homeGreeting))
    }

    @Test("both roots publish their visibility into the tour, not only into its start gate")
    func bothRootsTellTheTourWhenTheirSurfaceLeaves() throws {
        let tour = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        // `canAutoStart` is the hosts' own "my surface is on screen" signal —
        // `tabs.isShowingTodayRoot` on the four-tab root, `navigationPath.isEmpty`
        // on the flag-off one. It gated only the START; the same answer is what
        // decides whether a card may draw.
        #expect(tour.contains("onChange(of: canAutoStart"),
                "the model is never told the host's surface went away (B-10)")
        #expect(tour.contains("setSubjectOnScreen("))
    }
}
