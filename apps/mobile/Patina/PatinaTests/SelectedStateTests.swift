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
    /// carry a light label.
    ///
    /// A source pin rather than a render, because the shape is a pairing across
    /// two modifiers and there is no runtime object that holds both. The two
    /// shapes are read differently, which is what keeps a progress bar out of
    /// the results:
    ///
    /// - `.background(accent)` is a modifier **on the label**, so the label is
    ///   above it — look back.
    /// - `.fill(accent)` is a shape that a label is drawn **into**, by an
    ///   `.overlay` or as the next sibling in a `ZStack` — look forward, and
    ///   not far. A `Capsule().fill(clay)` whose next lines are a `.frame` and
    ///   a closing brace is a track or a progress fill: it has no label, and
    ///   the 4.5:1 bar does not apply to it.
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
                let isAccent =
                    line.contains("PatinaColors.clay)") || line.contains("PatinaColors.clayDeep)")
                guard isAccent else { continue }

                let range: ClosedRange<Int>
                if line.contains("background(") {
                    range = max(0, index - 5)...min(lines.count - 1, index + 2)
                } else if line.contains("fill(") {
                    range = index...min(lines.count - 1, index + 5)
                } else {
                    continue
                }

                let window = lines[range].joined(separator: "\n")
                if lightInk.contains(where: window.contains) {
                    offenders.append("\((path as NSString).lastPathComponent):\(index + 1)")
                }
            }
        }

        // The auth form's inverted enabled/disabled affordance (`C3-06`) is the
        // one remaining site, and it is not this branch's to fix:
        // `AuthenticationView.swift` is L1-A's, L1-A restructured it in this
        // wave, and L1-A has **already closed it** on `first-flight/w1-l1a`
        // (`.background(PatinaColors.Interactive.active)`, with the finding
        // named in a comment above it). Editing it here would be a merge
        // conflict over a fix that already exists. The allowance goes to zero
        // on the integration tip; it is not a standing exemption.
        let inL1AsAuthForm = offenders.filter { $0.hasPrefix("AuthenticationView.swift") }
        let mine = offenders.filter { !$0.hasPrefix("AuthenticationView.swift") }

        #expect(
            mine.isEmpty,
            "a light label still rides on the raw brand accent at: \(mine.joined(separator: ", ")) — C3-05 measured this shape at 2.33:1"
        )
        #expect(
            inL1AsAuthForm.count <= 1,
            "more sites appeared in L1-A's auth form than the one C3-06 names: \(inL1AsAuthForm.joined(separator: ", "))"
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
