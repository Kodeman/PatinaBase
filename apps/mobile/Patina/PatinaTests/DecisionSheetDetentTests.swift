//
//  DecisionSheetDetentTests.swift
//  PatinaTests
//
//  `GAP1B-01` / `GAP1B-02`: at `accessibility-extra-large` both decision
//  sheets stayed pinned to `.medium` while their content grew ~2.5x, so
//  Approve rendered ~17 pt on screen (y=857.0 h=49.9 on an 874 pt display)
//  and Cancel sat 58 pt below the display edge. The client could neither
//  approve nor leave. `GAP2-24` / `B-28` are the same shape one screen over:
//  the invoice's Pay button started at y=875 on an 874 pt screen.
//
//  Two facts hold both fixes up and both are pinned here: the detent answers
//  to the text size, and the act lives in a bottom `safeAreaInset` rather
//  than at the end of a scroll.
//

import SwiftUI
import Foundation
import Testing
@testable import Patina

@Suite("Decision sheet detents and pinned acts")
struct DecisionSheetDetentTests {

    // MARK: - The detent policy

    @Test("an accessibility text size gets .large alone, never .medium")
    func accessibilitySizesTakeTheLargeDetentAlone() {
        for size in [DynamicTypeSize.accessibility1,
                     .accessibility2, .accessibility3, .accessibility4, .accessibility5] {
            #expect(DecisionSheetDetents.detents(for: size) == [.large],
                    "\(size) must not be able to rest at .medium")
        }
    }

    @Test("ordinary text sizes keep the two-detent sheet")
    func ordinarySizesKeepBothDetents() {
        for size in [DynamicTypeSize.xSmall, .small, .medium, .large,
                     .xLarge, .xxLarge, .xxxLarge] {
            #expect(DecisionSheetDetents.detents(for: size) == [.medium, .large])
        }
    }

    // MARK: - The pinned act

    @Test("both decision sheets pin their button pair in a bottom safeAreaInset")
    func bothSheetsPinTheirButtons() throws {
        for file in ["Patina/Features/Decisions/Views/DecisionDetailView.swift",
                     "Patina/Features/Decisions/Views/DecisionDeferSheet.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            let name = (file as NSString).lastPathComponent
            #expect(code.contains("safeAreaInset(edge: .bottom"),
                    "\(name) still lets its button pair scroll away")
        }
    }

    @Test("the sheets read the text size rather than assuming one")
    func theSheetsReadTheTextSize() throws {
        // Both sheets are declared in `DecisionDetailView`, so that is where
        // the detent call has to land for either of them.
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        let calls = code.components(separatedBy: "DecisionSheetDetents.detents(for:").count - 1
        #expect(calls == 2, "only \(calls) of the two decision sheets derives its detents")
        #expect(!code.contains("presentationDetents([.medium, .large])"),
                "a decision sheet still hard-codes the pair that hid Approve and Cancel")
    }

    // MARK: - GAP2-24 / B-28

    @Test("the invoice pay footer is pinned, not the last thing in a scroll")
    func theInvoicePayFooterIsPinned() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Invoices/Views/InvoiceDetailView.swift")
        )
        #expect(code.contains("safeAreaInset(edge: .bottom"),
                "the Pay button is still below the fold at rest (GAP2-24)")
        // The footer clears whatever owns the bottom edge — the bar on the
        // house-first root D1 ships, the dock on the flag-off fallback. It is
        // the same seam the scroll content takes, never a second constant.
        #expect(code.contains("MoneyScreenMetrics.bottomClearance(houseFirst:"),
                "the pinned footer does not clear the bar (B-28)")
    }
}
