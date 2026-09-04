//
//  AppApostropheLintTests.swift
//  PatinaTests
//
//  `W1-B-07` / `W1-C-06` — the app-wide half of `A-06`, split out of
//  `BrandVoiceLintTests.swift` (which the addition took past SwiftLint's
//  500-line `file_length`). The lint engine stays there; this is the walk.
//

import Testing
import Foundation
@testable import Patina

struct AppApostropheLintTests {

    /// `BrandVoiceLintTests`' per-lane pins are the deck's bookkeeping, and they
    /// were losing.
    /// Two walkers counted the app target independently on the fix-round tip
    /// and found **168** quoted literals carrying U+0027 against 134 carrying
    /// U+2019 — a count that had gone UP, 152 → 159, since the first walk,
    /// because every round added sentences faster than the deck's row-by-row
    /// pass could sweep them. Both spellings appeared in one viewport:
    /// `PatinaErrorState.retryLabel` = "Let’s try that again" rendering
    /// directly beneath `RecommendationsViewModel`'s "Couldn't load
    /// recommendations".
    ///
    /// So the rule stops being per-file. Every `.swift` file in the app target
    /// is walked, with the same engine: double-quoted literals only,
    /// interpolations stripped, apostrophes only where they sit BETWEEN
    /// letters. The one class of literal that legitimately types U+0027 —
    /// `IntentDetector`'s natural-language needles — now types U+2019 too and
    /// normalises its input, so there is no exception list to maintain.
    @Test("every user-facing literal in the app types its apostrophes as U+2019 (W1-B-07)")
    func everyAppLiteralIsCurly() {
        var walked = 0
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            walked += 1
            BrandVoiceLintTests.lintApostrophes(source, file: (path as NSString).lastPathComponent)
        }
        // A walk that finds nothing is a green test that proves nothing.
        #expect(walked > 300, "the app-target walk found only \(walked) files")
    }

}
