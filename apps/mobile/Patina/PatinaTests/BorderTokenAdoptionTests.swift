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
//  suite pins the sweep: zero in the files this lane owns, and a ratchet on the
//  rest, which reach four other lanes as integration notes.
//

import Testing
import Foundation
@testable import Patina

struct BorderTokenAdoptionTests {

    private static let ownedFiles = [
        "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift",
        "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaCard.swift",
        "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaTextField.swift",
        "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift",
        "Patina/Design/Components/TierPill.swift",
        "Patina/Features/Shared/Views/ProductCard.swift",
        "Patina/Features/StyleReveal/Views/RevealView.swift",
        "Patina/Features/Authentication/Views/SignInWithAppleButton.swift"
    ]

    /// `PatinaColors.pearl` references on this lane's base sha (`ba83aa67f`),
    /// excluding the token file that defines it: 93.
    private static let pearlCeiling = 93

    @Test("no file this lane owns paints a border with the light-only literal")
    func thisLaneUsesTheBorderTokens() throws {
        for path in Self.ownedFiles {
            let source = try SourcePin.read(path)
            #expect(
                !source.contains("PatinaColors.pearl"),
                "\(path) still borders with PatinaColors.pearl — C3-01"
            )
        }
    }

    /// The app-wide ratchet. It may only fall.
    @Test("the pearl call-site count never climbs")
    func thePearlCountNeverClimbs() {
        var total = 0
        for path in SourcePin.swiftFiles(under: "Patina")
            + SourcePin.swiftFiles(under: "../PatinaDesignKit/Sources/PatinaDesignKit") {
            if path.hasSuffix("Tokens/PatinaColors.swift") { continue }
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            total += source.components(separatedBy: "PatinaColors.pearl").count - 1
        }
        #expect(
            total <= Self.pearlCeiling,
            "PatinaColors.pearl call sites rose to \(total); the ceiling on this branch's base is \(Self.pearlCeiling)"
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
