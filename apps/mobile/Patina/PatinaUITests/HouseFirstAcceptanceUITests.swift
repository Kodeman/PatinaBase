//
//  HouseFirstAcceptanceUITests.swift
//  PatinaUITests
//
//  W1A-11 (T7) — house-first as a tester meets it, now that D5 made the
//  four-tab root unconditional. Signed out, a cold launch lands on the welcome
//  and not on the house; once the tester looks around, the house is the root
//  (Today selected, the guest's sign-in line in place of a record), and a cold
//  relaunch returns straight there.
//
//  A signed-in cold launch needs a live session and is owed as a device walk.
//

import XCTest

final class HouseFirstAcceptanceUITests: XCTestCase {

    private static let tabs = ["Today", "Your Spaces", "Browse pieces", "Your Projects"]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// `-patina.guest.optedIn NO` puts `GuestSessionStore`'s key in the
    /// argument domain, so a guest opt-in left by another test cannot land
    /// this launch on the house.
    @MainActor
    func testASignedOutColdLaunchLandsOnTheWelcomeNotTheHouse() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "-patina.guest.optedIn", "NO"]
        app.launch()

        XCTAssertTrue(
            app.buttons["auth.welcome.guestButton"].waitForExistence(timeout: 20),
            "Signed out, the cold launch should land on the welcome"
        )
        XCTAssertFalse(app.buttons["Today"].exists, "The house's bar was drawn for a signed-out reader")
    }

    @MainActor
    func testLookingAroundLandsOnTheHouseAndAColdRelaunchReturnsThere() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--resetonboarding"]
        app.launch()

        // A fresh clone lands on the welcome; a clone a previous run already
        // opted in lands on onboarding. Either way the tester reaches the skip.
        let guest = app.buttons["auth.welcome.guestButton"]
        let skip = app.buttons["Onboarding.SkipButton"]
        XCTAssertTrue(
            guest.waitForExistence(timeout: 20) || skip.exists,
            "Neither the welcome nor onboarding appeared"
        )
        if guest.exists { guest.tap() }
        XCTAssertTrue(skip.waitForExistence(timeout: 10), "Looking around should open onboarding")
        skip.tap()

        assertOnTheHouse(app, context: "after skipping onboarding")

        let signInLine = app.staticTexts["DailyRoomView.SignInLine"]
        if !signInLine.waitForExistence(timeout: 5) { app.swipeUp() }
        XCTAssertTrue(signInLine.waitForExistence(timeout: 5), "A signed-out house shows the sign-in line")

        app.terminate()
        let relaunch = XCUIApplication()
        relaunch.launchArguments = ["--uitesting"]
        relaunch.launch()

        assertOnTheHouse(relaunch, context: "on a cold relaunch")
        XCTAssertFalse(relaunch.buttons["auth.welcome.guestButton"].exists, "The relaunch fell back to the welcome")
        XCTAssertFalse(relaunch.buttons["Onboarding.SkipButton"].exists, "The relaunch replayed onboarding")
    }

    @MainActor
    private func assertOnTheHouse(_ app: XCUIApplication, context: String) {
        let today = app.buttons["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 20), "The house's bar did not appear \(context)")
        XCTAssertTrue(today.isSelected, "Today is not the selected tab \(context)")
        for tab in Self.tabs {
            XCTAssertTrue(app.buttons[tab].exists, "The \(tab) tab is missing \(context)")
        }
    }
}
