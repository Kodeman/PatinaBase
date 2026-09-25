//
//  FirstLaunchUITests.swift
//  PatinaUITests
//
//  A signed-out first launch: Splash, then the Welcome screen
//  (`AuthScreenView`), and "Look around first" into the onboarding carousel
//  (`OnboardingFlowHost`). The Threshold → walk invitation → camera
//  permission flow these tests used to drive was removed in 79244751c.
//

import XCTest

final class FirstLaunchUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        // `--resetonboarding` replays the carousel. The guest choice is
        // persisted and survives it, so the argument domain overrides the
        // stored `GuestSessionStore.key` to start every test at Welcome.
        app.launchArguments = [
            "--uitesting", "--resetonboarding",
            "-patina.guest.optedIn", "NO",
        ]
        app.launch()
    }

    override func tearDownWithError() throws {
        app.terminate()
        app = nil
    }

    /// First launch lands on Welcome with every way in.
    @MainActor
    func testFirstLaunchShowsWelcome() throws {
        let guest = app.buttons["auth.welcome.guestButton"]
        XCTAssertTrue(guest.waitForExistence(timeout: 15), "Welcome should follow the splash")
        XCTAssertTrue(guest.isHittable, "Look around first should be tappable")

        for identifier in ["auth.welcome.appleButton", "auth.welcome.emailButton", "auth.welcome.passwordButton"] {
            XCTAssertTrue(
                app.descendants(matching: .any)[identifier].exists,
                "\(identifier) should be on Welcome"
            )
        }
    }

    /// "Look around first" opens the carousel, and Skip leaves first launch
    /// without signing in or answering the style questions.
    @MainActor
    func testLookAroundFirstThenSkipLeavesFirstLaunch() throws {
        let guest = app.buttons["auth.welcome.guestButton"]
        XCTAssertTrue(guest.waitForExistence(timeout: 15), "Welcome should follow the splash")
        guest.tap()

        let skip = app.buttons["Onboarding.SkipButton"]
        XCTAssertTrue(skip.waitForExistence(timeout: 10), "The onboarding carousel should open")
        XCTAssertTrue(app.descendants(matching: .any)["Onboarding.Page.0"].exists, "The carousel should start on page 1")
        skip.tap()

        XCTAssertTrue(skip.waitForNonExistence(timeout: 10), "Skip should leave the carousel")
        XCTAssertFalse(guest.exists, "Skip should not return to Welcome")
    }
}
