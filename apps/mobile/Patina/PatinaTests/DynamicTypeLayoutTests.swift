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

    @Test("the greeting can shrink rather than break inside a word")
    func theGreetingScalesBeforeItBreaks() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        )
        #expect(code.contains("minimumScaleFactor("),
                "the greeting has no scale floor, so it breaks mid-word (C-06)")
        #expect(code.contains("allowsTightening(true)"))
        // The date eyebrow broke too — "TUESDA / Y · / SEP 1".
        #expect(code.contains("lineLimit(1)"))
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
}
