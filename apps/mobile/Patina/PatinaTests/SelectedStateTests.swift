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
    /// `RL1D-R3-13`. The first version of this pin matched only
    /// `PatinaColors.clay)` — with the closing paren — so a ternary
    /// (`isSelected ? PatinaColors.clay : …`) was invisible to it, and the
    /// light-ink list held only the three named tokens, so a bare SwiftUI
    /// `.white` was invisible too. Both live `C3-05` sites were exactly that
    /// shape, and the suite was green over them for a whole round. The accent
    /// is matched wherever an expression can end — `)`, `,`, ` :`, or the end
    /// of the line — and `.white` is in the list, because the finding's own
    /// words are "white/off-white labels on clay fills".
    private static func namesTheRawAccent(_ line: String) -> Bool {
        for token in ["PatinaColors.clayDeep", "PatinaColors.clay"] {
            var rest = Substring(line)
            while let hit = rest.range(of: token) {
                let after = rest[hit.upperBound...]
                let next = after.first
                // `clay` must not be the prefix of `clayDeep` / `clayInk`.
                let isWholeToken = next.map { !$0.isLetter && $0 != "_" } ?? true
                if isWholeToken {
                    if next == nil || next == ")" || next == "," || next == " " || next == "\n" {
                        return true
                    }
                }
                rest = after
            }
        }
        return false
    }

    @Test("no filled control pairs a light label with the raw brand accent")
    func noLightLabelRidesOnTheRawAccent() {
        let lightInk = [
            "PatinaColors.offWhite",
            "PatinaColors.Text.inverse",
            "PatinaColors.OnDark.primary",
            ".white",
            "Color.white"
        ]
        var offenders: [String] = []

        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let source = SourcePin.code(raw)
            let lines = source.components(separatedBy: "\n")
            for (index, line) in lines.enumerated() {
                guard Self.namesTheRawAccent(line) else { continue }

                // A `.fill(` is a shape a label is drawn into — look forward,
                // and not far, so a `Capsule().fill(clay)` that is a progress
                // track stays out of the results. Unless the fill is inside a
                // `.background { … }` block, in which case the label is above
                // it and the window has to reach back past the opening line:
                // `MoveOrCopyItemSheet`'s selected mode button is exactly that
                // shape, five lines below its own `.foregroundStyle`.
                let opensABackground = (max(0, index - 3)..<index)
                    .contains { lines[$0].contains("background(") }
                let range: ClosedRange<Int>
                if line.contains("background(") || opensABackground {
                    range = max(0, index - 8)...min(lines.count - 1, index + 2)
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

        // Three files carry a `C3-05` site that is closed on ANOTHER LANE'S
        // BRANCH and open on this one, because this branch is cut from `main`.
        // Editing them here is a merge conflict over a fix that already exists,
        // and — for `RoomTypePillRow` — over one whose exact final text has
        // already been written and sent. Each allowance is a count, not a
        // silence: a second site appearing in any of them fails, and all three
        // go to zero on the integration tip. This is not a standing exemption.
        //
        //   AuthenticationView.swift  — `C3-06`, TWO sites: the OTP Verify
        //     button (a multiline ternary the old heuristic could not see) and
        //     the main submit button. Both are `Text.inverse` on a `clay`
        //     disabled fill; both are closed on `w1-l1a`, where the only
        //     surviving `clay` is decorative `.opacity()`. L1-A merges 5th.
        //   StyleQuizView.swift       — two selection controls, closed on
        //     `w1-l1a`: L1-A moved them to `StyleQuizView+Questions.swift` on
        //     `Interactive.active` + `Text.inverse` and pinned them with
        //     `QuizIconographyTests.noLightLabelSitsOnClay` (note D-L1A-5).
        //   RoomTypePillRow.swift     — L1-C's by name, and L1-C merges FIRST.
        //     Notes `D→C-6` and `D→C-7` carry the exact final lines; L1-C could
        //     not apply them because the tokens do not exist on its base.
        // At merge 6 all three ceilings are **zero**, as the paragraph above
        // promised: `w1-l1a` is on the tip (AuthenticationView's surviving
        // `clay` is decorative `.opacity()`, and StyleQuizView's is a progress
        // track), and L1-C's RoomTypePillRow carries D→C-6 / D→C-7. The rows
        // stay as named ratchets rather than being deleted, so a site coming
        // back in any of the three is a failure with its history attached.
        let deferred = [
            ("AuthenticationView.swift", 0, "C3-06 ×2, closed on w1-l1a"),
            ("StyleQuizView.swift", 0, "closed on w1-l1a, note D-L1A-5"),
            ("RoomTypePillRow.swift", 0, "L1-C's file, notes D→C-6 / D→C-7")
        ]
        let deferredNames = deferred.map(\.0)
        let mine = offenders.filter { name in
            !deferredNames.contains { name.hasPrefix($0) }
        }

        #expect(
            mine.isEmpty,
            "a light label still rides on the raw brand accent at: \(mine.joined(separator: ", ")) — C3-05 measured this shape at 2.33:1"
        )
        for (file, ceiling, why) in deferred {
            let hits = offenders.filter { $0.hasPrefix(file) }
            #expect(
                hits.count <= ceiling,
                "more C3-05 sites appeared in \(file) than the \(ceiling) deferred to its owner (\(why)): \(hits.joined(separator: ", "))"
            )
        }
    }

    /// `RL1D-10`. The purchase bar's secondary button was filled with
    /// `Interactive.active` when saved — the same fill and the same label
    /// colour as the primary Buy capsule beside it, so one bar carried two
    /// identical commitment buttons.
    @Test("the purchase bar has exactly one filled commitment button")
    func thePurchaseBarHasOneFilledButton() throws {
        let source = try SourcePin.readCode("Patina/Features/Purchase/PurchaseActionBar.swift")
        let filled = source.components(separatedBy: "PatinaColors.Interactive.active").count - 1
        #expect(
            filled == 1,
            "the purchase bar paints \(filled) controls in the primary fill — the saved 'Add to room' pill must stay an outline"
        )
    }
}
