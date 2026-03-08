//
//  FirstLaunchUITests.swift
//  PatinaUITests
//
//  UI tests for the First Launch onboarding flow.
//  Tests the spec defined in docs/specs/_active/mobile-first-launch.md
//

import XCTest

final class FirstLaunchUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        // Launch with reset flag to ensure clean state for each test
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--mockar", "--resetonboarding"]
        app.launch()
    }

    override func tearDownWithError() throws {
        app.terminate()
        app = nil
    }

    // MARK: - Happy Path Tests

    /// Test the flow from Threshold through Walk Invitation to Camera Permission
    /// This tests the core navigation without requiring full walk completion
    @MainActor
    func testHappyPath() throws {
        // 1. Threshold - tap to enter
        app.tapThresholdToEnter()

        // 2. Walk Invitation - verify elements appear
        XCTAssertTrue(app.walkInvitationMessage.waitForExistence(timeout: 5),
                      "Walk invitation message should appear")
        XCTAssertTrue(app.letsWalkButton.exists, "Let's walk button should be visible")
        XCTAssertTrue(app.notYetButton.exists, "Not yet button should be visible")

        // 3. Tap "Let's walk"
        app.letsWalkButton.tap()

        // 4. Camera Permission should appear
        XCTAssertTrue(app.cameraPermissionContinueButton.waitForExistence(timeout: 5),
                      "Camera permission screen should appear")

        // 5. Verify privacy link exists
        XCTAssertTrue(app.privacyLink.exists, "Privacy link should be visible")

        // 6. Tap continue to proceed to walk
        app.cameraPermissionContinueButton.tap()

        // 7. Walk view should start (mock scan in UI test mode)
        // Wait for the walk progress or completion UI
        // The mock scan completes in ~1 second in UI test mode
        let walkCompleteButton = app.walkCompleteShowMeButton
        let foundWalkComplete = walkCompleteButton.waitForExistence(timeout: 10)

        // If walk completed, continue with the flow
        if foundWalkComplete {
            walkCompleteButton.tap()

            // Emergence should appear
            let stayButton = app.emergenceStayButton
            if stayButton.waitForExistence(timeout: 5) {
                stayButton.tap()
            }

            // Room naming should appear
            let nameField = app.roomNameField
            if nameField.waitForExistence(timeout: 5) {
                nameField.tap()
                nameField.typeText("Test Room")

                // Tap save if available
                if app.saveRoomButton.exists {
                    app.saveRoomButton.tap()
                }
            }
        }

        // Test passes if we got this far without crashing
    }

    // MARK: - Not Yet Path Test

    /// Test the "Not yet" path that skips the walk
    /// Scenario: Skip walk
    /// Steps: Threshold → "Not yet" → Exit first launch
    @MainActor
    func testNotYetPath() throws {
        // 1. Threshold - tap to enter
        app.tapThresholdToEnter()

        // 2. Walk Invitation should appear
        XCTAssertTrue(app.walkInvitationMessage.waitForExistence(timeout: 5),
                      "Walk invitation message should appear")

        // 3. Verify "Not yet" button exists and tap it
        XCTAssertTrue(app.notYetButton.exists, "Not yet button should be visible")
        app.notYetButton.tap()

        // 4. After tapping "Not yet", walk invitation should disappear
        // Wait a moment for transition
        sleep(1)

        // The walk invitation message should no longer be visible
        XCTAssertFalse(app.walkInvitationMessage.exists,
                       "Walk invitation should not be visible after skipping")
    }

    // MARK: - UI Element Tests

    /// Test that Threshold UI elements appear correctly
    @MainActor
    func testThresholdUI() throws {
        // Verify threshold elements
        XCTAssertTrue(app.thresholdEnterButton.waitForExistence(timeout: 5),
                      "Threshold enter button should appear")

        // Look for the main text "Every room tells a story."
        let mainText = app.staticTexts["Every room\ntells a story."]
        XCTAssertTrue(mainText.exists || app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Every room'")).count > 0,
                      "Main threshold text should be visible")

        // Verify tap instruction
        let tapText = app.staticTexts["Tap to enter"]
        XCTAssertTrue(tapText.exists, "Tap instruction should be visible")
    }

    /// Test that Walk Invitation UI elements appear correctly
    @MainActor
    func testWalkInvitationUI() throws {
        // Navigate to walk invitation
        app.tapThresholdToEnter()

        // Wait for walk invitation to appear
        XCTAssertTrue(app.walkInvitationMessage.waitForExistence(timeout: 5),
                      "Walk invitation message should appear")

        // Verify companion message content
        let questionText = app.staticTexts["Shall we walk your space together?"]
        XCTAssertTrue(questionText.exists, "Question text should be visible")

        let subText = app.staticTexts["I'd love to see where you live."]
        XCTAssertTrue(subText.exists, "Sub text should be visible")

        // Verify buttons
        XCTAssertTrue(app.letsWalkButton.exists, "Let's walk button should be visible")
        XCTAssertTrue(app.letsWalkButton.isHittable, "Let's walk button should be tappable")

        XCTAssertTrue(app.notYetButton.exists, "Not yet button should be visible")
        XCTAssertTrue(app.notYetButton.isHittable, "Not yet button should be tappable")
    }

    // MARK: - Performance Tests

    /// Measure app launch performance
    /// Target: <500ms from launch to Threshold
    @MainActor
    func testLaunchPerformance() throws {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            let app = XCUIApplication()
            app.launchArguments = ["--uitesting", "--mockar"]
            app.launch()

            // Verify threshold appears quickly
            XCTAssertTrue(app.otherElements["threshold.enterButton"].waitForExistence(timeout: 3),
                         "Threshold should appear quickly after launch")
        }
    }

    /// Measure transition from Threshold to Walk Invitation
    /// Target: <2s (includes animation time)
    @MainActor
    func testThresholdToWalkInvitationTransition() throws {
        // Start at threshold
        XCTAssertTrue(app.thresholdEnterButton.waitForExistence(timeout: 5))

        // Measure transition time
        let startTime = CFAbsoluteTimeGetCurrent()
        app.thresholdEnterButton.tap()

        // Wait for walk invitation (5 second timeout for animations)
        XCTAssertTrue(app.walkInvitationMessage.waitForExistence(timeout: 5))
        let endTime = CFAbsoluteTimeGetCurrent()

        let transitionTime = endTime - startTime
        // Allow 2 seconds for transition including animations
        XCTAssertLessThan(transitionTime, 2.0,
                          "Transition should complete in <2s, took \(transitionTime * 1000)ms")
    }

    // MARK: - Drift Path Test

    /// Test the Camera Permission UI after tapping "Let's walk"
    @MainActor
    func testDriftAction() throws {
        // Navigate to walk invitation
        app.tapThresholdToEnter()

        XCTAssertTrue(app.walkInvitationMessage.waitForExistence(timeout: 5),
                      "Walk invitation should appear")

        // Tap "Let's walk"
        app.letsWalkButton.tap()

        // Camera permission should appear
        XCTAssertTrue(app.cameraPermissionContinueButton.waitForExistence(timeout: 5),
                      "Camera permission screen should appear")

        // Verify the continue button is tappable
        XCTAssertTrue(app.cameraPermissionContinueButton.isHittable,
                      "Continue button should be tappable")

        // Verify privacy link is present
        XCTAssertTrue(app.privacyLink.exists,
                      "Privacy link should be visible")
    }
}
