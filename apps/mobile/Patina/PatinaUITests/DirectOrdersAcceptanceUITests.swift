//
//  DirectOrdersAcceptanceUITests.swift
//  PatinaUITests
//
//  W1A-11 (T7) — direct orders as a tester meets them, on W1A-14's scripted
//  doubles. The oracle is `OrderHandoff`'s own transitions: Safari's Done moves
//  `.awaitingPayment → .confirming` and arms the poll; `.placed` needs a
//  settled row from the poll; `.unconfirmed` is the 60-second deadline. So a
//  return from Checkout is never payment proof — the sheet must hold its
//  confirming line until the poll answers, and must say it has not seen the
//  payment when the poll never does.
//

import XCTest

final class DirectOrdersAcceptanceUITests: XCTestCase {

    /// `OrderFailureCopy.unconfirmed.sentence`, verbatim.
    private static let unconfirmedCopy =
        "We haven’t seen this payment yet. We’ll update this as soon as it clears."

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Opens the scripted order sheet, pays, and presses Safari's Done.
    @MainActor
    private func returnFromCheckout(pollSettlesAfter: Int) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--uitest-order-sheet"]
        app.launchEnvironment["UITEST_ORDER_POLL_SETTLES_AFTER"] = String(pollSettlesAfter)
        app.launch()

        XCTAssertTrue(
            app.staticTexts["UI test terms: the scripted double answered."].waitForExistence(timeout: 15),
            "The injected terms provider should render"
        )
        let primary = app.buttons["OrderSheet.Primary"]
        XCTAssertTrue(primary.waitForExistence(timeout: 5))
        primary.tap()

        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 15), "The scripted checkout URL should open Safari")
        done.tap()
        return app
    }

    private func confirming(in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Confirming payment")
        ).firstMatch
    }

    /// The poll settles on its fourth call (~9 s after Done at the 3 s
    /// interval). Five seconds in, the row has answered "pending" twice and the
    /// sheet must still be confirming — not placed, not unconfirmed.
    @MainActor
    func testReturnFromCheckoutHoldsConfirmingUntilThePollSettles() throws {
        let app = returnFromCheckout(pollSettlesAfter: 4)
        let confirming = confirming(in: app)
        let placed = app.staticTexts["OrderSheetUITest.Placed"]

        XCTAssertTrue(confirming.waitForExistence(timeout: 5), "Return from Checkout confirms, it does not place")
        XCTAssertFalse(placed.exists, "Placed on return, before any settled poll")

        // Two unsettled polls later the sheet is still only confirming.
        Thread.sleep(forTimeInterval: 5)
        XCTAssertTrue(confirming.exists, "The confirming line left before the poll answered settled")
        XCTAssertFalse(placed.exists, "Placed while the poll still answered pending")
        XCTAssertFalse(app.staticTexts["OrderSheet.Unconfirmed"].exists)

        XCTAssertTrue(placed.waitForExistence(timeout: 20), "The scripted poll settles on its fourth call")
    }

    /// The poll never settles. At the 60-second deadline the sheet leaves
    /// confirming for the unconfirmed copy — and never shows placed.
    @MainActor
    func testAPollThatNeverSettlesEndsUnconfirmedNeverPlaced() throws {
        let app = returnFromCheckout(pollSettlesAfter: 100_000)
        let confirming = confirming(in: app)
        let placed = app.staticTexts["OrderSheetUITest.Placed"]
        let unconfirmed = app.staticTexts["OrderSheet.Unconfirmed"]

        XCTAssertTrue(confirming.waitForExistence(timeout: 5), "Return from Checkout confirms, it does not place")
        XCTAssertFalse(placed.exists)
        XCTAssertFalse(unconfirmed.exists, "Unconfirmed before the deadline")

        XCTAssertTrue(unconfirmed.waitForExistence(timeout: 80), "The 60 s poll deadline should end unconfirmed")
        XCTAssertEqual(unconfirmed.label, Self.unconfirmedCopy)
        XCTAssertFalse(confirming.exists, "Still confirming after the deadline")
        XCTAssertFalse(placed.exists, "A poll that never settled placed the order")
    }

    /// W1A-11 F1. A reader whose webhook is late may already have paid, so the
    /// unconfirmed sheet must not offer a second payment. Its act re-polls the
    /// same order: the scripted poll settles on call 24, which the first 60 s
    /// cycle (at most 21 polls at 3 s) cannot reach, so only "Check again" can
    /// place it — and the scripted create is still called exactly once.
    @MainActor
    func testUnconfirmedOffersCheckAgainAndNeverASecondOrder() throws {
        let app = returnFromCheckout(pollSettlesAfter: 24)
        let unconfirmed = app.staticTexts["OrderSheet.Unconfirmed"]
        let placed = app.staticTexts["OrderSheetUITest.Placed"]
        let creates = app.staticTexts["OrderSheetUITest.CreateCount"]
        let primary = app.buttons["OrderSheet.Primary"]

        XCTAssertTrue(unconfirmed.waitForExistence(timeout: 80), "The 60 s poll deadline should end unconfirmed")
        XCTAssertEqual(creates.label, "1", "One tap, one scripted create")

        XCTAssertEqual(primary.label, "Check again")
        XCTAssertFalse(
            app.buttons.matching(NSPredicate(format: "label == %@", "Continue to payment")).firstMatch.exists,
            "An unconfirmed payment offered a second checkout"
        )
        XCTAssertTrue(app.buttons["OrderSheet.Close"].exists, "The unconfirmed sheet needs a way to leave")

        primary.tap()
        XCTAssertTrue(confirming(in: app).waitForExistence(timeout: 5), "Check again re-polls, it does not create")
        XCTAssertFalse(unconfirmed.exists)
        XCTAssertFalse(app.buttons["Done"].exists, "Check again opened Checkout")

        XCTAssertTrue(placed.waitForExistence(timeout: 60), "The re-poll should reach the settled row")
        XCTAssertEqual(placed.label, "Placed d0000000-0000-0000-0000-0000000000e1")
        XCTAssertEqual(creates.label, "1", "Check again made a second order")
    }
}
