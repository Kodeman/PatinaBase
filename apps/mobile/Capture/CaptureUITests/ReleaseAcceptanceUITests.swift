//  ReleaseAcceptanceUITests.swift
//  CaptureUITests
//
//  W1A-07 (T7 acceptance): what `capture-gate.sh release-ui` can judge about a
//  signed-out designer and the Ready screen, walked by taps with no harness
//  argument. Evidence: artifacts/ios27-delivery-plan-2026-09-23/execute/
//  acceptance/W1A-07.md.
//
//  Signed out, Field renders only onboarding (RootView `rootContent`, phase
//  `.auth`), so the ruling for this ticket is: onboarding shows, and nothing
//  from the signed-in app leaks through. Account, Settings, Q1 and photo import
//  are signed-in edges; `FieldReachabilityUITests` covers those.
//
//  The Simulator's `utsname.machine` is the host's (`arm64`), which
//  `HardwareEntryPolicy` does not list, so Ready must take the branch that
//  promises no Action Button and no Control Center control. Which branch a
//  given iPhone model gets is `HardwareEntryPolicyTests`' job and the device
//  walk's.
//
//  Run: CAPTURE_SIM_UDID=<this lane's clone> scripts/capture-gate.sh release-ui

import XCTest

final class ReleaseAcceptanceUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testSigningOutShowsOnlyOnboarding() {
        let app = launch()
        signOut(app)
        assertNoSignedInSurface(app)

        // One step in, still nothing of hers.
        app.buttons["Get started"].tap()
        XCTAssertTrue(element("screen.O2.connect", in: app).waitForExistence(timeout: 10),
                      "O2 did not follow O1")
        assertNoSignedInSurface(app)
    }

    func testReadyMakesNoActionButtonOrControlCenterPromiseOnAnUnlistedDevice() {
        let app = launch()
        signOut(app)
        walkToReady(app)

        XCTAssertTrue(app.staticTexts["Open from the Home Screen"].exists,
                      "Ready did not take the no-Action-Button branch")
        XCTAssertTrue(app.staticTexts["Tap the Patina Field icon to start capturing."].exists)
        XCTAssertFalse(app.staticTexts["Action Button → Capture"].exists)
        XCTAssertFalse(app.buttons["Set up"].exists, "a Set up button with nothing to set up")
        for phrase in ["Action Button", "Control Center", "without even unlocking"] {
            XCTAssertFalse(
                app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", phrase))
                    .firstMatch.exists,
                "Ready promises \"\(phrase)\" on a device with no such control")
        }
    }

    // MARK: - Walks

    /// Signed in on Today, then Account → Sign out.
    private func signOut(_ app: XCUIApplication) {
        openToday(app)
        tap("work.account", in: app)
        XCTAssertTrue(element("screen.T2.account", in: app).waitForExistence(timeout: 10),
                      "T2 did not come up from Today")
        let signOut = app.buttons["Sign out"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 10), "Account has no Sign out")
        var swipes = 0
        while !signOut.isHittable, swipes < 6 {
            app.swipeUp()
            swipes += 1
        }
        signOut.tap()
        // Only when captures are waiting; mock mode may have some.
        let anyway = app.alerts.buttons["Sign out anyway"]
        if anyway.waitForExistence(timeout: 3) { anyway.tap() }
        XCTAssertTrue(element("screen.O1.welcome", in: app).waitForExistence(timeout: 15),
                      "signing out did not land on O1")
    }

    /// O1 → O2 (email one-time code, mock authorizer) → O3 → O4. O2's own
    /// `o2.*` identifiers do not surface — the screen id on its container
    /// stamps over them — so its controls are found by label.
    private func walkToReady(_ app: XCUIApplication) {
        app.buttons["Get started"].tap()
        tapButton("Continue with email", in: app)
        let email = app.textFields["you@studio.com"]
        XCTAssertTrue(email.waitForExistence(timeout: 10), "no email field")
        email.tap()
        email.typeText("ava@walbridge.studio")
        tapButton("Send code", in: app)
        let code = app.textFields["123456"]
        XCTAssertTrue(code.waitForExistence(timeout: 10), "no code field")
        code.tap()
        code.typeText("123456")
        tapButton("Verify", in: app)

        // Three demo workspaces: Continue waits for an explicit pick.
        let continueButton = app.buttons["Continue"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 10), "no workspace step")
        if !continueButton.isEnabled {
            let menu = app.buttons["Workspace, none chosen"]
            XCTAssertTrue(menu.waitForExistence(timeout: 10), "no workspace picker")
            menu.tap()
            let studio = app.buttons["Walbridge Studio"]
            XCTAssertTrue(studio.waitForExistence(timeout: 10), "the workspace menu did not open")
            studio.tap()
        }
        XCTAssertTrue(continueButton.isEnabled, "Continue stayed disabled after a pick")
        continueButton.tap()

        XCTAssertTrue(element("screen.O3.camera-priming", in: app).waitForExistence(timeout: 10),
                      "O3 did not follow O2")
        app.buttons["Allow"].tap()
        XCTAssertTrue(element("screen.O4.ready", in: app).waitForExistence(timeout: 10),
                      "O4 did not follow O3")
    }

    // MARK: - Helpers

    /// Nothing that only a signed-in designer has: no Today, no camera, no
    /// realm switch, no Account entry, and none of the four W1A-01 targets.
    private func assertNoSignedInSurface(_ app: XCUIApplication) {
        for id in ["screen.W1.work", "screen.C1.viewfinder", "work.account",
                   "field.realm.work", "field.realm.camera",
                   "screen.T2.account", "screen.T1.settings", "screen.Q1.qr-scan",
                   "screen.E4.photo-library", "account.settings", "account.qrScan"] {
            XCTAssertFalse(element(id, in: app).exists, "\(id) is on screen while signed out")
        }
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-CaptureUseMocks", "-CaptureUITest"]
        app.launch()
        return app
    }

    private func openToday(_ app: XCUIApplication) {
        let today = element("screen.W1.work", in: app)
        let camera = element("screen.C1.viewfinder", in: app)
        let opened = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in today.exists || camera.exists }, object: nil)
        XCTAssertEqual(XCTWaiter().wait(for: [opened], timeout: 30), .completed,
                       "Field never opened on Today or the camera")
        if !today.exists {
            tap("field.realm.work", in: app)
            XCTAssertTrue(today.waitForExistence(timeout: 10), "Today did not come up")
        }
    }

    private func tap(_ id: String, in app: XCUIApplication) {
        let target = element(id, in: app)
        XCTAssertTrue(target.waitForExistence(timeout: 10), "\(id) never appeared")
        target.tap()
    }

    private func tapButton(_ label: String, in app: XCUIApplication) {
        let button = app.buttons[label]
        XCTAssertTrue(button.waitForExistence(timeout: 10), "\"\(label)\" never appeared")
        button.tap()
    }

    private func element(_ id: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }
}
