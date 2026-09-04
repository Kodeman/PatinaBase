//
//  KeyboardDismissalTests.swift
//  PatinaTests
//
//  C9-08 — no keyboard-dismiss affordance existed anywhere in the app.
//
//  The audit's grep over all 589 Swift files found ZERO
//  `ToolbarItemGroup(placement: .keyboard)`, ZERO `.scrollDismissesKeyboard`
//  and ZERO `endEditing` / `resignFirstResponder` / tap-to-dismiss, against
//  six `.numberPad` / `.decimalPad` fields — and a number pad has no Return
//  key. The worst of them is the six-digit sign-in code, where the pad covers
//  the Verify button (C1-37's other half).
//
//  This lane owns the shared modifier and the auth field. The other five
//  fields are L1-B's files and go out as an integration note; the last test
//  here records exactly which they are so the note cannot be silently dropped.
//

import Foundation
import Testing
@testable import Patina

struct KeyboardDismissalTests {

    @Test("the shared modifier exists, and is a keyboard toolbar")
    func sharedModifierExists() throws {
        let source = try SourcePin.read("Patina/Utilities/ViewModifiers/KeyboardDismissal.swift")
        #expect(source.contains("func keyboardDoneToolbar()"))
        #expect(source.contains("ToolbarItemGroup(placement: .keyboard)"))
        #expect(source.contains("Button(\"Done\")"))
        #expect(source.contains("keyboard.doneButton"))
    }

    @Test("and an interactive scroll dismissal for forms")
    func scrollDismissalExists() throws {
        let source = try SourcePin.read("Patina/Utilities/ViewModifiers/KeyboardDismissal.swift")
        #expect(source.contains("func dismissKeyboardOnScroll()"))
        #expect(source.contains("scrollDismissesKeyboard(.interactively)"))
    }

