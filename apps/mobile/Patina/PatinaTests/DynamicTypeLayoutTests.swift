//
//  DynamicTypeLayoutTests.swift
//  PatinaTests
//
//  `C-06` / `GAP1B-03`. At XXXL the Today headline read "Good / afternoo / n."
//  and at AX-XXXL it read "Go / od / aft / er / no / on." over six lines. The
//  cause is not the font: the greeting shares one horizontal band with the
//  bell / help / Studio cluster, so a serif h1 is offered ~150 pt and breaks
//  inside words. The fix is a layout answer, so the pin is a layout pin —
//  the band splits above `.accessibility1` and the greeting gets the width.
//

import SwiftUI
import Foundation
import Testing
@testable import Patina

@Suite("Dynamic Type layout")
struct DynamicTypeLayoutTests {

    // MARK: - The policy

    @Test("the header stacks above accessibility1 and only there")
    func theHeaderStacksAtAccessibilitySizes() {
        for size in [DynamicTypeSize.xSmall, .small, .medium, .large,
                     .xLarge, .xxLarge, .xxxLarge] {
            #expect(DailyGreetingHeader.stacksControls(at: size) == false,
                    "\(size) does not need the two-row header")
        }
        for size in [DynamicTypeSize.accessibility1, .accessibility2,
                     .accessibility3, .accessibility4, .accessibility5] {
            #expect(DailyGreetingHeader.stacksControls(at: size),
                    "\(size) leaves the greeting sharing a band with the controls")
        }
    }

    // MARK: - The source facts the policy rests on

    /// The modifier chain hanging off one `Text(…)`, i.e. everything between it
    /// and the next `Text(` in the same file.
    ///
    /// The first version of these pins asked the whole *file* whether it
    /// contained `minimumScaleFactor(` — which any of five `Text` views could
    /// satisfy, and which stayed green while the Companion panel and the bell
    /// badge still broke at accessibility sizes (`RL1C-14`). A chain-scoped
    /// read is the difference between "somebody in this file scales" and "this
    /// line scales".
    static func chain(after needle: String, in code: String) -> String {
        guard let start = code.range(of: needle)?.upperBound else { return "" }
        let rest = code[start...]
        if let next = rest.range(of: "Text(")?.lowerBound {
            return String(rest[..<next])
        }
        return String(rest)
    }

    @Test("the greeting itself can shrink rather than break inside a word")
    func theGreetingScalesBeforeItBreaks() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        )
        let greeting = Self.chain(after: "Text(greeting)", in: code)
        #expect(greeting.contains("minimumScaleFactor("),
                "the greeting has no scale floor, so it breaks mid-word (C-06)")
        #expect(greeting.contains("allowsTightening(true)"))

        // The date eyebrow broke too — "TUESDA / Y · / SEP 1".
        let eyebrow = Self.chain(after: "Text(dateString)", in: code)
        #expect(eyebrow.contains("lineLimit(1)"))
        #expect(eyebrow.contains("minimumScaleFactor("))
    }

    @Test("the Companion's own rows scale too — C-06's other half")
    func theCompanionRowsScaleBeforeTheyBreak() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Companion/Views/CompanionOverlay.swift")
        )
        // `C-06`'s evidence names the Companion panel twice
        // (36/37-ax3xl-companion). At accessibility-extra-large the row title
        // read "Your recommenda / tions" — the finding's exact fragment — while
        // only the Today header had been treated.
        for row in ["Text(label)", "Text(hint)"] {
            let chain = Self.chain(after: row, in: code)
            #expect(chain.contains("minimumScaleFactor("),
                    "the Companion row's \(row) still breaks inside a word (C-06)")
            #expect(chain.contains("allowsTightening(true)"))
        }
        // …and the modifiers alone are not the fix. `minimumScaleFactor` shrinks
        // text only to avoid TRUNCATION; with no `lineLimit` SwiftUI wraps
        // instead, so a row whose words are offered less width than one word
        // needs still breaks inside it. The row has to give the words the panel's
        // width above `.accessibility1` — the same answer the Today header takes.
        #expect(code.contains("if dynamicTypeSize.isAccessibilitySize {"),
                "the row never stacks, so its words keep a ~190 pt column (C-06)")
    }

    @Test("the Companion panel scrolls at accessibility sizes rather than hoping ViewThatFits notices")
    func theCompanionPanelScrollsWhenItMust() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Companion/Components/CompanionHearthView.swift")
        )
        // `ViewThatFits(in: .vertical)` only picks the scrolling arm when the
        // proposal it is handed is smaller than the column. On the walk the
        // panel clipped its last row ("BASED ON YOUR ROOMS") with no scroll, so
        // the proposal is not reliably the panel's real height. Above
        // `.accessibility1` the answer is not a guess: it always scrolls.
        #expect(code.contains("dynamicTypeSize.isAccessibilitySize"),
                "the panel does not read the text size, so its scroll is a hope (C-06)")
        // A ScrollView with no height of its own takes its column's, and
        // `shell` is a `.background` — so the rows drew straight out through
        // the panel's rounded bottom and over the tab bar, overlapping each
        // other (shots/w1-l1c/fx-06-companion-ax3xl-before.png). Two things fix
        // that and both are load-bearing: a ceiling gives the ScrollView
        // something to scroll inside, and a clip stops the overflow PAINTING —
        // `.frame(maxHeight:)` bounds layout, not drawing.
        #expect(code.contains("companionAccessibilityPanelCeiling"),
                "the panel has no ceiling, so it grows to its column instead of scrolling")
        #expect(code.contains(".clipShape(") && code.contains("maxHeight: dynamicTypeSize"),
                "the panel is bounded but not clipped, so its rows still paint through the shell")
    }

    @Test("the Companion panel's own header scales too")
    func theCompanionHeaderScalesBeforeItBreaks() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Companion/Components/CompanionHearthView.swift")
        )
        // "A considere / d next move" — the panel's detail line, on the app's
        // signature voice moment. Scoped to `headerText`, which is the two lines
        // the finding's screenshots caught; `Text(detail)` alone is ambiguous
        // (the collapsed progress view has one too, and it is `lineLimit`-ed
        // rather than scaled).
        //
        // The modifiers are half the fix: `expandedHeader` also has to give the
        // words the panel's width above `.accessibility1`, because a word wider
        // than its line breaks inside itself at any scale floor.
        let start = try #require(code.range(of: "private func headerText")?.upperBound)
        let header = String(code[start...].prefix(900))
        #expect(header.components(separatedBy: "minimumScaleFactor(").count - 1 >= 2,
                "the panel's title and detail still break inside a word (C-06)")
        #expect(header.components(separatedBy: "allowsTightening(true)").count - 1 >= 2)
        #expect(code.contains("if dynamicTypeSize.isAccessibilitySize {"),
                "the header never stacks, so its words keep a ~230 pt column (C-06)")
    }

    @Test("the unread badge does not outgrow the bell it marks")
    func theBadgeStaysAMarkOnItsControl() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        )
        // The bell is a fixed 17 pt glyph in a 36 pt frame. A badge capped at
        // `.xxxLarge` is still ~24 pt and covered roughly 85% of it
        // (shots/w1-review-l1c/10b-bell-badge-crop.png). `large` is the top of
        // the badge's own ramp: the count is announced by the button's
        // accessibilityValue, so nothing is lost by not growing it.
        #expect(code.contains(".dynamicTypeSize(...DynamicTypeSize.large)"),
                "the badge still grows past the bell (RL1C-04)")
        #expect(!code.contains(".dynamicTypeSize(...DynamicTypeSize.xxxLarge)"))
    }

    @Test("an informational record row is not a disabled control")
    func aRoutelessRecordRowKeepsItsContrast() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        )
        // D→C-8: SwiftUI renders a disabled button's label at roughly half
        // alpha, so a row with nowhere to go measured 4.27:1 on the app's home
        // screen in dark mode where a routed row measured 12.42:1. No token
        // value can fix that; the row has to stop being a dead control.
        #expect(!code.contains(".disabled(row.route == nil)"),
                "the routeless row is still a disabled Button, so it is still dimmed (C-20)")
        #expect(code.contains(".allowsHitTesting(row.route != nil)"),
                "withhold the tap without withholding the contrast")
        // VoiceOver must still not call it a button.
        #expect(code.contains("accessibilityAddTraits(row.route == nil ? [] : .isButton)"))
    }

    @Test("the header reads the text size instead of assuming one")
    func theHeaderReadsTheTextSize() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        )
        #expect(code.contains("@Environment(\\.dynamicTypeSize)"))
        #expect(code.contains("DailyGreetingHeader.stacksControls(at:")
                || code.contains("Self.stacksControls(at:"))
    }

    // MARK: - C-06's three remaining surfaces, walked at AX-XL

    /// "Design Developme / nt sign-off". The title and the type badge shared
    /// one row at every text size, so at an accessibility size the badge took
    /// the width the title needed and the title broke inside a word — on the
    /// list a client opens to answer the thing Procurement is waiting on.
    @Test("a decision card's title does not break mid-word")
    func theDecisionCardTitleStacksAtAccessibilitySizes() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionListView.swift")
        )
        #expect(code.contains("dynamicTypeSize.isAccessibilitySize"),
                "the card never stacks, so its title keeps fighting the badge (C-06)")
        #expect(code.contains("private func decisionTitle("))
        #expect(code.contains("private func decisionTypeBadge("))
        let title = try #require(code.range(of: "private func decisionTitle("))
        let block = String(code[title.lowerBound...].prefix(400))
        #expect(block.contains("minimumScaleFactor"),
                "the title has no scale floor (C-06)")
    }

    /// "TOTA / L" and "EXPI / RY", on the sheet where a client signs. The
    /// restated-terms label column was a hard 78 pt at every text size.
    @Test("the sign sheet's term labels keep a column they fit in")
    func theSignSheetLabelColumnScales() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Proposals/Views/ProposalSignSheet.swift")
        )
        #expect(!code.contains("frame(width: 78, alignment: .leading)"),
                "the label column is still a hard 78 pt (C-06)")
        #expect(code.contains("@ScaledMetric(relativeTo: .caption)"))
        #expect(code.contains("frame(width: labelColumnWidth, alignment: .leading)"))
    }

    /// "Recommende / d" — one word in a capsule, wrapped inside itself.
    @Test("the recommended badge is one line at every text size")
    func theRecommendedBadgeDoesNotWrap() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        let badge = try #require(code.range(of: "Text(\"Recommended\")"))
        let block = String(code[badge.lowerBound...].prefix(400))
        #expect(block.contains(".lineLimit(1)"), "the badge still wraps inside its word (C-06)")
        #expect(block.contains(".minimumScaleFactor("))
    }
}
