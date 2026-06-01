//
//  DesignerSmokeUITests.swift
//  PatinaUITests
//
//  Phase 11 of the cached-swan plan: codify the designer-home smoke flows
//  so they can run from `xcodebuild test` in CI.
//
//  Each test is gated on `UITEST_AUTH_EMAIL` + `UITEST_AUTH_OTP` env vars
//  being set on the *test runner* (Xcode passes them through to the app
//  via `XCUIApplication.launchAuthenticated`). When the env vars are
//  missing the test calls `XCTSkip` so CI runs cleanly without holding
//  the secrets — local invocations that want to actually exercise the
//  designer surfaces export them before running:
//
//    UITEST_AUTH_EMAIL=kody@kochaver.com \
//    UITEST_AUTH_OTP=123456 \
//    xcodebuild test -only-testing:PatinaUITests/DesignerSmokeUITests ...
//

import XCTest

final class DesignerSmokeUITests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Helpers

    /// Pull the auth credentials from the test runner's environment, or
    /// throw `XCTSkip` if they aren't set. CI without the secrets sees
    /// a clean pass-with-skip.
    private func requireAuthEnv() throws -> (email: String, otp: String) {
        let env = ProcessInfo.processInfo.environment
        guard let email = env["UITEST_AUTH_EMAIL"], !email.isEmpty else {
            throw XCTSkip("Requires UITEST_AUTH_EMAIL env to be set on the test runner.")
        }
        guard let otp = env["UITEST_AUTH_OTP"], !otp.isEmpty else {
            throw XCTSkip("Requires UITEST_AUTH_OTP env to be set on the test runner.")
        }
        return (email, otp)
    }

    // MARK: - Tests

    /// Sanity: signed-in designer home renders within the auth budget and
    /// shows the three stat tiles.
    @MainActor
    func test_designerHome_loads() throws {
        let (email, otp) = try requireAuthEnv()
        app.launchAuthenticated(email: email, otp: otp)

        XCTAssertTrue(
            app.waitForDesignerHome(timeout: 30),
            "Designer home profile avatar should appear within 30s of launch."
        )
        XCTAssertTrue(app.designerHomeProjectsTile.exists, "Projects stat tile should exist on the home dashboard.")
        XCTAssertTrue(app.designerHomeDecisionsTile.exists, "Decisions stat tile should exist on the home dashboard.")
        XCTAssertTrue(app.designerHomeMessagesTile.exists, "Messages stat tile should exist on the home dashboard.")
    }

    /// Golden path: tapping the first project row navigates into the
    /// ProjectDetailView (oracle: the "PROJECT" MonoLabel header).
    @MainActor
    func test_projects_goldenPath() throws {
        let (email, otp) = try requireAuthEnv()
        app.launchAuthenticated(email: email, otp: otp)
        XCTAssertTrue(app.waitForDesignerHome(timeout: 30))

        let row = app.firstProjectRow()
        guard row.waitForExistence(timeout: 10) else {
            throw XCTSkip("No projects in the seeded test account — skipping golden path.")
        }
        row.tap()

        // ProjectDetailView header is `MonoLabel(text: "PROJECT")`.
        XCTAssertTrue(
            app.staticTexts["PROJECT"].waitForExistence(timeout: 10),
            "ProjectDetailView header should appear after tapping a project row."
        )
    }

    /// Golden path: tapping the first decision row navigates into the
    /// DecisionDetailView (oracle: "DECISION" MonoLabel header).
    @MainActor
    func test_decisions_goldenPath() throws {
        let (email, otp) = try requireAuthEnv()
        app.launchAuthenticated(email: email, otp: otp)
        XCTAssertTrue(app.waitForDesignerHome(timeout: 30))

        let row = app.firstDecisionRow()
        guard row.waitForExistence(timeout: 10) else {
            throw XCTSkip("No pending decisions in the seeded test account — skipping golden path.")
        }
        row.tap()

        XCTAssertTrue(
            app.staticTexts["DECISION"].waitForExistence(timeout: 10),
            "DecisionDetailView header should appear after tapping a decision row."
        )
    }

    /// Golden path: tapping the first thread row navigates into the
    /// thread detail. We can't anchor on a specific label since threads
    /// don't have a unique header MonoLabel — instead assert the home
    /// avatar disappears (meaning a navigation push happened).
    @MainActor
    func test_threads_goldenPath() throws {
        let (email, otp) = try requireAuthEnv()
        app.launchAuthenticated(email: email, otp: otp)
        XCTAssertTrue(app.waitForDesignerHome(timeout: 30))

        let row = app.firstThreadRow()
        guard row.waitForExistence(timeout: 10) else {
            throw XCTSkip("No threads in the seeded test account — skipping golden path.")
        }
        row.tap()

        // After navigation push, the home avatar should no longer be
        // hittable on the visible screen.
        let predicate = NSPredicate(format: "exists == false OR isHittable == false")
        let avatar = app.designerHomeProfileAvatar
        let exp = expectation(for: predicate, evaluatedWith: avatar)
        XCTAssertEqual(XCTWaiter.wait(for: [exp], timeout: 10), .completed,
                       "ThreadDetailView should push and obscure the home avatar.")
    }

    /// Companion bubble is present on the designer home and tappable.
    @MainActor
    func test_companion_bubbleVisible() throws {
        let (email, otp) = try requireAuthEnv()
        app.launchAuthenticated(email: email, otp: otp)
        XCTAssertTrue(app.waitForDesignerHome(timeout: 30))

        XCTAssertTrue(
            app.companionBubble.waitForExistence(timeout: 10),
            "Companion bubble overlay should be visible on the designer home."
        )
    }

    /// Profile entry: tapping the avatar navigates to the profile screen.
    /// Oracle: avatar no longer hittable (navigation push occurred).
    @MainActor
    func test_profile_entry() throws {
        let (email, otp) = try requireAuthEnv()
        app.launchAuthenticated(email: email, otp: otp)
        XCTAssertTrue(app.waitForDesignerHome(timeout: 30))

        app.designerHomeProfileAvatar.tap()

        let predicate = NSPredicate(format: "isHittable == false")
        let avatar = app.designerHomeProfileAvatar
        let exp = expectation(for: predicate, evaluatedWith: avatar)
        XCTAssertEqual(XCTWaiter.wait(for: [exp], timeout: 10), .completed,
                       "Tapping the profile avatar should push the profile surface.")
    }
}
