//
//  AuthSheetPresentationTests.swift
//  PatinaTests
//
//  WP-NAV / U21 — auth as a sheet. Pins `PresentedSheet.auth`'s stable
//  identity (SwiftUI's `.sheet(item:)` keys presentation off
//  `Identifiable.id`) and confirms `AuthSheet` builds without a live/
//  authenticated `AuthService` session.
//

import SwiftUI
import Testing
@testable import Patina

@MainActor
struct AuthSheetPresentationTests {

    @Test
    func authSheetHasStableIdentity() {
        #expect(AppCoordinator.PresentedSheet.auth.id == "auth")
    }

    @Test
    func authSheetIsEqualToItself() {
        #expect(AppCoordinator.PresentedSheet.auth == AppCoordinator.PresentedSheet.auth)
    }

    @Test
    func authSheetIsDistinctFromOtherSheets() {
        #expect(AppCoordinator.PresentedSheet.auth != AppCoordinator.PresentedSheet.qr)
        #expect(AppCoordinator.PresentedSheet.auth != AppCoordinator.PresentedSheet.settings)
        #expect(AppCoordinator.PresentedSheet.auth.id != AppCoordinator.PresentedSheet.qr.id)
    }

    @Test
    func authSheet_buildsBodyWithoutCrashing() {
        // Smoke: constructing the view body type-checks the AuthScreenView
        // wiring + both nested sheets. No mocked AuthService is needed —
        // the shared singleton's default (signed-out) state is sufficient.
        let sheet = AuthSheet()
        _ = sheet.body
    }
}
