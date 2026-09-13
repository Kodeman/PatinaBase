//  PeopleRoomUITests.swift
//  CaptureUITests
//
//  W5's one UI test: the roster opens on the active project, and the site
//  access card opens from its head. Mock mode, so it runs on any Simulator with
//  no network and the Okonkwo fixture behind it.
//
//  Run: xcodebuild test -project Capture.xcodeproj -scheme Capture \
//       -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
//       -only-testing:CaptureUITests CODE_SIGNING_ALLOWED=NO
//  (`capture-gate.sh test` runs the CaptureKit logic bundle; a UI test needs an
//  app host, so it lives in the app scheme.)

import XCTest

final class PeopleRoomUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    private func launch(screen: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-CaptureUseMocks", "-CaptureUITest", "-CaptureScreen", screen]
        app.launch()
        return app
    }

    func testRosterOpensOnTheActiveProject() {
        let app = launch(screen: "PR1.roster")
        XCTAssertTrue(app.otherElements["screen.PR1.roster"].waitForExistence(timeout: 20)
                      || app.descendants(matching: .any)["screen.PR1.roster"]
                          .waitForExistence(timeout: 5),
                      "PR1 did not come up")
        XCTAssertTrue(app.staticTexts["Okonkwo residence"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["On the job · this week"].exists)
        XCTAssertTrue(app.staticTexts["Luis Ochoa"].exists)
    }

    func testTheSiteAccessCardOpensFromTheRosterAndHoldsNoCode() {
        let app = launch(screen: "PR1.roster")
        let opener = app.descendants(matching: .any)["people.openSiteAccess"]
        XCTAssertTrue(opener.waitForExistence(timeout: 20), "the site access act never appeared")
        opener.tap()

        let wayIn = app.descendants(matching: .any)["people.wayIn"]
        XCTAssertTrue(wayIn.waitForExistence(timeout: 10), "PR3 did not come up")
        XCTAssertTrue(app.staticTexts["Who to call first"].exists)
        // PR-r, walked: the card says where the code is NOT.
        XCTAssertTrue(app.staticTexts
            .containing(NSPredicate(format: "label CONTAINS 'held off Patina'"))
            .firstMatch.exists)
    }

    func testAPersonOpensFromARosterRow() {
        let app = launch(screen: "PR1.roster")
        let row = app.descendants(matching: .any)["people.seat.seat-F-11"]
        XCTAssertTrue(row.waitForExistence(timeout: 20), "Dana Kowalski's row never appeared")
        row.tap()
        XCTAssertTrue(app.staticTexts["Channels"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Authority on this job"].exists)
    }
}
