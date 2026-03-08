//
//  FirstLaunchTestHelpers.swift
//  PatinaUITests
//
//  Test helpers for the First Launch onboarding flow UI tests.
//

import XCTest

// MARK: - XCUIApplication Extension

extension XCUIApplication {
    /// Launch the app in UI testing mode
    static func launchForUITesting() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--mockar"]
        app.launch()
        return app
    }

    /// Launch the app with a clean state (reset onboarding)
    static func launchWithCleanState() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--mockar", "--resetonboarding"]
        app.launch()
        return app
    }
}

// MARK: - First Launch Flow Helpers

extension XCUIApplication {
    // MARK: - Element Accessors

    /// Threshold view elements
    var thresholdEnterButton: XCUIElement {
        otherElements["threshold.enterButton"]
    }

    var thresholdMainText: XCUIElement {
        staticTexts["threshold.mainText"]
    }

    /// Walk invitation view elements
    var walkInvitationMessage: XCUIElement {
        staticTexts["walkInvitation.message"]
    }

    var letsWalkButton: XCUIElement {
        buttons["walkInvitation.letsWalkButton"]
    }

    var notYetButton: XCUIElement {
        buttons["walkInvitation.notYetButton"]
    }

    /// Camera permission view elements
    var cameraPermissionContinueButton: XCUIElement {
        buttons["cameraPermission.continueButton"]
    }

    var privacyLink: XCUIElement {
        buttons["cameraPermission.privacyLink"]
    }

    /// Walk complete view elements
    var walkCompleteShowMeButton: XCUIElement {
        buttons["walkComplete.showMeButton"]
    }

    var walkCompleteInsights: XCUIElement {
        otherElements["walkComplete.insights"]
    }

    /// Room naming view elements
    var roomNameField: XCUIElement {
        textFields["roomNaming.nameField"]
    }

    var saveRoomButton: XCUIElement {
        buttons["roomNaming.saveButton"]
    }

    /// Emergence view elements
    var emergenceStayButton: XCUIElement {
        buttons["emergence.stayButton"]
    }

    var emergenceDriftButton: XCUIElement {
        buttons["emergence.driftButton"]
    }

    // MARK: - Flow Actions

    /// Tap the threshold to enter the app
    func tapThresholdToEnter() {
        // Wait for threshold to appear
        let threshold = thresholdEnterButton
        XCTAssertTrue(threshold.waitForExistence(timeout: 5), "Threshold should appear")
        threshold.tap()
    }

    /// Tap "Let's walk" to start the walk
    func tapLetsWalk() {
        let button = letsWalkButton
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Let's walk button should appear")
        button.tap()
    }

    /// Tap "Not yet" to skip the walk
    func tapNotYet() {
        let button = notYetButton
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Not yet button should appear")
        button.tap()
    }

    /// Wait for walk to complete (mock AR completes in ~2 seconds in test mode)
    func waitForWalkCompletion(timeout: TimeInterval = 10) {
        let showMeButton = walkCompleteShowMeButton
        XCTAssertTrue(showMeButton.waitForExistence(timeout: timeout), "Walk complete view should appear")
    }

    /// Tap "Show me" to see the first emergence
    func tapShowMe() {
        let button = walkCompleteShowMeButton
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Show me button should appear")
        button.tap()
    }

    /// Handle first emergence by choosing stay or drift
    func handleFirstEmergence(stay: Bool) {
        if stay {
            let stayButton = emergenceStayButton
            XCTAssertTrue(stayButton.waitForExistence(timeout: 5), "Stay button should appear")
            stayButton.tap()
        } else {
            let driftButton = emergenceDriftButton
            XCTAssertTrue(driftButton.waitForExistence(timeout: 5), "Drift button should appear")
            driftButton.tap()
        }
    }

    /// Name the room and save
    func nameAndSaveRoom(name: String) {
        let nameField = roomNameField
        XCTAssertTrue(nameField.waitForExistence(timeout: 5), "Room name field should appear")

        // Clear and type name
        nameField.tap()
        nameField.typeText(name)

        // Dismiss keyboard
        if keyboards.count > 0 {
            keyboards.buttons["Return"].tap()
        }

        // Tap save
        let saveButton = saveRoomButton
        XCTAssertTrue(saveButton.waitForExistence(timeout: 3), "Save button should appear")
        saveButton.tap()
    }
}

// MARK: - Wait Helpers

extension XCUIElement {
    /// Wait for element to be hittable (visible and tappable)
    @discardableResult
    func waitUntilHittable(timeout: TimeInterval = 5) -> Bool {
        let startTime = Date()
        while !isHittable {
            if Date().timeIntervalSince(startTime) > timeout {
                return false
            }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
        }
        return true
    }
}
