//
//  OrderSheetUITests.swift
//  PatinaUITests
//
//  W1A-14: the order sheet driven on `PurchaseComposition`'s scripted doubles.
//  The scripted terms prove the injected provider answered, not the live RPC;
//  reaching Safari proves the injected handoff created the order (the live one
//  has no session here and would fail). Coming back from Checkout is not proof
//  of payment, so the sheet must be seen confirming before it is placed.
//

import XCTest

final class OrderSheetUITests: XCTestCase {

    @MainActor
    func testOrderSheetRunsOnInjectedDoublesAndPlacesOnlyAfterThePoll() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitest-order-sheet"]
        app.launchEnvironment["UITEST_ORDER_POLL_SETTLES_AFTER"] = "2"
        app.launch()

        let scriptedTerms = app.staticTexts["UI test terms: the scripted double answered."]
        XCTAssertTrue(scriptedTerms.waitForExistence(timeout: 15), "The injected terms provider should render")
        XCTAssertTrue(
            app.staticTexts["OrderSheet.TaxLine"].label.contains("added at payment"),
            "Scripted terms enable tax and shipping"
        )

        let primary = app.buttons["OrderSheet.Primary"]
        XCTAssertTrue(primary.waitForExistence(timeout: 5))
        XCTAssertTrue(primary.isEnabled, "Scripted terms enable the act")
        primary.tap()

        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 15), "The scripted checkout URL should open Safari")
        done.tap()

        let confirming = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Confirming payment")
        ).firstMatch
        let placed = app.staticTexts["OrderSheetUITest.Placed"]
        XCTAssertTrue(confirming.waitForExistence(timeout: 5), "Return from Checkout confirms, it does not place")
        XCTAssertFalse(placed.exists, "Placed before the poll answered settled")

        XCTAssertTrue(placed.waitForExistence(timeout: 15), "The scripted poll settles on its second call")
    }
}
