//
//  TypographyAdoptionTests.swift
//  PatinaTests
//
//  `C3-15`. 46 inline `.font(.custom("Face", size:))` calls bypass
//  `PatinaTypography`, and one of them names `PlayfairDisplay-Light` — a face
//  the app does not ship. `Font.custom` with an unresolvable PostScript name
//  falls back to the system face silently, so the Reveal's 42 pt aesthetic-name
//  hero renders in San Francisco and nothing says so.
//
//  The first assertion is the one that catches that class of bug for good: it
//  registers the vendored faces the way the app does at launch and asks UIKit
//  whether every name the source asks for actually resolves.
//

import Testing
import Foundation
import UIKit
@testable import Patina

struct TypographyAdoptionTests {

    /// Files this lane owns. A `.font(.custom(` here is a regression, not a
    /// backlog item.
    private static let ownedFiles = [
        "Patina/Features/StyleReveal/Views/RevealView.swift",
        "Patina/Features/Shared/Views/ProductCard.swift",
        "Patina/Design/Components/TierPill.swift",
        "Patina/Features/Authentication/Views/SignInWithAppleButton.swift"
    ]

    /// C3-15's exit criterion: **zero** inline `.font(.custom(` in
    /// `Features/**` and `Design/**`. The count on this lane's base sha
    /// (`ba83aa67f`) was 47; round one left 44 and routed the rest as notes to
    /// lanes that did not schedule them. `disallow_font_custom_in_features` is
    /// the SwiftLint half of the same bar.
    private static let inlineFontCeiling = 0

    private static func postScriptNames(in source: String) -> [String] {
        var names: [String] = []
        var rest = Substring(source)
        while let marker = rest.range(of: ".font(.custom(\"") {
            rest = rest[marker.upperBound...]
            guard let close = rest.firstIndex(of: "\"") else { break }
            names.append(String(rest[rest.startIndex..<close]))
            rest = rest[close...]
        }
        return names
    }

    /// Every PostScript name an inline call site asks for. The token file's
    /// own faces are pinned by name in `theKitShipsWhatItNames`, because it
    /// builds them by concatenation and a parse of that expression would be
    /// the fragile half of this suite.
    private static func everyRequestedFace() -> Set<String> {
        var names: Set<String> = []
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            for name in postScriptNames(in: source) { names.insert(name) }
        }
        return names
    }

    /// The assertion that catches `PlayfairDisplay-Light`.
    @Test("every PostScript face the app names is actually registered")
    func everyNamedFaceIsRegistered() {
        PatinaFonts.registerAll()
        for name in Self.everyRequestedFace().sorted() {
            #expect(
                UIFont(name: name, size: 12) != nil,
                "\(name) is named in the source but is not registered — Font.custom will fall back to San Francisco and say nothing"
            )
        }
    }

    @Test("the design kit ships exactly the faces its tokens name")
    func theKitShipsWhatItNames() {
        PatinaFonts.registerAll()
        for name in [
            "PlayfairDisplay-Regular", "PlayfairDisplay-Medium", "PlayfairDisplay-Italic",
            "Inter-Regular", "Inter-Medium", "Inter-SemiBold",
            "DMMono-Light", "DMMono-Regular", "DMMono-Medium"
        ] {
            #expect(UIFont(name: name, size: 12) != nil, "\(name) is vendored but did not register")
        }
        // The one that is not vendored, kept explicit so a future "just add the
        // call back" is caught by name.
        #expect(
            UIFont(name: "PlayfairDisplay-Light", size: 12) == nil,
            "PlayfairDisplay-Light now resolves — if the face was vendored, drop this assertion and say so in C3-15"
        )
    }

    @Test("no file this lane owns reaches past the type system")
    func thisLaneUsesTokensOnly() throws {
        for path in Self.ownedFiles {
            let source = try SourcePin.read(path)
            #expect(
                !source.contains(".font(.custom("),
                "\(path) still carries an inline .font(.custom( — C3-15"
            )
        }
    }

    /// The app-wide bar, at zero.
    @Test("no inline .font(.custom( survives anywhere in the app")
    func zeroInlineFontCustom() {
        var offenders: [String] = []
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let count = source.components(separatedBy: ".font(.custom(").count - 1
            if count > 0 {
                offenders.append("\((path as NSString).lastPathComponent) ×\(count)")
            }
        }
        #expect(
            offenders.count <= Self.inlineFontCeiling,
            "inline .font(.custom( survives at: \(offenders.joined(separator: ", ")) — C3-15's exit criterion is zero"
        )
    }

    /// `C3-15` + the Dynamic Type half the first round introduced.
    ///
    /// The Reveal's aesthetic-name hero renders **one `Text` per character**
    /// inside `HStack(spacing: 0)`. The call it replaced was a FIXED 42 pt, so
    /// Dynamic Type never reached it; a token brings `relativeTo: .largeTitle`
    /// with it, and an `HStack` of per-character `Text`s cannot wrap. At AX3–AX5
    /// each glyph passes 80 pt and an 11-character name runs off-canvas.
    /// `.fixedSize(horizontal: false, vertical: true)` — which the view already
    /// had — does nothing for a horizontal overflow.
    @Test("the reveal's per-character hero can shrink instead of running off-canvas")
    func theRevealHeroSurvivesAccessibilitySizes() throws {
        let source = try SourcePin.read("Patina/Features/StyleReveal/Views/RevealView.swift")
        #expect(
            source.contains("minimumScaleFactor"),
            "RevealView's hero has no scale floor — at AX sizes an 11-character aesthetic name leaves the screen"
        )
        #expect(
            source.contains("PatinaTypography.display2Regular"),
            "the Reveal hero is not on the Regular display token — C3-15 offered PlayfairDisplay-Light or -Regular, and Medium is heavier than either"
        )
    }
}
