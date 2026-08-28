//
//  TopBandFoldTests.swift
//  PatinaTests
//
//  W1b ruling 1, the carry-over: one top-band pattern, one owner.
//  `PatinaScreenChrome` reserves the status-bar region; the money screens'
//  separate modifier is gone, so there is no second place for the pattern to
//  drift in.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct TopBandFoldTests {

    @Test("no file in the app uses the money screens' own top band any more")
    func theDuplicateIsGone() throws {
        // Every Swift file under the app target, not a list — a thirteenth
        // file could reintroduce the modifier under a hard-coded twelve.
        let all = SourcePin.swiftFiles(under: "Patina")
        #expect(all.count > 100, "the source walk found nothing to check")
        for path in all {
            let source = try String(contentsOf: URL(fileURLWithPath: path), encoding: .utf8)
            #expect(!source.contains("moneyScreenTopBand"),
                    "\((path as NSString).lastPathComponent) still uses the folded modifier")
        }
    }

    @Test("PatinaScreenChrome owns the reservation, and applies it")
    func theChromeOwnsTheBand() throws {
        let chrome = try SourcePin.read("Patina/Design/Components/PatinaScreenChrome.swift")
        #expect(chrome.contains("func patinaTopBand()"))
        #expect(chrome.contains("safeAreaInset(edge: .top"))
        // Applied by the chrome itself, so `.patinaScreen(…)` is enough.
        #expect(chrome.contains(".patinaTopBand()"))
    }

    @Test("the nine pushed screens read it through .patinaScreen, the three sheets directly")
    func everyScreenStillReservesTheStatusBar() throws {
        let pushed = [
            "Patina/Features/Invoices/Views/InvoiceDetailView.swift",
            "Patina/Features/Invoices/Views/InvoiceListView.swift",
            "Patina/Features/Projects/Views/ProjectDetailView.swift",
            "Patina/Features/Decisions/Views/DecisionDetailView.swift",
            "Patina/Features/Decisions/Views/DecisionListView.swift",
            "Patina/Features/Proposals/Views/ProposalDetailView.swift",
            "Patina/Features/Proposals/Views/ProposalListView.swift",
            "Patina/Features/Budget/BudgetView.swift"
        ]
        for file in pushed {
            #expect(try SourcePin.read(file).contains(".patinaScreen("),
                    "\((file as NSString).lastPathComponent) lost its chrome")
        }
        for file in [
            "Patina/Features/Decisions/Views/DecisionDeferSheet.swift",
            "Patina/Features/Proposals/Views/ProposalSignSheet.swift",
            "Patina/Features/Decisions/Views/DecisionDetailView.swift"
        ] {
            #expect(try SourcePin.read(file).contains(".patinaTopBand()"),
                    "\((file as NSString).lastPathComponent) lost its sheet band")
        }
    }

    @Test("the Hearth clearance stayed where it belongs")
    func theClearanceIsUntouched() {
        #expect(MoneyScreenMetrics.bottomClearance >= CompanionHearthMetrics.reservedHeight)
    }
}
