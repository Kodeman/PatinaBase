//
//  SelectedStateTests.swift
//  PatinaTests
//
//  `C3-05`. "White/off-white labels on `clay` fills are 2.33:1 across ~15
//  selected-state controls." Round one fixed two of them — `PatinaButton`'s
//  `.clay` case and `TierPill` — created `clayInk` for exactly this shape, and
//  then left `clayInk` with **zero call sites** while the other thirteen kept
//  painting a light label on the brand accent.
//
//  The finding's fix line offers two routes: through `PatinaButton(.primary)`
//  (charcoal + inverse), or "use clayDeep for filled selection". `clayDeep` is
//  3.54:1 under `offWhite` and so cannot carry a light label either; `clayInk`
//  is that route taken to a value that actually clears the bar.
//

import Testing
import SwiftUI
import Foundation
@testable import Patina

struct SelectedStateTests {

    /// The token that exists for a filled surface carrying a light label.
    @Test("the filled-accent token can actually carry a light label, in both appearances")
    func theFilledAccentCarriesALightLabel() {
        for style in PatinaContrast.appearances {
            let measured = PatinaContrast.ratio(
                PatinaColors.offWhite, on: PatinaColors.clayInk, style
            )
            #expect(
                measured >= 4.5,
                "offWhite on clayInk in \(PatinaContrast.name(style)) is \(PatinaContrast.rounded(measured)):1"
            )
        }
    }

    /// The two values `C3-05` measured, kept as counterfactuals so a future
    /// "just use the accent" is met with the number rather than an opinion.
    @Test("clay and clayDeep still cannot carry a light label")
    func theAccentsStillCannotCarryALightLabel() {
        let clay = PatinaContrast.ratio(PatinaColors.offWhite, on: PatinaColors.clay, .light)
        let clayDeep = PatinaContrast.ratio(PatinaColors.offWhite, on: PatinaColors.clayDeep, .light)
        #expect(clay < 4.5, "offWhite on clay is now \(PatinaContrast.rounded(clay)):1 — if this passes, C3-05's premise changed")
        #expect(clayDeep < 4.5, "offWhite on clayDeep is now \(PatinaContrast.rounded(clayDeep)):1")
    }

    /// The sweep itself: nowhere in the app does a `clay` or `clayDeep` **fill**
    /// sit within a few lines of a light label.
    ///
    /// A source pin rather than a render, because the shape is a pairing across
    /// two modifiers and there is no runtime object that holds both. The window
    /// is deliberately generous — a false positive here is a comment away from
    /// being fixed, and a false negative is a 2.18:1 button on a tester's phone.
    @Test("no filled control pairs a light label with the raw brand accent")
    func noLightLabelRidesOnTheRawAccent() {
        let lightInk = [
            "PatinaColors.offWhite",
            "PatinaColors.Text.inverse",
            "PatinaColors.OnDark.primary"
        ]
        var offenders: [String] = []

        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let lines = source.components(separatedBy: "\n")
            for (index, line) in lines.enumerated() {
                let isAccentFill =
                    (line.contains("PatinaColors.clay)") || line.contains("PatinaColors.clayDeep)"))
                    && (line.contains("fill(") || line.contains("background("))
                guard isAccentFill else { continue }
                // A track, a dot or a progress bar carries no label; the window
                // is what tells them apart.
                let lower = max(0, index - 7)
                let upper = min(lines.count - 1, index + 7)
                let window = lines[lower...upper].joined(separator: "\n")
                if lightInk.contains(where: window.contains) {
                    offenders.append("\((path as NSString).lastPathComponent):\(index + 1)")
                }
            }
        }

        // `AuthenticationView.swift` is L1-A's file and L1-A restructured it in
        // this wave; its inverted enabled/disabled affordance goes back as
        // integration note D→A-6 rather than as a conflicting edit here.
        let routedToL1A = offenders.filter { $0.hasPrefix("AuthenticationView.swift") }
        let mine = offenders.filter { !$0.hasPrefix("AuthenticationView.swift") }

        #expect(
            mine.isEmpty,
            "a light label still rides on the raw brand accent at: \(mine.joined(separator: ", ")) — C3-05 measured this shape at 2.33:1"
        )
        #expect(
            routedToL1A.count <= 1,
            "more sites moved into L1-A's auth file than D→A-6 describes: \(routedToL1A.joined(separator: ", "))"
        )
    }

    /// `RL1D-10`. The purchase bar's secondary button was filled with
    /// `Interactive.active` when saved — the same fill and the same label
    /// colour as the primary Buy capsule beside it, so one bar carried two
    /// identical commitment buttons.
    @Test("the purchase bar has exactly one filled commitment button")
    func thePurchaseBarHasOneFilledButton() throws {
        let source = try SourcePin.read("Patina/Features/Purchase/PurchaseActionBar.swift")
        let filled = source.components(separatedBy: "PatinaColors.Interactive.active").count - 1
        #expect(
            filled == 1,
            "the purchase bar paints \(filled) controls in the primary fill — the saved 'Add to room' pill must stay an outline"
        )
    }
}
