//
//  DesignerSmokeHelpers.swift
//  PatinaUITests
//
//  Helpers for the designer-mode smoke flows (Phase 11 of the cached-swan
//  plan). Mirrors `FirstLaunchTestHelpers.swift` — provides launch helpers
//  that wire up the UITest auth bootstrap path in `PatinaApp.swift`, plus
//  accessors for the DesignerHomeView identifiers added in Phase 11.
//

import XCTest

// MARK: - XCUIApplication Launch

extension XCUIApplication {
    /// Launch the app for designer-smoke tests with magic-link + OTP auto
    /// auth. Requires:
    ///   - `email` — a Supabase auth user the dev backend will accept
    ///   - `otp`   — the 6-digit token to feed into `verifyOtp`
    ///
    /// `--uitesting` is set so `PatinaApp.uitestingAuthEmail/Otp` resolve
    /// (they're gated to `isUITesting`). Tests that need clean onboarding
    /// state should add `--resetonboarding` to `launchArguments` after this
    /// returns, before calling `.launch()` — this helper calls launch()
    /// itself.
    func launchAuthenticated(email: String, otp: String) {
        launchArguments = ["--uitesting"]
        launchEnvironment["UITEST_AUTH_EMAIL"] = email
        launchEnvironment["UITEST_AUTH_OTP"] = otp
        launch()
    }
}

// MARK: - DesignerHomeView Element Accessors

extension XCUIApplication {
    /// Profile avatar in the DesignerHomeView header. Tapping navigates to
    /// the profile screen.
    var designerHomeProfileAvatar: XCUIElement {
        otherElements["designer.home.profileAvatar"]
    }

    /// Stat-tile triplet at the top of the designer home dashboard.
    var designerHomeProjectsTile: XCUIElement {
        otherElements["designer.home.statCard.projects"]
    }

    var designerHomeDecisionsTile: XCUIElement {
        otherElements["designer.home.statCard.decisions"]
    }

    var designerHomeMessagesTile: XCUIElement {
        otherElements["designer.home.statCard.messages"]
    }

    /// First project row in the "Active projects" section — useful for the
    /// golden path test where we don't care which project, just that one
    /// exists and is tappable.
    func firstProjectRow() -> XCUIElement {
        let predicate = NSPredicate(format: "identifier BEGINSWITH %@", "designer.home.projectRow.")
        return otherElements.matching(predicate).firstMatch
    }

    func firstDecisionRow() -> XCUIElement {
        let predicate = NSPredicate(format: "identifier BEGINSWITH %@", "designer.home.decisionRow.")
        return otherElements.matching(predicate).firstMatch
    }

    func firstThreadRow() -> XCUIElement {
        let predicate = NSPredicate(format: "identifier BEGINSWITH %@", "designer.home.threadRow.")
        return otherElements.matching(predicate).firstMatch
    }

    /// "See all" tap target on a given section. `title` matches the section
    /// label slug ("active-projects", "awaiting-decision", "conversations").
    func designerHomeSeeAll(section title: String) -> XCUIElement {
        staticTexts["designer.home.section.\(title).seeAll"]
    }

    // MARK: - Companion

    /// The Companion floating bubble overlay. Visible on most signed-in
    /// surfaces; tapping it opens the companion sheet.
    var companionBubble: XCUIElement {
        otherElements["companion.bubble"]
    }
}

// MARK: - Convenience waits

extension XCUIApplication {
    /// Wait for the designer home to be visible by polling the profile
    /// avatar (the most stable anchor — present even with empty data).
    @discardableResult
    func waitForDesignerHome(timeout: TimeInterval = 30) -> Bool {
        designerHomeProfileAvatar.waitForExistence(timeout: timeout)
    }
}
