//  FieldReachabilityUITests.swift
//  CaptureUITests
//
//  W1A-01: Account, Settings, Q1 and photo import, reached the way a designer
//  reaches them — by taps from where Field opens. No `-CaptureScreen` and no
//  `field://screen/…`: those are the verification harness, which a Release
//  build on a device refuses (`CaptureDeepLink.verificationHarnessAllowed`).
//  Mock mode, so she is signed in with no network behind it.
//
//  Run: CAPTURE_SIM_UDID=<this lane's clone> scripts/capture-gate.sh ui
//   and CAPTURE_SIM_UDID=<this lane's clone> scripts/capture-gate.sh release-ui

import XCTest

final class FieldReachabilityUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testAccountOpensFromToday() {
        let app = launch()
        openAccount(app)
    }

    func testSettingsOpensFromAccount() {
        let app = launch()
        openAccount(app)
        tap("account.settings", in: app)
        XCTAssertTrue(element("screen.T1.settings", in: app).waitForExistence(timeout: 10),
                      "T1 did not come up from Account")
    }

    func testQRScanOpensFromAccount() {
        let app = launch()
        openAccount(app)
        tap("account.qrScan", in: app)
        XCTAssertTrue(element("screen.Q1.qr-scan", in: app).waitForExistence(timeout: 10),
                      "Q1 did not come up from Account")
    }

    func testPhotoImportOpensFromTheViewfinder() {
        let app = launch()
        openToday(app)
        tap("field.realm.camera", in: app)
        XCTAssertTrue(element("screen.C1.viewfinder", in: app).waitForExistence(timeout: 10),
                      "the camera never came up")
        // C1 and the import sheet both put their screen id on a plain stack,
        // and SwiftUI stamps that id onto every element inside it, so what is
        // inside them is found by label.
        let photos = app.buttons["Import from Photos"]
        XCTAssertTrue(photos.waitForExistence(timeout: 10), "the viewfinder has no way into Photos")
        photos.tap()
        XCTAssertTrue(element("screen.E4.photo-library", in: app).waitForExistence(timeout: 10),
                      "E4 did not come up from the viewfinder")
        XCTAssertTrue(app.staticTexts["Add from Photos"].exists)
        XCTAssertTrue(app.staticTexts["Enter by hand"].exists)
        // The camera is working here, so the sheet must not wear R3's face.
        XCTAssertFalse(app.staticTexts["Camera is off for Patina Field"].exists)
        XCTAssertFalse(app.buttons["Open Settings"].exists)
    }

    // MARK: - Helpers

    /// No harness argument: the app opens wherever `FieldLaunchPolicy` sends it.
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-CaptureUseMocks", "-CaptureUITest"]
        app.launch()
        return app
    }

    /// Field opens on Today, or on the camera while a visit is open. Either
    /// way, end on Today by a tap.
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

    private func openAccount(_ app: XCUIApplication) {
        openToday(app)
        tap("work.account", in: app)
        XCTAssertTrue(element("screen.T2.account", in: app).waitForExistence(timeout: 10),
                      "T2 did not come up from Today")
    }

    private func tap(_ id: String, in app: XCUIApplication) {
        let target = element(id, in: app)
        XCTAssertTrue(target.waitForExistence(timeout: 10), "\(id) never appeared")
        target.tap()
    }

    private func element(_ id: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }
}
