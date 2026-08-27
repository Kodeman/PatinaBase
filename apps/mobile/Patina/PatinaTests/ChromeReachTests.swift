//
//  ChromeReachTests.swift
//  PatinaTests
//
//  SP-19 / SP-20 — nothing covers the button, nothing is smaller than a thumb.
//
//  These are source pins, not behaviour tests, because the facts they protect
//  live in SwiftUI's hit-testing and painting rules rather than in any value a
//  unit test can read back. Each one was reproduced on the simulator first;
//  the pin exists so the repair cannot be undone silently.
//

import Testing
@testable import Patina

struct ChromeReachTests {

    // MARK: - SP-20 · the inert Settings row

    /// Bisected on `dr-w1b-c` before any change: a tap at the dead centre of
    /// the Account row's 338×44 frame did nothing, while a tap on the word
    /// "Account" pushed `AccountView`. The `NavigationLink` and its
    /// destination were always correct — `.buttonStyle(.plain)` restricts
    /// hit-testing to the label's drawn content, and the middle of
    /// `settingsRow` is a `Spacer()`.
    @Test("every settings row declares a rectangular hit area")
    func settingsRowsAreFullyTappable() throws {
        let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        #expect(source.contains(".contentShape(Rectangle())"))
        #expect(source.contains("minHeight: 44"))
    }

}