    @Test("the six-digit code field has a way out")
    func otpFieldHasADoneBar() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView+Panels.swift")
        let start = try #require(source.range(of: "TextField(\"\", text: $viewModel.otpToken, prompt:"))
        let block = String(source[start.lowerBound...].prefix(1400))
        #expect(block.contains(".keyboardType(.numberPad)"))
        #expect(block.contains(".keyboardDoneToolbar()"))
    }

    @Test("the auth form’s scroll view dismisses the keyboard")
    func authFormDismissesOnScroll() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(source.contains(".dismissKeyboardOnScroll()"))
    }

    /// The remaining five `.numberPad` / `.decimalPad` fields all live in
    /// `Features/Rooms/**` and `Features/RoomScan/**`, which are **L1-B's**
    /// globs. This test is the record of the debt, not a claim that it is
    /// paid: it fails if a new pad-keyboard field appears in a file THIS lane
    /// owns without the Done bar.
    @Test("no numeric field in this lane’s files is left without an exit")
    func noBareNumericFieldInThisLanesFiles() throws {
        let owned = SourcePin.swiftFiles(under: "Patina/Features/Authentication")
            + SourcePin.swiftFiles(under: "Patina/Features/Onboarding")
            + SourcePin.swiftFiles(under: "Patina/Features/FirstLaunch")
            + SourcePin.swiftFiles(under: "Patina/Features/StyleQuiz")
            + SourcePin.swiftFiles(under: "Patina/Features/StyleConversation")
            + SourcePin.swiftFiles(under: "Patina/Features/Account")
            + SourcePin.swiftFiles(under: "Patina/Features/QRAuth")

        for path in owned {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            guard source.contains(".numberPad") || source.contains(".decimalPad") else { continue }
            #expect(
                source.contains(".keyboardDoneToolbar()"),
                "\(path) has a pad keyboard and no Done bar"
            )
        }
    }

    /// RL2A-05's bar, and RL3A-03's replacement for a checklist a test read
    /// out of a plan file in another checkout. A walk of the WHOLE app target:
    /// the set of files with a pad keyboard and no `.keyboardDoneToolbar()`
    /// must be exactly the four files `B-L1A-2` names (five sites —
    /// `ManualRoomEntryView` has two), no more and no fewer.
    ///
    /// It reds two ways, which is the point. A sixth bare field anywhere reds
    /// it. And when L1-B's sites land at the X29 rebase it reds too — that is
    /// the signal that `C9-08` may finally read closed, and the list below
    /// comes out with the finding.
    ///
    /// **X29 has run** (merge 5, on the integration tip): `B-L1A-2`'s five
    /// sites in L1-B's four files all carry the Done bar, and the three whose
    /// form is a `ScrollView` also carry `.dismissKeyboardOnScroll()`. The set
    /// is now empty, so `C9-08` reads closed and this case guards the floor:
    /// any new pad keyboard anywhere in the app reds it.
    @Test("no numeric field in the app is left without a Done bar (C9-08 closed)")
    func everyBareNumericFieldIsOneOfTheFiveKnownOpenSites() {
        let knownOpen: Set<String> = []

        var bare: Set<String> = []
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            // The modifier's own file names both keyboards in its doc comment.
            guard !path.hasSuffix("KeyboardDismissal.swift") else { continue }
            guard source.contains(".numberPad") || source.contains(".decimalPad") else { continue }
            guard !source.contains(".keyboardDoneToolbar()") else { continue }
            bare.insert((path as NSString).lastPathComponent)
        }

        #expect(
            bare == knownOpen,
            "C9-08's open set moved — expected \(knownOpen.sorted()), found \(bare.sorted())"
        )
    }

    // MARK: - W1-B-01 · one bar per screen, never one per field

    /// Focusing Length on Manual Room Entry drew **three** "Done" buttons side
    /// by side in one accessory bar. `B-L1A-2` put `.keyboardDoneToolbar()` on
    /// each of the screen's pad fields, and SwiftUI merges every
    /// `ToolbarItemGroup(placement: .keyboard)` in the hierarchy into one bar —
    /// so three fields meant three buttons.
    ///
    /// This is the count half: no file in the app target may declare the
    /// modifier more than once. It reds on the pre-fix tree
    /// (`ManualRoomEntryView` had two) and stays red if a future form goes back
    /// to per-field application.
    @Test("no screen declares more than one keyboard Done bar (W1-B-01)")
    func noScreenDeclaresTwoDoneBars() {
        var offenders: [String: Int] = [:]
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard !path.hasSuffix("KeyboardDismissal.swift") else { continue }
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let count = source.components(separatedBy: ".keyboardDoneToolbar()").count - 1
            if count > 1 { offenders[(path as NSString).lastPathComponent] = count }
        }
        #expect(
            offenders.isEmpty,
            "one keyboard toolbar per screen — these declare more: \(offenders.sorted(by: { $0.key < $1.key }))"
        )
    }

    /// The placement half, and the one the count above cannot see: a helper
    /// that carries the modifier and is *called* twice is one source site and
    /// two toolbars. `ManualRoomEntryView.dimensionField` was exactly that.
    /// On any screen with more than one pad field the bar must be attached to
    /// the screen, so it may not be chained onto a `.keyboardType(` line.
    @Test("a multi-field form attaches its Done bar to the screen, not a field (W1-B-01)")
    func multiFieldFormsAttachTheBarToTheScreen() {
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard !path.hasSuffix("KeyboardDismissal.swift") else { continue }
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let lines = source.components(separatedBy: .newlines)
            let padLines = lines.indices.filter {
                lines[$0].contains(".keyboardType(.numberPad)")
                    || lines[$0].contains(".keyboardType(.decimalPad)")
            }
            guard padLines.count > 1 else { continue }
            let name = (path as NSString).lastPathComponent
            for index in padLines {
                let following = lines[(index + 1)...].prefix(6)
                #expect(
                    !following.contains(where: { $0.contains(".keyboardDoneToolbar()") }),
                    "\(name) chains the Done bar onto a field; a form with \(padLines.count) pad fields must carry it once, at the screen"
                )
            }
        }
    }
}
