//
//  BorderTokenAdoptionTests.swift
//  PatinaTests
//
//  `C3-01`. `pearl` is a flat sRGB literal used 93× as the app's border and
//  divider colour. On the light canvas it is the 1.21:1 whisper it was drawn
//  to be; on the dark canvas it is 12.84:1 — every card border, list
//  separator, chip outline, field stroke and the tab bar's top rule is the
//  brightest thing on the screen.
//
//  The semantic layer that replaces it is pinned by `DynamicTokenTests`. This
//  suite pins the sweep itself, at its exit criterion: zero call sites outside
//  the token file, app-wide.
//

import Testing
import Foundation
@testable import Patina

struct BorderTokenAdoptionTests {

    /// The one place outside the token file that may still name `pearl`.
    ///
    /// `PatinaGradients.earth` composes it as a **gradient stop** — a colour in
    /// a decorative ramp, not a rule, not ink, and not a thing a contrast bar
    /// applies to. Named here so "zero call sites" means what it says and the
    /// exception is a decision rather than a leftover.
    private static let gradientStopException =
        "Tokens/PatinaGradients.swift"

    /// The field's resting outline, asserted by behaviour rather than by
    /// grep: it never contained `pearl`, so the string check below passed
    /// vacuously on it while the real border stayed `clay.opacity(0.2)`.
    @Test("the text field's resting outline is a border token, not a tinted accent")
    func theTextFieldOutlineIsABorderToken() throws {
        let source = try SourcePin.read(
            "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaTextField.swift"
        )
        #expect(
            source.contains("PatinaColors.Border.strong"),
            "PatinaTextField's outline does not use a Border token — a field's edge is the rule a tester is most meant to see"
        )
        #expect(
            !source.contains("PatinaColors.clay.opacity"),
            "PatinaTextField still outlines with a clay tint, which composites toward the light clay on the dark canvas"
        )
    }

    /// `C3-01`'s exit criterion, as an assertion: **zero**.
    ///
    /// The first round of this lane left 80 of the 93 and routed the rest to
    /// four other lanes as integration notes. The lane that merges first
    /// applied none of them, so the sweep happens here — which is what
    /// PROGRAM.md §3's own merge-order rationale expects when it puts L1-D
    /// second "because its token changes are the other whole-app sweep".
    @Test("pearl has no call sites outside the token file")
    func pearlHasNoCallSitesOutsideTheTokenFile() {
        var offenders: [String] = []
        for path in SourcePin.swiftFiles(under: "Patina")
            + SourcePin.swiftFiles(under: "../PatinaDesignKit/Sources/PatinaDesignKit") {
            if path.hasSuffix("Tokens/PatinaColors.swift") { continue }
            if path.hasSuffix(Self.gradientStopException) { continue }
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let count = source.components(separatedBy: "PatinaColors.pearl").count - 1
            if count > 0 {
                offenders.append("\((path as NSString).lastPathComponent) ×\(count)")
            }
        }
        #expect(
            offenders.isEmpty,
            "PatinaColors.pearl is still painted at: \(offenders.joined(separator: ", ")) — C3-01's exit criterion is zero"
        )
    }

    /// `pearl` itself stays: 13 of its 93 sites use it as light ink on a
    /// surface that is dark in both appearances, and flipping the literal would
    /// blank them. Stated here so "sweep pearl" never becomes "make pearl
    /// dynamic" by accident.
    @Test("pearl is still a light-palette literal, on purpose")
    func pearlIsStillALiteral() {
        #expect(
            !PatinaContrast.isAdaptive(PatinaColors.pearl),
            "pearl became adaptive — that flips 13 light-ink-on-dark-surface call sites to invisible in dark mode. Sweep the borders to Border.hairline instead."
        )
    }
}
